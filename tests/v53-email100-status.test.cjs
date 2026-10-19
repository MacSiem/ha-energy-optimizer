"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createReportStatusV53}=require('../shared/ha-tools-report-status.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const tick=async()=>{for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const facts=(purpose='energy_report')=>({schema:1,purpose,generated_at:'2026-10-19T08:00:00+00:00',schedule_state:'enabled',next_report_at:'2026-10-20T05:00:00+00:00',history_state:'ready',last_attempt:{timestamp:'2026-10-19T07:30:00+00:00',outcome:'accepted_by_smtp',recipient_count:0}});
function fixture({manualAck=false,ackError=null,purpose='energy_report',reply=()=>facts(purpose),timeoutMs=1000,sourceKey,external,onChange}={}){
 let surface=false,handler=reply,raw=0,maxRaw=0;const calls=[],subscriptions=[];
 const connection=new EventTarget();connection.connected=true;
 connection.subscribeMessage=(callback,message)=>{assert.deepEqual(message,{type:'ha_tools_email/subscribe_analysis_updates'});const ack=deferred(),row={callback,ack,active:false};row.confirm=()=>{row.active=true;ack.resolve(()=>{row.active=false;row.unsubs=(row.unsubs || 0)+1;});};subscriptions.push(row);if(ackError)ack.reject(ackError);else if(!manualAck)row.confirm();return ack.promise;};
 const card={isConnected:false,preview:false,_hass:{user:{id:'one',is_admin:false,is_active:true,groups:[]},connected:true,connection,config:{time_zone:'Europe/Warsaw'},callWS:async request=>{calls.push(clone(request));if(request.type==='unit/read_only_external' && external)return external();assert.deepEqual(request,{type:'ha_tools_email/get_report_status',purpose});raw++;maxRaw=Math.max(maxRaw,raw);try{return await handler(request);}finally{raw--;}}}};
 const guard=createTariffGuardV3({getHass:()=>card._hass,getContext:()=>card.config || null,browser:null,timeoutMs});
 const c=createReportStatusV53({card,guard,purpose,isActive:()=>surface,onChange,...(sourceKey?{getSourceKey:sourceKey}:{})});
 return {card,guard,c,calls,subscriptions,get maxRaw(){return maxRaw;},set reply(value){handler=value;},async mount(){surface=true;card.isConnected=true;c.update();await tick();},stop(){surface=false;card.isConnected=false;c.stop();},async remount(){surface=true;card.isConnected=true;c.update();await tick();},ack(){subscriptions.at(-1).confirm();},signal(){subscriptions.filter(row=>row.active).at(-1)?.callback({});},close(){surface=false;card.isConnected=false;c.stop();guard.dispose();}};
}
test('no metadata IO before active mount; ACK is mandatory; snapshot is a copied bounded purpose DTO',async()=>{
 const response=facts(),original=JSON.stringify(response),f=fixture({manualAck:true,reply:()=>response});try{
  f.c.state();f.c.update();await tick();assert.equal(f.calls.length,0);assert.equal(f.subscriptions.length,0);
  await f.mount();assert.equal(f.calls.length,0);assert.equal(f.subscriptions.length,1);f.ack();await tick();
  assert.equal(f.calls.length,1);const s=f.c.state();assert.equal(s.status,'ready');assert.equal(s.snapshot.last_attempt.recipient_count,0);s.snapshot.last_attempt.outcome='FORGED';assert.equal(f.c.state().snapshot.last_attempt.outcome,'accepted_by_smtp');assert.equal(JSON.stringify(response),original);
  f.stop();await tick();assert.equal(f.subscriptions[0].active,false);assert.equal(f.c.state().snapshot,null);assert.equal(f.calls.length,1);
 }finally{f.close();}
});
for(const purpose of ['energy_report','log_digest'])test('read isolates exact purpose '+purpose,async()=>{const f=fixture({purpose});try{await f.mount();assert.equal(f.c.state().snapshot.purpose,purpose);assert.equal(f.calls.length,1);}finally{f.close();}});
for(const [field,mutate] of Object.entries({
 future_schema:d=>d.schema=2,wrong_purpose:d=>d.purpose='log_digest',naive_generation:d=>d.generated_at='2026-10-19T08:00:00',invalid_date:d=>d.generated_at='2026-02-30T08:00:00Z',oversize_stamp:d=>d.generated_at='x'.repeat(65),
 count_boolean:d=>d.last_attempt.recipient_count=true,count_fraction:d=>d.last_attempt.recipient_count=.5,count_negative:d=>d.last_attempt.recipient_count=-1,count_limit:d=>d.last_attempt.recipient_count=100001,
 outcome:d=>d.last_attempt.outcome='delivered',oversize_outcome:d=>d.last_attempt.outcome='x'.repeat(65),naive_attempt:d=>d.last_attempt.timestamp='2026-10-19T07:30:00',future_attempt:d=>d.last_attempt.timestamp='2026-10-20T07:30:00Z',
 unknown_history:d=>d.history_state='future',unavailable_history_with_fact:d=>d.history_state='unavailable',disabled_future:d=>d.schedule_state='disabled',enabled_without_next:d=>d.next_report_at=null,past_next:d=>d.next_report_at=d.generated_at,
 unknown_field:d=>d.private_config='PRIVATE_'+ 'x'.repeat(10000),unknown_attempt_field:d=>d.last_attempt.recipients=['PRIVATE@example.invalid']
}))test('invalid bounded metadata stays Unknown with no private fallback: '+field,async()=>{
 const d=facts();mutate(d);const f=fixture({reply:()=>d});try{await f.mount();assert.equal(f.c.state().status,'unavailable');assert.equal(f.c.state().snapshot,null);assert.equal(f.calls.length,1);assert.equal(f.c.state().busy,false);}finally{f.close();}
});
test('unknown recipient_count is null, true zero and 100000 remain numeric facts; unconfigured never becomes a send claim',async()=>{
 const f=fixture();try{await f.mount();for(const count of [null,0,100000]){f.reply=()=>{const d=facts();d.last_attempt.recipient_count=count;return d;};f.signal();await tick();assert.equal(f.c.state().snapshot.last_attempt.recipient_count,count);}
  f.reply=()=>({...facts(),schedule_state:'unconfigured',next_report_at:null,history_state:'ready',last_attempt:null});f.signal();await tick();assert.equal(f.c.state().status,'ready');assert.equal(f.c.state().snapshot.next_report_at,null);assert.equal(f.c.state().snapshot.last_attempt,null);
 }finally{f.close();}
});
for(const code of ['unauthorized','unknown_command'])test('ACK refusal '+code+' never reads or falls back',async()=>{const f=fixture({ackError:{code}});try{await f.mount();assert.equal(f.calls.length,0);assert.equal(f.c.state().snapshot,null);assert.equal(f.c.state().status,code==='unauthorized'?'denied':'unsupported');}finally{f.close();}});
for(const code of ['unauthorized','unknown_command'])test('endpoint refusal '+code+' never reads a private replacement',async()=>{const f=fixture({reply:()=>Promise.reject({code})});try{await f.mount();assert.equal(f.calls.length,1);assert.equal(f.c.state().snapshot,null);assert.equal(f.c.state().status,code==='unauthorized'?'denied':'unsupported');}finally{f.close();}});
test('events synchronously purge facts, coalesce bursts and discard in-flight older revisions',async()=>{
 const pending=deferred(),f=fixture();try{
  await f.mount();f.reply=()=>pending.promise;f.signal();assert.equal(f.c.state().snapshot,null);f.signal();f.signal();await tick();assert.equal(f.calls.length,2);
  f.reply=()=>({...facts(),last_attempt:{...facts().last_attempt,recipient_count:7}});f.signal();f.signal();await tick();assert.equal(f.calls.length,2);pending.resolve(facts());await tick();assert.equal(f.calls.length,3);assert.equal(f.maxRaw,1);assert.equal(f.c.state().snapshot.last_attempt.recipient_count,7);
 }finally{pending.resolve(facts());f.close();}
});
for(const change of ['identity','admin','inactive','groups','source','offline'])test('fresh guard '+change+' clears facts and fences a delayed reply',async()=>{
 const old=deferred(),f=fixture();try{
  await f.mount();f.reply=()=>old.promise;f.signal();await tick();assert.equal(f.calls.length,2);
  f.reply=()=>({...facts(),last_attempt:{...facts().last_attempt,recipient_count:9}});
  if(change==='identity')f.card._hass.user.id='two';if(change==='admin')f.card._hass.user.is_admin=true;if(change==='inactive')f.card._hass.user.is_active=false;if(change==='groups')f.card._hass.user.groups=['new'];if(change==='source')f.guard.invalidate();if(change==='offline'){f.card._hass.connection.connected=false;f.card._hass.connection.dispatchEvent(new Event('disconnected'));}
  assert.equal(f.c.state().snapshot,null);await tick();assert.equal(f.calls.length,2);old.resolve({...facts(),last_attempt:{...facts().last_attempt,recipient_count:12345}});await tick();assert.equal(f.maxRaw,1);assert.notEqual(f.c.state().snapshot?.last_attempt?.recipient_count,12345);
  if(!['inactive','offline'].includes(change))assert.equal(f.c.state().snapshot.last_attempt.recipient_count,9);
 }finally{old.resolve(facts());f.close();}
});
test('retained instance holds raw after stop/remount and public timeout until actual wire settlement',async()=>{
 const old=deferred(),f=fixture({timeoutMs:5,reply:()=>old.promise});try{
  await f.mount();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(f.c.state().status,'unavailable');assert.equal(f.c.state().busy,true);assert.equal(f.guard.occupied(),true);
  const retained=f.c;f.stop();f.reply=()=>facts();await f.remount();f.signal();await tick();assert.equal(f.c,retained);assert.equal(f.calls.length,1);assert.equal(f.c.state().snapshot,null);
  old.resolve(facts());await tick();assert.equal(f.maxRaw,1);assert.equal(f.calls.length,2);assert.equal(f.c.state().status,'ready');assert.equal(f.c.state().busy,false);
 }finally{old.resolve(facts());f.close();}
});
test('late ACK after stop unsubscribes exactly once and does not dispatch',async()=>{const f=fixture({manualAck:true});try{await f.mount();f.stop();f.ack();await tick();assert.equal(f.subscriptions[0].active,false);assert.equal(f.subscriptions[0].unsubs,1);assert.equal(f.calls.length,0);}finally{f.close();}});
test('getSourceKey accepts a primitive epoch only; an object cannot clear or create a lane',async()=>{let key={};const f=fixture({sourceKey:()=>key});try{await f.mount();assert.equal(f.calls.length,0);assert.equal(f.subscriptions.length,0);assert.equal(f.c.state().snapshot,null);key=1;f.c.update();await tick();assert.equal(f.calls.length,1);}finally{f.close();}});

