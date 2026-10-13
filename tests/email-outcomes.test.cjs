'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const {readFileSync}=require('node:fs');const {join}=require('node:path');
const code=(process.env.EMAIL_SOURCE_PATH?[process.env.EMAIL_SOURCE_PATH]:['src/optimizer.js','src/energy-insights.js','src/energy-email.js','src/chart-vendor.js']).map(p=>readFileSync(join(__dirname,'..',p),'utf8')).join('');
const flush=()=>new Promise(r=>setImmediate(r));
function fixture({backend=false}={}){
 const dom=new JSDOM('<button id="outside">Outside</button>',{runScripts:'dangerously',url:'http://localhost/'}),w=dom.window;
 w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:200,height:44}]:[]};w.eval(code);
 const card=w.document.createElement('ha-energy-email');card._firstRender=true;card._discoveryDone=true;card._emailBackendChecked=true;card._schedule=()=>{};card._config.show_support=false;
 const calls=[];let resolve,reject;const response=new Promise((yes,no)=>{resolve=yes;reject=no});
 const hass={user:{id:'one',is_admin:true},connection:Object.assign(new w.EventTarget(),{connected:true}),states:{},language:'en',locale:{language:'en'},config:{time_zone:'UTC',currency:'EUR'},services:{ha_tools_email:{send:{},test:{}}},callService:(domain,service,data)=>{calls.push({domain,service,data});return response},callWS:msg=>{calls.push(msg);return response}};
 card.hass=hass;card._emailBackendAvailable=backend;card._emailBackendConfig={smtp_configured:true};
 card._fetchRecorderStats=async period=>{card[`_periodStatus_${period}`]='ready';card[`_periodCache_${period}`]=[{name:'Synthetic grid',entity_id:'sensor.synthetic',month:2,lastMonth:0,cost:1}];card[`_periodWindow_${period}`]={start:'2026-10-12T10:00:00Z',end:'2026-10-13T10:00:00Z'}};
 w.document.body.append(card);card.setActiveTab('send');
 return{dom,w,card,hass,calls,resolve,reject,root:card.shadowRoot,async start(kind){const method=kind==='smtp'?'_testSmtp':'_sendReport';const original=card[method].bind(card);let work;card[method]=(...args)=>work=original(...args);const b=card.shadowRoot.getElementById(kind==='smtp'?'btn-smtp-test':'send-daily');b.focus();b.click();await flush();return{work}},close(){resolve();dom.window.close()}};
}
for(const kind of ['legacy','smtp'])for(const outcome of ['resolved','rejected'])test(`${kind} ${outcome} is Unconfirmed and never exposes raw transport errors`,async()=>{
 const f=fixture();try{const {work}=await f.start(kind);assert.equal(f.calls.length,1);outcome==='resolved'?f.resolve():f.reject(new Error('SECRET smtp://password@private.example'));await work;
 const region=f.root.querySelector(`[data-email-result="${kind==='smtp'?'smtp':'send'}"]`);assert.ok(region);assert.ok(region.querySelector('[data-result-state="unconfirmed"]'));assert.doesNotMatch(region.textContent,/SECRET|password|private.example|sent!|Test OK/i);assert.match(region.textContent,/unconfirmed/i);
 f.card.hass={...f.hass,language:'pl',locale:{language:'pl'}};f.card._render();const pl=f.root.querySelector(`[data-email-result="${kind==='smtp'?'smtp':'send'}"]`);assert.match(pl.textContent,/Niepotwierdzony/);assert.doesNotMatch(pl.textContent,/Request completed|Delivery unconfirmed/);assert.equal(f.calls.length,1);
 }finally{f.close()}
});
for(const [ack,state] of [[{status:'accepted_by_smtp'},'success'],[{success:true},'success'],[{},'unconfirmed'],[null,'unconfirmed'],[{success:true,status:'failed'},'unconfirmed'],[{success:false,status:'accepted_by_smtp'},'unconfirmed']])test(`backend acknowledgement ${JSON.stringify(ack)} maps to ${state}`,async()=>{
 const f=fixture({backend:true});try{const {work}=await f.start('backend');f.resolve(ack);await work;const region=f.root.querySelector('[data-email-result="send"]');assert.ok(region?.querySelector(`[data-result-state="${state}"]`));assert.match(region.textContent,/delivery unconfirmed|outcome unconfirmed/i);assert.doesNotMatch(region.textContent,/delivered successfully|report sent/i);assert.equal(f.calls.length,1)}finally{f.close()}
});
for(const kind of ['legacy','smtp','backend'])for(const change of ['user','offline','connection','detach','browser-event','connection-event'])test(`${kind} late result after ${change} is dropped while the raw request stays single-flight`,async()=>{
 const f=fixture({backend:kind==='backend'});try{const {work}=await f.start(kind);assert.equal(f.calls.length,1);
 if(change==='browser-event'){f.w.dispatchEvent(new f.w.Event('offline'));f.w.dispatchEvent(new f.w.Event('online'));}
 else if(change==='connection-event'){f.hass.connection.dispatchEvent(new f.w.Event('disconnected'));f.hass.connection.dispatchEvent(new f.w.Event('ready'));}
 else if(change==='detach'){f.card.remove();f.w.document.body.append(f.card);f.card._render()}
 else {const h={...f.hass};if(change==='user')h.user={id:'two',is_admin:true};if(change==='offline')h.connected=false;if(change==='connection')h.connection={connected:true};f.card.hass=h;}
 if(kind==='smtp')void f.card._testSmtp();else void f.card._sendReport('daily');await flush();assert.equal(f.calls.length,1,'context change must not release an unsettled send');
 f.resolve({status:'accepted_by_smtp'});await work;assert.equal(f.root.querySelector('[data-email-result]'),null);assert.equal(f.card._lastSent.daily,undefined);assert.equal(f.card._sending,false);assert.equal(f.card._smtpTesting,false);
 }finally{f.close()}
});
test('legacy read finishing in a new identity never sends its old report',async()=>{
 const f=fixture();try{let finishRead;f.card._fetchRecorderStats=()=>new Promise(r=>finishRead=r);const work=f.card._sendReport('daily');f.card.hass={...f.hass,user:{id:'two',is_admin:true}};finishRead();await work;assert.equal(f.calls.length,0);assert.equal(f.root.querySelector('[data-email-result]'),null)}finally{f.close()}
});
test('incomplete Recorder data is No data and no SMTP call',async()=>{
 const f=fixture();try{f.card._fetchRecorderStats=async()=>{f.card._periodStatus_day='partial'};await f.card._sendReport('daily');assert.ok(f.root.querySelector('[data-email-result="send"] [data-result-state="no_data"]'));assert.equal(f.calls.length,0)}finally{f.close()}
});
test('backend configuration alone reports Not checked without sending a SMTP test',async()=>{
 const f=fixture({backend:true});try{f.hass.services={};f.card._render();await f.card._testSmtp();assert.ok(f.root.querySelector('[data-email-result="smtp"] [data-result-state="not_checked"]'));assert.match(f.root.textContent,/No test was sent/);assert.equal(f.calls.length,0)}finally{f.close()}
});

for(const kind of ['legacy','smtp','backend'])test(`${kind} blocks both report and SMTP requests until settlement`,async()=>{
 const f=fixture({backend:kind==='backend'});try{const {work}=await f.start(kind);assert.equal(f.calls.length,1);assert.ok(f.root.querySelector('[data-email-result] [data-result-state="not_checked"]'));
 for(const id of ['send-daily','send-weekly','send-monthly','btn-smtp-test'])assert.equal(f.root.getElementById(id).disabled,true,id);
 void f.card._sendReport('daily');void f.card._testSmtp();await flush();assert.equal(f.calls.length,1);
 f.resolve({status:'accepted_by_smtp'});await work;
 }finally{f.close()}
});
