'use strict';
// Worker: NOT_RUN. Owner must establish RED on the pinned source before integration.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),{readFileSync}=require('node:fs'),path=require('node:path');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createEnergyModelV53}=require('../shared/ha-tools-energy-model.js');
const {createEnergyReportsActionsV53}=require('../shared/ha-tools-energy-reports-actions.js');
const {createEnergyBackendV5}=require('../shared/ha-tools-energy-backend.js');
const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');
const tick=async()=>{for(let i=0;i<160;i++)await Promise.resolve();};
const caps={status:'ready',revision:1,energy_model_schema:'ha_tools.energy_report/1',capabilities:{energy_analysis:{visible:true,read:true},energy_reports:{visible:true,read:true,execute:true}}};
const model=q=>({schema:'ha_tools.energy_report/1',period:{kind:q.period,timezone:'UTC',start:'2026-10-20T00:00:00Z',end:'2026-10-21T00:00:00Z'},totals:{},coverage:{},hourly:[]});
function fixture(name='ha-energy-email'){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),w=dom.window,calls=[],callbacks=new Set();let hook=null,inflight=0,maximum=0;
 w.eval(readFileSync(path.join(__dirname,'../shared/ha-tools-energy-build1-host.js'),'utf8')+';window.installHost=installEnergyBuild1HostV53;');
 const connection=new w.EventTarget();connection.connected=true;connection.subscribeMessage=async fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);};
 const hass={user:{id:'test',is_active:true,is_admin:true},connected:true,connection,config:{time_zone:'UTC'},locale:{language:'en'},callWS:async q=>{
  calls.push(q);inflight++;maximum=Math.max(maximum,inflight);
  try{if(hook){const value=hook(q);if(value!==undefined)return await value;}
   if(q.type.endsWith('feature_capabilities'))return structuredClone(caps);
   if(q.type.endsWith('/energy_report'))return model(q);
   if(q.type.endsWith('get_report_status'))return {schema:1,purpose:'energy_report',schedule_state:'disabled'};
   if(q.type.endsWith('list_delivery_targets'))return [{id:'persistent_notification',name:'HA',default:true},{id:'email',name:'Email'}];
   if(q.type.endsWith('get_attempt_history'))return {schema:1,attempts:[{id:'attempt',kind:'energy_report',timestamp:'2026-10-19T10:00:00Z',outcome:'outcome_unknown',cadence:'daily'}]};
   if(q.type.endsWith('energy_snapshot'))return {schema:1,profile_source:'shared',tariff_revision:1,status:'unavailable',generated_at:'2026-10-20T10:00:00Z',currency:null,current:{available:false,zone_class:null,cheap:null,energy_rate:null,variable_rate:null,usage_rate:null},today:{energy_cost:null,variable_cost:null,usage_cost:null},next_cheap:{status:'unknown'}};
   throw Error('Unexpected request '+q.type);
  }finally{inflight--;}
 }};
 class Card extends w.HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'});this._config={};}
  setConfig(c){this._config=c;}
  set hass(h){this._hass=h;}
  _render(){}
  _getTariffHostV3(){if(!this.host){this.guard=createTariffGuardV3({getHass:()=>this._hass,browser:null});this.host={guard:this.guard,markup:()=>'',bind:()=>{}};}return this.host;}
 }
 w.installHost({Card,name,format:{forHass:()=>({language:'en'})},createClient:createEnergyModelV53,createReports:opts=>createEnergyReportsActionsV53({...opts,createSchedules:null}),createView:()=>({styles:()=>'',markup:()=>'<section>report</section>'})});
 w.customElements.define('test-energy-card',Card);const card=w.document.createElement('test-energy-card');card.setConfig({});w.document.body.append(card);card.hass=hass;
 return {dom,card,calls,hass,setHook:f=>hook=f,maximum:()=>maximum,signal:()=>{for(const fn of [...callbacks])fn();},close:()=>{card.remove();card.guard.dispose();dom.window.close();}};
}
test('real host, guard, model and Reports load once without manual Retry or false empty targets/history',async()=>{
 const f=fixture();try{await tick();assert.equal(f.card._build1ClientV53.state().status,'ready');assert.equal(f.card._build1ClientV53.state().busy,false);
  const s=f.card._build1ReportsV53.state();assert.equal(s.status,'ready');assert.equal(s.targets.length,2);assert.equal(s.deliveries[0].status,'outcome_unknown');assert.equal(s.deliveries[0].retryable,false);
  const types=f.calls.map(q=>q.type);assert.ok(types.indexOf('ha_tools_email/get_report_status')>types.lastIndexOf('ha_tools_email/energy_report'));assert.equal(f.maximum(),1);assert.equal(types.some(t=>/send_now|set_schedule/.test(t)),false);
 }finally{f.close();}
});
test('queued real snapshot cannot steal the model logical lane between capabilities and full/live',async()=>{
 const f=fixture('ha-energy-insights');let backend;
 try{backend=createEnergyBackendV5({card:f.card,guard:f.card.guard,describe:()=>({profile:null,source:'shared',revision:1,ready:true})});backend.snapshot();await tick();
  assert.equal(f.card._build1ClientV53.state().status,'ready');const types=f.calls.map(q=>q.type);assert.equal(types.filter(t=>t==='ha_tools_email/energy_report').length,2);assert.ok(types.indexOf('ha_tools_email/energy_snapshot')>types.lastIndexOf('ha_tools_email/energy_report'));assert.equal(f.maximum(),1);
 }finally{backend?.invalidate();f.close();}
});
test('three independent cards keep secured invalidation and recover without cross-card broker or sends',async()=>{
 const cards=['ha-energy-optimizer','ha-energy-insights','ha-energy-email'].map(fixture);
 try{await tick();for(const f of cards){assert.equal(f.card._build1ClientV53.state().status,'ready');assert.equal(f.card._build1ClientV53.state().model.schema,caps.energy_model_schema);}
  const counts=cards.map(f=>f.calls.length);for(const f of cards)f.signal();await tick();cards.forEach((f,i)=>{assert.ok(f.calls.length>counts[i]);assert.equal(f.card._build1ClientV53.state().status,'ready');assert.equal(f.maximum(),1);assert.equal(f.calls.some(q=>/send_now|set_schedule/.test(q.type)),false);});
 }finally{cards.forEach(f=>f.close());}
});
test('raw timeout survives logical release and late settlement never replays a request',async()=>{
 let release;const calls=[],hass={user:{id:'test',is_active:true},connection:{connected:true},config:{},callWS:q=>{calls.push(q);return new Promise(r=>release=r);}};
 const guard=createTariffGuardV3({getHass:()=>hass,browser:null,timeoutMs:5});
 try{const token=guard.snapshot(),owner=guard.reserve(token);await assert.rejects(guard.call(token,{type:'read'},false,owner),e=>e.code==='timeout');owner.release();assert.equal(guard.occupied(),true);await assert.rejects(guard.call(token,{type:'blocked'}),e=>e.code==='wire_occupied');release({});await tick();assert.equal(guard.occupied(),false);assert.equal(calls.length,1);}finally{release?.({});guard.dispose();}
});
test('a reservation never bypasses authority revocation and late model is discarded',async()=>{
 const f=fixture();let release;
 try{await tick();f.setHook(q=>q.representation==='model'?new Promise(r=>release=()=>r(model(q))):undefined);f.signal();await tick();assert.ok(release);f.hass.user.is_active=false;f.card._build1ClientV53.update();assert.equal(f.card._build1ClientV53.state().model,null);f.setHook(null);release();await tick();assert.equal(f.card._build1ClientV53.state().model,null);assert.equal(f.card.guard.occupied(),false);}finally{release?.();f.close();}
});
test('wire tariff Cancel closes disclosure and keeps schema2 mode without mounting legacy or writing',async()=>{
 const dom=new JSDOM('<body><div id="card"></div></body>'),el=dom.window.document.querySelector('#card');el.attachShadow({mode:'open'});let mounts=[],cancel;
 const card={isConnected:true,shadowRoot:el.shadowRoot,_config:{},_hass:{user:{id:'test',is_active:true},connection:{connected:true},config:{},callWS:()=>{throw Error('Cancel must not write');}}};
 const host=createTariffHostV3({card,kind:'insights',createModel:()=>({valid:false}),legacyProfile:()=>null,createUi:()=>({}),createSettings:opts=>{mounts.push(opts.wireProfile===true?'wire':'legacy');cancel=opts.onCancel;return {render(){},async openMode(){},dispose(){}};}});
 try{card.shadowRoot.innerHTML=host.markup();await host.openProfile();assert.deepEqual(mounts,['wire']);cancel();const details=card.shadowRoot.querySelector('details');assert.equal(details.open,false);assert.equal(card._tariffSettingsOpen,false);assert.equal(card._tariffProfileModeV53,true);assert.deepEqual(mounts,['wire']);assert.equal(card.shadowRoot.activeElement,details.querySelector('summary'));await host.openProfile();assert.deepEqual(mounts,['wire']);}finally{host.backend.invalidate();host.guard.dispose();dom.window.close();}
});
test('public await continuation precedes queued wire listeners on success and rejection',async()=>{
 for(const failure of [false,true]){
  const calls=[],hass={user:{id:'test'},connection:{connected:true},callWS:async q=>{calls.push(q.type);if(q.type==='first'&&failure)throw {code:'read_failed'};return {};}};
  const guard=createTariffGuardV3({getHass:()=>hass,browser:null});let queued=false;
  guard.subscribeWire(()=>queueMicrotask(()=>{if(!queued&&!guard.occupied()){queued=true;void guard.call(guard.snapshot(),{type:'competitor'});}}));
  try{try{await guard.call(guard.snapshot(),{type:'first'});}catch(error){assert.equal(error.code,'read_failed');}await guard.call(guard.snapshot(),{type:'continuation'});await tick();assert.deepEqual(calls.slice(0,2),['first','continuation']);}finally{guard.dispose();}
 }
});
test('failed targets read is visible as error and explicit refresh can load the real targets',async()=>{
 const f=fixture();try{f.setHook(q=>q.type.endsWith('list_delivery_targets')?Promise.reject({code:'unavailable'}):undefined);await tick();assert.equal(f.card._build1ReportsV53.state().status,'error');assert.match(f.card.shadowRoot.textContent,/Report status could not be loaded/);assert.equal(f.card._build1ClientV53.state().status,'ready');const count=f.calls.length;await tick();assert.equal(f.calls.length,count);f.setHook(null);f.card._build1ReportsV53.refresh();await tick();assert.equal(f.card._build1ReportsV53.state().status,'ready');assert.equal(f.card._build1ReportsV53.state().targets.length,2);}finally{f.close();}
});
