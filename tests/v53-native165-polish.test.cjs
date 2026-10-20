'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const {JSDOM}=require('jsdom');
const {createEnergyBuild1ViewV53}=require('../shared/ha-tools-energy-build1-view.js');
const {createEnergyReportsActionsV53}=require('../shared/ha-tools-energy-reports-actions.js');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const golden=JSON.parse(readFileSync(path.join(__dirname,'fixtures/build1/golden-energy-2026-10-17.json'),'utf8'));
const fixture=()=>structuredClone(golden.model||golden);
const view=language=>createEnergyBuild1ViewV53({format:createFormatUi(language,'UTC'),language});
const channels=['persistent_notification','email','notify.persistent_notification','notify.send_message'];
const channelNames=language=>language==='pl'?['Powiadomienie HA','E-mail','Powiadomienie HA','Wiadomość HA']:['HA notification','Email','HA notification','HA message'];
const tick=async()=>{for(let i=0;i<120;i++)await Promise.resolve();};
const source=readFileSync(path.join(__dirname,'../shared/ha-tools-email-schedules.js'),'utf8').replace(/^export /gm,'');
// Same browser primitive harness as v53-native-recurring-schedules; real store/guards remain.
const createSchedules=new Function('globalThis',source+';return createHaToolsEmailSchedules;')({crypto:webcrypto,navigator:{onLine:true}});
function setup(language,custom=false){
 const dom=new JSDOM('<div data-build1-reports-host></div>',{url:'http://localhost/'}),calls=[];
 const caps={energy_reports:{visible:true,read:true,execute:true}};
 const targets=channels.map(id=>({id,name:custom&&id==='persistent_notification'?'My <HA> & room':id,default:id==='persistent_notification'}));
 targets.push({id:'notify.mobile_app_owner',name:'Owner <phone> & watch',default:false});
 const connection=new dom.window.EventTarget();connection.connected=true;
 const card={isConnected:true,_hass:{user:{id:'qa',is_active:true,is_admin:true},connected:true,connection,locale:{language},config:{time_zone:'UTC'},callWS:async q=>{
  calls.push(q);
  if(q.type.endsWith('feature_capabilities'))return {status:'ready',revision:1,capabilities:caps};
  if(q.type.endsWith('get_report_status'))return {schema:1,purpose:'energy_report',schedule_state:'disabled'};
  if(q.type.endsWith('list_delivery_targets'))return structuredClone(targets);
  if(q.type.endsWith('get_attempt_history'))return {schema:1,attempts:[]};
  if(q.type==='manifest/get')return {domain:'ha_tools_email',version:'2.8.0'};
  if(q.type.endsWith('list_schedules'))return {schedules:[]};
  throw Error('Unexpected request: '+q.type);
 }} };
 const guard=createTariffGuardV3({getHass:()=>card._hass,browser:null});
 const controller=createEnergyReportsActionsV53({card,guard,getCapabilities:()=>caps,isActive:()=>true,createSchedules});
 const root=dom.window.document.querySelector('div');controller.mount(root);
 const ready=async()=>{await tick();assert.equal(guard.occupied(),false,'startup wire settled');assert.equal(controller.state().status,'ready','Reports startup');assert.equal(controller.state().canManageSchedules,true,'schedule store completed manifest/list handshake');assert.ok(calls.some(q=>q.type==='manifest/get'));assert.ok(calls.some(q=>q.type==='ha_tools_email/list_schedules'));};
 return {dom,calls,root,controller,ready,close:()=>{controller.stop();guard.dispose();dom.window.close();}};
}
for(const language of ['en','pl']){
 test(`only identified unassigned buckets translate, names and children stay literal (${language})`,()=>{
  const m=fixture(),v=view(language);
  m.rooms=[{area_id:null,name:'Bez pokoju',kwh:1},{area_id:'real',name:'Bez pokoju',kwh:2},{area_id:null,name:'My room <label>',kwh:3,children:[{id:'sensor.child',area_id:null,name:'Bez pokoju',kwh:.1}]}];
  m.floors=[{floor_id:null,name:'Bez piętra',kwh:1},{floor_id:'real',name:'Bez piętra',kwh:2}];
  m.ranking=[{id:'sensor.named',area_id:null,name:'Bez pokoju',kwh:1}];
  const before=JSON.stringify(m),rooms=v.markup(m,{section:'breakdown',group:'rooms'}),floors=v.markup(m,{section:'breakdown',group:'floors'});
  assert.ok(rooms.includes(`<span>${language==='pl'?'Bez pokoju':'No room'}`));
  assert.ok(rooms.includes('<span>Bez pokoju'));
  assert.ok(rooms.includes('My room &lt;label&gt;'));
  assert.ok(rooms.includes('↳ Bez pokoju'));
  assert.ok(floors.includes(`<span>${language==='pl'?'Bez piętra':'No floor'}`));
  assert.ok(floors.includes('<span>Bez piętra'));
  assert.ok(v.markup(m,{section:'breakdown'}).includes('<span>Bez pokoju'));
  assert.equal(JSON.stringify(m),before);
 });
 test(`Reports schedule and delivery rows show known channel labels without touching IDs (${language})`,()=>{
  const options={section:'reports',reportAccess:true,schedules:[{id:'plan',channel:channels.join(', '),time:'09:00',enabled:true}],deliveries:channels.map((channel,i)=>({id:String(i),channel,at:'2026-10-20T10:00:00Z',status:'accepted_by_notify'}))};
  options.deliveries.push({id:'custom',channel:'Owner <phone> & watch',at:'2026-10-20T10:00:00Z',status:'accepted_by_notify'});
  const before=JSON.stringify(options),html=view(language).markup(null,options);
  for(const name of channelNames(language))assert.ok(html.includes(name));
  for(const id of ['persistent_notification','notify.send_message'])assert.ok(!html.includes(id));
  assert.ok(html.includes('Owner &lt;phone&gt; &amp; watch'));
  assert.equal(JSON.stringify(options),before);
 });
 test(`send and recurring selectors/reviews use labels while values stay exact (${language})`,async()=>{
  const f=setup(language);try{
   await f.ready();assert.equal(f.controller.openSend(),true);
   const select=f.root.querySelector('[data-report-field="channel"]');
   for(const [index,id] of channels.entries())assert.equal([...select.options].find(o=>o.value===id).textContent,channelNames(language)[index]);
   select.value='notify.send_message';select.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
   assert.equal(f.controller.review(),true);
   assert.ok(f.root.textContent.includes(channelNames(language)[3]));
   assert.ok(!f.root.textContent.includes('notify.send_message'));
   f.root.querySelector('[data-report-action="cancel"]').click();
   assert.equal(f.controller.scheduleAction('add'),true);
   const picker=f.root.querySelector('[data-schedule-channels]');
   for(const option of picker.options)option.selected=channels.includes(option.value);
   picker.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
   const recipients=f.root.querySelector('[data-schedule-recipients]');recipients.value='qa@example.test';recipients.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
   assert.equal(f.controller.reviewSchedule(),true);
   for(const name of channelNames(language))assert.ok(f.root.textContent.includes(name));
   assert.ok(!f.root.textContent.includes('persistent_notification'));
   assert.ok(!f.root.textContent.includes('notify.send_message'));
   assert.ok(!f.calls.some(q=>/send_now|set_schedule|get_config/.test(q.type)));
  }finally{f.close();}
 });
 test(`server custom target names are preserved and escaped in options and review (${language})`,async()=>{
  const f=setup(language,true);try{
   await f.ready();assert.equal(f.controller.openSend(),true);
   const select=f.root.querySelector('[data-report-field="channel"]');
   assert.equal([...select.options].find(o=>o.value==='persistent_notification').textContent,'My <HA> & room');
   assert.equal([...select.options].find(o=>o.value==='notify.mobile_app_owner').textContent,'Owner <phone> & watch');
   assert.ok(!f.root.querySelector('ha,phone'));
   assert.equal(f.controller.review(),true);
   assert.ok(f.root.textContent.includes('My <HA> & room'));
   assert.ok(!f.root.querySelector('ha'));
   assert.ok(!f.calls.some(q=>/send_now|set_schedule/.test(q.type)));
  }finally{f.close();}
 });
}
