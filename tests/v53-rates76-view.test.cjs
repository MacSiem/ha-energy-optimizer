// Real captured schema-2 producer DTO. Only edge cases mutate detached copies.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const {createEnergyAnalysisViewV53}=require('../shared/ha-tools-energy-analysis-view.js');
const raw=fs.readFileSync(path.join(__dirname,'fixtures/analysis-wholeperiod-v53.json'));
const provenance=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/analysis-wholeperiod-v53-provenance.json'),'utf8'));
const fixture=()=>JSON.parse(raw);
function use(dto,fn,options={},language='en',format){
 const card={_hass:{locale:{language,time_zone:'server',time_format:'24'},config:{time_zone:'Europe/Warsaw'}}};
 const view=createEnergyAnalysisViewV53({card,format:format||createFormatUi.forHass(card._hass)});
 const dom=new JSDOM(view.markup(dto,{section:'rates',...options}));
 try{fn(dom.window.document.body,view,dom.window);}finally{dom.window.close();}
}
const node=(root,selector)=>{const value=root.querySelector(selector);assert.ok(value,selector);return value;};
const main=root=>{const copy=node(root,'[data-analysis-rates]').cloneNode(true);copy.querySelectorAll('details').forEach(n=>n.remove());return copy;};
const finiteWidths=root=>{for(const bar of root.querySelectorAll('[data-analysis-rate76-bar]')){const value=parseFloat(bar.style.width);assert.ok(Number.isFinite(value)&&value>=0&&value<=100,bar.outerHTML);}};

test('actual producer DTO and provenance are the input, with all exact period totals',()=>{
 assert.equal(crypto.createHash('sha256').update(raw).digest('hex'),provenance.sha256);
 assert.equal(fixture().snapshot_id,provenance.snapshot_id);
 assert.equal(provenance.totals.total_cost,'247.00');
 assert.equal(provenance.totals.energy_cost,'221.00');
 assert.equal(provenance.totals.variable_cost,'25.00');
 assert.equal(provenance.totals.fixed_cost,'1.00');
});

test('approved rates, schedules, monthly fees and validity are visible without opening history',()=>use(fixture(),root=>{
 const visible=main(root),rates=node(visible,'[data-analysis-rate76-current]');
 assert.match(rates.textContent,/Noc/);assert.match(rates.textContent,/Dzień/);
 assert.match(rates.textContent,/06:00–20:00/);
 assert.match(rates.textContent,/Default outside matching rules/);
 assert.match(rates.textContent,/0.5 EUR/);assert.match(rates.textContent,/0.1 EUR/);
 assert.match(rates.textContent,/31 EUR/);assert.match(rates.textContent,/month/);
 assert.match(rates.textContent,/gross/);assert.match(rates.textContent,/2026/);
 assert.match(rates.textContent,/Europe\/Warsaw/);
 assert.doesNotMatch(rates.textContent,/0.6 EUR|0.60 EUR/,'no invented combined rate');
 const history=node(root,'[data-analysis-rate-history]');assert.equal(history.open,false);
 assert.equal(history.querySelectorAll('.analysis-rate-version').length,1);
 assert.equal(root.querySelectorAll('[data-analysis-monthly="subscription"]').length,1);
 assert.match(history.textContent,/configured_valid_from/);assert.match(history.textContent,/2026-01-01/);
}));

test('period graphic uses producer energy, distribution, fixed and total values',()=>use(fixture(),root=>{
 const costs=node(root,'[data-analysis-rate76-cost]');
 assert.match(costs.textContent,/247 EUR/);assert.match(costs.textContent,/221 EUR/);
 assert.match(costs.textContent,/25 EUR/);assert.match(costs.textContent,/1 EUR/);
 const bars=costs.querySelectorAll('[data-analysis-rate76-bar]');assert.equal(bars.length,4);
 assert.ok(Math.abs(parseFloat(bars[0].style.width)-89.47368421052632)<1e-9);
 assert.ok(Math.abs(parseFloat(bars[1].style.width)-10.121457489878543)<1e-9);
 assert.ok(Math.abs(parseFloat(bars[3].style.width)-0.4048582995951417)<1e-9);
 assert.match(node(root,'[data-analysis-cost-components]').textContent,/247 EUR/);
 finiteWidths(root);
}));

