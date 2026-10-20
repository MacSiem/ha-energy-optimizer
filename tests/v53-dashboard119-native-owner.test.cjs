// Integration regressions: actual registered Energy cards and their real runtime.
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto'),{JSDOM,VirtualConsole}=require('jsdom');
const {energyBackend}=require('./helpers/energy-backend-fixture.cjs');
const producer=JSON.parse(fs.readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
const names=['ha-energy-optimizer','ha-energy-insights','ha-energy-email'];
const clone=x=>JSON.parse(JSON.stringify(x));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=async()=>{for(let i=0;i<16;i++)await new Promise(resolve=>setImmediate(resolve));};
function setup(name,{admin=true,language='en',config={type:`custom:${name}`,variant:'full',...(name==='ha-energy-email'?{default_tab:'preview'}:{}),title:'Placement integration'}}={}){
 const errors=[],denied=[],calls=[],network=[],services=[],subscriptions=[];
 const console=new VirtualConsole();
 console.on('error',(...args)=>errors.push(args.join(' ')));
 console.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const dom=new JSDOM('',{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/',virtualConsole:console}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLCanvasElement.prototype.getContext=()=>({});
 w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:390,height:44}]:[];};
 w.fetch=(...args)=>{network.push(args);throw Error('Unexpected network');};
 // Consume generated sources after the owner syncs. No card, analysis-controller,
 // source-context bridge or placement-factory doubles/rewrites are installed.
 w.eval(['optimizer','energy-insights','energy-email'].map(file=>fs.readFileSync(`src/${file}.js`,'utf8')).join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 // Contract fixture for frontend 20260826.7 make-dialog-manager.ts:
 // provideHass, showDialog before append, stable parent, cached legacy element.
 const shell=w.document.createElement('home-assistant');shell.attachShadow({mode:'open'});w.document.body.append(shell);
 const providers=new Set(),closed=[];let nativeDialog;
 shell.addEventListener('dialog-closed',()=>closed.push(new Error('native dialog closed').stack));
 shell.provideHass=element=>{providers.add(element);element.hass=hass;};
 shell.addEventListener('show-dialog',async event=>{
  const {dialogTag,dialogImport,dialogParams}=event.detail;
  if(!nativeDialog){await dialogImport();nativeDialog=w.document.createElement(dialogTag);shell.provideHass(nativeDialog);}
  nativeDialog.showDialog(dialogParams);if(nativeDialog.parentNode!==shell.shadowRoot)shell.shadowRoot.append(nativeDialog);
 });
 const card=w.document.createElement(name);card.getBoundingClientRect=()=>({width:390});card.setConfig(config);
 const connection=new w.EventTarget();connection.connected=true;
 connection.subscribeMessage=(callback,q)=>{
  if(q.type!=='ha_tools_email/subscribe_analysis_updates'){denied.push(clone(q));return Promise.reject({code:'forbidden'});}
  const row={callback,active:true};subscriptions.push(row);return Promise.resolve(()=>{row.active=false;});
 };
 let stored={title:'Existing dashboard',keep:{untouched:true},views:[{title:'Destination',type:'sections',sections:[{type:'grid',cards:[]}]}]},hook=null,raw=0,maxRaw=0;
 const price=energyBackend(card,async()=>{throw {code:'unexpected_price_delegate'};},{profile:producer.rates[0].profile,revision:4});
 let hass={connected:true,user:{id:admin?'admin':'reader',is_admin:admin,is_active:true,groups:[],group_ids:[]},connection,
 config:{time_zone:producer.period.timezone,currency:'EUR'},language,locale:{language,time_zone:'server',time_format:'24'},states:{},services:{},panels:{lovelace:{config:{mode:'storage'}}},
 callWS:async q=>{
  calls.push(clone(q));const dashboard=q.type.startsWith('lovelace/');
  if(dashboard){raw++;maxRaw=Math.max(maxRaw,raw);}
  try{
   if(hook){const result=hook(q);if(result!==undefined)return await result;}
   if(q.type==='lovelace/dashboards/list')return [{url_path:'existing',title:'Existing',mode:'storage'}];
   if(q.type==='lovelace/config')return clone(stored);
   if(q.type==='lovelace/config/save'){stored=clone(q.config);return null;}
   // Native per-feature capability facts contain no settings or recipients.
   if(q.type==='ha_tools_email/get_report_status' && q.purpose==='energy_report')throw {code:'unknown_command'};
   if(q.type==='ha_tools_email/feature_capabilities')return {status:'ready',revision:0,capabilities:{energy_reports:{visible:true,read:true,execute:false}}};
   if(q.type==='ha_tools_email/energy_analysis')return clone(producer);
   if(q.type==='ha_tools_email/get_tariff')return {profile:clone(producer.rates[0].profile),revision:4,updated_at:null};
   if(q.type==='ha_tools_email/energy_snapshot')return {schema:1,generated_at:producer.generated_at,profile_source:q.profile?'override':'shared',tariff_revision:q.profile?null:4,status:'partial',currency:'EUR',current:{available:true,zone_class:'cheap',cheap:true,energy_rate:0.5,variable_rate:0.1,usage_rate:0.6},today:{usage_cost:null,energy_cost:null,variable_cost:null},next_cheap:{status:'unknown',start:null}};
   if(q.type==='ha_tools_email/energy_price_queries')return price(q);
   // Test placement from the full Email report-preview tab, whose source and
   // destination are both read only. SMTP settings remain a separate existing tab.
   // No SMTP/config/private settings/schedule read or write is accepted.
   denied.push(clone(q));throw {code:'forbidden',message:'Unexpected private or unsupported request'};
  }finally{if(dashboard)raw--;}
 },callService(...args){services.push(args);throw Error('Unexpected service write');}};
 const api={w,card,shell,closed,get nativeDialog(){return nativeDialog;},calls,errors,denied,subscriptions,get hass(){return hass;},get stored(){return stored;},set stored(v){stored=v;},set hook(v){hook=v;},get maxRaw(){return maxRaw;},
 q(selector){return nativeDialog?.querySelector(selector)||card.shadowRoot.querySelector(selector);},dashboardCalls(){return calls.filter(q=>q.type.startsWith('lovelace/'));},saves(){return calls.filter(q=>q.type==='lovelace/config/save');},
 async mount(){shell.shadowRoot.append(card);card.hass=hass;await tick();},
 update(next){hass=next;for(const element of providers)element.hass=hass;if(card.isConnected)card.hass=hass;},
 async open(){const button=api.q('[data-energy-dashboard-add]');assert.ok(button,'actual full-card footer trigger');button.click();await tick();},
 async select(){assert.deepEqual(errors,[],'native dialog runtime must initialize');const select=api.q('[data-dashboard]');assert.ok(select);select.value='0';select.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();},
 quiet(){assert.deepEqual(denied,[],'no SMTP/private config/schedule/unsupported requests');assert.deepEqual(network,[]);assert.deepEqual(services,[]);assert.deepEqual(errors,[],'real card runtime must not log ReferenceError or render failures');},
 close(){nativeDialog?.closeDialog();card.remove();card._dashboardPlacementV53?.destroy();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
 return api;
}

// Behavioral failure before the implementation: the native owner is absent,
// and removing the real registered card deletes its inline dialog and backup.
for(const name of names) {
 test(`${name}: own save remount before ACK retains native confirmation and working Undo`,async()=>{
  const f=setup(name),ack=deferred();try{
   await f.mount();const before=clone(f.stored);await f.open();await f.select();
   f.hook=q=>{if(q.type==='lovelace/config/save'){
    f.stored=clone(q.config);f.card.remove(); // platform lifecycle, never direct callback invocation
    return ack.promise;
   }};
   f.q('[data-add]').click();await tick();assert.equal(f.saves().length,1);
   assert.ok(f.nativeDialog?.isConnected,'HA owns the stable live session');
   assert.ok(f.q('dialog[open]'),'dialog survives source card teardown: '+f.closed.join('\n'));
   assert.equal(f.q('[data-undo]').disabled,true,'unsettled save is not confirmed');
   ack.resolve(null);await tick();assert.match(f.q('[role=status]').textContent,/confirmed/i);
   assert.equal(f.q('[data-undo]').disabled,false);f.hook=null;f.q('[data-undo]').click();await tick();
   assert.equal(f.saves().length,2);assert.deepEqual(f.stored,before);assert.equal(f.maxRaw,1);f.quiet();
  }finally{ack.resolve(null);f.close();}
 });
 test(`${name}: post-remount Undo preserves actual externally changed document`,async()=>{
  const f=setup(name);try{
   await f.mount();await f.open();await f.select();
   f.hook=q=>{if(q.type==='lovelace/config/save'){f.stored=clone(q.config);f.card.remove();return Promise.resolve(null);}};
   f.q('[data-add]').click();await tick();assert.equal(f.q('[data-undo]').disabled,false);
   const external=clone(f.stored);external.externalEdit={retained:true};f.stored=external;f.hook=null;
   f.q('[data-undo]').click();await tick();assert.equal(f.saves().length,1);assert.deepEqual(f.stored,external);
   assert.match(f.q('[role=status]').textContent,/changed/i);f.quiet();
  }finally{f.close();}
 });
 test(`${name}: source detach without own transaction closes the native preview`,async()=>{
  const f=setup(name);try{await f.mount();await f.open();await f.select();f.card.remove();await tick();
   assert.equal(f.q('dialog[open]'),null);assert.equal(f.saves().length,0);f.quiet();
  }finally{f.close();}
 });
 for(const edge of ['role','account','connection','config','offline','route'])test(`${name}: native ${edge} revocation after remount purges backup`,async()=>{
  const f=setup(name);try{
   await f.mount();await f.open();await f.select();
   f.hook=q=>{if(q.type==='lovelace/config/save'){f.stored=clone(q.config);f.card.remove();return Promise.resolve(null);}};
   f.q('[data-add]').click();await tick();assert.equal(f.q('[data-undo]').disabled,false);const count=f.dashboardCalls().length;
   if(edge==='offline')f.hass.connection.dispatchEvent(new f.w.Event('disconnected'));
   else if(edge==='route'){f.w.history.pushState({},'', '/unrelated');f.w.dispatchEvent(new f.w.Event('location-changed'));}
   else{const h={...f.hass,user:{...f.hass.user},config:{...f.hass.config}};
    if(edge==='role')h.user.is_admin=false;
    if(edge==='account')h.user.id='other';
    if(edge==='connection')h.connection=new f.w.EventTarget();
    if(edge==='config')h.config.time_zone='UTC';f.update(h);}
   await tick();assert.equal(f.q('dialog[open]'),null);assert.equal(f.dashboardCalls().length,count);f.quiet();
  }finally{f.close();}
 });
}

test('native close during unsettled save never sends readback or replays Add',async()=>{
 const f=setup('ha-energy-email'),ack=deferred();try{
  await f.mount();await f.open();await f.select();
  f.hook=q=>{if(q.type==='lovelace/config/save'){f.stored=clone(q.config);f.card.remove();return ack.promise;}};
  f.q('[data-add]').click();await tick();const n=f.dashboardCalls().length;
  f.nativeDialog.closeDialog();assert.equal(f.q('dialog[open]'),null);ack.resolve(null);await tick();
  assert.equal(f.dashboardCalls().length,n,'closed transaction cannot read back or replay after late ACK');
  assert.equal(f.saves().length,1);assert.equal(f.maxRaw,1);f.quiet();
 }finally{ack.resolve(null);f.close();}
});
test('a native lost ACK after actual commit reconciles once through the live dialog owner',async()=>{
 const f=setup('ha-energy-email');try{
  await f.mount();await f.open();await f.select();
  f.hook=q=>{if(q.type==='lovelace/config/save'){f.stored=clone(q.config);f.card.remove();return Promise.reject({code:'transport_lost'});}};
  f.q('[data-add]').click();await tick();assert.equal(f.saves().length,1);assert.equal(f.q('[data-undo]').disabled,false);
  assert.match(f.q('[role=status]').textContent,/confirmed/i);assert.equal(f.maxRaw,1);f.quiet();
 }finally{f.close();}
});

test('native reopen queues behind the actual old save settlement across source remount',async()=>{
 const f=setup('ha-energy-email'),ack=deferred();try{
  await f.mount();await f.open();await f.select();
  f.hook=q=>{if(q.type==='lovelace/config/save'){f.stored=clone(q.config);f.card.remove();return ack.promise;}};
  f.q('[data-add]').click();await tick();const n=f.dashboardCalls().length;f.nativeDialog.closeDialog();
  f.shell.shadowRoot.append(f.card);f.card.hass=f.hass;await tick();await f.open();
  assert.equal(f.dashboardCalls().length,n,'new list is queued, old raw save still occupies the lane');
  ack.resolve(null);await tick();assert.equal(f.dashboardCalls().length,n+1,'only new user-opened list runs');
  assert.equal(f.saves().length,1);assert.equal(f.q('[data-undo]').disabled,true);assert.equal(f.maxRaw,1);f.quiet();
 }finally{ack.resolve(null);f.close();}
});
test('source guard invalidation before handover closes the HA-owned preview',async()=>{
 const f=setup('ha-energy-email');try{
  await f.mount();await f.open();await f.select();f.card._getTariffHostV3().guard.invalidate();await tick();
  assert.equal(f.q('dialog[open]'),null);assert.equal(f.saves().length,0);f.quiet();
 }finally{f.close();}
});
test('disconnect of the native owner itself closes and purges the session',async()=>{
 const f=setup('ha-energy-email');try{
  await f.mount();await f.open();await f.select();f.nativeDialog.remove();await tick();
  assert.equal(f.q('dialog[open]'),null);assert.equal(f.saves().length,0);f.quiet();
 }finally{f.close();}
});
