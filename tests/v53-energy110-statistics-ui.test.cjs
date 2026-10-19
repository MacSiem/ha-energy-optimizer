// Statistics UI integration: actual generated Energy consumers, owner sync required.
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto'),{JSDOM,VirtualConsole}=require('jsdom');
const {energyBackend}=require('./helpers/energy-backend-fixture.cjs');
const producer=JSON.parse(fs.readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
const proposal={entry_id:'entry',source_signature:'source-v1',normalization_signature:'norm-v1',source_ids:['sensor.grid','sensor.office'],measurement_timezone:'Europe/Warsaw',policy_signature:'policy-v1',feature_access_revision:3,tariff_id:'tariff',currency:'EUR',price_basis:'gross',membership_mode:'current_snapshot'};
const warning='Native statistics are readable by all authenticated HA users; history remains.';
const initial=()=>({enabled:false,revision:0,reader_scope:'all_authenticated_ha_users',warning,membership_mode:'current_snapshot',pending:false,author_user_id:null,active_epoch:null,dataset:null,catalog:[]});
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
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'));};
 const timers=[];const realTimeout=w.setTimeout.bind(w);w.setTimeout=(fn,delay,...args)=>{const id=realTimeout(fn,delay,...args);if(delay===15000)timers.push({fn,id});return id;};
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
 let stats=initial(),expectedProposal=clone(proposal);
 let stored={title:'Existing dashboard',keep:{untouched:true},views:[{title:'Destination',type:'sections',sections:[{type:'grid',cards:[]}]}]},hook=null,raw=0,maxRaw=0;
 const price=energyBackend(card,async()=>{throw {code:'unexpected_price_delegate'};},{profile:producer.rates[0].profile,revision:4});
 let hass={connected:true,user:{id:admin?'admin':'reader',is_admin:admin,is_active:true,groups:[],group_ids:[]},connection,
 config:{time_zone:producer.period.timezone,currency:'EUR'},language,locale:{language,time_zone:'server',time_format:'24'},states:{},services:{},panels:{lovelace:{config:{mode:'storage'}}},
 callWS:async q=>{
  calls.push(clone(q));const dashboard=q.type.startsWith('lovelace/');
  if(dashboard){raw++;maxRaw=Math.max(maxRaw,raw);}
  try{
   if(hook){const result=hook(q);if(result!==undefined)return await result;}
   if(q.type==='ha_tools_email/energy_statistics_status')return clone(stats);
   if(q.type==='ha_tools_email/energy_statistics_prepare')return {proposal:clone(expectedProposal),revision:stats.revision,warning,membership_mode:'current_snapshot'};
   if(q.type==='ha_tools_email/energy_statistics_enable'){
    assert.equal(q.acknowledge_global,true);assert.equal(q.acknowledge_current_membership,true);assert.equal(q.expected_revision,stats.revision);assert.deepEqual(q.proposal,expectedProposal);
    stats={...stats,enabled:true,revision:stats.revision+1,author_user_id:hass.user.id,active_epoch:'epoch',dataset:clone(expectedProposal)};return clone(stats);
   }
   if(q.type==='ha_tools_email/energy_statistics_disable'){assert.equal(q.expected_revision,stats.revision);stats={...stats,enabled:false,revision:stats.revision+1};return clone(stats);}
   if(q.type==='ha_tools_email/energy_statistics_refresh'){assert.ok(stats.enabled);if(q.backfill)assert.equal(q.acknowledge_current_membership,true);return clone(stats);}
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
 const api={w,card,calls,timers,get stats(){return stats;},set stats(v){stats=v;},get proposal(){return expectedProposal;},set proposal(v){expectedProposal=v;},statisticsCalls(){return calls.filter(q=>q.type.startsWith('ha_tools_email/energy_statistics_'));},async statistics(){api.q('[data-energy-statistics-open]').click();await tick();},check(){const c=api.q('[data-energy-statistics-dialog] input');c.checked=true;c.dispatchEvent(new w.Event('change',{bubbles:true}));},click(action){api.q('[data-statistics-'+action+']').click();},errors,denied,subscriptions,get hass(){return hass;},get stored(){return stored;},set stored(v){stored=v;},set hook(v){hook=v;},get maxRaw(){return maxRaw;},
 q(selector){return card.shadowRoot.querySelector(selector);},dashboardCalls(){return calls.filter(q=>q.type.startsWith('lovelace/'));},saves(){return calls.filter(q=>q.type==='lovelace/config/save');},
 async mount(){w.document.body.append(card);card.hass=hass;await tick();},
 update(next){hass=next;card.hass=hass;},
 async open(){const button=api.q('[data-energy-dashboard-add]');assert.ok(button,'actual full-card footer trigger');button.click();await tick();},
 async select(){const select=api.q('[data-dashboard]');assert.ok(select);select.value='0';select.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();},
 quiet(){assert.deepEqual(denied,[],'no SMTP/private config/schedule/unsupported requests');assert.deepEqual(network,[]);assert.deepEqual(services,[]);assert.deepEqual(errors,[],'real card runtime must not log ReferenceError or render failures');},
 close(){card.remove();card._dashboardPlacementV53?.destroy();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
 return api;
}

test('statistics module has exact shared tariff provenance in all generated consumers',()=>{
 const source=fs.readFileSync('shared/ha-tools-energy-statistics-ui.js','utf8'),manifest=JSON.parse(fs.readFileSync('generated-sources.json','utf8'));
 assert.deepEqual(manifest.sharedTariff.modules.find(x=>x.path==='shared/ha-tools-energy-statistics-ui.js'),{path:'shared/ha-tools-energy-statistics-ui.js',sha256:crypto.createHash('sha256').update(source).digest('hex')});
 for(const name of ['optimizer','energy-insights','energy-email'])assert.ok(fs.readFileSync('src/'+name+'.js','utf8').includes(source.replace(/^'use strict';\n/,'').replace(/^if \(typeof module[^\n]*$/gm,'').trimEnd()));
});
for(const name of names){
 test(name+': full admin explicit consent, enable without publishing, refresh/backfill/disable and focus',async()=>{
  const a=setup(name);try{
   await a.mount();assert.equal(a.statisticsCalls().length,0);const trigger=a.q('[data-energy-statistics-open]');assert.ok(trigger);trigger.focus();await a.statistics();
   assert.deepEqual(a.statisticsCalls().map(x=>x.type.split('_').pop()),['status','prepare']);
   assert.equal(a.q('[data-statistics-enable]').disabled,true);assert.equal(a.q('[data-energy-statistics-dialog] input').checked,false);
   assert.match(a.q('[data-statistics-dataset]').textContent,/sensor.grid.*sensor.office/);a.check();a.click('enable');await tick();
   assert.equal(a.stats.enabled,true);assert.equal(a.statisticsCalls().filter(x=>x.type.endsWith('_refresh')).length,0);
   a.click('refresh');await tick();assert.equal(a.statisticsCalls().at(-1).backfill,false);
   a.click('read');await tick();a.check();a.click('backfill');await tick();assert.equal(a.statisticsCalls().at(-1).backfill,true);
   a.click('disable');await tick();assert.equal(a.stats.enabled,false);a.click('close');assert.equal(a.q('dialog[open]'),null);assert.equal(a.card.shadowRoot.activeElement,trigger);a.quiet();
  }finally{a.close();}
 });
 for(const variant of ['compact','tile'])test(name+': '+variant+' has no statistics trigger or IO',async()=>{
  const a=setup(name,{config:{type:'custom:'+name,variant}});try{await a.mount();assert.equal(a.q('[data-energy-statistics-open]'),null);assert.equal(a.statisticsCalls().length,0);a.quiet();}finally{a.close();}
 });
 test(name+': preview and nonadmin have no statistics trigger or IO',async()=>{
  for(const mode of ['reader','preview']){const a=setup(name,{admin:mode!=='reader'});try{if(mode==='preview')a.card.preview=true;await a.mount();assert.equal(a.q('[data-energy-statistics-open]'),null);assert.equal(a.statisticsCalls().length,0);a.quiet();}finally{a.close();}}
 });
}
test('PL labels and catalog are text only; no delivered or historical ACL promise',async()=>{
 const a=setup('ha-energy-email',{language:'pl'});try{a.stats={...initial(),catalog:[{statistic_id:'ha_tools:cost',name:'<img src=x>',currency:'EUR',price_basis:'gross',epoch:'old',current_dataset:false}]};await a.mount();await a.statistics();assert.equal(a.q('[data-energy-statistics-open]').textContent,'Statystyki kosztów');assert.equal(a.q('[data-statistics-enable]').textContent,'Włącz');assert.match(a.q('[data-statistics-catalog]').textContent,/ha_tools:cost/);assert.equal(a.q('[data-statistics-catalog] img'),null);assert.match(a.q('dialog').textContent,/aktualnego przypisania/);a.quiet();}finally{a.close();}
});
test('stale proposal rejected by server: no retry and explicit readback required',async()=>{
 const a=setup('ha-energy-email');try{await a.mount();await a.statistics();a.check();let writes=0;a.hook=q=>{if(q.type.endsWith('/energy_statistics_enable')){writes++;return Promise.reject({code:'energy_statistics_unavailable'});}};a.click('enable');await tick();assert.equal(writes,1);assert.equal(a.q('[data-statistics-enable]').disabled,true);assert.match(a.q('[data-statistics-note]').textContent,/unconfirmed/);a.click('enable');await tick();assert.equal(writes,1);a.hook=null;a.click('read');await tick();assert.equal(a.q('[data-energy-statistics-dialog] input').checked,false);assert.equal(a.q('[data-statistics-enable]').disabled,true);a.quiet();}finally{a.close();}
});
test('strict malformed status denies mutation without rendering private extras',async()=>{
 for(const bad of [{...initial(),private_config:'secret'}, {...initial(),revision:-1},{...initial(),catalog:Array(4097).fill({})}]){
  const a=setup('ha-energy-email');try{a.hook=q=>q.type.endsWith('/energy_statistics_status')?clone(bad):undefined;await a.mount();await a.statistics();assert.equal(a.q('[data-statistics-enable]').disabled,true);assert.equal(a.q('[data-statistics-disable]').disabled,true);assert.doesNotMatch(a.q('dialog').textContent,/secret/);assert.equal(a.statisticsCalls().length,1);a.quiet();}finally{a.close();}
 }
});
test('denied response never grants execution or private fallback',async()=>{
 const a=setup('ha-energy-email');try{a.hook=q=>q.type.endsWith('/energy_statistics_status')?Promise.reject({code:'unauthorized',message:'private diagnostic'}):undefined;await a.mount();await a.statistics();assert.match(a.q('[data-statistics-note]').textContent,/denied/);assert.doesNotMatch(a.q('dialog').textContent,/private diagnostic/);a.check();a.click('enable');await tick();assert.equal(a.statisticsCalls().length,1);a.quiet();}finally{a.close();}
});
test('source event, role revoke, variant and disconnect purge proposal/consent',async()=>{
 for(const edge of ['event','role','variant','disconnect']){
  const a=setup('ha-energy-email');try{await a.mount();await a.statistics();a.check();const before=a.statisticsCalls().length;
   if(edge==='event')a.subscriptions.filter(x=>x.active).at(-1).callback({});
   if(edge==='role')a.update({...a.hass,user:{...a.hass.user,is_admin:false}});
   if(edge==='variant')a.card.setConfig({type:'custom:ha-energy-email',variant:'compact'});
   if(edge==='disconnect')a.card.remove();
   await tick();assert.equal(a.q('dialog[open]'),null);assert.equal(a.statisticsCalls().length,before);a.quiet();
  }finally{a.close();}
 }
});
test('timeout and remount retain actual raw write occupancy until settlement; never replay',async()=>{
 const a=setup('ha-energy-email');try{await a.mount();await a.statistics();a.check();const wait=deferred();a.hook=q=>q.type.endsWith('/energy_statistics_enable')?wait.promise:undefined;a.click('enable');await tick();const timeout=a.timers.at(-1);assert.ok(timeout);a.w.clearTimeout(timeout.id);timeout.fn();await tick();const factory=a.card._energyStatisticsV110,before=a.statisticsCalls().length;
  a.card.remove();a.w.document.body.append(a.card);a.card.hass=a.hass;await tick();await a.statistics();assert.equal(a.card._energyStatisticsV110,factory);assert.equal(a.statisticsCalls().length,before);assert.equal(a.q('[data-statistics-read]').disabled,true);
  wait.resolve({...initial(),enabled:true,revision:1,author_user_id:'admin',active_epoch:'epoch',dataset:clone(proposal)});await tick();assert.equal(a.statisticsCalls().length,before);a.hook=null;a.click('read');await tick();assert.equal(a.q('[data-energy-statistics-dialog] input').checked,false);assert.equal(a.statisticsCalls().filter(q=>q.type.endsWith('_enable')).length,1);a.quiet();
 }finally{a.close();}
});
test('native subscription ACK is retained across cancellation and remount',async()=>{
 const a=setup('ha-energy-email');try{await a.mount();const wait=deferred();let disposed=0;const original=a.hass.connection.subscribeMessage;a.hass.connection.subscribeMessage=()=>wait.promise;await a.statistics();const before=a.statisticsCalls().length;a.click('close');await a.statistics();assert.equal(a.statisticsCalls().length,before);assert.equal(a.q('[data-statistics-read]').disabled,true);wait.resolve(()=>disposed++);await tick();assert.equal(disposed,1);a.hass.connection.subscribeMessage=original;a.click('read');await tick();assert.ok(a.statisticsCalls().length>before);a.quiet();}finally{a.close();}
});

test('native cancel returns focus and closed dialog starts no further statistics read',async()=>{
 const a=setup('ha-energy-email');try{await a.mount();const trigger=a.q('[data-energy-statistics-open]');trigger.focus();await a.statistics();assert.equal(a.card.shadowRoot.activeElement,a.q('[data-statistics-close]'));const before=a.statisticsCalls().length;a.q('dialog').dispatchEvent(new a.w.Event('cancel',{cancelable:true}));await tick();assert.equal(a.q('dialog[open]'),null);assert.equal(a.card.shadowRoot.activeElement,trigger);assert.equal(a.statisticsCalls().length,before);a.quiet();}finally{a.close();}
});
test('another administrator may disable but cannot publish under the prior author',async()=>{
 const a=setup('ha-energy-email');try{a.stats={...initial(),enabled:true,author_user_id:'previous-admin',active_epoch:'epoch',dataset:clone(proposal)};await a.mount();await a.statistics();assert.equal(a.q('[data-statistics-refresh]').disabled,true);a.check();assert.equal(a.q('[data-statistics-backfill]').disabled,true);assert.equal(a.q('[data-statistics-disable]').disabled,false);a.click('disable');await tick();assert.equal(a.stats.enabled,false);assert.equal(a.statisticsCalls().filter(q=>q.type.endsWith('_refresh')).length,0);a.quiet();}finally{a.close();}
});
