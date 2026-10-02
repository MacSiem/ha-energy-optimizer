const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

function setup(type, series, options = {}) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  const NativeDate = dom.window.Date;
  const now = Date.parse(options.now || '2026-09-30T12:30:00Z');
  dom.window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  dom.window.eval(readFileSync(join(__dirname, '..', 'ha-energy-optimizer.js'), 'utf8'));
  const card = dom.window.document.createElement(type);
  card._updateContent = () => {};
  const ids = Object.keys(series);
  const calls = [];
  card._hass = { config: { time_zone: options.zone || 'UTC', currency: 'EUR' }, states: {}, callWS: async msg => {
    calls.push(msg);
    if (msg.type === 'energy/get_prefs') return options.prefs || { energy_sources: ids.map(id => ({ type: 'grid', stat_energy_from: id })) };
    if (msg.type === 'recorder/get_statistics_metadata') return Object.fromEntries(ids.map(id => [id, { has_sum: true, statistics_unit_of_measurement: options.unit || 'kWh', unit_class: 'energy' }]));
    if (msg.type === 'recorder/statistics_during_period') return series;
    throw new Error(msg.type);
  } };
  return { dom, card, calls };
}
const hours = (start, count, change = 1) => Array.from({ length: count }, (_, i) => ({ start: Date.parse(start) + i * 3600000, change }));

test('Insights does not treat a source missing today as measured zero', async () => {
  const { dom, card } = setup('ha-energy-insights', { 'sensor.a': hours('2026-09-30T00:00Z', 12), 'sensor.b': hours('2026-09-29T00:00Z', 24) });
  try {
    await card._fetchData();
    assert.equal(card._data?.todayKwh ?? null, null);
  } finally { dom.window.close(); }
});

test('Insights rejects duplicate absolute buckets instead of doubling usage', async () => {
  const points = hours('2026-09-30T00:00Z', 12);
  const { dom, card } = setup('ha-energy-insights', { 'sensor.a': [...points, points[0]] });
  try {
    await card._fetchData();
    assert.equal(card._data?.todayKwh ?? null, null);
  } finally { dom.window.close(); }
});

test('Insights with only today available keeps week/month unavailable and missing hours as gaps', async () => {
  const { dom, card } = setup('ha-energy-insights', { 'sensor.a': hours('2026-09-30T00:00Z', 12) });
  try {
    await card._fetchData();
    assert.equal(card._data.todayKwh, 12);
    assert.equal(card._data.thisWeekKwh, null);
    assert.equal(card._data.monthKwh, null);
    assert.equal(card._data.dailyData[20], null);
    assert.equal(card._data.monthlyData[0], null);
    assert.equal(card._data.weekCost, null);
  } finally { dom.window.close(); }
});

test('Optimizer does not sum seven incomplete historical days into a weekly total', async () => {
  const points = Array.from({ length: 6 }, (_, i) => hours(`2026-09-${24 + i}T00:00Z`, 1)[0]).concat(hours('2026-09-30T00:00Z', 12));
  const { dom, card } = setup('ha-energy-optimizer', { 'sensor.a': points });
  try {
    await card._fetchEnergyStats();
    assert.equal(card._hasRealData, true);
    assert.equal(card._comparisonData.thisWeek, null);
  } finally { dom.window.close(); }
});

test('Optimizer with leading or trailing missing hours cannot label a partial value as today usage', async () => {
  for (const points of [hours('2026-09-30T01:00Z', 11), hours('2026-09-30T00:00Z', 11)]) {
    const { dom, card } = setup('ha-energy-optimizer', { 'sensor.a': points });
    try { await card._fetchEnergyStats(); assert.equal(card._hasRealData, false); }
    finally { dom.window.close(); }
  }
});

test('Energy Email uses legacy grid flow imports, excludes export/solar and converts MWh', async () => {
  const { dom, card, calls } = setup('ha-energy-email', { 'sensor.a': hours('2026-09-29T12:00Z', 24, 0.001) }, {
    unit: 'MWh', prefs: { energy_sources: [
      { type: 'grid', flow_from: [{ stat_energy_from: 'sensor.a' }, { stat_energy_from: 'sensor.a' }], flow_to: [{ stat_energy_to: 'sensor.export' }] },
      { type: 'solar', stat_energy_from: 'sensor.solar' },
    ] },
  });
  try {
    await card._fetchRecorderStats('day');
    assert.equal(card._periodStatus_day, 'ready');
    assert.equal(card._periodCache_day[0].month, 24);
    assert.deepEqual(Array.from(calls.find(c => c.type === 'recorder/statistics_during_period').statistic_ids), ['sensor.a']);
  } finally { dom.window.close(); }
});

test('Energy Email preserves valid millisecond timestamps for hourly statistics', async () => {
  const { dom, card } = setup('ha-energy-email', { 'sensor.a': hours('2026-09-29T12:00Z', 24) });
  try {
    await card._fetchRecorderStats('day');
    assert.equal(card._periodStatus_day, 'ready');
    assert.equal(card._periodCache_day[0].month, 24);
  } finally { dom.window.close(); }
});
