const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

function setup(type) {
  const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
  dom.window.eval(readFileSync(join(__dirname, '..', 'ha-energy-optimizer.js'), 'utf8'));
  const card = dom.window.document.createElement(type);
  card._fetchData = async () => {};
  card._loadChartJs = () => {};
  card._discoverAll = async () => {};
  card._discoveryDone = true;
  card._emailBackendChecked = true;
  dom.window.document.body.append(card);
  const hass = { language: 'pl', locale: { language: 'pl' }, themes: { darkMode: true },
    user: { is_admin: true }, states: {}, config: { currency: 'EUR' } };
  card.hass = hass;
  return { dom, card, hass };
}

for (const language of ['en', 'pl']) {
  test(`Schedule ${language} renders statuses after backend create/update and preserves guards`, async () => {
    const { dom, card, hass } = setup('ha-energy-email');
    const writes = [];
    try {
      card.hass = { ...hass, language, locale: { language } };
      card._activeTab = 'schedule';
      card._emailBackendAvailable = true;
      card._emailBackendConfig = { smtp_configured: true };
      card._emailSchedules = [];
      card._emailWs = async (command, payload) => {
        if (command === 'set_schedule') {
          writes.push(payload);
          const schedule = { ...payload.schedule, id: payload.schedule_id || payload.schedule.cadence };
          return { schedules: [...card._emailSchedules.filter(s => s.cadence !== schedule.cadence), schedule] };
        }
        if (command === 'get_schedules') return { schedules: card._emailSchedules };
        throw new Error('Unexpected backend command: ' + command);
      };
      for (const cadence of ['daily', 'weekly', 'monthly']) {
        card._render();
        const section = () => card.shadowRoot.querySelector(`[data-schedule-card="${cadence}"]`);
        assert.match(section().querySelector('.badge').textContent, language === 'pl' ? /Nie utworzony/ : /Not Created/);
        assert.equal(section().querySelector('.schedule-delete').disabled, true);
        card.shadowRoot.getElementById('schedule-recipients-' + cadence).value = 'local@example.invalid';
        card.shadowRoot.getElementById('schedule-enabled-' + cadence).checked = false;
        await card._saveBackendSchedule(cadence);
        assert.equal(section().querySelector('.badge-er').textContent, '❌ ' + (language === 'pl' ? 'Wyłączony' : 'Disabled'));
        assert.equal(section().querySelector('.schedule-save').textContent, language === 'pl' ? 'Aktualizuj' : 'Update');
        card.shadowRoot.getElementById('schedule-enabled-' + cadence).checked = true;
        await card._saveBackendSchedule(cadence);
        assert.equal(section().querySelector('.badge-ok').textContent, '✅ ' + (language === 'pl' ? 'Aktywny' : 'Active'));
        card._scheduleBusy[cadence] = true;
        card._render();
        for (const control of ['.schedule-save', '.schedule-send', '.schedule-delete']) assert.equal(section().querySelector(control).disabled, true);
        card._scheduleBusy[cadence] = false;
      }
      assert.equal(writes.length, 6);
      assert.deepEqual(writes.map(w => w.schedule.enabled), [false, true, false, true, false, true]);
      const other = language === 'pl' ? 'en' : 'pl';
      card.hass = { ...hass, language: other, locale: { language: other } };
      assert.equal(card.shadowRoot.querySelector('.badge-ok').textContent, '✅ ' + (other === 'pl' ? 'Aktywny' : 'Active'));
      card.hass = { ...hass, language, locale: { language }, user: { is_admin: false } };
      await card._saveBackendSchedule('daily');
      assert.equal(writes.length, 6);
      assert.equal(card.shadowRoot.querySelector('.schedule-save'), null);
    } finally { dom.window.close(); }
  });

  test(`Legacy Schedule ${language} translates automation state without changing local storage mode`, () => {
    const { dom, card, hass } = setup('ha-energy-email');
    try {
      card.hass = { ...hass, language, locale: { language }, states: {
        'automation.send_daily_energy_report': { state: 'on' },
        'automation.send_weekly_energy_report': { state: 'off' }
      } };
      card._emailBackendAvailable = false;
      const view = dom.window.document.createElement('div');
      view.innerHTML = card._tabSchedule();
      assert.match(view.textContent, language === 'pl' ? /✅ Aktywny/ : /✅ Active/);
      assert.match(view.textContent, language === 'pl' ? /❌ Wyłączony/ : /❌ Disabled/);
      assert.match(view.textContent, /localStorage/);
      assert.equal(dom.window.localStorage.length, 0);
    } finally { dom.window.close(); }
  });
}

