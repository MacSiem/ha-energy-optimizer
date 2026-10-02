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

test('ordinary users get a read-only message and cannot mutate settings or schedules', async () => {
  const { dom, card: email } = card();
  email._hass.user.is_admin = false;
  const writes = [];
  email._hass.callWS = async msg => { writes.push(msg.type); return {}; };
  email._hass.callService = async (...args) => { writes.push(args); };
  try {
    for (const tab of ['config', 'schedule', 'send']) {
      email._activeTab = tab;
      email._render();
      assert.match(email.shadowRoot.getElementById('tab-content').textContent, /Only administrators/);
      assert.equal(email.shadowRoot.querySelector('#cfg-price-save, .schedule-save, #send-daily'), null);
    }
    await email._saveToHelper('recipient', 'nobody@example.invalid');
    await email._saveBackendSchedule('daily');
    await email._deleteBackendSchedule('daily');
    await email._createAutomation('daily');
    await email._testSmtp();
    assert.deepEqual(writes, []);
    assert.equal(dom.window.localStorage.length, 0);
  } finally { dom.window.close(); }
});

test('explicit admin settings save without helpers persists locally, including a zero tariff', async () => {
  const { dom, card: email } = card();
  const writes = [];
  email._hass.callService = async (...args) => writes.push(args);
  try {
    await email._saveToHelper('price', '0');
    await email._saveToHelper('recipient', 'preview@example.invalid');
    const restored = dom.window.document.createElement('ha-energy-email');
    restored._hass = email._hass;
    await restored._ensureHelpers();
    assert.equal(restored._config.energy_price, 0);
    assert.equal(restored._getRecipient(), 'preview@example.invalid');
    assert.equal(restored._helpersReady, false);
    assert.deepEqual(writes, []);
  } finally { dom.window.close(); }
});

test('an open Email overview refreshes Recorder windows after the refresh interval', async () => {
  const dom = new JSDOM('', {runScripts:'dangerously',url:'http://localhost/'});
  dom.window.eval(readFileSync(root+'/ha-energy-optimizer.js','utf8'));
  const card = dom.window.document.createElement('ha-energy-email');
  card._hass={states:{},config:{},user:{is_admin:false}};
  card._discoveryDone=true;
  card._lastPeriodRefresh=Date.now()-301000;
  card._renderTab=()=>{};
  let refreshed=0;
  card._fetchRecorderStats=async()=>{refreshed++};
  try {
    card._updateLiveData();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(refreshed,3);
    card._updateLiveData();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(refreshed,3,'do not refetch every HA state update');
  }finally{dom.window.close()}
});


test('background HA updates preserve an open email settings form', () => {
  const { dom, card: email } = card();
  try {
    email._activeTab = 'config';
    email._render();
    const input = email.shadowRoot.getElementById('cfg-email');
    input.value = 'draft@example.invalid';
    email._updateLiveData();
    assert.equal(email.shadowRoot.getElementById('cfg-email'), input);
    assert.equal(input.value, 'draft@example.invalid');
  } finally { dom.window.close(); }
});

test('Email first run identifies the missing grid source and links to Energy Dashboard', async () => {
  const { dom, card: email } = card();
  const calls = [];
  email._hass.callWS = async msg => {
    calls.push(msg.type);
    if (msg.type === 'energy/get_prefs') return { energy_sources: [] };
    throw new Error('Unexpected request');
  };
  try {
    await email._fetchRecorderStats('day');
    const view = dom.window.document.createElement('div');
    view.innerHTML = email._tabOverview();
    assert.match(view.textContent, /configure.*grid.import source/i);
    assert.equal(view.querySelector('a')?.getAttribute('href'), '/energy');
    assert.deepEqual(calls, ['energy/get_prefs']);
    assert.equal(email._getOverviewData().length, 0);
  } finally { dom.window.close(); }
});

test('Email distinguishes failed Recorder reads from sources with no measurements', async () => {
  const { dom, card: email } = card();
  const id = 'sensor.grid_import';
  let fail = true;
  email._hass.callWS = async msg => {
    if (msg.type === 'energy/get_prefs') return { energy_sources: [{ type: 'grid', stat_energy_from: id }] };
    if (msg.type === 'recorder/get_statistics_metadata') return [{ statistic_id: id, has_sum: true, statistics_unit_of_measurement: 'kWh' }];
    if (msg.type === 'recorder/statistics_during_period') {
      if (fail) throw new Error('Transport unavailable: private diagnostic must not appear');
      return { [id]: [] };
    }
    throw new Error('Unexpected request');
  };
  try {
    await email._fetchRecorderStats('day');
    const failed = dom.window.document.createElement('div');
    failed.innerHTML = email._tabOverview();
    assert.match(failed.textContent, /could not.*load|could not.*read/i);
    assert.doesNotMatch(failed.textContent, /private diagnostic|\(no_data\)/);
    assert.equal(email._getOverviewData().length, 0);
    fail = false;
    await email._fetchRecorderStats('day');
    const empty = dom.window.document.createElement('div');
    empty.innerHTML = email._tabOverview();
    assert.match(empty.textContent, /no.*Recorder statistics/i);
    assert.doesNotMatch(empty.textContent, /could not.*load|could not.*read|configure.*grid.import source/i);
    assert.equal(email._getOverviewData().length, 0);
  } finally { dom.window.close(); }
});
