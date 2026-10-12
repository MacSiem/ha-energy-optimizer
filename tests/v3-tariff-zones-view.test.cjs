'use strict';
const {test}=require('node:test'); const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'); const {JSDOM}=require('jsdom');
function setup() {
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});
 dom.window.eval(readFileSync(require('node:path').join(__dirname,'../ha-energy-optimizer.js'),'utf8'));
 const card=dom.window.document.createElement('ha-energy-optimizer');
 card._hass={config:{time_zone:'UTC',currency:'EUR'},states:{},user:{is_admin:false},locale:{language:'en'}};
 card._schedule=()=>{}; card._currentTab='recommendations';
 const from=Date.parse('2026-01-01T12:00Z');
 card._energyModel={todayStart:from,end:from+3600000,zone:'UTC',points:new Map([[from,{kwh:2}]])};
 card._hasRealData=true;
 return {dom,card};
}
test('equal rates across zones show measured cost without inventing one zone attribution',()=>{
 const {dom,card}=setup();try {
 card._config.tariff_profile={schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',
 defaultZone:'day',zones:[{id:'day',energyRate:1,variableRate:0},{id:'night',energyRate:1,variableRate:0}],
 rules:[{zone:'night',intervals:[{from:'12:30',to:'13:00'}]}]};
 card._render(); const table=card.shadowRoot.querySelector('#recommendations-list table');
 assert.ok(table); assert.match(table.textContent,/Multiple zones.*same rate/);
 assert.match(table.textContent,/day.*night/); assert.match(table.textContent,/2[.,]00/);
 assert.equal(table.querySelectorAll('tbody tr').length,1);
 }finally{dom.window.close();}
});
test('an explicitly tiny custom rate remains visible instead of rounding to zero',()=>{
 const {dom,card}=setup();try {
 card._config.tariff_profile={schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',
 defaultZone:'day',zones:[{id:'day',energyRate:0.0000001,variableRate:0}]};
 card._render();const cells=card.shadowRoot.querySelector('#recommendations-list tbody tr').children;
 assert.equal(Number(cells[2].textContent),0.0000001);
 }finally{dom.window.close();}
});

test('ordinary rerender preserves the selected tariff tab and visible content together',()=>{
 const {dom,card}=setup();try {
 card._render();card._render();
 assert.equal(card.shadowRoot.querySelector('[data-tab="recommendations"]').getAttribute('aria-selected'),'true');
 assert.equal(card.shadowRoot.querySelector('[data-tab="dashboard"]').getAttribute('aria-selected'),'false');
 assert.equal(card.shadowRoot.querySelector('.tab-content.active').id,'recommendations');
 }finally{dom.window.close();}
});
