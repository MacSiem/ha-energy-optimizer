'use strict';
// NOT_RUN. Uses the real model, guard, Reports proxy and schedule controller.
const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{webcrypto}=require('node:crypto');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createEnergyModelV53}=require('../shared/ha-tools-energy-model.js');
const {createEnergyReportsActionsV53}=require('../shared/ha-tools-energy-reports-actions.js');
const scheduleSource=readFileSync(join(__dirname,'../shared/ha-tools-email-schedules.js'),'utf8').replace(/^export /gm,'');
// Match v53-native-recurring-schedules: browser crypto must not depend on Node's globals.
const createSchedules=new Function('globalThis',scheduleSource+';return createHaToolsEmailSchedules;')({crypto:webcrypto,navigator:{onLine:true}});
const tick=async()=>{for(let i=0;i<200;i++)await Promise.resolve();};
function fixture(){
 const dom=new JSDOM('<div id="reports"></div>',{url:'http://localhost/'}),root=dom.window.document.querySelector('#reports'),callbacks=new Set(),calls=[];
 let rows=[],holdRefresh=false,release=null,actions,model;
 const grants={energy_analysis:{visible:true,read:true},energy_reports:{visible:true,read:true,execute:true}};
 const caps=()=>({status:'ready',revision:1,energy_model_schema:'ha_tools.energy_report/1',capabilities:structuredClone(grants)});
 const connection=new dom.window.EventTarget();connection.connected=true;connection.subscribeMessage=async fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);};
 const card={isConnected:true,_hass:{user:{id:'owner',is_active:true,is_admin:true},connected:true,connection,config:{time_zone:'UTC'},locale:{language:'en'},callWS:async q=>{
  calls.push(q);
  if(q.type.endsWith('feature_capabilities'))return holdRefresh?new Promise(r=>release=()=>{holdRefresh=false;r(caps());}):caps();
  if(q.representation==='model')return {schema:'ha_tools.energy_report/1',period:{kind:q.period,timezone:'UTC',start:'2026-10-20T00:00:00Z',end:'2026-10-21T00:00:00Z'},totals:{},coverage:{},hourly:[]};
  if(q.type.endsWith('get_report_status'))return {schema:1,purpose:'energy_report',schedule_state:'unconfigured'};
  if(q.type.endsWith('list_delivery_targets'))return [{id:'persistent_notification',name:'HA',default:true}];
  if(q.type.endsWith('get_attempt_history'))return {schema:1,attempts:[]};
  if(q.type==='manifest/get')return {domain:'ha_tools_email',version:'2.8.0'};
  if(q.type.endsWith('list_schedules'))return {schedules:structuredClone(rows)};
  if(q.type.endsWith('set_schedule')){
   rows=[structuredClone(q.schedule)];
   // Backend has accepted this write, then its real secured subscription fires.
   holdRefresh=true;for(const fn of [...callbacks])fn();return {success:true};
  }
  throw Error('Unexpected '+q.type);
 }}};
 const guard=createTariffGuardV3({getHass:()=>card._hass,browser:null});
 model=createEnergyModelV53({card,guard,format:{forHass:()=>({language:'en'})},onChange:()=>actions?.update()});
 actions=createEnergyReportsActionsV53({card,guard,getCapabilities:()=>model.state().capabilities,isModelBusy:()=>model.state().busy,isActive:()=>true,createSchedules});
 model.update();actions.mount(root);
 const review=()=>{assert.equal(actions.scheduleAction('add'),true);const time=root.querySelector('[data-schedule-field="time"]');assert.ok(time);time.value='08:00';time.dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal(actions.reviewSchedule(),true);};
 const ready=async()=>{await tick();assert.equal(model.state().status,'ready','model startup');assert.equal(model.state().busy,false);assert.equal(guard.occupied(),false,'startup wire settled');assert.equal(actions.state().status,'ready','Reports startup');assert.equal(actions.state().canManageSchedules,true,'schedule store completed manifest/list handshake');assert.ok(calls.some(q=>q.type==='manifest/get'));assert.ok(calls.some(q=>q.type==='ha_tools_email/list_schedules'));};
 return {dom,card,guard,model,actions,root,calls,grants,ready,review,release:()=>{assert.equal(typeof release,'function');release();},close:()=>{release?.();actions.stop();model.stop();guard.dispose();dom.window.close();}};
}
test('own secured update after ACK confirms disabled schedule by fresh readback without replay',async()=>{
 const f=fixture();try{await f.ready();f.review();const saving=f.actions.confirmSchedule();await tick();assert.equal(f.calls.filter(q=>q.type.endsWith('set_schedule')).length,1);assert.equal(f.calls.find(q=>q.type.endsWith('set_schedule')).schedule.enabled,false);assert.equal(f.model.state().capabilities,null);
  const before=f.calls.filter(q=>q.type.endsWith('list_schedules')).length;f.release();assert.equal(await saving,true);await tick();assert.ok(f.calls.filter(q=>q.type.endsWith('list_schedules')).length>before);assert.equal(f.actions.state().schedules.length,1);assert.equal(f.actions.state().schedules[0].time,'08:00');assert.equal(f.actions.state().schedules[0].enabled,false);assert.equal(f.calls.filter(q=>q.type.endsWith('set_schedule')).length,1);assert.equal(f.calls.some(q=>q.type.endsWith('send_now')),false);
 }finally{f.close();}
});
test('revocation during own update denies readback and never replays the accepted write',async()=>{
 const f=fixture();try{await f.ready();f.review();const saving=f.actions.confirmSchedule();await tick();const before=f.calls.filter(q=>q.type.endsWith('list_schedules')).length;f.grants.energy_reports={visible:false,read:false,execute:false};f.release();assert.equal(await saving,false);await tick();assert.equal(f.calls.filter(q=>q.type.endsWith('list_schedules')).length,before);assert.equal(f.actions.state().schedules.length,0);assert.equal(f.calls.filter(q=>q.type.endsWith('set_schedule')).length,1);assert.equal(f.calls.some(q=>q.type.endsWith('send_now')),false);
 }finally{f.close();}
});
