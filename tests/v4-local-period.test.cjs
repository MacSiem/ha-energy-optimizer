'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {JSDOM}=require('jsdom');
const code=['optimizer.js','energy-insights.js','energy-email.js'].map(x=>readFileSync('src/'+x,'utf8')).join('');
for(const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'])test(type+' shows local measured window with honest coverage and UTC details',async()=>{
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});const NativeDate=dom.window.Date,now=Date.parse('2026-03-29T05:30:00Z');
 dom.window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 dom.window.eval(code);const card=dom.window.document.createElement(type);card._schedule=()=>{};
 const calls=[];const hass={user:{id:'qa',is_admin:true},connection:{connected:true},language:'pl-PL',locale:{language:'pl-PL'},states:{},services:{},config:{time_zone:'Europe/Warsaw',currency:'EUR'},callWS:async req=>{
  calls.push(req.type);
  if(req.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.qa_grid'}]};
  if(req.type==='recorder/get_statistics_metadata')return {'sensor.qa_grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
  if(req.type==='recorder/statistics_during_period'){const from=Date.parse(req.start_time),to=Date.parse(req.end_time);return {'sensor.qa_grid':Array.from({length:(to-from)/3600000},(_,i)=>({start:from+i*3600000,change:1.1}))};}
  throw Error(req.type);
 }};
 card._hass=hass;card._lang='pl';card.setConfig({show_support:false,energy_price:2,currency:'EUR'});
 try{
  if(type==='ha-energy-optimizer')await card._fetchEnergyStats();else if(type==='ha-energy-insights')await card._fetchData();else await card._fetchAllPeriodStats();
  card._render();const root=card.shadowRoot,summary=root.querySelector('[data-energy-period-summary]');assert.ok(summary,'visible local period summary');
  assert.match(summary.textContent,/29 mar/);assert.match(summary.textContent,/07:00/);assert.match(summary.textContent,/Europe\/Warsaw/);assert.doesNotMatch(summary.textContent,/T\d\d:\d\d|\.000Z/);
  assert.match(summary.textContent,type==='ha-energy-email'?/24\/24.*źródłogodzin/:/6\/6.*zakończonych/);
  assert.match(summary.textContent,type==='ha-energy-email'?/24/:/(dziś|dzisiaj)/i);
  const details=root.querySelector('[data-energy-period-details]');assert.ok(details);assert.equal(details.tagName,'DETAILS');assert.ok(details.querySelector('summary'));
  assert.match(details.textContent,/2026-03-29T05:00:00\.000Z/);assert.equal(details.open,false);
  const before=calls.length;details.open=true;assert.equal(calls.length,before,'details never reload source measurements');
  assert.match(root.textContent,type==='ha-energy-email'?/26,4/:/6,6/,'measured values use the HA decimal separator');
  if(type==='ha-energy-optimizer'){card._currentTab='recommendations';card._render();assert.match(root.querySelector('#recommendations-list').textContent,/13,20/,'tariff totals use the HA decimal separator');}
  if(type==='ha-energy-email')assert.match(root.querySelector('.device-val').textContent,/26,4/,'source rows use the same HA number format');
 }finally{card._getTariffHostV3().guard.dispose();dom.window.close();}
});
