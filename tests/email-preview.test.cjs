const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

function preview(options = {}) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
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

test('a lifetime meter reading is never used as daily, weekly or monthly consumption', () => {
  const { dom, output } = preview({ devices: [{ name: 'Lifetime meter', entity_id: 'sensor.meter', value_kwh: 9876 }] });
  try { assert.doesNotMatch(output.textContent, /9876/); }
  finally { dom.window.close(); }
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
