"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{JSDOM}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const {createEnergyAnalysisViewV53}=require('../shared/ha-tools-energy-analysis-view.js');
const actual=JSON.parse(readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
for(const lang of ['en','pl'])test('native Recorder precision is readable in '+lang+' with exact details and Data',()=>{
 const dto=structuredClone(actual);dto.groups.areas.office.kwh=dto.groups.areas.office.recorded_kwh='49.999999999999545';dto.groups.unmeasured.kwh=dto.groups.unmeasured.recorded_kwh='200.000000000000455';
 const original=JSON.stringify(dto),format=createFormatUi(lang,'Europe/Warsaw');
 const view=createEnergyAnalysisViewV53({card:{_hass:{locale:{language:lang}}},format});
 for(const section of ['overview','rates']){
  const dom=new JSDOM(view.markup(dto,{section})),root=dom.window.document.body;
  try{
   const shown=root.cloneNode(true);shown.querySelectorAll('details').forEach(n=>n.remove());
   assert.doesNotMatch(shown.textContent,/999999|000000000000/);
   assert.match(shown.textContent,/50 kWh/);assert.match(shown.textContent,/200 kWh/);
   const exact=format.number('49.999999999999545');
   assert.ok(root.querySelector('details')&&[...root.querySelectorAll('details')].some(n=>n.textContent.includes(exact)),'full precision stays in discoverable details');
  }finally{dom.window.close();}
  const data=new JSDOM(view.markup(dto,{section,view:'data'}));try{assert.ok(data.window.document.body.textContent.includes(format.number('49.999999999999545')));}finally{data.window.close();}
 }
 assert.equal(JSON.stringify(dto),original,'display never changes measured or priced values');
});