for (const type of ['ha-energy-optimizer', 'ha-energy-insights', 'ha-energy-email']) {
  test(`${type} support text and accessible dismissal follow locale, persist dismissal and retain role/config guards`, () => {
    const { dom, card, hass } = setup(type);
    try {
      for (const language of ['pl', 'en', 'pl']) {
        card.hass = { ...hass, language, locale: { language } };
        card._render();
        const footer = card.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
        assert.equal(footer.querySelector('a').textContent, language === 'pl' ? 'Opcjonalne wsparcie dla HA Tools' : 'Optional support for HA Tools');
        assert.equal(footer.querySelector('button').getAttribute('aria-label'), language === 'pl' ? 'Ukryj link wsparcia' : 'Dismiss support link');
        assert.equal(dom.window.localStorage.length, 0);
      }
      card.setConfig({ show_support: false });
      card._render();
      let footer = card.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
      assert.ok(!footer || footer.style.display === 'none');
      card.setConfig({ show_support: true });
      card.hass = { ...hass, user: { is_admin: false } };
      card._render();
      footer = card.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
      assert.ok(!footer || footer.style.display === 'none');
      card.hass = hass;
      card._render();
      card.shadowRoot.querySelector('.support-dismiss').click();
      assert.equal(dom.window.localStorage.getItem(type + '-support-dismissed'), '1');
      card._render();
      footer = card.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
      assert.ok(!footer || footer.style.display === 'none');
      assert.equal(dom.window.localStorage.length, 1);
    } finally { dom.window.close(); }
  });
}

