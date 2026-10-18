// Post-runtime source-only supplement. Not part of tests-first evidence; NOT executed.
'use strict';
const {energyBackend,drainBackend}=require('./helpers/energy-backend-fixture.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const code = ['src/optimizer.js', 'src/energy-insights.js', 'src/energy-email.js', 'src/chart-vendor.js'].map(p => readFileSync(join(__dirname, '..', p), 'utf8')).join('');
const H = 3600000;
const flush = drainBackend;
async function setup() {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  const NativeDate = dom.window.Date, now = Date.parse('2026-10-13T12:00Z');
  dom.window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  dom.window.eval(code);
  const card = dom.window.document.createElement('ha-energy-insights'); card._schedule = () => {};
  const profile = { schema: 1, currency: 'EUR', timezone: 'UTC', clock: { mode: 'civil' }, priceBasis: 'gross', defaultZone: 'a', zones: [{ id: 'a', energyRate: 0.2, variableRate: 0 }] };
  const prefs = { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }], device_consumption: [{ stat_consumption: 'sensor.device' }] };
  const md = { 'sensor.device': { has_sum: true, unit_class: 'energy', statistics_unit_of_measurement: 'MWh', name: 'Configured machine' } };
  const calls = [], observers = [];
  let delegate = async req => {
    if (req.type === 'energy/get_prefs') return prefs;
    if (req.type === 'recorder/get_statistics_metadata') return { 'sensor.grid': { has_sum: true, unit_class: 'energy', unit_of_measurement: 'kWh' }, ...md };
    if (req.type === 'recorder/statistics_during_period') {
      const from = Date.parse(req.start_time), to = Date.parse(req.end_time);
      return Object.fromEntries(req.statistic_ids.map(id => [id, Array.from({ length: (to - from) / H }, (_, i) => ({ start: from + i * H, change: 1 }))]));
    }
    if (req.type === 'ha_tools_email/get_tariff') return { profile, revision: 1, updated_at: null };
    throw Error(req.type);
  };
  // Lifecycle observer only; no invented geometry, dimensions or layout acceptance.
  dom.window.ResizeObserver = class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } disconnect() { this.disconnected = true; } };
  const connection = new dom.window.EventTarget(); connection.connected = true;
  card._hass = { user: { id: 'u', is_admin: true }, connection, language: 'en', locale: { language: 'en' }, config: { time_zone: 'UTC', currency: 'EUR' }, states: {}, callWS: energyBackend(card,req => { calls.push(req); return delegate(req); }) };
  card._firstHassRender = true; card._lastDataFetch = now;
  card.setConfig({ tariff_profile: profile, show_support: false }); dom.window.document.body.append(card);
  await card._fetchData(); await flush();
  return { dom, card, calls, observers, md, setDelegate(fn) { delegate = fn; }, close() { card._tariffConsumerUnsubscribeV3?.(); card._getTariffHostV3().guard.dispose(); dom.window.close(); } };
}
test('timeout keeps raw occupation until actual settlement, drops late measurements and re-enables explicit read', async () => {
  const f = await setup(); try {
    let release, timeout;
    const native = f.dom.window.setTimeout.bind(f.dom.window);
    f.dom.window.setTimeout = (fn, ms, ...args) => ms === 15000 ? (timeout = fn, 987654) : native(fn, ms, ...args);
    f.setDelegate(() => new Promise(resolve => { release = resolve; }));
    const pending = f.card._readInsightDevicesV3(); await flush();
    assert.equal(typeof timeout, 'function'); timeout(); await pending; await flush();
    const guard = f.card._getTariffHostV3().guard, count = f.calls.length;
    assert.equal(guard.occupied(), true); await f.card._readInsightDevicesV3();
    assert.equal(f.calls.length, count); assert.equal(f.card._insightDeviceState.raw, null);
    release(f.md); await flush();
    assert.equal(guard.occupied(), false); assert.equal(f.card._insightDeviceState.raw, null);
    assert.equal(f.card.shadowRoot.querySelector('[data-insights-control="read-devices"]').disabled, false);
  } finally { f.close(); }
});
test('MWh conversion uses measured change only and cached metadata avoids a redundant metadata dispatch', async () => {
  const f = await setup(); try {
    const count = f.calls.length; await f.card._readInsightDevicesV3(); await flush();
    const row = f.card._insightDeviceRowsV3()[0];
    assert.equal(row.kwh, 168000); assert.equal(row.sourceUnit, 'MWh');
    assert.equal(f.calls.length, count + 1); assert.equal(f.calls.at(-1).type, 'recorder/statistics_during_period');
    assert.equal(f.card._data.monthKwh, 720);
  } finally { f.close(); }
});
test('resize observer disconnects on panel replacement/detach and old delivery cannot draw into current chart', async () => {
  const f = await setup(); try {
    f.card.setActiveTab('daily'); const old = f.observers.at(-1), oldPlot = old.target;
    assert.ok(oldPlot.isConnected);
    const count = f.calls.length; f.card.setActiveTab('monthly');
    assert.equal(old.disconnected, true); assert.equal(oldPlot.isConnected, false);
    const current = f.card.shadowRoot.querySelector('[data-insights-plot]'), content = current.innerHTML;
    old.callback([]); assert.equal(current.innerHTML, content);
    const observer = f.observers.at(-1); f.card.remove(); assert.equal(observer.disconnected, true);
    observer.callback([]); assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
test('configured selection never consumes statistics returned under another source ID', async () => {
  const f = await setup(); try {
    f.setDelegate(async req => { assert.equal(req.type, 'recorder/statistics_during_period'); return { 'sensor.someone_else': [{ start: Date.parse(req.start_time), change: 999 }] }; });
    await f.card._readInsightDevicesV3();
    const row = f.card._insightDeviceRowsV3()[0]; assert.equal(row.status, 'absent'); assert.equal(row.kwh, null);
    assert.ok(Object.hasOwn(f.card._insightDeviceState.raw.statistics, 'sensor.someone_else'));
  } finally { f.close(); }
});
test('changed configured-device preferences invalidate the settled snapshot even when grid IDs do not change', async () => {
  const f = await setup(); try {
    await f.card._readInsightDevicesV3(); assert.ok(f.card._insightDeviceState.raw);
    f.setDelegate(async req => {
      assert.equal(req.type, 'energy/get_prefs');
      return { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }], device_consumption: [{ stat_consumption: 'sensor.new_device' }] };
    });
    const read = f.card._createEnergyReadV3(); await read.hass.callWS({ type: 'energy/get_prefs' });
    assert.equal(f.card._insightDeviceState.raw, null); assert.equal(f.card._insightDeviceRowsV3().length, 0);
  } finally { f.close(); }
});
test('locale refresh with an overdue grid timer preserves input selection and dispatches no reads', async () => {
  const f = await setup(); try {
    await f.card._readInsightDevicesV3(); await flush();
    const input = f.card.shadowRoot.querySelector('[data-insights-control="device-search"]');
    input.focus(); input.value = 'Configured'; input.setSelectionRange(2, 5); input.dispatchEvent(new f.dom.window.Event('input'));
    f.card._lastDataFetch = 1; const count = f.calls.length;
    f.card.hass = { ...f.card._hass, language: 'pl', locale: { language: 'pl' } }; await flush();
    assert.equal(f.calls.length, count);
    assert.equal(f.card.shadowRoot.activeElement.value, 'Configured'); assert.equal(f.card.shadowRoot.activeElement.selectionStart, 2);
  } finally { f.close(); }
});
