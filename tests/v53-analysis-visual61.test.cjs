'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const {createEnergyAnalysisViewV53}=require('../shared/ha-tools-energy-analysis-view.js');
const START=Date.parse('2026-10-25T00:00:00Z'),H=3600000;
const iso=n=>new Date(n).toISOString();
function literal(count=24){const grid=Array.from({length:count},(_,i)=>({start:count===12?Date.UTC(2026,i,1):count===31?Date.UTC(2026,9,i+1):START+i*H,end:count===12?Date.UTC(2026,i+1,1):count===31?Date.UTC(2026,9,i+2):START+(i+1)*H}));return {schema:2,context:{period_anchor:'2026-10-25',comparison_kind:'previous'},period:{kind:count===12?'year':count===31?'month':'day',start:iso(grid[0].start),end:iso(grid.at(-1).end),timezone:'UTC'},coverage:{ratio:1},totals:{kwh:count+'.123456789123456789',total_cost:'-0.29',usage_cost:'-0.30',fixed_cost:'0.01',energy_cost:'-0.60',variable_cost:'0.30',legacy_combined_cost:null,effective_price:'-0.01208333333333333333333333333333333',currency:'PLN',price_basis:'gross'},chart:{status:'ready',grain:count===12?'month':count===31?'day':'hour',timezone:'UTC',fixed_fee_scope:'household_period_only',bins:Array.from({length:count},(_,i)=>({start:iso(grid[i].start),end:iso(grid[i].end),fold:0,kwh:i===0?'0':i===1?'2.123456789123456789':'1',usage_cost:i===0?'0.00':i===1?'-0.30':'0.00'}))},groups:{energy_domain:'grid_import',currency:'PLN',floor_supported:true,devices:{'sensor.test':{name:'Fixture device',area_id:'area-test',area_name:'Room <fixture>',floor_id:'floor-test',floor_name:'Floor fixture'}},areas:{'area-test':{kwh:String(count-4),usage_cost:'-0.20',coverage:{ratio:1}}},floors:{'floor-test':{kwh:String(count-4),usage_cost:'-0.20'}},unassigned:{kwh:'0',usage_cost:'0'},unmeasured:{kwh:'4.123456789123456789',usage_cost:'-0.10'}},rates:[{version_id:'version-current',valid_from:'2026-10-01',valid_to:null,currency:'PLN',price_basis:'gross',provenance:'configured_valid_from',rate_semantics:'components',fixed_monthly:{subscription:'3.00',capacity:'0.00',distribution:'0.00',other:'0.00'},profile:{timezone:'Europe/Warsaw',clock:{mode:'civil'},defaultZone:'day',zones:[{id:'day',label:'Day fixture',energyRate:'-0.20',variableRate:'0.10'}],rules:[{zone:'day',dates:['2026-10-25'],weekdays:[0],intervals:[{from:'06:00',to:'22:00'}]}],dynamic:{intervals:[{from:START,to:START+H,energyRate:'-0.20',variableRate:'0.10'}]}}},{version_id:'version-old',valid_from:'2026-01-01',valid_to:'2026-10-01',currency:'EUR',price_basis:'net',fixed_monthly:{},legacy_combined_monthly:'2.00',profile:{zones:[{id:'old',label:'Old fixture',energyRate:'0.40',variableRate:null}],rules:[]}}],fees:{components:{subscription:'0.01'}},alternatives:[{tariff_id:'other',tariff_name:'Other fixture',kwh:'24',total_cost:'1.50',delta_cost:'1.79',currency:'PLN',comparable:true}],comparisons:{}};}
function render(dto=literal(),options={},language='en',format){const card={_hass:{locale:{language,time_zone:'server',time_format:'24'},config:{time_zone:'Europe/Warsaw'}}},view=createEnergyAnalysisViewV53({card,format:format||createFormatUi.forHass(card._hass)}),dom=new JSDOM(view.markup(dto,options));return {root:dom.window.document.body,view,w:dom.window,close:()=>dom.window.close()};}
function use(dto,options,fn,language,format){const f=render(dto,options,language,format);try{fn(f);}finally{f.close();}}
for(const count of [24,31,12])test('intrinsic chart retains all '+count+' individually labelled actionable points without a minimum-content track',()=>{
 use(literal(count),{},({root,view})=>{const chart=root.querySelector('.analysis-chart'),points=[...chart.querySelectorAll('.analysis-point')];assert.equal(points.length,count);assert.equal(chart.style.getPropertyValue('--analysis-point-count'),String(count));
  assert.deepEqual(points.map(e=>e.dataset.analysisValue),Array.from({length:count},(_,i)=>String(i)));
  assert.ok(points.every(e=>e.tagName==='BUTTON'&&e.dataset.analysisAction==='point'&&e.getAttribute('aria-label').includes('kWh')&&!e.disabled&&e.tabIndex>=0));
  assert.equal(root.querySelectorAll('[data-analysis-action="point"]').length,count,'no duplicate or unbound point actions');
  assert.ok(points.filter(e=>e.querySelector('.analysis-point-label').textContent).length<=8);const major=points.map(e=>e.querySelector('.analysis-point-label')).filter(e=>e.textContent&&!e.hasAttribute('data-analysis-axis-minor'));assert.ok(major.length<=3&&major.length>0,'narrow cards have bounded sparse ticks without dropping point facts');
  // Supporting CSS contract only; owner must measure actual browser/card widths.
  assert.match(view.styles(),/grid-template-columns:repeat\(var\(--analysis-point-count\),minmax\(0,1fr\)\)/);
  assert.doesNotMatch(view.styles(),/min-width:max-content/);assert.match(view.styles(),/@container energy-analysis/);
 });
});
test('tiles and chart are primary; source metadata is disclosed once and all detailed controls stay directly usable after the primary chart',()=>{
 for(const language of ['en','pl'])use(literal(),{},({root,w})=>{
  const tiles=root.querySelector('.analysis-tiles'),chart=root.querySelector('[data-analysis-chart]'),filters=root.querySelector('[data-analysis-filters]'),source=root.querySelector('[data-analysis-source-details]');
  assert.ok(tiles.compareDocumentPosition(filters)&w.Node.DOCUMENT_POSITION_FOLLOWING);assert.ok(chart.compareDocumentPosition(source)&w.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(filters.tagName,'DIV');assert.ok(chart.compareDocumentPosition(filters)&w.Node.DOCUMENT_POSITION_FOLLOWING);assert.ok(!filters.closest('details'));
  for(const name of ['anchor','comparison','level']){assert.equal(root.querySelectorAll('[data-analysis-action="'+name+'"]').length,1);assert.ok(filters.querySelector('[data-analysis-action="'+name+'"]'));}
  assert.equal(root.querySelectorAll('[data-analysis-action="period"]').length,4);assert.equal(root.querySelectorAll('[data-analysis-source-details]').length,1);
  assert.equal(source.tagName,'DETAILS');assert.match(source.textContent,/UTC/);assert.equal(root.querySelectorAll('.analysis-tile').length,4);
 },language);
});
test('Data retains every exact value and full-size point action; chart disclosure contains group table once',()=>{
 const dto=literal(),base=createFormatUi('en','Europe/Warsaw'),seen=[],format={...base,number:(v,o)=>{seen.push(v);return base.number(v,o);}};
 use(dto,{view:'data',selected:1},({root})=>{const rows=root.querySelectorAll('[data-analysis-bin]');assert.equal(rows.length,24);assert.match(rows[0].cells[1].textContent,/0 kWh/);assert.match(rows[1].textContent,/-0.3 PLN/);assert.ok(seen.includes('2.123456789123456789'));assert.ok(!seen.includes(Number('2.123456789123456789')));
  assert.equal(root.querySelector('[data-analysis-group-details]'),null);assert.equal(root.querySelectorAll('[data-analysis-groups] table').length,1);
  for(const row of rows){const button=row.querySelector('button');assert.equal(button.dataset.analysisAction,'point');assert.ok(button.textContent.trim());assert.equal(button.tabIndex,0);}
 },'en',format);
 use(dto,{view:'chart'},({root})=>{const group=root.querySelector('[data-analysis-groups]');assert.equal(group.querySelectorAll('table').length,1);const details=group.querySelector('[data-analysis-group-details]');assert.ok(details&&details.querySelector('table'));assert.equal(details.open,false);assert.ok(details.querySelector('summary').textContent.trim());assert.ok(group.querySelector('.analysis-ranking'));assert.match(group.querySelector('[data-analysis-zone-note]').textContent,/no server breakdown/);});
});
test('existing delegated point clicks remain exactly the same controls, and partial/DST labels stay distinct',()=>{
 const dto=literal();dto.chart.bins[2].kwh=null;dto.chart.bins[2].usage_cost=null;dto.chart.status='partial';dto.coverage={ratio:null};dto.totals.kwh=null;
 use(dto,{selected:2},({root,w})=>{const points=root.querySelectorAll('.analysis-point');const display=createFormatUi('en','Europe/Warsaw');assert.ok(points[0].getAttribute('aria-label').startsWith(display.pointLabel(dto.chart.bins[0].start)));assert.ok(points[1].getAttribute('aria-label').startsWith(display.pointLabel(dto.chart.bins[1].start)));assert.notEqual(display.pointLabel(dto.chart.bins[0].start),display.pointLabel(dto.chart.bins[1].start));assert.match(points[2].getAttribute('aria-label'),/No data/);assert.ok(points[2].classList.contains('analysis-missing'));
  const events=[];root.addEventListener('click',event=>{const e=event.target.closest('[data-analysis-action]');if(e)events.push([e.dataset.analysisAction,e.dataset.analysisValue]);});points[1].click();assert.deepEqual(events,[['point','1']]);
  assert.match(root.querySelector('[data-analysis-point-detail]').textContent,/No data/);assert.equal(root.querySelector('[data-analysis-marker]'),null);
 });
});
test('flow hierarchy keeps producer room/unassigned/unmeasured values, escaping and honest missing zone facts',()=>{
 const dto=literal();dto.groups.devices['sensor.test'].area_name='<img src=x onerror=boom>';
 use(dto,{},({root})=>{const groups=root.querySelector('[data-analysis-groups]');assert.ok(groups.querySelector('.analysis-flow-heading'));assert.ok(groups.querySelector('.analysis-mobile-composition'));assert.ok(groups.querySelector('[data-analysis-ranking]'));
  assert.equal(groups.querySelectorAll('.analysis-ranking li').length,3);assert.match(groups.textContent,/<img src=x onerror=boom>/);assert.equal(root.querySelector('img'),null);assert.equal(root.querySelector('[onerror]'),null);assert.match(groups.textContent,/No room/);assert.match(groups.textContent,/Unmeasured/);assert.match(groups.textContent,/0 kWh/);
  assert.equal(root.querySelector('[data-analysis-cheap-share]'),null);assert.equal(root.querySelector('[data-analysis-peak]'),null);assert.equal(root.querySelector('[data-analysis-period-zone-total]'),null);
 });
});
test('rates lead with household cost components; history retains rules, dates, fees and original currencies once',()=>{
 for(const language of ['en','pl'])use(literal(),{section:'rates'},({root,w})=>{const costs=root.querySelector('[data-analysis-cost-components]'),history=root.querySelector('[data-analysis-rate-history]');assert.ok(history);assert.ok(costs.compareDocumentPosition(history)&w.Node.DOCUMENT_POSITION_FOLLOWING);assert.equal(history.open,false);
  assert.equal(history.querySelectorAll('.analysis-rate-version').length,2);assert.match(history.textContent,/Day fixture/);assert.match(history.textContent,/Old fixture/);assert.match(history.textContent,/06:00/);assert.match(history.textContent,/22:00/);assert.match(history.textContent,/EUR/);assert.match(history.textContent,/PLN/);assert.equal(root.querySelectorAll('[data-analysis-monthly="subscription"]').length,1);
  assert.match(costs.textContent,/-0[.,]29/);assert.ok(root.querySelector('[data-analysis-fee-details]'));assert.equal(root.querySelector('[data-analysis-action="activate"]'),null);
  assert.doesNotMatch(root.textContent,/this view does not calculate prices|widok nie oblicza cen/);
 },language);
});

test('comparison chart leads the household values, with exact dates and group rows retained once in named detail',()=>{
 const dto=literal();dto.comparisons.previous={status:'ready',comparison_scope:'calendar_totals',current_kwh:'24.123456789123456789',baseline_kwh:'23',delta_kwh:'1.123456789123456789',percent:null,costs:{status:'unknown',current:{usage_cost:'-0.30',currency:'PLN'},baseline:{usage_cost:'2.00',currency:'EUR'}},baseline_periods:[{start:'2026-10-24T00:00:00Z',end:'2026-10-25T00:00:00Z'}],groups:{currency:'PLN',areas:{'area-test':{status:'ready',delta_kwh:'0',delta_usage_cost:'0'}}}};
 use(dto,{section:'comparison'},({root,w})=>{const chart=root.querySelector('[data-analysis-chart]'),household=root.querySelector('table'),dates=root.querySelector('[data-analysis-baseline-period-details]'),groups=root.querySelector('[data-analysis-comparison-groups]');
 assert.ok(chart.compareDocumentPosition(household)&w.Node.DOCUMENT_POSITION_FOLLOWING);assert.ok(dates.querySelector('summary').textContent.trim());assert.equal(dates.open,false);assert.equal(groups.querySelectorAll('table').length,1);assert.ok(groups.querySelector('[data-analysis-comparison-details] table'));assert.match(root.textContent,/2 EUR/);assert.match(root.textContent,/-0.3 PLN/);assert.equal(root.querySelector('[data-analysis-marker]'),null);
 });
});
