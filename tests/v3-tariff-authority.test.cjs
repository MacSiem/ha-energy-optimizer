'use strict';
// Breaks caught: role/group/callWS/config/offline/pre-mount epoch disclosure,
// release at public timeout, duplicate mutation and save ACK counted as Success.
const {test}=require('node:test');const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const {createTariffSettingsV3}=require('../shared/ha-tools-tariff-settings.js');
const {createEnergyTariffV3}=require('../shared/ha-tools-energy-tariff.js');
const p={schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'a',zones:[{id:'a',energyRate:2,variableRate:0}]};
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(handler){const dom=new JSDOM('<div id="root"></div>');const root=dom.window.document.querySelector('#root');let h={user:{id:'a',is_admin:true,is_owner:false,is_active:true,groups:[{id:'system-admin'}]},config:{time_zone:'UTC',currency:'EUR'},connection:{connected:true},callWS:handler};let ctx={range:'7d',config:'one'};
 const guard=createTariffGuardV3({getHass:()=>h,getContext:()=>ctx,browser:dom.window,timeoutMs:5});
 const state={profile:structuredClone(p),draft:structuredClone(p),revision:4,backendAvailable:true};const saved=[];
 const editor=createTariffSettingsV3({root,getHass:()=>h,state,validate:createEnergyTariffV3,guard,onSaved:e=>saved.push(e)});editor.render();
 return{dom,root,state,guard,editor,saved,setHass:v=>{h=v;guard.observe();},h:()=>h,setContext:v=>{ctx=v;guard.observe();}};
}
test('only independent stored readback of same revision/profile is Save success',async()=>{const f=fixture(m=>Promise.resolve(m.type.endsWith('set_tariff')?{revision:5}:{profile:p,revision:5,updated_at:'2026-10-12T00:00:00Z'}));try{
 f.root.querySelector('[data-action="save"]').click();await flush();assert.equal(f.state.status,'success');assert.equal(f.saved.length,1);
}finally{f.guard.dispose();f.dom.window.close();}});
test('ACK alone and mismatch readback remain Unconfirmed without automatic retry',async()=>{for(const response of [null,{profile:p,revision:5,updated_at:null},{profile:{...p,name:'other'},revision:5,updated_at:'2026-10-12T00:00:00Z'}]){
 let calls=0;const f=fixture(m=>{calls++;return Promise.resolve(m.type.endsWith('set_tariff')?{revision:5}:response);});try{f.root.querySelector('[data-action="save"]').click();await flush();assert.equal(f.state.status,'unconfirmed');assert.equal(f.saved.length,0);assert.equal(calls,2);}finally{f.guard.dispose();f.dom.window.close();}
}});
test('revision conflict preserves draft and sends no retry',async()=>{let calls=0;const f=fixture(()=>{calls++;return Promise.reject({code:'tariff_revision_conflict'});});try{f.state.draft.name='Mine';f.root.querySelector('[data-action="save"]').click();await flush();assert.equal(f.state.status,'error');assert.equal(f.state.draft.name,'Mine');assert.equal(calls,1);}finally{f.guard.dispose();f.dom.window.close();}});
test('deadline retains occupied raw wire until real settlement and late response cannot become success',async()=>{let resolve,calls=0;const f=fixture(()=>{calls++;return new Promise(r=>{resolve=r;});});try{
 const token=f.guard.snapshot();const pending=f.guard.call(token,{type:'ha_tools_email/get_tariff'});await assert.rejects(pending,e=>e.code==='timeout');assert.equal(f.guard.occupied(),true);
 await assert.rejects(f.guard.call(f.guard.snapshot(),{type:'ha_tools_email/get_tariff'}),e=>e.code==='wire_occupied');assert.equal(calls,1);
 resolve({profile:p,revision:5,updated_at:null});await flush();assert.equal(f.guard.occupied(),false);
}finally{f.guard.dispose();f.dom.window.close();}});
test('same user role/groups/is_active/callWS/context changes purge private draft and disable stale handlers',async()=>{
 for(const mutate of [h=>({...h,user:{...h.user,is_admin:false}}),h=>({...h,user:{...h.user,groups:[{id:'other'}]}}),h=>({...h,user:{...h.user,group_ids:['other']}}),h=>({...h,user:{...h.user,is_owner:true}}),h=>({...h,user:{...h.user,is_active:false}}),h=>({...h,callWS:()=>Promise.resolve(null)}),h=>({...h,config:{...h.config,currency:'PLN'}})]){
 let calls=0;const f=fixture(()=>{calls++;return Promise.resolve(null);});try{f.state.draft.name='Private';const button=f.root.querySelector('[data-action="save"]');f.setHass(mutate(f.h()));button.click();await flush();assert.equal(f.state.draft.name==='Private',false);assert.equal(f.root.textContent.includes('Private'),false);assert.equal(calls,0);}finally{f.guard.dispose();f.dom.window.close();}
 }
});
test('typed pre-mount connection events and offline/online edges fence old ticket; unknown event does not',()=>{const dom=new JSDOM();const connection=new dom.window.EventTarget();connection.connected=true;let h={user:{id:'a',is_admin:true},connection,config:{},callWS:()=>Promise.resolve(null)};const guard=createTariffGuardV3({getHass:()=>h,browser:dom.window});try{
 const token=guard.snapshot();connection.dispatchEvent(new dom.window.Event('unrelated'));assert.equal(guard.current(token),true);
 connection.dispatchEvent(new dom.window.Event('disconnected'));connection.dispatchEvent(new dom.window.Event('ready'));assert.equal(guard.current(token),false);
 const next=guard.snapshot();dom.window.dispatchEvent(new dom.window.Event('offline'));dom.window.dispatchEvent(new dom.window.Event('online'));assert.equal(guard.current(next),false);
 }finally{guard.dispose();dom.window.close();}});
