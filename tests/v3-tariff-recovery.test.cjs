'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');
const {createTariffSettingsV3}=require('../shared/ha-tools-tariff-settings.js');
const {createEnergyTariffV3,energyTariffProfileV3}=require('../shared/ha-tools-energy-tariff.js');
const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const valid={schema:1,name:'Original',currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'day',zones:[{id:'day',energyRate:1,variableRate:0}]};
function setup(initial,reply){const dom=new JSDOM('<main></main>');const root=dom.window.document.querySelector('main');const calls=[];let stored=reply,revision=5;
 const state={profile:clone(initial),revision:4,status:'not_checked',busy:false};
 const hass={config:{currency:'EUR',time_zone:'UTC'},user:{id:'admin',is_admin:true},connection:{connected:true},callWS:async req=>{calls.push(clone(req));if(req.type.endsWith('/set_tariff')){assert.equal(req.expected_revision,5);stored=clone(req.profile);revision++;}return {profile:clone(stored),revision,updated_at:'2026-10-12T10:00:00Z'};}};
 const editor=createTariffSettingsV3({root,getHass:()=>hass,state,validate:createEnergyTariffV3});editor.render();
 const input=(path,value)=>{const el=root.querySelector(`[data-path="${path}"]`);el.value=value;el.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 return {dom,root,calls,state,editor,input};}
test('known invalid stored marker starts a blank editable schema without inventing rates',()=>{
 const f=setup({schema:0},{schema:0});try{assert.equal(f.state.draft.schema,1);assert.deepEqual(f.state.draft.zones,[]);assert.equal(f.calls.length,0);assert.match(f.root.textContent,/stored tariff is invalid/i);}finally{f.dom.window.close();}
});
test('a healthy read of the invalid marker permits an explicitly confirmed valid replacement',async()=>{
 const f=setup(valid,{schema:0});try{await f.editor.load();assert.equal(f.state.backendAvailable,true);assert.equal(f.state.revision,5);assert.deepEqual(f.state.profile,{schema:0});assert.equal(f.state.draft.schema,1);
 f.root.querySelector('[data-action="add-zone"]').click();f.input('zones.0.energyRate','0.6');f.input('zones.0.variableRate','0');f.input('defaultZone','zone-1');
 assert.equal(createEnergyTariffV3(f.state.draft).valid,true);f.root.querySelector('[data-action="save"]').click();await new Promise(r=>setImmediate(r));
 assert.equal(f.state.status,'success');assert.equal(f.state.revision,6);assert.deepEqual(f.calls.map(v=>v.type),['ha_tools_email/get_tariff','ha_tools_email/set_tariff','ha_tools_email/get_tariff']);
 }finally{f.dom.window.close();}
});
test('edited draft survives known marker read while arbitrary invalid responses still fail closed',async()=>{
 for(const response of [{schema:0},{schema:0,extra:true}]){const f=setup(valid,response);try{f.input('name','My draft');await f.editor.load();assert.equal(f.state.draft.name,'My draft');assert.equal(f.state.backendAvailable,Object.keys(response).length===1);assert.equal(f.calls.length,1);}finally{f.dom.window.close();}}
});
test('unconfirmed automatic read warning remains visible outside collapsed tariff details',async()=>{
 const card={_config:{},_hass:{config:{time_zone:'UTC'},user:{id:'a'},connection:{connected:true},callWS:()=>new Promise(()=>{})}};
 const host=createTariffHostV3({card,kind:'optimizer',createModel:createEnergyTariffV3,legacyProfile:energyTariffProfileV3,createSettings:()=>{},createUi:()=>{},readTimeoutMs:5});
 await host.load();const dom=new JSDOM(host.markup());try{const warning=dom.window.document.querySelector('p[role="status"]');assert.ok(warning);assert.equal(warning.closest('details'),null);}finally{dom.window.close();}
});
