'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createTariffSettingsV3}=require('../shared/ha-tools-tariff-settings.js');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createEnergyTariffV3}=require('../shared/ha-tools-energy-tariff.js');
const clone=v=>JSON.parse(JSON.stringify(v));
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
const profile=(name='Saved',from='2026-01-01')=>({schema:2,name,currency:'PLN',timezone:'Europe/Warsaw',clock:{mode:'civil'},priceBasis:'gross',validFrom:from,validTo:null,
 rateSemantics:'components',validityClock:'civil',origin:{kind:'user'},defaultZone:'day',zones:[{id:'day',label:'Day',energyRate:.62,variableRate:.32}],rules:[],exceptions:[],
 fixed:[{id:'network',label:'Sieć',monthly:12.4,invoice:{code:'synthetic/A'}}]});
const template=id=>({id,origin:{kind:'template',reference:id},profile:{schema:2,name:id,currency:'PLN',timezone:'Europe/Warsaw',clock:{mode:'civil'},priceBasis:'gross',validFrom:null,validTo:null,
 origin:{kind:'template',reference:id},fixed:[],defaultZone:id==='G11'?'all':'exp',
 zones:id==='G11'?[{id:'all',label:'All day',energyRate:null,variableRate:null}]:[{id:'cheap',label:'Cheap',energyRate:null,variableRate:null},{id:'exp',label:'Expensive',energyRate:null,variableRate:null}],
 rules:id==='G11'?[]:[{zone:'cheap',priority:10,weekdays:[0,1,2,3,4,5,6],intervals:[{from:'22:00',to:'06:00'},{from:'13:00',to:'15:00'}]},...(id==='G12w'?[{zone:'cheap',priority:20,weekdays:[0,6],intervals:[{from:'00:00',to:'24:00'}]}]:[])],
 exceptions:[],...(id==='G12w'?{requiresHolidayDates:true}:{})}});
