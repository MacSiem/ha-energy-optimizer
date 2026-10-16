'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const source = readFileSync('src/optimizer.js', 'utf8');
const H = 3600000;
async function fixture(now='2026-10-25T05:00:00Z', zone='Europe/Warsaw') {
  const dom = new JSDOM('', {runScripts:'dangerously',url:'http://localhost/'});
  const end=Date.parse(now), NativeDate=dom.window.Date;
  dom.window.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[end]));}static now(){return end;}};
  const configs=[]; dom.window.captureChart=(ctx,config)=>configs.push(config);
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({});
  dom.window.eval(source+'\nconst HA_ENERGY_CHART=class{constructor(ctx,config){window.captureChart(ctx,config)}destroy(){}};');
  const card=dom.window.document.createElement('ha-energy-optimizer');card._schedule=()=>{};
  const calls=[];
  card._hass={user:{id:'synthetic',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en',time_zone:'server',time_format:'24'},config:{time_zone:zone,currency:'EUR'},states:{},callWS:async m=>{
    calls.push(m);if(m.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.synthetic_grid'}]};
    if(m.type==='recorder/get_statistics_metadata')return {'sensor.synthetic_grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
    if(m.type==='recorder/statistics_during_period'){const start=Date.parse(m.start_time);return {'sensor.synthetic_grid':Array.from({length:(end-start)/H},(_,i)=>({start:start+i*H,change:i%3===0?0:1}))};}
    throw Error(m.type);
  }};
  card.setConfig({show_support:false,energy_price:2,currency:'EUR'});dom.window.document.body.append(card);
  await card._fetchEnergyStats();assert.equal(card._hasRealData,true);card._render();
  return {dom,card,calls,configs,close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
function click(f,key){const el=f.card.shadowRoot.querySelector(`[data-dashboard-control="${key}"]`);assert.ok(el,'visible '+key+' control');el.click();}
test('Dashboard Chart/Data preserves separate repeated DST hours and exact zero values without reads',async()=>{
  const f=await fixture();try{
    const before=f.calls.length;await f.card._drawDashboardChart();const config=f.configs.at(-1);assert.ok(config);
    assert.equal(config.data.labels.length,7,'completed absolute buckets, not 24 wall-clock bins');
    assert.notEqual(config.data.labels[2],config.data.labels[3],'repeated 02 hours carry distinct offsets');
    const values=Array.from(config.data.datasets[0].data);click(f,'data');
    const rows=[...f.card.shadowRoot.querySelectorAll('[data-dashboard-row]')];
    assert.equal(rows.length,7);assert.equal(new Set(rows.map(n=>n.dataset.dashboardRow)).size,7);
    assert.deepEqual(rows.map(n=>Number(n.dataset.kwh)),values);assert.ok(values.includes(0));
    assert.match(rows[2].textContent,/GMT\+(?:02:00|2)(?!\d)/);assert.match(rows[3].textContent,/GMT\+(?:01:00|1)(?!\d)/);
    click(f,'chart');assert.equal(f.calls.length,before,'presentation changes never fetch measurements');
  }finally{f.close();}
});
test('Dashboard spring transition omits nonexistent hour rather than showing a measured zero',async()=>{
  const f=await fixture('2026-03-29T05:00:00Z');try{
    await f.card._drawDashboardChart();assert.equal(f.configs.at(-1).data.labels.length,6);
    click(f,'data');const rows=[...f.card.shadowRoot.querySelectorAll('[data-dashboard-row]')];assert.equal(rows.length,6);
    const labels=Array.from(f.configs.at(-1).data.labels);
    assert.equal(labels.some(label=>/^02:00\b/.test(label)),false,'nonexistent local 02:00 remains absent');
    assert.ok(labels.some(label=>/^03:00\b/.test(label)),'the local clock advances to 03:00');
  }finally{f.close();}
});
test('Dashboard keyboard point navigation, locale refresh and view toggles preserve identity and focus',async()=>{
  const f=await fixture();try{
    const root=f.card.shadowRoot;const point=root.querySelector('[data-dashboard-control="point"]');assert.ok(point);
    point.focus();point.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}));
    let current=root.querySelector('[data-dashboard-control="point"]');const selected=current.value;
    assert.equal(current.selectedIndex,current.options.length-1);assert.equal(root.activeElement,current);
    assert.match(root.querySelector('[data-dashboard-detail]').textContent,/2026-10-25T04:00:00.000Z/);
    f.card._hass.language='pl';f.card._hass.locale.language='pl';f.card._render();
    current=root.querySelector('[data-dashboard-control="point"]');assert.equal(current.value,selected);assert.equal(root.activeElement,current);
    click(f,'data');assert.equal(root.querySelector('[data-dashboard-control="point"]').value,selected);
    assert.match(root.querySelector('[data-dashboard-chart-section]').textContent,/Dane|Zmierzone/);
    assert.equal(root.querySelector('[data-dashboard-control="data"]').getAttribute('aria-pressed'),'true');
  }finally{f.close();}
});
test('failed source reads remove Dashboard rows rather than retaining a prior dataset',async()=>{
  const f=await fixture();try{
    click(f,'data');f.card._hass.callWS=async()=>{throw Error('fixture source unavailable');};
    await f.card._fetchEnergyStats();assert.equal(f.card._hasRealData,false);
    assert.equal(f.card.shadowRoot.querySelectorAll('[data-dashboard-row]').length,0);
    assert.equal(f.card.shadowRoot.querySelector('[data-dashboard-chart-section]'),null);
  }finally{f.close();}
});
test('peak hour uses one absolute bucket rather than the sum of repeated local hours',async()=>{
  const f=await fixture();try{
    // This fixture has separate 02:00 buckets of 1 kWh each and other 1 kWh hours.
    // The legacy wall-clock aggregate falsely makes 02:00 the sole maximum (2 kWh).
    assert.equal(f.card._getPeakHour(),0,'first maximum actual interval is local midnight');
    const peak=f.card.shadowRoot.querySelector('[data-dashboard-peak]');assert.ok(peak);
    assert.match(peak.textContent,/00:00/);assert.match(peak.textContent,/GMT\+(?:02:00|2)(?!\d)/);
    assert.equal(peak.dataset.kwh,'1');
  }finally{f.close();}
});
