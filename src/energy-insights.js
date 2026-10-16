// --- Bundled card: ha-energy-insights (v3.3.0 bundle)
(function() {
  'use strict';

  // Component-local persistence retains this card's existing localStorage keys.
  const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-insights] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

  const OWN_SUPPORT_FOOTER = ENERGY_OPTIMIZER_DONATE_HTML;
  const LOCAL_BENTO_CSS = `.donate-section[data-source="own-card"]{margin:16px 20px 20px;padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);background:var(--bento-primary-light);color:var(--bento-text)}.donate-section[data-source="own-card"] .donate-text{display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px}.donate-section[data-source="own-card"] .donate-buttons{display:flex;flex-wrap:wrap;gap:8px}.donate-section[data-source="own-card"] a{color:var(--bento-primary);font-weight:700;text-decoration:none}`;

  // Component-local XSS protection: never reads from or publishes a global helper.
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"\']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
      const lang = this._hass?.language || localStorage.getItem('ha-tools-language') || 'en';
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
      // HA_TARIFF_V3_START sha256=f7925257f3e8d97e307b5d1eb6002ce2440f1c651968dc62c7c61a008c25ee2b
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
(p.zones || []).map((_, i) => `<fieldset><legend>${esc(t('Zone', 'Strefa'))} ${i + 1}</legend><div class="ht-tariff-grid">${field(`zones.${i}.id`, t('Zone ID', 'ID strefy'))}${field(`zones.${i}.label`, t('Zone label', 'Etykieta strefy'))}${field(`zones.${i}.energyRate`, t('Energy / kWh', 'Energia / kWh'), 'number')}${field(`zones.${i}.variableRate`, t('Variable fees / kWh (optional)', 'Opłaty zmienne / kWh (opcjonalne)'), 'number')}</div>${mutable() ? button(`remove-zone:${i}`, t('Remove zone', 'Usuń strefę')) : ''}</fieldset>`).join('')}${mutable() ? button('add-zone', t('Add zone', 'Dodaj strefę')) : ''}${field('defaultZone', t('Default zone (optional)', 'Strefa domyślna (opcjonalna)'), 'text', zoneChoices())}
<h3>${esc(t('Schedule rules', 'Reguły harmonogramu'))}</h3>${rows('rules')}${mutable() ? button('add-rule', t('Add rule', 'Dodaj regułę')) : ''}<h3>${esc(t('Date exceptions', 'Wyjątki dat'))}</h3>${rows('exceptions')}${mutable() ? button('add-exception', t('Add date exception', 'Dodaj wyjątek daty')) : ''}
<details><summary>${esc(t('Advanced: absolute dynamic price feed', 'Zaawansowane: bezwzględne przedziały cen dynamicznych'))}</summary><p>${esc(t('Optional dynamic feed overrides schedule prices. Use explicit UTC/offset timestamps. Only this feed uses JSON.', 'Opcjonalny feed dynamiczny zastępuje ceny harmonogramu. Użyj znaczników UTC lub z przesunięciem. JSON służy wyłącznie temu feedowi.'))}</p><label class="ht-tariff-field"><span>${esc(t('Dynamic feed JSON (empty = off)', 'Feed dynamiczny JSON (pusty = wyłączony)'))}</span><textarea data-feed="true"${mutable() ? '' : ' disabled'}>${esc(state.feedText ?? (p.dynamic == null ? '' : JSON.stringify(p.dynamic, null, 2)))}</textarea></label>${field('allowNegativeEnergy', t('Negative energy prices', 'Ujemne ceny energii'), 'text', [['false', t('Disabled', 'Wyłączone')], ['true', t('Explicitly allowed', 'Jawnie dozwolone')]])}</details>
<div role="status" aria-live="polite" data-status="${esc(state.status)}">${statusHtml()}${state.message ? ': ' + esc(localMessage()) : ''}</div><div class="ht-tariff-actions"><button type="button" data-action="load"${state.busy || guard.occupied() || !available(a) ? ' disabled' : ''}>${esc(t('Load stored tariff', 'Wczytaj zapisaną taryfę'))}</button>${a.admin ? `<button type="button" data-action="save"${state.busy || guard.occupied() || !available(a) || state.writeUnconfirmed || state.backendAvailable === false || !Number.isSafeInteger(state.revision) ? ' disabled' : ''}>${esc(t('Save tariff', 'Zapisz taryfę'))}</button><button type="button" data-action="cancel"${state.busy || guard.occupied() ? ' disabled' : ''}>${esc(t('Cancel', 'Anuluj'))}</button>` : ''}</div></section>`;
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
// Node-only import; omitted in consumer closure.


// Card-owned adapter: it never writes card YAML, helpers, schedules or SMTP.
function createTariffHostV3({ card, kind, createModel, legacyProfile, createSettings, createUi, readTimeoutMs = 15000, guard, onRefresh }) {
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const language = () => card._hass?.locale?.language || card._hass?.language || card._lang || 'en';
  const text = (en, pl) => String(language()).startsWith('pl') ? pl : en;
  guard ||= createTariffGuardV3({ getHass: () => card._hass, getContext: () => card._config, timeoutMs: readTimeoutMs });
  const identity = () => guard.snapshot();
  const same = (a, b) => a?.epoch === b?.epoch && a?.user === b?.user && a?.connection === b?.connection;
  let pending = null, attemptedEpoch = null, cachedKey, cachedModel, editorRoot, editor, focusKey = null;
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
  const purge = () => {
    card._sharedTariffProfile = null; card._sharedTariffAssociation = null;
    card._sharedTariffLoadedAt = 0; card._tariffEditorState = null;
    card._sharedTariffReadStatus = 'not_checked'; card._tariffSettingsOpen = false;
    cachedKey = undefined; cachedModel = undefined; editorRoot?.replaceChildren(); editor?.dispose?.(); editorRoot = null; editor = null; focusKey = null;
    for (const mount of card.shadowRoot?.querySelectorAll('[data-tariff-mount]') || []) mount.replaceChildren();
    const details = card.shadowRoot?.querySelector('[data-tariff-details]'); if (details) details.open = false;
    // Pending raw request remains owned by guard; a new epoch cannot free it.
  };
  guard.subscribe(purge);
  const reset = (...nextHass) => guard.observe(...nextHass);
  const load = async (force = false) => {
    const token = identity();
    if (!guard.available(token)) return false;
    if (card._sharedTariffReadStatus === 'success' && same(card._sharedTariffAssociation, token)) return true;
    if (pending) return pending;
    if (guard.occupied() || (!force && attemptedEpoch === token.epoch)) return false;
    attemptedEpoch = token.epoch;
    const operation = (async () => {
      try {
        const result = await guard.call(token, { type: 'ha_tools_email/get_tariff' });
        if (!guard.current(token)) return false;
        if (!result || !Object.hasOwn(result, 'profile') || !Number.isSafeInteger(result.revision) || result.revision < 0 ||
          !Object.hasOwn(result, 'updated_at') || (result.updated_at !== null &&
          (typeof result.updated_at !== 'string' || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result.updated_at) || !Number.isFinite(Date.parse(result.updated_at)))))
          throw new Error('invalid_tariff_response');
        const valid = result.profile === null || createModel(result.profile).valid;
        const profile = result.profile === null ? null : valid ? clone(result.profile) : { schema: 0 };
        card._sharedTariffProfile = profile; card._sharedTariffAssociation = token; card._sharedTariffLoadedAt = Date.now();
        card._sharedTariffReadStatus = 'success';
        const saved = state(), pristine = !saved.draft || JSON.stringify(saved.draft) === JSON.stringify(saved._draftBaseline) || JSON.stringify(saved.draft) === JSON.stringify(saved.profile);
        saved.profile = clone(profile); saved.revision = result.revision; saved.updated_at = result.updated_at;
        saved.backendAvailable = true;
        if (pristine) { saved.draft = valid ? clone(profile) : undefined; saved._draftBaseline = clone(saved.draft); }
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
    return { profile: clone(card._sharedTariffProfile), revision: state().revision, provenance: 'shared_backend', updated_at: state().updated_at };
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
    </style>${card._sharedTariffReadStatus === 'unconfirmed' ? `<p role="status">${text('Shared tariff could not be confirmed. Reload explicitly to confirm prices. No tariff cost is guessed.', 'Nie udało się potwierdzić wspólnej taryfy. Wczytaj ponownie, aby potwierdzić ceny. Koszt taryfy nie jest zgadywany.')}</p>` : ''}
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
        card._sharedTariffProfile = clone(envelope.profile); card._sharedTariffAssociation = identity(card._hass);
        card._sharedTariffLoadedAt = Date.now();
        card._sharedTariffReadStatus = 'success';
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
  return { model, profile: activeProfile, currency, reset, load, snapshot, markup, bind, guard, ui: () => createUi({ language: language() }) };
}
this._tariffHostController = createTariffHostV3({ card: this, kind: 'insights', createModel: createEnergyTariffV3, legacyProfile: energyTariffProfileV3, createSettings: createTariffSettingsV3, createUi: createUiV3, ...this._createTariffConsumerV3(createTariffGuardV3) });
this._installTariffConsumerV3();
// HA_TARIFF_V3_END
      return this._tariffHostController;
    }
    _tariffCurrency() { return this._sharedTariffNeedsConfirmationV3() ? '' : this._getTariffHostV3().currency(); }
    async _loadSharedTariffProfile() {
      const confirmed = await this._getTariffHostV3().load();
      if (confirmed && this._sharedTariffProfile != null) this._sharedTariffExpectedV3 = true;
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
      const assertCurrent = () => { if (!current()) throw { code: 'energy_context_changed' }; };
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
          this._activeTab = localStorage.getItem('ha-tools-energy-insights-active-tab') || 'overview';
          this._loadChartJs();
          this._fetchData();
          this._render();
          this._lastRenderTime = now;
          return;
        }

        if (previousLanguage !== this._lang && this._domBuilt) {
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

        if (previousLanguage !== this._lang && !measurementsChanged) return; // A locale gesture only reprojects cached measurements.

        // Fetch new data every 5 minutes (recorder stats don't change often)
        if (!this._lastDataFetch || (now - this._lastDataFetch) > 300000) {
          this._fetchData();
        }
      } catch (e) {
        this._renderError(e);
      }
    }

    connectedCallback() {
      if (this._tariffHostController) {
        this._tariffHostController.guard.resume();
        // Reconfirm shared prices for this mount; reuse settled measurements.
        this._observeTariffNavigationV3();
      }
      if (!this._initialMeasurementsSettledV3 && this._hass) this._fetchData();
    }

    disconnectedCallback() {
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
      if (!this._hass?.callWS || this._insightsReadPending || this._insightDevicePending || this._getTariffHostV3().guard.occupied()) return;
      const read = this._createEnergyReadV3();
      this._insightsReadPending = true;
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
        <p>${_esc(new Date(window.from).toISOString())} — ${_esc(new Date(window.to).toISOString())} · ${_esc(window.zone)}</p>
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
      return row.hour == null ? row.key : `${row.key} ${String(row.hour).padStart(2, '0')}:${String(row.minute).padStart(2, '0')} ${row.offset}`;
    }
    _insightRowDetailV3(row) {
      if (!row) return this._insightTextV3('No completed intervals in this window.', 'Brak zakończonych przedziałów w tym okresie.');
      const t = (en, pl) => this._insightTextV3(en, pl), n = value => _esc(this._insightNumberV3(value));
      return `<strong>${_esc(this._insightRowLabelV3(row))}</strong><p>${_esc(new Date(row.from).toISOString())} — ${_esc(new Date(row.to).toISOString())} UTC<br>${_esc(row.timezone)} · ${_esc(row.source.join(', '))}</p>
        <p>${t('Consumption', 'Zużycie')}: ${n(row.kwh)} kWh · ${t('Energy cost', 'Koszt energii')}: ${n(row.energyCost)} ${_esc(row.currency || '')} · ${t('Variable fees', 'Opłaty zmienne')}: ${n(row.variableCost)} ${_esc(row.currency || '')}</p>
        <p>${row.measuredHours}/${row.hours} ${t('measured hours', 'zmierzonych godzin')} · ${row.missing ? t('Partial / missing', 'Niepełne / brak') : t('Measured', 'Zmierzone')}
          ${row.missing && row.recordedKwh !== null ? ` · ${t('Measured subset', 'Zmierzona część')}: ${n(row.recordedKwh)} kWh` : ''}
          ${row.priceMissing ? ' · ' + t('Tariff coverage unavailable', 'Brak pokrycia taryfą') : ''}</p>`;
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
      const axes = [0, Math.floor((rows.length-1)/2), rows.length-1].filter((i, index, all) => i >= 0 && all.indexOf(i) === index).map(i => `<text x="${x(i)}" y="242" text-anchor="middle">${_esc(state.resolution === 'hour' ? `${rows[i].hour}:${String(rows[i].minute).padStart(2, '0')}` : rows[i].key.slice(5))}</text>`).join('');
      return `<svg data-insights-chart data-unit="${_esc(unit)}" viewBox="0 0 ${w} 262" width="100%" height="262" role="img" aria-label="${_esc(metricLabel)} · ${_esc(unit)}; ${this._insightTextV3('use point controls below for exact values', 'dokładne wartości w wyborze punktu poniżej')}"><text x="${left}" y="18">${_esc(unit)}</text>${grid}${marks}${axes}</svg>`;
    }
    _renderInsightChartV3(period) {
      this._prepareInsightChartV3(period);
      const t = (en, pl) => this._insightTextV3(en, pl), state = this._insightChartState, data = this._insightChartDataset;
      const rows = this._insightChartRowsV3(), pages = Math.max(1, Math.ceil(rows.length / 40));
      const option = (value, selected, label) => `<option value="${_esc(value)}" ${value === selected ? 'selected' : ''}>${_esc(label)}</option>`;
      const selected = rows.find(r => r.id === state.selected);
      const unit = state.metric === 'kwh' ? 'kWh' : data.currency || t('Currency unavailable', 'Brak waluty');
      return `<section class="insights-measured" data-insights-analysis aria-label="${this._t(period)}">
        <h3>${this._t(period)} · ${t('Recorded consumption', 'Zarejestrowane zużycie')}</h3>
        <p>${_esc(data.source.join(', '))} · ${_esc(data.timezone)}<br>${_esc(new Date(data.window.from).toISOString())} — ${_esc(new Date(data.window.to).toISOString())}</p>
        <div class="insights-controls">
          ${period !== 'daily' ? `<label>${t('Intervals', 'Przedziały')}<select data-insights-control="resolution">${option('day', state.resolution, t('Local dates', 'Daty lokalne'))}${option('hour', state.resolution, t('All measured hours', 'Wszystkie godziny pomiaru'))}</select></label>` : ''}
          <label>${t('Measure', 'Miara')}<select data-insights-control="metric">${option('kwh', state.metric, 'kWh')}${option('energyCost', state.metric, t('Energy cost', 'Koszt energii'))}${option('variableCost', state.metric, t('Variable fees', 'Opłaty zmienne'))}</select></label>
          <label>${t('Chart type', 'Typ wykresu')}<select data-insights-control="type">${option('bar', state.type, t('Bars', 'Słupki'))}${option('line', state.type, t('Line', 'Linia'))}</select></label></div>
        <div class="insights-controls" role="group" aria-label="${t('Presentation', 'Prezentacja')}"><button type="button" data-insights-control="chart" aria-pressed="${state.view === 'chart'}">${t('Chart', 'Wykres')}</button><button type="button" data-insights-control="data" aria-pressed="${state.view === 'data'}">${t('Data', 'Dane')}</button></div>
        ${state.view === 'chart' ? `<div data-insights-plot>${this._insightSvgV3()}</div>` : `<div data-insights-data>${rows.slice(state.page * 40, state.page * 40 + 40).map(row => `<article class="insights-data-row" data-insights-row="${_esc(row.id)}" data-value="${row[state.metric] == null ? 'null' : row[state.metric]}"><p>${_esc(this._insightNumberV3(row[state.metric]))} ${_esc(unit)}</p>${this._insightRowDetailV3(row)}</article>`).join('')}</div>${this._insightPagerV3(state.page, pages, 'previous-page', 'next-page')}`}
        <label>${t('Point details (arrows, Home / End)', 'Szczegóły punktu (strzałki, Home / End)')}<select data-insights-control="point" ${!rows.length ? 'disabled' : ''}>${rows.map(row => option(row.id, state.selected, this._insightRowLabelV3(row))).join('')}</select></label>
        <div class="insights-controls"><button type="button" data-insights-control="previous-point" ${!rows.length || state.selected === rows[0]?.id ? 'disabled' : ''}>${t('Previous point', 'Poprzedni punkt')}</button><button type="button" data-insights-control="next-point" ${!rows.length || state.selected === rows.at(-1)?.id ? 'disabled' : ''}>${t('Next point', 'Następny punkt')}</button></div>
        <div class="insights-point-detail" data-insights-detail role="status" aria-live="polite">${this._insightRowDetailV3(selected)}</div>
        <p>${t('Gaps are not zero. Only complete local days have daily totals. All original hourly intervals remain in Data; no bucket is split across local midnight. Fixed monthly charges are separate.', 'Luki nie oznaczają zera. Sumy dzienne dotyczą tylko pełnych dni lokalnych. Wszystkie oryginalne godziny są dostępne w Danych; nie dzielimy przedziałów przez lokalną północ. Opłaty stałe miesięczne są osobne.')}</p>
      </section>${this._renderInsightDevicesV3()}`;
    }
    _captureInsightFocusV3() {
      const active = this.shadowRoot.activeElement;
      if (active?.tagName === 'SUMMARY' && active.parentElement?.hasAttribute('data-insights-device-details'))
        return { detailKey: active.parentElement.dataset.insightsDeviceDetails };
      if (!active?.dataset.insightsControl) return null;
      return { key: active.dataset.insightsControl, start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection };
    }
    _restoreInsightFocusV3(focus) {
      if (!focus) return;
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
      const focus = this._captureInsightFocusV3();
      this._insightResize?.disconnect();
      this._insightRenderEpoch++;
      // Targeted DOM update — replace only panel-body content
      const body = this.shadowRoot?.querySelector('.panel-body');
      if (!body) return;
      if (this._loading) {
        body.innerHTML = this._renderLoading();
      } else if (this._error) {
        body.innerHTML = this._renderError();
      } else {
        body.innerHTML = this._renderTabContent();
      }
      this._bindTariffSettings();
      this._bindInsightContentV3();
      this._restoreInsightFocusV3(focus);
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
      this.shadowRoot.innerHTML = `
  ${this._getStyles()}
        <div class="panel-root">
          ${this._renderHeader()}
          ${this._renderTabBar()}
          <div class="panel-body">
            ${this._loading ? this._renderLoading() : ''}
            ${this._error && !this._loading ? this._renderError() : ''}
            ${!this._loading && !this._error ? this._renderTabContent() : ''}
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
      this._syncSupport();
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
          .stat-label { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
          .stat-value { font-size: 24px; font-weight: 700; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2; }
          .stat-value.highlight { color: var(--bento-primary); }
          .stat-sub { font-size: 11px; color: var(--bento-text-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .recommendation { background: var(--bento-primary-light); border: 1px solid rgba(59,130,246,.2); border-radius: var(--bento-radius-sm); padding: 14px 16px; font-size: 13px; color: var(--bento-text); margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px; }
          .recommendation-icon { font-size: 18px; flex-shrink: 0; }
          .trend-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
          .trend-up { background: var(--bento-error-light); color: var(--bento-error); }
          .trend-down { background: var(--bento-success-light); color: var(--bento-success); }
          .trend-neutral { background: rgba(158,158,158,.15); color: #9e9e9e; }
          .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
          .device-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
          .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
          .device-row:hover { background: var(--bento-primary-light); }
          .device-rank { font-size: 11px; font-weight: 700; color: var(--bento-primary); width: 24px; flex-shrink: 0; text-align: center; }
          .device-name { font-size: 13px; font-weight: 500; flex: 1; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .device-bar-wrap { width: 70px; height: 6px; background: var(--bento-border); border-radius: 4px; overflow: hidden; flex-shrink: 0; }
          .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
          .device-value { font-size: 12px; font-weight: 600; color: var(--bento-primary); flex-shrink: 0; min-width: 70px; text-align: right; }
          .chart-container { position: relative; height: 240px; margin-bottom: 12px; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; box-shadow: var(--bento-shadow-md); }
          canvas { max-width: 100%; display: block; }
          .chart-label { text-align: center; font-size: 12px; color: var(--bento-text-secondary); margin-top: 8px; }
          .tips-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 16px; }
          .tip-card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; font-size: 13px; color: var(--bento-text); box-shadow: var(--bento-shadow-md); }
          .tip-card strong { color: var(--bento-primary); display: block; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .3px; }
          .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px; gap: 16px; color: var(--bento-text-secondary); font-size: 14px; }
          .spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top-color: var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
          .error-msg { padding: 16px; background: var(--bento-error-light); border-left: 4px solid var(--bento-error); border-radius: var(--bento-radius-xs); font-size: 13px; color: var(--bento-error); }
          .no-sensors { padding: 40px 24px; text-align: center; color: var(--bento-text-secondary); font-size: 13px; }
          button { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; border-radius: var(--bento-radius-xs); transition: all .2s; cursor: pointer; border: none; padding: 8px 14px; background: var(--bento-primary); color: white; }
          button:hover { background: #2563EB; }
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
            .tab-btn { padding: 5px 8px; font-size: 11px; }
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
            ${this._t('energyInsights')}
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
          this.shadowRoot.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif;color:#b91c1c;"><strong>Energy Insights render error.</strong><br>${msg}</div>`;
        }
        return '';
      }
      return `<div class="error-msg">⚠ ${_esc(this._error || this._t('error'))}</div>`;
    }

    _renderTabContent() {
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
      const fmt = v => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'N/A';

      const trendDiff = d.thisWeekKwh !== null && d.prevWeekKwh > 0
        ? ((d.thisWeekKwh - d.prevWeekKwh) / d.prevWeekKwh * 100)
        : null;
      const trendClass = trendDiff > 5 ? 'trend-up' : trendDiff < -5 ? 'trend-down' : 'trend-neutral';
      const trendIcon = trendDiff > 5 ? '↑' : trendDiff < -5 ? '↓' : '→';
      const trendLabel = trendDiff === null ? 'N/A' : trendDiff > 0 ? `+${fmt(trendDiff)}%` : `${fmt(trendDiff)}%`;
      const rec = this._getRecommendation(trendDiff, d.todayKwh);

      let html = `
        ${d.windows?.daily ? `<p data-today-range>${_esc(d.zone || '')} · ${_esc(d.windows.daily.start)} — ${_esc(d.windows.daily.end)}</p>${energyTodayBoundaryMarkup(d.windows.daily, d.zone || '', this._lang)}` : ''}
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${this._t('today')}</div>
            <div class="stat-value highlight">${fmt(d.todayKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.todayCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisWeek')}</div>
            <div class="stat-value">${fmt(d.thisWeekKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.weekCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisMonth')}</div>
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
      const tips = [
        { title: 'Sensor Setup', key: 'sensorSetup' },
        { title: 'Cost Tracking', key: 'costTracking' },
        { title: 'Peak Hours', key: 'peakHours' },
        { title: 'Device Breakdown', key: 'deviceBreakdown' },
        { title: 'Efficient Appliances', key: 'efficientAppliances' }
      ];

      return `
        <div class="tips-grid">
          ${tips.map(tip => `
            <div class="tip-card">
              <strong>💡 ${this._t(tip.key).split('—')[0].trim()}</strong>
              <span>${this._t(tip.key).split('—').pop().trim()}</span>
            </div>
          `).join('')}
        </div>
      `;
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

  if (!customElements.get('ha-energy-insights')) {
    customElements.define('ha-energy-insights', HAEnergyInsights);
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
  if (!customElements.get('ha-energy-insights-editor')) { customElements.define('ha-energy-insights-editor', HaEnergyInsightsEditor); }


  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'ha-energy-insights', name: 'Energy Insights', description: 'Recorded grid import, costs and period trends', preview: false });
})();

