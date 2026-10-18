"use strict";
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createEnergyAnalysisV53} = require('../shared/ha-tools-energy-analysis.js');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve=>setImmediate(resolve));
function dto(period='day',comparison) {
  const result = {schema:2,snapshot_id:'a'.repeat(64),measurement_fingerprint:'b'.repeat(64),
    generated_at:'2026-01-03T00:00:00+00:00',
    context:{measurement_timezone:'UTC',period_kind:period,tariff_revision:2},
    period:{kind:period,timezone:'UTC',start:'2026-01-01T00:00:00+00:00',end:'2026-01-02T00:00:00+00:00',local_start:'2026-01-01T00:00:00+00:00'},
    status:'partial',pricing_status:'partial',
    totals:{kwh:'0',energy_cost:'-0.123456789012345678901234567890',variable_cost:0,
      usage_cost:null,fixed_cost:'0.00',total_cost:null,effective_price:null,known_costs:{energy_cost:'-0.12'}},
    chart:{status:'ready',timezone:'UTC',grain:period==='year'?'month':period==='day'?'hour':'day',bins:[
      {from:1767225600000,to:1767229200000,start:'2026-01-01T00:00:00+00:00',end:'2026-01-01T01:00:00+00:00',kwh:'0',energy_cost:'-0.12',usage_cost:null}]},
    groups:{devices:{'sensor.x':{kwh:'0',usage_cost:null}},areas:{},floors:{},unassigned:{kwh:0},unmeasured:{kwh:null}}};
  if (comparison) { result.context.comparison_kind=comparison; result.comparisons = {[comparison]:{status:'unknown',delta_kwh:null,reason:'no_common_measurement'}}; }
  return result;
}
function setup(options={}) {
  const calls=[],changes=[],pending=[];
  const card={isConnected:true,_hass:{user:{id:'one',is_active:true},connection:{connected:true},config:{time_zone:'UTC'}}};
  card._hass.callWS = request => { calls.push(clone(request)); return new Promise((resolve,reject)=>pending.push({resolve,reject})); };
  const controller=createEnergyAnalysisV53({card,onChange:s=>changes.push(s),...options});
  return {card,calls,changes,pending,c:controller};
}
async function settle(s,index=0,value=dto()) { s.pending[index].resolve(value); await tick(); }
test('construction, connect and unused mounted cards perform no IO or subscriptions',async()=>{
  const s=setup();s.card._hass.connection.subscribeEvents=()=>assert.fail('unexpected subscription');
  assert.equal(s.c.state().status,'idle');s.c.connect();await tick();assert.equal(s.calls.length,0);
  s.c.disconnect();await s.c.read({period:'day'});assert.equal(s.calls.length,0);
});
test('only known selection fields reach WS; exact Decimal strings, null and zero survive',async()=>{
  const s=setup();s.c.connect();const value=dto();const before=clone(value);
  const p=s.c.read({period:'day',anchor:'2026-01-01',comparison:'mean7',user_id:'attacker',now:'future',profile:{energyRate:0}});
  assert.deepEqual(s.calls,[{type:'ha_tools_email/energy_analysis',period:'day',anchor:'2026-01-01',comparison:'mean7'}]);
  value.context.period_anchor='2026-01-01';value.period.calendar_local_end='2026-01-02T00:00:00+00:00';
  value.context.comparison_kind='mean7';value.comparisons={mean7:{status:'unknown',delta_kwh:null}};
  await settle(s,0,value);const result=await p;
  assert.equal(result.status,'ready');assert.deepEqual(result.snapshot.totals,before.totals);assert.deepEqual(value.totals,before.totals);
});
test('states, callback snapshots, response and cached DTO are detached',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});const input=dto();await settle(s,0,input);
  const result=await p;result.snapshot.totals.kwh='99';input.totals.kwh='88';s.changes.at(-1).snapshot.totals.kwh='77';
  const state=s.c.state();state.selection.period='year';state.snapshot.groups.devices['sensor.x'].kwh='66';
  const cached=await s.c.read({period:'day'});assert.equal(cached.snapshot.totals.kwh,'0');
  assert.equal(cached.snapshot.groups.devices['sensor.x'].kwh,'0');assert.equal(cached.selection.period,'day');assert.equal(s.calls.length,1);
});
test('replacement hass wrapper with same connection/user/zone preserves cached last DTO',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});await settle(s);await p;
  s.card._hass={...s.card._hass,user:{...s.card._hass.user},config:{...s.card._hass.config}};
  assert.equal((await s.c.read({period:'day'})).status,'ready');assert.equal(s.calls.length,1);
});
test('duplicate in-flight reads dedupe; raw wire plus one newest queued selection stays bounded',async()=>{
  const s=setup();s.c.connect();const first=s.c.read({period:'day'});const duplicate=s.c.read({period:'day'});
  const abandoned=s.c.read({period:'week'});const newest=s.c.read({period:'month'});
  assert.equal(s.calls.length,1);assert.equal((await abandoned).snapshot,null);
  await settle(s);await first;await duplicate;assert.equal(s.calls.length,2);assert.equal(s.calls[1].period,'month');
  assert.ok(!s.changes.some(v=>v.status==='ready' && v.selection.period==='day'));
  await settle(s,1,dto('month'));assert.equal((await newest).snapshot.period.kind,'month');
});
for (const edge of ['user','connection','zone','offline','inactive']) test(`late ${edge} context response cannot publish`,async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});
  if(edge==='user')s.card._hass.user={id:'two'};
  if(edge==='connection')s.card._hass.connection={connected:true};
  if(edge==='zone')s.card._hass.config={time_zone:'Europe/Warsaw'};
  if(edge==='offline')s.card._hass.connection.connected=false;
  if(edge==='inactive')s.card._hass.user.is_active=false;
  await settle(s);await p;assert.equal(s.c.state().snapshot,null);assert.ok(!s.changes.some(v=>v.status==='ready'));
});
test('identity changes synchronously hide an already cached snapshot on state()',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});await settle(s);await p;
  s.card._hass.user.id='two';assert.equal(s.c.state().snapshot,null);assert.equal(s.c.state().status,'idle');
});
test('explicit invalidation hides cached DTO and fences late requests; next read refetches',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});s.c.invalidate();
  assert.equal(s.c.state().snapshot,null);const next=s.c.read({period:'day'});assert.equal(s.calls.length,1);
  await settle(s);await p;assert.equal(s.calls.length,2);await settle(s,1);assert.equal((await next).status,'ready');
  s.c.invalidate();assert.equal(s.c.state().snapshot,null);assert.equal(s.changes.at(-1).status,'idle');
});
test('disconnect clears cache and queued selection; late settlement and reconnect do not auto-fetch',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});const queued=s.c.read({period:'week'});
  s.c.disconnect();assert.equal((await queued).snapshot,null);await settle(s);await p;
  await s.c.read({period:'day'});s.c.connect();await tick();assert.equal(s.calls.length,1);
  const next=s.c.read({period:'day'});await settle(s,1);assert.equal((await next).status,'ready');
});
test('stale rejected request cannot expose an error or become an unhandled rejection',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});s.c.disconnect();s.pending[0].reject({code:'unauthorized'});
  assert.equal((await p).status,'idle');assert.equal(s.c.state().error,null);
});
test('denied request clears visible snapshot and returns an explicit error state',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});s.pending[0].reject({code:'unauthorized'});
  assert.equal((await p).error,'unauthorized');assert.equal(s.c.state().snapshot,null);
  const retry=s.c.read({period:'day'});await settle(s,1);assert.equal((await retry).status,'ready');
});
test('synchronous WS failure is handled; throwing callback does not leave wire occupied',async()=>{
  const s=setup({onChange:()=>{throw Error('consumer');}});s.c.connect();s.card._hass.callWS=()=>{throw Error('network');};
  assert.equal((await s.c.read({period:'day'})).error,'energy_analysis_unavailable');
});
for (const selection of [null,{}, {period:'all'}, {period:'day',anchor:'2026-02-30'},
  {period:'day',anchor:'9999-01-01'},{period:'day',anchor:'2026-1-1'},
  {period:'week',comparison:'mean7'},{period:'month',comparison:'same_weekday'},
  {period:'day',comparison:'year_ago'},{period:'day',anchor:null}]) test(`invalid selection is rejected before IO: ${JSON.stringify(selection)}`,async()=>{
  const s=setup();s.c.connect();assert.equal((await s.c.read(selection)).status,'error');assert.equal(s.calls.length,0);
});
for (const mutate of [r=>r.schema=1,r=>r.snapshot_id='invalid',r=>r.measurement_fingerprint='z'.repeat(64),
  r=>r.period.start='yesterday',r=>r.period.end=r.period.start,r=>r.period.kind='year',
  r=>r.context.measurement_timezone='Europe/Warsaw',r=>delete r.groups,r=>r.groups.devices=[],
  r=>r.chart.bins={},r=>r.chart.bins[0].start='bad',r=>r.chart.bins[0].to=0,
  r=>r.chart.timezone='Europe/Warsaw',r=>r.chart.grain='month',r=>r.totals.total_cost='NaN',r=>r.totals.energy_cost=Infinity,
  r=>r.groups.devices['sensor.x'].usage_cost='Infinity',r=>r.chart.bins[0].kwh='bad']) test(`malformed DTO rejected: ${mutate}`,async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});const value=dto();mutate(value);await settle(s,0,value);
  assert.equal((await p).error,'invalid_analysis_response');assert.equal(s.c.state().snapshot,null);
});
test('one-last-DTO cache refetches when returning to an older selection',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day'});await settle(s);await p;
  const q=s.c.read({period:'year',comparison:'year_ago'});await settle(s,1,dto('year','year_ago'));await q;
  const back=s.c.read({period:'day'});assert.equal(s.calls.length,3);await settle(s,2);await back;
});
test('refresh TTL expires only on explicit read and never installs background timers',async t=>{
  t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.parse('2026-01-03T00:00:00Z')});
  const s=setup({refreshMs:100});s.c.connect();const p=s.c.read({period:'day'});await settle(s);await p;
  t.mock.timers.tick(101);assert.equal(s.calls.length,1);const q=s.c.read({period:'day'});assert.equal(s.calls.length,2);
  await settle(s,1);await q;s.c.disconnect();t.mock.timers.tick(10000);assert.equal(s.calls.length,2);
});

