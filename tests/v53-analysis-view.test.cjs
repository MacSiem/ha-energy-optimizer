const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {createFormatUi} = require('../shared/ha-tools-format.js');
const {createEnergyAnalysisViewV53} = require('../shared/ha-tools-energy-analysis-view.js');

// Literal schema-2 DTO, not values recomputed by the view or its own helpers.
function fixture() {
  return {
    schema:2, context:{comparison_kind:'previous'},
    period:{kind:'day',start:'2026-10-17T22:00:00+00:00',end:'2026-10-18T01:00:00+00:00',timezone:'Europe/Warsaw'},
    totals:{kwh:'3',total_cost:'-0.29',effective_price:'-0.0966666666666666667',energy_cost:'-0.60',variable_cost:'0.30',legacy_combined_cost:null,usage_cost:'-0.30',fixed_cost:'0.01',currency:'PLN',price_basis:'gross'},
    coverage:{complete:true,ratio:1,measured_source_seconds:10800,expected_source_seconds:10800},
    chart:{status:'ready',grain:'hour',timezone:'Europe/Warsaw',fixed_fee_scope:'household_period_only',bins:[
      {start:'2026-10-17T22:00:00+00:00',end:'2026-10-17T23:00:00+00:00',local_start:'2026-10-18T00:00:00+02:00',fold:0,kwh:'0',usage_cost:'0.00',fixed_cost:null,total_cost:null},
      {start:'2026-10-17T23:00:00+00:00',end:'2026-10-18T00:00:00+00:00',local_start:'2026-10-18T01:00:00+02:00',fold:0,kwh:'3',usage_cost:'-0.30',fixed_cost:null,total_cost:null},
      {start:'2026-10-18T00:00:00+00:00',end:'2026-10-18T01:00:00+00:00',local_start:'2026-10-18T02:00:00+02:00',fold:0,kwh:'0',usage_cost:'0.00',fixed_cost:null,total_cost:null}
    ]},
    groups:{energy_domain:'grid_import',floor_supported:true,currency:'PLN',devices:{
      'sensor.a':{name:'Bojler',area_id:'room-id',area_name:'Kuchnia',floor_id:'floor-id',floor_name:'Parter',kwh:'2',usage_cost:'-0.20'},
      'sensor.b':{name:'Pompa',area_id:null,area_name:null,floor_id:null,floor_name:null,kwh:'0',usage_cost:'0.00'}},
      areas:{'room-id':{kwh:'2',usage_cost:'-0.20'}},floors:{'floor-id':{kwh:'2',usage_cost:'-0.20'},'__no_floor__':{kwh:'0',usage_cost:'0.00'}},
      unassigned:{kwh:'0',usage_cost:'0.00'},unmeasured:{kwh:'1',usage_cost:'-0.10'}},
    rates:[{version_id:'v1',valid_from:'2026-10-01',valid_to:null,currency:'PLN',price_basis:'gross',rate_semantics:'components',
      fixed_monthly:{subscription:'3.00',capacity:'0.00',distribution:'0.00',other:'0.00'},legacy_combined_monthly:null,
      profile:{defaultZone:'a',zones:[{id:'a',label:'Nocna',energyRate:'-0.20',variableRate:'0.10'}],rules:[{zone:'a',weekdays:[1,2,3,4,5],intervals:[{from:'22:00',to:'06:00'}]}]}},
      {version_id:'v0',valid_from:'2026-01-01',valid_to:'2026-10-01',currency:'PLN',price_basis:'gross',fixed_monthly:{},legacy_combined_monthly:'2.00',profile:{zones:[{id:'old',label:'Dawna',energyRate:'0.40',variableRate:null}],rules:[]}}],
    alternatives:[{tariff_id:'other',tariff_name:'Inna',comparable:true,total_cost:'1.50',delta_cost:'1.79',currency:'PLN',kwh:'3'}],
    comparisons:{previous:{status:'ready',comparison_scope:'calendar_totals',current_kwh:'3',baseline_kwh:'4',delta_kwh:'-1',percent:-25,coverage:{current:1,baseline:1},costs:{status:'ready',delta_cost:'-0.20',current:{usage_cost:'-0.30',currency:'PLN'},baseline:{usage_cost:'-0.10',currency:'PLN'}},
      baseline_periods:[{start:'2026-10-16T22:00:00+00:00',end:'2026-10-17T01:00:00+00:00'}],
      baseline_analysis:{chart:{grain:'hour',timezone:'Europe/Warsaw',bins:[{start:'2026-10-16T22:00:00+00:00',kwh:'4'}]}},
      groups:{currency:'PLN',areas:{'room-id':{status:'ready',current_kwh:'2',baseline_kwh:'3',delta_kwh:'-1',delta_usage_cost:'-0.10',percent:null}},unassigned:{status:'ready',delta_kwh:'0',delta_usage_cost:'0.00'},unmeasured:{status:'unknown',delta_kwh:null}}}}
  };
}
function render(dto=fixture(), options={}, language='pl', format) {
  const card={_hass:{locale:{language,time_zone:'server',time_format:'24'},config:{time_zone:'Europe/Warsaw'}}};
  const view=createEnergyAnalysisViewV53({card,format:format || createFormatUi.forHass(card._hass)});
  const dom=new JSDOM(view.markup(dto,options));
  return {root:dom.window.document.body,dom,view};
}
function withView(fn,dto,options,language,format) { const v=render(dto,options,language,format); try { fn(v.root,v.view); } finally { v.dom.window.close(); } }

