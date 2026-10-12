'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { createEnergyTariffV3 } = require('../shared/ha-tools-energy-tariff.js');
const { createUiV3 } = require('../shared/ha-tools-ui.js');
const clone = value => JSON.parse(JSON.stringify(value));
const profile = () => ({ schema: 1, type: 'Custom', name: 'My tariff', currency: 'PLN', timezone: 'Europe/Warsaw',
  clock: { mode: 'civil', future: true }, priceBasis: 'gross', fixedMonthly: null, defaultZone: 'day',
  zones: [{ id: 'day', label: 'Day', energyRate: 0, variableRate: null, retained: 7 },
    { id: 'night', label: 'Night', energyRate: 0.3, variableRate: 0 }],
  rules: [{ zone: 'night', weekdays: [0, 5], season: { from: '11-01', to: '03-31' },
    intervals: [{ from: '22:00', to: '06:00' }, { from: '13:00', to: '15:00' }], retained: true }],
  exceptions: [{ zone: 'night', dates: ['2026-12-25'], intervals: [{ from: '00:00', to: '24:00' }] }], future: { retained: true } });
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(impl, admin = true, language = 'en') {
  const { createTariffSettingsV3 } = require('../shared/ha-tools-tariff-settings.js');
  const dom = new JSDOM('<main><button id="opener">Settings</button><div id="root"></div></main>');
  const root = dom.window.document.querySelector('#root'), calls = [], saved = [];
  let current = { user: { id: 'a', is_admin: admin }, connection: { connected: true },
    callWS: async request => { calls.push(clone(request)); return impl(request); } };
  const state = { profile: profile(), revision: 4, status: 'not_checked', busy: false };
  const editor = createTariffSettingsV3({ root, getHass: () => current, language, state, ui: () => createUiV3({ language: typeof language === 'function' ? language() : language }),
    validate: createEnergyTariffV3, onSaved: value => saved.push(value),
    onCancel: () => dom.window.document.querySelector('#opener').focus() });
  editor.render();
  const input = (path, value) => { const el = root.querySelector(`[data-path="${path}"]`); assert.ok(el, path);
    el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
  const click = action => { const el = root.querySelector(`[data-action="${action}"]`); assert.ok(el, action); el.click(); };
  return { dom, root, calls, state, saved, editor, input, click, current: () => current, setHass: value => { current = value; } };
}
test('visual custom fields preserve zero, null, seasons, arbitrary weekdays, exceptions and unknown fields across render/type change', () => {
  const f = fixture(() => { throw Error('unexpected'); });
  try {
    assert.equal(f.calls.length, 0); assert.equal(f.root.querySelector('[data-path="zones.0.energyRate"]').value, '0');
    assert.equal(f.root.querySelector('[data-path="zones.0.variableRate"]').value, '');
    f.input('type', 'G12w'); f.input('zones.1.energyRate', '0'); f.input('zones.1.variableRate', ''); f.editor.render();
    assert.equal(f.state.draft.zones[1].energyRate, 0); assert.equal(f.state.draft.zones[1].variableRate, null);
    assert.deepEqual(f.state.draft.rules, profile().rules); assert.deepEqual(f.state.draft.exceptions, profile().exceptions);
    assert.deepEqual(f.state.draft.future, profile().future); assert.equal(f.state.draft.zones[0].retained, 7);
    assert.equal(createEnergyTariffV3(f.state.draft).valid, true); assert.equal(f.calls.length, 0);
  } finally { f.dom.window.close(); }
});
test('visual additions support multiple overnight intervals and date exceptions without profile JSON', () => {
  const f = fixture(() => {});
  try {
    f.click('add-rule'); f.input('rules.1.zone', 'night'); f.input('rules.1.intervals.0.from', '21:00'); f.input('rules.1.intervals.0.to', '05:00');
    f.click('add-interval:rules:1'); f.input('rules.1.intervals.1.from', '12:00'); f.input('rules.1.intervals.1.to', '24:00');
    f.input('rules.1.season.from', '06-01'); f.input('rules.1.season.to', '08-31');
    f.click('add-exception'); f.input('exceptions.1.dates', '2026-07-01, 2026-07-02');
    assert.deepEqual(f.state.draft.exceptions[1].dates, ['2026-07-01', '2026-07-02']);
    assert.equal(createEnergyTariffV3(f.state.draft).valid, true);
    assert.equal(f.root.querySelectorAll('textarea').length, 1); assert.equal(f.calls.length, 0);
  } finally { f.dom.window.close(); }
});
test('save confirms exact persisted profile/revision through actual second read and prevents double submit', async () => {
  let stored;
  const f = fixture(request => request.type.endsWith('/set_tariff') ? (stored = clone(request.profile), { profile: stored, revision: 5, updated_at: '2026-10-12T10:00:00Z' }) :
    { profile: stored, revision: 5, updated_at: '2026-10-12T10:00:00Z' });
  try {
    f.input('name', 'Edited'); f.click('save'); f.click('save'); await flush();
    assert.deepEqual(f.calls.map(r => r.type), ['ha_tools_email/set_tariff', 'ha_tools_email/get_tariff']);
    assert.equal(f.calls[0].expected_revision, 4); assert.equal(f.state.status, 'success');
    assert.equal(f.state.profile.name, 'Edited'); assert.equal(f.saved.length, 1); assert.equal(f.state.busy, false);
  } finally { f.dom.window.close(); }
});
for (const mode of ['mismatch', 'malformed', 'read-failure', 'revision']) test(`save ${mode} remains unconfirmed with draft and no retry`, async () => {
  const f = fixture(request => {
    if (request.type.endsWith('/set_tariff')) return { revision: 5 };
    if (mode === 'read-failure') throw Error('offline');
    if (mode === 'malformed') return { revision: 5 };
    return { profile: { ...profile(), name: mode === 'mismatch' ? 'other' : 'Edited' }, revision: mode === 'revision' ? 6 : 5, updated_at: '2026-10-12T10:00:00Z' };
  });
  try { f.input('name', 'Edited'); f.click('save'); await flush();
    assert.equal(f.state.status, 'unconfirmed'); assert.equal(f.state.draft.name, 'Edited'); assert.equal(f.state.profile.name, 'My tariff');
    assert.equal(f.saved.length, 0); assert.equal(f.calls.length, 2);
  } finally { f.dom.window.close(); }
});
test('explicit conflict preserves original revision and draft', async () => {
  const f = fixture(() => { throw { code: 'conflict' }; });
  try { f.input('name', 'Edited'); f.click('save'); await flush(); assert.equal(f.state.status, 'error');
    assert.equal(f.state.revision, 4); assert.equal(f.state.draft.name, 'Edited'); assert.equal(f.calls.length, 1);
    assert.match(f.root.textContent, /conflict/i);
  } finally { f.dom.window.close(); }
});
for (const changed of ['role', 'user', 'connection']) test(`late ${changed} change suppresses readback and onSaved`, async () => {
  let resolve;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  try { f.click('save'); const before = f.current();
    f.setHass({ ...before, user: changed === 'role' ? { id: 'a', is_admin: false } : changed === 'user' ? { id: 'b', is_admin: true } : before.user,
      connection: changed === 'connection' ? { connected: true } : before.connection });
    f.editor.render(); resolve({ revision: 5 }); await flush();
    assert.equal(f.calls.length, 1); assert.equal(f.saved.length, 0); assert.equal(f.state.status, 'unconfirmed');
  } finally { f.dom.window.close(); }
});
test('role loss during readback discards stale success', async () => {
  let resolve;
  const f = fixture(request => request.type.endsWith('/set_tariff') ? { revision: 5 } : new Promise(r => { resolve = r; }));
  try { f.click('save'); await flush(); f.setHass({ ...f.current(), user: { id: 'a', is_admin: false } });
    resolve({ profile: profile(), revision: 5, updated_at: '2026-10-12T10:00:00Z' }); await flush();
    assert.equal(f.saved.length, 0); assert.equal(f.state.status, 'unconfirmed');
  } finally { f.dom.window.close(); }
});
test('cancel restores saved values and returns focus through callback', () => {
  const f = fixture(() => {});
  try { f.input('name', 'Edited'); f.editor.cancel(); assert.deepEqual(f.state.draft, profile());
    assert.equal(f.dom.window.document.activeElement.id, 'opener'); assert.equal(f.calls.length, 0);
  } finally { f.dom.window.close(); }
});
test('household is read only, explicit load uses only tariff read API, unavailable backend is visible', async () => {
  const f = fixture(() => ({ profile: profile(), revision: 4, updated_at: null }), false);
  try { assert.equal(f.root.querySelector('[data-action="save"]'), null);
    assert.ok([...f.root.querySelectorAll('input,select,textarea')].every(el => el.disabled));
    await f.editor.load(); assert.deepEqual(f.calls.map(r => r.type), ['ha_tools_email/get_tariff']);
    f.setHass({ ...f.current(), callWS: undefined }); f.editor.render(); assert.match(f.root.textContent, /unavailable/i);
  } finally { f.dom.window.close(); }
});

test('load preserves an edited draft while refreshing saved profile/revision, then cancel restores that snapshot', async () => {
  const f = fixture(() => ({ profile: { ...profile(), name: 'Other administrator' }, revision: 6, updated_at: '2026-10-12T10:00:00Z' }));
  try { f.input('name', 'My draft'); await f.editor.load();
    assert.equal(f.state.draft.name, 'My draft'); assert.equal(f.state.profile.name, 'Other administrator'); assert.equal(f.state.revision, 6);
    f.editor.cancel(); assert.equal(f.state.draft.name, 'Other administrator');
  } finally { f.dom.window.close(); }
});
test('save timeout leaves a preserved unconfirmed draft and never retries', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const f = fixture(() => new Promise(() => {}));
  try { f.input('name', 'Timed draft'); f.click('save'); context.mock.timers.tick(15001); await flush();
    assert.equal(f.state.status, 'unconfirmed'); assert.equal(f.state.draft.name, 'Timed draft'); assert.equal(f.saved.length, 0);
    assert.equal(f.calls.length, 1); assert.equal(f.state.busy, false);
  } finally { context.mock.timers.reset(); f.dom.window.close(); }
});
test('late user switch during load rejects the prior account response', async () => {
  let resolve;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  try { const pending = f.editor.load(); f.setHass({ ...f.current(), user: { id: 'other', is_admin: true } });
    resolve({ profile: { ...profile(), name: 'stale' }, revision: 9, updated_at: '2026-10-12T10:00:00Z' }); await pending;
    assert.equal(f.state.profile.name, 'My tariff'); assert.equal(f.state.revision, 4); assert.equal(f.state.status, 'unconfirmed');
  } finally { f.dom.window.close(); }
});
test('invalid dynamic JSON blocks mutation and the dynamic field cannot replace visual rules', async () => {
  const f = fixture(() => {});
  try { const feed = f.root.querySelector('[data-feed]'); feed.value = '{bad';
    feed.dispatchEvent(new f.dom.window.Event('input', { bubbles: true })); f.click('save'); await flush();
    assert.equal(f.state.status, 'error'); assert.equal(f.calls.length, 0); assert.deepEqual(f.state.draft.rules, profile().rules);
  } finally { f.dom.window.close(); }
});
test('keyboard focus survives a render inside this mount and neighboring DOM stays unchanged', () => {
  const f = fixture(() => {});
  try { const main = f.root.parentElement, before = main.querySelector('#opener').outerHTML;
    f.root.querySelector('[data-path="name"]').focus(); f.input('name', 'Typed'); f.editor.render();
    assert.equal(f.dom.window.document.activeElement.dataset.path, 'name'); assert.equal(main.querySelector('#opener').outerHTML, before);
  } finally { f.dom.window.close(); }
});


