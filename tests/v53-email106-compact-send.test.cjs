"use strict";
// Actual generated consumers after owner sync. No sender/card/controller doubles.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM,VirtualConsole}=require('jsdom');
const clone=x=>JSON.parse(JSON.stringify(x)),tick=async()=>{for(let i=0;i<24;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const facts=()=>({schema:1,purpose:'energy_report',generated_at:'2026-10-19T10:00:00Z',schedule_state:'unconfigured',next_report_at:null,history_state:'ready',last_attempt:{timestamp:'2026-10-19T09:00:00Z',outcome:'accepted_by_smtp',recipient_count:0}});
function setup({admin=true,visible=true,read=true,execute=true,language='en',config,preview=false,statusDenied=false}={}){
 const calls=[],errors=[],unexpected=[],services=[],network=[],subscriptions=[];let grant={visible,read,execute},hook=null,allowPrivate=false;
 const vc=new VirtualConsole();vc.on('error',(...v)=>errors.push(v.join(' ')));vc.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const dom=new JSDOM('',{runScripts:'outside-only',pretendToBeVisual:true,url:'http://localhost/',virtualConsole:vc}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLCanvasElement.prototype.getContext=()=>({});w.fetch=(...v)=>{network.push(v);throw Error('network forbidden');};
 w.eval(['optimizer','energy-insights','energy-email'].map(f=>fs.readFileSync(`src/${f}.js`,'utf8')).join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 const C=w.customElements.get('ha-energy-email'),card=w.document.createElement('ha-energy-email');card.preview=preview;card.setConfig(config||C.getStubConfig());
 const connection=new w.EventTarget();connection.connected=true;connection.subscribeMessage=(callback,q)=>{assert.equal(q.type,'ha_tools_email/subscribe_analysis_updates');const row={callback,active:true};subscriptions.push(row);return Promise.resolve(()=>{row.active=false;});};
 let hass={connected:true,user:{id:'user',is_active:true,is_admin:admin,groups:[]},connection,config:{time_zone:'Europe/Warsaw',currency:'EUR'},language,locale:{language,time_format:'24'},states:{},services:{},
  callWS:async q=>{calls.push(clone(q));if(hook){const value=hook(q);if(value!==undefined)return await value;}
   if(q.type==='ha_tools_email/get_report_status'){if(statusDenied)throw {code:'unauthorized'};return facts();}
   if(q.type==='ha_tools_email/feature_capabilities')return {status:'ready',revision:0,capabilities:{energy_reports:{...grant}}};
   if(allowPrivate&&q.type==='ha_tools_email/get_config')return {smtp_configured:false,schedules:[]};
   if(allowPrivate&&q.type==='ha_tools_email/preview_energy_report')return {status:'no_data',devices:[],total_kwh:null,total_cost:null};
   unexpected.push(clone(q));throw Error('Unrequested API forbidden');
  },callService(...v){services.push(v);throw Error('dispatch forbidden');}};
 const f={w,card,C,calls,subscriptions,get hass(){return hass;},set grant(value){grant=value;},set hook(value){hook=value;},q(s){return card.shadowRoot.querySelector(s);},async mount(){w.document.body.append(card);card.hass=hass;await tick();},signal(){subscriptions.filter(s=>s.active).at(-1)?.callback({});},
  async navigate(key=null){allowPrivate=true;const b=f.q('[data-energy-send-now]');assert.ok(b);b.focus();if(key)b.dispatchEvent(new w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));else b.click();await tick();},
  quiet(){assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);assert.deepEqual(services,[]);assert.deepEqual(network,[]);assert.equal(calls.some(q=>/send_now|send_email|smtp_test|schedule.*(save|delete)/.test(q.type)),false);},
  close(){card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};return f;
}
for(const language of ['pl','en'])for(const key of [null,'Enter',' '])test(`actual compact ${language} ${key||'click'} opens existing Send form, preserves Back/focus, never dispatches`,async()=>{
 const f=setup({language});try{await f.mount();assert.equal(f.card.shadowRoot.querySelectorAll('[data-energy-simple] button').length,2);const send=f.q('[data-energy-send-now]');assert.equal(send.disabled,false);assert.equal(send.textContent,language==='pl'?'Wyślij teraz':'Send now');assert.match(send.title,/formularzu|send form/);
  assert.match(f.q('[data-energy-comparison]').textContent,/Mail server accepted; delivery unconfirmed|Serwer poczty przyjął; doręczenie niepotwierdzone/);assert.match(f.q('[data-energy-cost]').textContent,/Last attempt|Ostatnia próba/);assert.equal(f.calls.some(q=>q.type==='ha_tools_email/get_config'),false);
  const before=f.calls.filter(q=>q.type==='ha_tools_email/feature_capabilities').length;await f.navigate(key);assert.equal(f.calls.filter(q=>q.type==='ha_tools_email/feature_capabilities').length,before+1,'gesture reconfirms explicit capability');assert.equal(f.card._activeTab,'send');assert.equal(f.card._optionsExpandedV5,true);assert.ok(f.q('#send-daily'));assert.ok(f.q('#mail-period-mode'));assert.equal(f.card.shadowRoot.activeElement,f.q('#mail-period-mode'));assert.ok(f.q('[data-energy-back]'));
  f.q('[data-energy-back]').click();await tick();assert.ok(f.q('[data-energy-simple=compact]'));assert.equal(f.card._emailCompactSendUnsubscribeV106,undefined);assert.equal(f.card._optionsExpandedV5,false);assert.equal(f.card.shadowRoot.activeElement,f.q('[data-energy-open]'));f.quiet();
 }finally{f.close();}
});
for(const options of [{admin:true,execute:false},{admin:true,visible:false},{admin:false,execute:true},{admin:false,execute:false}])test(`capability/native upper bound ${JSON.stringify(options)} never opens Send`,async()=>{
 const f=setup(options);try{await f.mount();const send=f.q('[data-energy-send-now]');if(options.admin&&options.visible!==false){assert.ok(send);assert.equal(send.disabled,true);send.click();}else assert.equal(send,null);await tick();assert.equal(f.card._optionsExpandedV5,undefined);assert.equal(f.calls.some(q=>q.type==='ha_tools_email/get_config'),false);f.quiet();}finally{f.close();}
});
test('execute authorization is independent from metadata read and status success',async()=>{
 const f=setup({read:false,statusDenied:true});try{await f.mount();assert.equal(f.q('[data-energy-primary]').textContent,'Unknown');assert.equal(f.q('[data-energy-send-now]').disabled,false);await f.navigate();assert.equal(f.card._activeTab,'send');f.quiet();}finally{f.close();}
});
test('failed fresh execute gate cannot reuse prior true capability or read private config',async()=>{
 const f=setup();try{await f.mount();f.grant={visible:true,read:true,execute:false};await f.navigate();assert.ok(f.q('[data-energy-simple=compact]'));assert.equal(f.q('[data-energy-send-now]').disabled,true);assert.equal(f.calls.some(q=>q.type==='ha_tools_email/get_config'),false);f.quiet();}finally{f.close();}
});
for(const edge of ['role','source','variant','disconnect'])test(`pending execute ACK is fenced after ${edge}`,async()=>{
 const d=deferred(),f=setup();try{await f.mount();f.hook=q=>q.type==='ha_tools_email/feature_capabilities'?d.promise:undefined;const going=f.navigate();await new Promise(resolve=>setImmediate(resolve));
  if(edge==='role'){f.hass.user.is_admin=false;f.card.hass=f.hass;}if(edge==='source')f.card._getTariffHostV3().guard.invalidate();if(edge==='variant')f.card.setConfig({variant:'tile'});if(edge==='disconnect')f.card.remove();
  d.resolve({status:'ready',revision:0,capabilities:{energy_reports:{visible:true,read:true,execute:true}}});await going;assert.notEqual(f.card._optionsExpandedV5,true);assert.equal(f.calls.some(q=>q.type==='ha_tools_email/get_config'),false);f.quiet();
 }finally{d.resolve({});f.close();}
});
test('source revocation in the opened sender clears private form and returns to compact',async()=>{
 const f=setup();try{await f.mount();await f.navigate();f.card._getTariffHostV3().guard.invalidate();assert.equal(f.q('#mail-period-mode'),null);assert.ok(f.q('[data-energy-simple=compact]'));assert.equal(f.card._emailCompactSendUnsubscribeV106,undefined);f.quiet();}finally{f.close();}
});
test('tile and inert preview keep their one action and never read execute capabilities',async()=>{
 for(const options of [{config:{variant:'tile'}},{preview:true}]){const f=setup(options);try{await f.mount();assert.equal(f.q('[data-energy-send-now]'),null);assert.equal(f.card.shadowRoot.querySelectorAll('[data-energy-simple] button').length,1);assert.equal(f.calls.some(q=>q.type==='ha_tools_email/feature_capabilities'),false);f.quiet();}finally{f.close();}}
});
test('compact action row stays a single wrapping flex row, at most two actions, and 44px targets',async()=>{
 const f=setup();try{await f.mount();assert.equal(f.q('[data-energy-actions]').querySelectorAll('button').length,2);const css=[...f.card.shadowRoot.querySelectorAll('style')].map(s=>s.textContent).join('');assert.match(css,/data-energy-actions[^}]*display:flex/);assert.match(css,/min-height:44px/);assert.equal(f.card.getGridOptions().max_rows,4);f.quiet();}finally{f.close();}
});

test('a card whose configured visible tabs exclude Send does not bypass that choice',async()=>{
 const f=setup({config:{variant:'compact',tabs:['preview'],default_tab:'preview'}});try{await f.mount();assert.equal(f.q('[data-energy-send-now]'),null);assert.equal(f.calls.some(q=>q.type==='ha_tools_email/feature_capabilities'),false);f.quiet();}finally{f.close();}
});
