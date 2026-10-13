'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');
const {readFileSync}=require('node:fs');const {join}=require('node:path');
const {createTariffSettingsV3}=require('../shared/ha-tools-tariff-settings.js');
const {createEnergyTariffV3}=require('../shared/ha-tools-energy-tariff.js');
const profile={schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'day',zones:[{id:'day',energyRate:1,variableRate:0}]};
for(const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'])test(`${type}: tariff input focus survives the parent rerender without writes`,()=>{
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});try{
 dom.window.eval(readFileSync(join(__dirname,'../ha-energy-optimizer.js'),'utf8'));
 const card=dom.window.document.createElement(type);card._schedule=()=>{};
 let reads=0;card._hass={config:{currency:'EUR',time_zone:'UTC'},user:{id:'fixture',is_admin:true},connection:{connected:true},states:{},callWS:()=>{reads++;throw Error('No reads expected');}};
 card._config={...card._config,tariff_profile:profile,show_support:false};card._tariffSettingsOpen=true;dom.window.document.body.append(card);card._render();
 const input=card.shadowRoot.querySelector('[data-path="currency"]');assert.ok(input);input.focus();assert.equal(card.shadowRoot.activeElement,input);
 card._render();assert.equal(card.shadowRoot.activeElement?.dataset.path,'currency');assert.equal(reads,0);
 }finally{dom.window.close();}
});
test('successful confirmed Save returns focus to the same action after its busy phase',async()=>{
 const dom=new JSDOM('<main></main>');try{
 const root=dom.window.document.querySelector('main');const state={profile,revision:1,status:'not_checked',busy:false};const requests=[];
 const hass={config:{currency:'EUR',time_zone:'UTC'},user:{id:'fixture',is_admin:true},connection:{connected:true},callWS:async request=>{requests.push(request.type);return {profile,revision:2,updated_at:'2026-10-12T10:00:00Z'};}};
 const editor=createTariffSettingsV3({root,getHass:()=>hass,state,validate:createEnergyTariffV3});editor.render();const save=root.querySelector('[data-action="save"]');save.focus();save.click();await new Promise(r=>setImmediate(r));
 assert.equal(state.status,'success');assert.equal(dom.window.document.activeElement?.dataset.action,'save');assert.deepEqual(requests,['ha_tools_email/set_tariff','ha_tools_email/get_tariff']);
 }finally{dom.window.close();}
});
test('known invalid stored profile is initially Error, not an unchecked validation result',()=>{
 const dom=new JSDOM('<main></main>');try{
 const root=dom.window.document.querySelector('main');const state={profile:{schema:0},revision:1,status:'not_checked',busy:false};
 const hass={config:{currency:'EUR',time_zone:'UTC'},user:{id:'fixture',is_admin:true},connection:{connected:true},callWS:async()=>{throw Error('No API');}};
 const editor=createTariffSettingsV3({root,getHass:()=>hass,state,validate:createEnergyTariffV3});editor.render();
 assert.equal(state.status,'error');assert.equal(root.querySelector('[data-result-state]').dataset.resultState,'error');
 }finally{dom.window.close();}
});

test('finishing a Save does not steal focus from a newly chosen external control',async()=>{
 const dom=new JSDOM('<button id="outside">Outside</button><main></main>');try{
 const root=dom.window.document.querySelector('main');const state={profile,revision:1,status:'not_checked',busy:false};let resolve;
 const hass={config:{currency:'EUR',time_zone:'UTC'},user:{id:'fixture',is_admin:true},connection:{connected:true},callWS:request=>request.type.endsWith('/set_tariff')?new Promise(r=>{resolve=r;}):Promise.resolve({profile,revision:2,updated_at:'2026-10-12T10:00:00Z'})};
 const editor=createTariffSettingsV3({root,getHass:()=>hass,state,validate:createEnergyTariffV3});editor.render();const save=root.querySelector('[data-action="save"]');save.focus();save.click();dom.window.document.querySelector('#outside').focus();resolve({revision:2});await new Promise(r=>setImmediate(r));
 assert.equal(state.status,'success');assert.equal(dom.window.document.activeElement.id,'outside');
 }finally{dom.window.close();}
});

test('Insights locale refresh translates its tariff summary and retains the focused private draft without API',()=>{
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});let card;try{
 dom.window.eval(readFileSync(join(__dirname,'../ha-energy-optimizer.js'),'utf8'));card=dom.window.document.createElement('ha-energy-insights');card._schedule=()=>{};let calls=0;const hass={language:'en',locale:{language:'en'},user:{id:'fixture',is_admin:true},connection:{connected:true},config:{currency:'EUR',time_zone:'UTC'},states:{},callWS:()=>{calls++;throw Error('No API on locale refresh');}};card._hass=hass;card._config={...card._config,tariff_profile:profile,show_support:false};card._firstHassRender=true;card._lastDataFetch=dom.window.Date.now();card._tariffSettingsOpen=true;dom.window.document.body.append(card);card._render();const input=card.shadowRoot.querySelector('[data-path="name"]');input.value='Private draft';input.dispatchEvent(new dom.window.Event('input'));input.focus();input.setSelectionRange(3,5);card.hass={...hass,language:'pl',locale:{language:'pl'}};assert.equal(card.shadowRoot.querySelector('[data-tariff-details]>summary').textContent,'Ustawienia taryfy');assert.match(card.shadowRoot.querySelector('.ht-tariff-v3').textContent,/Nazwa taryfy/);const focused=card.shadowRoot.activeElement;assert.equal(focused.dataset.path,'name');assert.equal(focused.value,'Private draft');assert.equal(focused.selectionStart,3);assert.equal(focused.selectionEnd,5);assert.equal(calls,0);
 }finally{card?._tariffConsumerUnsubscribeV3?.();card?._tariffHostController?.guard.dispose();dom.window.close();}
});

test('Insights first completed source read is not repeated by an immediate HA locale refresh',async()=>{
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});let card;try{
 dom.window.eval(readFileSync(join(__dirname,'../ha-energy-optimizer.js'),'utf8'));card=dom.window.document.createElement('ha-energy-insights');card._schedule=()=>{};card.setConfig({tariff_profile:profile,show_support:false});const calls=[];const hass={language:'en',locale:{language:'en'},user:{id:'fixture',is_admin:true},connection:{connected:true},config:{currency:'EUR',time_zone:'UTC'},states:{},callWS:async req=>{calls.push(req.type);if(req.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.grid'}]};if(req.type==='recorder/get_statistics_metadata')return {'sensor.grid':{has_sum:true,statistics_unit_of_measurement:'kWh',unit_class:'energy'}};if(req.type==='recorder/statistics_during_period'){const start=Date.parse(req.start_time),end=Date.parse(req.end_time);return {'sensor.grid':Array.from({length:(end-start)/3600000},(_,i)=>({start:start+i*3600000,change:1}))};}throw Error('Unexpected API');}};card.hass=hass;await new Promise(r=>setImmediate(r));assert.ok(card._insightsEnergyModel);const before=calls.length;assert.equal(before,3);card.hass={...hass,language:'pl',locale:{language:'pl'}};await new Promise(r=>setImmediate(r));assert.equal(calls.length,before);assert.equal(card._insightsReadPending,false);
 }finally{card?._tariffConsumerUnsubscribeV3?.();card?._tariffHostController?.guard.dispose();dom.window.close();}
});
