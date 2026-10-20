'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{JSDOM}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const {createEnergyAnalysisViewV53}=require('../shared/ha-tools-energy-analysis-view.js');
const actual=JSON.parse(readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
function render(dto,language,view='chart'){
 const format=createFormatUi(language,'Europe/Warsaw');
 return new JSDOM(createEnergyAnalysisViewV53({card:{_hass:{locale:{language}}},format}).markup(dto,{section:'overview',view}));
}
for(const language of ['pl','en'])test(`summary uses short localized numbers while Data preserves measurements in ${language}`,()=>{
 const dto=structuredClone(actual);dto.totals.kwh='1234.56789';dto.totals.total_cost='12345.6789';
 const before=JSON.stringify(dto),format=createFormatUi(language,'Europe/Warsaw'),d=render(dto,language);
 try{
  const tiles=d.window.document.querySelectorAll('.analysis-tile-primary strong');
  assert.equal(tiles[0].textContent,format.number(dto.totals.kwh,{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh');
  assert.equal(tiles[1].textContent,format.number(dto.totals.total_cost,{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR');
 }finally{d.window.close();}
 const data=render(dto,language,'data');try{assert.ok(data.window.document.body.textContent.includes(format.number(dto.totals.kwh)));}finally{data.window.close();}
 const share=render(actual,language);try{assert.equal(share.window.document.querySelector('[data-analysis-cheap-share] strong').textContent,'23%');}finally{share.window.close();}
 assert.equal(JSON.stringify(dto),before);
});
test('tiny nonzero summary values are bounded instead of displayed as measured zero',()=>{
 const dto=structuredClone(actual);dto.totals.kwh='0.0000000001';dto.totals.total_cost='-0.0000000001';
 const d=render(dto,'en');try{const tiles=d.window.document.querySelectorAll('.analysis-tile-primary strong');assert.equal(tiles[0].textContent,'<0.1 kWh');assert.equal(tiles[1].textContent,'>−0.01 EUR');}finally{d.window.close();}
 dto.totals.kwh='0';dto.totals.total_cost='0';const z=render(dto,'en');try{const tiles=z.window.document.querySelectorAll('.analysis-tile-primary strong');assert.equal(tiles[0].textContent,'0.0 kWh');assert.equal(tiles[1].textContent,'0.00 EUR');}finally{z.window.close();}
});