test('literal three rows retain server zero and negative costs with semantic data access',()=>withView(root=>{
  const rows=[...root.querySelectorAll('[data-analysis-bin]')]; assert.equal(rows.length,3);
  assert.match(rows[0].textContent,/0 kWh/);assert.match(rows[1].textContent,/-0,3/);assert.match(rows[2].textContent,/0 kWh/);
  assert.match(root.textContent,/-0,29/);assert.equal(root.querySelectorAll('table caption').length,root.querySelectorAll('table').length);
  for(const th of root.querySelectorAll('th'))assert.ok(th.hasAttribute('scope'));
},fixture(),{view:'data'}));

test('chart and data show identical server usage costs and selectable points',()=>{
  for(const view of ['chart','data'])withView(root=>{assert.match(root.textContent,/-0,3/);assert.ok(root.querySelector('[data-analysis-action="point"][data-analysis-value="1"]'));},fixture(),{view,selected:1});
});

test('PL and EN labels, period switches, scoped controls and applicable comparisons',()=>{
  for(const [language,label] of [['pl','Dzień'],['en','Day']])withView(root=>{
    assert.match(root.textContent,new RegExp(label)); assert.equal(root.querySelectorAll('[data-analysis-action="period"]').length,4);
    const select=root.querySelector('[data-analysis-action="comparison"]');assert.equal(select.options.length,3);
    assert.ok(root.querySelector('[data-analysis-action="anchor"]'));assert.ok(root.querySelector('[data-analysis-action="level"]'));
  },fixture(),{},language);
  const dto=fixture();dto.period.kind='week';withView(root=>{assert.deepEqual([...root.querySelector('[data-analysis-action="comparison"]').options].map(x=>x.value),['previous','year_ago']);},dto);
});

test('uses injected shared formatter without converting Decimal strings to Number',()=>{
  const base=createFormatUi('en','Pacific/Honolulu'),seen=[];
  const format={...base,number:(value,options)=>{seen.push(value);return base.number(value,options);}};
  withView(root=>{assert.ok(seen.includes('-0.0966666666666666667'));assert.ok(!seen.includes(Number('-0.0966666666666666667')));
    assert.ok(root.textContent.includes(base.range(fixture().period.start,fixture().period.end)));
    const clone=root.cloneNode(true);clone.querySelectorAll('details').forEach(n=>n.remove());assert.doesNotMatch(clone.textContent,/2026-10-17T22:00/);
  },fixture(),{},'en',format);
});

test('escapes labels, currency, IDs and timezone without executable markup',()=>{
  const dto=fixture(),bad='"/><img src=x onerror="boom">';
  dto.groups.devices['sensor.a'].area_name=bad;dto.groups.devices['sensor.a'].name=bad;dto.totals.currency=bad;dto.period.timezone=bad;
  dto.rates[0].profile.zones[0].label=bad;dto.alternatives[0].tariff_name=bad;
  for(const section of ['overview','rates','comparison'])withView(root=>{assert.equal(root.querySelector('img'),null);assert.equal(root.querySelector('[onerror]'),null);assert.ok(root.textContent.includes(bad));},dto,{section});
});

test('metadata names replace area and floor IDs, unknown remainder is hatched and separate',()=>{
  withView(root=>{assert.match(root.textContent,/Kuchnia/);assert.match(root.textContent,/Bez pokoju/);assert.match(root.textContent,/Niezmierzone/);assert.doesNotMatch(root.textContent,/room-id/);assert.ok(root.querySelector('.analysis-unmeasured'));});
  withView(root=>{assert.match(root.textContent,/Parter/);assert.doesNotMatch(root.textContent,/floor-id/);},fixture(),{level:'floors'});
});

test('rates retain history, separate components, original monthly fees and no activation',()=>withView(root=>{
  assert.match(root.textContent,/Nocna/);assert.match(root.textContent,/Dawna/);assert.match(root.textContent,/22:00/);assert.match(root.textContent,/Abonament/);
  assert.match(root.textContent,/2026/);assert.match(root.textContent,/brutto/);assert.match(root.textContent,/Inna/);assert.equal(root.querySelector('[data-analysis-action="activate"]'),null);
  assert.match(root.querySelector('[data-analysis-cost-components]').textContent,/0,01/);
  assert.equal(root.querySelectorAll('[data-analysis-monthly="subscription"]').length,1);
},fixture(),{section:'rates'}));

test('fixed fees are household only and never repeated in bins or rankings',()=>withView(root=>{
  assert.doesNotMatch(root.querySelector('[data-analysis-chart]').textContent,/0,01/);
  assert.doesNotMatch(root.querySelector('[data-analysis-groups]').textContent,/0,01/);
},fixture(),{view:'data'}));

