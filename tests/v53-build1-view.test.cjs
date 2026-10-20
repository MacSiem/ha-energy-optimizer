'use strict';
// Copy to canonical tests/ alongside the new shared module, then use the owner FIFO lane.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createEnergyBuild1ViewV53}=require('../shared/ha-tools-energy-build1-view.js');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const golden=JSON.parse(readFileSync(require('node:path').join(__dirname,'fixtures/build1/golden-energy-2026-10-17.json'),'utf8'));
const fixture=()=>structuredClone(golden.model||golden);
const view=language=>createEnergyBuild1ViewV53({format:createFormatUi(language,'Europe/Warsaw'),language});
for(const language of ['pl','en'])test(`all four Build1 sections render supplied facts without mutation (${language})`,()=>{
 const m=fixture(),before=JSON.stringify(m),v=view(language);
 for(const section of ['overview','breakdown','costs','reports']){
  const html=v.markup(m,{section});
  assert.ok(html.includes(`data-energy-build1-section="${section}"`));
  assert.ok(html.includes('data-energy-build1="period"'));
  assert.ok(html.includes('data-energy-build1="section"'));
  assert.ok(!html.includes('NaN'));
 }
 const costs=v.markup(m,{section:'costs'}),format=createFormatUi(language);
 assert.ok(costs.includes(format.reportMoney(m.totals.total_with_fixed,m.currency)));
 assert.equal(JSON.stringify(m),before);
});
test('partial coverage suppresses comparison and allocation percentages',()=>{
 const m=fixture();m.coverage.complete=false;m.coverage.measured_hours=8;
 const v=view('en'),overview=v.markup(m),breakdown=v.markup(m,{section:'breakdown'});
 assert.match(overview,/Incomplete data/);assert.match(overview,/Insufficient coverage/);
 assert.doesNotMatch(breakdown,/<div class="p">[^<]*[0-9]%/);
 assert.match(breakdown,/<div class="p">—<\/div>/);
});
test('double counting replaces unmeasured facts in every grouping',()=>{
 const m=fixture();m.unmeasured.status='double_counting';m.ranking.find(r=>r.id==='_unmeasured').kwh=-1234.56;
 m.rooms.find(r=>r.area_id==='_unmeasured').kwh=-1234.56;
 for(const group of ['devices','rooms']){
  const html=view('en').markup(m,{section:'breakdown',group});
  assert.match(html,/Device total exceeds import/);assert.doesNotMatch(html,/1,234\.56/);
 }
});
test('null readings remain unknown, zero is a genuine reading, exact Data stays exact',()=>{
 const m=fixture();m.hourly[0].kwh=null;m.hourly[1].kwh=0;m.hourly[2].kwh='49.999999999999545';
 const html=view('en').markup(m);
 assert.match(html,/No data/);assert.match(html,/0\.00 kWh/);assert.match(html,/49\.999999999999545/);
});
test('groups show backend rooms, floors and included children without summing',()=>{
 const m=fixture(),v=view('en');
 assert.ok(v.markup(m,{section:'breakdown'}).includes(m.devices[0].children[0].name));
 for(const group of ['rooms','floors'])assert.ok(v.markup(m,{section:'breakdown',group}).includes(m[group][0].name));
 m.totals.total_with_fixed='999.12';m.totals.energy_cost='3.21';
 assert.match(v.markup(m,{section:'costs'}),/999\.12 PLN/);
});
test('Reports never invent schedules, preview HTML or delivered history',()=>{
 const html=view('en').markup(fixture(),{section:'reports',previewText:'<script>bad()</script>'});
 assert.match(html,/No schedules supplied/);assert.match(html,/No delivery history supplied/);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.doesNotMatch(html,/Delivered/);assert.match(html,/data-energy-build1="send-now"[^>]*disabled/);
});
test('Reports renders only supplied delivery statuses and emits inert actions',()=>{
 const html=view('pl').markup(fixture(),{section:'reports',canManageReports:true,schedules:[{id:'a"<',name:'Plan',enabled:true,time:'08:15',cadence:'daily',channel:'HA'}],deliveries:[{id:'failed',at:'2026-10-18T08:15:00+02:00',status:'failed',channel:'SMTP'}]});
 assert.match(html,/08:15/);assert.match(html,/Błąd/);assert.match(html,/delivery-retry/);assert.match(html,/a&quot;&lt;/);
 assert.doesNotMatch(html,/dostarczone|onclick|callService|callWS/i);
});
test('current snapshot is explicit and now marker uses supplied timestamps',()=>{
 const m=fixture(),v=view('en');
 assert.doesNotMatch(v.markup(m),/class="now"/);
 assert.match(v.markup(m,{current:{label:'Live zone',rate:'0.42',as_of:'2026-10-17T12:00:00+02:00'}}),/class="now"/);
 assert.match(v.markup(m,{current:{label:'Live zone'}}),/Live zone/);
});
test('invalid schema, missing meter and loading state do not display fictional totals',()=>{
 const v=view('en'),m=fixture();
 assert.match(v.markup(null),/Energy report unavailable/);
 m.issues=[{code:'no_grid_meter'}];assert.match(v.markup(m),/not configured/);
 assert.match(v.markup(m,{loading:true}),/aria-busy="true"/);
});
test('styles preserve Build1 sizing, container stacking and theme tokens',()=>{
 const css=view('en').styles();
 for(const text of ['height:120px','height:14px','@container(max-width:520px)','--hat-zone-cheap','--primary-text-color','grid-template-columns:repeat(2','hat-dark'])assert.ok(css.includes(text),text);
});
