'use strict';
// NOT_RUN. Real guard, model, Reports and recurring schedule controller.
const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{webcrypto}=require('node:crypto');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createEnergyModelV53}=require('../shared/ha-tools-energy-model.js');
const {createEnergyReportsActionsV53}=require('../shared/ha-tools-energy-reports-actions.js');
const source=readFileSync(join(__dirname,'../shared/ha-tools-email-schedules.js'),'utf8').replace(/^export /gm,'');
const createSchedules=new Function('globalThis',source+';return createHaToolsEmailSchedules;')({crypto:webcrypto,navigator:{onLine:true}});
const tick=async()=>{for(let i=0;i<300;i++)await Promise.resolve();};
const original={id:'1f3a244d-15ee-4178-956f-d450de68a693',kind:'energy_report',cadence:'daily',time:'08:00',enabled:false,channels:['persistent_notification'],recipients:[]};
function server(){return {rows:[structuredClone(original)],callbacks:new Set(),notify(payload={schedules_changed:true}){for(const f of [...this.callbacks])f(payload);}};}
function fixture(server,options={}){
 const dom=new JSDOM('<div id="reports"></div>',{url:'http://localhost/'}),root=dom.window.document.querySelector('#reports'),calls=[],callContexts=[];
 let actions,model,active=true;
 const grants={energy_analysis:{visible:true,read:true},energy_reports:{visible:true,read:true,execute:true}};
 const connection=new dom.window.EventTarget();connection.connected=true;connection.subscribeMessage=async fn=>{server.callbacks.add(fn);return()=>server.callbacks.delete(fn);};
 const card={isConnected:true,_hass:{user:{id:'owner',is_active:true,is_admin:true},connected:true,connection,config:{time_zone:'UTC'},locale:{language:'en'},callWS:async q=>{
  calls.push(q);callContexts.push({type:q.type,user:card._hass.user.id});
  if(q.type.endsWith('feature_capabilities')){await options.capabilitiesBarrier?.(card._hass.user.id);return {status:'ready',revision:1,energy_model_schema:'ha_tools.energy_report/1',capabilities:structuredClone(grants)};}
  if(q.representation==='model')return {schema:'ha_tools.energy_report/1',period:{kind:q.period,timezone:'UTC',start:'2026-10-20T00:00:00Z',end:'2026-10-21T00:00:00Z'},totals:{},coverage:{},hourly:[]};
  if(q.type.endsWith('get_report_status'))return {schema:1,purpose:'energy_report',schedule_state:'disabled'};
  if(q.type.endsWith('list_delivery_targets'))return [{id:'persistent_notification',name:'HA',default:true}];
  if(q.type.endsWith('get_attempt_history'))return {schema:1,attempts:[]};
  if(q.type==='manifest/get')return {domain:'ha_tools_email',version:'2.8.0'};
  if(q.type.endsWith('list_schedules'))return {schedules:structuredClone(server.rowsByUser?.[card._hass.user.id]||server.rows)};
  if(q.type.endsWith('set_schedule')){server.rows=[structuredClone(q.schedule)];server.notify();return options.write?options.write():{success:true};}
  throw Error('Unexpected '+q.type);
 }}};
 const guard=createTariffGuardV3({getHass:()=>card._hass,browser:null,...(options.timeoutMs?{timeoutMs:options.timeoutMs}:{})});
 model=createEnergyModelV53({card,guard,format:{forHass:()=>({language:'en'})},onChange:()=>actions?.update(),onScheduleChange:()=>actions?.scheduleChanged()});
 actions=createEnergyReportsActionsV53({card,guard,getCapabilities:()=>model.state().capabilities,isModelBusy:()=>model.state().busy,isActive:()=>active,createSchedules});
 model.update();actions.mount(root);
 const ready=async()=>{await tick();assert.equal(model.state().status,'ready','model startup');assert.equal(model.state().busy,false);assert.equal(guard.occupied(),false);assert.equal(actions.state().status,'ready');assert.equal(actions.state().canManageSchedules,true,'real manifest/list handshake');assert.equal(actions.state().schedules[0].time,'08:00');};
 return {dom,root,card,guard,model,actions,calls,callContexts,grants,ready,reads:()=>calls.filter(q=>q.type.endsWith('list_schedules')).length,setActive:v=>{active=v;actions.update();},close:()=>{actions.stop();model.stop();guard.dispose();dom.window.close();}};
}
const noWrites=f=>assert.equal(f.calls.some(q=>/set_schedule|send_now/.test(q.type)),false);
test('accepted edit in one card refreshes the same disabled row in the other active card',async()=>{
 const s=server(),writer=fixture(s),reader=fixture(s);try{
  await writer.ready();await reader.ready();
  assert.equal(writer.actions.scheduleAction('edit',original.id),true);
  const time=writer.root.querySelector('[data-schedule-field="time"]');time.value='08:15';time.dispatchEvent(new writer.dom.window.Event('input',{bubbles:true}));
  assert.equal(writer.actions.reviewSchedule(),true);assert.equal(await writer.actions.confirmSchedule(),true);await tick();
  assert.equal(reader.actions.state().schedules[0].id,original.id);assert.equal(reader.actions.state().schedules[0].time,'08:15');assert.equal(reader.actions.state().schedules[0].enabled,false);
  assert.equal(writer.calls.filter(q=>q.type.endsWith('set_schedule')).length,1);noWrites(reader);
 }finally{writer.close();reader.close();}
});
test('empty energy/status invalidations do not reload schedules; tagged burst coalesces',async()=>{
 const s=server(),f=fixture(s);try{await f.ready();const before=f.reads();s.notify({});await tick();assert.equal(f.reads(),before);
  s.rows[0].time='08:15';s.notify();s.notify();s.notify();await tick();assert.equal(f.reads(),before+1);assert.equal(f.actions.state().schedules[0].time,'08:15');noWrites(f);
 }finally{f.close();}
});
test('remote deletion removes stale schedule id without enabling or replaying a write',async()=>{
 const s=server(),f=fixture(s);try{await f.ready();s.rows=[];s.notify();await tick();assert.deepEqual(f.actions.state().schedules,[]);assert.equal(f.actions.scheduleAction('edit',original.id),false);noWrites(f);}finally{f.close();}
});
test('local draft survives remote invalidation and cancel permits one fresh read',async()=>{
 const s=server(),f=fixture(s);try{await f.ready();assert.equal(f.actions.scheduleAction('edit',original.id),true);
  const time=f.root.querySelector('[data-schedule-field="time"]');time.value='09:45';time.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
  const before=f.reads();s.rows[0].time='08:15';s.notify();await tick();assert.equal(f.reads(),before);assert.equal(f.root.querySelector('[data-schedule-field="time"]').value,'09:45');
  f.root.querySelector('[data-report-action="cancel-schedule"]').click();await tick();assert.equal(f.reads(),before+1);assert.equal(f.actions.state().schedules[0].time,'08:15');noWrites(f);
 }finally{f.close();}
});
test('fresh independent Reports revocation purges rows and denies pending private read',async()=>{
 const s=server(),f=fixture(s);try{await f.ready();const before=f.reads();f.grants.energy_reports={visible:false,read:false,execute:false};s.notify();await tick();assert.equal(f.model.state().status,'ready');assert.equal(f.reads(),before);assert.deepEqual(f.actions.state().schedules,[]);noWrites(f);}finally{f.close();}
});
test('inactive Reports ignores tagged event and does not fetch private rows',async()=>{
 const s=server(),f=fixture(s);try{await f.ready();f.setActive(false);const before=f.reads();s.notify();await tick();assert.equal(f.reads(),before);noWrites(f);}finally{f.close();}
});

