'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEnergyAnalysisBindingV53}=require('../shared/ha-tools-energy-analysis-binding.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(response=null){
 const subscriptions=[],reads=[],unsubscribed=[],invalidations=[];
 const card={isConnected:true,_hass:{user:{id:'one'},config:{time_zone:'UTC'},connection:{connected:true,
  subscribeMessage(handler,{type}){return new Promise((resolve,reject)=>subscriptions.push({handler,type,resolve,reject}));}}}};
 let value={status:'idle',snapshot:null};
 const controller={connect(){},disconnect(){value={status:'idle',snapshot:null};},
  invalidate(){invalidations.push(true);value={status:'idle',snapshot:null};},state:()=>value,
  read(selection){reads.push(selection);if(response)return Promise.resolve().then(()=>response(selection)).then(result=>{value=result;return value;});value={status:'ready',snapshot:{selection}};return Promise.resolve(value);}};
 let notifications=0;
 const binding=createEnergyAnalysisBindingV53({card,controller,onInvalidate:()=>notifications++});
 const ack=index=>subscriptions[index].resolve(()=>unsubscribed.push(index));
 return {card,subscriptions,reads,unsubscribed,invalidations,binding,ack,get notifications(){return notifications;}};
}
test('inactive view does not subscribe or read; manual observation stays idle',async()=>{
 const s=setup();s.binding.observe();await tick();assert.equal(s.subscriptions.length,0);assert.equal(s.reads.length,0);
});
test('first analysis read waits for the dedicated acknowledgement and preserves only newest intent',async()=>{
 const s=setup();const old=s.binding.read({period:'day'});const newest=s.binding.read({period:'month'});
 await tick();assert.deepEqual(s.subscriptions.map(x=>x.type),['ha_tools_email/subscribe_analysis_updates']);
 assert.equal(s.reads.length,0);s.ack(0);
 await old;await newest;assert.deepEqual(s.reads,[{period:'month'}]);s.binding.stop();
});
test('events clear visible data and notify the active view without starting autonomous IO',async()=>{
 const s=setup();const read=s.binding.read({period:'day'});await tick();s.ack(0);await read;
 s.subscriptions[0].handler({data:{registry_revision:3}});
 assert.equal(s.binding.observe().snapshot,null);assert.equal(s.notifications,1);assert.equal(s.reads.length,1);
 s.subscriptions[0].handler({data:{revision:4}});assert.equal(s.notifications,2);assert.equal(s.invalidations.length,2);s.binding.stop();
});
test('disconnect during subscription acknowledgement disposes the late handler exactly once',async()=>{
 const s=setup();const read=s.binding.read({period:'day'});await tick();s.binding.stop();s.ack(0);
 await read;await tick();assert.deepEqual(s.unsubscribed.sort(),[0]);assert.equal(s.reads.length,0);
 s.subscriptions[0].handler({});assert.equal(s.notifications,0);s.binding.stop();assert.equal(s.unsubscribed.length,1);
});
for(const key of ['user','connection','zone'])test(`old ${key} callbacks and pending subscriptions cannot revive data`,async()=>{
 const s=setup();const read=s.binding.read({period:'day'});await tick();
 if(key==='user')s.card._hass.user={id:'two'};
 if(key==='connection')s.card._hass.connection={...s.card._hass.connection};
 if(key==='zone')s.card._hass.config={time_zone:'Europe/Warsaw'};
 assert.equal(s.binding.observe().snapshot,null);s.ack(0);await read;await tick();
 assert.deepEqual(s.unsubscribed.sort(),[0]);assert.equal(s.reads.length,0);s.subscriptions[0].handler({});assert.equal(s.notifications,0);
});
test('subscription rejection never starts data IO',async()=>{
 const s=setup();const read=s.binding.read({period:'day'});await tick();s.subscriptions[0].reject(Error('network'));
 const result=await read;assert.equal(result.snapshot,null);assert.equal(result.error,'analysis_subscription_unavailable');
 assert.equal(s.binding.observe().status,'error');assert.deepEqual(s.unsubscribed,[]);assert.equal(s.reads.length,0);
});
test('same identity hass wrapper does not resubscribe and confirmed revision invalidation is explicit',async()=>{
 const s=setup();const read=s.binding.read({period:'day'});await tick();s.ack(0);await read;
 s.card._hass={...s.card._hass,user:{id:'one'},config:{time_zone:'UTC'}};
 await s.binding.read({period:'week'});assert.equal(s.subscriptions.length,1);
 s.binding.invalidate();assert.equal(s.binding.observe().snapshot,null);assert.equal(s.notifications,1);assert.equal(s.reads.length,2);
 s.binding.stop();assert.deepEqual(s.unsubscribed.sort(),[0]);
});

for(const error of [{code:'unauthorized'},Error('unknown_command')])test('generic subscription failure cannot probe or enable legacy '+String(error.code||error.message),async()=>{
 const s=setup(),read=s.binding.read({period:'day'});await tick();s.subscriptions[0].reject(error);
 assert.equal((await read).error,'analysis_subscription_unavailable');assert.equal(s.reads.length,0);
});

test('unknown subscription permits only one masked controller probe; unknown analysis enables legacy',async()=>{
 const s=setup(()=>({status:'error',snapshot:null,error:'unknown_command'}));
 const result=s.binding.read({period:'day'});await tick();s.subscriptions[0].reject({code:'unknown_command'});
 assert.equal((await result).error,'unknown_command');assert.equal(s.binding.observe().snapshot,null);
 await s.binding.read({period:'month'});assert.equal(s.reads.length,1);s.binding.stop();
});
for(const status of ['ready','unauthorized','network'])test('unacknowledged probe '+status+' stays masked and fails closed',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});const s=setup(()=>pending);
 const first=s.binding.read({period:'day'});await tick();s.subscriptions[0].reject({code:'unknown_command'});await tick();
 const newest=s.binding.read({period:'month'});await tick();assert.equal(s.reads.length,1);
 assert.equal(s.binding.observe().snapshot,null);
 finish(status==='ready'?{status:'ready',snapshot:{private:'secret'}}:{status:'error',snapshot:null,error:status});
 assert.equal((await first).snapshot,null);assert.equal((await newest).error,'analysis_subscription_unavailable');
 assert.equal(s.binding.observe().snapshot,null);assert.equal(s.reads.length,1);s.binding.stop();
});
