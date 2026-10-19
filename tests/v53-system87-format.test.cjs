"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),vm=require('node:vm');
const {systemIntl}=require('./helpers/system-intl-fixture.cjs');
const code=readFileSync('shared/ha-tools-format.js','utf8');
const instant='2026-10-10T18:00:00Z';
function fixture(system='en-US',browser='en-GB') {
 let region=system;
 const factory=vm.runInNewContext(code+';createFormatUi',
   {Intl:systemIntl(()=>region),navigator:{language:browser}});
 const hass={language:'pl',locale:{language:'pl',time_zone:'server',time_format:'system',date_format:'system'},config:{time_zone:'UTC'}};
 return {factory,hass,setRegion(value){region=value;}};
}
for(const [system,browser,hourCycle] of [['en-US','en-GB','h12'],['en-GB','en-US','h23']]) {
 test('system clock/date use default Intl region '+system+' despite navigator '+browser,()=>{
  const f=fixture(system,browser),before=JSON.stringify(f.hass),ui=f.factory.forHass(f.hass);
  assert.equal(ui.language,'pl');assert.equal(ui.dateLanguage,system);assert.equal(ui.clockLanguage,system);assert.equal(ui.hourCycle,hourCycle);
  const clockOptions={timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle};
  assert.equal(ui.clock(instant),new Intl.DateTimeFormat(system,clockOptions).format(Date.parse(instant)));
  assert.equal(ui.dateTime(instant),new Intl.DateTimeFormat(system,{timeZone:'UTC',dateStyle:'medium',timeStyle:'short',hourCycle}).format(Date.parse(instant)));
  assert.equal(ui.calendarDate('2026-10-10'),new Intl.DateTimeFormat(system,{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'}).format(Date.parse('2026-10-10T00:00:00Z')));
  assert.equal(ui.number('1234.5'),new Intl.NumberFormat('pl',{maximumFractionDigits:100}).format('1234.5'));
  assert.equal(JSON.stringify(f.hass),before,'preferences and source calendar remain untouched');
 });
}
test('explicit 12/24 and Auto stay bound to the UI language independently of system region',()=>{
 const f=fixture();
 for(const [choice,hourCycle] of [['12','h12'],['24','h23'],['language',new Intl.DateTimeFormat('pl',{hour:'numeric'}).resolvedOptions().hourCycle]]) {
  f.hass.locale.time_format=choice;f.hass.locale.date_format='language';
  const ui=f.factory.forHass(f.hass);assert.equal(ui.hourCycle,hourCycle);assert.equal(ui.clockLanguage,'pl');assert.equal(ui.dateLanguage,'pl');
  assert.equal(ui.clock(instant),new Intl.DateTimeFormat('pl',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle}).format(Date.parse(instant)));
  assert.match(ui.calendarDate('2026-10-10'),/10 paź 2026/);
 }
});
test('date and clock preferences remain independent; compact axis keeps intentional 24-hour notation',()=>{
 const f=fixture();f.hass.locale.date_format='language';
 const ui=f.factory.forHass(f.hass);assert.equal(ui.dateLanguage,'pl');assert.equal(ui.clockLanguage,'en-US');assert.equal(ui.hourCycle,'h12');
 assert.match(ui.dateTime(instant),/10 paź 2026/);assert.match(ui.clock(instant),/PM/);
 const stamps=[Date.parse(instant),Date.parse(instant)+3600000];
 assert.equal(ui.chartTicks(stamps)[0].label,'18');
 f.hass.locale.date_format='system';f.hass.locale.time_format='24';
 const other=f.factory.forHass(f.hass);assert.equal(other.dateLanguage,'en-US');assert.equal(other.clockLanguage,'pl');assert.equal(other.clock(instant),'18:00');
});
test('system clock-region change changes presentation key even when hour cycle is unchanged',()=>{
 const f=fixture();f.hass.locale.date_format='language';const first=f.factory.forHass(f.hass);
 f.setRegion('en-CA');const next=f.factory.forHass(f.hass);
 assert.equal(first.hourCycle,next.hourCycle);assert.equal(first.dateLanguage,next.dateLanguage);assert.notEqual(first.key,next.key);
});
test('range, absolute details and literal calendar day preserve their boundaries',()=>{
 const f=fixture(),ui=f.factory.forHass(f.hass),from='2026-10-10T00:00:00Z',to='2026-10-10T18:00:00Z';
 const day=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',dateStyle:'medium'}).format(Date.parse(from));
 const clock=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',hour:'2-digit',minute:'2-digit',hourCycle:'h12'});
 assert.equal(ui.range(from,to),`${day} (${clock.format(Date.parse(from))}–${clock.format(Date.parse(to))})`);
 const markup=ui.periodMarkup({start:from,end:to,label:'Dzień',source:'Recorder',measured:18,expected:18,unit:'h',sourceTimeZone:'Europe/Warsaw'});
 assert.ok(markup.includes('UTC: '+from+' — '+to));assert.ok(markup.includes('Europe/Warsaw'));assert.ok(markup.includes('Źródło i szczegóły czasu'));
 assert.equal(ui.calendarDate('2026-02-30'),null);
 const west=f.factory('pl','America/Los_Angeles',{dateLanguage:'en-US',clockLanguage:'en-US',hourCycle:'h12'});
 assert.equal(west.calendarDate('2026-10-10'),ui.calendarDate('2026-10-10'),'literal tariff dates never shift by display timezone');
});
