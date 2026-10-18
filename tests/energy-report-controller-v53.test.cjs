'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const tick=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const defer=()=>{let resolve,reject;return {promise:new Promise((a,b)=>{resolve=a;reject=b;}),get resolve(){return resolve;},get reject(){return reject;}};};
test('shared report helper keeps occupied capabilities wire over identity change, coalesces fresh intent, and disposes subscriptions',async()=>{
 const dom=new JSDOM('<body><div id="card"></div></body>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(['ha-tools-format.js','ha-tools-energy-report.js'].map(file=>fs.readFileSync(path.join(__dirname,'..','shared',file),'utf8')).join('\n')+'\nwindow.__reportFactory=createEnergyReportV53;window.__formatFactory=createFormatUi;');
 const card=w.document.getElementById('card');card.attachShadow({mode:'open'});const root=w.document.createElement('section');card.shadowRoot.append(root);card._activeTab='preview';
 const pending=defer(),requests=[],subs=[];let raw=0,max=0;
 const connection={connected:true,async subscribeMessage(fn){const row={fn,count:0};subs.push(row);return ()=>{row.count++;};}};
 const caps={status:'ready',capabilities:{energy_reports:{visible:true,read:true,execute:false}}};
 const callWS=async q=>{raw++;max=Math.max(max,raw);requests.push({q,user:card._hass.user.id});try{return requests.length===1?await pending.promise:caps;}finally{raw--;}};
 card._hass={user:{id:'old',is_active:true},connection,config:{time_zone:'UTC'},locale:{language:'en',time_format:'24'},callWS};
 const host=w.__reportFactory({card,format:w.__formatFactory});
 try{host.mount(root);await tick();assert.equal(requests.length,1);
  card._hass={...card._hass,user:{id:'new',is_active:true}};host.observe();host.mount(root);host.mount(root);await tick();assert.equal(requests.length,1);
  pending.resolve(caps);await tick();assert.equal(requests.length,2);assert.deepEqual(requests.map(x=>x.user),['old','new']);assert.equal(max,1);
  assert.equal(root.querySelector('[data-energy-report="read"]').disabled,false);assert.equal(root.querySelector('[data-energy-report="text"]'),null);
  host.stop();assert.deepEqual(subs.map(x=>x.count),[1,1]);
 }finally{host.stop();w.close();}
});
test('a failed ACK retry attempts a new ACK before any capabilities IO',async()=>{
 const dom=new JSDOM('<body><div id="card"></div></body>',{runScripts:'outside-only'}),w=dom.window;
 w.eval(['ha-tools-format.js','ha-tools-energy-report.js'].map(file=>fs.readFileSync(path.join(__dirname,'..','shared',file),'utf8')).join('\n')+'\nwindow.__reportFactory=createEnergyReportV53;window.__formatFactory=createFormatUi;');
 const card=w.document.getElementById('card');card.attachShadow({mode:'open'});const root=w.document.createElement('section');card.shadowRoot.append(root);card._activeTab='preview';
 const second=defer();let acks=0,reads=0;
 card._hass={user:{id:'one',is_active:true},connection:{connected:true,subscribeMessage(){acks++;return acks===1?Promise.reject({code:'unauthorized'}):second.promise;}},config:{time_zone:'UTC'},callWS:async()=>{reads++;return {status:'ready',capabilities:{energy_reports:{visible:true,read:true,execute:false}}};}};
 const host=w.__reportFactory({card,format:w.__formatFactory});
 try{host.mount(root);await tick();root.querySelector('[data-energy-report="retry"]').click();await tick();assert.equal(acks,2);assert.equal(reads,0);second.resolve(()=>{});await tick();assert.equal(reads,1);}finally{host.stop();w.close();}
});
