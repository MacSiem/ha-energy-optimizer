"use strict";
// Actual producer DTO is immutable. Mutations below deliberately invalidate evidence.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),{join}=require('node:path'),{JSDOM}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const {createEnergyAnalysisViewV53}=require('../shared/ha-tools-energy-analysis-view.js');
const actual=JSON.parse(readFileSync(join(__dirname,'fixtures/analysis-wholeperiod-v53.json'),'utf8'));
const fixture=()=>JSON.parse(JSON.stringify(actual));
function use(dto,fn,{level='areas',language='en',view='chart'}={}){
 const ui=createFormatUi(language,'Europe/Warsaw'),renderer=createEnergyAnalysisViewV53({card:{_hass:{locale:{language}}},format:ui});
 const dom=new JSDOM(renderer.markup(dto,{level,view}));try{fn(dom.window.document.body,renderer,ui);}finally{dom.window.close();}
}
const q=(r,s)=>{const n=r.querySelector(s);assert.ok(n,s);return n;};
test('actual producer: proportional two-sided Sankey, mobile bars and direct legends share authoritative facts',()=>{
 for(const level of ['areas','floors','devices'])for(const language of ['en','pl'])use(fixture(),(r,v,ui)=>{
  const svg=q(r,'[data-analysis-sankey]');assert.equal(svg.tagName.toLowerCase(),'svg');assert.equal(svg.getAttribute('aria-hidden'),'true');
  assert.equal(svg.querySelectorAll('[data-analysis-flow-side="source"]').length,2);
  assert.equal(svg.querySelectorAll('[data-analysis-flow-side="destination"]').length,2,'zero group remains in ranking, never a fake minimum-width ribbon');
  const bars=r.querySelectorAll('[data-analysis-composition]');assert.equal(bars.length,2);assert.equal(bars[0].querySelectorAll('[data-analysis-segment]').length,2);assert.equal(bars[1].querySelectorAll('[data-analysis-segment]').length,2);
  const un=q(r,'[data-analysis-rank-id="unmeasured"]');assert.ok(un.textContent.includes(ui.number('200',{minimumFractionDigits:1,maximumFractionDigits:1})+' kWh'));assert.ok(un.textContent.includes(ui.number('196.8',{minimumFractionDigits:2,maximumFractionDigits:2})+' EUR'));assert.ok(un.textContent.includes('80%'));assert.ok(un.classList.contains('analysis-unmeasured'));
  assert.ok(svg.querySelector('[data-analysis-flow-id="unmeasured"] path').getAttribute('fill').includes('url('));
  const group=q(r,'[data-analysis-groups]');assert.match(group.textContent,/import|Import/);assert.match(group.textContent,/Household|Dom/);assert.match(group.textContent,/246|211.2/);assert.doesNotMatch(q(r,'[data-analysis-ranking]').textContent,/247(?:[.,]00)? EUR|fixed_cost|parent_residual/);
  assert.match(v.styles(),/@container energy-analysis \(max-width:600px\)/);assert.match(v.styles(),/\.analysis-sankey\{display:none\}/);assert.match(v.styles(),/font-size:14px/);assert.match(v.styles(),/font-size:12px/);
 },{level,language});
});
test('exact server zone identity colors single-zone columns and keyed direct legends; point controls retain mapping',()=>use(fixture(),r=>{
 const points=[...r.querySelectorAll('.analysis-point')];assert.equal(points.length,actual.chart.bins.length);
 assert.deepEqual(points.map(p=>p.dataset.analysisValue),actual.chart.bins.map((_,i)=>String(i)));
 const a=q(points[0],'[data-analysis-column-zone]'),b=q(points[8],'[data-analysis-column-zone]');assert.notEqual(a.getAttribute('style'),b.getAttribute('style'));
 assert.equal(a.dataset.analysisColumnZone,'a|low');assert.match(a.getAttribute('style'),/cheap/);assert.match(b.getAttribute('style'),/expensive/);
 assert.ok(points.every(p=>p.tagName==='BUTTON'&&p.getAttribute('aria-label').includes('kWh')));
 const legend=q(r,'[data-analysis-chart-zones]');assert.match(legend.textContent,/Noc/);assert.match(legend.textContent,/Dzień/);
}));
for(const mutation of [
 d=>d.chart.bins[0].zone_breakdown.status='partial',
 d=>d.chart.bins[0].zone_breakdown.zones.push({...d.chart.bins[0].zone_breakdown.zones[0],zone_id:'high',label:'Dzień'}),
 d=>d.chart.bins[0].zone_breakdown.zones[0].kwh='999',
 d=>d.chart.bins[0].zone_breakdown.zones[0].tariff_id='other',
 d=>d.chart.bins[0].zone_breakdown.unattributed.recorded_kwh='1',
 d=>d.chart.bins[0].end=d.period.end,
 d=>d.chart.timezone='UTC',
 d=>d.chart.bins[0].zone_breakdown.reconciles_recorded_kwh=false
])test('partial/mixed/unattributed/mismatched interval never receives a certain zone color: '+mutation,()=>{const d=fixture();mutation(d);use(d,r=>{assert.equal(r.querySelector('.analysis-point[data-analysis-value="0"] [data-analysis-column-zone]'),null);if(d.chart.timezone===d.period.timezone)assert.ok(r.querySelector('.analysis-point[data-analysis-value="1"] [data-analysis-column-zone]'),'unaffected interval keeps its independent proof');});});
for(const mutation of [d=>d.groups.partition_complete=false,d=>d.groups.energy_domain='site_consumption',d=>d.groups.registry_revision=999,d=>d.groups.areas.office.kwh='51',d=>d.groups.unmeasured.kwh=null,d=>d.totals.kwh=null,d=>d.groups.areas.office.kwh='-1'])test('invalid group evidence retains explicit values but no reconciled composition: '+mutation,()=>{
 const d=fixture();mutation(d);use(d,r=>{assert.equal(r.querySelector('[data-analysis-sankey]'),null);assert.equal(r.querySelector('[data-analysis-composition="destination"]'),null);assert.match(q(r,'[data-analysis-flow-note]').textContent,/unavailable|incomplete/i);assert.match(q(r,'[data-analysis-rank-id="unmeasured"]').textContent,/Unmeasured/);assert.match(q(r,'[data-analysis-rank-share]').textContent,/No data/);});
});
for(const mutation of [d=>d.period_summary.window.timezone='UTC',d=>d.period_summary.zone_breakdown.zones[0].kwh='999',d=>d.period_summary.zone_breakdown.status='partial',d=>delete d.period_summary])test('no whole-period proof means no zone-side fiction, even with valid bins: '+mutation,()=>{const d=fixture();mutation(d);use(d,r=>{assert.equal(r.querySelector('[data-analysis-sankey]'),null);assert.equal(r.querySelector('[data-analysis-composition="source"]'),null);assert.ok(r.querySelector('[data-analysis-ranking]'));assert.match(q(r,'[data-analysis-flow-note]').textContent,/unavailable|incomplete/i);});});
test('known zero has text and no invented share or positive ribbon',()=>{const d=fixture();d.totals.kwh='0';d.totals.recorded_household_kwh='0';for(const level of ['areas','floors','devices'])for(const row of Object.values(d.groups[level])){row.kwh='0';row.recorded_kwh='0';}d.groups.unassigned.kwh='0';d.groups.unassigned.recorded_kwh='0';d.groups.unmeasured.kwh='0';d.groups.unmeasured.recorded_kwh='0';d.period_summary.zone_breakdown.zones.forEach(z=>{z.kwh='0';z.recorded_kwh='0';});use(d,r=>{assert.equal(r.querySelector('[data-analysis-sankey]'),null);assert.equal(r.querySelector('[data-analysis-segment]'),null);assert.match(q(r,'[data-analysis-rank-share]').textContent,/No data/);assert.match(q(r,'[data-analysis-ranking]').textContent,/0\.0 kWh/);});});
test('costs stay literal server values including negative and rounded cents; mixed currencies suppress group costs',()=>{
 const d=fixture();d.groups.areas.office.usage_cost='-0.01';d.groups.unmeasured.usage_cost='0.02';use(d,r=>{assert.match(q(r,'[data-analysis-rank-id="office"]').textContent,/-0.01 EUR/);assert.match(q(r,'[data-analysis-rank-id="unmeasured"]').textContent,/0.02 EUR/);});
 d.groups.currency='PLN';use(d,r=>{assert.doesNotMatch(q(r,'[data-analysis-ranking]').textContent,/-0.01 PLN|0.02 PLN/);assert.match(q(r,'[data-analysis-ranking]').textContent,/No data/);});
});
test('unmeasured is always separately explained; group IDs and hostile labels never enter markup',()=>{const d=fixture();d.groups.devices['sensor.device'].area_name='<img src=x onerror=alert(1)>';use(d,r=>{assert.equal(r.querySelector('[data-analysis-groups] img'),null);assert.match(q(r,'[data-analysis-ranking]').textContent,/<img/);assert.match(q(r,'[data-analysis-unmeasured-explanation]').textContent,/import.*sum.*device/i);assert.match(q(r,'[data-analysis-unmeasured-explanation]').textContent,/once/i);});});
test('Data retains one group table, full interval values, and 68 KPIs; details are closed in chart mode',()=>{
 use(fixture(),r=>{assert.equal(r.querySelectorAll('[data-analysis-bin]').length,24);assert.equal(r.querySelectorAll('[data-analysis-groups] table').length,1);assert.equal(r.querySelectorAll('.analysis-tile').length,4);assert.ok(r.querySelector('[data-analysis-cheap-share]'));assert.ok(r.querySelector('[data-analysis-peak]'));},{view:'data'});
 use(fixture(),r=>{assert.equal(q(r,'[data-analysis-group-details]').open,false);assert.equal(q(r,'[data-analysis-period-summary-details]').open,false);});
});

