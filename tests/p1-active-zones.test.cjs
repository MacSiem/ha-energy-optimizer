'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createEnergyBuild1ViewV53}=require('../shared/ha-tools-energy-build1-view.js');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const model=JSON.parse(readFileSync('tests/fixtures/build1/golden-energy-2026-10-17.json')).model;
for(const [lang,label] of [['en','All-day'],['pl','Całodobowa']]) test(`active Build1 flat zones ${lang}`,()=>{
 const m=structuredClone(model);m.tariff={...m.tariff,defaultZone:'flat',rules:[],exceptions:[],zones:[{id:'flat',energyRate:.5,rate:.5,hours_label:'0–24'}]};
 m.zones=[{id:'flat',label:'flat',kwh:2,share:1}];m.hourly=[{...m.hourly[0],zone:'flat'}];
 const v=createEnergyBuild1ViewV53({format:createFormatUi(lang,'Europe/Warsaw'),language:lang});
 for(const section of ['overview','costs']){const html=v.markup(m,{section,current:{label:'flat'}});assert.doesNotMatch(html,/>flat</);assert.ok(html.includes(label));if(section==='costs')assert.match(html,/00:00–24:00/);}
 m.period.kind='week';m.daily=[{start:'2026-10-26T00:00:00Z',kwh:2,zones:[{id:'flat',kwh:2}]}];
 assert.doesNotMatch(v.markup(m),/>flat[:<]/);
});
for(const [lang,word] of [['en','Components unknown'],['pl','Składniki nieznane']]) test(`legacy combined rate is not a fabricated split ${lang}`,()=>{
 const m=structuredClone(model);m.tariff={...m.tariff,rateSemantics:'legacy_combined',defaultZone:'flat',rules:[],zones:[{id:'flat',energy_rate:.5,variable_rate:0,rate:.5}]};
 const v=createEnergyBuild1ViewV53({format:createFormatUi(lang),language:lang}); const html=v.markup(m,{section:'costs'});
 assert.ok(html.includes(word)); assert.doesNotMatch(html,/0[.,]50[^<]*\+[^<]*0[.,]00/);
});
for(const [lang,matched,short,note] of [['en','Matched hours','Reading hours:','Hours do not distinguish dates'],['pl','Wspólne godziny','Godziny pomiarów:','Godziny nie rozróżniają dat']]) test(`matched comparison and concise hours ${lang}`,()=>{
 const m=structuredClone(model);m.tariff={...m.tariff,defaultZone:'flat',rules:[],zones:[{id:'flat',rate:.5,hours_label:'0–24'}]};
 m.comparisons=[{key:'previous_day',coverage_ok:true,kwh:119,compared_current_kwh:69,compared_baseline_kwh:119,delta_kwh:-50,delta_pct:-42.0168,comparison_scope:'common_measurements'}];
 const v=createEnergyBuild1ViewV53({format:createFormatUi(lang),language:lang});const overview=v.markup(m), costs=v.markup(m,{section:'costs'});
 assert.ok(overview.includes(matched));assert.ok(costs.includes(short));assert.ok(costs.includes(note));assert.equal(costs.split(note).length-1,1);
});
test('canonical fixed labels localize while custom names remain literal',()=>{
 const m=structuredClone(model);m.tariff.fixed=['subscription','capacity','distribution','other'].map(id=>({id,label:id,monthly:1}));m.tariff.fixed.push({id:'subscription',label:'My custom name',monthly:1});
 const pl=createEnergyBuild1ViewV53({format:createFormatUi('pl'),language:'pl'}).markup(m,{section:'costs'});
 assert.ok(pl.includes('Abonament'));assert.ok(pl.includes('Opłata mocowa'));assert.ok(pl.includes('My custom name'));assert.doesNotMatch(pl,/>subscription</);
 m.tariff.fixedFeeSemantics='legacy_combined';m.tariff.fixed=[{id:'fixed',label:'opłaty stałe',monthly:31}];
 const en=createEnergyBuild1ViewV53({format:createFormatUi('en'),language:'en'}).markup(m,{section:'costs'});
 assert.doesNotMatch(en,/>opłaty stałe</);assert.ok(en.includes('Fixed charges'));
});
for(const [lang,label] of [['en','Full periods'],['pl','Pełne okresy']]) test(`complete calendar comparison is labeled ${lang}`,()=>{
 const m=structuredClone(model);m.comparisons=[{key:'previous_day',coverage_ok:true,kwh:48,delta_kwh:-25,delta_pct:-52,comparison_scope:'calendar_totals'}];
 const v=createEnergyBuild1ViewV53({format:createFormatUi(lang),language:lang});const html=v.markup(m);
 assert.ok(html.includes(label));assert.doesNotMatch(html,/Same measurement window|Ten sam zakres pomiaru/);
});
test('a qualified duration-weighted common comparison is not hidden by hour counts',()=>{
 const m=structuredClone(model);m.coverage={...m.coverage,complete:false,measured_hours:5,expected_hours:6};
 m.comparisons=[{key:'previous_day',coverage_ok:true,kwh:10,compared_current_kwh:5,compared_baseline_kwh:10,delta_kwh:-5,delta_pct:-50,comparison_scope:'common_measurements'}];
 const v=createEnergyBuild1ViewV53({format:createFormatUi('en'),language:'en'}),html=v.markup(m);
 assert.match(html,/−50/);assert.doesNotMatch(html,/Insufficient coverage for comparison/);
});