test('UNKNOWN write remains locked after a tagged event and late transport settlement',async()=>{
 let release;const s=server(),f=fixture(s,{timeoutMs:20,write:()=>new Promise(resolve=>release=resolve)});
 try{await f.ready();assert.equal(f.actions.scheduleAction('edit',original.id),true);assert.equal(f.actions.reviewSchedule(),true);
  assert.equal(await f.actions.confirmSchedule(),false);assert.equal(f.guard.occupied(),true);const before=f.reads();s.notify();await tick();assert.equal(f.reads(),before);
  release({success:true});await tick();assert.equal(f.reads(),before);assert.equal(f.actions.state().canManageSchedules,false);assert.equal(f.calls.filter(q=>q.type.endsWith('set_schedule')).length,1);assert.equal(f.calls.some(q=>q.type.endsWith('send_now')),false);
 }finally{release?.({});f.close();}
});
test('old subscription cannot retain old rows; a new active identity may read after fresh grants',async()=>{
 for(const edge of ['offline','identity']){
  let release;const held=new Promise(resolve=>release=resolve),s=server();
  const otherRow={...original,id:'d91b5b9b-2174-4362-8c44-e242eb767de9',time:'08:30'};
  s.rowsByUser={other:[otherRow]};
  const f=fixture(s,{capabilitiesBarrier:uid=>uid==='other'?held:undefined});
  try{await f.ready();const before=f.reads(),beforeCalls=f.calls.length,oldCallback=[...s.callbacks][0];assert.equal(typeof oldCallback,'function');
   if(edge==='offline'){f.card._hass.connected=false;f.card._hass.connection.connected=false;}else f.card._hass.user={id:'other',is_active:true,is_admin:true};
   // Calling the old callback observes the authority edge. guard.observe() may
   // legitimately initiate a NEW context; its old association must still fail.
   oldCallback({schedules_changed:true});
   assert.deepEqual(f.actions.state().schedules,[],'old private rows purge synchronously');
   await tick();assert.equal(f.reads(),before,'no private read before fresh context grants');
   if(edge==='offline')assert.equal(f.calls.length,beforeCalls);
   else{
    assert.ok(f.callContexts.slice(beforeCalls).some(c=>c.type.endsWith('feature_capabilities')),'new identity negotiates fresh grants');
    assert.ok(f.callContexts.slice(beforeCalls).every(c=>c.user==='other'),'no old identity dispatch');
    const waiting=f.calls.length;oldCallback({schedules_changed:true});await tick();assert.equal(f.calls.length,waiting,'late old callback cannot create another request');
    release();await tick();assert.equal(f.model.state().status,'ready');assert.equal(f.actions.state().canManageSchedules,true);
    assert.deepEqual(f.actions.state().schedules.map(r=>r.id),[otherRow.id]);assert.equal(f.actions.state().schedules[0].time,'08:30');
    assert.equal(f.callContexts.filter(c=>c.type.endsWith('list_schedules')&&c.user==='owner').length,before);
    assert.equal(f.callContexts.filter(c=>c.type.endsWith('list_schedules')&&c.user==='other').length,1,'one legitimate new-context read');
    const settled=f.calls.length;oldCallback({schedules_changed:true});await tick();assert.equal(f.calls.length,settled,'unsubscribed old association stays inert');
   }
   noWrites(f);
  }finally{release();f.close();}
 }
});