function fixture({execute=true,admin=false,migration=false}={}){
 const dom=new JSDOM('<body><button id="outside">Outside</button><div id="root"></div></body>',{url:'http://localhost/'}),root=dom.window.document.querySelector('#root');
 const calls=[],saved=[];let revision=4,selected='v2',hook=null,readbackMismatch=false;
 let grant={visible:true,read:true,execute};
 const versions=[{version_id:'v1',profile:{...profile('Old','2025-01-01'),validTo:'2026-01-01'}},{version_id:'v2',profile:profile()}];
 const state={profile:null,revision:null,status:'not_checked',busy:false};
 const envelope=q=>({status:'ready',revision,updated_at:'2026-10-20T12:00:00Z',tariff_id:'house',version_id:q.version_id||selected,
  profile:clone(versions.find(v=>v.version_id===(q.version_id||selected)).profile),tariff_profiles:clone(versions),tariffs:[{id:'house',name:'Saved',origin:{kind:'user'}}]});
 const hass={user:{id:'selected-user',is_active:true,is_admin:admin},connected:true,connection:{connected:true},config:{currency:'PLN',time_zone:'Europe/Warsaw'},
 callWS:async q=>{calls.push(clone(q));if(hook){const x=hook(q);if(x!==undefined)return await x;}
  if(q.type==='ha_tools_email/feature_capabilities')return {status:'ready',revision:7,capabilities:{energy_tariff:clone(grant)}};
  if(q.type==='ha_tools_email/list_tariff_templates')return {templates:['G11','G12','G12w'].map(template),currency:'PLN',timezone:'Europe/Warsaw'};
  if(q.type==='ha_tools_email/get_tariff_profile'){
   if(migration)return {status:'migration_required',profile:null,tariff_profiles:[],tariffs:[],revision,updated_at:null,migration_required:['explicit_legacy_semantics_required']};
   const e=envelope(q);if(readbackMismatch)e.profile.name='Different stored value';return e;
  }
  if(q.type==='ha_tools_email/set_tariff_profile'){
   assert.equal(q.expected_revision,revision);revision++;const id=q.profile.validFrom==='2026-01-01'?'v2':'v3';
   const old=versions.find(v=>v.version_id===id);if(old)old.profile=clone(q.profile);else versions.push({version_id:id,profile:clone(q.profile)});
   selected=id;return envelope({version_id:id});
  }
  throw Error('Unexpected protocol '+q.type);
 }};
 const guard=createTariffGuardV3({getHass:()=>hass,getContext:()=>({}),browser:dom.window});
 const editor=createTariffSettingsV3({root,getHass:()=>hass,language:'en',state,validate:createEnergyTariffV3,guard,wireProfile:true,onSaved:v=>saved.push(v)});
 const choose=(attr,value)=>{const el=root.querySelector('['+attr+']');assert.ok(el,attr);el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 const input=(path,value)=>{const el=root.querySelector('[data-path="'+path+'"]');assert.ok(el,path);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 const click=action=>{const el=root.querySelector('[data-action="'+action+'"]');assert.ok(el,action);el.click();};
 editor.render();
 return {dom,root,hass,guard,editor,state,calls,saved,versions,choose,input,click,
  set grant(v){grant=v;},set hook(v){hook=v;},set mismatch(v){readbackMismatch=v;},set revision(v){revision=v;},
  get writes(){return calls.filter(q=>q.type==='ha_tools_email/set_tariff_profile');},
  close(){editor.dispose();guard.dispose();dom.window.close();}};
}
test('explicit template picker displays actual server choices and null rates without writes or legacy commands',async()=>{
 const f=fixture();try{await f.editor.openMode('templates');assert.deepEqual([...f.root.querySelector('[data-wire-template]').options].map(o=>o.value),['','G11','G12','G12w']);
  const fees=clone(f.state.draft.fixed);f.choose('data-wire-template','G12');
  assert.equal(f.state.draft.name,'G12');assert.deepEqual(f.state.draft.rules,template('G12').profile.rules);assert.deepEqual(f.state.draft.fixed,fees);
  assert.ok(f.state.draft.zones.every(z=>z.energyRate===null&&z.variableRate===null));assert.equal(f.state.draft.validFrom,null);assert.equal(f.writes.length,0);
  assert.equal(f.root.ownerDocument.activeElement,f.root.querySelector('[data-path="validFrom"]'));
  f.click('save');await tick();assert.equal(f.writes.length,0);assert.match(f.root.textContent,/explicit_values_required|template_prices_required/);
  assert.equal(f.calls.some(q=>/\/(get_tariff|set_tariff|set_tariff_book)$/.test(q.type)),false);
 }finally{f.close();}
});
test('filled server template saves only explicit user rates/date, preserves fee metadata, and confirms exact stored readback',async()=>{
 const f=fixture();try{await f.editor.openMode('templates');const fees=clone(f.state.draft.fixed);f.choose('data-wire-template','G11');
  f.input('validFrom','2026-11-01');f.input('zones.0.energyRate','0.5');f.input('zones.0.variableRate','0.2');f.click('save');f.click('save');await tick();
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].expected_revision,4);assert.deepEqual(f.writes[0].profile.fixed,fees);assert.deepEqual(f.writes[0].profile.origin,{kind:'user'});
  assert.deepEqual(f.writes[0].profile.templateSource,{kind:'template',reference:'G11'});assert.equal(f.state.status,'success');assert.equal(f.state.revision,5);assert.equal(f.saved.length,1);
  assert.equal(f.calls.filter(q=>q.type==='ha_tools_email/get_tariff_profile').at(-1).version_id,'v3');
 }finally{f.close();}
});
test('G12w requires explicit holiday review and every template price; no holiday dates are invented',async()=>{
 const f=fixture();try{await f.editor.openMode('templates');f.choose('data-wire-template','G12w');f.input('validFrom','2026-11-01');
  for(let i=0;i<2;i++){f.input('zones.'+i+'.energyRate','0.5');f.input('zones.'+i+'.variableRate','0.2');}
  f.click('save');await tick();assert.equal(f.writes.length,0);const check=f.root.querySelector('[data-wire-holidays]');check.checked=true;check.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));
  f.click('save');await tick();assert.equal(f.writes.length,1);assert.deepEqual(f.writes[0].profile.exceptions,[]);assert.equal(f.writes[0].profile.requiresHolidayDates,false);
 }finally{f.close();}
});
test('read-only household history contains only actual saved versions and allows fresh selected-version reads',async()=>{
 const f=fixture({execute:false});try{await f.editor.openMode('history');assert.deepEqual([...f.root.querySelector('[data-wire-history]').options].map(o=>o.value),['','v1','v2']);
  assert.equal(f.root.querySelector('[data-path="name"]').disabled,true);assert.equal(f.root.querySelector('[data-wire-history]').disabled,false);
  f.choose('data-wire-history','v1');await tick();assert.equal(f.state.draft.name,'Old');assert.equal(f.state.draft.validTo,'2026-01-01');assert.equal(f.writes.length,0);
  assert.equal(f.calls.filter(q=>q.type==='ha_tools_email/get_tariff_profile').at(-1).version_id,'v1');
 }finally{f.close();}
});
test('switching versions and templates retains separate dirty drafts and arbitrary fixed fee rows',async()=>{
 const f=fixture();try{await f.editor.openMode('templates');f.input('name','Unsaved saved-version name');f.input('fixed.0.monthly','17.25');
  f.choose('data-wire-history','v1');await tick();assert.equal(f.state.draft.name,'Old');
  f.choose('data-wire-history','v2');await tick();assert.equal(f.state.draft.name,'Unsaved saved-version name');assert.equal(f.state.draft.fixed[0].monthly,17.25);
  f.choose('data-wire-template','G11');f.input('name','My G11 draft');f.choose('data-wire-template','G12');f.choose('data-wire-template','G11');
  assert.equal(f.state.draft.name,'My G11 draft');assert.equal(f.state.draft.fixed[0].invoice.code,'synthetic/A');assert.equal(f.writes.length,0);
 }finally{f.close();}
});
test('schema1 migration_required stays read-only and does not choose legacy combined semantics',async()=>{
 const f=fixture({migration:true});try{await f.editor.openMode('templates');assert.match(f.root.textContent,/explicit migration/);assert.equal(f.state.wireMigrationRequired,true);
  assert.equal(f.root.querySelector('[data-path="name"]').disabled,true);assert.equal(f.writes.length,0);
  assert.equal(f.calls.some(q=>Object.hasOwn(q,'legacy_combined')),false);assert.equal(f.calls.some(q=>q.type==='ha_tools_email/list_tariff_templates'),false);
 }finally{f.close();}
});
test('fresh execute revocation prevents a final write while preserving readable user draft',async()=>{
 const f=fixture();try{await f.editor.openMode('history');f.input('name','User draft');f.grant={visible:true,read:true,execute:false};f.click('save');await tick();
  assert.equal(f.writes.length,0);assert.equal(f.state.draft.name,'User draft');assert.equal(f.root.querySelector('[data-path="name"]').disabled,true);
 }finally{f.close();}
});
test('fresh read revocation erases visible history and drafts rather than retaining household data',async()=>{
 const f=fixture();try{await f.editor.openMode('history');f.input('name','Private draft');f.grant={visible:false,read:false,execute:false};await f.editor.load();
  assert.equal(f.state.profile,null);assert.equal(f.state.draft.name,'');assert.deepEqual(f.state.wireDrafts,{});assert.equal(f.root.textContent.includes('Private draft'),false);assert.equal(f.writes.length,0);
 }finally{f.close();}
});
test('historical acknowledgment is a separate explicit control; validation failure never triggers an automatic retry',async()=>{
 const f=fixture();try{await f.editor.openMode('history');f.input('name','Historical edit');let attempts=0;
  f.hook=q=>{if(q.type==='ha_tools_email/set_tariff_profile'&&++attempts===1)throw {code:'historical_edit_ack_required'};};
  f.click('save');await tick();assert.equal(f.writes.length,1);assert.equal(f.state.writeUnconfirmed,false);
  const ack=f.root.querySelector('[data-wire-historical]');ack.checked=true;ack.dispatchEvent(new f.dom.window.Event('change',{bubbles:true}));f.click('save');await tick();
  assert.equal(f.writes.length,2);assert.equal(f.writes[0].historical_edit_ack,false);assert.equal(f.writes[1].historical_edit_ack,true);assert.equal(f.state.status,'success');
 }finally{f.close();}
});
test('mismatching confirmed readback fences further writes and retains the submitted draft',async()=>{
 const f=fixture();try{await f.editor.openMode('history');f.input('name','My edit');f.mismatch=true;f.click('save');await tick();
  assert.equal(f.state.writeUnconfirmed,true);assert.equal(f.state.draft.name,'My edit');assert.equal(f.saved.length,0);f.click('save');await tick();assert.equal(f.writes.length,1);
 }finally{f.close();}
});
test('identity change during pending capabilities erases the old draft and suppresses any late write',async()=>{
 const f=fixture();let release;try{await f.editor.openMode('history');f.input('name','Private old-user draft');
  f.hook=q=>q.type==='ha_tools_email/feature_capabilities'?new Promise(resolve=>{release=resolve;}):undefined;
  f.click('save');await tick();f.hass.user={...f.hass.user,id:'other'};f.guard.observe();
  release({status:'ready',revision:7,capabilities:{energy_tariff:{visible:true,read:true,execute:true}}});await tick();
  assert.equal(f.writes.length,0);assert.equal(f.state.profile,null);assert.equal(f.state.draft.name,'');assert.equal(f.root.textContent.includes('Private old-user draft'),false);
 }finally{f.close();}
});
test('ordinary render preserves input focus and selection; caller focus outside the editor is respected',async()=>{
 const f=fixture();try{await f.editor.openMode('history');const input=f.root.querySelector('[data-path="name"]');input.focus();input.setSelectionRange(1,3,'backward');f.editor.render();
  const restored=f.root.querySelector('[data-path="name"]');assert.equal(f.root.ownerDocument.activeElement,restored);assert.equal(restored.selectionStart,1);assert.equal(restored.selectionEnd,3);
  f.root.ownerDocument.querySelector('#outside').focus();f.editor.render();assert.equal(f.root.ownerDocument.activeElement.id,'outside');
 }finally{f.close();}
});

