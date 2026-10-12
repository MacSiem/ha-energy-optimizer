'use strict';

// Card-owned adapter: it never writes card YAML, helpers, schedules or SMTP.
function createTariffHostV3({ card, kind, createModel, legacyProfile, createSettings, createUi }) {
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const language = () => card._hass?.locale?.language || card._hass?.language || card._lang || 'en';
  const text = (en, pl) => String(language()).startsWith('pl') ? pl : en;
  const identity = hass => ({ user: hass?.user?.id, connection: hass?.connection });
  const same = (a, b) => a?.user === b?.user && a?.connection === b?.connection;
  let association = identity(card._hass), pending = null, cachedKey, cachedModel, editorRoot, editor;
  const state = () => (card._tariffEditorState ||= { profile: null, revision: null, status: 'not_checked', busy: false });
  const effectiveConfig = () => {
    const config = card._config || {};
    if (Object.hasOwn(config, 'tariff_profile')) return config;
    return card._sharedTariffProfile != null && same(card._sharedTariffAssociation, identity(card._hass))
      ? { ...config, tariff_profile: card._sharedTariffProfile } : config;
  };
  const activeProfile = () => legacyProfile(effectiveConfig(), card._hass?.config, kind);
  const model = function (proposed) {
    if (arguments.length) return createModel(proposed);
    const profile = activeProfile(), key = JSON.stringify(profile);
    if (cachedModel && key === cachedKey) return cachedModel;
    cachedKey = key; cachedModel = createModel(profile); return cachedModel;
  };
  const currency = () => {
    const value = activeProfile()?.currency;
    return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : '';
  };
  const reset = nextHass => {
    const next = identity(nextHass);
    if (!same(association, next)) {
      card._sharedTariffProfile = null; card._sharedTariffAssociation = null;
      card._sharedTariffLoadedAt = 0; card._tariffEditorState = null;
      pending = null; cachedKey = undefined; cachedModel = undefined;
      editorRoot = null; editor = null;
    }
    association = next;
  };
  const load = async () => {
    const hass = card._hass, token = identity(hass);
    if (!token.user || !token.connection || token.connection.connected === false || typeof hass?.callWS !== 'function') return false;
    if (card._sharedTariffLoadedAt && Date.now() - card._sharedTariffLoadedAt < 300000 && same(card._sharedTariffAssociation, token)) return true;
    if (pending) return pending;
    const operation = (async () => {
      try {
        const result = await hass.callWS({ type: 'ha_tools_email/get_tariff' });
        if (!same(token, identity(card._hass))) return false;
        if (!result || !Object.hasOwn(result, 'profile') || !Number.isSafeInteger(result.revision) || result.revision < 0) return false;
        const profile = result.profile === null ? null : createModel(result.profile).valid ? clone(result.profile) : { schema: 0 };
        card._sharedTariffProfile = profile; card._sharedTariffAssociation = token; card._sharedTariffLoadedAt = Date.now();
        const saved = state();
        saved.profile = clone(profile); saved.revision = result.revision; saved.updated_at = result.updated_at ?? null;
        saved.backendAvailable = true;
        if (!saved.draft) saved.draft = profile && createModel(profile).valid ? clone(profile) : undefined;
        return true;
      } catch (_) { return false; }
    })();
    pending = operation;
    operation.finally(() => { if (pending === operation) pending = null; });
    return operation;
  };
  const markup = () => `<style>
    [data-tariff-details]{margin:16px 0;min-width:0;max-width:100%}
    [data-tariff-details]>summary{min-height:44px;display:flex;align-items:center;padding:10px;border:1px solid var(--divider-color,#d8dce5);border-radius:10px;cursor:pointer;overflow-wrap:anywhere}
    [data-tariff-details]>summary:focus-visible{outline:3px solid var(--primary-color,#395fd1);outline-offset:2px}
    </style><details data-tariff-details${card._tariffSettingsOpen ? ' open' : ''}><summary>${text('Tariff settings', 'Ustawienia taryfy')}</summary>
    ${Object.hasOwn(card._config || {}, 'tariff_profile') ? `<p>${text('This card uses its own configured tariff. Shared settings apply to cards using the shared profile.', 'Ta karta używa własnej skonfigurowanej taryfy. Ustawienia współdzielone dotyczą kart korzystających ze wspólnego profilu.')}</p>` : ''}
    <div data-tariff-mount></div></details>`;
  const mount = root => {
    if (editorRoot !== root || !editor) {
      const saved = state();
      if (!saved.draft) {
        const profile = activeProfile();
        if (createModel(profile).valid) saved.draft = clone(profile);
      }
      editorRoot = root;
      editor = createSettings({ root, getHass: () => card._hass, language, state: saved, validate: createModel,
        ui: () => createUi({ language: language() }),
        onSaved: envelope => {
          card._sharedTariffProfile = clone(envelope.profile); card._sharedTariffAssociation = identity(card._hass);
          card._sharedTariffLoadedAt = Date.now();
          // The editor finishes its pending state before the parent replaces DOM.
          queueMicrotask(() => {
            if (kind === 'insights') void card._fetchData();
            if (kind === 'email') void card._fetchAllPeriodStats();
            card._render();
          });
        },
        onCancel: () => {
          card._tariffSettingsOpen = false;
          const details = root.closest('[data-tariff-details]');
          if (details) { details.open = false; details.querySelector('summary')?.focus(); }
        } });
    }
    editor.render();
  };
  const bind = () => {
    const details = card.shadowRoot.querySelector('[data-tariff-details]');
    if (!details) return;
    const root = details.querySelector('[data-tariff-mount]');
    if (!details.dataset.bound) {
      details.dataset.bound = 'true';
      details.addEventListener('toggle', () => {
        card._tariffSettingsOpen = details.open;
        if (details.open) mount(root);
      });
    }
    if (details.open) mount(root);
  };
  return { model, currency, reset, load, markup, bind };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { createTariffHostV3 };
