'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const {createEnergyAnalysisViewV53}=require('../shared/ha-tools-energy-analysis-view.js');
const H=3600000,C=Date.parse('2026-10-25T00:00:00Z'),B=Date.parse('2026-10-24T00:00:00Z');
const copy=v=>JSON.parse(JSON.stringify(v));
const iso=v=>new Date(v).toISOString();
const rangeText=(ui,from,to)=>ui.pointLabel(iso(from))+' – '+ui.pointLabel(iso(to));
function pair(index=0){return {status:'ready',reason:null,current_from:C+index*H,current_to:C+(index+1)*H,baseline_from:B+index*H,baseline_to:B+(index+1)*H,current_kwh:index?'2':'0',baseline_kwh:index?'7.123456789123456789':'4',mapping:'calendar_frame_bijection',expected_current_source_seconds:3600,expected_baseline_source_seconds:3600,selected_current_source_seconds:3600,selected_baseline_source_seconds:3600};}
function fixture(){return {schema:2,context:{comparison_kind:'previous'},period:{kind:'day',timezone:'Europe/Warsaw',start:iso(C),end:iso(C+2*H)},coverage:{ratio:1},totals:{kwh:'2',total_cost:'-1',currency:'EUR'},groups:{currency:'EUR',devices:{},areas:{}},rates:[{version_id:'v1',valid_from:'2026-10-01',valid_to:null,currency:'EUR',price_basis:'gross',profile:{zones:[{id:'z',label:'Peak <fixture>'}]}}],chart:{status:'ready',grain:'hour',timezone:'Europe/Warsaw',fixed_fee_scope:'household_period_only',bins:[0,1].map(i=>({start:iso(C+i*H),end:iso(C+(i+1)*H),fold:i,kwh:i?'2':'0',recorded_kwh:i?'2':'0',usage_cost:i?'-1':'0'}))},comparisons:{previous:{status:'ready',reason:null,comparison_scope:'calendar_totals',current_kwh:'2',baseline_kwh:'11.123456789123456789',chart:{status:'ready',reason:null,timezone:'Europe/Warsaw',grain:'hour',comparison_scope:'calendar_totals',coverage_kind:'selected_household_comparison_mask',fixed_fee_scope:'household_period_only',reconciles_comparison_energy:true,markers:[pair(0),pair(1)]},baseline_analysis:{chart:{bins:[{kwh:'99999'}]}}}}};}
function zone({partial=false,currency='EUR',version='v1',label='Peak <fixture>',energy='0',cost='0.00'}={}){return {status:partial?'partial':'ready',reason:partial?'multiple_zones_in_measurement':null,scope:'complete_household_hours',fixed_fee_scope:'household_period_only',currency,price_basis:currency?'gross':null,reconciles_recorded_kwh:true,reconciles_known_costs:!!currency,zones:[{tariff_id:'active',version_id:version,zone_id:'z',label,kwh:partial?null:energy,recorded_kwh:partial?'0.25':energy,complete:!partial,measured_seconds:3600,energy_cost:partial?null:cost,variable_cost:partial?null:'0.00',legacy_combined_cost:null,known_costs:{energy_cost:partial?'-0.50':cost,variable_cost:'0.00',legacy_combined_cost:null},usage_cost:partial?null:cost}],unattributed:{recorded_kwh:partial?'1.75':null,measured_seconds:partial?1800:0,missing_seconds:partial?1800:0,known_costs:{energy_cost:partial?'0.75':null,variable_cost:null,legacy_combined_cost:null},reasons:partial?['multiple_zones_in_measurement']:[]}};}
function render(dto,options={},language='en',format){const card={_hass:{locale:{language,time_zone:'server',time_format:'24'},config:{time_zone:'Europe/Warsaw'}}};const ui=format||createFormatUi.forHass(card._hass),view=createEnergyAnalysisViewV53({card,format:ui}),dom=new JSDOM(view.markup(dto,options));return {root:dom.window.document.body,ui,close:()=>dom.window.close()};}
function use(dto,options,fn,lang,format){const f=render(dto,options,lang,format);try{fn(f);}finally{f.close();}}
test('pair markers use exact interval bounds even when producer series is reordered; visual and data expose both server strings',()=>{
 const dto=fixture();dto.comparisons.previous.chart.markers.reverse();
 for(const view of ['chart','data'])use(dto,{view,selected:1},({root})=>{
  const markers=[...root.querySelectorAll('[data-analysis-marker]')];assert.equal(markers.length,2);assert.match(markers[0].getAttribute('aria-label')||markers[0].textContent,/4 kWh/);assert.match(markers[1].getAttribute('aria-label')||markers[1].textContent,/7[.,]123/);
  assert.match(root.querySelector('[data-analysis-series-legend]').textContent,/Current.*Baseline/);assert.doesNotMatch(root.querySelector('[data-analysis-chart]').textContent,/99999/);
  const detail=root.querySelector('[data-analysis-point-detail]');assert.match(detail.textContent,/2 kWh/);assert.match(detail.textContent,/7[.,]123/);
 });
});
test('current retains bars while baseline is an interval line on the same geometry scale, with no line over an unknown marker',()=>{
 const dto=fixture();dto.comparisons.previous.chart.status='partial';dto.comparisons.previous.chart.reconciles_comparison_energy=false;
 dto.comparisons.previous.chart.markers[1]={...pair(1),status:'unknown',reason:'unmatched_calendar_frames',current_kwh:null,baseline_kwh:null};
 use(dto,{view:'chart'},({root})=>{const points=root.querySelectorAll('.analysis-point');
 assert.ok(points[0].querySelector('.analysis-column.analysis-series-current'));
 const line=points[0].querySelector('[data-analysis-marker]');assert.ok(line.classList.contains('analysis-baseline-line'));assert.ok(line.style.bottom.endsWith('px'));assert.equal(line.classList.contains('analysis-column'),false);
 assert.equal(points[1].querySelector('[data-analysis-marker]'),null);assert.ok(parseFloat(points[1].querySelector('.analysis-column').style.height)>0,'existing current bar survives unknown baseline');assert.equal(root.querySelector('[data-analysis-secondary-axis]'),null);
 });
});
for(const mutate of [d=>d.comparisons.previous.chart.markers.push(copy(pair(0))),d=>{d.comparisons.previous.chart.markers[0].current_to+=1;},d=>{d.comparisons.previous.chart.markers[0].mapping='zip';},d=>{d.comparisons.previous.chart.timezone='UTC';},d=>{d.comparisons.previous.chart.markers[0].selected_current_source_seconds=0;}])test('unproven marker is never used as an index fallback '+mutate.toString().slice(0,45),()=>{
 const dto=fixture();mutate(dto);use(dto,{view:'data'},({root})=>{const rows=root.querySelectorAll('[data-analysis-bin]');assert.match(rows[0].querySelector('[data-analysis-baseline-value]').textContent,/No data/);assert.doesNotMatch(rows[0].textContent,/99999/);});
});
test('DST gap/fold unknown marker stays unknown; supported partial marker remains visible without full reconciliation claim',()=>{
 const dto=fixture(),chart=dto.comparisons.previous.chart;chart.status='partial';chart.reconciles_comparison_energy=false;chart.markers[1]={...pair(1),status:'unknown',reason:'unmatched_calendar_frames',current_kwh:null,baseline_kwh:null,baseline_from:null,baseline_to:null,selected_current_source_seconds:0,selected_baseline_source_seconds:0};
 for(const language of ['en','pl'])use(dto,{view:'data',selected:1},({root})=>{const rows=root.querySelectorAll('[data-analysis-bin]');assert.match(rows[0].querySelector('[data-analysis-baseline-value]').textContent,/4 kWh/);assert.match(rows[1].querySelector('[data-analysis-baseline-value]').textContent,/No data|Brak danych/);assert.match(root.querySelector('[data-analysis-baseline="partial"]').textContent,/selected intervals|wybranych przedziałów/);assert.doesNotMatch(root.querySelector('[data-analysis-chart]').textContent,/unmatched_calendar_frames|calendar_frame_bijection/);},language);
});
test('common mask uses producer selected current, keeps whole household distinct, and never recomputes selected amount',()=>{
 const dto=fixture(),c=dto.comparisons.previous;c.comparison_scope=c.chart.comparison_scope='common_measurements';
 for(const m of c.chart.markers)Object.assign(m,{mapping:'common_source_frame_intersection',current_kwh:'0.125',baseline_kwh:'0',selected_current_source_seconds:1800,selected_baseline_source_seconds:1800});
 use(dto,{view:'data',selected:1},({root})=>{const row=root.querySelectorAll('[data-analysis-bin]')[1];assert.equal(row.querySelector('[data-analysis-current-value]').textContent,'0.125 kWh');assert.equal(row.querySelector('[data-analysis-household-value]').textContent,'2 kWh');assert.match(root.querySelector('[data-analysis-series-legend]').textContent,/common measurements/i);assert.equal(row.querySelector('[data-analysis-baseline-value]').textContent,'0 kWh');});
});
function mean7(){const d=fixture(),chart=d.comparisons.previous.chart;d.context.comparison_kind='mean7';d.comparisons.mean7=d.comparisons.previous;delete d.comparisons.previous;chart.baseline_aggregation='mean7';chart.baseline_periods=Array.from({length:7},(_,i)=>({from:B-i*86400000,to:B-i*86400000+2*H}));
 for(const [i,m] of chart.markers.entries())Object.assign(m,{baseline_from:null,baseline_to:null,baseline_aggregation:'mean7',baseline_ranges:chart.baseline_periods.map(p=>({from:p.from+i*H,to:p.from+(i+1)*H})),mapping:'mean7_calendar_frames',expected_baseline_source_seconds:Array(7).fill(3600),selected_baseline_source_seconds:Array(7).fill(3600)});return d;}
