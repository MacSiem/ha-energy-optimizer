// Catches a settled, invalidated first read leaving a spinner and blocking recovery.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const code = ['src/optimizer.js', 'src/energy-insights.js', 'src/energy-email.js', 'src/chart-vendor.js']
  .map(path => readFileSync(join(__dirname, '..', path), 'utf8')).join('');
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };

for (const boundary of ['tab', 'remount', 'callWS']) {
  test(`Insights recovers its invalidated first read after ${boundary}`, async () => {
    const dom = new JSDOM('', { runScripts: 'dangerously', url: 'http://localhost/' });
    dom.window.eval(code);
    const card = dom.window.document.createElement('ha-energy-insights');
    card._schedule = () => {};
    const connection = new dom.window.EventTarget(); connection.connected = true;
    let resolveFirst;
    const calls = [];
    const callWS = request => {
      calls.push(request.type);
      if (request.type === 'ha_tools_email/get_tariff')
        return Promise.resolve({ profile: null, revision: 0, updated_at: null });
      assert.equal(request.type, 'energy/get_prefs');
      return calls.length === 1 ? new Promise(resolve => { resolveFirst = resolve; })
        : Promise.resolve({ energy_sources: [], device_consumption: [] });
    };
    const hass = { user: { id: 'initial-read', is_admin: true, is_active: true }, connection,
      language: 'en', locale: { language: 'en' }, config: { time_zone: 'UTC', currency: 'EUR' }, states: {}, callWS };
    try {
      card._hass = hass;
      card.setConfig({ show_support: false });
      card._firstHassRender = true;
      dom.window.document.body.append(card);
      card._render();
      const firstRead = card._fetchData();
      assert.ok(card.shadowRoot.querySelector('.loading'));
      if (boundary === 'tab') card.shadowRoot.querySelector('[data-tab="daily"]').click();
      if (boundary === 'remount') { card.remove(); dom.window.document.body.append(card); }
      if (boundary === 'callWS') { hass.callWS = request => callWS(request); card.hass = hass; }
      resolveFirst({ energy_sources: [], device_consumption: [] });
      await firstRead; await flush();
      assert.equal(card.shadowRoot.querySelector('.loading'), null, 'settled stale read must stop showing a spinner');
      assert.match(card.shadowRoot.textContent, /Energy Dashboard/, 'unfinished initial read resumes on quiet HA after its stale wire settles');
      assert.deepEqual(calls.filter(type=>!type.endsWith('/energy_snapshot')), ['energy/get_prefs', 'energy/get_prefs', 'ha_tools_email/get_tariff'], 'one fresh initial read; no stale Recorder dispatch');
      card.hass = hass;
      await flush();
      assert.deepEqual(calls.filter(type=>!type.endsWith('/energy_snapshot')), ['energy/get_prefs', 'energy/get_prefs', 'ha_tools_email/get_tariff'], 'completed initial read is not repeated by the next hass update');
    } finally {
      card._tariffConsumerUnsubscribeV3?.();
      card._getTariffHostV3().guard.dispose();
      dom.window.close();
    }
  });
}
