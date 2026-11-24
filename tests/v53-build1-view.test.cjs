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
test('partial coverage retains producer comparison and suppresses unsupported allocation percentages',()=>{
 const m=fixture();m.coverage.complete=false;m.coverage.measured_hours=8;
 const v=view('en'),overview=v.markup(m),breakdown=v.markup(m,{section:'breakdown'});
 assert.match(overview,/Data details/);assert.doesNotMatch(overview,/Insufficient coverage/);
 assert.doesNotMatch(breakdown,/<div class="p">[^<]*[0-9]%/);
 assert.doesNotMatch(breakdown,/<div class="p">/);
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
 m.issues=[{code:'no_grid_meter'}];assert.match(v.markup(m),/Grid meter unavailable/);assert.match(v.markup(m),/data-energy-build1-series/);
 assert.match(v.markup(m,{loading:true}),/aria-busy="true"/);
});
test('styles preserve Build1 sizing, container stacking and theme tokens',()=>{
 const css=view('en').styles();
 for(const text of ['height:120px','height:14px','@container(max-width:520px)','--hat-zone-cheap','--primary-text-color','grid-template-columns:repeat(2','hat-dark'])assert.ok(css.includes(text),text);
});

test('unconfigured Energy grid offers setup in both languages',()=>{
 for(const lang of ['pl','en']){const html=view(lang).markup(null,{notConfigured:true});assert.match(html,lang==='pl'?/Panel Energia nie jest skonfigurowany/:/Energy dashboard is not configured/);assert.match(html,/data-energy-build1="configure-energy"/);assert.doesNotMatch(html,/Energy report unavailable/);}
});

for(const language of ['pl','en'])test(`partial coverage preserves known readings and deduplicates sources (${language})`,()=>{
 const m=fixture();m.coverage.complete=false;m.coverage.measured_source_hours=419.25;m.coverage.expected_source_hours=429;
 m.coverage.missing_sources=[{id:'sensor.a',name:'K1',ranges:[]}];m.coverage.missing_devices=[{id:'sensor.a',name:'K1',ranges:[]}];
 m.hourly[0]={...m.hourly[0],kwh:null,recorded_kwh:0,complete:false};
 m.hourly[1]={...m.hourly[1],kwh:null,recorded_kwh:1,complete:true};
 const v=view(language),html=v.markup(m);
 assert.equal((html.match(/K1/g)||[]).length,1);assert.doesNotMatch(html,/419[.,]25|source-hours|źródło-godzin/);
 assert.doesNotMatch(html,/data-partial-reading/);assert.match(html,/0[,.]00 kWh/);
 const breakdown=v.markup(m,{section:'breakdown'});assert.doesNotMatch(breakdown,/<div class="p">/);
});

test('new producer known totals and full-hour evidence preserve partial costs without hatching',()=>{
 const m=fixture();m.coverage.complete=false;m.hourly[0]={...m.hourly[0],kwh:'2',recorded_kwh:'2',full_kwh:null,future:false};
 m.totals.usage_cost='12.34';m.totals.recorded_usage_cost=null;m.totals.total_with_fixed='15.67';
 const v=view('en'),overview=v.markup(m),costs=v.markup(m,{section:'costs'});
 assert.match(overview,/12\.34 PLN/);assert.doesNotMatch(overview,/data-partial-reading/);
 assert.match(costs,/15\.67 PLN/);assert.match(costs,/Costs cover known source readings/);
});

for(const language of ['pl','en'])test(`known usage and fixed fees remain separate in the active report (${language})`,()=>{
 const m=fixture();m.coverage.complete=false;m.hourly[0].full_kwh=null;m.totals.usage_cost=12.34;m.totals.fixed_share=1.25;m.totals.total_with_fixed=13.59;
 const v=view(language),overview=v.markup(m),costs=v.markup(m,{section:'costs'});
 assert.match(overview,/12[,.]34/);assert.match(overview,language==='pl'?/Koszt znanych odczytów/:/Known readings cost/);
 assert.match(costs,/12[,.]34/);assert.match(costs,/1[,.]25/);assert.match(costs,/13[,.]59/);assert.match(costs,language==='pl'?/Znane odczyty z opłatami stałymi/:/Known readings plus fixed charges/);
});

