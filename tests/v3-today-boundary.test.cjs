'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {JSDOM}=require('jsdom');
const code=['src/optimizer.js','src/energy-insights.js','src/energy-email.js','src/chart-vendor.js'].map(p=>readFileSync(p,'utf8')).join('');const H=3600000;
async function fixture(type,zone,value=1){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),end=Date.parse('2026-10-25T05:00:00Z'),NativeDate=dom.window.Date;
 dom.window.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[end]));}static now(){return end;}};dom.window.eval(code);
 const card=dom.window.document.createElement(type);card._schedule=()=>{};const calls=[];
 card._hass={user:{id:'fixture',is_admin:true,is_active:true},connection:{connected:true},language:'en',locale:{language:'en'},config:{time_zone:zone,currency:'EUR'},states:{},callWS:async req=>{
  calls.push(req);if(req.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.grid'}]};
  if(req.type==='recorder/get_statistics_metadata')return {'sensor.grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
  if(req.type==='recorder/statistics_during_period'){const start=Date.parse(req.start_time),to=Date.parse(req.end_time);return {'sensor.grid':Array.from({length:(to-start)/H},(_,i)=>({start:start+i*H,change:value}))};}
  throw Error(req.type);
 }};card.setConfig({show_support:false,energy_price:2,currency:'EUR'});card._firstHassRender=true;card._firstRender=true;card._discoveryDone=true;dom.window.document.body.append(card);
 if(type==='ha-energy-optimizer')await card._fetchEnergyStats();else if(type==='ha-energy-insights'){card._render();await card._fetchData();}else await card._fetchRecorderStats('day');
 return {card,dom,calls,close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
for(const type of ['ha-energy-optimizer','ha-energy-insights'])for(const zone of ['Asia/Kolkata','Asia/Kathmandu'])test(`${type} ${zone} withholds midnight total without discarding measured intervals`,async()=>{
 const f=await fixture(type,zone);try{
  const c=f.card,today=type==='ha-energy-optimizer'?c._todayWindow:c._data.windows.daily;
  assert.equal(type==='ha-energy-optimizer'?c._calculateTodayUsage():c._data.todayKwh,null,'partial civil-day boundary is not a complete Today total');
  assert.equal(today.boundaryComplete,false);assert.equal(today.recordedKwh,10);assert.equal(today.complete,false);
  assert.equal(type==='ha-energy-optimizer'?c._calculateTodayCost():c._data.todayCost,null);
  const notice=c.shadowRoot.querySelector('[data-today-boundary]');assert.ok(notice);assert.match(notice.textContent,/midnight|północ/);assert.match(notice.textContent,/10 kWh/);
  assert.match(notice.textContent,new RegExp(zone));assert.ok(c.shadowRoot.querySelector('[data-today-range]')||type==='ha-energy-optimizer');
  if(type==='ha-energy-optimizer'){assert.equal(c._hasRealData,true);assert.equal(c._dashboardRowsV3().length,10);}
  else {c._activeTab='daily';c._updateContent();assert.ok(c.shadowRoot.querySelector('[data-insights-chart]'));}
 }finally{f.close();}
});
for(const type of ['ha-energy-optimizer','ha-energy-insights'])test(`${type} aligned DST midnight keeps valid Today total`,async()=>{
 const f=await fixture(type,'Europe/Warsaw');try{const c=f.card;assert.equal(type==='ha-energy-optimizer'?c._calculateTodayUsage():c._data.todayKwh,7);assert.equal(c.shadowRoot.querySelector('[data-today-boundary]'),null);}finally{f.close();}
});
test('unaligned measured zero remains a zero subset, not a full-day zero',async()=>{
 const f=await fixture('ha-energy-insights','Asia/Kolkata',0);try{assert.equal(f.card._data.todayKwh,null);assert.equal(f.card._data.windows.daily.recordedKwh,0);assert.match(f.card.shadowRoot.querySelector('[data-today-boundary]').textContent,/0 kWh/);}finally{f.close();}
});
test('Energy Email rolling 24 completed hours is independent of the local-midnight boundary',async()=>{
 const f=await fixture('ha-energy-email','Asia/Kolkata');try{assert.equal(f.card._periodStatus_day,'ready');assert.equal(f.card._periodCache_day[0].month,24);assert.equal(f.calls.filter(c=>c.type==='recorder/statistics_during_period').length,1);}finally{f.close();}
});
