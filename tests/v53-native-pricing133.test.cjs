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
   if(q.type==='ha_tools_email/get_report_status' && q.purpose==='energy_report')throw {code:'unknown_command'};
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

const {createEnergyAnalysisV53}=require('../shared/ha-tools-energy-analysis.js');
const {createEnergyAnalysisViewV53}=require('../shared/ha-tools-energy-analysis-view.js');
function nativeFixture(amount='58.50') {
 const v=clone(producer);v.active_tariff_id=null;v.rates=[];v.fees={};v.alternatives=[];
 for(const key of ['energy_cost','variable_cost','legacy_combined_cost','usage_cost','fixed_cost','total_cost','effective_price'])v.totals[key]=null;
 Object.assign(v.totals,{kwh:'234',pricing_complete:false,components_complete:false,currency:null});
 v.native_pricing={schema:1,source:'ha_energy',period_cost:{status:'ready',amount,recorded_amount:amount,currency:'EUR',scope:'grid_import_recorded_cost',coverage:{complete:true,expected_source_hours:24,measured_source_hours:24},components_status:'unknown',fixed_fees_status:'unknown',reason:null},
 current_prices:[{source_id:'sensor.grid',origin:'number_energy_price',price:'999',currency:'EUR',energy_unit:'kWh',observed_at:'2026-10-11T12:34:00Z',historical:false,status:'ready',reason:null}],
 provenance:[{energy_source_id:'sensor.grid',cost_statistic_id:'sensor.grid_cost'}]};return v;
}
function rendered(v,language='en',section='overview') {
 const card={_hass:{config:{time_zone:v.period.timezone},locale:{language,time_zone:'server',time_format:'24'}}};
 const view=createEnergyAnalysisViewV53({card}),dom=new JSDOM(view.markup(v,{section,view:'data'}));return {dom,root:dom.window.document.body};
}
async function transported(v) {
 const card={isConnected:true,_hass:{user:{id:'reader',is_active:true},connection:{connected:true},connected:true,config:{time_zone:producer.period.timezone},callWS:async()=>v}};
 const c=createEnergyAnalysisV53({card});c.connect();try{return await c.read({period:'day'});}finally{c.disconnect();}
}
for(const language of ['en','pl'])for(const amount of ['58.50','0.00','-12.50'])test(`native133 shared Overview/Costs preserve actual ${amount}, ${language}`,()=>{
 const v=nativeFixture(amount),before=clone(v);
 for(const section of ['overview','rates']) {
  const f=rendered(v,language,section);try{
   const text=f.root.textContent,label=language==='pl'?'Koszt zapisany w HA':'Cost recorded in HA';assert.ok(text.includes(label));
   assert.match(f.root.querySelector('[data-analysis-native-pricing] strong').textContent,new RegExp(amount.replace('.', '[,.]')));
   assert.ok(text.includes(language==='pl'?'Rozbicie kosztu i opłaty stałe są nieznane':'Cost breakdown and fixed fees are unknown'));
   assert.ok(text.includes(language==='pl'?'to nie jest pełny rachunek':'not a complete bill'));
   assert.ok(text.includes(language==='pl'?'Bieżące ceny · teraz':'Current prices · now'));
   assert.match(text,/999 EUR\/kWh/);assert.doesNotMatch(text,/233[,.]?766/);
   assert.equal(f.root.querySelector('[data-analysis-native-details]').textContent.includes(amount),true,'exact Decimal is inspectable');
   if(section==='overview') {const tile=f.root.querySelectorAll('.analysis-tile-primary')[1];assert.ok(tile.textContent.includes(label));assert.match(tile.querySelector('strong').textContent,new RegExp(amount.replace('.', '[,.]')));}
   else assert.equal(f.root.querySelector('[data-analysis-cost-components]'),null,'unknown book components are not repeated as a second cost');
  }finally{f.dom.window.close();}
 }
 assert.deepEqual(v,before,'renderer does not fill totals or reprice');
});
test('native133 partial subset and unavailable remain distinct from a full-period amount',()=>{
 for(const status of ['partial','unavailable','not_configured']) {
  const v=nativeFixture(),p=v.native_pricing.period_cost;p.status=status;p.amount=null;p.recorded_amount=status==='partial'?'12.34':null;p.coverage={complete:false,expected_source_hours:24,measured_source_hours:status==='partial'?5:0};p.reason='missing_cost_statistics';
  const f=rendered(v,'en','rates');try{assert.equal(f.root.querySelector('[data-analysis-native-pricing] strong').textContent,status==='partial'?'12.34 EUR':'No data');if(status==='partial')assert.match(f.root.textContent,/Recorded subset only; full-period cost unavailable/);}finally{f.dom.window.close();}
 }
});
test('native133 book priority and absent/null additive DTO preserve existing view',()=>{
 const book=clone(producer),withNative=clone(book);withNative.native_pricing=nativeFixture().native_pricing;
 const a=rendered(book),b=rendered(withNative),nil=rendered({...book,native_pricing:null});try{assert.equal(a.root.textContent,b.root.textContent);assert.equal(a.root.textContent,nil.root.textContent);}finally{a.dom.window.close();b.dom.window.close();nil.dom.window.close();}
});
test('native133 transport preserves zero, negative and source currency without changing null book costs',async()=>{
 for(const amount of ['58.50','0.00','-12.50']){const v=nativeFixture(amount),result=await transported(v);assert.equal(result.status,'ready');assert.deepEqual(result.snapshot.native_pricing,v.native_pricing);assert.equal(result.snapshot.totals.total_cost,null);}
});
for(const [label,mutate] of [
 ['numeric amount',n=>n.period_cost.amount=58.5],['nonfinite',n=>n.period_cost.amount='1e999'],['missing currency',n=>n.period_cost.currency=null],
 ['status',n=>n.period_cost.status='estimated'],['coverage',n=>n.period_cost.coverage.measured_source_hours=25],['partial full amount',n=>n.period_cost.status='partial'],
 ['fake known fee',n=>n.period_cost.fixed_fees_status='ready'],['fake known components',n=>n.period_cost.components_status='ready'],
 ['historical price',n=>n.current_prices[0].historical=true],['price unit',n=>n.current_prices[0].energy_unit='MWh'],['date',n=>n.current_prices[0].observed_at='2026-10-11'],
 ['oversize prices',n=>n.current_prices=Array(513).fill(n.current_prices[0])],['oversize provenance',n=>n.provenance=Array(513).fill(n.provenance[0])],
 ['private extra field',n=>n.private_settings={recipient:'private'}],['price origin',n=>n.current_prices[0].origin='current_tariff'],
])test(`native133 rejects invalid native DTO: ${label}`,async()=>{const v=nativeFixture();mutate(v.native_pricing);const result=await transported(v);assert.equal(result.status,'error');assert.equal(result.error,'invalid_analysis_response');assert.equal(result.snapshot,null);});
for(const name of names.slice(0,2))for(const language of ['en','pl'])test(`native133 actual ${name} compact uses HA amount and retains focused action, ${language}`,async()=>{
 const f=setup(name,{language,reply:()=>nativeFixture()});try{
  await f.mount();const root=f.card.shadowRoot,line=root.querySelector('[data-energy-cost]'),button=root.querySelector('[data-energy-open]');
  assert.match(root.querySelector('[data-energy-primary]').textContent,/234 kWh/);assert.match(line.textContent,/58[,.]50 EUR/);assert.ok(line.textContent.includes(language==='pl'?'Koszt zapisany w HA':'Cost recorded in HA'));
  assert.match(line.getAttribute('aria-label'),language==='pl'?/opłaty stałe są nieznane/:/fixed fees are unknown/);
  button.focus();f.card._render();assert.equal(root.activeElement,button);assert.equal(root.querySelector('[data-energy-open]'),button);assert.equal(f.requests.some(q=>q.type==='ha_tools_email/get_tariff'),false);f.quiet();
 }finally{f.close();}
});
test('native133 late private native facts cannot publish after identity change',async()=>{
 const old=deferred(),f=setup('ha-energy-optimizer',{reply:()=>old.promise});try{
  await f.mount();f.reply=()=>Promise.reject({code:'unauthorized'});f.update({...f.hass,user:{...f.hass.user,id:'other'}});await tick();old.resolve(nativeFixture('987654.00'));await tick();
  assert.doesNotMatch(f.card.shadowRoot.textContent,/987.?654|sensor.grid_cost/);assert.equal(f.maxRaw,1);f.quiet();
 }finally{f.close();}
});
