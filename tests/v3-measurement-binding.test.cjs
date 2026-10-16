'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {JSDOM}=require('jsdom');
const code=['src/optimizer.js','src/energy-insights.js','src/energy-email.js','src/chart-vendor.js'].map(p=>readFileSync(p,'utf8')).join('');
async function fixture(type, clock){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});
 if(clock){const NativeDate=dom.window.Date;const stamp=Date.parse(clock);dom.window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[stamp]));}static now(){return stamp;}};}
 dom.window.eval(code);
 const card=dom.window.document.createElement(type),calls=[];let release;
 card._schedule=()=>{};card._loadChartJs=()=>{};card._discoverAll=async()=>{};card._loadSharedTariffProfile=async()=>{};
 const hass={user:{id:'A',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en'},config:{time_zone:'UTC',currency:'EUR'},states:{},callWS:async req=>{
  calls.push(req);if(release)await release.promise;
  if(req.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.previous_session'}]};
  if(req.type==='recorder/get_statistics_metadata')return {'sensor.previous_session':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
  if(req.type==='recorder/statistics_during_period'){const start=Date.parse(req.start_time),end=Date.parse(req.end_time);return {'sensor.previous_session':Array.from({length:(end-start)/3600000},(_,i)=>({start:start+i*3600000,change:1}))};}
  throw Error(req.type);
 }};
 card.setConfig({show_support:false,energy_price:2});card._firstHassRender=true;card._firstRender=true;card._discoveryDone=true;card._emailBackendChecked=true;
 card._lastDataFetch=dom.window.Date.now();card._lastRenderTime=dom.window.Date.now();card._lastStatsFetch=dom.window.Date.now();
 dom.window.document.body.append(card);card.hass=hass;
 const fetch=()=>type==='ha-energy-insights'?card._fetchData():type==='ha-energy-email'?card._fetchRecorderStats('day'):card._fetchEnergyStats();
 await fetch();
 const value=()=>type==='ha-energy-insights'?card._data?.monthKwh:type==='ha-energy-email'?card._getAutoDataForPeriod('day')[0]?.month:card._hasRealData?card._energyModel?.summary(card._energyModel.start,card._energyModel.end).total:null;
 assert.ok(value()>0,'fixture must first accept real Recorder measurements');
 return {card,dom,hass,calls,fetch,value,hold(){let resolve;const promise=new Promise(r=>resolve=r);release={promise,resolve};return ()=>{release=null;resolve();};},close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
for(const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'])for(const change of ['connection','user','timezone','null'])test(`${type} removes settled measurements on ${change}, including an in-place hass mutation`,async()=>{
 const f=await fixture(type);try{
  // Hold any normal next-session read: old rows must disappear synchronously.
  const resume=f.hold();const before=f.calls.length;
  if(change==='connection')f.hass.connection={connected:true};
  if(change==='user')f.hass.user.id='B';
  if(change==='timezone')f.hass.config.time_zone='Asia/Kathmandu';
  f.card.hass=change==='null'?null:f.hass;
  assert.ok(!f.value(),'previous accepted values cannot remain visible while the next read is pending');
  if(type==='ha-energy-insights'){
   assert.equal(f.card._insightsEnergyModel,null);assert.equal(f.card._insightChartDataset,null);
   assert.ok(!f.card.shadowRoot.textContent.includes('sensor.previous_session'));
  }
  if(type==='ha-energy-email')for(const period of ['day','week','month']){
   assert.equal(f.card._getAutoDataForPeriod(period).length,0);assert.ok(!f.card[`_periodRaw_${period}`]);assert.ok(!f.card[`_periodWindow_${period}`]);
  }
  const after=f.calls.length;await Promise.resolve();await Promise.resolve();assert.equal(f.calls.length,after,'repricing microtasks cannot dispatch another fetch');
  assert.ok(after-before<=1,'a context transition cannot burst parallel reads');resume();
 }finally{f.close();}
});
for(const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'])test(`${type} locale/theme update retains settled measurements without Recorder reads`,async()=>{
 const f=await fixture(type);try{const before=f.value(),calls=f.calls.length;
  f.card.hass={...f.hass,language:'pl',locale:{language:'pl'},themes:{darkMode:true}};
  assert.equal(f.value(),before);assert.equal(f.calls.length,calls);
 }finally{f.close();}
});
for(const type of ['ha-energy-insights','ha-energy-email'])test(`${type} null then a new session cannot revive an old pending payload`,async()=>{
 const f=await fixture(type);try{
  const resume=f.hold(),pending=f.fetch();await Promise.resolve();f.card.hass=null;
  f.card.hass={...f.hass,user:{id:'B',is_admin:true},connection:{connected:true}};
  resume();await pending;assert.ok(!f.value());
 }finally{f.close();}
});
test('Insights does not spend the new session refresh deadline while the old wire is occupied',async()=>{
 const f=await fixture('ha-energy-insights');try{
  const resume=f.hold(),pending=f.fetch();await Promise.resolve();f.card.hass=null;
  const next={...f.hass,user:{id:'B',is_admin:true},connection:{connected:true},config:{...f.hass.config,time_zone:'Europe/Warsaw'}};
  f.card.hass=next;resume();await pending;
  assert.equal(f.card._lastDataFetch,0,'a rejected dispatch cannot consume the 5 minute refresh window');
  f.card.hass=next;await new Promise(resolve=>setImmediate(resolve));
  assert.ok(f.value()>0);assert.equal(f.card._insightsEnergyModel.zone,'Europe/Warsaw');
  assert.equal(f.card._insightsReadPending,false);assert.equal(f.card._loading,false);
 }finally{f.close();}
});

// A discarded read must not spend the replacement context's five-minute window.
// Reintroducing the pre-dispatch timestamp, or omitting stale-deadline release,
// prevents the normal next hass update from accepting any new measurements.
for(const type of ['ha-energy-optimizer','ha-energy-email'])for(const boundary of ['connection','user','timezone','null','tab','remount'])test(`${type} recovers on an ordinary hass update after an occupied ${boundary} read`,async()=>{
 const f=await fixture(type);try{
  const resume=f.hold();
  const pending=type==='ha-energy-email'?f.card._fetchAllPeriodStats():f.fetch();
  await Promise.resolve();
  const occupiedCalls=f.calls.length;
  if(boundary==='connection')f.hass.connection={connected:true};
  if(boundary==='user')f.hass.user.id='B';
  if(boundary==='timezone')f.hass.config.time_zone='Europe/Warsaw';
  if(boundary==='null')f.card.hass=null;
  if(boundary==='tab'){
   if(type==='ha-energy-optimizer')f.card.shadowRoot.querySelector('[data-tab="patterns"]').click();
   else { f.card.shadowRoot.querySelector('[data-tab="preview"]').click();f.card.shadowRoot.querySelector('[data-tab="overview"]').click(); }
  }
  if(boundary==='remount'){f.card.remove();f.dom.window.document.body.append(f.card);}
  f.card.hass=f.hass;
  assert.equal(f.calls.length,occupiedCalls,'context updates cannot dispatch a parallel raw read');
  const oldModel=f.card._energyModel,oldDay=f.card._periodCache_day;
  resume();await pending;await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.calls.length,occupiedCalls,'stale completion cannot retry automatically or request stale metadata');
  if(type==='ha-energy-optimizer'){
   assert.equal(f.card._statsLoading,false);
   assert.equal(f.card._energyModel,oldModel,'discarded payload cannot replace the current model');
  }else assert.equal(f.card._periodCache_day,oldDay,'discarded payload cannot replace current period data');
  // Advance past the existing ten-second UI throttle, far below five minutes.
  const tick=f.dom.window.Date.now();f.dom.window.Date.now=()=>tick+11000;
  f.card.hass=f.hass;await new Promise(resolve=>setImmediate(resolve));
  assert.ok(f.calls.length>occupiedCalls,'next normal hass update must dispatch the current read before five minutes');
  if(type==='ha-energy-optimizer'){
   // At local midnight Today can honestly have no completed hours; the full
   // Recorder fixture still contains 31 days of one-kWh measurements.
   const model=f.card._energyModel;assert.ok(model,'normal update accepts the current Recorder model');
   assert.notEqual(model,oldModel,'a new accepted model replaces the retained or cleared model');
   assert.equal(model.summary(model.start,model.end).total,744);
   assert.equal(model.zone,f.hass.config.time_zone);assert.equal(f.card._statsLoading,false);
  }else {assert.equal(f.value(),24);assert.notEqual(f.card._periodCache_day,oldDay);assert.equal(f.card._periodRefreshPromise,null);}
 }finally{f.close();}
});

// This harness needs an accepted Recorder model, not a completed Today hour.
for(const clock of ['2026-10-16T00:05:00Z','2026-10-16T23:05:00Z'])test(`Optimizer binding fixture accepts the loaded model at ${clock}`,async()=>{
 const f=await fixture('ha-energy-optimizer',clock);try{
  assert.equal(f.value(),744,'the independent31-day raw fixture remains744kWh before and after the first completed day hour');
  if(clock.includes('T00:'))assert.equal(f.card._hasRealData,false,'Today correctly has no completed hour yet');
 }finally{f.close();}
});