function hostFixture(name='ha-energy-email'){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),w=dom.window,calls=[],callbacks=new Set();let hook=null,inflight=0,maximum=0;
 w.eval(readFileSync(join(__dirname,'../shared/ha-tools-energy-build1-host.js'),'utf8')+';window.installHost=installEnergyBuild1HostV53;');
 const connection=new w.EventTarget();connection.connected=true;connection.subscribeMessage=async fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);};
 const hass={user:{id:'test',is_active:true,is_admin:true},connected:true,connection,config:{time_zone:'UTC'},locale:{language:'en'},callWS:async q=>{
  calls.push(q);inflight++;maximum=Math.max(maximum,inflight);
  try{if(hook){const value=hook(q);if(value!==undefined)return await value;}
   if(q.type.endsWith('feature_capabilities'))return {status:'ready',revision:1,energy_model_schema:'ha_tools.energy_report/1',capabilities:{energy_analysis:{visible:true,read:true},energy_reports:{visible:true,read:true,execute:true}}};
   if(q.type.endsWith('/energy_report'))return {schema:'ha_tools.energy_report/1',period:{kind:q.period,timezone:'UTC',start:'2026-10-20T00:00:00Z',end:'2026-10-21T00:00:00Z'},totals:{},coverage:{},hourly:[]};
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
 w.installHost({Card,name,format:{forHass:()=>({language:'en'})},createClient:createEnergyModelV53,createReports:opts=>createEnergyReportsActionsV53({...opts,createSchedules}),createView:()=>({styles:()=>'',markup:()=>'<section>report</section>'})});
 w.customElements.define('test-energy-card',Card);const card=w.document.createElement('test-energy-card');card.setConfig({});w.document.body.append(card);card.hass=hass;
 return {dom,card,calls,hass,setHook:f=>hook=f,maximum:()=>maximum,signal:payload=>{for(const fn of [...callbacks])fn(payload);},close:()=>{card.remove();card.guard.dispose();dom.window.close();}};
}

test('actual Build1 host forwards tagged secured event into the mounted Reports lifecycle',async()=>{
 const f=hostFixture();let rows=[structuredClone(original)];
 f.setHook(q=>q.type==='manifest/get'?{domain:'ha_tools_email',version:'2.8.0'}:q.type.endsWith('list_schedules')?{schedules:structuredClone(rows)}:undefined);
 try{await tick();const reports=f.card._build1ReportsV53;assert.equal(reports.state().canManageSchedules,true,'host real schedule handshake');assert.equal(reports.state().schedules[0].time,'08:00');
  const before=f.calls.filter(q=>q.type.endsWith('list_schedules')).length;rows[0].time='08:15';f.signal({schedules_changed:true});await tick();
  assert.equal(reports.state().schedules[0].time,'08:15');assert.equal(reports.state().schedules[0].enabled,false);assert.equal(f.calls.filter(q=>q.type.endsWith('list_schedules')).length,before+1);assert.equal(f.maximum(),1);assert.equal(f.calls.some(q=>/set_schedule|send_now/.test(q.type)),false);
 }finally{f.close();}
});
