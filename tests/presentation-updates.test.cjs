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
