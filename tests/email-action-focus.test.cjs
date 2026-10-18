'use strict';
const {isolateLegacyAnalysis}=require('./helpers/legacy-analysis-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const code = (process.env.EMAIL_SOURCE_PATH ? [process.env.EMAIL_SOURCE_PATH] : ['src/optimizer.js','src/energy-insights.js','src/energy-email.js','src/chart-vendor.js']).map(p => readFileSync(join(__dirname,'..',p),'utf8')).join('');
function fixture() {
  const dom = new JSDOM('<input id="outside">', {runScripts:'dangerously',url:'http://localhost/'});
  // JSDOM has no layout; native visibility and dimensions are checked separately in Chrome.
  dom.window.HTMLElement.prototype.getClientRects = function () { return this.isConnected ? [{width:200,height:44}] : []; };
  dom.window.eval(code);
  const card = isolateLegacyAnalysis(dom.window.document.createElement('ha-energy-email'));
  card._firstRender = true; card._discoveryDone = true; card._schedule = () => {};
  card._config.show_support = false; card._config.energy_price = 0.5;
  const writes = []; let resolve, reject;
  const pending = new Promise((yes,no) => { resolve=yes; reject=no; });
  card._hass = {user:{id:'admin',is_admin:true}, connection:{connected:true}, states:{}, config:{currency:'EUR',time_zone:'UTC'}, language:'en',locale:{language:'en'}, services:{ha_tools_email:{send:{},test:{}}}, callWS: request => {if (request.type === 'manifest/get') return Promise.resolve({domain:'ha_tools_email',version:'2.2.0'}); writes.push(request); return pending;},callService: (...args) => {writes.push(args); return pending;}};
  card._emailBackendAvailable = true; card._emailBackendConfig = {smtp_configured:true};
  for (const p of ['day','week','month']) {
    card[`_periodCache_${p}`] = Array.from({length:41},(_,i)=>({name:`Source ${i+1}`,entity_id:`sensor.import_${i+1}`,month:42-i,lastMonth:0,cost:(42-i)*0.5}));
    card[`_periodStatus_${p}`]='ready'; card[`_periodCacheTime_${p}`]=Date.now();
  }
  dom.window.document.body.append(card); card.setActiveTab('send');
  return {dom,card,writes,resolve,reject,root:card.shadowRoot};
}
for (const cadence of ['daily','weekly','monthly']) for (const outcome of ['success','failure']) test(`backend ${cadence} keeps a usable focus while pending and returns after ${outcome}`, async () => {
  const f=fixture(); try {
    f.root.getElementById(`send-${cadence}`).focus();
    const work=f.card._sendReport(cadence);
    assert.ok(f.root.activeElement && !f.root.activeElement.disabled, 'pending focus remains usable');
    f.card._render();
    outcome==='success' ? f.resolve({status:'accepted_by_smtp'}) : f.reject(new Error('synthetic failure'));
    await work;
    assert.equal(f.root.activeElement?.id,`send-${cadence}`); assert.equal(f.writes.length,1);
  } finally {f.dom.window.close();}
});
for (const move of ['outside','another control','another tab','new user']) test(`late send does not steal focus after ${move}`, async () => {
  const f=fixture(); try {
    f.root.getElementById('send-daily').focus(); const work=f.card._sendReport('daily');
    let target;
    if(move==='outside') {target=f.dom.window.document.getElementById('outside');target.focus();}
    if(move==='another control') {target=f.root.getElementById('price-display');target.focus();}
    if(move==='another tab') {f.card.setActiveTab('overview');target=f.root.querySelector('[data-period="week"]');target.focus();}
    if(move==='new user') {f.card._clearEmailContext();f.card._hass={...f.card._hass,user:{id:'next',is_admin:true}};f.card._render();target=f.root.getElementById('price-display');target.focus();}
    f.resolve({status:'accepted_by_smtp'}); await work;
    assert.equal(f.dom.window.document.activeElement === f.card ? f.root.activeElement?.id : f.dom.window.document.activeElement?.id,target.id);
  } finally {f.dom.window.close();}
});
for (const outcome of ['success','failure']) test(`SMTP test restores focus after ${outcome}`, async () => {
  const f=fixture(); try {
    const actual=f.card._testSmtp.bind(f.card);let work;f.card._testSmtp=()=>work=actual();
    f.root.getElementById('btn-smtp-test').focus(); f.root.activeElement.click();
    assert.ok(work, 'visible SMTP button invokes its handler');
    assert.ok(f.root.activeElement && !f.root.activeElement.disabled);
    outcome==='success' ? f.resolve({}) : f.reject(new Error('synthetic failure')); await work;
    assert.equal(f.root.activeElement?.id,'btn-smtp-test');assert.equal(f.writes.length,1);
  } finally {f.dom.window.close();}
});
test('legacy quick failure returns focus without sending when Recorder data is incomplete',async()=>{
  const f=fixture();try {
    f.card._emailBackendAvailable=false;f.card._render();f.card._fetchRecorderStats=async()=>{f.card._periodStatus_week='partial';};
    f.root.getElementById('send-quick').focus();await f.card._sendReport('quick');
    assert.equal(f.root.activeElement?.id,'send-quick');assert.equal(f.writes.length,0);
  }finally{f.dom.window.close();}
});
test('period/page selection survives rerender and page boundary falls back to selected period',()=>{
  const f=fixture();try {
    f.card.setActiveTab('overview');let target=f.root.querySelector('[data-period="week"]');target.focus();target.click();
    assert.equal(f.root.activeElement?.dataset.period,'week');
    target=f.root.querySelector('[data-page-next]');target.focus();target.click();assert.ok(f.root.activeElement?.hasAttribute('data-page-next'));
    f.root.activeElement.click();assert.equal(f.root.activeElement?.dataset.period,'week');
    f.card._periodCache_week=f.card._periodCache_week.slice(0,1);f.card._renderTab();assert.equal(f.root.querySelectorAll('.device-row').length,1);
  }finally{f.dom.window.close();}
});
test('admin price is a named button; Escape, cancel and successful zero-rate save return focus',async()=>{
  const f=fixture();try {
    const button=f.root.getElementById('price-display');assert.equal(button.tagName,'BUTTON');assert.ok(button.getAttribute('aria-label'));
    button.focus();button.click();f.root.getElementById('price-input').dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(f.root.activeElement?.id,'price-display');
    f.root.activeElement.click();f.root.getElementById('price-cancel').focus();f.root.activeElement.click();assert.equal(f.root.activeElement?.id,'price-display');
    f.root.activeElement.click();f.root.getElementById('price-input').value='0';f.root.getElementById('price-save').focus();f.root.activeElement.click();await new Promise(r=>setImmediate(r));
    assert.equal(f.card._config.energy_price,0);assert.equal(f.root.activeElement?.id,'price-display');
  }finally{f.dom.window.close();}
});
test('price save does not steal outside focus; household price stays readable',async()=>{
  const f=fixture();try {
    f.card._saveToHelper=()=>new Promise(r=>{f.save=r;});f.root.getElementById('price-display').click();f.root.getElementById('price-save').focus();f.root.activeElement.click();
    f.dom.window.document.getElementById('outside').focus();f.save(true);await new Promise(r=>setImmediate(r));assert.equal(f.dom.window.document.activeElement.id,'outside');
    f.card._hass={...f.card._hass,user:{id:'household',is_admin:false}};f.card._render();assert.equal(f.root.getElementById('price-display').tagName,'SPAN');
  }finally{f.dom.window.close();}
});
for (const move of ['outside-and-back','window blur','tab-and-back','disconnect']) test(`action ownership stays cancelled after ${move}`,async()=>{
  const f=fixture();try {
    f.root.getElementById('send-daily').focus();const work=f.card._sendReport('daily');const anchor=f.root.activeElement;
    if(move==='outside-and-back'){f.dom.window.document.getElementById('outside').focus();anchor.focus();}
    if(move==='window blur')f.dom.window.dispatchEvent(new f.dom.window.Event('blur'));
    if(move==='tab-and-back'){f.card.setActiveTab('overview');f.card.setActiveTab('send');}
    if(move==='disconnect'){f.card.remove();f.dom.window.document.body.append(f.card);f.card._render();}
    f.resolve({status:'accepted_by_smtp'});await work;assert.notEqual(f.root.activeElement?.id,'send-daily');
  }finally{f.dom.window.close();}
});
test('shared tariff action opens and focuses its editable settings without a write',()=>{
  const f=fixture();try {
    f.card._config.tariff_profile={schema:1,type:'flat',currency:'EUR',timezone:'UTC',rate:0.5};f.card._render();
    f.root.getElementById('price-display').focus();f.root.activeElement.click();
    const details=f.root.querySelector('[data-tariff-details]');assert.ok(details.open);assert.ok(details.contains(f.root.activeElement));assert.equal(f.writes.length,0);
  }finally{f.dom.window.close();}
});
test('compact navigation has one picker and stays synchronized after changing views',()=>{
  const f=fixture();try {
    assert.equal(f.root.querySelectorAll('.email-tab-picker select,.energy-tab-picker select').length,1);
    f.card.setActiveTab('overview');assert.equal(f.root.getElementById('email-tab-select').value,'overview');
    const select=f.root.getElementById('email-tab-select');select.focus();select.value='preview';select.dispatchEvent(new f.dom.window.Event('change'));
    assert.equal(f.card._activeTab,'preview');assert.equal(f.root.activeElement?.id,'email-tab-select');assert.equal(f.root.getElementById('email-tab-select').value,'preview');
    f.card.setActiveTab('send');assert.equal(f.root.getElementById('email-tab-select').value,'send');
  }finally{f.dom.window.close();}
});
test('Enter in the inline price input consumes the key before returning to its button',async()=>{
  const f=fixture();try {
    f.root.getElementById('price-display').click();const input=f.root.getElementById('price-input');input.value='0.65';
    const event=new f.dom.window.KeyboardEvent('keydown',{key:'Enter',cancelable:true});input.dispatchEvent(event);
    assert.equal(event.defaultPrevented,true);await new Promise(r=>setImmediate(r));assert.equal(f.root.activeElement?.id,'price-display');assert.equal(f.card._config.energy_price,0.65);
  }finally{f.dom.window.close();}
});
