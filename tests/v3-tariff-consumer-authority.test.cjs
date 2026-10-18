const {isolateLegacyAnalysis}=require('./helpers/legacy-analysis-fixture.cjs');
// Breaks caught: missing consumer lifecycle/context fences, stale Recorder callbacks,
// unnecessary Recorder refetch on tariff readback, and lost local configured rates.
'use strict';
const { energyBackend, drainBackend, mountForPricing, isEnergyRequest } = require('./helpers/energy-backend-fixture.cjs');

const {test}=require('node:test');const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {join}=require('node:path');const {JSDOM}=require('jsdom');
const types=['ha-energy-optimizer','ha-energy-insights','ha-energy-email'];
const profile={schema:1,name:'Fixture',currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'a',zones:[{id:'a',energyRate:2,variableRate:0}]};
const flush=drainBackend;
function setup(type){const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});dom.window.eval(readFileSync(join(__dirname,'..','ha-energy-optimizer.js'),'utf8'));const card=dom.window.document.createElement(type);isolateLegacyAnalysis(card);const connection=new dom.window.EventTarget();connection.connected=true;card._hass={user:{id:'u',is_admin:true,is_owner:false,is_active:true,groups:[],group_ids:[]},connection,config:{time_zone:'UTC',currency:'EUR'},states:{},callWS:async()=>({profile,revision:4,updated_at:null})};card._config={...card._config,tariff_profile:profile};card._schedule=()=>{};const host=card._getTariffHostV3();return{dom,card,connection,host,close(){card._tariffConsumerUnsubscribeV3?.();host.guard.dispose();dom.window.close();}};}
for(const type of types){
 test(`${type} observes typed connection and browser edges before mount`,()=>{const f=setup(type);try{for(const [target,event] of [[f.connection,'disconnected'],[f.connection,'ready'],[f.connection,'reconnect-error'],[f.dom.window,'offline'],[f.dom.window,'online']]){f.card._tariffEditorState={draft:{name:'PRIVATE'}};f.card._sharedTariffProfile=profile;const old=f.host.guard.snapshot();target.dispatchEvent(new f.dom.window.Event(event));assert.equal(f.card._tariffEditorState,null);assert.equal(f.card._sharedTariffProfile,null);assert.equal(f.host.guard.current(old),false);}}finally{f.close();}});
 test(`${type} config/range/source changes erase a mounted editor before stale Save`,async()=>{
  const f=setup(type);try{
   f.card._render();
   const details=f.card.shadowRoot.querySelector('[data-tariff-details]');details.open=true;details.dispatchEvent(new f.dom.window.Event('toggle'));
   const backend=energyBackend(f.card,async request=>{throw Error('Unexpected non-pricing operation '+request.type);});
   f.card._hass.callWS=backend;f.host.reset();
   for(const change of [()=>f.card.setConfig({...f.card._config,title:'changed'}),()=>{
    if(type==='ha-energy-optimizer')f.card._patternsState={period:30};
    else if(type==='ha-energy-insights')f.card._activeTab='weekly';else f.card._overviewPeriod='month';
    f.card._observeTariffContextV3();
   },()=>{f.card._tariffSourceIds=['sensor.other'];f.card._observeTariffContextV3();}]){
    f.card._tariffEditorState={draft:{name:'PRIVATE'}};change();assert.equal(f.card._tariffEditorState,null);
   }
   await flush();
   assert.deepEqual(backend.wsCalls.filter(request=>!isEnergyRequest(request)),[], 'context purge cannot write or dispatch measurement reads');
   assert.equal(backend.wsCalls.some(request=>request.type==='ha_tools_email/set_tariff'),false);
  }finally{f.close();}
 });
 test(`${type} same-user permission/config/callWS changes purge old drafts`,()=>{const f=setup(type);try{for(const apply of [h=>h.user.is_admin=false,h=>h.user.is_owner=true,h=>h.user.groups=['x'],h=>h.user.group_ids=['x'],h=>h.user.is_active=false,h=>h.config.currency='PLN',h=>h.callWS=async()=>null]){f.card._tariffEditorState={draft:{name:'PRIVATE'}};apply(f.card._hass);f.card._resetTariffContext(f.card._hass);assert.equal(f.card._tariffEditorState,null);}}finally{f.close();}});
 test(`${type} local configuration validates offline but no backend price is fabricated`,async()=>{
  const f=setup(type);try{
    f.card._hass.callWS=undefined;f.card._hass.connection=undefined;f.card._resetTariffContext(f.card._hass);
    const buckets=[{from:'2026-01-01T12:00Z',to:'2026-01-01T13:00Z',kwh:1}];
    assert.equal(f.card._getTariffV3().valid,true);
    assert.equal(f.card._getTariffV3().rateAt('2026-01-01T12:00Z').available,false);
    assert.equal(f.card._getTariffV3().priceBuckets(buckets).energyCost,null);
    delete f.card._config.tariff_profile;f.card._config.energy_price=0.25;f.card._observeTariffContextV3();
    assert.equal(f.card._getTariffV3().valid,true);
    assert.equal(f.card._getTariffV3().priceBuckets(buckets).energyCost,null);
    f.card._hass.connection={connected:true};
    f.card._hass.callWS=energyBackend(f.card,async req=>{
      if(req.type==='ha_tools_email/get_tariff')return{profile:null,revision:0,updated_at:null};
      throw Error(req.type);
    });
    f.card._resetTariffContext(f.card._hass);
    assert.equal(await f.host.load(true),true,'fresh authority confirms no shared tariff before legacy override pricing');
    f.card._getTariffV3().priceBuckets(buckets);await flush();
    assert.equal(f.card._getTariffV3().priceBuckets(buckets).energyCost,0.25);
  }finally{f.close();}
 });
 test(`${type} disconnect fences pending Recorder without clearing measured snapshots`,async()=>{const f=setup(type);try{let resolve;f.card._hass.callWS=()=>new Promise(r=>resolve=r);const read=f.card._createEnergyReadV3();const pending=read.hass.callWS({type:'energy/get_prefs'});f.card._energyData=[7];f.card.disconnectedCallback();resolve({energy_sources:[{type:'grid',stat_energy_from:'sensor.old'}]});await assert.rejects(pending,e=>e.code==='energy_context_changed');assert.equal(f.card._energyData[0],7);assert.equal(read.current(),false);f.card.connectedCallback();assert.equal(read.current(),false);}finally{f.close();}});
}
for(const type of types)test(`${type} explicit tariff Load reprices settled measurements without Recorder calls`,async()=>{
 const f=setup(type);try{
  const NativeDate=f.dom.window.Date,end=Date.parse('2026-10-12T12:00:00Z');
  f.dom.window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[end]));}static now(){return end;}};
  let rate=2;const api=[];
  f.card._hass.callWS=energyBackend(f.card,async req=>{
   api.push(req.type);
   if(req.type==='ha_tools_email/get_tariff')return{profile:{...profile,zones:[{id:'a',energyRate:rate,variableRate:0}]},revision:8,updated_at:'2026-10-12T00:00:00Z'};
   if(req.type==='energy/get_prefs')return{energy_sources:[{type:'grid',stat_energy_from:'sensor.grid'}]};
   if(req.type==='recorder/get_statistics_metadata')return{'sensor.grid':{has_sum:true,statistics_unit_of_measurement:'kWh',unit_class:'energy'}};
   if(req.type==='recorder/statistics_during_period'){
    const start=Date.parse(req.start_time),finish=Date.parse(req.end_time);
    return{'sensor.grid':Array.from({length:(finish-start)/3600000},(_,i)=>({start:start+i*3600000,change:1}))};
   }
   throw Error(req.type);
  });
  delete f.card._config.tariff_profile;f.host.reset();mountForPricing(f.card);
  if(type==='ha-energy-optimizer')await f.card._fetchEnergyStats();
  else if(type==='ha-energy-insights')await f.card._fetchData();
  else await f.card._fetchAllPeriodStats();
  await flush();
  const measurements=()=>type==='ha-energy-email'?JSON.stringify(f.card._periodCache_day.map(r=>[r.entity_id,r.month])):JSON.stringify((f.card._energyModel||f.card._insightsEnergyModel).hourlyToday);
  const cost=()=>type==='ha-energy-email'?f.card._periodCache_day[0].cost:type==='ha-energy-insights'?f.card._data.monthCost:f.card._calculateTodayCost();
  const rows=measurements(),measured=api.filter(x=>x.startsWith('recorder/')).length;
  assert.equal(cost(),type==='ha-energy-email'?48:type==='ha-energy-insights'?1440:24);
  rate=3;f.card._render();
  const details=f.card.shadowRoot.querySelector('[data-tariff-details]');details.open=true;details.dispatchEvent(new f.dom.window.Event('toggle'));
  const beforeLoads=api.filter(x=>x==='ha_tools_email/get_tariff').length;
  f.card.shadowRoot.querySelector('[data-action="load"]').click();await flush();
  assert.equal(api.filter(x=>x==='ha_tools_email/get_tariff').length,beforeLoads+1,'explicit Load receives a fresh backend acknowledgement');
  assert.equal(api.filter(x=>x.startsWith('recorder/')).length,measured);
  assert.equal(measurements(),rows);
  assert.equal(cost(),type==='ha-energy-email'?72:type==='ha-energy-insights'?2160:36);
  f.dom.window.dispatchEvent(new f.dom.window.Event('offline'));await flush();
  assert.equal(api.filter(x=>x.startsWith('recorder/')).length,measured);assert.equal(cost(),null);
 }finally{f.close();}
});

