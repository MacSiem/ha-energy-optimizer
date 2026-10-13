'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');const path=require('node:path');
const code=(process.env.EMAIL_SOURCE_PATH?[process.env.EMAIL_SOURCE_PATH]:['src/optimizer.js','src/energy-insights.js','src/energy-email.js','src/chart-vendor.js']).map(p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8')).join('');
const flush=()=>new Promise(r=>setImmediate(r));const id='automation.send_daily_energy_report';
async function fixture(state='off'){
 const dom=new JSDOM('<button id="outside">Outside</button>',{runScripts:'dangerously',url:'http://localhost/'}),w=dom.window;w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:200,height:44}]:[]};w.eval(code);
 const card=w.document.createElement('ha-energy-email');card._firstRender=true;card._discoveryDone=true;card._emailBackendChecked=true;card._schedule=()=>{};card._config.show_support=false;
 let resolve,reject;const response=new Promise((yes,no)=>{resolve=yes;reject=no});const calls=[];const hass={user:{id:'one',is_admin:true},connection:Object.assign(new w.EventTarget(),{connected:true}),states:{[id]:{state}},config:{currency:'EUR',time_zone:'UTC'},language:'en',locale:{language:'en'},services:{ha_tools_email:{send:{},test:{}}},callWS:async()=>({schema:1,schedules:[]}),callService:(...args)=>{calls.push(args);return response}};
 card.hass=hass;w.document.body.append(card);card.setActiveTab('schedule');await flush();let work;const original=card._toggleAuto.bind(card);card._toggleAuto=(...args)=>work=original(...args);
 return{dom,w,card,hass,calls,resolve,reject,root:card.shadowRoot,start(){const b=card.shadowRoot.getElementById(state==='off'?'enable-daily':'disable-daily');assert.ok(b);b.focus();b.click();return work},close(){resolve();dom.window.close()}};
}
for(const initial of ['off','on'])for(const outcome of ['echo','ack','reject'])test(`legacy ${initial} + ${outcome} has a truthful result and preserves focus`,async()=>{
 const f=await fixture(initial);try{const work=f.start();assert.equal(f.calls.length,1);assert.equal(f.calls[0][4],false);assert.ok(f.root.querySelector('[data-automation-result] [data-result-state="not_checked"]'));assert.equal(f.root.activeElement?.id,'tab-content');
 void f.card._toggleAuto(id,initial==='off');await flush();assert.equal(f.calls.length,1);
 const target=initial==='off'?'on':'off';if(outcome==='echo')f.card.hass={...f.hass,states:{[id]:{state:target}}};outcome==='reject'?f.reject(new Error('PRIVATE token=password host=private.invalid')):f.resolve();await work;
 const state=outcome==='echo'?'success':'unconfirmed',box=f.root.querySelector('[data-automation-result]');assert.ok(box?.querySelector(`[data-result-state="${state}"]`));assert.doesNotMatch(box.textContent,/PRIVATE|password|private.invalid/);assert.match(box.textContent,outcome==='echo'?/confirmed|observed/i:/unconfirmed/i);assert.equal(f.root.activeElement?.id,(outcome==='echo'?(target==='on'?'disable-daily':'enable-daily'):(initial==='off'?'enable-daily':'disable-daily')));
 f.card.hass={...f.card._hass,language:'pl',locale:{language:'pl'}};assert.match(f.root.querySelector('[data-automation-result]').textContent,outcome==='echo'?/Sukces/:/Niepotwierdzony/);assert.equal(f.calls.length,1);
 }finally{f.close()}
});
for(const change of ['user','role','connection','offline','reconnect','detach'])test(`late legacy toggle after ${change} cannot restore its result or unlock early`,async()=>{
 const f=await fixture();try{const work=f.start();if(change==='detach'){f.card.remove();f.w.document.body.append(f.card);f.card._render()}else if(change==='reconnect'){f.hass.connection.dispatchEvent(new f.w.Event('disconnected'));f.hass.connection.dispatchEvent(new f.w.Event('ready'))}else{const h={...f.hass};if(change==='user')h.user={id:'two',is_admin:true};if(change==='role')h.user={id:'one',is_admin:false};if(change==='connection')h.connection={connected:true};if(change==='offline')h.connected=false;f.card.hass=h;}
 void f.card._toggleAuto(id,true);await flush();assert.equal(f.calls.length,1);f.w.document.getElementById('outside').focus();f.resolve();await work;assert.equal(f.root.querySelector('[data-automation-result]'),null);assert.equal(f.w.document.activeElement.id,'outside');assert.equal(f.calls.length,1);
 }finally{f.close()}
});
test('missing, unknown or already requested automation state causes no service call',async()=>{
 const f=await fixture();try{await f.card._toggleAuto(id,false);await f.card._toggleAuto('automation.absent',true);f.hass.states[id].state='unavailable';await f.card._toggleAuto(id,true);assert.equal(f.calls.length,0)}finally{f.close()}
});
