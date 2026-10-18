"use strict";

// Read-only schema2 transport. The card owns event invalidation and visible refresh.
function createEnergyAnalysisV53({card, onChange = () => {}, refreshMs = 300000}) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const decimal = value => value === null || typeof value === 'number' && Number.isFinite(value) ||
    typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
  const stamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  const ttl = Number.isFinite(refreshMs) && refreshMs > 0 ? refreshMs : 300000;
  let mounted = false, epoch = 0, identity = null, raw = null, queued = null, cache = null;
  let view = {status:'idle', selection:null, snapshot:null, error:null};
  const emit = () => { try { onChange(copy(view)); } catch (_) { /* Consumer failures do not poison the wire. */ } };
  const set = (status, selection = null, snapshot = null, error = null) => {
    view = {status, selection:selection && copy(selection), snapshot, error}; emit();
  };
  const context = () => {
    const h = card?._hass;
    return {connection:h?.connection, user:h?.user?.id, active:h?.user?.is_active, admin:h?.user?.is_admin, online:h?.connected, zone:h?.config?.time_zone,
      available:mounted && card?.isConnected !== false && !!h?.user?.id && h.user.is_active !== false &&
        h.connected !== false && !!h.connection && h.connection.connected !== false && typeof h.callWS === 'function'};
  };
  const equal = (a,b) => a && b && a.connection === b.connection && a.user === b.user &&
    a.zone === b.zone && a.active === b.active && a.admin === b.admin && a.online === b.online && a.available === b.available;
  const clear = () => {
    epoch++; cache = null;
    const abandoned = queued; queued = null;
    view = {status:'idle',selection:null,snapshot:null,error:null};
    if (abandoned) abandoned.resolve(copy(view));
  };
  const observe = () => {
    const next = context();
    if (!equal(identity,next)) { clear(); identity = next; }
    return next;
  };
  const state = () => { observe(); return copy(view); };
  const normalize = (selection, ctx) => {
    if(object(selection)&&selection.kind==='patterns'){
      if(!Number.isInteger(selection.days)||![7,30].includes(selection.days))throw Error('invalid_patterns_selection');
      return {kind:'patterns',days:selection.days};
    }
    if(object(selection)&&Object.hasOwn(selection,'kind'))throw Error('invalid_analysis_selection');
    if (!object(selection) || !['day','week','month','year'].includes(selection.period)) throw Error('invalid_analysis_selection');
    const result = {period:selection.period};
    if (Object.hasOwn(selection,'anchor')) {
      const a = selection.anchor;
      if (typeof a !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a) || !Number.isFinite(Date.parse(a)) ||
        new Date(a).toISOString().slice(0,10) !== a || a.slice(0,4) === '0000') throw Error('invalid_analysis_anchor');
      let today;
      try {
        const parts = new Intl.DateTimeFormat('en-US',{timeZone:ctx.zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        const fields = Object.fromEntries(parts.map(p=>[p.type,p.value]));
        today = `${fields.year.padStart(4,'0')}-${fields.month}-${fields.day}`;
      } catch (_) { throw Error('measurement_timezone_unavailable'); }
      if (a > today) throw Error('future_analysis_anchor');
      result.anchor = a;
    }
    if (Object.hasOwn(selection,'comparison')) {
      const allowed = result.period === 'day' ? ['previous','same_weekday','mean7'] : ['previous','year_ago'];
      if (!allowed.includes(selection.comparison)) throw Error('invalid_analysis_comparison');
      result.comparison = selection.comparison;
    }
    return result;
  };
  const validate = (dto, selection, ctx) => {
    if (!object(dto) || dto.schema !== 2 || !hash(dto.snapshot_id) || !hash(dto.measurement_fingerprint) ||
      !Number.isFinite(stamp(dto.generated_at)) || !object(dto.context) || dto.context.measurement_timezone !== ctx.zone ||
      dto.context.period_kind !== selection.period || !object(dto.period) || dto.period.kind !== selection.period ||
      dto.period.timezone !== ctx.zone || !Number.isFinite(stamp(dto.period.start)) ||
      !Number.isFinite(stamp(dto.period.end)) || stamp(dto.period.end) <= stamp(dto.period.start) ||
      stamp(dto.period.end) > stamp(dto.generated_at) || !object(dto.totals) ||
      !['ready','partial'].includes(dto.status) || !object(dto.chart) || !Array.isArray(dto.chart.bins) ||
      dto.chart.timezone !== ctx.zone || !['ready','unknown'].includes(dto.chart.status) ||
      dto.chart.grain !== ({day:'hour',week:'day',month:'day',year:'month'})[selection.period] ||
      !dto.chart.bins.every(bin=>object(bin) && Number.isFinite(bin.from) && Number.isFinite(bin.to) && bin.to > bin.from &&
        Number.isFinite(stamp(bin.start)) && Number.isFinite(stamp(bin.end))) ||
      !object(dto.groups) || !['devices','areas','floors','unassigned','unmeasured'].every(k=>object(dto.groups[k]))) return false;
    if (selection.anchor && (!Number.isFinite(stamp(dto.period.local_start)) ||
      // Weekly/monthly/yearly anchors may be normalized to the period start by HA.
      dto.period.local_start.slice(0,10) > selection.anchor ||
      !Number.isFinite(stamp(dto.period.calendar_local_end)) ||
      selection.anchor >= dto.period.calendar_local_end.slice(0,10) ||
      dto.context.period_anchor !== dto.period.local_start.slice(0,10))) return false;
    if (selection.comparison && (dto.context.comparison_kind !== selection.comparison ||
      !object(dto.comparisons) || !object(dto.comparisons[selection.comparison]))) return false;
    if (!['kwh','energy_cost','variable_cost','usage_cost','fixed_cost','total_cost','effective_price'].every(k=>Object.hasOwn(dto.totals,k) && decimal(dto.totals[k]))) return false;
    // Validate finite numeric leaves, including money nested in groups/comparisons,
    // without converting or rounding any server value. Bound traversal as well.
    // Supported annual hours plus 512 consumers and their room/floor comparison
    // rows exceed 200k leaves; leave room for the bounded 32-version tariff DTO.
    let count = 0;
    const walk = (value, key = '', depth = 0) => {
      if (++count > 2000000 || depth > 40) return false;
      if (value === null) return true;
      if (typeof value === 'number') return Number.isFinite(value);
      // Producer reconciliation evidence is boolean metadata, not a kWh amount.
      if (key === 'reconciles_recorded_kwh') return typeof value === 'boolean';
      const money = /(?:^|_)(?:kwh|cost|rate|price)$/.test(key) || /^(?:energyRate|variableRate|fixedMonthly|fixed_monthly|legacy_combined_monthly)$/.test(key);
      if (money && !object(value) && !Array.isArray(value)) return decimal(value);
      if (Array.isArray(value)) return value.every(v=>walk(v,'',depth+1));
      if (object(value)) return Object.entries(value).every(([k,v])=>walk(v,k,depth+1));
      return ['string','boolean'].includes(typeof value);
    };
    return walk(dto);
  };
  const validatePatterns = (dto, selection, ctx) => {
    const hour=3600000,calendarDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
      Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    const integer=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
    const localDate=value=>{
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:ctx.zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
      const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${fields.year.padStart(4,'0')}-${fields.month}-${fields.day}`;
    };
    if(!object(dto)||dto.schema!==2||dto.kind!=='patterns'||!hash(dto.snapshot_id)||!hash(dto.measurement_fingerprint)||
      !Number.isFinite(stamp(dto.generated_at))||!['ready','partial'].includes(dto.status)||
      ['period','groups','buckets','alternatives'].some(k=>Object.hasOwn(dto,k))||!object(dto.context)||!object(dto.window)||!object(dto.patterns))return false;
    const c=dto.context,w=dto.window,p=dto.patterns,start=stamp(w.start),end=stamp(w.end),generated=stamp(dto.generated_at);
    if(c.request_kind!=='patterns'||c.access_purpose!=='analysis'||c.patterns_days!==selection.days||c.measurement_timezone!==ctx.zone||
      !hash(c.window_signature)||!hash(c.source_signature)||!hash(c.grid_source_signature)||
      !['entry_id','service_generation'].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<=256)||
      !['tariff_revision','feature_access_revision','registry_revision'].every(k=>integer(c[k]))||
      w.status!=='ready'||w.reason!==null||w.kind!=='rolling_local_dates'||w.days!==selection.days||w.timezone!==ctx.zone||
      !calendarDate(w.first_date)||!calendarDate(w.last_date)||Number(w.first_date.slice(0,4))<1900||Number(w.last_date.slice(0,4))>2200||typeof w.boundary_complete!=='boolean'||
      !Number.isFinite(start)||!Number.isFinite(end)||end<=start||start%hour!==0||end%hour!==0||
      stamp(w.query_start)!==start||stamp(w.query_end)!==end||Math.floor(generated/hour)*hour!==end||
      !integer(w.hours,768)||w.hours<=0||(end-start)/hour!==w.hours||!Number.isFinite(stamp(w.requested_local_start))||
      Math.ceil(stamp(w.requested_local_start)/hour)*hour!==start||w.boundary_complete!==(stamp(w.requested_local_start)===start)||w.requested_local_start.slice(0,10)!==w.first_date||
      !Array.isArray(p.days)||p.days.length<1||p.days.length>selection.days||!Array.isArray(p.hours)||p.hours.length!==w.hours||
      !Array.isArray(p.weekdays)||p.weekdays.length!==7||p.rounding_stage!=='period_components_then_day_then_hour'||
      p.fixed_fee_scope!=='household_period_only'||typeof p.partial_window!=='boolean'||
      !Array.isArray(dto.rates)||dto.rates.length>32||!object(dto.fees)||dto.fees.scope!=='household_period_only'||
      !object(dto.totals)||!object(dto.coverage)||!Array.isArray(dto.issues))return false;
    try{
      if(localDate(end-hour)!==w.last_date||new Date(Date.parse(w.last_date)-(selection.days-1)*86400000).toISOString().slice(0,10)!==w.first_date)return false;
      const dates=new Map(),ids=new Set();
      const numeric=['kwh','recorded_kwh','energy_cost','variable_cost','legacy_combined_cost','usage_cost'];
      const costs=known=>object(known)&&['energy_cost','variable_cost','legacy_combined_cost'].every(k=>Object.hasOwn(known,k)&&decimal(known[k]));
      const rowBase=row=>object(row)&&Number.isSafeInteger(row.from)&&Number.isSafeInteger(row.to)&&row.to>row.from&&row.from>=start&&row.to<=end&&
        stamp(row.start)===row.from&&stamp(row.end)===row.to&&stamp(row.local_start)===row.from&&stamp(row.local_end)===row.to&&
        row.timezone===ctx.zone&&calendarDate(row.local_date)&&localDate(row.from)===row.local_date&&
        (row.fold===0||row.fold===1)&&typeof row.complete==='boolean'&&numeric.every(k=>Object.hasOwn(row,k)&&decimal(row[k]))&&
        costs(row.known_costs)&&(row.currency===null||typeof row.currency==='string'&&/^[A-Z]{3}$/.test(row.currency))&&(row.price_basis===null||['gross','net'].includes(row.price_basis))&&
        !Object.hasOwn(row,'fixed_cost')&&!Object.hasOwn(row,'total_cost');
      let previous=null;
      for(const row of p.days){
        if(!rowBase(row)||row.id!==row.local_date||row.id<w.first_date||row.id>w.last_date||dates.has(row.id)||
          previous!==null&&row.from<previous||!Number.isSafeInteger(row.calendar_from)||!Number.isSafeInteger(row.calendar_to)||row.calendar_to<=row.calendar_from||
          row.from<row.calendar_from-hour||row.to>row.calendar_to+hour||typeof row.calendar_complete!=='boolean'||
          !integer(row.expected_seconds,172800)||row.expected_seconds!==(row.calendar_to-row.calendar_from)/1000||
          !integer(row.measured_seconds,172800)||row.measured_seconds>row.expected_seconds+3600||
          row.complete&&(row.kwh===null||!row.calendar_complete||row.from!==row.calendar_from||row.to!==row.calendar_to||row.status!=='ready')||
          !row.complete&&(row.kwh!==null||row.status!=='partial'||['energy_cost','variable_cost','legacy_combined_cost','usage_cost'].some(k=>row[k]!==null)))return false;
        dates.set(row.id,{row,first:null,last:null});previous=row.to;
      }
      let cursor=start;
      for(const row of p.hours){
        if(!rowBase(row)||row.id!==String(row.from)||ids.has(row.id)||row.from!==cursor||row.to-row.from!==hour||
          row.expected_seconds!==3600||row.measured_seconds!==(row.complete?3600:0)||!dates.has(row.local_date)||
          row.complete&&(row.kwh===null||row.status!=='ready')||!row.complete&&(row.kwh!==null||row.status!=='unknown')||
          !object(row.raw_costs)||!costs(row.raw_costs)||typeof row.crosses_local_date!=='boolean'||!Array.isArray(row.tariff_zones))return false;
        ids.add(row.id);cursor=row.to;const day=dates.get(row.local_date);if(day.first===null)day.first=row.from;day.last=row.to;
      }
      if(cursor!==end||[...dates.values()].some(d=>d.first!==d.row.from||d.last!==d.row.to)||
        p.represented_days!==p.days.length||p.measured_days!==p.days.filter(d=>d.recorded_kwh!==null).length||
        p.complete_days!==p.days.filter(d=>d.complete).length)return false;
      const weekdays=new Set();
      for(const row of p.weekdays){if(!object(row)||!integer(row.weekday,6)||weekdays.has(row.weekday)||!integer(row.count,selection.days)||
        !decimal(row.kwh)||row.count===0&&row.kwh!==null||row.count>0&&row.kwh===null)return false;weekdays.add(row.weekday);}
    }catch(_){return false;}
    let count=0;
    const walk=(value,key='',depth=0)=>{
      if(++count>500000||depth>24)return false;
      if(value===null)return true;
      if(typeof value==='number')return Number.isFinite(value);
      if((/(?:^|_)(?:kwh|cost|rate|price)$/.test(key)||['energyRate','variableRate','subscription','capacity','distribution','other','legacy_combined_monthly','fixedMonthly'].includes(key))&&!object(value)&&!Array.isArray(value))return decimal(value)&&String(value).length<=1024;
      if(Array.isArray(value))return value.length<=10000&&value.every(v=>walk(v,'',depth+1));
      if(object(value))return Object.entries(value).every(([k,v])=>k.length<=256&&walk(v,k,depth+1));
      return typeof value==='boolean'||typeof value==='string'&&value.length<=16384;
    };
    return ['kwh','energy_cost','variable_cost','usage_cost','fixed_cost','total_cost','effective_price'].every(k=>Object.hasOwn(dto.totals,k)&&decimal(dto.totals[k]))&&walk(dto);
  };
  const current = job => mounted && job.epoch === epoch && equal(job.context, observe());
  const pump = () => {
    if (raw || !queued) return;
    const job = queued; queued = null;
    if (!current(job)) { job.resolve(state()); return; }
    raw = job;
    const h = card._hass;
    let request;
    try { request = Promise.resolve(h.callWS(job.selection.kind==='patterns'?{type:'ha_tools_email/energy_patterns',days:job.selection.days}:{type:'ha_tools_email/energy_analysis',...job.selection})); }
    catch (error) { request = Promise.reject(error); }
    // Both settlement branches are attached immediately; stale errors never escape.
    request.then(dto => {
      if (!current(job)) return;
      if (!(job.selection.kind==='patterns'?validatePatterns(dto,job.selection,job.context):validate(dto,job.selection,job.context))) throw Error(job.selection.kind==='patterns'?'invalid_patterns_response':'invalid_analysis_response');
      const snapshot = copy(dto);
      cache = {key:job.key,at:Date.now(),snapshot};
      set('ready',job.selection,snapshot);
    }).catch(error => {
      if (current(job)) { cache = null; set('error',job.selection,null,
        typeof error?.code === 'string' ? error.code : ['invalid_analysis_response','invalid_patterns_response'].includes(error?.message) ? error.message : 'energy_analysis_unavailable'); }
    }).then(() => {
      if (raw === job) raw = null;
      job.resolve(state()); pump();
    });
  };
  const read = selection => {
    const ctx = observe();
    let selected;
    try { selected = normalize(selection,ctx); }
    catch (error) { clear(); set('error',null,null,error.message); return Promise.resolve(state()); }
    if (!ctx.available || typeof ctx.zone !== 'string' || !ctx.zone) return Promise.resolve(state());
    const key = JSON.stringify(selected);
    if (cache?.key === key && Date.now() >= cache.at && Date.now()-cache.at < ttl) return Promise.resolve(state());
    if (queued?.key === key && queued.epoch === epoch) return queued.promise.then(copy);
    if (raw?.key === key && raw.epoch === epoch) return raw.promise.then(copy);
    clear();
    let resolve;
    const promise = new Promise(done=>{resolve=done;});
    queued = {selection:selected,key,context:ctx,epoch,promise,resolve};
    set('loading',selected); pump(); return promise.then(copy);
  };
  const invalidate = () => { clear(); observe(); emit(); };
  const connect = () => { if (!mounted) { mounted = true; observe(); } };
  const disconnect = () => { mounted = false; clear(); identity = context(); emit(); };
  return {read,invalidate,connect,disconnect,state};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {createEnergyAnalysisV53};