test('mean7 exposes exactly seven real producer ranges with shared timezone/clock formatter, passes long decimal string intact',()=>{
 const dto=mean7(),base=createFormatUi('en','America/Los_Angeles',{hourCycle:'h12'}),seen=[];const format={...base,number:(v,o)=>{seen.push(v);return base.number(v,o);}};
 use(dto,{comparison:'mean7',view:'data',selected:1},({root})=>{const ranges=root.querySelectorAll('[data-analysis-bin]')[1].querySelectorAll('[data-analysis-baseline-range]');assert.equal(ranges.length,7);assert.equal(ranges[0].textContent,rangeText(base,B+H,B+2*H));assert.ok(seen.includes('7.123456789123456789'));assert.ok(!seen.includes(Number('7.123456789123456789')));assert.match(root.querySelector('[data-analysis-series-legend]').textContent,/7/);},'en',format);
});
for(const defect of ['six','duplicate','seconds','outside'])test('mean7 rejects incomplete proof '+defect,()=>{
 const dto=mean7(),m=dto.comparisons.mean7.chart.markers[0];if(defect==='six')m.baseline_ranges.pop();if(defect==='duplicate')m.baseline_ranges[1]=copy(m.baseline_ranges[0]);if(defect==='seconds')m.selected_baseline_source_seconds[6]=0;if(defect==='outside')m.baseline_ranges[6]={from:C,to:C+H};
 use(dto,{comparison:'mean7',view:'data'},({root})=>assert.match(root.querySelector('[data-analysis-baseline-value]').textContent,/No data/));
});
test('zone values preserve zero, negative known costs and unattributed measurements; flow has interval instruction without fabricated total',()=>{
 const dto=fixture();dto.chart.bins[0].zone_breakdown=zone();dto.chart.bins[1].zone_breakdown=zone({partial:true});dto.chart.bins[1].usage_cost=null;
 for(const view of ['chart','data'])use(dto,{view,selected:1},({root})=>{const selected=root.querySelector('[data-analysis-point-detail]');assert.match(selected.textContent,/Unattributed/);assert.match(selected.textContent,/1.75 kWh/);assert.match(selected.textContent,/0.75 EUR/);assert.match(selected.textContent,/Recorded/);assert.match(selected.textContent,/1[,. ]?800/);
 assert.equal(root.querySelector('img'),null);assert.match(root.querySelector('[data-analysis-zone-note]').textContent,/interval|Interval/);assert.doesNotMatch(root.querySelector('[data-analysis-zone-note]').textContent,/no server breakdown/);
 if(view==='data'){const rows=root.querySelectorAll('[data-analysis-bin]');assert.match(rows[0].querySelector('[data-analysis-zone-values]').textContent,/0 kWh/);assert.match(rows[0].querySelector('[data-analysis-zone-values]').textContent,/0 EUR/);}
 });
});
test('zone colors are categorical version+zone identities across order and amount changes; escaped public labels never become markup',()=>{
 const dto=fixture();dto.chart.bins[0].zone_breakdown=zone({label:'<img src=x onerror=boom>'});dto.chart.bins[1].zone_breakdown=zone({version:'v-old'});let color;
 use(dto,{view:'data'},({root})=>{const z=root.querySelector('[data-analysis-zone-key="v1|z"]');color=z.getAttribute('style');assert.equal(root.querySelector('img'),null);assert.match(z.textContent,/<img/);assert.doesNotMatch(root.textContent,/v-old/);assert.match(root.textContent,/version unavailable/i);});
 dto.chart.bins.reverse();dto.chart.bins[1].zone_breakdown.zones[0].recorded_kwh='999';use(dto,{view:'data'},({root})=>assert.equal(root.querySelector('[data-analysis-zone-key="v1|z"]').getAttribute('style'),color));
});
test('historical currency and missing basis never borrow household money metadata or claim cheapness from zone name',()=>{
 const dto=fixture();dto.comparisons={};dto.chart.bins[0].kwh='2';dto.chart.bins[0].usage_cost='-0.50';dto.chart.bins[1].kwh=null;dto.chart.bins[1].usage_cost=null;dto.chart.bins[0].zone_breakdown=zone({currency:'PLN',label:'Night default cheap',energy:'2',cost:'-0.50'});dto.chart.bins[1].zone_breakdown=zone({currency:null,partial:true});
 use(dto,{view:'data'},({root})=>{const rows=root.querySelectorAll('[data-analysis-bin]'),a=rows[0].querySelector('[data-analysis-zone-values]'),b=rows[1].querySelector('[data-analysis-zone-values]');assert.match(a.textContent,/-0.5 PLN/);assert.doesNotMatch(a.textContent,/-0.5 EUR/);assert.doesNotMatch(b.textContent,/0.75 EUR|0.75 PLN/);assert.match(b.textContent,/currency|No data/);assert.equal(a.querySelector('[data-cheap]'),null);});
});

