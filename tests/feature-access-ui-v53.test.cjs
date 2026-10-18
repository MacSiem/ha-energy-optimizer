"use strict";
// Owner: apply tests first -> RED; apply implementation and sync-tariff --write -> GREEN.
// This patch worker did not execute these tests or the product.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {createFeatureAccessV53}=require('../shared/ha-tools-feature-access.js');
const {createTariffGuardV3}=require('../shared/ha-tools-tariff-guard.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const clone=v=>JSON.parse(JSON.stringify(v));
const tick=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const envelope=(policy={schema:1,features:{}},revision=7)=>({policy:clone(policy),revision,status:'ready',updated_at:null});
const users=[{id:'native-a',name:'Anna <img src=x onerror=bad()>',is_active:true},{id:'native-b',name:'Bartek',is_active:true},{id:'native-old',name:'Former household',is_active:false}];
function fixture({admin=true,policy,language='en',unit=false}={}) {
 const errors=[],requests=[];let raw=0,maxRaw=0,reply;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});vc.on('error',(...a)=>errors.push(a.join(' ')));
 const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}};w.HTMLCanvasElement.prototype.getContext=()=>({});
 w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:900,height:44}]:[];};w.fetch=()=>{throw Error('network forbidden');};
 let card,guard,editor;
 if(unit){card=w.document.createElement('div');card.attachShadow({mode:'open'});card._activeTab='config';w.document.body.append(card);}
 else {w.eval(['src/optimizer.js','src/energy-insights.js','src/energy-email.js'].map(read).join('\n'));card=w.document.createElement('ha-energy-email');card.setConfig({default_tab:'config',show_help:false,show_support:false});}
 let stored=envelope(policy),hass={user:{id:'admin-one',is_admin:admin,is_active:true},connection:Object.assign(new w.EventTarget(),{connected:true}),connected:true,locale:{language},language,config:{time_zone:'UTC',currency:'EUR'},states:{},services:{}};
 hass.callWS=async request=>{requests.push(clone(request));raw++;maxRaw=Math.max(raw,maxRaw);try{
  if(reply)return await reply(request);
  if(request.type==='ha_tools_email/get_feature_access')return clone(stored);
  if(request.type==='config/auth/list')return clone(users);
  if(request.type==='ha_tools_email/set_feature_access'){assert.equal(request.expected_revision,stored.revision);stored=envelope(request.policy,stored.revision+1);return clone(stored);}
  throw Error('unexpected API '+request.type);
 }finally{raw--;}};
 hass.callService=()=>{throw Error('service forbidden');};
 if(unit){card._hass=hass;guard=createTariffGuardV3({getHass:()=>card._hass,browser:w});editor=createFeatureAccessV53({card,guard});}
 const api={w,card,requests,errors,get hass(){return hass;},get editor(){return unit?editor:card._featureAccessV53;},get guard(){return unit?guard:card._getTariffHostV3().guard;},get maxRaw(){return maxRaw;},set reply(value){reply=value;},
  async mount(){if(unit){card.shadowRoot.innerHTML='<details data-feature-access-v53><summary>Access</summary><div data-feature-access-body></div></details>';editor.mount(card.shadowRoot.querySelector('details'));}else{w.document.body.append(card);card.hass=hass;}await tick();},
  update(next){hass=next;if(unit){card._hass=hass;editor.observe();}else card.hass=hass;},
  details(){return card.shadowRoot.querySelector('[data-feature-access-v53]');},
  node(action){const el=card.shadowRoot.querySelector('[data-feature-access="'+action+'"]');assert.ok(el,'actual access control '+action);return el;},
  rule(feature,operation){const el=card.shadowRoot.querySelector('[data-access-feature="'+feature+'"][data-access-operation="'+operation+'"] select');assert.ok(el,feature+'/'+operation);return el;},
  async open(){const details=api.details();assert.ok(details,'editor mounted inside actual Config');details.open=true;details.dispatchEvent(new w.Event('toggle'));await tick();},
  change(feature,op,mode){const select=api.rule(feature,op);select.value=mode;select.dispatchEvent(new w.Event('change',{bubbles:true}));},
  async closeDisclosure(){const details=api.details();details.open=false;details.dispatchEvent(new w.Event('toggle'));await tick();},
  close(){if(unit){editor.stop();guard.dispose();}card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();},
  clean(){assert.deepEqual(errors,[]);assert.ok(requests.every(r=>['ha_tools_email/get_feature_access','ha_tools_email/set_feature_access','config/auth/list'].includes(r.type)),'no SMTP, services or incidental data requests');}
 };return api;
}
test('actual Config is quiet while closed; only open active admin loads policy then native users',async()=>{
 const f=fixture();try{await f.mount();assert.equal(f.details().open,false);assert.deepEqual(f.requests,[]);await f.open();
  assert.deepEqual(f.requests.map(r=>r.type),['ha_tools_email/get_feature_access','config/auth/list']);assert.equal(f.maxRaw,1);assert.equal(f.node('save').disabled,true);f.clean();
 }finally{f.close();}
});
test('nonadministrator has no access disclosure or policy/user IO, including a forged config tab',async()=>{
 const f=fixture({admin:false});try{await f.mount();assert.equal(f.details(),null);assert.deepEqual(f.requests,[]);f.card.setActiveTab('config');await tick();assert.equal(f.details(),null);assert.deepEqual(f.requests,[]);f.clean();}finally{f.close();}
});
test('four catalogs expose only supported independent operations; inherit does not migrate defaults',async()=>{
 const f=fixture();try{await f.mount();await f.open();assert.equal(f.card.shadowRoot.querySelectorAll('[data-access-feature] select').length,11);
  assert.equal(f.card.shadowRoot.querySelector('[data-access-feature="energy_analysis"][data-access-operation="execute"]'),null);
  assert.deepEqual(f.editor.state().draft,{schema:1,features:{}});assert.match(f.node('explanation').textContent,/visibility.*permission/i);assert.match(f.node('explanation').textContent,/Home Assistant/);
  f.change('energy_reports','visible','household');f.change('energy_reports','read','admin');f.change('energy_reports','execute','selected_users');
  assert.equal(f.rule('energy_reports','visible').value,'household');assert.equal(f.rule('energy_reports','read').value,'admin');assert.equal(f.rule('energy_reports','execute').value,'selected_users');
  assert.equal(f.requests.length,2,'edits never autosave');f.clean();
 }finally{f.close();}
});
test('named native choices escape markup; explicit Save sends exact policy and expected revision, no SMTP',async()=>{
 const f=fixture();try{await f.mount();await f.open();f.change('energy_analysis','read','selected_users');
  const row=f.rule('energy_analysis','read').closest('[data-access-operation]'),choices=[...row.querySelectorAll('input[type="checkbox"]')];assert.equal(choices.length,2);assert.match(row.textContent,/Anna <img/);assert.equal(row.querySelector('img'),null);assert.doesNotMatch(row.textContent,/native-a|native-b/);
  choices[0].checked=true;choices[0].dispatchEvent(new f.w.Event('change',{bubbles:true}));f.node('save').click();await tick();
  const write=f.requests.find(r=>r.type.endsWith('/set_feature_access'));assert.deepEqual(write,{type:'ha_tools_email/set_feature_access',expected_revision:7,policy:{schema:1,features:{energy_analysis:{read:{mode:'selected_users',user_ids:['native-a']}}}}});
  assert.match(f.node('status').textContent,/saved/i);assert.equal(f.editor.state().revision,8);assert.equal(f.node('save').disabled,true);f.clean();
 }finally{f.close();}
});
test('ordinary hass updates preserve the exact focused form node and unsaved rules without IO',async()=>{
 const f=fixture();try{await f.mount();await f.open();f.change('energy_tariff','read','selected_users');const select=f.rule('energy_tariff','read');select.focus();const before=f.requests.length;
  f.update({...f.hass,states:{'sensor.changed':{state:'42'}}});await tick();assert.equal(f.rule('energy_tariff','read'),select);assert.equal(f.card.shadowRoot.activeElement,select);assert.equal(select.value,'selected_users');assert.equal(f.requests.length,before);f.clean();
 }finally{f.close();}
});
test('revision conflict retains draft and requires explicit discard-and-reload gesture',async()=>{
 const f=fixture();try{await f.mount();await f.open();f.change('energy_reports','read','household');const draft=clone(f.editor.state().draft);
  f.reply=async request=>{assert.equal(request.type,'ha_tools_email/set_feature_access');throw {code:'feature_access_revision_conflict'};};f.node('save').click();await tick();assert.deepEqual(f.editor.state().draft,draft);assert.equal(f.editor.state().revision,7);assert.match(f.node('status').textContent,/changed|reload/i);assert.equal(f.node('save').disabled,true);assert.equal(f.requests.length,3);
  f.reply=null;f.node('reload').click();await tick();assert.deepEqual(f.editor.state().draft,{schema:1,features:{}});assert.equal(f.requests.filter(r=>r.type.endsWith('/set_feature_access')).length,1);f.clean();
 }finally{f.close();}
});
test('unavailable native list preserves selected missing/inactive accounts without exposing IDs',async()=>{
 const policy={schema:1,features:{log_reports:{read:{mode:'selected_users',user_ids:['native-old','missing-private-id']}}}},f=fixture({policy});try{await f.mount();
  f.reply=async req=>{if(req.type.endsWith('/get_feature_access'))return envelope(policy);if(req.type==='config/auth/list')throw {code:'unknown_command'};if(req.type.endsWith('/set_feature_access'))return envelope(req.policy,8);throw Error(req.type);};await f.open();assert.deepEqual(f.editor.state().draft,policy);assert.match(f.node('status').textContent,/accounts|users/i);assert.doesNotMatch(f.card.shadowRoot.textContent,/missing-private-id|native-old/);
  f.change('energy_tariff','visible','admin');f.node('save').click();await tick();assert.deepEqual(f.requests.find(r=>r.type.endsWith('/set_feature_access')).policy.features.log_reports,policy.features.log_reports);f.clean();
 }finally{f.close();}
});
test('inactive named account remains selected and cannot silently disappear during another edit',async()=>{
 const policy={schema:1,features:{energy_tariff:{execute:{mode:'selected_users',user_ids:['native-old','missing-private-id']}}}},f=fixture({policy});try{await f.mount();await f.open();assert.match(f.card.shadowRoot.textContent,/Former household/);assert.match(f.card.shadowRoot.textContent,/inactive|unavailable/i);f.change('energy_analysis','visible','admin');assert.deepEqual(f.editor.state().draft.features.energy_tariff,policy.features.energy_tariff);f.clean();}finally{f.close();}
});
for(const change of ['user','role','active','connection','offline','unmount'])test('pending old policy never revives after '+change+'; no second raw wire',async()=>{
 const f=fixture(),held=defer();try{await f.mount();f.reply=req=>{if(req.type.endsWith('/get_feature_access'))return held.promise;return clone(users);};const opening=f.open();await tick();assert.equal(f.requests.length,1);
  if(change==='unmount')f.card.remove();else {const h=f.hass,next={...h,user:{...h.user}};if(change==='user')next.user.id='replacement';if(change==='role')next.user.is_admin=false;if(change==='active')next.user.is_active=false;if(change==='connection')next.connection=Object.assign(new f.w.EventTarget(),{connected:true});if(change==='offline')next.connected=false;f.update(next);}
  held.resolve(envelope({schema:1,features:{energy_reports:{read:{mode:'selected_users',user_ids:['old-private']}}}}));await opening;await tick();assert.equal(f.editor.state().draft,null);assert.doesNotMatch(f.card.shadowRoot.textContent,/old-private/);assert.equal(f.requests.filter(r=>r.type==='config/auth/list').length,0);assert.equal(f.maxRaw,1);f.clean();
 }finally{held.resolve(envelope());f.close();}
});
test('closing during read purges and stops continuation; reopen waits for old wire then reads afresh',async()=>{
 const f=fixture(),held=defer();try{await f.mount();f.reply=req=>req.type.endsWith('/get_feature_access')?held.promise:clone(users);await f.open();await f.closeDisclosure();assert.equal(f.editor.state().draft,null);await f.open();assert.equal(f.requests.length,1);f.reply=null;held.resolve(envelope());await tick();assert.deepEqual(f.requests.map(r=>r.type),['ha_tools_email/get_feature_access','ha_tools_email/get_feature_access','config/auth/list']);assert.equal(f.maxRaw,1);f.clean();}finally{held.resolve(envelope());f.close();}
});
test('guard occupied by another consumer defers opening without overlap and closed queued intent never dispatches',async()=>{
 const f=fixture({unit:true}),held=defer();try{await f.mount();f.reply=()=>held.promise;const raw=f.guard.call(f.guard.observe(),{type:'config/auth/list'},true);await tick();await f.open();assert.equal(f.requests.length,1);await f.closeDisclosure();held.resolve([]);await raw;await tick();assert.equal(f.requests.length,1);assert.equal(f.editor.state().draft,null);assert.equal(f.maxRaw,1);}finally{held.resolve([]);f.close();}
});
for(const stage of ['read','write','users'])test('fresh unauthorized '+stage+' purges private policy and choices and disables actions',async()=>{
 const f=fixture();try{await f.mount();if(stage==='write'){await f.open();f.change('energy_reports','read','household');}
  f.reply=async req=>{if(stage==='users'&&req.type.endsWith('/get_feature_access'))return envelope();throw {code:'unauthorized'};};if(stage==='write')f.node('save').click();else await f.open();await tick();assert.equal(f.editor.state().draft,null);assert.deepEqual(f.editor.state().users,[]);assert.equal(f.node('save').disabled,true);assert.equal(f.node('reload').disabled,true);assert.match(f.node('status').textContent,/administrator|access/i);f.clean();
 }finally{f.close();}
});
for(const error of [{code:'unknown_command'},new Error('unknown_command'),{code:'invalid_feature_access'},{code:'feature_access_read_failed'}])test('read errors are honest and never replace policy with fabricated defaults: '+String(error.code||error.message),async()=>{
 const f=fixture();try{await f.mount();f.reply=async()=>{throw error;};await f.open();assert.equal(f.editor.state().draft,null);assert.equal(f.node('save').disabled,true);assert.equal(f.requests.length,1);assert.match(f.node('status').textContent,error.code==='unknown_command'?/update HA Tools Email/i:/could not|unavailable/i);f.clean();}finally{f.close();}
});
test('malformed or mismatching save ACK never displays saved or repeats mutation',async()=>{
 const f=fixture();try{await f.mount();await f.open();f.change('energy_reports','visible','household');const draft=clone(f.editor.state().draft);f.reply=async()=>envelope({schema:1,features:{}},8);f.node('save').click();await tick();assert.deepEqual(f.editor.state().draft,draft);assert.doesNotMatch(f.node('status').textContent,/^Saved/);assert.equal(f.node('save').disabled,true);assert.equal(f.requests.filter(r=>r.type.endsWith('/set_feature_access')).length,1);f.clean();}finally{f.close();}
});
test('Polish labels explain native HA upper bound and independent permissions without protocol jargon',async()=>{
 const f=fixture({language:'pl'});try{await f.mount();assert.match(f.details().textContent,/Dostęp domowników/);await f.open();assert.match(f.node('explanation').textContent,/Home Assistant/);assert.match(f.node('explanation').textContent,/widoczność.*uprawnie/i);assert.equal(f.node('save').textContent,'Zapisz');assert.match(f.node('reload').textContent,/Wczytaj/);assert.doesNotMatch(f.details().textContent,/expected_revision|user_ids|schema|JSON|native-a|energy_analysis/);f.clean();}finally{f.close();}
});

