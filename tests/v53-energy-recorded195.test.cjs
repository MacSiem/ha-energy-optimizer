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
 const tile=d.window.document.querySelectorAll('.k')[2];assert.match(tile.textContent,/Single price zone/);assert.doesNotMatch(tile.querySelector('.v').textContent,/No data|cheap/);assert.match(tile.querySelector('.n').textContent,/No cheap \/ expensive split/);
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
test('partial readings retain their exact producer precision in Data',()=>{
 const m=fixture();m.hourly=[{start:m.period.start,kwh:null,recorded_kwh:0.123456789012345,measured_sources:1,expected_sources:2}];
 const d=render(m);try{const tables=[...d.window.document.querySelectorAll('table')];const exact=tables.find(x=>x.caption?.textContent==='Exact values');assert.match(exact.textContent,/0\.123456789012345/);assert.match(d.window.document.querySelector('.c').title,/Known readings.*incomplete/);}finally{d.window.close();}
});
test('backend-qualified comparisons remain visible when unrelated current hours are incomplete',()=>{
 const m=fixture();m.coverage={complete:false,measured_hours:23,expected_hours:24};m.comparisons=[{key:'previous_day',kwh:20,delta_kwh:3,delta_pct:15,coverage_ok:true}];
 const d=render(m);try{assert.match(d.window.document.querySelector('.k .n').textContent,/3(?:\.0+)? kWh/);assert.doesNotMatch(d.window.document.querySelector('.k .n').textContent,/Insufficient|%/);}finally{d.window.close();}
});

test('the final flat tariff cannot hide measured historical cheap and expensive zones',()=>{
 const m=fixture();m.tariff.zones=[{id:'flat',label:'Current flat',rate:.5}];m.zones=[{id:'oldcheap',label:'Old cheap',classification:'cheap',kwh:12,share:.5},{id:'oldexp',label:'Old expensive',classification:'expensive',kwh:12,share:.5}];m.coverage.complete=true;
 const d=render(m);try{const tile=d.window.document.querySelectorAll('.k')[2];assert.match(tile.textContent,/50%/);assert.doesNotMatch(tile.textContent,/Single price zone|No cheap \/ expensive split/);}finally{d.window.close();}
});
test('a missing source with a real zero remains incomplete in a daily bar and Data',()=>{
 const m=fixture();m.period.kind='week';m.coverage={complete:false,measured_hours:23,expected_hours:24};m.daily=[{start:m.period.start,kwh:23,recorded_kwh:23,complete:false,partial:false,zones:[{id:'flat',kwh:23}]}];
 const d=render(m);try{const root=d.window.document;assert.ok(root.querySelector('[data-partial-reading]'));assert.match(root.querySelector('.c').title,/incomplete/);assert.match(root.querySelector('table').textContent,/Known readings/);}finally{d.window.close();}
});
test('household balance wording also covers a current short interval with all sources',()=>{
 const m=fixture();m.coverage={complete:false,measured_hours:23,expected_hours:24};m.hourly=[{start:m.period.start,kwh:.22,recorded_kwh:.22,partial:true,measured_sources:2,expected_sources:2}];
 const d=render(m);try{const root=d.window.document;assert.match(root.querySelector('.k .l').textContent,/Known source readings/);assert.doesNotMatch(root.body.textContent,/complete household hours/);}finally{d.window.close();}
});

test('partial KPI, named missing source, ranges and chart are visible in both languages and escaped',()=>{
 const m=fixture();m.coverage={status:'partial',complete:false,measured_hours:0,expected_hours:24,measured_source_hours:24,expected_source_hours:48,missing_sources:[{id:'b',name:'<script>B</script>',ranges:[{start:m.period.start,end:m.period.end}]}]};
 m.totals.import_kwh=null;m.totals.recorded_import_kwh=24;m.totals.recorded_usage_cost=12;m.hourly=[{start:m.period.start,kwh:null,recorded_kwh:1,measured_sources:1,expected_sources:2}];
 for(const lang of ['pl','en']){const d=new JSDOM(createEnergyBuild1ViewV53({format:createFormatUi(lang,'Europe/Warsaw'),language:lang}).markup(m));try{const doc=d.window.document;assert.match(doc.querySelector('.k .v').textContent,/24/);assert.match(doc.querySelector('.build1-panel').textContent,/24\/48/);assert.match(doc.querySelector('.build1-panel').textContent,/<script>B<\/script>/);assert.match(doc.querySelector('.build1-panel').textContent,/entire period|cały okres/);assert.equal(doc.querySelector('script'),null);assert.ok(doc.querySelector('[data-partial-reading]'));}finally{d.window.close();}}
});

test('grouped known readings remain visible and marked when a member is missing',()=>{
 const m=fixture();m.coverage={status:'partial',complete:false,measured_hours:0,expected_hours:24};m.totals.import_kwh=null;m.ranking=[{id:'_other_measured',name:'Other',color:'other',kwh:null,recorded_kwh:24,children:[]}];m.rooms=[{name:'Room',area_id:'a',kwh:null,recorded_kwh:24}];
 const v=createEnergyBuild1ViewV53({format:createFormatUi('en','UTC')});for(const group of ['devices','rooms']){const d=new JSDOM(v.markup(m,{section:'breakdown',group}));try{const text=d.window.document.querySelector('.rk2').textContent;assert.match(text,/24/);assert.match(text,/known readings/);}finally{d.window.close();}}
});

test('partial breakdown shows subtotal without a misleading composition bar and dates are localized',()=>{
 const m=fixture();m.coverage={status:'partial',complete:false,measured_hours:0,expected_hours:24,missing_sources:[{name:'Meter',ranges:[{start:'2026-10-25T02:00:00+02:00',end:'2026-10-25T02:00:00+01:00'}]}]};m.totals.import_kwh=null;m.totals.recorded_import_kwh=24;
 const v=createEnergyBuild1ViewV53({format:createFormatUi('en','Europe/Warsaw')});const d=new JSDOM(v.markup(m,{section:'breakdown'}));try{const doc=d.window.document;assert.match(doc.querySelector('.sec2 b').textContent,/Known source readings.*24/);assert.equal(doc.querySelector('.compbar'),null);assert.match(doc.querySelector('.notice').textContent,/GMT\+2.*GMT\+1/);assert.doesNotMatch(doc.querySelector('.notice').textContent,/2026-10-25T/);}finally{d.window.close();}
});

test('device-only data remains partial and the KPI labels the device instead of inventing grid import',()=>{
 const m=fixture();m.coverage={status:'partial',complete:false,measured_hours:0,expected_hours:24};m.totals.import_kwh=null;m.totals.recorded_import_kwh=null;m.devices=[{id:'a',name:'<img>',kwh:24}];
 const d=render(m);try{const k=d.window.document.querySelector('.k');assert.match(k.textContent,/Device: <img>/);assert.match(k.textContent,/24/);assert.equal(k.querySelector('img'),null);}finally{d.window.close();}
});
