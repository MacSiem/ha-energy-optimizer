'use strict';
// NOT_RUN. Owner regenerates consumers, then checks RED against aceb934 and GREEN.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{JSDOM}=require('jsdom');
const {createEnergyModelV53}=require('../shared/ha-tools-energy-model.js');
const {energyBackend,drainBackend}=require('./helpers/energy-backend-fixture.cjs');
const tick=async()=>{for(let i=0;i<100;i++)await Promise.resolve();};
const profile=()=>({schema:1,name:'Shared CHF',currency:'CHF',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'day',zones:[{id:'day',energyRate:1,variableRate:.2}],rules:[]});
function actual(type){
 const dom=new JSDOM('',{runScripts:'outside-only',url:'http://localhost/'});
 dom.window.eval(['src/optimizer.js','src/energy-insights.js','src/energy-email.js'].map(p=>readFileSync(join(__dirname,'..',p),'utf8')).join(''));
 const card=dom.window.document.createElement(type);card._schedule=()=>{};card._config.show_support=false;
 return {dom,card};
}
for(const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'])test(`${type}: real consumer wrapper passes model reservation and still fences revoked authority`,async()=>{
 const {dom,card}=actual(type),calls=[];let client;
 const connection=new dom.window.EventTarget();connection.connected=true;connection.subscribeMessage=async()=>()=>{};
 card._hass={user:{id:'model-fixture',is_admin:true,is_active:true},connection,connected:true,config:{time_zone:'UTC'},locale:{language:'en'},callWS:async q=>{
  calls.push(q);if(q.type.endsWith('feature_capabilities'))return {status:'ready',revision:1,energy_model_schema:'ha_tools.energy_report/1',capabilities:{energy_analysis:{visible:true,read:true},energy_reports:{visible:false,read:false}}};
  if(q.representation==='model')return {schema:'ha_tools.energy_report/1',period:{kind:q.period,timezone:'UTC',start:'2026-10-20T00:00:00Z',end:'2026-10-21T00:00:00Z'},totals:{},coverage:{},hourly:[]};
  throw {code:'unknown_command'};
 }};
 try{
  // Real generated host/consumer installs the production guard.call wrapper.
  // Keep its native startup outside the model assertion; use the real DOM mount.
  const host=card._getTariffHostV3();card.preview=true;dom.window.document.body.append(card);await drainBackend();card.preview=false;calls.length=0;
  client=createEnergyModelV53({card,guard:host.guard,format:{forHass:()=>({language:'en'})}});client.update();await tick();
  assert.equal(client.state().status,'ready');assert.equal(client.state().model.schema,'ha_tools.energy_report/1');assert.equal(calls.filter(q=>q.representation==='model').length,2);assert.equal(host.guard.occupied(),false);
  const token=host.guard.snapshot(),owner=host.guard.reserve(token);card._hass.user.is_active=false;
  await assert.rejects(host.guard.call(token,{type:'ha_tools_email/feature_capabilities'},false,owner),e=>e.code==='authority_changed');owner.release();
  assert.equal(client.state().model,null);assert.equal(calls.some(q=>/set_tariff|set_schedule|send_now/.test(q.type)),false);
 }finally{client?.stop();card.remove();card._tariffHostController?.backend.invalidate();card._tariffHostController?.guard.dispose();dom.window.close();}
});
for(const offline of [false,true])test(`actual Insights reconfirms CHF after daily navigation while a snapshot owns raw, offline=${offline}`,async()=>{
 const {dom,card}=actual('ha-energy-insights'),calls=[];let hold=false,release;
 const connection=new dom.window.EventTarget();connection.connected=true;
 card._hass={user:{id:'navigation-fixture',is_admin:true},connection,states:{},language:'en',config:{currency:'PLN',time_zone:'UTC'}};
 const backend=energyBackend(card,async q=>{calls.push(q);if(q.type==='ha_tools_email/get_tariff')return {profile:profile(),revision:4,updated_at:null};throw Error('Unexpected '+q.type);});
 card._hass.callWS=q=>hold&&q.type==='ha_tools_email/energy_snapshot'?new Promise(resolve=>{release=()=>resolve(backend(q));}):backend(q);
 try{
  dom.window.document.body.append(card);await card._loadSharedTariffProfile();card._render();await drainBackend();assert.equal(card._sharedTariffProfile.currency,'CHF');
  const host=card._getTariffHostV3();assert.equal(host.guard.occupied(),false);hold=true;
  const snapshot=host.guard.call(host.guard.snapshot(),{type:'ha_tools_email/energy_snapshot'}).catch(e=>e);
  assert.equal(typeof release,'function');if(offline){dom.window.dispatchEvent(new dom.window.Event('offline'));dom.window.dispatchEvent(new dom.window.Event('online'));}
  const button=card.shadowRoot.querySelector('[data-tab="daily"]');assert.ok(button);button.click();await tick();
  assert.equal(calls.filter(q=>q.type==='ha_tools_email/get_tariff').length,1,'no dispatch before actual raw settlement');assert.equal(card._sharedTariffProfile,null,'old context stays purged while waiting');
  hold=false;release();await snapshot;await drainBackend();
  assert.equal(card._sharedTariffProfile?.currency,'CHF');assert.equal(host.snapshot().provenance,'shared_backend');assert.equal(calls.filter(q=>q.type==='ha_tools_email/get_tariff').length,2);assert.equal(calls.some(q=>/set_tariff|set_schedule|send_now/.test(q.type)),false);
 }finally{hold=false;release?.();card.remove();card._tariffHostController?.backend.invalidate();card._tariffHostController?.guard.dispose();dom.window.close();}
});
test('queued tariff reconfirmation is discarded on authority loss before raw settlement',async()=>{
 const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js'),{createEnergyTariffV3}=require('../shared/ha-tools-energy-tariff.js');
 let release;const calls=[],card={_config:{},_hass:{user:{id:'waiting',is_active:true},connection:{connected:true},config:{time_zone:'UTC'},callWS:q=>{calls.push(q);if(q.type==='occupied')return new Promise(r=>release=r);return Promise.resolve({profile:profile(),revision:4,updated_at:null});}}};
 const host=createTariffHostV3({card,kind:'insights',createModel:createEnergyTariffV3,legacyProfile:c=>c.tariff_profile||null,createSettings:()=>{},createUi:()=>({})});
 try{const raw=host.guard.call(host.guard.snapshot(),{type:'occupied'}).catch(e=>e);const waiting=host.load();card._hass.user.is_active=false;host.reset();assert.equal(await waiting,false);release({});await raw;await tick();assert.equal(calls.filter(q=>q.type==='ha_tools_email/get_tariff').length,0);assert.equal(card._sharedTariffProfile,null);assert.equal(host.guard.occupied(),false);}finally{release?.({});host.backend.invalidate();host.guard.dispose();}
});