test('whole period zones use verified source rows rather than selected chart bins',()=>{
 const dto=fixture();dto.chart.bins=[];
 use(dto,root=>{
  const zones=node(root,'[data-analysis-rate76-zones]');
  assert.match(zones.textContent,/Dzień/);assert.match(zones.textContent,/192 kWh/);assert.match(zones.textContent,/211.2 EUR/);
  assert.match(zones.textContent,/Noc/);assert.match(zones.textContent,/58 kWh/);assert.match(zones.textContent,/34.8 EUR/);
  assert.equal(zones.querySelectorAll('[data-analysis-rate76-bar]').length,2);
  assert.match(zones.textContent,/without fixed fees/);finiteWidths(zones);
 });
 dto.period_summary.window.start='2026-10-09T22:00:00Z';
 use(dto,root=>{const zones=node(root,'[data-analysis-rate76-zones]');assert.equal(zones.querySelector('[data-analysis-rate76-bar]'),null);assert.match(zones.textContent,/No data/);});
});

test('cost ranking follows selected room floor or device without household fees',()=>{
 const cases=[['areas','Office'],['floors','Upstairs'],['devices','Desk']];
 for(const [level,label] of cases)use(fixture(),root=>{
  const rank=node(root,'[data-analysis-rate76-groups]');assert.match(rank.textContent,new RegExp(label));
  const rows=rank.querySelectorAll('[data-analysis-rate76-group]');assert.match(rows[0].textContent,/Unmeasured.*196.8 EUR/);
  assert.match(rank.textContent,/49.2 EUR/);assert.match(rank.textContent,/exclude household fixed fees/);
  if(level==='areas')assert.match(rank.textContent,/No room.*0 EUR/);
  assert.equal(rank.querySelector('[data-analysis-action="activate"]'),null);finiteWidths(rank);
 },{level});
 const dto=fixture();dto.groups.areas.office.kwh='999';dto.groups.areas.office.usage_cost='1';
 dto.groups.areas.second={...dto.groups.areas.office,kwh:'1',usage_cost:'3'};
 dto.groups.devices['sensor.second']={name:'Other',area_id:'second',area_name:'Second'};
 use(dto,root=>{const rows=[...node(root,'[data-analysis-rate76-groups]').querySelectorAll('[data-analysis-rate76-group]')];assert.match(rows[1].textContent,/Second/);assert.match(rows[2].textContent,/Office/);});
});

test('known zero stays a zero cost rather than missing or an invented full bar',()=>{
 const dto=fixture();for(const key of ['energy_cost','variable_cost','legacy_combined_cost','usage_cost','fixed_cost','total_cost','effective_price'])dto.totals[key]='0.00';
 for(const row of dto.period_summary.zone_breakdown.zones){for(const key of ['energy_cost','variable_cost','legacy_combined_cost','usage_cost'])row[key]='0.00';for(const key of Object.keys(row.known_costs))row.known_costs[key]='0.00';}
 use(dto,root=>{const costs=node(root,'[data-analysis-rate76-cost]');assert.match(costs.textContent,/Zero cost/);assert.equal(costs.querySelectorAll('[data-analysis-rate76-bar]').length,4);assert.ok([...costs.querySelectorAll('[data-analysis-rate76-bar]')].every(bar=>bar.style.width==='0%'));assert.match(node(root,'[data-analysis-rate76-zones]').textContent,/0 EUR/);finiteWidths(root);});
 dto.totals.total_cost=null;
 use(dto,root=>{const costs=node(root,'[data-analysis-rate76-cost]');assert.equal(costs.querySelector('[data-analysis-rate76-bar]'),null);assert.match(costs.textContent,/No data/);});
});

test('partial evidence labels known amounts and never draws full-period cost shares',()=>{
 const dto=fixture();dto.coverage.complete=false;dto.totals.measurement_complete=false;dto.totals.pricing_complete=false;dto.totals.total_cost=null;
 const proof=dto.period_summary.zone_breakdown;proof.status='partial';proof.reason='incomplete_period';proof.reconciles_recorded_kwh=false;
 for(const row of proof.zones){row.complete=false;row.kwh=null;row.usage_cost=null;for(const key of ['energy_cost','variable_cost','legacy_combined_cost'])row[key]=null;}
 use(dto,root=>{assert.equal(node(root,'[data-analysis-rate76-cost]').querySelector('[data-analysis-rate76-bar]'),null);const zones=node(root,'[data-analysis-rate76-zones]');assert.equal(zones.querySelector('[data-analysis-rate76-bar]'),null);assert.match(zones.textContent,/Recorded: 192 kWh/);assert.match(zones.textContent,/Known energy cost.*192 EUR/);assert.match(zones.textContent,/Incomplete period/);});
});

