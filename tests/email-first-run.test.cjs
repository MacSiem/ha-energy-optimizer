const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const root = require('node:path').join(__dirname, '..');
const { JSDOM } = createRequire(root + '/package.json')('jsdom');
function card() {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  dom.window.eval(readFileSync(root + '/ha-energy-optimizer.js', 'utf8'));
  const card = dom.window.document.createElement('ha-energy-email');
  card._hass = { user: { is_admin: true }, states: {}, config: { currency: 'EUR' } };
  card._discoveryDone = true;
  return { dom, card };
}
test('opening Energy Email only reads existing settings and never creates helpers', async () => {
  const { dom, card: email } = card();
  const writes = [];
  email._hass.callWS = async msg => { if (msg.type.endsWith('/create')) writes.push(msg.type); return []; };
  try {
    await email._ensureHelpers();
    assert.deepEqual(writes, []);
    assert.equal(email._helpersReady, false);
  } finally { dom.window.close(); }
});
test('default Energy Email overview never presents arbitrary lifetime sensors as report energy', () => {
  const { dom, card: email } = card();
  email._discoveredDevices = [{ key: 'solar', name: 'Solar lifetime', entity_id: 'sensor.solar', value_kwh: 9876, sensor_count: 1 }];
  try {
    const output = dom.window.document.createElement('div');
    output.innerHTML = email._tabOverview();
    assert.doesNotMatch(output.textContent, /9876|Solar lifetime/);
    assert.match(output.textContent, /unavailable|No.*data|not available/i);
  } finally { dom.window.close(); }
});
test('ordinary user cannot trigger an energy email send from the card', async () => {
  const { dom, card: email } = card();
  email._hass.user.is_admin = false;
  const writes = [];
  email._emailBackendAvailable = true;
  email._emailBackendConfig = { smtp_configured: true };
  email._hass.callWS = async msg => { writes.push(msg.type); return {}; };
  email._renderTab = () => {};
  email._attachSendEvents = () => {};
  try {
    await email._sendReportViaBackend('daily');
    assert.deepEqual(writes, []);
  } finally { dom.window.close(); }
});