test('three native card startups do not saturate the four-slot Recorder admission with obsolete reads',async()=>{
 const dom=new JSDOM('',{runScripts:'outside-only',url:'http://localhost/'}),w=dom.window,calls=[],held=[];
 w.eval(['src/optimizer.js','src/energy-insights.js','src/energy-email.js'].map(p=>readFileSync(join(__dirname,'..',p),'utf8')).join(''));
 const connection=new w.EventTarget();connection.connected=true;connection.subscribeMessage=async()=>()=>{};
 let pending=0,maximum=0;
 const caps={status:'ready',revision:1,energy_model_schema:'ha_tools.energy_report/1',capabilities:{energy_analysis:{visible:true,read:true},energy_reports:{visible:false,read:false},energy_tariff:{visible:false,read:false}}};
 const hass={user:{id:'startup',is_admin:true,is_active:true},connection,connected:true,states:{},services:{},config:{time_zone:'UTC',currency:'EUR'},locale:{language:'en'},callWS:async q=>{
  calls.push(q);
  if(q.type.endsWith('feature_capabilities'))return structuredClone(caps);
  if(q.type.endsWith('get_config'))return {schedules:[]};
  if(/preview_energy_report|energy_analysis$/.test(q.type)||q.representation==='model'){
   if(pending>=4)throw {code:q.representation==='model'?'energy_report_unavailable':'energy_analysis_unavailable'};
   pending++;maximum=Math.max(maximum,pending);
   await new Promise(r=>held.push(r));pending--;
   if(q.representation==='model')return {schema:'ha_tools.energy_report/1',period:{kind:q.period,timezone:'UTC',start:'2026-10-20T00:00:00Z',end:'2026-10-21T00:00:00Z'},totals:{},coverage:{},hourly:[]};
   return {};
  }
  throw {code:'unknown_command'};
 }};
 const cards=['ha-energy-optimizer','ha-energy-insights','ha-energy-email'].map(type=>{
  const c=w.document.createElement(type);c._schedule=()=>{};c.setConfig({show_support:false});w.document.body.append(c);c.hass=hass;return c;
 });
 try{
  for(let i=0;i<8;i++){await tick();held.splice(0).forEach(r=>r());}
  await tick();
  assert.deepEqual(cards.map(c=>c._build1ClientV53?.state().status),['ready','ready','ready'],JSON.stringify({calls:calls.map(q=>q.type),states:cards.map(c=>c._build1ClientV53?.state())}));
  assert.equal(calls.filter(q=>/preview_energy_report|energy_analysis$/.test(q.type)).length,0,'schema model replaces obsolete automatic analysis and three eager mail previews');
  assert.ok(maximum<=3);
 }finally{held.splice(0).forEach(r=>r());for(const c of cards){c.remove();c._tariffHostController?.backend.invalidate();c._tariffHostController?.guard.dispose();}dom.window.close();}
});
