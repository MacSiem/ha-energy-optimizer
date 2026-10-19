'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const {systemIntl}=require('./helpers/system-intl-fixture.cjs');
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

test('report date language follows system date preference independently of UI; response must echo it',async()=>{
 for(const [uiLanguage,systemLanguage,dateLanguage] of [['en','pl-PL','pl'],['pl','en-US','en']]) {
  const dom=new JSDOM('<body><div id="card"></div></body>',{runScripts:'outside-only'}),w=dom.window;
  w.eval(['ha-tools-format.js','ha-tools-energy-report.js'].map(file=>fs.readFileSync(path.join(__dirname,'..','shared',file),'utf8')).join('\n')+'\nwindow.__reportFactory=createEnergyReportV53;window.__formatFactory=createFormatUi;');
  Object.defineProperty(w.navigator,'language',{configurable:true,value:systemLanguage});
  Object.defineProperty(w,'Intl',{configurable:true,value:systemIntl(systemLanguage,w.Intl)});
  const card=w.document.getElementById('card');card.attachShadow({mode:'open'});const root=w.document.createElement('section');card.shadowRoot.append(root);card._activeTab='preview';
  const requests=[];let echo='correct';
  card._hass={user:{id:'one'},connection:{connected:true,async subscribeMessage(){return ()=>{};}},config:{time_zone:'Europe/Warsaw'},locale:{language:uiLanguage,date_format:'system',time_format:'24',time_zone:'local'},callWS:async q=>{
   requests.push(q);if(q.type.endsWith('/feature_capabilities'))return {status:'ready',capabilities:{energy_reports:{visible:true,read:true,execute:false}}};
   const display={language:q.language,timezone:q.timezone,hour_cycle:q.hour_cycle};
   if(echo!=='missing')display.date_language=echo==='correct'?q.date_language:(q.date_language==='pl'?'en':'pl');
   return {snapshot_id:'date-proof',html:'<table><tr><td>Report</td></tr></table>',text:'Report',csv:'value\n0',context:{access_purpose:'report_read'},period:{kind:q.period},display};
  }};
  const host=w.__reportFactory({card,format:w.__formatFactory});
  try {
   host.mount(root);await tick();root.querySelector('[data-energy-report="read"]').click();await tick();
   const request=requests.find(q=>q.type.endsWith('/energy_report'));
   assert.equal(request.language,uiLanguage);assert.equal(request.date_language,dateLanguage);
   assert.equal(w.__formatFactory.forHass(card._hass).dateLanguage,systemLanguage);
   assert.equal(host.state().report.snapshot_id,'date-proof');
   for(echo of ['missing','wrong']) {
    root.querySelector('[data-energy-report="read"]').click();await tick();
    assert.equal(host.state().report,null,'wrong or missing date-language echo is rejected');
    assert.equal(root.querySelector('[data-energy-report="html"]'),null);
   }
  }finally{host.stop();w.close();}
 }
});
