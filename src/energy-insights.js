// --- Bundled card: ha-energy-insights (v3.3.0 bundle)
(function() {
  'use strict';

  // Component-local persistence retains this card's existing localStorage keys.
  const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-insights] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

  const OWN_SUPPORT_FOOTER = ENERGY_OPTIMIZER_DONATE_HTML;
  const LOCAL_BENTO_CSS = `.donate-section[data-source="own-card"]{margin:16px 20px 20px;padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);background:var(--bento-primary-light);color:var(--bento-text)}.donate-section[data-source="own-card"] .donate-text{display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px}.donate-section[data-source="own-card"] .donate-buttons{display:flex;flex-wrap:wrap;gap:8px}.donate-section[data-source="own-card"] a{color:var(--bento-primary);font-weight:700;text-decoration:none}`;

  // Component-local XSS protection: never reads from or publishes a global helper.
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"\']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
      this._syncSupport();
    }
    _getTariffV3() {
      // HA_TARIFF_V3_START sha256=07247e2da089113db39b29cee5befd839be905af517463ae4b1b33739cf7c0de

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
const profile = energyTariffProfileV3(this._config, this._hass?.config, 'insights');
const key = JSON.stringify(profile);
if (this._tariffV3Model && this._tariffV3Key === key) return this._tariffV3Model;
this._tariffV3Key = key;
return (this._tariffV3Model = createEnergyTariffV3(profile));
// HA_TARIFF_V3_END
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
      const currency = this._config.currency || this._hass?.config?.currency || '';
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
        this._hass = hass;
        if (!hass) return;

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
          this._updateContent();
          if (this._chartJsReady) this._renderCharts();
        }
        this._syncChartTheme();
        this._syncSupport();

        // Fetch new data every 5 minutes (recorder stats don't change often)
        if (!this._lastDataFetch || (now - this._lastDataFetch) > 300000) {
          this._lastDataFetch = now;
          this._fetchData();
        }
      } catch (e) {
        this._renderError(e);
      }
    }

    connectedCallback() {
      // Cleanup on disconnect
    }

    disconnectedCallback() {
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

    _loadChartJs() {
      if (HA_ENERGY_CHART) {
        this._chartJsReady = true;
        return;
      }
      this._chartJsReady = false;
    }

    async _fetchData() {
      if (!this._hass || !this._hass.callWS) return;
      this._loading = true;
      this._error = null;
      this._data = null;
      if (this._domBuilt) this._updateLoadingState();

      try {
        const model = await readEnergyHours(this._hass, 720);
        if (model.noSensors || model.noSeries) {
          this._data = { sensors: model.ids, noSensors: model.noSensors, noSeries: model.noSeries };
        } else {
          const rate = (_hour, _weekday, stamp) => this._tariffRateForHour(stamp);
          rate.currency = this._config.currency;
          const today = model.summary(model.todayStart, model.end, rate);
          if (!today.complete) throw new Error('Incomplete Energy Dashboard hourly coverage');
          const week = model.summary(model.end - 168 * ENERGY_HOUR, model.end, rate);
          const previous = model.summary(model.end - 336 * ENERGY_HOUR, model.end - 168 * ENERGY_HOUR, rate);
          const month = model.summary(model.start, model.end, rate);
          const weekDays = model.daily(model.end - 168 * ENERGY_HOUR, model.end, rate);
          const monthDays = model.daily(model.start, model.end, rate);
          this._data = { sensors: model.ids, noSensors: false, topDevices: [],
            todayKwh: today.total, todayCost: today.cost, thisWeekKwh: week.total, prevWeekKwh: previous.total,
            monthKwh: month.total, weekCost: week.cost, monthCost: month.cost,
            dailyCosts: model.hourlyToday.map((kwh, hour) => {
              const point = [...model.points.values()].find(p => p.key === model.points.get(model.todayStart)?.key && p.hour === hour);
              const price = point ? rate(hour, point.weekday) : null;
              return kwh !== null && price !== null && (rate.currency || this._hass.config?.currency) ? kwh * price : null;
            }),
            dailyData: model.hourlyToday, weeklyData: weekDays.map(day => day.total), monthlyData: monthDays.map(day => day.total),
            weekLabels: weekDays.map(day => day.key), monthLabels: monthDays.map(day => day.key),
            weeklyCosts: weekDays.map(day => day.cost), monthlyCosts: monthDays.map(day => day.cost),
            windows: { daily: today, weekly: week, monthly: month }, zone: model.zone };
        }

        this._loading = false;
        this._updateContent();
        if (this._chartJsReady) this._renderCharts();
      } catch (err) {
        console.error('[ha-energy-insights]', err);
        this._error = err.message || this._t('error');
        this._loading = false;
        this._updateContent();
      }
    }

    _getRecommendation(trendDiff, todayKwh) {
      return this._lang === 'pl' ? 'Pokazano wyłącznie zarejestrowany import z sieci; bez pomiaru urządzeń nie można przypisać zużycia konkretnym odbiornikom.' : 'Only recorded grid import is shown; without device measurements, usage cannot be attributed to appliances.';
    }

    // ===== RENDERING =====

    _updateLoadingState() {
      const body = this.shadowRoot?.querySelector('.panel-body');
      if (!body) return;
      if (this._loading) {
        body.innerHTML = this._renderLoading();
      }
    }

    _updateContent() {
      if (!this._domBuilt) {
        this._render();
        return;
      }
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
          ${this._renderToolsBanner()}
          ${OWN_SUPPORT_FOOTER}
        </div>
      `
      this._domBuilt = true;
      this._bindEvents();
      this._syncSupport();
    }

    _getStyles() {
      return `
        <style>${LOCAL_BENTO_CSS}

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
          .stat-sub { font-size: 11px; color: var(--bento-text-muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
      if (!this._data) return '';

      if (this._data.noSensors) {
        return `<div class="no-sensors">${this._t('noSensors')} <a href="/energy">Energy Dashboard</a></div>`;
      }
      if (this._data.noSeries) {
        return `<div class="no-sensors" role="status">${this._t('noSeries')}</div>`;
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
      const cur = this._config.currency || this._hass?.config?.currency || '';
      const fmt = v => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'N/A';

      const trendDiff = d.thisWeekKwh !== null && d.prevWeekKwh > 0
        ? ((d.thisWeekKwh - d.prevWeekKwh) / d.prevWeekKwh * 100)
        : null;
      const trendClass = trendDiff > 5 ? 'trend-up' : trendDiff < -5 ? 'trend-down' : 'trend-neutral';
      const trendIcon = trendDiff > 5 ? '↑' : trendDiff < -5 ? '↓' : '→';
      const trendLabel = trendDiff === null ? 'N/A' : trendDiff > 0 ? `+${fmt(trendDiff)}%` : `${fmt(trendDiff)}%`;
      const rec = this._getRecommendation(trendDiff, d.todayKwh);

      let html = `
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

      if (d.topDevices && d.topDevices.length > 0) {
        const maxKwh = d.topDevices[0].kwh || 1;
        html += `<div class="section-title">${this._t('topDevices')}</div><div class="device-list">`;
        d.topDevices.forEach((dev, i) => {
          const pct = Math.round((dev.kwh / maxKwh) * 100);
          const valStr = dev.uom === 'W'
            ? `${dev.rawVal.toFixed(0)} W`
            : `${dev.kwh.toFixed(2)} kWh`;
          html += `
            <div class="device-row">
              <div class="device-rank">#${i + 1}</div>
              <div class="device-name" title="${_esc(dev.entity_id)}">${_esc(dev.name)}</div>
              <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
              <div class="device-value">${valStr}</div>
            </div>
          `;
        });
        html += `</div>`;
      }

      return html;
    }

    _renderChartTab(period) {
      const labels = {
        daily: 'hourlyConsumption',
        weekly: 'dailyConsumption',
        monthly: 'monthlyConsumption'
      };
      return `
        <div class="section-title">${this._t(labels[period] || 'overview')}</div>
        <div class="chart-container">
          ${this._chartJsReady ? `<canvas id="chart-${period}"></canvas>` : '<div class="chart-unavailable" role="status">Chart unavailable — numeric analysis remains available.</div>'}
        </div>
        <div class="chart-label">${_esc(this._data?.windows?.[period]?.start || '')} — ${_esc(this._data?.windows?.[period]?.end || '')} • ${_esc(this._data?.zone || '')}</div>
        <div class="chart-label">kWh • ${_esc(this._getTariffLabel())}</div>
      `;
    }

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

    _renderCharts() {
      if (!HA_ENERGY_CHART || !this._data) return;

      const chartDefs = {
        daily:   { data: this._data.dailyData,   labels: this._buildHourLabels(24) },
        weekly:  { data: this._data.weeklyData,   labels: this._data.weekLabels },
        monthly: { data: this._data.monthlyData,  labels: this._data.monthLabels }
      };

      if (this._activeTab in chartDefs) {
        const def = chartDefs[this._activeTab];
        const canvasId = `chart-${this._activeTab}`;
        const canvas = this.shadowRoot.getElementById(canvasId);
        if (!canvas) return;

        if (this._charts[this._activeTab]) {
          try { this._charts[this._activeTab].destroy(); } catch(e) { console.debug('[ha-energy-insights] caught:', e); }
        }

        const primaryColor = getComputedStyle(this).getPropertyValue('--bento-primary').trim() || '#4A90D9';
        const theme = this._chartThemeColors();

        this._charts[this._activeTab] = new HA_ENERGY_CHART(canvas, {
          type: 'bar',
          data: {
            labels: def.labels,
            datasets: [{
              label: 'kWh',
              data: def.data,
              backgroundColor: primaryColor + '80',
              borderColor: primaryColor,
              borderWidth: 1.5,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const kwh = ctx.raw;
                    if (typeof kwh !== 'number') return 'N/A';
                    const cost = this._data[`${this._activeTab}Costs`]?.[ctx.dataIndex];
                    return ` ${kwh.toFixed(2)} kWh (${typeof cost === 'number' ? cost.toFixed(2) : 'N/A'} ${this._config.currency || this._hass?.config?.currency || ''})`;
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { color: theme.text, font: { size: 11 }, maxRotation: 45 },
                grid: { color: 'transparent' }
              },
              y: {
                ticks: { color: theme.text, font: { size: 11 } },
                grid: { color: theme.grid },
                beginAtZero: true
              }
            }
          }
        });
      }
    }

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
        <h3>Energy Insights</h3>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
                <input type="text" id="cf_title" value="${_esc(this._config?.title || 'Energy Insights')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency || this._hass?.config?.currency || '')}"
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
    }
    connectedCallback() { this._render(); }
  }
  if (!customElements.get('ha-energy-insights-editor')) { customElements.define('ha-energy-insights-editor', HaEnergyInsightsEditor); }


  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'ha-energy-insights', name: 'Energy Insights', description: 'Recorded grid import, costs and period trends', preview: false });
})();

