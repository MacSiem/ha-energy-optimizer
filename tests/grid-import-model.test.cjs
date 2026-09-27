const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

function cardWith(responses) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  dom.window.eval(readFileSync(join(__dirname, '..', 'ha-energy-optimizer.js'), 'utf8'));
  const card = dom.window.document.createElement('ha-energy-optimizer');
  const calls = [];
  card._hass = { config: { currency: 'EUR', time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone }, states: {}, callWS: async message => {
    calls.push(message);
    const response = responses[message.type];
    return typeof response === 'function' ? response(message) : response;
  } };
  return { dom, card, calls };
}

test('grid import uses unique configured roots and converts Wh without counting arbitrary sensors', async () => {
  const start = Math.floor((Date.now() - 3600000) / 1000);
  const { dom, card, calls } = cardWith({
    'energy/get_prefs': { energy_sources: [
      { type: 'grid', stat_energy_from: 'sensor.grid_a' },
      { type: 'grid', stat_energy_from: 'sensor.grid_a' },
      { type: 'grid', stat_energy_from: 'sensor.grid_b' },
    ] },
    'recorder/get_statistics_metadata': {
      'sensor.grid_a': { has_sum: true, statistics_unit_of_measurement: 'kWh', unit_class: 'energy' },
      'sensor.grid_b': { has_sum: true, statistics_unit_of_measurement: 'Wh', unit_class: 'energy' },
    },
    'recorder/statistics_during_period': {
      'sensor.grid_a': [{ start, change: 2 }],
      'sensor.grid_b': [{ start, change: 500 }],
      'sensor.unrelated': [{ start, change: 999 }],
    },
  });
  try {
    await card._fetchEnergyStats();
    assert.equal(card._hasRealData, true);
    assert.equal(card._calculateTodayUsage(), 2.5);
    assert.equal(card._calculateTodayCost(), null);
    assert.match(card._getTemplate(), /Grid import from 2 Energy Dashboard source/);
    assert.doesNotMatch(card._getTemplate(), /Demo data/);
    assert.deepEqual(Array.from(calls.find(call => call.type === 'recorder/statistics_during_period').statistic_ids), ['sensor.grid_a', 'sensor.grid_b']);
  } finally { dom.window.close(); }
});

test('negative change fails closed instead of becoming zero energy', async () => {
  const start = Math.floor((Date.now() - 3600000) / 1000);
  const { dom, card } = cardWith({
    'energy/get_prefs': { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }] },
    'recorder/get_statistics_metadata': { 'sensor.grid': { has_sum: true, statistics_unit_of_measurement: 'kWh' } },
    'recorder/statistics_during_period': { 'sensor.grid': [{ start, change: -5 }] },
  });
  try {
    await card._fetchEnergyStats();
    assert.equal(card._hasRealData, false);
    assert.match(card._getTemplate(), /statistics could not be loaded/);
    assert.doesNotMatch(card._getTemplate(), /Demo data/);
  } finally { dom.window.close(); }
});

test('Insights ignores unconfigured power sensors and omits cost without a tariff', async () => {
  const start = Math.floor((Date.now() - 3600000) / 1000);
  const { dom, card: unused } = cardWith({});
  try {
    const insights = dom.window.document.createElement('ha-energy-insights');
    insights._updateContent = () => {};
    insights._hass = { config: { currency: 'EUR' }, states: {
      'sensor.power': { state: '1500', attributes: { unit_of_measurement: 'W' } },
    }, callWS: async msg => ({
      'energy/get_prefs': { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }] },
      'recorder/get_statistics_metadata': { 'sensor.grid': { has_sum: true, statistics_unit_of_measurement: 'kWh' } },
      'recorder/statistics_during_period': { 'sensor.grid': [{ start, change: 2.5 }] },
    })[msg.type] };
    await insights._fetchData();
    assert.deepEqual(Array.from(insights._data.sensors), ['sensor.grid']);
    assert.equal(insights._data.todayKwh, 2.5);
    assert.equal(insights._data.todayCost, null);
    assert.equal(insights._data.topDevices.length, 0);
    assert.match(insights._renderOverview(), /N\/A/);
  } finally { dom.window.close(); }
});