test('long Decimal mismatch is rejected exactly even when Number would round it away',()=>{
 const d=fixture();d.groups.areas.office.kwh='50.0000000000000000000000000000000001';use(d,r=>{assert.equal(r.querySelector('[data-analysis-sankey]'),null);assert.match(q(r,'[data-analysis-flow-note]').textContent,/incomplete|unavailable/);});
 const z=fixture();z.chart.bins[0].zone_breakdown.zones[0].kwh='4.0000000000000000000000000000000001';z.chart.bins[0].zone_breakdown.zones[0].recorded_kwh=z.chart.bins[0].zone_breakdown.zones[0].kwh;use(z,r=>assert.equal(r.querySelector('.analysis-point[data-analysis-value="0"] [data-analysis-column-zone]'),null));
});
test('absent unmeasured evidence remains a separate unknown row; no unsupported import claim',()=>{
 const d=fixture();delete d.groups.unmeasured;use(d,r=>{assert.match(q(r,'[data-analysis-rank-id="unmeasured"]').textContent,/No data/);assert.equal(r.querySelector('[data-analysis-sankey]'),null);});
 d.groups.energy_domain='site_consumption';use(d,r=>{assert.doesNotMatch(q(r,'[data-analysis-flow-heading],.analysis-flow-heading').textContent,/Grid import/);assert.doesNotMatch(q(r,'[data-analysis-unmeasured-explanation]').textContent,/Unmeasured = grid import/);});
});