for(const type of types)test(`${type} unknown mutation survives detach/context reset and automatic host read`,async()=>{const f=setup(type);try{f.card._render();let release,writes=0;f.card._hass.callWS=msg=>msg.type==='ha_tools_email/set_tariff'?(writes++,new Promise(r=>release=r)):Promise.resolve({profile,revision:4,updated_at:'2026-10-12T00:00:00Z'});f.host.reset();await f.host.load(true);f.card._render();let details=f.card.shadowRoot.querySelector('[data-tariff-details]');details.open=true;details.dispatchEvent(new f.dom.window.Event('toggle'));f.card.shadowRoot.querySelector('[data-action="save"]').click();assert.equal(writes,1);f.card.disconnectedCallback();f.card.connectedCallback();release({revision:5});await flush();await f.host.load(true);f.card._render();details=f.card.shadowRoot.querySelector('[data-tariff-details]');details.open=true;details.dispatchEvent(new f.dom.window.Event('toggle'));assert.equal(f.card.shadowRoot.querySelector('[data-action="save"]').disabled,true);f.card.shadowRoot.querySelector('[data-action="save"]').click();await flush();assert.equal(writes,1);f.card.shadowRoot.querySelector('[data-action="load"]').click();await flush();assert.equal(f.card.shadowRoot.querySelector('[data-action="save"]').disabled,false);}finally{f.close();}});
for(const type of types)test(`${type} source/window context mutation fences the next Recorder dispatch`,async()=>{
 const f=setup(type);try{
  let resolve;
  const backend=energyBackend(f.card,req=>new Promise(r=>{resolve=r;}));
  f.card._hass.callWS=backend;
  const read=f.card._createEnergyReadV3();
  const pending=read.hass.callWS({type:'energy/get_prefs'});
  f.card.setConfig({...f.card._config,power_entity:'sensor.other'});
  resolve({energy_sources:[{type:'grid',stat_energy_from:'sensor.stale'}]});
  await assert.rejects(pending,e=>e.code==='energy_context_changed');
  await assert.rejects(read.hass.callWS({type:'recorder/get_statistics_metadata',statistic_ids:['sensor.stale']}),e=>e.code==='energy_context_changed');
  assert.deepEqual(backend.wsCalls.filter(request=>!isEnergyRequest(request)).map(request=>request.type),['energy/get_prefs']);
  assert.equal(backend.wsCalls.filter(request=>request.type.startsWith('recorder/')).length,0,'stale source is never dispatched to Recorder');
  assert.notDeepEqual(f.card._tariffSourceIds,['sensor.stale']);
 }finally{f.close();}
});