test('first explicit load uses the stored tariff when no draft was edited', async () => {
  const { createTariffSettingsV3 } = require('../shared/ha-tools-tariff-settings.js');
  const dom = new JSDOM('<div id="root"></div>');
  const state = { profile: null, revision: null, status: 'not_checked', busy: false };
  const h = { user: { id: 'a', is_admin: true }, config: { currency: 'EUR', time_zone: 'UTC' }, connection: { connected: true },
    callWS: async () => ({ profile: profile(), revision: 2, updated_at: '2026-10-12T10:00:00Z' }) };
  const editor = createTariffSettingsV3({ root: dom.window.document.querySelector('#root'), getHass: () => h, state, validate: createEnergyTariffV3 });
  try { editor.render(); await editor.load(); assert.deepEqual(state.draft, profile()); assert.equal(state.revision, 2); }
  finally { dom.window.close(); }
});
test('ordinary language updates retain the draft and use the family result icon', () => {
  let language = 'en'; const f = fixture(() => {}, true, () => language);
  try { f.input('name', 'Typed'); language = 'pl'; f.editor.render();
    assert.match(f.root.textContent, /Twoja taryfa energii/); assert.equal(f.state.draft.name, 'Typed');
    const badge = f.root.querySelector('[data-result-state="not_checked"]'); assert.ok(badge); assert.match(badge.textContent, /–.*Nie sprawdzono/);
  } finally { f.dom.window.close(); }
});
test('the actual backend revision conflict requests explicit reconciliation', async () => {
  const f = fixture(() => { throw { code: 'tariff_revision_conflict' }; });
  try { f.input('name', 'Draft'); f.click('save'); await flush();
    assert.equal(f.state.status, 'error'); assert.match(f.root.textContent, /Revision conflict/);
    assert.equal(f.state.draft.name, 'Draft'); assert.equal(f.calls.length, 1);
  } finally { f.dom.window.close(); }
});
test('an explicit read publishes only the confirmed stored profile to the owning card', async () => {
  const { createTariffSettingsV3 } = require('../shared/ha-tools-tariff-settings.js');
  const dom = new JSDOM('<div id="root"></div>'), loaded = [];
  const state = { profile: null, revision: null, status: 'not_checked', busy: false };
  const h = { user: { id: 'a', is_admin: false }, connection: { connected: true }, config: { currency: 'EUR', time_zone: 'UTC' },
    callWS: async () => ({ profile: profile(), revision: 2, updated_at: '2026-10-12T10:00:00Z' }) };
  const editor = createTariffSettingsV3({ root: dom.window.document.querySelector('#root'), getHass: () => h, state,
    validate: createEnergyTariffV3, onLoaded: envelope => loaded.push(envelope) });
  try { await editor.load(); assert.equal(loaded.length, 1); assert.equal(loaded[0].revision, 2); assert.deepEqual(loaded[0].profile, profile()); }
  finally { dom.window.close(); }
});
