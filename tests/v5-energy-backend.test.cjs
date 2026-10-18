'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createEnergyBackendV5}=require('../shared/ha-tools-energy-backend.js');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createEnergyTariffV3}=require('../shared/ha-tools-energy-tariff.js');
const profile={schema:1,currency:'CHF',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'a',zones:[{id:'a',energyRate:2,variableRate:0.5,classification:'cheap'}]};
const row=(i=0)=>({from:1792281600000+i*3600000,to:1792285200000+i*3600000,kwh:3});
const tick=()=>new Promise(r=>setImmediate(r));
async function drain(){for(let i=0;i<30;i++)await tick();}
function setup({timeoutMs=1000,shared=false,tariff=profile}={}){
 const calls=[],card={_hass:{user:{id:'one'},connection:{connected:true},config:{time_zone:'UTC'}},_config:{}};
 let descriptor={profile:tariff,source:shared?'shared':'override',revision:shared?4:null};
 const oracle=request=>({schema:1,profile_source:shared?'shared':'override',tariff_revision:shared?4:null,results:request.queries.map(q=>createEnergyTariffV3(profile).priceBuckets(q.buckets,q.coverage))});
 card._hass.callWS=async request=>{calls.push(request);if(request.type.endsWith('energy_snapshot'))return {schema:1,generated_at:new Date().toISOString(),profile_source:descriptor.source,tariff_revision:descriptor.revision,status:'partial',currency:'CHF',measurement_timezone:'UTC',tariff_timezone:'UTC',tariff_clock:{mode:'civil'},current:{at:new Date().toISOString(),available:true,zone_class:'cheap',cheap:true,energy_rate:2,variable_rate:0.5,usage_rate:2.5},next_cheap:{status:'unknown',start:null},today:{usage_cost:7.5,energy_cost:6,variable_cost:1.5}};return oracle(request);};
 const guard=createTariffGuardV3({getHass:()=>card._hass,getContext:()=>card._config,browser:null,timeoutMs});
 let refreshed=0,mismatch=0;
 const backend=createEnergyBackendV5({card,guard,describe:()=>descriptor,onPrices:()=>refreshed++,onRevision:()=>mismatch++});
 return {card,calls,guard,backend,oracle,get refreshed(){return refreshed;},get mismatch(){return mismatch;},setDescriptor:d=>descriptor=d};
}
test('production pricing is unknown until the backend answers; duplicates coalesce and negative/null values survive',async()=>{const s=setup();try{const first=s.backend.priceBuckets([row()]);assert.equal(first.energyCost,null);assert.equal(first.rows[0].available,false);s.backend.priceBuckets([row()]);await drain();const result=s.backend.priceBuckets([row()]);assert.equal(result.energyCost,6);assert.equal(result.usageCost,7.5);assert.equal(s.calls.filter(c=>c.queries).length,1);assert.equal(s.calls.find(c=>c.queries).profile.currency,'CHF');assert.equal(s.refreshed,1);}finally{s.guard.dispose();}});
test('missing shared profile and explicit override null remain different wire requests',async()=>{const s=setup({shared:true});try{s.backend.priceBuckets([row()]);s.backend.snapshot();await drain();assert.ok(s.calls.every(c=>!Object.hasOwn(c,'profile')));s.setDescriptor({profile:null,source:'override',revision:null});s.backend.snapshot();await drain();assert.equal(s.calls.at(-1).profile,null);}finally{s.guard.dispose();}});
test('late old-account response cannot populate cache or compact snapshot',async()=>{const s=setup();try{let resolve;s.card._hass.callWS=request=>new Promise(r=>resolve=()=>r(s.oracle(request)));s.backend.priceBuckets([row()]);await tick();s.card._hass={...s.card._hass,user:{id:'two'}};s.guard.observe();resolve();await drain();assert.equal(s.card._energySnapshotV5,null);assert.equal(s.refreshed,0);}finally{s.guard.dispose();}});
test('a public timeout retains raw occupancy and does not retry the same query',async()=>{const s=setup({timeoutMs:5});try{let resolve;s.card._hass.callWS=request=>{s.calls.push(request);return new Promise(r=>resolve=()=>r(s.oracle(request)));};s.backend.priceBuckets([row()]);await new Promise(r=>setTimeout(r,20));assert.equal(s.guard.occupied(),true);assert.equal(s.backend.priceBuckets([row()]).energyCost,null);await tick();assert.equal(s.calls.length,1);resolve();await drain();assert.equal(s.guard.occupied(),false);assert.equal(s.backend.priceBuckets([row()]).energyCost,null);assert.equal(s.calls.length,1);}finally{s.guard.dispose();}});
test('malformed/nonfinite pricing does not become a cached valid cost',async()=>{const s=setup();try{s.card._hass.callWS=async request=>{const result=s.oracle(request);result.results[0].energyCost=Infinity;return result;};s.backend.priceBuckets([row()]);await drain();assert.equal(s.backend.priceBuckets([row()]).energyCost,null);}finally{s.guard.dispose();}});
test('revision mismatch clears all prices and snapshot instead of showing old shared cost',async()=>{const s=setup({shared:true});try{s.card._hass.callWS=async request=>({...s.oracle(request),tariff_revision:5});s.card._energySnapshotV5={today:{usage_cost:123}};s.backend.priceBuckets([row()]);await drain();assert.equal(s.mismatch,1);assert.equal(s.card._energySnapshotV5,null);assert.equal(s.backend.priceBuckets([row()]).usageCost,null);}finally{s.guard.dispose();}});
test('snapshot is field-validated, consumed only from backend and invalidated synchronously on context loss',async()=>{const s=setup();try{s.backend.snapshot();await drain();assert.equal(s.card._energySnapshotV5.today.usage_cost,7.5);s.card._config={source:'changed'};s.guard.observe();assert.equal(s.card._energySnapshotV5,null);}finally{s.guard.dispose();}});
test('a complex long query is partitioned inside wire bounds and combined without changing records or coverage',async()=>{const complex={...profile,rules:Array.from({length:512},()=>({zone:'a',intervals:[{from:'00:00',to:'24:00'}]}))};const s=setup({tariff:complex});try{const rows=Array.from({length:744},(_,i)=>row(i)),coverage={from:rows[0].from,to:rows.at(-1).to},before=JSON.stringify(rows);s.backend.priceBuckets(rows,coverage);await drain();const result=s.backend.priceBuckets(rows,coverage);assert.equal(result.complete,true);assert.equal(result.energyCost,4464);assert.equal(result.rows.length,744);assert.equal(result.rows[743].index,743);assert.equal(JSON.stringify(rows),before);assert.ok(s.calls.length>1);for(const request of s.calls){assert.ok(request.queries.length<=64);assert.ok(request.queries.flatMap(q=>q.buckets).length*62*513<=2000000);}}finally{s.guard.dispose();}});
test('a gap or overlap remains incomplete when independently priced partitions are combined',async()=>{const s=setup();try{const rows=[row(0),row(2)];s.backend.priceBuckets(rows,{from:row(0).from,to:row(2).to});await drain();assert.equal(s.backend.priceBuckets(rows,{from:row(0).from,to:row(2).to}).energyCost,null);}finally{s.guard.dispose();}});
test('classified profiles are validated explicitly; unknown classification never infers cheap',()=>{assert.equal(createEnergyTariffV3(profile).valid,true);assert.equal(createEnergyTariffV3({...profile,zones:[{...profile.zones[0],classification:'lowest'}]}).valid,false);});
test('negative backend costs and missing variable fees remain field-level values',async()=>{const s=setup();try{s.card._hass.callWS=async request=>{const response=s.oracle(request),p=response.results[0];p.energyCost=-6;p.variableCost=p.usageCost=null;p.rows[0].energyRate=-2;p.rows[0].energyCost=-6;p.rows[0].variableRate=p.rows[0].variableCost=p.rows[0].usageCost=null;return response;};s.backend.priceBuckets([row()]);await drain();assert.equal(s.backend.priceBuckets([row()]).energyCost,-6);assert.equal(s.backend.priceBuckets([row()]).usageCost,null);}finally{s.guard.dispose();}});
test('snapshot response cannot inject private extensions into the compact cache',async()=>{const s=setup();try{const call=s.card._hass.callWS;s.card._hass.callWS=async request=>({...await call(request),smtp:'PRIVATE_CANARY',current:{available:true,zone_class:null,cheap:null,energy_rate:2,variable_rate:0.5,usage_rate:2.5,secret:'PRIVATE_CANARY'}});s.backend.snapshot();await drain();assert.equal(JSON.stringify(s.card._energySnapshotV5).includes('PRIVATE_CANARY'),false);}finally{s.guard.dispose();}});
test('a legacy YAML profile waits for the shared tariff read before any price or snapshot dispatch',async()=>{const s=setup();try{s.setDescriptor({profile,source:'override',revision:null,ready:false});s.backend.priceBuckets([row()]);s.backend.snapshot();await drain();assert.equal(s.calls.length,0);assert.equal(s.card._energySnapshotV5,null);s.setDescriptor({profile,source:'override',revision:null,ready:true});s.backend.priceBuckets([row()]);await drain();assert.equal(s.backend.priceBuckets([row()]).energyCost,6);}finally{s.guard.dispose();}});
test('mounted snapshots refresh without a hass render and stop after guard suspension',async()=>{const s=setup();let backend;try{s.card.isConnected=true;backend=createEnergyBackendV5({card:s.card,guard:s.guard,describe:()=>({profile,source:'override',revision:null}),refreshMs:10});backend.snapshot();await new Promise(r=>setTimeout(r,35));assert.ok(s.calls.filter(c=>c.type.endsWith('energy_snapshot')).length>=2);s.guard.suspend();const count=s.calls.length;await new Promise(r=>setTimeout(r,25));assert.equal(s.calls.length,count);assert.equal(s.card._energySnapshotV5,null);}finally{s.guard.dispose();}});
test('transient failure permits a later bounded retry only when the raw slot is free',async()=>{const s=setup();try{let n=0;s.card._hass.callWS=async request=>{if(!n++)throw {code:'energy_unavailable'};return s.oracle(request);};const b=createEnergyBackendV5({card:s.card,guard:s.guard,describe:()=>({profile,source:'override',revision:null}),retryMs:10});b.priceBuckets([row()]);await drain();assert.equal(b.priceBuckets([row()]).energyCost,null);await new Promise(r=>setTimeout(r,15));b.priceBuckets([row()]);await drain();assert.equal(b.priceBuckets([row()]).energyCost,6);assert.equal(n,2);}finally{s.guard.dispose();}});
test('the host compiles a profile once for repeated synchronous point projections',()=>{const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');const {energyTariffProfileV3}=require('../shared/ha-tools-energy-tariff.js');let count=0;const card={_config:{tariff_profile:profile},_hass:{user:{id:'qa'},connection:{connected:true},config:{time_zone:'UTC'}}};const h=createTariffHostV3({card,kind:'optimizer',createModel:p=>{count++;return createEnergyTariffV3(p);},legacyProfile:energyTariffProfileV3,createSettings:()=>{},createUi:()=>{}});try{const first=h.model();for(let i=0;i<100;i++)assert.equal(h.model(),first);assert.equal(count,1);}finally{h.guard.dispose();}});
test('a mounted card coalesces snapshot ticks while the raw request is occupied',async t=>{t.mock.timers.enable({apis:['setTimeout','Date'],now:1792290000000});const s=setup();try{const response=await s.card._hass.callWS({type:'ha_tools_email/energy_snapshot'});s.calls.length=0;s.card.isConnected=true;let release;s.card._hass.callWS=request=>{s.calls.push(request);return s.calls.length===1?new Promise(r=>release=()=>r(response)):Promise.resolve(response);};const b=createEnergyBackendV5({card:s.card,guard:s.guard,describe:()=>({profile,source:'override',revision:null}),refreshMs:10});b.snapshot();await tick();for(let i=0;i<4;i++){t.mock.timers.tick(10);await tick();}assert.equal(s.calls.length,1);release();await drain();s.guard.suspend();assert.ok(s.calls.length<=2,'only the newest queued snapshot may follow the unresolved raw request');}finally{s.guard.dispose();}});
for(const name of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'])test(`${name}: a confirmed empty shared profile is reconfirmed after tab navigation`,async()=>{const {JSDOM}=require('jsdom'),fs=require('node:fs');const {energyBackend,drainBackend}=require('./helpers/energy-backend-fixture.cjs');const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});let card;try{dom.window.eval(['optimizer','energy-insights','energy-email'].map(f=>fs.readFileSync(`src/${f}.js`,'utf8')).join('\n'));card=dom.window.document.createElement(name);let reads=0;card._hass={user:{id:'fixture',is_admin:true},connection:{connected:true},config:{time_zone:'UTC',currency:'CHF'},states:{}};card._hass.callWS=energyBackend(card,async req=>{assert.equal(req.type,'ha_tools_email/get_tariff');reads++;return {profile:null,revision:0,updated_at:null};});card.setConfig({energy_price:2,currency:'CHF'});await card._loadSharedTariffProfile();await drainBackend();if(name==='ha-energy-optimizer')card._currentTab='patterns';else card._activeTab=name==='ha-energy-insights'?'daily':'schedule';card._observeTariffNavigationV3();await drainBackend();assert.equal(reads,2);card._getTariffV3().priceBuckets([row()]);await drainBackend();assert.equal(card._getTariffV3().priceBuckets([row()]).energyCost,6);}finally{card?._getTariffHostV3().guard.dispose();dom.window.close();}});

function revisionHost() {
 const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');
 const {energyTariffProfileV3}=require('../shared/ha-tools-energy-tariff.js');
 let revision=1,current=profile,readHook=null,refreshes=0;
 const calls=[],paints=[],card={isConnected:false,_config:{},_hass:{user:{id:'one'},connection:{connected:true},config:{time_zone:'UTC'}}};
 card._hass.callWS=async req=>{
  calls.push(req);
  if(req.type==='ha_tools_email/get_tariff')return readHook?readHook():{profile:current,revision,updated_at:null};
  if(req.type==='ha_tools_email/set_tariff'){assert.notEqual(req.expected_revision,revision);throw {code:'tariff_revision_conflict'};}
  assert.equal(req.type,'ha_tools_email/energy_price_queries');
  return {schema:1,profile_source:'shared',tariff_revision:revision,results:req.queries.map(q=>createEnergyTariffV3(current).priceBuckets(q.buckets))};
 };
 const host=createTariffHostV3({card,kind:'optimizer',createModel:createEnergyTariffV3,legacyProfile:energyTariffProfileV3,createSettings:()=>{},createUi:()=>{},onRefresh:()=>{refreshes++;card._tariffWriteUnconfirmedV3=false;}});
 card._repriceTariffV3=()=>{paints.push(card._sharedTariffReadStatus);if(card._sharedTariffReadStatus==='success')host.backend.priceBuckets([row()]);};
 return {card,host,calls,paints,get refreshes(){return refreshes;},change(value=2){revision=value;current={...profile,zones:[{...profile.zones[0],energyRate:4}]};},read(fn){readHook=fn;}};
}
test('a mounted shared consumer rechecks a newer revision once, purges immediately and reprices without writes',async()=>{
 const s=revisionHost();try{
  assert.equal(await s.host.load(),true);s.host.backend.priceBuckets([row()]);await drain();assert.equal(s.host.backend.priceBuckets([row()]).usageCost,7.5);
  s.card.isConnected=true;s.card._tariffWriteUnconfirmedV3=true;s.change();s.host.backend.invalidate();s.host.backend.priceBuckets([row()]);await drain();
  assert.equal(s.calls.filter(r=>r.type.endsWith('/get_tariff')).length,2);
  assert.equal(s.card._sharedTariffReadStatus,'success');assert.equal(s.host.snapshot().revision,2);
  assert.equal(s.host.backend.priceBuckets([row()]).usageCost,13.5);assert.ok(s.paints.includes('unconfirmed'));
  assert.equal(s.card._tariffWriteUnconfirmedV3,true);assert.equal(s.refreshes,0);
  assert.ok(s.calls.every(r=>['ha_tools_email/get_tariff','ha_tools_email/energy_price_queries'].includes(r.type)));
 }finally{s.host.guard.dispose();}
});
test('automatic revision confirmation rejects a late response after account changes',async()=>{
 const s=revisionHost();try{
  await s.host.load();s.card.isConnected=true;s.change();let release;
  s.read(()=>new Promise(resolve=>release=()=>resolve({profile,revision:2,updated_at:null})));
  s.host.backend.priceBuckets([row()]);await drain();assert.equal(typeof release,'function');
  s.card._hass={...s.card._hass,user:{id:'two'}};s.host.guard.observe();release();await drain();
  assert.equal(s.host.snapshot().reason,'tariff_unconfirmed');assert.equal(s.card._sharedTariffProfile,null);
 }finally{s.host.guard.dispose();}
});
test('an older confirmation cannot revive prices or loop after a newer revision was noticed',async()=>{
 const s=revisionHost();try{
  await s.host.load();s.card.isConnected=true;s.change();s.read(()=>({profile,revision:1,updated_at:null}));
  s.host.backend.priceBuckets([row()]);await drain();
  assert.equal(s.card._sharedTariffReadStatus,'unconfirmed');assert.equal(s.host.snapshot().reason,'tariff_unconfirmed');
  assert.equal(s.calls.filter(r=>r.type.endsWith('/get_tariff')).length,2);
  assert.equal(s.host.backend.priceBuckets([row()]).usageCost,null);await drain();assert.equal(s.calls.length,3);
 }finally{s.host.guard.dispose();}
});
for(const revision of [undefined,-1,1.5,'2',null])test(`malformed shared revision ${revision} fails without a confirmation loop`,async()=>{
 const s=setup({shared:true});try{
  s.card._hass.callWS=async request=>{s.calls.push(request);return {...s.oracle(request),tariff_revision:revision};};
  s.backend.priceBuckets([row()]);await drain();
  assert.equal(s.mismatch,0);assert.equal(s.card._energyPriceStatusV5,'backend_unavailable');
  assert.equal(s.backend.priceBuckets([row()]).usageCost,null);await drain();assert.equal(s.calls.length,1);
 }finally{s.guard.dispose();}
});

test('automatic price refresh preserves a dirty editor baseline and its save still conflicts',async()=>{
 const {JSDOM}=require('jsdom'),{createTariffSettingsV3}=require('../shared/ha-tools-tariff-settings.js');
 const dom=new JSDOM('<div id="editor"></div>'),s=revisionHost();let editor;
 try{
  s.card._hass.user.is_admin=true;s.host.guard.observe();await s.host.load();
  const state=s.card._tariffEditorState;state.draft.zones[0].energyRate=3;
  s.card.isConnected=true;s.change();s.host.backend.priceBuckets([row()]);await drain();
  assert.equal(s.host.snapshot().revision,2);assert.equal(s.host.backend.priceBuckets([row()]).usageCost,13.5);
  assert.equal(state.revision,1);assert.equal(state.profile.zones[0].energyRate,2);assert.equal(state.draft.zones[0].energyRate,3);
  editor=createTariffSettingsV3({root:dom.window.document.querySelector('#editor'),getHass:()=>s.card._hass,language:()=> 'en',state,validate:createEnergyTariffV3,guard:s.host.guard});
  editor.render();
  dom.window.document.querySelector('[data-action="save"]').click();await drain();
  const writes=s.calls.filter(req=>req.type==='ha_tools_email/set_tariff');assert.equal(writes.length,1);assert.equal(writes[0].expected_revision,1);
  assert.equal(state.writeUnconfirmed,true);assert.match(state.message,/conflict/i);assert.equal(state.draft.zones[0].energyRate,3);
 }finally{editor?.dispose();s.host.guard.dispose();dom.window.close();}
});