for(const type of types)test(`${type} queued repricing never renders after its document closes`,async()=>{const f=setup(type);let renders=0;try{f.card._repriceTariffV3=()=>{renders++;};f.host.guard.invalidate();f.dom.window.close();await flush();assert.equal(renders,0);}finally{f.card._tariffConsumerUnsubscribeV3?.();f.host.guard.dispose();}});


for (const type of types) test(`${type} same-instance reattach reconfirms a shared tariff without refetching Recorder`, async () => {
  const f = setup(type);
  try {
    const NativeDate = f.dom.window.Date, end = Date.parse('2026-10-12T12:00:00Z');
    f.dom.window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [end])); } static now() { return end; } };
    const calls = [];
    f.card._hass.callWS = async req => {
      calls.push(req.type);
      if (req.type === 'ha_tools_email/get_tariff') return { profile, revision: 4, updated_at: null };
      if (req.type === 'energy/get_prefs') return { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }] };
      if (req.type === 'recorder/get_statistics_metadata') return { 'sensor.grid': { has_sum: true, statistics_unit_of_measurement: 'kWh', unit_class: 'energy' } };
      if (req.type === 'recorder/statistics_during_period') {
        const start = Date.parse(req.start_time), finish = Date.parse(req.end_time);
        return { 'sensor.grid': Array.from({ length: (finish-start)/3600000 }, (_, i) => ({ start: start+i*3600000, change: 1 })) };
      }
      throw Error('Unexpected operation: ' + req.type);
    };
    f.card._hass.callWS = energyBackend(f.card, f.card._hass.callWS);
    delete f.card._config.tariff_profile; f.host.reset();
    f.dom.window.document.body.append(f.card);
    if (type === 'ha-energy-optimizer') await f.card._fetchEnergyStats();
    else if (type === 'ha-energy-insights') await f.card._fetchData();
    else await f.card._fetchAllPeriodStats();
    await flush();
    f.card._lastStatsFetch = f.card._lastDataFetch = end;
    const measured = calls.filter(x => x.startsWith('recorder/')).length;
    const before = calls.filter(x => x === 'ha_tools_email/get_tariff').length;
    assert.equal(f.card._tariffCurrency(), 'EUR');
    f.card.remove();
    assert.equal(f.host.snapshot().reason, 'tariff_authority_unavailable');
    f.dom.window.document.body.append(f.card);
    await flush(); await flush();
    assert.equal(calls.filter(x => x === 'ha_tools_email/get_tariff').length, before + 1, 'one bounded read reconfirms the tariff on the remount gesture');
    assert.equal(f.card._tariffCurrency(), 'EUR');
    assert.equal(f.host.snapshot().provenance, 'shared_backend');
    assert.equal(calls.filter(x => x.startsWith('recorder/')).length, measured, 'accepted measured data are reused');
    assert.ok(calls.every(x => !/set_tariff|send|save|import/.test(x)));
  } finally { f.close(); }
});