test('a pre-existing shared guard request holds the metadata pump without creating a replacement factory',async()=>{
 const pending=deferred(),f=fixture({external:()=>pending.promise});try{
  await f.mount();const retained=f.c,operation=f.guard.call(f.guard.snapshot(),{type:'unit/read_only_external'});assert.equal(f.guard.occupied(),true);
  f.signal();await tick();assert.equal(f.calls.length,2);assert.equal(f.c.state().snapshot,null);assert.equal(f.c,retained);
  pending.resolve({});await operation;await tick();assert.equal(f.calls.length,3);assert.equal(f.c.state().status,'ready');
 }finally{pending.resolve({});f.close();}
});

test('an active known calendar boundary expires into one bounded status re-read, never a send',async()=>{
 let reads=0;const first=facts();first.generated_at='2026-10-19T08:00:00.000Z';first.next_report_at='2026-10-19T08:00:00.010Z';
 const f=fixture({reply:()=>++reads===1?first:{...facts(),schedule_state:'unconfigured',next_report_at:null}});try{
  await f.mount();await new Promise(resolve=>setTimeout(resolve,30));await tick();assert.equal(f.calls.length,2);assert.equal(f.c.state().snapshot.schedule_state,'unconfigured');assert.ok(f.calls.every(q=>q.type==='ha_tools_email/get_report_status'));
 }finally{f.close();}
});

// Transport latency must consume the server's known calendar budget.
test('delayed reply never publishes an already elapsed next occurrence and refreshes once after raw settlement',async()=>{
 const old=deferred(),observed=[],d=facts();d.generated_at='2026-10-19T08:00:00.000Z';d.next_report_at='2026-10-19T08:00:00.010Z';
 const f=fixture({reply:()=>old.promise,onChange:()=>observed.push(f.c.state().snapshot?.next_report_at)});try{
  await f.mount();assert.equal(f.calls.length,1);await new Promise(resolve=>setTimeout(resolve,30));
  f.reply=()=>({...facts(),schedule_state:'unconfigured',next_report_at:null});old.resolve(d);await tick();
  assert.equal(observed.includes(d.next_report_at),false,'expired calendar fact must never be emitted as ready');
  assert.equal(f.calls.length,2);assert.equal(f.maxRaw,1);assert.equal(f.c.state().snapshot.schedule_state,'unconfigured');
 }finally{old.resolve(d);f.close();}
});