test('spring gap uses the explicit baseline 03:00 interval rather than the next array index; autumn fold labels remain distinct',()=>{
 const dto=fixture(),spring=Date.parse('2026-03-29T00:00:00Z'),prior=Date.parse('2026-03-28T00:00:00Z');
 dto.chart.bins.forEach((row,i)=>Object.assign(row,{start:iso(spring+i*H),end:iso(spring+(i+1)*H)}));
 dto.comparisons.previous.chart.markers.forEach((m,i)=>Object.assign(m,{current_from:spring+i*H,current_to:spring+(i+1)*H,baseline_from:prior+(i?2:0)*H,baseline_to:prior+(i?3:1)*H}));
 use(dto,{view:'data'},({root,ui})=>assert.equal(root.querySelectorAll('[data-analysis-bin]')[1].querySelector('[data-analysis-baseline-range]').textContent,rangeText(ui,prior+2*H,prior+3*H)));
 use(fixture(),{view:'data'},({root,ui})=>{const rows=root.querySelectorAll('[data-analysis-bin]');assert.equal(rows[0].querySelector('button').textContent,ui.pointLabel(iso(C)));assert.equal(rows[1].querySelector('button').textContent,ui.pointLabel(iso(C+H)));assert.notEqual(rows[0].querySelector('button').textContent,rows[1].querySelector('button').textContent);});
});
test('resolved system display timezone and clock are used for every proven baseline range',()=>{
 const dto=fixture(),format=createFormatUi.forHass({locale:{language:'en',time_zone:'local',time_format:'system'},config:{time_zone:'Pacific/Kiritimati'}});
 use(dto,{view:'data',selected:0},({root})=>assert.equal(root.querySelector('[data-analysis-baseline-range]').textContent,rangeText(format,B,B+H)),'en',format);
});