test('negative amounts remain signed and are never converted into positive cost shares',()=>{
 const dto=fixture();Object.assign(dto.totals,{energy_cost:'-20.00',total_cost:'6.00'});
 dto.groups.areas.office.usage_cost='-2.50';
 const zone=dto.period_summary.zone_breakdown.zones[0];zone.usage_cost='-211.20';zone.energy_cost='-192.00';zone.known_costs.energy_cost='-192.00';
 use(dto,root=>{assert.match(node(root,'[data-analysis-rate76-cost]').textContent,/-20 EUR/);assert.equal(node(root,'[data-analysis-rate76-cost]').querySelector('[data-analysis-rate76-bar]'),null);assert.equal(node(root,'[data-analysis-rate76-zones]').querySelector('[data-analysis-rate76-bar]'),null);const group=node(root,'[data-analysis-rate76-group="office"]');assert.match(group.textContent,/-2.5 EUR/);assert.equal(group.querySelector('[data-analysis-rate76-bar]'),null);finiteWidths(root);});
});

test('mixed currencies or bases suppress comparable geometry and deltas, not original rate units',()=>{
 const dto=fixture();Object.assign(dto.totals,{currency:null,price_basis:null});
 dto.alternatives.push({tariff_id:'other',tariff_name:'Other currency',currency:'PLN',price_basis:'net',kwh:'250',total_cost:'50.00',delta_cost:'999.00',comparable:true});
 use(dto,root=>{assert.equal(node(root,'[data-analysis-rate76-cost]').querySelector('[data-analysis-rate76-bar]'),null);assert.equal(node(root,'[data-analysis-rate76-zones]').querySelector('[data-analysis-rate76-bar]'),null);assert.equal(node(root,'[data-analysis-rate76-groups]').querySelector('[data-analysis-rate76-bar]'),null);assert.match(node(root,'[data-analysis-rate76-current]').textContent,/0.5 EUR/);const alt=node(root,'[data-analysis-rate76-alternative]');assert.match(alt.textContent,/50 PLN/);assert.doesNotMatch(alt.textContent,/999/);assert.match(alt.textContent,/No comparable difference/);});
});

test('legacy combined rates and charges stay combined without invented energy distribution',()=>{
 const dto=fixture(),rate=dto.rates[0];rate.rate_semantics='legacy_combined';rate.legacy_combined_monthly='4.00';rate.profile.zones[0].energyRate='0.90';rate.profile.zones[0].variableRate=null;
 Object.assign(dto.totals,{energy_cost:null,variable_cost:null,legacy_combined_cost:'10.00',components_complete:false});
 use(dto,root=>{const visible=main(root);assert.match(visible.textContent,/Combined usage \/ kWh/);assert.match(visible.textContent,/Legacy combined monthly fee.*4 EUR/);assert.match(node(root,'[data-analysis-rate76-cost]').textContent,/Legacy combined usage.*10 EUR/);assert.equal(node(root,'[data-analysis-rate76-cost]').querySelector('[data-analysis-rate76-bar]'),null);assert.match(node(root,'[data-analysis-rate-history]').textContent,/0.9 EUR/);});
});

test('alternative cards copy server amounts and comparable delta with no activation or local subtraction',()=>{
 const dto=fixture();dto.alternatives.push({tariff_id:'other',tariff_name:'Other tariff',currency:'EUR',price_basis:'gross',kwh:'250',total_cost:'123.45',delta_cost:'-123.55',comparable:true});
 use(dto,root=>{const alt=node(main(root),'[data-analysis-rate76-alternative]');assert.match(alt.textContent,/123.45 EUR/);assert.match(alt.textContent,/-123.55 EUR/);assert.match(alt.textContent,/250 kWh/);assert.match(alt.textContent,/no activation/);assert.equal(alt.querySelector('button'),null);});
 dto.alternatives[1].comparable=false;
 use(dto,root=>{const alt=node(root,'[data-analysis-rate76-alternative]');assert.doesNotMatch(alt.textContent,/-123.55/);assert.match(alt.textContent,/No comparable difference/);});
});

test('Data mode retains the same cost facts and fixed fee details without decorative geometry',()=>use(fixture(),root=>{
 assert.equal(node(root,'[data-analysis-rates]').querySelector('[data-analysis-rate76-bar]'),null);
 assert.match(node(root,'[data-analysis-cost-components]').textContent,/221 EUR/);
 assert.match(node(root,'[data-analysis-rate76-zones]').textContent,/211.2 EUR/);
 assert.match(node(root,'[data-analysis-rate76-groups]').textContent,/196.8 EUR/);
 assert.ok(root.querySelector('[data-analysis-fee-details]'));
 assert.equal(node(root,'[data-analysis-action="view"][data-analysis-value="data"]').getAttribute('aria-pressed'),'true');
},{view:'data'}));

