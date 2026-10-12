'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEnergyTariffV3, energyTariffProfileV3 } = require('../shared/ha-tools-energy-tariff.js');
const fixture = require('./fixtures/tariff-parity.json');
const subset = (actual, expected) => { for (const [key, value] of Object.entries(expected)) assert.deepEqual(actual[key], value, key); };
for (const c of fixture.cases) test(`shared tariff parity: ${c.name}`, () => {
  const before = JSON.stringify(c);
  const model = createEnergyTariffV3(c.profile); assert.equal(model.valid, true);
  const result = model.priceBuckets(c.rows, c.coverage);
  subset(result, c.expected);
  if (c.issueReasons) assert.deepEqual(result.issues.map(v => v.reason), c.issueReasons);
  for (const [i, expected] of (c.rowExpected || []).entries()) subset(result.rows[i], expected);
  assert.equal(JSON.stringify(c), before);
});
test('legacy mixed overnight rates keep the current calendar weekday', () => {
  const profile = energyTariffProfileV3({energy_tariff_mode:'mixed', currency:'EUR', energy_day_hour_start:22,
    energy_night_hour_start:6, energy_price_wd_day:1, energy_price_wd_night:2,
    energy_price_we_day:3, energy_price_we_night:4}, {time_zone:'UTC'}, 'insights');
  const m = createEnergyTariffV3(profile); assert.equal(m.valid,true);
  for (const [at, expected] of [['2026-01-02T23:00Z','wd_day'],['2026-01-03T02:00Z','we_day'],
    ['2026-01-04T23:00Z','we_day'],['2026-01-05T02:00Z','wd_day']]) assert.equal(m.rateAt(at).zone,expected,at);
});
