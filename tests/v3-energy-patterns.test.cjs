const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const source = readFileSync(join(__dirname, '..', 'src', 'optimizer.js'), 'utf8');
const H = 3600000;
function setup() {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  dom.window.eval(source + '\nwindow.patternsFactoryForTest = createEnergyPatternsV3;');
  const card = dom.window.document.createElement('ha-energy-optimizer');
  dom.window.document.body.append(card);
  let calls = 0;
  card._hass = { user: { id: 'measurement-fixture', is_admin: true }, connection: { connected: true }, language: 'en', locale: { language: 'en' }, config: { time_zone: 'Europe/Warsaw' }, states: {}, callWS: () => { calls++; throw Error('Unexpected WS'); } };
  card._schedule = () => {};
  card._bindTariffSettings = () => {};
  card._resetTariffContext = () => {};
  card._tariffDetailsMarkup = () => '';
  card._getTariffV3 = () => tariff();
  card._config.show_support = false;
  card._hasRealData = true;
  card._currentTab = 'patterns';
  return { dom, card, factory: dom.window.patternsFactoryForTest, calls: () => calls };
}
function tariff() {
  return { priceBuckets(rows) { return { complete: false, energyCost: null, variableCost: null, usageCost: null, kwh: null,
    currency: 'EUR', priceBasis: 'gross', timezone: 'Europe/Warsaw', fixedMonthly: 12,
    rows: rows.map((r, i) => r.kwh === null || i === 2 ? { from: r.from, to: r.to, available: false, reason: i === 2 ? 'mixed_rate_bucket' : 'invalid_measurement' } :
      { ...r, available: true, energyCost: r.kwh * -0.25, variableCost: r.kwh * 0.1, usageCost: r.kwh * -0.15, zone: 'night' }) }; } };
}
function model(start = '2026-10-25T00:00:00Z', values = [0, 2, 4, null]) {
  const from = Date.parse(start);
  return { ids: ['sensor.grid'], zone: 'Europe/Warsaw', start: from, end: from + values.length * H,
    points: new Map(values.map((kwh, i) => [from + i * H, { kwh }])) };
}
const plain = value => JSON.parse(JSON.stringify(value));
test('typed exact rows preserve zero/null, absolute repeated hour identity, separate cost units and fixed metadata', () => {
  const { dom, factory } = setup();
  try {
    assert.equal(dom.window.createEnergyPatternsV3, undefined, 'factory must not add a window API');
    const data = factory(model(), tariff(), { days: 7 });
    assert.equal(data.hours.length, 4);
    assert.deepEqual(plain(data.hours.map(r => r.kwh)), [0, 2, 4, null]);
    assert.equal(data.hours[0].hour, data.hours[1].hour);
    assert.notEqual(data.hours[0].id, data.hours[1].id);
    assert.notEqual(data.hours[0].offset, data.hours[1].offset);
    assert.equal(data.hours[0].energyCost, 0);
    assert.equal(data.hours[1].energyCost, -0.5);
    assert.equal(data.hours[1].variableCost, 0.2);
    assert.equal(data.hours[2].energyCost, null);
    assert.equal(data.hours[2].priceMissing, 'mixed_rate_bucket');
    assert.equal(data.fixedMonthly, 12);
    assert.equal(data.days[0].kwh, null);
    assert.equal(data.days[0].energyCost, null);
    assert.equal(data.days[0].complete, false);
    assert.equal(data.hours[1].unit, 'kWh');
    assert.equal(data.hours[1].currency, 'EUR');
    assert.equal(data.hours[1].timezone, 'Europe/Warsaw');
    assert.deepEqual(plain(data.hours[1].source), ['sensor.grid']);
  } finally { dom.window.close(); }
});
test('spring DST has 23 measured identities; missing bucket is null, never an invented zero', () => {
  const { dom, factory } = setup();
  try {
    const m = model('2026-03-28T23:00:00Z', Array(23).fill(1));
    const d = factory(m, tariff(), { days: 7 });
    assert.equal(d.days.length, 1);
    assert.equal(d.days[0].complete, true);
    assert.equal(d.days[0].kwh, 23);
    assert.equal(d.hours.some(r => r.hour === 2), false);
    m.points.delete(m.start + 5 * H);
    const missing = factory(m, tariff(), { days: 7 });
    assert.equal(missing.hours.length, 23);
    assert.equal(missing.hours[5].kwh, null);
    assert.equal(missing.hours[5].missing, true);
    assert.equal(missing.days[0].kwh, null);
  } finally { dom.window.close(); }
});
test('fall DST full day retains 25 measurements and weekday summary counts complete measured days only', () => {
  const { dom, factory } = setup();
  try {
    const d = factory(model('2026-10-24T22:00:00Z', Array(25).fill(1)), tariff(), { days: 7 });
    assert.equal(d.hours.length, 25);
    assert.equal(d.days[0].kwh, 25);
    assert.equal(d.weekdays[0].count, 1);
    assert.equal(d.weekdays[0].kwh, 25);
  } finally { dom.window.close(); }
});
test('7/30 loaded windows are clipped visibly; no refetch, exact chart/data and keyboard selection survives locale rerender', () => {
  const { dom, card, calls } = setup();
  try {
    card._energyModel = model('2026-10-24T22:00:00Z', Array(25).fill(1));
    card._render();
    const root = card.shadowRoot;
    root.querySelector('[data-pattern-control="resolution"]').value = 'hour';
    root.querySelector('[data-pattern-control="resolution"]').dispatchEvent(new dom.window.Event('change'));
    let detail = root.querySelector('[data-pattern-control="point"]');
    detail.focus();
    detail.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    detail.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const selected = card._patternsState.selected;
    assert.equal(selected, String(card._energyModel.start + H));
    card.hass = { ...card._hass, language: 'pl', locale: { language: 'pl' } };
    assert.equal(card._patternsState.selected, selected);
    assert.equal(root.activeElement.dataset.patternControl, 'point');
    card._energyModel.points.set(card._energyModel.start + H, { kwh: 3 });
    card._render();
    assert.equal(card._patternsState.selected, selected);
    assert.match(root.querySelector('[data-pattern-detail]').textContent, /3 kWh/);
    assert.equal(root.activeElement.dataset.patternControl, 'point');
    root.querySelector('[data-pattern-control="data"]').click();
    assert.equal(root.activeElement.dataset.patternControl, 'data');
    assert.equal(root.querySelector('[data-pattern-row="' + selected + '"]').dataset.kwh, '3');
    assert.equal(root.querySelector('[data-pattern-row="' + selected + '"]').dataset.energyCost, '-0.75');
    root.querySelector('[data-pattern-control="period"]').value = '30';
    root.querySelector('[data-pattern-control="period"]').dispatchEvent(new dom.window.Event('change'));
    assert.equal(card._patternsDataset.requestedDays, 30);
    assert.equal(card._patternsDataset.partialWindow, true);
    assert.equal(calls(), 0);
    // Identity changes cannot carry a stale selected absolute row into a new source.
    card._energyModel = { ...model('2026-11-01T00:00:00Z', [9]), ids: ['sensor.other'] };
    card._render();
    assert.notEqual(card._patternsState.selected, selected);
    assert.doesNotMatch(root.querySelector('#patterns').textContent, /sensor.grid/);
    assert.match(root.querySelector('#patterns').textContent, /sensor.other/);
    assert.equal(calls(), 0);
  } finally { dom.window.close(); }
});
test('chart gaps break paths and currency charts retain negative numeric axes without kWh mixing', () => {
  const { dom, card } = setup();
  try {
    card._energyModel = model(); card._render();
    const root = card.shadowRoot;
    const resolution = root.querySelector('[data-pattern-control="resolution"]');
    resolution.value = 'hour'; resolution.dispatchEvent(new dom.window.Event('change'));
    let metric = root.querySelector('[data-pattern-control="metric"]');
    metric.value = 'energyCost'; metric.dispatchEvent(new dom.window.Event('change'));
    const svg = root.querySelector('[data-pattern-chart]');
    assert.equal(svg.dataset.unit, 'EUR');
    assert.equal(svg.querySelectorAll('[data-pattern-segment]').length, 1);
    assert.match(svg.textContent, /-0.5/);
    assert.doesNotMatch(svg.textContent, /kWh/);
    root.querySelector('[data-pattern-control="point"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    assert.equal(card._patternsState.selected, String(card._energyModel.end - H));
    assert.match(root.querySelector('[data-pattern-detail]').textContent, /Missing measurement/);
  } finally { dom.window.close(); }
});

test('a partial loaded Recorder model remains visible without claiming a complete dashboard total', async () => {
  const { dom, card } = setup();
  try {
    const NativeDate = dom.window.Date;
    const now = Date.parse('2026-10-12T12:30:00Z');
    dom.window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
    card._hasRealData = false;
    card._loadSharedTariffProfile = async () => {};
    card._hass.callWS = async message => ({
      'energy/get_prefs': { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }] },
      'recorder/get_statistics_metadata': { 'sensor.grid': { has_sum: true, statistics_unit_of_measurement: 'kWh' } },
      'recorder/statistics_during_period': { 'sensor.grid': [{ start: '2026-10-12T11:00:00Z', change: 2 }] }
    })[message.type];
    await card._fetchEnergyStats();
    assert.equal(card._hasRealData, false);
    assert.ok(card._energyModel.points);
    assert.match(card._getTemplate(), /statistics could not be loaded/);
    assert.ok(card.shadowRoot.querySelector('#patterns'));
    assert.equal(card._patternsDataset.hours.find(r => r.from === Date.parse('2026-10-12T11:00:00Z')).kwh, 2);
    assert.equal(card._patternsDataset.days.at(-1).kwh, null);
  } finally { dom.window.close(); }
});
test('full local day cannot be inferred for half-hour timezone boundaries from absolute hourly aggregates', () => {
  const { dom, factory } = setup();
  try {
    const m = { ...model('2026-10-11T19:00:00Z', Array(24).fill(1)), zone: 'Asia/Kolkata' };
    const d = factory(m, tariff());
    assert.equal(d.hours[0].minute, 30);
    assert.equal(d.days.every(r => r.kwh === null), true);
  } finally { dom.window.close(); }
});