test('server Decimal strings reach shared formatter intact and untrusted labels stay text',()=>{
 const dto=fixture(),rawValue='221.0000000000000000000123456789',bad='<img src=x onerror="boom">',base=createFormatUi('en','UTC'),seen=[];
 dto.totals.energy_cost=rawValue;dto.rates[0].profile.zones[0].label=bad;dto.rates[0].provenance=bad;
 use(dto,root=>{assert.ok(seen.includes(rawValue));assert.ok(!seen.includes(Number(rawValue)));assert.equal(root.querySelector('img'),null);assert.equal(root.querySelector('[onerror]'),null);assert.ok(root.textContent.includes(bad));},{},'en',{...base,number:(value,options)=>{seen.push(value);return base.number(value,options);}});
});

test('PL and EN keep all amounts, preserve DTO, and offer isolated wrapping body14 meta12 layout',()=>{
 const dto=fixture(),before=JSON.stringify(dto);
 for(const language of ['pl','en'])for(const level of ['areas','floors','devices'])use(dto,(root,view)=>{
  const text=main(root).textContent;assert.match(text,/221 EUR/);assert.match(text,language==='pl'?/Stawki i koszty/:/Rates and costs/);
  const css=view.styles();assert.match(css,/\.analysis-rate76[^{]*\{[^}]*font-size:14px/);assert.match(css,/\.analysis-rate76-meta\{[^}]*font-size:12px/);assert.match(css,/@container energy-analysis \(max-width:600px\)/);assert.match(css,/\.analysis-rate76-layout\{[^}]*minmax\(0,1fr\)/);assert.doesNotMatch(css,/font-size:11px|line-clamp|text-overflow:ellipsis/);
 },{level},language);
 assert.equal(JSON.stringify(dto),before);
});

// Projected future rates78 contract only. This is not a captured producer proof;
// the existing real producer fixture above remains unchanged and has no field.
const projectedFutureContract=()=>{
 const dto=fixture();dto.rates[0].zone_usage_rates=[{zone_id:'low',usage_rate:'0.60'},{zone_id:'high',usage_rate:'1.10'}];return dto;
};
test('optional future server combined rates are exact Decimal strings, not client sums',()=>{
 const dto=projectedFutureContract(),seen=[],base=createFormatUi('en','UTC');
 dto.rates[0].zone_usage_rates[0].usage_rate='0.600000000000000000000000001';
 use(dto,root=>{
  const current=node(main(root),'[data-analysis-rate76-current]');
  const low=node(current,'[data-analysis-rate76-total="low"]');assert.match(low.textContent,/EUR/);
  assert.ok(seen.includes('0.600000000000000000000000001'));assert.ok(seen.includes('1.10'));
  assert.match(current.textContent,/Total \/ kWh/);
 },{},'en',{...base,number:(value,options)=>{seen.push(value);return base.number(value,options);}});
 const zero=projectedFutureContract();zero.rates[0].zone_usage_rates[0].usage_rate='0.00';
 use(zero,root=>assert.equal(node(root,'[data-analysis-rate76-total="low"]').textContent,'0 EUR'));
});
test('absent malformed duplicate or foreign combined-rate entries remain unavailable without local fallback',()=>{
 use(fixture(),root=>{for(const value of root.querySelectorAll('[data-analysis-rate76-total]'))assert.equal(value.textContent,'No data');});
 for(const bad of [null,[],[{zone_id:'low',usage_rate:0.6},{zone_id:'high',usage_rate:'1.10'}],
  [{zone_id:'low',usage_rate:'0.60'},{zone_id:'low',usage_rate:'0.60'}],
  [{zone_id:'foreign',usage_rate:'0.60'},{zone_id:'high',usage_rate:'1.10'}],
  [{zone_id:'low',usage_rate:'NaN'},{zone_id:'high',usage_rate:'1.10'}],
  [{zone_id:'low',usage_rate:'Infinity'},{zone_id:'high',usage_rate:'1.10'}]]){
  const dto=fixture();dto.rates[0].zone_usage_rates=bad;
  use(dto,root=>{const values=root.querySelectorAll('[data-analysis-rate76-total]');assert.equal(values.length,2);for(const value of values)assert.equal(value.textContent,'No data');});
 }
 const dto=projectedFutureContract();dto.rates[0].zone_usage_rates[0].usage_rate=null;
 use(dto,root=>{assert.equal(node(root,'[data-analysis-rate76-total="low"]').textContent,'No data');assert.equal(node(root,'[data-analysis-rate76-total="high"]').textContent,'1.1 EUR');});
});
