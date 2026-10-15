'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const code = ['src/optimizer.js', 'src/energy-insights.js', 'src/energy-email.js', 'src/chart-vendor.js']
  .map(path => readFileSync(path, 'utf8')).join('');

// A quiet HA may supply no later hass update. Finishing discovery must paint
// non-success outcomes too, without a period click or fabricated measurements.
for (const outcome of ['partial', 'no_sources', 'error']) test(`Email first read paints ${outcome} without another HA update`, async () => {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  dom.window.eval(code);
  const card = dom.window.document.createElement('ha-energy-email');
  const calls = [];
  card._schedule = () => {};
  card._loadEmailBackendConfig = async () => {};
  card._ensureHelpers = async () => {};
  card._discoverRecipient = () => {};
  card._loadSharedTariffProfile = async () => {};
  card._hass = { user: { id: 'quiet-ha', is_admin: true }, connection: { connected: true },
    config: { time_zone: 'UTC', currency: 'EUR' }, states: {}, callWS: async request => {
      calls.push(request.type);
      if (request.type === 'energy/get_prefs') {
        if (outcome === 'error') throw new Error('Recorder unavailable');
        return { energy_sources: outcome === 'no_sources' ? [] : [{ type: 'grid', stat_energy_from: 'sensor.grid' }] };
      }
      if (request.type === 'recorder/get_statistics_metadata') return { 'sensor.grid': {
        has_sum: true, unit_class: 'energy', statistics_unit_of_measurement: 'kWh' } };
      assert.equal(request.type, 'recorder/statistics_during_period');
      return { 'sensor.grid': [{ start: Date.parse(request.start_time), change: 2 }] };
    } };
  try {
    card.setConfig({ show_support: false });
    dom.window.document.body.append(card);
    await card._discoverAll();
    await card._periodRefreshPromise;
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(card._periodStatus_day, outcome);
    const status = card.shadowRoot.querySelector('[role="status"]')?.textContent || '';
    assert.match(status, {
      partial: /Period statistics are incomplete or invalid/,
      no_sources: /Configure a grid-import source/,
      error: /Could not read Recorder statistics/,
    }[outcome]);
    assert.equal(card._getAutoDataForPeriod('day').length, 0, 'missing totals stay unavailable');
    assert.equal(calls.length, outcome === 'partial' ? 9 : 3, 'completion does not add polling or retries');
  } finally {
    card._getTariffHostV3().guard.dispose();
    dom.window.close();
  }
});
