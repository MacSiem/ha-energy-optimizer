// Pure schema-2 presentation. The owner supplies snapshots and binds data-analysis-action.
if (typeof module !== 'undefined' && module.exports) var {createFormatUi} = require('./ha-tools-format.js');
var energyAnalysisFlowIdV53 = 0;
function createEnergyAnalysisViewV53({card, format} = {}) {
  const flowHatchId='analysis-flow-hatch-'+(++energyAnalysisFlowIdV53);
  const ui = format || createFormatUi.forHass(card?._hass);
  const language = card?._hass?.locale?.language || card?._hass?.language || 'en';
  const pl = String(language).startsWith('pl');
  const t = (en, polish) => pl ? polish : en;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unknown = () => t('No data', 'Brak danych');
  const valid = value => typeof value === 'string' ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)) : typeof value === 'number' && Number.isFinite(value);
  // Pass Decimal strings directly to the shared Intl formatter. Never reprice or round a bill here.
  const number = (value, options) => valid(value) ? ui.number(value, options) : unknown();
  const quantity = (value, unit = 'kWh', signed = false) => valid(value)
    ? `${signed && !String(value).startsWith('-') && /[1-9]/.test(String(value).split(/[eE]/)[0]) ? '+' : ''}${number(value)}${unit === '%' ? '' : ' '}${unit}` : unknown();
  const money = (value, currency, signed = false) => quantity(value, currency || t('currency unknown','waluta nieznana'), signed);
  // Presentation only: exact server values remain in Data and named details.
  const briefEnergy=value=>valid(value)?`${number(value,{maximumSignificantDigits:6})} kWh`:unknown();
  const dateTime = value => {
    // Dynamic tariffs allow epoch milliseconds as well as ISO instants.
    if (typeof value === 'number') {
      const instant = new Date(value);
      value = Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
    }
    return ui.dateTime(value) || unknown();
  };
  const range = period => ui.range(period?.start, period?.end) || unknown();
  // Calendar-only dates retain their day while following the user's date locale.
  const date = (value, short = false) => {
    if (typeof value !== 'string') return unknown();
    return (/^\d{4}-\d{2}-\d{2}$/.test(value) ? ui.calendarDate(value, short) : ui.date(value, short)) || unknown();
  };
  const basis = value => value === 'gross' ? t('gross','brutto') : value === 'net' ? t('net','netto') : unknown();
  const percentage = value => valid(value) ? ui.number(value, {style:'percent',maximumFractionDigits:1}) : unknown();
  const coverage = value => {
    if (valid(value)) return percentage(value);
    if (!value) return unknown();
    if (valid(value.ratio)) return percentage(value.ratio);
    if (valid(value.observed_hours) && valid(value.expected_hours)) return `${number(value.observed_hours)} / ${number(value.expected_hours)} ${t('hours','godzin')}`;
    if (valid(value.measured_source_seconds) && valid(value.expected_source_seconds)) return `${number(value.measured_source_seconds)} / ${number(value.expected_source_seconds)} s`;
    return unknown();
  };
  const table = (caption, columns, rows, attrs = '', rowAttribute = '') => `<div class="analysis-table-wrap"><table ${attrs}><caption>${esc(caption)}</caption><thead><tr>${columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row,rowIndex)=>`<tr${rowAttribute ? ` ${rowAttribute}="${rowIndex}"` : ''}>${row.map((cell,i)=>`<${i ? 'td' : 'th scope="row"'}>${cell}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">${esc(unknown())}</td></tr>`}</tbody></table></div>`;
  const button = (action, value, label, selected) => `<button type="button" data-analysis-action="${action}" data-analysis-value="${esc(value)}"${selected === undefined ? '' : ` aria-pressed="${selected}"`}>${esc(label)}</button>`;
  const select = (action, label, choices, selected) => `<label>${esc(label)}<select data-analysis-action="${action}" data-analysis-value="${esc(selected)}">${choices.map(([value,text])=>`<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const periods = [['day',t('Day','Dzień')],['week',t('Week','Tydzień')],['month',t('Month','Miesiąc')],['year',t('Year','Rok')]];
  const comparisons = {previous:t('Previous period','Poprzedni okres'),same_weekday:t('Same weekday','Ten sam dzień tygodnia'),mean7:t('Mean of 7 previous days','Średnia z 7 poprzednich dni'),year_ago:t('Same period last year','Ten sam okres rok temu')};
  const groupLabel = (groups, level, id) => {
    const devices = groups?.devices || {};
    if (level === 'devices') return devices[id]?.name || t('Unnamed device','Urządzenie bez nazwy');
    if (id === '__no_floor__') return t('No floor','Bez piętra');
    const key = level === 'areas' ? 'area' : 'floor';
    return Object.values(devices).find(row=>row[key+'_id'] === id && row[key+'_name'])?.[key+'_name'] || t('Unnamed group','Grupa bez nazwy');
  };
  // Exact ordering of server decimal values; Number conversion is reserved for bar geometry below.
  const parts = value => {
    const text=String(value), match=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    const digits=(match[2]+(match[3] || '')).replace(/^0+/,'');
    return {sign:!digits?0:match[1]==='-'?-1:1,digits,
      magnitude:digits.length+Number(match[4] || 0)-(match[3] || '').length};
  };
  const compare = (a,b) => {
    const x=parts(a),y=parts(b);
    if(x.sign!==y.sign)return x.sign-y.sign;
    if(!x.sign)return 0;
    const size=Math.max(x.digits.length,y.digits.length);
    const xd=x.digits.padEnd(size,'0'),yd=y.digits.padEnd(size,'0');
    return x.sign*(x.magnitude-y.magnitude || (xd>yd?1:xd<yd?-1:0));
  };
  const rowsFor = (groups, level, metadata = groups) => {
    const rows = Object.entries(groups?.[level] || {}).map(([id,row])=>({id,label:groupLabel(metadata,level,id),row}));
    rows.sort((a,b)=> valid(a.row.kwh) && valid(b.row.kwh) ? compare(b.row.kwh,a.row.kwh) : valid(a.row.kwh) ? -1 : valid(b.row.kwh) ? 1 : 0);
    if (level === 'areas' && groups?.unassigned) rows.push({id:'unassigned',label:t('No room','Bez pokoju'),row:groups.unassigned});
    if (groups?.unmeasured) rows.push({id:'unmeasured',label:t('Unmeasured','Niezmierzone'),row:groups.unmeasured});
    return rows;
  };
  const width = (value, max) => valid(value) && Number.isFinite(Number(value)) && max > 0 ? Math.min(100,Math.abs(Number(value))/max*100) : 0;
  const maximum = values => Math.max(0,...values.filter(valid).map(value=>Math.abs(Number(value))).filter(Number.isFinite));
  const nativeCostLabel = () => t('Cost recorded in HA','Koszt zapisany w HA');
  const nativeDisclaimer = () => t('Source: Home Assistant Energy, recorded grid-import cost. Cost breakdown and fixed fees are unknown; this is not a complete bill.',
    'Źródło: Home Assistant Energy, zapisany koszt poboru z sieci. Rozbicie kosztu i opłaty stałe są nieznane; to nie jest pełny rachunek.');
  const nativeFacts = snapshot => !snapshot.active_tariff_id && snapshot.native_pricing?.schema === 1 && snapshot.native_pricing.source === 'ha_energy' ? snapshot.native_pricing : null;
  const nativeComplete = snapshot => {
    const p=nativeFacts(snapshot)?.period_cost;
    return p?.status === 'ready' && p.coverage?.complete === true && valid(p.amount) && /^[A-Z]{3}$/.test(p.currency || '') ? p : null;
  };
  const nativeMoney = p => `${number(p.amount,{minimumFractionDigits:2,maximumFractionDigits:2})} ${p.currency}`;
  const nativeDetails = snapshot => {
    const native=nativeFacts(snapshot); if (!native) return '';
    const p=native.period_cost, complete=nativeComplete(snapshot), c=p.coverage;
    const label=complete?nativeCostLabel():p.status==='partial'?t('Partial cost recorded in HA','Niepełny koszt zapisany w HA'):t('HA recorded cost unavailable','Zapisany koszt HA niedostępny');
    const value=complete?nativeMoney(complete):p.status==='partial'?money(p.recorded_amount,p.currency):unknown();
    const prices=native.current_prices.map(row=>[esc(row.source_id),esc(row.status==='ready'?money(row.price,row.currency)+'/kWh':unknown()),esc(dateTime(row.observed_at))]);
    return `<section data-analysis-native-pricing><h4>${esc(label)}</h4><p><strong>${esc(value)}</strong>${p.status==='partial'?' · '+esc(t('Recorded subset only; full-period cost unavailable','Tylko zapisany podzbiór; koszt całego okresu niedostępny')):''}</p><p class="analysis-note">${esc(nativeDisclaimer())}</p>
      <details data-analysis-native-details><summary>${esc(t('Exact HA cost and source details','Dokładny koszt HA i źródło'))}</summary><p>${esc(label)}: ${esc(p.amount ?? p.recorded_amount ?? unknown())} ${esc(p.currency || '')}</p><p>${esc(t('Source hours measured / expected','Godziny źródeł zmierzone / oczekiwane'))}: ${esc(c.measured_source_hours)} / ${esc(c.expected_source_hours)}</p>${p.reason?`<p>${esc(p.reason)}</p>`:''}<ul>${native.provenance.map(row=>`<li>${esc(row.energy_source_id)} · ${esc(row.cost_statistic_id || unknown())}</li>`).join('')}</ul></details>
      ${prices.length?`<h4>${esc(t('Current prices · now','Bieżące ceny · teraz'))}</h4><p class="analysis-note">${esc(t('Observed now; not a price for the selected period. No historical cost is calculated from these prices.','Odczytane teraz; nie są cenami za wybrany okres. Nie obliczamy z nich kosztu historycznego.'))}</p>${table(t('Current prices · now','Bieżące ceny · teraz'),[t('Source','Źródło'),t('Price now','Cena teraz'),t('Observed at','Czas odczytu')],prices)}<details data-analysis-native-price-details><summary>${esc(t('Exact current price values','Dokładne wartości bieżących cen'))}</summary><ul>${native.current_prices.map(row=>`<li>${esc(row.source_id)}: ${esc(row.price ?? unknown())} ${esc(row.currency || '')}/kWh · ${esc(row.origin)} · ${esc(row.observed_at)}</li>`).join('')}</ul></details>`:''}</section>`;
  };
  // Describe the displayed household total only with a matching producer delta.
  // Paired/common measurements may be useful in Comparison, but are a different total.
  const kpiComparison = snapshot => {
    const kind=snapshot.context?.comparison_kind || 'previous', c=snapshot.comparisons?.[kind];
    if (!comparisons[kind] || c?.status!=='ready' || c.reason!=null || c.comparison_scope!=='calendar_totals' ||
        snapshot.coverage?.complete!==true || snapshot.totals?.measurement_complete!==true ||
        !valid(c.current_kwh) || !valid(snapshot.totals.kwh) || compare(c.current_kwh,snapshot.totals.kwh)!==0 || !valid(c.delta_kwh))
      return t('No comparable baseline — incomplete or unavailable data','Brak porównywalnego odniesienia — dane niepełne lub niedostępne');
    const direction=compare(c.delta_kwh,'0'), text=direction<0?t('Decrease','Spadek'):direction>0?t('Increase','Wzrost'):t('No change','Bez zmian');
    return `${comparisons[kind]} · ${text} ${quantity(c.delta_kwh,'kWh',true)}${valid(c.percent)?' · '+quantity(c.percent,'%',true):''}`;
  };
  const peakClock = (snapshot,peak) => {
    const plain=ui.clock(peak.start), start=Date.parse(peak.start);
    // Repeated local hours still require the offset, including the first fold.
    const repeated=[-120,-90,-60,-30,30,60,90,120].some(minutes=>{
      const other=new Date(start+minutes*60000).toISOString();
      return ui.clock(other)===plain && ui.date(other)===ui.date(peak.start);
    });
    return ui.clock(peak.start,ui.timeZone!==snapshot.period?.timezone || repeated);
  };
  const tiles = (snapshot, overview=false) => {
    const total=snapshot.totals || {}, supplied=overview&&Object.hasOwn(snapshot,'period_summary'), native=nativeComplete(snapshot);
    const base=[
      [t('Consumption','Zużycie'),quantity(total.kwh)], [native?nativeCostLabel():t('Cost','Koszt'),native?nativeMoney(native):money(total.total_cost,total.currency)],
      native ? [t('Source','Źródło'),'Home Assistant Energy'] : [t('Effective price','Cena efektywna'),money(total.effective_price,total.currency) + (valid(total.effective_price) ? '/kWh' : '')],
      [t('Measurement coverage','Pokrycie pomiarów'),coverage(snapshot.coverage)]
    ];
    if(!supplied)return `<div class="analysis-tiles">${base.map(([label,value],index)=>`<div class="analysis-tile ${index<2?'analysis-tile-primary':'analysis-tile-secondary'}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${index===0?`<span data-analysis-kpi-comparison>${esc(kpiComparison(snapshot))}</span>`:''}</div>`).join('')}</div>`;
    const frame=periodWindow(snapshot),share=shareProof(snapshot,frame),peak=peakProof(snapshot,frame);
    const knownPeak=peak&&peak.kwh!==null,localPeak=knownPeak&&peak.reason!=='measurement_timezone_unavailable',partialPeak=peak&&(peak.status==='partial'||knownPeak&&!snapshot.totals?.measurement_complete);
    const shareNote=share?.reason==='zero_total_kwh'?t('No share for a zero energy total','Brak udziału przy zerowym zużyciu'):share?.status==='ready'?quantity(share.known_cheap_kwh):t('Full-period share unavailable','Brak udziału za cały okres');
    return `<div class="analysis-tiles">${base.slice(0,2).map(([label,value],index)=>`<div class="analysis-tile analysis-tile-primary"><span>${esc(label)}</span><strong>${esc(value)}</strong>${index===0?`<span data-analysis-kpi-comparison>${esc(kpiComparison(snapshot))}</span>`:''}${index===1?`<span>${esc(base[2][0])}: ${esc(base[2][1])}</span>`:''}</div>`).join('')}
      <div class="analysis-tile analysis-tile-secondary" data-analysis-cheap-share><span>${esc(t('Cheap-zone share','Udział taniej strefy'))}</span><strong>${esc(share?.status==='ready'?percentage(share.ratio):unknown())}</strong><span>${esc(shareNote)}</span></div>
      <div class="analysis-tile analysis-tile-secondary" data-analysis-peak${knownPeak?` data-analysis-peak-id="${esc(peak.id)}"`:''}><span>${esc(partialPeak?t('Highest observed hour','Najwyższe zarejestrowane zużycie'):t('Highest hour','Godzina szczytu'))}</span><strong>${esc(localPeak?peakClock(snapshot,peak)||unknown():unknown())}</strong><span>${esc(knownPeak?quantity(peak.kwh)+(localPeak?' · '+date(peak.start):''):unknown())}</span>${partialPeak?`<span>${esc(t('Incomplete period','Niepełny okres'))}</span>`:''}${peak?.reason==='measurement_timezone_unavailable'?`<span>${esc(t('Measurement time zone unavailable','Brak strefy czasu pomiarów'))}</span>`:''}</div></div>`;
  };
  const baselineNote = () => `<p data-analysis-baseline="unknown">${esc(t('No matching comparison is available for these intervals.','Brak dopasowanego porównania dla tych przedziałów.'))}</p>`;
  const instant = value => {
    if(typeof value==='number')return Number.isSafeInteger(value)?value:null;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
    const stamp=Date.parse(value);return Number.isSafeInteger(stamp)?stamp:null;
  };
  const bounds=(from,to)=>{const a=instant(from),b=instant(to);return a!==null&&b!==null&&b>a?{from:a,to:b,key:a+'|'+b}:null;};
  const intervalText=value=>value?`${ui.pointLabel(new Date(value.from).toISOString())||unknown()} – ${ui.pointLabel(new Date(value.to).toISOString())||unknown()}`:unknown();
  const seconds=value=>Number.isSafeInteger(value)&&value>=0;
  // A producer marker is usable only with its complete projection contract.
  // No local-calendar reconstruction, array zipping, amount arithmetic or mean.
  const markerSeries=(snapshot,kind)=>{
    const comparison=snapshot.comparisons?.[kind],source=comparison?.chart,main=snapshot.chart;
    const empty={accepted:false,markers:new Map(),reconciles:false,mean:kind==='mean7',common:false};
    if(comparison?.status!=='ready'||!['ready','partial'].includes(source?.status)||!['ready','partial'].includes(main?.status)||
      !['hour','day','month'].includes(main.grain)||source.grain!==main.grain||source.timezone!==main.timezone||
      typeof source.timezone!=='string'||!source.timezone||source.coverage_kind!=='selected_household_comparison_mask'||
      source.fixed_fee_scope!=='household_period_only'||typeof source.reconciles_comparison_energy!=='boolean'||
      !['calendar_totals','common_measurements'].includes(source.comparison_scope)||source.comparison_scope!==comparison.comparison_scope||
      !Array.isArray(source.markers)||source.status==='ready'&&source.reason!==null)return empty;
    const mean=kind==='mean7',common=source.comparison_scope==='common_measurements';
    const periods=mean&&Array.isArray(source.baseline_periods)?source.baseline_periods.map(p=>bounds(p?.from,p?.to)):[];
    if(mean&&(source.baseline_aggregation!=='mean7'||periods.length!==7||periods.some(p=>!p)||new Set(periods.map(p=>p.key)).size!==7||periods.some((p,i)=>periods.some((q,j)=>i!==j&&p.from<q.to&&q.from<p.to))))return empty;
    const mainKeys=new Map(),currentKeys=new Map(),baselineKeys=new Map();
    const count=(map,key)=>{if(key)map.set(key,(map.get(key)||0)+1);};
    for(const row of main.bins||[])count(mainKeys,bounds(row.start,row.end)?.key);
    for(const marker of source.markers){
      if(!marker||typeof marker!=='object')continue;
      count(currentKeys,bounds(marker.current_from,marker.current_to)?.key);
      if(mean){for(const [i,p] of (Array.isArray(marker.baseline_ranges)?marker.baseline_ranges:[]).entries())count(baselineKeys,i+'|'+(bounds(p?.from,p?.to)?.key||''));}
      else count(baselineKeys,bounds(marker.baseline_from,marker.baseline_to)?.key);
    }
    const markers=new Map();
    for(const marker of source.markers){
      if(!marker||typeof marker!=='object')continue;
      const current=bounds(marker.current_from,marker.current_to);
      if(!current||mainKeys.get(current.key)!==1||currentKeys.get(current.key)!==1||marker.status!=='ready'||marker.reason!==null||
        !valid(marker.current_kwh)||!valid(marker.baseline_kwh)||!seconds(marker.expected_current_source_seconds)||
        !seconds(marker.selected_current_source_seconds)||marker.selected_current_source_seconds<=0||
        marker.selected_current_source_seconds>marker.expected_current_source_seconds)continue;
      const mapping=mean?(common?'mean7_common_source_frame_intersection':'mean7_calendar_frames'):(common?'common_source_frame_intersection':'calendar_frame_bijection');
      if(marker.mapping!==mapping||!common&&marker.selected_current_source_seconds!==marker.expected_current_source_seconds)continue;
      let ranges;
      if(mean){
        if(marker.baseline_aggregation!=='mean7'||marker.baseline_from!==null||marker.baseline_to!==null||
          !Array.isArray(marker.baseline_ranges)||marker.baseline_ranges.length!==7||
          !Array.isArray(marker.expected_baseline_source_seconds)||marker.expected_baseline_source_seconds.length!==7||
          !Array.isArray(marker.selected_baseline_source_seconds)||marker.selected_baseline_source_seconds.length!==7)continue;
        ranges=marker.baseline_ranges.map(p=>bounds(p?.from,p?.to));
        if(ranges.some((p,i)=>!p||p.from<periods[i].from||p.to>periods[i].to||baselineKeys.get(i+'|'+p.key)!==1)||new Set(ranges.filter(Boolean).map(p=>p.key)).size!==7||
          marker.expected_baseline_source_seconds.some((v,i)=>!seconds(v)||!seconds(marker.selected_baseline_source_seconds[i])||
            marker.selected_baseline_source_seconds[i]<=0||marker.selected_baseline_source_seconds[i]>v||
            marker.selected_baseline_source_seconds[i]!==marker.selected_current_source_seconds||(!common&&marker.selected_baseline_source_seconds[i]!==v)))continue;
      }else{
        const baseline=bounds(marker.baseline_from,marker.baseline_to);
        if(!baseline||baselineKeys.get(baseline.key)!==1||!seconds(marker.expected_baseline_source_seconds)||!seconds(marker.selected_baseline_source_seconds)||
          marker.selected_baseline_source_seconds<=0||marker.selected_baseline_source_seconds>marker.expected_baseline_source_seconds||
          marker.selected_baseline_source_seconds!==marker.selected_current_source_seconds||(!common&&marker.selected_baseline_source_seconds!==marker.expected_baseline_source_seconds))continue;
        ranges=[baseline];
      }
      markers.set(current.key,{current:marker.current_kwh,baseline:marker.baseline_kwh,ranges});
    }
    return {accepted:true,markers,mean,common,reconciles:source.status==='ready'&&source.reconciles_comparison_energy&&markers.size===(main.bins||[]).length&&source.markers.length===markers.size&&markers.size>0};
  };
  const zoneProof=(row,options)=>{
    const z=row?.zone_breakdown;
    if(!z||!(options?.period===true?['ready','partial','unknown']:['ready','partial']).includes(z.status)||z.scope!=='complete_household_hours'||z.fixed_fee_scope!=='household_period_only'||
      typeof z.reconciles_recorded_kwh!=='boolean'||typeof z.reconciles_known_costs!=='boolean'||
      !Array.isArray(z.zones)||!z.unattributed||typeof z.unattributed!=='object'||z.status==='ready'&&z.reason!==null)return null;
    const keys=new Set();
    for(const zone of z.zones){
      if(!zone||typeof zone.version_id!=='string'||!zone.version_id||typeof zone.zone_id!=='string'||!zone.zone_id||typeof zone.complete!=='boolean'||
        z.status==='ready'&&!zone.complete)return null;
      const key=JSON.stringify([zone.version_id,zone.zone_id]);if(keys.has(key))return null;keys.add(key);
    }
    return z;
  };
  // Explicit server classification gets a semantic color; other zones use identity colors.
  // Labels, rates and amounts never infer a classification.
  const zoneColor=(version,zone,snapshot)=>{
    const rates=(snapshot?.rates||[]).filter(rate=>rate.version_id===version);
    const matches=rates.length===1?rates[0].profile?.zones?.filter(row=>row.id===zone)||[]:[];
    if(matches.length===1&&matches[0].classification==='cheap')return 'var(--analysis-zone-cheap,#1baf7a)';
    if(matches.length===1&&matches[0].classification==='expensive')return 'var(--analysis-zone-expensive,#2a78d6)';
    let hash=0;for(const char of JSON.stringify([version,zone]))hash=(hash*31+char.charCodeAt(0))>>>0;
    return ['#287fd1','#8754b3','#c76428','#bc447b','#238782','#92821a','#64748b','#a54444'][hash%8];
  };
  const zoneEntries=(snapshot,row,{period=false}={})=>{
    const proof=zoneProof(row,{period});if(!proof)return null;
    const currency=typeof proof.currency==='string'&&/^[A-Z]{3}$/.test(proof.currency)&&['gross','net'].includes(proof.price_basis)?proof.currency:null;
    const amount=value=>currency?money(value,currency):unknown();
    const components=known=>[
      [t('Known energy cost','Znany koszt energii'),known?.energy_cost],
      [t('Known distribution cost','Znany koszt dystrybucji'),known?.variable_cost],
      [t('Known legacy usage cost','Znany dawny koszt zużycia'),known?.legacy_combined_cost]
    ].map(([label,value])=>`${label}: ${amount(value)}`).join(' · ');
    const entries=proof.zones.filter(zone=>zone&&typeof zone.version_id==='string'&&typeof zone.zone_id==='string').map(zone=>{
      const rate=(snapshot.rates||[]).find(r=>r.version_id===zone.version_id);
      const label=typeof zone.label==='string'&&zone.label&&zone.label!==zone.zone_id?zone.label:t('Unnamed tariff zone','Strefa taryfy bez nazwy');
      const version=rate?`${t('Rates from','Stawki od')} ${date(rate.valid_from)}${rate.valid_to?' – '+date(rate.valid_to):''}`:t('Rate version unavailable','Wersja stawek niedostępna');
      const complete=proof.status==='ready'&&zone.complete===true;
      const value=complete?quantity(zone.kwh):`${t('Recorded','Zarejestrowano')}: ${quantity(zone.recorded_kwh)}`;
      return {key:zone.version_id+'|'+zone.zone_id,color:zoneColor(zone.version_id,zone.zone_id,snapshot),text:`${label} · ${version} · ${value} · ${t('Usage cost','Koszt zużycia')}: ${amount(complete?zone.usage_cost:null)} · ${components(zone.known_costs)} · ${t('Measured time','Czas pomiaru')}: ${quantity(zone.measured_seconds,'s')}`};
    });
    const u=proof.unattributed;
    // Missing, measured-but-unattributed, and a genuine recorded zero remain distinct.
    entries.push({key:null,color:null,text:`${t('Unattributed','Bez przypisania do strefy')} · ${t('Recorded','Zarejestrowano')}: ${quantity(u.recorded_kwh)} · ${components(u.known_costs)} · ${t('Measured time','Czas pomiaru')}: ${quantity(u.measured_seconds,'s')} · ${t('Missing time','Brakujący czas')}: ${quantity(u.missing_seconds,'s')}`});
    return {entries,note:`${currency||t('Currency unavailable','Waluta niedostępna')} · ${basis(proof.price_basis)} · ${proof.status==='ready'&&proof.reconciles_recorded_kwh?(period?t('Complete selected-period breakdown','Pełne rozbicie wybranego okresu'):t('Complete interval breakdown','Pełne rozbicie przedziału')):(period?t('Selected period; known recorded amounts only','Wybrany okres; tylko znane zarejestrowane kwoty'):t('Partial interval; known amounts only','Niepełny przedział; tylko znane kwoty'))}${proof.reconciles_recorded_kwh?'':' · '+(period?t('Selected-period energy is not reconciled','Energia wybranego okresu nie jest uzgodniona'):t('Interval energy is not reconciled','Energia przedziału nie jest uzgodniona'))}${proof.reconciles_known_costs?'':' · '+t('Known costs are not fully reconciled','Znane koszty nie są w pełni uzgodnione')}`};
  };
  const zonesMarkup=(snapshot,row)=>{
    const result=zoneEntries(snapshot,row);
    return result?`<div data-analysis-zone-values><p>${esc(result.note)}</p><ul>${result.entries.map(entry=>`<li${entry.key!==null?` data-analysis-zone-key="${esc(entry.key)}" style="border-inline-start:6px solid ${entry.color};padding-inline-start:8px"`:' data-analysis-zone-unattributed'}>${esc(entry.text)}</li>`).join('')}</ul></div>`:`<span data-analysis-zone-values>${esc(t('No tariff-zone breakdown for this interval','Brak rozbicia stref dla tego przedziału'))}</span>`;
  };
  // Whole-period facts are independent server proofs. Never total chart bins,
  // derive a share, choose a peak or allocate fixed fees in this presentation.
  const decimal=(value,plain=false)=>typeof value==='string'&&(plain?/^[+-]?\d+(?:\.\d+)?$/:/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/).test(value)&&valid(value);
  const nonnegative=(value,plain=false)=>decimal(value,plain)&&compare(value,'0')>=0;
  const moneyFields=['energy_cost','variable_cost','legacy_combined_cost'];
  const periodWindow=snapshot=>{
    const p=snapshot.period,w=snapshot.period_summary?.window,frame=bounds(p?.start,p?.end);
    if(!frame||!w||typeof p.start!=='string'||typeof p.end!=='string'||typeof p.timezone!=='string'||!p.timezone||
      w.start!==p.start||w.end!==p.end||w.timezone!==p.timezone)return null;
    let timezoneKnown=true;try {new Intl.DateTimeFormat('en',{timeZone:p.timezone});}catch(_){timezoneKnown=false;}
    return {...frame,timezone:p.timezone,timezoneKnown};
  };
  const shareProof=(snapshot,frame)=>{
    const value=snapshot.period_summary?.cheap_zone_share,complete=snapshot.totals?.measurement_complete;
    if(!frame||!value||!['ready','partial','unknown'].includes(value.status)||value.scope!=='complete_household_hours'||
      value.classification_source!=='explicit_tariff_classification'||typeof complete!=='boolean'||snapshot.coverage?.complete!==complete)return null;
    const known=nonnegative(value.known_cheap_kwh,true)&&nonnegative(value.classified_kwh,true)&&compare(value.known_cheap_kwh,value.classified_kwh)<=0;
    const total=nonnegative(value.total_kwh,true)&&decimal(snapshot.totals.kwh)&&compare(value.total_kwh,snapshot.totals.kwh)===0;
    if(value.status==='ready')return value.reason===null&&complete&&known&&total&&compare(value.total_kwh,'0')>0&&compare(value.classified_kwh,value.total_kwh)===0&&
      nonnegative(value.ratio,true)&&compare(value.ratio,'1')<=0?value:null;
    if(value.ratio!==null)return null;
    if(value.status==='partial')return known&&(
      value.reason==='incomplete_household_measurements'&&!complete&&value.total_kwh===null||
      value.reason==='incomplete_classification'&&complete&&total&&compare(value.total_kwh,'0')>0&&compare(value.classified_kwh,value.total_kwh)<=0)?value:null;
    if(value.reason==='no_recorded_hours')return !complete&&value.known_cheap_kwh===null&&value.classified_kwh===null&&value.total_kwh===null?value:null;
    if(value.reason==='zero_total_kwh')return complete&&known&&total&&compare(value.total_kwh,'0')===0&&compare(value.classified_kwh,'0')===0?value:null;
    return ['tariff_unavailable','classification_unavailable'].includes(value.reason)&&complete&&known&&total&&compare(value.total_kwh,'0')>0&&compare(value.classified_kwh,'0')===0?value:null;
  };
  const localProof=(literal,stamp,zone)=>{
    if(typeof literal!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/.test(literal)||instant(literal)!==stamp)return false;
    try {
      const fields=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).map(part=>[part.type,part.value]));
      return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}`===literal.slice(0,19);
    }catch(_){return false;}
  };
  const peakProof=(snapshot,frame)=>{
    const p=snapshot.period_summary?.peak_hour,complete=snapshot.totals?.measurement_complete;
    if(!frame||!p||!['ready','partial','unknown'].includes(p.status)||p.scope!=='complete_household_hours'||typeof complete!=='boolean'||snapshot.coverage?.complete!==complete)return null;
    if(p.status==='unknown'&&p.reason==='no_recorded_hours')return !complete&&p.tied_count===0&&['id','from','to','start','end','local_start','local_end','fold','end_fold','kwh'].every(key=>p[key]===null)?p:null;
    if(!Number.isSafeInteger(p.from)||!Number.isSafeInteger(p.to)||p.to-p.from!==3600000||p.from<frame.from||p.to>frame.to||
      p.id!==p.from+':'+p.to||instant(p.start)!==p.from||instant(p.end)!==p.to||
      !Number.isSafeInteger(p.tied_count)||p.tied_count<1||p.tied_count>(frame.to-frame.from)/3600000||!nonnegative(p.kwh,true))return null;
    if(p.status==='unknown')return p.reason==='measurement_timezone_unavailable'&&!frame.timezoneKnown&&['local_start','local_end','fold','end_fold'].every(key=>p[key]===null)?p:null;
    if(p.status==='ready'?(p.reason!==null||!complete):(p.reason!=='incomplete_period'||complete))return null;
    return frame.timezoneKnown&&[0,1].includes(p.fold)&&[0,1].includes(p.end_fold)&&localProof(p.local_start,p.from,frame.timezone)&&localProof(p.local_end,p.to,frame.timezone)?p:null;
  };
  const periodZoneProof=(snapshot,frame)=>{
    const z=zoneProof(snapshot.period_summary,{period:true});if(!frame||!z)return null;
    const complete=snapshot.totals?.measurement_complete,secondsInWindow=(frame.to-frame.from)/1000;
    const calendar=value=>value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&ui.calendarDate(value)!==null;
    const duration=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=secondsInWindow;
    const known=value=>value&&typeof value==='object'&&moneyFields.every(key=>value[key]===null||decimal(value[key]));
    const currency=typeof z.currency==='string'&&/^[A-Z]{3}$/.test(z.currency)&&['gross','net'].includes(z.price_basis);
    if(!currency&&!(z.currency===null&&z.price_basis===null&&['currency_or_basis_mismatch','tariff_unavailable'].includes(z.reason)))return null;
    if(currency&&(z.currency!==snapshot.totals?.currency||z.price_basis!==snapshot.totals?.price_basis))return null;
    if(currency&&(z.status==='unknown'||z.reason==='currency_or_basis_mismatch'))return null;
    if(z.status==='ready'&&(!complete||snapshot.coverage?.complete!==true||!z.reconciles_recorded_kwh||!z.reconciles_known_costs)||
      z.status==='partial'&&(typeof z.reason!=='string'||!z.reason||z.reason.length>128)||
      z.status==='unknown'&&(z.reason!=='tariff_unavailable'||z.zones.length!==0)||!currency&&z.reconciles_known_costs)return null;
    const u=z.unattributed;
    if(!(u.recorded_kwh===null||nonnegative(u.recorded_kwh))||!duration(u.measured_seconds)||!duration(u.missing_seconds)||!known(u.known_costs)||
      !Array.isArray(u.reasons)||u.reasons.some(reason=>typeof reason!=='string'||!reason||reason.length>128)||
      z.status==='ready'&&(u.reasons.length||u.missing_seconds!==0||u.measured_seconds!==0||u.recorded_kwh!==null))return null;
    if(!currency&&moneyFields.some(key=>u.known_costs[key]!==null))return null;
    for(const zone of z.zones) {
      const rates=(snapshot.rates||[]).filter(rate=>rate.version_id===zone.version_id),rate=rates[0];
      const matches=rate?.profile?.zones?.filter(row=>row.id===zone.zone_id)||[];
      if(rates.length!==1||matches.length!==1||zone.tariff_id!==snapshot.active_tariff_id||typeof snapshot.active_tariff_id!=='string'||
        typeof zone.label!=='string'||zone.label!==matches[0].label||!calendar(rate.valid_from)||!calendar(rate.valid_to)||
        !/^[A-Z]{3}$/.test(rate.currency)||!['gross','net'].includes(rate.price_basis)||currency&&(rate.currency!==z.currency||rate.price_basis!==z.price_basis)||
        !nonnegative(zone.recorded_kwh)||!duration(zone.measured_seconds)||!known(zone.known_costs)||
        moneyFields.some(key=>!(zone[key]===null||decimal(zone[key])))||!(zone.usage_cost===null||decimal(zone.usage_cost))||
        (zone.complete?(!nonnegative(zone.kwh)||compare(zone.kwh,zone.recorded_kwh)!==0):zone.kwh!==null)||
        !currency&&(zone.usage_cost!==null||moneyFields.some(key=>zone[key]!==null||zone.known_costs[key]!==null)))return null;
    }
    return z;
  };
  const periodZonesMarkup=snapshot=>{
    if(!Object.hasOwn(snapshot,'period_summary'))return `<p data-analysis-zone-note class="analysis-note">${esc((snapshot.chart?.bins||[]).some(zoneProof)?t('Select a chart interval or open Data for tariff-zone details. No whole-period zone total is supplied.','Wybierz przedział na wykresie lub otwórz Dane, aby odczytać strefy taryfy. Serwer nie podał sumy stref za cały okres.'):t('Energy by tariff zone: no server breakdown.','Energia według stref taryfy: brak rozbicia z serwera.'))}</p>`;
    const frame=periodWindow(snapshot),proof=periodZoneProof(snapshot,frame),share=shareProof(snapshot,frame),peak=peakProof(snapshot,frame);
    const none=t('No data: a matching breakdown for this selected period is unavailable.','Brak danych: rozbicie dla wybranego okresu jest niedostępne.');
    const title=`<h4>${esc(t('Energy by tariff zone','Energia według stref taryfy'))}</h4>`;
    const details=proof?zoneEntries(snapshot,snapshot.period_summary,{period:true}):null;
    const rows=proof?.zones.map(zone=>{
      const ready=proof.status==='ready'&&zone.complete,label=zone.label&&zone.label!==zone.zone_id?zone.label:t('Unnamed tariff zone','Strefa taryfy bez nazwy');
      return `<li data-analysis-period-zone style="border-inline-start:6px solid ${zoneColor(zone.version_id,zone.zone_id,snapshot)}"><strong>${esc(label)}</strong><span>${esc((ready?'':t('Recorded','Zarejestrowano')+': ')+quantity(ready?zone.kwh:zone.recorded_kwh))}</span><span>${esc(t('Usage cost','Koszt zużycia'))}: ${esc(money(ready?zone.usage_cost:null,proof.currency))}</span></li>`;
    }).join('')||'';
    const u=proof?.unattributed;
    const unknownRow=u&&(u.recorded_kwh!==null||u.missing_seconds>0||u.reasons.length)?`<li data-analysis-period-unattributed><strong>${esc(t('Unattributed to a tariff zone','Bez przypisania do strefy taryfy'))}</strong><span>${esc(t('Recorded','Zarejestrowano'))}: ${esc(quantity(u.recorded_kwh))}</span></li>`:'';
    const note=proof?proof.status==='ready'?t('Entire selected period · usage costs exclude household fixed fees.','Cały wybrany okres · koszty zużycia nie obejmują opłat stałych gospodarstwa.'):proof.status==='unknown'?t('Tariff-zone assignment is unavailable. Recorded energy, if any, is shown separately.','Przypisanie do stref taryfy jest niedostępne. Zarejestrowaną energię, jeśli istnieje, pokazano osobno.'):proof.reason==='currency_or_basis_mismatch'?t('Recorded energy is shown. Costs cannot be combined across different currencies or price bases.','Pokazano zarejestrowaną energię. Nie można łączyć kosztów w różnych walutach lub podstawach cen.'):t('Partial breakdown · recorded energy and known amounts only.','Niepełne rozbicie · tylko zarejestrowana energia i znane kwoty.'):none;
    const shareDetail=share?`${t('Known cheap-zone energy','Znana energia w strefie taniej')}: ${quantity(share.known_cheap_kwh)} · ${t('Energy with known zone type','Energia ze znanym rodzajem strefy')}: ${quantity(share.classified_kwh)} · ${t('Full-period energy','Energia całego okresu')}: ${quantity(share.total_kwh)} · ${t('Full precision share','Udział z pełną precyzją')}: ${share.status==='ready'?ui.number(share.ratio,{style:'percent',maximumFractionDigits:100}):unknown()}`:t('Cheap-zone energy share is unavailable.','Udział energii w strefie taniej jest niedostępny.');
    const peakDetail=peak&&peak.kwh!==null?`${intervalText({from:peak.from,to:peak.to})} · ${quantity(peak.kwh)} · ${t('Hours tied at this value','Godziny z taką samą wartością')}: ${number(peak.tied_count)} · ${t('Measurement calendar','Kalendarz pomiarów')}: ${frame.timezone} · ${peak.reason==='measurement_timezone_unavailable'?t('Local measurement time is unavailable; absolute hour only.','Lokalny czas pomiaru jest niedostępny; znana jest tylko godzina bezwzględna.'):peak.local_start.slice(11,16)+' UTC'+peak.local_start.slice(-6)+' – '+peak.local_end.slice(11,16)+' UTC'+peak.local_end.slice(-6)}${peak.fold===1?' · '+t('Second occurrence of the local hour','Drugie wystąpienie lokalnej godziny'):''}${peak.status==='partial'||!snapshot.totals?.measurement_complete?' · '+t('Highest observed hour; the period is incomplete','Najwyższa zarejestrowana godzina; okres jest niepełny'):''}`:t('Highest hour is unavailable.','Najwyższa godzina jest niedostępna.');
    return `<section data-analysis-period-zone-total>${title}<p data-analysis-zone-note class="analysis-note">${esc(note)}</p>${proof?`<ul class="analysis-period-zones">${rows}${unknownRow}</ul>`:''}<details data-analysis-period-summary-details><summary>${esc(t('Selected-period values and measurement time','Wartości okresu i czas pomiarów'))}</summary>${frame?`<p>${esc(range(snapshot.period))} · ${esc(ui.timeZone)} · ${esc(t('Measurement calendar','Kalendarz pomiarów'))}: ${esc(frame.timezone)}</p>`:''}${details?`<p>${esc(details.note)}</p><ul>${details.entries.map(entry=>`<li>${esc(entry.text)}</li>`).join('')}</ul>`:`<p>${esc(none)}</p>`}<p>${esc(shareDetail)}</p><p>${esc(peakDetail)}</p></details></section>`;
  };
  // Only validate energy conservation here. Money stays in server literals.
  // Bounded integer scaling rejects mismatches below Number precision.
  const energyPartition=(values,total)=>{
    if(!nonnegative(total)||values.some(value=>!nonnegative(value)))return false;
    const all=[...values,total].map(parts),scales=all.map(value=>value.magnitude-value.digits.length),base=Math.min(...scales);
    if(all.some((value,i)=>value.digits.length>4096||scales[i]-base>4096))return false;
    const ints=all.map((value,i)=>BigInt(value.digits||'0')*10n**BigInt(scales[i]-base));
    return ints.slice(0,-1).reduce((sum,value)=>sum+value,0n)===ints.at(-1);
  };
  const groupPartition=(snapshot,rows)=>{
    const g=snapshot.groups,total=snapshot.totals;
    return g?.energy_domain==='grid_import'&&g.partition_complete===true&&g.membership_mode==='current_snapshot'&&
      Number.isSafeInteger(g.revision)&&g.registry_revision===g.revision&&total?.measurement_complete===true&&snapshot.coverage?.complete===true&&
      nonnegative(total.kwh)&&nonnegative(total.recorded_household_kwh)&&compare(total.kwh,total.recorded_household_kwh)===0&&
      rows.length>0&&rows.every(({row})=>row?.measurement_complete===true&&nonnegative(row.kwh)&&nonnegative(row.recorded_kwh)&&compare(row.kwh,row.recorded_kwh)===0)&&energyPartition(rows.map(({row})=>row.kwh),total.kwh);
  };
  const sourcePartition=snapshot=>{
    if(snapshot.groups?.energy_domain!=='grid_import')return null;
    const proof=periodZoneProof(snapshot,periodWindow(snapshot));
    return proof?.status==='ready'&&energyPartition(proof.zones.map(zone=>zone.kwh),snapshot.totals?.kwh)?proof:null;
  };
  const columnZone=(snapshot,row,visual)=>{
    const frame=bounds(row?.start,row?.end),period=bounds(snapshot.period?.start,snapshot.period?.end);
    if(!frame||!period||frame.from<period.from||frame.to>period.to||row.from!==frame.from||row.to!==frame.to||
      snapshot.chart?.timezone!==snapshot.period?.timezone||snapshot.chart?.coverage_kind!=='complete_household_hours'||
      snapshot.chart?.fixed_fee_scope!=='household_period_only'||!['ready','partial'].includes(snapshot.chart?.status)||
      row.complete!==true||row.currency!==snapshot.totals?.currency||row.price_basis!==snapshot.totals?.price_basis||
      !nonnegative(row.kwh)||!nonnegative(row.recorded_kwh)||compare(row.kwh,row.recorded_kwh)!==0||!valid(visual)||compare(row.kwh,visual)!==0||
      row.expected_seconds!==(frame.to-frame.from)/1000||row.measured_seconds!==row.expected_seconds)return null;
    // Interval completeness is independent of other missing hours in the selected period.
    const proof=periodZoneProof({...snapshot,totals:{...snapshot.totals,measurement_complete:true},coverage:{...snapshot.coverage,complete:true},period_summary:{zone_breakdown:row.zone_breakdown}},frame);
    if(proof?.status!=='ready'||proof.zones.length!==1||!energyPartition(proof.zones.map(z=>z.kwh),row.kwh))return null;
    const zone=proof.zones[0];if(zone.measured_seconds!==row.measured_seconds)return null;
    return {key:zone.version_id+'|'+zone.zone_id,label:zone.label,color:zoneColor(zone.version_id,zone.zone_id,snapshot)};
  };
  // Ratios only draw marks/labels. They never feed proof, prices, or money.
  const shareGeometry=(value,total)=>nonnegative(value)&&nonnegative(total)&&compare(total,'0')>0&&Number(total)>0?
    Math.max(0,Math.min(1,Number(value)/Number(total))):null;
  const flowMarkup=(snapshot,rows,colors)=>{
    const total=snapshot.totals?.kwh,groupReady=groupPartition(snapshot,rows),source=sourcePartition(snapshot);
    const positive=nonnegative(total)&&compare(total,'0')>0&&Number(total)>0;
    const destinations=groupReady?rows.filter(({row})=>compare(row.kwh,'0')>0).map(({id,label,row})=>({id,label,kwh:row.kwh,color:id==='unmeasured'?null:`var(--analysis-rank-${colors.get(id)??4})`})):[];
    const sources=source?source.zones.filter(zone=>compare(zone.kwh,'0')>0).map(zone=>({id:zone.version_id+'|'+zone.zone_id,label:zone.label,kwh:zone.kwh,color:zoneColor(zone.version_id,zone.zone_id,snapshot)})):[];
    const swatch=item=>`<i class="analysis-flow-swatch${item.color?'':' analysis-hatched'}" aria-hidden="true"${item.color?` style="background:${item.color}"`:''}></i>`;
    const legend=items=>`<ul class="analysis-flow-labels">${items.map(item=>`<li>${swatch(item)}<span>${esc(item.label)} · ${esc(briefEnergy(item.kwh))} · ${esc(percentage(shareGeometry(item.kwh,total)))}</span></li>`).join('')}</ul>`;
    const bar=(side,items,ready)=>ready&&positive?`<div class="analysis-composition" data-analysis-composition="${side}" aria-hidden="true">${items.map(item=>`<span data-analysis-segment class="${item.color?'':'analysis-hatched'}" style="width:${shareGeometry(item.kwh,total)*100}%;${item.color?'background:'+item.color:''}"></span>`).join('')}</div>`:`<p class="analysis-note">${esc(positive?unknown():nonnegative(total)&&compare(total,'0')===0?t('No energy recorded in this period.','W tym okresie zarejestrowano zerowe zużycie.'):unknown())}</p>`;
    let diagram='';
    if(groupReady&&source&&positive){
      const count=Math.max(sources.length,destinations.length),height=Math.max(220,count*34),gap=24,top=12,span=height-24-gap*(count-1),trunkTop=top+gap*(count-1)/2;
      const paths=(items,side)=>{let offset=0;return items.map((item,index)=>{
        const h=shareGeometry(item.kwh,total)*span,nodeY=top+offset+index*gap+(count-items.length)*gap/2,trunkY=trunkTop+offset;offset+=h;
        const y0=side==='source'?nodeY:trunkY,y1=side==='source'?trunkY:nodeY,x0=side==='source'?16:208,x1=side==='source'?192:384,m=(x0+x1)/2;
        const d=`M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1} L${x1},${y1+h} C${m},${y1+h} ${m},${y0+h} ${x0},${y0+h} Z`;
        return `<g data-analysis-flow-side="${side}" data-analysis-flow-id="${esc(item.id)}"><path d="${d}" fill="${item.color||'url(#'+flowHatchId+')'}" fill-opacity="0.28"/><rect data-analysis-flow-node x="${side==='source'?4:384}" y="${nodeY}" width="12" height="${h}" rx="2" fill="${item.color||'url(#'+flowHatchId+')'}"/><title>${esc(item.label+' · '+briefEnergy(item.kwh))}</title></g>`;
      }).join('');};
      diagram=`<div class="analysis-sankey-wrap">${legend(sources)}<div><p class="analysis-household">${esc(t('Household','Dom'))} · ${esc(briefEnergy(total))}</p><svg class="analysis-sankey" data-analysis-sankey style="height:${height}px" viewBox="0 0 400 ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><pattern id="${flowHatchId}" patternUnits="userSpaceOnUse" width="7" height="7"><path d="M-1 1 L1 -1 M0 7 L7 0 M6 8 L8 6" stroke="currentColor" stroke-width="1.5"/></pattern></defs>${paths(sources,'source')}<rect x="192" y="${trunkTop}" width="16" height="${span}" fill="currentColor"/>${paths(destinations,'destination')}</svg></div>${legend(destinations)}</div>`;
    }
    const note=!groupReady||!source?t('Complete flow unavailable: the source or destination breakdown is incomplete or does not match this period. Known values remain below.','Pełny przepływ niedostępny: rozbicie źródeł lub odbiorców jest niepełne albo nie pasuje do okresu. Znane wartości pozostają poniżej.'):t('Tariff zones → household → selected groups. Each side describes the same imported energy; links do not assign a device to a specific tariff zone.','Strefy taryfy → dom → wybrane grupy. Obie strony opisują ten sam import; połączenia nie przypisują urządzenia do konkretnej strefy taryfy.');
    return {groupReady,markup:`<p class="analysis-flow-heading">${esc(snapshot.groups?.energy_domain==='grid_import'?t('Grid import','Import z sieci'):t('Measured energy','Zmierzona energia'))} · ${esc(briefEnergy(total))}</p>${diagram}<div class="analysis-mobile-composition"><h4>${esc(t('From','Skąd'))}</h4>${bar('source',sources,!!source)}${source?legend(sources):`<p>${esc(t('Tariff-zone breakdown unavailable','Brak rozbicia stref taryfy'))}</p>`}<h4>${esc(t('To','Dokąd'))}</h4>${bar('destination',destinations,groupReady)}</div>${groupReady&&source?`<details data-analysis-flow-details><summary>${esc(t('How to read the flow','Jak czytać przepływ'))}</summary>`:''}<p class="analysis-note" data-analysis-flow-note>${esc(note)}</p>${groupReady&&source?'</details>':''}`};
  };
  const chart = (snapshot, options) => {
    const bins=snapshot.chart?.bins || [],currency=snapshot.totals?.currency;
    const allowed=snapshot.period?.kind==='day'?['previous','same_weekday','mean7']:['previous','year_ago'];
    const requested=options.comparison||snapshot.context?.comparison_kind,kind=allowed.includes(requested)?requested:'previous';
    const series=markerSeries(snapshot,kind);
    const axisTicks=ui.chartTicks(bins.map(row=>row.start),snapshot.chart?.grain==='hour'?'hour':'day');
    const axisLabels=new Map(axisTicks.map(tick=>[tick.index,tick.label]));
    const majorTicks=new Set([axisTicks[0]?.index,axisTicks[Math.floor((axisTicks.length-1)/2)]?.index,axisTicks.at(-1)?.index].filter(index=>index!==undefined));
    const points=bins.map((row,index)=>{
      const key=bounds(row.start,row.end)?.key,marker=series.markers.get(key);
      return {row,index,marker,label:ui.pointLabel(row.start)||unknown(),current:series.common?marker?.current??null:marker?.current??row.kwh,visualCurrent:marker?.current??row.kwh};
    });
    const max=maximum(points.flatMap(p=>[p.visualCurrent,p.marker?.baseline]));
    const rangeMarkup=marker=>marker?marker.ranges.map(p=>`<span data-analysis-baseline-range>${esc(intervalText(p))}</span>`).join('<br>'):esc(unknown());
    const currentLabel=series.common?t('Current · common measurements','Bieżący · wspólne pomiary'):t('Current','Bieżący');
    const baselineLabel=series.mean?t('Baseline · mean of 7 days','Odniesienie · średnia z 7 dni'):t('Baseline','Odniesienie');
    const pointText=p=>`${p.label} · ${currentLabel}: ${quantity(p.current)} · ${baselineLabel}: ${quantity(p.marker?.baseline)} · ${t('Baseline interval','Przedział odniesienia')}: ${p.marker?p.marker.ranges.map(intervalText).join('; '):unknown()} · ${t('Whole household','Całe gospodarstwo')}: ${quantity(p.row.kwh)} · ${t('Household usage cost','Koszt zużycia gospodarstwa')}: ${money(p.row.usage_cost,currency)}`;
    const hasZones=bins.some(zoneProof);
    const columnZones=new Map(points.map(point=>[point.index,options.section==='comparison'?null:columnZone(snapshot,point.row,point.visualCurrent)]));
    const colorKeys=new Map([...columnZones.values()].filter(Boolean).map(zone=>[zone.key,zone]));
    const zoneLegend=colorKeys.size?`<p data-analysis-chart-zones class="analysis-zone-legend">${[...colorKeys.values()].map(zone=>`<span><i class="analysis-flow-swatch" aria-hidden="true" style="background:${zone.color}"></i>${esc(zone.label)}</span>`).join('')}${[...columnZones.values()].some(zone=>!zone)?`<span>${esc(t('Other bars: zone unavailable or mixed','Pozostałe słupki: strefa nieznana lub mieszana'))}</span>`:''}</p>`:'';
    const rows=points.map(p=>[
      button('point',p.index,p.label,String(options.selected)===String(p.index)),
      `<span data-analysis-current-value>${esc(quantity(p.current))}</span>`,esc(money(p.row.usage_cost,currency)),
      `<span data-analysis-baseline-value${p.marker?' data-analysis-marker aria-label="'+esc(pointText(p))+'"':''}>${esc(quantity(p.marker?.baseline))}</span>`,rangeMarkup(p.marker),
      ...(series.common?[`<span data-analysis-household-value>${esc(quantity(p.row.kwh))}</span>`]:[]),...(hasZones?[zonesMarkup(snapshot,p.row)]:[])
    ]);
    const selected=points.find(point=>String(point.index)===String(options.selected));
    const selection=selected?`<div data-analysis-point-detail><p role="status">${esc(pointText(selected))}</p>${selected.marker?`<p>${rangeMarkup(selected.marker)}</p>`:''}${zonesMarkup(snapshot,selected.row)}</div>`:'';
    const note=series.markers.size?`<p data-analysis-baseline="${series.reconciles?'ready':'partial'}">${esc(series.reconciles?t('Comparison covers the displayed intervals.','Porównanie obejmuje wyświetlone przedziały.'):t('Comparison is available for selected intervals only; it does not cover the whole period.','Porównanie obejmuje wybrane przedziały, ale nie cały okres.'))}</p>`:baselineNote();
    return `<section data-analysis-chart><div class="analysis-section-title"><h3>${esc(t('Consumption over time','Zużycie w czasie'))}</h3><div class="analysis-switch">${button('view','chart',t('Chart','Wykres'),options.view !== 'data')}${button('view','data',t('Data','Dane'),options.view === 'data')}</div></div>
      <p data-analysis-series-legend><span class="analysis-series-current">${esc(currentLabel)}</span> · <span class="analysis-series-baseline">${esc(baselineLabel)}</span>${series.common?' · '+esc(t('Selected amounts can differ from whole-household energy. Unmatched intervals retain household bars; their common comparison value is unavailable.','Wybrane ilości mogą różnić się od energii całego gospodarstwa. Bez dopasowania pozostaje słupek gospodarstwa; brak wartości wspólnego porównania.')):''}</p>
      ${zoneLegend}${options.view === 'data'?table(t('Measured intervals · usage cost without fixed fees','Przedziały pomiarowe · koszt zużycia bez opłat stałych'),[t('Period','Okres'),currentLabel+' kWh',t('Household usage cost','Koszt zużycia gospodarstwa'),baselineLabel+' kWh',t('Real baseline intervals','Rzeczywiste przedziały odniesienia'),...(series.common?[t('Whole household kWh','Całe gospodarstwo kWh')]:[]),...(hasZones?[t('Tariff zones in this interval','Strefy taryfy w przedziale')]:[])],rows,'','data-analysis-bin'):`<div class="analysis-chart-scroll"><div class="analysis-chart" style="--analysis-point-count:${Math.max(1,points.length)}" role="group" aria-label="${esc(t('Current and baseline consumption, select a point for values','Bieżące zużycie i odniesienie, wybierz punkt, aby odczytać wartości'))}">${points.map(p=>`<button type="button" class="analysis-point${p.visualCurrent==null?' analysis-missing':''}" data-analysis-action="point" data-analysis-value="${p.index}" aria-pressed="${String(options.selected)===String(p.index)}" aria-label="${esc(pointText(p))}"><span class="analysis-column analysis-series-current" aria-hidden="true" ${columnZones.get(p.index)?` data-analysis-column-zone="${esc(columnZones.get(p.index).key)}"`:''} style="height:${width(p.visualCurrent,max)*1.68}px${columnZones.get(p.index)?';background:'+columnZones.get(p.index).color:options.section==='comparison'?'':';background:var(--secondary-text-color,#718096)'}"></span>${p.marker?`<span data-analysis-marker class="analysis-baseline-line analysis-series-baseline" aria-label="${esc(pointText(p))}" style="bottom:${40+width(p.marker.baseline,max)*1.68}px"></span>`:''}<span class="analysis-point-label"${axisLabels.has(p.index)&&!majorTicks.has(p.index)?' data-analysis-axis-minor':''} aria-hidden="true">${esc(axisLabels.get(p.index)||'')}</span></button>`).join('')}</div></div>`}
      ${!points.length?`<p role="status">${esc(unknown())}</p>`:''}${selection}${note}<p class="analysis-note">${esc(t('Fixed fees apply once to the household period. Missing measurements are not zero.','Opłaty stałe dotyczą jednokrotnie całego okresu gospodarstwa. Brak pomiaru nie oznacza zera.'))}</p></section>`;
  };
  const groupsView = (snapshot,level,options={}) => {
    const groups=snapshot.groups, rows=rowsFor(groups,level);
    if(!groups?.unmeasured)rows.push({id:'unmeasured',label:t('Unmeasured','Niezmierzone'),row:{kwh:null,usage_cost:null}});
    const max=maximum(rows.map(x=>x.row.kwh));
    const colors=new Map(Object.keys(groups?.[level] || {}).sort().map((id,index)=>[id,Math.min(index,4)]));
    const flow=flowMarkup(snapshot,rows,colors);
    const groupCurrency=typeof groups?.currency==='string'&&/^[A-Z]{3}$/.test(groups.currency)&&
      groups.currency===snapshot.totals?.currency&&['gross','net'].includes(groups.price_basis)&&groups.price_basis===snapshot.totals?.price_basis?groups.currency:null;
    const groupMoney=value=>groupCurrency?money(value,groupCurrency):unknown();
    const details=table(t('Group measurements and usage costs','Pomiary grup i koszty zużycia'),[t('Group','Grupa'),'kWh',t('Usage cost','Koszt zużycia'),t('Coverage','Pokrycie')],rows.map(({label,row})=>[esc(label),esc(quantity(row.kwh)),esc(groupMoney(row.usage_cost)),esc(coverage(row.coverage))]))+
      `<p class="analysis-note">${esc(t('Assignments follow the current Home Assistant registry. No room and unmeasured energy are separate. Group costs exclude household fixed fees.','Przypisania pochodzą z aktualnego rejestru Home Assistant. Bez pokoju i Niezmierzone są osobnymi pozycjami. Koszty grup nie obejmują opłat stałych gospodarstwa.'))}</p>`;
    return `<section data-analysis-groups><h3>${esc(t('Energy flow — from and to','Przepływ energii — skąd i dokąd'))}</h3>${options.view==='data'?'':flow.markup}<div${options.view==='data'?'':' class="analysis-group-summary"'}><div><h4>${esc(t('Selected groups · share of household energy','Wybrane grupy · udział energii gospodarstwa'))}</h4>
      <ol class="analysis-ranking" data-analysis-ranking>${rows.map(({id,label,row})=>`<li data-analysis-rank-id="${esc(id)}" class="${id==='unmeasured'?'analysis-unmeasured':''}"><div><strong><i class="analysis-flow-swatch ${id==='unmeasured'?'analysis-hatched':'rank-'+(colors.get(id)??4)}" aria-hidden="true"></i>${esc(label)}</strong><span>${esc(options.view==='data'?quantity(row.kwh):briefEnergy(row.kwh))} · <span data-analysis-rank-share>${esc(flow.groupReady?percentage(shareGeometry(row.kwh,snapshot.totals?.kwh)):unknown())}</span> · ${esc(groupMoney(row.usage_cost))}</span></div><div class="analysis-track" aria-hidden="true"><span class="analysis-rank rank-${colors.get(id)??4}" style="width:${width(row.kwh,max)}%"></span></div></li>`).join('')}</ol>
      ${!rows.length?`<p>${esc(unknown())}</p>`:''}${options.view==='data'?'':`<details data-analysis-unmeasured-details><summary>${esc(t('Unmeasured energy explained','Co oznacza energia niezmierzona'))}</summary>`}<p class="analysis-note" data-analysis-unmeasured-explanation>${esc(groups?.energy_domain==='grid_import'?t('Unmeasured = grid import − sum of disjoint measured device amounts. Parent residuals and children are counted once. This is not the same as devices with no room. Fixed fees belong only to the household.','Niezmierzone = import z sieci − suma rozłącznych ilości zmierzonych urządzeń. Reszty urządzeń nadrzędnych i dzieci liczone są raz. To osobna pozycja od urządzeń bez pokoju. Opłaty stałe dotyczą tylko gospodarstwa.'):t('Unmeasured energy is separate from devices with no room. An import remainder is unavailable for this energy source.','Energia niezmierzona jest osobna od urządzeń bez pokoju. Dla tego źródła nie można podać reszty importu.'))}</p>
      ${options.view==='data'?'':'</details>'}</div>
      ${periodZonesMarkup(snapshot)}</div>
      ${options.view==='data'?details:`<details data-analysis-group-details><summary>${esc(t('Group measurements and costs','Pomiary i koszty grup'))}</summary>${details}</details>`}</section>`;
  };
  const costLabels = {energy_cost:t('Energy','Energia'),variable_cost:t('Variable distribution','Dystrybucja zmienna'),legacy_combined_cost:t('Legacy combined usage','Dawny łączny koszt zużycia'),fixed_cost:t('Fixed fees for period','Opłaty stałe za okres'),total_cost:t('Total','Razem')};
  const feeLabels = {subscription:t('Subscription','Abonament'),capacity:t('Capacity','Opłata mocowa'),distribution:t('Fixed distribution','Dystrybucja stała'),other:t('Other','Pozostałe')};
  const weekdays = pl ? ['pon','wt','śr','czw','pt','sob','nd'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const ruleText = rule => [
    rule.weekdays ? rule.weekdays.map(day=>weekdays[(day+6)%7] || unknown()).join(', ') : t('Every day','Codziennie'),
    ...(rule.dates || []).map(value=>date(value)), rule.season ? `${date('2000-'+rule.season.from,true)} – ${date('2000-'+rule.season.to,true)}` : '',
    (rule.intervals || []).map(interval=>`${interval.from}–${interval.to}`).join(', '),
    rule.priority == null ? '' : `${t('priority','priorytet')} ${number(rule.priority)}`
  ].filter(Boolean).join(' · ');
  const ratesView = (snapshot,options={}) => {
    const total=snapshot.totals || {}, groups=snapshot.groups || {}, data=options.view==='data';
    if (nativeFacts(snapshot)) return `<section class="analysis-rate76" data-analysis-rates><h3>${esc(t('Rates and costs','Stawki i koszty'))}</h3>${nativeDetails(snapshot)}</section>`;
    const currencyKnown=typeof total.currency==='string'&&/^[A-Z]{3}$/.test(total.currency)&&['gross','net'].includes(total.price_basis);
    const positive=value=>valid(value)&&compare(value,'0')>=0;
    const componentKeys=['energy_cost','variable_cost','legacy_combined_cost','fixed_cost'];
    // Only geometry uses Number. Amounts, rates, deltas and monthly fees remain
    // producer values passed directly to the shared formatter, never added here.
    const costReady=currencyKnown&&total.measurement_complete===true&&total.pricing_complete===true&&total.components_complete===true&&
      positive(total.total_cost)&&componentKeys.every(key=>positive(total[key])&&compare(total[key],total.total_cost)<=0);
    const componentLegend=componentKeys.map(key=>`<li><span class="analysis-rate76-swatch analysis-rate76-${key}" aria-hidden="true"></span><span>${esc(costLabels[key])}: <strong>${esc(money(total[key],total.currency))}</strong></span></li>`).join('');
    const costGraphic=!data&&costReady?`<div class="analysis-rate76-track" aria-hidden="true">${componentKeys.map(key=>`<span class="analysis-rate76-${key}" data-analysis-rate76-bar style="width:${width(total[key],Number(total.total_cost))}%" title="${esc(costLabels[key]+': '+money(total[key],total.currency))}"></span>`).join('')}</div>`:'';
    const visibleRates=(snapshot.rates || []).map(rate=>{
      const profile=rate.profile || {},zones=profile.zones || [],legacy=rate.rate_semantics==='legacy_combined';
      // Optional rates78 producer contract. Reject the whole projection on any
      // duplicate/foreign/missing zone or non-Decimal value; never synthesize it.
      const combined=rate.zone_usage_rates,zoneIds=zones.map(zone=>zone.id);
      const combinedValid=Array.isArray(combined)&&combined.length===zones.length&&new Set(zoneIds).size===zones.length&&zoneIds.every(id=>typeof id==='string'&&id.length>0)&&
        typeof rate.currency==='string'&&/^[A-Z]{3}$/.test(rate.currency)&&['gross','net'].includes(rate.price_basis)&&
        combined.every(row=>row&&typeof row.zone_id==='string'&&zoneIds.includes(row.zone_id)&&(row.usage_rate===null||typeof row.usage_rate==='string'&&valid(row.usage_rate)))&&
        new Set(combined.map(row=>row.zone_id)).size===zones.length;
      const combinedRates=new Map(combinedValid?combined.map(row=>[row.zone_id,row.usage_rate]):[]);
      const clock=profile.clock?.mode==='fixed'?t('Fixed UTC offset','Stałe przesunięcie UTC')+': '+quantity(profile.clock.offsetMinutes,'min',true):profile.clock?.mode==='civil'?t('Civil tariff clock','Czas lokalny taryfy'):unknown();
      const monthly=Object.entries(feeLabels).filter(([key])=>Object.hasOwn(rate.fixed_monthly || {},key)).map(([key,label])=>`<li>${esc(label)}: <strong>${esc(money(rate.fixed_monthly[key],rate.currency))}</strong> / ${esc(t('month','miesiąc'))}</li>`);
      if(rate.legacy_combined_monthly!=null)monthly.push(`<li>${esc(t('Legacy combined monthly fee','Dawna łączna opłata miesięczna'))}: <strong>${esc(money(rate.legacy_combined_monthly,rate.currency))}</strong> / ${esc(t('month','miesiąc'))}</li>`);
      const dynamic=(profile.dynamic?.intervals || []).map(row=>[esc(`${dateTime(row.from)} – ${dateTime(row.to)}`),esc(money(row.energyRate,rate.currency)),esc(money(row.variableRate,rate.currency))]);
      return `<article class="analysis-rate76-card" data-analysis-rate76-version="${esc(rate.version_id)}"><h4>${esc(t('Rates effective from','Stawki obowiązujące od'))} ${esc(date(rate.valid_from))}${rate.valid_to?' – '+esc(date(rate.valid_to)):''}</h4>
        <p class="analysis-rate76-meta">${esc(rate.currency || unknown())} · ${esc(basis(rate.price_basis))} · ${esc(profile.timezone || unknown())} · ${esc(clock)}</p>
        <ul class="analysis-rate76-rate-list">${zones.map(zone=>{
          const rules=[...(profile.rules || []).filter(rule=>rule.zone===zone.id).map(rule=>ruleText(rule)),...(profile.exceptions || []).filter(rule=>rule.zone===zone.id).map(rule=>t('Exception','Wyjątek')+': '+ruleText(rule))];
          if(zone.id===profile.defaultZone)rules.push(t('Default outside matching rules','Domyślna poza pasującymi regułami'));
          return `<li><strong>${esc(zone.label || t('Unnamed zone','Strefa bez nazwy'))}</strong><div class="analysis-rate76-schedule">${rules.length?rules.map(rule=>`<p>${esc(rule)}</p>`).join(''):esc(unknown())}</div><dl class="analysis-rate76-rate-values"><div><dt>${esc(legacy?t('Combined usage / kWh','Łączna stawka zużycia / kWh'):t('Energy / kWh','Energia / kWh'))}</dt><dd>${esc(money(zone.energyRate,rate.currency))}</dd></div><div><dt>${esc(t('Distribution / kWh','Dystrybucja / kWh'))}</dt><dd>${esc(legacy?unknown():money(zone.variableRate,rate.currency))}</dd></div><div><dt>${esc(t('Total / kWh','Razem / kWh'))}</dt><dd data-analysis-rate76-total="${esc(zone.id)}">${esc(money(combinedRates.get(zone.id),rate.currency))}</dd></div></dl></li>`;
        }).join('')}</ul>
        ${!zones.length?`<p>${esc(unknown())}</p>`:''}
        ${dynamic.length?table(t('Dynamic rate intervals','Przedziały stawek dynamicznych'),[t('Period','Okres'),t('Energy / kWh','Energia / kWh'),t('Distribution / kWh','Dystrybucja / kWh')],dynamic,'class="analysis-rate76-table"'):''}
        <p class="analysis-rate76-meta">${esc(t('Monthly fees · metadata, not another period charge','Opłaty miesięczne · metadane, bez ponownego naliczania'))}</p><ul class="analysis-rate76-monthly">${monthly.join('') || `<li>${esc(unknown())}</li>`}</ul></article>`;
    }).join('');
    const versions=(snapshot.rates || []).map(rate=>{
      const profile=rate.profile || {},zones=profile.zones || [],label=id=>zones.find(zone=>zone.id===id)?.label || t('Unnamed zone','Strefa bez nazwy');
      const rateRows=zones.map(zone=>[esc(zone.label || t('Unnamed zone','Strefa bez nazwy')),esc(money(zone.energyRate,rate.currency)),esc(money(zone.variableRate,rate.currency)),esc(zone.id === profile.defaultZone ? t('Default outside matching rules','Domyślna poza pasującymi regułami') : '')]);
      const ruleRows=[...(profile.rules || []).map(rule=>[esc(t('Rule','Reguła')),esc(label(rule.zone)),esc(ruleText(rule))]),...(profile.exceptions || []).map(rule=>[esc(t('Exception','Wyjątek')),esc(label(rule.zone)),esc(ruleText(rule))])];
      const dynamic=(profile.dynamic?.intervals || []).map(row=>[esc(`${dateTime(row.from)} – ${dateTime(row.to)}`),esc(money(row.energyRate,rate.currency)),esc(money(row.variableRate,rate.currency))]);
      const fees=Object.entries(feeLabels).filter(([key])=>Object.hasOwn(rate.fixed_monthly || {},key)).map(([key,label])=>[esc(label),`<span data-analysis-monthly="${key}">${esc(money(rate.fixed_monthly[key],rate.currency))}</span>`]);
      if (rate.legacy_combined_monthly != null) fees.push([esc(t('Legacy combined monthly fee','Dawna łączna opłata miesięczna')),esc(money(rate.legacy_combined_monthly,rate.currency))]);
      return `<section class="analysis-rate-version"><h4>${esc(t('Rates effective from','Stawki obowiązujące od'))} ${esc(date(rate.valid_from))}${rate.valid_to ? ' – '+esc(date(rate.valid_to)) : ''}</h4><p>${esc(rate.currency || unknown())} · ${esc(basis(rate.price_basis))} · ${esc(profile.timezone || unknown())} · ${esc(profile.clock?.mode === 'fixed' ? t('Fixed UTC offset','Stałe przesunięcie UTC')+': '+quantity(profile.clock.offsetMinutes,'min',true) : profile.clock?.mode === 'civil' ? t('Civil tariff clock','Czas lokalny taryfy') : unknown())}</p>
        ${table(t('Tariff rates per kWh','Stawki taryfy za kWh'),[t('Zone','Strefa'),rate.rate_semantics === 'legacy_combined' ? t('Combined usage / kWh','Łączna stawka zużycia / kWh') : t('Energy / kWh','Energia / kWh'),t('Distribution / kWh','Dystrybucja / kWh'),t('Application','Stosowanie')],rateRows)}
        ${ruleRows.length ? table(t('Schedules and exceptions','Godziny i wyjątki'),[t('Type','Rodzaj'),t('Zone','Strefa'),t('Calendar rules','Reguły kalendarza')],ruleRows) : ''}
        ${dynamic.length ? table(t('Dynamic rate intervals','Przedziały stawek dynamicznych'),[t('Period','Okres'),t('Energy / kWh','Energia / kWh'),t('Distribution / kWh','Dystrybucja / kWh')],dynamic) : ''}
        ${table(t('Monthly fees · metadata, not another period charge','Opłaty miesięczne · metadane, bez ponownego naliczania'),[t('Component','Składnik'),t('Amount / month','Kwota / miesiąc')],fees)}
        <details><summary>${esc(t('Rate provenance','Pochodzenie stawek'))}</summary><p>${esc(rate.provenance || unknown())}</p><p>${esc(rate.version_id)}</p><p>UTC / ${esc(t('source validity','ważność źródłowa'))}: ${esc(rate.valid_from)} – ${esc(rate.valid_to)}</p></details></section>`;
    }).join('');
    const proof=periodZoneProof(snapshot,periodWindow(snapshot));
    const zoneReady=proof?.status==='ready'&&currencyKnown&&positive(total.usage_cost)&&proof.zones.every(zone=>zone.complete&&positive(zone.usage_cost)&&compare(zone.usage_cost,total.usage_cost)<=0);
    const zoneDetails=proof?zoneEntries(snapshot,snapshot.period_summary,{period:true}):null;
    const zoneGraphic=!data&&zoneReady?`<div class="analysis-rate76-track" aria-hidden="true">${proof.zones.map(zone=>`<span data-analysis-rate76-bar style="background:${zoneColor(zone.version_id,zone.zone_id,snapshot)};width:${width(zone.usage_cost,Number(total.usage_cost))}%" title="${esc(zone.label+': '+money(zone.usage_cost,proof.currency))}"></span>`).join('')}</div>`:'';
    const zoneRows=proof?.zones.map(zone=>{
      const rate=(snapshot.rates || []).find(row=>row.version_id===zone.version_id),complete=proof.status==='ready'&&zone.complete;
      const known=[[t('Known energy cost','Znany koszt energii'),'energy_cost'],[t('Known distribution cost','Znany koszt dystrybucji'),'variable_cost'],[t('Known legacy usage cost','Znany dawny koszt zużycia'),'legacy_combined_cost']].map(([label,key])=>`${label}: ${money(zone.known_costs[key],proof.currency)}`).join(' · ');
      return `<li data-analysis-rate76-zone="${esc(zone.version_id+'|'+zone.zone_id)}"><span class="analysis-rate76-swatch" style="background:${zoneColor(zone.version_id,zone.zone_id,snapshot)}" aria-hidden="true"></span><div><strong>${esc(zone.label)}</strong><span class="analysis-rate76-meta"> · ${esc(t('Rates from','Stawki od'))} ${esc(rate?date(rate.valid_from):unknown())}</span><p>${esc(complete?quantity(zone.kwh):t('Recorded','Zarejestrowano')+': '+quantity(zone.recorded_kwh))} · <strong>${esc(money(complete?zone.usage_cost:null,proof.currency))}</strong></p>${!complete?`<p class="analysis-rate76-meta">${esc(known)}</p>`:''}</div></li>`;
    }).join('') || '';
    const level=['areas','floors','devices'].includes(options.level)?options.level:'areas';
    const groupRows=rowsFor(groups,level).sort((a,b)=>valid(a.row.usage_cost)&&valid(b.row.usage_cost)?compare(b.row.usage_cost,a.row.usage_cost):valid(a.row.usage_cost)?-1:valid(b.row.usage_cost)?1:0);
    const groupCurrency=currencyKnown&&groups.currency===total.currency&&groups.price_basis===total.price_basis;
    const groupMax=maximum(groupRows.filter(({row})=>positive(row.usage_cost)).map(({row})=>row.usage_cost));
    const groupTitle=level==='devices'?t('Cost by device','Koszt według urządzeń'):level==='floors'?t('Cost by floor','Koszt według pięter'):t('Cost by room','Koszt według pokoi');
    const ranked=groupRows.map(({id,label,row})=>`<li data-analysis-rate76-group="${esc(id)}"${id==='unmeasured'?' class="analysis-rate76-unmeasured"':''}><div class="analysis-rate76-rank-value"><strong>${esc(label)}</strong><strong>${esc(money(row.usage_cost,groups.currency))}</strong></div>${!data&&groupCurrency&&row.measurement_complete===true&&positive(row.usage_cost)?`<div class="analysis-rate76-track" aria-hidden="true"><span data-analysis-rate76-bar style="background:${zoneColor('group-'+level,id)};width:${width(row.usage_cost,groupMax)}%"></span></div>`:''}<p class="analysis-rate76-meta">${esc(data?quantity(row.kwh):briefEnergy(row.kwh))} · ${esc(coverage(row.coverage))}</p></li>`).join('');
    const groupValues=table(t('Group measurements and usage costs','Pomiary grup i koszty zużycia'),[t('Group','Grupa'),'kWh',t('Usage cost','Koszt zużycia')],groupRows.map(({label,row})=>[esc(label),esc(quantity(row.kwh)),esc(money(row.usage_cost,groups.currency))]));
    const alternativeRows=(snapshot.alternatives || []).filter(row=>row.tariff_id!==snapshot.active_tariff_id);
    const comparable=row=>row.comparable===true&&currencyKnown&&row.currency===total.currency&&row.price_basis===total.price_basis;
    const alternatives=alternativeRows.map(row=>[esc(row.tariff_name || t('Unnamed tariff','Taryfa bez nazwy')),esc(quantity(row.kwh)),esc(money(row.total_cost,row.currency)),esc(comparable(row)?money(row.delta_cost,row.currency,true):unknown())]);
    const costTable=table(t('Household cost for selected period','Koszt gospodarstwa za wybrany okres'),[t('Component','Składnik'),t('Cost','Koszt')],Object.entries(costLabels).map(([key,label])=>[esc(label),esc(money(total[key],total.currency))]),'data-analysis-cost-components class="analysis-rate76-table"');
    return `<section class="analysis-rate76" data-analysis-rates><div class="analysis-rate76-heading"><h3>${esc(t('Rates and costs','Stawki i koszty'))}</h3><div class="analysis-switch">${button('view','chart',t('Chart','Wykres'),!data)}${button('view','data',t('Data','Dane'),data)}</div></div>
      <div class="analysis-rate76-current" data-analysis-rate76-current>${visibleRates || `<p>${esc(unknown())}</p>`}</div>
      <div class="analysis-rate76-layout"><div><section class="analysis-rate76-card" data-analysis-rate76-cost><h4>${esc(t('Household cost for selected period','Koszt gospodarstwa za wybrany okres'))}</h4><p><strong>${esc(money(total.total_cost,total.currency))}</strong> · ${esc(t('Effective price','Cena efektywna'))}: ${esc(money(total.effective_price,total.currency))}${valid(total.effective_price)?'/kWh':''}</p>
        ${costGraphic}<ul class="analysis-rate76-legend">${componentLegend}</ul>
        ${!costReady?`<p class="analysis-rate76-meta">${esc(t('A complete positive cost breakdown is unavailable. Available amounts retain their signs.','Pełne dodatnie rozbicie kosztu jest niedostępne. Dostępne kwoty zachowują swój znak.'))}</p>`:compare(total.total_cost,'0')===0?`<p class="analysis-rate76-meta">${esc(t('Zero cost','Koszt zerowy'))}</p>`:''}
        ${data?costTable:`<details class="analysis-rate76-history"><summary>${esc(t('Exact cost components','Dokładne składniki kosztu'))}</summary>${costTable}</details>`}
        ${snapshot.fees?.components?`<details class="analysis-rate76-history" data-analysis-fee-details><summary>${esc(t('Fixed fee components for period','Składniki opłat stałych za okres'))}</summary>${table(t('Fixed fee components for period','Składniki opłat stałych za okres'),[t('Component','Składnik'),t('Cost','Koszt')],Object.entries(snapshot.fees.components).map(([key,value])=>[esc(feeLabels[key]||t('Legacy combined fee','Dawna opłata łączna')),esc(money(value,total.currency))]))}</details>`:''}</section>
      <section class="analysis-rate76-card" data-analysis-rate76-zones><h4>${esc(t('Cost by tariff zone','Koszt według stref taryfy'))}</h4><p class="analysis-rate76-meta">${esc(t('Whole selected period · usage cost without fixed fees','Cały wybrany okres · koszt zużycia bez opłat stałych'))}</p>${zoneGraphic}
        ${proof?`<ul class="analysis-rate76-zone-list">${zoneRows}</ul>${proof.status!=='ready'?`<p class="analysis-rate76-meta">${esc(proof.status==='partial'?t('Incomplete period · recorded energy and known costs only','Niepełny okres · tylko zarejestrowana energia i znane koszty'):t('No tariff cost data for this period','Brak kosztów taryfy za ten okres'))}</p>`:''}`:`<p>${esc(t('No data: matching whole-period zone costs are unavailable.','Brak danych: brak zgodnych kosztów stref za cały okres.'))}</p>`}
        ${zoneDetails?`<details class="analysis-rate76-history"><summary>${esc(t('Zone coverage and provenance','Pokrycie i pochodzenie stref'))}</summary><p>${esc(zoneDetails.note)}</p><ul>${zoneDetails.entries.map(entry=>`<li>${esc(entry.text)}</li>`).join('')}</ul></details>`:''}</section></div>
      <section class="analysis-rate76-card" data-analysis-rate76-groups><h4>${esc(groupTitle)}</h4><p class="analysis-rate76-meta">${esc(groups.currency || unknown())} · ${esc(basis(groups.price_basis))}</p><ol class="analysis-rate76-rank-list">${ranked}</ol>${data?'':`<details data-analysis-rate76-group-values><summary>${esc(t('Group measurements and costs','Pomiary i koszty grup'))}</summary>${groupValues}</details>`}${!groupRows.length?`<p>${esc(unknown())}</p>`:''}<p class="analysis-rate76-meta">${esc(t('Group costs exclude household fixed fees. No room and unmeasured energy are separate. Bars rank known nonnegative costs in the same currency and basis.','Koszty grup nie obejmują opłat stałych gospodarstwa. Bez pokoju i Niezmierzone to osobne pozycje. Paski porównują znane nieujemne koszty w tej samej walucie i podstawie.'))}</p></section></div>
      <section><h4>${esc(t('Same measured energy in alternative tariffs · no activation','Ta sama zmierzona energia w innych taryfach · bez aktywacji'))}</h4><div class="analysis-rate76-alternatives">${alternativeRows.map(row=>`<article class="analysis-rate76-card" data-analysis-rate76-alternative><strong>${esc(row.tariff_name || t('Unnamed tariff','Taryfa bez nazwy'))}</strong><p>${esc(quantity(row.kwh))} · <strong>${esc(money(row.total_cost,row.currency))}</strong> · ${esc(basis(row.price_basis))}</p><p>${esc(comparable(row)?t('Difference','Różnica')+': '+money(row.delta_cost,row.currency,true):t('No comparable difference','Brak porównywalnej różnicy'))}</p><p class="analysis-rate76-meta">${esc(t('Same measured energy · no activation','Ta sama zmierzona energia · bez aktywacji'))}</p></article>`).join('') || `<p>${esc(t('No alternative tariff comparison available','Brak porównania alternatywnej taryfy'))}</p>`}</div>
      ${alternativeRows.length?`<details class="analysis-rate76-history"><summary>${esc(t('Alternative tariff values','Wartości alternatywnych taryf'))}</summary>${table(t('Same measured energy in alternative tariffs · no activation','Ta sama zmierzona energia w innych taryfach · bez aktywacji'),[t('Tariff','Taryfa'),'kWh',t('Total cost','Koszt całkowity'),t('Delta','Różnica')],alternatives)}</details>`:''}</section>
      <details class="analysis-rate76-history" data-analysis-rate-history><summary>${esc(t('Rates, schedules and history','Stawki, godziny i historia'))}</summary>${versions || `<p>${esc(unknown())}</p>`}</details>
      <p class="analysis-rate76-meta">${esc(t('Fixed fees apply once to the household period. Alternatives use the same measurements.','Opłaty stałe dotyczą jednokrotnie całego okresu gospodarstwa. Alternatywy korzystają z tych samych pomiarów.'))}</p></section>`;
  };
  const comparisonView = (snapshot,options,kind) => {
    const comparison=snapshot.comparisons?.[kind] || {}, ready=comparison.status === 'ready', costs=comparison.costs || {}, currency=costs.current?.currency || snapshot.totals?.currency, baselineCurrency=costs.baseline?.currency;
    const groups=comparison.groups || {}, rows=rowsFor(groups,options.level,snapshot.groups), max=maximum(rows.map(({row})=>row.delta_kwh));
    const signedValue=row=>row.status === 'ready' ? quantity(row.delta_kwh,'kWh',true) : unknown();
    return `<section><h3>${esc(t('Period comparison','Porównanie okresów'))}</h3><p>${esc(comparisons[kind])} · ${esc(ready ? comparison.comparison_scope === 'common_measurements' ? t('Common measurements only','Tylko wspólne pomiary') : t('Calendar totals','Sumy kalendarzowe') : unknown())}</p>
      ${chart(snapshot,options)}
      ${table(t('Household comparison','Porównanie gospodarstwa'),[t('Measurement','Pomiar'),t('Current','Bieżący'),t('Baseline','Odniesienie'),t('Delta','Różnica')],[
        [esc(t('Energy','Energia')),esc(quantity(comparison.current_kwh)),esc(quantity(comparison.baseline_kwh)),esc(ready ? quantity(comparison.delta_kwh,'kWh',true) : unknown())],
        [esc(t('Percentage change','Zmiana procentowa')),'','',esc(ready ? quantity(comparison.percent,'%',true) : unknown())],
        [esc(t('Usage cost without fixed fees','Koszt zużycia bez opłat stałych')),esc(money(costs.current?.usage_cost,currency)),esc(money(costs.baseline?.usage_cost,baselineCurrency)),esc(costs.status === 'ready' ? money(costs.delta_cost,currency,true) : unknown())],
        [esc(t('Household total cost','Całkowity koszt gospodarstwa')),esc(money(costs.current?.total_cost,currency)),esc(money(costs.baseline?.total_cost,baselineCurrency)),esc(costs.status === 'ready' ? money(costs.delta_total_cost,currency,true) : unknown())],
        [esc(t('Coverage','Pokrycie')),esc(coverage(comparison.coverage?.current)),esc(comparison.coverage?.baseline != null ? coverage(comparison.coverage.baseline) : (comparison.coverage?.baselines || []).map(coverage).join(' · ') || unknown()),'']
      ])}
      ${(comparison.baseline_periods||[]).length?`${options.view==='data'?'':`<details data-analysis-baseline-period-details><summary>${esc(t('Comparison dates','Daty porównania'))}</summary>`}${(comparison.baseline_periods||[]).map(period=>`<p>${esc(t('Baseline period','Okres odniesienia'))}: ${esc(range(period))}</p>`).join('')}${options.view==='data'?'':'</details>'}`:''}
      <section data-analysis-comparison-groups><h4>${esc(t('Change by group','Zmiana według grup'))}</h4>
      ${options.view === 'data' ? '' : `<ul class="analysis-deltas">${rows.map(({id,label,row})=>`<li class="${id === 'unmeasured' ? 'analysis-unmeasured' : ''}"><div>${esc(label)} <strong>${esc(signedValue(row))}</strong></div><div class="analysis-delta-track" aria-hidden="true"><span class="${String(row.delta_kwh).startsWith('-') ? 'analysis-decrease' : 'analysis-increase'}" style="width:${width(row.status === 'ready' ? row.delta_kwh : null,max)/2}%"></span></div></li>`).join('')}</ul>`}
      ${options.view==='data'?'':`<details data-analysis-comparison-details><summary>${esc(t('Group comparison values','Wartości porównania grup'))}</summary>`}${table(t('Group comparison · server deltas','Porównanie grup · różnice z serwera'),[t('Group','Grupa'),t('Energy delta','Różnica energii'),t('Usage cost delta','Różnica kosztu zużycia'),t('Change','Zmiana'),t('Current coverage','Pokrycie bieżące'),t('Baseline coverage','Pokrycie odniesienia')],rows.map(({label,row})=>[esc(label),esc(signedValue(row)),esc(row.status === 'ready' ? money(row.delta_usage_cost,groups.currency,true) : unknown()),esc(row.status === 'ready' ? quantity(row.percent,'%',true) : unknown()),esc(coverage(row.coverage?.current)),esc(row.coverage?.baseline != null ? coverage(row.coverage.baseline) : (row.coverage?.baselines || []).map(coverage).join(' · ') || unknown())]))}
      <p class="analysis-note">${esc(t('Group coverage and calendar masks may differ from household coverage. Unknown deltas are not zero.','Pokrycie i maski kalendarzowe grup mogą różnić się od pokrycia gospodarstwa. Nieznana różnica nie oznacza zera.'))}</p>${options.view==='data'?'':'</details>'}</section></section>`;
  };
  const markup = (snapshot, options = {}) => {
    const section=['overview','rates','comparison'].includes(options.section) ? options.section : 'overview';
    const level=['areas','floors','devices'].includes(options.level) ? options.level : 'areas';
    options={...options,level};
    if (!snapshot || snapshot.schema !== 2) return `<div class="energy-analysis-v53"><p role="status">${esc(unknown())}</p></div>`;
    const period=snapshot.period || {},allowed=period.kind === 'day' ? ['previous','same_weekday','mean7'] : ['previous','year_ago'];
    const requested=options.comparison || snapshot.context?.comparison_kind,kind=allowed.includes(requested) ? requested : 'previous';
    const anchor=/^\d{4}-\d{2}-\d{2}$/.test(options.anchor || '') ? options.anchor : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.context?.period_anchor || '') ? snapshot.context.period_anchor : '';
    const filters=`<div class="analysis-controls" data-analysis-filters>
      ${select('level',t('Group by','Grupuj według'),[['areas',t('Rooms','Pokoje')],...(snapshot.groups?.floor_supported===true?[['floors',t('Floors','Piętra')]]:[]),['devices',t('Devices','Urządzenia')]],level)}
      <details data-analysis-calendar-options><summary>${esc(t('Date and comparison','Data i porównanie'))}</summary><div class="analysis-calendar-fields">
      <label>${esc(t('Calendar date','Data kalendarzowa'))}<input type="date" data-analysis-action="anchor" data-analysis-value="${esc(anchor)}" value="${esc(anchor)}"></label>
      ${select('comparison',t('Compare with','Porównaj z'),allowed.map(key=>[key,comparisons[key]]),kind)}</div></details></div>`;
    return `<div class="energy-analysis-v53"><div class="analysis-period-controls"><div class="analysis-switch" role="group" aria-label="${esc(t('Period','Okres'))}">${periods.map(([value,label])=>button('period',value,label,period.kind===value)).join('')}</div><p class="analysis-period">${esc(range(period))} · ${esc(ui.timeZone)} · ${esc(coverage(snapshot.coverage))}</p></div>
      ${section==='overview'?tiles(snapshot,true)+nativeDetails(snapshot):''}${section==='rates'?filters+ratesView(snapshot,options):section==='comparison'?comparisonView(snapshot,options,kind)+filters:chart(snapshot,options)+filters+groupsView(snapshot,level,options)}
      <details data-analysis-source-details><summary>${esc(t('Source and time details','Źródło i szczegóły czasu'))}</summary><p>${esc(t('Measurement calendar','Kalendarz pomiarów'))}: ${esc(period.timezone||unknown())}</p><p>UTC: ${esc(period.start)} – ${esc(period.end)}</p></details></div>`;
  };
  const styles = () => `

.energy-analysis-v53 .analysis-rate76{font-size:14px;line-height:1.45;min-width:0;--analysis-rate76-energy:#287fd1;--analysis-rate76-distribution:#8754b3;--analysis-rate76-fixed:#64748b;--analysis-rate76-legacy:#238782}
.energy-analysis-v53 .analysis-rate76-meta{font-size:12px;color:var(--secondary-text-color);overflow-wrap:anywhere}
.energy-analysis-v53 .analysis-rate76-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.energy-analysis-v53 .analysis-rate76-card{min-width:0;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);padding:12px;overflow-wrap:anywhere}
.energy-analysis-v53 .analysis-rate76-card h4{margin-top:0}
.energy-analysis-v53 .analysis-rate76-current{display:grid;gap:12px}
.energy-analysis-v53 .analysis-rate76-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
.energy-analysis-v53 .analysis-rate76-layout>div{min-width:0}
.energy-analysis-v53 .analysis-rate76-rate-list,.energy-analysis-v53 .analysis-rate76-monthly,.energy-analysis-v53 .analysis-rate76-legend,.energy-analysis-v53 .analysis-rate76-zone-list,.energy-analysis-v53 .analysis-rate76-rank-list{list-style:none;padding:0;margin:8px 0}
.energy-analysis-v53 .analysis-rate76-rate-list>li{display:grid;grid-template-columns:minmax(80px,.6fr) minmax(0,1.2fr) minmax(0,1.2fr);gap:12px;align-items:start;padding:10px 0;border-top:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-rate76-schedule p{margin:0 0 4px}
.energy-analysis-v53 .analysis-rate76-rate-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-rate76-rate-values dt{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-rate76-rate-values dd{font-weight:600;margin:4px 0 0}
.energy-analysis-v53 .analysis-rate76-monthly{display:flex;flex-wrap:wrap;gap:8px 16px}
.energy-analysis-v53 .analysis-rate76-track{display:flex;height:14px;min-width:0;max-width:100%;background:var(--secondary-background-color);border-radius:4px;overflow:hidden;margin:10px 0}
.energy-analysis-v53 .analysis-rate76-track>span{display:block;min-width:0;height:100%;flex-shrink:0}
.energy-analysis-v53 .analysis-rate76-energy_cost{background:var(--analysis-rate76-energy)}
.energy-analysis-v53 .analysis-rate76-variable_cost{background:var(--analysis-rate76-distribution)}
.energy-analysis-v53 .analysis-rate76-fixed_cost{background:var(--analysis-rate76-fixed)}
.energy-analysis-v53 .analysis-rate76-legacy_combined_cost{background:var(--analysis-rate76-legacy)}
.energy-analysis-v53 .analysis-rate76-legend{display:flex;flex-wrap:wrap;gap:8px 16px}
.energy-analysis-v53 .analysis-rate76-legend>li,.energy-analysis-v53 .analysis-rate76-zone-list>li{display:flex;align-items:baseline;gap:6px;min-width:0}
.energy-analysis-v53 .analysis-rate76-zone-list>li{padding:8px 0;border-bottom:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-rate76-swatch{display:inline-block;width:10px;height:10px;flex:0 0 10px;border-radius:2px}
.energy-analysis-v53 .analysis-rate76-rank-list>li{padding:10px 0;border-bottom:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-rate76-rank-value{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-rate76-unmeasured .analysis-rate76-track>span{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--secondary-text-color) 3px,var(--secondary-text-color) 4px)!important;border:1px solid var(--secondary-text-color)}
.energy-analysis-v53 .analysis-rate76-alternatives{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.energy-analysis-v53 .analysis-rate76-history{border-top:1px solid var(--divider-color);margin-top:12px}
.energy-analysis-v53 .analysis-rate76-history .analysis-table-wrap{overflow:visible}
.energy-analysis-v53 .analysis-rate76-history table,.energy-analysis-v53 .analysis-rate76-table{table-layout:fixed;width:100%;overflow-wrap:anywhere}
:host(.bento-dark) .energy-analysis-v53 .analysis-rate76{--analysis-rate76-energy:#3987e5;--analysis-rate76-distribution:#a696ea;--analysis-rate76-fixed:#94a3b8;--analysis-rate76-legacy:#41a69f}
@container energy-analysis (max-width:600px){.energy-analysis-v53 .analysis-rate76-layout{grid-template-columns:minmax(0,1fr);gap:0}.energy-analysis-v53 .analysis-rate76-rate-list>li{grid-template-columns:minmax(0,1fr);gap:6px}.energy-analysis-v53 .analysis-rate76-card{padding:10px}.energy-analysis-v53 .analysis-rate76-rate-values{gap:8px}.energy-analysis-v53 .analysis-rate76-history th,.energy-analysis-v53 .analysis-rate76-history td{padding:8px 4px}}
.energy-analysis-v53{font-family:var(--paper-font-body1_-_font-family,inherit);font-size:14px;line-height:1.45;color:var(--primary-text-color);min-width:0;max-width:100%;width:100%;overflow-wrap:anywhere;container-type:inline-size;container-name:energy-analysis}
.energy-analysis-v53 *{box-sizing:border-box}
.energy-analysis-v53 h3,.energy-analysis-v53 h4{font-size:1em;margin:12px 0 8px}
.energy-analysis-v53 p{margin:8px 0}
.energy-analysis-v53 section{min-width:0;margin-block:12px}
.energy-analysis-v53 .analysis-switch,.energy-analysis-v53 .analysis-section-title,.energy-analysis-v53 .analysis-period-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.energy-analysis-v53 .analysis-period-controls{justify-content:space-between}
.energy-analysis-v53 .analysis-period{font-size:12px;color:var(--secondary-text-color);margin:4px 0}
.energy-analysis-v53 .analysis-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:12px;align-items:end;margin-block:16px}
.energy-analysis-v53 .analysis-section-title{justify-content:space-between}
.energy-analysis-v53 .analysis-calendar-fields{display:grid;gap:12px;padding-block:8px}
.energy-analysis-v53 [data-analysis-calendar-options]{margin:0;min-width:0}
.energy-analysis-v53 [data-analysis-calendar-options] summary{min-height:44px}
.energy-analysis-v53 label{display:flex;flex-direction:column;gap:4px;max-width:100%;min-width:0;font-size:12px}
.energy-analysis-v53 .analysis-controls select,.energy-analysis-v53 .analysis-controls input{width:100%;min-width:0;font-size:14px}
.energy-analysis-v53 button,.energy-analysis-v53 select,.energy-analysis-v53 input{font:inherit;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;min-height:44px;min-width:44px;padding:8px;max-width:100%}
.energy-analysis-v53 button{cursor:pointer;white-space:normal}
.energy-analysis-v53 button[aria-pressed="true"]{border-color:var(--primary-color);box-shadow:inset 0 0 0 1px var(--primary-color)}
.energy-analysis-v53 button:focus-visible,.energy-analysis-v53 select:focus-visible,.energy-analysis-v53 input:focus-visible,.energy-analysis-v53 summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
.energy-analysis-v53 summary{min-height:44px;padding:12px 0;cursor:pointer}
.energy-analysis-v53 .analysis-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
.energy-analysis-v53 .analysis-tile{min-width:0;border:1px solid var(--divider-color);border-radius:10px;padding:10px 12px;background:var(--card-background-color);box-shadow:none}
.energy-analysis-v53 .analysis-tile span,.energy-analysis-v53 .analysis-tile strong{display:block}
.energy-analysis-v53 .analysis-tile span{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-tile strong{font-size:1.35em;margin-top:4px;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-period-zones{list-style:none;margin:8px 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px}
.energy-analysis-v53 .analysis-period-zones li{min-width:0;display:grid;gap:4px;padding:8px 10px;border:1px solid var(--divider-color);border-radius:8px}
.energy-analysis-v53 .analysis-period-zones li>span:last-child{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 [data-analysis-period-summary-details]{border-top:1px solid var(--divider-color);margin-top:8px}
.energy-analysis-v53 .analysis-note{color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-table-wrap{overflow:auto;max-width:100%}
.energy-analysis-v53 table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;text-align:start}
.energy-analysis-v53 caption{text-align:start;font-weight:600;padding:8px 0}
.energy-analysis-v53 th,.energy-analysis-v53 td{padding:10px 8px;border-bottom:1px solid var(--divider-color);vertical-align:top;text-align:start}
.energy-analysis-v53 th{font-weight:600}
.energy-analysis-v53 .analysis-chart-scroll{min-width:0;max-width:100%;width:100%;overflow:visible;padding:4px 2px}
.energy-analysis-v53 .analysis-chart{display:grid;grid-template-columns:repeat(var(--analysis-point-count),minmax(0,1fr));align-items:stretch;height:212px;min-width:0;max-width:100%;width:100%;gap:2px}
.energy-analysis-v53 .analysis-point{position:relative;display:flex;align-items:flex-end;justify-content:center;min-width:0;max-width:100%;width:100%;height:212px;padding:0 0 40px;border:0;border-radius:0;background:transparent;touch-action:manipulation}
.energy-analysis-v53 .analysis-point:focus-visible{outline-offset:0;z-index:1}
.energy-analysis-v53 .analysis-point[aria-pressed="true"]{box-shadow:inset 0 0 0 1px var(--primary-color)}
.energy-analysis-v53 .analysis-column{display:block;width:100%;max-height:168px;background:var(--energy-grid-consumption-color,#287fd1);border-radius:3px 3px 0 0;min-height:1px}
.energy-analysis-v53 .analysis-baseline-line{display:block;position:absolute;inset-inline:0;height:0;border-top:3px dashed #8754b3;pointer-events:none}\n.energy-analysis-v53 [data-analysis-series-legend] .analysis-series-current:before{content:"● ";color:var(--secondary-text-color,#718096)}\n.energy-analysis-v53 [data-analysis-series-legend] .analysis-series-baseline:before{content:"━ ";color:#8754b3}\n.energy-analysis-v53 [data-analysis-baseline-range]{display:inline-block}\n.energy-analysis-v53 .analysis-point-label{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);width:max-content;font-size:12px;line-height:1.2}
.energy-analysis-v53 .analysis-point:first-child .analysis-point-label{left:0;transform:none}
.energy-analysis-v53 .analysis-point:last-child .analysis-point-label{left:auto;right:0;transform:none}
.energy-analysis-v53 .analysis-missing{background:repeating-linear-gradient(135deg,transparent,transparent 5px,var(--divider-color) 5px,var(--divider-color) 6px)}
.energy-analysis-v53 .analysis-flow{display:grid;grid-template-columns:minmax(120px,.3fr) minmax(0,1fr);gap:16px;align-items:start}
.energy-analysis-v53 .analysis-flow-source{display:flex;flex-direction:column;gap:4px;padding:12px;border-inline-start:4px solid var(--energy-grid-consumption-color,#287fd1);background:var(--secondary-background-color);border-radius:8px;min-width:0}
.energy-analysis-v53 .analysis-flow-source>span:first-child{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-flow-destination{min-width:0}
.energy-analysis-v53 .analysis-flow-destination h4{margin-top:0}
.energy-analysis-v53 [data-analysis-group-details],.energy-analysis-v53 [data-analysis-rate-history],.energy-analysis-v53 [data-analysis-fee-details],.energy-analysis-v53 [data-analysis-source-details]{border-top:1px solid var(--divider-color);margin-top:12px}
.energy-analysis-v53 .analysis-ranking,.energy-analysis-v53 .analysis-deltas{list-style:none;margin:0;padding:0}
.energy-analysis-v53 .analysis-ranking li,.energy-analysis-v53 .analysis-deltas li{padding:8px 0;border-bottom:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-ranking li>div:first-child,.energy-analysis-v53 .analysis-deltas li>div:first-child{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
.energy-analysis-v53 .analysis-track,.energy-analysis-v53 .analysis-delta-track{height:8px;background:var(--secondary-background-color);border-radius:3px;margin-top:6px;position:relative}
.energy-analysis-v53 .analysis-rank{display:block;height:100%;background:var(--energy-device-consumption-color,#df6635)}
.energy-analysis-v53 .rank-0{background:var(--analysis-rank-0,#eb6834)}.energy-analysis-v53 .rank-1{background:var(--analysis-rank-1,#6250d6)}.energy-analysis-v53 .rank-2{background:var(--analysis-rank-2,#e87ba4)}.energy-analysis-v53 .rank-3{background:var(--analysis-rank-3,#eda100)}.energy-analysis-v53 .rank-4{background:var(--analysis-rank-4,#718096)}
:host(.bento-dark) .energy-analysis-v53 .rank-0{background:#d95926}:host(.bento-dark) .energy-analysis-v53 .rank-1{background:#9085e9}:host(.bento-dark) .energy-analysis-v53 .rank-2{background:#d55181}:host(.bento-dark) .energy-analysis-v53 .rank-3{background:#c98500}
.energy-analysis-v53 .analysis-unmeasured .analysis-rank{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--secondary-text-color) 3px,var(--secondary-text-color) 4px);border:1px solid var(--secondary-text-color)}
.energy-analysis-v53 .analysis-delta-track:before{content:'';position:absolute;left:50%;height:100%;border-left:1px solid var(--secondary-text-color)}
.energy-analysis-v53 .analysis-decrease{position:absolute;right:50%;height:100%;background:#287fd1}
.energy-analysis-v53 .analysis-increase{position:absolute;left:50%;height:100%;background:#cf4040}

.energy-analysis-v53{--analysis-zone-cheap:#1baf7a;--analysis-zone-expensive:#2a78d6;--analysis-rank-0:#eb6834;--analysis-rank-1:#6250d6;--analysis-rank-2:#e87ba4;--analysis-rank-3:#eda100;--analysis-rank-4:#718096}
:host(.bento-dark) .energy-analysis-v53{--analysis-zone-cheap:#199e70;--analysis-zone-expensive:#3987e5;--analysis-rank-0:#d95926;--analysis-rank-1:#9085e9;--analysis-rank-2:#d55181;--analysis-rank-3:#c98500}
.energy-analysis-v53 .analysis-group-summary{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:20px;align-items:start}
.energy-analysis-v53 .analysis-group-summary>div{min-width:0}
.energy-analysis-v53 .analysis-sankey-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);align-items:center;gap:12px}
.energy-analysis-v53 .analysis-sankey{display:block;width:100%;height:250px;color:var(--primary-text-color)}
.energy-analysis-v53 [data-analysis-flow-side]>path{stroke:var(--primary-text-color);stroke-width:.3}
.energy-analysis-v53 .analysis-household{text-align:center;font-weight:600}
.energy-analysis-v53 .analysis-flow-labels{list-style:none;padding:0;margin:0;min-width:0;display:grid;gap:12px}
.energy-analysis-v53 .analysis-flow-labels li{min-width:0;display:flex;align-items:baseline;gap:6px}
.energy-analysis-v53 .analysis-flow-swatch{display:inline-block;flex:none;width:12px;height:12px;margin-inline-end:5px;border:1px solid var(--primary-text-color);border-radius:2px;vertical-align:baseline}
.energy-analysis-v53 .analysis-composition{display:flex;height:16px;max-width:100%;border:1px solid var(--primary-text-color);border-radius:4px;overflow:hidden}
.energy-analysis-v53 .analysis-composition>span{height:100%;min-width:0;border-inline-end:1px solid var(--primary-text-color)}
.energy-analysis-v53 .analysis-hatched{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--primary-text-color) 3px,var(--primary-text-color) 4px)}
.energy-analysis-v53 .analysis-zone-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px}
.energy-analysis-v53 .analysis-mobile-composition{display:none}
@container energy-analysis (max-width:600px){.energy-analysis-v53 .analysis-group-summary{grid-template-columns:minmax(0,1fr);gap:8px}.energy-analysis-v53 .analysis-sankey{display:none}.energy-analysis-v53 .analysis-sankey-wrap{display:none}.energy-analysis-v53 .analysis-mobile-composition{display:block}.energy-analysis-v53 .analysis-flow-labels{display:flex;flex-wrap:wrap;gap:6px 12px;margin-block:8px}}
@container energy-analysis (max-width:480px){.energy-analysis-v53 [data-analysis-axis-minor]{visibility:hidden}.energy-analysis-v53 .analysis-flow{grid-template-columns:minmax(0,1fr);gap:12px}.energy-analysis-v53 .analysis-flow-source{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:6px 12px}.energy-analysis-v53 .analysis-period-controls{align-items:flex-start}.energy-analysis-v53 th,.energy-analysis-v53 td{padding:8px 4px}.energy-analysis-v53 .analysis-switch{gap:4px}}
@container energy-analysis (max-width:360px){.energy-analysis-v53 .analysis-controls{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.energy-analysis-v53 .analysis-controls>label:last-child{grid-column:1/-1}.energy-analysis-v53 .analysis-chart{gap:1px}.energy-analysis-v53 .analysis-tile{padding:10px}.energy-analysis-v53 .analysis-ranking li>div:first-child{display:grid;gap:2px}.energy-analysis-v53 .analysis-tile strong{font-size:1.2em}}
/* Mobile keeps two primary readings and a compact secondary pair. No values are hidden. */
@container energy-analysis (max-width:480px){.energy-analysis-v53 .analysis-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.energy-analysis-v53 .analysis-tile-secondary{padding:6px 10px;border:0;border-radius:0;background:transparent}.energy-analysis-v53 .analysis-tile-secondary strong{font-size:14px;margin-top:2px}.energy-analysis-v53 .analysis-tile-secondary span{font-size:12px}}
`;
  return {markup,styles};
}
if (typeof module !== 'undefined') module.exports = {createEnergyAnalysisViewV53};
