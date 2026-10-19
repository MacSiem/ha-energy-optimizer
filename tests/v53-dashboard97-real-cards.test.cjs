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
 const api={w,card,calls,errors,denied,subscriptions,get hass(){return hass;},get stored(){return stored;},set stored(v){stored=v;},set hook(v){hook=v;},get maxRaw(){return maxRaw;},
 q(selector){return card.shadowRoot.querySelector(selector);},dashboardCalls(){return calls.filter(q=>q.type.startsWith('lovelace/'));},saves(){return calls.filter(q=>q.type==='lovelace/config/save');},
 async mount(){w.document.body.append(card);card.hass=hass;await tick();},
 update(next){hass=next;card.hass=hass;},
 async open(){const button=api.q('[data-energy-dashboard-add]');assert.ok(button,'actual full-card footer trigger');button.click();await tick();},
 async select(){const select=api.q('[data-dashboard]');assert.ok(select);select.value='0';select.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();},
 quiet(){assert.deepEqual(denied,[],'no SMTP/private config/schedule/unsupported requests');assert.deepEqual(network,[]);assert.deepEqual(services,[]);assert.deepEqual(errors,[],'real card runtime must not log ReferenceError or render failures');},
 close(){card.remove();card._dashboardPlacementV53?.destroy();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
 return api;
}
test('generated placement factory has exact global-scope provenance before each options factory',()=>{
 const placement=fs.readFileSync('shared/ha-tools-dashboard-placement.js','utf8'),manifest=JSON.parse(fs.readFileSync('generated-sources.json','utf8'));
 assert.deepEqual(manifest.sharedDashboardPlacement,{path:'shared/ha-tools-dashboard-placement.js',sha256:crypto.createHash('sha256').update(placement).digest('hex')});
 for(const file of ['optimizer','energy-insights','energy-email']){
  const source=fs.readFileSync(`src/${file}.js`,'utf8'),matches=[...source.matchAll(/\/\/ HA_DASHBOARD_PLACEMENT_V53_START\n([\s\S]*?)\/\/ HA_DASHBOARD_PLACEMENT_V53_END/g)];
  assert.equal(matches.length,1);assert.equal(matches[0][1],placement);
  const end=source.indexOf('// HA_DASHBOARD_PLACEMENT_V53_END')+'// HA_DASHBOARD_PLACEMENT_V53_END'.length,start=source.indexOf('// HA_ENERGY_CARD_OPTIONS_V5_START');
  assert.equal(source.slice(end,start),'\n');assert.ok(end>source.indexOf('// HA_TARIFF_V3_END'));
 }
});
for(const name of names){
 test(`${name}: full footer is the only Add surface; closed flow has zero dashboard IO`,async()=>{
  const f=setup(name);try{await f.mount();assert.equal(f.q('[data-energy-dashboard-add]').closest('footer').hasAttribute('data-energy-dashboard-footer'),true);
   assert.equal(f.card.shadowRoot.querySelectorAll('[data-energy-dashboard-add]').length,1);
   assert.equal(f.q('.header,.optimizer-heading,.panel-header')?.querySelector('[data-energy-dashboard-add]')||null,null);assert.equal(f.dashboardCalls().length,0);
   for(const variant of ['compact','tile']){f.card.setConfig({type:`custom:${name}`,variant});f.card._render();await tick();assert.equal(f.q('[data-energy-dashboard-add]'),null);assert.equal(f.q('[data-energy-simple]').querySelectorAll('button').length,1);}
   f.card.setConfig({type:`custom:${name}`,variant:'full',...(name==='ha-energy-email'?{default_tab:'preview'}:{}),show_support:false});f.card._render();await tick();assert.equal(f.card.shadowRoot.querySelectorAll('[data-energy-dashboard-add]').length,1);assert.equal(f.dashboardCalls().length,0);f.quiet();
  }finally{f.close();}
 });
 for(const language of ['pl','en'])test(`${name}: actual ${language} card preview, one native Add, readback and Undo`,async()=>{
  const f=setup(name,{language});try{await f.mount();const original=JSON.stringify(f.stored);await f.open();await f.select();
   const preview=f.q(`[data-preview] ${name}`);assert.ok(preview);assert.equal(preview.constructor,f.w.customElements.get(name));assert.equal(preview.hasAttribute('inert'),true);assert.ok(preview.shadowRoot.children.length>0,'actual card rendered');
   assert.equal(preview.shadowRoot.querySelector('[data-energy-dashboard-add]'),null,'preview cannot recurse');assert.equal(preview._dashboardPlacementV53,undefined);assert.equal(f.saves().length,0);
   assert.equal(f.q('[data-add]').textContent,language==='pl'?'Dodaj':'Add');f.q('[data-add]').click();f.q('[data-add]').click();await tick();assert.equal(f.saves().length,1);
   assert.equal(f.stored.views[0].sections[0].cards[0].type,`custom:${name}`);assert.equal(f.q('[data-undo]').disabled,false);f.q('[data-undo]').click();await tick();assert.equal(f.saves().length,2);assert.equal(JSON.stringify(f.stored),original);assert.equal(f.maxRaw,1);f.quiet();
  }finally{f.close();}
 });
 test(`${name}: nonadmin source never exposes Add or performs dashboard IO`,async()=>{
  const f=setup(name,{admin:false});try{await f.mount();assert.equal(f.q('[data-energy-dashboard-add]'),null);assert.equal(f.card._dashboardPlacementV53,undefined);assert.equal(f.dashboardCalls().length,0);f.quiet();}finally{f.close();}
 });
 test(`${name}: guard source invalidation purges an open preview without another hass assignment`,async()=>{
  const f=setup(name);try{await f.mount();await f.open();await f.select();const factory=f.card._dashboardPlacementV53,guard=f.card._getTariffHostV3().guard;guard.invalidate();assert.equal(f.q('dialog'),null);assert.equal(f.card._dashboardPlacementV53,factory);assert.equal(f.saves().length,0);f.quiet();}finally{f.close();}
 });
 test(`${name}: in-place role and config changes fence a pending selection`,async()=>{
  const f=setup(name),d=deferred();try{await f.mount();await f.open();f.hook=q=>q.type==='lovelace/config'?d.promise:undefined;const selection=f.select();await new Promise(resolve=>setImmediate(resolve));f.hass.user.is_admin=false;f.card.hass=f.hass;assert.equal(f.q('dialog'),null);assert.equal(f.q('[data-energy-dashboard-add]'),null);d.resolve(clone(f.stored));await selection;assert.equal(f.saves().length,0);
   f.hass.user.is_admin=true;f.card.hass=f.hass;f.hook=null;await f.open();await f.select();f.card.setConfig({type:`custom:${name}`,variant:'full',...(name==='ha-energy-email'?{default_tab:'preview'}:{}),title:'Changed source'});assert.equal(f.q('dialog'),null);f.quiet();
  }finally{f.close();}
 });
 test(`${name}: authoritative disconnect closes and ready may re-enable, without automatic open`,async()=>{
  const f=setup(name);try{await f.mount();await f.open();await f.select();f.hass.connection.dispatchEvent(new f.w.Event('disconnected'));assert.equal(f.q('dialog'),null);assert.equal(f.q('[data-energy-dashboard-add]'),null);const n=f.dashboardCalls().length;f.hass.connection.dispatchEvent(new f.w.Event('ready'));await tick();assert.equal(f.q('dialog'),null);assert.ok(f.q('[data-energy-dashboard-add]'));assert.equal(f.dashboardCalls().length,n);f.quiet();}finally{f.close();}
 });
 test(`${name}: remount retains factory and pending raw save occupancy; late result cannot resurrect preview`,async()=>{
  const f=setup(name),d=deferred();try{await f.mount();await f.open();await f.select();const factory=f.card._dashboardPlacementV53;
   f.hook=q=>q.type==='lovelace/config/save'?d.promise:undefined;f.q('[data-add]').click();await tick();assert.equal(f.saves().length,1);f.card.remove();assert.equal(f.card._dashboardPlacementUnsubscribeV53,undefined);assert.equal(f.q('dialog'),null);assert.equal(f.card._dashboardPlacementV53,factory);
   f.w.document.body.append(f.card);f.card.hass=f.hass;await tick();const n=f.dashboardCalls().length;await f.open();assert.equal(f.card._dashboardPlacementV53,factory);assert.equal(f.dashboardCalls().length,n,'remount cannot dispatch while old raw save is pending');d.resolve(null);await tick();assert.equal(f.maxRaw,1);assert.equal(f.saves().length,1);assert.equal(f.q(`[data-preview] ${name}`),null);assert.equal(f.q('[data-undo]').disabled,true);f.quiet();
  }finally{d.resolve(null);f.close();}
 });
 test(`${name}: unrelated same-hass traffic retains the open dialog and no extra list/read/save`,async()=>{
  const f=setup(name);try{await f.mount();await f.open();await f.select();const dialog=f.q('dialog'),n=f.dashboardCalls().length;f.card.hass=f.hass;f.card._render();await tick();assert.equal(f.q('dialog'),dialog);assert.equal(f.dashboardCalls().length,n);assert.equal(f.saves().length,0);f.quiet();}finally{f.close();}
 });
}
