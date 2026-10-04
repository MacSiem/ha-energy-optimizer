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

// Consumer regression: Email Reports cold-missing run 8b61dd8f4dfa462da388a1c756f87ac3.
for (const language of ['en', 'pl']) {
  for (const state of ['missing', 'unconfigured', 'configured', 'legacy', 'transport', 'unavailable', 'unauthorized', 'no-websocket']) {
    test(`SMTP first run ${language}/${state} keeps installation, configuration and unavailable states distinct`, async () => {
      const { dom, card: email } = card();
      const writes = [];
      email._lang = language;
      email._activeTab = 'send';
      email._hass.services = state === 'legacy' ? { ha_tools_email: { send: {} } } : {};
      email._hass.callService = async (...args) => writes.push(args);
      email._hass.callWS = async msg => {
        if (msg.type !== 'ha_tools_email/get_config' && msg.type !== 'ha_tools_email/preview_energy_report') {
          writes.push(msg); throw new Error('Unexpected write');
        }
        if (state === 'missing' || state === 'legacy') throw { code: 'unknown_command', message: 'Unknown command' };
        if (state === 'transport') throw new Error('Connection lost: private diagnostic');
        if (state === 'unavailable') throw { code: 'not_loaded', message: 'Integration intentionally disabled' };
        if (state === 'unauthorized') throw { code: 'unauthorized', message: 'Access denied' };
        if (msg.type === 'ha_tools_email/get_config') return { smtp_configured: state === 'configured' };
        return null;
      };
      if (state === 'no-websocket') delete email._hass.callWS;
      try {
        await email._loadEmailBackendConfig();
        email._render();
        const section = email.shadowRoot.querySelector('.smtp-section');
        const text = section.textContent;
        if (state === 'missing') {
          assert.match(text, language === 'pl' ? /integracja.*nie.*(?:zainstalowana|dodana)/i : /integration.*not.*(?:installed|added)/i);
          assert.match(text, /HACS/);
          assert.equal(section.querySelector('a[href="/hacs"]')?.textContent, 'HACS');
          assert.ok(text.indexOf('HACS') < text.indexOf(language === 'pl' ? 'Dodaj' : 'Add'));
          assert.ok(text.indexOf(language === 'pl' ? 'Dodaj' : 'Add') < text.indexOf(language === 'pl' ? 'Konfiguruj' : 'Configure'));
          assert.doesNotMatch(text, /SMTP Not Configured|SMTP nie skonfigurowany/);
          assert.equal(email.shadowRoot.querySelectorAll('a[href="/config/integrations/integration/ha_tools_email"]').length, 0);
        } else if (state === 'unconfigured') {
          assert.match(text, language === 'pl' ? /SMTP nie skonfigurowany/ : /SMTP Not Configured/);
          assert.equal(section.querySelector('a')?.getAttribute('href'), '/config/integrations/integration/ha_tools_email');
          assert.doesNotMatch(text, /HACS/);
        } else if (state === 'configured' || state === 'legacy') {
          assert.match(text, language === 'pl' ? /SMTP skonfigurowany/ : /SMTP Configured/);
          assert.doesNotMatch(text, /HACS/);
          if (state === 'legacy') assert.match(text, /legacy/);
        } else {
          assert.match(text, language === 'pl' ? /(?:niedostępny|sprawd)/i : /(?:unavailable|check)/i);
          assert.doesNotMatch(text, /HACS|not installed|nie.*zainstalowana|SMTP Not Configured|SMTP nie skonfigurowany|private diagnostic/);
        }
        const send = [...email.shadowRoot.querySelectorAll('#send-daily, #send-weekly, #send-monthly, #send-quick')];
        assert.equal(send.length, 4);
        if (!['configured', 'legacy'].includes(state)) {
          assert.ok(send.every(button => button.disabled));
          send.forEach(button => button.click());
        } else {
          assert.ok(send.slice(0, 3).every(button => !button.disabled));
          assert.equal(send[3].disabled, state === 'configured');
        }
        assert.deepEqual(writes, []);
        assert.equal(dom.window.localStorage.length, 0);
        email._activeTab = 'config';
        email._render();
        assert.equal(email.shadowRoot.querySelector('.smtp-section').textContent, text,
          'Config and Send show the same first-run state');
      } finally { dom.window.close(); }
    });
  }
  test(`household SMTP first run ${language} reads no backend and exposes no write controls`, async () => {
    const { dom, card: email } = card();
    email._lang = language;
    email._hass.user.is_admin = false;
    const writes = [];
    email._hass.callWS = async msg => { writes.push(msg); return {}; };
    email._hass.callService = async (...args) => writes.push(args);
    try {
      await email._loadEmailBackendConfig();
      for (const tab of ['send', 'config']) {
        email._activeTab = tab; email._render();
        assert.match(email.shadowRoot.getElementById('tab-content').textContent, language === 'pl' ? /administrator/ : /administrators/);
        assert.equal(email.shadowRoot.querySelector('#send-daily, #btn-smtp-test'), null);
      }
      await email._sendReport('daily');
      await email._testSmtp();
      assert.deepEqual(writes, []);
      assert.equal(dom.window.localStorage.length, 0);
    } finally { dom.window.close(); }
  });
}

test('a later transport failure or successful configuration clears earlier missing guidance', async () => {
  const { dom, card: email } = card();
  let state = 'missing';
  email._hass.callWS = async msg => {
    if (state === 'missing') throw { code: 'unknown_command', message: 'Unknown command' };
    if (state === 'transport') throw new Error('Connection lost');
    return msg.type === 'ha_tools_email/get_config' ? { smtp_configured: true } : null;
  };
  try {
    await email._loadEmailBackendConfig();
    assert.match(email._renderSmtpSection(), /HACS/);
    state = 'transport';
    await email._loadEmailBackendConfig();
    assert.doesNotMatch(email._renderSmtpSection(), /HACS|not installed/);
    state = 'configured';
    await email._loadEmailBackendConfig();
    assert.match(email._renderSmtpSection(), /SMTP Configured/);
    assert.doesNotMatch(email._renderSmtpSection(), /HACS|not installed/);
  } finally { dom.window.close(); }
});
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


test('legacy Schedule describes actual settings storage with and without existing HA helpers', () => {
  const { dom, card: email } = card();
  email._emailBackendAvailable = false;
  try {
    for (const language of ['en', 'pl']) {
      email._lang = language;
      for (const helpersReady of [false, true]) {
        email._helpersReady = helpersReady;
        const view = dom.window.document.createElement('div');
        view.innerHTML = email._tabSchedule();
        const footer = view.lastElementChild.textContent;
        if (helpersReady) {
          assert.match(footer, language === 'pl' ? /Home Assistant.*każdym urządzeniu/ : /Home Assistant.*all your devices/);
        } else {
          assert.match(footer, language === 'pl' ? /tylko.*przeglądarce/ : /only.*browser/);
          assert.doesNotMatch(footer, /all your devices|każdym urządzeniu/);
        }
      }
    }
  } finally { dom.window.close(); }
});
