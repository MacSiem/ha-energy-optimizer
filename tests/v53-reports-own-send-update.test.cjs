'use strict';
// NOT_RUN. Real model + guard + Reports + schedule handshake; fake server only.
const {test}=require('node:test'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{webcrypto}=require('node:crypto');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createEnergyModelV53}=require('../shared/ha-tools-energy-model.js');
const {createEnergyReportsActionsV53}=require('../shared/ha-tools-energy-reports-actions.js');
const source=readFileSync(join(__dirname,'../shared/ha-tools-email-schedules.js'),'utf8').replace(/^export /gm,'');
const createSchedules=new Function('globalThis',source+';return createHaToolsEmailSchedules;')({crypto:webcrypto,navigator:{onLine:true}});
const tick=async()=>{for(let i=0;i<200;i++)await Promise.resolve();};
const accepted=()=>({ok:true,status:'accepted_by_notify',attempt_id:'test-attempt',history_status:'recorded',channels:[{channel:'persistent_notification',ok:true,status:'accepted_by_notify',attempt_id:'test-attempt',history_status:'recorded'}]});
function fixture({timeoutMs=15000}={}){
 const dom=new JSDOM('<div id="reports"></div>',{url:'http://localhost/'}),root=dom.window.document.querySelector('#reports'),calls=[],callbacks=new Set();
 let actions,model,holdRefresh=false,releaseCaps=null,releaseAck=null,rejectAck=null;
 const grants={energy_analysis:{visible:true,read:true},energy_reports:{visible:true,read:true,execute:true}};
 const caps=()=>({status:'ready',revision:1,energy_model_schema:'ha_tools.energy_report/1',capabilities:structuredClone(grants)});
 const connection=new dom.window.EventTarget();connection.connected=true;connection.subscribeMessage=async fn=>{callbacks.add(fn);return()=>callbacks.delete(fn);};
 const card={isConnected:true,_hass:{user:{id:'owner',is_active:true,is_admin:true},connected:true,connection,config:{time_zone:'UTC'},locale:{language:'en'},callWS:async q=>{
  calls.push(q);
  if(q.type.endsWith('feature_capabilities'))return holdRefresh?new Promise(r=>releaseCaps=()=>{holdRefresh=false;r(caps());}):caps();
  if(q.representation==='model')return {schema:'ha_tools.energy_report/1',period:{kind:q.period,timezone:'UTC',start:'2026-10-21T00:00:00Z',end:'2026-10-22T00:00:00Z'},totals:{},coverage:{},hourly:[]};
  if(q.type.endsWith('get_report_status'))return {schema:1,purpose:'energy_report',schedule_state:'unconfigured'};
  if(q.type.endsWith('list_delivery_targets'))return [{id:'persistent_notification',name:'HA',default:true}];
  if(q.type.endsWith('get_attempt_history'))return {schema:1,attempts:[]};
  if(q.type==='manifest/get')return {domain:'ha_tools_email',version:'2.8.0'};
  if(q.type.endsWith('list_schedules'))return {schedules:[]};
  if(q.type.endsWith('send_now')){
   holdRefresh=true;for(const fn of [...callbacks])fn();
   return new Promise((resolve,reject)=>{releaseAck=(value=accepted())=>resolve(value);rejectAck=reject;});
  }
  throw Error('Unexpected '+q.type);
 }}};
 const guard=createTariffGuardV3({getHass:()=>card._hass,browser:null,timeoutMs});
 model=createEnergyModelV53({card,guard,format:{forHass:()=>({language:'en'})},onChange:()=>actions?.update()});
 actions=createEnergyReportsActionsV53({card,guard,getCapabilities:()=>model.state().capabilities,isModelBusy:()=>model.state().busy,isActive:()=>true,createSchedules});
 model.update();actions.mount(root);
 const ready=async()=>{await tick();assert.equal(model.state().status,'ready');assert.equal(model.state().busy,false);assert.equal(actions.state().status,'ready');assert.equal(actions.state().canManageSchedules,true);assert.equal(guard.occupied(),false);assert.ok(calls.some(q=>q.type==='manifest/get'));assert.ok(calls.some(q=>q.type==='ha_tools_email/list_schedules'));};
 const review=()=>{assert.equal(actions.openSend(),true);assert.equal(actions.review(),true);};
 const sends=()=>calls.filter(q=>q.type.endsWith('send_now'));
 return {dom,card,guard,model,actions,root,grants,calls,ready,review,sends,ack:v=>{assert.equal(typeof releaseAck,'function');releaseAck(v);},reject:e=>{assert.equal(typeof rejectAck,'function');rejectAck(e);},refresh:()=>{assert.equal(typeof releaseCaps,'function');releaseCaps();},close:()=>{holdRefresh=false;releaseAck?.();releaseCaps?.();actions.stop();model.stop();guard.dispose();dom.window.close();}};
}
test('accepted native ACK survives its own secured model update and never repeats send_now',async()=>{
 const f=fixture();try{await f.ready();f.review();const sending=f.actions.confirm();await tick();assert.equal(f.sends().length,1);assert.equal(f.model.state().capabilities,null);assert.equal(await f.actions.confirm(),false);
  f.ack();assert.equal(await sending,true);assert.equal(f.actions.state().outcome,'accepted_by_notify');await tick();assert.equal(f.model.state().capabilities,null);f.refresh();await tick();assert.equal(f.actions.state().outcome,'accepted_by_notify');assert.match(f.root.textContent,/phone delivery is not confirmed/);assert.equal(f.sends().length,1);assert.equal(await f.actions.confirm(),false);assert.deepEqual(f.sends()[0].channels,['persistent_notification']);assert.equal(f.sends()[0].cadence,'daily');
 }finally{f.close();}
});
for(const edge of ['identity','offline'])test(`${edge} edge cannot publish an old native ACK or replay its consumed form`,async()=>{
 const f=fixture();try{await f.ready();f.review();const sending=f.actions.confirm();await tick();if(edge==='identity')f.card._hass.user={id:'other',is_active:false,is_admin:true};else f.card._hass.connection.connected=false;f.guard.observe();f.ack();assert.equal(await sending,false);await tick();assert.notEqual(f.actions.state().outcome,'accepted_by_notify');assert.doesNotMatch(f.root.textContent,/Accepted by Home Assistant/);assert.equal(f.sends().length,1);assert.equal(await f.actions.confirm(),false);
 }finally{f.close();}
});
test('fresh execute denial prevents any send wire despite the reviewed cached grant',async()=>{
 const f=fixture();try{await f.ready();f.review();f.grants.energy_reports.execute=false;assert.equal(await f.actions.confirm(),false);assert.equal(f.sends().length,0);assert.equal(f.actions.state().outcome,'not_sent');}finally{f.close();}
});
test('fresh read/execute revocation after ACK clears the accepted UI metadata',async()=>{
 const f=fixture();try{await f.ready();f.review();const sending=f.actions.confirm();await tick();f.ack();await sending;await tick();f.grants.energy_reports={visible:false,read:false,execute:false};f.refresh();await tick();assert.notEqual(f.actions.state().outcome,'accepted_by_notify');assert.doesNotMatch(f.root.textContent,/Accepted by Home Assistant/);assert.equal(f.sends().length,1);assert.equal(await f.actions.confirm(),false);}finally{f.close();}
});
test('transport rejection during own model update remains UNKNOWN with no replay',async()=>{
 const f=fixture();try{await f.ready();f.review();const sending=f.actions.confirm();await tick();f.reject({code:'send_failed'});assert.equal(await sending,false);assert.equal(f.actions.state().outcome,'outcome_unknown');await tick();f.refresh();await tick();assert.equal(f.actions.state().outcome,'outcome_unknown');assert.equal(await f.actions.confirm(),false);assert.equal(f.sends().length,1);}finally{f.close();}
});
test('timeout retains actual raw occupancy; late success does not rewrite UNKNOWN or replay',async()=>{
 const f=fixture({timeoutMs:20});try{await f.ready();f.review();assert.equal(await f.actions.confirm(),false);assert.equal(f.actions.state().outcome,'outcome_unknown');assert.equal(f.guard.occupied(),true);assert.equal(f.actions.openSend(),false);assert.equal(await f.actions.confirm(),false);f.ack();await tick();f.refresh();await tick();assert.equal(f.actions.state().outcome,'outcome_unknown');assert.equal(f.sends().length,1);}finally{f.close();}
});
test('malformed positive reply stays UNKNOWN after own subscription refresh',async()=>{
 const f=fixture();try{await f.ready();f.review();const sending=f.actions.confirm();await tick();f.ack({ok:true,status:'accepted_by_notify'});assert.equal(await sending,false);assert.equal(f.actions.state().outcome,'outcome_unknown');await tick();f.refresh();await tick();assert.equal(f.actions.state().outcome,'outcome_unknown');assert.equal(f.sends().length,1);}finally{f.close();}
});
