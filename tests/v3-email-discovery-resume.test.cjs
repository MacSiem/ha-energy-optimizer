'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {JSDOM} = require('jsdom');
const code = ['optimizer.js','energy-insights.js','energy-email.js','chart-vendor.js'].map(name => readFileSync('src/'+name,'utf8')).join('');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function fixture(partial = false) {
  const dom = new JSDOM('', {runScripts:'dangerously',url:'http://localhost/'});
  dom.window.eval(code);
  const card = dom.window.document.createElement('ha-energy-email');
  card.setConfig({show_support:false});
  card._schedule = () => {}; // No wall-clock timer is needed for ordinary setter updates.
  const calls = []; let release, holding = true, occupied = 0, maxOccupied = 0;
  const held = new Promise(resolve => { release = () => {holding = false; resolve();}; });
  const hass = {user:{id:'initial',is_admin:true},connection:{connected:true},
    config:{time_zone:'UTC',currency:'EUR'},states:{},services:{},callWS: async request => {
      calls.push({type:request.type,user:card._hass?.user?.id});
      occupied++; maxOccupied=Math.max(maxOccupied,occupied);
      try {
        if(request.type==='ha_tools_email/get_config') {
          if(holding) await held;
          return {smtp_configured:true,default_recipient:'private-old@example.invalid',schedules:[]};
        }
        if(request.type==='ha_tools_email/preview_energy_report') return {status:'no_sources',sources:[]};
        if(request.type==='ha_tools_email/get_tariff') throw {code:'unknown_command'};
        if(request.type==='energy/get_prefs') return {energy_sources:[{type:'grid',stat_energy_from:'sensor.grid'}]};
        if(request.type==='recorder/get_statistics_metadata') return {'sensor.grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
        if(request.type==='recorder/statistics_during_period') {
          const start=Date.parse(request.start_time),end=Date.parse(request.end_time);
          return {'sensor.grid':Array.from({length:partial?1:(end-start)/3600000},(_,i)=>({start:start+i*3600000,change:1}))};
        }
        throw Error('Unexpected '+request.type);
      } finally {occupied--;}
    }};
  return {dom,card,hass,calls,release,max:()=>maxOccupied,async settle(){for(let i=0;i<12;i++) await tick();},async close(){release();for(let i=0;i<12;i++) await tick();card._tariffHostController?.guard.dispose();dom.window.close();}};
}
// Omitting automatic discovery re-entry leaves _firstRender true and no Recorder
// reads after the old config token is discarded. These use the real hass setter.
for(const boundary of ['user','admin','connection','offline','remount']) test(`first-load ${boundary} invalidation resumes on ordinary hass update`,async()=>{
  const f=await fixture();try {
    f.dom.window.document.body.append(f.card);f.card.hass=f.hass;
    await tick();assert.equal(f.calls.filter(r=>r.type==='ha_tools_email/get_config').length,1);
    if(boundary==='user') f.hass.user.id='replacement';
    if(boundary==='admin') f.hass.user.is_admin=false;
    if(boundary==='connection') f.hass.connection={connected:true};
    if(boundary==='offline') f.hass.connection.connected=false;
    if(boundary==='remount'){f.card.remove();f.dom.window.document.body.append(f.card);}
    f.card.hass=f.hass;f.card.hass=f.hass;
    assert.equal(f.calls.length,1,'do not start a second wire while old config is unresolved');
    assert.doesNotMatch(f.card.shadowRoot.textContent,/private-old@example.invalid/,'private recipient is purged before fresh confirmation');
    f.release();await f.settle();
    if (boundary==='offline') assert.equal(f.calls.length,1,'offline context must not dispatch more reads');
    if (boundary==='admin') assert.equal(f.calls.filter(r=>r.type==='ha_tools_email/get_config' || r.type==='ha_tools_email/preview_energy_report').length,1,'household recovery cannot read private email config');
    if(boundary==='admin') f.hass.user.is_admin=true;
    if(boundary==='offline') f.hass.connection.connected=true;
    f.card.hass=f.hass;await f.settle();
    assert.equal(f.card._periodStatus_day,'ready','valid context resumes without click, reload or clock advance');
    assert.equal(f.card._getOverviewData()[0]?.month,24);
    const count=f.calls.length;
    f.card.hass=f.hass;f.card.hass={...f.hass,themes:{darkMode:true}};await f.settle();
    assert.equal(f.calls.length,count,'stable context does not duplicate completed reads');
  }finally{await f.close();}
});
for(const partial of [false,true]) test(`hass before mount automatically loads ${partial?'partial':'complete'} Recorder data once`,async()=>{
  const f=await fixture(partial);try {
    f.card.hass=f.hass;await tick();
    assert.equal(f.calls.length,0,'unmounted card waits for mount');
    f.dom.window.document.body.append(f.card);await tick();f.release();await f.settle();
    assert.equal(f.card._periodStatus_day,partial?'partial':'ready');
    assert.equal(f.card._getOverviewData()[0]?.month,partial?1:24);
    const count=f.calls.length;
    f.card.hass=f.hass;await f.settle();assert.equal(f.calls.length,count);
  }finally{await f.close();}
});
test('initial household context reads measurements without privileged email config',async()=>{
 const f=await fixture();try{
  f.hass.user.is_admin=false;f.release();f.dom.window.document.body.append(f.card);f.card.hass=f.hass;await f.settle();
  assert.equal(f.card._periodStatus_day,'ready');
  assert.ok(f.calls.every(r=>!['ha_tools_email/get_config','ha_tools_email/preview_energy_report'].includes(r.type)));
  const count=f.calls.length;f.card.hass=f.hass;await f.settle();assert.equal(f.calls.length,count);
 }finally{await f.close();}
});
for(const partial of [false,true]) test(`settled ${partial?'partial':'complete'} discovery survives authority/offline updates without duplicate reads`,async()=>{
 const f=await fixture(partial);try {
  f.release();f.dom.window.document.body.append(f.card);f.card.hass=f.hass;await f.settle();
  assert.equal(f.card._periodStatus_day,partial?'partial':'ready');
  const count=f.calls.length;
  for(const state of ['household','admin-return','offline','online']) {
   if(state==='household')f.hass.user.is_admin=false;
   if(state==='admin-return')f.hass.user.is_admin=true;
   if(state==='offline')f.hass.connection.connected=false;
   if(state==='online')f.hass.connection.connected=true;
   f.card.hass=f.hass;await f.settle();
   f.card.hass=f.hass;await f.settle();
   assert.equal(f.calls.length,count,`${state} must not repeat already settled measurements or initial config`);
  }
 }finally{await f.close();}
});
test('a mount after abandoned first discovery settled resumes without another hass setter',async()=>{
 const f=await fixture();try {
  f.dom.window.document.body.append(f.card);f.card.hass=f.hass;await tick();
  f.card.remove();f.release();await f.settle();
  assert.equal(f.calls.length,1);
  f.dom.window.document.body.append(f.card);await f.settle();
  assert.equal(f.card._periodStatus_day,'ready');
  assert.equal(f.card._getOverviewData()[0]?.month,24);
 }finally{await f.close();}
});
