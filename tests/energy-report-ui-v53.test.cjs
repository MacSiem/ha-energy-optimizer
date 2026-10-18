'use strict';
// Run sync-tariff.cjs --write before this suite. Real consumer source / custom element only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const report=(request,id='fixture/one')=>({snapshot_id:id,html:'<!doctype html><html><body><table><tr><td>0 kWh</td><td>Unknown</td><td>'+id+'</td></tr></table></body></html>',text:'Energy report\n'+id+'\n0 kWh\nUnknown\n123456789.123456789 EUR\n',csv:'snapshot_id,value\n'+id+',0\n',context:{access_purpose:'report_read',period_anchor:request.anchor||'2026-10-18'},period:{kind:request.period},display:{language:request.language,date_language:request.date_language,timezone:request.timezone,hour_cycle:request.hour_cycle}});
function fixture({admin=false,ackError=null,manualAck=false,capError=null,reportError=null}={}) {
 const errors=[],requests=[],acks=[],urls=[],revoked=[],downloads=[];
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});vc.on('error',(...a)=>errors.push(a.join(' ')));
 const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}};
 w.HTMLCanvasElement.prototype.getContext=()=>({});
 w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:900,height:44}]:[];};
 w.fetch=()=>{throw Error('network forbidden');};
 w.URL.createObjectURL=blob=>{const url='blob:fixture-'+urls.length;urls.push({url,blob});return url;};w.URL.revokeObjectURL=url=>revoked.push(url);
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({name:this.download,url:this.href});};
 w.eval(['src/optimizer.js','src/energy-insights.js','src/energy-email.js'].map(read).join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 const card=w.document.createElement('ha-energy-email');
 let caps={energy_reports:{visible:true,read:true,execute:false},energy_analysis:{visible:false,read:false}},reply=request=>report(request),unsubs=0,raw=0,maxRaw=0;
 const connection=new w.EventTarget();connection.connected=true;
 connection.subscribeMessage=(callback,message)=>{
  assert.equal(message.type,'ha_tools_email/subscribe_analysis_updates');
  const pending=defer(),row={callback,pending,done:false};acks.push(row);
  if(ackError)pending.reject(ackError);else if(!manualAck)pending.resolve(()=>{assert.equal(row.done,false);row.done=true;unsubs++;});
  return pending.promise;
 };
 const callWS=async request=>{
  requests.push({...request});
  if(request.type==='ha_tools_email/get_tariff')return {profile:{schema:0},revision:0};
  raw++;maxRaw=Math.max(raw,maxRaw);
  try {
   if(request.type==='ha_tools_email/feature_capabilities'){if(capError)throw capError;return {status:'ready',revision:1,capabilities:caps};}
   if(request.type==='ha_tools_email/energy_report'){if(reportError)throw reportError;return await reply(request);}
   if(request.type==='ha_tools_email/preview_energy_report'&&admin)return {subject:'Legacy fixture',html:'<html><body>Legacy</body></html>',source:{status:'no_data',name:'energy',complete:false},period:{from:'2026-10-17T00:00:00Z',to:'2026-10-18T00:00:00Z'},body:'Legacy',cadence:'daily'};
   throw Error('unexpected command '+request.type);
  }finally{raw--;}
 };
 let hass={user:{id:'household',is_active:true,is_admin:admin},connection,connected:true,config:{time_zone:'Europe/Warsaw',currency:'EUR'},locale:{language:'en',time_zone:'local',time_format:'system'},states:{},services:{},callWS,callService(){throw Error('service forbidden');}};
 card.setConfig({default_tab:'preview',show_help:false,show_support:false});
 const api={w,card,requests,acks,errors,urls,revoked,downloads,get hass(){return hass;},get unsubs(){return unsubs;},get maxRaw(){return maxRaw;},get caps(){return caps;},set caps(v){caps=v;},set reply(v){reply=v;},
  async mount(){w.document.body.append(card);card.hass=hass;await tick();},update(next){hass=next;card.hass=hass;},
  change(name,value){const e=api.node(name);e.value=value;e.dispatchEvent(new w.Event('change',{bubbles:true}));},
  node(name){const e=card.shadowRoot.querySelector('[data-energy-report="'+name+'"]');assert.ok(e,'actual '+name+' DOM node');return e;},
  async load(){api.node('read').click();await tick();},
  ack(i=0){const row=acks[i];row.pending.resolve(()=>{assert.equal(row.done,false);row.done=true;unsubs++;});},
  signal(){acks.filter(x=>!x.done).at(-1)?.callback({});},
  close(){card.remove();w.close();},
  clean(){assert.deepEqual(errors,[]);assert.deepEqual(requests.filter(x=>!/\/(get_tariff|feature_capabilities|energy_report|preview_energy_report)$/.test(x.type)),[]);}
 };return api;
}
test('household uses actual Preview without SMTP or analysis access; zero/unknown/full numbers and explicit downloads share one response',async()=>{
 const f=fixture();try{await f.mount();assert.equal(f.requests.filter(x=>x.type.endsWith('/energy_report')).length,0);assert.equal(f.node('read').disabled,false);
  assert.equal(f.card.shadowRoot.querySelector('[data-tab="send"]'),null);assert.equal(f.card.shadowRoot.querySelector('#mail-preview'),null);
  await f.load();const text=f.node('text');assert.match(text.textContent,/0 kWh\nUnknown/);assert.match(text.textContent,/123456789\.123456789/);
  const frame=f.node('html');assert.equal(frame.getAttribute('sandbox'),'');assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');assert.match(frame.srcdoc,/default-src 'none'/);assert.match(frame.srcdoc,/0 kWh/);
  assert.equal(f.urls.length,0);assert.equal(f.downloads.length,0);
  for(const kind of ['csv','text','html']){f.node('download-'+kind).click();await tick();}
  assert.equal(f.urls.length,3);assert.equal(f.downloads.length,3);assert.deepEqual(f.revoked,f.urls.map(x=>x.url));
  for(const {blob} of f.urls){const value=await new Promise((resolve,reject)=>{const reader=new f.w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(blob);});assert.match(value,/fixture\/one/);}
  assert.ok(f.downloads.every(x=>/^energy-report-fixture_one\.(csv|txt|html)$/.test(x.name)));
  assert.equal(f.requests.filter(x=>x.type.endsWith('/energy_report')).length,1);f.clean();
 }finally{f.close();}
});
test('ACK precedes capabilities and data; selected local calendar, comparison, browser timezone and clock reach backend',async()=>{
 const f=fixture({manualAck:true});try{await f.mount();assert.equal(f.acks.length,1);assert.equal(f.requests.filter(x=>!x.type.endsWith('/get_tariff')).length,0);
  f.ack();await tick();f.change('period','year');f.change('anchor','2024-02-29');f.change('comparison','year_ago');await f.load();
  const q=f.requests.find(x=>x.type.endsWith('/energy_report'));assert.equal(q.period,'year');assert.equal(q.anchor,'2024-02-29');assert.equal(q.comparison,'year_ago');assert.equal(q.language,'en');
  assert.equal(q.timezone,f.w.Intl.DateTimeFormat().resolvedOptions().timeZone);
  const clock=f.w.Intl.DateTimeFormat(f.w.navigator.language,{hour:'numeric'}).resolvedOptions().hourCycle;assert.equal(q.hour_cycle,['h11','h12'].includes(clock)?'12':'24');
  assert.equal(f.node('anchor').value,'2024-02-29');f.clean();
 }finally{f.close();}
});
test('raw report occupies lane until settlement and only latest submitted intent follows',async()=>{
 const f=fixture(),pending=defer();try{await f.mount();f.reply=q=>pending.promise;f.node('read').click();await tick();
  f.change('period','week');f.node('read').click();f.change('period','month');f.node('read').click();await tick();assert.equal(f.requests.filter(x=>x.type.endsWith('/energy_report')).length,1);
  f.reply=q=>report(q,'latest');pending.resolve(report({period:'day',language:'en',timezone:'UTC',hour_cycle:'24'},'stale'));await tick();
  const reads=f.requests.filter(x=>x.type.endsWith('/energy_report'));assert.equal(reads.length,2);assert.equal(reads[1].period,'month');assert.equal(f.maxRaw,1);assert.equal(f.card._reportHostV53.state().report.snapshot_id,'latest');f.clean();
 }finally{f.close();}
});
for(const change of ['user','active','connection','timezone','language','clock','availability'])test('purges pending and rendered report on '+change+'; late result cannot revive export',async()=>{
 const f=fixture(),pending=defer();try{await f.mount();await f.load();assert.ok(f.node('text'));f.reply=()=>pending.promise;f.node('read').click();await tick();
  const h=f.hass,next={...h,user:{...h.user},locale:{...h.locale},config:{...h.config}};
  if(change==='user')next.user.id='other';if(change==='active')next.user.is_active=false;if(change==='connection')next.connection=Object.assign(new f.w.EventTarget(),{connected:true,subscribeMessage:h.connection.subscribeMessage});
  if(change==='timezone')next.config.time_zone='America/New_York';if(change==='language')next.locale.language='pl';if(change==='clock')next.locale.time_format='12';if(change==='availability')next.connected=false;
  f.update(next);pending.resolve(report({period:'day',language:'en',timezone:'UTC',hour_cycle:'24'},'private-old'));await tick();
  assert.equal(f.card.shadowRoot.querySelector('[data-energy-report="text"]'),null);assert.equal(f.card.shadowRoot.querySelector('[data-energy-report="html"]'),null);assert.equal(f.card.shadowRoot.querySelector('[data-energy-report^="download-"]'),null);assert.equal(f.card._reportHostV53.state().report,null);f.clean();
 }finally{f.close();}
});
test('revocation purges immediately, refreshes only own capabilities and never reads report automatically',async()=>{
 const f=fixture();try{await f.mount();await f.load();const count=f.requests.length;f.caps={energy_reports:{visible:true,read:false,execute:false}};f.signal();
  assert.equal(f.card.shadowRoot.querySelector('[data-energy-report="text"]'),null);await tick();assert.equal(f.node('read').disabled,true);assert.match(f.node('status').textContent,/access/i);
  assert.deepEqual(f.requests.slice(count).map(x=>x.type),['ha_tools_email/feature_capabilities']);f.clean();
 }finally{f.close();}
});
test('late ACK unsubscribes exactly once after tab departure, no capabilities or reports',async()=>{
 const f=fixture({manualAck:true,admin:true});try{await f.mount();f.card.shadowRoot.querySelector('[data-tab="config"]').click();await tick();f.ack();await tick();assert.equal(f.unsubs,1);assert.equal(f.requests.filter(x=>/\/(feature_capabilities|energy_report)$/.test(x.type)).length,0);f.close();assert.equal(f.unsubs,1);
 }finally{f.w.close();}
});
for(const stage of ['ack','cap','report'])for(const error of [{code:'unauthorized'},new Error('unknown_command'),{code:'unknown_command'}])test('strict legacy '+stage+' '+String(error.code||error.message),async()=>{
 const opts={admin:true};opts[stage==='ack'?'ackError':stage==='cap'?'capError':'reportError']=error;
 const f=fixture(opts);try{await f.mount();if(stage==='report')await f.load();
  assert.equal(!!f.card.shadowRoot.querySelector('#mail-preview'),error.code==='unknown_command');assert.equal(f.requests.filter(x=>x.type.endsWith('/preview_energy_report')).length,0);f.clean();
 }finally{f.close();}
});
test('household unknown command never offers legacy mail or configuration',async()=>{
 const f=fixture({ackError:{code:'unknown_command'}});try{await f.mount();assert.equal(f.card.shadowRoot.querySelector('#mail-preview'),null);assert.equal(f.card.shadowRoot.querySelector('[data-tab="send"]'),null);assert.equal(f.requests.filter(x=>!x.type.endsWith('/get_tariff')).length,0);f.clean();}finally{f.close();}
});

