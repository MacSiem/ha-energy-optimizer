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