// Actual synthetic producer DTO, backend791a6ed, FIFO21151; no private HA data.
const producerDto=require('./fixtures/analysis-partial-v53.json');
test('actual qualified backend partial-group DTO passes without changing one server field',async()=>{
  const s=setup();s.c.connect();const p=s.c.read({period:'day',anchor:'2026-10-10',comparison:'previous'});
  await settle(s,0,clone(producerDto));const result=await p;
  assert.equal(result.status,'ready');assert.deepEqual(result.snapshot,producerDto);
});
for(const period of ['day','year']) test(`documented 512 consumers and ${period} comparison fit the DTO validator`,async()=>{
  const value=clone(producerDto), current=value.groups, comparison=value.comparisons.previous.groups;
  const baseline=value.comparisons.previous.baseline_analysis.groups;
  for(const [groups,isComparison] of [[current,false],[baseline,false],[comparison,true]]) {
    const device=clone(groups.devices['sensor.device']), area=clone(groups.areas.office), floor=clone(groups.floors.upstairs);
    groups.devices={};groups.areas={};groups.floors={};
    // This is a shape-boundary fixture, not a new arithmetic/conservation oracle.
    groups.reconciles_household_delta=false;groups.reconciles_household_cost_delta=false;
    for(let index=0;index<512;index++) {
      const id=String(index).padStart(3,'0');
      groups.devices['sensor.device_'+id]={...clone(device),...(!isComparison?{area_id:'area_'+id,floor_id:'floor_'+id}: {})};
      groups.areas['area_'+id]=clone(area);groups.floors['floor_'+id]=clone(floor);
    }
  }
  if(period==='year') {
    value.context.period_kind='year';value.context.period_anchor='2025-01-01';
    Object.assign(value.period,{kind:'year',start:'2025-01-01T00:00:00+00:00',end:'2026-01-01T00:00:00+00:00',
      local_start:'2025-01-01T00:00:00+00:00',calendar_local_end:'2026-01-01T00:00:00+00:00'});
    const start=Date.parse(value.period.start),hour=3600000;
    value.buckets=Array.from({length:8760},(_,i)=>({...clone(producerDto.buckets[0]),from:start+i*hour,to:start+(i+1)*hour}));
    value.chart.grain='month';value.chart.bins=Array.from({length:12},(_,m)=>{
      const from=Date.UTC(2025,m,1),to=Date.UTC(2025,m+1,1);
      return {...clone(producerDto.chart.bins[0]),from,to,start:new Date(from).toISOString(),end:new Date(to).toISOString()};
    });
  }
  const s=setup();s.c.connect();const p=s.c.read({period,anchor:period==='year'?'2025-01-01':'2026-10-10',comparison:'previous'});
  await settle(s,0,value);const result=await p;
  assert.equal(result.status,'ready');assert.equal(Object.keys(result.snapshot.groups.devices).length,512);
  assert.deepEqual(result.snapshot.comparisons.previous.groups,comparison);
});
