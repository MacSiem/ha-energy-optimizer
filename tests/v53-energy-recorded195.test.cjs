'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {readFileSync}=require('node:fs');
const {createEnergyBuild1ViewV53}=require('../shared/ha-tools-energy-build1-view.js');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const fixture=()=>JSON.parse(readFileSync(require('node:path').join(__dirname,'fixtures/build1/golden-energy-2026-10-17.json'),'utf8')).model;
const render=m=>new JSDOM(createEnergyBuild1ViewV53({format:createFormatUi('en','Europe/Warsaw')}).markup(m));
test('known energy without a price classification is visible in the consumption color',()=>{
 const m=fixture();m.zones=[{id:'flat',label:'Single zone',kwh:24,share:1}];m.tariff.zones=[{id:'flat',label:'Single zone',rate:.5}];m.hourly=[{start:m.period.start,kwh:1,zone:'flat'}];
 const d=render(m);try{const bar=d.window.document.querySelector('.chart-stack i');assert.match(bar.getAttribute('style'),/var\(--hat-primary\)/);assert.doesNotMatch(bar.getAttribute('style'),/hat-zone-cheap|hat-zone-exp|hat-text-3/);
 assert.match(d.window.document.querySelectorAll('.k')[2].textContent,/Single price zone/);assert.doesNotMatch(d.window.document.querySelectorAll('.k')[2].textContent,/No data|cheap/);
 }finally{d.window.close();}
});
test('partial source readings appear with their own label and hatch while the qualified balance remains separate',()=>{
 const m=fixture();m.coverage={complete:false,measured_hours:23,expected_hours:24};m.totals.import_kwh=23;m.totals.recorded_import_kwh=23.4;
 m.hourly=[{start:m.period.start,kwh:null,recorded_kwh:.4,measured_sources:1,expected_sources:2,zone:null},{start:m.period.end,kwh:null,recorded_kwh:null}];
 const d=render(m);try{const root=d.window.document;assert.match(root.querySelector('.build1-panel').textContent,/Known source readings/);assert.match(root.querySelector('.build1-panel').textContent,/23\.4/);
 const bars=[...root.querySelectorAll('.chart-stack')];assert.ok(bars[0].querySelector('[data-partial-reading]'));assert.match(bars[0].querySelector('i').getAttribute('style'),/height:100%/);assert.equal(bars[1].querySelector('i'),null);
 assert.match(root.querySelector('table').textContent,/Known readings/);
 }finally{d.window.close();}
});
test('largest current consumers use actual device readings, independent of stable color qualification',()=>{
 const m=fixture();m.devices=[{id:'new',name:'New current leader',kwh:99},{id:'old',name:'Old leader',kwh:1}];m.ranking=[{id:'old',name:'Old leader',kwh:1,color:'d1'},{id:'_other_measured',color:'other',children:[m.devices[0]],kwh:99}];
 const d=render(m);try{const panel=d.window.document.querySelector('.two');assert.match(panel.textContent,/New current leader/);assert.ok(panel.textContent.indexOf('New current leader')<panel.textContent.indexOf('Old leader'));}finally{d.window.close();}
});
test('backend-qualified comparisons remain visible when unrelated current hours are incomplete',()=>{
 const m=fixture();m.coverage={complete:false,measured_hours:23,expected_hours:24};m.comparisons=[{key:'previous_day',kwh:20,delta_kwh:3,delta_pct:15,coverage_ok:true}];
 const d=render(m);try{assert.match(d.window.document.querySelector('.k .n').textContent,/3(?:\.0+)? kWh/);assert.doesNotMatch(d.window.document.querySelector('.k .n').textContent,/Insufficient|%/);}finally{d.window.close();}
});
