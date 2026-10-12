'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const profile = () => ({ schema: 1, name: 'Custom hourly', currency: 'CHF', timezone: 'UTC', clock: { mode: 'civil' },
  priceBasis: 'gross', defaultZone: 'day', zones: [{ id: 'day', energyRate: 1, variableRate: 0.2 },
    { id: 'night', energyRate: 0.4, variableRate: 0.1 }], rules: [{ zone: 'night', intervals: [{ from: '22:00', to: '06:00' }] }] });
function setup(type) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  dom.window.eval(readFileSync(join(__dirname, '..', 'ha-energy-optimizer.js'), 'utf8'));
  const card = dom.window.document.createElement(type);
  card._hass = { config: { time_zone: 'UTC', currency: 'EUR' }, states: {}, user: { is_admin: false } };
  card._config = { ...card._config, tariff_profile: profile() };
  return { dom, card };
}
for (const type of ['ha-energy-optimizer', 'ha-energy-insights', 'ha-energy-email']) {
  test(`${type} uses the same custom tariff, timestamps and fee basis`, () => {
    const { dom, card } = setup(type);
    try {
      const r = card._getTariffV3().priceBuckets([{ from: '2026-07-01T05:00Z', to: '2026-07-01T06:00Z', kwh: 10 }]);
      assert.equal(r.energyCost, 4); assert.equal(r.variableCost, 1); assert.equal(r.usageCost, 5);
      assert.equal(r.currency, 'CHF'); assert.equal(r.priceBasis, 'gross');
    } finally { dom.window.close(); }
  });
  test(`${type} an invalid explicit custom profile cannot fall back to a legacy price`, () => {
    const { dom, card } = setup(type);
    try { card._config.tariff_profile = { ...profile(), zones: [{ id: 'day', energyRate: null }] };
      card._config.energy_price = 0.6; assert.equal(card._getTariffV3().valid, false);
    } finally { dom.window.close(); }
  });
}
test('Optimizer calculates costs from absolute measured buckets, never a repeated-hour aggregate', () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    card._config.tariff_profile = { ...profile(), timezone: 'Europe/Warsaw', dynamic: { intervals: [
      { from: '2026-10-25T00:00Z', to: '2026-10-25T01:00Z', energyRate: 1, variableRate: 0 },
      { from: '2026-10-25T01:00Z', to: '2026-10-25T02:00Z', energyRate: 2, variableRate: 0 }] } };
    const start = Date.parse('2026-10-25T00:00Z');
    card._energyModel = { todayStart: start, end: start + 7200000,
      points: new Map([[start, { kwh: 2 }], [start + 3600000, { kwh: 3 }]]) };
    card._energyData = [0, 0, 5]; card._hasRealData = true;
    assert.equal(card._calculateTodayCost(), 8);
  } finally { dom.window.close(); }
});
test('Optimizer shows actual tariff costs and removes hypothetical shifting recommendations', () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    card._config.peak_rate = 1; card._config.off_peak_rate = 0.4;
    const start = Date.parse('2026-07-01T05:00Z');
    card._energyModel = { todayStart: start, end: start + 3600000, zone: 'UTC', points: new Map([[start, { kwh: 10 }]]) };
    card._hasRealData = true; card._energyData = [0, 0, 0, 0, 0, 10];
    card._schedule = () => {}; card._currentTab = 'recommendations'; card._render();
    const content = card.shadowRoot.textContent;
    assert.doesNotMatch(content, /Potential Savings|30%|Scenario|shifting flexible|Efficiency Score/);
    assert.match(content, /Tariff costs/); assert.match(content, /CHF/);
    assert.match(card.shadowRoot.querySelector('#recommendations-list').textContent, /10.*kWh/);
    assert.match(card.shadowRoot.querySelector('#recommendations-list').textContent, /4[.,]00/);
  } finally { dom.window.close(); }
});
test('legacy modes are retained by the shared adapter without overwriting config', () => {
  const { energyTariffProfileV3, createEnergyTariffV3 } = require('../shared/ha-tools-energy-tariff.js');
  for (const [mode, rates, expected] of [
    ['flat', { energy_price: 0 }, 0], ['day_night', { energy_price_day: 1, energy_price_night: 0.2 }, 0.2],
    ['weekday_weekend', { energy_price_weekday: 1, energy_price_weekend: 0.3 }, 0.3],
    ['mixed', { energy_price_wd_day: 1, energy_price_wd_night: 0.2, energy_price_we_day: 0.5, energy_price_we_night: 0.1 }, 0.1]]) {
    const config = { energy_tariff_mode: mode, ...rates, unknown_future: { yes: true } }, before = JSON.stringify(config);
    assert.equal(createEnergyTariffV3(energyTariffProfileV3(config, { time_zone: 'UTC', currency: 'EUR' }, 'email')).rateAt('2026-07-05T02:00Z').energyRate, expected);
    assert.equal(JSON.stringify(config), before);
  }
});