test('real canonical tariff retains negative/zero prices and rejects a mixed-rate hour without apportioning it', () => {
  const { dom, factory } = setup();
  try {
    const { createEnergyTariffV3 } = require('../shared/ha-tools-energy-tariff.js');
    const profile = { schema: 1, name: 'Measured tariff', currency: 'CHF', timezone: 'Europe/Warsaw',
      clock: { mode: 'civil' }, priceBasis: 'gross', fixedMonthly: 17, allowNegativeEnergy: true,
      zones: [{ id: 'unused', energyRate: 0, variableRate: 0 }], rules: [], dynamic: { intervals: [
        { from: '2026-10-25T00:00Z', to: '2026-10-25T01:00Z', energyRate: -0.5, variableRate: 0.2 },
        { from: '2026-10-25T01:00Z', to: '2026-10-25T02:00Z', energyRate: 0, variableRate: 0 },
        { from: '2026-10-25T02:00Z', to: '2026-10-25T02:30Z', energyRate: 1, variableRate: 0.1 },
        { from: '2026-10-25T02:30Z', to: '2026-10-25T03:00Z', energyRate: 2, variableRate: 0.1 }
      ] } };
    const tariffModel = createEnergyTariffV3(profile);
    assert.equal(tariffModel.valid, true);
    const m = model(undefined, [2, 3, 4, null]);
    const before = plain([...m.points]);
    const data = factory(m, tariffModel);
    assert.deepEqual(plain(data.hours.map(r => r.energyCost)), [-1, 0, null, null]);
    assert.deepEqual(plain(data.hours.map(r => r.variableCost)), [0.4, 0, null, null]);
    assert.equal(data.hours[2].priceMissing, 'mixed_rate_bucket');
    assert.equal(data.hours[3].missing, true);
    assert.equal(data.fixedMonthly, 17);
    assert.equal(data.hours[0].currency, 'CHF');
    assert.deepEqual(plain([...m.points]), before, 'projection must not modify measurements');
  } finally { dom.window.close(); }
});
test('7 and 30 choose distinct loaded calendar windows and expose exact matching chart/table values', () => {
  const { dom, card, calls } = setup();
  try {
    const m = { ...model('2026-04-01T00:00Z', Array(35 * 24).fill(1)), zone: 'UTC' };
    card._energyModel = m; card._render();
    assert.equal(card._patternsDataset.days.length, 7);
    assert.equal(card._patternsDataset.days[0].key, '2026-04-29');
    const period = card.shadowRoot.querySelector('[data-pattern-control="period"]');
    period.value = '30'; period.dispatchEvent(new dom.window.Event('change'));
    assert.equal(card._patternsDataset.days.length, 30);
    assert.equal(card._patternsDataset.days[0].key, '2026-04-06');
    assert.equal(card._patternsDataset.partialWindow, false);
    const plotted = [...card.shadowRoot.querySelectorAll('[data-pattern-value]')].map(el => [el.dataset.patternId, el.dataset.patternValue]);
    card.shadowRoot.querySelector('[data-pattern-control="data"]').click();
    const tabulated = [...card.shadowRoot.querySelectorAll('[data-pattern-row]')].map(el => [el.dataset.patternRow, el.dataset.kwh]);
    assert.deepEqual(plotted, tabulated);
    assert.equal(calls(), 0);
  } finally { dom.window.close(); }
});
test('unknown variable fee does not invalidate known energy cost or silently become a zero fee', () => {
  const { dom, factory } = setup();
  try {
    const { createEnergyTariffV3 } = require('../shared/ha-tools-energy-tariff.js');
    const t = createEnergyTariffV3({ schema: 1, currency: 'EUR', timezone: 'UTC', clock: { mode: 'civil' }, priceBasis: 'net',
      defaultZone: 'flat', zones: [{ id: 'flat', energyRate: 0 }], rules: [] });
    const data = factory({ ...model('2026-04-01T00:00Z', Array(24).fill(2)), zone: 'UTC' }, t);
    assert.equal(data.days[0].energyCost, 0);
    assert.equal(data.days[0].variableCost, null);
    assert.equal(data.days[0].usageCost, null);
    assert.equal(data.days[0].variableMissing, true);
    assert.equal(data.days[0].priceMissing, null);
  } finally { dom.window.close(); }
});
test('partial date is exposed even when all seven local date keys are present', () => {
  const { dom, factory } = setup();
  try {
    const m = { ...model('2026-04-01T06:00Z', Array(6 * 24 + 18).fill(0)), zone: 'UTC' };
    const data = factory(m, tariff());
    assert.equal(data.availableDays, 7);
    assert.equal(data.partialWindow, true);
    assert.equal(data.days[0].kwh, null);
    assert.equal(data.days[1].kwh, 0);
  } finally { dom.window.close(); }
});
test('keyboard Home/End/arrows/Enter use one focused navigator; resize and detach release the observer', () => {
  const { dom, card, calls } = setup();
  const observers = [];
  dom.window.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  };
  try {
    card._energyModel = model(); card._render();
    const root = card.shadowRoot;
    const resolution = root.querySelector('[data-pattern-control="resolution"]');
    resolution.value = 'hour'; resolution.dispatchEvent(new dom.window.Event('change'));
    for (const [key, index] of [['Home', 0], ['ArrowRight', 1], ['ArrowDown', 2], ['ArrowLeft', 1], ['ArrowUp', 0], ['End', 3], ['Enter', 3]]) {
      const navigator = root.querySelector('[data-pattern-control="point"]'); navigator.focus();
      navigator.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
      assert.equal(card._patternsState.selected, String(card._energyModel.start + index * H));
      assert.equal(root.activeElement.dataset.patternControl, 'point');
    }
    const observer = observers.at(-1), selected = card._patternsState.selected;
    observer.callback();
    assert.equal(card._patternsState.selected, selected);
    assert.equal(root.activeElement.dataset.patternControl, 'point');
    card.remove();
    assert.equal(observers.every(o => o.disconnected), true);
    assert.equal(calls(), 0);
  } finally { dom.window.close(); }
});
test('ordinary hass refresh and null session retain focus or clear stale rows immediately', () => {
  const { dom, card, calls } = setup();
  try {
    card._firstHassRender = true; card._lastStatsFetch = Date.now(); card._lastRenderTime = 0;
    card._energyModel = model(); card._render();
    card.shadowRoot.querySelector('[data-pattern-control="metric"]').focus();
    card.hass = { ...card._hass, states: { 'sun.sun': { state: 'above_horizon' } } };
    assert.equal(card.shadowRoot.activeElement.dataset.patternControl, 'metric');
    card.hass = null;
    assert.equal(card._energyModel, null);
    assert.equal(card.shadowRoot.querySelector('[data-pattern-row]'), null);
    assert.doesNotMatch(card.shadowRoot.textContent, /sensor.grid/);
    assert.equal(calls(), 0);
  } finally { dom.window.close(); }
});


