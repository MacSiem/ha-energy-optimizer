'use strict';
const {isolateLegacyAnalysis}=require('./helpers/legacy-analysis-fixture.cjs');
const { energyBackend, drainBackend, mountForPricing } = require('./helpers/energy-backend-fixture.cjs');

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
  isolateLegacyAnalysis(card);
  card._hass = { config: { time_zone: 'UTC', currency: 'EUR' }, states: {}, user: { id: 'measurement-fixture', is_admin: false }, connection: { connected: true } };
  card._config = { ...card._config, tariff_profile: profile() };
  card._hass.callWS = energyBackend(card, async request => { throw Error(request.type); });
  return { dom, card };
}
for (const type of ['ha-energy-optimizer', 'ha-energy-insights', 'ha-energy-email']) {
  test(`${type} uses the same custom tariff, timestamps and fee basis`, async () => {
    const { dom, card } = setup(type);
    try {
      const buckets = [{ from: '2026-07-01T05:00Z', to: '2026-07-01T06:00Z', kwh: 10 }];
      assert.equal(card._getTariffV3().priceBuckets(buckets).energyCost, null);
      await drainBackend();
      const r = card._getTariffV3().priceBuckets(buckets);
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
test('Optimizer calculates costs from absolute measured buckets, never a repeated-hour aggregate', async () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    card._config.tariff_profile = { ...profile(), timezone: 'Europe/Warsaw', dynamic: { intervals: [
      { from: '2026-10-25T00:00Z', to: '2026-10-25T01:00Z', energyRate: 1, variableRate: 0 },
      { from: '2026-10-25T01:00Z', to: '2026-10-25T02:00Z', energyRate: 2, variableRate: 0 }] } };
    const start = Date.parse('2026-10-25T00:00Z');
    card._energyModel = { todayStart: start, end: start + 7200000,
      points: new Map([[start, { kwh: 2 }], [start + 3600000, { kwh: 3 }]]) };
    card._energyData = [0, 0, 5]; card._hasRealData = true;
    card._getTariffV3(); await drainBackend();
    assert.equal(card._calculateTodayCost(), 8);
  } finally { dom.window.close(); }
});
for (const missing of [false, true]) test(`Optimizer primary snapshot includes variable fees and preserves incomplete=${missing}`, async () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    const start = Date.parse('2026-07-01T05:00Z');
    card._energyModel = { todayStart: start, end: start + (missing ? 7200000 : 3600000),
      points: new Map([[start, { kwh: 10 }]]) };
    card._getTariffV3();
    assert.equal(card._calculateTodayCost(), null, 'no authoritative snapshot received yet');
    await drainBackend();
    assert.equal(card._calculateTodayCost(), missing ? null : 5);
    assert.equal(card._energySnapshotV5.today.energy_cost, missing ? null : 4);
    assert.equal(card._energySnapshotV5.today.variable_cost, missing ? null : 1);
  } finally { dom.window.close(); }
});
test('Optimizer shows actual tariff costs and removes hypothetical shifting recommendations', async () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    card._config.peak_rate = 1; card._config.off_peak_rate = 0.4;
    const start = Date.parse('2026-07-01T05:00Z');
    card._energyModel = { todayStart: start, end: start + 3600000, zone: 'UTC', points: new Map([[start, { kwh: 10 }]]) };
    card._hasRealData = true; card._energyData = [0, 0, 0, 0, 0, 10];
    card._schedule = () => {}; card._currentTab = 'recommendations'; card._render(); await drainBackend();
    card._render();
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

for (const type of ['ha-energy-optimizer', 'ha-energy-insights', 'ha-energy-email']) {
  test(`${type} opens its visual tariff settings without writes and keeps household access read-only`, () => {
    const { dom, card } = setup(type);
    try {
      const calls = []; card._hass.user.id = 'fixture-user'; card._hass.connection = { connected: true };
      card._hass.callWS = async request => { calls.push(request); throw Error('No API call expected'); };
      card._config.show_support = false; card._schedule = () => {}; card._render();
      const details = card.shadowRoot.querySelector('[data-tariff-details]'); assert.ok(details);
      details.open = true; details.dispatchEvent(new dom.window.Event('toggle'));
      const currency = card.shadowRoot.querySelector('[data-path="currency"]'); assert.ok(currency);
      assert.equal(currency.value, 'CHF'); assert.equal(currency.disabled, true);
      assert.equal(card.shadowRoot.querySelector('[data-action="save"]'), null); assert.equal(calls.length, 0);
    } finally { dom.window.close(); }
  });
  test(`${type} validates a proposed profile separately from its active card config`, () => {
    const { dom, card } = setup(type);
    try { const before = JSON.stringify(card._config); assert.equal(card._getTariffV3({ schema: 0 }).valid, false);
      assert.equal(card._getTariffV3().valid, true); assert.equal(JSON.stringify(card._config), before);
    } finally { dom.window.close(); }
  });
}
test('a shared tariff read changes the effective prices without overwriting legacy config', async () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    delete card._config.tariff_profile; card._config.energy_price = 0.7;
    const before = JSON.stringify(card._config), calls = [];
    card._hass.user.id = 'a'; card._hass.connection = { connected: true };
    card._hass.callWS = energyBackend(card, async request => { calls.push(request); return { profile: profile(), revision: 3, updated_at: '2026-10-12T10:00:00Z' }; });
    await card._loadSharedTariffProfile();
    assert.deepEqual(calls.map(call => call.type), ['ha_tools_email/get_tariff']);
    const buckets = [{ from: '2026-01-01T02:00Z', to: '2026-01-01T03:00Z', kwh: 1 }];
    card._getTariffV3().priceBuckets(buckets); await drainBackend();
    assert.equal(card._getTariffV3().priceBuckets(buckets).energyCost, 0.4);
    assert.equal(card._tariffCurrency(), 'CHF'); assert.equal(JSON.stringify(card._config), before);
  } finally { dom.window.close(); }
});
test('an old connection tariff read cannot replace the new connection profile', async () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    delete card._config.tariff_profile; let resolve;
    card._hass.user.id = 'a'; card._hass.connection = { connected: true };
    card._hass.callWS = () => new Promise(r => { resolve = r; });
    const pending = card._loadSharedTariffProfile();
    card._hass = { ...card._hass, user: { id: 'b', is_admin: false }, connection: { connected: true } };
    resolve({ profile: profile(), revision: 3, updated_at: '2026-10-12T10:00:00Z' }); await pending;
    assert.equal(card._sharedTariffProfile ?? null, null);
  } finally { dom.window.close(); }
});
test('Insights prices both repeated DST buckets in the hour shown by its chart', async () => {
  const { dom, card } = setup('ha-energy-insights');
  try {
    const NativeDate = dom.window.Date, end = Date.parse('2026-10-25T03:00Z');
    dom.window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [end])); } static now() { return end; } };
    card._hass.config.time_zone = 'Europe/Warsaw';
    card._config.tariff_profile = { ...profile(), timezone: 'Europe/Warsaw', dynamic: { intervals: [
      { from: '2026-10-24T22:00Z', to: '2026-10-25T00:00Z', energyRate: 1, variableRate: 0 },
      { from: '2026-10-25T00:00Z', to: '2026-10-25T01:00Z', energyRate: 2, variableRate: 0 },
      { from: '2026-10-25T01:00Z', to: '2026-10-25T02:00Z', energyRate: 3, variableRate: 0 },
      { from: '2026-10-25T02:00Z', to: '2026-10-25T03:00Z', energyRate: 4, variableRate: 0 }] } };
    card._hass.callWS = energyBackend(card, async request => request.type === 'energy/get_prefs' ? { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.synthetic' }] } :
      request.type === 'recorder/get_statistics_metadata' ? { 'sensor.synthetic': { has_sum: true, statistics_unit_of_measurement: 'kWh', unit_class: 'energy' } } :
      { 'sensor.synthetic': Array.from({ length: 720 }, (_, i) => ({ start: end - (720 - i) * 3600000, change: 1 })) });
    mountForPricing(card);
    await card._fetchData(); await drainBackend(); assert.equal(card._data.todayCost, 11); assert.equal(card._data.dailyCosts[2], 5);
  } finally { dom.window.close(); }
});

