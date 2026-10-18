const {isolateLegacyAnalysis}=require('./helpers/legacy-analysis-fixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {JSDOM}=require('jsdom');

function fixture(){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),w=dom.window;
 const end=Date.parse('2026-10-16T06:00:00Z'),NativeDate=w.Date;
 w.Date=class extends NativeDate {constructor(...args){super(...(args.length?args:[end+1800000]));}static now(){return end+1800000;}};
 w.eval(readFileSync(join(__dirname,'..','ha-energy-optimizer.js'),'utf8'));
 const card=w.document.createElement('ha-energy-email');isolateLegacyAnalysis(card);card._config.energy_price=2;
 const points=count=>Array.from({length:count},(_,i)=>({start:end-24*3600000+i*3600000,change:1}));
 const state={series:{'sensor.full':points(24),'sensor.gap':points(18)},fail:false,unsupported:false};
 card._hass={user:{id:'qa-cross390',is_admin:true},connection:{connected:true},config:{time_zone:'UTC'},states:{},callWS:async m=>{
  if(m.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.full'},{type:'grid',stat_energy_from:'sensor.gap'}]};
  if(m.type==='recorder/get_statistics_metadata')return ['sensor.full','sensor.gap'].map(statistic_id=>({statistic_id,has_sum:!(state.unsupported&&statistic_id==='sensor.gap'),statistics_unit_of_measurement:'kWh',name:statistic_id==='sensor.full'?'Full source':'Gapped source'}));
  if(m.type==='recorder/statistics_during_period'){if(state.fail)throw Error('PRIVATE_READ_FAILURE');return state.series;}
  throw Error(m.type);
 }};
 return {dom,card,state,points,view(){const view=w.document.createElement('div');view.innerHTML=card._tabOverview();return view;},close(){w.close();}};
}
test('Email Overview retains full and gapped source measurements without claiming a complete total',async()=>{
 const f=fixture();try{await f.card._fetchRecorderStats('day');const rows=f.card._getAutoDataForPeriod('day');assert.equal(rows.length,2);assert.equal(f.card._periodStatus_day,'partial');assert.equal(rows.find(r=>r.entity_id==='sensor.full').month,24);assert.equal(rows.find(r=>r.entity_id==='sensor.gap').month,18);
  const view=f.view();assert.match(view.textContent,/Recorded usage/);assert.match(view.textContent,/42\/48/);assert.match(view.textContent,/18\/24/);assert.match(view.textContent,/full.period total unavailable/i);assert.match(view.textContent,/Full source/);assert.match(view.textContent,/Gapped source/);assert.doesNotMatch(view.textContent,/NaN/);
 }finally{f.close();}
});
test('A refreshed partial period replaces an older complete ranking and legacy preview withholds totals',async()=>{
 const f=fixture();try{f.state.series['sensor.gap']=f.points(24);await f.card._fetchRecorderStats('day');assert.equal(f.card._periodStatus_day,'ready');f.state.series['sensor.gap']=f.points(18);await f.card._fetchRecorderStats('day');assert.equal(f.card._periodCache_day.find(r=>r.entity_id==='sensor.gap').month,18);f.card._discoveryDone=true;f.card._emailBackendAvailable=false;
  const view=f.dom.window.document.createElement('div');view.innerHTML=f.card._tabLegacyPreview();assert.match(view.textContent,/Incomplete data|period total unavailable/i);
 }finally{f.close();}
});
test('Failed refresh cannot present a previously complete ranking as current measured data',async()=>{
 const f=fixture();try{f.state.series['sensor.gap']=f.points(24);await f.card._fetchRecorderStats('day');f.state.fail=true;await f.card._fetchRecorderStats('day');assert.equal(f.card._periodStatus_day,'error');assert.equal(f.card._getAutoDataForPeriod('day').length,0);assert.match(f.view().textContent,/could not be loaded/);assert.doesNotMatch(f.view().textContent,/PRIVATE_READ_FAILURE/);}finally{f.close();}
});
test('Unsupported source metadata does not discard another valid source or make a subset a complete total',async()=>{
 const f=fixture();try{f.state.unsupported=true;await f.card._fetchRecorderStats('day');assert.equal(f.card._periodStatus_day,'unsupported');assert.equal(f.card._getAutoDataForPeriod('day').length,1);assert.equal(f.card._periodCache_day[0].month,24);assert.match(f.view().textContent,/24\/48 source-hours/);assert.match(f.view().textContent,/full-period total unavailable/);}finally{f.close();}
});
test('Duplicate conflicting hourly readings are excluded while other measured hours remain',async()=>{
 const f=fixture();try{f.state.series['sensor.full'].push({...f.state.series['sensor.full'][0],change:9});await f.card._fetchRecorderStats('day');const full=f.card._periodCache_day.find(row=>row.entity_id==='sensor.full');assert.equal(full.month,23);assert.equal(full.measuredHours,23);assert.equal(full.complete,false);assert.equal(full.cost,null);assert.equal(f.card._periodCoverage_day.measuredHours,41);assert.equal(f.card._periodCache_day.find(row=>row.entity_id==='sensor.gap').month,18);}finally{f.close();}
});
test('A completely measured zero remains zero without inventing a price after an unavailable tariff read',async()=>{
 const f=fixture();try{f.state.series['sensor.full']=f.points(24).map(point=>({...point,change:0}));f.state.series['sensor.gap']=f.points(24).map(point=>({...point,change:0}));await f.card._fetchRecorderStats('day');assert.equal(f.card._periodStatus_day,'ready');assert.ok(f.card._periodCache_day.every(row=>row.month===0&&row.cost===null&&row.complete));assert.doesNotMatch(f.view().textContent,/full-period total unavailable/);assert.match(f.view().textContent,/0\.0/);}finally{f.close();}
});