test('a shared guard epoch change keeps unsaved draft but requires explicit reload',async()=>{
 const f=fixture({unit:true});try{await f.mount();await f.open();f.change('energy_reports','read','household');const draft=clone(f.editor.state().draft),before=f.requests.length;f.guard.invalidate();await tick();assert.deepEqual(f.editor.state().draft,draft);assert.equal(f.node('save').disabled,true);assert.match(f.node('status').textContent,/reload/i);assert.equal(f.requests.length,before);f.clean();}finally{f.close();}
});
test('new identity opening waits behind the old raw policy request and cannot receive its private choices',async()=>{
 const f=fixture({unit:true}),held=defer();try{await f.mount();f.reply=req=>req.type.endsWith('/get_feature_access')?held.promise:clone(users);await f.open();const next={...f.hass,user:{...f.hass.user,id:'second-admin'}};f.update(next);await f.open();assert.equal(f.requests.length,1);f.reply=null;held.resolve(envelope({schema:1,features:{log_reports:{read:{mode:'selected_users',user_ids:['old-private-choice']}}}}));await tick();assert.deepEqual(f.editor.state().draft,{schema:1,features:{}});assert.equal(f.requests.length,3);assert.equal(f.maxRaw,1);assert.doesNotMatch(f.card.shadowRoot.textContent,/old-private-choice/);f.clean();}finally{held.resolve(envelope());f.close();}
});
test('write reply after identity change cannot mark the replacement editor saved or overlap its read',async()=>{
 const f=fixture({unit:true}),held=defer();try{await f.mount();await f.open();f.change('energy_reports','read','household');const sent=clone(f.editor.state().draft);f.reply=req=>{assert.equal(req.type,'ha_tools_email/set_feature_access');return held.promise;};f.node('save').click();await tick();assert.equal(f.requests.length,3);f.update({...f.hass,user:{...f.hass.user,id:'second-admin'}});await f.open();assert.equal(f.requests.length,3);f.reply=null;held.resolve(envelope(sent,8));await tick();assert.deepEqual(f.editor.state().draft,{schema:1,features:{}});assert.equal(f.editor.state().revision,7);assert.doesNotMatch(f.node('status').textContent,/^Saved/);assert.equal(f.maxRaw,1);assert.equal(f.requests.filter(r=>r.type.endsWith('/set_feature_access')).length,1);f.clean();}finally{held.resolve(envelope());f.close();}
});
test('public timeout never frees raw policy write occupation or enables a second save',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const f=fixture({unit:true}),held=defer();try{await f.mount();await f.open();f.change('energy_reports','read','household');f.reply=()=>held.promise;f.node('save').click();await tick();t.mock.timers.tick(15000);await tick();assert.equal(f.guard.occupied(),true);assert.equal(f.node('save').disabled,true);const before=f.requests.length;f.node('save').click();f.node('reload').click();await tick();assert.equal(f.requests.length,before);held.resolve(envelope(f.editor.state().draft,8));await tick();assert.equal(f.guard.occupied(),false);assert.equal(f.node('save').disabled,true);assert.match(f.node('status').textContent,/could not be confirmed/i);assert.equal(f.requests.filter(r=>r.type.endsWith('/set_feature_access')).length,1);f.clean();}finally{held.resolve(envelope());f.close();t.mock.timers.reset();}
});

test('inactive Config route cannot read even when a stale disclosure is programmatically opened',async()=>{
 const f=fixture({unit:true});try{await f.mount();await f.open();const before=f.requests.length;f.card._activeTab='preview';f.editor.observe();assert.equal(f.editor.state().draft,null);const details=f.details();details.open=true;details.dispatchEvent(new f.w.Event('toggle'));await tick();assert.equal(f.requests.length,before);assert.equal(details.open,false);assert.equal(f.editor.state().draft,null);f.clean();}finally{f.close();}
});
test('native disconnect event hides private DOM synchronously and cannot continue a policy read',async()=>{
 const f=fixture({unit:true});try{await f.mount();await f.open();f.change('energy_reports','read','selected_users');assert.ok(f.card.shadowRoot.querySelector('select'));const before=f.requests.length;f.hass.connection.dispatchEvent(new f.w.Event('disconnected'));assert.equal(f.card.shadowRoot.querySelector('[data-access-feature]'),null);assert.equal(f.editor.state().draft,null);await tick();assert.equal(f.requests.length,before);f.clean();}finally{f.close();}
});