test('unknown common marker keeps the measured household bar while selected comparison remains explicitly unavailable',()=>{
 const dto=fixture(),c=dto.comparisons.previous;c.comparison_scope=c.chart.comparison_scope='common_measurements';c.chart.status='partial';c.chart.reconciles_comparison_energy=false;
 Object.assign(c.chart.markers[0],{mapping:'common_source_frame_intersection',current_kwh:'0',baseline_kwh:'0'});
 c.chart.markers[1]={...pair(1),status:'unknown',reason:'no_common_measurements',current_kwh:null,baseline_kwh:null};
 use(dto,{view:'chart',selected:1},({root})=>{const point=root.querySelectorAll('.analysis-point')[1];assert.ok(parseFloat(point.querySelector('.analysis-column').style.height)>0);assert.match(point.getAttribute('aria-label'),/Whole household: 2 kWh/);assert.match(point.getAttribute('aria-label'),/common measurements: No data/);assert.equal(point.querySelector('[data-analysis-marker]'),null);});
});

// Values in accessible Data must retain producer Decimal precision, not merely
// pass an unrounded argument into a formatter that defaults to three places.
test('accessible marker values display the producer Decimal without default three-place rounding',()=>{
 const dto=fixture();
 use(dto,{view:'data'},({root})=>assert.equal(root.querySelectorAll('[data-analysis-baseline-value]')[1].textContent,'7.123456789123456789 kWh'));
 dto.comparisons.previous.chart.markers[1].baseline_kwh='-0.000000000123456789123456789';
 use(dto,{view:'data'},({root})=>assert.equal(root.querySelectorAll('[data-analysis-baseline-value]')[1].textContent,'-0,000000000123456789123456789 kWh'),'pl');
});
