'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{readFileSync}=require('node:fs');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const golden=JSON.parse(readFileSync('tests/fixtures/build1/golden-energy-2026-10-17.json','utf8'));
for(const [value,places,expected] of golden.format_cases)test(`Build1 supplied display number ${value}/${places}`,()=>{
 assert.equal(createFormatUi('pl','Europe/Warsaw').reportNumber(value,places),expected);
});
for(const [value,expected] of golden.plural_cases)test(`Build1 supplied Polish plural ${value}`,()=>{
 assert.equal(createFormatUi('pl').reportPlural(value,{one:'błąd',few:'błędy',many:'błędów'}),expected);
});
for(const language of ['pl','en'])test(`Build1 explicit numeric roles preserve raw facts (${language})`,()=>{
 const f=createFormatUi(language),decimal=language==='pl'?',':'.',currency=language==='pl'?'zł':'PLN',before=JSON.stringify(golden);
 assert.equal(f.reportEnergy('18.77'),'18'+decimal+'8 kWh');
 assert.equal(f.reportEnergy('18.77',{role:'table',period:'day'}),'18'+decimal+'77 kWh');
 assert.equal(f.reportEnergy('18.77',{role:'table',period:'month'}),'18'+decimal+'8 kWh');
 assert.equal(f.reportMoney('15.6566','PLN'),'15'+decimal+'66 '+currency);
 assert.equal(f.reportRate('0.83413425679','PLN'),'0'+decimal+'83 '+currency+'/kWh');
 assert.equal(f.reportPercent('33.0847',{role:'share'}),'33%');
 assert.equal(f.reportPercent('6.6477',{role:'change'}),'+6'+decimal+'6%');
 assert.equal(f.reportPercent('-6.6477',{role:'change'}),'−6'+decimal+'6%');
 assert.equal(JSON.stringify(golden),before);
 const raw='49.999999999999545';assert.equal(f.reportNumber(raw,2),'50'+decimal+'00');assert.ok(f.number(raw).includes(language==='pl'?'999999':'999999'),'ordinary Data formatter remains exact');
 assert.equal(f.reportNumber('-7.225',2),'−7'+decimal+'23');
});
