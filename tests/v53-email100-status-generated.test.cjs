"use strict";
// Owner syncs normal consumers first; no helper/module overlay or global injection.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const clone=x=>JSON.parse(JSON.stringify(x));
const tick=async()=>{for(let i=0;i<16;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const facts=()=>({schema:1,purpose:'energy_report',generated_at:'2026-10-19T08:00:00+00:00',schedule_state:'enabled',next_report_at:'2026-10-20T05:00:00+00:00',history_state:'ready',last_attempt:{timestamp:'2026-10-19T07:30:00+00:00',outcome:'accepted_by_smtp',recipient_count:0}});
function setup({language='en',config,preview=false,reply=()=>facts(),manualAck=false,ackError=null}={}){
 const calls=[],subscriptions=[],errors=[],unexpected=[];let handler=reply;
 const vc=new VirtualConsole();vc.on('error',(...args)=>errors.push(args.join(' ')));vc.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const dom=new JSDOM('<body></body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}};w.HTMLCanvasElement.prototype.getContext=()=>({});w.fetch=()=>{throw Error('network forbidden');};
 w.eval(['optimizer','energy-insights','energy-email'].map(f=>fs.readFileSync(`src/${f}.js`,'utf8')).join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 assert.equal(typeof w.createReportStatusV53,'undefined','report status must remain constructor-local behind the host bridge');
 const C=w.customElements.get('ha-energy-email'),card=w.document.createElement('ha-energy-email');card.preview=preview;card.setConfig(config || C.getStubConfig());
 const connection=new w.EventTarget();connection.connected=true;
 connection.subscribeMessage=(callback,q)=>{assert.equal(q.type,'ha_tools_email/subscribe_analysis_updates');const ack=deferred(),row={callback,ack,active:false};row.confirm=()=>{row.active=true;ack.resolve(()=>{row.active=false;});};subscriptions.push(row);if(ackError)ack.reject(ackError);else if(!manualAck)row.confirm();return ack.promise;};
 let hass={user:{id:'reader',is_active:true,is_admin:false},connected:true,connection,config:{time_zone:'Europe/Warsaw',currency:'EUR'},locale:{language,time_zone:'server',time_format:'24',date_format:'language'},language,states:{},services:{},callWS:async q=>{calls.push(clone(q));if(q.type==='ha_tools_email/feature_capabilities')return {status:'ready',revision:0,capabilities:{energy_reports:{visible:true,read:true,execute:false}}};if(q.type==='ha_tools_email/get_report_status'&&q.purpose==='energy_report')return handler(q);unexpected.push(q);throw Error('private/unrelated read forbidden');},callService(){throw Error('send forbidden');}};
 return {w,card,C,calls,subscriptions,get hass(){return hass;},set reply(fn){handler=fn;},async mount(){w.document.body.append(card);card.hass=hass;await tick();},update(next){hass=next;card.hass=hass;},ack(){subscriptions.at(-1).confirm();},signal(){subscriptions.filter(row=>row.active).at(-1)?.callback({});},quiet(){assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);},close(){card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
}
for(const language of ['en','pl'])test('actual generated Email compact formats bounded calendar/attempt facts in native HA profile '+language,async()=>{
 const f=setup({language});try{
  assert.equal(f.calls.length,0);await f.mount();const root=f.card.shadowRoot,format=createFormatUi.forHass(f.hass);
  assert.equal(typeof f.card._getTariffHostV3().reportStatus,'function');assert.deepEqual(f.calls,[{type:'ha_tools_email/get_report_status',purpose:'energy_report'}]);
  assert.equal(root.querySelector('[data-energy-primary]').textContent,format.dateTime(facts().next_report_at));
  assert.ok(root.querySelector('[data-energy-cost]').textContent.includes(format.dateTime(facts().last_attempt.timestamp)));
  assert.match(root.querySelector('[data-energy-comparison]').textContent,/Mail server accepted; delivery unconfirmed|Serwer poczty przyjął; doręczenie niepotwierdzone/);assert.match(root.querySelector('[data-energy-comparison]').textContent,/Recipients of that attempt: 0|Odbiorcy tej próby: 0/);
  assert.equal(root.querySelectorAll('[data-energy-secondary]>span').length,2);assert.equal(root.querySelectorAll('button').length,1);assert.equal(root.querySelector('[data-energy-zonebar]'),null);assert.equal(root.querySelector('.tabs'),null);
  const button=root.querySelector('[data-energy-open]');button.focus();const count=f.calls.length;f.update({...f.hass,locale:{...f.hass.locale,language:language==='pl'?'en':'pl',time_format:'12'}});assert.equal(root.activeElement,button);assert.equal(root.querySelector('[data-energy-open]'),button);assert.equal(f.calls.length,count);f.quiet();
 }finally{f.close();}
});
test('actual generated Email tile keeps a readable short profile date and a named icon action',async()=>{
 const f=setup();try{await f.mount();const retained=f.card._emailStatusV100;f.card.setConfig({variant:'tile'});await tick();assert.equal(f.card._emailStatusV100,retained);const root=f.card.shadowRoot;assert.equal(f.card.getGridOptions().rows,1);const fmt=createFormatUi.forHass(f.hass),primary=root.querySelector('[data-energy-primary]');for(const state of primary.querySelectorAll('[data-energy-state-long],[data-energy-state-short]'))assert.equal(state.textContent,`${fmt.date(facts().next_report_at,true)} · ${fmt.clock(facts().next_report_at)}`);assert.equal(primary.querySelectorAll('[data-energy-state-long],[data-energy-state-short]').length,2);assert.equal(primary.title,`Scheduled report: ${fmt.dateTime(facts().next_report_at)}`);assert.equal(primary.getAttribute('aria-label'),primary.title);assert.equal(root.querySelector('[data-energy-open]').textContent,'✉');assert.equal(root.querySelector('[data-energy-open]').getAttribute('aria-label'),'Open Energy report');assert.equal(root.querySelector('[data-energy-secondary]'),null);assert.equal(root.querySelectorAll('button').length,1);assert.doesNotMatch(root.textContent,/delivered|sent successfully/);f.quiet();}finally{f.close();}
});
for(const problem of ['unconfigured','unknown-command','denied','no-ACK'])test('actual generated Email '+problem+' stays Unknown without private fallback',async()=>{
 const options=problem==='unconfigured'?{reply:()=>({...facts(),schedule_state:'unconfigured',next_report_at:null,history_state:'ready',last_attempt:null})}:problem==='no-ACK'?{ackError:{code:'unknown_command'}}:{reply:()=>Promise.reject({code:problem==='denied'?'unauthorized':'unknown_command'})};
 const f=setup(options);try{await f.mount();assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'Unknown');assert.match(f.card.shadowRoot.querySelector('[data-energy-comparison]').textContent,/Unknown/);assert.equal(f.calls.length,problem==='no-ACK'?0:1);f.quiet();}finally{f.close();}
});
test('actual generated Email clears facts immediately on role/source events and never starts analysis or private IO',async()=>{
 const f=setup();try{await f.mount();f.reply=()=>Promise.reject({code:'unauthorized'});f.card._hass.user.is_admin=true;f.card.hass=f.card._hass;assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'Unknown');await tick();assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'Unknown');assert.ok(f.calls.every(q=>['ha_tools_email/get_report_status','ha_tools_email/feature_capabilities'].includes(q.type)));assert.equal(f.calls.filter(q=>q.type==='ha_tools_email/feature_capabilities').length,1,'role change to admin checks execute metadata once');f.quiet();}finally{f.close();}
});
test('actual generated Email late ACK/unmount/remount never replaces a busy factory',async()=>{
 const old=deferred(),f=setup({manualAck:true,reply:()=>old.promise});try{
  await f.mount();assert.equal(f.calls.length,0);f.ack();await tick();assert.equal(f.calls.length,1);const retained=f.card._emailStatusV100;f.card.remove();assert.equal(f.subscriptions[0].active,false);
  f.reply=()=>facts();f.w.document.body.append(f.card);await tick();f.ack();await tick();assert.equal(f.card._emailStatusV100,retained);assert.equal(f.calls.length,1);
  old.resolve(facts());await tick();assert.equal(f.calls.length,2);assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,createFormatUi.forHass(f.hass).dateTime(facts().next_report_at));f.quiet();
 }finally{old.resolve(facts());f.close();}
});
test('actual generated Email preview and full inactive metadata surface have no status IO',async()=>{
 const f=setup({preview:true});try{await f.mount();assert.equal(f.calls.length,0);assert.equal(f.subscriptions.length,0);f.card.setConfig({variant:'full',default_tab:'preview'});f.card._render();await tick();assert.equal(f.calls.filter(q=>q.type==='ha_tools_email/get_report_status').length,0);assert.equal(f.card._emailStatusV100.state().status,'idle');assert.ok(f.calls.every(q=>q.type==='ha_tools_email/feature_capabilities'),'full report keeps its separate read-only capability handshake');f.quiet();}finally{f.close();}
});