for (const admin of [true, false]) test(`an unedited editor opened before the shared read shows its confirmed rates (${admin ? 'admin' : 'household'})`, async () => {
  const { dom, card } = setup('ha-energy-optimizer');
  try {
    delete card._config.tariff_profile; delete card._config.energy_price;
    card._hass.user = { id: 'fixture', is_admin: admin }; card._hass.connection = { connected: true };
    let resolve; card._hass.callWS = () => new Promise(r => { resolve = r; });
    const pending = card._loadSharedTariffProfile();
    card._schedule = () => {}; card._render();
    const details = card.shadowRoot.querySelector('[data-tariff-details]');
    details.open = true; details.dispatchEvent(new dom.window.Event('toggle'));
    resolve({ profile: profile(), revision: 3, updated_at: '2026-10-12T10:00:00Z' }); await pending;
    card._render();
    assert.equal(card.shadowRoot.querySelector('[data-path="currency"]').value, 'CHF');
    assert.equal(card.shadowRoot.querySelector('[data-path="zones.0.energyRate"]').value, '1');
    assert.equal(card.shadowRoot.querySelector('[data-action="save"]') === null, !admin);
  } finally { dom.window.close(); }
});


for (const [type, tab] of [['ha-energy-optimizer','patterns'],['ha-energy-insights','daily']]) {
 for (const offline of [false,true]) test(`${type} reconfirms shared tariff on real tab navigation after offline=${offline}`, async t => {
  const dom = new JSDOM('', {runScripts:'outside-only',url:'http://localhost/'});t.after(()=>dom.window.close());
  dom.window.eval(['src/optimizer.js','src/energy-insights.js','src/energy-email.js'].map(p=>readFileSync(join(__dirname,'..',p),'utf8')).join(''));
  const card=dom.window.document.createElement(type),calls=[];card._schedule=()=>{};card._config.show_support=false;
  card._hasRealData=true;const connection=new dom.window.EventTarget();connection.connected=true;
  card._hass={user:{id:'navigation-user',is_admin:true},connection,states:{},language:'en',config:{currency:'PLN',time_zone:'UTC'},
   callWS:async msg=>{calls.push(msg);if(msg.type==='ha_tools_email/get_tariff')return {profile:profile(),revision:4,updated_at:null};throw Error('Unexpected '+msg.type);}};
  card._hass.callWS=energyBackend(card,card._hass.callWS);
  dom.window.document.body.append(card);await card._loadSharedTariffProfile();card._render();
  assert.equal(card._sharedTariffProfile.currency,'CHF');
  if(offline){dom.window.dispatchEvent(new dom.window.Event('offline'));dom.window.dispatchEvent(new dom.window.Event('online'));}
  const button=card.shadowRoot.querySelector(`[data-tab="${tab}"]`);assert.ok(button);button.click();
  await drainBackend();
  assert.equal(card._sharedTariffProfile?.currency,'CHF');
  assert.equal(card._getTariffHostV3().snapshot().provenance,'shared_backend');
  assert.equal(calls.filter(c=>c.type==='ha_tools_email/get_tariff').length,2);
  assert.equal(calls.some(c=>/set_tariff|set_schedule|send_now/.test(c.type)),false);
 });
}