for(const language of ['pl','en'])test(`diagnostics keep all sections and tables stable (${language})`,()=>{
 const m=fixture(),v=view(language);m.coverage={...m.coverage,complete:true,measured_sources:44,expected_sources:44,missing_sources:[],missing_devices:[]};
 for(const section of ['overview','breakdown','costs','reports'])assert.doesNotMatch(v.markup(m,{section,reportAccess:true}),/data-energy-missing/);
 m.coverage.complete=false;m.coverage.measured_sources=43;m.coverage.missing_sources=[{id:'sensor.grid',name:'Grid',ranges:[{start:m.period.start,end:m.period.end}]}];m.configuration_facts={grid_is_devices:true};
 m.hourly[0]={...m.hourly[0],kwh:null,recorded_kwh:0,complete:false};m.comparisons=[{key:'previous_day',coverage_ok:false,comparison_scope:'common_measurements'}];
 for(const section of ['overview','breakdown','costs','reports']){const html=v.markup(m,{section,reportAccess:true});assert.equal((html.match(/data-energy-missing/g)||[]).length,1);assert.match(html,/43\/44/);assert.match(html,/Grid/);assert.doesNotMatch(html,/44\/44|data-partial-reading/);}
 const html=v.markup(m);assert.match(html,/0[,.]00 kWh/);assert.match(html,/Insufficient coverage|Za mało danych/);assert.doesNotMatch(html,/<th scope="col">Known readings|<th scope="col">Znane odczyty/);assert.match(v.styles(),/@container\(max-width:520px\)/);
});

for(const language of ['pl','en'])test(`partial tariff facts, matched comparison and data details (${language})`,()=>{
 const m=fixture();m.coverage.complete=false;m.zones=[{id:'cheap',classification:'cheap',kwh:3,share:0.6}];m.tariff.zones=[{id:'cheap',classification:'cheap'}];m.totals.effective_rate=0.5;
 m.comparisons=[{key:'previous_day',coverage_ok:true,delta_kwh:1,delta_pct:25,comparison_scope:'common_measurements',compared_current_kwh:5,compared_baseline_kwh:4,matched_coverage:{common_current:1}}];
 m.unmeasured.status='double_counting';const html=view(language).markup(m);assert.match(html,/60%/);assert.match(html,/25%/);assert.match(html,/0[,.]50/);assert.doesNotMatch(html,/Current coverage|Pokrycie bieżące|>100%/);assert.equal((html.match(/data-energy-missing/g)||[]).length,1);assert.doesNotMatch(html,/role="alert"/);assert.ok(html.indexOf('data-energy-missing')>html.indexOf('data-energy-build1-series'));assert.match(html,language==='pl'?/Szczegóły danych/:/Data details/);
});
test('daily bars use zone segments only when they cover the recorded total',()=>{
 const m=fixture();m.period.kind='week';m.daily=[{start:m.period.start,kwh:10,recorded_kwh:10,zones:[{id:'cheap',kwh:4},{id:'exp',kwh:3}]}];m.zones=[{id:'cheap',classification:'cheap'},{id:'exp',classification:'expensive'}];
 const bars=html=>html.match(/<span class="chart-stack">(.*?)<\/span>/)[1];let html=view('en').markup(m);assert.equal((bars(html).match(/<i /g)||[]).length,1);assert.match(bars(html),/height:100%/);assert.match(bars(html),/--hat-primary/);
 m.daily[0].zones[1].kwh=6;html=view('en').markup(m);assert.equal((bars(html).match(/<i /g)||[]).length,2);assert.match(bars(html),/--hat-zone-cheap/);assert.match(bars(html),/--hat-zone-exp/);
});
