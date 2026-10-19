// 95b: real mounted cards + real analysis controller/binding, no controller test doubles.
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
const {energyBackend}=require('./helpers/energy-backend-fixture.cjs');
const producer=JSON.parse(fs.readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
const clone=x=>JSON.parse(JSON.stringify(x)),names=['ha-energy-optimizer','ha-energy-insights','ha-energy-email'];
const tick=async()=>{for(let i=0;i<16;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function setup(name,{config,manualAck=false,ackError=null,reply=()=>clone(producer),tariffError=null,language='en'}={}){
 const errors=[],unexpected=[],requests=[],subscriptions=[],services=[],network=[];
 const vc=new VirtualConsole();vc.on('error',(...a)=>errors.push(a.join(' ')));vc.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/',virtualConsole:vc}),w=dom.window,NativeDate=w.Date;
 w.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-10-11T12:34:00Z']));}static now(){return NativeDate.parse('2026-10-11T12:34:00Z');}};
 w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLCanvasElement.prototype.getContext=()=>({});
 w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:390,height:44}]:[];};
 w.fetch=(...a)=>{network.push(a);throw Error('network forbidden');};
 const helper=fs.readFileSync('shared/ha-tools-energy-card-options.js','utf8'),sources=[];
 for(const file of ['optimizer','energy-insights','energy-email']){
  let source=fs.readFileSync(`src/${file}.js`,'utf8');
  const start=source.indexOf('function createEnergyCardOptionsV5('),end=source.indexOf('\ncreateEnergyCardOptionsV5({',start);
  assert.ok(start>=0&&end>start,'overlay only the real shared factory until owner sync');
  sources.push(source.slice(0,start)+helper+source.slice(end));
 }
 w.eval(sources.join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 const C=w.customElements.get(name),card=w.document.createElement(name);
 card.getBoundingClientRect=()=>({width:390});
 // The default path is the actual NEW stub, with NO tariff_profile or data fields.
 card.setConfig(config===undefined?C.getStubConfig():config);
 let currentReply=reply,raw=0,maxRaw=0,unsubs=0;
 const connection=new w.EventTarget();connection.connected=true;
 connection.subscribeMessage=(callback,q)=>{
  assert.equal(q.type,'ha_tools_email/subscribe_analysis_updates');
  const ack=deferred(),row={callback,ack,active:false};subscriptions.push(row);
  row.confirm=()=>ack.resolve(()=>{row.active=false;unsubs++;});
  if(ackError)ack.reject(ackError);else if(!manualAck){row.active=true;row.confirm();}
  return ack.promise;
 };
 const price=energyBackend(card,async()=>{throw {code:'unexpected_price_delegate'};},{profile:producer.rates[0].profile,revision:4});
 let hass={user:{id:'reader',is_active:true,is_admin:false,groups:[],group_ids:[]},connected:true,connection,
  config:{time_zone:producer.period.timezone,currency:'EUR'},language,locale:{language,time_zone:'server',time_format:'24'},states:{},services:{},
  callWS:async q=>{
   requests.push(clone(q));
   if(q.type==='ha_tools_email/energy_analysis'){
    raw++;maxRaw=Math.max(maxRaw,raw);try{return await currentReply(q);}finally{raw--;}
   }
   if(q.type==='ha_tools_email/get_tariff'){if(tariffError)throw tariffError;return {profile:clone(producer.rates[0].profile),revision:4,updated_at:null};}
   if(q.type==='ha_tools_email/energy_snapshot')return {schema:1,generated_at:'2026-10-11T12:34:00Z',profile_source:q.profile?'override':'shared',tariff_revision:q.profile?null:4,status:'partial',currency:'EUR',current:{available:true,zone_class:'cheap',cheap:true,energy_rate:0.5,variable_rate:0.1,usage_rate:0.6},today:{usage_cost:null,energy_cost:null,variable_cost:null},next_cheap:{status:'known',start:'2026-10-11T22:00:00Z'}};
   if(q.type==='ha_tools_email/energy_price_queries')return price(q);
   unexpected.push(q);throw {code:'unknown_command'};
  },callService(...a){services.push(a);throw Error('write forbidden');}};
 const api={w,card,C,requests,subscriptions,errors,unexpected,get hass(){return hass;},get maxRaw(){return maxRaw;},get unsubs(){return unsubs;},set reply(fn){currentReply=fn;},
  async mount(){w.document.body.append(card);card.hass=hass;await tick();},
  update(next){hass=next;card.hass=hass;},
  ack(index=0){subscriptions[index].active=true;subscriptions[index].confirm();},
  signal(){subscriptions.filter(row=>row.active).at(-1)?.callback({data:{registry_revision:99}});},
  reads(){return requests.filter(q=>q.type==='ha_tools_email/energy_analysis');},
  quiet(){assert.deepEqual(unexpected,[]);assert.deepEqual(network,[]);assert.deepEqual(services,[]);assert.deepEqual(errors,[]);},
  close(){card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
 return api;
}
for(const name of names){
 test(`${name}: actual new stub is compact with no data fields; legacy config and explicit variant precedence survive`,()=>{
  const f=setup(name);try{
   assert.deepEqual(Object.keys(f.C.getStubConfig()).sort(),['title','type','variant']);assert.equal(f.C.getStubConfig().variant,'compact');assert.equal(Object.hasOwn(f.card._config,'tariff_profile'),false);
   f.card.setConfig({});assert.equal(f.card._config.variant,undefined);assert.equal(f.card.getGridOptions().columns,12);
   f.card.setConfig({compact:true});assert.equal(f.card.getGridOptions().columns,6);
   f.card.setConfig({variant:'full',compact:true});assert.equal(f.card.getGridOptions().columns,12);
   f.card.setConfig({variant:'tile',compact:true});assert.equal(f.card.getGridOptions().rows,1);assert.equal(f.card.getCardSize(),1);
   f.card.setConfig({variant:'compact'});assert.equal(f.card.getGridOptions().columns,12);assert.equal(f.card.getGridOptions().max_rows,4);assert.equal(f.card.getGridOptions().rows,4);assert.equal(f.card.getCardSize(),4);
   assert.throws(()=>f.card.setConfig({variant:'bad'}),/variant/);assert.throws(()=>f.card.setConfig({tap_target:'https://elsewhere'}),/tap_target/);
   assert.throws(()=>f.card.setConfig({variant:'tile',tap_target:'more-info',entity:'not-an-id'}),/entity|encję/);
   f.card.setConfig({tap_target:'more-info'});assert.equal(f.card._config.tap_target,'more-info','selection can wait for the entity picker');
   f.card.setConfig({});assert.equal(f.card._config.variant,undefined);assert.equal(f.card._config.tap_target,undefined);
  }finally{f.close();}
 });
 for(const language of ['en','pl'])test(`${name}: mounted default stub, ${language}, one primary/two secondary, stable focus and bounded presentation`,async()=>{
  const f=setup(name,{language});try{
   await f.mount();const root=f.card.shadowRoot;assert.ok(root.querySelector('[data-energy-simple="compact"]'));
   assert.equal(root.querySelectorAll('button').length,1);assert.equal(root.querySelectorAll('[data-energy-secondary]>span').length,2);assert.equal(root.querySelectorAll('.tabs,[data-energy-options-help],input,select').length,0);
   const button=root.querySelector('[data-energy-open]');button.focus();const count=f.reads().length;f.card._render();assert.equal(root.activeElement,button);assert.equal(root.querySelector('[data-energy-open]'),button);assert.equal(f.reads().length,count);
   if(name==='ha-energy-email'){assert.equal(f.requests.length,0);assert.match(root.querySelector('[data-energy-primary]').textContent,/Unknown|Brak danych/);}
   else {assert.equal(Object.hasOwn(f.card._config,'tariff_profile'),false);assert.match(root.querySelector('[data-energy-primary]').textContent,/250 kWh/);assert.match(root.querySelector('[data-energy-cost]').textContent,/246[,.]00 EUR/);assert.match(root.querySelector('[data-energy-comparison]').textContent,/Unknown|Brak danych/);assert.deepEqual(f.reads(),[{type:'ha_tools_email/energy_analysis',period:'day',comparison:'previous'}]);assert.equal(f.requests.some(q=>q.type==='ha_tools_email/get_tariff'),false);}
   f.update({...f.hass,locale:{...f.hass.locale,language:language==='pl'?'en':'pl'}});assert.equal(root.activeElement,button);assert.equal(f.reads().length,count);f.quiet();
  }finally{f.close();}
 });
 test(`${name}: real Enter/Space/click opens full; Back restores focus, switch/remove options reset expanded state`,async()=>{
  const f=setup(name);try{
   await f.mount();const root=f.card.shadowRoot;
   for(const key of ['Enter',' ']){
    const before=f.subscriptions.filter(s=>s.active),button=root.querySelector('[data-energy-open]');button.focus();button.dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
    assert.equal(f.card._optionsExpandedV5,true);const back=root.querySelector('[data-energy-back]');assert.ok(back);assert.equal(root.activeElement,back);assert.ok(before.every(row=>!row.active),'summary subscription stops on full');
    back.click();assert.equal(f.card._optionsExpandedV5,false);assert.equal(root.activeElement,root.querySelector('[data-energy-open]'));await tick();
   }
   root.querySelector('[data-energy-open]').click();f.card.setConfig({variant:'tile'});f.card._render();assert.equal(f.card._optionsExpandedV5,false);assert.ok(root.querySelector('[data-energy-simple="tile"]'));
   f.card.setConfig({});f.card._render();assert.equal(f.card._config.variant,undefined);assert.equal(root.querySelector('[data-energy-simple]'),null);assert.equal(root.querySelector('[data-energy-back]'),null);
  }finally{f.close();}
 });
 test(`${name}: fixed Energy navigation and more-info require an entity in the current hass state`,async()=>{
  const f=setup(name,{config:{variant:'tile',tap_target:'energy'}});try{
   await f.mount();f.card.shadowRoot.querySelector('[data-energy-open]').click();assert.equal(f.w.location.pathname,'/energy');
   f.card.setConfig({variant:'compact',tap_target:'more-info'});f.card._render();assert.equal(f.card.shadowRoot.querySelector('button').disabled,true);
   f.card.setConfig({variant:'compact',tap_target:'more-info',entity:'sensor.grid'});let seen=[];f.card.addEventListener('hass-more-info',e=>seen.push(e.detail.entityId));
   f.update({...f.hass,states:{'sensor.grid':{state:'0'}}});f.card.shadowRoot.querySelector('button').click();assert.deepEqual(seen,['sensor.grid']);
   f.card.setConfig({variant:'compact',tap_target:'more-info'});f.card._render();assert.equal(f.card._config.entity,undefined);assert.equal(f.card.shadowRoot.querySelector('button').disabled,true);
   f.update({...f.hass,states:{}});assert.equal(f.card.shadowRoot.querySelector('button').disabled,true);f.card.shadowRoot.querySelector('button').click();assert.equal(seen.length,1);
  }finally{f.close();}
 });
 test(`${name}: native bounded entity picker completes more-info with no YAML and preserves unknown config/focus`,()=>{
  const f=setup(name);try{
   const editor=f.C.getConfigElement();editor.setConfig({type:`custom:${name}`,foreign:{keep:1}});f.w.document.body.append(editor);
   const events=[];editor.addEventListener('config-changed',e=>{events.push(e.detail.config);editor.setConfig(e.detail.config);});assert.equal(events.length,0);assert.equal(editor._config.variant,undefined);
   const states=Object.fromEntries(Array.from({length:250},(_,i)=>[`sensor.item_${String(i).padStart(3,'0')}`,{state:'0',attributes:{friendly_name:`Item ${i}`}}]));
   editor.hass={...f.hass,states};
   const root=editor.shadowRoot,target=root.querySelector('[data-config="tap_target"]');target.value='more-info';target.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(events.at(-1).tap_target,'more-info');assert.equal(root.querySelector('[data-config-error]').textContent,'');
   const entity=root.querySelector('[data-config="entity"]');assert.ok(entity.options.length<=201);
   const search=root.querySelector('[data-entity-search]');search.focus();search.value='item_249';search.dispatchEvent(new f.w.Event('input',{bubbles:true}));assert.equal(root.activeElement,search);assert.equal(entity.options.length,2);
   entity.focus();entity.value='sensor.item_249';entity.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(events.at(-1).entity,'sensor.item_249');assert.equal(events.at(-1).foreign.keep,1);assert.equal(root.activeElement,entity);
   const variant=root.querySelector('[data-config="variant"]');variant.value='compact';variant.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(events.at(-1).variant,'compact');assert.equal(root.querySelector('[data-config="compact"]').disabled,true);
   editor.hass={...f.hass,states,language:'pl',locale:{language:'pl'}};assert.equal(root.querySelector('[data-option-label="entity"]').textContent,'Istniejąca encja do szczegółów');assert.equal(root.querySelector('[data-option-label="variant"]').textContent,'Wariant');
   variant.value='';variant.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(Object.hasOwn(events.at(-1),'variant'),false);
   editor.remove();
  }finally{f.close();}
 });
}
for(const name of names.slice(0,2)){
 test(`${name}: compact waits for actual ACK; events refresh native analysis; zero and missing facts stay distinct`,async()=>{
  const f=setup(name,{manualAck:true});try{
   await f.mount();assert.equal(f.reads().length,0);assert.equal(f.subscriptions.length,1);assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Unknown/);
   f.ack();await tick();assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/250 kWh/);
   const zero=clone(producer);zero.totals.kwh='0';zero.totals.usage_cost='0.00';zero.comparisons.previous.percent=0;
   f.reply=()=>zero;f.signal();await tick();assert.equal(f.reads().length,2);assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'0 kWh');assert.match(f.card.shadowRoot.querySelector('[data-energy-cost]').textContent,/0[,.]00 EUR/);assert.match(f.card.shadowRoot.querySelector('[data-energy-comparison]').textContent,/Unknown/);
   const missing=clone(zero);missing.totals.kwh=null;missing.totals.usage_cost=null;missing.totals.measurement_complete=false;missing.totals.pricing_complete=false;missing.comparisons.previous.status='unknown';missing.comparisons.previous.percent=null;
   f.reply=()=>missing;f.signal();await tick();assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'Unknown');assert.match(f.card.shadowRoot.querySelector('[data-energy-cost]').textContent,/Unknown/);assert.match(f.card.shadowRoot.querySelector('[data-energy-comparison]').textContent,/Unknown/);f.quiet();
  }finally{f.close();}
 });
 test(`${name}: tile without override confirms shared tariff then snapshot; tariff denial never gates compact analysis`,async()=>{
  const f=setup(name,{config:{variant:'tile'}});try{
   await f.mount();await new Promise(resolve=>setTimeout(resolve,0));await tick();assert.equal(Object.hasOwn(f.card._config,'tariff_profile'),false);
   assert.ok(f.requests.some(q=>q.type==='ha_tools_email/get_tariff'));assert.ok(f.requests.some(q=>q.type==='ha_tools_email/energy_snapshot'));
   assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Cheap/);assert.equal(f.card.getGridOptions().rows,1);assert.equal(f.subscriptions.length,0);f.quiet();
  }finally{f.close();}
  const denied=setup(name,{config:{variant:'tile'},tariffError:{code:'unauthorized'}});try{
   await denied.mount();assert.match(denied.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Unknown/);
   denied.card.setConfig({variant:'compact'});await tick();assert.match(denied.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/250 kWh/);assert.equal(denied.reads().length,1);denied.quiet();
  }finally{denied.close();}
 });
 for(const change of ['identity','role','inactive','event-revocation'])test(`${name}: pending ${change} preserves raw occupancy and never reveals old facts`,async()=>{
  const old=deferred(),f=setup(name,{reply:()=>old.promise});try{
   await f.mount();assert.equal(f.reads().length,1);const secret=clone(producer);secret.totals.kwh='987654';
   const fresh=clone(producer);fresh.totals.kwh='0';
   f.reply=change==='event-revocation'?()=>Promise.reject({code:'unauthorized'}):()=>fresh;
   if(change==='event-revocation')f.signal();else{
    const user={...f.hass.user};if(change==='identity')user.id='other';if(change==='role')user.is_admin=true;if(change==='inactive')user.is_active=false;
    f.update({...f.hass,user});
   }
   await tick();assert.equal(f.reads().length,1,'queued read waits for occupied raw settlement');assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'Unknown');
   old.resolve(secret);await tick();assert.doesNotMatch(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/987/);assert.equal(f.maxRaw,1);
   if(change==='identity'||change==='role')assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'0 kWh');
   else assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'Unknown');f.quiet();
  }finally{f.close();}
 });
 test(`${name}: disconnect/reconnect keeps real controller raw occupied; late ACK is unsubscribed`,async()=>{
  const old=deferred(),f=setup(name,{reply:()=>old.promise});try{
   await f.mount();const first=f.subscriptions[0];f.card.remove();assert.equal(first.active,false);f.reply=()=>clone(producer);f.w.document.body.append(f.card);await tick();assert.equal(f.reads().length,1);
   old.resolve(clone(producer));await tick();assert.equal(f.maxRaw,1);assert.equal(f.reads().length,2);f.quiet();
  }finally{f.close();}
  const ack=setup(name,{manualAck:true});try{await ack.mount();ack.card.remove();ack.ack();await tick();assert.equal(ack.reads().length,0);assert.equal(ack.subscriptions[0].active,false);assert.equal(ack.unsubs,1);}finally{ack.close();}
 });
 for(const ackError of [{code:'unauthorized'},{code:'unknown_command'}])test(`${name}: missing/refused modern ACK never exposes an unacknowledged DTO`,async()=>{
  const f=setup(name,{ackError});try{await f.mount();assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'Unknown');assert.ok(f.reads().length<=1);assert.equal(f.requests.some(q=>q.type.startsWith('recorder/')||q.type==='energy/get_prefs'),false);f.quiet();}finally{f.close();}
 });
}
test('Email never infers metadata from energy snapshots/config or old identity; no private protocol reads',async()=>{
 const f=setup('ha-energy-email');try{
  await f.mount();f.card._energySnapshotV5={...producer,next_report:'PRIVATE_NEXT',last_report:'PRIVATE_LAST',result:'PRIVATE_RESULT'};f.card._config.recipient='PRIVATE_RECIPIENT';f.card._render();
  f.update({...f.hass,user:{id:'revoked',is_active:false,is_admin:false}});assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Unknown/);assert.doesNotMatch(f.card.shadowRoot.textContent,/PRIVATE_/);
  f.update({...f.hass,user:{id:'other',is_active:true,is_admin:false}});assert.equal(f.requests.length,0);assert.equal(f.subscriptions.length,0);f.quiet();
 }finally{f.close();}
});