test('partial producer fixture has no fabricated tariff flow or colored columns',()=>{
 const dto=JSON.parse(readFileSync(join(__dirname,'fixtures/analysis-partial-v53.json'),'utf8'));
 use(dto,r=>{assert.equal(r.querySelector('[data-analysis-sankey]'),null);assert.equal(r.querySelector('[data-analysis-column-zone]'),null);assert.match(q(r,'[data-analysis-flow-note]').textContent,/unavailable|incomplete/);assert.ok(r.querySelectorAll('[data-analysis-rank-id]').length>=2);});
});
test('a fully evidenced interval can retain its zone when other period measurements are missing',()=>{
 const d=fixture();d.totals.measurement_complete=false;d.totals.kwh=null;d.coverage.complete=false;
 use(d,r=>{assert.equal(q(r,'.analysis-point [data-analysis-column-zone]').dataset.analysisColumnZone,'a|low');assert.equal(r.querySelector('[data-analysis-sankey]'),null);});
});
test('rank colors follow stable group identity across ranking changes, not the biggest amount',()=>{
 const before=fixture(),after=fixture();after.groups.areas.office.kwh='249';after.groups.areas.office.recorded_kwh='249';after.groups.unmeasured.kwh='1';after.groups.unmeasured.recorded_kwh='1';
 let color;use(before,r=>color=q(r,'[data-analysis-rank-id="office"] .analysis-rank').className);
 use(after,r=>assert.equal(q(r,'[data-analysis-rank-id="office"] .analysis-rank').className,color));
});
