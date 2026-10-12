'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = profile => require('../shared/ha-tools-energy-tariff.js').createEnergyTariffV3(profile);
const base = changes => ({ schema: 1, name: 'Custom', currency: 'EUR', timezone: 'UTC',
  clock: { mode: 'civil' }, priceBasis: 'gross', validFrom: '2026-01-01', validTo: '2026-12-31',
  defaultZone: 'day', zones: [{ id: 'day', label: 'Day', energyRate: 1, variableRate: 0 },
    { id: 'night', label: 'Night', energyRate: 0.4, variableRate: 0 }], rules: [], fixedMonthly: 7, ...changes });
const bucket = (from, to, kwh = 2) => ({ from, to, kwh });
const hour = (from, kwh = 2) => bucket(from, new Date(Date.parse(from) + 3600000).toISOString(), kwh);
const overnight = { zone: 'night', intervals: [{ from: '22:00', to: '06:00' }] };

test('flat custom price retains currency, price basis and separate monthly fees', () => {
  const result = model(base()).priceBuckets([hour('2026-01-01T12:00Z')]);
  assert.equal(result.complete, true); assert.equal(result.energyCost, 2);
  assert.equal(result.variableCost, 0); assert.equal(result.usageCost, 2);
  assert.equal(result.fixedMonthly, 7); assert.equal(result.currency, 'EUR');
  assert.equal(result.priceBasis, 'gross'); assert.equal(result.kwh, 2);
});
test('zero is a valid price and valid measured usage', () => {
  const m = model(base({ zones: [{ id: 'day', energyRate: 0, variableRate: 0 }] }));
  assert.equal(m.priceBuckets([hour('2026-01-01T12:00Z')]).usageCost, 0);
  assert.equal(m.priceBuckets([hour('2026-01-01T12:00Z', 0)]).kwh, 0);
});
test('missing, boolean and string prices cannot become measured zero', () => {
  for (const rate of [null, undefined, true, '', '0.4', NaN, Infinity]) {
    const m = model(base({ zones: [{ id: 'day', energyRate: rate, variableRate: 0 }] }));
    assert.equal(m.valid, false); assert.equal(m.rateAt('2026-01-01T12:00Z').available, false);
  }
});
test('energy-only price does not pretend variable fees are known', () => {
  const result = model(base({ zones: [{ id: 'day', energyRate: 0.5 }] })).priceBuckets([hour('2026-01-01T12:00Z')]);
  assert.equal(result.energyCost, 1); assert.equal(result.variableCost, null);
  assert.equal(result.usageCost, null); assert.equal(result.fixedMonthly, 7);
});
test('net rates stay net, with energy and variable fees summed separately', () => {
  const result = model(base({ priceBasis: 'net', zones: [{ id: 'day', energyRate: 0.5, variableRate: 0.2 }] }))
    .priceBuckets([hour('2026-01-01T12:00Z', 10)]);
  assert.equal(result.energyCost, 5); assert.equal(result.variableCost, 2);
  assert.equal(result.usageCost, 7); assert.equal(result.priceBasis, 'net');
});
test('overnight intervals use inclusive start and exclusive end', () => {
  const m = model(base({ rules: [overnight] }));
  for (const [time, rate] of [['21:59', 1], ['22:00', 0.4], ['05:59', 0.4], ['06:00', 1]])
    assert.equal(m.rateAt(`2026-02-02T${time}Z`).energyRate, rate);
});
test('custom weekdays do not impose the Polish weekend', () => {
  const m = model(base({ rules: [{ zone: 'night', weekdays: [5, 6], intervals: [{ from: '00:00', to: '24:00' }] }] }));
  assert.equal(m.rateAt('2026-01-02T12:00Z').zone, 'night'); // Friday
  assert.equal(m.rateAt('2026-01-04T12:00Z').zone, 'day'); // Sunday
});
test('overnight weekday rules continue from the day on which the interval started', () => {
  const m = model(base({ rules: [{ ...overnight, weekdays: [5] }] }));
  assert.equal(m.rateAt('2026-01-03T02:00Z').zone, 'night');
  assert.equal(m.rateAt('2026-01-02T02:00Z').zone, 'day');
});
test('custom seasonal boundaries and winter season crossing December are precise', () => {
  const m = model(base({ rules: [{ zone: 'night', season: { from: '10-01', to: '03-31' },
    intervals: [{ from: '13:00', to: '15:00' }] }] }));
  assert.equal(m.rateAt('2026-03-31T14:00Z').zone, 'night');
  assert.equal(m.rateAt('2026-04-01T14:00Z').zone, 'day');
  assert.equal(m.rateAt('2026-10-01T14:00Z').zone, 'night');
});
test('explicit date exceptions override the usual schedule without a country calendar', () => {
  const m = model(base({ rules: [overnight], exceptions: [{ dates: ['2026-07-09'], zone: 'night',
    intervals: [{ from: '00:00', to: '24:00' }] }] }));
  assert.equal(m.rateAt('2026-07-09T12:00Z').zone, 'night');
  assert.equal(m.rateAt('2026-07-10T12:00Z').zone, 'day');
});
test('equal-priority conflicting zones are unavailable, never first-match guesses', () => {
  const m = model(base({ rules: [overnight, { zone: 'day', intervals: [{ from: '23:00', to: '24:00' }] }] }));
  assert.equal(m.rateAt('2026-01-01T23:30Z').reason, 'ambiguous_rules');
});
test('explicit priorities resolve intentional rule overrides', () => {
  const m = model(base({ rules: [overnight, { zone: 'day', priority: 2, intervals: [{ from: '23:00', to: '24:00' }] }] }));
  assert.equal(m.rateAt('2026-01-01T23:30Z').zone, 'day');
});
test('a missing default and uncovered hour are unavailable', () => {
  const m = model(base({ defaultZone: null, rules: [overnight] }));
  assert.equal(m.valid, true); assert.equal(m.rateAt('2026-01-01T12:00Z').reason, 'missing_rate');
});
test('validity dates are inclusive local dates, with no extrapolation beyond the contract', () => {
  const m = model(base({ timezone: 'Pacific/Auckland' }));
  assert.equal(m.rateAt('2025-12-31T12:00Z').available, true);
  assert.equal(m.rateAt('2026-12-31T12:00Z').reason, 'outside_validity');
});
test('civil DST and an explicitly fixed meter clock give different, intentional rates', () => {
  const profile = base({ timezone: 'Europe/Warsaw', rules: [{ zone: 'night', intervals: [{ from: '13:00', to: '15:00' }] }] });
  assert.equal(model(profile).rateAt('2026-07-01T11:30Z').zone, 'night');
  assert.equal(model({ ...profile, clock: { mode: 'fixed', offsetMinutes: 60 } }).rateAt('2026-07-01T11:30Z').zone, 'day');
});
test('both repeated DST hours remain separate measured buckets', () => {
  const m = model(base({ timezone: 'Europe/Warsaw', rules: [overnight] }));
  const r = m.priceBuckets([hour('2026-10-25T00:00Z', 2), hour('2026-10-25T01:00Z', 3)]);
  assert.equal(r.complete, true); assert.equal(r.kwh, 5); assert.equal(r.energyCost, 2);
});
test('spring DST has no invented missing-hour consumption', () => {
  const m = model(base({ timezone: 'Europe/Warsaw', rules: [overnight] }));
  const r = m.priceBuckets([hour('2026-03-29T00:00Z', 2), hour('2026-03-29T01:00Z', 3)]);
  assert.equal(r.complete, true); assert.equal(r.kwh, 5); assert.equal(r.energyCost, 2);
});
test('an hourly measurement spanning a minute tariff boundary cannot be split by guessing', () => {
  const m = model(base({ rules: [{ zone: 'night', intervals: [{ from: '12:30', to: '13:00' }] }] }));
  const r = m.priceBuckets([hour('2026-01-01T12:00Z')]);
  assert.equal(r.complete, false); assert.equal(r.energyCost, null);
  assert.equal(r.issues[0].reason, 'mixed_rate_bucket');
});
test('buckets wholly inside minute intervals can be priced without redistribution', () => {
  const m = model(base({ rules: [{ zone: 'night', intervals: [{ from: '12:30', to: '13:00' }] }] }));
  const r = m.priceBuckets([bucket('2026-01-01T12:30Z', '2026-01-01T13:00Z')]);
  assert.equal(r.energyCost, 0.8);
});
test('missing consumption, duplicate or overlapping measurements invalidate the total', () => {
  const m = model(base()); const b = hour('2026-01-01T12:00Z');
  for (const rows of [[{ ...b, kwh: null }], [b, b], [b, hour('2026-01-01T12:30Z')]]) {
    const r = m.priceBuckets(rows); assert.equal(r.complete, false); assert.equal(r.kwh, null);
    assert.equal(r.energyCost, null);
  }
});
test('explicit requested coverage detects an omitted measured hour', () => {
  const m = model(base()); const r = m.priceBuckets([hour('2026-01-01T12:00Z')],
    { from: '2026-01-01T12:00Z', to: '2026-01-01T14:00Z' });
  assert.equal(r.complete, false); assert.equal(r.energyCost, null);
  assert.ok(r.issues.some(i => i.reason === 'missing_measurement'));
});
test('empty data is unavailable rather than a zero cost report', () => {
  const r = model(base()).priceBuckets([]); assert.equal(r.complete, false); assert.equal(r.energyCost, null);
});
test('dynamic prices require actual absolute intervals; gaps stay unavailable', () => {
  const m = model(base({ dynamic: { intervals: [
    { from: '2026-01-01T12:00Z', to: '2026-01-01T13:00Z', energyRate: 0.2, variableRate: 0.1 },
    { from: '2026-01-01T14:00Z', to: '2026-01-01T15:00Z', energyRate: 0.8, variableRate: 0.1 }] } }));
  assert.equal(m.priceBuckets([hour('2026-01-01T12:00Z', 10)]).usageCost, 3);
  assert.equal(m.rateAt('2026-01-01T13:30Z').reason, 'missing_rate');
});
test('overlapping dynamic prices are invalid and do not silently override', () => {
  const m = model(base({ dynamic: { intervals: [
    { from: '2026-01-01T12:00Z', to: '2026-01-01T13:00Z', energyRate: 0.2 },
    { from: '2026-01-01T12:30Z', to: '2026-01-01T14:00Z', energyRate: 0.8 }] } }));
  assert.equal(m.valid, false);
});
test('negative dynamic energy prices require explicit opt-in', () => {
  const p = base({ dynamic: { intervals: [{ from: '2026-01-01T12:00Z', to: '2026-01-01T13:00Z', energyRate: -0.2, variableRate: 0 }] } });
  assert.equal(model(p).valid, false);
  assert.equal(model({ ...p, allowNegativeEnergy: true }).priceBuckets([hour('2026-01-01T12:00Z')]).energyCost, -0.4);
});
test('invalid calendar, clock, zone and currency values return explicit validation errors', () => {
  for (const change of [{ timezone: 'No/SuchZone' }, { currency: '' }, { validFrom: '2026-02-30' },
    { validFrom: '2026-12-31', validTo: '2026-01-01' }, { clock: { mode: 'fixed', offsetMinutes: 5000 } },
    { rules: [{ zone: 'missing', intervals: [{ from: '00:00', to: '24:00' }] }] },
    { rules: [{ zone: 'night', weekdays: [7], intervals: [{ from: '22:00', to: '06:00' }] }] },
    { rules: [{ zone: 'night', intervals: [{ from: '25:00', to: '06:00' }] }] }]) {
    const m = model(base(change)); assert.equal(m.valid, false); assert.ok(m.errors.length);
  }
});
test('profile compilation leaves original config, unknown keys and measured buckets unchanged', () => {
  const p = base({ custom_future: { enabled: true } }); const rows = [hour('2026-01-01T12:00Z')];
  const before = JSON.stringify({ p, rows }); model(p).priceBuckets(rows);
  assert.equal(JSON.stringify({ p, rows }), before);
});
