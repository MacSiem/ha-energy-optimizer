'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'); const {JSDOM}=require('jsdom');
const { isolateLegacyAnalysis } = require('./helpers/legacy-analysis-fixture.cjs');
const code=['optimizer.js','energy-insights.js','energy-email.js','chart-vendor.js'].map(n=>readFileSync('src/'+n,'utf8')).join('');
const tick=()=>new Promise(r=>setImmediate(r));
for(const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email']) for(const boundary of ['user','mount']) test(`${type} quiet first load resumes after occupied ${boundary} transition`,async()=>{
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});dom.window.eval(code);
 const card=dom.window.document.createElement(type);
  // Already-authorized legacy unit coverage; real negotiation lives in energy-analysis-cards-v53.
  isolateLegacyAnalysis(card);card.setConfig({show_support:false});card._schedule=()=>{};
 let release,hold=true,active=0,maxActive=0;const pending=new Promise(r=>{release=()=>{hold=false;r();};});
 const requests=[];
 const hass={user:{id:'initial',is_admin:true},connection:{connected:true},states:{},services:{},config:{time_zone:'UTC',currency:'EUR'},callWS:async req=>{
  requests.push({type:req.type,user:hass.user.id});
  if(req.type==='ha_tools_email/get_config')return {smtp_configured:true,schedules:[]};
  if(req.type==='ha_tools_email/preview_energy_report')return {status:'no_sources',sources:[]};
  if(req.type==='ha_tools_email/get_tariff')throw {code:'unknown_command'};
  active++;maxActive=Math.max(maxActive,active);
  try {
   if(req.type==='energy/get_prefs'){if(hold)await pending;return {energy_sources:[{type:'grid',stat_energy_from:'sensor.grid'}]};}
   if(req.type==='recorder/get_statistics_metadata')return {'sensor.grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
   if(req.type==='recorder/statistics_during_period'){const start=Date.parse(req.start_time),end=Date.parse(req.end_time);return {'sensor.grid':Array.from({length:(end-start)/3600000},(_,i)=>({start:start+i*3600000,change:1}))};}
   throw Error(req.type);
  }finally{active--;}
 }};
 try {
  dom.window.document.body.append(card);card.hass=hass;
  for(let i=0;i<8;i++)await tick();
  assert.equal(requests.filter(r=>r.type==='energy/get_prefs').length,1);
  if(boundary==='user')hass.user.id='replacement';
  else {card.remove();dom.window.document.body.append(card);}
  card.hass=hass; // The last normal update arrives while the original raw wire is occupied.
  assert.equal(requests.filter(r=>r.type==='energy/get_prefs').length,1);
  release();for(let i=0;i<15;i++)await tick(); // Quiet HA: no setter, click or clock advancement.
  const value=type==='ha-energy-email'?card._getOverviewData()[0]?.month:type==='ha-energy-insights'?card._data?.monthKwh:card._energyModel?.summary(card._energyModel.start,card._energyModel.end).total;
  assert.equal(value,type==='ha-energy-email'?24:type==='ha-energy-insights'?720:744,'fresh current context must finish initial measurements on quiet HA');
  assert.equal(maxActive,1,'never overlap old and fresh Recorder wire');
  const count=requests.length;card.hass=hass;await tick();assert.equal(requests.length,count,'settled first load does not restart');
 }finally{release();for(let i=0;i<15;i++)await tick();card._getTariffHostV3().guard.dispose();dom.window.close();}
});