test('real tariff host opens the wire template panel without replacing a legacy user draft',async()=>{
 const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');
 const {createUiV3}=require('../shared/ha-tools-ui.js');
 const dom=new JSDOM('<body></body>',{url:'http://localhost/'}),card=dom.window.document.createElement('div');card.attachShadow({mode:'open'});dom.window.document.body.append(card);
 const calls=[],p=profile();card._config={};card._hass={user:{id:'household-delegate',is_active:true,is_admin:false},connected:true,connection:{connected:true},config:{currency:'PLN',time_zone:'Europe/Warsaw'},
 callWS:async q=>{calls.push(clone(q));
  if(q.type==='ha_tools_email/feature_capabilities')return {status:'ready',revision:3,capabilities:{energy_tariff:{visible:true,read:true,execute:true}}};
  if(q.type==='ha_tools_email/get_tariff_profile')return {status:'ready',profile:clone(p),revision:4,updated_at:null,tariff_id:'house',version_id:'v1',tariff_profiles:[{version_id:'v1',profile:clone(p)}],tariffs:[{id:'house',name:p.name,origin:p.origin}]};
  if(q.type==='ha_tools_email/list_tariff_templates')return {templates:['G11','G12','G12w'].map(template)};
  throw Error('unexpected host command '+q.type);
 }};
 card._tariffEditorState={profile:{schema:1},draft:{schema:1,name:'Uncommitted old editor draft'},revision:4,status:'not_checked'};
 const before=clone(card._tariffEditorState);
 const host=createTariffHostV3({card,kind:'smart',createModel:createEnergyTariffV3,legacyProfile:()=>null,createSettings:createTariffSettingsV3,createUi:createUiV3});
 try{card.shadowRoot.innerHTML=host.markup();await host.openProfile('templates');
  assert.deepEqual(card._tariffEditorState,before);assert.ok(card.shadowRoot.querySelector('[data-wire-template]'));assert.equal(card.shadowRoot.querySelector('[data-tariff-mount]').hidden,true);
  const input=card.shadowRoot.querySelector('[data-tariff-wire-mount] [data-path="name"]');input.focus();input.value='Wire unsaved';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));input.setSelectionRange(2,5);host.bind();
  const restored=card.shadowRoot.querySelector('[data-tariff-wire-mount] [data-path="name"]');assert.equal(restored.value,'Wire unsaved');assert.equal(card.shadowRoot.activeElement,restored);assert.equal(restored.selectionStart,2);assert.equal(restored.selectionEnd,5);
  assert.equal(calls.some(q=>/set_tariff/.test(q.type)),false);assert.deepEqual(card._tariffEditorState,before);
 }finally{host.guard.dispose();dom.window.close();}
});

