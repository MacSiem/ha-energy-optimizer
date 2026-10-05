const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Published HA Tools Email v2.1.1 accepts get_config/send_now/set_schedule,
// but preview_energy_report returns unknown_command. Its server composer
// discovers appliance meters and supplies default currency/price. This
// fixture reproduces that actual capability boundary without sending SMTP.
function backendFixture({ legacy = true, modern = false } = {}) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  const NativeDate = dom.window.Date;
  const now = Date.parse('2026-10-05T12:30:00Z');
  dom.window.Date = class extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  };
  dom.window.eval(readFileSync(join(__dirname, '..', 'ha-energy-optimizer.js'), 'utf8'));
  const card = dom.window.document.createElement('ha-energy-email');
  card._discoveryDone = true;
  card._lang = 'en';
  card._config.recipient = 'recipient@qa.invalid';
  const writes = [];
  const begin = Date.parse('2026-10-04T12:00:00Z');
  card._hass = {
    user: { is_admin: true }, config: { currency: 'EUR' }, states: {},
    services: legacy ? { ha_tools_email: { send: {} } } : {},
    callService: async (domain, service, data) => writes.push({ domain, service, data }),
    callWS: async msg => {
      if (msg.type === 'ha_tools_email/get_config') return {
        server: '127.0.0.1', port: 1025, username: 'synthetic', sender: 'sender@qa.invalid',
        encryption: 'none', default_recipient: 'recipient@qa.invalid', uses_secret: false,
        smtp_configured: true, schedules: [],
      };
      if (msg.type === 'ha_tools_email/preview_energy_report') {
        if (!modern) throw { code: 'unknown_command', message: 'Unknown command' };
        return { status: 'ready', total_kwh: 24, total_cost: null, source_ids: ['sensor.grid'],
          period: { start: '2026-10-04T12:00:00+00:00', end: '2026-10-05T12:00:00+00:00', cadence: msg.cadence },
          devices: [{ entity_id: 'sensor.grid', name: 'Grid', kwh: 24, cost: null }] };
      }
      if (msg.type === 'energy/get_prefs') return { energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.grid' }] };
      if (msg.type === 'recorder/get_statistics_metadata') return { 'sensor.grid': { has_sum: true, unit_class: 'energy', statistics_unit_of_measurement: 'kWh' } };
      if (msg.type === 'recorder/statistics_during_period') return { 'sensor.grid': Array.from({ length: 24 }, (_, i) => ({ start: (begin + i * 3600000) / 1000, change: 1 })) };
      if (msg.type === 'ha_tools_email/send_now' || msg.type === 'ha_tools_email/set_schedule') {
        writes.push(msg); return { schedules: [] };
      }
      throw new Error('Unexpected request');
    },
  };
  return { dom, card, writes };
}

test('older backend manual send retains the validated Recorder legacy report instead of its old server composer', async () => {
  const { dom, card, writes } = backendFixture();
  try {
    await card._loadEmailBackendConfig();
    await card._sendReport('daily');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].domain, 'ha_tools_email');
    assert.equal(writes[0].service, 'send');
    assert.match(writes[0].data.body, /24\.00\s*kWh/);
    assert.match(writes[0].data.body, /2026-10-04T12:00:00\.000Z/);
    assert.match(writes[0].data.body, /2026-10-05T12:00:00\.000Z/);
    assert.doesNotMatch(writes[0].data.body, /PLN|0\.65/);
  } finally { dom.window.close(); }
});

test('older backend cannot create a server schedule using the obsolete energy composer', async () => {
  const { dom, card, writes } = backendFixture();
  try {
    await card._loadEmailBackendConfig();
    card._activeTab = 'schedule'; card._render();
    await card._saveBackendSchedule('daily');
    assert.deepEqual(writes, []);
    assert.match(card.shadowRoot.textContent, /2\.1\.2/);
  } finally { dom.window.close(); }
});

test('older backend without a legacy send service disables sends and keeps an update path', async () => {
  const { dom, card, writes } = backendFixture({ legacy: false });
  try {
    await card._loadEmailBackendConfig();
    card._activeTab = 'send'; card._render();
    assert.ok([...card.shadowRoot.querySelectorAll('#send-daily,#send-weekly,#send-monthly')].every(b => b.disabled));
    assert.match(card.shadowRoot.textContent, /2\.1\.2/);
    assert.deepEqual(writes, []);
  } finally { dom.window.close(); }
});

test('current backend keeps its server composer send path', async () => {
  const { dom, card, writes } = backendFixture({ modern: true });
  try {
    await card._loadEmailBackendConfig(); await card._sendReport('daily');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].type, 'ha_tools_email/send_now');
    assert.equal(writes[0].kind, 'energy_report');
    assert.equal(writes[0].cadence, 'daily');
  } finally { dom.window.close(); }
});


test('older backend preview and schedule send use the same Recorder report', async () => {
  const { dom, card, writes } = backendFixture();
  try {
    await card._loadEmailBackendConfig();
    await card._fetchAllPeriodStats();
    card._activeTab = 'preview'; card._render();
    assert.doesNotMatch(card.shadowRoot.textContent, /Server preview unavailable/);
    assert.match(card.shadowRoot.textContent, /24\.0\s*kWh/);
    await card._sendScheduleNow('daily');
    assert.equal(writes.length, 1);
    assert.equal(writes[0].service, 'send');
    assert.match(writes[0].data.body, /24\.00\s*kWh/);
  } finally { dom.window.close(); }
});

test('older backend without a send service does not claim a successful SMTP test', async () => {
  const { dom, card, writes } = backendFixture({ legacy: false });
  try {
    await card._loadEmailBackendConfig();
    await card._testSmtp();
    assert.equal(card._smtpStatus.ok, false);
    assert.match(card._smtpStatus.error, /2\.1\.2/);
    assert.deepEqual(writes, []);
  } finally { dom.window.close(); }
});
