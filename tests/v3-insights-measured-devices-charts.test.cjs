// Source-only W3/W5 packet: written before runtime. Owner executes after integration.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const code = ['src/optimizer.js', 'src/energy-insights.js', 'src/energy-email.js', 'src/chart-vendor.js']
  .map(p => readFileSync(join(__dirname, '..', p), 'utf8')).join('');
const H = 3600000;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const plain = value => JSON.parse(JSON.stringify(value));
const profile = { schema: 1, currency: 'EUR', timezone: 'UTC', clock: { mode: 'civil' },
  priceBasis: 'gross', defaultZone: 'a', zones: [{ id: 'a', energyRate: 2, variableRate: 0.1 }] };
async function fixture({ now = '2026-10-25T05:00:00Z', zone = 'Europe/Warsaw', devices,
  transform = rows => rows, metadata: customMetadata, ownTariff = true } = {}) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  const NativeDate = dom.window.Date, end = Date.parse(now);
  dom.window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [end])); } static now() { return end; } };
  dom.window.eval(code);
  const card = dom.window.document.createElement('ha-energy-insights');
  card._schedule = () => {};
  const calls = [], responses = [];
  const prefs = { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }], device_consumption: devices || [
    { stat_consumption: 'sensor.hvac', name: 'Heat pump' },
    { stat_consumption: 'sensor.hvac_child', included_in_stat: 'sensor.hvac' },
    { stat_consumption: 'sensor.empty' }, { stat_consumption: 'sensor.watts' }
  ] };
  const metadata = { 'sensor.grid': { has_sum: true, statistics_unit_of_measurement: 'kWh', unit_class: 'energy' },
    'sensor.hvac': { statistic_id: 'sensor.hvac', name: 'Heating', has_sum: true, statistics_unit_of_measurement: 'Wh', unit_class: 'energy' },
    'sensor.hvac_child': { name: 'Indoor unit', has_sum: true, statistics_unit_of_measurement: 'kWh', unit_class: 'energy' },
    'sensor.empty': { has_sum: true, unit_of_measurement: 'kWh', unit_class: 'energy' },
    'sensor.watts': { has_sum: true, unit_of_measurement: 'W', unit_class: 'power' }, ...customMetadata };
  const connection = new dom.window.EventTarget(); connection.connected = true;
  let handler = async req => {
    if (req.type === 'energy/get_prefs') return prefs;
    if (req.type === 'recorder/get_statistics_metadata') return Object.fromEntries(req.statistic_ids.filter(id => metadata[id]).map(id => [id, metadata[id]]));
    if (req.type === 'recorder/statistics_during_period') {
      const start = Date.parse(req.start_time), finish = Date.parse(req.end_time);
      const response = Object.fromEntries(req.statistic_ids.map(id => [id, id === 'sensor.empty' ? [] : transform(Array.from({ length: (finish - start) / H }, (_, i) =>
        ({ start: start + i * H, end: start + (i + 1) * H, change: id === 'sensor.grid' ? 1 : id === 'sensor.hvac' ? 0 : 0.125 })), id)]));
      responses.push(response); return response;
    }
    if (req.type === 'ha_tools_email/get_tariff') return { profile, revision: 1, updated_at: null };
    throw Error('Unexpected request ' + req.type);
  };
  const hass = { user: { id: 'fixture', is_admin: true, is_active: true }, connection,
    language: 'en', locale: { language: 'en' }, config: { currency: 'EUR', time_zone: zone },
    states: { 'sensor.hvac': { state: '9000000', attributes: { unit_of_measurement: 'W' } } },
    callWS: req => { calls.push(plain(req)); return handler(req); } };
  card._hass = hass; card.setConfig({ ...(ownTariff ? { tariff_profile: profile } : {}), show_support: false });
  card._firstHassRender = true; card._lastDataFetch = end;
  dom.window.document.body.append(card);
  await card._fetchData(); await flush();
  return { dom, card, hass, calls, responses, prefs, metadata, setHandler(fn) { handler = fn; },
    close() { card._tariffConsumerUnsubscribeV3?.(); card._getTariffHostV3().guard.dispose(); dom.window.close(); } };
}
function change(f, key, value) {
  const input = f.card.shadowRoot.querySelector(`[data-insights-control="${key}"]`);
  assert.ok(input, key); input.value = value; input.dispatchEvent(new f.dom.window.Event('change', { bubbles: true }));
}
test('configured device measurements are opt in, retain zero and never add submeter or live W to grid', async () => {
  const f = await fixture(); try {
    const grid = f.card._data.monthKwh, initial = f.calls.length;
    assert.match(f.card.shadowRoot.querySelector('[data-insights-devices]').textContent, /Not read/);
    assert.equal(f.calls.filter(c => c.statistic_ids?.includes('sensor.hvac')).length, 0);
    await f.card._readInsightDevicesV3();
    const rows = f.card._insightDeviceRowsV3();
    assert.equal(rows.length, 4); assert.equal(rows[0].kwh, 0); assert.equal(rows[0].status, 'complete');
    assert.equal(rows[0].energyCost, 0); assert.equal(rows[0].sourceUnit, 'Wh');
    assert.equal(rows[1].includedIn, 'sensor.hvac'); assert.equal(rows[1].kwh, 21);
    assert.equal(rows[2].status, 'empty'); assert.equal(rows[2].kwh, null);
    assert.equal(rows[3].status, 'unsupported'); assert.equal(rows[3].kwh, null);
    assert.equal(f.card._data.monthKwh, grid);
    assert.equal(f.calls.length, initial + 2, 'reuses real cached preference response');
    assert.ok(!f.calls.at(-1).statistic_ids.includes('sensor.watts'));
    assert.ok(Object.isFrozen(f.card._insightDeviceState.raw.statistics));
    const response = f.responses.at(-1); response['sensor.hvac'][0].change = 9999;
    assert.equal(f.card._insightDeviceRowsV3()[0].kwh, 0, 'source response retained immutably');
  } finally { f.close(); }
});
test('empty configuration is explicit and no invented topDevices input can populate measured rows', async () => {
  const f = await fixture({ devices: [] }); try {
    const count = f.calls.length;
    f.card._data.topDevices = [{ name: 'Fake', kwh: 200 }];
    await f.card._readInsightDevicesV3();
    assert.equal(f.card._insightDeviceRowsV3().length, 0);
    assert.match(f.card.shadowRoot.textContent, /No configured devices/);
    assert.doesNotMatch(f.card.shadowRoot.textContent, /Fake/);
    assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
test('invalid metadata source identity, duplicate bucket, unknown changes and missing records stay explicit', async () => {
  const f = await fixture({ metadata: { 'sensor.hvac': { statistic_id: 'sensor.other', has_sum: true, unit_of_measurement: 'kWh' } },
    transform: (rows, id) => id === 'sensor.hvac_child' ? rows.filter((_, i) => i !== 1).map((r, i) => i === 2 ? { ...r, change: null } : r) : rows });
  try {
    await f.card._readInsightDevicesV3();
    const rows = f.card._insightDeviceRowsV3();
    assert.equal(rows[0].status, 'unsupported');
    assert.equal(rows[1].status, 'partial'); assert.equal(rows[1].kwh, null);
    assert.equal(rows[1].measuredHours, 166); assert.equal(rows[1].recordedKwh, 20.75);
    assert.equal(rows[1].energyCost, null);
  } finally { f.close(); }
  const d = await fixture({ transform: (rows, id) => id === 'sensor.hvac' ? [...rows, rows[0]] : rows });
  try { await d.card._readInsightDevicesV3(); assert.equal(d.card._insightDeviceRowsV3()[0].status, 'invalid'); } finally { d.close(); }
});
test('concurrent explicit reads coalesce and tariff raw occupation prevents device dispatch', async () => {
  const f = await fixture(); try {
    let resolve; f.setHandler(() => new Promise(r => { resolve = r; }));
    const before = f.calls.length;
    const a = f.card._readInsightDevicesV3(), b = f.card._readInsightDevicesV3();
    assert.equal(a, b); await flush(); assert.equal(f.calls.length, before + 1);
    f.card.disconnectedCallback(); resolve({}); await a;
    assert.equal(f.card._insightDeviceState.raw, null);
    f.card.connectedCallback();
    const guard = f.card._getTariffHostV3().guard;
    const raw = guard.call(guard.observe(), { type: 'ha_tools_email/get_tariff' }); await flush();
    const count = f.calls.length; await f.card._readInsightDevicesV3();
    assert.equal(f.calls.length, count); assert.equal(guard.occupied(), true);
    resolve({}); await raw;
  } finally { f.close(); }
});
for (const edge of ['user', 'role', 'source', 'config', 'zone', 'range', 'connection', 'offline', 'detach']) {
  test(`device source snapshot and late response are fenced on ${edge}`, async () => {
    const f = await fixture(); try {
      await f.card._readInsightDevicesV3();
      let release; f.setHandler(() => new Promise(r => { release = r; }));
      const pending = f.card._readInsightDevicesV3(); await flush();
      if (edge === 'offline') f.dom.window.dispatchEvent(new f.dom.window.Event('offline'));
      else if (edge === 'detach') f.card.remove();
      else if (edge === 'range') f.card.setActiveTab('monthly');
      else if (edge === 'config') f.card.setConfig({ ...f.card._config, title: 'changed' });
      else if (edge === 'source') { f.card._tariffSourceIds = ['sensor.other']; f.card._observeTariffContextV3(); }
      else { const h = { ...f.hass, user: { ...f.hass.user }, config: { ...f.hass.config } };
        if (edge === 'user') h.user.id = 'another'; if (edge === 'role') h.user.is_admin = false;
        if (edge === 'zone') h.config.time_zone = 'Asia/Kolkata'; if (edge === 'connection') h.connection = { connected: true };
        f.card.hass = h; }
      release(f.metadata); await pending; await flush();
      assert.equal(f.card._insightDeviceState.raw, null);
      assert.equal(f.card._insightDeviceRowsV3().some(r => r.status === 'complete'), false);
    } finally { f.close(); }
  });
}
test('DST fallback retains exact UTC identities and Chart/Data have identical source/value records', async () => {
  const f = await fixture({ transform: (rows, id) => id === 'sensor.grid' ? rows.map(r => ({ ...r, change: r.start === Date.parse('2026-10-25T00:00Z') ? 0 : r.change })) : rows });
  try {
    const count = f.calls.length; f.card.setActiveTab('daily');
    const rows = f.card._insightChartRowsV3();
    const repeated = rows.filter(r => r.hour === 2);
    assert.equal(repeated.length, 2); assert.notEqual(repeated[0].id, repeated[1].id);
    assert.notEqual(repeated[0].offset, repeated[1].offset); assert.equal(repeated[0].kwh, 0);
    const chart = [...f.card.shadowRoot.querySelectorAll('[data-insights-mark]')].map(n => [n.dataset.insightsMark, n.dataset.value]);
    f.card.shadowRoot.querySelector('[data-insights-control="data"]').click();
    const data = [...f.card.shadowRoot.querySelectorAll('[data-insights-row]')].map(n => [n.dataset.insightsRow, n.dataset.value]);
    assert.deepEqual(chart, data);
    assert.match(f.card.shadowRoot.textContent, /sensor.grid/); assert.match(f.card.shadowRoot.textContent, /Europe\/Warsaw/);
    assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
test('missing grid hours remain inspectable gaps, not fabricated zero or a fatal whole-screen error', async () => {
  const f = await fixture({ transform: (rows, id) => id === 'sensor.grid' ? rows.filter(r => r.start !== Date.parse('2026-10-25T01:00Z')) : rows });
  try {
    f.card.setActiveTab('daily');
    const gap = f.card._insightChartRowsV3().find(r => r.from === Date.parse('2026-10-25T01:00Z'));
    assert.equal(gap.kwh, null); assert.equal(gap.missing, true);
    assert.ok(f.card.shadowRoot.querySelector('[data-insights-chart]'));
    assert.equal(f.card._data.todayKwh, null);
  } finally { f.close(); }
});
test('non-hour local midnight never splits UTC buckets; monthly Data pagination loses no records', async () => {
  const f = await fixture({ now: '2026-10-25T05:00:00Z', zone: 'Asia/Kolkata' }); try {
    const count = f.calls.length; f.card.setActiveTab('monthly');
    const daily = f.card._insightChartRowsV3();
    assert.ok(daily.every(r => !r.complete && r.kwh === null));
    assert.equal(daily.reduce((n, r) => n + r.recordedKwh, 0), 720);
    change(f, 'resolution', 'hour');
    assert.equal(f.card._insightChartRowsV3().length, 720);
    f.card.shadowRoot.querySelector('[data-insights-control="data"]').click();
    const seen = new Set();
    for (let page = 0; page < 30; page++) {
      for (const row of f.card.shadowRoot.querySelectorAll('[data-insights-row]')) seen.add(row.dataset.insightsRow);
      const next = f.card.shadowRoot.querySelector('[data-insights-control="next-page"]');
      if (next.disabled) break; next.click();
    }
    assert.equal(seen.size, 720); assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
test('metric and point selection stay local; tariff change reprices settled device buckets without requery', async () => {
  const f = await fixture({ ownTariff: false }); try {
    await f.card._readInsightDevicesV3();
    const measured = f.calls.length, raw = f.card._insightDeviceState.raw;
    f.setHandler(async req => { assert.equal(req.type, 'ha_tools_email/get_tariff'); return { profile: { ...profile, zones: [{ id: 'a', energyRate: 3, variableRate: 0.1 }] }, revision: 2, updated_at: null }; });
    const details = f.card.shadowRoot.querySelector('[data-tariff-details]');
    details.open = true; details.dispatchEvent(new f.dom.window.Event('toggle'));
    f.card.shadowRoot.querySelector('[data-action="load"]').click(); await flush();
    assert.equal(f.card._insightDeviceState.raw, raw);
    assert.equal(f.card._insightDeviceRowsV3()[1].energyCost, 63);
    f.card.setActiveTab('weekly'); change(f, 'metric', 'energyCost');
    assert.equal(f.card.shadowRoot.querySelector('[data-insights-chart]').dataset.unit, 'EUR');
    const point = f.card.shadowRoot.querySelector('[data-insights-control="point"]');
    point.focus(); point.dispatchEvent(new f.dom.window.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    assert.equal(f.card._insightChartState.selected, f.card._insightChartRowsV3()[0].id);
    assert.equal(f.card.shadowRoot.activeElement.dataset.insightsControl, 'point');
    assert.equal(f.calls.length, measured + 1);
  } finally { f.close(); }
});
test('device search preserves caret and exposes every configured source through paging without reads', async () => {
  const devices = Array.from({ length: 37 }, (_, i) => ({ stat_consumption: 'sensor.device_' + i, name: 'Device ' + i }));
  const f = await fixture({ devices }); try {
    await f.card._readInsightDevicesV3(); const count = f.calls.length;
    const ids = new Set();
    for (let i = 0; i < 5; i++) {
      for (const row of f.card.shadowRoot.querySelectorAll('[data-insights-device]')) ids.add(row.dataset.insightsDevice);
      const next = f.card.shadowRoot.querySelector('[data-insights-control="device-next"]');
      if (next.disabled) break; next.click();
    }
    assert.equal(ids.size, 37);
    const input = f.card.shadowRoot.querySelector('[data-insights-control="device-search"]');
    input.focus(); input.value = 'Device 2'; input.setSelectionRange(3, 5);
    input.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
    const focused = f.card.shadowRoot.activeElement;
    assert.equal(focused.value, 'Device 2'); assert.equal(focused.selectionStart, 3); assert.equal(focused.selectionEnd, 5);
    f.card.hass = { ...f.hass, language: 'pl', locale: { language: 'pl' } };
    assert.equal(f.card.shadowRoot.activeElement.value, 'Device 2'); assert.equal(f.calls.length, count);
  } finally { f.close(); }
});

// Owner review regressions: actual native summary focus loss and wrong metric name.
test('device disclosure retains keyboard focus/open state across locale without new reads', async () => {
  const f = await fixture(); try {
    await f.card._readInsightDevicesV3(); const count = f.calls.length;
    const disclosure = f.card.shadowRoot.querySelectorAll('[data-insights-device-details]')[1];
    // Native toggle is queued; an immediate locale repaint must read actual open state.
    disclosure.open = true;
    disclosure.querySelector('summary').focus();
    f.card.hass = { ...f.hass, language: 'pl', locale: { language: 'pl' } }; await flush();
    const focused = f.card.shadowRoot.activeElement;
    assert.equal(focused?.tagName, 'SUMMARY');
    assert.equal(focused.parentElement.dataset.insightsDeviceDetails, disclosure.dataset.insightsDeviceDetails);
    assert.equal(focused.parentElement.open, true); assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
test('chart accessible name describes the selected measure and its unit', async () => {
  const f = await fixture(); try {
    f.card.setActiveTab('weekly'); change(f, 'metric', 'energyCost');
    const svg = f.card.shadowRoot.querySelector('[data-insights-chart]');
    assert.match(svg.getAttribute('aria-label'), /Energy cost.*EUR/);
    change(f, 'metric', 'variableCost');
    assert.match(f.card.shadowRoot.querySelector('[data-insights-chart]').getAttribute('aria-label'), /Variable fees.*EUR/);
  } finally { f.close(); }
});
test('primary device consumption is readable while details retain the exact measured value', async () => {
  const f = await fixture({ transform: (rows, id) => id === 'sensor.hvac_child' ? rows.map(r => ({ ...r, change: 0.15 })) : rows }); try {
    await f.card._readInsightDevicesV3(); const row = f.card._insightDeviceRowsV3()[1];
    const article = f.card.shadowRoot.querySelectorAll('[data-insights-device]')[1];
    assert.equal(article.querySelector('.insights-device-heading span').textContent, '25.2 kWh');
    const full = [...article.querySelectorAll('dt')].find(el => el.textContent === 'Consumption').nextElementSibling;
    assert.equal(full.textContent, String(row.kwh) + ' kWh');
  } finally { f.close(); }
});

test('actual dark theme activates existing card tokens without additional source reads', async () => {
  const f = await fixture(); try {
    const count = f.calls.length;
    f.card.hass = { ...f.hass, themes: { darkMode: true } };
    assert.equal(f.card.classList.contains('bento-dark'), true);
    f.card.hass = { ...f.hass, themes: { darkMode: false } };
    assert.equal(f.card.classList.contains('bento-dark'), false);
    assert.equal(f.calls.length, count);
  } finally { f.close(); }
});
