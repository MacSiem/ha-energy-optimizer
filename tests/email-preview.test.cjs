const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

function preview(options = {}) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  if (options.now) {
    const NativeDate = dom.window.Date;
    const fixed = new NativeDate(options.now).getTime();
    dom.window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [fixed])); }
      static now() { return fixed; }
    };
  }
  dom.window.eval(readFileSync(join(__dirname, '..', 'ha-energy-optimizer.js'), 'utf8'));
  const card = dom.window.document.createElement('ha-energy-email');
  card._hass = { config: { currency: 'EUR' }, states: {} };
  card._discoveryDone = true;
  card._lang = 'en';
  card._discoveredDevices = options.devices || [];
  if (options.zero) card._periodCache_day = [{ name: 'Measured zero source', month: 0, cost: null }];
  const output = dom.window.document.createElement('div');
  output.innerHTML = card._tabPreview();
  return { dom, card, output };
}

test('missing period data is not rendered as measured zero in email preview', () => {
  const { dom, output } = preview();
  try {
    assert.doesNotMatch(output.textContent, /0\.0\s+kWh/);
    assert.match(output.textContent, /No.*data|unavailable|not available/i);
  } finally { dom.window.close(); }
});

for (const [scenario, expected] of [['complete', 24], ['zero', 0], ['gap', null]]) {
  test(`without the email backend, ${scenario} Recorder data uses configured roots and honest coverage`, async () => {
    const { dom, card, output } = preview({ now: '2026-09-30T12:30:00Z', devices: [
      { name: 'Unrelated lifetime meter', entity_id: 'sensor.unrelated', value_kwh: 9876,
        all_sensors: [{ entity_id: 'sensor.unrelated', state_class: 'total_increasing' }] },
    ] });
    const start = Date.parse('2026-09-29T12:00:00Z');
    const points = Array.from({ length: 24 }, (_, i) => ({ start: (start + i * 3600000)/1000,
      end: (start + (i+1)*3600000)/1000, change: scenario === 'zero' ? 0 : 1 }))
      .filter((_, i) => scenario !== 'gap' || i !== 8);
    card._hass.states = { 'sensor.grid': { state: '8888', attributes: { friendly_name: 'Configured grid', unit_of_measurement: 'kWh' } },
      'sensor.unrelated': { state: '9876', attributes: { unit_of_measurement: 'kWh' } } };
    card._hass.callWS = async msg => ({
      'energy/get_prefs': { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }] },
      'recorder/get_statistics_metadata': { 'sensor.grid': { has_sum: true, unit_class: 'energy', statistics_unit_of_measurement: 'kWh' } },
      'recorder/statistics_during_period': { 'sensor.grid': points, 'sensor.unrelated': points.map(p => ({ ...p, change: 100 })) },
    })[msg.type];
    try {
      await card._fetchRecorderStats('day');
      output.innerHTML = card._tabPreview();
      assert.doesNotMatch(output.textContent, /9876|2400\.0|Unrelated lifetime/);
      if (expected === null) assert.doesNotMatch(output.querySelector('.preview-box').textContent, /23\.0\s+kWh/);
      else {
        assert.match(output.textContent, /Configured grid/);
        assert.match(output.textContent, new RegExp(expected.toFixed(1).replace('.', '\\.') + '\\s+kWh'));
      }
    } finally { dom.window.close(); }
  });
}

test('a lifetime meter reading is never used as daily, weekly or monthly consumption', () => {
  const { dom, output } = preview({ devices: [{ name: 'Lifetime meter', entity_id: 'sensor.meter', value_kwh: 9876 }] });
  try { assert.doesNotMatch(output.textContent, /9876/); }
  finally { dom.window.close(); }
});

test('legacy sending with missing Recorder data does not send lifetime totals as a daily report', async () => {
  const { dom, card } = preview({ devices: [{ name: 'Lifetime meter', entity_id: 'sensor.meter', value_kwh: 9876 }] });
  const sent = [];
  card._config.energy_price = 0.8;
  card._hass.services = { ha_tools_email: { send: {} } };
  card._hass.callWS = async () => ({});
  card._hass.callService = async (domain, service, payload) => { sent.push(payload); };
  try {
    await card._sendReport('daily');
    assert.equal(sent.length, 0);
  } finally { dom.window.close(); }
});

test('a zero Recorder period remains measured zero without falling back to lifetime totals', () => {
  const { dom, output } = preview({ zero: true, devices: [{ name: 'Lifetime meter', value_kwh: 9876 }] });
  try {
    assert.match(output.textContent, /Measured zero source/);
    assert.match(output.textContent, /0\.0\s+kWh/);
    assert.doesNotMatch(output.textContent, /9876/);
  } finally { dom.window.close(); }
});

test('backend preview uses the same sources and window as the server report rather than card totals', async () => {
  const { dom, card, output } = preview({ devices: [{ name: 'Lifetime meter', value_kwh: 9876 }] });
  card._hass.callWS = async msg => {
    if (msg.type === 'ha_tools_email/get_config') return { schedules: [] };
    if (msg.type === 'ha_tools_email/preview_energy_report') return {
      status: 'ready', total_kwh: 23, total_cost: null,
      source_ids: ['sensor.configured_grid'],
      period: { start: '2026-09-29T10:00:00+00:00', end: '2026-09-30T10:00:00+00:00', cadence: msg.cadence },
      devices: [{ name: '<Grid source>', entity_id: 'sensor.configured_grid', kwh: 23, cost: null }],
    };
    throw new Error('Unexpected command');
  };
  try {
    await card._loadEmailBackendConfig();
    output.innerHTML = card._tabPreview();
    assert.match(output.textContent, /23\.0\s+kWh/);
    assert.match(output.textContent, /2026-09-29T10:00:00/);
    assert.match(output.textContent, /<Grid source>/);
    assert.doesNotMatch(output.textContent, /9876/);
    assert.equal(output.querySelector('grid'), null);
  } finally { dom.window.close(); }
});
