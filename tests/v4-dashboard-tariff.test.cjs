'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
function fixture(config={}) {
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),charts=[];
 dom.window.captureChart=cfg=>charts.push(cfg);
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({});
 dom.window.eval(readFileSync('src/optimizer.js','utf8')+'\nconst HA_ENERGY_CHART=class{constructor(ctx,cfg){window.captureChart(cfg)}destroy(){}};');
 const card=dom.window.document.createElement('ha-energy-optimizer');card._schedule=()=>{};
 card._hass={user:{id:'qa',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en'},config:{time_zone:'UTC',currency:'EUR'},states:{}};
 card.setConfig({show_support:false,peak_rate:1,off_peak_rate:0.5,peak_hours:{start:0,end:8},...config});
 const start=Date.parse('2026-01-01T00:00:00Z'),end=start+10*3600000;
 card._energyModel={ids:['sensor.qa_grid'],zone:'UTC',start,todayStart:start,end,summary:()=>({total:null}),points:new Map(Array.from({length:10},(_,h)=>[start+h*3600000,{kwh:1}]))};
 card._hasRealData=true;card._todayWindow={start:new Date(start).toISOString(),end:new Date(end).toISOString(),total:10,boundaryComplete:true};
 card._render();
 return {dom,card,charts,close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
test('configured midnight tariff starts at 00:00 in both priced rows and chart colors',async()=>{
 const f=fixture();try {
  const rows=f.card._dashboardRowsV3();assert.equal(rows[0].tariffZone,'day');assert.equal(rows[7].tariffZone,'day');assert.equal(rows[8].tariffZone,'night');
  await f.card._drawDashboardChart();const colors=Array.from(f.charts.at(-1).data.datasets[0].backgroundColor);
  assert.equal(colors[0],colors[7],'00:00 and 07:00 belong to the same configured day zone');
  assert.notEqual(colors[0],colors[8],'08:00 belongs to the configured night zone');
 }finally{f.close();}
});
const profile=()=>({schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'high',
 zones:[{id:'high',label:'Day <rate>',energyRate:2,variableRate:0},{id:'low',label:'Valley',energyRate:0.5,variableRate:0}],
 rules:[{zone:'low',intervals:[{from:'03:00',to:'05:00'}]}]});
test('actual tariff valleys drive bar colors, escaped legend and matching Data zones after repricing',async()=>{
 const f=fixture({tariff_profile:profile()});try{
  await f.card._drawDashboardChart();let colors=Array.from(f.charts.at(-1).data.datasets[0].backgroundColor);
  assert.notEqual(colors[2],colors[3],'03:00 valley differs from daytime');assert.equal(colors[3],colors[4]);assert.equal(colors[2],colors[5]);
  const root=f.card.shadowRoot;assert.match(root.querySelector('[data-dashboard-tariff-legend]').textContent,/Day <rate>/);assert.equal(root.querySelector('rate'),null);
  root.querySelector('[data-dashboard-control="data"]').click();const rows=root.querySelectorAll('[data-dashboard-row]');
  assert.match(rows[3].querySelector('[data-tariff-zone]').textContent,/Valley/);assert.match(rows[2].querySelector('[data-tariff-zone]').textContent,/Day <rate>/);
  f.card._config.tariff_profile.rules[0].intervals=[{from:'01:00',to:'02:00'}];f.card._repriceTariffV3();
  assert.match(root.querySelectorAll('[data-dashboard-row]')[3].querySelector('[data-tariff-zone]').textContent,/Day <rate>/);
  root.querySelector('[data-dashboard-control="chart"]').click();await f.card._drawDashboardChart();colors=Array.from(f.charts.at(-1).data.datasets[0].backgroundColor);
  assert.equal(colors[2],colors[3]);assert.notEqual(colors[0],colors[1]);
 }finally{f.close();}
});
test('unconfirmed or absent prices use one neutral color and do not claim tariff zones',async()=>{
 const f=fixture({tariff_profile:null});try{
  await f.card._drawDashboardChart();const colors=Array.from(f.charts.at(-1).data.datasets[0].backgroundColor);assert.equal(new Set(colors).size,1);
  assert.match(f.card.shadowRoot.querySelector('[data-dashboard-tariff-legend]').textContent,/unavailable/i);
  f.card.shadowRoot.querySelector('[data-dashboard-control="data"]').click();
  assert.ok([...f.card.shadowRoot.querySelectorAll('[data-tariff-zone]')].every(x=>/unavailable/i.test(x.textContent)));
 }finally{f.close();}
});
test('same-price mixed zones stay multiple while mixed rates stay unavailable',()=>{
 const p=profile();p.zones[1].energyRate=2;p.rules[0].intervals=[{from:'03:30',to:'04:00'}];
 const f=fixture({tariff_profile:p});try{
  f.card.shadowRoot.querySelector('[data-dashboard-control="data"]').click();
  let label=f.card.shadowRoot.querySelectorAll('[data-dashboard-row]')[3].querySelector('[data-tariff-zone]');
  assert.match(label.textContent,/Multiple/);assert.match(label.textContent,/Day <rate>/);assert.match(label.textContent,/Valley/);
  p.zones[1].energyRate=0.5;f.card._repriceTariffV3();
  label=f.card.shadowRoot.querySelectorAll('[data-dashboard-row]')[3].querySelector('[data-tariff-zone]');assert.match(label.textContent,/unavailable/i);
 }finally{f.close();}
});
test('missing live power is a compact actionable guide with only measured power sensors',()=>{
 const f=fixture();try{
  f.card._hass.states={'sensor.meter':{state:'0',attributes:{unit_of_measurement:'W',friendly_name:'Meter <power>'}},'sensor.energy':{state:'4',attributes:{unit_of_measurement:'kWh'}}};
  f.card._lastStatsFetch=Date.now();f.card._updateEnergyData();f.card._render();const root=f.card.shadowRoot;
  assert.equal(root.querySelector('.power-draw'),null,'no giant N/A tile');const guide=root.querySelector('[data-power-setup]');assert.ok(guide);assert.match(guide.querySelector('summary').textContent,/Choose sensor/);
  const select=guide.querySelector('select');assert.ok(select);assert.deepEqual(Array.from(select.options).map(x=>x.value),['','sensor.meter']);
  select.value='sensor.meter';select.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  assert.match(guide.querySelector('code').textContent,/power_entity: sensor.meter/);assert.match(guide.textContent,/edit.*card|card.*edit/i);assert.equal(f.card._config.power_entity,undefined,'choosing a snippet does not silently persist card YAML');assert.equal(root.querySelector('power'),null);
 }finally{f.close();}
});
test('a configured unavailable power source is distinguished from no sensor and zero remains measured',()=>{
 const f=fixture({power_entity:'sensor.meter'});try{
  f.card._hass.states={'sensor.meter':{state:'unavailable',attributes:{unit_of_measurement:'W'}}};f.card._lastStatsFetch=Date.now();f.card._updateEnergyData();f.card._render();
  assert.match(f.card.shadowRoot.querySelector('[data-power-status]').textContent,/unavailable/i);
  f.card._hass.states['sensor.meter'].state='';f.card._updateEnergyData();f.card._render();
  assert.equal(f.card._currentPowerW,null,'an empty sensor state is not a measured zero');
  f.card._hass.states['sensor.meter'].state='0';f.card._updateEnergyData();f.card._render();
  assert.equal(f.card._currentPowerW,0);assert.match(f.card.shadowRoot.querySelector('.power-draw').textContent,/0[.,]00/);assert.equal(f.card.shadowRoot.querySelector('[data-power-status]'),null);
 }finally{f.close();}
});
test('maximum consumption interval is labeled independently of tariff peak hours',()=>{
 const f=fixture();try{const row=f.card.shadowRoot.querySelector('[data-dashboard-peak]');assert.ok(row);assert.match(row.parentElement.textContent,/Highest consumption/);assert.doesNotMatch(row.parentElement.textContent,/Peak Hour/);}finally{f.close();}
});

test('losing the HA context clears live power instead of showing the previous user reading in the empty view',()=>{
 const f=fixture({power_entity:'sensor.meter'});try{
  f.card._hass.states={'sensor.meter':{state:'321',attributes:{unit_of_measurement:'W'}}};f.card._lastStatsFetch=Date.now();
  f.card.hass=f.card._hass;assert.equal(f.card._currentPowerW,321);
  f.card.hass=null;assert.equal(f.card._currentPowerW,null);assert.equal(f.card.shadowRoot.querySelector('.power-draw'),null);
 }finally{f.close();}
});

test('ordinary HA sensor updates refresh live power even when entity count and sun stay unchanged',()=>{
 const f=fixture({power_entity:'sensor.meter'});try{
  const jobs=[];f.card._schedule=callback=>{jobs.push(callback);};
  const flush=()=>{for(let n=0;jobs.length&&n<50;n++)jobs.shift()();assert.equal(jobs.length,0);};
  const base={...f.card._hass,states:{'sensor.meter':{state:'1',attributes:{unit_of_measurement:'W'}}}};
  f.card._lastStatsFetch=Date.now();f.card.hass=base;flush();
  // A prior ordinary HA update establishes the normal throttled repaint state.
  f.card._lastRenderTime=Date.now()-1000;f.card.hass={...base};flush();
  const update=value=>{
   f.card._lastRenderTime=Date.now()-1000;
   f.card.hass={...base,states:{'sensor.meter':{state:value,attributes:{unit_of_measurement:'W'}}}};flush();
  };
  update('321');assert.match(f.card.shadowRoot.querySelector('.power-draw').textContent,/0[.,]32/);
  update('0');assert.match(f.card.shadowRoot.querySelector('.power-draw').textContent,/0[.,]00/);
  update('unavailable');assert.equal(f.card.shadowRoot.querySelector('.power-draw'),null);
  assert.match(f.card.shadowRoot.querySelector('[data-power-status]').textContent,/unavailable/i);
 }finally{f.close();}
});