test('view/metric/point controls reuse the priced projection; a period or source refresh reprices loaded measurements', () => {
  const { dom, card, calls } = setup();
  let priced = 0;
  const baseTariff = tariff();
  card._getTariffV3 = () => ({ priceBuckets(...args) { priced++; return baseTariff.priceBuckets(...args); } });
  try {
    card._energyModel = model(); card._render();
    const initial = priced;
    for (const view of ['data', 'chart']) card.shadowRoot.querySelector(`[data-pattern-control="${view}"]`).click();
    const metric = card.shadowRoot.querySelector('[data-pattern-control="metric"]');
    metric.value = 'variableCost'; metric.dispatchEvent(new dom.window.Event('change'));
    card.shadowRoot.querySelector('[data-pattern-control="point"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.equal(priced, initial);
    const period = card.shadowRoot.querySelector('[data-pattern-control="period"]');
    period.value = '30'; period.dispatchEvent(new dom.window.Event('change'));
    assert.equal(priced, initial + 1);
    assert.equal(calls(), 0);
  } finally { dom.window.close(); }
});

// Owner additions: the same finite-cost contract must survive daily projection.
test('daily projection cannot render a nonfinite total even when each measured bucket is finite', () => {
 const {dom,factory}=setup();try {
 const {createEnergyTariffV3}=require('../shared/ha-tools-energy-tariff.js');
 const t=createEnergyTariffV3({schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'day',zones:[{id:'day',energyRate:1e308,variableRate:0}]});
 const data=factory({...model('2026-04-01T00:00Z',Array(24).fill(1)),zone:'UTC'},t);
 assert.equal(data.days[0].kwh,24);assert.equal(data.days[0].energyCost,null);
 assert.equal(data.days[0].usageCost,null);
 }finally{dom.window.close();}
});
test('the source read covers a real thirty-day choice without fetching again on period controls',async()=>{
 const {dom,card}=setup();try {
 const NativeDate=dom.window.Date;const now=Date.parse('2026-10-12T09:30Z');
 dom.window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 card._loadSharedTariffProfile=async()=>{};let statisticsReads=0;
 card._hass.callWS=async message=>{
 if(message.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.grid'}]};
 if(message.type==='recorder/get_statistics_metadata')return {'sensor.grid':{has_sum:true,statistics_unit_of_measurement:'kWh'}};
 if(message.type==='recorder/statistics_during_period'){
 statisticsReads++;const from=Date.parse(message.start_time),to=Date.parse(message.end_time);
 return {'sensor.grid':Array.from({length:(to-from)/H},(_,i)=>({start:from+i*H,change:1}))};
 }throw Error('Unexpected API');};
 await card._fetchEnergyStats();card._render();
 const period=card.shadowRoot.querySelector('[data-pattern-control="period"]');period.value='30';period.dispatchEvent(new dom.window.Event('change'));
 assert.equal(card._patternsDataset.availableDays,30);
 assert.equal(card._patternsDataset.days.filter(r=>r.complete).length,29);
 assert.equal(statisticsReads,1);
 }finally{dom.window.close();}
});
