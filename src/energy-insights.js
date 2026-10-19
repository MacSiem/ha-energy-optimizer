// --- Bundled card: ha-energy-insights (v3.3.0 bundle)
(function() {
  'use strict';

  // Component-local persistence retains this card's existing localStorage keys.
  const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-insights] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

  const OWN_SUPPORT_FOOTER = ENERGY_OPTIMIZER_DONATE_HTML;
  const LOCAL_BENTO_CSS = `.donate-section[data-source="own-card"]{margin:16px 20px 20px;padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);background:var(--bento-primary-light);color:var(--bento-text)}.donate-section[data-source="own-card"] .donate-text{display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px}.donate-section[data-source="own-card"] .donate-buttons{display:flex;flex-wrap:wrap;gap:8px}.donate-section[data-source="own-card"] a{color:var(--bento-primary);font-weight:700;text-decoration:none}`;

  // Component-local XSS protection: never reads from or publishes a global helper.
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"\']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// HA_FORMAT_UI_START
// Localized presentation; raw values remain available to callers for details/export.
function createFormatUi(language = 'en', timeZone = 'UTC', preferences = {}) {
  const hourCycle = preferences.hourCycle || 'h23';
  const dateLanguage = preferences.dateLanguage || language;
  const clockLanguage = preferences.clockLanguage || language;
  const stamp = value => typeof value === 'number' ? (Number.isFinite(value) ? value : NaN) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
  const localized = (value, options, locale = language) => {
    const time = stamp(value);
    if (!Number.isFinite(time)) return null;
    try { return new Intl.DateTimeFormat(locale, {timeZone, ...options}).format(time); } catch (_) { return null; }
  };
  const clock = (value, withOffset = false) => localized(value, {hour:'2-digit', minute:'2-digit', hourCycle, ...(withOffset ? {timeZoneName:'shortOffset'} : {})}, clockLanguage);
  const date = (value, short = false) => localized(value, {day:'numeric', month:'short', ...(short ? {} : {year:'numeric'})}, dateLanguage);
  // A calendar date has no instant or display zone. Use the selected date
  // locale but preserve its literal day, including historical tariff validity.
  const calendarDate = (value, short = false) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const instant = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 10) !== value) return null;
    try { return new Intl.DateTimeFormat(dateLanguage, {timeZone:'UTC', day:'numeric', month:'short', ...(short ? {} : {year:'numeric'})}).format(instant); }
    catch (_) { return null; }
  };
  const pointLabel = value => localized(value, {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hourCycle, timeZoneName:'shortOffset'}, dateLanguage);
  const chartLabels = (values, resolution = 'hour') => {
    const showDate = resolution === 'day' || values.length > 1 && stamp(values.at(-1)) - stamp(values[0]) >= 86400000;
    const labels = values.map(value => resolution === 'day' ? date(value, true) : `${showDate ? date(value, true) + ' ' : ''}${clock(value)}`);
    const counts = new Map();
    for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
    return labels.map((label, index) => counts.get(label) < 2 ? label : resolution === 'day' ? pointLabel(values[index])
      : `${showDate ? date(values[index], true) + ' ' : ''}${clock(values[index], true)}`);
  };
  // Compact 24-hour axis notation follows the display zone; full point labels
  // keep the user's clock/date preferences. Never move or discard measurements.
  const chartTicks = (values, resolution = 'hour') => {
    const labels = chartLabels(values, resolution);
    const shortHourly = resolution === 'hour' && values.length > 1 && stamp(values.at(-1)) - stamp(values[0]) <= 26 * 3600000;
    if (!shortHourly) return [...new Set([0, Math.floor((values.length-1)/2), values.length-1])]
      .filter(index => index >= 0 && index < values.length).map(index => ({index, label:labels[index]}));
    const parts = new Intl.DateTimeFormat('en-GB-u-nu-latn', {timeZone, hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
    const ticks = [];
    values.forEach((value, index) => {
      const time = stamp(value);
      if (!Number.isFinite(time)) return;
      const fields = Object.fromEntries(parts.formatToParts(time).map(part => [part.type, part.value]));
      if (Number(fields.hour) % 3 !== 0) return;
      const label = localized(value, {hour:'2-digit', ...(fields.minute === '00' ? {} : {minute:'2-digit'}), hourCycle:'h23'});
      ticks.push({index, label});
    });
    if (!ticks.length) return values.length ? [{index:0, label:labels[0]}] : [];
    const counts = new Map();
    for (const tick of ticks) counts.set(tick.label, (counts.get(tick.label) || 0) + 1);
    return ticks.map(tick => counts.get(tick.label) === 1 ? tick : {...tick, label:clock(values[tick.index], true)});
  };
  const key = JSON.stringify([language, timeZone, hourCycle, dateLanguage, clockLanguage]);
  const numbers = new Intl.NumberFormat(language);
  // Producer Decimal strings carry exact measurement/pricing precision. Keep
  // that precision in Data/details instead of Intl's default three places.
  // Explicit display options and older numeric projections retain their rules.
  const decimals = new Intl.NumberFormat(language, {maximumFractionDigits:100});
  const plurals = new Intl.PluralRules(language);
  const count = (value, forms) => `${numbers.format(value)} ${forms[plurals.select(value)] || forms.other}`;
  const dateTime = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return null;
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return null;
    try { return new Intl.DateTimeFormat(dateLanguage, {timeZone, dateStyle:'medium', timeStyle:'short', hourCycle}).format(new Date(time)); }
    catch (_) { return null; }
  };
  const range = (from, to) => {
    const first = Date.parse(from), last = Date.parse(to);
    if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) return null;
    try {
      const day = new Intl.DateTimeFormat(dateLanguage, {timeZone, dateStyle:'medium'});
      const clock = new Intl.DateTimeFormat(clockLanguage, {timeZone, hour:'2-digit', minute:'2-digit', hourCycle});
      return day.format(first) === day.format(last)
        ? `${day.format(first)} (${clock.format(first)}–${clock.format(last)})`
        : `${dateTime(from)} – ${dateTime(to)}`;
    } catch (_) { return null; }
  };
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const periodMarkup = ({start, end, label, source, measured, expected, unit, details = '', sourceTimeZone = ''}) => {
    const local = range(start, end);
    if (!local) return '';
    const coverage = typeof measured === 'number' && Number.isFinite(measured) && typeof expected === 'number' && Number.isFinite(expected)
      ? `${numbers.format(measured)}/${numbers.format(expected)} ${unit}` : '';
    const pl = String(language).startsWith('pl');
    return `<div class="energy-period-v4" style="overflow-wrap:anywhere"><p data-energy-period-summary>${[source, label, local, coverage, timeZone].filter(Boolean).map(escape).join(' · ')}</p><details data-energy-period-details data-energy-period-key="${escape(start + '|' + end)}"><summary style="min-height:44px;box-sizing:border-box;padding:12px 0;display:list-item;list-style-position:inside;cursor:pointer">${pl ? 'Źródło i szczegóły czasu' : 'Source and time details'}</summary><p>${escape(details)}</p>${sourceTimeZone && sourceTimeZone !== timeZone ? `<p>${escape(pl ? 'Strefa pomiarów i granic okresu' : 'Measurement calendar time zone')}: ${escape(sourceTimeZone)}</p>` : ''}<p>UTC: ${escape(start)} — ${escape(end)}</p></details></div>`;
  };
  const capturePeriods = (root, previous, current) => {
    if (!previous || ['epoch','connection','user'].some(key => previous[key] !== current[key])) return [];
    return [...root.querySelectorAll('[data-energy-period-key]')].map(element => ({
      key:element.dataset.energyPeriodKey, open:element.open, focused:root.activeElement === element.querySelector('summary')
    }));
  };
  const restorePeriods = (root, records) => {
    for (const element of root.querySelectorAll('[data-energy-period-key]')) {
      const record = records.find(row => row.key === element.dataset.energyPeriodKey);
      if (!record) continue;
      element.open = record.open;
      if (record.focused) element.querySelector('summary')?.focus({preventScroll:true});
    }
  };
  return {language, dateLanguage, clockLanguage, hourCycle, timeZone, key, clock, date, calendarDate, pointLabel, chartLabels, chartTicks, number:(value, options)=>options ? new Intl.NumberFormat(language, options).format(value) : (typeof value === 'string' ? decimals : numbers).format(value), count, dateTime, range, periodMarkup, capturePeriods, restorePeriods};
}
// Presentation follows the HA profile; measurement and tariff calendars remain separate.
createFormatUi.forHass = hass => {
  const locale = hass?.locale || {};
  const systemLanguage = typeof navigator !== 'undefined' ? navigator.language : undefined;
  const language = locale.language || hass?.language || systemLanguage || 'en';
  const validZone = value => {
    if (typeof value !== 'string' || !(value === 'UTC' || value.includes('/')) || /^[+-]/.test(value)) return null;
    try { new Intl.DateTimeFormat('en', {timeZone:value}).format(0); return value; } catch (_) { return null; }
  };
  let systemZone, systemLocale;
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions();
    systemZone = validZone(resolved.timeZone);
    // Device region can differ from navigator's preferred content language.
    systemLocale = resolved.locale;
  } catch (_) {}
  const systemRegion = systemLocale || systemLanguage || language;
  const serverZone = validZone(hass?.config?.time_zone);
  const timeZone = (locale.time_zone === 'server' ? serverZone : systemZone) || serverZone || 'UTC';
  const clockLanguage = locale.time_format === 'system' ? systemRegion : language;
  const hourCycle = locale.time_format === '12' ? 'h12' : locale.time_format === '24' ? 'h23'
    : new Intl.DateTimeFormat(clockLanguage, {hour:'numeric'}).resolvedOptions().hourCycle;
  return createFormatUi(language, timeZone, {hourCycle, clockLanguage, dateLanguage:locale.date_format === 'system' ? systemRegion : language});
};
// Node tests use the canonical factory; vendored cards keep it local.
// HA_FORMAT_UI_END

  const _insightsCopyV3 = value => {
    const clone = value == null ? value : JSON.parse(JSON.stringify(value));
    const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item; };
    return freeze(clone);
  };

  /**
   * HA Energy Insights - Bento Light Mode Panel Tool
   * Energy monitoring with cost tracking, device breakdown, and efficiency recommendations
   * v2.0.0 - Converted from Lovelace Card to Panel Tool Pattern
   */

  class HAEnergyInsights extends HTMLElement {
    static getConfigElement() { return document.createElement('ha-energy-insights-editor'); }
    static getStubConfig() { return { type: 'custom:ha-energy-insights', title: 'Energy Insights' }; }
    constructor() {
      super();
      this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
      this.attachShadow({ mode: 'open' });
      this._toolId = this.tagName.toLowerCase().replace('ha-', '');

      // State fields
      this._hass = null;
      this._activeTab = 'overview';
      this._data = null;
      this._loading = true;
      this._error = null;
      this._charts = {};
      this._chartJsReady = false;
      this._lastRenderTime = 0;
      this._renderScheduled = false;
      this._firstHassRender = false;
      this._domBuilt = false;
      this._lastDataHash = '';
      this._lastDataFetch = 0;
      this._timers = new Set();
      this._insightDeviceState = { status: 'not_read', raw: null };
      this._insightDeviceRange = 'weekly';
      this._insightDeviceDetails = new Set();
      this._insightChartStates = {};
      this._insightRenderEpoch = 0;

      // Configuration
      this._config = {
        title: 'Energy Insights',
        days_history: 7
      };
    }

    // ===== TRANSLATIONS (i18n) =====
    static get _translations() {
      return {
        en: {
          energyInsights: 'Energy Insights',
          overview: 'Overview',
          daily: 'Daily',
          weekly: 'Weekly',
          monthly: 'Monthly',
          tips: 'Tips',
          today: 'Today',
          thisWeek: 'Last 7 days',
          thisMonth: 'Last 30 days',
          trend: 'Trend',
          vsLastWeek: 'vs previous 7 days',
          topDevices: 'Top 5 Devices',
          noSensors: 'No supported grid import statistics in Energy Dashboard. Configure an energy source in Home Assistant.',
          noSeries: 'One or more configured grid import sources have no recent Recorder statistics. Totals are unavailable until every source has data.',
          hourlyConsumption: 'Hourly Consumption (today)',
          dailyConsumption: 'Daily Consumption (7 days)',
          monthlyConsumption: 'Daily Consumption (30 days)',
          refresh: 'Refresh',
          loading: 'Loading energy data...',
          error: 'Failed to load energy data',

          // Recommendations
          highConsumption: 'Consumption significantly higher than usual — check devices and heating.',
          slightlyHigher: 'Consumption slightly higher than last week — monitor usage.',
          lowerThanUsual: 'Consumption lower than usual — great savings!',
          highToday: 'High consumption today — check high-power devices.',
          veryLow: 'Very low consumption today. Everything looks good!',
          normalUsage: 'Energy consumption is normal. Continue monitoring.',

          // Tips
          sensorSetup: 'Use template sensors to track appliance energy consumption.',
          costTracking: 'Update energy_price with your local electricity rate.',
          peakHours: 'Monitor peak consumption hours to optimize usage.',
          deviceBreakdown: 'Compare device-level energy consumption to identify top consumers.',
          efficientAppliances: 'Replace old appliances with ENERGY STAR certified models.',

          partOfHATools: 'Part of HA Tools ecosystem',
          openToolsPanel: 'Open Tools Panel',
        },
        pl: {
          energyInsights: 'Analiza Energii',
          overview: 'Przegląd',
          daily: 'Dziś',
          weekly: 'Tydzień',
          monthly: 'Miesiąc',
          tips: 'Porady',
          today: 'Dzisiaj',
          thisWeek: 'Ostatnie 7 dni',
          thisMonth: 'Ostatnie 30 dni',
          trend: 'Trend',
          vsLastWeek: 'vs poprzednie 7 dni',
          topDevices: 'Top 5 Urządzeń',
          noSensors: 'Brak obsługiwanych statystyk importu sieciowego w panelu Energia. Skonfiguruj źródło energii w HA.',
          noSeries: 'Co najmniej jedno skonfigurowane źródło importu nie ma aktualnych statystyk Recorder. Sumy będą dostępne, gdy każde źródło dostarczy dane.',
          hourlyConsumption: 'Zużycie Godzinowe (dzisiaj)',
          dailyConsumption: 'Zużycie Dzienne (7 dni)',
          monthlyConsumption: 'Zużycie Dzienne (30 dni)',
          refresh: 'Odśwież',
          loading: 'Wczytywanie danych energii...',
          error: 'Nie udało się załadować danych energii',

          // Recommendations
          highConsumption: 'Zużycie znacznie wyższe niż zwykle — sprawdź urządzenia i ogrzewanie.',
          slightlyHigher: 'Zużycie nieco wyższe niż w poprzednim tygodniu — monitoruj zużycie.',
          lowerThanUsual: 'Zużycie niższe niż zwykle — świetne oszczędności!',
          highToday: 'Wysokie zużycie dzisiaj — sprawdź urządzenia o dużej mocy.',
          veryLow: 'Bardzo niskie zużycie dzisiaj. Wszystko wygląda dobrze!',
          normalUsage: 'Zużycie energii w normie. Kontynuuj monitorowanie.',

          // Tips
          sensorSetup: 'Użyj sensorów template do śledzenia zużycia energii przez urządzenia.',
          costTracking: 'Zaktualizuj energy_price rzeczywistą ceną energii.',
          peakHours: 'Monitoruj godziny szczytowego zużycia aby zoptymalizować użytkowanie.',
          deviceBreakdown: 'Porównuj zużycie energii na poziomie urządzeń.',
          efficientAppliances: 'Zastąp stare urządzenia certyfikowanymi urządzeniami ENERGY STAR.',

          partOfHATools: 'Część ekosystemu HA Tools',
          openToolsPanel: 'Otwórz Panel Narzędzi',
        }
      };
    }

    _t(key) {
      const lang = String(this._hass?.locale?.language || this._hass?.language || localStorage.getItem('ha-tools-language') || 'en').startsWith('pl') ? 'pl' : 'en';
      const T = HAEnergyInsights._translations;
      return (T[lang] || T['en'])[key] || T['en'][key] || key;
    }

    setConfig(config) {
      this._config = { ...this._config, ...(config || {}) };
      this._observeTariffContextV3();
      this._syncSupport();
    }
    _getTariffV3(proposed) {
      const host = this._getTariffHostV3();
      return arguments.length ? host.model(proposed) : this._sharedTariffNeedsConfirmationV3() ? host.model({ schema: 0 }) : host.model();
    }
    _getTariffHostV3() {
      if (this._tariffHostController) return this._tariffHostController;
      // HA_TARIFF_V3_START sha256=4cae4321521e9b2fdb27cc0d4918e3a5b9e8d8a44770f1862c52369028f0190d
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
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) return false;
    const stamp = Date.parse(value + 'T00:00:00Z');
    return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
  };
  const monthDay = value => typeof value === 'string' && /^\d{2}-\d{2}$/.test(value) && dateKey('2000-' + value);
  const timestamp = value => {
    let stamp;
    if (finite(value)) stamp = Math.trunc(value);
    else {
      // One shared calendar/offset contract; Date.parse alone normalizes Feb 30
      // and 24:00, unlike the server. Milliseconds truncate in both consumers.
      const match = typeof value === 'string' && value.match(/^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d+)?)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/);
      if (!match || !dateKey(match[1])) return NaN;
      stamp = Date.parse(value);
    }
    return finite(stamp) && stamp >= -62135596800000 && stamp <= 253402300799999 ? stamp : NaN;
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
  const classification = (value, path) => { if (value != null && !['cheap','expensive','mixed'].includes(value)) fail(path, 'invalid_classification'); return value ?? null; };
  const zones = new Map();
  if (!Array.isArray(p.zones) || !p.zones.length || p.zones.length > 32) fail('zones', 'invalid_zones');
  for (const [i, z] of (Array.isArray(p.zones) ? p.zones : []).entries()) {
    const path = `zones.${i}`;
    if (!record(z) || typeof z.id !== 'string' || !/^[\w-]{1,64}$/.test(z.id) || zones.has(z.id)) {
      fail(path, 'invalid_zone'); continue;
    }
    zones.set(z.id, { zone: z.id, label: typeof z.label === 'string' ? z.label : z.id,
      energyRate: energyRate(z.energyRate, path + '.energyRate'), variableRate: variableRate(z.variableRate, path + '.variableRate'), classification: classification(z.classification, path + '.classification') });
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
          variableRate: variableRate(r?.variableRate, `dynamic.intervals.${i}.variableRate`), classification: classification(r?.classification, `dynamic.intervals.${i}.classification`) };
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
    const zoneIds = new Set([first.zone]);
    for (const stamp of checkpoints) {
      const next = rateAt(stamp);
      if (!next.available) return { ...next, from, to };
      if (!samePrice(first, next)) return { available: false, reason: 'mixed_rate_bucket', from, to };
      zoneIds.add(next.zone);
    }
    const energyCost = kwh * first.energyRate, variableCost = first.variableRate === null ? null : kwh * first.variableRate;
    const usageCost = variableCost === null ? null : energyCost + variableCost;
    if (![energyCost, variableCost, usageCost].every(v => v === null || finite(v)))
      return { available: false, reason: 'nonfinite_cost', from, to };
    const ids = [...zoneIds].sort();
    return { available: true, from, to, kwh, zone: ids.length === 1 ? ids[0] : null,
      zones: ids, zoneAttribution: ids.length === 1 ? 'single' : 'multiple', energyRate: first.energyRate,
      variableRate: first.variableRate, energyCost, variableCost, usageCost };
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
    let complete = !issues.length;
    let kwh = complete ? priced.reduce((sum, r) => sum + r.kwh, 0) : null;
    let energyCost = complete ? priced.reduce((sum, r) => sum + r.energyCost, 0) : null;
    let variableCost = complete && priced.every(r => r.variableCost !== null) ? priced.reduce((sum, r) => sum + r.variableCost, 0) : null;
    let usageCost = energyCost !== null && variableCost !== null ? energyCost + variableCost : null;
    if (complete && ![kwh, energyCost, variableCost, usageCost].every(v => v === null || finite(v))) {
      issues.push({ reason: 'nonfinite_total' }); complete = false;
      kwh = energyCost = variableCost = usageCost = null;
    }
    return { complete, issues, rows: priced, kwh, energyCost, variableCost, usageCost,
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
  // Legacy weekday/weekend classification used the current calendar day, even
  // after midnight. Custom overnight rules intentionally use the start day.
  const day = start === end ? [{ from: '00:00', to: '24:00' }] :
    Number.isInteger(start) && Number.isInteger(end) && start > end && start <= 24 && end >= 0 ?
      [...(start < 24 ? [{ from: clockTime(start), to: '24:00' }] : []),
        ...(end > 0 ? [{ from: '00:00', to: clockTime(end) }] : [])] :
      [{ from: clockTime(start), to: clockTime(end) }];
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

// One wire fence for the card-owned host and settings editor. A public timeout
// is uncertainty, never permission to dispatch another raw operation.
function createTariffGuardV3({ getHass, getContext = () => null, browser = typeof window === 'object' ? window : null, timeoutMs = 15000 }) {
  const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  let epoch = 0, association, connection, connectionOffline = false, browserOffline = browser?.navigator?.onLine === false;
  let raw = null, suspended = false;
  const listeners = new Set(), wireListeners = new Set();
  const notify = () => { epoch++; for (const listener of [...listeners]) listener(); };
  const connectionEvent = event => {
    if (event.type === 'disconnected' || event.type === 'reconnect-error') connectionOffline = true;
    else if (event.type === 'ready') connectionOffline = false;
    notify();
  };
  const types = ['disconnected', 'ready', 'reconnect-error'];
  const bind = next => {
    if (connection === next) return;
    for (const type of types) connection?.removeEventListener?.(type, connectionEvent);
    connection = next; connectionOffline = next?.connected === false;
    if (!suspended) for (const type of types) connection?.addEventListener?.(type, connectionEvent);
  };
  const browserEvent = event => { browserOffline = event.type === 'offline'; notify(); };
  browser?.addEventListener?.('offline', browserEvent);
  browser?.addEventListener?.('online', browserEvent);
  const read = h => {
    bind(h?.connection);
    return { user: h?.user?.id, admin: h?.user?.is_admin === true, owner: h?.user?.is_owner === true,
      active: h?.user?.is_active !== false, groups: canonical(h?.user?.groups || []), groupIds: canonical(h?.user?.group_ids || []),
      connection: h?.connection, callWS: h?.callWS,
      connected: h?.connection?.connected !== false && !connectionOffline,
      online: !suspended && !browserOffline && browser?.navigator?.onLine !== false,
      haConfig: canonical(h?.config || {}), context: canonical(getContext()) };
  };
  const equal = (a, b) => a && b && Object.keys(b).every(k => a[k] === b[k]);
  const observe = (...prospectiveHass) => {
    const now = read(prospectiveHass.length ? prospectiveHass[0] : getHass()), changed = association && !equal(association, now);
    association = now;
    if (changed) notify();
    return { ...now, epoch };
  };
  const available = a => !!a?.user && a.active && !!a.connection && a.connected && a.online && typeof a.callWS === 'function';
  const snapshot = () => observe();
  const current = (token, admin = false) => {
    const now = observe();
    return token?.epoch === now.epoch && equal(token, Object.fromEntries(Object.entries(now).filter(([k]) => k !== 'epoch'))) && available(now) && (!admin || now.admin);
  };
  const call = (token, payload, admin = false) => {
    if (!current(token, admin)) return Promise.reject({ code: 'authority_changed' });
    if (raw) return Promise.reject({ code: 'wire_occupied' });
    let resolvePublic, rejectPublic, finished = false;
    const result = new Promise((resolve, reject) => { resolvePublic = resolve; rejectPublic = reject; });
    const slot = {}; raw = slot;
    const timer = setTimeout(() => { finished = true; rejectPublic({ code: 'timeout' }); }, timeoutMs);
    let request;
    try { request = Promise.resolve(token.callWS.call(getHass(), payload)); }
    catch (error) { request = Promise.reject(error); }
    // Both branches handle late settlement; no floating rejected finally promise.
    const settled = () => {
      clearTimeout(timer); if (raw === slot) raw = null;
      for (const listener of [...wireListeners]) listener();
    };
    request.then(value => {
      settled();
      if (!finished) { finished = true; current(token, admin) ? resolvePublic(value) : rejectPublic({ code: 'authority_changed' }); }
    }, error => { settled(); if (!finished) { finished = true; rejectPublic(error); } });
    return result;
  };
  const suspend = () => {
    if (suspended) return;
    suspended = true;
    for (const type of types) connection?.removeEventListener?.(type, connectionEvent);
    browser?.removeEventListener?.('offline', browserEvent); browser?.removeEventListener?.('online', browserEvent);
    notify();
  };
  const resume = () => {
    if (!suspended) return;
    suspended = false; browserOffline = browser?.navigator?.onLine === false;
    for (const type of types) connection?.addEventListener?.(type, connectionEvent);
    browser?.addEventListener?.('offline', browserEvent); browser?.addEventListener?.('online', browserEvent);
    notify(); observe();
  };
  const dispose = () => {
    for (const type of types) connection?.removeEventListener?.(type, connectionEvent);
    browser?.removeEventListener?.('offline', browserEvent); browser?.removeEventListener?.('online', browserEvent);
    notify(); listeners.clear(); wireListeners.clear(); // Raw occupancy intentionally survives disposal.
  };
  observe(); // Observe typed edges before the card/editor is ever mounted.
  return { snapshot, observe, current, available, call, occupied: () => raw !== null,
    subscribeWire: listener => { wireListeners.add(listener); return () => wireListeners.delete(listener); },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, invalidate: notify, suspend, resume, dispose };
}
// Node-only dependency; runtime consumers vendor the guard in their own closure.


// Vendor inside each card's closure. The parent owns state and its mount; no
// global registration, helper services, SMTP configuration or browser storage.
function createTariffSettingsV3({ root, getHass, language = 'en', state, validate, onSaved, onLoaded, onCancel, ui, guard }) {
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
  const validProfile = profile => { try { return validate(profile)?.valid === true; } catch (_) { return false; } };
  // The server returns only this bounded marker when persisted validation fails.
  // Its confirmed revision lets an administrator explicitly replace the profile.
  const invalidMarker = profile => object(profile) && profile.schema === 0 && Object.keys(profile).length === 1;
  const statuses = () => ({ success: t('Success', 'Sukces'), partial: t('Partial', 'Częściowo'),
    unconfirmed: t('Unconfirmed', 'Niepotwierdzony'), error: t('Error', 'Błąd'),
    not_checked: t('Not checked', 'Nie sprawdzono'), no_data: t('No data', 'Brak danych') });
  const statusHtml = () => family()?.statusHtml(state.status) || `<span data-result-state="${esc(state.status)}"><span aria-hidden="true">${({ success: '✓', partial: '½', unconfirmed: '?', error: '✕', not_checked: '–', no_data: '∅' })[state.status] || '–'}</span> ${esc(statuses()[state.status] || statuses().not_checked)}</span>`;
  const blank = () => ({ schema: 1, type: 'Custom', name: '', currency: getHass()?.config?.currency || '',
    timezone: getHass()?.config?.time_zone || '', clock: { mode: 'civil' }, priceBasis: 'gross',
    fixedMonthly: null, defaultZone: null, zones: [], rules: [], exceptions: [] });
  const seed = profile => invalidMarker(profile) ? blank() : clone(profile) || blank();
  if (!object(state.draft) || invalidMarker(state.draft)) state.draft = seed(state.profile);
  if (!statuses()[state.status]) state.status = 'not_checked';
  if (invalidMarker(state.profile) && state.status === 'not_checked') state.status = 'error';
  guard ||= createTariffGuardV3({ getHass });
  let operation = 0, association, resumeFocus = null, disposed = false;
  const observe = () => (association = guard.observe());
  const available = a => guard.available(a);
  const ticket = () => ({ ...observe(), operation: ++operation });
  const current = (token, admin = false) => token.operation === operation && guard.current(token, admin);
  const call = (token, payload, admin = false) => current(token, admin)
    ? guard.call(token, payload, admin) : Promise.reject({ code: 'authority_changed' });
  const unsubscribe = guard.subscribe(() => {
    if (disposed) return;
    operation++; resumeFocus = null;
    state.profile = null; state.revision = null; state.updated_at = null;
    state.draft = blank(); state._draftBaseline = clone(state.draft);
    state.feedText = undefined; state.feedError = null; state.backendAvailable = false;
    state.busy = false; state.status = 'unconfirmed'; state.message = '';
    // This mount may already have been detached; erase it too, synchronously.
    root.replaceChildren();
  });
  const unsubscribeWire = guard.subscribeWire(() => { if (!disposed && root.isConnected && available(guard.observe())) render(); });
  const envelope = value => object(value) && Object.hasOwn(value, 'profile') &&
    (value.profile === null || invalidMarker(value.profile) || (object(value.profile) && validProfile(value.profile))) && Number.isSafeInteger(value.revision) && value.revision >= 0 &&
    Object.hasOwn(value, 'updated_at') && (value.updated_at === null ||
      (typeof value.updated_at === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value.updated_at) && Number.isFinite(Date.parse(value.updated_at))));
  const message = (status, text) => { state.status = status; state.message = text; };
  const unknown = () => { state.writeUnconfirmed = true; message('unconfirmed', t('Saving was not confirmed. Check the stored tariff before retrying. Your draft is preserved.',
    'Nie potwierdzono zapisu. Sprawdź zapisaną taryfę przed ponowieniem. Szkic został zachowany.')); };
  const load = async () => {
    if (disposed || state.busy || guard.occupied()) return;
    const token = ticket();
    if (!available(token)) { message('error', t('Tariff backend unavailable.', 'Backend taryf jest niedostępny.')); render(); return; }
    const pristine = equal(state.draft, seed(state.profile)), draft = clone(state.draft);
    state.busy = true; state.message = t('Loading stored tariff…', 'Wczytywanie zapisanej taryfy…'); render();
    try {
      const result = await call(token, { type: 'ha_tools_email/get_tariff' });
      if (!current(token)) return;
      if (!envelope(result)) throw { code: 'malformed' };
      state.profile = clone(result.profile); state.revision = result.revision; state.updated_at = result.updated_at;
      state.backendAvailable = true; state.writeUnconfirmed = false;
      state.draft = pristine ? seed(result.profile) : draft;
      if (pristine) { state.feedText = undefined; state.feedError = null; }
      if (invalidMarker(result.profile)) message('error', t('The stored tariff is invalid. Review and save a replacement; costs stay unavailable until a valid profile is confirmed.',
        'Zapisana taryfa jest niepoprawna. Sprawdź i zapisz nowy profil; koszty pozostają niedostępne do potwierdzenia poprawnej taryfy.'));
      else message(result.profile ? 'not_checked' : 'no_data', t('Stored tariff loaded. Review the fields before saving.', 'Wczytano taryfę. Sprawdź pola przed zapisem.'));
      if (current(token) && typeof onLoaded === 'function') onLoaded(clone(result));
    } catch (_) {
      if (current(token)) { state.backendAvailable = false; message('error', t('Tariff backend unavailable or response invalid. Draft preserved.', 'Backend taryf jest niedostępny lub odpowiedź jest błędna. Zachowano szkic.')); }
    } finally { if (current(token)) { state.busy = false; render(); } }
  };
  const save = async () => {
    if (disposed || state.busy || guard.occupied()) return;
    const token = ticket();
    if (!available(token) || !token.admin || state.writeUnconfirmed || state.backendAvailable === false || !Number.isSafeInteger(state.revision)) {
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
      if (!current(token, true)) return;
      if (!object(written) || !Number.isSafeInteger(written.revision) || written.revision !== previousRevision + 1) { unknown(); return; }
      const stored = await call(token, { type: 'ha_tools_email/get_tariff' }, true);
      if (!current(token, true)) return;
      if (!envelope(stored) || stored.updated_at === null || stored.revision !== written.revision || !equal(stored.profile, proposed)) { unknown(); return; }
      state.writeUnconfirmed = false;
      state.profile = clone(stored.profile); state.draft = clone(stored.profile); state.revision = stored.revision; state.updated_at = stored.updated_at;
      message('success', t('Tariff saved and confirmed by stored readback.', 'Taryfa zapisana i potwierdzona odczytem.'));
      if (current(token, true) && typeof onSaved === 'function') onSaved(clone(stored));
    } catch (error) {
      if (current(token, true) && ['conflict', 'revision_conflict', 'tariff_revision_conflict'].includes(error?.code)) {
        state.writeUnconfirmed = true;
        message('error', t('Revision conflict. Load the stored tariff and reconcile your draft.', 'Konflikt wersji. Wczytaj zapisaną taryfę i porównaj ze szkicem.'));
      } else if (current(token)) unknown();
    } finally { if (current(token)) { state.busy = false; render(); } }
  };
  const cancel = () => {
    // A dispatched save cannot be undone safely. The button remains disabled.
    if (disposed || state.busy || guard.occupied()) return;
    operation++; state.draft = seed(state.profile); state.feedError = null; state.feedText = undefined;
    message('not_checked', ''); render(); if (typeof onCancel === 'function') onCancel();
  };
  const read = path => path.split('.').reduce((value, key) => value?.[key], state.draft);
  const write = (path, value) => {
    const keys = path.split('.'); let at = state.draft;
    for (const key of keys.slice(0, -1)) { if (!object(at[key]) && !Array.isArray(at[key])) at[key] = {}; at = at[key]; }
    at[keys.at(-1)] = value;
  };
  const mutable = () => observe().admin && !state.busy && !guard.occupied() && available(association);
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
    if (disposed) return;
    const active = root.getRootNode().activeElement;
    const focused = active && root.contains(active) ? active : root.querySelector(':focus');
    const focusKey = focused ? { path: focused.dataset.path, action: focused.dataset.action, weekday: focused.dataset.weekday, feed: focused.dataset.feed,
      selection: typeof focused.selectionStart === 'number' ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection } : null } : resumeFocus;
    const documentFocus = root.ownerDocument.activeElement, ownerRoot = root.getRootNode();
    const externalFocus = documentFocus && documentFocus !== root.ownerDocument.body &&
      documentFocus !== ownerRoot.host && !root.contains(documentFocus);
    if (focused && state.busy) resumeFocus = focusKey;
    const a = observe();
    if (state.busy && (!available(a) || !a.admin) && state.message) unknown();
    const p = state.draft;
    root.innerHTML = `<style>${css}${family()?.css || ''}</style><section class="ht-tariff-v3" aria-label="${esc(t('Tariff settings', 'Ustawienia taryfy'))}"><h3>${esc(t('Your electricity tariff', 'Twoja taryfa energii'))}</h3><p>${esc(t('Enter your own rates and hours. Names G11/G12/G12w/G12n do not fill rates, holidays or schedules.', 'Wpisz własne ceny i godziny. Nazwy G11/G12/G12w/G12n nie uzupełniają cen, świąt ani harmonogramu.'))}</p>${
      !a.admin ? `<p>${esc(t('Household access: read only.', 'Dostęp domownika: tylko odczyt.'))}</p>` : ''}${
      !available(a) || state.backendAvailable === false ? `<p>${esc(t('Tariff backend unavailable. No local fallback.', 'Backend taryf jest niedostępny. Brak lokalnego zapisu zastępczego.'))}</p>` :
        !Number.isSafeInteger(state.revision) ? `<p>${esc(t('Backend availability not checked. Load the tariff first.', 'Dostępność backendu nie została sprawdzona. Najpierw wczytaj taryfę.'))}</p>` : ''}
${invalidMarker(state.profile) ? `<p role="alert">${esc(t('The stored tariff is invalid. Create and save a valid replacement. No rates were guessed.', 'Zapisana taryfa jest niepoprawna. Utwórz i zapisz poprawny profil. Nie przyjęto domyślnych stawek.'))}</p>` : ''}
<div class="ht-tariff-grid">${field('type', t('Tariff name type', 'Typ nazwy taryfy'), 'text', ['Custom', 'G11', 'G12', 'G12w', 'G12n'].map(v => [v, v]))}${field('name', t('Tariff name (optional)', 'Nazwa taryfy (opcjonalna)'))}${field('currency', t('Currency ISO 4217', 'Waluta ISO 4217'))}${field('timezone', t('IANA timezone', 'Strefa czasowa IANA'))}${field('clock.mode', t('Tariff clock', 'Zegar taryfy'), 'text', [['civil', t('Civil time (DST)', 'Czas lokalny (zmiana czasu)')], ['fixed', t('Fixed UTC offset', 'Stałe przesunięcie UTC')]])}${field('clock.offsetMinutes', t('Fixed offset minutes', 'Stałe przesunięcie w minutach'), 'number')}${field('priceBasis', t('Price basis', 'Podstawa ceny'), 'text', [['gross', t('Gross', 'Brutto')], ['net', t('Net', 'Netto')]])}${field('validFrom', t('Valid from (optional)', 'Ważna od (opcjonalnie)'), 'date')}${field('validTo', t('Valid to (optional)', 'Ważna do (opcjonalnie)'), 'date')}${field('fixedMonthly', t('Fixed monthly fee (separate)', 'Opłata stała miesięczna (osobno)'), 'number')}</div>
<h3>${esc(t('Energy and variable fees per kWh', 'Energia i opłaty zmienne za kWh'))}</h3><p>${esc(t('Empty = unknown; zero is a known zero. Fixed monthly fees are shown separately, never prorated.', 'Puste = nieznane; zero jest znaną wartością zero. Opłata stała jest osobna, bez proporcjonalnego naliczania.'))}</p>${
(p.zones || []).map((_, i) => `<fieldset><legend>${esc(t('Zone', 'Strefa'))} ${i + 1}</legend><div class="ht-tariff-grid">${field(`zones.${i}.id`, t('Zone ID', 'ID strefy'))}${field(`zones.${i}.label`, t('Zone label', 'Etykieta strefy'))}${field(`zones.${i}.energyRate`, t('Energy / kWh', 'Energia / kWh'), 'number')}${field(`zones.${i}.variableRate`, t('Variable fees / kWh (optional)', 'Opłaty zmienne / kWh (opcjonalne)'), 'number')}${field(`zones.${i}.classification`, t('Zone type (optional)', 'Rodzaj strefy (opcjonalnie)'), 'text', [['', t('Unknown', 'Nieznana')], ['cheap', t('Cheap', 'Tania')], ['expensive', t('Expensive', 'Droga')], ['mixed', t('Mixed', 'Mieszana')]])}</div>${mutable() ? button(`remove-zone:${i}`, t('Remove zone', 'Usuń strefę')) : ''}</fieldset>`).join('')}${mutable() ? button('add-zone', t('Add zone', 'Dodaj strefę')) : ''}${field('defaultZone', t('Default zone (optional)', 'Strefa domyślna (opcjonalna)'), 'text', zoneChoices())}
<h3>${esc(t('Schedule rules', 'Reguły harmonogramu'))}</h3>${rows('rules')}${mutable() ? button('add-rule', t('Add rule', 'Dodaj regułę')) : ''}<h3>${esc(t('Date exceptions', 'Wyjątki dat'))}</h3>${rows('exceptions')}${mutable() ? button('add-exception', t('Add date exception', 'Dodaj wyjątek daty')) : ''}
<details><summary>${esc(t('Advanced: absolute dynamic price feed', 'Zaawansowane: bezwzględne przedziały cen dynamicznych'))}</summary><p>${esc(t('Optional dynamic feed overrides schedule prices. Use explicit UTC/offset timestamps. Only this feed uses JSON. Each interval may include classification: cheap, expensive or mixed; omission means unknown.', 'Opcjonalny feed dynamiczny zastępuje ceny harmonogramu. Użyj znaczników UTC lub z przesunięciem. JSON służy wyłącznie temu feedowi. Przedział może mieć classification: cheap, expensive lub mixed; brak oznacza nieznaną strefę.'))}</p><label class="ht-tariff-field"><span>${esc(t('Dynamic feed JSON (empty = off)', 'Feed dynamiczny JSON (pusty = wyłączony)'))}</span><textarea data-feed="true"${mutable() ? '' : ' disabled'}>${esc(state.feedText ?? (p.dynamic == null ? '' : JSON.stringify(p.dynamic, null, 2)))}</textarea></label>${field('allowNegativeEnergy', t('Negative energy prices', 'Ujemne ceny energii'), 'text', [['false', t('Disabled', 'Wyłączone')], ['true', t('Explicitly allowed', 'Jawnie dozwolone')]])}</details>
<div role="status" aria-live="polite" data-status="${esc(state.status)}">${statusHtml()}${state.message ? ': ' + esc(localMessage()) : ''}</div><div class="ht-tariff-actions"><button type="button" data-action="load"${state.busy || guard.occupied() || !available(a) ? ' disabled' : ''}>${esc(t('Load stored tariff', 'Wczytaj zapisaną taryfę'))}</button>${a.admin ? `<button type="button" data-action="save"${state.busy || guard.occupied() || !available(a) || state.writeUnconfirmed || state.backendAvailable === false || !Number.isSafeInteger(state.revision) ? ' disabled' : ''}>${esc(t('Save tariff', 'Zapisz taryfę'))}</button><button type="button" data-action="cancel"${state.busy || guard.occupied() ? ' disabled' : ''}>${esc(t('Cancel', 'Anuluj'))}</button>` : ''}</div></section>`;
    root.querySelectorAll('[data-path]').forEach(el => el.addEventListener('input', () => {
      if (!mutable()) { render(); return; }
      const path = el.dataset.path;
      let value = el.value;
      if (el.type === 'number') value = value.trim() === '' ? null : Number(value);
      else if (path.endsWith('.dates')) value = value.split(/[\s,]+/).filter(Boolean);
      else if (path === 'allowNegativeEnergy') value = value === 'true';
      else if ((['validFrom', 'validTo', 'defaultZone'].includes(path) || path.endsWith('.classification'))) value = value || null;
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
      if (target && !target.disabled && !externalFocus) {
        target.focus();
        if (focusKey.selection && typeof target.selectionStart === 'number') {
          const length = target.value.length;
          target.setSelectionRange(Math.min(focusKey.selection.start, length), Math.min(focusKey.selection.end, length), focusKey.selection.direction || 'none');
        }
      }
    }
    if (!state.busy) resumeFocus = null;
  }
  return { render, load, cancel, dispose: () => { disposed = true; operation++; unsubscribe(); unsubscribeWire(); } };
}

// Pricing stays in HA Tools Email. This controller only queues bounded reads,
// validates replies and combines already-priced measurement partitions.
function createEnergyBackendV5({card, guard, describe, onPrices = () => {}, onRevision = () => {}, refreshMs = 30000, retryMs = 300000}) {
  const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const number = v => v === null || finite(v);
  const stamp = v => finite(v) ? Math.trunc(v) : typeof v === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;
  const clock = value => value && ['civil','fixed'].includes(value.mode) && (value.mode !== 'fixed' || Number.isInteger(value.offsetMinutes) && Math.abs(value.offsetMinutes) <= 840);
  let context, generation = 0, busy = false, scheduled = false, snapshotSlot = null, snapshotWindow = null, refreshTimer = null;
  const records = new Map(), jobs = [];
  const updatePriceStatus = () => {
    let status = null;
    for (const record of records.values()) {
      if (record.priceError === 'backend_request_limit') { status = record.priceError; break; }
      if (record.priceError) status = record.priceError;
    }
    card._energyPriceStatusV5 = status;
  };
  const clear = () => {
    clearTimeout(refreshTimer); refreshTimer = null;
    generation++; records.clear(); jobs.length = 0; context = undefined;
    snapshotSlot = null; snapshotWindow = null; card._energySnapshotV5 = null; card._energyPriceStatusV5 = null;
  };
  guard.subscribe(clear);
  const active = () => {
    const descriptor = describe();
    const key = canonical(descriptor);
    if (key !== context) { clear(); context = key; }
    return descriptor;
  };
  const unknown = (buckets, descriptor, reason = 'backend_pending') => ({complete:false,issues:[{reason}],
    rows:buckets.map((r,index)=>({index,from:stamp(r?.from),to:stamp(r?.to),available:false,reason})),
    kwh:null,energyCost:null,variableCost:null,usageCost:null,currency:descriptor.profile?.currency || null,
    priceBasis:descriptor.profile?.priceBasis || null,timezone:descriptor.profile?.timezone || null,
    clock:descriptor.profile?.clock || {},fixedMonthly:descriptor.profile?.fixedMonthly ?? null});
  const envelope = (result, descriptor) => {
    if (!result || result.schema !== 1 || result.profile_source !== descriptor.source ||
      (descriptor.source === 'shared' ? !Number.isSafeInteger(result.tariff_revision) || result.tariff_revision < 0 : result.tariff_revision !== null))
      throw Error('invalid_backend_response');
    if (descriptor.source === 'shared' && result.tariff_revision !== descriptor.revision) {
      clear(); onRevision(result.tariff_revision); return false;
    }
    return descriptor.source === 'shared' ? Number.isSafeInteger(result.tariff_revision) : result.tariff_revision === null;
  };
  const validatePrice = (r, buckets, profile) => {
    if (!r || typeof r.complete !== 'boolean' || !Array.isArray(r.rows) || r.rows.length !== buckets.length || !Array.isArray(r.issues) ||
      !['kwh','energyCost','variableCost','usageCost','fixedMonthly'].every(k=>number(r[k])) ||
      r.currency !== (profile?.currency ?? null) || r.priceBasis !== (profile?.priceBasis ?? null) || r.timezone !== (profile?.timezone ?? null) || !clock(r.clock)) return false;
    return r.rows.every((row,i) => row && row.index === i && row.from === stamp(buckets[i]?.from) && row.to === stamp(buckets[i]?.to) &&
      typeof row.available === 'boolean' && (!row.available || ['kwh','energyRate','variableRate','energyCost','variableCost','usageCost'].every(k=>number(row[k])) &&
        finite(row.kwh) && finite(row.energyRate) && finite(row.energyCost) && row.kwh === buckets[i].kwh &&
        Array.isArray(row.zones) && row.zones.every(v=>typeof v === 'string') && ['single','multiple'].includes(row.zoneAttribution)));
  };
  const combine = record => {
    const parts = record.parts, first = parts[0];
    const rows = parts.flatMap((part,i) => part.rows.map(row=>({...row,index:row.index+record.offsets[i]})));
    const issues = parts.flatMap((part,i)=>part.issues.map(issue=>({reason:issue.reason,...(Number.isInteger(issue.index)?{index:issue.index+record.offsets[i]}:{})})));
    const ordered = [...rows].sort((a,b)=>a.from-b.from);
    for(let i=1;i<ordered.length;i++) if(ordered[i].from<ordered[i-1].to) issues.push({reason:'overlapping_measurement',index:ordered[i].index});
    const coverage = record.coverage;
    if(coverage) {
      const from=stamp(coverage.from),to=stamp(coverage.to);
      if(!finite(from)||!finite(to)||to<=from) issues.push({reason:'invalid_coverage'});
      else if(!ordered.length || ordered[0].from!==from || ordered.at(-1).to!==to || ordered.some((r,i)=>i && r.from!==ordered[i-1].to)) issues.push({reason:'missing_measurement'});
    }
    let complete=parts.every(p=>p.complete)&&issues.length===0;
    const sum=key=>complete && parts.every(p=>p[key]!==null) ? parts.reduce((n,p)=>n+p[key],0):null;
    let kwh=sum('kwh'),energyCost=sum('energyCost'),variableCost=sum('variableCost'),usageCost=sum('usageCost');
    if(![kwh,energyCost,variableCost,usageCost].every(number)) {complete=false;kwh=energyCost=variableCost=usageCost=null;issues.push({reason:'nonfinite_total'});}
    return {...first,complete,rows,issues,kwh,energyCost,variableCost,usageCost};
  };
  // Match the server's conservative workload bound; split large/complex histories
  // before dispatch. This examines interval counts, never tariff rules or prices.
  const partition = (buckets, profile) => {
    const rules=[...(profile?.rules || []),...(profile?.exceptions || [])];
    const weight=1+rules.reduce((n,r)=>n+Math.max(1,r.intervals?.length || 0),0);
    const boundaries=(profile?.dynamic?.intervals || []).flatMap(r=>[stamp(r.from),stamp(r.to)]).filter(finite).sort((a,b)=>a-b);
    const lower = value => {let a=0,b=boundaries.length;while(a<b){const m=(a+b)>>>1;if(boundaries[m]<value)a=m+1;else b=m;}return a;};
    const result=[];let rows=[],work=0,minutes=0,bytes=0,offset=0;
    const push=()=>{result.push({buckets:rows,work,minutes,bytes,offset});offset+=rows.length;rows=[];work=minutes=bytes=0;};
    const profileBytes=JSON.stringify(profile).length*4;
    for(const row of buckets) {
      const from=stamp(row.from),to=stamp(row.to),span=finite(from)&&finite(to)&&to>from&&to-from<=86400000?Math.ceil((to-from)/60000):0;
      const cost=(span?span+2+lower(to)-lower(from+1):1)*weight, size=JSON.stringify(row).length*4+16;
      if(cost>1900000 || size+profileBytes>500000) throw Error('backend_request_limit');
      if(rows.length && (work+cost>1900000 || minutes+span>122000 || rows.length>=2000 || bytes+size+profileBytes>500000)) push();
      rows.push(row);work+=cost;minutes+=span;bytes+=size;
    }
    push();return result;
  };
  const schedule = () => {
    if(scheduled) return;
    scheduled=true;queueMicrotask(()=>{scheduled=false;void flush();});
  };
  const still = (token, version, key) => guard.current(token) && version===generation && context===key && canonical(describe())===key;
  const flush = async () => {
    if(busy || guard.occupied() || !jobs.length) return;
    for(let i=jobs.length-1;i>=0;i--) if(jobs[i].record?.failed) jobs.splice(i,1);
    if(!jobs.length) return;
    const token=guard.snapshot();
    if(!guard.available(token)) return;
    const descriptor=active(),version=generation,key=context;
    if(!jobs.length) return;
    const batch=[];let work=0,minutes=0,bytes=JSON.stringify(descriptor.profile).length*4;
    const isSnapshot=jobs[0].snapshot;
    while(jobs.length && batch.length<64 && !!jobs[0].snapshot===!!isSnapshot) {
      const job=jobs[0];
      if(batch.length && (isSnapshot || work+job.work>1900000 || minutes+job.minutes>122000 || bytes+job.bytes>500000 || batch.reduce((n,j)=>n+j.buckets.length,0)+job.buckets.length>2000)) break;
      jobs.shift();batch.push(job);work+=job.work || 0;minutes+=job.minutes || 0;bytes+=job.bytes || 0;
      if(isSnapshot) break;
    }
    busy=true;
    const request={type:`ha_tools_email/${isSnapshot?'energy_snapshot':'energy_price_queries'}`};
    if(descriptor.source==='override') request.profile=copy(descriptor.profile);
    if(!isSnapshot) request.queries=batch.map(j=>({buckets:j.buckets}));
    try {
      const result=await guard.call(token,request);
      if(!still(token,version,key) || isSnapshot && snapshotSlot !== batch[0] || !envelope(result,descriptor)) return;
      if(isSnapshot) {
        const r=result;
        if(!['ready','partial','unavailable'].includes(r.status) || !finite(stamp(r.generated_at)) || !r.current || typeof r.current.available!=='boolean' ||
          ![null,'cheap','expensive','mixed'].includes(r.current.zone_class) || !['energy_rate','variable_rate','usage_rate'].every(k=>number(r.current[k])) ||
          ![null,true,false].includes(r.current.cheap) || !r.today || !['energy_cost','variable_cost','usage_cost'].every(k=>number(r.today[k])) ||
          !(r.currency===null || typeof r.currency==='string' && /^[A-Z]{3}$/.test(r.currency)) ||
          !r.next_cheap || !['known','unknown','not_found_in_horizon'].includes(r.next_cheap.status) ||
          r.next_cheap.status==='known' && !finite(stamp(r.next_cheap.start))) throw Error('invalid_backend_response');
        if(r.currency !== (descriptor.profile?.currency ?? null)) throw Error('invalid_backend_response');
        // Compact uses a bounded projection, never arbitrary backend extensions.
        card._energySnapshotV5={schema:1,generated_at:r.generated_at,tariff_revision:r.tariff_revision,profile_source:r.profile_source,status:r.status,currency:r.currency,
          current:{available:r.current.available,zone_class:r.current.zone_class,cheap:r.current.cheap,energy_rate:r.current.energy_rate,variable_rate:r.current.variable_rate,usage_rate:r.current.usage_rate},
          today:{usage_cost:r.today.usage_cost,energy_cost:r.today.energy_cost,variable_cost:r.today.variable_cost},
          next_cheap:{status:r.next_cheap.status,start:r.next_cheap.start}};onPrices();
      } else {
        if(!Array.isArray(result.results) || result.results.length!==batch.length || !batch.every((job,i)=>validatePrice(result.results[i],job.buckets,descriptor.profile))) throw Error('invalid_backend_response');
        let completed=false;
        batch.forEach((job,i)=>{
          const record=job.record;
          if(record.failed) return;
          record.parts[job.part]=copy(result.results[i]);record.remaining--;
          if(!record.remaining) {record.value=combine(record);record.priceError=null;completed=true;}
        });
        updatePriceStatus();
        if(completed) onPrices();
      }
    } catch(error) {
      if(still(token,version,key)) {
        if(isSnapshot) card._energySnapshotV5=null;
        else for(const job of batch) {job.record.failed=true;job.record.retryAfter=Date.now()+retryMs;job.record.priceError=error?.code==='invalid_energy_price_queries'?'backend_request_limit':'backend_unavailable';job.record.value=unknown(job.record.buckets,descriptor,job.record.priceError);}
        if(!isSnapshot) updatePriceStatus();
        onPrices();
      }
    } finally {busy=false;if(jobs.length) schedule();}
  };
  guard.subscribeWire(schedule);
  const priceBuckets = (buckets, coverage) => {
    const token=guard.snapshot();
    const descriptor=active();
    const rows=Array.isArray(buckets)?buckets:[];
    if(!guard.available(token) || descriptor.ready === false) return unknown(rows,descriptor,'backend_unavailable');
    const key=canonical([rows,coverage ?? null]);
    const existing=records.get(key);
    if(existing && !(existing.failed && existing.retryAfter <= Date.now() && !guard.occupied())) return existing.value;
    if(existing) records.delete(key);
    const record={buckets:copy(rows),coverage:copy(coverage),value:unknown(rows,descriptor),parts:[],offsets:[],remaining:0,failed:false,priceError:existing?.priceError ?? null};
    records.set(key,record);
    try {
      const partitions=partition(record.buckets,descriptor.profile);
      record.remaining=partitions.length;
      partitions.forEach((part,i)=>{record.offsets[i]=part.offset;jobs.push({...part,record,part:i});});
      schedule();
    } catch(_) {record.failed=true;record.retryAfter=Infinity;record.priceError='backend_request_limit';record.value=unknown(rows,descriptor,record.priceError);updatePriceStatus();}
    return record.value;
  };
  const armRefresh = () => {
    if(refreshTimer !== null || !card.isConnected || !guard.available(guard.snapshot())) return;
    refreshTimer=setTimeout(()=>{
      refreshTimer=null;
      const token=guard.snapshot();
      if(!card.isConnected || !guard.available(token)) return;
      // priceBuckets owns bounded retries after the raw slot settles. Retain
      // expired errors until those queries recover, not just until a timer fires.
      snapshot();onPrices();
    }, refreshMs);
    refreshTimer?.unref?.();
  };
  const snapshot = () => {
    guard.snapshot();const descriptor=active();
    armRefresh();const window=Math.floor(Date.now()/refreshMs);
    if(snapshotWindow!==window) {
      card._energySnapshotV5=null;snapshotSlot=null;snapshotWindow=window;
      // The raw request keeps its slot. At most one newest snapshot waits for it.
      for(let i=jobs.length-1;i>=0;i--) if(jobs[i].snapshot) jobs.splice(i,1);
    }
    if(descriptor.ready !== false && !snapshotSlot && guard.available(guard.snapshot())) {snapshotSlot={snapshot:true};jobs.unshift(snapshotSlot);schedule();}
    return card._energySnapshotV5;
  };
  return {priceBuckets,snapshot,invalidate:clear};
}
"use strict";
// Read-only bounded report facts. One retained raw lane; no private API fallback.
function createReportStatusV53({card,guard,purpose,getSourceKey = () => guard.snapshot().epoch,isActive = () => false,wantsExecute = () => false,onChange = () => {}}) {
  if (!['energy_report','log_digest'].includes(purpose)) throw Error('invalid_report_status_purpose');
  const outcomes = new Set(['accepted_by_smtp','preparation_failed','authentication_failed','recipients_refused','partial_acceptance','tls_failed','transport_outcome_unknown','send_failed','cancelled_outcome_unknown','outcome_unknown']);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const keys = (value,known) => {
    if (!object(value)) return false;
    let count = 0;
    for (const key in value) if (Object.hasOwn(value,key)) { if (!known.includes(key)) return false; count++; }
    return count === known.length && known.every(key => Object.hasOwn(value,key));
  };
  const stamp = value => {
    if (typeof value !== 'string' || value.length > 64) return NaN;
    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!parts || Number(parts[1]) < 1 || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59 || Number(parts[8] || 0) > 23 || Number(parts[9] || 0) > 59) return NaN;
    const day = new Date(value.slice(0,10) + 'T00:00:00Z');
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== value.slice(0,10)) return NaN;
    return Date.parse(value);
  };
  const validate = value => {
    if (!keys(value,['schema','purpose','generated_at','schedule_state','next_report_at','history_state','last_attempt']) || value.schema !== 1 || value.purpose !== purpose || !Number.isFinite(stamp(value.generated_at)) ||
        !['enabled','disabled','unconfigured','unavailable'].includes(value.schedule_state) || !['ready','unavailable'].includes(value.history_state)) throw {code:'invalid_report_status'};
    const generated = stamp(value.generated_at);
    if (value.next_report_at !== null && (!Number.isFinite(stamp(value.next_report_at)) || stamp(value.next_report_at) <= generated || value.schedule_state !== 'enabled') ||
        value.schedule_state === 'enabled' && value.next_report_at === null) throw {code:'invalid_report_status'};
    let attempt = null;
    if (value.last_attempt !== null) {
      const row = value.last_attempt;
      if (value.history_state !== 'ready' || !keys(row,['timestamp','outcome','recipient_count']) || !Number.isFinite(stamp(row.timestamp)) || stamp(row.timestamp) > generated ||
          typeof row.outcome !== 'string' || row.outcome.length > 64 || !outcomes.has(row.outcome) ||
          row.recipient_count !== null && (!Number.isSafeInteger(row.recipient_count) || row.recipient_count < 0 || row.recipient_count > 100000)) throw {code:'invalid_report_status'};
      attempt = {timestamp:row.timestamp,outcome:row.outcome,recipient_count:row.recipient_count};
    }
    // Copy only this schema's fixed primitives. No caller objects or future/private fields.
    return {schema:1,purpose,generated_at:value.generated_at,schedule_state:value.schedule_state,next_report_at:value.next_report_at,history_state:value.history_state,last_attempt:attempt};
  };
  let enabled = false, identity = null, generation = 0, revision = 0, activation = null, unsubscribe = null;
  let raw = null, pending = false, scheduled = false, snapshot = null, status = 'idle', expiry = null;
  let capabilities = null, pendingCapabilities = false, actionWaiter = null;
  const wantsAction = () => { try { return wantsExecute() === true; } catch (_) { return false; } };
  const settleAction = allowed => { const waiter = actionWaiter; actionWaiter = null; waiter?.resolve(allowed); };
  const emit = () => { try { onChange(); } catch (_) { /* UI failures cannot release a wire. */ } };
  const active = () => card.isConnected && card.preview !== true && isActive() && card._hass?.connected !== false;
  const primitive = key => typeof key === 'number' && Number.isSafeInteger(key) && key >= 0;
  const source = () => { const key = getSourceKey(); if (!primitive(key)) throw Error('invalid_source_key'); return key; };
  const same = (a,b) => a && b && a.every((value,index) => value === b[index]);
  const reset = () => {
    clearTimeout(expiry); expiry = null;
    settleAction(false); capabilities = null; pendingCapabilities = false;
    generation++; revision++; enabled = false; identity = null; activation = null; pending = false; snapshot = null; status = 'idle';
    const dispose = unsubscribe; unsubscribe = null; try { dispose?.(); } catch (_) {}
    // raw intentionally survives every authority change, stop, timeout and remount.
  };
  const controlCurrent = task => {
    try { return enabled && active() && task.generation === generation && task.key === source() && guard.current(task.token); }
    catch (_) { return false; }
  };
  const current = task => controlCurrent(task) && task.revision === revision;
  const queue = () => {
    if (scheduled) return;
    scheduled = true; queueMicrotask(() => { scheduled = false; update(); pump(); });
  };
  const invalidate = () => {
    clearTimeout(expiry); expiry = null;
    settleAction(false); capabilities = null;
    revision++; snapshot = null; pending = enabled && active(); pendingCapabilities = pending && wantsAction(); status = pending ? 'loading' : 'idle'; emit(); queue();
  };
  const failure = error => error?.code === 'unauthorized' || error?.code === 'not_allowed' ? 'denied' : error?.code === 'unknown_command' ? 'unsupported' : 'unavailable';
  function update() {
    let token,key;
    try { token = guard.snapshot(); key = source(); }
    catch (_) { reset(); status = 'unavailable'; return; }
    if (!active() || !guard.available(token)) { if (enabled || identity || snapshot || pending) reset(); return; }
    const next = [token.epoch,key,card._hass?.connected];
    if (enabled && same(identity,next)) return;
    reset(); enabled = true; identity = next; pending = true; pendingCapabilities = wantsAction(); status = 'loading';
    const task = {generation,token,key};
    const connection = card._hass?.connection;
    if (typeof connection?.subscribeMessage !== 'function') { pendingCapabilities = pending = false; status = 'unavailable'; return; }
    const operation = Promise.resolve().then(() => {
      if (!controlCurrent(task)) return null;
      return connection.subscribeMessage(() => { if (unsubscribe && controlCurrent(task)) invalidate(); },{type:'ha_tools_email/subscribe_analysis_updates'});
    }).then(dispose => {
      if (typeof dispose !== 'function') { if (controlCurrent(task)) throw {code:'subscription_unavailable'}; return; }
      if (!controlCurrent(task)) { try { dispose(); } catch (_) {} return; }
      unsubscribe = dispose; pending = true; queue(); emit();
    }).catch(error => {
      if (controlCurrent(task)) { capabilities = null; pendingCapabilities = pending = false; settleAction(false); snapshot = null; status = failure(error); emit(); }
    }).finally(() => { if (activation === operation) activation = null; });
    activation = operation;
  }
  function pump() {
    if ((!pending && !pendingCapabilities) || !enabled || !unsubscribe || raw || guard.occupied() || !active()) return;
    let key,token;
    try { key = source(); token = guard.snapshot(); } catch (_) { reset(); status = 'unavailable'; emit(); return; }
    const kind = pending ? 'status' : 'capabilities';
    if (kind === 'capabilities' && !wantsAction()) { pendingCapabilities = false; settleAction(false); return; }
    const task = {generation,revision,key,token,kind,settled:false,publicDone:false,startedAt:performance.now()};
    if (!controlCurrent(task)) return;
    raw = task;
    if (kind === 'status') { pending = false; status = 'loading'; snapshot = null; }
    else pendingCapabilities = false;
    let request;
    try { request = guard.call(token,kind === 'status' ? {type:'ha_tools_email/get_report_status',purpose} : {type:'ha_tools_email/feature_capabilities'}); }
    catch (error) { request = Promise.reject(error); }
    Promise.resolve(request).then(value => {
      if (!current(task)) return;
      if (kind === 'capabilities') {
        const feature = purpose === 'energy_report' ? 'energy_reports' : 'log_reports';
        const grant = value?.capabilities?.[feature];
        if (value?.status !== 'ready' || !Number.isSafeInteger(value.revision) || value.revision < 0 || !object(grant) || ['visible','read','execute'].some(k => typeof grant[k] !== 'boolean')) throw {code:'invalid_capabilities'};
        capabilities = {visible:grant.visible,read:grant.read,execute:grant.execute};
        settleAction(capabilities.visible && capabilities.execute && wantsAction()); emit(); return;
      }
      snapshot = validate(value); status = 'ready';
      if (snapshot.next_report_at) {
        // Re-read a known calendar boundary, never compute a new occurrence or
        // infer dispatch. Relative server timestamps avoid browser clock skew.
        // The server generated this DTO during the request, before receipt.
        // Subtract monotonic request time so transport/queue delay cannot extend
        // the lifetime. This may conservatively refresh early, without relying
        // on agreement between browser and server wall clocks.
        const remaining = stamp(snapshot.next_report_at)-stamp(snapshot.generated_at)-Math.max(0,performance.now()-task.startedAt);
        if (remaining <= 0) { invalidate(); return; }
        const delay = Math.max(1,Math.min(2147483647,remaining));
        expiry = setTimeout(() => { expiry = null; if (current(task)) invalidate(); },delay);
        expiry?.unref?.();
      }
      emit();
    }).catch(error => {
      if (current(task)) {
        if (kind === 'capabilities') { capabilities = null; settleAction(false); if (error?.code === 'wire_occupied') pendingCapabilities = true; }
        else { snapshot = null; status = failure(error); if (error?.code === 'wire_occupied') pending = true; }
        emit();
      }
    }).finally(() => {
      task.publicDone = true;
      if (task.settled || !guard.occupied()) { if (raw === task) raw = null; queue(); emit(); }
      // A public timeout leaves raw retained until subscribeWire's actual settlement.
    });
  }
  guard.subscribe(() => { reset(); emit(); queue(); });
  guard.subscribeWire(() => {
    if (raw) { raw.settled = true; if (raw.publicDone) raw = null; }
    queue();
  });
  const stop = () => { const changed = enabled || identity || snapshot || pending || status !== 'idle'; reset(); if (changed) emit(); };
  const state = () => {
    update(); if (pending || pendingCapabilities) queue();
    return {status,busy:raw !== null,capabilities:capabilities ? {...capabilities} : null,snapshot:snapshot ? {...snapshot,last_attempt:snapshot.last_attempt ? {...snapshot.last_attempt} : null} : null};
  };
  const authorizeExecute = () => {
    update();
    if (!enabled || !active() || !unsubscribe || !wantsAction() || raw || guard.occupied()) return Promise.resolve(false);
    if (actionWaiter) return actionWaiter.promise;
    let resolve; const promise = new Promise(done => { resolve = done; });
    actionWaiter = {resolve,promise}; pendingCapabilities = true; queue(); emit(); return promise;
  };
  return {state,update:() => { update(); queue(); },stop,authorizeExecute};
}
// Node-only import; omitted in consumer closure.


// Card-owned adapter: it never writes card YAML, helpers, schedules or SMTP.
function createTariffHostV3({ card, kind, createModel, legacyProfile, createSettings, createUi, readTimeoutMs = 15000, guard, onRefresh }) {
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const language = () => card._hass?.locale?.language || card._hass?.language || card._lang || 'en';
  const text = (en, pl) => String(language()).startsWith('pl') ? pl : en;
  guard ||= createTariffGuardV3({ getHass: () => card._hass, getContext: () => card._config, timeoutMs: readTimeoutMs });
  const identity = () => guard.snapshot();
  const same = (a, b) => a?.epoch === b?.epoch && a?.user === b?.user && a?.connection === b?.connection;
  let confirmedRevision = null, confirmedUpdatedAt = null, pending = null, attemptedEpoch = null, cachedKey, cachedModel, editorRoot, editor, focusKey = null;
  const state = () => (card._tariffEditorState ||= { profile: null, revision: null, status: 'not_checked', busy: false });
  const effectiveConfig = () => {
    const config = card._config || {};
    if (Object.hasOwn(config, 'tariff_profile')) return config;
    return card._sharedTariffProfile != null && same(card._sharedTariffAssociation, identity(card._hass))
      ? { ...config, tariff_profile: card._sharedTariffProfile } : config;
  };
  const activeProfile = () => legacyProfile(effectiveConfig(), card._hass?.config, kind);
  const describe = () => {
    const shared = !Object.hasOwn(card._config || {}, 'tariff_profile') && card._sharedTariffProfile != null &&
      card._sharedTariffReadStatus === 'success' && same(card._sharedTariffAssociation, identity());
    return {profile: activeProfile() ?? null, source: shared ? 'shared' : 'override', revision: shared ? confirmedRevision : null,
      ready: Object.hasOwn(card._config || {}, 'tariff_profile') || card._sharedTariffReadStatus === 'success'};
  };
  const backend = createEnergyBackendV5({card,guard,describe,
    onPrices: () => {
      // Consumers key derived projections by tariff-model identity. A newly
      // accepted backend result must invalidate pending-price projections too.
      cachedKey = undefined; cachedModel = undefined;
      if (card.isConnected) card._repriceTariffV3?.();
    },
    onRevision: revision => {
      card._analysisHostV53?.invalidate();
      const token = identity(), minimumRevision = Math.max(revision, confirmedRevision || 0);
      card._sharedTariffExpectedV3 = true;
      card._sharedTariffReadStatus = 'unconfirmed';
      card._sharedTariffProfile = null; card._sharedTariffAssociation = null; card._sharedTariffLoadedAt = 0;
      cachedKey = undefined; cachedModel = undefined;
      // Clear derived UI immediately; automatic confirmation is a read only and
      // must never release the editor's uncertain-write fence via onRefresh.
      if (card.isConnected) card._repriceTariffV3?.();
      queueMicrotask(async () => {
        if (!card.isConnected || !guard.current(token)) return;
        const confirmed = await load(true, minimumRevision);
        if (guard.current(token) && card.isConnected) {
          if (!confirmed || confirmedRevision < minimumRevision) card._sharedTariffReadStatus = 'unconfirmed';
          card._repriceTariffV3?.();
        }
      });
    }
  });
  const model = function (proposed) {
    identity();
    const profile = arguments.length ? proposed : activeProfile(), key = JSON.stringify(profile);
    if (!arguments.length) { backend.snapshot(); if (cachedModel && key === cachedKey) return cachedModel; }
    const validated = createModel(profile);
    const unavailable = rows => ({complete:false,issues:[{reason:'invalid_profile'}],rows:(rows || []).map((row,index)=>({index,from:row.from,to:row.to,available:false})),
      kwh:null,energyCost:null,variableCost:null,usageCost:null,currency:null,priceBasis:null,timezone:null,clock:{},fixedMonthly:null});
    if (!validated.valid) return {valid:false,errors:validated.errors,rateAt:()=>({available:false,reason:'invalid_profile'}),priceBuckets:unavailable};
    if (arguments.length) return {valid:true,errors:[],rateAt:()=>({available:false,reason:'backend_required'}),priceBuckets:unavailable};
    cachedKey = key; cachedModel = {valid:true,errors:[],rateAt:()=>({available:false,reason:'backend_required'}),priceBuckets:backend.priceBuckets};
    return cachedModel;
  };
  const currency = () => {
    const value = activeProfile()?.currency;
    return typeof value === 'string' && /^[A-Z]{3}$/.test(value) ? value : '';
  };
  const purge = () => {
    card._sharedTariffProfile = null; card._sharedTariffAssociation = null;
    card._sharedTariffLoadedAt = 0; card._tariffEditorState = null; confirmedRevision = null; confirmedUpdatedAt = null;
    card._sharedTariffReadStatus = 'not_checked'; card._tariffSettingsOpen = false;
    backend.invalidate();
    cachedKey = undefined; cachedModel = undefined; editorRoot?.replaceChildren(); editor?.dispose?.(); editorRoot = null; editor = null; focusKey = null;
    for (const mount of card.shadowRoot?.querySelectorAll('[data-tariff-mount]') || []) mount.replaceChildren();
    const details = card.shadowRoot?.querySelector('[data-tariff-details]'); if (details) details.open = false;
    // Pending raw request remains owned by guard; a new epoch cannot free it.
  };
  guard.subscribe(purge);
  const reset = (...nextHass) => guard.observe(...nextHass);
  const load = async (force = false, minimumRevision = 0) => {
    const token = identity();
    if (!guard.available(token)) return false;
    if (card._sharedTariffReadStatus === 'success' && same(card._sharedTariffAssociation, token) && confirmedRevision >= minimumRevision) return true;
    if (pending) return pending;
    if (guard.occupied() || (!force && attemptedEpoch === token.epoch)) return false;
    attemptedEpoch = token.epoch;
    const operation = (async () => {
      try {
        const result = await guard.call(token, { type: 'ha_tools_email/get_tariff' });
        if (!guard.current(token)) return false;
        if (!result || !Object.hasOwn(result, 'profile') || !Number.isSafeInteger(result.revision) || result.revision < minimumRevision ||
          !Object.hasOwn(result, 'updated_at') || (result.updated_at !== null &&
          (typeof result.updated_at !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result.updated_at) || !Number.isFinite(Date.parse(result.updated_at)))))
          throw new Error('invalid_tariff_response');
        const valid = result.profile === null || createModel(result.profile).valid;
        const profile = result.profile === null ? null : valid ? clone(result.profile) : { schema: 0 };
        card._sharedTariffProfile = profile; card._sharedTariffAssociation = token; card._sharedTariffLoadedAt = Date.now();
        card._sharedTariffReadStatus = 'success'; confirmedRevision = result.revision; confirmedUpdatedAt = result.updated_at;
        backend.invalidate(); cachedKey = undefined; cachedModel = undefined;
        const saved = state(), pristine = !saved.draft || JSON.stringify(saved.draft) === JSON.stringify(saved._draftBaseline) || JSON.stringify(saved.draft) === JSON.stringify(saved.profile);
        saved.backendAvailable = true;
        // Pricing can advance independently of an unsaved editor draft. Keep its
        // original compare-and-swap baseline until the user explicitly loads.
        if (pristine) {
          saved.profile = clone(profile); saved.revision = result.revision; saved.updated_at = result.updated_at;
          saved.draft = valid ? clone(profile) : undefined; saved._draftBaseline = clone(saved.draft);
        }
        return true;
      } catch (_) {
        if (guard.current(token)) card._sharedTariffReadStatus = 'unconfirmed';
        return false;
      }
    })();
    pending = operation;
    operation.then(() => { if (pending === operation) pending = null; }, () => { if (pending === operation) pending = null; });
    return operation;
  };
  const snapshot = () => {
    const token = identity(), own = Object.hasOwn(card._config || {}, 'tariff_profile');
    if (!guard.available(token)) return { profile: null, reason: 'tariff_authority_unavailable' };
    if (own) return { profile: clone(card._config.tariff_profile), revision: null, provenance: 'card_config' };
    if (!same(card._sharedTariffAssociation, token) || card._sharedTariffReadStatus !== 'success') return { profile: null, reason: 'tariff_unconfirmed' };
    return { profile: clone(card._sharedTariffProfile), revision: confirmedRevision, provenance: 'shared_backend', updated_at: confirmedUpdatedAt };
  };
  const markup = () => {
    const active = card.shadowRoot?.activeElement;
    focusKey = active?.closest('[data-tariff-details]') ? {
      summary: active.tagName === 'SUMMARY', path: active.dataset.path,
      action: active.dataset.action, weekday: active.dataset.weekday, feed: active.dataset.feed,
      selection: typeof active.selectionStart === 'number' ? { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection } : null
    } : null;
    return `<style>
    [data-energy-container]{container-type:inline-size;container-name:energy-card}
    .tabs{display:flex;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;max-width:100%;scrollbar-width:thin;mask-image:linear-gradient(to right,transparent,#000 12px,#000 calc(100% - 12px),transparent);padding-inline:12px;box-sizing:border-box}
    .tabs>button{min-height:44px;min-width:44px;white-space:nowrap;flex:0 0 auto}
    button{min-height:44px;min-width:44px}
    .energy-tab-picker{display:none;margin:12px 0}
    .energy-tab-picker select{font:inherit;color:var(--primary-text-color,#172033);background:var(--card-background-color,#fff);width:100%;max-width:100%;min-height:44px;border:1px solid var(--divider-color,#d8dce5);border-radius:10px;padding:10px}
    .energy-tab-picker select:focus-visible{outline:3px solid var(--primary-color,#395fd1);outline-offset:2px}
    @container energy-card (max-width:279.99px){.tabs{display:none}.energy-tab-picker{display:block}}
    [data-tariff-details]{margin:16px 0;min-width:0;max-width:100%}
    [data-tariff-details]>summary{min-height:44px;display:flex;align-items:center;padding:10px;border:1px solid var(--divider-color,#d8dce5);border-radius:10px;cursor:pointer;overflow-wrap:anywhere}
    [data-tariff-details]>summary:focus-visible{outline:3px solid var(--primary-color,#395fd1);outline-offset:2px}
    </style>${card._sharedTariffReadStatus === 'unconfirmed' ? `<p role="status">${text('Shared tariff could not be confirmed. Reload explicitly to confirm prices. No tariff cost is guessed.', 'Nie udało się potwierdzić wspólnej taryfy. Wczytaj ponownie, aby potwierdzić ceny. Koszt taryfy nie jest zgadywany.')}</p>` : ''}
    ${card._energyPriceStatusV5 === 'backend_request_limit' ? `<p role="status">${text('This history exceeds the pricing limit. Choose a shorter period or simplify the tariff, then reload the tariff.', 'Ta historia przekracza limit wyceny. Wybierz krótszy okres lub uprość taryfę i wczytaj ją ponownie.')}</p>` : card._energyPriceStatusV5 === 'backend_unavailable' ? `<p role="status">${text('Energy pricing is unavailable. Check HA Tools Email and reload the tariff; unknown cost is not zero.', 'Wycena energii jest niedostępna. Sprawdź HA Tools Email i wczytaj taryfę ponownie; nieznany koszt nie oznacza zera.')}</p>` : ''}
    <details data-tariff-details${card._tariffSettingsOpen ? ' open' : ''}><summary>${text('Tariff settings', 'Ustawienia taryfy')}</summary>
    ${Object.hasOwn(card._config || {}, 'tariff_profile') ? `<p>${text('This card uses its own configured tariff. Shared settings apply to cards using the shared profile.', 'Ta karta używa własnej skonfigurowanej taryfy. Ustawienia współdzielone dotyczą kart korzystających ze wspólnego profilu.')}</p>` : ''}
    <div data-tariff-mount></div></details>`;
  };
  const mount = root => {
    if (editorRoot !== root || !editor) {
      editor?.dispose?.();
      const saved = state();
      if (!saved.draft) {
        const profile = activeProfile();
        if (createModel(profile).valid) saved.draft = clone(profile);
      }
      editorRoot = root;
      const mountToken = identity();
      const refreshed = envelope => {
        if (!guard.current(mountToken)) return;
        card._analysisHostV53?.invalidate();
        card._sharedTariffProfile = clone(envelope.profile); card._sharedTariffAssociation = identity(card._hass);
        card._sharedTariffLoadedAt = Date.now();
        card._sharedTariffReadStatus = 'success'; confirmedRevision = envelope.revision; confirmedUpdatedAt = envelope.updated_at;
        backend.invalidate(); cachedKey = undefined; cachedModel = undefined;
        // The editor finishes its pending state before the parent replaces DOM.
        queueMicrotask(() => {
          if (!guard.current(mountToken)) return;
          if (onRefresh) { onRefresh(envelope); return; }
          if (kind === 'insights') void card._fetchData();
          if (kind === 'email') void card._fetchAllPeriodStats().then(() => card._render());
          card._render();
        });
      };
      editor = createSettings({ root, getHass: () => card._hass, language, state: saved, validate: createModel,
        guard, ui: () => createUi({ language: language() }),
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
    guard.observe();
    backend.snapshot();
    const tabs = card.shadowRoot.querySelector('.tabs');
    if (tabs && kind !== 'smart') {
      tabs.parentElement.setAttribute('data-energy-container', '');
      const buttons = [...tabs.querySelectorAll('button')];
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', text('Energy views', 'Widoki energii'));
      let picker = card.shadowRoot.querySelector('.energy-tab-picker select');
      if (!picker) {
        const label = document.createElement('label'); label.className = 'energy-tab-picker';
        picker = document.createElement('select'); label.append(picker); tabs.before(label);
        picker.addEventListener('change', () => buttons.find(button=>button.dataset.tab===picker.value)?.click());
      }
      picker.setAttribute('aria-label', text('Energy view', 'Widok energii'));
      picker.replaceChildren(...buttons.map((button, index) => {
        const option = document.createElement('option'); option.value = button.dataset.tab || String(index);
        option.textContent = button.textContent.trim(); option.selected = button.classList.contains('active');
        button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(option.selected));
        if (!button.dataset.energyPickerBound) {
          button.dataset.energyPickerBound = 'true';
          button.addEventListener('click', () => queueMicrotask(() => {
            buttons.forEach((item, i) => {
              const active = item.classList.contains('active'); item.setAttribute('aria-selected', String(active));
              if (active) picker.value = item.dataset.tab || String(i);
            });
          }));
        }
        return option;
      }));
    }
    const details = card.shadowRoot.querySelector('[data-tariff-details]');
    if (!details) return;
    let root = details.querySelector('[data-tariff-mount]');
    if (editorRoot && editor && root !== editorRoot) { root.replaceWith(editorRoot); root = editorRoot; }
    if (!details.dataset.bound) {
      details.dataset.bound = 'true';
      details.addEventListener('toggle', () => {
        card._tariffSettingsOpen = details.open;
        if (details.open) mount(root);
      });
    }
    if (details.open) mount(root);
    if (focusKey) {
      const key = focusKey; focusKey = null;
      const target = key.summary ? details.querySelector('summary') : details.open &&
        [...root.querySelectorAll('input,select,textarea,button')].find(el =>
          (key.path && el.dataset.path === key.path) || (key.action && el.dataset.action === key.action) ||
          (key.weekday && el.dataset.weekday === key.weekday) || (key.feed && el.dataset.feed === key.feed));
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
        if (key.selection && typeof target.selectionStart === 'number') {
          const length = target.value.length;
          target.setSelectionRange(Math.min(key.selection.start, length), Math.min(key.selection.end, length), key.selection.direction || 'none');
        }
      }
    }
  };
  // Engine factories are local to this adapter in generated consumers. Keep
  // the public options helper independent of their lexical embedding location.
  const summary = ({onChange = () => {}, onInvalidate = () => {}} = {}) => {
    const controller = createEnergyAnalysisV53({card,onChange});
    return createEnergyAnalysisBindingV53({card,controller,onInvalidate});
  };
  const reportStatus = ({onChange,isActive,getSourceKey,wantsExecute} = {}) => createReportStatusV53({card,guard,purpose:'energy_report',onChange,isActive,wantsExecute,getSourceKey:getSourceKey || (() => guard.snapshot().epoch)});
  return { reportStatus, summary, analysis: () => createEnergyAnalysisHostV53({card}), model, profile: activeProfile, currency, reset, load, snapshot, markup, bind, guard, backend, ui: () => createUi({ language: language() }) };
}
"use strict";

// Read-only schema2 transport. The card owns event invalidation and visible refresh.
function createEnergyAnalysisV53({card, onChange = () => {}, refreshMs = 300000}) {
  const copy = value => JSON.parse(JSON.stringify(value));
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const decimal = value => value === null || typeof value === 'number' && Number.isFinite(value) ||
    typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value));
  const stamp = value => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
  const ttl = Number.isFinite(refreshMs) && refreshMs > 0 ? refreshMs : 300000;
  let mounted = false, epoch = 0, identity = null, raw = null, queued = null, cache = null;
  let view = {status:'idle', selection:null, snapshot:null, error:null};
  const emit = () => { try { onChange(copy(view)); } catch (_) { /* Consumer failures do not poison the wire. */ } };
  const set = (status, selection = null, snapshot = null, error = null) => {
    view = {status, selection:selection && copy(selection), snapshot, error}; emit();
  };
  const context = () => {
    const h = card?._hass;
    return {connection:h?.connection, user:h?.user?.id, active:h?.user?.is_active, admin:h?.user?.is_admin, online:h?.connected, zone:h?.config?.time_zone,
      available:mounted && card?.isConnected !== false && !!h?.user?.id && h.user.is_active !== false &&
        h.connected !== false && !!h.connection && h.connection.connected !== false && typeof h.callWS === 'function'};
  };
  const equal = (a,b) => a && b && a.connection === b.connection && a.user === b.user &&
    a.zone === b.zone && a.active === b.active && a.admin === b.admin && a.online === b.online && a.available === b.available;
  const clear = () => {
    epoch++; cache = null;
    const abandoned = queued; queued = null;
    view = {status:'idle',selection:null,snapshot:null,error:null};
    if (abandoned) abandoned.resolve(copy(view));
  };
  const observe = () => {
    const next = context();
    if (!equal(identity,next)) { clear(); identity = next; }
    return next;
  };
  const state = () => { observe(); return copy(view); };
  const normalize = (selection, ctx) => {
    if(object(selection)&&selection.kind==='patterns'){
      if(!Number.isInteger(selection.days)||![7,30].includes(selection.days))throw Error('invalid_patterns_selection');
      return {kind:'patterns',days:selection.days};
    }
    if(object(selection)&&Object.hasOwn(selection,'kind'))throw Error('invalid_analysis_selection');
    if (!object(selection) || !['day','week','month','year'].includes(selection.period)) throw Error('invalid_analysis_selection');
    const result = {period:selection.period};
    if (Object.hasOwn(selection,'anchor')) {
      const a = selection.anchor;
      if (typeof a !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(a) || !Number.isFinite(Date.parse(a)) ||
        new Date(a).toISOString().slice(0,10) !== a || a.slice(0,4) === '0000') throw Error('invalid_analysis_anchor');
      let today;
      try {
        const parts = new Intl.DateTimeFormat('en-US',{timeZone:ctx.zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
        const fields = Object.fromEntries(parts.map(p=>[p.type,p.value]));
        today = `${fields.year.padStart(4,'0')}-${fields.month}-${fields.day}`;
      } catch (_) { throw Error('measurement_timezone_unavailable'); }
      if (a > today) throw Error('future_analysis_anchor');
      result.anchor = a;
    }
    if (Object.hasOwn(selection,'comparison')) {
      const allowed = result.period === 'day' ? ['previous','same_weekday','mean7'] : ['previous','year_ago'];
      if (!allowed.includes(selection.comparison)) throw Error('invalid_analysis_comparison');
      result.comparison = selection.comparison;
    }
    return result;
  };
  const validate = (dto, selection, ctx) => {
    if (!object(dto) || dto.schema !== 2 || !hash(dto.snapshot_id) || !hash(dto.measurement_fingerprint) ||
      !Number.isFinite(stamp(dto.generated_at)) || !object(dto.context) || dto.context.measurement_timezone !== ctx.zone ||
      dto.context.period_kind !== selection.period || !object(dto.period) || dto.period.kind !== selection.period ||
      dto.period.timezone !== ctx.zone || !Number.isFinite(stamp(dto.period.start)) ||
      !Number.isFinite(stamp(dto.period.end)) || stamp(dto.period.end) <= stamp(dto.period.start) ||
      stamp(dto.period.end) > stamp(dto.generated_at) || !object(dto.totals) ||
      !['ready','partial'].includes(dto.status) || !object(dto.chart) || !Array.isArray(dto.chart.bins) ||
      dto.chart.timezone !== ctx.zone || !['ready','unknown'].includes(dto.chart.status) ||
      dto.chart.grain !== ({day:'hour',week:'day',month:'day',year:'month'})[selection.period] ||
      !dto.chart.bins.every(bin=>object(bin) && Number.isFinite(bin.from) && Number.isFinite(bin.to) && bin.to > bin.from &&
        Number.isFinite(stamp(bin.start)) && Number.isFinite(stamp(bin.end))) ||
      !object(dto.groups) || !['devices','areas','floors','unassigned','unmeasured'].every(k=>object(dto.groups[k]))) return false;
    if (selection.anchor && (!Number.isFinite(stamp(dto.period.local_start)) ||
      // Weekly/monthly/yearly anchors may be normalized to the period start by HA.
      dto.period.local_start.slice(0,10) > selection.anchor ||
      !Number.isFinite(stamp(dto.period.calendar_local_end)) ||
      selection.anchor >= dto.period.calendar_local_end.slice(0,10) ||
      dto.context.period_anchor !== dto.period.local_start.slice(0,10))) return false;
    if (selection.comparison && (dto.context.comparison_kind !== selection.comparison ||
      !object(dto.comparisons) || !object(dto.comparisons[selection.comparison]))) return false;
    if (!['kwh','energy_cost','variable_cost','usage_cost','fixed_cost','total_cost','effective_price'].every(k=>Object.hasOwn(dto.totals,k) && decimal(dto.totals[k]))) return false;
    // Validate finite numeric leaves, including money nested in groups/comparisons,
    // without converting or rounding any server value. Bound traversal as well.
    // Supported annual hours plus 512 consumers and their room/floor comparison
    // rows exceed 200k leaves; leave room for the bounded 32-version tariff DTO.
    let count = 0;
    const walk = (value, key = '', depth = 0) => {
      if (++count > 2000000 || depth > 40) return false;
      // Producer reconciliation evidence is boolean metadata, not a kWh amount.
      if (key === 'reconciles_recorded_kwh') return typeof value === 'boolean';
      if (value === null) return true;
      if (typeof value === 'number') return Number.isFinite(value);
      const money = /(?:^|_)(?:kwh|cost|rate|price)$/.test(key) || /^(?:energyRate|variableRate|fixedMonthly|fixed_monthly|legacy_combined_monthly)$/.test(key);
      if (money && !object(value) && !Array.isArray(value)) return decimal(value);
      if (Array.isArray(value)) return value.every(v=>walk(v,'',depth+1));
      if (object(value)) return Object.entries(value).every(([k,v])=>walk(v,k,depth+1));
      return ['string','boolean'].includes(typeof value);
    };
    return walk(dto);
  };
  const validatePatterns = (dto, selection, ctx) => {
    const hour=3600000,calendarDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
      Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    const integer=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
    const localDate=value=>{
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:ctx.zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
      const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${fields.year.padStart(4,'0')}-${fields.month}-${fields.day}`;
    };
    if(!object(dto)||dto.schema!==2||dto.kind!=='patterns'||!hash(dto.snapshot_id)||!hash(dto.measurement_fingerprint)||
      !Number.isFinite(stamp(dto.generated_at))||!['ready','partial'].includes(dto.status)||
      ['period','groups','buckets','alternatives'].some(k=>Object.hasOwn(dto,k))||!object(dto.context)||!object(dto.window)||!object(dto.patterns))return false;
    const c=dto.context,w=dto.window,p=dto.patterns,start=stamp(w.start),end=stamp(w.end),generated=stamp(dto.generated_at);
    if(c.request_kind!=='patterns'||c.access_purpose!=='analysis'||c.patterns_days!==selection.days||c.measurement_timezone!==ctx.zone||
      !hash(c.window_signature)||!hash(c.source_signature)||!hash(c.grid_source_signature)||
      !['entry_id','service_generation'].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<=256)||
      !['tariff_revision','feature_access_revision','registry_revision'].every(k=>integer(c[k]))||
      w.status!=='ready'||w.reason!==null||w.kind!=='rolling_local_dates'||w.days!==selection.days||w.timezone!==ctx.zone||
      !calendarDate(w.first_date)||!calendarDate(w.last_date)||Number(w.first_date.slice(0,4))<1900||Number(w.last_date.slice(0,4))>2200||typeof w.boundary_complete!=='boolean'||
      !Number.isFinite(start)||!Number.isFinite(end)||end<=start||start%hour!==0||end%hour!==0||
      stamp(w.query_start)!==start||stamp(w.query_end)!==end||Math.floor(generated/hour)*hour!==end||
      !integer(w.hours,768)||w.hours<=0||(end-start)/hour!==w.hours||!Number.isFinite(stamp(w.requested_local_start))||
      Math.ceil(stamp(w.requested_local_start)/hour)*hour!==start||w.boundary_complete!==(stamp(w.requested_local_start)===start)||w.requested_local_start.slice(0,10)!==w.first_date||
      !Array.isArray(p.days)||p.days.length<1||p.days.length>selection.days||!Array.isArray(p.hours)||p.hours.length!==w.hours||
      !Array.isArray(p.weekdays)||p.weekdays.length!==7||p.rounding_stage!=='period_components_then_day_then_hour'||
      p.fixed_fee_scope!=='household_period_only'||typeof p.partial_window!=='boolean'||
      !Array.isArray(dto.rates)||dto.rates.length>32||!object(dto.fees)||dto.fees.scope!=='household_period_only'||
      !object(dto.totals)||!object(dto.coverage)||!Array.isArray(dto.issues))return false;
    try{
      if(localDate(end-hour)!==w.last_date||new Date(Date.parse(w.last_date)-(selection.days-1)*86400000).toISOString().slice(0,10)!==w.first_date)return false;
      const dates=new Map(),ids=new Set();
      const numeric=['kwh','recorded_kwh','energy_cost','variable_cost','legacy_combined_cost','usage_cost'];
      const costs=known=>object(known)&&['energy_cost','variable_cost','legacy_combined_cost'].every(k=>Object.hasOwn(known,k)&&decimal(known[k]));
      const rowBase=row=>object(row)&&Number.isSafeInteger(row.from)&&Number.isSafeInteger(row.to)&&row.to>row.from&&row.from>=start&&row.to<=end&&
        stamp(row.start)===row.from&&stamp(row.end)===row.to&&stamp(row.local_start)===row.from&&stamp(row.local_end)===row.to&&
        row.timezone===ctx.zone&&calendarDate(row.local_date)&&localDate(row.from)===row.local_date&&
        (row.fold===0||row.fold===1)&&typeof row.complete==='boolean'&&numeric.every(k=>Object.hasOwn(row,k)&&decimal(row[k]))&&
        costs(row.known_costs)&&(row.currency===null||typeof row.currency==='string'&&/^[A-Z]{3}$/.test(row.currency))&&(row.price_basis===null||['gross','net'].includes(row.price_basis))&&
        !Object.hasOwn(row,'fixed_cost')&&!Object.hasOwn(row,'total_cost');
      let previous=null;
      for(const row of p.days){
        if(!rowBase(row)||row.id!==row.local_date||row.id<w.first_date||row.id>w.last_date||dates.has(row.id)||
          previous!==null&&row.from<previous||!Number.isSafeInteger(row.calendar_from)||!Number.isSafeInteger(row.calendar_to)||row.calendar_to<=row.calendar_from||
          row.from<row.calendar_from-hour||row.to>row.calendar_to+hour||typeof row.calendar_complete!=='boolean'||
          !integer(row.expected_seconds,172800)||row.expected_seconds!==(row.calendar_to-row.calendar_from)/1000||
          !integer(row.measured_seconds,172800)||row.measured_seconds>row.expected_seconds+3600||
          row.complete&&(row.kwh===null||!row.calendar_complete||row.from!==row.calendar_from||row.to!==row.calendar_to||row.status!=='ready')||
          !row.complete&&(row.kwh!==null||row.status!=='partial'||['energy_cost','variable_cost','legacy_combined_cost','usage_cost'].some(k=>row[k]!==null)))return false;
        dates.set(row.id,{row,first:null,last:null});previous=row.to;
      }
      let cursor=start;
      for(const row of p.hours){
        if(!rowBase(row)||row.id!==String(row.from)||ids.has(row.id)||row.from!==cursor||row.to-row.from!==hour||
          row.expected_seconds!==3600||row.measured_seconds!==(row.complete?3600:0)||!dates.has(row.local_date)||
          row.complete&&(row.kwh===null||row.status!=='ready')||!row.complete&&(row.kwh!==null||row.status!=='unknown')||
          !object(row.raw_costs)||!costs(row.raw_costs)||typeof row.crosses_local_date!=='boolean'||!Array.isArray(row.tariff_zones))return false;
        ids.add(row.id);cursor=row.to;const day=dates.get(row.local_date);if(day.first===null)day.first=row.from;day.last=row.to;
      }
      if(cursor!==end||[...dates.values()].some(d=>d.first!==d.row.from||d.last!==d.row.to)||
        p.represented_days!==p.days.length||p.measured_days!==p.days.filter(d=>d.recorded_kwh!==null).length||
        p.complete_days!==p.days.filter(d=>d.complete).length)return false;
      const weekdays=new Set();
      for(const row of p.weekdays){if(!object(row)||!integer(row.weekday,6)||weekdays.has(row.weekday)||!integer(row.count,selection.days)||
        !decimal(row.kwh)||row.count===0&&row.kwh!==null||row.count>0&&row.kwh===null)return false;weekdays.add(row.weekday);}
    }catch(_){return false;}
    let count=0;
    const walk=(value,key='',depth=0)=>{
      if(++count>500000||depth>24)return false;
      if(value===null)return true;
      if(typeof value==='number')return Number.isFinite(value);
      if((/(?:^|_)(?:kwh|cost|rate|price)$/.test(key)||['energyRate','variableRate','subscription','capacity','distribution','other','legacy_combined_monthly','fixedMonthly'].includes(key))&&!object(value)&&!Array.isArray(value))return decimal(value)&&String(value).length<=1024;
      if(Array.isArray(value))return value.length<=10000&&value.every(v=>walk(v,'',depth+1));
      if(object(value))return Object.entries(value).every(([k,v])=>k.length<=256&&walk(v,k,depth+1));
      return typeof value==='boolean'||typeof value==='string'&&value.length<=16384;
    };
    return ['kwh','energy_cost','variable_cost','usage_cost','fixed_cost','total_cost','effective_price'].every(k=>Object.hasOwn(dto.totals,k)&&decimal(dto.totals[k]))&&walk(dto);
  };
  const current = job => mounted && job.epoch === epoch && equal(job.context, observe());
  const pump = () => {
    if (raw || !queued) return;
    const job = queued; queued = null;
    if (!current(job)) { job.resolve(state()); return; }
    raw = job;
    const h = card._hass;
    let request;
    try { request = Promise.resolve(h.callWS(job.selection.kind==='patterns'?{type:'ha_tools_email/energy_patterns',days:job.selection.days}:{type:'ha_tools_email/energy_analysis',...job.selection})); }
    catch (error) { request = Promise.reject(error); }
    // Both settlement branches are attached immediately; stale errors never escape.
    request.then(dto => {
      if (!current(job)) return;
      if (!(job.selection.kind==='patterns'?validatePatterns(dto,job.selection,job.context):validate(dto,job.selection,job.context))) throw Error(job.selection.kind==='patterns'?'invalid_patterns_response':'invalid_analysis_response');
      const snapshot = copy(dto);
      cache = {key:job.key,at:Date.now(),snapshot};
      set('ready',job.selection,snapshot);
    }).catch(error => {
      if (current(job)) { cache = null; set('error',job.selection,null,
        typeof error?.code === 'string' ? error.code : ['invalid_analysis_response','invalid_patterns_response'].includes(error?.message) ? error.message : 'energy_analysis_unavailable'); }
    }).then(() => {
      if (raw === job) raw = null;
      job.resolve(state()); pump();
    });
  };
  const read = selection => {
    const ctx = observe();
    let selected;
    try { selected = normalize(selection,ctx); }
    catch (error) { clear(); set('error',null,null,error.message); return Promise.resolve(state()); }
    if (!ctx.available || typeof ctx.zone !== 'string' || !ctx.zone) return Promise.resolve(state());
    const key = JSON.stringify(selected);
    if (cache?.key === key && Date.now() >= cache.at && Date.now()-cache.at < ttl) return Promise.resolve(state());
    if (queued?.key === key && queued.epoch === epoch) return queued.promise.then(copy);
    if (raw?.key === key && raw.epoch === epoch) return raw.promise.then(copy);
    clear();
    let resolve;
    const promise = new Promise(done=>{resolve=done;});
    queued = {selection:selected,key,context:ctx,epoch,promise,resolve};
    set('loading',selected); pump(); return promise.then(copy);
  };
  const invalidate = () => { clear(); observe(); emit(); };
  const connect = () => { if (!mounted) { mounted = true; observe(); } };
  const disconnect = () => { mounted = false; clear(); identity = context(); emit(); };
  return {read,invalidate,connect,disconnect,state};
}
// Only an active analysis view owns these subscriptions; never auto-load cards.
function createEnergyAnalysisBindingV53({card, controller, onInvalidate = () => {}}) {
  let generation=0, intent=0, identity=null, activation=null, enabled=false, failure=null, access='pending', probe=null;
  const subscriptions=new Set();
  const context=()=>({connection:card?._hass?.connection,user:card?._hass?.user?.id,
    active:card?._hass?.user?.is_active,admin:card?._hass?.user?.is_admin,online:card?._hass?.connected,zone:card?._hass?.config?.time_zone,available:card?.isConnected!==false &&
    card?._hass?.connected!==false && card?._hass?.connection?.connected!==false && card?._hass?.user?.is_active!==false && !!card?._hass?.user?.id});
  const same=(a,b)=>a && b && a.connection===b.connection && a.user===b.user &&
    a.zone===b.zone && a.active===b.active && a.admin===b.admin && a.online===b.online && a.available===b.available;
  const stop=()=>{
    generation++;intent++;enabled=false;identity=null;activation=null;failure=null;access='pending';probe=null;
    for(const unsubscribe of subscriptions) {try{unsubscribe();}catch(_){} }
    subscriptions.clear();controller.disconnect();
  };
  const start=()=>{
    const next=context();
    if(enabled && same(identity,next))return activation;
    stop();
    if(!next.available)return Promise.resolve(false);
    if(typeof next.connection?.subscribeMessage!=='function') {failure='analysis_subscription_unavailable';return Promise.resolve(false);}
    enabled=true;identity=next;controller.connect();
    const token=generation;
    const current=()=>enabled && token===generation && same(next,context());
    activation=Promise.resolve().then(()=>{
      if(!current())return null;
      return next.connection.subscribeMessage(()=>{
        if(!current() || access!=='ack')return;
        controller.invalidate();onInvalidate();
      },{type:'ha_tools_email/subscribe_analysis_updates'});
    }).then(unsubscribe=>{
      if(typeof unsubscribe!=='function') {if(current())throw Error('analysis_subscription_unavailable');return false;}
      if(!current()){try{unsubscribe();}catch(_){}return false;}
      subscriptions.add(unsubscribe);access='ack';return true;
    }).catch(error=>{
      if(current() && error?.code==='unknown_command') {access='probe';return true;}
      if(current()){stop();failure='analysis_subscription_unavailable';}return false;
    });
    return activation;
  };
  const read=async selection=>{
    const ready=start(), selected=++intent;
    if(await ready && enabled && selected===intent && same(identity,context())) {
      if(access==='ack')return controller.read(selection);
      if(selection?.kind==='patterns'){stop();failure='patterns_backend_upgrade_required';return observe();}
      if(access==='legacy')return observe();
      if(access==='probe' || access==='probing') {
        // Share the single controller probe across selection changes. Observe
        // masks synchronous controller onChange until classification finishes.
        if(!probe) {
          access='probing';
          const token=generation;
          probe=(async()=>{
            const result=await controller.read(selection);
            if(token!==generation || !enabled || !same(identity,context()))return;
            if(result.status==='error' && result.error==='unknown_command') {
              access='legacy';return;
            }
            stop();failure='analysis_subscription_unavailable';
          })();
        }
        await probe;
      }
    }
    return observe();
  };
  const observe=()=>{
    if(enabled && !same(identity,context()))stop();
    if(enabled && access!=='ack' && access!=='legacy')return {status:'loading',selection:null,snapshot:null,error:null};
    return failure ? {status:'error',selection:null,snapshot:null,error:failure} : controller.state();
  };
  // A confirmed tariff revision or existing guard invalidation uses this path.
  const invalidate=()=>{controller.invalidate();if(enabled)onInvalidate();};
  return {read,observe,stop,invalidate};
}
if(typeof module!=='undefined' && module.exports)module.exports={createEnergyAnalysisBindingV53};
// Pure schema-2 presentation. The owner supplies snapshots and binds data-analysis-action.

var energyAnalysisFlowIdV53 = 0;
function createEnergyAnalysisViewV53({card, format} = {}) {
  const flowHatchId='analysis-flow-hatch-'+(++energyAnalysisFlowIdV53);
  const ui = format || createFormatUi.forHass(card?._hass);
  const language = card?._hass?.locale?.language || card?._hass?.language || 'en';
  const pl = String(language).startsWith('pl');
  const t = (en, polish) => pl ? polish : en;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unknown = () => t('No data', 'Brak danych');
  const valid = value => typeof value === 'string' ? /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value) && Number.isFinite(Number(value)) : typeof value === 'number' && Number.isFinite(value);
  // Pass Decimal strings directly to the shared Intl formatter. Never reprice or round a bill here.
  const number = (value, options) => valid(value) ? ui.number(value, options) : unknown();
  const quantity = (value, unit = 'kWh', signed = false) => valid(value)
    ? `${signed && !String(value).startsWith('-') && /[1-9]/.test(String(value).split(/[eE]/)[0]) ? '+' : ''}${number(value)}${unit === '%' ? '' : ' '}${unit}` : unknown();
  const money = (value, currency, signed = false) => quantity(value, currency || t('currency unknown','waluta nieznana'), signed);
  // Presentation only: exact server values remain in Data and named details.
  const briefEnergy=value=>valid(value)?`${number(value,{maximumSignificantDigits:6})} kWh`:unknown();
  const dateTime = value => {
    // Dynamic tariffs allow epoch milliseconds as well as ISO instants.
    if (typeof value === 'number') {
      const instant = new Date(value);
      value = Number.isFinite(instant.getTime()) ? instant.toISOString() : null;
    }
    return ui.dateTime(value) || unknown();
  };
  const range = period => ui.range(period?.start, period?.end) || unknown();
  // Calendar-only dates retain their day while following the user's date locale.
  const date = (value, short = false) => {
    if (typeof value !== 'string') return unknown();
    return (/^\d{4}-\d{2}-\d{2}$/.test(value) ? ui.calendarDate(value, short) : ui.date(value, short)) || unknown();
  };
  const basis = value => value === 'gross' ? t('gross','brutto') : value === 'net' ? t('net','netto') : unknown();
  const percentage = value => valid(value) ? ui.number(value, {style:'percent',maximumFractionDigits:1}) : unknown();
  const coverage = value => {
    if (valid(value)) return percentage(value);
    if (!value) return unknown();
    if (valid(value.ratio)) return percentage(value.ratio);
    if (valid(value.observed_hours) && valid(value.expected_hours)) return `${number(value.observed_hours)} / ${number(value.expected_hours)} ${t('hours','godzin')}`;
    if (valid(value.measured_source_seconds) && valid(value.expected_source_seconds)) return `${number(value.measured_source_seconds)} / ${number(value.expected_source_seconds)} s`;
    return unknown();
  };
  const table = (caption, columns, rows, attrs = '', rowAttribute = '') => `<div class="analysis-table-wrap"><table ${attrs}><caption>${esc(caption)}</caption><thead><tr>${columns.map(c=>`<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row,rowIndex)=>`<tr${rowAttribute ? ` ${rowAttribute}="${rowIndex}"` : ''}>${row.map((cell,i)=>`<${i ? 'td' : 'th scope="row"'}>${cell}</${i ? 'td' : 'th'}>`).join('')}</tr>`).join('') : `<tr><td colspan="${columns.length}">${esc(unknown())}</td></tr>`}</tbody></table></div>`;
  const button = (action, value, label, selected) => `<button type="button" data-analysis-action="${action}" data-analysis-value="${esc(value)}"${selected === undefined ? '' : ` aria-pressed="${selected}"`}>${esc(label)}</button>`;
  const select = (action, label, choices, selected) => `<label>${esc(label)}<select data-analysis-action="${action}" data-analysis-value="${esc(selected)}">${choices.map(([value,text])=>`<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const periods = [['day',t('Day','Dzień')],['week',t('Week','Tydzień')],['month',t('Month','Miesiąc')],['year',t('Year','Rok')]];
  const comparisons = {previous:t('Previous period','Poprzedni okres'),same_weekday:t('Same weekday','Ten sam dzień tygodnia'),mean7:t('Mean of 7 previous days','Średnia z 7 poprzednich dni'),year_ago:t('Same period last year','Ten sam okres rok temu')};
  const groupLabel = (groups, level, id) => {
    const devices = groups?.devices || {};
    if (level === 'devices') return devices[id]?.name || t('Unnamed device','Urządzenie bez nazwy');
    if (id === '__no_floor__') return t('No floor','Bez piętra');
    const key = level === 'areas' ? 'area' : 'floor';
    return Object.values(devices).find(row=>row[key+'_id'] === id && row[key+'_name'])?.[key+'_name'] || t('Unnamed group','Grupa bez nazwy');
  };
  // Exact ordering of server decimal values; Number conversion is reserved for bar geometry below.
  const parts = value => {
    const text=String(value), match=/^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    const digits=(match[2]+(match[3] || '')).replace(/^0+/,'');
    return {sign:!digits?0:match[1]==='-'?-1:1,digits,
      magnitude:digits.length+Number(match[4] || 0)-(match[3] || '').length};
  };
  const compare = (a,b) => {
    const x=parts(a),y=parts(b);
    if(x.sign!==y.sign)return x.sign-y.sign;
    if(!x.sign)return 0;
    const size=Math.max(x.digits.length,y.digits.length);
    const xd=x.digits.padEnd(size,'0'),yd=y.digits.padEnd(size,'0');
    return x.sign*(x.magnitude-y.magnitude || (xd>yd?1:xd<yd?-1:0));
  };
  const rowsFor = (groups, level, metadata = groups) => {
    const rows = Object.entries(groups?.[level] || {}).map(([id,row])=>({id,label:groupLabel(metadata,level,id),row}));
    rows.sort((a,b)=> valid(a.row.kwh) && valid(b.row.kwh) ? compare(b.row.kwh,a.row.kwh) : valid(a.row.kwh) ? -1 : valid(b.row.kwh) ? 1 : 0);
    if (level === 'areas' && groups?.unassigned) rows.push({id:'unassigned',label:t('No room','Bez pokoju'),row:groups.unassigned});
    if (groups?.unmeasured) rows.push({id:'unmeasured',label:t('Unmeasured','Niezmierzone'),row:groups.unmeasured});
    return rows;
  };
  const width = (value, max) => valid(value) && Number.isFinite(Number(value)) && max > 0 ? Math.min(100,Math.abs(Number(value))/max*100) : 0;
  const maximum = values => Math.max(0,...values.filter(valid).map(value=>Math.abs(Number(value))).filter(Number.isFinite));
  const tiles = (snapshot, overview=false) => {
    const total=snapshot.totals || {}, supplied=overview&&Object.hasOwn(snapshot,'period_summary');
    const base=[
      [t('Consumption','Zużycie'),quantity(total.kwh)], [t('Cost','Koszt'),money(total.total_cost,total.currency)],
      [t('Effective price','Cena efektywna'),money(total.effective_price,total.currency) + (valid(total.effective_price) ? '/kWh' : '')],
      [t('Measurement coverage','Pokrycie pomiarów'),coverage(snapshot.coverage)]
    ];
    if(!supplied)return `<div class="analysis-tiles">${base.map(([label,value],index)=>`<div class="analysis-tile ${index<2?'analysis-tile-primary':'analysis-tile-secondary'}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('')}</div>`;
    const frame=periodWindow(snapshot),share=shareProof(snapshot,frame),peak=peakProof(snapshot,frame);
    const knownPeak=peak&&peak.kwh!==null,localPeak=knownPeak&&peak.reason!=='measurement_timezone_unavailable',partialPeak=peak&&(peak.status==='partial'||knownPeak&&!snapshot.totals?.measurement_complete);
    const shareNote=share?.reason==='zero_total_kwh'?t('No share for a zero energy total','Brak udziału przy zerowym zużyciu'):share?.status==='ready'?quantity(share.known_cheap_kwh):t('Full-period share unavailable','Brak udziału za cały okres');
    return `<div class="analysis-tiles">${base.slice(0,2).map(([label,value],index)=>`<div class="analysis-tile analysis-tile-primary"><span>${esc(label)}</span><strong>${esc(value)}</strong>${index===1?`<span>${esc(base[2][0])}: ${esc(base[2][1])}</span>`:''}</div>`).join('')}
      <div class="analysis-tile analysis-tile-secondary" data-analysis-cheap-share><span>${esc(t('Cheap-zone share','Udział taniej strefy'))}</span><strong>${esc(share?.status==='ready'?percentage(share.ratio):unknown())}</strong><span>${esc(shareNote)}</span></div>
      <div class="analysis-tile analysis-tile-secondary" data-analysis-peak${knownPeak?` data-analysis-peak-id="${esc(peak.id)}"`:''}><span>${esc(partialPeak?t('Highest observed hour','Najwyższe zarejestrowane zużycie'):t('Highest hour','Godzina szczytu'))}</span><strong>${esc(localPeak?ui.clock(peak.start,true)||unknown():unknown())}</strong><span>${esc(knownPeak?quantity(peak.kwh)+(localPeak?' · '+date(peak.start):''):unknown())}</span>${partialPeak?`<span>${esc(t('Incomplete period','Niepełny okres'))}</span>`:''}${peak?.reason==='measurement_timezone_unavailable'?`<span>${esc(t('Measurement time zone unavailable','Brak strefy czasu pomiarów'))}</span>`:''}</div></div>`;
  };
  const baselineNote = () => `<p data-analysis-baseline="unknown">${esc(t('No matching comparison is available for these intervals.','Brak dopasowanego porównania dla tych przedziałów.'))}</p>`;
  const instant = value => {
    if(typeof value==='number')return Number.isSafeInteger(value)?value:null;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
    const stamp=Date.parse(value);return Number.isSafeInteger(stamp)?stamp:null;
  };
  const bounds=(from,to)=>{const a=instant(from),b=instant(to);return a!==null&&b!==null&&b>a?{from:a,to:b,key:a+'|'+b}:null;};
  const intervalText=value=>value?`${ui.pointLabel(new Date(value.from).toISOString())||unknown()} – ${ui.pointLabel(new Date(value.to).toISOString())||unknown()}`:unknown();
  const seconds=value=>Number.isSafeInteger(value)&&value>=0;
  // A producer marker is usable only with its complete projection contract.
  // No local-calendar reconstruction, array zipping, amount arithmetic or mean.
  const markerSeries=(snapshot,kind)=>{
    const comparison=snapshot.comparisons?.[kind],source=comparison?.chart,main=snapshot.chart;
    const empty={accepted:false,markers:new Map(),reconciles:false,mean:kind==='mean7',common:false};
    if(comparison?.status!=='ready'||!['ready','partial'].includes(source?.status)||!['ready','partial'].includes(main?.status)||
      !['hour','day','month'].includes(main.grain)||source.grain!==main.grain||source.timezone!==main.timezone||
      typeof source.timezone!=='string'||!source.timezone||source.coverage_kind!=='selected_household_comparison_mask'||
      source.fixed_fee_scope!=='household_period_only'||typeof source.reconciles_comparison_energy!=='boolean'||
      !['calendar_totals','common_measurements'].includes(source.comparison_scope)||source.comparison_scope!==comparison.comparison_scope||
      !Array.isArray(source.markers)||source.status==='ready'&&source.reason!==null)return empty;
    const mean=kind==='mean7',common=source.comparison_scope==='common_measurements';
    const periods=mean&&Array.isArray(source.baseline_periods)?source.baseline_periods.map(p=>bounds(p?.from,p?.to)):[];
    if(mean&&(source.baseline_aggregation!=='mean7'||periods.length!==7||periods.some(p=>!p)||new Set(periods.map(p=>p.key)).size!==7||periods.some((p,i)=>periods.some((q,j)=>i!==j&&p.from<q.to&&q.from<p.to))))return empty;
    const mainKeys=new Map(),currentKeys=new Map(),baselineKeys=new Map();
    const count=(map,key)=>{if(key)map.set(key,(map.get(key)||0)+1);};
    for(const row of main.bins||[])count(mainKeys,bounds(row.start,row.end)?.key);
    for(const marker of source.markers){
      if(!marker||typeof marker!=='object')continue;
      count(currentKeys,bounds(marker.current_from,marker.current_to)?.key);
      if(mean){for(const [i,p] of (Array.isArray(marker.baseline_ranges)?marker.baseline_ranges:[]).entries())count(baselineKeys,i+'|'+(bounds(p?.from,p?.to)?.key||''));}
      else count(baselineKeys,bounds(marker.baseline_from,marker.baseline_to)?.key);
    }
    const markers=new Map();
    for(const marker of source.markers){
      if(!marker||typeof marker!=='object')continue;
      const current=bounds(marker.current_from,marker.current_to);
      if(!current||mainKeys.get(current.key)!==1||currentKeys.get(current.key)!==1||marker.status!=='ready'||marker.reason!==null||
        !valid(marker.current_kwh)||!valid(marker.baseline_kwh)||!seconds(marker.expected_current_source_seconds)||
        !seconds(marker.selected_current_source_seconds)||marker.selected_current_source_seconds<=0||
        marker.selected_current_source_seconds>marker.expected_current_source_seconds)continue;
      const mapping=mean?(common?'mean7_common_source_frame_intersection':'mean7_calendar_frames'):(common?'common_source_frame_intersection':'calendar_frame_bijection');
      if(marker.mapping!==mapping||!common&&marker.selected_current_source_seconds!==marker.expected_current_source_seconds)continue;
      let ranges;
      if(mean){
        if(marker.baseline_aggregation!=='mean7'||marker.baseline_from!==null||marker.baseline_to!==null||
          !Array.isArray(marker.baseline_ranges)||marker.baseline_ranges.length!==7||
          !Array.isArray(marker.expected_baseline_source_seconds)||marker.expected_baseline_source_seconds.length!==7||
          !Array.isArray(marker.selected_baseline_source_seconds)||marker.selected_baseline_source_seconds.length!==7)continue;
        ranges=marker.baseline_ranges.map(p=>bounds(p?.from,p?.to));
        if(ranges.some((p,i)=>!p||p.from<periods[i].from||p.to>periods[i].to||baselineKeys.get(i+'|'+p.key)!==1)||new Set(ranges.filter(Boolean).map(p=>p.key)).size!==7||
          marker.expected_baseline_source_seconds.some((v,i)=>!seconds(v)||!seconds(marker.selected_baseline_source_seconds[i])||
            marker.selected_baseline_source_seconds[i]<=0||marker.selected_baseline_source_seconds[i]>v||
            marker.selected_baseline_source_seconds[i]!==marker.selected_current_source_seconds||(!common&&marker.selected_baseline_source_seconds[i]!==v)))continue;
      }else{
        const baseline=bounds(marker.baseline_from,marker.baseline_to);
        if(!baseline||baselineKeys.get(baseline.key)!==1||!seconds(marker.expected_baseline_source_seconds)||!seconds(marker.selected_baseline_source_seconds)||
          marker.selected_baseline_source_seconds<=0||marker.selected_baseline_source_seconds>marker.expected_baseline_source_seconds||
          marker.selected_baseline_source_seconds!==marker.selected_current_source_seconds||(!common&&marker.selected_baseline_source_seconds!==marker.expected_baseline_source_seconds))continue;
        ranges=[baseline];
      }
      markers.set(current.key,{current:marker.current_kwh,baseline:marker.baseline_kwh,ranges});
    }
    return {accepted:true,markers,mean,common,reconciles:source.status==='ready'&&source.reconciles_comparison_energy&&markers.size===(main.bins||[]).length&&source.markers.length===markers.size&&markers.size>0};
  };
  const zoneProof=(row,options)=>{
    const z=row?.zone_breakdown;
    if(!z||!(options?.period===true?['ready','partial','unknown']:['ready','partial']).includes(z.status)||z.scope!=='complete_household_hours'||z.fixed_fee_scope!=='household_period_only'||
      typeof z.reconciles_recorded_kwh!=='boolean'||typeof z.reconciles_known_costs!=='boolean'||
      !Array.isArray(z.zones)||!z.unattributed||typeof z.unattributed!=='object'||z.status==='ready'&&z.reason!==null)return null;
    const keys=new Set();
    for(const zone of z.zones){
      if(!zone||typeof zone.version_id!=='string'||!zone.version_id||typeof zone.zone_id!=='string'||!zone.zone_id||typeof zone.complete!=='boolean'||
        z.status==='ready'&&!zone.complete)return null;
      const key=JSON.stringify([zone.version_id,zone.zone_id]);if(keys.has(key))return null;keys.add(key);
    }
    return z;
  };
  // Explicit server classification gets a semantic color; other zones use identity colors.
  // Labels, rates and amounts never infer a classification.
  const zoneColor=(version,zone,snapshot)=>{
    const rates=(snapshot?.rates||[]).filter(rate=>rate.version_id===version);
    const matches=rates.length===1?rates[0].profile?.zones?.filter(row=>row.id===zone)||[]:[];
    if(matches.length===1&&matches[0].classification==='cheap')return 'var(--analysis-zone-cheap,#1baf7a)';
    if(matches.length===1&&matches[0].classification==='expensive')return 'var(--analysis-zone-expensive,#2a78d6)';
    let hash=0;for(const char of JSON.stringify([version,zone]))hash=(hash*31+char.charCodeAt(0))>>>0;
    return ['#287fd1','#8754b3','#c76428','#bc447b','#238782','#92821a','#64748b','#a54444'][hash%8];
  };
  const zoneEntries=(snapshot,row,{period=false}={})=>{
    const proof=zoneProof(row,{period});if(!proof)return null;
    const currency=typeof proof.currency==='string'&&/^[A-Z]{3}$/.test(proof.currency)&&['gross','net'].includes(proof.price_basis)?proof.currency:null;
    const amount=value=>currency?money(value,currency):unknown();
    const components=known=>[
      [t('Known energy cost','Znany koszt energii'),known?.energy_cost],
      [t('Known distribution cost','Znany koszt dystrybucji'),known?.variable_cost],
      [t('Known legacy usage cost','Znany dawny koszt zużycia'),known?.legacy_combined_cost]
    ].map(([label,value])=>`${label}: ${amount(value)}`).join(' · ');
    const entries=proof.zones.filter(zone=>zone&&typeof zone.version_id==='string'&&typeof zone.zone_id==='string').map(zone=>{
      const rate=(snapshot.rates||[]).find(r=>r.version_id===zone.version_id);
      const label=typeof zone.label==='string'&&zone.label&&zone.label!==zone.zone_id?zone.label:t('Unnamed tariff zone','Strefa taryfy bez nazwy');
      const version=rate?`${t('Rates from','Stawki od')} ${date(rate.valid_from)}${rate.valid_to?' – '+date(rate.valid_to):''}`:t('Rate version unavailable','Wersja stawek niedostępna');
      const complete=proof.status==='ready'&&zone.complete===true;
      const value=complete?quantity(zone.kwh):`${t('Recorded','Zarejestrowano')}: ${quantity(zone.recorded_kwh)}`;
      return {key:zone.version_id+'|'+zone.zone_id,color:zoneColor(zone.version_id,zone.zone_id,snapshot),text:`${label} · ${version} · ${value} · ${t('Usage cost','Koszt zużycia')}: ${amount(complete?zone.usage_cost:null)} · ${components(zone.known_costs)} · ${t('Measured time','Czas pomiaru')}: ${quantity(zone.measured_seconds,'s')}`};
    });
    const u=proof.unattributed;
    // Missing, measured-but-unattributed, and a genuine recorded zero remain distinct.
    entries.push({key:null,color:null,text:`${t('Unattributed','Bez przypisania do strefy')} · ${t('Recorded','Zarejestrowano')}: ${quantity(u.recorded_kwh)} · ${components(u.known_costs)} · ${t('Measured time','Czas pomiaru')}: ${quantity(u.measured_seconds,'s')} · ${t('Missing time','Brakujący czas')}: ${quantity(u.missing_seconds,'s')}`});
    return {entries,note:`${currency||t('Currency unavailable','Waluta niedostępna')} · ${basis(proof.price_basis)} · ${proof.status==='ready'&&proof.reconciles_recorded_kwh?(period?t('Complete selected-period breakdown','Pełne rozbicie wybranego okresu'):t('Complete interval breakdown','Pełne rozbicie przedziału')):(period?t('Selected period; known recorded amounts only','Wybrany okres; tylko znane zarejestrowane kwoty'):t('Partial interval; known amounts only','Niepełny przedział; tylko znane kwoty'))}${proof.reconciles_recorded_kwh?'':' · '+(period?t('Selected-period energy is not reconciled','Energia wybranego okresu nie jest uzgodniona'):t('Interval energy is not reconciled','Energia przedziału nie jest uzgodniona'))}${proof.reconciles_known_costs?'':' · '+t('Known costs are not fully reconciled','Znane koszty nie są w pełni uzgodnione')}`};
  };
  const zonesMarkup=(snapshot,row)=>{
    const result=zoneEntries(snapshot,row);
    return result?`<div data-analysis-zone-values><p>${esc(result.note)}</p><ul>${result.entries.map(entry=>`<li${entry.key!==null?` data-analysis-zone-key="${esc(entry.key)}" style="border-inline-start:6px solid ${entry.color};padding-inline-start:8px"`:' data-analysis-zone-unattributed'}>${esc(entry.text)}</li>`).join('')}</ul></div>`:`<span data-analysis-zone-values>${esc(t('No tariff-zone breakdown for this interval','Brak rozbicia stref dla tego przedziału'))}</span>`;
  };
  // Whole-period facts are independent server proofs. Never total chart bins,
  // derive a share, choose a peak or allocate fixed fees in this presentation.
  const decimal=(value,plain=false)=>typeof value==='string'&&(plain?/^[+-]?\d+(?:\.\d+)?$/:/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/).test(value)&&valid(value);
  const nonnegative=(value,plain=false)=>decimal(value,plain)&&compare(value,'0')>=0;
  const moneyFields=['energy_cost','variable_cost','legacy_combined_cost'];
  const periodWindow=snapshot=>{
    const p=snapshot.period,w=snapshot.period_summary?.window,frame=bounds(p?.start,p?.end);
    if(!frame||!w||typeof p.start!=='string'||typeof p.end!=='string'||typeof p.timezone!=='string'||!p.timezone||
      w.start!==p.start||w.end!==p.end||w.timezone!==p.timezone)return null;
    let timezoneKnown=true;try {new Intl.DateTimeFormat('en',{timeZone:p.timezone});}catch(_){timezoneKnown=false;}
    return {...frame,timezone:p.timezone,timezoneKnown};
  };
  const shareProof=(snapshot,frame)=>{
    const value=snapshot.period_summary?.cheap_zone_share,complete=snapshot.totals?.measurement_complete;
    if(!frame||!value||!['ready','partial','unknown'].includes(value.status)||value.scope!=='complete_household_hours'||
      value.classification_source!=='explicit_tariff_classification'||typeof complete!=='boolean'||snapshot.coverage?.complete!==complete)return null;
    const known=nonnegative(value.known_cheap_kwh,true)&&nonnegative(value.classified_kwh,true)&&compare(value.known_cheap_kwh,value.classified_kwh)<=0;
    const total=nonnegative(value.total_kwh,true)&&decimal(snapshot.totals.kwh)&&compare(value.total_kwh,snapshot.totals.kwh)===0;
    if(value.status==='ready')return value.reason===null&&complete&&known&&total&&compare(value.total_kwh,'0')>0&&compare(value.classified_kwh,value.total_kwh)===0&&
      nonnegative(value.ratio,true)&&compare(value.ratio,'1')<=0?value:null;
    if(value.ratio!==null)return null;
    if(value.status==='partial')return known&&(
      value.reason==='incomplete_household_measurements'&&!complete&&value.total_kwh===null||
      value.reason==='incomplete_classification'&&complete&&total&&compare(value.total_kwh,'0')>0&&compare(value.classified_kwh,value.total_kwh)<=0)?value:null;
    if(value.reason==='no_recorded_hours')return !complete&&value.known_cheap_kwh===null&&value.classified_kwh===null&&value.total_kwh===null?value:null;
    if(value.reason==='zero_total_kwh')return complete&&known&&total&&compare(value.total_kwh,'0')===0&&compare(value.classified_kwh,'0')===0?value:null;
    return ['tariff_unavailable','classification_unavailable'].includes(value.reason)&&complete&&known&&total&&compare(value.total_kwh,'0')>0&&compare(value.classified_kwh,'0')===0?value:null;
  };
  const localProof=(literal,stamp,zone)=>{
    if(typeof literal!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}:\d{2}$/.test(literal)||instant(literal)!==stamp)return false;
    try {
      const fields=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(stamp)).map(part=>[part.type,part.value]));
      return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}:${fields.second}`===literal.slice(0,19);
    }catch(_){return false;}
  };
  const peakProof=(snapshot,frame)=>{
    const p=snapshot.period_summary?.peak_hour,complete=snapshot.totals?.measurement_complete;
    if(!frame||!p||!['ready','partial','unknown'].includes(p.status)||p.scope!=='complete_household_hours'||typeof complete!=='boolean'||snapshot.coverage?.complete!==complete)return null;
    if(p.status==='unknown'&&p.reason==='no_recorded_hours')return !complete&&p.tied_count===0&&['id','from','to','start','end','local_start','local_end','fold','end_fold','kwh'].every(key=>p[key]===null)?p:null;
    if(!Number.isSafeInteger(p.from)||!Number.isSafeInteger(p.to)||p.to-p.from!==3600000||p.from<frame.from||p.to>frame.to||
      p.id!==p.from+':'+p.to||instant(p.start)!==p.from||instant(p.end)!==p.to||
      !Number.isSafeInteger(p.tied_count)||p.tied_count<1||p.tied_count>(frame.to-frame.from)/3600000||!nonnegative(p.kwh,true))return null;
    if(p.status==='unknown')return p.reason==='measurement_timezone_unavailable'&&!frame.timezoneKnown&&['local_start','local_end','fold','end_fold'].every(key=>p[key]===null)?p:null;
    if(p.status==='ready'?(p.reason!==null||!complete):(p.reason!=='incomplete_period'||complete))return null;
    return frame.timezoneKnown&&[0,1].includes(p.fold)&&[0,1].includes(p.end_fold)&&localProof(p.local_start,p.from,frame.timezone)&&localProof(p.local_end,p.to,frame.timezone)?p:null;
  };
  const periodZoneProof=(snapshot,frame)=>{
    const z=zoneProof(snapshot.period_summary,{period:true});if(!frame||!z)return null;
    const complete=snapshot.totals?.measurement_complete,secondsInWindow=(frame.to-frame.from)/1000;
    const calendar=value=>value===null||typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&ui.calendarDate(value)!==null;
    const duration=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=secondsInWindow;
    const known=value=>value&&typeof value==='object'&&moneyFields.every(key=>value[key]===null||decimal(value[key]));
    const currency=typeof z.currency==='string'&&/^[A-Z]{3}$/.test(z.currency)&&['gross','net'].includes(z.price_basis);
    if(!currency&&!(z.currency===null&&z.price_basis===null&&['currency_or_basis_mismatch','tariff_unavailable'].includes(z.reason)))return null;
    if(currency&&(z.currency!==snapshot.totals?.currency||z.price_basis!==snapshot.totals?.price_basis))return null;
    if(currency&&(z.status==='unknown'||z.reason==='currency_or_basis_mismatch'))return null;
    if(z.status==='ready'&&(!complete||snapshot.coverage?.complete!==true||!z.reconciles_recorded_kwh||!z.reconciles_known_costs)||
      z.status==='partial'&&(typeof z.reason!=='string'||!z.reason||z.reason.length>128)||
      z.status==='unknown'&&(z.reason!=='tariff_unavailable'||z.zones.length!==0)||!currency&&z.reconciles_known_costs)return null;
    const u=z.unattributed;
    if(!(u.recorded_kwh===null||nonnegative(u.recorded_kwh))||!duration(u.measured_seconds)||!duration(u.missing_seconds)||!known(u.known_costs)||
      !Array.isArray(u.reasons)||u.reasons.some(reason=>typeof reason!=='string'||!reason||reason.length>128)||
      z.status==='ready'&&(u.reasons.length||u.missing_seconds!==0||u.measured_seconds!==0||u.recorded_kwh!==null))return null;
    if(!currency&&moneyFields.some(key=>u.known_costs[key]!==null))return null;
    for(const zone of z.zones) {
      const rates=(snapshot.rates||[]).filter(rate=>rate.version_id===zone.version_id),rate=rates[0];
      const matches=rate?.profile?.zones?.filter(row=>row.id===zone.zone_id)||[];
      if(rates.length!==1||matches.length!==1||zone.tariff_id!==snapshot.active_tariff_id||typeof snapshot.active_tariff_id!=='string'||
        typeof zone.label!=='string'||zone.label!==matches[0].label||!calendar(rate.valid_from)||!calendar(rate.valid_to)||
        !/^[A-Z]{3}$/.test(rate.currency)||!['gross','net'].includes(rate.price_basis)||currency&&(rate.currency!==z.currency||rate.price_basis!==z.price_basis)||
        !nonnegative(zone.recorded_kwh)||!duration(zone.measured_seconds)||!known(zone.known_costs)||
        moneyFields.some(key=>!(zone[key]===null||decimal(zone[key])))||!(zone.usage_cost===null||decimal(zone.usage_cost))||
        (zone.complete?(!nonnegative(zone.kwh)||compare(zone.kwh,zone.recorded_kwh)!==0):zone.kwh!==null)||
        !currency&&(zone.usage_cost!==null||moneyFields.some(key=>zone[key]!==null||zone.known_costs[key]!==null)))return null;
    }
    return z;
  };
  const periodZonesMarkup=snapshot=>{
    if(!Object.hasOwn(snapshot,'period_summary'))return `<p data-analysis-zone-note class="analysis-note">${esc((snapshot.chart?.bins||[]).some(zoneProof)?t('Select a chart interval or open Data for tariff-zone details. No whole-period zone total is supplied.','Wybierz przedział na wykresie lub otwórz Dane, aby odczytać strefy taryfy. Serwer nie podał sumy stref za cały okres.'):t('Energy by tariff zone: no server breakdown.','Energia według stref taryfy: brak rozbicia z serwera.'))}</p>`;
    const frame=periodWindow(snapshot),proof=periodZoneProof(snapshot,frame),share=shareProof(snapshot,frame),peak=peakProof(snapshot,frame);
    const none=t('No data: a matching breakdown for this selected period is unavailable.','Brak danych: rozbicie dla wybranego okresu jest niedostępne.');
    const title=`<h4>${esc(t('Energy by tariff zone','Energia według stref taryfy'))}</h4>`;
    const details=proof?zoneEntries(snapshot,snapshot.period_summary,{period:true}):null;
    const rows=proof?.zones.map(zone=>{
      const ready=proof.status==='ready'&&zone.complete,label=zone.label&&zone.label!==zone.zone_id?zone.label:t('Unnamed tariff zone','Strefa taryfy bez nazwy');
      return `<li data-analysis-period-zone style="border-inline-start:6px solid ${zoneColor(zone.version_id,zone.zone_id,snapshot)}"><strong>${esc(label)}</strong><span>${esc((ready?'':t('Recorded','Zarejestrowano')+': ')+quantity(ready?zone.kwh:zone.recorded_kwh))}</span><span>${esc(t('Usage cost','Koszt zużycia'))}: ${esc(money(ready?zone.usage_cost:null,proof.currency))}</span></li>`;
    }).join('')||'';
    const u=proof?.unattributed;
    const unknownRow=u&&(u.recorded_kwh!==null||u.missing_seconds>0||u.reasons.length)?`<li data-analysis-period-unattributed><strong>${esc(t('Unattributed to a tariff zone','Bez przypisania do strefy taryfy'))}</strong><span>${esc(t('Recorded','Zarejestrowano'))}: ${esc(quantity(u.recorded_kwh))}</span></li>`:'';
    const note=proof?proof.status==='ready'?t('Entire selected period · usage costs exclude household fixed fees.','Cały wybrany okres · koszty zużycia nie obejmują opłat stałych gospodarstwa.'):proof.status==='unknown'?t('Tariff-zone assignment is unavailable. Recorded energy, if any, is shown separately.','Przypisanie do stref taryfy jest niedostępne. Zarejestrowaną energię, jeśli istnieje, pokazano osobno.'):proof.reason==='currency_or_basis_mismatch'?t('Recorded energy is shown. Costs cannot be combined across different currencies or price bases.','Pokazano zarejestrowaną energię. Nie można łączyć kosztów w różnych walutach lub podstawach cen.'):t('Partial breakdown · recorded energy and known amounts only.','Niepełne rozbicie · tylko zarejestrowana energia i znane kwoty.'):none;
    const shareDetail=share?`${t('Known cheap-zone energy','Znana energia w strefie taniej')}: ${quantity(share.known_cheap_kwh)} · ${t('Energy with known zone type','Energia ze znanym rodzajem strefy')}: ${quantity(share.classified_kwh)} · ${t('Full-period energy','Energia całego okresu')}: ${quantity(share.total_kwh)} · ${t('Full precision share','Udział z pełną precyzją')}: ${share.status==='ready'?ui.number(share.ratio,{style:'percent',maximumFractionDigits:100}):unknown()}`:t('Cheap-zone energy share is unavailable.','Udział energii w strefie taniej jest niedostępny.');
    const peakDetail=peak&&peak.kwh!==null?`${intervalText({from:peak.from,to:peak.to})} · ${quantity(peak.kwh)} · ${t('Hours tied at this value','Godziny z taką samą wartością')}: ${number(peak.tied_count)} · ${t('Measurement calendar','Kalendarz pomiarów')}: ${frame.timezone} · ${peak.reason==='measurement_timezone_unavailable'?t('Local measurement time is unavailable; absolute hour only.','Lokalny czas pomiaru jest niedostępny; znana jest tylko godzina bezwzględna.'):peak.local_start.slice(11,16)+' UTC'+peak.local_start.slice(-6)+' – '+peak.local_end.slice(11,16)+' UTC'+peak.local_end.slice(-6)}${peak.fold===1?' · '+t('Second occurrence of the local hour','Drugie wystąpienie lokalnej godziny'):''}${peak.status==='partial'||!snapshot.totals?.measurement_complete?' · '+t('Highest observed hour; the period is incomplete','Najwyższa zarejestrowana godzina; okres jest niepełny'):''}`:t('Highest hour is unavailable.','Najwyższa godzina jest niedostępna.');
    return `<section data-analysis-period-zone-total>${title}<p data-analysis-zone-note class="analysis-note">${esc(note)}</p>${proof?`<ul class="analysis-period-zones">${rows}${unknownRow}</ul>`:''}<details data-analysis-period-summary-details><summary>${esc(t('Selected-period values and measurement time','Wartości okresu i czas pomiarów'))}</summary>${frame?`<p>${esc(range(snapshot.period))} · ${esc(ui.timeZone)} · ${esc(t('Measurement calendar','Kalendarz pomiarów'))}: ${esc(frame.timezone)}</p>`:''}${details?`<p>${esc(details.note)}</p><ul>${details.entries.map(entry=>`<li>${esc(entry.text)}</li>`).join('')}</ul>`:`<p>${esc(none)}</p>`}<p>${esc(shareDetail)}</p><p>${esc(peakDetail)}</p></details></section>`;
  };
  // Only validate energy conservation here. Money stays in server literals.
  // Bounded integer scaling rejects mismatches below Number precision.
  const energyPartition=(values,total)=>{
    if(!nonnegative(total)||values.some(value=>!nonnegative(value)))return false;
    const all=[...values,total].map(parts),scales=all.map(value=>value.magnitude-value.digits.length),base=Math.min(...scales);
    if(all.some((value,i)=>value.digits.length>4096||scales[i]-base>4096))return false;
    const ints=all.map((value,i)=>BigInt(value.digits||'0')*10n**BigInt(scales[i]-base));
    return ints.slice(0,-1).reduce((sum,value)=>sum+value,0n)===ints.at(-1);
  };
  const groupPartition=(snapshot,rows)=>{
    const g=snapshot.groups,total=snapshot.totals;
    return g?.energy_domain==='grid_import'&&g.partition_complete===true&&g.membership_mode==='current_snapshot'&&
      Number.isSafeInteger(g.revision)&&g.registry_revision===g.revision&&total?.measurement_complete===true&&snapshot.coverage?.complete===true&&
      nonnegative(total.kwh)&&nonnegative(total.recorded_household_kwh)&&compare(total.kwh,total.recorded_household_kwh)===0&&
      rows.length>0&&rows.every(({row})=>row?.measurement_complete===true&&nonnegative(row.kwh)&&nonnegative(row.recorded_kwh)&&compare(row.kwh,row.recorded_kwh)===0)&&energyPartition(rows.map(({row})=>row.kwh),total.kwh);
  };
  const sourcePartition=snapshot=>{
    if(snapshot.groups?.energy_domain!=='grid_import')return null;
    const proof=periodZoneProof(snapshot,periodWindow(snapshot));
    return proof?.status==='ready'&&energyPartition(proof.zones.map(zone=>zone.kwh),snapshot.totals?.kwh)?proof:null;
  };
  const columnZone=(snapshot,row,visual)=>{
    const frame=bounds(row?.start,row?.end),period=bounds(snapshot.period?.start,snapshot.period?.end);
    if(!frame||!period||frame.from<period.from||frame.to>period.to||row.from!==frame.from||row.to!==frame.to||
      snapshot.chart?.timezone!==snapshot.period?.timezone||snapshot.chart?.coverage_kind!=='complete_household_hours'||
      snapshot.chart?.fixed_fee_scope!=='household_period_only'||!['ready','partial'].includes(snapshot.chart?.status)||
      row.complete!==true||row.currency!==snapshot.totals?.currency||row.price_basis!==snapshot.totals?.price_basis||
      !nonnegative(row.kwh)||!nonnegative(row.recorded_kwh)||compare(row.kwh,row.recorded_kwh)!==0||!valid(visual)||compare(row.kwh,visual)!==0||
      row.expected_seconds!==(frame.to-frame.from)/1000||row.measured_seconds!==row.expected_seconds)return null;
    // Interval completeness is independent of other missing hours in the selected period.
    const proof=periodZoneProof({...snapshot,totals:{...snapshot.totals,measurement_complete:true},coverage:{...snapshot.coverage,complete:true},period_summary:{zone_breakdown:row.zone_breakdown}},frame);
    if(proof?.status!=='ready'||proof.zones.length!==1||!energyPartition(proof.zones.map(z=>z.kwh),row.kwh))return null;
    const zone=proof.zones[0];if(zone.measured_seconds!==row.measured_seconds)return null;
    return {key:zone.version_id+'|'+zone.zone_id,label:zone.label,color:zoneColor(zone.version_id,zone.zone_id,snapshot)};
  };
  // Ratios only draw marks/labels. They never feed proof, prices, or money.
  const shareGeometry=(value,total)=>nonnegative(value)&&nonnegative(total)&&compare(total,'0')>0&&Number(total)>0?
    Math.max(0,Math.min(1,Number(value)/Number(total))):null;
  const flowMarkup=(snapshot,rows,colors)=>{
    const total=snapshot.totals?.kwh,groupReady=groupPartition(snapshot,rows),source=sourcePartition(snapshot);
    const positive=nonnegative(total)&&compare(total,'0')>0&&Number(total)>0;
    const destinations=groupReady?rows.filter(({row})=>compare(row.kwh,'0')>0).map(({id,label,row})=>({id,label,kwh:row.kwh,color:id==='unmeasured'?null:`var(--analysis-rank-${colors.get(id)??4})`})):[];
    const sources=source?source.zones.filter(zone=>compare(zone.kwh,'0')>0).map(zone=>({id:zone.version_id+'|'+zone.zone_id,label:zone.label,kwh:zone.kwh,color:zoneColor(zone.version_id,zone.zone_id,snapshot)})):[];
    const swatch=item=>`<i class="analysis-flow-swatch${item.color?'':' analysis-hatched'}" aria-hidden="true"${item.color?` style="background:${item.color}"`:''}></i>`;
    const legend=items=>`<ul class="analysis-flow-labels">${items.map(item=>`<li>${swatch(item)}<span>${esc(item.label)} · ${esc(briefEnergy(item.kwh))} · ${esc(percentage(shareGeometry(item.kwh,total)))}</span></li>`).join('')}</ul>`;
    const bar=(side,items,ready)=>ready&&positive?`<div class="analysis-composition" data-analysis-composition="${side}" aria-hidden="true">${items.map(item=>`<span data-analysis-segment class="${item.color?'':'analysis-hatched'}" style="width:${shareGeometry(item.kwh,total)*100}%;${item.color?'background:'+item.color:''}"></span>`).join('')}</div>`:`<p class="analysis-note">${esc(positive?unknown():nonnegative(total)&&compare(total,'0')===0?t('No energy recorded in this period.','W tym okresie zarejestrowano zerowe zużycie.'):unknown())}</p>`;
    let diagram='';
    if(groupReady&&source&&positive){
      const count=Math.max(sources.length,destinations.length),height=Math.max(220,count*34),gap=24,top=12,span=height-24-gap*(count-1),trunkTop=top+gap*(count-1)/2;
      const paths=(items,side)=>{let offset=0;return items.map((item,index)=>{
        const h=shareGeometry(item.kwh,total)*span,nodeY=top+offset+index*gap+(count-items.length)*gap/2,trunkY=trunkTop+offset;offset+=h;
        const y0=side==='source'?nodeY:trunkY,y1=side==='source'?trunkY:nodeY,x0=side==='source'?16:208,x1=side==='source'?192:384,m=(x0+x1)/2;
        const d=`M${x0},${y0} C${m},${y0} ${m},${y1} ${x1},${y1} L${x1},${y1+h} C${m},${y1+h} ${m},${y0+h} ${x0},${y0+h} Z`;
        return `<g data-analysis-flow-side="${side}" data-analysis-flow-id="${esc(item.id)}"><path d="${d}" fill="${item.color||'url(#'+flowHatchId+')'}" fill-opacity="0.28"/><rect data-analysis-flow-node x="${side==='source'?4:384}" y="${nodeY}" width="12" height="${h}" rx="2" fill="${item.color||'url(#'+flowHatchId+')'}"/><title>${esc(item.label+' · '+briefEnergy(item.kwh))}</title></g>`;
      }).join('');};
      diagram=`<div class="analysis-sankey-wrap">${legend(sources)}<div><p class="analysis-household">${esc(t('Household','Dom'))} · ${esc(briefEnergy(total))}</p><svg class="analysis-sankey" data-analysis-sankey style="height:${height}px" viewBox="0 0 400 ${height}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><pattern id="${flowHatchId}" patternUnits="userSpaceOnUse" width="7" height="7"><path d="M-1 1 L1 -1 M0 7 L7 0 M6 8 L8 6" stroke="currentColor" stroke-width="1.5"/></pattern></defs>${paths(sources,'source')}<rect x="192" y="${trunkTop}" width="16" height="${span}" fill="currentColor"/>${paths(destinations,'destination')}</svg></div>${legend(destinations)}</div>`;
    }
    const note=!groupReady||!source?t('Complete flow unavailable: the source or destination breakdown is incomplete or does not match this period. Known values remain below.','Pełny przepływ niedostępny: rozbicie źródeł lub odbiorców jest niepełne albo nie pasuje do okresu. Znane wartości pozostają poniżej.'):t('Tariff zones → household → selected groups. Each side describes the same imported energy; links do not assign a device to a specific tariff zone.','Strefy taryfy → dom → wybrane grupy. Obie strony opisują ten sam import; połączenia nie przypisują urządzenia do konkretnej strefy taryfy.');
    return {groupReady,markup:`<p class="analysis-flow-heading">${esc(snapshot.groups?.energy_domain==='grid_import'?t('Grid import','Import z sieci'):t('Measured energy','Zmierzona energia'))} · ${esc(briefEnergy(total))}</p>${diagram}<div class="analysis-mobile-composition"><h4>${esc(t('From','Skąd'))}</h4>${bar('source',sources,!!source)}${source?legend(sources):`<p>${esc(t('Tariff-zone breakdown unavailable','Brak rozbicia stref taryfy'))}</p>`}<h4>${esc(t('To','Dokąd'))}</h4>${bar('destination',destinations,groupReady)}</div>${groupReady&&source?`<details data-analysis-flow-details><summary>${esc(t('How to read the flow','Jak czytać przepływ'))}</summary>`:''}<p class="analysis-note" data-analysis-flow-note>${esc(note)}</p>${groupReady&&source?'</details>':''}`};
  };
  const chart = (snapshot, options) => {
    const bins=snapshot.chart?.bins || [],currency=snapshot.totals?.currency;
    const allowed=snapshot.period?.kind==='day'?['previous','same_weekday','mean7']:['previous','year_ago'];
    const requested=options.comparison||snapshot.context?.comparison_kind,kind=allowed.includes(requested)?requested:'previous';
    const series=markerSeries(snapshot,kind);
    const axisTicks=ui.chartTicks(bins.map(row=>row.start),snapshot.chart?.grain==='hour'?'hour':'day');
    const axisLabels=new Map(axisTicks.map(tick=>[tick.index,tick.label]));
    const majorTicks=new Set([axisTicks[0]?.index,axisTicks[Math.floor((axisTicks.length-1)/2)]?.index,axisTicks.at(-1)?.index].filter(index=>index!==undefined));
    const points=bins.map((row,index)=>{
      const key=bounds(row.start,row.end)?.key,marker=series.markers.get(key);
      return {row,index,marker,label:ui.pointLabel(row.start)||unknown(),current:series.common?marker?.current??null:marker?.current??row.kwh,visualCurrent:marker?.current??row.kwh};
    });
    const max=maximum(points.flatMap(p=>[p.visualCurrent,p.marker?.baseline]));
    const rangeMarkup=marker=>marker?marker.ranges.map(p=>`<span data-analysis-baseline-range>${esc(intervalText(p))}</span>`).join('<br>'):esc(unknown());
    const currentLabel=series.common?t('Current · common measurements','Bieżący · wspólne pomiary'):t('Current','Bieżący');
    const baselineLabel=series.mean?t('Baseline · mean of 7 days','Odniesienie · średnia z 7 dni'):t('Baseline','Odniesienie');
    const pointText=p=>`${p.label} · ${currentLabel}: ${quantity(p.current)} · ${baselineLabel}: ${quantity(p.marker?.baseline)} · ${t('Baseline interval','Przedział odniesienia')}: ${p.marker?p.marker.ranges.map(intervalText).join('; '):unknown()} · ${t('Whole household','Całe gospodarstwo')}: ${quantity(p.row.kwh)} · ${t('Household usage cost','Koszt zużycia gospodarstwa')}: ${money(p.row.usage_cost,currency)}`;
    const hasZones=bins.some(zoneProof);
    const columnZones=new Map(points.map(point=>[point.index,options.section==='comparison'?null:columnZone(snapshot,point.row,point.visualCurrent)]));
    const colorKeys=new Map([...columnZones.values()].filter(Boolean).map(zone=>[zone.key,zone]));
    const zoneLegend=colorKeys.size?`<p data-analysis-chart-zones class="analysis-zone-legend">${[...colorKeys.values()].map(zone=>`<span><i class="analysis-flow-swatch" aria-hidden="true" style="background:${zone.color}"></i>${esc(zone.label)}</span>`).join('')}${[...columnZones.values()].some(zone=>!zone)?`<span>${esc(t('Other bars: zone unavailable or mixed','Pozostałe słupki: strefa nieznana lub mieszana'))}</span>`:''}</p>`:'';
    const rows=points.map(p=>[
      button('point',p.index,p.label,String(options.selected)===String(p.index)),
      `<span data-analysis-current-value>${esc(quantity(p.current))}</span>`,esc(money(p.row.usage_cost,currency)),
      `<span data-analysis-baseline-value${p.marker?' data-analysis-marker aria-label="'+esc(pointText(p))+'"':''}>${esc(quantity(p.marker?.baseline))}</span>`,rangeMarkup(p.marker),
      ...(series.common?[`<span data-analysis-household-value>${esc(quantity(p.row.kwh))}</span>`]:[]),...(hasZones?[zonesMarkup(snapshot,p.row)]:[])
    ]);
    const selected=points.find(point=>String(point.index)===String(options.selected));
    const selection=selected?`<div data-analysis-point-detail><p role="status">${esc(pointText(selected))}</p>${selected.marker?`<p>${rangeMarkup(selected.marker)}</p>`:''}${zonesMarkup(snapshot,selected.row)}</div>`:'';
    const note=series.markers.size?`<p data-analysis-baseline="${series.reconciles?'ready':'partial'}">${esc(series.reconciles?t('Comparison covers the displayed intervals.','Porównanie obejmuje wyświetlone przedziały.'):t('Comparison is available for selected intervals only; it does not cover the whole period.','Porównanie obejmuje wybrane przedziały, ale nie cały okres.'))}</p>`:baselineNote();
    return `<section data-analysis-chart><div class="analysis-section-title"><h3>${esc(t('Consumption over time','Zużycie w czasie'))}</h3><div class="analysis-switch">${button('view','chart',t('Chart','Wykres'),options.view !== 'data')}${button('view','data',t('Data','Dane'),options.view === 'data')}</div></div>
      <p data-analysis-series-legend><span class="analysis-series-current">${esc(currentLabel)}</span> · <span class="analysis-series-baseline">${esc(baselineLabel)}</span>${series.common?' · '+esc(t('Selected amounts can differ from whole-household energy. Unmatched intervals retain household bars; their common comparison value is unavailable.','Wybrane ilości mogą różnić się od energii całego gospodarstwa. Bez dopasowania pozostaje słupek gospodarstwa; brak wartości wspólnego porównania.')):''}</p>
      ${zoneLegend}${options.view === 'data'?table(t('Measured intervals · usage cost without fixed fees','Przedziały pomiarowe · koszt zużycia bez opłat stałych'),[t('Period','Okres'),currentLabel+' kWh',t('Household usage cost','Koszt zużycia gospodarstwa'),baselineLabel+' kWh',t('Real baseline intervals','Rzeczywiste przedziały odniesienia'),...(series.common?[t('Whole household kWh','Całe gospodarstwo kWh')]:[]),...(hasZones?[t('Tariff zones in this interval','Strefy taryfy w przedziale')]:[])],rows,'','data-analysis-bin'):`<div class="analysis-chart-scroll"><div class="analysis-chart" style="--analysis-point-count:${Math.max(1,points.length)}" role="group" aria-label="${esc(t('Current and baseline consumption, select a point for values','Bieżące zużycie i odniesienie, wybierz punkt, aby odczytać wartości'))}">${points.map(p=>`<button type="button" class="analysis-point${p.visualCurrent==null?' analysis-missing':''}" data-analysis-action="point" data-analysis-value="${p.index}" aria-pressed="${String(options.selected)===String(p.index)}" aria-label="${esc(pointText(p))}"><span class="analysis-column analysis-series-current" aria-hidden="true" ${columnZones.get(p.index)?` data-analysis-column-zone="${esc(columnZones.get(p.index).key)}"`:''} style="height:${width(p.visualCurrent,max)*1.68}px${columnZones.get(p.index)?';background:'+columnZones.get(p.index).color:options.section==='comparison'?'':';background:var(--secondary-text-color,#718096)'}"></span>${p.marker?`<span data-analysis-marker class="analysis-baseline-line analysis-series-baseline" aria-label="${esc(pointText(p))}" style="bottom:${40+width(p.marker.baseline,max)*1.68}px"></span>`:''}<span class="analysis-point-label"${axisLabels.has(p.index)&&!majorTicks.has(p.index)?' data-analysis-axis-minor':''} aria-hidden="true">${esc(axisLabels.get(p.index)||'')}</span></button>`).join('')}</div></div>`}
      ${!points.length?`<p role="status">${esc(unknown())}</p>`:''}${selection}${note}<p class="analysis-note">${esc(t('Fixed fees apply once to the household period. Missing measurements are not zero.','Opłaty stałe dotyczą jednokrotnie całego okresu gospodarstwa. Brak pomiaru nie oznacza zera.'))}</p></section>`;
  };
  const groupsView = (snapshot,level,options={}) => {
    const groups=snapshot.groups, rows=rowsFor(groups,level);
    if(!groups?.unmeasured)rows.push({id:'unmeasured',label:t('Unmeasured','Niezmierzone'),row:{kwh:null,usage_cost:null}});
    const max=maximum(rows.map(x=>x.row.kwh));
    const colors=new Map(Object.keys(groups?.[level] || {}).sort().map((id,index)=>[id,Math.min(index,4)]));
    const flow=flowMarkup(snapshot,rows,colors);
    const groupCurrency=typeof groups?.currency==='string'&&/^[A-Z]{3}$/.test(groups.currency)&&
      groups.currency===snapshot.totals?.currency&&['gross','net'].includes(groups.price_basis)&&groups.price_basis===snapshot.totals?.price_basis?groups.currency:null;
    const groupMoney=value=>groupCurrency?money(value,groupCurrency):unknown();
    const details=table(t('Group measurements and usage costs','Pomiary grup i koszty zużycia'),[t('Group','Grupa'),'kWh',t('Usage cost','Koszt zużycia'),t('Coverage','Pokrycie')],rows.map(({label,row})=>[esc(label),esc(quantity(row.kwh)),esc(groupMoney(row.usage_cost)),esc(coverage(row.coverage))]))+
      `<p class="analysis-note">${esc(t('Assignments follow the current Home Assistant registry. No room and unmeasured energy are separate. Group costs exclude household fixed fees.','Przypisania pochodzą z aktualnego rejestru Home Assistant. Bez pokoju i Niezmierzone są osobnymi pozycjami. Koszty grup nie obejmują opłat stałych gospodarstwa.'))}</p>`;
    return `<section data-analysis-groups><h3>${esc(t('Energy flow — from and to','Przepływ energii — skąd i dokąd'))}</h3>${options.view==='data'?'':flow.markup}<div${options.view==='data'?'':' class="analysis-group-summary"'}><div><h4>${esc(t('Selected groups · share of household energy','Wybrane grupy · udział energii gospodarstwa'))}</h4>
      <ol class="analysis-ranking" data-analysis-ranking>${rows.map(({id,label,row})=>`<li data-analysis-rank-id="${esc(id)}" class="${id==='unmeasured'?'analysis-unmeasured':''}"><div><strong><i class="analysis-flow-swatch ${id==='unmeasured'?'analysis-hatched':'rank-'+(colors.get(id)??4)}" aria-hidden="true"></i>${esc(label)}</strong><span>${esc(options.view==='data'?quantity(row.kwh):briefEnergy(row.kwh))} · <span data-analysis-rank-share>${esc(flow.groupReady?percentage(shareGeometry(row.kwh,snapshot.totals?.kwh)):unknown())}</span> · ${esc(groupMoney(row.usage_cost))}</span></div><div class="analysis-track" aria-hidden="true"><span class="analysis-rank rank-${colors.get(id)??4}" style="width:${width(row.kwh,max)}%"></span></div></li>`).join('')}</ol>
      ${!rows.length?`<p>${esc(unknown())}</p>`:''}${options.view==='data'?'':`<details data-analysis-unmeasured-details><summary>${esc(t('Unmeasured energy explained','Co oznacza energia niezmierzona'))}</summary>`}<p class="analysis-note" data-analysis-unmeasured-explanation>${esc(groups?.energy_domain==='grid_import'?t('Unmeasured = grid import − sum of disjoint measured device amounts. Parent residuals and children are counted once. This is not the same as devices with no room. Fixed fees belong only to the household.','Niezmierzone = import z sieci − suma rozłącznych ilości zmierzonych urządzeń. Reszty urządzeń nadrzędnych i dzieci liczone są raz. To osobna pozycja od urządzeń bez pokoju. Opłaty stałe dotyczą tylko gospodarstwa.'):t('Unmeasured energy is separate from devices with no room. An import remainder is unavailable for this energy source.','Energia niezmierzona jest osobna od urządzeń bez pokoju. Dla tego źródła nie można podać reszty importu.'))}</p>
      ${options.view==='data'?'':'</details>'}</div>
      ${periodZonesMarkup(snapshot)}</div>
      ${options.view==='data'?details:`<details data-analysis-group-details><summary>${esc(t('Group measurements and costs','Pomiary i koszty grup'))}</summary>${details}</details>`}</section>`;
  };
  const costLabels = {energy_cost:t('Energy','Energia'),variable_cost:t('Variable distribution','Dystrybucja zmienna'),legacy_combined_cost:t('Legacy combined usage','Dawny łączny koszt zużycia'),fixed_cost:t('Fixed fees for period','Opłaty stałe za okres'),total_cost:t('Total','Razem')};
  const feeLabels = {subscription:t('Subscription','Abonament'),capacity:t('Capacity','Opłata mocowa'),distribution:t('Fixed distribution','Dystrybucja stała'),other:t('Other','Pozostałe')};
  const weekdays = pl ? ['pon','wt','śr','czw','pt','sob','nd'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const ruleText = rule => [
    rule.weekdays ? rule.weekdays.map(day=>weekdays[(day+6)%7] || unknown()).join(', ') : t('Every day','Codziennie'),
    ...(rule.dates || []).map(value=>date(value)), rule.season ? `${date('2000-'+rule.season.from,true)} – ${date('2000-'+rule.season.to,true)}` : '',
    (rule.intervals || []).map(interval=>`${interval.from}–${interval.to}`).join(', '),
    rule.priority == null ? '' : `${t('priority','priorytet')} ${number(rule.priority)}`
  ].filter(Boolean).join(' · ');
  const ratesView = (snapshot,options={}) => {
    const total=snapshot.totals || {}, groups=snapshot.groups || {}, data=options.view==='data';
    const currencyKnown=typeof total.currency==='string'&&/^[A-Z]{3}$/.test(total.currency)&&['gross','net'].includes(total.price_basis);
    const positive=value=>valid(value)&&compare(value,'0')>=0;
    const componentKeys=['energy_cost','variable_cost','legacy_combined_cost','fixed_cost'];
    // Only geometry uses Number. Amounts, rates, deltas and monthly fees remain
    // producer values passed directly to the shared formatter, never added here.
    const costReady=currencyKnown&&total.measurement_complete===true&&total.pricing_complete===true&&total.components_complete===true&&
      positive(total.total_cost)&&componentKeys.every(key=>positive(total[key])&&compare(total[key],total.total_cost)<=0);
    const componentLegend=componentKeys.map(key=>`<li><span class="analysis-rate76-swatch analysis-rate76-${key}" aria-hidden="true"></span><span>${esc(costLabels[key])}: <strong>${esc(money(total[key],total.currency))}</strong></span></li>`).join('');
    const costGraphic=!data&&costReady?`<div class="analysis-rate76-track" aria-hidden="true">${componentKeys.map(key=>`<span class="analysis-rate76-${key}" data-analysis-rate76-bar style="width:${width(total[key],Number(total.total_cost))}%" title="${esc(costLabels[key]+': '+money(total[key],total.currency))}"></span>`).join('')}</div>`:'';
    const visibleRates=(snapshot.rates || []).map(rate=>{
      const profile=rate.profile || {},zones=profile.zones || [],legacy=rate.rate_semantics==='legacy_combined';
      // Optional rates78 producer contract. Reject the whole projection on any
      // duplicate/foreign/missing zone or non-Decimal value; never synthesize it.
      const combined=rate.zone_usage_rates,zoneIds=zones.map(zone=>zone.id);
      const combinedValid=Array.isArray(combined)&&combined.length===zones.length&&new Set(zoneIds).size===zones.length&&zoneIds.every(id=>typeof id==='string'&&id.length>0)&&
        typeof rate.currency==='string'&&/^[A-Z]{3}$/.test(rate.currency)&&['gross','net'].includes(rate.price_basis)&&
        combined.every(row=>row&&typeof row.zone_id==='string'&&zoneIds.includes(row.zone_id)&&(row.usage_rate===null||typeof row.usage_rate==='string'&&valid(row.usage_rate)))&&
        new Set(combined.map(row=>row.zone_id)).size===zones.length;
      const combinedRates=new Map(combinedValid?combined.map(row=>[row.zone_id,row.usage_rate]):[]);
      const clock=profile.clock?.mode==='fixed'?t('Fixed UTC offset','Stałe przesunięcie UTC')+': '+quantity(profile.clock.offsetMinutes,'min',true):profile.clock?.mode==='civil'?t('Civil tariff clock','Czas lokalny taryfy'):unknown();
      const monthly=Object.entries(feeLabels).filter(([key])=>Object.hasOwn(rate.fixed_monthly || {},key)).map(([key,label])=>`<li>${esc(label)}: <strong>${esc(money(rate.fixed_monthly[key],rate.currency))}</strong> / ${esc(t('month','miesiąc'))}</li>`);
      if(rate.legacy_combined_monthly!=null)monthly.push(`<li>${esc(t('Legacy combined monthly fee','Dawna łączna opłata miesięczna'))}: <strong>${esc(money(rate.legacy_combined_monthly,rate.currency))}</strong> / ${esc(t('month','miesiąc'))}</li>`);
      const dynamic=(profile.dynamic?.intervals || []).map(row=>[esc(`${dateTime(row.from)} – ${dateTime(row.to)}`),esc(money(row.energyRate,rate.currency)),esc(money(row.variableRate,rate.currency))]);
      return `<article class="analysis-rate76-card" data-analysis-rate76-version="${esc(rate.version_id)}"><h4>${esc(t('Rates effective from','Stawki obowiązujące od'))} ${esc(date(rate.valid_from))}${rate.valid_to?' – '+esc(date(rate.valid_to)):''}</h4>
        <p class="analysis-rate76-meta">${esc(rate.currency || unknown())} · ${esc(basis(rate.price_basis))} · ${esc(profile.timezone || unknown())} · ${esc(clock)}</p>
        <ul class="analysis-rate76-rate-list">${zones.map(zone=>{
          const rules=[...(profile.rules || []).filter(rule=>rule.zone===zone.id).map(rule=>ruleText(rule)),...(profile.exceptions || []).filter(rule=>rule.zone===zone.id).map(rule=>t('Exception','Wyjątek')+': '+ruleText(rule))];
          if(zone.id===profile.defaultZone)rules.push(t('Default outside matching rules','Domyślna poza pasującymi regułami'));
          return `<li><strong>${esc(zone.label || t('Unnamed zone','Strefa bez nazwy'))}</strong><div class="analysis-rate76-schedule">${rules.length?rules.map(rule=>`<p>${esc(rule)}</p>`).join(''):esc(unknown())}</div><dl class="analysis-rate76-rate-values"><div><dt>${esc(legacy?t('Combined usage / kWh','Łączna stawka zużycia / kWh'):t('Energy / kWh','Energia / kWh'))}</dt><dd>${esc(money(zone.energyRate,rate.currency))}</dd></div><div><dt>${esc(t('Distribution / kWh','Dystrybucja / kWh'))}</dt><dd>${esc(legacy?unknown():money(zone.variableRate,rate.currency))}</dd></div><div><dt>${esc(t('Total / kWh','Razem / kWh'))}</dt><dd data-analysis-rate76-total="${esc(zone.id)}">${esc(money(combinedRates.get(zone.id),rate.currency))}</dd></div></dl></li>`;
        }).join('')}</ul>
        ${!zones.length?`<p>${esc(unknown())}</p>`:''}
        ${dynamic.length?table(t('Dynamic rate intervals','Przedziały stawek dynamicznych'),[t('Period','Okres'),t('Energy / kWh','Energia / kWh'),t('Distribution / kWh','Dystrybucja / kWh')],dynamic,'class="analysis-rate76-table"'):''}
        <p class="analysis-rate76-meta">${esc(t('Monthly fees · metadata, not another period charge','Opłaty miesięczne · metadane, bez ponownego naliczania'))}</p><ul class="analysis-rate76-monthly">${monthly.join('') || `<li>${esc(unknown())}</li>`}</ul></article>`;
    }).join('');
    const versions=(snapshot.rates || []).map(rate=>{
      const profile=rate.profile || {},zones=profile.zones || [],label=id=>zones.find(zone=>zone.id===id)?.label || t('Unnamed zone','Strefa bez nazwy');
      const rateRows=zones.map(zone=>[esc(zone.label || t('Unnamed zone','Strefa bez nazwy')),esc(money(zone.energyRate,rate.currency)),esc(money(zone.variableRate,rate.currency)),esc(zone.id === profile.defaultZone ? t('Default outside matching rules','Domyślna poza pasującymi regułami') : '')]);
      const ruleRows=[...(profile.rules || []).map(rule=>[esc(t('Rule','Reguła')),esc(label(rule.zone)),esc(ruleText(rule))]),...(profile.exceptions || []).map(rule=>[esc(t('Exception','Wyjątek')),esc(label(rule.zone)),esc(ruleText(rule))])];
      const dynamic=(profile.dynamic?.intervals || []).map(row=>[esc(`${dateTime(row.from)} – ${dateTime(row.to)}`),esc(money(row.energyRate,rate.currency)),esc(money(row.variableRate,rate.currency))]);
      const fees=Object.entries(feeLabels).filter(([key])=>Object.hasOwn(rate.fixed_monthly || {},key)).map(([key,label])=>[esc(label),`<span data-analysis-monthly="${key}">${esc(money(rate.fixed_monthly[key],rate.currency))}</span>`]);
      if (rate.legacy_combined_monthly != null) fees.push([esc(t('Legacy combined monthly fee','Dawna łączna opłata miesięczna')),esc(money(rate.legacy_combined_monthly,rate.currency))]);
      return `<section class="analysis-rate-version"><h4>${esc(t('Rates effective from','Stawki obowiązujące od'))} ${esc(date(rate.valid_from))}${rate.valid_to ? ' – '+esc(date(rate.valid_to)) : ''}</h4><p>${esc(rate.currency || unknown())} · ${esc(basis(rate.price_basis))} · ${esc(profile.timezone || unknown())} · ${esc(profile.clock?.mode === 'fixed' ? t('Fixed UTC offset','Stałe przesunięcie UTC')+': '+quantity(profile.clock.offsetMinutes,'min',true) : profile.clock?.mode === 'civil' ? t('Civil tariff clock','Czas lokalny taryfy') : unknown())}</p>
        ${table(t('Tariff rates per kWh','Stawki taryfy za kWh'),[t('Zone','Strefa'),rate.rate_semantics === 'legacy_combined' ? t('Combined usage / kWh','Łączna stawka zużycia / kWh') : t('Energy / kWh','Energia / kWh'),t('Distribution / kWh','Dystrybucja / kWh'),t('Application','Stosowanie')],rateRows)}
        ${ruleRows.length ? table(t('Schedules and exceptions','Godziny i wyjątki'),[t('Type','Rodzaj'),t('Zone','Strefa'),t('Calendar rules','Reguły kalendarza')],ruleRows) : ''}
        ${dynamic.length ? table(t('Dynamic rate intervals','Przedziały stawek dynamicznych'),[t('Period','Okres'),t('Energy / kWh','Energia / kWh'),t('Distribution / kWh','Dystrybucja / kWh')],dynamic) : ''}
        ${table(t('Monthly fees · metadata, not another period charge','Opłaty miesięczne · metadane, bez ponownego naliczania'),[t('Component','Składnik'),t('Amount / month','Kwota / miesiąc')],fees)}
        <details><summary>${esc(t('Rate provenance','Pochodzenie stawek'))}</summary><p>${esc(rate.provenance || unknown())}</p><p>${esc(rate.version_id)}</p><p>UTC / ${esc(t('source validity','ważność źródłowa'))}: ${esc(rate.valid_from)} – ${esc(rate.valid_to)}</p></details></section>`;
    }).join('');
    const proof=periodZoneProof(snapshot,periodWindow(snapshot));
    const zoneReady=proof?.status==='ready'&&currencyKnown&&positive(total.usage_cost)&&proof.zones.every(zone=>zone.complete&&positive(zone.usage_cost)&&compare(zone.usage_cost,total.usage_cost)<=0);
    const zoneDetails=proof?zoneEntries(snapshot,snapshot.period_summary,{period:true}):null;
    const zoneGraphic=!data&&zoneReady?`<div class="analysis-rate76-track" aria-hidden="true">${proof.zones.map(zone=>`<span data-analysis-rate76-bar style="background:${zoneColor(zone.version_id,zone.zone_id,snapshot)};width:${width(zone.usage_cost,Number(total.usage_cost))}%" title="${esc(zone.label+': '+money(zone.usage_cost,proof.currency))}"></span>`).join('')}</div>`:'';
    const zoneRows=proof?.zones.map(zone=>{
      const rate=(snapshot.rates || []).find(row=>row.version_id===zone.version_id),complete=proof.status==='ready'&&zone.complete;
      const known=[[t('Known energy cost','Znany koszt energii'),'energy_cost'],[t('Known distribution cost','Znany koszt dystrybucji'),'variable_cost'],[t('Known legacy usage cost','Znany dawny koszt zużycia'),'legacy_combined_cost']].map(([label,key])=>`${label}: ${money(zone.known_costs[key],proof.currency)}`).join(' · ');
      return `<li data-analysis-rate76-zone="${esc(zone.version_id+'|'+zone.zone_id)}"><span class="analysis-rate76-swatch" style="background:${zoneColor(zone.version_id,zone.zone_id,snapshot)}" aria-hidden="true"></span><div><strong>${esc(zone.label)}</strong><span class="analysis-rate76-meta"> · ${esc(t('Rates from','Stawki od'))} ${esc(rate?date(rate.valid_from):unknown())}</span><p>${esc(complete?quantity(zone.kwh):t('Recorded','Zarejestrowano')+': '+quantity(zone.recorded_kwh))} · <strong>${esc(money(complete?zone.usage_cost:null,proof.currency))}</strong></p>${!complete?`<p class="analysis-rate76-meta">${esc(known)}</p>`:''}</div></li>`;
    }).join('') || '';
    const level=['areas','floors','devices'].includes(options.level)?options.level:'areas';
    const groupRows=rowsFor(groups,level).sort((a,b)=>valid(a.row.usage_cost)&&valid(b.row.usage_cost)?compare(b.row.usage_cost,a.row.usage_cost):valid(a.row.usage_cost)?-1:valid(b.row.usage_cost)?1:0);
    const groupCurrency=currencyKnown&&groups.currency===total.currency&&groups.price_basis===total.price_basis;
    const groupMax=maximum(groupRows.filter(({row})=>positive(row.usage_cost)).map(({row})=>row.usage_cost));
    const groupTitle=level==='devices'?t('Cost by device','Koszt według urządzeń'):level==='floors'?t('Cost by floor','Koszt według pięter'):t('Cost by room','Koszt według pokoi');
    const ranked=groupRows.map(({id,label,row})=>`<li data-analysis-rate76-group="${esc(id)}"${id==='unmeasured'?' class="analysis-rate76-unmeasured"':''}><div class="analysis-rate76-rank-value"><strong>${esc(label)}</strong><strong>${esc(money(row.usage_cost,groups.currency))}</strong></div>${!data&&groupCurrency&&row.measurement_complete===true&&positive(row.usage_cost)?`<div class="analysis-rate76-track" aria-hidden="true"><span data-analysis-rate76-bar style="background:${zoneColor('group-'+level,id)};width:${width(row.usage_cost,groupMax)}%"></span></div>`:''}<p class="analysis-rate76-meta">${esc(data?quantity(row.kwh):briefEnergy(row.kwh))} · ${esc(coverage(row.coverage))}</p></li>`).join('');
    const groupValues=table(t('Group measurements and usage costs','Pomiary grup i koszty zużycia'),[t('Group','Grupa'),'kWh',t('Usage cost','Koszt zużycia')],groupRows.map(({label,row})=>[esc(label),esc(quantity(row.kwh)),esc(money(row.usage_cost,groups.currency))]));
    const alternativeRows=(snapshot.alternatives || []).filter(row=>row.tariff_id!==snapshot.active_tariff_id);
    const comparable=row=>row.comparable===true&&currencyKnown&&row.currency===total.currency&&row.price_basis===total.price_basis;
    const alternatives=alternativeRows.map(row=>[esc(row.tariff_name || t('Unnamed tariff','Taryfa bez nazwy')),esc(quantity(row.kwh)),esc(money(row.total_cost,row.currency)),esc(comparable(row)?money(row.delta_cost,row.currency,true):unknown())]);
    const costTable=table(t('Household cost for selected period','Koszt gospodarstwa za wybrany okres'),[t('Component','Składnik'),t('Cost','Koszt')],Object.entries(costLabels).map(([key,label])=>[esc(label),esc(money(total[key],total.currency))]),'data-analysis-cost-components class="analysis-rate76-table"');
    return `<section class="analysis-rate76" data-analysis-rates><div class="analysis-rate76-heading"><h3>${esc(t('Rates and costs','Stawki i koszty'))}</h3><div class="analysis-switch">${button('view','chart',t('Chart','Wykres'),!data)}${button('view','data',t('Data','Dane'),data)}</div></div>
      <div class="analysis-rate76-current" data-analysis-rate76-current>${visibleRates || `<p>${esc(unknown())}</p>`}</div>
      <div class="analysis-rate76-layout"><div><section class="analysis-rate76-card" data-analysis-rate76-cost><h4>${esc(t('Household cost for selected period','Koszt gospodarstwa za wybrany okres'))}</h4><p><strong>${esc(money(total.total_cost,total.currency))}</strong> · ${esc(t('Effective price','Cena efektywna'))}: ${esc(money(total.effective_price,total.currency))}${valid(total.effective_price)?'/kWh':''}</p>
        ${costGraphic}<ul class="analysis-rate76-legend">${componentLegend}</ul>
        ${!costReady?`<p class="analysis-rate76-meta">${esc(t('A complete positive cost breakdown is unavailable. Available amounts retain their signs.','Pełne dodatnie rozbicie kosztu jest niedostępne. Dostępne kwoty zachowują swój znak.'))}</p>`:compare(total.total_cost,'0')===0?`<p class="analysis-rate76-meta">${esc(t('Zero cost','Koszt zerowy'))}</p>`:''}
        ${data?costTable:`<details class="analysis-rate76-history"><summary>${esc(t('Exact cost components','Dokładne składniki kosztu'))}</summary>${costTable}</details>`}
        ${snapshot.fees?.components?`<details class="analysis-rate76-history" data-analysis-fee-details><summary>${esc(t('Fixed fee components for period','Składniki opłat stałych za okres'))}</summary>${table(t('Fixed fee components for period','Składniki opłat stałych za okres'),[t('Component','Składnik'),t('Cost','Koszt')],Object.entries(snapshot.fees.components).map(([key,value])=>[esc(feeLabels[key]||t('Legacy combined fee','Dawna opłata łączna')),esc(money(value,total.currency))]))}</details>`:''}</section>
      <section class="analysis-rate76-card" data-analysis-rate76-zones><h4>${esc(t('Cost by tariff zone','Koszt według stref taryfy'))}</h4><p class="analysis-rate76-meta">${esc(t('Whole selected period · usage cost without fixed fees','Cały wybrany okres · koszt zużycia bez opłat stałych'))}</p>${zoneGraphic}
        ${proof?`<ul class="analysis-rate76-zone-list">${zoneRows}</ul>${proof.status!=='ready'?`<p class="analysis-rate76-meta">${esc(proof.status==='partial'?t('Incomplete period · recorded energy and known costs only','Niepełny okres · tylko zarejestrowana energia i znane koszty'):t('No tariff cost data for this period','Brak kosztów taryfy za ten okres'))}</p>`:''}`:`<p>${esc(t('No data: matching whole-period zone costs are unavailable.','Brak danych: brak zgodnych kosztów stref za cały okres.'))}</p>`}
        ${zoneDetails?`<details class="analysis-rate76-history"><summary>${esc(t('Zone coverage and provenance','Pokrycie i pochodzenie stref'))}</summary><p>${esc(zoneDetails.note)}</p><ul>${zoneDetails.entries.map(entry=>`<li>${esc(entry.text)}</li>`).join('')}</ul></details>`:''}</section></div>
      <section class="analysis-rate76-card" data-analysis-rate76-groups><h4>${esc(groupTitle)}</h4><p class="analysis-rate76-meta">${esc(groups.currency || unknown())} · ${esc(basis(groups.price_basis))}</p><ol class="analysis-rate76-rank-list">${ranked}</ol>${data?'':`<details data-analysis-rate76-group-values><summary>${esc(t('Group measurements and costs','Pomiary i koszty grup'))}</summary>${groupValues}</details>`}${!groupRows.length?`<p>${esc(unknown())}</p>`:''}<p class="analysis-rate76-meta">${esc(t('Group costs exclude household fixed fees. No room and unmeasured energy are separate. Bars rank known nonnegative costs in the same currency and basis.','Koszty grup nie obejmują opłat stałych gospodarstwa. Bez pokoju i Niezmierzone to osobne pozycje. Paski porównują znane nieujemne koszty w tej samej walucie i podstawie.'))}</p></section></div>
      <section><h4>${esc(t('Same measured energy in alternative tariffs · no activation','Ta sama zmierzona energia w innych taryfach · bez aktywacji'))}</h4><div class="analysis-rate76-alternatives">${alternativeRows.map(row=>`<article class="analysis-rate76-card" data-analysis-rate76-alternative><strong>${esc(row.tariff_name || t('Unnamed tariff','Taryfa bez nazwy'))}</strong><p>${esc(quantity(row.kwh))} · <strong>${esc(money(row.total_cost,row.currency))}</strong> · ${esc(basis(row.price_basis))}</p><p>${esc(comparable(row)?t('Difference','Różnica')+': '+money(row.delta_cost,row.currency,true):t('No comparable difference','Brak porównywalnej różnicy'))}</p><p class="analysis-rate76-meta">${esc(t('Same measured energy · no activation','Ta sama zmierzona energia · bez aktywacji'))}</p></article>`).join('') || `<p>${esc(t('No alternative tariff comparison available','Brak porównania alternatywnej taryfy'))}</p>`}</div>
      ${alternativeRows.length?`<details class="analysis-rate76-history"><summary>${esc(t('Alternative tariff values','Wartości alternatywnych taryf'))}</summary>${table(t('Same measured energy in alternative tariffs · no activation','Ta sama zmierzona energia w innych taryfach · bez aktywacji'),[t('Tariff','Taryfa'),'kWh',t('Total cost','Koszt całkowity'),t('Delta','Różnica')],alternatives)}</details>`:''}</section>
      <details class="analysis-rate76-history" data-analysis-rate-history><summary>${esc(t('Rates, schedules and history','Stawki, godziny i historia'))}</summary>${versions || `<p>${esc(unknown())}</p>`}</details>
      <p class="analysis-rate76-meta">${esc(t('Fixed fees apply once to the household period. Alternatives use the same measurements.','Opłaty stałe dotyczą jednokrotnie całego okresu gospodarstwa. Alternatywy korzystają z tych samych pomiarów.'))}</p></section>`;
  };
  const comparisonView = (snapshot,options,kind) => {
    const comparison=snapshot.comparisons?.[kind] || {}, ready=comparison.status === 'ready', costs=comparison.costs || {}, currency=costs.current?.currency || snapshot.totals?.currency, baselineCurrency=costs.baseline?.currency;
    const groups=comparison.groups || {}, rows=rowsFor(groups,options.level,snapshot.groups), max=maximum(rows.map(({row})=>row.delta_kwh));
    const signedValue=row=>row.status === 'ready' ? quantity(row.delta_kwh,'kWh',true) : unknown();
    return `<section><h3>${esc(t('Period comparison','Porównanie okresów'))}</h3><p>${esc(comparisons[kind])} · ${esc(ready ? comparison.comparison_scope === 'common_measurements' ? t('Common measurements only','Tylko wspólne pomiary') : t('Calendar totals','Sumy kalendarzowe') : unknown())}</p>
      ${chart(snapshot,options)}
      ${table(t('Household comparison','Porównanie gospodarstwa'),[t('Measurement','Pomiar'),t('Current','Bieżący'),t('Baseline','Odniesienie'),t('Delta','Różnica')],[
        [esc(t('Energy','Energia')),esc(quantity(comparison.current_kwh)),esc(quantity(comparison.baseline_kwh)),esc(ready ? quantity(comparison.delta_kwh,'kWh',true) : unknown())],
        [esc(t('Percentage change','Zmiana procentowa')),'','',esc(ready ? quantity(comparison.percent,'%',true) : unknown())],
        [esc(t('Usage cost without fixed fees','Koszt zużycia bez opłat stałych')),esc(money(costs.current?.usage_cost,currency)),esc(money(costs.baseline?.usage_cost,baselineCurrency)),esc(costs.status === 'ready' ? money(costs.delta_cost,currency,true) : unknown())],
        [esc(t('Household total cost','Całkowity koszt gospodarstwa')),esc(money(costs.current?.total_cost,currency)),esc(money(costs.baseline?.total_cost,baselineCurrency)),esc(costs.status === 'ready' ? money(costs.delta_total_cost,currency,true) : unknown())],
        [esc(t('Coverage','Pokrycie')),esc(coverage(comparison.coverage?.current)),esc(comparison.coverage?.baseline != null ? coverage(comparison.coverage.baseline) : (comparison.coverage?.baselines || []).map(coverage).join(' · ') || unknown()),'']
      ])}
      ${(comparison.baseline_periods||[]).length?`${options.view==='data'?'':`<details data-analysis-baseline-period-details><summary>${esc(t('Comparison dates','Daty porównania'))}</summary>`}${(comparison.baseline_periods||[]).map(period=>`<p>${esc(t('Baseline period','Okres odniesienia'))}: ${esc(range(period))}</p>`).join('')}${options.view==='data'?'':'</details>'}`:''}
      <section data-analysis-comparison-groups><h4>${esc(t('Change by group','Zmiana według grup'))}</h4>
      ${options.view === 'data' ? '' : `<ul class="analysis-deltas">${rows.map(({id,label,row})=>`<li class="${id === 'unmeasured' ? 'analysis-unmeasured' : ''}"><div>${esc(label)} <strong>${esc(signedValue(row))}</strong></div><div class="analysis-delta-track" aria-hidden="true"><span class="${String(row.delta_kwh).startsWith('-') ? 'analysis-decrease' : 'analysis-increase'}" style="width:${width(row.status === 'ready' ? row.delta_kwh : null,max)/2}%"></span></div></li>`).join('')}</ul>`}
      ${options.view==='data'?'':`<details data-analysis-comparison-details><summary>${esc(t('Group comparison values','Wartości porównania grup'))}</summary>`}${table(t('Group comparison · server deltas','Porównanie grup · różnice z serwera'),[t('Group','Grupa'),t('Energy delta','Różnica energii'),t('Usage cost delta','Różnica kosztu zużycia'),t('Change','Zmiana'),t('Current coverage','Pokrycie bieżące'),t('Baseline coverage','Pokrycie odniesienia')],rows.map(({label,row})=>[esc(label),esc(signedValue(row)),esc(row.status === 'ready' ? money(row.delta_usage_cost,groups.currency,true) : unknown()),esc(row.status === 'ready' ? quantity(row.percent,'%',true) : unknown()),esc(coverage(row.coverage?.current)),esc(row.coverage?.baseline != null ? coverage(row.coverage.baseline) : (row.coverage?.baselines || []).map(coverage).join(' · ') || unknown())]))}
      <p class="analysis-note">${esc(t('Group coverage and calendar masks may differ from household coverage. Unknown deltas are not zero.','Pokrycie i maski kalendarzowe grup mogą różnić się od pokrycia gospodarstwa. Nieznana różnica nie oznacza zera.'))}</p>${options.view==='data'?'':'</details>'}</section></section>`;
  };
  const markup = (snapshot, options = {}) => {
    const section=['overview','rates','comparison'].includes(options.section) ? options.section : 'overview';
    const level=['areas','floors','devices'].includes(options.level) ? options.level : 'areas';
    options={...options,level};
    if (!snapshot || snapshot.schema !== 2) return `<div class="energy-analysis-v53"><p role="status">${esc(unknown())}</p></div>`;
    const period=snapshot.period || {},allowed=period.kind === 'day' ? ['previous','same_weekday','mean7'] : ['previous','year_ago'];
    const requested=options.comparison || snapshot.context?.comparison_kind,kind=allowed.includes(requested) ? requested : 'previous';
    const anchor=/^\d{4}-\d{2}-\d{2}$/.test(options.anchor || '') ? options.anchor : /^\d{4}-\d{2}-\d{2}$/.test(snapshot.context?.period_anchor || '') ? snapshot.context.period_anchor : '';
    const filters=`<div class="analysis-controls" data-analysis-filters>
      ${select('level',t('Group by','Grupuj według'),[['areas',t('Rooms','Pokoje')],...(snapshot.groups?.floor_supported===true?[['floors',t('Floors','Piętra')]]:[]),['devices',t('Devices','Urządzenia')]],level)}
      <details data-analysis-calendar-options><summary>${esc(t('Date and comparison','Data i porównanie'))}</summary><div class="analysis-calendar-fields">
      <label>${esc(t('Calendar date','Data kalendarzowa'))}<input type="date" data-analysis-action="anchor" data-analysis-value="${esc(anchor)}" value="${esc(anchor)}"></label>
      ${select('comparison',t('Compare with','Porównaj z'),allowed.map(key=>[key,comparisons[key]]),kind)}</div></details></div>`;
    return `<div class="energy-analysis-v53"><div class="analysis-period-controls"><div class="analysis-switch" role="group" aria-label="${esc(t('Period','Okres'))}">${periods.map(([value,label])=>button('period',value,label,period.kind===value)).join('')}</div><p class="analysis-period">${esc(range(period))} · ${esc(ui.timeZone)} · ${esc(coverage(snapshot.coverage))}</p></div>
      ${section==='overview'?tiles(snapshot,true):''}${section==='rates'?filters+ratesView(snapshot,options):section==='comparison'?comparisonView(snapshot,options,kind)+filters:chart(snapshot,options)+filters+groupsView(snapshot,level,options)}
      <details data-analysis-source-details><summary>${esc(t('Source and time details','Źródło i szczegóły czasu'))}</summary><p>${esc(t('Measurement calendar','Kalendarz pomiarów'))}: ${esc(period.timezone||unknown())}</p><p>UTC: ${esc(period.start)} – ${esc(period.end)}</p></details></div>`;
  };
  const styles = () => `

.energy-analysis-v53 .analysis-rate76{font-size:14px;line-height:1.45;min-width:0;--analysis-rate76-energy:#287fd1;--analysis-rate76-distribution:#8754b3;--analysis-rate76-fixed:#64748b;--analysis-rate76-legacy:#238782}
.energy-analysis-v53 .analysis-rate76-meta{font-size:12px;color:var(--secondary-text-color);overflow-wrap:anywhere}
.energy-analysis-v53 .analysis-rate76-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.energy-analysis-v53 .analysis-rate76-card{min-width:0;border:1px solid var(--divider-color);border-radius:10px;background:var(--card-background-color);padding:12px;overflow-wrap:anywhere}
.energy-analysis-v53 .analysis-rate76-card h4{margin-top:0}
.energy-analysis-v53 .analysis-rate76-current{display:grid;gap:12px}
.energy-analysis-v53 .analysis-rate76-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
.energy-analysis-v53 .analysis-rate76-layout>div{min-width:0}
.energy-analysis-v53 .analysis-rate76-rate-list,.energy-analysis-v53 .analysis-rate76-monthly,.energy-analysis-v53 .analysis-rate76-legend,.energy-analysis-v53 .analysis-rate76-zone-list,.energy-analysis-v53 .analysis-rate76-rank-list{list-style:none;padding:0;margin:8px 0}
.energy-analysis-v53 .analysis-rate76-rate-list>li{display:grid;grid-template-columns:minmax(80px,.6fr) minmax(0,1.2fr) minmax(0,1.2fr);gap:12px;align-items:start;padding:10px 0;border-top:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-rate76-schedule p{margin:0 0 4px}
.energy-analysis-v53 .analysis-rate76-rate-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-rate76-rate-values dt{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-rate76-rate-values dd{font-weight:600;margin:4px 0 0}
.energy-analysis-v53 .analysis-rate76-monthly{display:flex;flex-wrap:wrap;gap:8px 16px}
.energy-analysis-v53 .analysis-rate76-track{display:flex;height:14px;min-width:0;max-width:100%;background:var(--secondary-background-color);border-radius:4px;overflow:hidden;margin:10px 0}
.energy-analysis-v53 .analysis-rate76-track>span{display:block;min-width:0;height:100%;flex-shrink:0}
.energy-analysis-v53 .analysis-rate76-energy_cost{background:var(--analysis-rate76-energy)}
.energy-analysis-v53 .analysis-rate76-variable_cost{background:var(--analysis-rate76-distribution)}
.energy-analysis-v53 .analysis-rate76-fixed_cost{background:var(--analysis-rate76-fixed)}
.energy-analysis-v53 .analysis-rate76-legacy_combined_cost{background:var(--analysis-rate76-legacy)}
.energy-analysis-v53 .analysis-rate76-legend{display:flex;flex-wrap:wrap;gap:8px 16px}
.energy-analysis-v53 .analysis-rate76-legend>li,.energy-analysis-v53 .analysis-rate76-zone-list>li{display:flex;align-items:baseline;gap:6px;min-width:0}
.energy-analysis-v53 .analysis-rate76-zone-list>li{padding:8px 0;border-bottom:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-rate76-swatch{display:inline-block;width:10px;height:10px;flex:0 0 10px;border-radius:2px}
.energy-analysis-v53 .analysis-rate76-rank-list>li{padding:10px 0;border-bottom:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-rate76-rank-value{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-rate76-unmeasured .analysis-rate76-track>span{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--secondary-text-color) 3px,var(--secondary-text-color) 4px)!important;border:1px solid var(--secondary-text-color)}
.energy-analysis-v53 .analysis-rate76-alternatives{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.energy-analysis-v53 .analysis-rate76-history{border-top:1px solid var(--divider-color);margin-top:12px}
.energy-analysis-v53 .analysis-rate76-history .analysis-table-wrap{overflow:visible}
.energy-analysis-v53 .analysis-rate76-history table,.energy-analysis-v53 .analysis-rate76-table{table-layout:fixed;width:100%;overflow-wrap:anywhere}
:host(.bento-dark) .energy-analysis-v53 .analysis-rate76{--analysis-rate76-energy:#3987e5;--analysis-rate76-distribution:#a696ea;--analysis-rate76-fixed:#94a3b8;--analysis-rate76-legacy:#41a69f}
@container energy-analysis (max-width:600px){.energy-analysis-v53 .analysis-rate76-layout{grid-template-columns:minmax(0,1fr);gap:0}.energy-analysis-v53 .analysis-rate76-rate-list>li{grid-template-columns:minmax(0,1fr);gap:6px}.energy-analysis-v53 .analysis-rate76-card{padding:10px}.energy-analysis-v53 .analysis-rate76-rate-values{gap:8px}.energy-analysis-v53 .analysis-rate76-history th,.energy-analysis-v53 .analysis-rate76-history td{padding:8px 4px}}
.energy-analysis-v53{font-family:var(--paper-font-body1_-_font-family,inherit);font-size:14px;line-height:1.45;color:var(--primary-text-color);min-width:0;max-width:100%;width:100%;overflow-wrap:anywhere;container-type:inline-size;container-name:energy-analysis}
.energy-analysis-v53 *{box-sizing:border-box}
.energy-analysis-v53 h3,.energy-analysis-v53 h4{font-size:1em;margin:12px 0 8px}
.energy-analysis-v53 p{margin:8px 0}
.energy-analysis-v53 section{min-width:0;margin-block:12px}
.energy-analysis-v53 .analysis-switch,.energy-analysis-v53 .analysis-section-title,.energy-analysis-v53 .analysis-period-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.energy-analysis-v53 .analysis-period-controls{justify-content:space-between}
.energy-analysis-v53 .analysis-period{font-size:12px;color:var(--secondary-text-color);margin:4px 0}
.energy-analysis-v53 .analysis-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:12px;align-items:end;margin-block:16px}
.energy-analysis-v53 .analysis-section-title{justify-content:space-between}
.energy-analysis-v53 .analysis-calendar-fields{display:grid;gap:12px;padding-block:8px}
.energy-analysis-v53 [data-analysis-calendar-options]{margin:0;min-width:0}
.energy-analysis-v53 [data-analysis-calendar-options] summary{min-height:44px}
.energy-analysis-v53 label{display:flex;flex-direction:column;gap:4px;max-width:100%;min-width:0;font-size:12px}
.energy-analysis-v53 .analysis-controls select,.energy-analysis-v53 .analysis-controls input{width:100%;min-width:0;font-size:14px}
.energy-analysis-v53 button,.energy-analysis-v53 select,.energy-analysis-v53 input{font:inherit;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;min-height:44px;min-width:44px;padding:8px;max-width:100%}
.energy-analysis-v53 button{cursor:pointer;white-space:normal}
.energy-analysis-v53 button[aria-pressed="true"]{border-color:var(--primary-color);box-shadow:inset 0 0 0 1px var(--primary-color)}
.energy-analysis-v53 button:focus-visible,.energy-analysis-v53 select:focus-visible,.energy-analysis-v53 input:focus-visible,.energy-analysis-v53 summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
.energy-analysis-v53 summary{min-height:44px;padding:12px 0;cursor:pointer}
.energy-analysis-v53 .analysis-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
.energy-analysis-v53 .analysis-tile{min-width:0;border:1px solid var(--divider-color);border-radius:10px;padding:10px 12px;background:var(--card-background-color);box-shadow:none}
.energy-analysis-v53 .analysis-tile span,.energy-analysis-v53 .analysis-tile strong{display:block}
.energy-analysis-v53 .analysis-tile span{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-tile strong{font-size:1.35em;margin-top:4px;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-period-zones{list-style:none;margin:8px 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px}
.energy-analysis-v53 .analysis-period-zones li{min-width:0;display:grid;gap:4px;padding:8px 10px;border:1px solid var(--divider-color);border-radius:8px}
.energy-analysis-v53 .analysis-period-zones li>span:last-child{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 [data-analysis-period-summary-details]{border-top:1px solid var(--divider-color);margin-top:8px}
.energy-analysis-v53 .analysis-note{color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-table-wrap{overflow:auto;max-width:100%}
.energy-analysis-v53 table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;text-align:start}
.energy-analysis-v53 caption{text-align:start;font-weight:600;padding:8px 0}
.energy-analysis-v53 th,.energy-analysis-v53 td{padding:10px 8px;border-bottom:1px solid var(--divider-color);vertical-align:top;text-align:start}
.energy-analysis-v53 th{font-weight:600}
.energy-analysis-v53 .analysis-chart-scroll{min-width:0;max-width:100%;width:100%;overflow:visible;padding:4px 2px}
.energy-analysis-v53 .analysis-chart{display:grid;grid-template-columns:repeat(var(--analysis-point-count),minmax(0,1fr));align-items:stretch;height:212px;min-width:0;max-width:100%;width:100%;gap:2px}
.energy-analysis-v53 .analysis-point{position:relative;display:flex;align-items:flex-end;justify-content:center;min-width:0;max-width:100%;width:100%;height:212px;padding:0 0 40px;border:0;border-radius:0;background:transparent;touch-action:manipulation}
.energy-analysis-v53 .analysis-point:focus-visible{outline-offset:0;z-index:1}
.energy-analysis-v53 .analysis-point[aria-pressed="true"]{box-shadow:inset 0 0 0 1px var(--primary-color)}
.energy-analysis-v53 .analysis-column{display:block;width:100%;max-height:168px;background:var(--energy-grid-consumption-color,#287fd1);border-radius:3px 3px 0 0;min-height:1px}
.energy-analysis-v53 .analysis-baseline-line{display:block;position:absolute;inset-inline:0;height:0;border-top:3px dashed #8754b3;pointer-events:none}\n.energy-analysis-v53 [data-analysis-series-legend] .analysis-series-current:before{content:"● ";color:var(--secondary-text-color,#718096)}\n.energy-analysis-v53 [data-analysis-series-legend] .analysis-series-baseline:before{content:"━ ";color:#8754b3}\n.energy-analysis-v53 [data-analysis-baseline-range]{display:inline-block}\n.energy-analysis-v53 .analysis-point-label{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);width:max-content;font-size:12px;line-height:1.2}
.energy-analysis-v53 .analysis-point:first-child .analysis-point-label{left:0;transform:none}
.energy-analysis-v53 .analysis-point:last-child .analysis-point-label{left:auto;right:0;transform:none}
.energy-analysis-v53 .analysis-missing{background:repeating-linear-gradient(135deg,transparent,transparent 5px,var(--divider-color) 5px,var(--divider-color) 6px)}
.energy-analysis-v53 .analysis-flow{display:grid;grid-template-columns:minmax(120px,.3fr) minmax(0,1fr);gap:16px;align-items:start}
.energy-analysis-v53 .analysis-flow-source{display:flex;flex-direction:column;gap:4px;padding:12px;border-inline-start:4px solid var(--energy-grid-consumption-color,#287fd1);background:var(--secondary-background-color);border-radius:8px;min-width:0}
.energy-analysis-v53 .analysis-flow-source>span:first-child{font-size:12px;color:var(--secondary-text-color)}
.energy-analysis-v53 .analysis-flow-destination{min-width:0}
.energy-analysis-v53 .analysis-flow-destination h4{margin-top:0}
.energy-analysis-v53 [data-analysis-group-details],.energy-analysis-v53 [data-analysis-rate-history],.energy-analysis-v53 [data-analysis-fee-details],.energy-analysis-v53 [data-analysis-source-details]{border-top:1px solid var(--divider-color);margin-top:12px}
.energy-analysis-v53 .analysis-ranking,.energy-analysis-v53 .analysis-deltas{list-style:none;margin:0;padding:0}
.energy-analysis-v53 .analysis-ranking li,.energy-analysis-v53 .analysis-deltas li{padding:8px 0;border-bottom:1px solid var(--divider-color)}
.energy-analysis-v53 .analysis-ranking li>div:first-child,.energy-analysis-v53 .analysis-deltas li>div:first-child{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
.energy-analysis-v53 .analysis-track,.energy-analysis-v53 .analysis-delta-track{height:8px;background:var(--secondary-background-color);border-radius:3px;margin-top:6px;position:relative}
.energy-analysis-v53 .analysis-rank{display:block;height:100%;background:var(--energy-device-consumption-color,#df6635)}
.energy-analysis-v53 .rank-0{background:var(--analysis-rank-0,#eb6834)}.energy-analysis-v53 .rank-1{background:var(--analysis-rank-1,#6250d6)}.energy-analysis-v53 .rank-2{background:var(--analysis-rank-2,#e87ba4)}.energy-analysis-v53 .rank-3{background:var(--analysis-rank-3,#eda100)}.energy-analysis-v53 .rank-4{background:var(--analysis-rank-4,#718096)}
:host(.bento-dark) .energy-analysis-v53 .rank-0{background:#d95926}:host(.bento-dark) .energy-analysis-v53 .rank-1{background:#9085e9}:host(.bento-dark) .energy-analysis-v53 .rank-2{background:#d55181}:host(.bento-dark) .energy-analysis-v53 .rank-3{background:#c98500}
.energy-analysis-v53 .analysis-unmeasured .analysis-rank{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--secondary-text-color) 3px,var(--secondary-text-color) 4px);border:1px solid var(--secondary-text-color)}
.energy-analysis-v53 .analysis-delta-track:before{content:'';position:absolute;left:50%;height:100%;border-left:1px solid var(--secondary-text-color)}
.energy-analysis-v53 .analysis-decrease{position:absolute;right:50%;height:100%;background:#287fd1}
.energy-analysis-v53 .analysis-increase{position:absolute;left:50%;height:100%;background:#cf4040}

.energy-analysis-v53{--analysis-zone-cheap:#1baf7a;--analysis-zone-expensive:#2a78d6;--analysis-rank-0:#eb6834;--analysis-rank-1:#6250d6;--analysis-rank-2:#e87ba4;--analysis-rank-3:#eda100;--analysis-rank-4:#718096}
:host(.bento-dark) .energy-analysis-v53{--analysis-zone-cheap:#199e70;--analysis-zone-expensive:#3987e5;--analysis-rank-0:#d95926;--analysis-rank-1:#9085e9;--analysis-rank-2:#d55181;--analysis-rank-3:#c98500}
.energy-analysis-v53 .analysis-group-summary{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:20px;align-items:start}
.energy-analysis-v53 .analysis-group-summary>div{min-width:0}
.energy-analysis-v53 .analysis-sankey-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);align-items:center;gap:12px}
.energy-analysis-v53 .analysis-sankey{display:block;width:100%;height:250px;color:var(--primary-text-color)}
.energy-analysis-v53 [data-analysis-flow-side]>path{stroke:var(--primary-text-color);stroke-width:.3}
.energy-analysis-v53 .analysis-household{text-align:center;font-weight:600}
.energy-analysis-v53 .analysis-flow-labels{list-style:none;padding:0;margin:0;min-width:0;display:grid;gap:12px}
.energy-analysis-v53 .analysis-flow-labels li{min-width:0;display:flex;align-items:baseline;gap:6px}
.energy-analysis-v53 .analysis-flow-swatch{display:inline-block;flex:none;width:12px;height:12px;margin-inline-end:5px;border:1px solid var(--primary-text-color);border-radius:2px;vertical-align:baseline}
.energy-analysis-v53 .analysis-composition{display:flex;height:16px;max-width:100%;border:1px solid var(--primary-text-color);border-radius:4px;overflow:hidden}
.energy-analysis-v53 .analysis-composition>span{height:100%;min-width:0;border-inline-end:1px solid var(--primary-text-color)}
.energy-analysis-v53 .analysis-hatched{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--primary-text-color) 3px,var(--primary-text-color) 4px)}
.energy-analysis-v53 .analysis-zone-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px}
.energy-analysis-v53 .analysis-mobile-composition{display:none}
@container energy-analysis (max-width:600px){.energy-analysis-v53 .analysis-group-summary{grid-template-columns:minmax(0,1fr);gap:8px}.energy-analysis-v53 .analysis-sankey{display:none}.energy-analysis-v53 .analysis-sankey-wrap{display:none}.energy-analysis-v53 .analysis-mobile-composition{display:block}.energy-analysis-v53 .analysis-flow-labels{display:flex;flex-wrap:wrap;gap:6px 12px;margin-block:8px}}
@container energy-analysis (max-width:480px){.energy-analysis-v53 [data-analysis-axis-minor]{visibility:hidden}.energy-analysis-v53 .analysis-flow{grid-template-columns:minmax(0,1fr);gap:12px}.energy-analysis-v53 .analysis-flow-source{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:6px 12px}.energy-analysis-v53 .analysis-period-controls{align-items:flex-start}.energy-analysis-v53 th,.energy-analysis-v53 td{padding:8px 4px}.energy-analysis-v53 .analysis-switch{gap:4px}}
@container energy-analysis (max-width:360px){.energy-analysis-v53 .analysis-controls{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.energy-analysis-v53 .analysis-controls>label:last-child{grid-column:1/-1}.energy-analysis-v53 .analysis-chart{gap:1px}.energy-analysis-v53 .analysis-tile{padding:10px}.energy-analysis-v53 .analysis-ranking li>div:first-child{display:grid;gap:2px}.energy-analysis-v53 .analysis-tile strong{font-size:1.2em}}
/* Mobile keeps two primary readings and a compact secondary pair. No values are hidden. */
@container energy-analysis (max-width:480px){.energy-analysis-v53 .analysis-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.energy-analysis-v53 .analysis-tile-secondary{padding:6px 10px;border:0;border-radius:0;background:transparent}.energy-analysis-v53 .analysis-tile-secondary strong{font-size:14px;margin-top:2px}.energy-analysis-v53 .analysis-tile-secondary span{font-size:12px}}
`;
  return {markup,styles};
}


// Pure projection of the dedicated Patterns DTO. Only geometry uses Number.
function createEnergyPatternsViewV53({card,width=356}={}) {
  const ui=createFormatUi.forHass(card?._hass),pl=String(ui.language).startsWith('pl');
  const t=(en,polish)=>pl?polish:en;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const valid=value=>typeof value==='string'?/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)&&Number.isFinite(Number(value)):typeof value==='number'&&Number.isFinite(value);
  const number=value=>valid(value)?ui.number(value):t('No data','Brak danych');
  const quantity=(value,unit='kWh')=>valid(value)?number(value)+' '+unit:number(value);
  const currency=row=>typeof row?.currency==='string'&&/^[A-Z]{3}$/.test(row.currency)?row.currency:t('currency unavailable','waluta niedostępna');
  const money=(value,row)=>quantity(value,currency(row));
  const label=row=>ui.pointLabel(row?.start)||t('No date','Brak daty');
  const rows=(dto,state)=>!dto?[]:state.resolution==='hour'?dto.patterns.hours.filter(row=>row.local_date===state.day):dto.patterns.days;
  function normalize(dto,state={}){
    const next={days:7,resolution:'day',day:null,metric:'kwh',type:'line',view:'chart',selected:null,weekdaysOpen:false,initialized:false,...state};
    if(!dto)return next;
    next.days=dto.window.days;
    if(!['day','hour'].includes(next.resolution))next.resolution='day';
    if(!['kwh','energy_cost','variable_cost'].includes(next.metric))next.metric='kwh';
    if(!['line','bar'].includes(next.type))next.type='line';
    if(!['chart','data'].includes(next.view))next.view='chart';
    if(!dto.patterns.days.some(row=>row.local_date===next.day))next.day=dto.patterns.days.at(-1)?.local_date??null;
    if(!next.initialized&&dto.patterns.complete_days===0&&dto.patterns.hours.some(row=>row.kwh!==null)){
      next.resolution='hour';next.day=dto.patterns.hours.filter(row=>row.kwh!==null).at(-1)?.local_date??next.day;
    }
    const current=rows(dto,next);if(!current.some(row=>row.id===next.selected))next.selected=current.at(-1)?.id??null;
    next.initialized=true;return next;
  }
  const option=(value,current,text)=>`<option value="${esc(value)}"${String(value)===String(current)?' selected':''}>${esc(text)}</option>`;
  const select=(control,title,values,current,disabled=false)=>`<label>${esc(title)}<select data-pattern-control="${control}" data-analysis-action="pattern-${control}"${disabled?' disabled':''}>${values.map(([value,text])=>option(value,current,text)).join('')}</select></label>`;
  const button=(control,title,action,value,disabled=false,pressed)=>`<button type="button" data-pattern-control="${control}" data-analysis-action="pattern-${action}" data-analysis-value="${esc(value)}"${disabled?' disabled':''}${pressed===undefined?'':` aria-pressed="${pressed}"`}>${esc(title)}</button>`;
  const period=state=>select('period',t('Period','Okres'),[[7,t('7 days','7 dni')],[30,t('30 days','30 dni')]],state.days);
  const priceBasis=row=>row.price_basis==='gross'?t('gross','brutto'):row.price_basis==='net'?t('net','netto'):t('price basis unavailable','podstawa ceny niedostępna');
  const pricingNote=row=>row.pricing_reason?(row.pricing_reason==='currency_or_basis_mismatch'?t('Costs cannot be combined across different currencies or tax bases. Energy remains available.','Nie można łączyć kosztów z różnych walut lub podstaw ceny. Energia pozostaje dostępna.'):t('Some tariff costs are unavailable for this interval. Known components remain separate.','Niektóre koszty taryfy są niedostępne dla tego przedziału. Znane składniki pozostają osobno.')):'';
  function detail(row,dto,state){
    if(!row)return `<p>${esc(t('No completed intervals.','Brak zakończonych przedziałów.'))}</p>`;
    const partial=state.resolution==='day'&&!row.complete;
    const known=partial?`<p data-pattern-known-subtotal>${esc(t('Partial date — recorded energy and known subtotals, not a full-day total.','Niepełna data — zarejestrowana energia i znane sumy częściowe, bez sumy całej doby.'))}</p><dl><dt>${esc(t('Recorded energy','Zarejestrowana energia'))}</dt><dd>${esc(quantity(row.recorded_kwh))}</dd>${[['energy_cost',t('Known energy cost','Znany koszt energii')],['variable_cost',t('Known variable cost','Znany koszt zmienny')],['legacy_combined_cost',t('Known legacy usage cost','Znany dawny koszt zużycia')]].map(([key,title])=>`<dt>${esc(title)}</dt><dd>${esc(money(row.known_costs[key],row))}</dd>`).join('')}</dl>`:'';
    return `<p>${esc(label(row))} · ${esc(row.complete?t('Measured interval','Zmierzony przedział'):t('Partial / missing','Niepełne / brak'))}</p><dl><dt>kWh</dt><dd>${esc(quantity(row.kwh))}</dd><dt>${esc(t('Energy cost','Koszt energii'))}</dt><dd>${esc(money(row.energy_cost,row))}</dd><dt>${esc(t('Variable fees','Opłaty zmienne'))}</dt><dd>${esc(money(row.variable_cost,row))}</dd><dt>${esc(t('Usage cost without household fixed fees','Koszt zużycia bez stałych opłat gospodarstwa'))}</dt><dd>${esc(money(row.usage_cost,row))}</dd><dt>${esc(t('Legacy combined usage cost','Dawny łączny koszt zużycia'))}</dt><dd>${esc(money(row.legacy_combined_cost,row))}</dd></dl>${known}${pricingNote(row)?`<p>${esc(pricingNote(row))}</p>`:''}<p>${esc(currency(row))} · ${esc(priceBasis(row))}</p>
      <details data-pattern-exact><summary>${esc(t('Full values and time details','Pełne wartości i szczegóły czasu'))}</summary><p>${esc(t('Interval ID','Identyfikator przedziału'))}: ${esc(row.id)}</p><p>UTC: ${esc(row.start)} — ${esc(row.end)}</p><p>${esc(t('Local interval and offsets','Przedział lokalny i przesunięcia'))}: ${esc(row.local_start)} — ${esc(row.local_end)}</p><p>${esc(row.timezone)} · ${esc(t('Repeated-hour occurrence','Wystąpienie powtórzonej godziny'))}: ${esc(ui.number(row.fold))}</p><p>${esc(t('Measured / expected seconds','Zmierzone / oczekiwane sekundy'))}: ${esc(ui.number(row.measured_seconds))} / ${esc(ui.number(row.expected_seconds))}</p>${row.crosses_local_date?`<p>${esc(t('This measurement crosses a local midnight and has not been split.','Ten pomiar przecina lokalną północ i nie został podzielony.'))}</p>`:''}${row.raw_costs?`<dl>${Object.entries(row.raw_costs).map(([key,value])=>`<dt>${esc(key==='energy_cost'?t('Unrounded source energy cost','Niezaokrąglony źródłowy koszt energii'):key==='variable_cost'?t('Unrounded source variable cost','Niezaokrąglony źródłowy koszt zmienny'):t('Unrounded source legacy cost','Niezaokrąglony źródłowy dawny koszt'))}</dt><dd>${esc(money(value,row))}</dd>`).join('')}</dl>`:''}</details>`;
  }
  function plot(current,state){
    const monetary=state.metric!=='kwh';
    const units=new Set(current.filter(row=>valid(row[state.metric])).map(row=>JSON.stringify([row.currency,row.price_basis])));
    const mixed=monetary&&units.size>1;
    const values=current.map(row=>mixed||monetary&&(!/^[A-Z]{3}$/.test(row.currency||'')||!['gross','net'].includes(row.price_basis))?null:row[state.metric]);
    const numeric=values.filter(valid).map(Number),low=Math.min(0,...numeric),high=Math.max(0,...numeric),upper=high===low?low+1:high;
    const w=Math.max(180,Number.isFinite(width)?width:356),h=250,left=54,right=w-10,top=25,bottom=195;
    const x=i=>left+(i+.5)*(right-left)/Math.max(1,current.length),y=v=>bottom-(v-low)/(upper-low)*(bottom-top);
    const unit=monetary?currency(current.find(row=>valid(row[state.metric]))):'kWh';
    let marks='',path='';
    const flush=()=>{if(path)marks+=`<path data-pattern-segment d="${path}" fill="none" stroke="var(--primary-color,#287fd1)" stroke-width="2"/>`;path='';};
    values.forEach((value,index)=>{
      const row=current[index],identity=`data-pattern-id="${esc(row.id)}" data-pattern-value="${esc(value===null?'null':value)}"`;
      if(!valid(value)){flush();marks+=`<g ${identity}></g>`;return;}
      if(index&&row.from>current[index-1].to)flush();
      const numericValue=Number(value),title=`${label(row)} · ${quantity(value,unit)}`,action=`data-analysis-action="pattern-point" data-analysis-value="${esc(row.id)}" role="button" tabindex="-1" aria-label="${esc(title)}"`;
      if(state.type==='bar'){
        const zero=y(0),point=y(numericValue),size=(right-left)/Math.max(1,current.length)*.6;
        marks+=`<rect ${identity} ${action} x="${x(index)-size/2}" y="${Math.min(zero,point)}" width="${Math.max(1,size)}" height="${Math.max(1,Math.abs(zero-point))}" fill="var(--primary-color,#287fd1)"><title>${esc(title)}</title></rect>`;
      }else{
        path+=`${path?' L':'M'}${x(index)},${y(numericValue)}`;
        marks+=`<circle ${identity} ${action} cx="${x(index)}" cy="${y(numericValue)}" r="${row.id===state.selected?5:3}" fill="var(--primary-color,#287fd1)"><title>${esc(title)}</title></circle>`;
      }
    });flush();
    const ticks=[low,(low+upper)/2,upper];
    const grid=ticks.map(value=>`<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="var(--divider-color)"/><text x="${left-6}" y="${y(value)+5}" text-anchor="end">${esc(ui.number(value,{maximumFractionDigits:3}))}</text>`).join('');
    const candidates=ui.chartTicks(current.map(row=>row.start),state.resolution),axes=[...new Set([0,Math.floor((candidates.length-1)/2),candidates.length-1])].map(i=>candidates[i]).filter(Boolean);
    const axis=axes.map(tick=>`<text x="${x(tick.index)}" y="220" text-anchor="middle">${esc(tick.label)}</text>`).join('');
    return `${mixed?`<p role="status">${esc(t('Different currencies or tax bases cannot share a cost chart. Read each interval in Data.','Różne waluty lub podstawy ceny nie mogą mieć wspólnego wykresu kosztu. Odczytaj przedziały w Danych.'))}</p>`:''}<svg data-pattern-chart data-pattern-control="plot" data-analysis-action="pattern-keyboard" data-unit="${esc(unit)}" viewBox="0 0 ${w} ${h}" width="100%" height="250" tabindex="0" role="img" aria-label="${esc(t('Measured series; use arrows, Home, End or the full-size point selector below.','Seria pomiarów; użyj strzałek, Home, End lub pełnowymiarowego wyboru punktu poniżej.'))}"><text x="${left}" y="17">${esc(unit)}</text>${grid}<line data-pattern-zero x1="${left}" x2="${right}" y1="${y(0)}" y2="${y(0)}" stroke="var(--secondary-text-color)"/>${marks}${axis}${!numeric.length?`<text x="${(left+right)/2}" y="110" text-anchor="middle">${esc(t('No data','Brak danych'))}</text>`:''}</svg>`;
  }
  function dataTable(current,state){
    const partial=row=>state.resolution==='day'&&!row.complete;
    return `<div class="patterns-table" data-pattern-control="table" data-analysis-action="pattern-keyboard" tabindex="0" role="region" aria-label="${esc(t('Measured data table','Tabela zmierzonych danych'))}"><table><caption>${esc(t('Exact measured values · fixed fees remain at household level','Dokładne wartości zmierzone · opłaty stałe pozostają na poziomie gospodarstwa'))}</caption><thead><tr>${[t('Date / hour','Data / godzina'),'kWh',t('Energy cost','Koszt energii'),t('Variable fees','Opłaty zmienne'),t('Usage cost','Koszt zużycia'),t('Legacy combined usage cost','Dawny łączny koszt zużycia'),t('Price basis','Podstawa ceny'),t('Coverage / known subtotal','Pokrycie / znana suma częściowa')].map(value=>`<th scope="col">${esc(value)}</th>`).join('')}</tr></thead><tbody>${current.map(row=>`<tr data-pattern-row="${esc(row.id)}" data-kwh="${esc(row.kwh===null?'null':row.kwh)}" data-energy-cost="${esc(row.energy_cost===null?'null':row.energy_cost)}" data-variable-cost="${esc(row.variable_cost===null?'null':row.variable_cost)}" data-timezone="${esc(row.timezone)}"><th scope="row">${esc(label(row))}</th><td>${esc(quantity(row.kwh))}</td><td>${esc(money(row.energy_cost,row))}</td><td>${esc(money(row.variable_cost,row))}</td><td>${esc(money(row.usage_cost,row))}</td><td>${esc(money(row.legacy_combined_cost,row))}</td><td>${esc(priceBasis(row))}</td><td>${esc(row.complete?t('Measured','Zmierzone'):t('Partial / missing','Niepełne / brak'))}${partial(row)?`<br>${esc(t('Recorded energy','Zarejestrowana energia'))}: ${esc(quantity(row.recorded_kwh))}<br>${esc(t('Known energy cost','Znany koszt energii'))}: ${esc(money(row.known_costs.energy_cost,row))}<br>${esc(t('Known variable cost','Znany koszt zmienny'))}: ${esc(money(row.known_costs.variable_cost,row))}`:''}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function markup(dto,state={},transport={}){
    state=normalize(dto,state);
    const opening=`<section class="patterns-measured energy-patterns-v53" data-pattern-root><h3>${esc(t('Your measured consumption','Twoje zmierzone zużycie'))}</h3><div class="patterns-controls">${period(state)}</div>`;
    if(!dto){const upgrade=['unknown_command','patterns_backend_upgrade_required'].includes(transport.error);return opening+`<p role="status">${esc(upgrade?t('Update HA Tools Email to read 7/30-day Patterns.','Zaktualizuj HA Tools Email, aby odczytać Wzorce z 7/30 dni.'):transport.status==='loading'?t('Loading Patterns…','Wczytywanie Wzorców…'):transport.status==='error'?t('Patterns unavailable. Check access and try again.','Wzorce są niedostępne. Sprawdź dostęp i ponów.'):t('No Patterns data.','Brak danych Wzorców.'))}</p></section>`;}
    const current=rows(dto,state),selected=current.find(row=>row.id===state.selected),index=current.indexOf(selected);
    const weekdays=dto.patterns.weekdays.map(row=>{
      // Contract: Sunday=0. Calendar anchor is only for localized weekday names.
      const day=new Intl.DateTimeFormat(ui.language,{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(2026,0,4+row.weekday,12)));
      return `<li data-pattern-weekday="${row.weekday}">${esc(day)}: ${esc(quantity(row.kwh))} · ${esc(ui.number(row.count))} ${esc(t('complete days','pełnych dni'))}</li>`;
    }).join('');
    return opening+`<p data-pattern-range>${esc(ui.range(dto.window.start,dto.window.end)||t('No date','Brak daty'))} · ${esc(ui.timeZone)}</p><div class="patterns-controls">
      ${select('resolution',t('Resolution','Przedziały'),[['day',t('Daily trend','Trend dzienny')],['hour',t('Hours of selected date','Godziny wybranej daty')]],state.resolution)}
      ${state.resolution==='hour'?select('day',t('Local date in measurement calendar','Data lokalna w kalendarzu pomiarów'),dto.patterns.days.map(row=>[row.local_date,ui.calendarDate(row.local_date)||row.local_date]),state.day):''}
      ${select('metric',t('Measure','Miara'),[['kwh',t('Consumption · kWh','Zużycie · kWh')],['energy_cost',t('Energy cost','Koszt energii')],['variable_cost',t('Variable fees','Opłaty zmienne')]],state.metric)}
      ${select('type',t('Chart type','Typ wykresu'),[['line',t('Line','Linia')],['bar',t('Bars','Słupki')]],state.type)}</div>
      <div class="patterns-switch" role="group" aria-label="${esc(t('Presentation','Prezentacja'))}">${button('chart',t('Chart','Wykres'),'view','chart',false,state.view==='chart')}${button('data',t('Data','Dane'),'view','data',false,state.view==='data')}</div>
      ${state.view==='data'?dataTable(current,state):`<div data-pattern-plot>${plot(current,state)}</div>`}
      <div class="patterns-controls patterns-point-controls">${button('previous',t('Previous row','Poprzedni wiersz'),'step','previous',index<=0)}${select('point',t('Point details (arrows, Home / End)','Szczegóły punktu (strzałki, Home / End)'),current.map(row=>[row.id,label(row)]),state.selected,current.length===0)}${button('next',t('Next row','Następny wiersz'),'step','next',index<0||index>=current.length-1)}</div>
      <div data-pattern-detail role="status" aria-live="polite">${detail(selected,dto,state)}</div>
      <details data-pattern-weekdays${state.weekdaysOpen?' open':''}><summary data-pattern-control="weekdays" data-analysis-action="pattern-weekdays">${esc(t('Weekday averages · complete days only','Średnie według dnia tygodnia · tylko pełne dni'))}</summary><ul>${weekdays}</ul></details>
      <details data-pattern-source><summary>${esc(t('Source and time details','Źródło i szczegóły czasu'))}</summary><p>${esc(t('Measurement calendar','Kalendarz pomiarów'))}: ${esc(dto.window.timezone)} · ${esc(ui.number(dto.patterns.represented_days))}/${esc(ui.number(dto.window.days))} ${esc(t('represented local dates','obecnych dat lokalnych'))}</p><p>UTC: ${esc(dto.window.start)} — ${esc(dto.window.end)}</p><p>${esc(t('Only complete local days have day totals. Measured hours remain available on partial dates. DST gaps have no bucket; repeated hours retain distinct absolute IDs and offsets.','Tylko pełne dni lokalne mają sumę doby. Zmierzone godziny pozostają dostępne dla niepełnych dat. Luki po zmianie czasu nie mają przedziału; powtórzone godziny zachowują odrębne identyfikatory czasu i przesunięcia.'))}</p></details>
      <details data-pattern-fees><summary>${esc(t('Household fixed fees · separate from these intervals','Stałe opłaty gospodarstwa · osobno od tych przedziałów'))}</summary><p>${esc(money(dto.totals.fixed_cost,dto.totals))}</p>${dto.fees.details?`<dl>${Object.entries(dto.fees.details.components||{}).map(([key,value])=>`<dt>${esc(({subscription:t('Subscription','Abonament'),capacity:t('Capacity','Opłata mocowa'),distribution:t('Fixed distribution','Dystrybucja stała'),other:t('Other','Pozostałe')})[key]||t('Legacy fixed fee','Dawna opłata stała'))}</dt><dd>${esc(money(value,dto.totals))}</dd>`).join('')}</dl>`:''}${dto.rates.map(rate=>`<section><h4>${esc(t('Monthly rates effective from','Stawki miesięczne obowiązujące od'))} ${esc(ui.calendarDate(rate.valid_from)||rate.valid_from)}${rate.valid_to?' – '+esc(ui.calendarDate(rate.valid_to)||rate.valid_to):''}</h4><p>${esc(currency(rate))} · ${esc(priceBasis(rate))}</p><dl>${Object.entries(rate.fixed_monthly||{}).map(([key,value])=>`<dt>${esc(({subscription:t('Subscription','Abonament'),capacity:t('Capacity','Opłata mocowa'),distribution:t('Fixed distribution','Dystrybucja stała'),other:t('Other','Pozostałe')})[key]||t('Fixed fee','Opłata stała'))}</dt><dd>${esc(money(value,rate))}</dd>`).join('')}${rate.legacy_combined_monthly!==null&&rate.legacy_combined_monthly!==undefined?`<dt>${esc(t('Legacy combined monthly fee','Dawna łączna opłata miesięczna'))}</dt><dd>${esc(money(rate.legacy_combined_monthly,rate))}</dd>`:''}</dl></section>`).join('')}</details></section>`;
  }
  const styles=()=>`.energy-patterns-v53{display:block;container-type:inline-size;container-name:energy-patterns;min-width:0;max-width:100%;width:100%;font-size:14px;line-height:1.5;color:var(--primary-text-color);overflow-wrap:anywhere}.energy-patterns-v53 *{box-sizing:border-box}.energy-patterns-v53 h3{font-size:1em;margin:8px 0}.energy-patterns-v53 .patterns-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:10px;align-items:end;margin:12px 0}.energy-patterns-v53 label{display:grid;gap:4px;min-width:0;font-size:12px}.energy-patterns-v53 select,.energy-patterns-v53 button{min-height:44px;min-width:44px;max-width:100%;padding:8px;font:inherit;font-size:14px;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px}.energy-patterns-v53 select{width:100%;min-width:0}.energy-patterns-v53 button{cursor:pointer}.energy-patterns-v53 button:disabled{opacity:.6}.energy-patterns-v53 button[aria-pressed="true"]{border:2px solid var(--primary-color)}.energy-patterns-v53 :is(button,select,summary,svg,[tabindex]):focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}.energy-patterns-v53 .patterns-switch{display:flex;gap:8px;flex-wrap:wrap}.energy-patterns-v53 [data-pattern-plot]{min-width:0;max-width:100%;width:100%}.energy-patterns-v53 svg{display:block;width:100%;max-width:100%;height:250px}.energy-patterns-v53 svg text{fill:var(--primary-text-color);font:14px system-ui,sans-serif}.energy-patterns-v53 .patterns-table{max-width:100%;overflow:auto}.energy-patterns-v53 table{width:100%;border-collapse:collapse;font-size:14px}.energy-patterns-v53 th,.energy-patterns-v53 td{padding:8px;text-align:start;vertical-align:top;border-bottom:1px solid var(--divider-color)}.energy-patterns-v53 caption{text-align:start;font-weight:600;padding:8px 0}.energy-patterns-v53 [data-pattern-detail]{padding:12px;border:1px solid var(--divider-color);border-radius:8px}.energy-patterns-v53 dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px 12px}.energy-patterns-v53 dd{margin:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}.energy-patterns-v53 summary{min-height:44px;padding:10px 0;cursor:pointer}.energy-patterns-v53 details{border-top:1px solid var(--divider-color);margin-top:12px}.energy-patterns-v53 [data-pattern-range]{font-size:12px;color:var(--secondary-text-color)}@container energy-patterns (max-width:390px){.energy-patterns-v53 .patterns-controls{grid-template-columns:minmax(0,1fr)}.energy-patterns-v53 .patterns-point-controls{grid-template-columns:1fr 1fr}.energy-patterns-v53 .patterns-point-controls label{grid-row:1;grid-column:1/-1}}`;
  return {markup,styles,normalize,rows};
}


// Owns only the currently mounted schema2 view. Card methods own legacy compatibility.
function createEnergyAnalysisHostV53({card}) {
  let root=null, section='overview', route=null, identity=null, mode='schema2', started=false, ticket=0;
  let selection={period:'day',comparison:'previous'}, options={level:'areas',view:'chart',selected:null};
  let calendarSelection={...selection}, patterns={days:7}, resizeObserver=null, patternWidth=0;
  let calendarOpen=false;
  const captureCalendar=()=>{const node=root?.querySelector('[data-analysis-calendar-options]');if(node)calendarOpen=node.open;};
  const patternsView=()=>createEnergyPatternsViewV53({card,width:root?.clientWidth||patternWidth||356});
  const context=()=>[card._hass?.connection,card._hass?.user?.id,card._hass?.user?.is_active,card._hass?.user?.is_admin,card._hass?.connected,
    card._hass?.config?.time_zone,card._hass?.connection?.connected];
  const same=(a,b)=>a && b && a.every((v,i)=>v===b[i]);
  const pl=()=>String(card._hass?.locale?.language || card._hass?.language || 'en').startsWith('pl');
  const text=(en,polish)=>pl()?polish:en;
  const active=()=>card.isConnected && root?.isConnected;
  const controller=createEnergyAnalysisV53({card,onChange:()=>paint()});
  const binding=createEnergyAnalysisBindingV53({card,controller,onInvalidate:()=>{
    mode='schema2';started=false;ticket++;card._clearAnalysisLegacyV53();
    if(active()) {root.replaceChildren();card._render();if(active() && !started)void read();}
  }});
  function observe() {
    const next=context();
    if(!same(identity,next)) {
      calendarOpen=false;
      // Clear legacy rows before any newly authorized response can arrive.
      if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('keydown',keydown);root.replaceChildren();}root=null;
      resizeObserver?.disconnect();resizeObserver=null;patterns={days:7};patternWidth=0;
      if(section==='patterns')selection={kind:'patterns',days:7};started=false;mode='schema2';ticket++;
      binding.stop();card._clearAnalysisLegacyV53();identity=next;
    }
    return binding.observe();
  }
  function paint() {
    if(!active() || mode==='legacy')return;
    const state=binding.observe(), view=section==='patterns'?patternsView():createEnergyAnalysisViewV53({card});
    if(section==='patterns'&&state.status==='ready'&&state.snapshot?.kind==='patterns')patterns=view.normalize(state.snapshot,patterns);
    captureCalendar();
    const focus=root.getRootNode().activeElement;
    const saved=root.contains(focus)?{action:focus.dataset.analysisAction,value:focus.dataset.analysisValue}:null;
    root.innerHTML=`<style>${view.styles()}</style>` +
      (section==='patterns'?view.markup(state.status==='ready'&&state.snapshot?.kind==='patterns'?state.snapshot:null,patterns,state):state.status==='ready' ? view.markup(state.snapshot,{...selection,...options,section}) :
        `<p role="status">${state.status==='loading'?text('Loading energy analysis…','Ładowanie analizy energii…'):
          state.status==='error'?text('Energy analysis unavailable. Access or backend response could not be confirmed.','Analiza energii niedostępna. Nie potwierdzono dostępu lub odpowiedzi serwera.'):text('Energy analysis','Analiza energii')}</p>`) +
      `<button type="button" data-analysis-action="retry">${text('Retry','Ponów')}</button>`;
    const calendar=root.querySelector('[data-analysis-calendar-options]');if(calendar)calendar.open=calendarOpen;
    if(saved) [...root.querySelectorAll('[data-analysis-action]')].find(el=>el.dataset.analysisAction===saved.action && el.dataset.analysisValue===saved.value)?.focus({preventScroll:true});
  }
  async function read() {
    if(!active() || mode==='legacy')return;
    const token=++ticket;started=true;
    const state=await binding.read(selection);
    if(token!==ticket || !active())return;
    if(selection.kind!=='patterns' && state.status==='error' && state.error==='unknown_command') {
      // Controller exposes this only for a structured error.code from the wire.
      mode='legacy';root.replaceChildren();
      card._loadAnalysisLegacyV53();
    } else paint();
  }
  function action(event) {
    const control=event.target.closest('[data-analysis-action]');
    if(!control || !root?.contains(control))return;
    const name=control.dataset.analysisAction;
    if(event.type==='click' && control.matches('select,input') || event.type==='change' && !control.matches('select,input'))return;
    const value=control.matches('select,input')?control.value:control.dataset.analysisValue;
    if(name==='retry') {binding.invalidate();return;}
    if(name.startsWith('pattern-')){patternAction(event,name.slice(8),value);return;}
    if(name==='period') {
      if(!['day','week','month','year'].includes(value))return;
      selection.period=value;
      if(value!=='day' && ['same_weekday','mean7'].includes(selection.comparison))selection.comparison='previous';
    } else if(name==='anchor') {if(value)selection.anchor=value;else delete selection.anchor;}
    else if(name==='comparison')selection.comparison=value;
    else if(name==='level')options.level=value;
    else if(name==='view')options.view=value;
    else if(name==='point')options.selected=value;
    else return;
    if(['period','anchor','comparison'].includes(name)) {options.selected=null;void read();}else paint();
  }
  function patternAction(event,name,value){
    if(section!=='patterns')return;
    if(name==='period'){
      if(!['7','30'].includes(String(value)))return;
      patterns.days=Number(value);selection={kind:'patterns',days:patterns.days};void read();return;
    }
    const state=binding.observe();if(state.status!=='ready'||state.snapshot?.kind!=='patterns')return;
    const view=patternsView(),snapshot=state.snapshot;patterns=view.normalize(snapshot,patterns);
    if(name==='resolution'&&['day','hour'].includes(value)){patterns.resolution=value;patterns.selected=null;}
    else if(name==='day'&&snapshot.patterns.days.some(row=>row.local_date===value)){patterns.day=value;patterns.selected=null;}
    else if(name==='metric'&&['kwh','energy_cost','variable_cost'].includes(value))patterns.metric=value;
    else if(name==='type'&&['line','bar'].includes(value))patterns.type=value;
    else if(name==='view'&&['chart','data'].includes(value))patterns.view=value;
    else if(name==='point'&&view.rows(snapshot,patterns).some(row=>row.id===value))patterns.selected=value;
    else if(name==='step'&&['previous','next'].includes(value)){
      const rows=view.rows(snapshot,patterns),index=rows.findIndex(row=>row.id===patterns.selected);
      patterns.selected=rows[Math.max(0,Math.min(rows.length-1,index+(value==='previous'?-1:1)))]?.id??null;
    }else if(name==='weekdays'){event.preventDefault();patterns.weekdaysOpen=!patterns.weekdaysOpen;}
    else return;
    paint();
  }
  function keydown(event){
    if(section!=='patterns'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter'].includes(event.key))return;
    const node=event.target.closest('[data-analysis-action]');
    if(!node||!['pattern-point','pattern-keyboard'].includes(node.dataset.analysisAction))return;
    const state=binding.observe();if(state.status!=='ready'||state.snapshot?.kind!=='patterns')return;
    event.preventDefault();const view=patternsView();patterns=view.normalize(state.snapshot,patterns);
    const rows=view.rows(state.snapshot,patterns),index=rows.findIndex(row=>row.id===patterns.selected);
    const move={ArrowLeft:index-1,ArrowUp:index-1,ArrowRight:index+1,ArrowDown:index+1,Home:0,End:rows.length-1,Enter:index}[event.key];
    patterns.selected=rows[Math.max(0,Math.min(rows.length-1,move))]?.id??null;paint();
  }
  function mount(next, nextSection='overview', period=null) {
    observe();
    if(!next || !card.isConnected || !next.isConnected) {stop();return;}
    const previousSection=section;section=nextSection;
    if(previousSection!==section && (previousSection==='patterns'||section==='patterns')){
      if(section==='patterns'){calendarSelection={...selection};selection={kind:'patterns',days:patterns.days||7};}
      else selection={...calendarSelection};
      ticket++;started=false;controller.invalidate();
    }
    if(section!=='patterns' && ['day','week','month','year'].includes(period) && period!==route) {
      route=period;selection.period=period;options.selected=null;started=false;
      if(period!=='day' && ['same_weekday','mean7'].includes(selection.comparison))selection.comparison='previous';
    }
    if(root!==next) {
      captureCalendar();
      if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('keydown',keydown);if(!root.contains(next))root.replaceChildren();}
      root=next;root.addEventListener('click',action);root.addEventListener('change',action);root.addEventListener('keydown',keydown);
      resizeObserver?.disconnect();resizeObserver=null;
      if(section==='patterns' && typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(entries=>{
        const width=entries[0]?.contentRect?.width;if(active()&&section==='patterns'&&width>0&&width!==patternWidth){patternWidth=width;paint();}
      });resizeObserver.observe(root);}
    }
    if(mode==='legacy' && !root.querySelector('[data-analysis-upgrade-v53]')) {
      const hint=root.ownerDocument.createElement('p');hint.dataset.analysisUpgradeV53='';hint.setAttribute('role','status');
      hint.textContent=text('Upgrade HA Tools Email for schema2 analysis. Showing compatible legacy measurements.','Zaktualizuj HA Tools Email, aby używać analizy schema2. Pokazano zgodne starsze pomiary.');root.prepend(hint);
    }
    paint();if(!started && mode!=='legacy')void read();
  }
  function stop() {
    calendarOpen=false;
    ticket++;started=false;mode='schema2';binding.stop();resizeObserver?.disconnect();resizeObserver=null;
    if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('keydown',keydown);root.replaceChildren();root=null;}
  }
  const legacyAllowed=()=>{observe();return mode==='legacy' && card.isConnected && card._analysisIsActiveV53() && card._hass?.user?.is_active!==false;};
  return {mount,stop,observe,legacyAllowed,invalidate:binding.invalidate,state:binding.observe};
}
this._tariffHostController = createTariffHostV3({ card: this, kind: 'insights', createModel: createEnergyTariffV3, legacyProfile: energyTariffProfileV3, createSettings: createTariffSettingsV3, createUi: createUiV3, ...this._createTariffConsumerV3(createTariffGuardV3) });
this._installTariffConsumerV3();
// HA_TARIFF_V3_END
      return this._tariffHostController;
    }
    _tariffCurrency() { return this._sharedTariffNeedsConfirmationV3() ? '' : this._getTariffHostV3().currency(); }
    async _loadSharedTariffProfile() {
      const confirmed = await this._getTariffHostV3().load();
      if (confirmed) this._sharedTariffExpectedV3 = true;
      return confirmed;
    }
    _sharedTariffNeedsConfirmationV3() {
      return this._sharedTariffExpectedV3 && !Object.hasOwn(this._config, 'tariff_profile') && this._sharedTariffReadStatus !== 'success';
    }
    _observeTariffNavigationV3() {
      this._observeTariffContextV3();
      if (!this._sharedTariffExpectedV3 || Object.hasOwn(this._config, 'tariff_profile')) return;
      const guard = this._getTariffHostV3().guard, token = guard.snapshot();
      void this._loadSharedTariffProfile().then(confirmed => {
        if (confirmed && guard.current(token) && this.isConnected) this._repriceTariffV3();
      });
    }
    _tariffDetailsMarkup() { return this._getTariffHostV3().markup(); }
    _bindTariffSettings() {
      if (this._tariffWriteUnconfirmedV3) {
        this._tariffEditorState ||= { profile: null, revision: null, status: 'not_checked', busy: false };
        this._tariffEditorState.writeUnconfirmed = true;
      }
      this._getTariffHostV3().bind();
    }
    _resetTariffContext(nextHass) { this._getTariffHostV3().reset(nextHass); }

    // Owned by this card. No shared global state and no polling/retry path.
    _createTariffConsumerV3(createGuard) {
      const guard = createGuard({ getHass: () => this._hass, getContext: () => this._tariffContextV3() });
      const call = guard.call;
      guard.call = (token, request, admin = false) => {
        const dispatched = request.type === 'ha_tools_email/set_tariff' && !guard.occupied() && guard.current(token, admin);
        const result = call(token, request, admin);
        if (dispatched && guard.occupied()) {
          // Persists across mount/authority purges. An ACK cannot clear this fence.
          this._tariffWriteUnconfirmedV3 = true;
        }
        return result;
      };
      return { guard, onRefresh: () => {
        // Only explicit editor Load or independently confirmed Save reaches here.
        this._tariffWriteUnconfirmedV3 = false;
        this._repriceTariffV3();
      } };

    }
    _installTariffConsumerV3() {
      const guard = this._tariffHostController.guard;
      let active = true;
      const unsubscribe = guard.subscribe(() => {
        this._clearInsightDevicesV3();
        queueMicrotask(() => {
        // Setters assign the prospective hass before this pure render executes.
        if (active && this.ownerDocument?.defaultView?.document) this._repriceTariffV3();
        });
      });
      const unsubscribeWire = guard.subscribeWire(() => queueMicrotask(() => {
        // A public timeout never releases raw occupancy; update the read control only
        // when the original wire actually settles, without starting another read.
        if (active && this.isConnected && this.ownerDocument?.defaultView?.document) this._updateContent();
      }));
      this._tariffConsumerUnsubscribeV3 = () => { active = false; unsubscribe(); unsubscribeWire(); };
    }
    _tariffContextV3() {
      return { config: this._config, tab: this._activeTab, range: this._activeTab || 'overview',
        sources: this._tariffSourceIds || [], windowEnd: this._tariffWindowEnd ?? null };
    }
    _observeTariffContextV3() { this._getTariffHostV3().guard.observe(); }
    _createEnergyReadV3({ devices = false } = {}) {
      const host = this._getTariffHostV3(), source = this._hass;
      if (!devices) this._tariffWindowEnd = Math.floor(Date.now() / ENERGY_HOUR) * ENERGY_HOUR;
      let token = host.guard.observe();
      const current = () => host.guard.current(token);
      const assertCurrent = () => { if (!current() || !this._analysisLegacyAllowedV53()) throw { code: 'energy_context_changed' }; };
      // The facade preserves readEnergyHours' complete source/unit/window behavior.
      const hass = { ...source, callWS: async request => {
        assertCurrent();
        const result = devices ? await host.guard.call(token, request) : await source.callWS.call(source, request);
        assertCurrent();
        if (!devices && request.type === 'energy/get_prefs') {
          const knownPrefs = this._insightDeviceState?.raw?.preferences || this._insightSourceCacheV3?.preferences;
          if (knownPrefs && JSON.stringify(knownPrefs.device_consumption ?? null) !== JSON.stringify(result?.device_consumption ?? null))
            this._clearInsightDevicesV3();
          this._tariffSourceIds = energyImportIds(result);
          token = host.guard.observe();
          this._insightSourceCacheV3 = { preferences: _insightsCopyV3(result), current };
        }
        if (!devices && request.type === 'recorder/get_statistics_metadata' && this._insightSourceCacheV3?.current === current)
          this._insightSourceCacheV3.metadata = _insightsCopyV3(result);
        return result;
      } };
      return { hass, current };
    }

    _repriceTariffV3() {
      if (!this._hass) return;
      if (this._sharedTariffProfile != null) this._sharedTariffExpectedV3 = true;
      if (this._insightsEnergyModel) {
        try { this._projectInsightsV3(this._insightsEnergyModel); this._error = null; }
        catch (error) { this._error = error.message || this._t('error'); }
      }
      this._updateContent();
      if (this._chartJsReady) this._renderCharts();
    }


    _tariffRateForHour(stamp) {
      return this._getTariffV3().priceBuckets([{ from: stamp, to: stamp + ENERGY_HOUR, kwh: 1 }]).energyCost;
    }

    _getRate(hour, dayOfWeek) {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const dayStart = c.energy_day_hour_start ?? 6;
      const nightStart = c.energy_night_hour_start ?? 22;
      const isDay = dayStart < nightStart ? (hour >= dayStart && hour < nightStart) : (hour >= dayStart || hour < nightStart);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      let raw;
      if (mode === 'day_night') raw = isDay ? c.energy_price_day : c.energy_price_night;
      else if (mode === 'weekday_weekend') raw = isWeekend ? c.energy_price_weekend : c.energy_price_weekday;
      else if (mode === 'mixed') raw = isWeekend ? (isDay ? c.energy_price_we_day : c.energy_price_we_night) : (isDay ? c.energy_price_wd_day : c.energy_price_wd_night);
      else raw = c.energy_price;
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
    }

    _getTariffLabel() {
      if (this._sharedTariffNeedsConfirmationV3()) return this._lang === 'pl' ? 'Wspólna taryfa niepotwierdzona' : 'Shared tariff not confirmed';
      const custom = Object.hasOwn(this._config, 'tariff_profile') ? this._config.tariff_profile : this._sharedTariffProfile;
      if (Object.hasOwn(this._config, 'tariff_profile') || custom != null) return this._getTariffV3().valid
        ? `${custom.name || custom.type || 'Custom'} · ${custom.priceBasis === 'net' ? (this._lang === 'pl' ? 'netto' : 'net') : (this._lang === 'pl' ? 'brutto' : 'gross')} · ${custom.timezone}`
        : (this._lang === 'pl' ? 'Taryfa niedostępna' : 'Tariff unavailable');
      const currency = this._tariffCurrency();
      const rate = this._getRate(12, 1);
      const L = this._lang === 'pl';
      return rate === null
        ? (L ? 'Koszt niedostępny: skonfiguruj taryfę' : 'Cost unavailable: configure a tariff')
        : `${currency} / kWh (${L ? 'skonfigurowana taryfa' : 'configured tariff'})`;
    }

    set hass(hass) {
      try {
        const previousLanguage = this._lang;
        const presentationKey = createFormatUi.forHass(hass).key;
        const presentationChanged = this._presentationKeyV4 !== undefined && this._presentationKeyV4 !== presentationKey;
        this._presentationKeyV4 = presentationKey;
        const language = hass?.locale?.language || hass?.language;
        if (language) this._lang = language.startsWith('pl') ? 'pl' : 'en';
        // Keep scalar values: Home Assistant may mutate hass in place.
        const measurementBinding = { present: !!hass, connection: hass?.connection ?? null,
          user: hass?.user?.id ?? null, zone: hass?.config?.time_zone ?? null };
        const previousBinding = this._measurementBindingV3;
        const measurementsChanged = !!previousBinding && Object.keys(measurementBinding).some(key => previousBinding[key] !== measurementBinding[key]);
        this._measurementBindingV3 = measurementBinding;
        if (measurementsChanged) {
          this._insightsEnergyModel = null;
          this._data = null;
          this._insightProjectionCacheV3 = null;
          this._insightChartDataset = null;
          this._insightChartStates = {};
          this._insightChartState = null;
          this._insightRenderEpoch++;
          this._clearInsightDevicesV3();
          this._lastDataFetch = 0;
          this._error = null;
        }
        this._resetTariffContext(hass);
        this._hass = hass;
        this._analysisHostV53?.observe();
        if (!hass) {
          this._insightResize?.disconnect();
          this.shadowRoot.replaceChildren();
          this._domBuilt = false;
          return;
        }
        this.classList.toggle('bento-dark', hass.themes?.darkMode === true);
        if (measurementsChanged && this._firstHassRender) this._render();

        const now = Date.now();
        if (!this._firstHassRender) {
          this._firstHassRender = true;
          if (!this._optionsConfigV5?.default_tab) this._activeTab = localStorage.getItem('ha-tools-energy-insights-active-tab') || 'overview';
          this._loadChartJs();
          this._fetchData();
          this._render();
          this._lastRenderTime = now;
          return;
        }

        if ((previousLanguage !== this._lang || presentationChanged) && this._domBuilt) {
          const header = this.shadowRoot.querySelector('.panel-header');
          if (header) header.outerHTML = this._renderHeader();
          this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
            btn.textContent = this._t(btn.dataset.tab);
          });
          const tariffSummary = this.shadowRoot.querySelector('[data-tariff-details] > summary');
          if (tariffSummary) tariffSummary.textContent = this._lang === 'pl' ? 'Ustawienia taryfy' : 'Tariff settings';
          this._updateContent();
          if (this._chartJsReady) this._renderCharts();
        }
        this._syncChartTheme();
        this._syncSupport();

        if ((previousLanguage !== this._lang || presentationChanged) && !measurementsChanged) return; // A locale gesture only reprojects cached measurements.

        // Fetch new data every 5 minutes (recorder stats don't change often)
        if (!this._lastDataFetch || (now - this._lastDataFetch) > 300000) {
          this._fetchData();
        }
      } catch (e) {
        this._renderError(e);
      }
    }


    _analysisIsActiveV53() {return this._activeTab !== 'tips';}
    _getAnalysisHostV53() { return this._analysisHostV53 ||= this._getTariffHostV3().analysis(); }
    _analysisLegacyAllowedV53() { return this._getAnalysisHostV53().legacyAllowed(); }
    _syncAnalysisV53() {
      if(!this._analysisIsActiveV53()){this._analysisHostV53?.stop();return;}
      const host=this._getAnalysisHostV53();
      const mount=this.shadowRoot?.querySelector('[data-analysis-mount-v53]') || (host.legacyAllowed() ? this.shadowRoot?.querySelector('.panel-body') : null);
      host.mount(mount, mount?.dataset.analysisSection || 'overview', mount?.dataset.analysisPeriod);
    }

    connectedCallback() {
      if(this._hass) {
      this._analysisHostV53?.observe();
      queueMicrotask(()=>{
        if(!this.isConnected || !this._analysisIsActiveV53())return;
        if(this.shadowRoot?.querySelector('[data-analysis-mount-v53]'))this._syncAnalysisV53();
        else this._render();
      });
    }
      if (this._tariffHostController) {
        this._tariffHostController.guard.resume();
        // Reconfirm shared prices for this mount; reuse settled measurements.
        this._observeTariffNavigationV3();
      }
      if (this._initialMeasurementsStartedV3 && !this._initialMeasurementsSettledV3 && this._hass) this._fetchData();
    }

    disconnectedCallback() {
      this._analysisHostV53?.stop();
      this._optionsResizeV5?.disconnect();
      this._insightResize?.disconnect();
      this._insightRenderEpoch++;
      this._clearInsightDevicesV3();
      this._tariffHostController?.guard.suspend();
      this._timers.forEach(timer => clearTimeout(timer));
      this._timers.clear();
      Object.values(this._charts).forEach(c => {
        try { c.destroy(); } catch(e) { console.debug('[ha-energy-insights] caught:', e); }
      });
      this._charts = {};
    }

    _schedule(callback, delay) {
      const timer = setTimeout(() => {
        this._timers.delete(timer);
        if (this.isConnected) callback();
      }, delay);
      this._timers.add(timer);
      return timer;
    }

    _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

    // ===== DATA LOADING =====

    _loadChartJs() { this._chartJsReady = true; } // Insights SVG needs no vendor or network load.

    async _fetchData() {
      if(!this._analysisLegacyAllowedV53())return;
      if (!this._hass?.callWS || this._insightsReadPending || this._insightDevicePending || this._getTariffHostV3().guard.occupied()) return;
      const read = this._createEnergyReadV3();
      this._insightsReadPending = true;
      this._initialMeasurementsStartedV3 = true;
      // A blocked dispatch must leave the next session eligible for its first read.
      this._lastDataFetch = Date.now();
      this._loading = true; this._error = null;
      if (this._domBuilt) this._updateLoadingState();
      try {
        const model = await readEnergyHours(read.hass, 720);
        if (!read.current()) return;
        await this._loadSharedTariffProfile();
        if (!read.current()) return;
        this._insightsEnergyModel = model;
        this._projectInsightsV3(model);
      } catch (err) {
        if (!read.current()) return;
        this._error = err.message || this._t('error');
      } finally {
        this._insightsReadPending = false;
        this._loading = false;
        // A stale first read supplies no measurements and must not consume the
        // five-minute refresh window. Finish only an interrupted first load
        // automatically; later refreshes wait for the next normal hass update.
        if (read.current()) this._initialMeasurementsSettledV3 = true;
        else {
          this._lastDataFetch = 0;
          if (!this._initialMeasurementsSettledV3) queueMicrotask(() => {
            const guard = this._getTariffHostV3().guard;
            if (this.isConnected && guard.available(guard.observe())) this._fetchData();
          });
        }
        // Repaint current state even when the completed response was discarded;
        // otherwise the old spinner can survive after the read has settled.
        if (this.isConnected && this.ownerDocument?.defaultView?.document) {
          this._updateContent();
          if (this._chartJsReady) this._renderCharts();
        }
      }
    }

    _projectInsightsV3(model) {
        if (model.noSensors || model.noSeries) {
          this._data = { sensors: model.ids, noSensors: model.noSensors, noSeries: model.noSeries };
        } else {
          const rate = (_hour, _weekday, stamp) => this._tariffRateForHour(stamp);
          rate.currency = this._tariffCurrency();
          const today = model.today(rate);
          // Keep partial measured intervals inspectable; summary() already preserves null totals.
          const week = model.summary(model.end - 168 * ENERGY_HOUR, model.end, rate);
          const previous = model.summary(model.end - 336 * ENERGY_HOUR, model.end - 168 * ENERGY_HOUR, rate);
          const month = model.summary(model.start, model.end, rate);
          const weekDays = model.daily(model.end - 168 * ENERGY_HOUR, model.end, rate);
          const monthDays = model.daily(model.start, model.end, rate);
          this._data = { sensors: model.ids, noSensors: false, topDevices: [],
            todayKwh: today.total, todayCost: today.cost, thisWeekKwh: week.total, prevWeekKwh: previous.total,
            monthKwh: month.total, weekCost: week.cost, monthCost: month.cost,
            dailyCosts: model.hourlyToday.map((kwh, hour) => {
              const rows = [...model.points].filter(([stamp, point]) => stamp >= model.todayStart && stamp < model.end && point.hour === hour)
                .map(([stamp, point]) => ({ from: stamp, to: stamp + ENERGY_HOUR, kwh: point.kwh }));
              return kwh === null ? null : this._getTariffV3().priceBuckets(rows).energyCost;
            }),
            dailyData: model.hourlyToday, weeklyData: weekDays.map(day => day.total), monthlyData: monthDays.map(day => day.total),
            weekLabels: weekDays.map(day => day.key), monthLabels: monthDays.map(day => day.key),
            weeklyCosts: weekDays.map(day => day.cost), monthlyCosts: monthDays.map(day => day.cost),
            windows: { daily: today, weekly: week, monthly: month }, zone: model.zone };
        }
    }

    // Measured Insights: local projection only. No display action dispatches a read.
    _insightTextV3(en, pl) { return this._lang === 'pl' ? pl : en; }
    _insightNumberV3(value) {
      // String preserves every measured digit; use the locale decimal separator only.
      if (typeof value !== 'number' || !Number.isFinite(value)) return this._insightTextV3('Unavailable', 'Niedostępne');
      const decimal = new Intl.NumberFormat(this._lang).formatToParts(1.1).find(p => p.type === 'decimal')?.value || '.';
      return String(value === 0 ? 0 : value).replace('.', decimal);
    }
    _insightDisplayNumberV3(value) {
      return typeof value === 'number' && Number.isFinite(value)
        ? new Intl.NumberFormat(this._lang, { maximumFractionDigits: 3 }).format(value) : this._insightNumberV3(value);
    }
    _insightLocalV3(stamp, zone) {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset' })
        .formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
      return { key: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), offset: p.timeZoneName };
    }
    _insightWindowV3(period = this._activeTab) {
      const model = this._insightsEnergyModel;
      const zone = this._hass?.config?.time_zone || model?.zone || 'UTC';
      const to = model?.end ?? Math.floor(Date.now() / ENERGY_HOUR) * ENERGY_HOUR;
      let from = period === 'monthly' ? model?.start ?? to - 720 * ENERGY_HOUR : to - 168 * ENERGY_HOUR;
      if (period === 'daily') {
        const today = this._insightLocalV3(Date.now(), zone).key;
        from = to;
        for (let stamp = to - 26 * ENERGY_HOUR; stamp < to; stamp += ENERGY_HOUR) {
          if (this._insightLocalV3(stamp, zone).key === today) { from = stamp; break; }
        }
      }
      const first = this._insightLocalV3(from, zone);
      return { from, to, zone, period, boundaryComplete: period !== 'daily' || (first.hour === 0 && first.minute === 0) };
    }
    _clearInsightDevicesV3() {
      this._insightDeviceEpoch = (this._insightDeviceEpoch || 0) + 1;
      this._insightDeviceState = { status: 'not_read', raw: null };
      this._insightDeviceProjectionV3 = null;
      this._insightSourceCacheV3 = null;
      this._insightDeviceDetails.clear();
      this._insightDevicePage = 0;
    }
    _configuredInsightDevicesV3(prefs) {
      return (Array.isArray(prefs?.device_consumption) ? prefs.device_consumption : []).map((device, index) => ({
        id: typeof device?.stat_consumption === 'string' ? device.stat_consumption : '',
        name: typeof device?.name === 'string' ? device.name : '',
        includedIn: typeof device?.included_in_stat === 'string' ? device.included_in_stat : null,
        key: String(index) + ':' + (typeof device?.stat_consumption === 'string' ? device.stat_consumption : '')
      }));
    }
    _insightMetadataV3(raw) {
      if (!Array.isArray(raw)) return raw && typeof raw === 'object' ? raw : {};
      const result = Object.create(null);
      for (const row of raw) if (typeof row?.statistic_id === 'string') {
        const id = row.statistic_id;
        result[id] = Object.hasOwn(result, id) ? null : row;
      }
      return result;
    }
    _insightEnergyMetadataV3(id, metadata) {
      const row = Object.hasOwn(metadata, id) ? metadata[id] : null;
      const unit = row?.statistics_unit_of_measurement ?? row?.unit_of_measurement;
      return !!id && row?.has_sum === true && (row.statistic_id == null || row.statistic_id === id) &&
        (row.unit_class == null || row.unit_class === 'energy') && ['Wh', 'kWh', 'MWh'].includes(unit);
    }
    _readInsightDevicesV3() {
      if(!this._analysisLegacyAllowedV53())return;
      if (this._insightDevicePending) return this._insightDevicePending;
      const host = this._getTariffHostV3();
      const token = host.guard.observe();
      if (!host.guard.available(token) || host.guard.occupied() || this._insightsReadPending) {
        this._insightDeviceState = { status: host.guard.available(token) ? 'busy' : 'unavailable', raw: null };
        this._updateContent(); return Promise.resolve();
      }
      const period = ['daily', 'weekly', 'monthly'].includes(this._activeTab) ? this._activeTab : this._insightDeviceRange;
      const window = this._insightWindowV3(period);
      const epoch = this._insightDeviceEpoch || 0;
      const read = this._createEnergyReadV3({ devices: true });
      const current = () => read.current() && epoch === (this._insightDeviceEpoch || 0);
      const readFocus = this._captureInsightFocusV3();
      this._insightDeviceState = { status: 'reading', raw: null };
      this._updateContent();
      const operation = (async () => {
        try {
          // Reuse only the exact complete preferences/metadata from the original guarded grid read.
          const cached = this._insightSourceCacheV3?.current() ? this._insightSourceCacheV3 : null;
          const prefs = cached?.preferences ?? _insightsCopyV3(await read.hass.callWS({ type: 'energy/get_prefs' }));
          if (!current()) return;
          if (!prefs || typeof prefs !== 'object' || (prefs.device_consumption != null && !Array.isArray(prefs.device_consumption))) throw new Error('invalid_preferences');
          const devices = this._configuredInsightDevicesV3(prefs);
          const ids = [...new Set(devices.map(d => d.id).filter(Boolean))];
          let metadata = cached?.metadata ?? {};
          if (ids.length && !ids.every(id => Object.hasOwn(this._insightMetadataV3(metadata), id)))
            metadata = _insightsCopyV3(await read.hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: ids }));
          if (!current()) return;
          const mapped = this._insightMetadataV3(metadata);
          const supported = ids.filter(id => this._insightEnergyMetadataV3(id, mapped));
          const statistics = supported.length && window.to > window.from ? _insightsCopyV3(await read.hass.callWS({
            type: 'recorder/statistics_during_period', start_time: new Date(window.from).toISOString(),
            end_time: new Date(window.to).toISOString(), statistic_ids: supported, period: 'hour', types: ['change']
          })) : {};
          if (!current()) return;
          // Complete responses, including unselected/out-of-window rows, remain immutable.
          this._insightDeviceState = { status: 'ready', current, window, raw: _insightsCopyV3({ preferences: prefs, metadata, statistics }) };
        } catch (_) {
          if (current()) this._insightDeviceState = { status: 'error', raw: null };
        }
      })();
      this._insightDevicePending = operation;
      operation.then(() => {
        if (this._insightDevicePending === operation) this._insightDevicePending = null;
        if (this.isConnected && this.ownerDocument?.defaultView?.document) {
          const active = this.ownerDocument.activeElement;
          const restore = current() && readFocus?.key === 'read-devices' && (!this.shadowRoot.activeElement || this.shadowRoot.activeElement.dataset.insightsControl === 'read-devices') && (active === this || active === this.ownerDocument.body);
          this._updateContent();
          if (restore) this._restoreInsightFocusV3(readFocus);
        }
      });
      return operation;
    }
    _insightDeviceRowsV3() {
      const state = this._insightDeviceState;
      if (!state?.raw || !state.current?.()) return [];
      const { window, raw } = state, metadata = this._insightMetadataV3(raw.metadata);
      const expectedHours = (window.to - window.from) / ENERGY_HOUR, tariff = this._getTariffV3();
      const cached = this._insightDeviceProjectionV3;
      if (cached?.raw === raw && cached.tariff === tariff) return cached.rows;
      const rows = this._configuredInsightDevicesV3(raw.preferences).map(device => {
        const md = metadata[device.id], sourceUnit = md?.statistics_unit_of_measurement ?? md?.unit_of_measurement;
        const base = { ...device, name: device.name || (typeof md?.name === 'string' ? md.name : '') || device.id || this._insightTextV3('Invalid configured source', 'Nieprawidłowe źródło w konfiguracji'),
          sourceUnit: typeof sourceUnit === 'string' ? sourceUnit : null, unit: 'kWh', from: window.from, to: window.to,
          timezone: window.zone, source: [device.id], expectedHours, measuredHours: 0, kwh: null, recordedKwh: null,
          energyCost: null, currency: this._tariffCurrency(), records: [] };
        if (!this._insightEnergyMetadataV3(device.id, metadata)) return { ...base, status: 'unsupported' };
        if (expectedHours === 0) return { ...base, status: 'empty' };
        if (!Object.hasOwn(raw.statistics || {}, device.id)) return { ...base, status: 'absent' };
        const series = raw.statistics[device.id];
        if (!Array.isArray(series)) return { ...base, status: 'invalid' };
        if (!series.length) return { ...base, status: 'empty' };
        const points = new Map(), factor = energyFactor(sourceUnit);
        for (const bucket of series) {
          const from = energyTimestamp(bucket?.start), to = bucket?.end == null ? from + ENERGY_HOUR : energyTimestamp(bucket.end);
          if (!Number.isFinite(from) || from % ENERGY_HOUR || to - from !== ENERGY_HOUR ||
            (bucket.statistic_id != null && bucket.statistic_id !== device.id)) return { ...base, status: 'invalid' };
          if (from < window.from || from >= window.to) continue;
          if (points.has(from) || (bucket.change != null && (typeof bucket.change !== 'number' || !Number.isFinite(bucket.change) || bucket.change < 0)))
            return { ...base, status: 'invalid' };
          const kwh = bucket.change == null ? null : bucket.change * factor;
          if (kwh !== null && !Number.isFinite(kwh)) return { ...base, status: 'invalid' };
          points.set(from, kwh);
        }
        const records = [];
        for (let from = window.from; from < window.to; from += ENERGY_HOUR)
          records.push({ from, to: from + ENERGY_HOUR, kwh: points.has(from) ? points.get(from) : null });
        const measured = records.filter(r => r.kwh !== null), measuredHours = measured.length;
        const sum = measured.reduce((n, row) => n + row.kwh, 0);
        if (!Number.isFinite(sum)) return { ...base, status: 'invalid' };
        const recordedKwh = measuredHours ? sum : null;
        const complete = expectedHours > 0 && measuredHours === expectedHours && window.boundaryComplete;
        const price = complete ? tariff.priceBuckets(records) : null;
        return { ...base, records, measuredHours, recordedKwh, kwh: complete ? recordedKwh : null,
          energyCost: price?.energyCost ?? null, currency: price?.currency || base.currency,
          status: complete ? 'complete' : measuredHours ? 'partial' : 'unknown' };
      });
      this._insightDeviceProjectionV3 = { raw, tariff, rows };
      return rows;
    }
    _insightStatusV3(status) {
      const labels = { not_read: ['Not read', 'Nie odczytano'], reading: ['Reading measurements…', 'Odczytywanie pomiarów…'],
        busy: ['Another read is in progress. Try again when it finishes.', 'Trwa inny odczyt. Spróbuj po jego zakończeniu.'],
        unavailable: ['Connection unavailable', 'Połączenie niedostępne'], error: ['Read failed. Use Read devices to retry.', 'Odczyt nie powiódł się. Ponów przyciskiem Odczytaj urządzenia.'],
        complete: ['Measured', 'Zmierzone'], partial: ['Partial coverage', 'Niepełne pokrycie'], empty: ['No measurements', 'Brak pomiarów'],
        absent: ['Source not returned', 'Źródło nie zostało zwrócone'], unsupported: ['Unsupported energy metadata', 'Nieobsługiwane metadane energii'],
        invalid: ['Invalid measurements', 'Nieprawidłowe pomiary'], unknown: ['Measurements unknown', 'Pomiary nieznane'] };
      return this._insightTextV3(...(labels[status] || labels.not_read));
    }
    _insightPagerV3(page, pages, previous, next) {
      const t = (en, pl) => this._insightTextV3(en, pl);
      return `<nav class="insights-controls" aria-label="${t('Pages', 'Strony')}"><button type="button" data-insights-control="${previous}" ${page === 0 ? 'disabled' : ''}>${t('Previous', 'Poprzednia')}</button>
        <span>${t('Page', 'Strona')} ${page + 1}/${pages}</span><button type="button" data-insights-control="${next}" ${page + 1 >= pages ? 'disabled' : ''}>${t('Next', 'Następna')}</button></nav>`;
    }
    _renderInsightDevicesV3() {
      const t = (en, pl) => this._insightTextV3(en, pl), n = value => _esc(this._insightNumberV3(value));
      const rows = this._insightDeviceRowsV3();
      const state = this._insightDeviceState || { status: 'not_read' };
      const filter = (this._insightDeviceFilter || '').toLocaleLowerCase(this._lang);
      const selected = rows.filter(r => `${r.name} ${r.id}`.toLocaleLowerCase(this._lang).includes(filter));
      const pages = Math.max(1, Math.ceil(selected.length / 10));
      this._insightDevicePage = Math.max(0, Math.min(pages - 1, this._insightDevicePage || 0));
      const period = ['daily', 'weekly', 'monthly'].includes(this._activeTab) ? this._activeTab : this._insightDeviceRange;
      const window = state.window || this._insightWindowV3(period);
      const host = this._getTariffHostV3();
      const disabled = !!this._insightDevicePending || this._insightsReadPending || host.guard.occupied() || !host.guard.available(host.guard.observe());
      return `<section class="insights-measured" data-insights-devices aria-label="${t('Configured devices', 'Skonfigurowane urządzenia')}">
        <h3>${t('Configured devices', 'Skonfigurowane urządzenia')}</h3>
        <p>${t('Recorded device consumption. Submeters can overlap; these readings are not added to grid import.', 'Zarejestrowane zużycie urządzeń. Podliczniki mogą się nakładać; tych odczytów nie dodajemy do importu z sieci.')}</p>
        <div class="insights-controls">${!['daily', 'weekly', 'monthly'].includes(this._activeTab) ? `<label>${t('Period', 'Okres')}<select data-insights-control="device-range">${['daily', 'weekly', 'monthly'].map(key => `<option value="${key}" ${period === key ? 'selected' : ''}>${this._t(key)}</option>`).join('')}</select></label>` : ''}
          <button type="button" data-insights-control="read-devices" ${disabled ? 'disabled' : ''}>${t('Read devices', 'Odczytaj urządzenia')}</button></div>
        <p>${_esc(createFormatUi.forHass(this._hass).range(new Date(window.from).toISOString(), new Date(window.to).toISOString()))} · ${_esc(createFormatUi.forHass(this._hass).timeZone)}</p>
        ${state.status !== 'ready' ? `<p role="status">${this._insightStatusV3(state.status)}</p>` : !rows.length ? `<p role="status">${t('No configured devices in Energy Dashboard.', 'Brak skonfigurowanych urządzeń w panelu Energia.')}</p>` : ''}
        ${rows.length ? `<label class="insights-search">${t('Find a device or source', 'Znajdź urządzenie lub źródło')}<input type="search" data-insights-control="device-search" value="${_esc(this._insightDeviceFilter || '')}"></label>
          <p>${selected.length}/${rows.length} ${t('configured sources', 'skonfigurowanych źródeł')}</p>
          ${selected.slice(this._insightDevicePage * 10, this._insightDevicePage * 10 + 10).map(row => `<article class="insights-device" data-insights-device="${_esc(row.id)}">
            <div class="insights-device-heading"><strong>${_esc(row.name)}</strong><span>${_esc(this._insightDisplayNumberV3(row.kwh))} kWh</span></div>
            <p>${this._insightStatusV3(row.status)}${row.status === 'partial' ? ` · ${t('Measured subset', 'Zmierzona część')}: ${_esc(this._insightDisplayNumberV3(row.recordedKwh))} kWh` : ''}</p>
            <details data-insights-device-details="${_esc(row.key)}" ${this._insightDeviceDetails.has(row.key) ? 'open' : ''}><summary>${t('Source and measurement details', 'Źródło i szczegóły pomiaru')}</summary><dl>
              <dt>${t('Source', 'Źródło')}</dt><dd>${_esc(row.id || t('Unavailable', 'Niedostępne'))}</dd>
              <dt>${t('Consumption', 'Zużycie')}</dt><dd>${n(row.kwh)} kWh</dd>
              ${row.status === 'partial' ? `<dt>${t('Measured subset', 'Zmierzona część')}</dt><dd>${n(row.recordedKwh)} kWh</dd>` : ''}
              <dt>${t('Original unit', 'Jednostka źródłowa')}</dt><dd>${_esc(row.sourceUnit || t('Unavailable', 'Niedostępne'))}</dd>
              <dt>${t('Interval (UTC)', 'Przedział (UTC)')}</dt><dd>${_esc(new Date(row.from).toISOString())} — ${_esc(new Date(row.to).toISOString())}</dd>
              <dt>${t('Timezone', 'Strefa czasu')}</dt><dd>${_esc(row.timezone)}</dd>
              <dt>${t('Coverage', 'Pokrycie')}</dt><dd>${row.measuredHours}/${row.expectedHours} ${t('measured hours', 'zmierzonych godzin')}${!window.boundaryComplete ? ' · ' + t('Local midnight is not a whole measured hour', 'Lokalna północ nie pokrywa się z pełną godziną pomiaru') : ''}</dd>
              <dt>${t('Energy cost', 'Koszt energii')}</dt><dd>${n(row.energyCost)} ${_esc(row.currency)}</dd>
              ${row.includedIn ? `<dt>${t('Included in source', 'Zawarte w źródle')}</dt><dd>${_esc(row.includedIn)}</dd>` : ''}</dl></details></article>`).join('')}
          ${this._insightPagerV3(this._insightDevicePage, pages, 'device-previous', 'device-next')}` : ''}
        <a href="/energy">${t('Energy Dashboard', 'Panel Energia')}</a></section>`;
    }
    _prepareInsightChartV3(period) {
      const model = this._insightsEnergyModel, window = this._insightWindowV3(period);
      const source = [...(model?.ids || [])], zone = model?.zone || window.zone;
      // Same absolute identities and complete-day rule as Optimizer Patterns. Unlike
      // the 7/30-date slice there, keep ALL records in Insights' existing rolling window.
      const tariff = this._getTariffV3(), projectionKey = JSON.stringify([period, source, zone, window.from, window.to]);
      const cache = this._insightProjectionCacheV3;
      let dataset = cache?.model === model && cache.tariff === tariff && cache.key === projectionKey ? cache.dataset : null;
      if (!dataset) {
      const hours = [];
      if (model?.points) for (let from = window.from; from < window.to; from += ENERGY_HOUR) {
        const point = model.points.get(from), kwh = typeof point?.kwh === 'number' && Number.isFinite(point.kwh) ? point.kwh : null;
        hours.push({ id: String(from), from, to: from + ENERGY_HOUR, ...this._insightLocalV3(from, zone),
          kwh, recordedKwh: kwh, source, timezone: zone, unit: 'kWh', missing: kwh === null,
          complete: kwh !== null, measuredHours: kwh === null ? 0 : 1, hours: 1 });
      }
      const prices = tariff.priceBuckets(hours.map(r => ({ from: r.from, to: r.to, kwh: r.kwh })));
      const priced = new Map(prices.rows.map(row => [row.from, row]));
      for (const row of hours) {
        const price = priced.get(row.from);
        row.currency = prices.currency; row.energyCost = price?.available ? price.energyCost : null;
        row.variableCost = price?.available ? price.variableCost : null;
        row.priceMissing = !price?.available;
      }
      const keys = [...new Set(hours.map(row => row.key))];
      const days = keys.map(key => {
        const records = hours.filter(row => row.key === key), first = records[0], last = records.at(-1);
        const finish = this._insightLocalV3(last.to, zone);
        const complete = first.hour === 0 && first.minute === 0 && finish.key !== key && finish.hour === 0 && finish.minute === 0 && records.every(r => !r.missing);
        const sum = field => {
          if (!records.every(r => typeof r[field] === 'number' && Number.isFinite(r[field]))) return null;
          const value = records.reduce((n, r) => n + r[field], 0);
          return Number.isFinite(value) ? value : null;
        };
        const known = records.filter(r => !r.missing), subset = known.reduce((n, r) => n + r.kwh, 0);
        return { id: key, key, from: first.from, to: last.to, kwh: complete ? sum('kwh') : null,
          recordedKwh: known.length && Number.isFinite(subset) ? subset : null,
          energyCost: complete ? sum('energyCost') : null, variableCost: complete ? sum('variableCost') : null,
          source, timezone: zone, unit: 'kWh', currency: prices.currency, complete, missing: !complete,
          measuredHours: known.length, hours: records.length, records, priceMissing: records.some(r => r.priceMissing) };
      });
        dataset = { hours, days, source, timezone: zone, currency: prices.currency, window };
        this._insightProjectionCacheV3 = { model, tariff, key: projectionKey, dataset };
      }
      const identity = JSON.stringify([source, zone, window.from, window.to]);
      const previous = this._insightChartStates[period];
      this._insightChartState = previous?.identity === identity ? previous : {
        identity, view: previous?.view || 'chart', resolution: period === 'daily' ? 'hour' : previous?.resolution || 'day',
        metric: previous?.metric || 'kwh', type: previous?.type || 'bar', selected: null, page: 0
      };
      this._insightChartStates[period] = this._insightChartState;
      this._insightChartDataset = dataset;
      const rows = this._insightChartRowsV3(), state = this._insightChartState;
      if (!rows.some(r => r.id === state.selected)) state.selected = rows.at(-1)?.id ?? null;
      state.page = Math.max(0, Math.min(Math.max(0, Math.ceil(rows.length / 40) - 1), state.page));
    }
    _insightChartRowsV3() {
      return this._insightChartDataset?.[this._insightChartState?.resolution === 'hour' ? 'hours' : 'days'] || [];
    }
    _insightRowLabelV3(row) {
      const format = createFormatUi.forHass(this._hass);
      return row.hour == null ? format.date(row.from) : format.pointLabel(row.from);
    }
    _insightTechnicalDetailsV5(key, from, to, timezone, sources, exactValues = '') {
      const t = (en, pl) => this._insightTextV3(en, pl);
      const identity = JSON.stringify([key, from, to, sources]);
      const open = this._insightTechnicalOpenV5?.has(identity) ? ' open' : '';
      return `<details data-insights-source-details="${_esc(identity)}"${open}><summary>${t('Source and time details', 'Źródło i szczegóły czasu')}</summary><dl>
        <dt>${t('Sources', 'Źródła')}</dt><dd>${_esc(sources.join(', '))}</dd>
        <dt>${t('Exact interval (UTC)', 'Dokładny przedział (UTC)')}</dt><dd>${_esc(new Date(from).toISOString())} — ${_esc(new Date(to).toISOString())}</dd>
        <dt>${t('Measurement time zone', 'Strefa czasowa pomiaru')}</dt><dd>${_esc(timezone)}</dd></dl>${exactValues}</details>`;
    }
    _insightRowDetailV3(row, scope = 'point') {
      if (!row) return this._insightTextV3('No completed intervals in this window.', 'Brak zakończonych przedziałów w tym okresie.');
      const t = (en, pl) => this._insightTextV3(en, pl), n = value => _esc(scope === 'data' ? this._insightNumberV3(value) : this._insightDisplayNumberV3(value));
      const exact = `<p data-insights-exact-values>${t('Exact measured values', 'Dokładne wartości zmierzone')}: ${_esc(this._insightNumberV3(row.kwh))} kWh · ${t('Energy cost', 'Koszt energii')}: ${_esc(this._insightNumberV3(row.energyCost))} ${_esc(row.currency || '')} · ${t('Variable fees', 'Opłaty zmienne')}: ${_esc(this._insightNumberV3(row.variableCost))} ${_esc(row.currency || '')}${row.missing && row.recordedKwh !== null ? ' · ' + t('Measured subset', 'Zmierzona część') + ': ' + _esc(this._insightNumberV3(row.recordedKwh)) + ' kWh' : ''}</p>`;
      const count = createFormatUi.forHass(this._hass).number(row.source.length);
      return `<strong>${_esc(this._insightRowLabelV3(row))}</strong><p data-insights-source-count>${t('Sources', 'Źródła')}: ${_esc(count)}</p>
        <p>${t('Consumption', 'Zużycie')}: ${n(row.kwh)} kWh · ${t('Energy cost', 'Koszt energii')}: ${n(row.energyCost)} ${_esc(row.currency || '')} · ${t('Variable fees', 'Opłaty zmienne')}: ${n(row.variableCost)} ${_esc(row.currency || '')}</p>
        <p>${row.measuredHours}/${row.hours} ${t('measured hours', 'zmierzonych godzin')} · ${row.missing ? t('Partial / missing', 'Niepełne / brak') : t('Measured', 'Zmierzone')}
          ${row.missing && row.recordedKwh !== null ? ` · ${t('Measured subset', 'Zmierzona część')}: ${n(row.recordedKwh)} kWh` : ''}
          ${row.priceMissing ? ' · ' + t('Tariff coverage unavailable', 'Brak pokrycia taryfą') : ''}</p>
        ${this._insightTechnicalDetailsV5(`${scope}:${row.id}`, row.from, row.to, row.timezone, row.source, exact)}`;
    }
    _insightSvgV3(width = 600) {
      const rows = this._insightChartRowsV3(), state = this._insightChartState;
      const unit = state.metric === 'kwh' ? 'kWh' : this._insightChartDataset.currency || this._insightTextV3('Currency unavailable', 'Brak waluty');
      const metricLabel = state.metric === 'energyCost' ? this._insightTextV3('Energy cost', 'Koszt energii') : state.metric === 'variableCost' ? this._insightTextV3('Variable fees', 'Opłaty zmienne') : this._insightTextV3('Recorded consumption', 'Zarejestrowane zużycie');
      const values = rows.map(row => typeof row[state.metric] === 'number' && Number.isFinite(row[state.metric]) ? row[state.metric] : null), known = values.filter(v => typeof v === 'number' && Number.isFinite(v));
      const low = Math.min(0, ...known), high = Math.max(0, ...known), upper = high === low ? low + 1 : high;
      const w = Math.max(180, width), left = Math.min(68, w * 0.24), right = w - 12, top = 28, bottom = 218;
      const x = i => left + (i + 0.5) * (right - left) / Math.max(1, rows.length);
      const y = value => bottom - (value - low) / (upper - low) * (bottom - top);
      let marks = '', path = '';
      const flush = () => { if (path) marks += `<path d="${path}" fill="none" stroke="var(--bento-primary)" stroke-width="2"/>`; path = ''; };
      values.forEach((value, i) => {
        const attrs = `data-insights-mark="${_esc(rows[i].id)}" data-value="${value == null ? 'null' : value}"`;
        const title = `${this._insightRowLabelV3(rows[i])}: ${this._insightNumberV3(value)} ${unit}`;
        if (value == null) { flush(); marks += `<g ${attrs}><title>${_esc(title)}</title><path d="M${x(i)-3},${bottom-3}l6,6m-6,0l6,-6" stroke="var(--bento-text-secondary)"/></g>`; return; }
        if (state.type === 'line') {
          path += `${path ? ' L' : 'M'}${x(i)},${y(value)}`;
          marks += `<circle ${attrs} cx="${x(i)}" cy="${y(value)}" r="${state.selected === rows[i].id ? 5 : 2.5}" fill="var(--bento-primary)"><title>${_esc(title)}</title></circle>`;
        } else {
          const bar = Math.max(1, (right-left) / Math.max(1, rows.length) * 0.65);
          marks += `<rect ${attrs} x="${x(i)-bar/2}" y="${Math.min(y(0), y(value))}" width="${bar}" height="${Math.max(1, Math.abs(y(0)-y(value)))}" rx="2" fill="var(--bento-primary)" opacity="${state.selected === rows[i].id ? 1 : 0.7}"><title>${_esc(title)}</title></rect>`;
        }
      });
      flush();
      const grid = [low, (low + upper) / 2, upper].map(value => `<line x1="${left}" x2="${right}" y1="${y(value)}" y2="${y(value)}" stroke="var(--bento-border)"/><text x="${left-6}" y="${y(value)+4}" text-anchor="end">${_esc(new Intl.NumberFormat(this._lang, { maximumSignificantDigits: 3 }).format(value))}</text>`).join('');
      const axes = createFormatUi.forHass(this._hass).chartTicks(rows.map(row => row.from), state.resolution).map(tick => `<text x="${x(tick.index)}" y="242" text-anchor="middle">${_esc(tick.label)}</text>`).join('');
      return `<svg data-insights-chart data-unit="${_esc(unit)}" viewBox="0 0 ${w} 262" width="100%" height="262" role="img" aria-label="${_esc(metricLabel)} · ${_esc(unit)}; ${this._insightTextV3('use point controls below for exact values', 'dokładne wartości w wyborze punktu poniżej')}"><text x="${left}" y="18">${_esc(unit)}</text>${grid}${marks}${axes}</svg>`;
    }
    _renderInsightChartV3(period) {
      this._prepareInsightChartV3(period);
      const t = (en, pl) => this._insightTextV3(en, pl), state = this._insightChartState, data = this._insightChartDataset;
      const rows = this._insightChartRowsV3(), pages = Math.max(1, Math.ceil(rows.length / 40));
      const option = (value, selected, label) => `<option value="${_esc(value)}" ${value === selected ? 'selected' : ''}>${_esc(label)}</option>`;
      const selected = rows.find(r => r.id === state.selected);
      const unit = state.metric === 'kwh' ? 'kWh' : data.currency || t('Currency unavailable', 'Brak waluty');
      const format = createFormatUi.forHass(this._hass);
      return `<section class="insights-measured" data-insights-analysis aria-label="${this._t(period)}">
        <h3>${this._t(period)} · ${t('Recorded consumption', 'Zarejestrowane zużycie')}</h3>
        <p data-insights-source-count>${t('Sources', 'Źródła')}: ${_esc(format.number(data.source.length))}</p><p data-insights-chart-range>${_esc(format.range(new Date(data.window.from).toISOString(), new Date(data.window.to).toISOString()))}</p>
        ${this._insightTechnicalDetailsV5(`chart:${period}`, data.window.from, data.window.to, data.timezone, data.source)}
        <div class="insights-controls">
          ${period !== 'daily' ? `<label>${t('Intervals', 'Przedziały')}<select data-insights-control="resolution">${option('day', state.resolution, t('Local dates', 'Daty lokalne'))}${option('hour', state.resolution, t('All measured hours', 'Wszystkie godziny pomiaru'))}</select></label>` : ''}
          <label>${t('Measure', 'Miara')}<select data-insights-control="metric">${option('kwh', state.metric, 'kWh')}${option('energyCost', state.metric, t('Energy cost', 'Koszt energii'))}${option('variableCost', state.metric, t('Variable fees', 'Opłaty zmienne'))}</select></label>
          <label>${t('Chart type', 'Typ wykresu')}<select data-insights-control="type">${option('bar', state.type, t('Bars', 'Słupki'))}${option('line', state.type, t('Line', 'Linia'))}</select></label></div>
        <div class="insights-controls" role="group" aria-label="${t('Presentation', 'Prezentacja')}"><button type="button" data-insights-control="chart" aria-pressed="${state.view === 'chart'}">${t('Chart', 'Wykres')}</button><button type="button" data-insights-control="data" aria-pressed="${state.view === 'data'}">${t('Data', 'Dane')}</button></div>
        ${state.view === 'chart' ? `<div data-insights-plot>${this._insightSvgV3()}</div>` : `<div data-insights-data>${rows.slice(state.page * 40, state.page * 40 + 40).map(row => `<article class="insights-data-row" data-insights-row="${_esc(row.id)}" data-value="${row[state.metric] == null ? 'null' : row[state.metric]}"><p>${_esc(this._insightNumberV3(row[state.metric]))} ${_esc(unit)}</p>${this._insightRowDetailV3(row, 'data')}</article>`).join('')}</div>${this._insightPagerV3(state.page, pages, 'previous-page', 'next-page')}`}
        <label>${t('Point details (arrows, Home / End)', 'Szczegóły punktu (strzałki, Home / End)')}<select data-insights-control="point" ${!rows.length ? 'disabled' : ''}>${rows.map(row => option(row.id, state.selected, this._insightRowLabelV3(row))).join('')}</select></label>
        <div class="insights-controls"><button type="button" data-insights-control="previous-point" ${!rows.length || state.selected === rows[0]?.id ? 'disabled' : ''}>${t('Previous point', 'Poprzedni punkt')}</button><button type="button" data-insights-control="next-point" ${!rows.length || state.selected === rows.at(-1)?.id ? 'disabled' : ''}>${t('Next point', 'Następny punkt')}</button></div>
        <div class="insights-point-detail" data-insights-detail role="status" aria-live="polite">${this._insightRowDetailV3(selected)}</div>
        <p>${t('Gaps are not zero. Only complete local days have daily totals. All original hourly intervals remain in Data; no bucket is split across local midnight. Fixed monthly charges are separate.', 'Luki nie oznaczają zera. Sumy dzienne dotyczą tylko pełnych dni lokalnych. Wszystkie oryginalne godziny są dostępne w Danych; nie dzielimy przedziałów przez lokalną północ. Opłaty stałe miesięczne są osobne.')}</p>
      </section>${this._renderInsightDevicesV3()}`;
    }
    _captureInsightFocusV3() {
      this._insightTechnicalOpenV5 ||= new Set();
      // Capture native state before a queued toggle or a locale/point repaint.
      this.shadowRoot.querySelectorAll('[data-insights-source-details]').forEach(el =>
        el.open ? this._insightTechnicalOpenV5.add(el.dataset.insightsSourceDetails) : this._insightTechnicalOpenV5.delete(el.dataset.insightsSourceDetails));
      const active = this.shadowRoot.activeElement;
      if (active?.tagName === 'SUMMARY' && active.parentElement?.hasAttribute('data-insights-source-details'))
        return { sourceDetailKey: active.parentElement.dataset.insightsSourceDetails };
      if (active?.tagName === 'SUMMARY' && active.parentElement?.hasAttribute('data-insights-device-details'))
        return { detailKey: active.parentElement.dataset.insightsDeviceDetails };
      if (!active?.dataset.insightsControl) return null;
      return { key: active.dataset.insightsControl, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection };
    }
    _restoreInsightFocusV3(focus) {
      if (!focus) return;
      if (focus.sourceDetailKey != null) {
        const details = [...this.shadowRoot.querySelectorAll('[data-insights-source-details]')].find(el => el.dataset.insightsSourceDetails === focus.sourceDetailKey);
        details?.querySelector('summary')?.focus({ preventScroll: true });
        return;
      }
      if (focus.detailKey != null) {
        const details = [...this.shadowRoot.querySelectorAll('[data-insights-device-details]')].find(el => el.dataset.insightsDeviceDetails === focus.detailKey);
        details?.querySelector('summary')?.focus({ preventScroll: true });
        return;
      }
      const controls = [...this.shadowRoot.querySelectorAll('[data-insights-control]')];
      let target = controls.find(el => el.dataset.insightsControl === focus.key);
      if (target?.disabled && ['previous-page', 'next-page', 'device-previous', 'device-next'].includes(focus.key)) {
        const keys = focus.key.startsWith('device-') ? ['device-previous', 'device-next', 'device-search'] : ['previous-page', 'next-page', 'data'];
        target = controls.find(el => keys.includes(el.dataset.insightsControl) && !el.disabled);
      }
      if (!target || target.disabled) return;
      target.focus({ preventScroll: true });
      if (typeof focus.start === 'number' && typeof target.setSelectionRange === 'function')
        target.setSelectionRange(focus.start, focus.end, focus.direction || 'none');
    }
    _bindInsightContentV3() {
      this._insightTechnicalOpenV5 ||= new Set();
      this.shadowRoot.querySelectorAll('[data-insights-source-details]').forEach(el => {
        if (el.dataset.insightsBound) return; el.dataset.insightsBound = 'true';
        el.addEventListener('toggle', () => {
          if (el.isConnected) el.open ? this._insightTechnicalOpenV5.add(el.dataset.insightsSourceDetails) : this._insightTechnicalOpenV5.delete(el.dataset.insightsSourceDetails);
        });
      });
      const redraw = focus => { this._updateContent(); this._restoreInsightFocusV3(focus); };
      this.shadowRoot.querySelectorAll('[data-insights-device-details]').forEach(el => {
        if (el.dataset.insightsBound) return; el.dataset.insightsBound = 'true';
        el.addEventListener('toggle', () => { if (el.isConnected) el.open ? this._insightDeviceDetails.add(el.dataset.insightsDeviceDetails) : this._insightDeviceDetails.delete(el.dataset.insightsDeviceDetails); });
      });
      this.shadowRoot.querySelectorAll('[data-insights-control]').forEach(el => {
        if (el.dataset.insightsBound) return; el.dataset.insightsBound = 'true';
        const key = el.dataset.insightsControl;
        if (key === 'device-search') {
          el.addEventListener('input', () => { const focus = this._captureInsightFocusV3(); this._insightDeviceFilter = el.value; this._insightDevicePage = 0; redraw(focus); });
          return;
        }
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'click', () => {
          const focus = { key }, state = this._insightChartState;
          if (key === 'read-devices') { this._readInsightDevicesV3(); return; }
          if (key === 'device-range') { this._insightDeviceRange = el.value; this._clearInsightDevicesV3(); }
          else if (key === 'device-previous' || key === 'device-next') this._insightDevicePage += key === 'device-next' ? 1 : -1;
          else if (state) {
            if (key === 'chart' || key === 'data') state.view = key;
            else if (key === 'resolution' || key === 'metric' || key === 'type') { state[key] = el.value; state.page = 0; }
            else if (key === 'point') state.selected = el.value;
            else if (key === 'previous-page' || key === 'next-page') state.page += key === 'next-page' ? 1 : -1;
            else if (key === 'previous-point' || key === 'next-point') {
              const rows = this._insightChartRowsV3(), index = rows.findIndex(r => r.id === state.selected);
              state.selected = rows[Math.max(0, Math.min(rows.length - 1, index + (key === 'next-point' ? 1 : -1)))]?.id ?? null;
              focus.key = 'point';
            }
          }
          redraw(focus);
        });
        if (key === 'point') el.addEventListener('keydown', event => {
          const rows = this._insightChartRowsV3(), state = this._insightChartState, index = rows.findIndex(r => r.id === state.selected);
          const moves = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: rows.length - 1 };
          if (!Object.hasOwn(moves, event.key)) return;
          event.preventDefault(); state.selected = rows[Math.max(0, Math.min(rows.length - 1, moves[event.key]))]?.id ?? null;
          redraw({ key: 'point' });
        });
      });
      const plot = this.shadowRoot.querySelector('[data-insights-plot]');
      if (!plot || plot.dataset.insightsBound) return;
      plot.dataset.insightsBound = 'true';
      const epoch = this._insightRenderEpoch, dataset = this._insightChartDataset;
      const current = () => this.isConnected && plot.isConnected && epoch === this._insightRenderEpoch && dataset === this._insightChartDataset;
      const resize = () => { if (current() && plot.clientWidth > 0) plot.innerHTML = this._insightSvgV3(plot.clientWidth); };
      resize();
      plot.addEventListener('click', event => {
        if (!current()) return;
        const rect = plot.querySelector('svg')?.getBoundingClientRect();
        if (!rect?.width) return;
        const rows = this._insightChartRowsV3(), width = Math.max(180, plot.clientWidth || 600), left = Math.min(68, width * 0.24);
        const index = Math.max(0, Math.min(rows.length - 1, Math.floor(((event.clientX - rect.left) / rect.width * width - left) / (width - 12 - left) * rows.length)));
        this._insightChartState.selected = rows[index]?.id ?? null;
        redraw({ key: 'point' });
      });
      if (typeof ResizeObserver !== 'undefined') { this._insightResize = new ResizeObserver(resize); this._insightResize.observe(plot); }
    }

    _getRecommendation(trendDiff, todayKwh) {
      return this._insightTextV3('Grid import comes from the configured Energy Dashboard sources. Read configured devices below to inspect their separate measurements.', 'Import z sieci pochodzi ze skonfigurowanych źródeł panelu Energia. Odczytaj urządzenia poniżej, aby obejrzeć ich osobne pomiary.');
    }

    // ===== RENDERING =====

    _updateLoadingState() {
      const body = this.shadowRoot?.querySelector('.panel-body');
      if (!body) return;
      if (this._loading) {
        this._insightResize?.disconnect();
        this._insightRenderEpoch++;
        body.innerHTML = this._renderLoading();
      }
    }

    _updateContent() {
      if (!this._domBuilt) {
        this._render();
        return;
      }
      // A native details toggle is queued: retain the current DOM state before repaint.
      // Only a current source may contribute disclosure state after authority changes.
      if (this._insightDeviceState?.raw && this._insightDeviceState.current?.())
        this.shadowRoot.querySelectorAll('[data-insights-device-details]').forEach(el =>
          el.open ? this._insightDeviceDetails.add(el.dataset.insightsDeviceDetails) : this._insightDeviceDetails.delete(el.dataset.insightsDeviceDetails));
      const periodFormat = createFormatUi();
      const periodContext = this._getTariffHostV3().guard.snapshot();
      const periodUi = periodFormat.capturePeriods(this.shadowRoot, this._periodUiContextV4, periodContext);
      this._periodUiContextV4 = periodContext;
      const focus = this._captureInsightFocusV3();
      this._insightResize?.disconnect();
      this._insightRenderEpoch++;
      // Targeted DOM update — replace only panel-body content
      const body = this.shadowRoot?.querySelector('.panel-body');
      if (!body) return;
      if (this._activeTab === 'tips') {
        body.innerHTML = this._renderTips();
      } else if (this._loading) {
        body.innerHTML = this._renderLoading();
      } else if (this._error) {
        body.innerHTML = this._renderError();
      } else {
        body.innerHTML = this._renderTabContent();
      }
      this._bindTariffSettings();
      this._bindInsightContentV3();
      this._syncAnalysisV53();
      this._restoreInsightFocusV3(focus);
      periodFormat.restorePeriods(this.shadowRoot, periodUi);
      // Update tab bar active state
      this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === this._activeTab);
      });
    }

    _syncSupport() {
      localizeEnergySupport(this.shadowRoot, this._lang);
      const footer = this.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
      if (footer) footer.style.display = this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-insights') ? '' : 'none';
    }

    _render() {
      if (!this._hass) return;
      if (this._domBuilt) {
        this._syncSupport();
        this._updateContent();
        return;
      }
      const periodFormat = createFormatUi();
      const periodContext = this._getTariffHostV3().guard.snapshot();
      const periodUi = periodFormat.capturePeriods(this.shadowRoot, this._periodUiContextV4, periodContext);
      this._periodUiContextV4 = periodContext;
      this.shadowRoot.innerHTML = `
  ${this._getStyles()}
        <div class="panel-root">
          ${this._renderHeader()}
          ${this._renderTabBar()}
          <div class="panel-body">
            ${this._activeTab !== 'tips' && this._loading ? this._renderLoading() : ''}
            ${this._activeTab !== 'tips' && this._error && !this._loading ? this._renderError() : ''}
            ${this._activeTab === 'tips' || !this._loading && !this._error ? this._renderTabContent() : ''}
          </div>
          ${this._tariffDetailsMarkup()}
          ${this._renderToolsBanner()}
          ${OWN_SUPPORT_FOOTER}
        </div>
      `
      this._domBuilt = true;
      this._bindEvents();
      this._bindTariffSettings();
      this._bindInsightContentV3();
      this._syncAnalysisV53();
      this._syncSupport();
      periodFormat.restorePeriods(this.shadowRoot, periodUi);
    }

    _getStyles() {
      return `
        <style>${LOCAL_BENTO_CSS}

          .insights-measured{margin:18px 0;padding:18px;border:1px solid var(--bento-border);border-radius:var(--bento-radius);background:var(--bento-card);min-width:0;color:var(--bento-text)}
          .insights-measured h3{margin:0 0 12px;font-size:18px}.insights-measured p{line-height:1.55;overflow-wrap:anywhere;font-size:13px}
          .insights-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin:12px 0}.insights-controls>span{align-self:center}
          .insights-measured label{display:flex;flex-direction:column;gap:6px;min-width:0;font-size:13px;flex:1}
          .insights-measured button,.insights-measured select,.insights-measured input{min-width:44px;min-height:44px;max-width:100%;padding:10px 12px;border:1px solid var(--bento-border);border-radius:8px;background:var(--bento-card);color:var(--bento-text);font:inherit;box-sizing:border-box}
          .insights-measured button{white-space:normal;cursor:pointer}.insights-measured button:disabled{opacity:.55;cursor:default}.insights-measured button[aria-pressed=true]{border-color:var(--bento-primary);background:var(--bento-primary-light)}
          .insights-measured :is(button,select,input,summary,a):focus-visible{outline:3px solid var(--bento-primary);outline-offset:2px}
          .insights-measured a{display:inline-flex;align-items:center;min-height:44px;color:var(--bento-primary)}
          .insights-measured svg{display:block;max-width:100%;touch-action:pan-y}.insights-measured svg text{fill:var(--bento-text-secondary);font:12px system-ui}
          .insights-data-row,.insights-device,.insights-point-detail{padding:14px;margin:10px 0;border:1px solid var(--bento-border);border-radius:10px;overflow-wrap:anywhere;min-width:0}
          .insights-point-detail{background:var(--bento-primary-light)}.insights-device-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:baseline}.insights-device-heading span{font-weight:650;font-variant-numeric:tabular-nums}
          .insights-measured summary{min-height:44px;cursor:pointer;padding:12px 0}.insights-measured dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px 16px;font-size:13px;line-height:1.5}.insights-measured dd{margin:0}.insights-measured dt{color:var(--bento-text-secondary)}
          @container energy-card (max-width:500px){.insights-measured{padding:12px}.insights-controls label{flex-basis:100%}.insights-device-heading{grid-template-columns:minmax(0,1fr)}.insights-measured dl{grid-template-columns:minmax(0,1fr)}.insights-measured dt{margin-top:6px}}


          * { box-sizing: border-box; }


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
            display: block;
            background: var(--bento-bg);
            color: var(--bento-text);
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
          @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .panel-root { display: flex; flex-direction: column; height: 100%; background: var(--bento-bg); border-radius: var(--bento-radius-md); overflow: hidden; }
          .panel-header { padding: 24px 24px 16px; border-bottom: 1px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-md) var(--bento-radius-md) 0 0; }
          .panel-title { font-size: 17px; font-weight: 700; color: var(--bento-text); margin: 0; display: flex; align-items: center; gap: 10px; }
          .panel-title-icon { font-size: 24px; }
          .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); padding: 0 24px; background: var(--bento-card); overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--bento-border) transparent; }
          .tabs::-webkit-scrollbar { height: 4px; }
          .tabs::-webkit-scrollbar-track { background: transparent; }
          .tabs::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
          .tab-btn { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--bento-text-secondary); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
          .tab-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
          .tab-btn.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); font-weight: 600; }
          .panel-body { flex: 1; overflow-y: auto; padding: 20px; animation: fadeSlideIn 0.3s ease-out; }
          .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
          .stat-card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; text-align: center; min-width: 0; overflow: hidden; box-shadow: var(--bento-shadow-sm); }
          .stat-card:hover { box-shadow: var(--bento-shadow-md); }
          .stat-label { font-size:12px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
          .stat-value { font-size: 24px; font-weight: 700; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2; }
          .stat-value.highlight { color: var(--bento-primary); }
          .stat-sub { font-size:12px; color: var(--bento-text-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .recommendation { background: var(--bento-primary-light); border: 1px solid rgba(59,130,246,.2); border-radius: var(--bento-radius-sm); padding: 14px 16px; font-size: 13px; color: var(--bento-text); margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px; }
          .recommendation-icon { font-size: 18px; flex-shrink: 0; }
          .trend-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size:12px; font-weight: 600; }
          .trend-up { background: var(--bento-error-light); color: var(--energy-value-red,#b91c1c); }
          .trend-down { background: var(--bento-success-light); color: var(--energy-value-green,#166534); }
          .trend-neutral { background: rgba(158,158,158,.15); color: var(--energy-value-neutral,#475569); }
          .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
          .device-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
          .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
          .device-row:hover { background: var(--bento-primary-light); }
          .device-rank { font-size:12px; font-weight: 700; color: var(--bento-primary); width: 24px; flex-shrink: 0; text-align: center; }
          .device-name { font-size: 13px; font-weight: 500; flex: 1; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .device-bar-wrap { width: 70px; height: 6px; background: var(--bento-border); border-radius: 4px; overflow: hidden; flex-shrink: 0; }
          .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
          .device-value { font-size: 12px; font-weight: 600; color: var(--bento-primary); flex-shrink: 0; min-width: 70px; text-align: right; }
          .chart-container { position: relative; height: 240px; margin-bottom: 12px; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; box-shadow: var(--bento-shadow-md); }
          canvas { max-width: 100%; display: block; }
          .chart-label { text-align: center; font-size: 12px; color: var(--bento-text-secondary); margin-top: 8px; }
          .tips-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 16px; }
          .tip-card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; font-size: 14px; line-height: 1.5; color: var(--bento-text); box-shadow: var(--bento-shadow-md); }
          .tip-card strong { color: var(--bento-text); display: block; margin-bottom: 4px; font-size: 14px; }
          .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px; gap: 16px; color: var(--bento-text-secondary); font-size: 14px; }
          .spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top-color: var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
          .error-msg { padding: 16px; background: var(--bento-error-light); border-left: 4px solid var(--bento-error); border-radius: var(--bento-radius-xs); font-size: 13px; color: var(--energy-value-red,#b91c1c); }
          .no-sensors { padding: 40px 24px; text-align: center; color: var(--bento-text-secondary); font-size: 13px; }
          button { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; border-radius: var(--bento-radius-xs); transition: all .2s; cursor: pointer; border: none; padding: 8px 14px; background: var(--bento-primary); color: var(--bento-on-primary,#fff); }
          button:hover { background: var(--bento-primary-hover); }
          .refresh-btn { background: transparent; color: var(--bento-text-secondary); padding: 4px; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
          .refresh-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
          .refresh-btn svg { width: 18px; height: 18px; }
          .tools-banner { background: var(--bento-card); border-top: 1px solid var(--bento-border); padding: 12px 24px; text-align: center; font-size: 12px; color: var(--bento-text-secondary); }
          .tools-banner a { color: var(--bento-primary); text-decoration: none; font-weight: 600; }
          .tools-banner a:hover { text-decoration: underline; }
          @media (max-width: 768px) {
            .panel-header { padding: 16px; }
            .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .tabs { flex-wrap: wrap; gap: 4px; padding: 0 16px; }
            .tab-btn { min-width: auto; font-size: 12px; padding: 6px 10px; }
            .device-list { overflow-x: auto; }
            .chart-container canvas { max-height: 200px; }
            .tip-card { padding: 12px; }
          }
          @media (max-width: 480px) {
            .tabs { gap: 1px; }
            .tab-btn { padding: 5px 8px; font-size:12px; }
            .stat-value { font-size: 18px; }
          }
          @media (max-width: 360px) {
            .stats-grid { grid-template-columns: 1fr !important; }
          }

  </style>
      `;
    }

    _renderHeader() {
      return `
        <div class="panel-header">
          <h1 class="panel-title">
            <span class="panel-title-icon">⚡</span>
            <span data-energy-card-title>${_esc(this._config.title ?? this._t('energyInsights'))}</span>
          </h1>
        </div>
      `;
    }

    _renderTabBar() {
      const tabs = [
        { id: 'overview', label: this._t('overview') },
        { id: 'daily', label: this._t('daily') },
        { id: 'weekly', label: this._t('weekly') },
        { id: 'monthly', label: this._t('monthly') },
        { id: 'tips', label: this._t('tips') }
      ];

      return `
        <div class="tabs">
          ${tabs.map(tab => `
            <button class="tab-btn${this._activeTab === tab.id ? ' active' : ''}" data-tab="${tab.id}">
              ${tab.label}
            </button>
          `).join('')}
        </div>
      `;
    }

    _renderLoading() {
      return `
        <div class="loading">
          <div class="spinner"></div>
          <span>${this._t('loading')}</span>
        </div>
      `;
    }

    _renderError(e) {
      if (e) {
        console.error('[ha-energy-insights] render error:', e);
        const msg = _esc(e && e.message ? e.message : String(e));
        if (this.shadowRoot) {
          this.shadowRoot.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif;color:var(--energy-value-red,#b91c1c);"><strong>Energy Insights render error.</strong><br>${msg}</div>`;
        }
        return '';
      }
      return `<div class="error-msg">⚠ ${_esc(this._error || this._t('error'))}</div>`;
    }

    _clearAnalysisLegacyV53() {
      this._insightsEnergyModel=null;this._data=null;this._insightProjectionCacheV3=null;
      this._insightChartDataset=null;this._insightChartState=null;this._insightSourceCacheV3=null;
      this._loading=false;this._error=null;this._lastDataFetch=0;this._clearInsightDevicesV3();
    }
    _loadAnalysisLegacyV53() {this._render();void this._fetchData();}
    _renderTabContent() {
      if(this._activeTab === 'tips')return this._renderTips();
      if(!this._analysisLegacyAllowedV53())return `<div data-analysis-mount-v53 data-analysis-period="${({daily:'day',weekly:'week',monthly:'month'})[this._activeTab] || 'day'}"></div>`;
      if (!this._data) return this._renderInsightDevicesV3();

      if (this._data.noSensors) {
        return `<div class="no-sensors">${this._t('noSensors')} <a href="/energy">Energy Dashboard</a></div>${this._renderInsightDevicesV3()}`;
      }
      if (this._data.noSeries) {
        return `<div class="no-sensors" role="status">${this._t('noSeries')}</div>${this._renderInsightDevicesV3()}`;
      }

      switch (this._activeTab) {
        case 'overview': return this._renderOverview();
        case 'daily': return this._renderChartTab('daily');
        case 'weekly': return this._renderChartTab('weekly');
        case 'monthly': return this._renderChartTab('monthly');
        case 'tips': return this._renderTips();
        default: return this._renderOverview();
      }
    }

    _renderOverview() {
      if (!this._data) return '';
      const d = this._data;
      const cur = this._tariffCurrency();
      const format = createFormatUi.forHass(this._hass);
      const fmt = v => typeof v === 'number' && Number.isFinite(v) ? format.number(v, {minimumFractionDigits:2, maximumFractionDigits:2}) : 'N/A';
      const period = (window, label) => window ? format.periodMarkup({ ...window, sourceTimeZone:d.zone, label, source: 'Energy Dashboard / Recorder · ' + format.count((d.sensors || []).length, {one:this._lang === 'pl' ? 'źródło' : 'source',few:'źródła',many:'źródeł',other:this._lang === 'pl' ? 'źródła' : 'sources'}),
        measured: window.selected?.filter(([, point]) => point.kwh !== null).length, expected: window.selected?.length,
        unit: this._lang === 'pl' ? 'zakończonych przedziałów' : 'completed intervals', details: (d.sensors || []).join(', ') }) : '';

      const trendDiff = d.thisWeekKwh !== null && d.prevWeekKwh > 0
        ? ((d.thisWeekKwh - d.prevWeekKwh) / d.prevWeekKwh * 100)
        : null;
      const trendClass = trendDiff > 5 ? 'trend-up' : trendDiff < -5 ? 'trend-down' : 'trend-neutral';
      const trendIcon = trendDiff > 5 ? '↑' : trendDiff < -5 ? '↓' : '→';
      const trendLabel = trendDiff === null ? 'N/A' : trendDiff > 0 ? `+${fmt(trendDiff)}%` : `${fmt(trendDiff)}%`;
      const rec = this._getRecommendation(trendDiff, d.todayKwh);

      let html = `
        ${d.windows?.daily ? `<div data-today-range>${period(d.windows.daily, this._t('today'))}${energyTodayBoundaryMarkup(d.windows.daily, d.zone || '', this._lang)}</div>` : ''}<p>${this._lang === 'pl' ? 'Ten sam import z sieci jest dostępny także w' : 'The same grid import is also available in'} <a href="https://github.com/MacSiem/ha-smart-reports#readme" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;min-height:44px">Smart Reports</a>. ${this._lang === 'pl' ? 'Porównuj identyczne okresy i pokrycie źródeł.' : 'Compare matching periods and source coverage.'}</p>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${this._t('today')}</div>
            <div class="stat-value highlight">${fmt(d.todayKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.todayCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisWeek')}</div>${period(d.windows?.weekly, this._t('thisWeek'))}
            <div class="stat-value">${fmt(d.thisWeekKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.weekCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisMonth')}</div>${period(d.windows?.monthly, this._t('thisMonth'))}
            <div class="stat-value">${fmt(d.monthKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.monthCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('trend')}</div>
            <div class="stat-value"><span class="trend-badge ${trendClass}">${trendIcon} ${trendLabel}</span></div>
            <div class="stat-sub">${this._t('vsLastWeek')}</div>
          </div>
        </div>

        <div class="recommendation">
          <span class="recommendation-icon">💡</span>
          <span>${rec}</span>
        </div>
      `;

      html += this._renderInsightDevicesV3();

      return html;
    }

    _renderChartTab(period) { return this._renderInsightChartV3(period); }

    _renderTips() {
      const pl = this._lang === 'pl';
      const text = (en, polish) => pl ? polish : en;
      const tips = [
        [text('Start with Home Assistant Energy', 'Zacznij od panelu Energia'),
         text('Your administrator selects grid import sources in Energy Dashboard. This card uses those same recorded measurements.',
              'Administrator wybiera import z sieci w panelu Energia Home Assistant. Karta korzysta z tych samych zapisanych pomiarów.')],
        [text('Costs follow saved tariffs', 'Koszty według zapisanych taryf'),
         text('Your administrator maintains tariff rates and their effective dates. Historical consumption uses the rates valid at that time; missing prices remain unavailable.',
              'Administrator ustawia stawki taryf i daty ich obowiązywania. Zużycie historyczne korzysta z ówczesnych stawek; brak ceny pozostaje brakiem danych.')],
        [text('Find your peak hours', 'Sprawdź godziny największego zużycia'),
         text('Select a chart interval or open Data to read its values. Compare matching periods and check measurement coverage; a missing reading is not zero.',
              'Wybierz przedział na wykresie lub otwórz Dane, aby odczytać wartości. Porównuj odpowiadające sobie okresy i sprawdzaj pokrycie pomiarów; brak pomiaru nie oznacza zera.')],
        [text('See devices and rooms', 'Zobacz urządzenia i pokoje'),
         text('Use the device and room rankings to find measured consumers. No room and unmeasured energy are separate; household fixed fees are not device costs.',
              'Rankingi urządzeń i pokoi pokazują zmierzone zużycie. Bez pokoju i Niezmierzone są osobnymi pozycjami; opłaty stałe domu nie są kosztami urządzenia.')],
        [text('Base improvements on measurements', 'Planuj zmiany na podstawie pomiarów'),
         text('Review your own device measurements before deciding to replace an appliance. Tariff comparisons use the same consumption and do not promise savings or change your tariff.',
              'Sprawdź własne pomiary urządzeń przed decyzją o wymianie sprzętu. Porównania taryf używają tego samego zużycia, nie obiecują oszczędności i nie zmieniają taryfy.')]
      ];
      return `<section data-energy-tips-v53 aria-label="${_esc(text('Tips', 'Wskazówki'))}" class="tips-grid">${tips.map(([title, body])=>
        `<article class="tip-card"><strong>${_esc(title)}</strong><p>${_esc(body)}</p></article>`).join('')}</section>`;
    }

    _renderToolsBanner() {
      return '';
    }

    // ===== CHARTS =====

    _chartThemeColors() {
      const style = getComputedStyle(this);
      return {
        text: style.getPropertyValue('--primary-text-color').trim() || (this._hass?.themes?.darkMode ? '#e2e8f0' : '#172335'),
        grid: style.getPropertyValue('--divider-color').trim() || (this._hass?.themes?.darkMode ? '#334155' : '#d6dce5')
      };
    }

    _syncChartTheme() {
      const { text, grid } = this._chartThemeColors();
      for (const chart of Object.values(this._charts)) {
        const { x, y } = chart.options.scales;
        if (x.ticks.color === text && y.ticks.color === text && y.grid.color === grid) continue;
        x.ticks.color = text;
        y.ticks.color = text;
        y.grid.color = grid;
        chart.update('none');
      }
    }

    _renderCharts() { this._bindInsightContentV3(); }

    _buildDayLabels(days) {
      const labels = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        labels.push(`${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      return labels;
    }

    _buildHourLabels(hours) {
      const labels = [];
      for (let i = 0; i < hours; i++) {
        labels.push(`${String(i).padStart(2, '0')}:00`);
      }
      return labels;
    }

    // ===== EVENT BINDING =====

    _bindEvents() {
      const shadow = this.shadowRoot;
      shadow.querySelector('.support-dismiss')?.addEventListener('click', () => {
        try { localStorage.setItem('ha-energy-insights-support-dismissed', '1'); } catch (_) {}
        this._syncSupport();
      });

      shadow.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._activeTab = btn.dataset.tab;
          this._observeTariffNavigationV3();
          localStorage.setItem('ha-tools-energy-insights-active-tab', this._activeTab);
          history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this._activeTab);
          // Update tab content only (no full DOM rebuild)
          this._updateContent();
          if (this._chartJsReady && this._data && this._activeTab !== 'overview' && this._activeTab !== 'tips') {
            this._schedule(() => this._renderCharts(), 0);
          }
        });
      });
    }

    setActiveTab(tabId) {
      this._activeTab = tabId;
      this._observeTariffNavigationV3();
      this._render();
    }

    getCardSize() { return 8; }

    getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }
  }




  class HaEnergyInsightsEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
    }
    setConfig(config) {
      this._config = { ...config };
      this._render();
    }
    set hass(hass) {
      this._hass = hass;
      this._render();
    }
    _dispatch() {
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    _syncFields() {
      const pl=String(this._hass?.locale?.language || this._hass?.language || navigator.language || '').startsWith('pl');
      for(const [key,en,label] of [['title','Title','Tytuł'],['currency','Currency','Waluta'],['energy_price','Energy price','Cena energii']]) {
        const node=this.shadowRoot.querySelector('label[for="cf_'+key+'"]');if(node)node.textContent=pl?label:en;
      }
      const values = { title: this._config.title ?? 'Energy Insights', currency: this._config.currency ?? this._hass?.config?.currency ?? '' };
      for (const [key, value] of Object.entries(values)) {
        const field = this.shadowRoot.getElementById('cf_' + key);
        const next = String(value);
        if (field.value === next) continue;
        // Keep the node and selection when HA echoes or replaces the configuration.
        const selection = this.shadowRoot.activeElement === field
          ? [field.selectionStart, field.selectionEnd, field.selectionDirection] : null;
        field.value = next;
        if (selection) field.setSelectionRange(...selection);
      }
    }
    _render() {
      if (this.shadowRoot.getElementById('cf_title')) {
        this._syncFields();
        return;
      }
      this.shadowRoot.innerHTML = `
        <style>
              :host { display:block; padding:16px; }
              h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
              input { min-height:44px; box-sizing:border-box; outline:none; transition:border-color .2s; }
              input:focus-visible { outline:3px solid var(--primary-color,#3b82f6); outline-offset:2px; }
              input[type="checkbox"] { flex:0 0 44px; }
              input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
          </style>
        <h3>Energy Insights</h3>
              <div style="margin-bottom:12px;">
                <label for="cf_title" style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
                <input type="text" id="cf_title" value="${_esc(this._config?.title ?? 'Energy Insights')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label for="cf_currency" style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency ?? this._hass?.config?.currency ?? '')}"
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
      this._syncFields();
    }
    connectedCallback() { this._render(); }
  }
  // HA_DASHBOARD_PLACEMENT_V53_START
// Lovelace save has no CAS: compare-before-save reduces, but cannot eliminate,
// the race with another editor between the final read and the native save.
function createDashboardPlacementV53({host, getHass, getCardConfig,
  cardTypes = ['custom:ha-energy-optimizer', 'custom:ha-energy-insights', 'custom:ha-energy-email'],
  getSourceKey = () => null}) {
  const known = ['custom:ha-energy-optimizer', 'custom:ha-energy-insights', 'custom:ha-energy-email'];
  const allowed = known.filter(type => cardTypes.includes(type));
  const clone = value => JSON.parse(JSON.stringify(value));
  const key = value => JSON.stringify(value);
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const pathOK = path => path === null || typeof path === 'string' && /^[a-z0-9][a-z0-9_-]*$/.test(path);
  const titleId = 'ha-tools-placement-' + Math.random().toString(36).slice(2);
  let session = null, dialog = null, destroyed = false, running = false, queued = null, returnFocus = null;
  let cancelledWrite = false;
  const text = (en, pl) => String(getHass()?.locale?.language || getHass()?.language || 'en').startsWith('pl') ? pl : en;
  function identity() {
    const hass = getHass();
    if (!host.isConnected || hass?.connected === false || !hass?.connection || hass.connection.connected === false ||
        typeof hass.callWS !== 'function' || typeof hass.user?.id !== 'string' || !hass.user.id ||
        hass.user.is_admin !== true || hass.user.is_active === false) return null;
    const card = clone(getCardConfig());
    if (!object(card) || !allowed.includes(card.type)) return null;
    return {connection:hass.connection, user:hass.user.id, card, signature:key(card), source:key(getSourceKey())};
  }
  function current(s, intent = s?.intent) {
    if (!s || session !== s || destroyed || s.intent !== intent) return false;
    if (!dialog?.isConnected) { close(); return false; }
    let live;
    try { live = identity(); } catch (_) { live = null; }
    if (!live || live.connection !== s.connection || live.user !== s.user || live.signature !== s.signature || live.source !== s.source) {
      close(); // Purge private snapshots and detached previews on identity/source revocation.
      return false;
    }
    return true;
  }
  // Single raw operation lane, including reads. Replacement intent never starts
  // another operation while a previous promise is unsettled, even after close().
  function enqueue(task) { queued = task; pump(); }
  async function pump() {
    if (running || !queued || destroyed) return;
    const task = queued; queued = null; running = true; paint();
    try { await task(); } catch (_) { /* Tasks expose localized states, never raw backend/private errors. */ }
    finally { running = false; paint(); pump(); }
  }
  async function call(s, intent, type, extra = {}) {
    if (!current(s, intent)) throw Error('cancelled');
    const message = {type, ...extra};
    if (type !== 'lovelace/dashboards/list' && s.target !== null) message.url_path = s.target;
    // Native HA performs fresh require_admin authorization independently.
    let value;
    try { value = await getHass().callWS(message); }
    catch (error) {
      if (['unauthorized','not_allowed','forbidden'].includes(error?.code) && session === s) close();
      throw error;
    }
    if (!current(s, intent)) throw Error('cancelled');
    return value;
  }
  function read(s, intent) { return call(s, intent, 'lovelace/config', {force:true}); }
  function validateConfig(config) {
    if (!object(config) || !Array.isArray(config.views) && !object(config.strategy)) throw Error('invalid_config');
    return clone(config);
  }
  function destination(s) {
    const config = s.baseline, view = config?.views?.[s.view];
    if (!object(config) || config.strategy || !object(view) || view.strategy) return null;
    const type = view.type || (view.panel === true ? 'panel' : 'masonry');
    if (type === 'sections') {
      const section = view.sections?.[s.section];
      return object(section) && !section.strategy && section.type === 'grid' &&
        (section.cards === undefined || Array.isArray(section.cards)) ? ['views',s.view,'sections',s.section,'cards'] : null;
    }
    if (type !== 'masonry' && type !== 'panel' || view.cards !== undefined && !Array.isArray(view.cards)) return null;
    if (type === 'panel' && view.cards?.length) return null;
    return ['views',s.view,'cards'];
  }
  function candidate(s) {
    const path = destination(s);
    if (!path) throw Error('readonly');
    const result = clone(s.baseline);
    let parent = result;
    for (const segment of path.slice(0,-1)) parent = parent[segment];
    parent.cards = [...(parent.cards || []), clone(s.card)];
    return result;
  }
  function clearTarget(s) {
    s.baseline = null; s.tx = null; s.previewReady = false; s.blocked = false;
    s.view = 0; s.section = 0; s.status = 'select';
    dialog?.querySelector('[data-preview]')?.replaceChildren();
  }
  function selectDashboard(value) {
    const s = session;
    if (!current(s) || s.writing) return;
    s.intent++; clearTarget(s);
    const choice = s.dashboards[Number(value)];
    if (value === '' || !choice) { s.target = undefined; paint(); return; }
    s.target = choice.url_path;
    if (choice.mode !== 'storage') { s.status = 'readonly'; paint(); return; }
    const intent = s.intent; s.status = 'loading'; paint();
    enqueue(async () => {
      if (!current(s, intent)) return;
      try {
        const config = validateConfig(await read(s, intent));
        if (!current(s, intent)) return;
        s.baseline = config; s.status = 'ready'; chooseView(0);
      } catch (_) { if (current(s, intent)) { s.status = 'error'; paint(); } }
    });
  }
  function chooseView(value) {
    const s = session;
    if (!current(s) || s.writing || !s.baseline) return;
    s.intent++; s.view = Number(value); s.tx = null; s.blocked = false; s.status = 'ready';
    const sections = s.baseline.views?.[s.view]?.sections;
    s.section = Array.isArray(sections) ? sections.findIndex(section => section?.type === 'grid' && !section.strategy) : -1;
    preview(); paint();
  }
  function chooseSection(value) {
    const s = session;
    if (!current(s) || s.writing) return;
    s.intent++; s.section = Number(value); s.tx = null; s.blocked = false; s.status = 'ready'; preview(); paint();
  }
  function preview() {
    const s = session, area = dialog?.querySelector('[data-preview]');
    if (!current(s) || !area) return;
    area.replaceChildren(); s.previewReady = false;
    if (!destination(s)) { s.status = 'readonly'; return; }
    // The allowlist is intersected with our three concrete types. No user HTML,
    // YAML forms, guessed dialog imports, or arbitrary custom-element names.
    const name = s.card.type.slice(7);
    if (!host.ownerDocument.defaultView.customElements.get(name)) { s.status = 'previewerror'; return; }
    try {
      const card = host.ownerDocument.createElement(name);
      // Prevent interactions in the visual preview from invoking card actions.
      card.preview = true; card.inert = true; card.setAttribute('inert',''); card.setConfig(clone(s.card)); card.hass = getHass();
      area.append(card); s.previewReady = true;
    } catch (_) { area.replaceChildren(); s.status = 'previewerror'; }
  }
  async function confirm(s, intent) {
    const value = validateConfig(await read(s, intent));
    if (!current(s, intent)) return;
    const tx = s.tx;
    if (key(value) === key(tx.expected)) {
      s.baseline = clone(value); s.blocked = true;
      if (tx.undoing) { s.tx = null; s.status = 'undone'; }
      else { tx.confirmed = clone(value); s.status = 'confirmed'; }
    } else { s.status = 'unconfirmed'; s.blocked = true; }
  }
  function write(undoing) {
    const s = session;
    if (!current(s) || running || s.writing || !s.baseline || s.target === undefined) return;
    if (undoing ? !s.tx?.confirmed : s.blocked || !s.previewReady || !destination(s)) return;
    const intent = s.intent, expectedCurrent = clone(undoing ? s.tx.confirmed : s.baseline);
    const expected = clone(undoing ? s.tx.before : candidate(s));
    const before = clone(undoing ? s.tx.before : s.baseline);
    s.writing = true; s.status = 'saving'; paint();
    enqueue(async () => {
      try {
        const latest = validateConfig(await read(s, intent));
        if (!current(s, intent)) return;
        if (key(latest) !== key(expectedCurrent)) { s.blocked = true; s.tx = null; s.status = 'conflict'; return; }
        // Private backup is detached and bound to this session's user,
        // connection and target. No persistent storage or exports.
        s.tx = {before, expected, confirmed:null, undoing}; s.blocked = true;
        // Deliberate compare-before-save, NOT atomic compare-and-swap.
        // Call exactly once, even if the response is lost or rejected.
        try { await call(s, intent, 'lovelace/config/save', {config:clone(expected)}); }
        catch (_) { if (!current(s, intent)) return; }
        if (!current(s, intent)) return;
        s.status = 'unconfirmed';
        await confirm(s, intent); // Reconcile an uncertain ACK using a read only.
      } catch (_) { if (current(s, intent)) { s.blocked = true; s.status = s.tx ? 'unconfirmed' : 'error'; } }
      finally { if (current(s, intent)) { s.writing = false; paint(); } }
    });
  }
  function reconcile() {
    const s = session;
    if (!current(s) || running || s.writing || !s.tx || s.tx.confirmed) return;
    const intent = s.intent; s.status = 'loading';
    enqueue(async () => {
      try { await confirm(s, intent); }
      catch (_) { if (current(s, intent)) s.status = 'unconfirmed'; }
    });
  }
  const messages = {
    select: ['Choose an existing dashboard.', 'Wybierz istniejący dashboard.'],
    loading: ['Loading…', 'Wczytywanie…'],
    ready: ['Preview only. Add saves this card to the selected place.', 'To podgląd. Dodaj zapisze kartę w wybranym miejscu.'],
    saving: ['Saving once and checking the result…', 'Jednorazowy zapis i sprawdzanie wyniku…'],
    confirmed: ['Save confirmed. Undo is available while nobody changes this dashboard.', 'Zapis potwierdzony. Cofnij jest dostępne, dopóki nikt nie zmieni tego dashboardu.'],
    undone: ['Original configuration restored and confirmed.', 'Przywrócenie pierwotnej konfiguracji potwierdzone.'],
    conflict: ['Dashboard changed. Nothing was overwritten. Reopen to review the current version.', 'Dashboard zmienił się. Niczego nie nadpisano. Otwórz ponownie, aby sprawdzić bieżącą wersję.'],
    unconfirmed: ['Save unconfirmed. Do not repeat Add. Check the result using read only.', 'Zapis niepotwierdzony. Nie powtarzaj Dodaj. Sprawdź wynik przez sam odczyt.'],
    error: ['Cannot load or compare the dashboard. Reopen to review it.', 'Nie można wczytać lub porównać dashboardu. Otwórz ponownie, aby go sprawdzić.'],
    readonly: ['Read-only here: YAML, strategy, occupied Panel or unsupported layout. Use the native HA editor.', 'Tutaj tylko odczyt: YAML, strategia, zajęty Panel lub nieobsługiwany układ. Użyj natywnego edytora HA.'],
    previewerror: ['Card preview unavailable. Add is disabled.', 'Podgląd karty jest niedostępny. Dodaj jest wyłączone.']
  };
  function options(select, choices, value) {
    // Preserve focused native select nodes and avoid rebuilding their options on busy changes.
    const signature = key(choices);
    if (select._choices !== signature) {
      select.replaceChildren();
      for (const [id, label] of choices) {
        const option = host.ownerDocument.createElement('option'); option.value = id; option.textContent = label; select.append(option);
      }
      select._choices = signature;
    }
    select.value = String(value);
  }
  function paint() {
    const s = session;
    if (!s || !dialog || !current(s)) return;
    const q = selector => dialog.querySelector(selector);
    q('h2').textContent = text('Add to dashboard', 'Dodaj do dashboardu');
    q('[data-label-dashboard]').textContent = text('Dashboard', 'Dashboard');
    q('[data-label-view]').textContent = text('View', 'Widok'); q('[data-label-section]').textContent = text('Section', 'Sekcja');
    q('[data-preview-label]').textContent = text('Card preview (destination layout may resize it)', 'Podgląd karty (układ miejsca docelowego może zmienić rozmiar)');
    q('[data-limit]').textContent = (cancelledWrite ? text('A previous save was cancelled while pending and may have completed. Inspect the dashboard in HA before another Add. ', 'Poprzedni zapis anulowano w trakcie i mógł się zakończyć. Przed kolejnym Dodaj sprawdź dashboard w HA. ') : '') + text('You can undo this addition until this window closes.', 'Możesz cofnąć dodanie karty do zamknięcia tego okna.');
    q('[role=status]').textContent = text(...messages[s.status]);
    const selected = s.dashboards.findIndex(d => d.url_path === s.target);
    options(q('[data-dashboard]'), [['',text('Choose…','Wybierz…')],...s.dashboards.map((d,i)=>[String(i),d.title])], selected < 0 ? '' : selected);
    options(q('[data-view]'), (s.baseline?.views || []).map((v,i)=>[String(i),v.title || v.path || text(`View ${i+1}`,`Widok ${i+1}`)]), s.view);
    const sections = s.baseline?.views?.[s.view]?.sections;
    options(q('[data-section]'), Array.isArray(sections) ? sections.flatMap((v,i)=>v?.type === 'grid' && !v.strategy ? [[String(i),v.title || text(`Section ${i+1}`,`Sekcja ${i+1}`)]] : []) : [], s.section);
    q('[data-section-label]').hidden = !Array.isArray(sections);
    q('[data-dashboard]').disabled = s.writing || !s.dashboards.length;
    q('[data-view]').disabled = s.writing || !s.baseline;
    q('[data-section]').disabled = s.writing || !s.baseline;
    q('[data-add]').textContent = text('Add','Dodaj');
    q('[data-add]').disabled = running || s.writing || s.blocked || !s.previewReady || !destination(s);
    q('[data-undo]').textContent = text('Undo','Cofnij'); q('[data-undo]').disabled = running || s.writing || !s.tx?.confirmed;
    q('[data-reconcile]').textContent = text('Check result (read only)','Sprawdź wynik (tylko odczyt)');
    q('[data-reconcile]').hidden = !s.tx || !!s.tx.confirmed; q('[data-reconcile]').disabled = running || s.writing;
    q('[data-cancel]').textContent = text('Cancel','Anuluj');
    const native = q('[data-native]'); native.textContent = text('Open dashboard in Home Assistant','Otwórz dashboard w Home Assistant');
    native.hidden = s.target === undefined;
    native.setAttribute('href', s.target === undefined ? '/lovelace' : `/${s.target || 'lovelace'}`);
  }
  function mount() {
    dialog = host.ownerDocument.createElement('dialog');
    dialog.setAttribute('data-ha-tools-placement','');
    dialog.setAttribute('aria-labelledby',titleId);
    dialog.setAttribute('aria-describedby',titleId+'-limit');
    dialog.innerHTML = `<style>
dialog[data-ha-tools-placement]{box-sizing:border-box;width:min(640px,calc(100vw - 24px));max-height:calc(100dvh - 32px);overflow:auto;padding:20px;border:1px solid var(--divider-color,#888);border-radius:var(--ha-card-border-radius,12px);background:var(--card-background-color,#fff);color:var(--primary-text-color,#202124);font:14px/1.5 var(--paper-font-body1_-_font-family,system-ui)}dialog[data-ha-tools-placement]::backdrop{background:rgba(0,0,0,.45)}dialog[data-ha-tools-placement] h2{font-size:20px;margin:0 0 16px}dialog[data-ha-tools-placement] label{display:block;margin:12px 0}dialog[data-ha-tools-placement] select,dialog[data-ha-tools-placement] button,dialog[data-ha-tools-placement] a{box-sizing:border-box;min-height:44px;font:inherit}dialog[data-ha-tools-placement] select{width:100%;padding:8px;background:var(--secondary-background-color,#eee);color:inherit;border:1px solid var(--divider-color,#888);border-radius:8px}dialog[data-ha-tools-placement] button{padding:10px 16px;background:var(--secondary-background-color,#eee);color:inherit;border:1px solid var(--divider-color,#888);border-radius:8px;cursor:pointer}dialog[data-ha-tools-placement] button:disabled{opacity:.55;cursor:default}dialog[data-ha-tools-placement] [data-add]{background:var(--primary-color,#1565c0);color:var(--text-primary-color,#fff)}dialog[data-ha-tools-placement] button:focus-visible,dialog[data-ha-tools-placement] select:focus-visible,dialog[data-ha-tools-placement] a:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}dialog[data-ha-tools-placement] [data-actions]{display:flex;gap:8px;flex-wrap:wrap}dialog[data-ha-tools-placement] [data-preview]{max-width:100%;overflow:hidden}dialog[data-ha-tools-placement] [data-meta]{font-size:12px;color:var(--secondary-text-color,#555)}dialog[data-ha-tools-placement] a{display:inline-flex;align-items:center;color:var(--primary-color,#1565c0)}dialog[data-ha-tools-placement] [hidden]{display:none!important}
      </style><h2 id="${titleId}"></h2>
      <label><span data-label-dashboard></span><select data-dashboard></select></label>
      <label><span data-label-view></span><select data-view></select></label>
      <label data-section-label hidden><span data-label-section></span><select data-section></select></label>
      <p data-preview-label></p><div data-preview></div><p role="status" aria-live="polite"></p>
      <p data-meta data-limit id="${titleId}-limit"></p><a data-native hidden></a>
      <div data-actions><button type="button" data-add></button><button type="button" data-undo></button><button type="button" data-reconcile hidden></button><button type="button" data-cancel></button></div>`;
    dialog.querySelector('[data-dashboard]').addEventListener('change', e => selectDashboard(e.target.value));
    dialog.querySelector('[data-view]').addEventListener('change', e => chooseView(e.target.value));
    dialog.querySelector('[data-section]').addEventListener('change', e => chooseSection(e.target.value));
    dialog.querySelector('[data-add]').addEventListener('click', () => write(false));
    dialog.querySelector('[data-undo]').addEventListener('click', () => write(true));
    dialog.querySelector('[data-reconcile]').addEventListener('click', reconcile);
    dialog.querySelector('[data-cancel]').addEventListener('click', close);
    dialog.addEventListener('cancel', e => {e.preventDefault(); close();});
    dialog.addEventListener('close', () => { if (dialog && !dialog.open) close(); });
    host.append(dialog);
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.open = true;
  }
  function open() {
    if (destroyed) return false;
    if (session && current(session)) { dialog.querySelector('[data-dashboard]').focus(); return true; }
    let token;
    try { token = identity(); } catch (_) { return false; }
    if (!token) return false;
    returnFocus = host.ownerDocument.activeElement;
    while (returnFocus?.shadowRoot?.activeElement) returnFocus = returnFocus.shadowRoot.activeElement;
    const s = {...token,intent:0,dashboards:[],target:undefined,baseline:null,tx:null,view:0,section:0,writing:false,blocked:false,previewReady:false,status:'loading'};
    session = s; mount(); paint();
    dialog.querySelector('[data-cancel]').focus();
    enqueue(async () => {
      if (!current(s)) return;
      const intent = s.intent;
      try {
        const result = await call(s, intent, 'lovelace/dashboards/list');
        if (!current(s, intent)) return;
        if (!Array.isArray(result)) throw Error('invalid_dashboards');
        const mode = getHass()?.panels?.lovelace?.config?.mode;
        const list = mode === 'storage' || mode === 'yaml' ? [{url_path:null,title:text('Default dashboard','Domyślny dashboard'),mode}] : [];
        for (const d of result) if (object(d) && typeof d.url_path === 'string' && pathOK(d.url_path) && !list.some(v=>v.url_path===d.url_path)) {
          list.push({url_path:d.url_path,title:typeof d.title === 'string' ? d.title : d.url_path,mode:d.mode});
        }
        s.dashboards = list; s.status = list.length ? 'select' : 'readonly';
      } catch (_) { if (current(s, intent)) s.status = 'error'; }
    });
    return true;
  }
  function close() {
    const old = session; session = null; queued = null;
    // In-flight promise cannot be cancelled at HA. The lane remains occupied
    // until it settles; its continuation cannot render, read or write again.
    if (old) { if (old.writing && old.tx) cancelledWrite = true; old.intent++; old.baseline = null; old.tx = null; old.card = null; old.dashboards = []; }
    const node = dialog; dialog = null; node?.remove();
    if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
    returnFocus = null;
  }
  function update() {
    if (!session || !current(session)) return;
    const card = dialog.querySelector('[data-preview]')?.firstElementChild;
    if (card) card.hass = getHass();
    paint();
  }
  function destroy() { close(); destroyed = true; }
  return {open,close,destroy,update};
}
// HA_DASHBOARD_PLACEMENT_V53_END
// HA_ENERGY_CARD_OPTIONS_V5_START
// Presentation-only card options. Only UI preferences are stored locally; no pricing, backend writes or requests.
function createEnergyCardOptionsV5({ Card, Editor, name, title, tabs, labels }) {
  const key = name === 'ha-energy-optimizer' ? '_currentTab' : '_activeTab';
  const pl = host => String(host._hass?.locale?.language || host._hass?.language || navigator.language || '').startsWith('pl');
  const t = (host, en, polish) => pl(host) ? polish : en;
  const visible = config => config.tabs || tabs;
  const variant = config => config.variant || (config.compact ? 'legacy' : 'full');
  const simple = host => ['tile','compact'].includes(variant(host._config || {})) && !host._optionsExpandedV5;

  // Placement uses its own retained raw lane. Unmount closes/purges it but does
  // not replace the factory while a native save may still be unsettled.
  const placementFull = host => !simple(host) && !(variant(host._config || {}) === 'legacy' && !host._optionsExpandedV5);
  const placementGuard = host => host._getTariffHostV3().guard;
  const placementAllowed = host => {
    if (!host.isConnected || host.preview === true || !placementFull(host) || host._hass?.user?.is_admin !== true) return false;
    const guard = placementGuard(host), token = guard.snapshot();
    return guard.available(token) && guard.current(token,true);
  };
  const stopPlacement = host => {
    host._dashboardPlacementV53?.close();
    host._dashboardPlacementUnsubscribeV53?.(); delete host._dashboardPlacementUnsubscribeV53;
    delete host._dashboardPlacementGuardV53;
    host._dashboardPlacementMountV53?.remove();
    // Retain this factory and its mount for remount. destroy()+new would lose
    // occupancy of an unresolved native call; close() already purges snapshots.
  };
  const syncPlacement = host => {
    const root = host.shadowRoot;
    if (!root) return;
    if (!placementAllowed(host)) {
      host._dashboardPlacementV53?.close();
      host._dashboardPlacementMountV53?.remove();
      root.querySelector('[data-energy-dashboard-footer]')?.remove();
      return;
    }
    const guard = placementGuard(host);
    if (host._dashboardPlacementGuardV53 !== guard || !host._dashboardPlacementUnsubscribeV53) {
      host._dashboardPlacementUnsubscribeV53?.();
      host._dashboardPlacementGuardV53 = guard;
      host._dashboardPlacementUnsubscribeV53 = guard.subscribe(() => {
        // Includes authoritative browser/connection/source edges between hass setters.
        host._dashboardPlacementV53?.close(); syncPlacement(host);
      });
    }
    const parent = root.querySelector('.card-container,.panel-root,.card') || root;
    let footer = root.querySelector('[data-energy-dashboard-footer]');
    if (!footer) {
      footer = document.createElement('footer'); footer.dataset.energyDashboardFooter = '';
      const css = document.createElement('style');
      css.textContent = '[data-energy-dashboard-footer]{margin-block-start:12px;padding:8px 0;display:flex;flex-wrap:wrap;gap:8px}[data-energy-dashboard-footer] button{min-height:44px;min-width:44px;padding:10px 14px;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:14px;cursor:pointer}[data-energy-dashboard-footer] button:focus-visible{outline:3px solid var(--primary-color);outline-offset:2px}';
      const button = document.createElement('button'); button.type = 'button'; button.dataset.energyDashboardAdd = '';
      button.addEventListener('click', () => {
        if (!placementAllowed(host)) { syncPlacement(host); return; }
        if (!host._dashboardPlacementMountV53) {
          host._dashboardPlacementMountV53 = document.createElement('div');
          host._dashboardPlacementMountV53.dataset.energyDashboardMount = '';
        }
        root.append(host._dashboardPlacementMountV53);
        host._dashboardPlacementV53 ||= createDashboardPlacementV53({
          host:host._dashboardPlacementMountV53,
          getHass:() => placementAllowed(host) ? host._hass : null,
          getCardConfig:() => ({...(host._optionsConfigV5 || {}),type:`custom:${name}`}),
          cardTypes:[`custom:${name}`],
          getSourceKey:() => placementGuard(host).snapshot().epoch
        });
        host._dashboardPlacementV53.open();
      });
      footer.append(css,button); parent.append(footer);
    }
    const button = footer.querySelector('[data-energy-dashboard-add]');
    button.textContent = t(host,'Add to dashboard','Dodaj do dashboardu');
    // Retain the mount node across ordinary full-DOM redraws. Reattach before
    // update() so a synchronous redraw does not masquerade as a source teardown.
    if (host._dashboardPlacementMountV53 && host._dashboardPlacementMountV53.parentNode !== root) root.append(host._dashboardPlacementMountV53);
    host._dashboardPlacementV53?.update();
  };
  Card.prototype._syncDashboardPlacementV53 = function() { syncPlacement(this); };

  // Only the picker stub opts new cards in. Existing YAML is never migrated.
  Card.getStubConfig = () => ({type: `custom:${name}`, title, variant: 'compact'});

  const validate = config => {
    if (config.variant !== undefined && !['tile','compact','full'].includes(config.variant)) throw new Error('variant: tile / compact / full');
    if (config.tap_target !== undefined && !['full','energy','more-info'].includes(config.tap_target)) throw new Error('tap_target: full / energy / more-info');
    if (config.entity !== undefined && config.tap_target === 'more-info' && (typeof config.entity !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(config.entity))) throw new Error('more-info: choose an entity / wybierz encję');

    if (config.tabs !== undefined && (!Array.isArray(config.tabs) || !config.tabs.length || config.tabs.some(id => !tabs.includes(id)) || new Set(config.tabs).size !== config.tabs.length)) throw new Error('tabs: choose at least one known visible tab / wybierz widoczną zakładkę');
    if (config.default_tab !== undefined && !visible(config).includes(config.default_tab)) throw new Error('default_tab must be a visible tab / domyślna zakładka musi być widoczna');
    for (const option of ['compact', 'show_help', 'show_support']) if (config[option] !== undefined && typeof config[option] !== 'boolean') throw new Error(`${option}: expected true or false`);
    if (config.chart_hours !== undefined && (!Number.isInteger(config.chart_hours) || config.chart_hours < 1 || config.chart_hours > 744)) throw new Error('chart_hours: 1–744 whole hours / pełnych godzin');
  };
  const navigationButtons = host => [...host.shadowRoot.querySelectorAll('.tabs [data-tab]')]
    .filter(button => !button.hidden && !button.disabled && visible(host._config || {}).includes(button.dataset.tab));
  const syncNavigation = host => {
    const buttons = navigationButtons(host);
    for (const button of host.shadowRoot.querySelectorAll('.tabs [data-tab]')) {
      const active = buttons.includes(button) && button.dataset.tab === host[key];
      button.tabIndex = active ? 0 : -1;
      button.setAttribute('aria-selected', String(active));
    }
    const active = buttons.find(button => button.dataset.tab === host[key]);
    const track = active?.closest('.tabs');
    if (!track?.clientWidth) return;
    // Reveal horizontally without moving the page during ordinary hass updates.
    const point = active.getBoundingClientRect(), bounds = track.getBoundingClientRect();
    if (point.left < bounds.left) track.scrollLeft -= bounds.left - point.left;
    else if (point.right > bounds.right) track.scrollLeft += point.right - bounds.right;
  };
  const originalSet = Card.prototype.setConfig;
  Card.prototype.setConfig = function(config = {}) {
    validate(config);
    const previous = this._optionsConfigV5;
    const changed = previous ? previous.default_tab !== config.default_tab : config.default_tab !== undefined;
    this._optionsConfigV5 = { ...config };
    if (previous && (variant(previous) !== variant(config) || previous.tap_target !== config.tap_target || previous.entity !== config.entity)) {
      this._optionsExpandedV5 = false; this._domBuilt = false;
      this._analysisHostV53?.stop();
    }
    if (this._config) {
      this._config = {...this._config};
      for (const option of ['default_tab','tabs','compact','variant','tap_target','entity','show_help','show_support','chart_hours']) if (!(option in config)) delete this._config[option];
    }
    if (changed || !visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    // Existing integrations own their complete configuration and backend context.
    try {
      const result = originalSet.call(this, config);
      if (this._hass && (name === 'ha-energy-insights' || simple(this))) this._render();
      return result;
    } finally { this._syncDashboardPlacementV53(); }
  };
  Card.prototype.getGridOptions = function() {
    if (simple(this)) return variant(this._config) === 'tile' ? {columns:6,rows:1,min_columns:6,min_rows:1} : {columns:12,rows:4,min_columns:6,min_rows:2,max_rows:4};
    return {columns:variant(this._config || {}) === 'legacy' ? 6 : 12,min_columns:3,min_rows:variant(this._config || {}) === 'legacy' ? 2 : 3};
  };
  const originalSize = Card.prototype.getCardSize;
  Card.prototype.getCardSize = function() { return simple(this) ? (variant(this._config) === 'tile' ? 1 : 4) : variant(this._config || {}) === 'legacy' && !this._optionsExpandedV5 ? 3 : originalSize?.call(this) || 10; };
  const style = `:host{display:block;min-width:0;color-scheme:light;--bento-primary:#1d4ed8;--bento-primary-hover:#1e40af;--bento-on-primary:#fff;--bento-text-muted:var(--secondary-text-color,#475569);--energy-value-blue:#1d4ed8;--energy-value-amber:#92400e;--energy-value-green:#166534;--energy-value-red:#b91c1c;--energy-value-neutral:#475569;--energy-value-purple:#6d28d9;--energy-success-button:#166534;--energy-kpi-tone:#eff6ff;--energy-kpi-tone-alt:#f0fdf4}
:host(.bento-dark){color-scheme:dark;--bento-primary:#a5b4fc;--bento-primary-hover:#c7d2fe;--bento-on-primary:#111827;--bento-text-muted:var(--secondary-text-color,#cbd5e1);--energy-value-blue:#93c5fd;--energy-value-amber:#fcd34d;--energy-value-green:#86efac;--energy-value-red:#fca5a5;--energy-value-neutral:#cbd5e1;--energy-value-purple:#c4b5fd;--energy-success-button:#166534;--energy-kpi-tone:#17273d;--energy-kpi-tone-alt:#172d25}
.stat,.stat-card{background:var(--energy-kpi-tone)!important}.stat:nth-child(even),.stat-card:nth-child(even){background:var(--energy-kpi-tone-alt)!important}
.btn-primary,button.btn-primary{color:var(--bento-on-primary)}
.ht-tariff-v3 [data-status=success]{color:var(--energy-value-green)}.ht-tariff-v3 [data-status=error]{color:var(--energy-value-red)}.ht-tariff-v3 [data-status=partial],.ht-tariff-v3 [data-status=unconfirmed]{color:var(--energy-value-amber)}
 [data-energy-options-help], [data-energy-compact]{box-sizing:border-box;padding:16px;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border-radius:12px;font-size:14px;overflow-wrap:anywhere} [data-energy-options-help] summary, [data-energy-expand]{min-height:44px;box-sizing:border-box;padding:12px;cursor:pointer} [data-energy-compact] dl{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:12px 0} [data-energy-compact] dt{font-size:13px;color:var(--secondary-text-color,#50545b)} [data-energy-compact] dd{margin:0 0 12px;font-weight:600;font-size:18px} [data-energy-expand]{color:var(--primary-text-color,#202124);background:var(--secondary-background-color,#eee);border:1px solid var(--divider-color,#888);border-radius:8px;font:inherit} [data-energy-options-help] summary:focus-visible,[data-energy-expand]:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer{flex:0 0 auto;padding:0;background:transparent;border-radius:0}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]{flex:1 1 100%;width:100%}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer>summary{min-height:44px;padding:12px 8px;font-size:14px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]>p{margin:0 0 8px}`;
  const simpleStyle = `:host{display:block;min-width:0;--energy-simple-cheap:#1baf7a;--energy-simple-expensive:#2a78d6}:host(.bento-dark){--energy-simple-cheap:#199e70;--energy-simple-expensive:#3987e5} [data-energy-simple]{box-sizing:border-box;display:grid;gap:8px;padding:12px;color:var(--primary-text-color);background:var(--ha-card-background,var(--card-background-color));border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);font-size:14px;min-width:0;overflow-wrap:anywhere} [data-energy-simple] h2,[data-energy-simple] p{margin:0;font-size:14px;line-height:20px} [data-energy-simple] h2{display:flex;align-items:center;gap:8px} [data-energy-simple] ha-icon{color:var(--primary-color);flex-shrink:0} [data-energy-primary]{font-size:24px;line-height:32px;font-weight:600} [data-energy-secondary]{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;line-height:18px} [data-energy-simple] button,[data-energy-back]{min-height:44px;min-width:44px;padding:8px 12px;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:14px;cursor:pointer} [data-energy-simple] button:focus-visible,[data-energy-back]:focus-visible{outline:3px solid var(--primary-color);outline-offset:2px} [data-energy-simple=tile]{grid-template-columns:minmax(0,1fr) auto;gap:4px 8px;padding:4px 8px;min-height:56px} [data-energy-simple=tile] h2{font-size:14px;min-width:0} [data-energy-simple=tile] [data-energy-name],[data-energy-simple=tile] [data-energy-primary]{overflow:hidden;white-space:nowrap;text-overflow:ellipsis} [data-energy-simple=tile] [data-energy-primary]{font-size:12px;line-height:16px} [data-energy-simple=tile] button{grid-column:2;grid-row:1 / 3;width:44px;height:44px;align-self:center;padding:8px;font-size:24px;line-height:24px} [data-energy-simple=tile] ha-icon{--mdc-icon-size:20px} [data-energy-simple=compact]{grid-template-columns:minmax(0,1fr) auto;gap:6px 8px} [data-energy-simple=compact] h2,[data-energy-simple=compact] [data-energy-secondary],[data-energy-simple=compact] [data-energy-zone-wrapper],[data-energy-simple=compact] button{grid-column:1 / -1} [data-energy-simple=compact] [data-energy-primary]{grid-column:1;grid-row:2} [data-energy-simple=compact] [data-energy-primary-label]{grid-column:2;grid-row:2;align-self:center;font-size:12px;line-height:18px} [data-energy-zone-wrapper] p{font-size:12px;line-height:16px;margin:0 0 4px} [data-energy-zonebar]{position:relative;height:10px;overflow:hidden;border:1px solid var(--divider-color);border-radius:4px;background:var(--disabled-color,var(--secondary-background-color))} [data-energy-zonebar] span{position:absolute;inset-block:0} [data-energy-zone=cheap]{background:var(--energy-simple-cheap)} [data-energy-zone=expensive]{background:var(--energy-simple-expensive)} [data-energy-zone=mixed]{background:var(--info-color,var(--primary-color))} [data-energy-zone=unknown]{background:var(--disabled-color,var(--secondary-background-color))}`;
  const open = host => {
    const config = host._config || {};
    if (config.tap_target === 'energy') {
      // Fixed HA route only: configuration cannot supply a URL.
      history.pushState(null, '', '/energy'); window.dispatchEvent(new CustomEvent('location-changed')); return;
    }
    if (config.tap_target === 'more-info') {
      if (host._hass?.states?.[config.entity]) host.dispatchEvent(new CustomEvent('hass-more-info', {detail:{entityId:config.entity},bubbles:true,composed:true}));
      return;
    }
    host._optionsExpandedV5 = true; host._domBuilt = false;
    if (host._hass && hassDescriptor?.set) hassDescriptor.set.call(host,host._hass);
    host._render();
    host.shadowRoot.querySelector('[data-energy-back]')?.focus({preventScroll:true});
  };
  // Reuse one real controller across context changes and remounts: disconnect()
  // clears authority/cache while its occupied raw request survives until settlement.
  const summaryFor = host => host._simpleSummaryV95 ||= (() => {
    let identity = null, needsRead = true, scheduled = false;
    const active = () => host.isConnected && simple(host) && variant(host._config || {}) === 'compact';
    const context = () => { const h = host._hass; return [h?.connection,h?.user?.id,h?.user?.is_active,h?.user?.is_admin,h?.user?.is_owner,JSON.stringify(h?.user?.groups || []),JSON.stringify(h?.user?.group_ids || []),h?.connected,h?.config?.time_zone,h?.connection?.connected,h?.callWS]; };
    const same = (a,b) => a && b && a.every((value,index) => value === b[index]);
    const paint = () => {
      if (scheduled) return;
      scheduled = true; queueMicrotask(() => { scheduled = false; if (active()) host._render(); });
    };
    const binding = host._getTariffHostV3().summary({onChange:paint,onInvalidate:() => { needsRead = true; paint(); }});
    const stop = () => { identity = null; needsRead = true; binding.stop(); };
    const state = () => {
      const next = context();
      if (!same(identity,next)) { binding.stop(); identity = next; needsRead = true; }
      // observe() masks unacknowledged data and immediately revokes stale snapshots.
      const current = binding.observe();
      if (active() && needsRead) {
        needsRead = false;
        void binding.read({period:'day',comparison:'previous'}).then(paint);
      }
      return current;
    };
    return {state,stop};
  })();
  const tileFor = host => host._simpleTileV95 ||= (() => {
    const tariff = host._getTariffHostV3();
    let attemptedEpoch = null, unsubscribe = null, timer = null;
    const active = () => host.isConnected && simple(host) && variant(host._config || {}) === 'tile';
    const paint = () => {
      // Run after the raw guard and tariff load promise both settle.
      if (timer !== null) return;
      timer = setTimeout(() => { timer = null; if (active()) host._render(); },0);
    };
    const stop = () => { unsubscribe?.(); unsubscribe = null; clearTimeout(timer); timer = null; attemptedEpoch = null; };
    const state = () => {
      if (!unsubscribe) unsubscribe = tariff.guard.subscribeWire(paint);
      const token = tariff.guard.snapshot();
      if (active() && !Object.hasOwn(host._config || {},'tariff_profile') && tariff.guard.available(token) &&
          host._sharedTariffReadStatus !== 'success' && attemptedEpoch !== token.epoch && !tariff.guard.occupied()) {
        attemptedEpoch = token.epoch;
        // This is the existing bounded shared-tariff read, independent of the
        // analysis subscription/permission. Never load SMTP or schedule settings.
        void tariff.load().then(paint);
      }
      return tariff.backend.snapshot();
    };
    return {state,stop};
  })();
  // The backend aligns unfinished current calendar days to the previous local
  // cutoff. A ready full previous-day total is not proof of this comparison.
  const elapsedComparison = analysis => {
    const p = analysis?.period, c = analysis?.comparisons?.previous, b = c?.baseline_periods?.length === 1 ? c.baseline_periods[0] : null;
    const stamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
    const day = value => typeof value === 'string' ? value.slice(0,10) : '';
    const clock = value => typeof value === 'string' ? value.slice(11,19) : '';
    const ready = row => row?.status === 'ready' && row.reason === null && row.partial === true && row.calendar_clamped === false &&
      Array.isArray(row.clamps) && row.clamps.length === 0 && row.recorder_hour_aligned === true &&
      stamp(row.start) === stamp(row.local_start) && stamp(row.end) === stamp(row.local_end) &&
      stamp(row.calendar_end) === stamp(row.calendar_local_end) && stamp(row.start) < stamp(row.end) && stamp(row.end) < stamp(row.calendar_end) &&
      clock(row.local_start) === '00:00:00' && day(row.local_start) === day(row.local_end);
    if (p?.kind !== 'day' || !ready(p) || !ready(b) || p.timezone !== b.timezone || p.timezone !== analysis.context?.measurement_timezone ||
        c?.status !== 'ready' || c.reason !== null || c.comparison_scope !== 'calendar_totals' ||
        c.chart?.status !== 'ready' || c.chart.reconciles_comparison_energy !== true ||
        clock(p.local_end) !== clock(b.local_end) || p.end_fold !== b.end_fold ||
        ![0,1].includes(p.end_fold) || ![0,1].includes(b.end_fold) ||
        !((typeof c.percent === 'number' || typeof c.percent === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(c.percent)) && Number.isFinite(Number(c.percent)))) return null;
    const prior = new Date(stamp(day(p.local_start) + 'T00:00:00Z') - 86400000);
    if (!Number.isFinite(prior.getTime()) || prior.toISOString().slice(0,10) !== day(b.local_start)) return null;
    try {
      const parts = new Intl.DateTimeFormat('en',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(analysis.generated_at));
      const fields = Object.fromEntries(parts.map(part => [part.type,part.value]));
      if (`${fields.year}-${fields.month}-${fields.day}` !== day(p.local_start)) return null;
    } catch (_) { return null; }
    return {percent:c.percent,cutoff:p.end};
  };
  const paintZoneBar = (bar, analysis, host, format) => {
    if (!bar) return;
    bar.replaceChildren();
    const unknown = t(host,'Unknown','Brak danych');
    const names = {cheap:t(host,'Cheap','Tania'),expensive:t(host,'Expensive','Droga'),mixed:t(host,'Mixed','Mieszana')};
    const p = analysis?.period, chart = analysis?.chart, window = analysis?.period_summary?.window;
    const start = Date.parse(p?.start), end = Date.parse(p?.calendar_end), observed = Date.parse(p?.end);
    const rows = chart?.bins;
    const note = t(host,'Tariff zones for the calendar day; unconfirmed intervals are neutral.','Strefy taryfy w dniu kalendarzowym; niepotwierdzone odcinki są neutralne.');
    const descriptions = [];
    bar.setAttribute('aria-label',`${note} ${unknown}`);
    // Position/width are time geometry only. Never sum bins, quantities or costs.
    if (p?.kind !== 'day' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 48*3600000 ||
        !Number.isFinite(observed) || observed > end || window?.start !== p.start || window?.end !== p.end || window?.timezone !== p.timezone ||
        chart?.timezone !== p.timezone || chart?.status !== 'ready' || chart.coverage_kind !== 'complete_household_hours' || chart.fixed_fee_scope !== 'household_period_only' ||
        !Array.isArray(rows) || rows.length > 48) return;
    let last = start;
    for (const row of rows) {
      if (!Number.isFinite(row.from) || !Number.isFinite(row.to) || row.to <= row.from || row.from < last || row.from < start || row.to > observed ||
          Date.parse(row.start) !== row.from || Date.parse(row.end) !== row.to) { bar.replaceChildren(); bar.setAttribute('aria-label',`${note} ${unknown}`); return; }
      last = row.to;
      const z = row.zone_breakdown, zone = z?.zones?.length === 1 ? z.zones[0] : null;
      const rates = (analysis.rates || []).filter(rate => rate.version_id === zone?.version_id);
      const definitions = rates.length === 1 ? (rates[0].profile?.zones || []).filter(item => item.id === zone?.zone_id) : [];
      const classification = definitions.length === 1 ? definitions[0].classification : null;
      const proven = row.complete === true && row.expected_seconds === (row.to-row.from)/1000 && row.measured_seconds === row.expected_seconds &&
        row.currency === analysis.totals?.currency && row.price_basis === analysis.totals?.price_basis && row.kwh !== null && row.kwh !== undefined &&
        z?.status === 'ready' && z.reason === null && z.scope === 'complete_household_hours' && z.fixed_fee_scope === 'household_period_only' &&
        z.reconciles_recorded_kwh === true && z.reconciles_known_costs === true && zone?.complete === true && zone.measured_seconds === row.measured_seconds &&
        z.currency === row.currency && z.price_basis === row.price_basis && String(zone.kwh) === String(row.kwh) && String(row.recorded_kwh) === String(row.kwh) &&
        String(zone.recorded_kwh) === String(row.kwh) && Object.hasOwn(names,classification);
      const label = proven ? names[classification] : unknown;
      const description = `${format.pointLabel(row.start)}–${format.pointLabel(row.end)}: ${label}`;
      const segment = document.createElement('span');
      segment.dataset.energyZone = proven ? classification : 'unknown';
      segment.style.left = `${100*(row.from-start)/(end-start)}%`;
      segment.style.width = `${100*(row.to-row.from)/(end-start)}%`;
      segment.title = description; segment.setAttribute('aria-hidden','true');
      bar.append(segment); descriptions.push(description);
    }
    bar.setAttribute('aria-label',[note,...descriptions,observed < end ? t(host,'Remaining time: Unknown','Pozostały czas: brak danych') : ''].filter(Boolean).join(' '));
  };
  const compactActionsStyle = '[data-energy-simple=compact] [data-energy-actions]{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}[data-energy-simple=compact] [data-energy-actions] button{flex:1 1 120px;min-width:0}';
  const reportStatusStyle = '[data-energy-report-status][data-energy-simple=compact] [data-energy-primary]{font-size:14px;line-height:20px}[data-energy-report-status][data-energy-simple=compact] [data-energy-primary-label]{max-inline-size:8em;font-size:12px;line-height:18px}';
  const emailStatusFor = host => host._emailStatusV100 ||= (() => {
    let scheduled = false;
    const active = () => name === 'ha-energy-email' && host.isConnected && host.preview !== true && simple(host);
    return host._getTariffHostV3().reportStatus({isActive:active,wantsExecute:() => active() && variant(host._config || {}) === 'compact' && visible(host._config || {}).includes('send') && host._hass?.user?.is_admin === true,onChange:() => {
      if (scheduled) return;
      scheduled = true; queueMicrotask(() => { scheduled = false; if (active()) host._render(); });
    }});
  })();
  const stopCompactSend = (host, purge = true) => {
    const active = host._emailCompactSendFlowV106;
    delete host._emailCompactSendFlowV106;
    host._emailCompactSendUnsubscribeV106?.(); delete host._emailCompactSendUnsubscribeV106;
    if (!active) return;
    const prior = host._emailCompactSendPriorV106; delete host._emailCompactSendPriorV106;
    if (prior) { host._firstRender = prior.firstRender; host._initialDiscoveryStartedV3 = prior.discovery; host._activeTab = prior.tab; }
    host._optionsExpandedV5 = false; host._domBuilt = false;
    if (purge) host._clearEmailContext?.();
  };
  const openCompactSend = async host => {
    if (name !== 'ha-energy-email' || host.preview === true || !host.isConnected || !simple(host) || variant(host._config || {}) !== 'compact' || !visible(host._config || {}).includes('send') || host._hass?.user?.is_admin !== true) return;
    const guard = host._getTariffHostV3().guard, token = guard.snapshot();
    const config = JSON.stringify(host._optionsConfigV5);
    if (!guard.current(token,true) || guard.occupied()) return;
    const permitted = await emailStatusFor(host).authorizeExecute();
    if (!host.isConnected || host.preview === true || !simple(host) || variant(host._config || {}) !== 'compact' || !visible(host._config || {}).includes('send') || JSON.stringify(host._optionsConfigV5) !== config || !guard.current(token,true)) return;
    if (!permitted) { host.shadowRoot.querySelector('[data-energy-open]')?.focus({preventScroll:true}); return; }
    // Navigation only. The existing form owns period choice, recipient review and the
    // final send buttons; neither a cadence nor a dispatch is selected here.
    host._emailCompactSendPriorV106 = {firstRender:host._firstRender,discovery:host._initialDiscoveryStartedV3,tab:host._activeTab};
    host._emailCompactSendFlowV106 = true;
    host._initialDiscoveryStartedV3 = false;
    host._optionsExpandedV5 = true; host._domBuilt = false;
    // Initialize the native identity in its existing no-discovery Config route,
    // then open Send. The send form needs bounded settings/previews, not the
    // legacy overview's Recorder/device discovery pipeline.
    host._activeTab = 'config';
    if (hassDescriptor?.set) hassDescriptor.set.call(host,host._hass);
    host.setActiveTab('send');
    host._emailCompactSendUnsubscribeV106 = guard.subscribe(() => {
      stopCompactSend(host); if (host.isConnected) host._render();
    });
    host.shadowRoot.querySelector('#mail-period-mode')?.focus({preventScroll:true});
    // Private settings are read only after this explicit, freshly authorized
    // navigation; they never become a prerequisite of the compact status DTO.
    void host._loadEmailBackendConfig?.().catch(() => {});
  };
  const renderSimple = host => {
    const root = host.shadowRoot, config = host._config || {}, mode = variant(config);
    const unknown = t(host,'Unknown','Brak danych'), email = name === 'ha-energy-email';
    const summary = !email && mode === 'compact' ? summaryFor(host).state() : null;
    const analysis = summary?.status === 'ready' ? summary.snapshot : null;
    const snapshot = !email && mode === 'tile' ? tileFor(host).state() : null;
    const format = createFormatUi.forHass(host._hass);
    const reportState = email ? emailStatusFor(host).state() : null;
    const report = reportState?.status === 'ready' ? reportState.snapshot : null;
    const nextReport = report?.schedule_state === 'enabled' && report.next_report_at ? format.dateTime(report.next_report_at) || unknown : unknown;
    const attempt = report?.history_state === 'ready' ? report.last_attempt : null;
    const lastAttempt = attempt ? format.dateTime(attempt.timestamp) || unknown : unknown;
    const outcomes = {
      accepted_by_smtp:t(host,'Mail server accepted; delivery unconfirmed','Serwer poczty przyjął; doręczenie niepotwierdzone'),
      preparation_failed:t(host,'Preparation failed','Przygotowanie nieudane'),authentication_failed:t(host,'Authentication failed','Uwierzytelnienie nieudane'),
      recipients_refused:t(host,'Recipients refused','Odbiorcy odrzuceni'),partial_acceptance:t(host,'Partial SMTP acceptance','Częściowe przyjęcie przez SMTP'),
      tls_failed:t(host,'TLS failed','Błąd TLS'),transport_outcome_unknown:t(host,'Transport outcome unknown','Wynik transportu nieznany'),
      send_failed:t(host,'Attempt failed','Próba nieudana'),cancelled_outcome_unknown:t(host,'Cancelled; outcome unknown','Anulowano; wynik nieznany'),outcome_unknown:unknown
    };
    const result = attempt ? outcomes[attempt.outcome] || unknown : unknown;
    const recipients = attempt?.recipient_count !== null && attempt?.recipient_count !== undefined ? format.number(attempt.recipient_count) : unknown;
    const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
    const total = analysis?.totals, elapsed = elapsedComparison(analysis);
    const energy = total?.measurement_complete !== false && numeric(total?.kwh) ? `${format.number(total.kwh,{maximumFractionDigits:2})} kWh` : unknown;
    const money = total?.pricing_complete === true && numeric(total.usage_cost) && /^[A-Z]{3}$/.test(total.currency || '')
      ? `${format.number(total.usage_cost,{minimumFractionDigits:2,maximumFractionDigits:2})} ${total.currency}` : unknown;
    const difference = elapsed ? `${format.number(elapsed.percent,{maximumFractionDigits:1,signDisplay:'exceptZero'})}%` : unknown;
    const comparisonName = elapsed ? `${t(host,'vs yesterday through','vs wczoraj do')} ${format.clock(elapsed.cutoff)}` : t(host,'Yesterday at same hour','Wczoraj o tej samej godzinie');
    const zones = {cheap:t(host,'Cheap','Tania'),expensive:t(host,'Expensive','Droga'),mixed:t(host,'Mixed','Mieszana')};
    const zone = snapshot?.status !== 'unavailable' && snapshot?.current?.available === true ? zones[snapshot.current.zone_class] || unknown : unknown;
    const next = snapshot?.status !== 'unavailable' ? snapshot?.next_cheap : null;
    const nextLabel = next?.status === 'known' && typeof next.start === 'string' && Number.isFinite(Date.parse(next.start))
      ? format.pointLabel(next.start) || unknown : next?.status === 'not_found_in_horizon' ? t(host,'None in next 8 days','Brak w kolejnych 8 dniach') : unknown;
    let section = root.querySelector(`[data-energy-simple="${mode}"]`);
    if (!section) {
      host._analysisHostV53?.stop(); host._optionsResizeV5?.disconnect();
      host._featureAccessV53?.stop(); host._reportHostV53?.stop();
      host._timers?.forEach(timer => clearTimeout(timer)); host._timers?.clear(); host._renderScheduled = false;
      root.innerHTML = `<style>${simpleStyle}${email ? compactActionsStyle + reportStatusStyle : ''}</style><section data-energy-simple="${mode}"><h2><ha-icon></ha-icon><span data-energy-name></span></h2><div data-energy-primary role="status"></div>${mode === 'compact' ? '<p data-energy-primary-label></p><div data-energy-secondary><span data-energy-cost></span><span data-energy-comparison></span></div>' + (!email ? '<div data-energy-zone-wrapper><p data-energy-zone-caption></p><div data-energy-zonebar role="img"></div></div>' : '') : ''}${email && mode === 'compact' ? '<div data-energy-actions>' : ''}<button type="button" data-energy-open></button>${email && mode === 'compact' ? '</div>' : ''}</section>`;
      section = root.querySelector('[data-energy-simple]');
      section.querySelector('button').addEventListener('click', () => open(host));
      section.querySelector('button').addEventListener('keydown', event => {
        if (['Enter',' '].includes(event.key) && !event.repeat) { event.preventDefault(); event.currentTarget.click(); }
      });
    }
    if (email) section.dataset.energyReportStatus = '';
    const grant = reportState?.capabilities;
    const showSend = email && mode === 'compact' && visible(config).includes('send') && host.preview !== true && host._hass?.user?.is_admin === true && grant?.visible === true;
    let send = section.querySelector('[data-energy-send-now]');
    if (!showSend) send?.remove();
    else {
      if (!send) {
        send = document.createElement('button'); send.type = 'button'; send.dataset.energySendNow = '';
        send.addEventListener('click', () => { void openCompactSend(host); });
        send.addEventListener('keydown', event => { if (['Enter',' '].includes(event.key) && !event.repeat) { event.preventDefault(); event.currentTarget.click(); } });
        section.querySelector('[data-energy-actions]').append(send);
      }
      send.textContent = t(host,'Send now','Wyślij teraz');
      send.title = grant.execute === true ? t(host,'Review the recipient and choose a period in the send form; nothing is sent yet.','Sprawdź odbiorcę i wybierz okres w formularzu; nic nie jest jeszcze wysyłane.') : t(host,'Sending is unavailable for this account.','Wysyłka jest niedostępna dla tego konta.');
      send.setAttribute('aria-label',t(host,'Send now — open send form','Wyślij teraz — otwórz formularz wysyłki'));
      send.disabled = grant.execute !== true || reportState.busy || host._getTariffHostV3().guard.occupied();
    }
    const icon = section.querySelector('ha-icon');
    icon.setAttribute('icon', email ? 'mdi:email-outline' : 'mdi:lightning-bolt');
    const tone = snapshot?.status !== 'unavailable' && snapshot?.current?.available === true ? snapshot.current.zone_class : null;
    icon.style.color = {cheap:'var(--energy-simple-cheap)',expensive:'var(--energy-simple-expensive)',mixed:'var(--warning-color,var(--primary-color))'}[tone] || 'var(--primary-color)';
    section.querySelector('[data-energy-name]').textContent = config.title ?? title;
    section.querySelector('[data-energy-name]').title = config.title ?? title;
    const primary = section.querySelector('[data-energy-primary]');
    const shortReport = report?.schedule_state === 'enabled' && report.next_report_at ? `${format.date(report.next_report_at,true)} · ${format.clock(report.next_report_at)}` : unknown;
    primary.textContent = email ? mode === 'tile' ? shortReport : nextReport : mode === 'tile' ? `${zone} · ${nextLabel}` : energy;
    primary.title = email ? `${t(host,'Scheduled report','Zaplanowany raport')}: ${nextReport}` : primary.textContent;
    primary.setAttribute('aria-label',primary.title);
    if (mode === 'compact') {
      section.querySelector('[data-energy-primary-label]').textContent = email ? t(host,'Scheduled report','Zaplanowany raport') : t(host,'Energy today','Energia dziś');
      section.querySelector('[data-energy-cost]').textContent = email ? `${t(host,'Last attempt','Ostatnia próba')}: ${lastAttempt}` : `${t(host,'Usage cost','Koszt zużycia')}: ${money}`;
      section.querySelector('[data-energy-comparison]').textContent = email ? `${t(host,'Result','Wynik')}: ${result} · ${t(host,'Recipients of that attempt','Odbiorcy tej próby')}: ${recipients}` : `${comparisonName}: ${difference}`;
      const caption = section.querySelector('[data-energy-zone-caption]');
      if (caption) caption.textContent = t(host,'Day tariff zones','Strefy taryfy w ciągu dnia');
      paintZoneBar(section.querySelector('[data-energy-zonebar]'),analysis,host,format);
    }
    const button = section.querySelector('button');
    button.textContent = mode === 'tile' ? '›' : t(host,'Open','Otwórz');
    button.setAttribute('aria-label', `${t(host,'Open','Otwórz')} ${config.title ?? title}`);
    button.disabled = config.tap_target === 'more-info' && !host._hass?.states?.[config.entity];
  };
  // Simple surfaces do not run the full cards' discovery/config/schedule paths.
  const hassDescriptor = Object.getOwnPropertyDescriptor(Card.prototype,'hass');
  if (hassDescriptor?.set) Object.defineProperty(Card.prototype,'hass',{...hassDescriptor,set(value) {
    try {
      // Observe a sender entered from compact before choosing the full setter.
      // A revoked context returns to compact before legacy full discovery can run.
      if (this._emailCompactSendFlowV106) { this._hass = value; this._tariffHostController?.guard.observe(); }
      // A real inert preview renders the actual card but does not start the
      // full surface's legacy discovery of SMTP, settings or schedules.
      if (!simple(this) && this.preview !== true) return hassDescriptor.set.call(this,value);
      this._hass = value;
      if (this.preview === true) this._lang = pl(this) ? 'pl' : 'en';
      this.classList.toggle('bento-dark',value?.themes?.darkMode === true);
      this._tariffHostController?.guard.observe();
      this._render();
    } finally { this._syncDashboardPlacementV53(); }
  }});
  const connected = Card.prototype.connectedCallback;
  Card.prototype.connectedCallback = function() {
    try {
      if (!simple(this) && this.preview !== true) return connected?.call(this);
      this._tariffHostController?.guard.resume(); this._render();
    } finally { this._syncDashboardPlacementV53(); }
  };
  for (const method of ['_repriceTariffV3','_syncAnalysisV53']) {
    const original = Card.prototype[method]; if (!original) continue;
    Card.prototype[method] = function(...args) { if (simple(this)) return this._render(); return original.apply(this,args); };
  }
  const render = Card.prototype._render;
  Card.prototype._render = function(...args) {
    try {
    // Preserve native showModal top-layer/focus state through ordinary source
    // updates. A source/role/config edge makes update() close it, then rendering resumes.
    const placementMount = this._dashboardPlacementMountV53;
    if (placementMount?.isConnected && placementMount.querySelector('dialog[open]')) {
      this._dashboardPlacementV53.update();
      if (placementMount.querySelector('dialog[open]')) return;
    }
    const config = this._config || {};
    if (!simple(this) || this.preview === true) this._emailStatusV100?.stop();
    if (!simple(this) || variant(config) !== 'compact') this._simpleSummaryV95?.stop();
    if (!simple(this) || variant(config) !== 'tile') this._simpleTileV95?.stop();
    if (!visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    if (simple(this)) { renderSimple(this); return; }
    if (variant(config) === 'legacy' && !this._optionsExpandedV5) {
      this._getTariffHostV3?.().backend?.snapshot();
      const snapshot = this._energySnapshotV5;
      const format = createFormatUi.forHass(this._hass);
      const value = snapshot?.today?.usage_cost;
      const cost = typeof value === 'number' && Number.isFinite(value) && snapshot?.currency ? `${format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${snapshot.currency}` : 'N/A';
      const classes = {cheap: t(this, 'Cheap', 'Tania'), expensive: t(this, 'Expensive', 'Droga'), mixed: t(this, 'Mixed', 'Mieszana')};
      const zone = snapshot?.current?.available === true ? classes[snapshot.current.zone_class] || 'N/A' : 'N/A';
      const next = snapshot?.next_cheap;
      const stamp = typeof next?.start === 'string' && Number.isFinite(Date.parse(next.start)) ? next.start : null;
      const cheap = next?.status === 'known' && stamp ? format.pointLabel(stamp) : next?.status === 'not_found_in_horizon' ? t(this, 'Not found in the next 8 days', 'Nie znaleziono w kolejnych 8 dniach') : 'N/A';
      const root = this.shadowRoot;
      let compact = root.querySelector('[data-energy-compact]');
      if (!compact) {
        root.innerHTML = `<style>${style}</style><section data-energy-compact><h2></h2><dl><dt></dt><dd data-cost></dd><dt></dt><dd data-zone></dd><dt></dt><dd data-next></dd></dl><p data-availability role="status"></p><button type="button" data-energy-expand></button></section>`;
        compact = root.querySelector('[data-energy-compact]');
        compact.querySelector('button').addEventListener('click', () => { this._optionsExpandedV5 = true; this._domBuilt = false; this._render(); const target = root.querySelector('[data-tab]:not([hidden])'); target?.focus({preventScroll:true}); });
      }
      compact.querySelector('h2').textContent = config.title ?? title;
      const names = [t(this, 'Cost today', 'Koszt dziś'),t(this, 'Current zone', 'Bieżąca strefa'),t(this, 'Next cheap period', 'Następny tani termin')];
      compact.querySelectorAll('dt').forEach((node, i) => node.textContent = names[i]);
      compact.querySelector('[data-cost]').textContent = cost;
      compact.querySelector('[data-zone]').textContent = zone;
      compact.querySelector('[data-next]').textContent = cheap;
      compact.querySelector('[data-availability]').textContent = !snapshot || snapshot.status === 'unavailable' || [cost,zone,cheap].includes('N/A') ? t(this, 'Some energy data is unavailable. N/A is not zero.', 'Część danych energii jest niedostępna. N/A nie oznacza zera.') : snapshot.status === 'partial' ? t(this, 'Partial energy data.', 'Niepełne dane energii.') : '';
      compact.querySelector('button').textContent = t(this, 'Open full view', 'Otwórz pełny widok');
      return;
    }
    const restoreBack = this.shadowRoot.activeElement?.matches('[data-energy-back]');
    const result = render.apply(this, args);
    this._applyCardOptionsV5();
    if (restoreBack) this.shadowRoot.querySelector('[data-energy-back]')?.focus({preventScroll:true});
    return result;
    } finally { this._syncDashboardPlacementV53(); }
  };
  Card.prototype._applyCardOptionsV5 = function() {
    this._syncDashboardPlacementV53();
    if (simple(this)) return;
    const root = this.shadowRoot, config = this._config || {}, allowed = visible(config);
    if (this._optionsExpandedV5 && ['tile','compact'].includes(variant(config)) && !root.querySelector('[data-energy-back]')) {
      const css = document.createElement('style'); css.textContent = simpleStyle; root.append(css);
      const back = document.createElement('button'); back.type = 'button'; back.dataset.energyBack = '';
      back.textContent = t(this,'Back to summary','Wróć do podsumowania');
      back.addEventListener('click', () => { const fromSend = this._emailCompactSendFlowV106; stopCompactSend(this); this._optionsExpandedV5 = false; this._domBuilt = false; this._render(); (fromSend ? root.querySelector('[data-energy-send-now]') || root.querySelector('[data-energy-open]') : root.querySelector('[data-energy-open]'))?.focus({preventScroll:true}); });
      root.prepend(back);
    }
    const back = root.querySelector('[data-energy-back]');
    if (back) back.textContent = t(this,'Back to summary','Wróć do podsumowania');

    const heading = root.querySelector('[data-energy-card-title]'); if (heading) heading.textContent = config.title ?? title;
    for (const button of root.querySelectorAll('.tabs [data-tab]')) { button.hidden = !allowed.includes(button.dataset.tab); button.style.display = button.hidden ? 'none' : ''; }
    for (const option of root.querySelectorAll('.energy-tab-picker option, #email-tab-select option')) { option.hidden = !allowed.includes(option.value); option.disabled = option.hidden; }
    for (const select of root.querySelectorAll('.energy-tab-picker select, #email-tab-select')) select.value = this[key];
    syncNavigation(this);
    if (!this._optionsNavigationBoundV5) {
      this._optionsNavigationBoundV5 = true;
      // The ShadowRoot survives content redraws. Bind once and resolve live buttons.
      root.addEventListener('click', event => {
        if (event.target.closest?.('.tabs [data-tab]')) syncNavigation(this);
      });
      root.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const current = event.target.closest?.('.tabs [data-tab]');
        const buttons = navigationButtons(this), index = buttons.indexOf(current);
        if (index < 0) return;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault();
        const id = buttons[next].dataset.tab;
        buttons[next].click(); // Preserve each card's existing navigation and request guards.
        syncNavigation(this);
        navigationButtons(this).find(button => button.dataset.tab === id)?.focus({preventScroll:true});
      });
    }
    // Only optional guidance is affected. Warnings, unknowns and setup errors stay visible.
    const helpKey = [name, 'options-help', config.instance_id || 'default', this._hass?.user?.id || 'anonymous'].join(':');
    if (this._helpStorageContextV5 !== helpKey) {
      this._helpStorageContextV5 = helpKey;
      this._helpManualOpenV5 = null; // null = responsive default; booleans = explicit gestures.
      try {
        const saved = localStorage.getItem(helpKey);
        if (saved === 'closed' || saved === 'open') this._helpManualOpenV5 = saved === 'open';
      } catch (_) { /* In-memory manual choice still works when storage is unavailable. */ }
    }
    let help = root.querySelector('[data-energy-options-help]');
    if (!help && root.children.length) {
      const css = document.createElement('style'); css.textContent = style; root.append(css);
      help = document.createElement('details'); help.dataset.energyOptionsHelp = '';
      if (name === 'ha-energy-optimizer') help.classList.add('energy-options-help-optimizer');
      help.innerHTML = '<summary></summary><p></p>';
      // Native keyboard activation also produces a summary click. Record intent before
      // the browser changes `open`; programmatic/queued toggle events never save state.
      help.querySelector('summary').addEventListener('click', () => {
        if (root.querySelector('[data-energy-options-help]') !== help) return;
        this._helpManualOpenV5 = !help.open;
        try { localStorage.setItem(this._helpStorageContextV5, this._helpManualOpenV5 ? 'open' : 'closed'); }
        catch (_) { /* Preserve the explicit choice for this element. */ }
      });
    }
    if (!help) return;
    // Keep this disclosure immediately after the header, before both the narrow
    // picker and the normal tabs. Move an existing node only when its anchor changes.
    const header = root.querySelector('.panel-header, .header, .card-title');
    const navigation = root.querySelector('.energy-tab-picker, .email-tab-picker, .tabs');
    if (header) {
      if (header.nextElementSibling !== help) header.after(help);
    } else if (navigation) {
      if (help.nextElementSibling !== navigation) navigation.before(help);
    } else if (help.parentNode !== root) root.append(help);
    help.hidden = config.show_help === false;
    help.querySelector('summary').textContent = t(this, 'Help', 'Pomoc');
    help.querySelector('p').textContent = t(this, 'Card options change the view only. N/A means unavailable data. Hour limits apply to hourly charts, without changing calendar periods, measurements or tariff prices.', 'Opcje karty zmieniają tylko widok. N/A oznacza brak danych. Limit godzin dotyczy wykresów godzinowych, bez zmiany okresów kalendarza, pomiarów ani cen taryfy.');
    this._helpResizeV5 = width => {
      // A queued callback from a discarded render cannot update its detached disclosure.
      if (root.querySelector('[data-energy-options-help]') !== help) return;
      this._helpDefaultOpenV5 = width >= 600;
      help.open = this._helpManualOpenV5 ?? this._helpDefaultOpenV5;
    };
    this._helpResizeV5(this.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'function') {
      if (!this._optionsResizeV5) this._optionsResizeV5 = new ResizeObserver(entries => {
        if (entries[0]) this._helpResizeV5?.(entries[0].contentRect.width);
      });
      this._optionsResizeV5.observe(this); // Idempotent; resumes observation after reconnect.
    }
  };
  // Hour limits slice the presentation array, retaining source records and stable IDs.
  Card.prototype._limitChartRowsV5 = function(rows) {
    const hours = this._config?.chart_hours;
    if (!hours || !rows.length) return rows;
    const end = Math.max(...rows.map(row => Number(row.to || row.from)));
    return rows.filter(row => Number(row.from) >= end - hours * 3600000);
  };
  for (const method of ['_dashboardRowsV3','_patternsRows','_insightChartRowsV3']) {
    const original = Card.prototype[method]; if (!original) continue;
    Card.prototype[method] = function(...args) {
      const rows = original.apply(this,args);
      const hour = method === '_dashboardRowsV3' || (method === '_patternsRows' ? this._patternsState?.resolution === 'hour' : this._insightChartState?.resolution === 'hour');
      return hour && args[0] !== false ? this._limitChartRowsV5(rows) : rows;
    };
  }
  for (const method of ['_updateContent','_renderTab','_renderCurrentTab']) {
    const original = Card.prototype[method]; if (!original) continue;
    Card.prototype[method] = function(...args) { if (simple(this)) return this._render(); const value = original.apply(this,args); this._applyCardOptionsV5(); return value; };
  }
  const disconnect = Card.prototype.disconnectedCallback;
  Card.prototype.disconnectedCallback = function() { stopCompactSend(this); stopPlacement(this); this._emailStatusV100?.stop(); this._simpleSummaryV95?.stop(); this._simpleTileV95?.stop(); this._optionsResizeV5?.disconnect(); return disconnect?.call(this); };
  // Reuse existing editor text fields and their focus/caret-preserving synchronization.
  const editorRender = Editor.prototype._render;
  Editor.prototype._render = function(...args) { editorRender.apply(this,args); this._renderOptionsV5(); };
  Editor.prototype._renderOptionsV5 = function() {
    const root = this.shadowRoot;
    let fields = root.querySelector('[data-energy-option-fields]');
    if (!fields) {
      fields = document.createElement('div'); fields.dataset.energyOptionFields = '';
      fields.innerHTML = `<style>label[data-option-row]{display:flex;align-items:center;gap:8px;min-height:44px}select,input[type=number],input[type=search]{min-height:44px;box-sizing:border-box;width:100%;font:inherit;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#888);border-radius:8px;padding:8px}fieldset{margin:12px 0;border:1px solid var(--divider-color,#888)}[data-option-row] input{width:24px;height:24px;min-height:24px;margin:0}select:focus-visible,input:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}[data-config-error]{color:var(--energy-value-red,#b91c1c)}</style><label data-option-label="variant" for="cf_variant"></label><select id="cf_variant" data-config="variant"><option value="" data-variant-label="legacy"></option><option value="tile" data-variant-label="tile"></option><option value="compact" data-variant-label="compact"></option><option value="full" data-variant-label="full"></option></select><label data-option-label="tap_target" for="cf_tap_target"></label><select id="cf_tap_target" data-config="tap_target"><option value="full" data-target-label="full"></option><option value="energy" data-target-label="energy"></option><option value="more-info" data-target-label="more-info"></option></select><div data-entity-chooser><label data-option-label="entity_search" for="cf_entity_search"></label><input id="cf_entity_search" type="search" data-entity-search><label data-option-label="entity" for="cf_entity"></label><select id="cf_entity" data-config="entity"></select><p data-entity-hint></p></div><label data-option-label="default_tab" for="cf_default_tab"></label><select id="cf_default_tab" data-config="default_tab">${tabs.map(id=>`<option value="${id}"></option>`).join('')}</select><fieldset><legend data-option-label="tabs"></legend>${tabs.map(id=>`<label data-option-row><input type="checkbox" data-tab-option="${id}"><span data-tab-label="${id}"></span></label>`).join('')}</fieldset>${['compact','show_help','show_support'].map(id=>`<label data-option-row><input type="checkbox" data-config="${id}"><span data-option-label="${id}"></span></label>`).join('')}<label data-option-label="chart_hours" for="cf_chart_hours"></label><input id="cf_chart_hours" type="number" min="1" max="744" step="1" data-config="chart_hours"><p data-config-error role="alert"></p>`;
      root.append(fields);
      fields.addEventListener('input', event => { if (event.target.matches('[data-entity-search]')) this._renderOptionsV5(); });
      fields.addEventListener('change', event => {
        const field = event.target;
        if (!field.matches('[data-config],[data-tab-option]')) return;
        const candidate = {...this._config};
        if (field.dataset.tabOption) candidate.tabs = [...fields.querySelectorAll('[data-tab-option]:checked')].map(node=>node.dataset.tabOption);
        else { const option = field.dataset.config; if (['chart_hours','variant','entity'].includes(option) && field.value === '') delete candidate[option]; else candidate[option] = field.type === 'checkbox' ? field.checked : option === 'chart_hours' ? Number(field.value) : field.value; }
        // An implicit default is the first visible tab; explicit defaults must remain visible.
        try { validate(candidate); if (field.dataset.tabOption && !candidate.tabs.includes(candidate.default_tab || tabs[0])) throw new Error(t(this,'The default tab must remain visible.','Domyślna zakładka musi być widoczna.')); }
        catch(error) { fields.querySelector('[data-config-error]').textContent = error.message; this._renderOptionsV5(); return; }
        fields.querySelector('[data-config-error]').textContent = '';
        this._config = candidate;
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...candidate}},bubbles:true,composed:true}));
      });
    }
    const names = {entity:t(this,'Existing entity for details','Istniejąca encja do szczegółów'),entity_search:t(this,'Find entity','Znajdź encję'),variant:t(this,'Variant','Wariant'),tap_target:t(this,'Open destination','Cel otwarcia'),default_tab:t(this,'Default tab','Domyślna zakładka'),tabs:t(this,'Visible tabs','Widoczne zakładki'),compact:t(this,'Compact view','Widok kompaktowy'),show_help:t(this,'Show help','Pokaż pomoc'),show_support:t(this,'Show project support','Pokaż wsparcie projektu'),chart_hours:t(this,'Hourly chart range (1–744 hours; empty = full range)','Zakres wykresów godzinowych (1–744 godz.; puste = cały zakres)')};
    const variants = {legacy:t(this,'Existing configuration (unchanged)','Istniejąca konfiguracja (bez zmian)'),tile:t(this,'Tile','Kafelek'),compact:t(this,'Compact','Kompaktowy'),full:t(this,'Full','Pełny')};
    fields.querySelectorAll('[data-variant-label]').forEach(node => node.textContent = variants[node.dataset.variantLabel]);
    const targets = {full:t(this,'Full card','Pełna karta'),energy:t(this,'Home Assistant Energy','Energia Home Assistant'),'more-info':t(this,'Entity details (existing entity required)','Szczegóły encji (wymagana istniejąca encja)')};
    fields.querySelectorAll('[data-target-label]').forEach(node => node.textContent = targets[node.dataset.targetLabel]);
    fields.querySelectorAll('[data-option-label]').forEach(node=>node.textContent=names[node.dataset.optionLabel]);
    // Native select: at most 200 matching existing entities, plus the selected
    // existing entity. Search finds any ID/name without rendering thousands of rows.
    const states = this._hass?.states || {}, search = fields.querySelector('[data-entity-search]');
    const query = search.value.trim().toLocaleLowerCase();
    const ids = Object.keys(states).filter(id => /^[a-z_]+\.[a-z0-9_]+$/.test(id));
    const matches = ids.filter(id => `${id} ${states[id]?.attributes?.friendly_name || ''}`.toLocaleLowerCase().includes(query)).sort().slice(0,200);
    if (states[this._config.entity] && !matches.includes(this._config.entity)) matches.unshift(this._config.entity);
    const select = fields.querySelector('[data-config="entity"]');
    const options = [[ '', t(this,'Choose an existing entity','Wybierz istniejącą encję') ],...matches.map(id => [id,`${states[id]?.attributes?.friendly_name || id} (${id})`])];
    const signature = JSON.stringify(options);
    if (select.dataset.optionsSignature !== signature) {
      select.replaceChildren(...options.map(([value,label]) => { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; }));
      select.dataset.optionsSignature = signature;
    }
    select.value = states[this._config.entity] ? this._config.entity : '';
    fields.querySelector('[data-entity-hint]').textContent = t(this,'Choose an existing entity to enable Entity details. Search shows up to 200 matches.','Wybierz istniejącą encję, aby włączyć jej szczegóły. Wyszukiwanie pokazuje do 200 wyników.');

    tabs.forEach((id,index)=>{const label=labels[pl(this)?1:0][index];fields.querySelector(`[data-tab-label="${id}"]`).textContent=label;const option=fields.querySelector(`option[value="${id}"]`);option.textContent=label;option.disabled=!visible(this._config).includes(id);fields.querySelector(`[data-tab-option="${id}"]`).checked=visible(this._config).includes(id);});
    for(const field of fields.querySelectorAll('[data-config]')) {const option=field.dataset.config;field.setAttribute('aria-label',names[option]);if(option==='compact')field.disabled=!!this._config.variant;if(field.type==='checkbox')field.checked=option==='compact'?this._config[option]===true:this._config[option]!==false;else if(option!=='entity'&&root.activeElement!==field)field.value=this._config[option]??(option==='default_tab'?visible(this._config)[0]:option==='tap_target'?'full':'');}
  };
}
// HA_ENERGY_CARD_OPTIONS_V5_END
createEnergyCardOptionsV5({ Card: HAEnergyInsights, Editor: HaEnergyInsightsEditor, name: "ha-energy-insights", title: "Energy Insights", tabs: ["overview", "daily", "weekly", "monthly", "tips"], labels: [["Overview", "Daily", "Weekly", "Monthly", "Tips"], ["Przegląd", "Dziennie", "Tygodniowo", "Miesięcznie", "Wskazówki"]] });
// Custom elements capture lifecycle callbacks when registered. Install options first.
  if (!customElements.get('ha-energy-insights')) {
    customElements.define('ha-energy-insights', HAEnergyInsights);
  }
if (!customElements.get('ha-energy-insights-editor')) { customElements.define('ha-energy-insights-editor', HaEnergyInsightsEditor); }


  window.customCards = window.customCards || [];
  if (!window.customCards.some(card => card.type === 'ha-energy-insights')) window.customCards.push({ type: 'ha-energy-insights', name: 'Energy Insights', description: 'Recorded grid import, costs and period trends', preview: false });
})();