test('host never automatically retries a deadline and exposes only the current confirmed revision',async()=>{
 const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');let resolve,calls=0;const h={user:{id:'a',is_admin:true},connection:{connected:true},config:{},callWS:()=>{calls++;return new Promise(r=>resolve=r);}};
 const card={_config:{},_hass:h};const host=createTariffHostV3({card,kind:'smart',createModel:createEnergyTariffV3,legacyProfile:c=>c.tariff_profile||null,createSettings:createTariffSettingsV3,createUi:()=>({}),readTimeoutMs:5});try{
 assert.equal(await host.load(),false);assert.equal(await host.load(),false);assert.equal(calls,1);assert.equal(host.snapshot().profile,null);
 resolve({profile:p,revision:4,updated_at:null});await flush();assert.equal(host.snapshot().profile,null);assert.equal(await host.load(),false);assert.equal(calls,1);
 h.callWS=async()=>({profile:p,revision:5,updated_at:null});host.reset();assert.equal(await host.load(true),true);assert.equal(host.snapshot().revision,5);
 }finally{host.guard.dispose();}
});
test('consumer configuration/range change erases the old private draft without a send',()=>{let calls=0;const f=fixture(()=>{calls++;return Promise.resolve(null);});try{f.state.draft.name='Private';f.setContext({range:'30d',config:'two'});assert.equal(f.state.profile,null);assert.equal(f.state.revision,null);assert.equal(f.root.textContent.includes('Private'),false);assert.equal(calls,0);}finally{f.guard.dispose();f.dom.window.close();}});
test('suspended guard still owns raw request and resumed guard cannot duplicate it',async()=>{let resolve;const f=fixture(()=>new Promise(r=>resolve=r));try{const pending=f.guard.call(f.guard.snapshot(),{type:'ha_tools_email/get_tariff'});f.guard.suspend();f.guard.resume();await assert.rejects(f.guard.call(f.guard.snapshot(),{type:'ha_tools_email/get_tariff'}),e=>e.code==='wire_occupied');resolve(null);await assert.rejects(pending,e=>e.code==='authority_changed');assert.equal(f.guard.occupied(),false);}finally{f.guard.dispose();f.dom.window.close();}});
test('unconfirmed save cannot be repeated even after late raw settlement or editing; independent load reconciles it',async()=>{
 let release,calls=0;const f=fixture(m=>{calls++;return m.type==='ha_tools_email/set_tariff'?new Promise(r=>release=r):Promise.resolve({profile:p,revision:5,updated_at:'2026-10-12T00:00:00Z'});});try{
 f.root.querySelector('[data-action="save"]').click();await new Promise(r=>setTimeout(r,12));assert.equal(f.state.status,'unconfirmed');assert.equal(f.guard.occupied(),true);assert.equal(f.state.busy,false);release({revision:5});await flush();assert.equal(f.root.querySelector('[data-action="save"]').disabled,true);
 const name=f.root.querySelector('[data-path="name"]');name.value='Edited after uncertainty';name.dispatchEvent(new f.dom.window.Event('input'));assert.equal(f.root.querySelector('[data-action="save"]').disabled,true);assert.equal(calls,1);
 await f.editor.load();assert.equal(f.state.revision,5);assert.equal(f.root.querySelector('[data-action="save"]').disabled,false);assert.equal(calls,2);
 }finally{f.guard.dispose();f.dom.window.close();}
});
test('household can explicitly read but cannot edit/save a confirmed valid tariff',async()=>{let calls=0;const f=fixture(()=>{calls++;return Promise.resolve({profile:p,revision:5,updated_at:null});});try{f.setHass({...f.h(),user:{...f.h().user,is_admin:false}});f.editor.render();assert.equal(f.root.querySelector('[data-action="save"]'),null);await f.editor.load();assert.equal(f.state.revision,5);assert.equal(calls,1);assert.ok([...f.root.querySelectorAll('input,select,textarea')].every(n=>n.disabled));}finally{f.guard.dispose();f.dom.window.close();}});
test('existing consumer reset(nextHass) purges before its setter assigns hass',()=>{
 const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');const old={user:{id:'old',is_admin:true},connection:{connected:true},config:{},callWS:()=>Promise.resolve(null)}, next={...old,user:{id:'new',is_admin:true}};const card={_config:{},_hass:old,_sharedTariffProfile:p,_tariffEditorState:{draft:{...p,name:'Private'}}};const host=createTariffHostV3({card,kind:'optimizer',createModel:createEnergyTariffV3,legacyProfile:c=>c.tariff_profile||null,createSettings:createTariffSettingsV3,createUi:()=>({})});try{host.reset(next);assert.equal(card._sharedTariffProfile,null);assert.equal(card._tariffEditorState,null);card._hass=next;host.reset(next);assert.equal(host.snapshot().profile,null);}finally{host.guard.dispose();}
});