// Optional real CSS-renderer regression, using the existing Node test runner.
// Enable with ENERGY_RENDER_CONTRAST=1 and an installed Playwright WebKit runtime.
// It uses only an offline in-memory card, never HA, Chrome or a saved profile.
if (process.env.ENERGY_RENDER_CONTRAST === '1') {
  test('rendered Email Last sent and Manual/Ręcznie meet 4.5:1 in EN/PL light/dark', async () => {
    const { webkit } = require('playwright');
    const browser = await webkit.launch({ headless: true });
    const rows = [];
    try {
      for (const language of ['en', 'pl']) for (const dark of [false, true]) {
        const page = await browser.newPage();
        await page.route('**/*', route => route.abort());
        await page.setContent('<!doctype html><html><body></body></html>');
        await page.addScriptTag({ path: join(__dirname, '..', 'ha-energy-optimizer.js') });
        const result = await page.evaluate(({ language, dark }) => {
          const tokens = dark
            ? { '--primary-text-color': '#e1e1e1', '--card-background-color': '#1c1c1c', '--disabled-text-color': '#6f6f6f' }
            : { '--primary-text-color': '#212121', '--card-background-color': '#ffffff', '--disabled-text-color': '#bdbdbd' };
          for (const [key, value] of Object.entries(tokens)) document.documentElement.style.setProperty(key, value);
          document.body.style.backgroundColor = tokens['--card-background-color'];
          const card = document.createElement('ha-energy-email');
          card._discoverAll = async () => {};
          card._ensureHelpers = async () => {};
          card._fetchRecorderStats = async () => {};
          card._discoveryDone = true;
          card._emailBackendChecked = true;
          card._emailBackendAvailable = true;
          card._emailBackendConfig = { smtp_configured: true };
          card._activeTab = 'send';
          card._lastSent.daily = '10:21';
          card.hass = { language, locale: { language }, themes: { darkMode: dark }, user: { is_admin: true }, states: {}, config: {} };
          document.body.append(card);
          card._render();
          const rgba = text => {
            const values = text.match(/[\d.]+/g).map(Number);
            return [values[0], values[1], values[2], values[3] ?? 1];
          };
          const blend = (color, background) => color.slice(0, 3).map((v, i) => v * color[3] + background[i] * (1 - color[3]));
          const luminance = color => color.map(v => {
            v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
          }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          const measure = selector => {
            const el = card.shadowRoot.querySelector(selector);
            const layers = [];
            for (let node = el; node; node = node.parentElement || node.getRootNode().host) {
              layers.push(rgba(getComputedStyle(node).backgroundColor));
            }
            const background = layers.reverse().reduce((bg, layer) => blend(layer, bg), [255, 255, 255]);
            const color = getComputedStyle(el).color;
            const foreground = blend(rgba(color), background);
            const a = luminance(foreground), b = luminance(background);
            return { selector, language, dark, text: el.textContent, color, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
          };
          const colors = [measure('#last-daily'), measure('.badge-pr')];
          const adminEnabled = !card.shadowRoot.getElementById('send-daily').disabled;
          card._hass.user.is_admin = false;
          card._render();
          const householdBlocked = !card.shadowRoot.querySelector('#send-daily, #btn-smtp-test');
          return { colors, adminEnabled, householdBlocked };
        }, { language, dark });
        rows.push(...result.colors);
        assert.equal(result.adminEnabled, true);
        assert.equal(result.householdBlocked, true);
        await page.close();
      }
      console.log('EMAIL_SEND_RENDERED_CONTRAST', JSON.stringify(rows));
      for (const row of rows) assert.ok(row.ratio >= 4.5,
        `${row.language}/${row.dark ? 'dark' : 'light'} ${row.selector} ratio ${row.ratio} must reach 4.5`);
    } finally { await browser.close(); }
  });
}

// Actual consumer: native7335/c9e70e557a144fa6b2449602a1f2b54b Energy Send PL.
// Its separate "Manual snapshot only" QA paragraph is not product copy.
for (const language of ['pl', 'en']) {
  test(`Email Send ${language} localizes visible/accessibility labels, badges, busy and last-sent without changing send guards`, () => {
    const { dom, card, hass } = setup('ha-energy-email');
    const writes = [];
    try {
      card._activeTab = 'send';
      card.hass = { ...hass, language, locale: { language },
        callWS: async msg => { writes.push(msg); return {}; },
        callService: async (...args) => { writes.push(args); } };
      const pl = language === 'pl';
      const labels = pl ? ['Wyślij raport dzienny', 'Wyślij raport tygodniowy', 'Wyślij raport miesięczny'] : ['Send Daily', 'Send Weekly', 'Send Monthly'];
      for (const mode of ['missing', 'unconfigured', 'configured', 'legacy']) {
        card._emailBackendAvailable = ['unconfigured', 'configured'].includes(mode);
        card._emailBackendConfig = { smtp_configured: mode === 'configured' };
        card._hass.services = mode === 'legacy' ? { ha_tools_email: { send: {} } } : {};
        card._lastSent = { daily: '10:21', weekly: '10:22', monthly: '10:23', quick: '10:24' };
        for (const busy of [false, true]) {
          card._sending = busy;
          card._render();
          const content = card.shadowRoot.getElementById('tab-content');
          assert.deepEqual([...content.querySelectorAll('.badge-pr')].map(x => x.textContent), Array(3).fill(pl ? 'Ręcznie' : 'Manual'));
          assert.equal(content.querySelector('.badge-ok').textContent, pl ? 'Natychmiast' : 'Instant');
          const buttons = [...content.querySelectorAll('#send-daily, #send-weekly, #send-monthly')];
          buttons.forEach((button, i) => {
            assert.ok(button.textContent.includes(busy ? (pl ? 'Wysyłam...' : 'Sending...') : labels[i]));
            assert.equal(button.getAttribute('aria-label') || button.textContent, button.textContent,
              'accessible name follows the translated button text');
            assert.equal(button.disabled, busy || !['configured', 'legacy'].includes(mode));
          });
          assert.equal(content.querySelector('#send-quick').disabled, busy || mode !== 'legacy');
          [...content.querySelectorAll('.last-sent')].forEach((row, i) => {
            assert.equal(row.textContent, `${pl ? 'Ostatnio wysłano: ' : 'Last sent: '}10:2${i + 1}`);
          });
          if (pl) assert.doesNotMatch(content.textContent, /\bManual\b|\bInstant\b|Send Daily|Send Weekly|Send Monthly|Sending\.\.\.|Last sent:/);
        }
        card._sending = false;
        if (mode === 'configured') {
          card._activeTab = 'schedule'; card._render();
          const buttons = [...card.shadowRoot.querySelectorAll('.schedule-send')];
          assert.equal(buttons.length, 3);
          assert.ok(buttons.every(button => button.textContent === (pl ? 'Wyślij teraz' : 'Send now')));
          card._activeTab = 'send';
        }
      }
      assert.deepEqual(writes, []);
      assert.equal(dom.window.localStorage.length, 0);
    } finally { dom.window.close(); }
  });
}

test('ordinary HA locale changes refresh Send labels and retain last-sent text and disabled state', () => {
  const { dom, card, hass } = setup('ha-energy-email');
  try {
    card._activeTab = 'send';
    card._lastSent.daily = '10:21';
    card._render();
    card.hass = { ...hass, language: 'en', locale: { language: 'en' } };
    assert.match(card.shadowRoot.getElementById('send-daily').textContent, /Send Daily/);
    assert.equal(card.shadowRoot.getElementById('last-daily').textContent, 'Last sent: 10:21');
    card.hass = { ...hass, language: 'pl', locale: { language: 'pl' } };
    assert.match(card.shadowRoot.getElementById('send-daily').textContent, /Wyślij raport dzienny/);
    assert.equal(card.shadowRoot.getElementById('last-daily').textContent, 'Ostatnio wysłano: 10:21');
    assert.equal(card.shadowRoot.getElementById('send-daily').disabled, true);
  } finally { dom.window.close(); }
});

test('Insights updates its existing header and navigation when HA language changes', () => {
  const { dom, card, hass } = setup('ha-energy-insights');
  try {
    const tab = card.shadowRoot.querySelector('[data-tab="daily"]');
    tab.focus();
    card.hass = { ...hass, language: 'en', locale: { language: 'en' } };
    assert.match(card.shadowRoot.querySelector('.panel-title').textContent, /Energy Insights/);
    assert.equal(card.shadowRoot.querySelector('[data-tab="daily"]').textContent.trim(), 'Daily');
    assert.equal(card.shadowRoot.activeElement, tab, 'keep focused navigation node');
  } finally { dom.window.close(); }
});

test('Email language changes translate navigation and preserve an unsaved settings draft and focus', () => {
  const { dom, card, hass } = setup('ha-energy-email');
  try {
    card._activeTab = 'config';
    card._render();
    const field = card.shadowRoot.getElementById('cfg-email');
    field.value = 'draft@example.invalid';
    field.focus();
    const storageBefore = dom.window.localStorage.length;
    card.hass = { ...hass, language: 'en', locale: { language: 'en' } };
    assert.match(card.shadowRoot.querySelector('[data-tab="overview"]').textContent, /Overview/);
    assert.match(card.shadowRoot.querySelector('.header-sub').textContent, /No recipient set/);
    assert.equal(card.shadowRoot.getElementById('cfg-email').value, 'draft@example.invalid');
    assert.equal(card.shadowRoot.activeElement?.id, 'cfg-email');
    assert.equal(dom.window.localStorage.length, storageBefore, 'locale change is not a settings save');
  } finally { dom.window.close(); }
});

test('Insights updates existing chart axes when HA theme colors change without new statistics', () => {
  const { dom, card, hass } = setup('ha-energy-insights');
  try {
    const chart = { options: { scales: { x: { ticks: { color: '#cbd5e1' } },
      y: { ticks: { color: '#cbd5e1' }, grid: { color: '#333' } } } },
      update() { this.updated = true; }, destroy() {} };
    card._charts.daily = chart;
    card.style.setProperty('--primary-text-color', '#111827');
    card.style.setProperty('--divider-color', '#d1d5db');
    card.hass = { ...hass, themes: { darkMode: false } };
    assert.equal(chart.options.scales.x.ticks.color, '#111827');
    assert.equal(chart.options.scales.y.ticks.color, '#111827');
    assert.equal(chart.options.scales.y.grid.color, '#d1d5db');
    assert.equal(chart.updated, true);
  } finally { dom.window.close(); }
});

test('Email locale changes preserve unsaved schedule fields, checkbox and caret without saving', () => {
  const { dom, card, hass } = setup('ha-energy-email');
  try {
    card._activeTab = 'schedule';
    card._render();
    const field = card.shadowRoot.getElementById('schedule-recipients-daily');
    field.value = 'unsaved@example.invalid';
    field.focus();
    field.setSelectionRange(2, 7, 'backward');
    card.shadowRoot.getElementById('schedule-time-daily').value = '13:45';
    card.shadowRoot.getElementById('schedule-enabled-daily').checked = true;
    const storageBefore = dom.window.localStorage.length;
    card.hass = { ...hass, language: 'en', locale: { language: 'en' } };
    const restored = card.shadowRoot.getElementById('schedule-recipients-daily');
    assert.equal(restored.value, 'unsaved@example.invalid');
    assert.equal(card.shadowRoot.activeElement, restored);
    assert.deepEqual([restored.selectionStart, restored.selectionEnd, restored.selectionDirection], [2, 7, 'backward']);
    assert.equal(card.shadowRoot.getElementById('schedule-time-daily').value, '13:45');
    assert.equal(card.shadowRoot.getElementById('schedule-enabled-daily').checked, true);
    assert.equal(dom.window.localStorage.length, storageBefore);
  } finally { dom.window.close(); }
});

test('Email locale changes keep an inline tariff draft open without applying its value', () => {
  const { dom, card, hass } = setup('ha-energy-email');
  try {
    card.shadowRoot.getElementById('price-display').click();
    const input = card.shadowRoot.getElementById('price-input');
    input.value = '1.25';
    input.focus();
    card.hass = { ...hass, language: 'en', locale: { language: 'en' } };
    assert.equal(card.shadowRoot.getElementById('price-input').value, '1.25');
    assert.equal(card.shadowRoot.activeElement?.id, 'price-input');
    assert.equal(card._config.energy_price, null);
    assert.equal(dom.window.localStorage.length, 0);
  } finally { dom.window.close(); }
});
