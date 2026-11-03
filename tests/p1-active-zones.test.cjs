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
