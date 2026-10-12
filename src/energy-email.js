// --- Bundled card: ha-energy-email (v3.3.0 bundle)
(function() {
  'use strict';

  // Component-local XSS protection: never reads from or publishes a global helper.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  // Component-local persistence retains this card's existing localStorage keys.
  const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-email] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

  const OWN_SUPPORT_FOOTER = ENERGY_OPTIMIZER_DONATE_HTML;
  const LOCAL_BENTO_CSS = `.donate-section[data-source="own-card"]{margin:24px 0 4px;padding:18px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);background:var(--bento-primary-light);color:var(--bento-text)}.donate-section[data-source="own-card"] .donate-text{display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px}.donate-section[data-source="own-card"] .donate-buttons{display:flex;flex-wrap:wrap;gap:8px}.donate-section[data-source="own-card"] a{color:var(--bento-primary);font-weight:700;text-decoration:none}`;

  /**
   * HA Energy Email Card v3.4.0
   * Send daily/weekly/monthly energy usage reports as HTML email.
   * v3.4.0: HA Tools Email v2.0.0 websocket backend for SMTP status, schedules, and send_now.
   *         HA-native persistent storage (input_text helpers) for cross-device sync.
   *         Legacy automation creation remains available when backend WS is unavailable.
   *         Auto-discovery of energy sensors and notify services.
   *         Falls back to manual config (sensor.energy_report_devices) if available.
   *
   * Config:
   *   type: custom:ha-energy-email
   *   title: Energy Email Reports          (optional)
   *   recipient: your@email.com            (optional, auto-detected from notify service)
   *   currency: EUR                        (optional, defaults to Home Assistant currency)
   *   energy_price: 0.30                   (optional tariff; no assumed default)
   *   notify_service: email_report         (optional, auto-detected)
   */
  class HAEnergyEmail extends HTMLElement {
    static getConfigElement() { return document.createElement('ha-energy-email-editor'); }
    constructor() {
      super();
      this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
      this.attachShadow({ mode: 'open' });
      this._toolId = this.tagName.toLowerCase().replace('ha-', '');
      this._hass = null;
      this._config = {
        title: 'Energy Email Reports',
        recipient: '',
        currency: '',
        energy_price: null,
        energy_tariff_mode: 'flat',
        energy_price_day: null,
        energy_price_night: null,
        energy_price_weekday: null,
        energy_price_weekend: null,
        energy_price_wd_day: null,
        energy_price_wd_night: null,
        energy_price_we_day: null,
        energy_price_we_night: null,
        energy_day_hour_start: 6,
        energy_night_hour_start: 22,
        notify_service: '',
      };
      this._activeTab = 'overview';
      this._lastSent = {};
      this._sending = false;
      this._firstRender = false;
      this._lastRenderTime = 0;
      this._renderScheduled = false;
      this._timers = new Set();
      this._reportPeriod = 'week';
      this._overviewPeriod = 'day';
      this._discoveredDevices = null;
      this._detectedRecipient = null;
      this._detectedService = null;
      this._helpersChecked = false;
      this._helpersReady = false;
      this._discoveryDone = false;
      this._excludedDevices = new Set();
      this._devicePage = 0;
      this._devicesPerPage = 20;
      // Default schedule times
      this._scheduleDefaults = { daily: '07:30', weekly_day: 'mon', weekly_time: '08:00', monthly_time: '08:00' };
      this._emailBackendChecked = false;
      this._emailBackendAvailable = false;
      this._emailBackendReportsUnsupported = false;
      this._emailBackendConfig = null;
      this._emailBackendError = null;
      this._emailBackendMissing = false;
      this._backendReportPreviews = {};
      this._emailSchedules = [];
      this._scheduleBusy = {};
      this._legacySchedules = this._loadLegacySchedules();
      this._smtpTesting = false;
      this._smtpStatus = null;
    }

    _sanitize(str) {
      if (!str) return str;
      try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
    }

    _loadLegacySchedules() {
      const defaults = {
        daily: { kind: 'energy_report', cadence: 'daily', time: '07:30', recipients: [], enabled: false },
        weekly: { kind: 'energy_report', cadence: 'weekly', time: '08:00', recipients: [], enabled: false },
        monthly: { kind: 'energy_report', cadence: 'monthly', time: '08:00', recipients: [], enabled: false }
      };
      try {
        const raw = localStorage.getItem('ha-energy-email-schedules');
        if (!raw) return defaults;
        const saved = JSON.parse(raw);
        return {
          daily: { ...defaults.daily, ...(saved.daily || {}) },
          weekly: { ...defaults.weekly, ...(saved.weekly || {}) },
          monthly: { ...defaults.monthly, ...(saved.monthly || {}) }
        };
      } catch (e) {
        console.debug('[ha-energy-email] legacy schedule load failed:', e);
        return defaults;
      }
    }

    _saveLegacySchedules() {
      try {
        localStorage.setItem('ha-energy-email-schedules', JSON.stringify(this._legacySchedules || {}));
      } catch (e) {
        this._showToast(this._lang === 'pl' ? 'Nie udało się zapisać harmonogramu lokalnie' : 'Could not save local schedule');
      }
    }

    _renderError(e) {
      console.error('[ha-energy-email] render error:', e);
      const msg = _esc(e && e.message ? e.message : String(e));
      if (this.shadowRoot) {
        this.shadowRoot.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif;color:#b91c1c;"><strong>Energy Email render error.</strong><br>${msg}</div>`;
      }
    }

    set hass(hass) {
      try {
        const previousLanguage = this._lang;
        const language = hass?.locale?.language || hass?.language;
        if (language) this._lang = language.startsWith('pl') ? 'pl' : 'en';
        this._resetTariffContext(hass);
        this._hass = hass;
        if (!hass) return;
        const now = Date.now();
        if (!this._firstRender) {
          this._firstRender = true;
          this._discoverAll().catch(e => this._renderError(e));
          this._render();
          this._lastRenderTime = now;
          return;
        }
        if (previousLanguage !== this._lang) {
          this._renderPreservingDrafts();
          this._lastRenderTime = now;
          return;
        }
        if (!this._emailBackendChecked) this._loadEmailBackendConfig().catch(e => this._showToast('⚠️ ' + (e?.message || e)));
        if (now - this._lastRenderTime < 10000) {
          if (!this._renderScheduled) {
            this._renderScheduled = true;
            this._schedule(() => {
              this._renderScheduled = false;
              if (!this.isConnected) return;
              try {
                this._updateLiveData();
                this._lastRenderTime = Date.now();
              } catch (e) {
                this._renderError(e);
              }
            }, 5000);
          }
          return;
        }
        this._updateLiveData();
        this._lastRenderTime = now;
      } catch (e) {
        this._renderError(e);
      }
    }




    get _t() {
      const T = {
        pl: {
          title: 'Email Energetyczny',
          loading: 'Wczytywanie...',
          noData: 'Brak danych',
          error: 'Błąd',
          refresh: 'Odśwież',
          save: 'Zapisz',
          cancel: 'Anuluj',
          smtpConfigWarning: 'Skonfiguruj SMTP w: Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj.',
          locale: (this._lang === 'pl' ? 'pl-PL' : 'en-US'),
        },
        en: {
          title: 'Energy Email',
          loading: 'Loading...',
          noData: 'No data',
          error: 'Error',
          refresh: 'Refresh',
          save: 'Save',
          cancel: 'Cancel',
          smtpConfigWarning: 'Set up SMTP in: Settings \u2192 Devices & services \u2192 HA Tools Email \u2192 Configure.',
          locale: 'en-US',
        },
      };
      return T[this._lang] || T.en;
    }

    setConfig(config) {
      const cfg = config || {};
      const price = (key) => {
        const value = cfg[key];
        if (value === undefined) return this._config[key];
        if (value === null || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      };
      this._config = {
        ...this._config,
        ...cfg,
        title: cfg.title || this._config.title || 'Energy Email Reports',
        recipient: cfg.recipient || this._config.recipient || '',
        currency: cfg.currency || this._config.currency || '',
        energy_price: price('energy_price'),
        energy_tariff_mode: cfg.energy_tariff_mode || this._config.energy_tariff_mode || 'flat',
        energy_price_day: price('energy_price_day'),
        energy_price_night: price('energy_price_night'),
        energy_price_weekday: price('energy_price_weekday'),
        energy_price_weekend: price('energy_price_weekend'),
        energy_price_wd_day: price('energy_price_wd_day'),
        energy_price_wd_night: price('energy_price_wd_night'),
        energy_price_we_day: price('energy_price_we_day'),
        energy_price_we_night: price('energy_price_we_night'),
        energy_day_hour_start: Number.isInteger(Number(cfg.energy_day_hour_start)) ? Number(cfg.energy_day_hour_start) : this._config.energy_day_hour_start,
        energy_night_hour_start: Number.isInteger(Number(cfg.energy_night_hour_start)) ? Number(cfg.energy_night_hour_start) : this._config.energy_night_hour_start,
        notify_service: cfg.notify_service || this._config.notify_service || '',
      };
      if (this._hass?.states) this._render();
    }


    getCardSize() { return 4; }

    getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }

    _getTariffV3(proposed) {
      const host = this._getTariffHostV3();
      return arguments.length ? host.model(proposed) : host.model();
    }
    _getTariffHostV3() {
      if (this._tariffHostController) return this._tariffHostController;
      // HA_TARIFF_V3_START sha256=f37ecb85a73abdd9ada8c8d41ba2fc96f977dd1bf004e56633ba47ef977fb8f2
// HA Tools v3: vendored inside each consumer's own closure, never a window API.
function createUiV3({ language = 'en' } = {}) {
  const pl = String(language).startsWith('pl');
  const states = {
    success: ['Success', 'Sukces', '✓'],
    partial: ['Partial', 'Częściowo', '½'],
    unconfirmed: ['Unconfirmed', 'Niepotwierdzony', '?'],
    error: ['Error', 'Błąd', '✕'],
    not_checked: ['Not checked', 'Nie sprawdzono', '–'],
    no_data: ['No data', 'Brak danych', '∅'],
  };
  const status = (value) => {
    const code = typeof value === 'string' && Object.hasOwn(states, value) ? value : 'not_checked';
    const row = states[code];
    return { code, label: row[pl ? 1 : 0], icon: row[2], countsAsSuccess: code === 'success' };
  };
  const statusHtml = (value) => {
    const result = status(value);
    return `<span class="ht-result-state ht-result-state--${result.code}" data-result-state="${result.code}"><span aria-hidden="true">${result.icon}</span> ${result.label}</span>`;
  };
  const css = `
.ht-result-state { display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border:1px solid currentColor;border-radius:6px;font-size:12px;line-height:1.4;white-space:normal; }
.ht-result-state--success { color:#237b3d;background:rgba(35,123,61,.10); }
.ht-result-state--partial { color:#966400;background:rgba(150,100,0,.10); }
.ht-result-state--unconfirmed { color:#ad5200;background:rgba(173,82,0,.10); }
.ht-result-state--error { color:#c32b2b;background:rgba(195,43,43,.10); }
.ht-result-state--not_checked,.ht-result-state--no_data { color:var(--secondary-text-color,#666);background:transparent; }
.ht-result-state--no_data { border-style:dashed; }
:host(.bento-dark) .ht-result-state--success { color:#81cf99; }
:host(.bento-dark) .ht-result-state--partial { color:#efd080; }
:host(.bento-dark) .ht-result-state--unconfirmed { color:#ffb97b; }
:host(.bento-dark) .ht-result-state--error { color:#ff9999; }
`;
  return { status, statusHtml, css };
}
// Node tests use the canonical factory; this line is excluded from runtime copies.

// Canonical, side-effect-free tariff model. Consumers vendor this factory inside
// their own scope. Rates are user settings, never a country's assumed defaults.
function createEnergyTariffV3(input) {
  const errors = [];
  const fail = (path, reason) => errors.push({ path, reason });
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const dateKey = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const stamp = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
  };
  const monthDay = value => typeof value === 'string' && /^\d{2}-\d{2}$/.test(value) && dateKey('2000-' + value);
  const timestamp = value => {
    if (finite(value)) return Number.isFinite(new Date(value).getTime()) ? value : NaN;
    // Explicit offsets only: never interpret a browser's local clock as UTC.
    if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
    return Date.parse(value);
  };
  const minutes = (value, end = false) => {
    if (end && value === '24:00') return 1440;
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
    return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  };
  const p = record(input) ? input : {};
  if (!record(input)) fail('profile', 'invalid_profile');
  if (p.schema !== 1) fail('schema', 'unsupported_schema');
  if (typeof p.currency !== 'string' || !/^[A-Z]{3}$/.test(p.currency)) fail('currency', 'invalid_currency');
  if (!['gross', 'net'].includes(p.priceBasis)) fail('priceBasis', 'invalid_price_basis');
  let formatter;
  try {
    if (typeof p.timezone !== 'string' || !p.timezone) throw new Error('timezone');
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: p.timezone,
      calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch (_) { fail('timezone', 'invalid_timezone'); }
  const clock = record(p.clock) ? { ...p.clock } : {};
  if (!['civil', 'fixed'].includes(clock.mode)) fail('clock.mode', 'invalid_clock');
  if (clock.mode === 'fixed' && (!Number.isInteger(clock.offsetMinutes) || clock.offsetMinutes < -840 || clock.offsetMinutes > 840))
    fail('clock.offsetMinutes', 'invalid_offset');
  for (const key of ['validFrom', 'validTo']) if (p[key] != null && !dateKey(p[key])) fail(key, 'invalid_date');
  if (dateKey(p.validFrom) && dateKey(p.validTo) && p.validFrom > p.validTo) fail('validTo', 'reversed_validity');
  if (p.fixedMonthly != null && (!finite(p.fixedMonthly) || p.fixedMonthly < 0)) fail('fixedMonthly', 'invalid_fee');
  const energyRate = (value, path) => {
    if (!finite(value) || (value < 0 && p.allowNegativeEnergy !== true)) fail(path, 'invalid_rate');
    return value;
  };
  const variableRate = (value, path) => {
    if (value == null) return null;
    if (!finite(value) || value < 0) fail(path, 'invalid_fee');
    return value;
  };
  const zones = new Map();
  if (!Array.isArray(p.zones) || !p.zones.length || p.zones.length > 32) fail('zones', 'invalid_zones');
  for (const [i, z] of (Array.isArray(p.zones) ? p.zones : []).entries()) {
    const path = `zones.${i}`;
    if (!record(z) || typeof z.id !== 'string' || !/^[\w-]{1,64}$/.test(z.id) || zones.has(z.id)) {
      fail(path, 'invalid_zone'); continue;
    }
    zones.set(z.id, { zone: z.id, label: typeof z.label === 'string' ? z.label : z.id,
      energyRate: energyRate(z.energyRate, path + '.energyRate'), variableRate: variableRate(z.variableRate, path + '.variableRate') });
  }
  const defaultZone = p.defaultZone == null ? null : p.defaultZone;
  if (defaultZone !== null && !zones.has(defaultZone)) fail('defaultZone', 'unknown_zone');
  const parseRules = (value, kind) => {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 512) { fail(kind, 'invalid_rules'); return []; }
    return value.map((r, i) => {
      const path = `${kind}.${i}`;
      if (!record(r)) { fail(path, 'invalid_rule'); return null; }
      if (!zones.has(r.zone)) fail(path + '.zone', 'unknown_zone');
      const priority = r.priority == null ? 0 : r.priority;
      if (!Number.isInteger(priority) || Math.abs(priority) > 10000) fail(path + '.priority', 'invalid_priority');
      let weekdays = null, dates = null, season = null;
      if (r.weekdays != null) {
        if (!Array.isArray(r.weekdays) || !r.weekdays.length || r.weekdays.some(d => !Number.isInteger(d) || d < 0 || d > 6)) fail(path + '.weekdays', 'invalid_weekdays');
        else weekdays = new Set(r.weekdays);
      }
      if (r.dates != null || kind === 'exceptions') {
        if (!Array.isArray(r.dates) || !r.dates.length || r.dates.length > 3660 || r.dates.some(d => !dateKey(d))) fail(path + '.dates', 'invalid_dates');
        else dates = new Set(r.dates);
      }
      if (r.season != null) {
        if (!record(r.season) || !monthDay(r.season.from) || !monthDay(r.season.to)) fail(path + '.season', 'invalid_season');
        else season = { from: r.season.from, to: r.season.to };
      }
      const intervals = [];
      if (!Array.isArray(r.intervals) || !r.intervals.length || r.intervals.length > 48) fail(path + '.intervals', 'invalid_intervals');
      else for (const [j, interval] of r.intervals.entries()) {
        const from = minutes(interval?.from), to = minutes(interval?.to, true);
        if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) fail(`${path}.intervals.${j}`, 'invalid_interval');
        else intervals.push({ from, to });
      }
      return { zone: r.zone, priority, weekdays, dates, season, intervals };
    }).filter(Boolean);
  };
  const rules = parseRules(p.rules, 'rules'), exceptions = parseRules(p.exceptions, 'exceptions');
  let dynamic = null;
  if (p.dynamic != null) {
    if (!record(p.dynamic) || !Array.isArray(p.dynamic.intervals) || p.dynamic.intervals.length > 10000) fail('dynamic', 'invalid_dynamic');
    else {
      dynamic = p.dynamic.intervals.map((r, i) => {
        const from = timestamp(r?.from), to = timestamp(r?.to);
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) fail(`dynamic.intervals.${i}`, 'invalid_interval');
        return { from, to, zone: 'dynamic', label: 'Dynamic',
          energyRate: energyRate(r?.energyRate, `dynamic.intervals.${i}.energyRate`),
          variableRate: variableRate(r?.variableRate, `dynamic.intervals.${i}.variableRate`) };
      }).sort((a, b) => a.from - b.from);
      for (let i = 1; i < dynamic.length; i++) if (dynamic[i].from < dynamic[i - 1].to) fail('dynamic', 'overlapping_prices');
    }
  }
  const valid = errors.length === 0;
  const unavailable = reason => ({ available: false, reason });
  const localParts = stamp => {
    if (clock.mode === 'fixed') {
      const d = new Date(stamp + clock.offsetMinutes * 60000);
      return { date: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
    }
    const values = Object.fromEntries(formatter.formatToParts(stamp).filter(v => v.type !== 'literal').map(v => [v.type, v.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, minute: Number(values.hour) * 60 + Number(values.minute) };
  };
  const matchesDay = (rule, day) => {
    if (rule.dates && !rule.dates.has(day)) return false;
    if (rule.weekdays && !rule.weekdays.has(new Date(day + 'T00:00:00Z').getUTCDay())) return false;
    const mmdd = day.slice(5), s = rule.season;
    return !s || (s.from <= s.to ? mmdd >= s.from && mmdd <= s.to : mmdd >= s.from || mmdd <= s.to);
  };
  const matches = (rule, day, minute) => rule.intervals.some(interval => {
    if (interval.from < interval.to) return minute >= interval.from && minute < interval.to && matchesDay(rule, day);
    if (minute >= interval.from) return matchesDay(rule, day);
    if (minute < interval.to) {
      const previousDay = new Date(Date.parse(day + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
      return matchesDay(rule, previousDay);
    }
    return false;
  });
  const rateAt = instant => {
    if (!valid) return unavailable('invalid_profile');
    const stamp = timestamp(instant);
    if (!Number.isFinite(stamp)) return unavailable('invalid_timestamp');
    const local = localParts(stamp);
    if ((p.validFrom && local.date < p.validFrom) || (p.validTo && local.date > p.validTo)) return unavailable('outside_validity');
    if (dynamic) {
      // Price periods use absolute timestamps, so repeated DST hours are distinct.
      let low = 0, high = dynamic.length;
      while (low < high) { const mid = (low + high) >>> 1; if (dynamic[mid].from <= stamp) low = mid + 1; else high = mid; }
      const price = dynamic[low - 1];
      return price && stamp < price.to ? { available: true, ...price, date: local.date } : unavailable('missing_rate');
    }
    const special = exceptions.filter(r => matches(r, local.date, local.minute));
    const candidates = special.length ? special : rules.filter(r => matches(r, local.date, local.minute));
    let zone = defaultZone;
    if (candidates.length) {
      const priority = Math.max(...candidates.map(r => r.priority));
      const ids = new Set(candidates.filter(r => r.priority === priority).map(r => r.zone));
      if (ids.size !== 1) return unavailable('ambiguous_rules');
      zone = [...ids][0];
    }
    return zones.has(zone) ? { available: true, ...zones.get(zone), date: local.date } : unavailable('missing_rate');
  };
  const samePrice = (a, b) => a.available && b.available && a.energyRate === b.energyRate && a.variableRate === b.variableRate;
  const priceBucket = row => {
    const from = timestamp(row?.from), to = timestamp(row?.to), kwh = row?.kwh;
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 86400000 || !finite(kwh) || kwh < 0)
      return { available: false, reason: 'invalid_measurement', from, to };
    const first = rateAt(from);
    if (!first.available) return { ...first, from, to };
    // Never apportion an aggregate measurement across different prices. Every
    // minute boundary and every dynamic boundary is checked, including the end.
    const checkpoints = new Set([to - 1]);
    for (let t = (Math.floor(from / 60000) + 1) * 60000; t < to; t += 60000) checkpoints.add(t);
    if (dynamic) for (const price of dynamic) for (const t of [price.from, price.to]) if (t > from && t < to) checkpoints.add(t);
    for (const stamp of checkpoints) {
      const next = rateAt(stamp);
      if (!next.available) return { ...next, from, to };
      if (!samePrice(first, next)) return { available: false, reason: 'mixed_rate_bucket', from, to };
    }
    const energyCost = kwh * first.energyRate, variableCost = first.variableRate === null ? null : kwh * first.variableRate;
    return { available: true, from, to, kwh, zone: first.zone, energyRate: first.energyRate,
      variableRate: first.variableRate, energyCost, variableCost, usageCost: variableCost === null ? null : energyCost + variableCost };
  };
  const priceBuckets = (rows, coverage) => {
    const issues = [], priced = [];
    if (!valid) issues.push({ reason: 'invalid_profile' });
    if (!Array.isArray(rows) || !rows.length) issues.push({ reason: 'no_data' });
    for (const [index, row] of (Array.isArray(rows) ? rows : []).entries()) {
      const result = priceBucket(row); priced.push({ index, ...result });
      if (!result.available) issues.push({ index, reason: result.reason });
    }
    const ordered = [...priced].sort((a, b) => a.from - b.from);
    for (let i = 1; i < ordered.length; i++) if (ordered[i].from < ordered[i - 1].to) issues.push({ index: ordered[i].index, reason: 'overlapping_measurement' });
    if (coverage != null) {
      const from = timestamp(coverage.from), to = timestamp(coverage.to);
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) issues.push({ reason: 'invalid_coverage' });
      else if (!ordered.length || ordered[0].from !== from || ordered.at(-1).to !== to || ordered.some((r, i) => i && r.from !== ordered[i - 1].to))
        issues.push({ reason: 'missing_measurement' });
    }
    const complete = !issues.length;
    const energyCost = complete ? priced.reduce((sum, r) => sum + r.energyCost, 0) : null;
    const variableCost = complete && priced.every(r => r.variableCost !== null) ? priced.reduce((sum, r) => sum + r.variableCost, 0) : null;
    return { complete, issues, rows: priced, kwh: complete ? priced.reduce((sum, r) => sum + r.kwh, 0) : null,
      energyCost, variableCost, usageCost: energyCost !== null && variableCost !== null ? energyCost + variableCost : null,
      currency: p.currency ?? null, priceBasis: p.priceBasis ?? null, timezone: p.timezone ?? null,
      clock: { ...clock }, fixedMonthly: valid && finite(p.fixedMonthly) ? p.fixedMonthly : null };
  };
  return { valid, errors, rateAt, priceBuckets };
}

function energyTariffProfileV3(config, haConfig, kind) {
  const c = config || {}, h = haConfig || {};
  if (Object.hasOwn(c, 'tariff_profile')) return c.tariff_profile;
  const isOptimizer = kind === 'optimizer';
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  // Older Optimizer YAML accepted decimal strings. Preserve those explicit
  // prices, while refusing empty strings, booleans and automatic sample rates.
  const optimizerNumber = value => number(value) ?? (typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null);
  const mode = c.energy_tariff_mode || (isOptimizer && c.off_peak_rate != null ? 'day_night' : 'flat');
  const start = c.energy_day_hour_start ?? c.peak_hours?.start ?? 6;
  const end = c.energy_night_hour_start ?? c.peak_hours?.end ?? 22;
  const clockTime = value => Number.isInteger(value) && value >= 0 && value <= 24 ? `${String(value).padStart(2, '0')}:00` : 'invalid';
  const day = start === end ? [{ from: '00:00', to: '24:00' }] : [{ from: clockTime(start), to: clockTime(end) }];
  const zone = (id, energyRate) => ({ id, label: id, energyRate, variableRate: null });
  const profile = { schema: 1, name: 'Configured tariff', currency: c.currency || h.currency || '',
    timezone: h.time_zone || '', clock: { mode: 'civil' }, priceBasis: c.energy_price_basis || 'gross',
    fixedMonthly: null, defaultZone: 'flat', zones: [], rules: [] };
  if (mode === 'flat') profile.zones = [zone('flat', isOptimizer ? optimizerNumber(c.peak_rate ?? c.energy_price) : number(c.energy_price))];
  else if (mode === 'day_night') {
    profile.zones = [zone('day', isOptimizer ? optimizerNumber(c.peak_rate ?? c.energy_price) : number(c.energy_price_day)),
      zone('night', isOptimizer ? optimizerNumber(c.off_peak_rate) : number(c.energy_price_night))];
    profile.defaultZone = 'night'; profile.rules = [{ zone: 'day', intervals: day }];
  } else if (mode === 'weekday_weekend') {
    profile.zones = [zone('weekday', number(c.energy_price_weekday)), zone('weekend', number(c.energy_price_weekend))];
    profile.defaultZone = 'weekday'; profile.rules = [{ zone: 'weekend', weekdays: [0, 6], intervals: [{ from: '00:00', to: '24:00' }] }];
  } else if (mode === 'mixed') {
    profile.zones = [zone('wd_day', number(c.energy_price_wd_day)), zone('wd_night', number(c.energy_price_wd_night)),
      zone('we_day', number(c.energy_price_we_day)), zone('we_night', number(c.energy_price_we_night))];
    profile.defaultZone = 'wd_night'; profile.rules = [
      { zone: 'wd_day', weekdays: [1, 2, 3, 4, 5], intervals: day },
      { zone: 'we_night', weekdays: [0, 6], intervals: [{ from: '00:00', to: '24:00' }] },
      { zone: 'we_day', weekdays: [0, 6], priority: 1, intervals: day }];
  } else profile.schema = 0;
  return profile;
}

// Vendor inside each card's closure. The parent owns state and its mount; no
// global registration, helper services, SMTP configuration or browser storage.
function createTariffSettingsV3({ root, getHass, language = 'en', state, validate, onSaved, onLoaded, onCancel, ui }) {
  if (!root || !state || typeof getHass !== 'function' || typeof validate !== 'function') throw new TypeError('tariff_settings_adapter');
  const translations = new Map();
  const pl = () => String(typeof language === 'function' ? language() : language).startsWith('pl');
  const t = (en, polish) => { translations.set(en, polish); return pl() ? polish : en; };
  const localMessage = () => {
    const message = state.message || '';
    for (const [en, polish] of translations) {
      if (message === en || message === polish) return pl() ? polish : en;
    }
    return message;
  };
  const family = () => typeof ui === 'function' ? ui() : ui;
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const canonical = value => JSON.stringify(value, function (_, v) {
    return object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v;
  });
  const equal = (a, b) => canonical(a) === canonical(b);
  const statuses = () => ({ success: t('Success', 'Sukces'), partial: t('Partial', 'Częściowo'),
    unconfirmed: t('Unconfirmed', 'Niepotwierdzony'), error: t('Error', 'Błąd'),
    not_checked: t('Not checked', 'Nie sprawdzono'), no_data: t('No data', 'Brak danych') });
  const statusHtml = () => family()?.statusHtml(state.status) || `<span data-result-state="${esc(state.status)}"><span aria-hidden="true">${({ success: '✓', partial: '½', unconfirmed: '?', error: '✕', not_checked: '–', no_data: '∅' })[state.status] || '–'}</span> ${esc(statuses()[state.status] || statuses().not_checked)}</span>`;
  const blank = () => ({ schema: 1, type: 'Custom', name: '', currency: getHass()?.config?.currency || '',
    timezone: getHass()?.config?.time_zone || '', clock: { mode: 'civil' }, priceBasis: 'gross',
    fixedMonthly: null, defaultZone: null, zones: [], rules: [], exceptions: [] });
  if (!object(state.draft)) state.draft = clone(state.profile) || blank();
  if (!statuses()[state.status]) state.status = 'not_checked';
  let epoch = 0, operation = 0, association;
  const auth = () => {
    const h = getHass();
    return { user: h?.user?.id, admin: h?.user?.is_admin === true, connection: h?.connection,
      connected: h?.connection?.connected !== false, ws: typeof h?.callWS === 'function' };
  };
  const observe = () => {
    const now = auth();
    if (association && (association.user !== now.user || association.admin !== now.admin ||
      association.connection !== now.connection || association.connected !== now.connected || association.ws !== now.ws)) epoch++;
    association = now;
    return now;
  };
  const available = a => !!a.user && !!a.connection && a.connected && a.ws;
  const ticket = () => ({ ...observe(), epoch, operation: ++operation });
  const current = (token, admin = false) => {
    const a = observe();
    return token.operation === operation && token.epoch === epoch && token.user === a.user &&
      token.connection === a.connection && available(a) && (!admin || a.admin);
  };
  const call = (token, payload, admin = false) => {
    if (!current(token, admin)) return Promise.reject({ code: 'authority_changed' });
    // No retry: a timeout may still have committed on the server.
    let timer;
    let pending;
    try { pending = Promise.resolve(getHass().callWS(payload)); }
    catch (error) { return Promise.reject(error); }
    return Promise.race([pending, new Promise((_, reject) => { timer = setTimeout(() => reject({ code: 'timeout' }), 15000); })])
      .finally(() => clearTimeout(timer));
  };
  const validProfile = profile => { try { return validate(profile)?.valid === true; } catch (_) { return false; } };
  const envelope = value => object(value) && Object.hasOwn(value, 'profile') &&
    (value.profile === null || (object(value.profile) && validProfile(value.profile))) && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    Object.hasOwn(value, 'updated_at') && (value.updated_at === null ||
      (typeof value.updated_at === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.updated_at) && Number.isFinite(Date.parse(value.updated_at))));
  const message = (status, text) => { state.status = status; state.message = text; };
  const unknown = () => message('unconfirmed', t('Saving was not confirmed. Check the stored tariff before retrying. Your draft is preserved.',
    'Nie potwierdzono zapisu. Sprawdź zapisaną taryfę przed ponowieniem. Szkic został zachowany.'));
  const load = async () => {
    if (state.busy) return;
    const token = ticket();
    if (!available(token)) { message('error', t('Tariff backend unavailable.', 'Backend taryf jest niedostępny.')); render(); return; }
    const pristine = equal(state.draft, state.profile || blank()), draft = clone(state.draft);
    state.busy = true; state.message = t('Loading stored tariff…', 'Wczytywanie zapisanej taryfy…'); render();
    try {
      const result = await call(token, { type: 'ha_tools_email/get_tariff' });
      if (!current(token)) { unknown(); return; }
      if (!envelope(result)) throw { code: 'malformed' };
      state.profile = clone(result.profile); state.revision = result.revision; state.updated_at = result.updated_at;
      state.backendAvailable = true;
      state.draft = pristine ? clone(result.profile) || blank() : draft;
      if (pristine) { state.feedText = undefined; state.feedError = null; }
      message(result.profile ? 'not_checked' : 'no_data', t('Stored tariff loaded. Review the fields before saving.', 'Wczytano taryfę. Sprawdź pola przed zapisem.'));
      if (current(token) && typeof onLoaded === 'function') onLoaded(clone(result));
    } catch (_) {
      if (current(token)) { state.backendAvailable = false; message('error', t('Tariff backend unavailable or response invalid. Draft preserved.', 'Backend taryf jest niedostępny lub odpowiedź jest błędna. Zachowano szkic.')); }
      else unknown();
    } finally { state.busy = false; render(); }
  };
  const save = async () => {
    if (state.busy) return;
    const token = ticket();
    if (!available(token) || !token.admin || state.backendAvailable === false || !Number.isSafeInteger(state.revision)) {
      message('error', t('Admin access and a loaded tariff backend are required.', 'Wymagane uprawnienia administratora i wczytany backend taryf.')); render(); return;
    }
    if (state.feedError) { message('error', state.feedError); render(); return; }
    const proposed = clone(state.draft);
    let result;
    try { result = validate(proposed); } catch (_) { result = { valid: false }; }
    if (!result?.valid) {
      message('error', t('Invalid tariff. Check the marked paths: ', 'Niepoprawna taryfa. Sprawdź wskazane pola: ') +
        (result?.errors || []).map(e => `${e.path}: ${e.reason}`).join('; ')); render(); return;
    }
    const previousRevision = state.revision;
    state.busy = true; message('not_checked', t('Saving; waiting for stored readback…', 'Zapis; oczekiwanie na odczyt zapisanego profilu…')); render();
    try {
      const written = await call(token, { type: 'ha_tools_email/set_tariff', profile: proposed, expected_revision: previousRevision }, true);
      if (!current(token, true)) { unknown(); return; }
      if (!object(written) || !Number.isSafeInteger(written.revision) || written.revision !== previousRevision + 1) { unknown(); return; }
      const stored = await call(token, { type: 'ha_tools_email/get_tariff' }, true);
      if (!current(token, true)) { unknown(); return; }
      if (!envelope(stored) || stored.updated_at === null || stored.revision !== written.revision || !equal(stored.profile, proposed)) { unknown(); return; }
      state.profile = clone(stored.profile); state.draft = clone(stored.profile); state.revision = stored.revision; state.updated_at = stored.updated_at;
      message('success', t('Tariff saved and confirmed by stored readback.', 'Taryfa zapisana i potwierdzona odczytem.'));
      if (current(token, true) && typeof onSaved === 'function') onSaved(clone(stored));
    } catch (error) {
      if (current(token, true) && ['conflict', 'revision_conflict', 'tariff_revision_conflict'].includes(error?.code))
        message('error', t('Revision conflict. Load the stored tariff and reconcile your draft.', 'Konflikt wersji. Wczytaj zapisaną taryfę i porównaj ze szkicem.'));
      else unknown();
    } finally { state.busy = false; render(); }
  };
  const cancel = () => {
    // A dispatched save cannot be undone safely. The button remains disabled.
    if (state.busy) return;
    operation++; state.draft = clone(state.profile) || blank(); state.feedError = null; state.feedText = undefined;
    message('not_checked', ''); render(); if (typeof onCancel === 'function') onCancel();
  };
  const read = path => path.split('.').reduce((value, key) => value?.[key], state.draft);
  const write = (path, value) => {
    const keys = path.split('.'); let at = state.draft;
    for (const key of keys.slice(0, -1)) { if (!object(at[key]) && !Array.isArray(at[key])) at[key] = {}; at = at[key]; }
    at[keys.at(-1)] = value;
  };
  const mutable = () => observe().admin && !state.busy && available(association);
  const field = (path, label, kind = 'text', choices) => {
    const value = read(path);
    const attrs = `data-path="${esc(path)}" aria-label="${esc(label)}"${mutable() ? '' : ' disabled'}`;
    let input;
    if (choices) input = `<select ${attrs}>${choices.map(([v, l]) => `<option value="${esc(v)}"${String(value ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    else input = `<input ${attrs} type="${kind === 'number' ? 'number' : kind}"${kind === 'number' ? ' step="any"' : ''} value="${esc(Array.isArray(value) ? value.join(', ') : value)}">`;
    return `<label class="ht-tariff-field"><span>${esc(label)}</span>${input}</label>`;
  };
  const button = (action, label) => `<button type="button" data-action="${esc(action)}"${mutable() ? '' : ' disabled'}>${esc(label)}</button>`;
  const zoneChoices = () => [['', t('Choose a zone', 'Wybierz strefę')], ...(state.draft.zones || []).map(z => [z.id, z.label || z.id])];
  const intervals = (kind, i, row) => (row.intervals || []).map((_, j) => `<div class="ht-tariff-row">${
    field(`${kind}.${i}.intervals.${j}.from`, t('From HH:MM', 'Od HH:MM'))}${
    field(`${kind}.${i}.intervals.${j}.to`, t('To HH:MM (24:00 allowed)', 'Do HH:MM (także 24:00)'))}${
    mutable() ? button(`remove-interval:${kind}:${i}:${j}`, t('Remove interval', 'Usuń przedział')) : ''}</div>`).join('') +
    (mutable() ? button(`add-interval:${kind}:${i}`, t('Add interval', 'Dodaj przedział')) : '');
  const rows = kind => (state.draft[kind] || []).map((row, i) => `<fieldset><legend>${esc(t(kind === 'rules' ? 'Rule' : 'Date exception', kind === 'rules' ? 'Reguła' : 'Wyjątek daty'))} ${i + 1}</legend><div class="ht-tariff-grid">${
    field(`${kind}.${i}.zone`, t('Zone', 'Strefa'), 'text', zoneChoices())}${field(`${kind}.${i}.priority`, t('Priority', 'Priorytet'), 'number')}${
    kind === 'exceptions' ? field(`${kind}.${i}.dates`, t('Dates YYYY-MM-DD, comma separated', 'Daty RRRR-MM-DD, oddzielone przecinkami')) :
      field(`${kind}.${i}.season.from`, t('Season from MM-DD (optional)', 'Sezon od MM-DD (opcjonalny)')) + field(`${kind}.${i}.season.to`, t('Season to MM-DD (optional)', 'Sezon do MM-DD (opcjonalny)'))}</div>${
    kind === 'rules' ? `<div class="ht-tariff-days">${[t('Sunday', 'Niedziela'), t('Monday', 'Poniedziałek'), t('Tuesday', 'Wtorek'), t('Wednesday', 'Środa'), t('Thursday', 'Czwartek'), t('Friday', 'Piątek'), t('Saturday', 'Sobota')].map((label, d) => `<label><input type="checkbox" data-weekday="${i}:${d}"${row.weekdays?.includes(d) ? ' checked' : ''}${mutable() ? '' : ' disabled'}><span>${esc(label)}</span></label>`).join('')}</div><p>${esc(t('No checked days = every day. Overnight intervals start on the selected day.', 'Brak zaznaczonych dni = codziennie. Przedział nocny zaczyna się w zaznaczonym dniu.'))}</p>` : ''}${
    intervals(kind, i, row)}${mutable() ? button(`remove-row:${kind}:${i}`, t('Remove rule', 'Usuń regułę')) : ''}</fieldset>`).join('');
  const css = `.ht-tariff-v3{box-sizing:border-box;color:var(--primary-text-color,#172033);font:inherit;width:100%;min-width:0;max-width:100%;padding:12px;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:var(--bento-radius,20px)}
.ht-tariff-v3 *{box-sizing:border-box;min-width:0}.ht-tariff-v3 h3,.ht-tariff-v3 p{overflow-wrap:anywhere}.ht-tariff-v3 fieldset{border:1px solid var(--divider-color,#d8dce5);border-radius:14px;margin:12px 0;padding:12px}.ht-tariff-v3 legend{max-width:100%;overflow-wrap:anywhere}.ht-tariff-v3 .ht-tariff-grid,.ht-tariff-v3 .ht-tariff-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:12px;margin:8px 0}.ht-tariff-v3 .ht-tariff-field{display:flex;flex-direction:column;gap:6px;overflow-wrap:anywhere}.ht-tariff-v3 input,.ht-tariff-v3 select,.ht-tariff-v3 textarea,.ht-tariff-v3 button{font:inherit;color:inherit;border:1px solid var(--divider-color,#c7cdd9);border-radius:10px;background:var(--secondary-background-color,#f7f8fa);min-height:44px;max-width:100%;width:100%;padding:10px}.ht-tariff-v3 textarea{resize:vertical;min-height:110px}.ht-tariff-v3 button{cursor:pointer;width:auto;white-space:normal;overflow-wrap:anywhere}.ht-tariff-v3 button:disabled{cursor:default;opacity:.6}.ht-tariff-v3 :is(input,select,textarea,button):focus-visible{outline:3px solid var(--primary-color,#395fd1);outline-offset:2px}.ht-tariff-v3 .ht-tariff-days,.ht-tariff-v3 .ht-tariff-actions{display:flex;flex-wrap:wrap;gap:8px}.ht-tariff-v3 .ht-tariff-days label{display:flex;align-items:center;gap:8px;min-height:44px}.ht-tariff-v3 input[type=checkbox]{width:24px;min-height:24px;height:24px}.ht-tariff-v3 [role=status]{padding:12px;border-radius:12px;overflow-wrap:anywhere;background:var(--secondary-background-color,#f1f3f6);margin:12px 0}.ht-tariff-v3 [data-status=success]{color:var(--bento-success,#16804a);background:var(--bento-success-light,#e8f5ed)}.ht-tariff-v3 [data-status=error]{color:var(--error-color,#ba1a1a)}.ht-tariff-v3 [data-status=unconfirmed],.ht-tariff-v3 [data-status=partial]{color:var(--warning-color,#a15b00)}.ht-tariff-v3 details{margin:12px 0}.ht-tariff-v3 summary{min-height:44px;cursor:pointer}`;
  function render() {
    const focused = root.querySelector(':focus');
    const focusKey = focused ? { path: focused.dataset.path, action: focused.dataset.action, weekday: focused.dataset.weekday, feed: focused.dataset.feed } : null;
    const a = observe();
    if (state.busy && (!available(a) || !a.admin) && state.message) unknown();
    const p = state.draft;
    root.innerHTML = `<style>${css}${family()?.css || ''}</style><section class="ht-tariff-v3" aria-label="${esc(t('Tariff settings', 'Ustawienia taryfy'))}"><h3>${esc(t('Your electricity tariff', 'Twoja taryfa energii'))}</h3><p>${esc(t('Enter your own rates and hours. Names G11/G12/G12w/G12n do not fill rates, holidays or schedules.', 'Wpisz własne ceny i godziny. Nazwy G11/G12/G12w/G12n nie uzupełniają cen, świąt ani harmonogramu.'))}</p>${
      !a.admin ? `<p>${esc(t('Household access: read only.', 'Dostęp domownika: tylko odczyt.'))}</p>` : ''}${
      !available(a) || state.backendAvailable === false ? `<p>${esc(t('Tariff backend unavailable. No local fallback.', 'Backend taryf jest niedostępny. Brak lokalnego zapisu zastępczego.'))}</p>` :
        !Number.isSafeInteger(state.revision) ? `<p>${esc(t('Backend availability not checked. Load the tariff first.', 'Dostępność backendu nie została sprawdzona. Najpierw wczytaj taryfę.'))}</p>` : ''}
<div class="ht-tariff-grid">${field('type', t('Tariff name type', 'Typ nazwy taryfy'), 'text', ['Custom', 'G11', 'G12', 'G12w', 'G12n'].map(v => [v, v]))}${field('name', t('Name (optional PGE label)', 'Nazwa (opcjonalnie nazwa PGE)'))}${field('currency', t('Currency ISO 4217', 'Waluta ISO 4217'))}${field('timezone', t('IANA timezone', 'Strefa czasowa IANA'))}${field('clock.mode', t('Tariff clock', 'Zegar taryfy'), 'text', [['civil', t('Civil time (DST)', 'Czas lokalny (zmiana czasu)')], ['fixed', t('Fixed UTC offset', 'Stałe przesunięcie UTC')]])}${field('clock.offsetMinutes', t('Fixed offset minutes', 'Stałe przesunięcie w minutach'), 'number')}${field('priceBasis', t('Price basis', 'Podstawa ceny'), 'text', [['gross', t('Gross', 'Brutto')], ['net', t('Net', 'Netto')]])}${field('validFrom', t('Valid from (optional)', 'Ważna od (opcjonalnie)'), 'date')}${field('validTo', t('Valid to (optional)', 'Ważna do (opcjonalnie)'), 'date')}${field('fixedMonthly', t('Fixed monthly fee (separate)', 'Opłata stała miesięczna (osobno)'), 'number')}</div>
<h3>${esc(t('Energy and variable fees per kWh', 'Energia i opłaty zmienne za kWh'))}</h3><p>${esc(t('Empty = unknown; zero is a known zero. Fixed monthly fees are shown separately, never prorated.', 'Puste = nieznane; zero jest znaną wartością zero. Opłata stała jest osobna, bez proporcjonalnego naliczania.'))}</p>${
(p.zones || []).map((_, i) => `<fieldset><legend>${esc(t('Zone', 'Strefa'))} ${i + 1}</legend><div class="ht-tariff-grid">${field(`zones.${i}.id`, t('Zone ID', 'ID strefy'))}${field(`zones.${i}.label`, t('Zone label', 'Etykieta strefy'))}${field(`zones.${i}.energyRate`, t('Energy / kWh', 'Energia / kWh'), 'number')}${field(`zones.${i}.variableRate`, t('Variable fees / kWh (optional)', 'Opłaty zmienne / kWh (opcjonalne)'), 'number')}</div>${mutable() ? button(`remove-zone:${i}`, t('Remove zone', 'Usuń strefę')) : ''}</fieldset>`).join('')}${mutable() ? button('add-zone', t('Add zone', 'Dodaj strefę')) : ''}${field('defaultZone', t('Default zone (optional)', 'Strefa domyślna (opcjonalna)'), 'text', zoneChoices())}
<h3>${esc(t('Schedule rules', 'Reguły harmonogramu'))}</h3>${rows('rules')}${mutable() ? button('add-rule', t('Add rule', 'Dodaj regułę')) : ''}<h3>${esc(t('Date exceptions', 'Wyjątki dat'))}</h3>${rows('exceptions')}${mutable() ? button('add-exception', t('Add date exception', 'Dodaj wyjątek daty')) : ''}
<details><summary>${esc(t('Advanced: absolute dynamic price feed', 'Zaawansowane: bezwzględne przedziały cen dynamicznych'))}</summary><p>${esc(t('Optional dynamic feed overrides schedule prices. Use explicit UTC/offset timestamps. Only this feed uses JSON.', 'Opcjonalny feed dynamiczny zastępuje ceny harmonogramu. Użyj znaczników UTC lub z przesunięciem. JSON służy wyłącznie temu feedowi.'))}</p><label class="ht-tariff-field"><span>${esc(t('Dynamic feed JSON (empty = off)', 'Feed dynamiczny JSON (pusty = wyłączony)'))}</span><textarea data-feed="true"${mutable() ? '' : ' disabled'}>${esc(state.feedText ?? (p.dynamic == null ? '' : JSON.stringify(p.dynamic, null, 2)))}</textarea></label>${field('allowNegativeEnergy', t('Negative energy prices', 'Ujemne ceny energii'), 'text', [['false', t('Disabled', 'Wyłączone')], ['true', t('Explicitly allowed', 'Jawnie dozwolone')]])}</details>
<div role="status" aria-live="polite" data-status="${esc(state.status)}">${statusHtml()}${state.message ? ': ' + esc(localMessage()) : ''}</div><div class="ht-tariff-actions"><button type="button" data-action="load"${state.busy || !available(a) ? ' disabled' : ''}>${esc(t('Load stored tariff', 'Wczytaj zapisaną taryfę'))}</button>${a.admin ? `<button type="button" data-action="save"${state.busy || !available(a) || state.backendAvailable === false || !Number.isSafeInteger(state.revision) ? ' disabled' : ''}>${esc(t('Save tariff', 'Zapisz taryfę'))}</button><button type="button" data-action="cancel"${state.busy ? ' disabled' : ''}>${esc(t('Cancel', 'Anuluj'))}</button>` : ''}</div></section>`;
    root.querySelectorAll('[data-path]').forEach(el => el.addEventListener('input', () => {
      if (!mutable()) { render(); return; }
      const path = el.dataset.path;
      let value = el.value;
      if (el.type === 'number') value = value.trim() === '' ? null : Number(value);
      else if (path.endsWith('.dates')) value = value.split(/[\s,]+/).filter(Boolean);
      else if (path === 'allowNegativeEnergy') value = value === 'true';
      else if (['validFrom', 'validTo', 'defaultZone'].includes(path)) value = value || null;
      write(path, value);
      if (path.includes('.season.')) {
        const base = path.split('.').slice(0, 2).join('.'), season = read(base + '.season');
        if (!season.from && !season.to) delete read(base).season;
      }
      message('not_checked', '');
      const badge = root.querySelector('[role=status]');
      if (badge) { badge.dataset.status = 'not_checked'; badge.innerHTML = statusHtml(); }
    }));
    root.querySelectorAll('[data-path]').forEach(el => el.addEventListener('change', () => {
      if (/^zones\.\d+\.(id|label)$/.test(el.dataset.path)) render();
    }));
    root.querySelectorAll('[data-weekday]').forEach(el => el.addEventListener('change', () => {
      if (!mutable()) { render(); return; }
      const [i, day] = el.dataset.weekday.split(':').map(Number), row = p.rules[i], days = new Set(row.weekdays || []);
      if (el.checked) days.add(day); else days.delete(day);
      if (days.size) row.weekdays = [...days].sort(); else delete row.weekdays;
      message('not_checked', ''); render();
    }));
    root.querySelector('[data-feed]')?.addEventListener('input', event => {
      if (!mutable()) { render(); return; }
      state.feedText = event.target.value;
      try { const dynamic = state.feedText.trim() ? JSON.parse(state.feedText) : null;
        if (dynamic !== null && !object(dynamic)) throw Error();
        p.dynamic = dynamic; state.feedError = null; message('not_checked', '');
      } catch (_) { state.feedError = t('Invalid dynamic feed JSON.', 'Niepoprawny JSON feedu dynamicznego.'); message('error', state.feedError); }
      const badge = root.querySelector('[role=status]');
      if (badge) { badge.dataset.status = state.status; badge.innerHTML = statusHtml() + (state.message ? ': ' + esc(localMessage()) : ''); }
    });
    root.querySelectorAll('[data-action]').forEach(el => el.addEventListener('click', () => {
      const [action, ...args] = el.dataset.action.split(':');
      if (action === 'load') { void load(); return; }
      if (!mutable()) return;
      if (action === 'save') { void save(); return; }
      if (action === 'cancel') { cancel(); return; }
      if (action === 'add-zone') {
        p.zones ||= []; let id = `zone-${p.zones.length + 1}`;
        while (p.zones.some(z => z.id === id)) id += '-new';
        p.zones.push({ id, label: '', energyRate: null, variableRate: null });
      } else if (action === 'remove-zone') p.zones.splice(Number(args[0]), 1);
      else if (action === 'add-rule' || action === 'add-exception') {
        const kind = action === 'add-rule' ? 'rules' : 'exceptions'; p[kind] ||= [];
        p[kind].push({ zone: p.defaultZone || p.zones?.[0]?.id || '', priority: 0,
          ...(kind === 'exceptions' ? { dates: [] } : {}), intervals: [{ from: '00:00', to: '24:00' }] });
      } else if (action === 'remove-row') p[args[0]].splice(Number(args[1]), 1);
      else if (action === 'add-interval') { const row = p[args[0]][Number(args[1])]; row.intervals ||= []; row.intervals.push({ from: '00:00', to: '24:00' }); }
      else if (action === 'remove-interval') p[args[0]][Number(args[1])].intervals.splice(Number(args[2]), 1);
      message('not_checked', ''); render();
    }));
    if (focusKey) {
      const target = [...root.querySelectorAll('input,select,textarea,button')].find(el =>
        (focusKey.path && el.dataset.path === focusKey.path) || (focusKey.action && el.dataset.action === focusKey.action) ||
        (focusKey.weekday && el.dataset.weekday === focusKey.weekday) || (focusKey.feed && el.dataset.feed === focusKey.feed));
      if (target && !target.disabled) target.focus();
    }
  }
  return { render, load, cancel };
}

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
        // Refresh a form opened during this read only while its seed is intact.
        const pristine = !saved.draft || JSON.stringify(saved.draft) === JSON.stringify(saved.profile) || JSON.stringify(saved.draft) === JSON.stringify(saved._draftBaseline);
        saved.profile = clone(profile); saved.revision = result.revision; saved.updated_at = result.updated_at ?? null;
        saved.backendAvailable = true;
        if (pristine) {
          saved.draft = profile && createModel(profile).valid ? clone(profile) : undefined;
          saved._draftBaseline = clone(saved.draft);
        }
        return true;
      } catch (_) { return false; }
    })();
    pending = operation;
    operation.finally(() => { if (pending === operation) pending = null; });
    return operation;
  };
  const markup = () => `<style>
    [data-energy-container]{container-type:inline-size;container-name:energy-card}
    .tabs{flex-wrap:wrap;overflow:visible;max-width:100%}
    .tabs>button{min-height:44px;min-width:44px;white-space:normal;overflow-wrap:anywhere;flex:0 1 auto}
    button{min-height:44px;min-width:44px}
    .energy-tab-picker{display:none;margin:12px 0}
    .energy-tab-picker select{font:inherit;color:var(--primary-text-color,#172033);background:var(--card-background-color,#fff);width:100%;max-width:100%;min-height:44px;border:1px solid var(--divider-color,#d8dce5);border-radius:10px;padding:10px}
    .energy-tab-picker select:focus-visible{outline:3px solid var(--primary-color,#395fd1);outline-offset:2px}
    @container energy-card (max-width:279.99px){.tabs{display:none}.energy-tab-picker{display:block}}
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
      const refreshed = envelope => {
        card._sharedTariffProfile = clone(envelope.profile); card._sharedTariffAssociation = identity(card._hass);
        card._sharedTariffLoadedAt = Date.now();
        // The editor finishes its pending state before the parent replaces DOM.
        queueMicrotask(() => {
          if (kind === 'insights') void card._fetchData();
          if (kind === 'email') void card._fetchAllPeriodStats().then(() => card._render());
          card._render();
        });
      };
      editor = createSettings({ root, getHass: () => card._hass, language, state: saved, validate: createModel,
        ui: () => createUi({ language: language() }),
        onSaved: refreshed, onLoaded: refreshed,
        onCancel: () => {
          card._tariffSettingsOpen = false;
          const details = root.closest('[data-tariff-details]');
          if (details) { details.open = false; details.querySelector('summary')?.focus(); }
        } });
    }
    if (!Object.hasOwn(state(), '_draftBaseline')) state()._draftBaseline = clone(state().draft);
    editor.render();
  };
  const bind = () => {
    const tabs = card.shadowRoot.querySelector('.tabs');
    if (tabs) {
      tabs.parentElement.setAttribute('data-energy-container', '');
      const buttons = [...tabs.querySelectorAll('button')];
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', text('Energy views', 'Widoki energii'));
      let picker = card.shadowRoot.querySelector('.energy-tab-picker select');
      if (!picker) {
        const label = document.createElement('label'); label.className = 'energy-tab-picker';
        picker = document.createElement('select'); label.append(picker); tabs.before(label);
        picker.addEventListener('change', () => buttons[Number(picker.value)]?.click());
      }
      picker.setAttribute('aria-label', text('Energy view', 'Widok energii'));
      picker.replaceChildren(...buttons.map((button, index) => {
        const option = document.createElement('option'); option.value = String(index);
        option.textContent = button.textContent.trim(); option.selected = button.classList.contains('active');
        button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(option.selected));
        if (!button.dataset.energyPickerBound) {
          button.dataset.energyPickerBound = 'true';
          button.addEventListener('click', () => queueMicrotask(() => {
            buttons.forEach((item, i) => {
              const active = item.classList.contains('active'); item.setAttribute('aria-selected', String(active));
              if (active) picker.value = String(i);
            });
          }));
        }
        return option;
      }));
    }
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
this._tariffHostController = createTariffHostV3({ card: this, kind: 'email', createModel: createEnergyTariffV3, legacyProfile: energyTariffProfileV3, createSettings: createTariffSettingsV3, createUi: createUiV3 });
// HA_TARIFF_V3_END
      return this._tariffHostController;
    }
    _tariffCurrency() { return this._getTariffHostV3().currency(); }
    _loadSharedTariffProfile() { return this._getTariffHostV3().load(); }
    _tariffDetailsMarkup() { return this._getTariffHostV3().markup(); }
    _bindTariffSettings() { this._getTariffHostV3().bind(); }
    _resetTariffContext(nextHass) { this._getTariffHostV3().reset(nextHass); }

    _tariffRateForHour(stamp) {
      return this._getTariffV3().priceBuckets([{ from: stamp, to: stamp + ENERGY_HOUR, kwh: 1 }]).energyCost;
    }

    _getRate(hour, dayOfWeek) {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const dayStart = c.energy_day_hour_start ?? 6;
      const nightStart = c.energy_night_hour_start ?? 22;
      const isDay = (dayStart < nightStart) ? (hour >= dayStart && hour < nightStart) : (hour >= dayStart || hour < nightStart);
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      let value;
      switch (mode) {
        case 'day_night':
          value = isDay ? c.energy_price_day : c.energy_price_night; break;
        case 'weekday_weekend':
          value = isWeekend ? c.energy_price_weekend : c.energy_price_weekday; break;
        case 'mixed':
          value = isWeekend ? (isDay ? c.energy_price_we_day : c.energy_price_we_night) : (isDay ? c.energy_price_wd_day : c.energy_price_wd_night); break;
        default:
          value = c.energy_price;
      }
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    }

    _getAvgRate() {
      const mode = this._config.energy_tariff_mode || 'flat';
      if (mode === 'flat') return this._getRate(12, 1);
      let sum = 0;
      for (let dow = 0; dow < 7; dow++) {
        for (let h = 0; h < 24; h++) {
          const rate = this._getRate(h, dow);
          if (rate === null) return null;
          sum += rate;
        }
      }
      return sum / 168;
    }

    _cost(kwh) {
      if (Object.hasOwn(this._config, 'tariff_profile') || this._sharedTariffProfile != null) return null;
      // Aggregate consumption cannot price a time-dependent tariff.
      if ((this._config.energy_tariff_mode || 'flat') !== 'flat') return null;
      const rate = this._getRate(12, 1);
      return rate === null || !Number.isFinite(kwh) ? null : kwh * rate;
    }

    _bucketCost(buckets, unit) {
      const factor = energyFactor(unit);
      if (!factor) return null;
      const rows = [...buckets].map(([stamp, change]) => ({ from: stamp, to: stamp + ENERGY_HOUR, kwh: change * factor }));
      return this._getTariffV3().priceBuckets(rows).energyCost;
    }

    _formatCost(value) {
      return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'N/A';
    }

    _getTariffLabel() {
      const custom = Object.hasOwn(this._config, 'tariff_profile') ? this._config.tariff_profile : this._sharedTariffProfile;
      if (Object.hasOwn(this._config, 'tariff_profile') || custom != null) return this._getTariffV3().valid
        ? `${custom.name || custom.type || 'Custom'} · ${custom.priceBasis === 'net' ? (this._lang === 'pl' ? 'netto' : 'net') : (this._lang === 'pl' ? 'brutto' : 'gross')} · ${custom.timezone}`
        : (this._lang === 'pl' ? 'Taryfa niedostępna' : 'Tariff unavailable');
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const cur = c.currency || this._hass?.config?.currency || '';
      if (this._getAvgRate() === null) return this._lang === 'pl' ? 'Taryfa nieskonfigurowana' : 'Tariff not configured';
      const suffix = this._lang === 'pl' ?
        { 'day_night': '/kWh (dzień/noc)', 'weekday_weekend': '/kWh (roboczy/weekend)' } :
        { 'day_night': '/kWh (day/night)', 'weekday_weekend': '/kWh (weekday/weekend)' };
      switch (mode) {
        case 'day_night': return c.energy_price_day + '/' + c.energy_price_night + ' ' + cur + (suffix['day_night'] || '');
        case 'weekday_weekend': return c.energy_price_weekday + '/' + c.energy_price_weekend + ' ' + cur + (suffix['weekday_weekend'] || '');
        case 'mixed': return 'mix: ' + c.energy_price_wd_day + '/' + c.energy_price_wd_night + '/' + c.energy_price_we_day + '/' + c.energy_price_we_night + ' ' + cur;
        default: return c.energy_price + ' ' + cur + '/kWh';
      }
    }


    static getStubConfig() {
      return {
        type: 'custom:ha-energy-email',
        title: 'Energy Email Reports'
      };
    }

    _state(entity_id, fallback = '0') {
      if (!this._hass) return fallback;
      const s = this._hass.states[entity_id];
      return s ? s.state : fallback;
    }

    _attr(entity_id, attr, fallback = null) {
      if (!this._hass) return fallback;
      const s = this._hass.states[entity_id];
      return s && s.attributes[attr] !== undefined ? s.attributes[attr] : fallback;
    }

    _float(v, fallback = 0) {
      const n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    }

    _fmt(v, decimals = 2) {
      return this._float(v).toFixed(decimals);
    }

    // --- auto-discovery ---

    async _discoverAll() {
      await this._loadEmailBackendConfig();
      await this._ensureHelpers();
      this._discoverRecipient();
      this._discoveryDone = true;
      this._render();
      // Fetch recorder stats in background (for period views)
      this._fetchAllPeriodStats().then(() => {
        if (this._periodCache_day || this._periodCache_week || this._periodCache_month) this._render();
      }).catch(() => {});
    }

    // --- HA-native persistent storage via input_text helpers ---

    // Helper config: 'key' is our logical name, 'name' generates entity_id (HA slugifies name → entity_id)
    // e.g. name "Energy Email Recipient" → input_text.energy_email_recipient
    static get HELPERS() {
      return [
        { key: 'recipient', name: 'Energy Email Recipient', max: 255 },
        { key: 'service', name: 'Energy Email Service', max: 100 },
        { key: 'daily_time', name: 'Energy Email Daily Time', max: 5 },
        { key: 'weekly_time', name: 'Energy Email Weekly Time', max: 5 },
        { key: 'weekly_day', name: 'Energy Email Weekly Day', max: 3 },
        { key: 'monthly_time', name: 'Energy Email Monthly Time', max: 5 },
        { key: 'price', name: 'Energy Email Price', max: 10 },
        { key: 'excluded', name: 'Energy Email Excluded', max: 255 },
      ];
    }

    // Resolve helper key → entity_id by scanning hass.states for matching friendly_name
    _helperEntity(key) {
      const cfg = HAEnergyEmail.HELPERS.find(h => h.key === key);
      if (!cfg) return null;
      // First try exact slug match (name lowercased, spaces→underscores)
      const slug = cfg.name.toLowerCase().replace(/\s+/g, '_');
      const directEid = `input_text.${slug}`;
      if (this._hass?.states?.[directEid]) return directEid;
      // Fallback: scan all input_text entities for matching friendly_name
      if (this._hass?.states) {
        for (const [eid, state] of Object.entries(this._hass.states)) {
          if (eid.startsWith('input_text.energy_email') && state.attributes?.friendly_name === cfg.name) return eid;
        }
      }
      return directEid; // return expected eid even if not found yet
    }

    async _ensureHelpers() {
      if (this._helpersChecked) return;
      this._helpersChecked = true;
      // Opening a card must not create entities or change the household configuration.
      this._helpersReady = HAEnergyEmail.HELPERS.every(helper =>
        !!this._hass?.states?.[this._helperEntity(helper.key)]);
      this._loadFromHelpers();
    }

    _loadFromHelpers() {
      const s = this._hass?.states;
      if (!s) return;
      const read = (key) => {
        const eid = this._helperEntity(key);
        return this._readHelper(key);
      };
      const recipient = read('recipient');
      const service = read('service');
      const dailyTime = read('daily_time');
      const weeklyTime = read('weekly_time');
      const weeklyDay = read('weekly_day');
      const monthlyTime = read('monthly_time');
      const price = read('price');
      if (recipient && recipient.includes('@')) this._detectedRecipient = recipient;
      if (service && service.length > 0) this._detectedService = service;
      if (/^\d{2}:\d{2}$/.test(dailyTime)) this._scheduleDefaults.daily = dailyTime;
      if (/^\d{2}:\d{2}$/.test(weeklyTime)) this._scheduleDefaults.weekly_time = weeklyTime;
      if (weeklyDay && weeklyDay.length >= 3) this._scheduleDefaults.weekly_day = weeklyDay;
      if (/^\d{2}:\d{2}$/.test(monthlyTime)) this._scheduleDefaults.monthly_time = monthlyTime;
      if (price && !isNaN(parseFloat(price)) && parseFloat(price) >= 0) this._config.energy_price = parseFloat(price);
      const excluded = read('excluded');
      if (excluded) this._excludedDevices = new Set(excluded.split(',').map(s => s.trim()).filter(Boolean));
    }

    _requireAdmin() {
      if (this._hass?.user?.is_admin === true) return true;
      this._showToast(this._lang === 'pl' ? 'Tylko administrator może zmieniać ustawienia i wysyłać raporty.' : 'Only administrators can change settings and send reports.');
      return false;
    }

    async _saveToHelper(key, value) {
      if (!this._requireAdmin()) return false;
      const eid = this._helperEntity(key);
      const helper = this._hass?.states?.[eid];
      const text = String(value ?? '');
      try {
        if (helper) {
          // input_text can acknowledge an invalid length without updating its state.
          const { min, max } = helper.attributes || {};
          if ((Number.isFinite(min) && text.length < min) ||
              (Number.isFinite(max) && text.length > max)) throw new Error('Invalid helper value length');
          await this._hass.callService('input_text', 'set_value', { entity_id: eid, value: text });
        } else {
          localStorage.setItem(`ha-energy-email-${key}`, text);
        }
        return true;
      } catch (e) {
        this._showToast(this._lang === 'pl'
          ? 'Nie udało się zapisać ustawienia. Poprzednia wartość pozostaje bez zmian.'
          : 'Could not save this setting. The previous value is unchanged.');
        return false;
      }
    }

    _readHelper(key) {
      const eid = this._helperEntity(key);
      const s = this._hass?.states?.[eid];
      if (s && s.state && s.state !== 'unknown' && s.state !== '') return s.state;
      // Fallback to localStorage
      try { return localStorage.getItem(`ha-energy-email-${key}`) || ''; } catch(e) { return ''; }
    }

    async _emailWs(command, payload = {}) {
      const hass = this._hass;
      if (!hass?.callWS) throw new Error('Home Assistant websocket API is unavailable');
      return hass.callWS({ type: 'ha_tools_email/' + command, ...payload });
    }

    async _loadEmailBackendConfig(options = {}) {
      const showErrors = !!options.showErrors;
      if (this._hass?.user?.is_admin !== true) {
        this._emailBackendChecked = true;
        this._emailBackendError = 'Administrator access is required for email configuration.';
        return null;
      }
      const hass = this._hass;
      if (!hass?.callWS) {
        this._emailBackendChecked = true;
        this._emailBackendAvailable = false;
        this._emailBackendMissing = false;
        return null;
      }
      try {
        const resp = await hass.callWS({ type: 'ha_tools_email/get_config' });
        this._emailBackendChecked = true;
        let reportsUnsupported = false;
        this._emailBackendMissing = false;
        this._emailBackendConfig = resp || {};
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : [];
        this._emailBackendError = null;
        if (resp?.default_recipient && !this._config.recipient && !this._detectedRecipient) this._detectedRecipient = resp.default_recipient;
        await Promise.all(['daily', 'weekly', 'monthly'].map(async cadence => {
          try {
            this._backendReportPreviews[cadence] = await this._emailWs('preview_energy_report', { cadence });
          } catch (e) {
            this._backendReportPreviews[cadence] = null;
            // Only an explicit missing command proves the Recorder composer is unsupported.
            if (e?.code === 'unknown_command') reportsUnsupported = true;
          }
        }));
        this._emailBackendReportsUnsupported = reportsUnsupported;
        this._emailBackendAvailable = true;
        this._render();
        return resp;
      } catch (e) {
        this._emailBackendChecked = true;
        this._emailBackendAvailable = false;
        this._emailBackendConfig = null;
        this._emailSchedules = [];
        // Only HA's explicit missing command proves this backend API is absent.
        // Connection, permission and not-loaded errors do not prove absence.
        this._emailBackendMissing = e?.code === 'unknown_command';
        this._emailBackendError = e?.message || String(e);
        if (showErrors) this._showToast('⚠️ ' + (this._lang === 'pl' ? 'Backend email niedostępny: ' : 'Email backend unavailable: ') + this._emailBackendError);
        this._render();
        return null;
      }
    }

    async _refreshBackendSchedules(showErrors = false) {
      if (!this._emailBackendAvailable) return;
      try {
        const resp = await this._emailWs('list_schedules');
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : [];
        this._emailBackendError = null;
        this._render();
      } catch (e) {
        this._emailBackendError = e?.message || String(e);
        if (showErrors) this._showToast('❌ ' + (this._lang === 'pl' ? 'Nie udało się pobrać harmonogramów: ' : 'Could not load schedules: ') + this._emailBackendError);
      }
    }

    _getEnergySchedule(cadence) {
      return (this._emailSchedules || []).find(s => s && s.kind === 'energy_report' && s.cadence === cadence) || null;
    }

    _defaultScheduleTime(cadence) {
      if (cadence === 'weekly') return this._scheduleDefaults.weekly_time || '08:00';
      if (cadence === 'monthly') return this._scheduleDefaults.monthly_time || '08:00';
      return this._scheduleDefaults.daily || '07:30';
    }

    _splitRecipients(value) {
      return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    }

    _scheduleRecipients(cadence) {
      const input = this.shadowRoot?.getElementById('schedule-recipients-' + cadence);
      if (input) return this._splitRecipients(input.value);
      const schedule = this._getEnergySchedule(cadence) || this._legacySchedules?.[cadence];
      const recipients = Array.isArray(schedule?.recipients) ? schedule.recipients : [];
      if (recipients.length) return recipients;
      const recipient = this._getRecipient();
      return recipient ? [recipient] : [];
    }

    _discoverRecipient() {
      if (this._hass?.user?.is_admin !== true) return;
      if (!this._config.recipient && !this._detectedRecipient && this._emailBackendConfig?.default_recipient) {
        this._detectedRecipient = this._emailBackendConfig.default_recipient;
        return;
      }
      // Try to get SMTP recipient from HA helper first
      if (!this._config.recipient && !this._detectedRecipient) {
        const savedRecipient = this._readHelper('recipient');
        if (savedRecipient && savedRecipient.includes('@')) { this._detectedRecipient = savedRecipient; return; }
        // Try config_entries API to get ha_tools_email default recipient
        if (!this._detectedRecipient && !this._configEntriesChecked) {
          this._configEntriesChecked = true;
          this._hass.callWS({ type: 'config/config_entries' }).then(entries => {
            const haToolsEntry = entries.find(e => e.domain === 'ha_tools_email');
            if (haToolsEntry && haToolsEntry.data) {
              const r = haToolsEntry.data.default_recipient;
              if (r) { this._detectedRecipient = r; this._render(); }
            }
          }).catch(() => {});
        }
      }
    }

    _getRecipient() {
      if (this._config.recipient) return this._config.recipient;
      if (this._detectedRecipient) return this._detectedRecipient;
      return '';
    }

    async _saveRecipient(email) {
      if (!await this._saveToHelper('recipient', email)) return false;
      this._detectedRecipient = email;
      this._render();
      return true;
    }

    _devices() {
      const manual = this._attr('sensor.energy_report_devices', 'devices');
      if (manual && Array.isArray(manual) && manual.length > 0) {
        return manual;
      }
      return [];
    }

    _getOverviewDataForPeriod(period) {
      return this._getAutoDataForPeriod(period === 'total' ? 'month' : period);
    }

    _getAutoDataForPeriod(period) {
      const cached = this[`_periodCache_${period}`];
      return Array.isArray(cached) ? [...cached].sort((a, b) => b.month - a.month) : [];
    }

    async _fetchRecorderStats(period) {
      const hours = { day: 24, week: 168, month: 720 }[period];
      if (!hours || !this._hass?.callWS) return;
      const cacheKey = `_periodCache_${period}`;
      const statusKey = `_periodStatus_${period}`;
      this[cacheKey] = [];
      this[statusKey] = 'no_data';
      const end = new Date(Math.floor(Date.now() / 3600000) * 3600000);
      const start = new Date(end.getTime() - hours * 3600000);
      this[`_periodWindow_${period}`] = { start: start.toISOString(), end: end.toISOString() };
      try {
        await this._loadSharedTariffProfile();
        const prefs = await this._hass.callWS({ type: 'energy/get_prefs' });
        const ids = energyImportIds(prefs);
        if (!ids.length) { this[statusKey] = 'no_sources'; return; }
        const rawMetadata = await this._hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: ids });
        const metadata = Array.isArray(rawMetadata) ? Object.fromEntries(rawMetadata.map(row => [row.statistic_id, row])) : (rawMetadata || {});
        const stats = await this._hass.callWS({ type: 'recorder/statistics_during_period',
          start_time: start.toISOString(), end_time: end.toISOString(), statistic_ids: ids,
          period: 'hour', types: ['change'] });
        const result = [];
        const hasSamples = ids.some(id => stats?.[id]?.length);
        for (const id of ids) {
          const meta = metadata[id];
          const unit = meta?.statistics_unit_of_measurement || meta?.unit_of_measurement;
          if (meta?.has_sum !== true || !energyFactor(unit) || (meta.unit_class && meta.unit_class !== 'energy')) {
            this[statusKey] = 'unsupported'; return;
          }
          const buckets = new Map();
          for (const point of stats?.[id] || []) {
            const stamp = energyTimestamp(point.start);
            const change = typeof point.change === 'number' ? point.change : NaN;
            if (!Number.isFinite(stamp) || stamp < start.getTime() || stamp >= end.getTime() ||
                (stamp - start.getTime()) % 3600000 !== 0 || buckets.has(stamp) || !Number.isFinite(change) || change < 0) {
              this[statusKey] = 'partial'; return;
            }
            buckets.set(stamp, change);
          }
          if (buckets.size !== hours) { this[statusKey] = hasSamples ? 'partial' : 'no_data'; return; }
          const kwh = [...buckets.values()].reduce((sum, value) => sum + value * energyFactor(unit), 0);
          result.push({ name: this._hass.states?.[id]?.attributes?.friendly_name || id,
            key: id, entity_id: id, month: kwh, lastMonth: null, cost: this._bucketCost(buckets, unit), source: 'recorder' });
        }
        this[cacheKey] = result;
        this[statusKey] = 'ready';
        this[`_periodCacheTime_${period}`] = Date.now();
      } catch (e) {
        this[statusKey] = 'error';
        console.warn('Energy Email: complete Recorder period data unavailable');
      }
    }

    // Coalesce refreshes and retry unavailable data without polling every HA update.
    async _fetchAllPeriodStats() {
      if (this._periodRefreshPromise) return this._periodRefreshPromise;
      this._lastPeriodRefresh = Date.now();
      this._periodRefreshPromise = Promise.all([
        this._fetchRecorderStats('day'), this._fetchRecorderStats('week'), this._fetchRecorderStats('month')
      ]);
      try { await this._periodRefreshPromise; }
      finally { this._periodRefreshPromise = null; }
    }

    _filterExcluded(data) {
      if (!this._excludedDevices || this._excludedDevices.size === 0) return data;
      return data.filter(d => {
        const key = d.key || d.entity_id || d.name;
        return !this._excludedDevices.has(key);
      });
    }

    _getOverviewData() {
      return this._getOverviewDataForPeriod(this._overviewPeriod || 'day');
    }

    _autoState(id) {
      const s = this._state(id, 'unknown');
      return s === 'on' ? '\u2705 Enabled' : s === 'off' ? '\u274C Disabled' : '\u2753 Unknown';
    }

    _autoStateClass(id) {
      const s = this._state(id, 'unknown');
      return s === 'on' ? 'auto-on' : s === 'off' ? 'auto-off' : 'auto-unknown';
    }

    // --- main render ---

    _renderPreservingDrafts() {
      const root = this.shadowRoot;
      const focused = root.activeElement;
      const focusId = focused?.id;
      const focusTab = focused?.dataset?.tab;
      const selection = focused?.selectionStart != null ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
      const fields = [...root.querySelectorAll('input[id], select[id], textarea[id]')].map(field => ({ id: field.id, value: field.value, checked: field.checked }));
      const tabsScroll = root.querySelector('.tabs')?.scrollLeft || 0;
      this._render();
      // Reopen an unsaved inline tariff editor without committing the draft.
      if (fields.some(field => field.id === 'price-input')) root.getElementById('price-display')?.click();
      for (const saved of fields) {
        const field = root.getElementById(saved.id);
        if (!field) continue;
        field.value = saved.value;
        if (typeof saved.checked === 'boolean') field.checked = saved.checked;
      }
      const target = focusId ? root.getElementById(focusId) : [...root.querySelectorAll('[data-tab]')].find(el => el.dataset.tab === focusTab);
      target?.focus({ preventScroll: true });
      if (selection && target?.setSelectionRange) target.setSelectionRange(...selection);
      const tabs = root.querySelector('.tabs');
      if (tabs) tabs.scrollLeft = tabsScroll;
    }

    _render() {
      if (!this._hass) return;
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const recipientDisplay = recipient
        ? `${L ? 'Do' : 'To'}: ${_esc(recipient)}`
        : (L ? 'Nie ustawiono odbiorcy' : 'No recipient set');
      this.shadowRoot.innerHTML = `
        <style>${LOCAL_BENTO_CSS}


  /* ===== BENTO DESIGN SYSTEM (local fallback) ===== */

  :host {
    --bento-primary: #3B82F6;
    --bento-primary-hover: #2563EB;
    --bento-primary-light: rgba(59, 130, 246, 0.08);
    --bento-success: #10B981;
    --bento-success-light: rgba(16, 185, 129, 0.08);
    --bento-error: #EF4444;
    --bento-error-light: rgba(239, 68, 68, 0.08);
    --bento-warning: #F59E0B;
    --bento-warning-light: rgba(245, 158, 11, 0.08);
    --bento-bg: var(--primary-background-color, #F8FAFC);
    --bento-card: var(--card-background-color, #FFFFFF);
    --bento-border: var(--divider-color, #E2E8F0);
    --bento-text: var(--primary-text-color, #1E293B);
    --bento-text-secondary: var(--secondary-text-color, #64748B);
    --bento-text-muted: var(--disabled-text-color, #94A3B8);
    --bento-radius-xs: 6px;
    --bento-radius-sm: 10px;
    --bento-radius-md: 16px;
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
    --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
    --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  :host {
            font-family: 'Inter', sans-serif;
          }

  :host(.bento-dark) {
      --bento-bg: var(--primary-background-color, #1a1a2e);
      --bento-card: var(--card-background-color, #16213e);
      --bento-text: var(--primary-text-color, #e2e8f0);
      --bento-text-secondary: var(--secondary-text-color, #94a3b8);
      --bento-border: var(--divider-color, #334155);
      --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
      --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    }
          .card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-md); padding: 20px; box-shadow: var(--bento-shadow-sm); box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
          .header-icon { font-size: 24px; }
          .header-title { font-size: 17px; font-weight: 700; color: var(--bento-text); }
          .header-sub { font-size: 12px; color: var(--bento-text-secondary); margin-top: 1px; }
          .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); margin-bottom: 18px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: var(--bento-border) transparent; -webkit-overflow-scrolling: touch; }
          .tabs::-webkit-scrollbar { height: 4px; }
          .tabs::-webkit-scrollbar-track { background: transparent; }
          .tabs::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
          .tab-btn { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--bento-text-secondary); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
          .tab-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
          .tab-btn.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); font-weight: 600; }
          .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
          .grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-bottom: 16px; }
          @media (max-width: 768px) { .grid3 { grid-template-columns: repeat(2, 1fr); } }
          @media (max-width: 480px) { .grid3 { grid-template-columns: 1fr; } .grid2 { grid-template-columns: repeat(2, 1fr); } }
          .stat { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; text-align: center; min-width: 0; overflow: hidden; box-sizing: border-box; }
          .stat-value { font-size: 24px; font-weight: 700; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .stat-label { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
          .stat-sub { font-size: 11px; color: var(--bento-text-muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
          .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .device-row:hover { background: var(--bento-primary-light); }
          .device-name { flex: 1; font-size: 13px; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .device-val { font-size: 12px; font-weight: 600; color: var(--bento-primary); min-width: 70px; text-align: right; white-space: nowrap; flex-shrink: 0; }
          .device-bar-wrap { flex: 1; background: var(--bento-border); border-radius: 4px; height: 6px; overflow: hidden; }
          .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
          .schedule-card { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 10px; box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .schedule-card .config-input { box-sizing: border-box; min-width: 0; max-width: 100%; }
          .schedule-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; overflow: hidden; }
          .schedule-name { font-size: 14px; font-weight: 600; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
          .badge-ok { background: var(--bento-success-light); color: var(--bento-success); }
          .badge-er { background: var(--bento-error-light); color: var(--bento-error); }
          .badge-wa { background: var(--bento-warning-light); color: var(--bento-warning); }
          .badge-pr { background: var(--bento-primary-light); color: var(--bento-text); }
          .badge-auto { background: rgba(139,92,246,.1); color: #8B5CF6; }
          .schedule-meta { font-size: 12px; color: var(--bento-text-secondary); }
          .schedule-meta span { margin-right: 12px; }
          .btn-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
          .btn { padding: 8px 16px; border-radius: var(--bento-radius-xs); border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; }
          .btn:hover { background: var(--bento-bg); }
          .btn:disabled { opacity: .45; cursor: not-allowed; }
          .btn-primary { background: var(--bento-primary) !important; color: #fff !important; border-color: var(--bento-primary) !important; box-shadow: 0 2px 8px rgba(59,130,246,.3); }
          .btn-primary:hover { background: #2563EB !important; }
          .btn-ok { background: var(--bento-success) !important; color: #fff !important; border-color: var(--bento-success) !important; }
          .smtp-section { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
          .smtp-missing { border-color: #f59e0b40; background: #fef3c720; }
          .smtp-header { display: flex; align-items: center; gap: 12px; }
          .smtp-icon { font-size: 24px; }
          .smtp-title { font-weight: 700; font-size: 14px; color: var(--bento-text); }
          .smtp-detail { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }
          .smtp-detail code { background: var(--bento-border); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
          .smtp-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
          .smtp-guide { margin-top: 16px; }
          .guide-title { font-weight: 700; font-size: 14px; margin-bottom: 12px; color: var(--bento-text); }
          .guide-steps { display: flex; flex-direction: column; gap: 16px; }
          .guide-step { display: flex; gap: 12px; }
          .step-num { flex-shrink: 0; width: 28px; height: 28px; background: var(--bento-primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
          .guide-step p { margin: 4px 0; font-size: 13px; color: var(--bento-text-secondary); line-height: 1.5; }
          .guide-step pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; line-height: 1.6; white-space: pre; margin: 8px 0; max-width: 100%; box-sizing: border-box; }
          .guide-step a { color: var(--bento-primary); text-decoration: none; }
          .guide-step a:hover { text-decoration: underline; }
          .guide-alt { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--bento-border); }
          .smtp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
          .smtp-table th { background: var(--bento-border); padding: 6px 10px; text-align: left; font-weight: 600; }
          .smtp-table td { padding: 6px 10px; border-bottom: 1px solid var(--bento-border); }
          .smtp-table tr:hover td { background: var(--bento-border); }
          .toast { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: #1e293b; color: #e2e8f0; padding: 12px 20px; border-radius: var(--bento-radius-sm); font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.3); max-width: 320px; }
          .toast.show { display: block; animation: slideUp .3s ease-out; }
          @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
          .preview-box { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; font-size: 13px; color: var(--bento-text); max-height: 320px; overflow-y: auto; }
          .preview-box h3 { font-size: 15px; margin: 0 0 10px; }
          .preview-box h4 { font-size: 13px; margin: 14px 0 6px; color: var(--bento-text-secondary); }
          .preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .preview-table th { background: var(--bento-border); padding: 5px 8px; text-align: left; font-weight: 600; font-size: 11px; }
          .preview-table td { padding: 5px 8px; border-bottom: 1px solid var(--bento-border); }
          .preview-table tr:last-child td { border-bottom: none; }
          .trend-up { color: var(--bento-error); }
          .trend-down { color: var(--bento-success); }
          .pagination-row { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px 0 4px; }
          .pagination-btn { padding: 6px 14px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-bg); color: var(--bento-text); font-size: 12px; cursor: pointer; transition: all .15s; }
          .pagination-btn:hover:not([disabled]) { background: var(--bento-primary-light); border-color: var(--bento-primary); color: var(--bento-primary); }
          .pagination-btn[disabled] { opacity: 0.4; cursor: not-allowed; }
          .pagination-info { font-size: 12px; color: var(--bento-text-secondary); }
          .info-row { display: flex; gap: 6px; align-items: flex-start; padding: 10px; background: var(--bento-primary-light); border-radius: var(--bento-radius-xs); margin-bottom: 12px; font-size: 12px; color: var(--bento-text); }
          .info-warn { background: var(--bento-warning-light); }
          .auto-on { color: var(--bento-success); }
          .auto-off { color: var(--bento-error); }
          .auto-unknown { color: var(--bento-warning); }
          .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: 6px; vertical-align: middle; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .last-sent { font-size: 11px; color: var(--bento-text); margin-top: 4px; }
          .empty-state { text-align: center; padding: 32px 20px; }
          .empty-state .big { font-size: 40px; margin-bottom: 12px; }
          .empty-state .title { font-size: 15px; font-weight: 600; color: var(--bento-text); margin-bottom: 6px; }
          .empty-state .desc { font-size: 13px; color: var(--bento-text-secondary); line-height: 1.6; max-width: 400px; margin: 0 auto; }
          .source-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; margin-left: 6px; }
          .source-auto { background: rgba(139,92,246,.1); color: #8B5CF6; }
          .email-setup { background: var(--bento-warning-light); border: 1px solid rgba(245,158,11,.3); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 16px; }
          .email-setup-title { font-size: 13px; font-weight: 600; color: var(--bento-text); margin-bottom: 8px; }
          .email-input-row { display: flex; gap: 8px; align-items: center; }
          .email-input { flex: 1; padding: 8px 12px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 13px; font-family: 'Inter', sans-serif; background: var(--bento-card); color: var(--bento-text); outline: none; }
          .email-input:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px var(--bento-primary-light); }
          .email-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 12px; background: var(--bento-success-light); border-radius: var(--bento-radius-xs); font-size: 12px; color: var(--bento-text); }
          .email-edit-btn { background: none; border: none; color: var(--bento-primary); cursor: pointer; font-size: 11px; padding: 2px 6px; font-family: 'Inter', sans-serif; }
          .email-edit-btn:hover { text-decoration: underline; }
          .source-manual { background: var(--bento-success-light); color: var(--bento-success); }
          .config-section { margin-bottom: 20px; }
          .config-section-title { font-size: 13px; font-weight: 700; color: var(--bento-text); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
          .device-toggle { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
          .device-toggle:hover { background: var(--bento-primary-light); }
          .device-toggle label { flex: 1; font-size: 13px; color: var(--bento-text); cursor: pointer; display: flex; align-items: center; gap: 8px; }
          .device-toggle .dt-val { font-size: 11px; color: var(--bento-text-secondary); min-width: 60px; text-align: right; }
          .toggle-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
          .toggle-switch input { opacity: 0; width: 0; height: 0; }
          .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--bento-border); border-radius: 20px; transition: .2s; }
          .toggle-slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background: #fff; border-radius: 50%; transition: .2s; }
          .toggle-switch input:checked + .toggle-slider { background: var(--bento-primary); }
          .toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }
          .config-input-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
          .config-input-row label { font-size: 12px; color: var(--bento-text-secondary); min-width: 80px; font-weight: 500; }
          .config-input { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 13px; background: var(--bento-card); color: var(--bento-text); font-family: 'Inter', sans-serif; }
          .config-input:focus { border-color: var(--bento-primary); outline: none; box-shadow: 0 0 0 3px var(--bento-primary-light); }
          .device-count { font-size: 11px; color: var(--bento-text-muted); font-weight: 400; }
          @media (max-width: 768px) {
            .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
            .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
            .card { padding: 14px; }
            .grid3 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .grid2 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .stat-value { font-size: 18px; }
            .stat-label { font-size: 10px; }
          }
          @media (max-width: 480px) {
            .tabs { gap: 1px; }
            .tab-btn { padding: 5px 8px; font-size: 11px; }
            .grid3 { grid-template-columns: 1fr; gap: 8px; }
            .grid2 { grid-template-columns: 1fr; gap: 8px; }
            .stat-value { font-size: 16px; }
          }


  </style>

        <div class="card">
          <div class="header">
            <div class="header-icon">\u{1F4E7}</div>
            <div>
              <div class="header-title">${_esc(this._config.title)}</div>
              <div class="header-sub">${recipientDisplay} \u00A0\u2022\u00A0 <span id="price-display" style="cursor:pointer;color:var(--bento-primary);border-bottom:1px dashed var(--bento-primary)" title="${L ? 'Kliknij aby zmieni\u0107' : 'Click to change'}">${_esc(this._tariffCurrency())} ${_esc(this._getTariffLabel())} \u270E</span></div>
            </div>
          </div>
          <div class="tabs">
            <button class="tab-btn ${this._activeTab === 'overview' ? 'active' : ''}" data-tab="overview">\u{1F4CA} ${L ? "Przegląd" : "Overview"}</button>
            <button class="tab-btn ${this._activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">\u{1F4C5} ${L ? "Harmonogram" : "Schedule"}</button>
            <button class="tab-btn ${this._activeTab === 'preview' ? 'active' : ''}" data-tab="preview">\u{1F4CB} ${L ? "Podgląd" : "Preview"}</button>
            <button class="tab-btn ${this._activeTab === 'send' ? 'active' : ''}" data-tab="send">\u{1F4E4} ${L ? "Wyślij teraz" : "Send Now"}</button>
            <button class="tab-btn ${this._activeTab === 'config' ? 'active' : ''}" data-tab="config">\u2699\uFE0F ${L ? "Ustawienia" : "Config"}</button>
          </div>
          <div id="tab-content"></div>
          ${this._tariffDetailsMarkup()}
          ${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-email') ? OWN_SUPPORT_FOOTER : ''}
        </div>
        <div class="toast" id="toast"></div>
      `
      bindEnergySupport(this.shadowRoot, 'ha-energy-email', this._hass?.locale?.language || this._hass?.language);
      this.shadowRoot.querySelectorAll('.tab-btn').forEach(t => {
        t.addEventListener('click', () => {
          this._activeTab = t.dataset.tab;
          history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this._activeTab);
          this.shadowRoot.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
          t.classList.add('active');
          this._renderTab();
        });
      });
      this._renderTab();
      this._bindTariffSettings();
      this._bindEmailEvents();
      this._bindPriceEdit();
      if (this._hass?.user?.is_admin !== true) {
        const price = this.shadowRoot.getElementById('price-display');
        if (price) { price.style.cursor = 'default'; price.style.borderBottom = 'none'; price.removeAttribute('title'); }
      }
    }

    _bindEmailEvents() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      const saveBtn = root.getElementById('email-save');
      const editBtn = root.getElementById('email-edit');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const input = root.getElementById('email-input');
          if (input && input.value && input.value.includes('@')) {
            this._saveRecipient(input.value.trim());
          }
        });
        const input = root.getElementById('email-input');
        if (input) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value && input.value.includes('@')) {
              this._saveRecipient(input.value.trim());
            }
          });
        }
      }
      if (editBtn) {
        editBtn.addEventListener('click', async () => {
          if (!await this._saveToHelper('recipient', '')) return;
          this._detectedRecipient = null;
          this._render();
        });
      }
    }

    _bindPriceEdit() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      const priceEl = root.getElementById('price-display');
      if (!priceEl) return;
      if (Object.hasOwn(this._config, 'tariff_profile') || this._sharedTariffProfile != null) {
        priceEl.addEventListener('click', () => {
          const details = root.querySelector('[data-tariff-details]');
          if (details) { details.open = true; this._bindTariffSettings(); }
        });
        return;
      }
      priceEl.addEventListener('click', (e) => {
        e.preventDefault();
        const L = this._lang === 'pl';
        const cur = this._getAvgRate();
        // Replace the price display with an inline input
        const container = priceEl.parentElement;
        const origHtml = container.innerHTML;
        const inputHtml = `<span style="display:inline-flex;align-items:center;gap:4px">
          <span>${_esc(this._tariffCurrency())}</span>
          <input type="number" id="price-input" value="${cur ?? ''}" step="0.01" min="0" style="width:70px;padding:3px 6px;border:1.5px solid var(--bento-primary);border-radius:4px;font-size:12px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;text-align:center">
          <span>/kWh</span>
          <button id="price-save" class="btn btn-primary" style="padding:3px 10px;font-size:11px;margin:0" aria-label="${L ? 'Zapisz' : 'Save'}">\u2714</button>
          <button id="price-cancel" class="btn" style="padding:3px 8px;font-size:11px;margin:0" aria-label="${L ? 'Anuluj' : 'Cancel'}">\u2716</button>
        </span>`;
        // Find just the price part and replace
        const priceSpan = root.getElementById('price-display');
        priceSpan.outerHTML = inputHtml;
        const input = root.getElementById('price-input');
        const saveBtn = root.getElementById('price-save');
        const cancelBtn = root.getElementById('price-cancel');
        if (input) input.focus();
        const save = async () => {
          const val = parseFloat(input.value);
          if (Number.isFinite(val) && val >= 0) {
            if (!await this._saveToHelper('price', String(val))) return;
            this._config.energy_price = val;
            this._fetchAllPeriodStats().then(() => this._render());
            this._render();
          }
        };
        if (saveBtn) saveBtn.addEventListener('click', save);
        if (cancelBtn) cancelBtn.addEventListener('click', () => this._render());
        if (input) input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') this._render();
        });
      });
    }

    _renderTab() {
      const el = this.shadowRoot.getElementById('tab-content');
      if (!el) return;
      if (this._hass?.user?.is_admin !== true && ['schedule', 'send', 'config'].includes(this._activeTab)) {
        el.innerHTML = `<div class="empty-state" role="status">${this._lang === 'pl' ? 'Tylko administrator może zmieniać ustawienia i wysyłać raporty. Podgląd energii jest dostępny w zakładce Przegląd.' : 'Only administrators can change settings and send reports. Energy data remains available in Overview.'}</div>`;
        return;
      }
      switch (this._activeTab) {
        case 'overview': el.innerHTML = this._tabOverview(); this._attachOverviewEvents(); break;
        case 'schedule': el.innerHTML = this._tabSchedule(); this._attachScheduleEvents(); break;
        case 'preview':  el.innerHTML = this._tabPreview(); break;
        case 'send':     el.innerHTML = this._tabSend(); this._attachSendEvents(); break;
        case 'config':   el.innerHTML = this._tabConfig(); this._attachConfigEvents(); break;
      }
    }

    _updateLiveData() {
      // Preserve forms while the user edits settings or schedules.
      if (!['overview', 'preview'].includes(this._activeTab)) return;
      if (this._discoveryDone && Date.now() - (this._lastPeriodRefresh || 0) > 300000) {
        this._fetchAllPeriodStats().then(() => { if (this.isConnected) this._renderTab(); }).catch(() => {});
        if (this._emailBackendAvailable) this._loadEmailBackendConfig();
      }
      this._renderTab();
    }

    _attachOverviewEvents() {
      this.shadowRoot.querySelectorAll('.overview-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = btn.dataset.period;
          this._overviewPeriod = p;
          this._devicePage = 0;
          // Refresh recorder stats if cache is older than 60s
          const cacheTime = this[`_periodCacheTime_${p}`] || 0;
          if (p !== 'total' && Date.now() - cacheTime > 60000) {
            this._fetchRecorderStats(p).then(() => this._renderTab()).catch(() => {});
          }
          this._renderTab();
        });
      });
      const prevBtn = this.shadowRoot.querySelector('[data-page-prev]');
      if (prevBtn) prevBtn.addEventListener('click', () => { this._devicePage = Math.max(0, (this._devicePage || 0) - 1); this._renderTab(); });
      const nextBtn = this.shadowRoot.querySelector('[data-page-next]');
      if (nextBtn) nextBtn.addEventListener('click', () => { this._devicePage = (this._devicePage || 0) + 1; this._renderTab(); });
    }

    _attachPeriodEvents() {
      this.shadowRoot.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => { this._reportPeriod = btn.dataset.period; this._renderTab(); });
      });
    }

    // --- tabs ---

    _tabOverview() {
      const L = this._lang === 'pl';
      const period = ['day', 'week', 'month'].includes(this._overviewPeriod) ? this._overviewPeriod : 'day';
      const periodLabels = {
        total: { lbl: 'Total', lblPl: '\u0141\u0105cznie', sub: '', subPl: '' },
        day:   { lbl: 'Last 24h', lblPl: 'Ostatnie 24h', sub: 'Last 24h', subPl: 'Ostatnie 24h' },
        week:  { lbl: 'Last 7 days', lblPl: 'Ostatnie 7 dni', sub: 'Last 7 days', subPl: 'Ostatnie 7 dni' },
        month: { lbl: 'Last 30 days', lblPl: 'Ostatnie 30 dni', sub: 'Last 30 days', subPl: 'Ostatnie 30 dni' },
      };
      const pl = periodLabels[period];
      const periodLabel = L ? pl.lblPl : pl.lbl;
      const displayData = this._getOverviewDataForPeriod(period);
      const window = this[`_periodWindow_${period}`];
      const periodNote = window ? `${window.start} — ${window.end}` : '';
      const totalEnergy = displayData.length ? displayData.reduce((sum, d) => sum + d.month, 0) : null;
      const totalCost = displayData.length && displayData.every(d => typeof d.cost === 'number' && Number.isFinite(d.cost))
        ? displayData.reduce((sum, d) => sum + d.cost, 0) : null;
      const maxVal = Math.max(...displayData.map(x => x.month)) || 1;
      const periodBtns = ['day', 'week', 'month'].map(p => {
        const lb = p === 'total' ? (L ? 'Wszystko' : 'All') : p === 'day' ? '24h' : p === 'week' ? '7d' : '30d';
        return `<button class="overview-period-btn" data-period="${p}" style="padding:5px 12px;font-size:11px;border-radius:6px;cursor:pointer;border:1px solid var(--bento-border);background:${period === p ? 'var(--bento-primary)' : 'var(--bento-bg)'};color:${period === p ? '#fff' : 'var(--bento-text)'};font-weight:${period === p ? '600' : '400'};">${lb}</button>`;
      }).join('');
      if (!displayData.length) {
        const status = this[`_periodStatus_${period}`] || 'no_data';
        const messages = L ? {
          no_sources: 'Skonfiguruj źródło importu z sieci w panelu Energia, aby wyświetlić zużycie.',
          no_data: 'Brak statystyk Recorder dla skonfigurowanych źródeł w tym okresie. Sumy będą dostępne, gdy każde źródło dostarczy dane.',
          partial: 'Statystyki okresu są niepełne lub nieprawidłowe. Sprawdź dane każdego źródła w panelu Energia; suma pozostaje niedostępna.',
          unsupported: 'Źródło importu wymaga statystyk energii w Wh, kWh lub MWh. Sprawdź konfigurację źródła w panelu Energia.',
          error: 'Nie udało się odczytać statystyk energii. Sprawdź połączenie z Home Assistant i ponów odczyt.'
        } : {
          no_sources: 'Configure a grid-import source in Energy Dashboard to display usage.',
          no_data: 'No Recorder statistics for the configured sources in this period. Totals become available when every source has data.',
          partial: 'Period statistics are incomplete or invalid. Check every source in Energy Dashboard; the total remains unavailable.',
          unsupported: 'The import source requires energy statistics in Wh, kWh or MWh. Check its Energy Dashboard configuration.',
          error: 'Energy statistics could not be loaded. Check your Home Assistant connection and retry.'
        };
        return `<div class="section-title">${periodLabel}</div><div>${periodBtns}</div>
          <div class="empty-state" role="status">${_esc(messages[status] || messages.error)}${['no_sources', 'partial', 'unsupported'].includes(status) ? ` <a href="/energy">${L ? 'Otwórz panel Energia' : 'Open Energy Dashboard'}</a>` : ''}</div>
          ${periodNote ? `<div class="info-row" style="overflow-wrap:anywhere">${_esc(periodNote)}</div>` : ''}`;
      }
      return `
        ${periodNote ? `<div class="info-row" style="overflow-wrap:anywhere">${_esc(periodNote)}</div>` : ''}
        <div class="info-row">${L ? 'Import z sieci: źródła skonfigurowane w Energy Dashboard.' : 'Grid import: sources configured in Energy Dashboard.'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div class="section-title" style="margin:0;">\u{1F4CA} ${periodLabel}</div>
          <div style="display:flex;gap:4px;">${periodBtns}</div>
        </div>
        <div class="grid3">
          <div class="stat">
            <div class="stat-value" style="color:#F59E0B">${totalEnergy === null ? 'N/A' : totalEnergy.toFixed(1)}</div>
            <div class="stat-label">kWh ${periodLabel}</div>
            <div class="stat-sub">${displayData.length} ${L ? 'źródeł importu' : 'import sources'}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#3B82F6">${this._formatCost(totalCost)}</div>
            <div class="stat-label">${_esc(this._tariffCurrency())} ${L ? 'Koszt' : 'Cost'}</div>
            <div class="stat-sub">@ ${_esc(this._getTariffLabel())}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#10B981">${displayData.length > 0 ? _esc(displayData[0].name.split(' ').slice(0,2).join(' ')) : '-'}</div>
            <div class="stat-label">${L ? 'Największy import' : 'Largest Import'}</div>
            <div class="stat-sub">${displayData.length > 0 ? displayData[0].month.toFixed(1) + ' kWh' : ''}</div>
          </div>
        </div>
        <div class="section-title">\u26A1 ${L ? 'Import według źródła' : 'Import by Source'}</div>
        ${(() => {
          const page = this._devicePage || 0;
          const perPage = this._devicesPerPage || 20;
          const totalPages = Math.ceil(displayData.length / perPage);
          const pageData = displayData.slice(page * perPage, (page + 1) * perPage);
          const rows = pageData.map(d => {
            const pct = maxVal > 0 ? (d.month / maxVal * 100) : 0;
            const diff = d.month - d.lastMonth;
            const diffStr = d.lastMonth > 0 && diff !== 0 ? `<span class="${diff > 0 ? 'trend-up' : 'trend-down'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)} kWh</span>` : '';
            const entityInfo = d.entity_id ? `<span style="font-size:10px;color:var(--bento-text-muted)" title="${_esc(d.entity_id)}">${_esc((d.entity_id.split('.')[1] || d.entity_id).substring(0,20))}</span>` : '';
            return `<div class="device-row" title="${_esc(d.entity_id || d.name)}">
              <div class="device-name">${_esc(d.name)} ${entityInfo}</div>
              <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
              <div class="device-val">${d.month.toFixed(1)} kWh</div>
              <div style="font-size:11px;color:var(--bento-text-secondary);min-width:60px;text-align:right">${diffStr}</div>
            </div>`;
          }).join('');
          const pagination = totalPages > 1 ? `
            <div class="pagination-row">
              <button class="pagination-btn" data-page-prev ${page === 0 ? 'disabled' : ''}>\u2190 ${L ? 'Poprzednia' : 'Prev'}</button>
              <span class="pagination-info">${L ? 'Strona' : 'Page'} ${page + 1} / ${totalPages}</span>
              <button class="pagination-btn" data-page-next ${page >= totalPages - 1 ? 'disabled' : ''}>${L ? 'Nast\u0119pna' : 'Next'} \u2192</button>
            </div>` : '';
          return rows + pagination;
        })()}`;
    }

    _tabSchedule() {
      const L = this._lang === 'pl';
      const cadences = ['daily', 'weekly', 'monthly'];
      if (this._emailBackendAvailable) {
        return `
          ${this._renderSmtpSection()}
          <div class="info-row">\u{1F4BE}\u00A0 ${L ? 'Raporty energii wymagają HA Tools Email 2.1.2+. Harmonogramy są zapisywane w integracji.' : 'Energy reports require HA Tools Email 2.1.2+. Schedules are stored in the integration.'}</div>
          ${cadences.map(c => this._renderBackendScheduleCard(c)).join('')}
        `;
      }
      return this._renderLegacyScheduleTab();
    }

    _renderBackendScheduleCard(cadence) {
      const L = this._lang === 'pl';
      const labels = {
        daily: ['\u2600\uFE0F', L ? 'Raport dzienny' : 'Daily Report', L ? 'Codziennie' : 'Daily'],
        weekly: ['\u{1F4C6}', L ? 'Raport tygodniowy' : 'Weekly Report', L ? 'Co tydzie\u0144' : 'Weekly'],
        monthly: ['\u{1F4C8}', L ? 'Raport miesi\u0119czny' : 'Monthly Report', L ? 'Co miesi\u0105c' : 'Monthly']
      };
      const [icon, title, cadenceLabel] = labels[cadence] || labels.daily;
      const schedule = this._getEnergySchedule(cadence);
      const time = schedule?.time || this._defaultScheduleTime(cadence);
      const recipients = Array.isArray(schedule?.recipients) && schedule.recipients.length ? schedule.recipients.join(', ') : this._getRecipient();
      const enabled = schedule ? schedule.enabled !== false : true;
      const busy = !!this._scheduleBusy[cadence];
      const status = schedule
        ? (enabled ? '<span class="badge badge-ok">\u2705 ' + (L ? 'Aktywny' : 'Active') + '</span>' : '<span class="badge badge-er">\u274C ' + (L ? 'Wyłączony' : 'Disabled') + '</span>')
        : '<span class="badge badge-wa">\u2795 ' + (L ? 'Nie utworzony' : 'Not Created') + '</span>';
      return `<div class="schedule-card" data-schedule-card="${cadence}">
        <div class="schedule-row"><div class="schedule-name">${icon} ${title}</div>${status}</div>
        <div class="schedule-meta"><span>${cadenceLabel}</span><span>${L ? 'Raport energii' : 'Energy report'}</span>${schedule?.id ? `<span>${_esc(schedule.id)}</span>` : ''}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;margin-top:10px">
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Godzina' : 'Time'}<input class="config-input" type="time" id="schedule-time-${cadence}" value="${_esc(time)}" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Odbiorcy' : 'Recipients'}<input class="config-input" type="text" id="schedule-recipients-${cadence}" value="${_esc(recipients || '')}" placeholder="name@example.com, other@example.com" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:600;white-space:nowrap"><input type="checkbox" id="schedule-enabled-${cadence}" ${enabled ? 'checked' : ''}> ${L ? 'W\u0142\u0105czony' : 'Enabled'}</label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary schedule-save" data-cadence="${cadence}" ${busy || this._emailBackendReportsUnsupported ? 'disabled' : ''}>${schedule ? (L ? 'Aktualizuj' : 'Update') : (L ? 'Utw\u00F3rz' : 'Create')}</button>
          <button class="btn schedule-send" data-cadence="${cadence}" ${busy || !this._hasHaToolsEmail() ? 'disabled' : ''}>${L ? 'Wy\u015Blij teraz' : 'Send now'}</button>
          <button class="btn schedule-delete" data-cadence="${cadence}" ${busy || !schedule ? 'disabled' : ''}>${L ? 'Usu\u0144' : 'Delete'}</button>
        </div>
      </div>`;
    }

    _renderLegacyScheduleCard(cadence) {
      const L = this._lang === 'pl';
      const labels = {
        daily: ['\u2600\uFE0F', L ? 'Raport dzienny' : 'Daily Report'],
        weekly: ['\u{1F4C6}', L ? 'Raport tygodniowy' : 'Weekly Report'],
        monthly: ['\u{1F4C8}', L ? 'Raport miesi\u0119czny' : 'Monthly Report']
      };
      const [icon, title] = labels[cadence] || labels.daily;
      const schedule = this._legacySchedules?.[cadence] || { kind: 'energy_report', cadence, time: this._defaultScheduleTime(cadence), recipients: [], enabled: false };
      const recipients = Array.isArray(schedule.recipients) && schedule.recipients.length ? schedule.recipients.join(', ') : this._getRecipient();
      return `<div class="schedule-card" data-schedule-card="${cadence}">
        <div class="schedule-row"><div class="schedule-name">${icon} ${title}</div><span class="badge ${schedule.enabled ? 'badge-ok' : 'badge-wa'}">${schedule.enabled ? '\u2705 localStorage' : '\u26AB localStorage'}</span></div>
        <div class="schedule-meta">${L ? 'Fallback lokalny. Nie tworzy harmonogramu po stronie HA.' : 'Local fallback. Does not create a Home Assistant server schedule.'}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;margin-top:10px">
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Godzina' : 'Time'}<input class="config-input" type="time" id="schedule-time-${cadence}" value="${_esc(schedule.time || this._defaultScheduleTime(cadence))}" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Odbiorcy' : 'Recipients'}<input class="config-input" type="text" id="schedule-recipients-${cadence}" value="${_esc(recipients || '')}" placeholder="name@example.com" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:600;white-space:nowrap"><input type="checkbox" id="schedule-enabled-${cadence}" ${schedule.enabled ? 'checked' : ''}> ${L ? 'W\u0142\u0105czony lokalnie' : 'Enabled locally'}</label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary schedule-save" data-cadence="${cadence}">${L ? 'Zapisz lokalnie' : 'Save locally'}</button>
          <button class="btn schedule-send" data-cadence="${cadence}">${L ? 'Wy\u015Blij teraz' : 'Send now'}</button>
          <button class="btn schedule-delete" data-cadence="${cadence}">${L ? 'Wyczy\u015B\u0107' : 'Clear'}</button>
        </div>
      </div>`;
    }

    _renderLegacyScheduleTab() {
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const service = this._detectedService || this._config?.notify_service || '';
      const dailyId = 'automation.send_daily_energy_report';
      const weeklyId = 'automation.send_weekly_energy_report';
      const monthlyId = 'automation.send_monthly_energy_report';
      const dailyState = this._state(dailyId, 'missing');
      const weeklyState = this._state(weeklyId, 'missing');
      const monthlyState = this._state(monthlyId, 'missing');
      const exists = (s) => s !== 'missing' && s !== 'unavailable';
      const badge = (state) => {
        if (state === 'on') return '<span class="badge badge-ok">\u2705 ' + (L ? 'Aktywny' : 'Active') + '</span>';
        if (state === 'off') return '<span class="badge badge-er">\u274C ' + (L ? 'Wyłączony' : 'Disabled') + '</span>';
        return '<span class="badge badge-wa">\u2795 ' + (L ? 'Nie utworzony' : 'Not Created') + '</span>';
      };
      const recipientInfo = recipient ? `\u{1F4E7} ${recipient}` : `\u{1F4E7} <i>${L ? 'Brak — ustaw email powy\u017Cej' : 'None — set email above'}</i>`;
      const sd = this._scheduleDefaults;
      const dayNames = L
        ? { mon: 'Poniedzia\u0142ek', tue: 'Wtorek', wed: '\u015Aroda', thu: 'Czwartek', fri: 'Pi\u0105tek', sat: 'Sobota', sun: 'Niedziela' }
        : { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
      const dayOptions = Object.entries(dayNames).map(([k, v]) => `<option value="${k}" ${sd.weekly_day === k ? 'selected' : ''}>${v}</option>`).join('');
      const weeklyDayLabel = dayNames[sd.weekly_day] || dayNames.mon;
      const scheduleCard = (icon, nameL, nameE, state, timeLabel, enableId, disableId, createId, timeInputId, timeValue, extraInputHtml) => {
        const name = L ? nameL : nameE;
        const ex = exists(state);
        return `<div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">${icon} ${name}</div>${badge(state)}</div>
          <div class="schedule-meta"><span>\u{1F552} ${timeLabel}</span><span>${recipientInfo}</span></div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
            <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Godzina' : 'Time'}:</label>
            <input type="time" id="${timeInputId}" value="${timeValue}" style="padding:5px 10px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;">
            ${extraInputHtml || ''}
          </div>
          <div class="btn-row">
            ${ex ? (state === 'on'
              ? `<button class="btn btn-ok" id="${disableId}">${L ? 'Wy\u0142\u0105cz' : 'Disable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`
              : `<button class="btn btn-primary" id="${enableId}">${L ? 'W\u0142\u0105cz' : 'Enable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`)
              : `<button class="btn btn-primary" id="${createId}">\u2795 ${L ? 'Utw\u00F3rz automatyzacj\u0119' : 'Create Automation'}</button>`}
          </div>
        </div>`;
      };
      return `
        ${this._renderSmtpSection()}
        <div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L
          ? 'Tryb legacy: harmonogramy lokalne zapisuj\u0105 si\u0119 tylko w tej przegl\u0105darce. Stare automatyzacje HA pozostaj\u0105 dost\u0119pne poni\u017Cej.'
          : 'Legacy mode: local schedules are saved only in this browser. Existing HA automation controls remain available below.'}</div>
        ${!recipient && !service ? `<div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L
          ? '<b>Brak adresu email.</b> Ustaw email w polu powy\u017Cej lub domy\u015Blnego odbiorc\u0119 w <a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>.'
          : '<b>No email recipient.</b> Set an email in the field above or a default recipient in <a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>.'}</div>` : ''}
        ${['daily', 'weekly', 'monthly'].map(c => this._renderLegacyScheduleCard(c)).join('')}
        <div class="section-title">${L ? 'Starsze automatyzacje HA' : 'Legacy HA Automations'}</div>
        ${scheduleCard(
          '\u2600\uFE0F', 'Raport dzienny', 'Daily Report', dailyState,
          `${L ? 'Codziennie o' : 'Every day at'} ${sd.daily}`,
          'enable-daily', 'disable-daily', 'create-daily', 'time-daily', sd.daily, ''
        )}
        ${scheduleCard(
          '\u{1F4C6}', 'Raport tygodniowy', 'Weekly Report', weeklyState,
          `${weeklyDayLabel} ${L ? 'o' : 'at'} ${sd.weekly_time}`,
          'enable-weekly', 'disable-weekly', 'create-weekly', 'time-weekly', sd.weekly_time,
          `<label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500;margin-left:8px">${L ? 'Dzie\u0144' : 'Day'}:</label>
           <select id="day-weekly" style="padding:5px 10px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif">${dayOptions}</select>`
        )}
        ${scheduleCard(
          '\u{1F4C8}', 'Raport miesi\u0119czny', 'Monthly Report', monthlyState,
          `${L ? '1. dzie\u0144 miesi\u0105ca o' : '1st of month at'} ${sd.monthly_time}`,
          'enable-monthly', 'disable-monthly', 'create-monthly', 'time-monthly', sd.monthly_time, ''
        )}
        <div style="margin-top:12px;padding:12px 16px;background:rgba(59,130,246,0.08);border-left:3px solid var(--bento-primary,#3B82F6);border-radius:6px;font-size:13px;color:var(--bento-text);">
          <strong>\u2139\uFE0F Info:</strong> ${this._helpersReady
            ? (L
              ? 'Ustawienia (email, serwis, godziny) są zapisywane w Home Assistant i działają na każdym urządzeniu.'
              : 'Settings (email, service, times) are stored in Home Assistant and work across all your devices.')
            : (L
              ? 'Helpery HA niedostępne. Ustawienia (email, serwis, godziny) są zapisywane tylko w tej przeglądarce.'
              : 'HA helpers unavailable. Settings (email, service, times) are saved only in this browser.')}
        </div>`;
    }

    _backendPreviewHtml() {
      const L = this._lang === 'pl';
      const labels = L ? ['Raport dzienny', 'Raport tygodniowy', 'Raport miesięczny'] : ['Daily Report', 'Weekly Report', 'Monthly Report'];
      return `<div class="section-title">${L ? 'Podgląd raportów email' : 'Email Report Previews'}</div>` +
        ['daily', 'weekly', 'monthly'].map((cadence, index) => {
          const data = this._backendReportPreviews?.[cadence];
          if (!data) return `<div class="preview-box"><h3>${labels[index]}</h3><div role="status">${L ? 'Podgląd serwera niedostępny. Zaktualizuj HA Tools Email.' : 'Server preview unavailable. Update HA Tools Email.'}</div></div>`;
          const ready = data.status === 'ready' && typeof data.total_kwh === 'number' && Number.isFinite(data.total_kwh);
          const rows = ready && Array.isArray(data.devices) ? data.devices : [];
          const message = data.status === 'partial'
            ? (L ? 'Niepełne dane — suma okresu niedostępna.' : 'Incomplete data — period total unavailable.')
            : (L ? 'Brak danych energii dla tego okresu.' : 'No energy data available for this period.');
          return `<div class="preview-box" style="margin-bottom:14px">
            <h3>${labels[index]}</h3>
            <div>${L ? 'Import z sieci: źródła Energy Dashboard' : 'Grid import: Energy Dashboard sources'}</div>
            <div style="overflow-wrap:anywhere">${_esc(data.period?.start || '—')} → ${_esc(data.period?.end || '—')}</div>
            <div>${L ? 'Ukończone godziny Recorder; ten sam model co wysyłka i harmonogram.' : 'Completed Recorder hours; same model as sending and schedules.'}</div>
            ${ready ? '' : `<div role="status">${message}</div>`}
            <div>${ready ? data.total_kwh.toFixed(1) : 'N/A'} kWh · ${this._formatCost(data.total_cost)} ${_esc(this._tariffCurrency())}</div>
            ${data.total_cost === null ? `<div>${L ? 'Taryfa nieskonfigurowana' : 'Tariff not configured'}</div>` : ''}
            <table class="preview-table"><thead><tr><th>${L ? 'Źródło' : 'Source'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'}</th></tr></thead>
            <tbody>${rows.map(row => `<tr><td>${_esc(row.name)}</td><td>${typeof row.kwh === 'number' && Number.isFinite(row.kwh) ? row.kwh.toFixed(2) : 'N/A'}</td><td>${this._formatCost(row.cost)}</td></tr>`).join('')}</tbody></table>
          </div>`;
        }).join('');
    }

    _tabPreview() {
      const L = this._lang === 'pl';
      if (!this._discoveryDone) {
        return `<div class="empty-state"><div class="big"><span class="spinner" style="width:32px;height:32px;border-width:3px;border-color:var(--bento-primary);border-top-color:transparent;"></span></div><div class="title">${L ? '\u0141adowanie danych...' : 'Loading data...'}</div></div>`;
      }
      if (this._emailBackendAvailable && !this._emailBackendReportsUnsupported) return this._backendPreviewHtml();
      const devices = this._devices();
      const autoDevices = this._discoveredDevices || [];
      const isAuto = devices.length === 0 && autoDevices.length > 0;
      const today = new Date().toISOString().split('T')[0];
      const recipient = this._getRecipient();
      const recipientLine = recipient || '—';
      const periods = [
        { key: 'day', icon: '\u2600\uFE0F', titleL: 'Raport dzienny', titleE: 'Daily Report', rangeL: 'Ostatnie 24h', rangeE: 'Last 24h' },
        { key: 'week', icon: '\u{1F4C6}', titleL: 'Raport tygodniowy', titleE: 'Weekly Report', rangeL: 'Ostatnie 7 dni', rangeE: 'Last 7 days' },
        { key: 'month', icon: '\u{1F4C8}', titleL: 'Raport miesi\u0119czny', titleE: 'Monthly Report', rangeL: 'Ostatnie 30 dni', rangeE: 'Last 30 days' },
      ];
      const getDevData = period => this._getAutoDataForPeriod(period).map(d => ({
        name: d.name, current: d.month, previous: null, cost: d.cost, hasPeriod: true
      }));
      const renderReport = (p) => {
        const title = L ? p.titleL : p.titleE;
        const window = this[`_periodWindow_${p.key}`];
        const range = window ? `${_esc(window.start)} → ${_esc(window.end)}` : (L ? p.rangeL : p.rangeE);
        const devData = getDevData(p.key);
        const hasData = devData.length > 0 && devData.every(d => typeof d.current === 'number' && Number.isFinite(d.current));
        const totalEnergy = hasData ? devData.reduce((s, d) => s + d.current, 0) : null;
        const totalCost = hasData && devData.every(d => typeof d.cost === 'number' && Number.isFinite(d.cost)) ? devData.reduce((s, d) => s + d.cost, 0) : null;
        const top5 = devData.slice(0, 5);
        const isPeriodData = devData.length > 0 && devData[0].hasPeriod;
        const periodNote = !hasData ? `<div role="status">${L ? 'Brak kompletnych danych dla tego okresu.' : 'No complete data available for this period.'}</div>` : '';
        return `<div class="preview-box" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px">${p.icon} ${title} \u2013 ${today}</h3>
          ${periodNote}
          <div style="font-size:12px;color:var(--bento-text-secondary);margin-bottom:10px">\u{1F4E7} ${_esc(recipientLine)} \u00A0\u2022\u00A0 ${range} \u00A0\u2022\u00A0 ${devData.length} ${L ? 'źródeł' : 'sources'}</div>
          <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap">
            <div><span style="font-size:18px;font-weight:700;color:#F59E0B">${totalEnergy === null ? 'N/A' : totalEnergy.toFixed(1)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">kWh</span></div>
            <div><span style="font-size:18px;font-weight:700;color:#3B82F6">${this._formatCost(totalCost)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">${_esc(this._tariffCurrency())}</span></div>
          </div>
          <table class="preview-table">
            <thead><tr><th>${L ? 'Źródło importu' : 'Import source'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'} (${_esc(this._tariffCurrency())})</th></tr></thead>
            <tbody>${top5.map(d => `<tr><td>${_esc(d.name)}</td><td>${d.current === null ? 'N/A' : d.current.toFixed(2)}</td><td>${this._formatCost(d.cost)}</td></tr>`).join('')}
            ${devData.length > 5 ? `<tr><td colspan="3" style="text-align:center;color:var(--bento-text-secondary);font-size:11px">+ ${devData.length - 5} ${L ? 'więcej źródeł' : 'more sources'}...</td></tr>` : ''}</tbody>
          </table>
        </div>`;
      };
      return `

        <div class="section-title" style="margin-top:0">\u{1F4CB} ${L ? 'Podgl\u0105d raport\u00F3w email' : 'Email Report Previews'}</div>
        ${periods.map(p => renderReport(p)).join('')}
        <div style="font-size:11px;color:var(--bento-text-secondary);margin-top:4px">${L ? 'Podgląd skonfigurowanych źródeł Energy Dashboard; ukończone godziny Recorder.' : 'Configured Energy Dashboard source preview; completed Recorder hours.'}</div>`;
    }

    _tabSend() {
      const L = this._lang === 'pl';
      const manualLabel = L ? 'Ręcznie' : 'Manual';
      const sendingLabel = L ? 'Wysyłam...' : 'Sending...';
      const lastSentLabel = L ? 'Ostatnio wysłano: ' : 'Last sent: ';
      const smtpConfig = this._renderSmtpSection();
      const canSend = this._hasHaToolsEmail();
      const backendReports = this._emailBackendAvailable && !this._emailBackendReportsUnsupported;
      const quickDisabled = this._sending || (backendReports ? true : !canSend);
      const modeText = backendReports
        ? (L ? 'Wyślij raport energii przez HA Tools Email 2.1.2+.' : 'Send an energy report using HA Tools Email 2.1.2+.')
        : (L ? 'R\u0119cznie wy\u015Blij raport energii poprzez ha_tools_email.' : 'Manually trigger an energy report via ha_tools_email.');
      return `
        <div class="info-row">\u{1F4E4}\u00A0 ${modeText}</div>
        ${smtpConfig}
        ${(this._emailBackendAvailable || this._hasLegacyHaToolsEmail()) ? `<div style="font-size:12px;color:var(--bento-text-secondary);margin:16px 0 12px;padding:10px;background:var(--bento-primary-light);border-radius:var(--bento-radius-xs)">${L ? '💡 Konfiguracja SMTP: <a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '💡 SMTP settings: <a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</div>` : ''}
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u2600\uFE0F ${L ? 'Wy\u015Blij raport dzienny' : 'Send Daily Report Now'}</div><span class="badge badge-pr">${manualLabel}</span></div>
          <div id="last-daily" class="last-sent">${this._lastSent.daily ? lastSentLabel + this._lastSent.daily : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-daily" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? `<span class="spinner"></span>${sendingLabel}` : (L ? '\u2600\uFE0F Wyślij raport dzienny' : '\u2600\uFE0F Send Daily')}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4C6} ${L ? 'Wy\u015Blij raport tygodniowy' : 'Send Weekly Report Now'}</div><span class="badge badge-pr">${manualLabel}</span></div>
          <div id="last-weekly" class="last-sent">${this._lastSent.weekly ? lastSentLabel + this._lastSent.weekly : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-weekly" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? `<span class="spinner"></span>${sendingLabel}` : (L ? '\u{1F4E4} Wyślij raport tygodniowy' : '\u{1F4E4} Send Weekly')}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4C8} ${L ? 'Wy\u015Blij raport miesi\u0119czny' : 'Send Monthly Report Now'}</div><span class="badge badge-pr">${manualLabel}</span></div>
          <div id="last-monthly" class="last-sent">${this._lastSent.monthly ? lastSentLabel + this._lastSent.monthly : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-monthly" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? `<span class="spinner"></span>${sendingLabel}` : (L ? '\u{1F4C8} Wyślij raport miesięczny' : '\u{1F4C8} Send Monthly')}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4E7} ${L ? 'Szybkie podsumowanie' : 'Quick Summary'}</div><span class="badge badge-ok">${L ? 'Natychmiast' : 'Instant'}</span></div>
          <div class="schedule-meta">${backendReports
            ? (L ? 'Tryb backendu u\u017Cywa wysy\u0142ki daily/weekly/monthly przez send_now.' : 'Backend mode uses daily/weekly/monthly send_now actions.')
            : (L ? 'Tekstowe podsumowanie aktualnych danych energii.' : 'Plain-text summary of current energy stats.')}</div>
          <div id="last-quick" class="last-sent">${this._lastSent.quick ? lastSentLabel + this._lastSent.quick : ''}</div>
          <div class="btn-row"><button class="btn btn-ok" id="send-quick" ${quickDisabled ? 'disabled' : ''}>\u26A1 ${L ? 'Wy\u015Blij' : 'Send Quick Summary'}</button></div>
        </div>`;
    }

    _attachSendEvents() {
      const root = this.shadowRoot;
      const sendDaily = root.getElementById('send-daily');
      const sendWeekly = root.getElementById('send-weekly');
      const sendMonthly = root.getElementById('send-monthly');
      const sendQuick = root.getElementById('send-quick');
      if (sendDaily) sendDaily.addEventListener('click', () => this._sendReport('daily'));
      if (sendWeekly) sendWeekly.addEventListener('click', () => this._sendReport('weekly'));
      if (sendMonthly) sendMonthly.addEventListener('click', () => this._sendReport('monthly'));
      if (sendQuick) sendQuick.addEventListener('click', () => this._sendReport('quick'));
    }

    _tabConfig() {
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const price = this._getAvgRate();
      const currency = this._tariffCurrency();

      return `
        <div class="config-section">
          <div class="config-section-title">\u{1F4E7} ${L ? 'Ustawienia email' : 'Email Settings'}</div>
          <div class="config-input-row">
            <label>${L ? 'Odbiorca' : 'Recipient'}:</label>
            <input type="email" id="cfg-email" class="config-input" value="${_esc(recipient)}" placeholder="your@email.com" style="flex:1">
            <button class="btn btn-primary" id="cfg-email-save" style="padding:6px 14px;font-size:12px">${L ? 'Zapisz' : 'Save'}</button>
          </div>
          <div class="config-input-row">
            <label>${L ? 'Stawka' : 'Price'}:</label>
            <input type="number" id="cfg-price" class="config-input" value="${_esc(price ?? '')}" step="0.01" min="0" style="width:80px">
            <span style="font-size:12px;color:var(--bento-text-secondary)">${_esc(currency)}/kWh</span>
            <button class="btn btn-primary" id="cfg-price-save" style="padding:6px 14px;font-size:12px">${L ? 'Zapisz' : 'Save'}</button>
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">${L ? 'Źródła raportu' : 'Report sources'}</div>
          <p>${L ? 'Raport obejmuje wszystkie źródła importu z sieci skonfigurowane w Energy Dashboard. Liczniki urządzeń i eksport nie są dodawane do sumy.' : 'Reports include every grid-import source configured in Energy Dashboard. Appliance counters and exports are excluded from the total.'}</p>
          <a href="/energy">${L ? 'Otwórz Energy Dashboard' : 'Open Energy Dashboard'}</a>
        </div>

        <div class="config-section">
          <div class="config-section-title">\u{1F4BE} ${L ? 'Zapis ustawie\u0144' : 'Storage Info'}</div>
          <div style="font-size:12px;color:var(--bento-text-secondary);line-height:1.8">
            ${this._helpersReady
              ? `\u2705 ${L ? 'Ustawienia zapisywane w Home Assistant (input_text helpers). Dzia\u0142a na ka\u017Cdym urz\u0105dzeniu.' : 'Settings stored in Home Assistant (input_text helpers). Works across all devices.'}`
              : `\u26A0\uFE0F ${L ? 'Helpery HA niedost\u0119pne. Ustawienia zapisywane lokalnie w przegl\u0105darce.' : 'HA helpers unavailable. Settings saved locally in browser.'}`}
          </div>
        </div>`;
    }

    _attachConfigEvents() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      // Email save
      const emailSave = root.getElementById('cfg-email-save');
      if (emailSave) emailSave.addEventListener('click', async () => {
        const input = root.getElementById('cfg-email');
        if (input && input.value && input.value.includes('@')) {
          if (!await this._saveRecipient(input.value.trim())) return;
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Email zapisany' : 'Email saved'));
        }
      });
      // Price save
      const priceSave = root.getElementById('cfg-price-save');
      if (priceSave) priceSave.addEventListener('click', async () => {
        const input = root.getElementById('cfg-price');
        const val = parseFloat(input?.value);
        if (Number.isFinite(val) && val >= 0) {
          if (!await this._saveToHelper('price', String(val))) return;
          this._config.energy_price = val;
          this._fetchAllPeriodStats().then(() => this._render());
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Stawka zapisana' : 'Price saved'));
          this._render();
        }
      });
    }

    _attachScheduleEvents() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      const btnSmtpTest = root.getElementById('btn-smtp-test');
      if (btnSmtpTest) { btnSmtpTest.addEventListener('click', () => this._testSmtp()); }
      root.querySelectorAll('.schedule-save').forEach(btn => btn.addEventListener('click', () => this._saveSchedule(btn.dataset.cadence)));
      root.querySelectorAll('.schedule-delete').forEach(btn => btn.addEventListener('click', () => this._deleteSchedule(btn.dataset.cadence)));
      root.querySelectorAll('.schedule-send').forEach(btn => btn.addEventListener('click', () => this._sendScheduleNow(btn.dataset.cadence)));
      // Time inputs — save on change
      const timeInputs = [
        ['time-daily', 'daily_time', 'daily'],
        ['time-weekly', 'weekly_time', 'weekly_time'],
        ['time-monthly', 'monthly_time', 'monthly_time'],
      ];
      timeInputs.forEach(([id, helperKey, schedKey]) => {
        const input = root.getElementById(id);
        if (input) input.addEventListener('change', async () => {
          if (!await this._saveToHelper(helperKey, input.value)) { input.value = this._scheduleDefaults[schedKey]; return; }
          this._scheduleDefaults[schedKey] = input.value;
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Godzina zapisana' : 'Time saved'));
        });
      });
      const daySelect = root.getElementById('day-weekly');
      if (daySelect) daySelect.addEventListener('change', async () => {
        if (!await this._saveToHelper('weekly_day', daySelect.value)) { daySelect.value = this._scheduleDefaults.weekly_day; return; }
        this._scheduleDefaults.weekly_day = daySelect.value;
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Dzie\u0144 zapisany' : 'Day saved'));
      });
      // Enable/disable existing automations
      const ids = [['enable-daily','disable-daily','automation.send_daily_energy_report'],['enable-weekly','disable-weekly','automation.send_weekly_energy_report'],['enable-monthly','disable-monthly','automation.send_monthly_energy_report']];
      ids.forEach(([en,dis,eid]) => {
        const eBtn = root.getElementById(en); const dBtn = root.getElementById(dis);
        if (eBtn) eBtn.addEventListener('click', () => this._toggleAuto(eid, true));
        if (dBtn) dBtn.addEventListener('click', () => this._toggleAuto(eid, false));
      });
      // Create automation buttons
      const createBtns = [
        ['create-daily', 'daily'],
        ['create-weekly', 'weekly'],
        ['create-monthly', 'monthly'],
      ];
      createBtns.forEach(([id, type]) => {
        const btn = root.getElementById(id);
        if (btn) btn.addEventListener('click', () => this._createAutomation(type));
      });
      // Update automation buttons
      const updateBtns = [
        ['update-create-daily', 'daily'],
        ['update-create-weekly', 'weekly'],
        ['update-create-monthly', 'monthly'],
      ];
      updateBtns.forEach(([id, type]) => {
        const btn = root.getElementById(id);
        if (btn) btn.addEventListener('click', () => this._createAutomation(type, true));
      });
    }

    async _saveSchedule(cadence) {
      if (this._emailBackendAvailable) return this._saveBackendSchedule(cadence);
      return this._saveLegacySchedule(cadence);
    }

    async _deleteSchedule(cadence) {
      if (this._emailBackendAvailable) return this._deleteBackendSchedule(cadence);
      return this._deleteLegacySchedule(cadence);
    }

    async _sendScheduleNow(cadence) {
      if (this._emailBackendAvailable) return this._sendReportViaBackend(cadence);
      return this._sendReport(cadence);
    }

    async _saveBackendSchedule(cadence) {
      if (!this._requireAdmin()) return;
      if (!cadence) return;
      if (this._emailBackendReportsUnsupported) {
        this._showToast('⚠️ ' + (this._lang === 'pl' ? 'Zaktualizuj HA Tools Email do 2.1.2+, aby zapisywać harmonogramy energii.' : 'Update HA Tools Email to 2.1.2+ to save energy schedules.'));
        return;
      }
      const existing = this._getEnergySchedule(cadence);
      const time = this.shadowRoot?.getElementById('schedule-time-' + cadence)?.value || this._defaultScheduleTime(cadence);
      const recipients = this._scheduleRecipients(cadence);
      const enabled = !!this.shadowRoot?.getElementById('schedule-enabled-' + cadence)?.checked;
      this._scheduleBusy[cadence] = true;
      this._render();
      try {
        const resp = await this._emailWs('set_schedule', {
          action: 'upsert',
          schedule: { id: existing?.id, kind: 'energy_report', cadence, time, recipients, enabled }
        });
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : (resp?.schedule ? [...this._emailSchedules.filter(s => s.id !== resp.schedule.id), resp.schedule] : this._emailSchedules);
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram zapisany' : 'Schedule saved'));
      } catch (e) {
        this._showToast('\u274C ' + (this._lang === 'pl' ? 'Nie uda\u0142o si\u0119 zapisa\u0107 harmonogramu: ' : 'Could not save schedule: ') + (e?.message || 'Unknown error'));
      } finally {
        this._scheduleBusy[cadence] = false;
        await this._refreshBackendSchedules(false);
        this._render();
      }
    }

    async _deleteBackendSchedule(cadence) {
      if (!this._requireAdmin()) return;
      const existing = this._getEnergySchedule(cadence);
      if (!existing?.id) return;
      this._scheduleBusy[cadence] = true;
      this._render();
      try {
        const resp = await this._emailWs('set_schedule', { action: 'delete', schedule_id: existing.id });
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : this._emailSchedules.filter(s => s.id !== existing.id);
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram usuni\u0119ty' : 'Schedule deleted'));
      } catch (e) {
        this._showToast('\u274C ' + (this._lang === 'pl' ? 'Nie uda\u0142o si\u0119 usun\u0105\u0107 harmonogramu: ' : 'Could not delete schedule: ') + (e?.message || 'Unknown error'));
      } finally {
        this._scheduleBusy[cadence] = false;
        this._render();
      }
    }

    _saveLegacySchedule(cadence) {
      if (!this._requireAdmin()) return;
      if (!cadence) return;
      const time = this.shadowRoot?.getElementById('schedule-time-' + cadence)?.value || this._defaultScheduleTime(cadence);
      const recipients = this._scheduleRecipients(cadence);
      const enabled = !!this.shadowRoot?.getElementById('schedule-enabled-' + cadence)?.checked;
      this._legacySchedules = this._legacySchedules || {};
      this._legacySchedules[cadence] = { kind: 'energy_report', cadence, time, recipients, enabled };
      this._saveLegacySchedules();
      this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram zapisany lokalnie' : 'Schedule saved locally'));
      this._render();
    }

    _deleteLegacySchedule(cadence) {
      if (!this._requireAdmin()) return;
      if (!cadence) return;
      this._legacySchedules = this._legacySchedules || {};
      this._legacySchedules[cadence] = { kind: 'energy_report', cadence, time: this._defaultScheduleTime(cadence), recipients: [], enabled: false };
      this._saveLegacySchedules();
      this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram lokalny wyczyszczony' : 'Local schedule cleared'));
      this._render();
    }

    // --- Automation creation ---

    async _createAutomation(type, update = false) {
      if (!this._requireAdmin()) return;
      if (this._emailBackendAvailable) return this._saveBackendSchedule(type);
      this._showToast(this._lang === 'pl' ? 'Harmonogram raportów Recorder wymaga HA Tools Email 2.1.2 lub nowszego.' : 'Recorder report schedules require HA Tools Email 2.1.2 or newer.');
    }

    // --- HA service calls ---

    async _toggleAuto(entity_id, enable) {
      if (!this._requireAdmin()) return;
      if (!this._hass) return;
      try {
        await this._hass.callService('automation', enable ? 'turn_on' : 'turn_off', { entity_id });
        this._showToast(`\u2705 Automation ${enable ? 'enabled' : 'disabled'}`);
        this._schedule(() => this._renderTab(), 800);
      } catch (e) { this._showToast('\u274C Error: ' + (e.message || 'Unknown error')); }
    }

    async _sendReportViaBackend(cadence) {
      if (!this._requireAdmin()) return;
      if (this._emailBackendReportsUnsupported) return this._sendReport(cadence);
      if (!this._hass || this._sending) return;
      const L = this._lang === 'pl';
      if (!['daily', 'weekly', 'monthly'].includes(cadence)) return;
      if (!this._emailBackendConfig?.smtp_configured) {
        this._showToast('\u274C ' + (L ? 'SMTP nie skonfigurowany w backendzie ha_tools_email' : 'SMTP is not configured in ha_tools_email backend'));
        return;
      }
      const recipients = this._scheduleRecipients(cadence);
      this._sending = true;
      this._scheduleBusy[cadence] = true;
      this._renderTab(); this._attachSendEvents();
      try {
        await this._emailWs('send_now', { kind: 'energy_report', cadence, recipients });
        this._lastSent[cadence] = new Date().toLocaleString((this._lang === 'pl' ? 'pl-PL' : 'en-US'), { hour12: false });
        this._showToast('\u2705 ' + (L ? 'Raport wys\u0142any przez backend' : 'Report sent by backend'));
      } catch (e) {
        this._showToast('\u274C Send failed: ' + (e?.message || 'Unknown error'));
      } finally {
        this._sending = false;
        this._scheduleBusy[cadence] = false;
        this._renderTab(); this._attachSendEvents();
      }
    }

    async _sendReport(type) {
      if (!this._requireAdmin()) return;
      if (!this._hass || this._sending) return;
      if (this._emailBackendAvailable && !this._emailBackendReportsUnsupported && ['daily', 'weekly', 'monthly'].includes(type)) {
        await this._sendReportViaBackend(type);
        return;
      }
      this._sending = true;
      this._renderTab(); this._attachSendEvents();
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const price = this._getAvgRate();
      const currency = this._tariffCurrency();
      const dateStr = new Date().toISOString().split('T')[0];
      const nowStr = new Date().toLocaleString((this._lang === 'pl' ? 'pl-PL' : 'en-US'), { hour12: false });
      try {
        if (!this._hasHaToolsEmail()) throw new Error(L ? 'Integracja HA Tools Email nie jest zainstalowana. Zainstaluj j\u0105 z HACS i ustaw SMTP w Konfiguruj.' : 'The HA Tools Email integration is not installed. Install it from HACS and set up SMTP in Configure.');
        // Get device data — fetch from recorder for period reports
        const periodMap = { daily: 'day', weekly: 'week', monthly: 'month', quick: 'week' };
        const periodKey = periodMap[type] || 'week';
        const periodLabels = {
          daily: L ? 'Ostatnie 24h' : 'Last 24 hours',
          weekly: L ? 'Ostatnie 7 dni' : 'Last 7 days',
          monthly: L ? 'Ostatnie 30 dni' : 'Last 30 days',
          quick: L ? 'Podsumowanie' : 'Summary'
        };
        // Fetch fresh recorder stats
        await this._fetchRecorderStats(periodKey);
        const cached = this[`_periodCache_${periodKey}`];
        if (this[`_periodStatus_${periodKey}`] !== 'ready' || !cached?.length) {
          throw new Error(L ? 'Brak kompletnych danych Recorder dla tego okresu.' : 'Complete Recorder data is unavailable for this period.');
        }
        const devices = [...cached].sort((a, b) => b.month - a.month);
        const window = this[`_periodWindow_${periodKey}`];
        const windowText = `${window.start} → ${window.end}`;

        const totalKwh = devices.reduce((s, d) => s + (d.month || 0), 0);
        const rowCosts = devices.map(d => d.cost ?? this._cost(d.month));
        const totalCost = rowCosts.every(cost => typeof cost === 'number' && Number.isFinite(cost)) ? rowCosts.reduce((sum, cost) => sum + cost, 0) : null;
        const topDevice = devices[0];
        // Build HTML email
        const typeName = { daily: L ? 'Dzienny' : 'Daily', weekly: L ? 'Tygodniowy' : 'Weekly', monthly: L ? 'Miesi\u0119czny' : 'Monthly', quick: L ? 'Podsumowanie' : 'Summary' }[type] || type;
        const deviceRows = devices.map((d, i) => {
          const kwh = (d.month || 0).toFixed(2);
          const cost = this._formatCost(d.cost ?? this._cost(d.month));
          const pct = totalKwh > 0 ? ((d.month / totalKwh) * 100).toFixed(0) : 0;
          const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
          return `<tr style="background:${bg}"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">${_esc(d.name)}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${kwh}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right">${cost}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">${pct}%</td></tr>`;
        }).join('');
        const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 28px;color:#fff">
            <h1 style="margin:0;font-size:22px;font-weight:700">\u26A1 ${L ? 'Raport energii' : 'Energy Report'} \u2014 ${typeName}</h1>
            <p style="margin:6px 0 0;opacity:.85;font-size:14px">${dateStr} \u2022 ${_esc(windowText)} \u2022 ${devices.length} ${L ? 'źródeł' : 'sources'}</p>
          </div>
          <div style="padding:20px 28px">
            <div style="display:flex;gap:16px;margin-bottom:20px">
              <div style="flex:1;background:#fef3c7;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;color:#d97706">${totalKwh.toFixed(1)}</div>
                <div style="font-size:12px;color:#92400e;margin-top:2px">kWh</div>
              </div>
              <div style="flex:1;background:#dbeafe;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;color:#1d4ed8">${this._formatCost(totalCost)}</div>
                <div style="font-size:12px;color:#1e40af;margin-top:2px">${_esc(currency)}</div>
              </div>
              <div style="flex:1;background:#d1fae5;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:16px;font-weight:700;color:#047857">${topDevice ? _esc(topDevice.name.split(' ').slice(0,2).join(' ')) : '-'}</div>
                <div style="font-size:12px;color:#065f46;margin-top:2px">${L ? 'Top' : 'Top'}: ${topDevice ? topDevice.month.toFixed(1) : 0} kWh</div>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
              <thead><tr style="background:#f1f5f9">
                <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${L ? 'Źródło importu' : 'Import source'}</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">kWh</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${_esc(currency)}</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">%</th>
              </tr></thead>
              <tbody>${deviceRows}
              <tr style="background:#f1f5f9;font-weight:700">
                <td style="padding:12px 14px;font-size:14px">${L ? '\u0141\u0105cznie' : 'Total'}</td>
                <td style="padding:12px 14px;text-align:right">${totalKwh.toFixed(2)}</td>
                <td style="padding:12px 14px;text-align:right">${this._formatCost(totalCost)}</td>
                <td style="padding:12px 14px;text-align:right">100%</td>
              </tr></tbody>
            </table>
            <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">${_esc(this._getTariffLabel())} \u2022 HA Energy Email Card</p>
          </div>
        </div>`;
        const title = `\u26A1 ${typeName} ${L ? 'raport energii' : 'Energy Report'} \u2013 ${dateStr}`;
        const plainText = `${typeName} ${L ? 'raport energii' : 'Energy Report'} - ${dateStr}\n${windowText}\n${L ? '\u0141\u0105cznie' : 'Total'}: ${totalKwh.toFixed(2)} kWh / ${this._formatCost(totalCost)} ${currency}\n${devices.map(d => `${d.name}: ${(d.month||0).toFixed(2)} kWh`).join('\n')}`;
        // Built-in SMTP via ha_tools_email
        await this._sendViaHaToolsEmail(recipient || '', title, plainText, html);
        this._lastSent[type] = nowStr;
        this._showToast(`\u2705 ${typeName} ${L ? 'wys\u0142any!' : 'sent!'}`);
      } catch (e) { this._showToast('\u274C Error: ' + (e.message || 'Check HA logs')); }
      finally { this._sending = false; this._renderTab(); this._attachSendEvents(); }
    }

    // --- HA Tools Email (built-in SMTP) ---

    _hasLegacyHaToolsEmail() {
      return !!this._hass?.services?.ha_tools_email?.send;
    }

    _hasHaToolsEmail() {
      if (this._emailBackendAvailable) return !!this._emailBackendConfig?.smtp_configured && (!this._emailBackendReportsUnsupported || this._hasLegacyHaToolsEmail());
      return this._hasLegacyHaToolsEmail();
    }

    async _sendViaHaToolsEmail(to, subject, body, html) {
      if (!this._requireAdmin()) return;
      const hass = this._hass;
      if (!hass) throw new Error('Home Assistant is not ready');
      if (!this._hasLegacyHaToolsEmail()) throw new Error(this._lang === 'pl' ? 'Brak us\u0142ugi ha_tools_email.send' : 'ha_tools_email.send service is unavailable');
      const data = { subject, body };
      if (html) data.html = html;
      if (to) data.to = to;
      await hass.callService('ha_tools_email', 'send', data);
    }

    // --- SMTP Configuration via ha_tools_email ---

    _renderSmtpSection() {
      const L = this._lang === 'pl';
      const statusBadge = this._smtpStatus
        ? (this._smtpStatus.ok
          ? `<span class="badge badge-ok">\u2705 Test OK ${_esc(this._smtpStatus.time || '')}</span>`
          : `<span class="badge badge-er">\u274C ${_esc(this._smtpStatus.error || '')}</span>`)
        : '';
      if (this._emailBackendAvailable) {
        const cfg = this._emailBackendConfig || {};
        const compatibilityNotice = this._emailBackendReportsUnsupported
          ? `<div class="smtp-detail">${L ? 'Zaktualizuj HA Tools Email do 2.1.2+ dla harmonogramów energii. Ręczna wysyłka wymaga usługi ha_tools_email.send i korzysta z danych Recorder.' : 'Update HA Tools Email to 2.1.2+ for energy schedules. Manual sending requires ha_tools_email.send and uses Recorder data.'}</div>`
          : '';
        const scheduleCount = (this._emailSchedules || []).filter(s => s.kind === 'energy_report').length;
        if (cfg.smtp_configured) {
          const server = cfg.server ? `${_esc(cfg.server)}:${_esc(cfg.port || '')}` : (L ? 'serwer SMTP skonfigurowany' : 'SMTP server configured');
          const sender = cfg.sender ? _esc(cfg.sender) : (L ? 'nadawca z konfiguracji' : 'configured sender');
          const recipient = cfg.default_recipient ? _esc(cfg.default_recipient) : (L ? 'brak domy\u015Blnego odbiorcy' : 'no default recipient');
          return `<div class="smtp-section">
            <div class="smtp-header"><div class="smtp-icon">\u2705</div><div>
              <div class="smtp-title">${L ? 'SMTP skonfigurowany (ha_tools_email v2)' : 'SMTP Configured (ha_tools_email v2)'}</div>
              ${compatibilityNotice}
              <div class="smtp-detail">${server} \u2022 ${sender} \u2022 ${recipient}</div>
              <div class="smtp-detail">${L ? 'Harmonogramy na backendzie: ' : 'Server schedules: '}${scheduleCount}</div>
              <div class="smtp-detail">${L ? 'Zmie\u0144 w' : 'Change in'} <b>${L ? '<a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '<a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</b></div>
            </div></div>
            <div class="smtp-actions" style="margin-top:12px">
              <button class="btn btn-primary" id="btn-smtp-test" ${this._smtpTesting ? 'disabled' : ''}>${this._smtpTesting ? (L ? 'Wysy\u0142am...' : 'Sending...') : (L ? 'Test SMTP' : 'Test SMTP')}</button>
              ${statusBadge}
            </div>
          </div>`;
        }
        return `<div class="smtp-section smtp-missing">
          <div class="smtp-header"><div class="smtp-icon">\u26A0\uFE0F</div><div>
            <div class="smtp-title">${L ? 'SMTP nie skonfigurowany w ha_tools_email' : 'SMTP Not Configured in ha_tools_email'}</div>
            <div class="smtp-detail">${L ? 'Ustaw serwer, login i has\u0142o w' : 'Set the server, login and password in'} <b>${L ? '<a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '<a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</b></div>
          </div></div>
        </div>`;
      }
      if (this._hasLegacyHaToolsEmail()) {
        return `<div class="smtp-section">
          <div class="smtp-header"><div class="smtp-icon">\u2705</div><div>
            <div class="smtp-title">${L ? 'SMTP skonfigurowany (legacy ha_tools_email)' : 'SMTP Configured (legacy ha_tools_email)'}</div>
            <div class="smtp-detail">${L ? 'U\u017Cywam us\u0142ug Home Assistant ha_tools_email.send/test.' : 'Using Home Assistant ha_tools_email.send/test services.'}</div>
          </div></div>
          <div class="smtp-actions" style="margin-top:12px">
            <button class="btn btn-primary" id="btn-smtp-test" ${this._smtpTesting ? 'disabled' : ''}>${this._smtpTesting ? (L ? 'Wysy\u0142am...' : 'Sending...') : (L ? 'Wy\u015Blij testowy email' : 'Send Test Email')}</button>
            ${statusBadge}
          </div>
        </div>`;
      }
      return `<div class="smtp-section smtp-missing">
        <div class="smtp-header"><div class="smtp-icon">\u26A0\uFE0F</div><div>
          <div class="smtp-title">${this._emailBackendMissing
            ? (L ? 'Integracja HA Tools Email nie jest zainstalowana lub dodana' : 'HA Tools Email integration is not installed or added')
            : (L ? 'Backend email niedostępny' : 'Email backend unavailable')}</div>
          <div class="smtp-detail">${this._emailBackendMissing
            ? (L ? 'Zainstaluj HA Tools Email z <a href="/hacs">HACS</a>, następnie <a href="/config/integrations">Ustawienia → Urządzenia i usługi → Dodaj integrację → HA Tools Email</a>, a dopiero potem ustaw SMTP w Konfiguruj.' : 'Install HA Tools Email from <a href="/hacs">HACS</a>, then <a href="/config/integrations">Settings → Devices &amp; services → Add integration → HA Tools Email</a>, then set up SMTP in Configure.')
            : (L ? 'Sprawdź połączenie z Home Assistant i status HA Tools Email w <a href="/config/integrations">Ustawienia → Urządzenia i usługi</a>.' : 'Check the Home Assistant connection and HA Tools Email status in <a href="/config/integrations">Settings → Devices &amp; services</a>.')}</div>
        </div></div>
      </div>`;
    }

    async _testSmtp() {
      if (!this._requireAdmin()) return;
      if (!this._hass) return;
      if (this._emailBackendReportsUnsupported && !this._hasLegacyHaToolsEmail()) {
        this._smtpStatus = { ok: false, error: (this._lang === 'pl' ? 'Zaktualizuj HA Tools Email do 2.1.2+' : 'Update HA Tools Email to 2.1.2+') };
        this._showToast('⚠️ ' + this._smtpStatus.error);
        this._render();
        return;
      }
      if (this._emailBackendAvailable && !this._emailBackendConfig?.smtp_configured) {
        this._smtpStatus = { ok: false, error: (this._lang === 'pl' ? 'SMTP nie skonfigurowany' : 'SMTP not configured') };
        this._showToast('\u274C ' + this._smtpStatus.error);
        this._render();
        return;
      }
      if (this._emailBackendAvailable && !this._hasLegacyHaToolsEmail()) {
        this._smtpStatus = { ok: true, service: 'ha_tools_email/ws', time: new Date().toLocaleTimeString((this._lang === 'pl' ? 'pl-PL' : 'en-US')) };
        this._showToast('\u2139\uFE0F ' + (this._lang === 'pl' ? 'Backend SMTP jest skonfigurowany. U\u017Cyj Send Now, aby wys\u0142a\u0107 raport testowy.' : 'Backend SMTP is configured. Use Send Now to send a test report.'));
        this._render();
        return;
      }
      if (!this._hasLegacyHaToolsEmail()) { this._showToast('\u274C ' + (this._lang === 'pl' ? 'ha_tools_email nie zainstalowany' : 'ha_tools_email not installed')); return; }
      this._smtpTesting = true;
      this._render();
      try {
        const hass = this._hass;
        await hass.callService('ha_tools_email', 'test', {});
        this._smtpStatus = { ok: true, service: 'ha_tools_email', time: new Date().toLocaleTimeString((this._lang === 'pl' ? 'pl-PL' : 'en-US')) };
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Testowy email wysy\u0142any!' : 'Test email sent!'));
      } catch (e) {
        this._smtpStatus = { ok: false, error: e.message || 'Check HA logs' };
        this._showToast('\u274C SMTP test failed: ' + this._smtpStatus.error);
      } finally {
        this._smtpTesting = false;
        this._render();
      }
    }

    _showToast(msg) {
      const toast = this.shadowRoot.getElementById('toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      this._schedule(() => toast.classList.remove('show'), 3500);
    }

    disconnectedCallback() {
      this._timers.forEach(timer => clearTimeout(timer));
      this._timers.clear();
      this._renderScheduled = false;
    }

    _schedule(callback, delay) {
      const timer = setTimeout(() => {
        this._timers.delete(timer);
        if (this.isConnected) callback();
      }, delay);
      this._timers.add(timer);
      return timer;
    }

    setActiveTab(tabId) {
      this._activeTab = tabId;
      this._render();
    }
  }

  if (!customElements.get('ha-energy-email')) customElements.define('ha-energy-email', HAEnergyEmail);
  // Energy Optimizer is the canonical owner of ha-energy-email. The alias below is always
  // free, so the HA Tools Email & Reports compatibility shim can delegate to this card
  // whichever bundle Home Assistant happens to load first.
  if (!customElements.get('ha-energy-optimizer-email')) customElements.define('ha-energy-optimizer-email', class extends HAEnergyEmail {});
  class HaEnergyEmailEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
    }
    setConfig(config) {
      this._config = { ...config };
      this._render();
    }
    _dispatch() {
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    _render() {
      this.shadowRoot.innerHTML = `
        <style>
              :host { display:block; padding:16px; }
              h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
              input { outline:none; transition:border-color .2s; }
              input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
          </style>
        <h3>Energy Email Reports</h3>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
                <input type="text" id="cf_title" value="${_esc(this._config?.title || 'Energy Email Reports')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency || this._hass?.config?.currency || '')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Energy price</label>
                <input type="text" id="cf_energy_price" value="${_esc(this._config?.energy_price ?? '')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
      `;
          const f_title = this.shadowRoot.querySelector('#cf_title');
          if (f_title) f_title.addEventListener('input', (e) => {
            this._config = { ...this._config, title: e.target.value };
            this._dispatch();
          });
          const f_currency = this.shadowRoot.querySelector('#cf_currency');
          if (f_currency) f_currency.addEventListener('input', (e) => {
            this._config = { ...this._config, currency: e.target.value };
            this._dispatch();
          });
          const f_energy_price = this.shadowRoot.querySelector('#cf_energy_price');
          if (f_energy_price) f_energy_price.addEventListener('input', (e) => {
            this._config = { ...this._config, energy_price: e.target.value };
            this._dispatch();
          });
    }
    connectedCallback() { this._render(); }
  }
  if (!customElements.get('ha-energy-email-editor')) { customElements.define('ha-energy-email-editor', HaEnergyEmailEditor); }


  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === 'ha-energy-email')) window.customCards.push({ type: 'ha-energy-email', name: 'Energy Email Reports', description: 'Send energy reports via email. Auto-discovers energy sensors.', preview: true });
})();

