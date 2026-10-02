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