test('visibility and read are independent, and denied capability projection reveals no report',async()=>{
 const f=fixture();try{f.caps={energy_reports:{visible:false,read:true,execute:true},energy_analysis:{read:true}};await f.mount();
 assert.equal(f.card.shadowRoot.querySelector('[data-tab="preview"]'),null);assert.equal(f.node('read').disabled,true);assert.equal(f.card.shadowRoot.querySelector('[data-energy-report="text"]'),null);
 assert.equal(f.requests.filter(x=>x.type.endsWith('/energy_report')).length,0);f.clean();}finally{f.close();}
});
test('disconnect event purges report before a new hass object arrives and stale subscription is disposed',async()=>{
 const f=fixture();try{await f.mount();await f.load();f.hass.connection.dispatchEvent(new f.w.Event('disconnected'));
 assert.equal(f.card.shadowRoot.querySelector('[data-energy-report="text"]'),null);assert.equal(f.card._reportHostV53.state().report,null);assert.equal(f.unsubs,1);
 const count=f.requests.length;await tick();assert.equal(f.requests.length,count);f.clean();}finally{f.close();}
});


test('native auth/current_user shape omits is_active; server ACK and capabilities still authorize report reads',async()=>{
 const f=fixture();try{delete f.hass.user.is_active;await f.mount();
  assert.equal(f.acks.length,1);assert.equal(f.node('read').disabled,false);
  await f.load();assert.ok(f.node('text'));f.clean();
 }finally{f.close();}
});


test('ordinary hass state updates preserve the mounted report, disclosures and current input focus without IO',async()=>{
 const f=fixture();try{await f.mount();await f.load();const frame=f.node('html'),details=f.node('text').parentElement;
  details.open=true;const input=f.node('anchor');input.focus();const count=f.requests.length;
  f.update({...f.hass,states:{'sensor.unrelated':{state:'1',attributes:{}}}});await tick();
  assert.equal(f.node('html'),frame,'unrelated updates must not reload the report iframe');
  assert.equal(f.node('text').parentElement,details);assert.equal(details.open,true);
  assert.equal(f.card.shadowRoot.activeElement,input);assert.equal(f.requests.length,count);f.clean();
 }finally{f.close();}
});