test('signed comparison values are server values, null percent remains unknown and no index marker',()=>withView(root=>{
  assert.match(root.textContent,/-1 kWh/);assert.match(root.textContent,/-25/);assert.match(root.textContent,/0 kWh/);
  assert.ok(root.querySelector('[data-analysis-baseline="unknown"]'));assert.equal(root.querySelector('[data-analysis-marker]'),null);
  assert.match(root.querySelector('[data-analysis-comparison-groups]').textContent,/Brak danych/);
},fixture(),{section:'comparison'}));

test('positive delta carries plus and zero is not promoted to missing',()=>{
  const dto=fixture();dto.comparisons.previous.delta_kwh='1';dto.comparisons.previous.percent=0;
  withView(root=>{assert.match(root.textContent,/\+1 kWh/);assert.match(root.textContent,/0%/);},dto,{section:'comparison'});
});

test('missing snapshot remains honest and styling stays within the shared namespace',()=>withView((root,view)=>{
  assert.match(root.textContent,/Brak danych/);assert.ok(view.styles().includes('.energy-analysis-v53'));assert.ok(view.styles().includes('44px'));assert.ok(view.styles().includes('168px'));
},null));

test('partial literal bin stays missing rather than a fabricated zero or complete bill',()=>{
  const dto=fixture();dto.coverage={complete:false,ratio:0.6666666666666666,measured_source_seconds:7200,expected_source_seconds:10800};
  dto.totals={...dto.totals,kwh:null,total_cost:null,effective_price:null,energy_cost:null,variable_cost:null,usage_cost:null};
  dto.chart.bins[2]={...dto.chart.bins[2],kwh:null,usage_cost:null};
  withView(root=>{const rows=root.querySelectorAll('[data-analysis-bin]');assert.match(rows[2].textContent,/Brak danych/);assert.doesNotMatch(rows[2].textContent,/0 kWh/);},dto,{view:'data'});
});

test('shared formatter default respects HA server timezone and date/time preferences',()=>{
  const card={_hass:{locale:{language:'en',time_zone:'server',time_format:'12',date_format:'system'},config:{time_zone:'America/New_York'}}};
  const expected=createFormatUi.forHass(card._hass);
  const view=createEnergyAnalysisViewV53({card});
  const dom=new JSDOM(view.markup(fixture()));
  try {assert.ok(dom.window.document.body.textContent.includes(expected.range(fixture().period.start,fixture().period.end)));}
  finally {dom.window.close();}
});

test('DST fold mismatch supplies no marker, even when baseline has the same number of points',()=>{
  const dto=fixture();dto.chart.bins=[
    {start:'2026-10-25T00:00:00+00:00',local_start:'2026-10-25T02:00:00+02:00',fold:0,kwh:'1',usage_cost:'0.10'},
    {start:'2026-10-25T01:00:00+00:00',local_start:'2026-10-25T02:00:00+01:00',fold:1,kwh:'2',usage_cost:'0.20'}
  ];
  dto.comparisons.previous.baseline_analysis.chart.bins=[
    {start:'2026-10-24T00:00:00+00:00',local_start:'2026-10-24T02:00:00+02:00',fold:0,kwh:'4'},
    {start:'2026-10-24T01:00:00+00:00',local_start:'2026-10-24T03:00:00+02:00',fold:0,kwh:'5'}
  ];
  withView(root=>{assert.equal(root.querySelector('[data-analysis-marker]'),null);assert.ok(root.querySelector('[data-analysis-baseline="unknown"]'));},dto,{section:'comparison'});
});

function twoRooms(){
 const dto=fixture();dto.groups.devices['sensor.c']={name:'Lamp',area_id:'second',area_name:'Salon',kwh:'1',usage_cost:'0.1'};
 dto.groups.areas.second={kwh:'1',usage_cost:'0.1'};return dto;
}
test('group color stays attached to its identity when consumption changes rank',()=>{
 const dto=twoRooms();let before;
 withView(root=>{before=[...root.querySelectorAll('.analysis-ranking li')].find(row=>row.textContent.includes('Kuchnia')).querySelector('.analysis-rank').className;},dto);
 dto.groups.areas['room-id'].kwh='0.5';dto.groups.areas.second.kwh='4';
 withView(root=>{assert.equal([...root.querySelectorAll('.analysis-ranking li')].find(row=>row.textContent.includes('Kuchnia')).querySelector('.analysis-rank').className,before);},dto);
});
test('finite scientific Decimal strings stay visible and sort by exact value',()=>{
 const dto=twoRooms();dto.totals.kwh='1e-9';dto.groups.areas['room-id'].kwh='1e-9';dto.groups.areas.second.kwh='9e-10';
 dto.chart.bins[0].kwh='1e-9';const base=createFormatUi('en','UTC'),seen=[];
 withView(root=>{assert.ok(seen.includes('1e-9'));assert.match(root.querySelector('.analysis-ranking li').textContent,/Kuchnia/);},dto,{},'en',
  {...base,number:(value,options)=>{seen.push(value);return base.number(value,options);}});
});