test('malformed history is rejected without rendering invented rows or dispatching a write',async()=>{
 const f=fixture();try{f.hook=q=>q.type==='ha_tools_email/get_tariff_profile'?{status:'ready',profile:profile(),revision:4,updated_at:null,tariffs:[],tariff_profiles:'not a history'}:undefined;
  await f.editor.openMode('history');assert.equal(f.state.backendAvailable,false);assert.equal(f.root.querySelector('[data-wire-history]').options.length,1);assert.equal(f.writes.length,0);assert.match(f.root.textContent,/response invalid/);
 }finally{f.close();}
});
test('a newly read revision cannot silently rebase an unsaved draft; using stored data is explicit',async()=>{
 const f=fixture();try{await f.editor.openMode('history');f.input('name','Unsaved on revision four');f.revision=5;await f.editor.load();
  assert.equal(f.state.draft.name,'Unsaved on revision four');assert.equal(f.state.revision,4);assert.equal(f.state.writeUnconfirmed,true);f.click('save');await tick();assert.equal(f.writes.length,0);
  const use=f.root.querySelector('[data-wire-action=stored]');assert.ok(use);use.click();assert.equal(f.state.draft.name,'Saved');assert.equal(f.state.revision,5);assert.equal(f.state.writeUnconfirmed,false);assert.equal(f.writes.length,0);
 }finally{f.close();}
});
