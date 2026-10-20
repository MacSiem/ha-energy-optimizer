// HA Energy Optimizer Bundle v4.0.0
// HTML escape helper — wrap any user-derived string before interpolation into innerHTML.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

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
  // Build1 R12 display roles. The ordinary number() remains exact for Data/history.
  const reportNumber=(value,places=1,signed=false)=>{
    if (typeof value==='boolean' || value===null || !['string','number'].includes(typeof value) || typeof value==='string'&&!value.trim() || !Number.isInteger(places) || places<0 || places>6) return null;
    const parsed=Number(value);if(!Number.isFinite(parsed))return null;
    const normalized=Number(parsed.toFixed(6)),n=Object.is(normalized,-0)?0:normalized;
    const text=new Intl.NumberFormat(language,{minimumFractionDigits:places,maximumFractionDigits:places,roundingMode:'halfExpand',useGrouping:'always'}).format(Math.abs(n));
    const zero=new Intl.NumberFormat(language,{minimumFractionDigits:places,maximumFractionDigits:places,useGrouping:'always'}).format(0);
    return (text===zero?signed?'±':'':n<0?'−':signed?'+':'')+text;
  };
  const reportUnknown=()=>String(language).startsWith('pl')?'Brak danych':'No data';
  const reportEnergy=(value,{role='tile',period='day'}={})=>{const n=reportNumber(value,role==='table'&&period==='day'?2:1);return n===null?reportUnknown():n+' kWh';};
  const reportMoney=(value,currency)=>{const n=reportNumber(value,2),unit=String(language).startsWith('pl')&&currency==='PLN'?'zł':currency;return n===null||typeof unit!=='string'||!unit?reportUnknown():n+' '+unit;};
  const reportRate=(value,currency)=>{const n=reportMoney(value,currency);return n===reportUnknown()?n:n+'/kWh';};
  const reportPercent=(value,{role='share'}={})=>{const n=reportNumber(value,role==='change'?1:0,role==='change');return n===null?reportUnknown():n+'%';};
  const reportPlural=(value,forms)=>{const n=Math.abs(Number(value)),key=String(language).startsWith('pl')&&Number.isFinite(n)&&!Number.isInteger(n)?'few':plurals.select(n);return forms[key]||forms.other||forms.many;};
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
  return {reportNumber, reportEnergy, reportMoney, reportRate, reportPercent, reportPlural, language, dateLanguage, clockLanguage, hourCycle, timeZone, key, clock, date, calendarDate, pointLabel, chartLabels, chartTicks, number:(value, options)=>options ? new Intl.NumberFormat(language, options).format(value) : (typeof value === 'string' ? decimals : numbers).format(value), count, dateTime, range, periodMarkup, capturePeriods, restorePeriods};
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

// Card-owned support footer; never mutate sibling cards or the document.
const ENERGY_OPTIMIZER_DONATE_HTML = `<div class="donate-section" data-source="own-card" style="margin:8px 0 0;padding:4px 0;background:none;border:0;box-shadow:none;min-height:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-direction:row;justify-content:flex-start;text-align:left"><a href="https://buymeacoffee.com/macsiem" target="_blank" rel="noopener noreferrer" style="font-size:12px;color:var(--secondary-text-color,#64748b);font-weight:400;text-decoration:underline">Optional support for HA Tools</a><button type="button" class="support-dismiss" aria-label="Dismiss support link" style="margin-left:auto;padding:2px 6px;min-height:0;line-height:1;border:0;background:none;color:var(--secondary-text-color,#64748b);cursor:pointer">×</button></div>`;
const energySupportDismissed = key => { try { return localStorage.getItem(key + '-support-dismissed') === '1'; } catch (_) { return false; } };
const localizeEnergySupport = (root, language) => {
  const footer = root.querySelector('.donate-section[data-source="own-card"]');
  const link = footer?.querySelector('a');
  const dismiss = footer?.querySelector('.support-dismiss');
  const polish = language?.split('-')[0] === 'pl';
  if (link) link.textContent = polish ? 'Opcjonalne wsparcie dla HA Tools' : 'Optional support for HA Tools';
  if (dismiss) dismiss.setAttribute('aria-label', polish ? 'Ukryj link wsparcia' : 'Dismiss support link');
};
const bindEnergySupport = (root, key, language) => {
  localizeEnergySupport(root, language);
  root.querySelector('.support-dismiss')?.addEventListener('click', () => { try { localStorage.setItem(key + '-support-dismissed', '1'); } catch (_) {} root.querySelector('.donate-section[data-source="own-card"]')?.remove(); });
};

// Recorder WS uses milliseconds; older captures may use seconds or ISO strings.
const energyTimestamp = value => typeof value === 'number' ? (value > 1e11 ? value : value * 1000) : typeof value === 'string' ? Date.parse(value) : NaN;
const energyFactor = unit => { const factors = { Wh: 0.001, kWh: 1, MWh: 1000 }; return Object.hasOwn(factors, unit) ? factors[unit] : undefined; };
const energyImportIds = prefs => [...new Set((prefs?.energy_sources || [])
  .filter(source => source?.type === 'grid')
  .flatMap(source => source.stat_energy_from ? [source.stat_energy_from] : (source.flow_from || []).map(flow => flow?.stat_energy_from).filter(Boolean)))];
const ENERGY_HOUR = 3600000;

async function readEnergyHours(hass, hours) {
  const ids = energyImportIds(await hass.callWS({ type: 'energy/get_prefs' }));
  if (!ids.length) return { ids, noSensors: true };
  const raw = await hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: ids });
  const metadata = Array.isArray(raw) ? Object.fromEntries(raw.map(row => [row.statistic_id, row])) : raw || {};
  const factors = {};
  for (const id of ids) {
    const row = metadata[id];
    factors[id] = energyFactor(row?.statistics_unit_of_measurement ?? row?.unit_of_measurement);
    if (row?.has_sum !== true || !factors[id] || (row.unit_class && row.unit_class !== 'energy')) throw new Error('Unsupported Energy Dashboard statistic metadata');
  }
  const now = new Date();
  const end = Math.floor(now.getTime() / ENERGY_HOUR) * ENERGY_HOUR;
  const start = end - hours * ENERGY_HOUR;
  const stats = await hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(), statistic_ids: ids, period: 'hour', types: ['change'] });
  if (ids.some(id => !Array.isArray(stats?.[id]) || !stats[id].length)) return { ids, noSeries: true };
  const sources = ids.map(id => {
    const buckets = new Map();
    for (const point of stats[id]) {
      const stamp = energyTimestamp(point?.start);
      if (!Number.isFinite(stamp) || stamp % ENERGY_HOUR !== 0 || typeof point.change !== 'number' || !Number.isFinite(point.change) || point.change < 0) throw new Error('Invalid or incomplete Energy Dashboard statistic bucket');
      if (stamp < start || stamp >= end) continue;
      if (buckets.has(stamp)) throw new Error('Duplicate Energy Dashboard statistic bucket');
      buckets.set(stamp, point.change * factors[id]);
    }
    return buckets;
  });
  const zone = hass.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const local = stamp => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
    return { key: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  };
  const points = new Map();
  for (let stamp = start; stamp < end; stamp += ENERGY_HOUR) {
    points.set(stamp, { ...local(stamp), kwh: sources.every(source => source.has(stamp)) ? sources.reduce((sum, source) => sum + source.get(stamp), 0) : null });
  }
  const today = local(now.getTime()).key;
  const todayStamps = [...points].filter(([, point]) => point.key === today).map(([stamp]) => stamp);
  const todayStart = todayStamps[0] ?? end;
  const summary = (from, to, rate) => {
    const selected = [...points].filter(([stamp]) => stamp >= from && stamp < to);
    const complete = selected.length > 0 && selected.length === (to - from) / ENERGY_HOUR && selected.every(([, point]) => point.kwh !== null);
    let cost = complete && rate && (hass.config?.currency) ? 0 : null;
    // A caller may provide an explicit currency when HA has none.
    if (complete && rate?.currency) cost = 0;
    for (const [stamp, point] of selected) {
      const price = rate?.(point.hour, point.weekday, stamp, point.kwh);
      if (price === null || price === undefined || point.kwh === null) cost = null;
      else if (cost !== null) cost += point.kwh * price;
    }
    return { total: complete ? selected.reduce((sum, [, point]) => sum + point.kwh, 0) : null, cost,
      start: new Date(from).toISOString(), end: new Date(to).toISOString(), selected, complete };
  };
  const daily = (from, to, rate) => {
    const groups = new Map();
    for (const [stamp, point] of points) {
      if (stamp < from || stamp >= to) continue;
      if (!groups.has(point.key)) groups.set(point.key, []);
      groups.get(point.key).push(stamp);
    }
    return [...groups].map(([key, stamps]) => ({ key, ...summary(stamps[0], stamps.at(-1) + ENERGY_HOUR, rate) }));
  };
  // A local midnight can fall inside an absolute UTC-hour aggregate. Do not
  // apportion that bucket or call the measurable remainder a complete civil day.
  const todaySummary = rate => {
    const measured = summary(todayStart, end, rate);
    const boundaryComplete = local(todayStart).key === today && local(todayStart - 1).key !== today;
    return { ...measured, intervalsComplete: measured.complete, boundaryComplete,
      complete: measured.complete && boundaryComplete, recordedKwh: measured.total,
      total: boundaryComplete ? measured.total : null, cost: boundaryComplete ? measured.cost : null };
  };
  const hourlyToday = new Array(24).fill(null);
  const counts = new Array(24).fill(0);
  for (let hour = 0; hour < 24; hour++) {
    const rows = todayStamps.map(stamp => points.get(stamp)).filter(point => point.hour === hour);
    if (rows.length && rows.every(point => point.kwh !== null)) { hourlyToday[hour] = rows.reduce((sum, point) => sum + point.kwh, 0); counts[hour] = rows.length; }
  }
  return { ids, zone, start, end, todayStart, points, summary, today: todaySummary, daily, hourlyToday, counts };
}

const energyTodayBoundaryMarkup = (today, zone, language = 'en') => {
  if (today?.boundaryComplete !== false) return '';
  const pl = language.split('-')[0] === 'pl';
  const format = createFormatUi(language, zone);
  const subset = typeof today.recordedKwh === 'number' && Number.isFinite(today.recordedKwh) ? format.number(today.recordedKwh, {maximumSignificantDigits:12, useGrouping:false}) + ' kWh' : (pl ? 'niedostępna' : 'unavailable');
  return `<p data-today-boundary role="status">${pl ? 'Niepełne pokrycie od lokalnej północy: granica dnia przecina godzinowy przedział Recorder. Suma dnia i koszt są niedostępne; nie dzielimy pomiaru.' : 'Incomplete coverage from local midnight: the day boundary crosses an hourly Recorder interval. The day total and cost are unavailable; the measurement is not divided.'}<br>
    ${_esc(zone)} · ${_esc(format.range(today.start, today.end) || '')}<br>${pl ? 'Zmierzona część' : 'Measured subset'}: ${_esc(subset)}</p>`;
};

// Pure measured Patterns projection. No globals, WS calls or synthetic flows.
// Each hour is keyed by its absolute Recorder start, including repeated DST hours.
const createEnergyPatternsV3 = (model, tariff, { days = 7 } = {}) => {
  const requestedDays = days === 30 ? 30 : 7;
  const zone = model?.zone || 'UTC';
  const source = [...(model?.ids || [])];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short', timeZoneName: 'longOffset' });
  const local = stamp => {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(stamp)).map(p => [p.type, p.value]));
    return { key: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), minute: Number(parts.minute), offset: parts.timeZoneName,
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday) };
  };
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const hours = [];
  if (model?.points && finite(model.start) && finite(model.end)) {
    for (let stamp = model.start; stamp < model.end; stamp += ENERGY_HOUR) {
      const point = model.points.get(stamp);
      const kwh = finite(point?.kwh) && point.kwh >= 0 ? point.kwh : null;
      hours.push({ id: String(stamp), from: stamp, to: stamp + ENERGY_HOUR, ...local(stamp), kwh,
        unit: 'kWh', timezone: zone, source, missing: kwh === null });
    }
  }
  const keys = [...new Set(hours.map(r => r.key))].slice(-requestedDays);
  const included = new Set(keys);
  const selected = hours.filter(r => included.has(r.key));
  // The canonical tariff model rejects mixed-rate buckets; never split or interpolate them here.
  const prices = tariff.priceBuckets(selected.map(r => ({ from: r.from, to: r.to, kwh: r.kwh })),
    selected.length ? { from: selected[0].from, to: selected.at(-1).to } : undefined);
  const priced = new Map(prices.rows.map(r => [r.from, r]));
  for (const row of selected) {
    const price = priced.get(row.from);
    row.currency = prices.currency;
    row.tariffTimezone = prices.timezone;
    row.priceBasis = prices.priceBasis;
    row.priceMissing = price?.available ? null : price?.reason || 'missing_rate';
    row.tariffZone = price?.zone ?? null;
    row.tariffZones = price?.zones ?? [];
    row.tariffZoneAttribution = price?.zoneAttribution ?? null;
    row.variableMissing = !price?.available || !finite(price.variableCost);
    for (const field of ['energyCost', 'variableCost', 'usageCost'])
      row[field] = price?.available && finite(price[field]) ? (price[field] === 0 ? 0 : price[field]) : null;
  }
  const groups = keys.map(key => {
    const rows = selected.filter(r => r.key === key);
    // Coverage is a full local day, not a presumed 24 hours. Partial first/today dates stay partial.
    const finish = local(rows.at(-1).to);
    const complete = rows[0].hour === 0 && rows[0].minute === 0 && local(rows[0].from - ENERGY_HOUR).key !== key &&
      finish.key !== key && finish.hour === 0 && finish.minute === 0 && rows.every(r => !r.missing);
    const sum = field => {
      if (!complete || !rows.every(r => finite(r[field]))) return null;
      const total = rows.reduce((n, r) => n + r[field], 0);
      return finite(total) ? total : null;
    };
    return { id: key, key, from: rows[0].from, to: rows.at(-1).to, weekday: rows[0].weekday,
      kwh: sum('kwh'), energyCost: sum('energyCost'), variableCost: sum('variableCost'), usageCost: sum('usageCost'),
      unit: 'kWh', currency: prices.currency, timezone: zone, source, complete, missing: !complete,
      measuredHours: rows.filter(r => !r.missing).length, hours: rows.length,
      priceMissing: rows.find(r => r.priceMissing)?.priceMissing || null,
      variableMissing: !complete || rows.some(r => r.variableMissing) };
  });
  const weekdays = Array.from({ length: 7 }, (_, weekday) => {
    const rows = groups.filter(r => r.weekday === weekday && r.complete && finite(r.kwh));
    return { weekday, count: rows.length, kwh: rows.length ? rows.reduce((n, r) => n + r.kwh / rows.length, 0) : null };
  });
  return { hours: selected, days: groups, weekdays, requestedDays, availableDays: keys.length, partialWindow: keys.length < requestedDays || groups.some(r => !r.complete),
    timezone: zone, source, currency: prices.currency, priceBasis: prices.priceBasis, tariffTimezone: prices.timezone,
    fixedMonthly: prices.fixedMonthly, from: selected[0]?.from ?? null, to: selected.at(-1)?.to ?? null };
};

class HaEnergyOptimizer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._timers = new Set();
    this._firstHassRender = false;
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this._hass = null;
    // Default config so the card works in panel/sidebar mode where setConfig() is never called.
    this._config = { title: 'Energy Optimizer' };
    this._currentTab = 'dashboard';
    this._energyData = [];
    this._hourlyBucketCounts = [];
    this._weeklyData = [];
    this._recommendations = [];
    this._comparisonData = null;
    // --- Real data fields ---
    this._hasRealData = false;
    this._currentPowerW = null;
    this._statsLoading = false;
    this._lastStatsFetch = 0;
    this._energySensorIds = [];
    this._energyError = null;
    this._charts = {};
    this._chartJsLoaded = false;
    // Initialize data structures so panel/sidebar mode (no setConfig) renders without crashing.
    this._generateRecommendations();
    this._generateComparisonData();
  }

  _analysisIsActiveV53() {return true;}
  _getAnalysisHostV53() { return this._analysisHostV53 ||= this._getTariffHostV3().analysis(); }
  _analysisLegacyAllowedV53() { return this._getAnalysisHostV53().legacyAllowed(); }
  _syncAnalysisV53() {
    const host=this._getAnalysisHostV53();
    const mount=this.shadowRoot?.querySelector('[data-analysis-mount-v53]');
    host.mount(mount, mount?.dataset.analysisSection || 'overview');
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
    if (this._initialMeasurementsStartedV3 && !this._initialMeasurementsSettledV3 && this._hass) this._fetchEnergyStats();
  }

  disconnectedCallback() {
    this._analysisHostV53?.stop();
    this._tariffHostController?.guard.suspend();
    this._timers.forEach(timer => clearTimeout(timer));
    this._timers.clear();
    this._renderScheduled = false;
    this._destroyAllCharts();
    this._patternsResize?.disconnect();
  }

  _schedule(callback, delay) {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (this.isConnected) callback();
    }, delay);
    this._timers.add(timer);
    return timer;
  }

  static getConfigElement() { return document.createElement('ha-energy-optimizer-editor'); }
  static getStubConfig() {
    return {
      type: 'custom:ha-energy-optimizer',
      title: 'Energy Optimizer',
      peak_hours: { start: 6, end: 22 }
    };
  }

  setConfig(config) {
    this._config = config || { title: 'Energy Optimizer' };
    this._observeTariffContextV3();
    this._generateRecommendations();
    this._generateComparisonData();
    if (this._hass) this._render();
  }

  _presentationStateHashV85() {
    const states = this._hass?.states || {};
    const power = this._config.power_entity && Object.hasOwn(states, this._config.power_entity)
      ? states[this._config.power_entity] : null;
    const choices = Object.entries(states)
      .filter(([id,state]) => id.startsWith('sensor.') && ['W','kW'].includes(state?.attributes?.unit_of_measurement))
      .map(([id,state]) => [id,state.attributes.unit_of_measurement,state.attributes.friendly_name ?? null])
      .sort((a,b) => a[0].localeCompare(b[0]));
    return JSON.stringify([Object.keys(states).length, states['sun.sun']?.state ?? '',
      this._config.power_entity ?? null, power?.state ?? null, power?.attributes?.unit_of_measurement ?? null, choices]);
  }

  set hass(hass) {
    try {
      var _bg = (getComputedStyle(this).getPropertyValue('--card-background-color') || getComputedStyle(this).getPropertyValue('--primary-background-color') || '').trim();
      var _d = false;
      if (_bg) {
        var _h, _r, _g, _b, _m;
        if (_bg.charAt(0) === '#') { _h = _bg.slice(1); if (_h.length === 3) _h = _h.replace(/(.)/g, '$1$1'); _r = parseInt(_h.slice(0,2),16); _g = parseInt(_h.slice(2,4),16); _b = parseInt(_h.slice(4,6),16); }
        else { _m = _bg.match(/[\d.]+/g); if (_m) { _r = +_m[0]; _g = +_m[1]; _b = +_m[2]; } }
        if (_r != null) _d = (0.2126*_r + 0.7152*_g + 0.0722*_b) / 255 < 0.5;
      } else if (hass && hass.themes) { _d = !!hass.themes.darkMode; }
      this.classList.toggle('bento-dark', _d);
    } catch (e) {}
    const previousHass = this._hass;
    const presentationKey = createFormatUi.forHass(hass).key;
    const presentationChanged = this._presentationKeyV4 !== undefined && this._presentationKeyV4 !== presentationKey;
    this._presentationKeyV4 = presentationKey;
    const measurementBinding = { present: !!hass, connection: hass?.connection ?? null,
        user: hass?.user?.id ?? null, zone: hass?.config?.time_zone ?? null };
      const previousBinding = this._measurementBindingV3;
      const measurementsChanged = !!previousBinding && Object.keys(measurementBinding).some(key => previousBinding[key] !== measurementBinding[key]);
      this._measurementBindingV3 = measurementBinding;
    if (measurementsChanged) {
      this._currentPowerW = null;
      this._powerSetupOpenV4 = false;
      this._powerSetupEntityV4 = null;
      this._energyModel = null;
      this._patternsDataset = null;
      this._patternsState = null;
      this._dashboardStateV3 = null;
      this._hasRealData = false;
      this._todayWindow = null;
      this._energyData = [];
      this._weeklyData = [];
      this._recommendations = [];
      this._comparisonData = null;
      this._lastStatsFetch = 0;
      // A new session must not keep old measured rows visible during throttling.
      this._lastRenderTime = 0;
    }
    this._resetTariffContext(hass);
    this._hass = hass;
      this._analysisHostV53?.observe();
    if (!hass) { if (previousHass) this._render(); return; }
    if (!measurementsChanged && previousHass && previousHass.connection === hass.connection && previousHass.user?.id === hass.user?.id &&
        previousHass.config?.time_zone === hass.config?.time_zone &&
        (presentationChanged || (previousHass.locale?.language || previousHass.language) !== (hass.locale?.language || hass.language))) {
      this._updateEnergyData(false);
      this._render();
      return;
    }
    try {
      const now = Date.now();
      if (!this._firstHassRender) {
        this._firstHassRender = true;
        this._updateEnergyData();
        this._fetchEnergyStats();
        this._render();
        this._lastRenderTime = now;
        return;
      }
      if (now - (this._lastRenderTime || 0) < 10000) {
        if (!this._renderScheduled) {
          this._renderScheduled = true;
          this._schedule(() => {
            this._renderScheduled = false;
            try {
              const newHash = this._presentationStateHashV85();
              if (newHash === this._lastStateHash) return;
              this._lastStateHash = newHash;
              this._updateEnergyData();
              this._render();
              this._lastRenderTime = Date.now();
            } catch (e) { this._renderError(e); }
          }, 5000 - (now - (this._lastRenderTime || 0)));
        }
        return;
      }
      const stateHash = this._presentationStateHashV85();
      if (stateHash === this._lastStateHash && this._currentTab === 'dashboard' &&
          this._analysisHostV53?.state().status === 'ready' &&
          this.shadowRoot.querySelector('.energy-analysis-v53') && !this._analysisHostV53.legacyAllowed()) return;
      this._lastStateHash = stateHash;
      this._updateEnergyData();
      this._render();
      this._lastRenderTime = now;
    } catch (e) {
      this._renderError(e);
    }
  }

  _renderError(e) {
    console.error('[ha-energy-optimizer] render error:', e);
    const msg = (e && e.message) ? e.message : String(e);
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML =
        '<div style="padding:16px;font-family:system-ui,sans-serif;color:#b91c1c;">' +
        '<strong>Energy Optimizer — render error.</strong><br>' +
        msg.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) +
        '</div>';
    }
  }

  async _fetchEnergyStats() {
    if(!this._analysisLegacyAllowedV53())return;
    if (!this._hass || !this._hass.callWS) return;
    if (this._statsLoading) return;
    this._statsLoading = true;
    this._initialMeasurementsStartedV3 = true;
    // Only a dispatched read may spend this context's refresh window.
    this._lastStatsFetch = Date.now();
    const read = this._createEnergyReadV3();
    const currentContext = read.current;
    this._energyError = null;
    try {
      const model = await readEnergyHours(read.hass, 24 * 31);
      if (!currentContext()) return;
      await this._loadSharedTariffProfile();
      if (!currentContext()) return;
      if (model.noSensors || model.noSeries) throw new Error(model.noSeries ? 'Missing Energy Dashboard statistic series' : 'No Energy Dashboard grid import source');
      const today = model.today();
      this._energyModel = model; // Patterns can expose measured rows without claiming a complete daily total.
      this._todayWindow = today;
      this._energySensorIds = model.ids;
      if (!today.intervalsComplete) throw new Error('Incomplete Energy Dashboard hourly coverage');
      this._hourlyBucketCounts = model.counts;
      this._energyData = model.hourlyToday;
      const days = model.daily(model.start, model.end).slice(-7);
      this._dayKeys = days.map(day => day.key);
      this._weeklyData = days.map(day => {
        const values = new Array(24).fill(null);
        for (const [, point] of day.selected) {
          if (point.kwh !== null) values[point.hour] = (values[point.hour] ?? 0) + point.kwh;
        }
        return values;
      });
      this._dailyTotals = days.map(day => day.total);
      this._hasRealData = true;
      this._generateRecommendations();
      this._generateComparisonData();
    } catch (err) {
      if (!currentContext()) return;
      this._energyError = err;
      this._hasRealData = false;
      this._energyData = [];
      this._hourlyBucketCounts = [];
      this._weeklyData = [];
      this._recommendations = [];
      this._comparisonData = null;
      if (!String(err?.message).includes('Incomplete Energy Dashboard hourly coverage')) {
        this._energyModel = null;
        this._todayWindow = null;
      }
      this._dailyTotals = [];
      console.warn('Energy Optimizer: Energy statistics unavailable');
    } finally {
      this._statsLoading = false;
      // Later refreshes remain eligible for the next normal hass update.
      // Only unfinished first loads resume after the raw wire has settled.
      if (currentContext()) this._initialMeasurementsSettledV3 = true;
      else {
        this._lastStatsFetch = 0;
        // Finish an interrupted first load after its old wire settles, even
        // when the last hass update arrived while that wire was occupied.
        if (!this._initialMeasurementsSettledV3) queueMicrotask(() => {
          const guard = this._getTariffHostV3().guard;
          if (this.isConnected && guard.available(guard.observe())) this._fetchEnergyStats();
        });
      }
      if (this.isConnected) this._render();
    }
  }

  _updateEnergyData(refreshStats = true) {
    if (!this._hass) return;
    const configured = this._config.power_entity && Object.hasOwn(this._hass.states || {}, this._config.power_entity) ? this._hass.states[this._config.power_entity] : null;
    const unit = configured?.attributes?.unit_of_measurement;
    const value = configured && typeof configured.state === 'string' && configured.state.trim() !== '' ? Number(configured.state) : NaN;
    this._currentPowerW = Number.isFinite(value) && (unit === 'W' || unit === 'kW') ? value * (unit === 'kW' ? 1000 : 1) : null;

    // Fetch stats every 5 minutes (not on every hass update)
    const now = Date.now();
    if (refreshStats && (!this._lastStatsFetch || (now - this._lastStatsFetch) > 300000)) {
      this._fetchEnergyStats();
    }
  }

  _getTariffV3(proposed) {
    const host = this._getTariffHostV3();
    return arguments.length ? host.model(proposed) : this._sharedTariffNeedsConfirmationV3() ? host.model({ schema: 0 }) : host.model();
  }
  _getTariffHostV3() {
    if (this._tariffHostController) return this._tariffHostController;
    // HA_TARIFF_V3_START sha256=4d83bbba36d21503c91f09273ab39ec5cacb1b316b2de814d95b34a4f6a0613c
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
  const parseColor = value => {
    const text = typeof value === 'string' ? value.trim() : '';
    const hex = /^#([a-f0-9]{3}|[a-f0-9]{6})$/i.exec(text);
    if (hex) return (hex[1].length === 3 ? [...hex[1]].map(c=>c+c).join('') : hex[1]).match(/../g).map(c=>parseInt(c,16));
    const rgb = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*1(?:\.0+)?)?\s*\)$/i.exec(text);
    return rgb ? rgb.slice(1,4).map(c=>Math.min(255,Math.round(Number(c)))) : null;
  };
  const hexColor = rgb => '#' + rgb.map(c=>c.toString(16).padStart(2,'0')).join('');
  const luminance = rgb => rgb.map(c=>c/255).map(c=>c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4)
    .reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
  const primaryColors = (value, {dark = false} = {}) => {
    const original = parseColor(value) || parseColor(dark ? '#818cf8' : '#2563eb');
    const white = [255,255,255], ink = [15,23,42];
    const foreground = ratio(original,white) >= ratio(original,ink) ? white : ink;
    const target = foreground === white ? 0 : 255;
    let fill = original;
    // The nearest 5% step keeps a supplied theme color when it is readable.
    for (let step=1; ratio(fill,foreground)<4.5 && step<=20; step++)
      fill = original.map(c=>Math.round(c+(target-c)*step*.05));
    return {fill:hexColor(fill),foreground:hexColor(foreground),contrast:ratio(fill,foreground)};
  };
  const applyTheme = host => {
    const view = host?.ownerDocument?.defaultView;
    if (!host?.isConnected || !view?.getComputedStyle) return null;
    const raw = view.getComputedStyle(host).getPropertyValue('--primary-color').trim();
    let resolved = raw;
    // Resolve ordinary named colors through the browser without a persistent node.
    if (raw && !parseColor(raw) && !raw.includes('var(') && raw !== 'transparent' && view.CSS?.supports?.('color',raw)) {
      const probe = host.ownerDocument.createElement('span');
      probe.style.display = 'none'; probe.style.color = raw;
      host.append(probe);
      try { resolved = view.getComputedStyle(probe).color; } finally { probe.remove(); }
    }
    const result = primaryColors(resolved,{dark:host.classList.contains('bento-dark') || host.classList.contains('hat-dark')});
    for (const [key,value] of [['--hat-primary-fill-computed',result.fill],['--hat-on-primary-computed',result.foreground]])
      if (host.style.getPropertyValue(key) !== value) host.style.setProperty(key,value);
    return result;
  };
  // v5.3: public tokens stay inheritable; private defaults follow the HA dark flag.
  const css = `
:host, .hat {
  color-scheme: light;
  /* powierzchnie i tekst — z motywu HA, w nawiasie wartość domyślna */
  --_hat-bg:       var(--primary-background-color, #f3f4f6);
  --_hat-card:     var(--ha-card-background, var(--card-background-color, #ffffff));
  --_hat-chip:     var(--secondary-background-color, #f3f4f6);
  --_hat-border:   var(--ha-card-border-color, var(--divider-color, #e5e7eb));
  --_hat-text:     var(--primary-text-color, #111827);
  --_hat-text-2:   var(--secondary-text-color, #4b5563);
  --_hat-text-3:   var(--hat-text-3-theme, #6b7280);   /* tylko na tle karty; ≥ 12 px */
  --_hat-grid:     color-mix(in srgb, var(--hat-text, var(--_hat-text)) 6%, var(--hat-card, var(--_hat-card)));
  --_hat-radius:   var(--ha-card-border-radius, 12px);

  /* Computed values supplied by the host when available; literals are explicit fallback colors, not dynamic contrast. */
  --_hat-primary:      var(--primary-color, #2563eb);
  --_hat-primary-fill: var(--hat-primary-fill-computed, #2563eb);
  --_hat-on-primary:   var(--hat-on-primary-computed, #ffffff);

  /* stany: wypełnienie (≥ 3:1) i tekst (≥ 4,5:1) */
  --_hat-good: #0ca30c;  --_hat-good-text: #15803d;
  --_hat-warn: #fab219;  --_hat-warn-text: #a16207;  --_hat-warn-readout: #9a5b05;
  --_hat-crit: #d03b3b;  --_hat-crit-text: #b91c1c;

  /* serie (W23) */
  --_hat-s1: #2a78d6; --_hat-s2: #eb6834; --_hat-s3: #1baf7a; --_hat-s4: #eda100; --_hat-s5: #e87ba4;
  --_hat-zone-cheap: #1baf7a; --_hat-zone-exp: #2a78d6;
  --_hat-d1: #eb6834; --_hat-d2: #6250d6; --_hat-d3: #e87ba4; --_hat-d4: #eda100;
  --_hat-unmeasured: #9ca3af;

  /* typografia (W16: treść ≥ 14, metadane ≥ 12, wersaliki ≥ 11) */
  --_hat-font: var(--ha-font-family-body, Roboto, Inter, system-ui, sans-serif);
  --_hat-fs-display: 28px;  --_hat-fs-number2: 20px;  --_hat-fs-title: 16px;
  --_hat-fs-body: 14px;     --_hat-fs-meta: 12px;     --_hat-fs-caps: 11px;
  --_hat-fw-regular: 400;   --_hat-fw-medium: 500;    --_hat-fw-bold: 600;

  /* odstępy (siatka 4 px) i rozmiary */
  --_hat-space-1: 4px; --_hat-space-2: 8px; --_hat-space-3: 12px; --_hat-space-4: 16px; --_hat-space-5: 24px;
  --_hat-icon-lg: 36px; --_hat-icon-lg-glyph: 20px;   /* nagłówek, kafelek */
  --_hat-icon-md: 28px; --_hat-icon-md-glyph: 16px;   /* wiersz, launcher */
  --_hat-icon-sm: 24px; --_hat-icon-sm-glyph: 14px;   /* odznaka */
  --_hat-tint: 18%;                                   /* tło ikony = akcent 18 % */
  --_hat-pill-h: 32px;  --_hat-pill-h-mini: 28px;  --_hat-target: 44px;
  --_hat-row-h: 56px;   --_hat-gap: 8px;           /* siatka Sections HA */
  --_hat-motion: 150ms ease;
  font-family: var(--hat-font, var(--_hat-font));
  color: var(--hat-text, var(--_hat-text));
}

/* ---------- 2. Tokeny: ciemny (hass.themes.darkMode → klasa .hat-dark) ---------- */
:host(.hat-dark), :host(.bento-dark), .hat.hat-dark {
  --_hat-bg:     var(--primary-background-color, #111214);
  --_hat-card:   var(--ha-card-background, var(--card-background-color, #1c1c1e));
  --_hat-chip:   var(--secondary-background-color, #26272b);
  --_hat-border: var(--ha-card-border-color, var(--divider-color, #2e2f33));
  --_hat-text:   var(--primary-text-color, #e5e7eb);
  --_hat-text-2: var(--secondary-text-color, #a1a1aa);
  --_hat-text-3: var(--hat-text-3-theme, #8b8b93);
  --_hat-primary-fill: var(--hat-primary-fill-computed, #818cf8);
  --_hat-on-primary:   var(--hat-on-primary-computed, #0f172a);
  --_hat-good: #22c55e;  --_hat-good-text: #22c55e;
  --_hat-warn: #fab219;  --_hat-warn-text: #fab219;  --_hat-warn-readout: #fab219;
  --_hat-crit: #e05252;  --_hat-crit-text: #f87171;
  --_hat-s1: #3987e5; --_hat-s2: #d95926; --_hat-s3: #199e70; --_hat-s4: #c98500; --_hat-s5: #d55181;
  --_hat-zone-cheap: #199e70; --_hat-zone-exp: #3987e5;
  --_hat-d1: #d95926; --_hat-d2: #9085e9; --_hat-d3: #d55181; --_hat-d4: #c98500;
  --_hat-unmeasured: #6b7280;
  color-scheme: dark;
}



.ht-result-state { display:inline-flex;align-items:center;gap:var(--hat-space-1,4px);min-height:24px;padding:0 10px;border:1px solid currentColor;border-radius:999px;font-size:var(--hat-fs-meta,12px);font-weight:600;line-height:16px;white-space:normal;background:transparent; }
.ht-result-state--success { color:var(--hat-good-text, var(--_hat-good-text)); }
.ht-result-state--partial,.ht-result-state--unconfirmed { color:var(--hat-warn-text, var(--_hat-warn-text)); }
.ht-result-state--error { color:var(--hat-crit-text, var(--_hat-crit-text)); }
.ht-result-state--not_checked,.ht-result-state--no_data { color:var(--hat-text-2, var(--_hat-text-2)); }
.ht-result-state--no_data { border-style:dashed; }
`;
  return { status, statusHtml, css, primaryColors, applyTheme };
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
  let raw = null, reservation = null, suspended = false;
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
  const reserve = token => {
    if (!current(token)) throw { code: 'authority_changed' };
    if (raw || reservation) throw { code: 'wire_occupied' };
    const owner = { release: () => {
      if (reservation !== owner) return;
      reservation = null;
      if (!raw) for (const listener of [...wireListeners]) listener();
    } };
    reservation = owner; return owner;
  };
  const call = (token, payload, admin = false, owner = null) => {
    if (!current(token, admin)) return Promise.reject({ code: 'authority_changed' });
    if (raw || reservation && reservation !== owner) return Promise.reject({ code: 'wire_occupied' });
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
    };
    const notifySettled = () => { for (const listener of [...wireListeners]) listener(); };
    request.then(value => {
      settled();
      if (!finished) { finished = true; current(token, admin) ? resolvePublic(value) : rejectPublic({ code: 'authority_changed' }); }
      notifySettled();
    }, error => { settled(); if (!finished) { finished = true; rejectPublic(error); } notifySettled(); });
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
  return { snapshot, observe, current, available, call, reserve, occupied: () => raw !== null || reservation !== null,
    subscribeWire: listener => { wireListeners.add(listener); return () => wireListeners.delete(listener); },
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, invalidate: notify, suspend, resume, dispose };
}
// Node-only dependency; runtime consumers vendor the guard in their own closure.


// Vendor inside each card's closure. The parent owns state and its mount; no
// global registration, helper services, SMTP configuration or browser storage.
function createTariffSettingsV3({ root, getHass, language = 'en', state, validate, onSaved, onLoaded, onCancel, ui, guard, wireProfile = false }) {
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
  const validateDraft = (profile, saving=true) => {
    if (!wireProfile) return validate(profile);
    if (!object(profile) || profile.schema !== 2 || !Array.isArray(profile.fixed) || 'tariffs' in profile)
      return {valid:false,errors:[{path:'profile',reason:'wire_profile_required'}]};
    if (saving && (!profile.name || !profile.validFrom || profile.validTo && profile.validTo <= profile.validFrom || profile.requiresHolidayDates === true))
      return {valid:false,errors:[{path:'validFrom/name/holidays',reason:'explicit_values_required'}]};
    if(profile.fixed.length>128 || new Set(profile.fixed.map(f=>f.id)).size!==profile.fixed.length || profile.fixed.some(f=>!object(f)||typeof f.id!=='string'||!f.id||typeof f.label!=='string'||!f.label||f.monthly!==null&&(!Number.isFinite(f.monthly)||f.monthly<0)))return {valid:false,errors:[{path:'fixed',reason:'invalid_fee_rows'}]};
    if(saving && profile.templateSource && profile.zones?.some(z=>z.energyRate===null||z.variableRate===null))return {valid:false,errors:[{path:'zones',reason:'template_prices_required'}]};
    const engine=clone(profile);engine.schema=1;delete engine.fixed;delete engine.fixedMonthly;
    // Only local field validation; the server remains the schedule/history proof.
    return validate(engine);
  };
  const validProfile = profile => { try {
    return validateDraft(profile,false)?.valid === true;
  } catch (_) { return false; } };
  const canEdit = token => wireProfile
    ? state.wireCapabilities?.energy_tariff?.visible === true && state.wireCapabilities?.energy_tariff?.read === true
      && state.wireCapabilities?.energy_tariff?.execute === true && !state.wireMigrationRequired && !state.wireMigrationWriteUnknown
    : token.admin;
  // The server returns only this bounded marker when persisted validation fails.
  // Its confirmed revision lets an administrator explicitly replace the profile.
  const invalidMarker = profile => object(profile) && profile.schema === 0 && Object.keys(profile).length === 1;
  const statuses = () => ({ success: t('Success', 'Sukces'), partial: t('Partial', 'Częściowo'),
    unconfirmed: t('Unconfirmed', 'Niepotwierdzony'), error: t('Error', 'Błąd'),
    not_checked: t('Not checked', 'Nie sprawdzono'), no_data: t('No data', 'Brak danych') });
  const statusHtml = () => family()?.statusHtml(state.status) || `<span data-result-state="${esc(state.status)}"><span aria-hidden="true">${({ success: '✓', partial: '½', unconfirmed: '?', error: '✕', not_checked: '–', no_data: '∅' })[state.status] || '–'}</span> ${esc(statuses()[state.status] || statuses().not_checked)}</span>`;
  const blank = () => ({ schema: wireProfile ? 2 : 1, type: 'Custom', name: '', currency: getHass()?.config?.currency || '',
    timezone: getHass()?.config?.time_zone || '', clock: { mode: 'civil' }, priceBasis: 'gross',
    ...(wireProfile ? {fixed:[]} : {fixedMonthly:null}), defaultZone: null, zones: [], rules: [], exceptions: [] });
  const seed = profile => invalidMarker(profile) ? blank() : clone(profile) || blank();
  if (!object(state.draft) || invalidMarker(state.draft)) state.draft = seed(state.profile);
  if (!statuses()[state.status]) state.status = 'not_checked';
  if (invalidMarker(state.profile) && state.status === 'not_checked') state.status = 'error';
  guard ||= createTariffGuardV3({ getHass });
  let operation = 0, association, resumeFocus = null, disposed = false;
  const observe = () => (association = guard.observe());
  const available = a => guard.available(a);
  const ticket = () => ({ ...observe(), operation: ++operation });
  const current = (token, admin = false) => token.operation === operation && guard.current(token, admin && !wireProfile);
  const call = async (token, payload, admin = false) => {
    if (!current(token, admin)) throw {code:'authority_changed'};
    if (!wireProfile) return guard.call(token,payload,admin);
    const authorized = caps => caps?.status==='ready' && Number.isSafeInteger(caps.revision) && caps.revision>=0
      && caps.capabilities?.energy_tariff?.visible===true && caps.capabilities.energy_tariff.read===true
      && (!admin || caps.capabilities.energy_tariff.execute===true);
    const rejectAuthority = caps => {
      const grant=caps?.capabilities?.energy_tariff;
      if(caps?.status==='ready'&&grant?.visible===true&&grant.read===true)state.wireCapabilities=clone(caps.capabilities);
      else{state.wireCapabilities=null;state.wireEnvelope=null;state.wireTemplates=[];state.wireDrafts={};state.wireMigrationPreview=null;state.wireMigrationChoice='';state.draft=blank();state.profile=null;root.replaceChildren();}
    };
    const before=await guard.call(token,{type:'ha_tools_email/feature_capabilities'});
    if (!current(token) || !authorized(before)) {rejectAuthority(before);throw {code:'unauthorized'};}
    let request=payload;
    if(payload.type==='ha_tools_email/get_tariff'){
      const select=state.wireReadback || state.wireRequested || {};
      request={type:'ha_tools_email/get_tariff_profile',...(select.tariff_id?{tariff_id:select.tariff_id}:{}),...(select.version_id?{version_id:select.version_id}:{})};
    }else if(payload.type==='ha_tools_email/set_tariff'){
      request={...payload,type:'ha_tools_email/set_tariff_profile',historical_edit_ack:state.wireHistoricalAck===true,
        ...(state.wireEnvelope?.tariff_id?{tariff_id:state.wireEnvelope.tariff_id}:{})};
    }
    if(request.type==='ha_tools_email/set_tariff_profile'&&state.wireMigrationSaving)state.wireMigrationDispatched=true;
    let result;try{result=await guard.call(token,request);}catch(error){if(['unauthorized','not_allowed'].includes(error?.code))rejectAuthority(null);throw error;}
    const after=await guard.call(token,{type:'ha_tools_email/feature_capabilities'});
    if(!current(token) || !authorized(after) || after.revision!==before.revision){rejectAuthority(after);throw {code:'unauthorized'};}
    state.wireCapabilities=clone(after.capabilities);
    if(request.type==='ha_tools_email/get_tariff_profile'){
      if(!object(result)||!['ready','empty','inactive','migration_required'].includes(result.status)||!Array.isArray(result.tariff_profiles)||result.tariff_profiles.length>32||!Array.isArray(result.tariffs)||result.tariffs.length>8||result.tariff_profiles.some(v=>!object(v)||typeof v.version_id!=='string'||!object(v.profile)||v.profile.schema!==2||typeof v.profile.name!=='string'||!Array.isArray(v.profile.fixed))||result.tariffs.some(tariff=>!object(tariff)||typeof tariff.id!=='string'||typeof tariff.name!=='string'))throw {code:'malformed'};
      if(result.migration_preview!==true)state.wireEnvelope=clone(result);
    }
    if(request.type==='ha_tools_email/set_tariff_profile')state.wireReadback={tariff_id:result.tariff_id,version_id:result.version_id};
    return result;
  };
  const unsubscribe = guard.subscribe(() => {
    if (disposed) return;
    operation++; resumeFocus = null;
    state.profile = null; state.revision = null; state.updated_at = null;
    state.draft = blank(); state._draftBaseline = clone(state.draft);
    state.feedText = undefined; state.feedError = null; state.backendAvailable = false;
    if(wireProfile){state.wireCapabilities=null;state.wireEnvelope=null;state.wireTemplates=[];state.wireDrafts={};state.wireRequested=null;state.wireReadback=null;state.wireKey=null;state.wireHistoricalAck=false;state.wireMigrationPreview=null;state.wireMigrationChoice='';state.wireMigrationHistoricalAck=false;state.wireMigrationWriteUnknown=false;state.wireMigrationSaving=false;state.wireMigrationStale=false;state.wireMigrationDirty=false;}
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
    const pristine = equal(state.draft, seed(state.profile)), draft = clone(state.draft), draftRevision=state.revision;
    if(wireProfile)state.wireReadback=null;
    state.busy = true; state.message = t('Loading stored tariff…', 'Wczytywanie zapisanej taryfy…'); render();
    try {
      const result = await call(token, { type: 'ha_tools_email/get_tariff' });
      if (!current(token)) return;
      if(wireProfile && result?.status==='migration_required'){
        state.wireMigrationRequired=true;state.backendAvailable=false;
        if(!state.wireMigrationWriteUnknown)state.wireMigrationPreview=null;
        message('unconfirmed',t('Legacy tariff semantics need explicit migration before editing. No prices were inferred.', 'Semantyka starej taryfy wymaga jawnej migracji przed edycją. Nie przyjęto stawek.'));return;
      }
      if (!envelope(result)) throw { code: 'malformed' };
      if(wireProfile){state.wireMigrationRequired=false;state.wireHistoricalAck=false;if(!state.wireMigrationWriteUnknown){state.wireMigrationPreview=null;state.wireMigrationChoice='';state.wireMigrationHistoricalAck=false;}}
      state.profile = clone(result.profile); state.revision = result.revision; state.updated_at = result.updated_at;
      state.backendAvailable = true; state.writeUnconfirmed = false;
      const switchKey=wireProfile && state.wireSwitch?.startsWith('tariff:') ? 'version:'+result.tariff_id+':'+result.version_id : state.wireSwitch;
      state.draft = wireProfile && state.wireSwitch
        ? clone(state.wireDrafts?.[switchKey]?.draft) || seed(result.profile)
        : pristine ? seed(result.profile) : draft;
      if(wireProfile){
        const cached=switchKey&&state.wireDrafts?.[switchKey];
        const oldRevision=cached&&!equal(cached.draft,seed(cached.profile))?cached.revision:!switchKey&&!pristine?draftRevision:null;
        state.wireConflict=Number.isSafeInteger(oldRevision)&&oldRevision!==result.revision;
        if(state.wireConflict){state.revision=oldRevision;state.writeUnconfirmed=true;}
        state.wireKey=switchKey || state.wireKey || 'version:'+result.tariff_id+':'+result.version_id;state.wireSwitch=null;state._draftBaseline=seed(result.profile);
      }
      if (pristine) { state.feedText = undefined; state.feedError = null; }
      if (invalidMarker(result.profile)) message('error', t('The stored tariff is invalid. Review and save a replacement; costs stay unavailable until a valid profile is confirmed.',
        'Zapisana taryfa jest niepoprawna. Sprawdź i zapisz nowy profil; koszty pozostają niedostępne do potwierdzenia poprawnej taryfy.'));
      else message(result.profile ? 'not_checked' : 'no_data', t('Stored tariff loaded. Review the fields before saving.', 'Wczytano taryfę. Sprawdź pola przed zapisem.'));
      if(wireProfile && state.wireConflict)message('unconfirmed',t('Your draft has an older revision. Compare it with the saved version; explicitly use the stored profile before editing again.', 'Szkic ma starszą rewizję. Porównaj go z zapisaną wersją; przed dalszą edycją jawnie wybierz zapisany profil.'));
      if (current(token) && typeof onLoaded === 'function') onLoaded(clone(result));
    } catch (_) {
      if (current(token)) { state.backendAvailable = false; message('error', t('Tariff backend unavailable or response invalid. Draft preserved.', 'Backend taryf jest niedostępny lub odpowiedź jest błędna. Zachowano szkic.')); }
    } finally { if (current(token)) { state.busy = false; render(); } }
  };
  const save = async () => {
    if (disposed || state.busy || guard.occupied()) return;
    const token = ticket();
    if (!available(token) || !canEdit(token) || state.writeUnconfirmed || state.backendAvailable === false || !Number.isSafeInteger(state.revision)) {
      message('error', t('Admin access and a loaded tariff backend are required.', 'Wymagane uprawnienia administratora i wczytany backend taryf.')); render(); return;
    }
    if (state.feedError) { message('error', state.feedError); render(); return; }
    const proposed = clone(state.draft);
    let result;
    try { result = validateDraft(proposed); } catch (_) { result = { valid: false }; }
    if (!result?.valid) {
      message('error', t('Invalid tariff. Check the marked paths: ', 'Niepoprawna taryfa. Sprawdź wskazane pola: ') +
        (result?.errors || []).map(e => `${e.path}: ${e.reason}`).join('; ')); render(); return;
    }
    const previousRevision = state.revision;
    if(wireProfile)state.wireSaving=true;
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
      if(wireProfile){state.wireReadback=null;state.wireKey='version:'+stored.tariff_id+':'+stored.version_id;state.wireRequested={tariff_id:stored.tariff_id,version_id:stored.version_id};state._draftBaseline=clone(stored.profile);state.wireHistoricalAck=false;state.wireConflict=false;}
      message('success', t('Tariff saved and confirmed by stored readback.', 'Taryfa zapisana i potwierdzona odczytem.'));
      if (current(token, true) && typeof onSaved === 'function') onSaved(clone(stored));
    } catch (error) {
      if(wireProfile && current(token) && error?.code==='historical_edit_ack_required'){
        message('error',t('Historical dates change. Review the version and explicitly acknowledge before saving.', 'Zmieniają się daty historyczne. Sprawdź wersję i jawnie potwierdź przed zapisem.'));
      }else if(wireProfile && current(token) && error?.code==='invalid_tariff_profile'){
        message('error',t('The server rejected the profile. Correct the fields; your draft is preserved.', 'Serwer odrzucił profil. Popraw pola; szkic został zachowany.'));
      }else if (current(token, true) && ['conflict', 'revision_conflict', 'tariff_revision_conflict'].includes(error?.code)) {
        state.writeUnconfirmed = true;
        message('error', t('Revision conflict. Load the stored tariff and reconcile your draft.', 'Konflikt wersji. Wczytaj zapisaną taryfę i porównaj ze szkicem.'));
      } else if (current(token)) unknown();
    } finally { if (current(token)) { state.busy = false;if(wireProfile)state.wireSaving=false; render(); } }
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
  const mutable = () => canEdit(observe()) && !state.busy && !guard.occupied() && available(association);
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
  const stashWire = () => {state.wireDrafts ||= {};if(state.wireKey)state.wireDrafts[state.wireKey]={draft:clone(state.draft),profile:clone(state.profile),revision:state.revision};};
  const migrationReadAllowed = () => {
    const grant=state.wireCapabilities?.energy_tariff;
    return wireProfile && grant?.visible===true && grant.read===true && available(observe());
  };
  const migrationPreviewCurrent = () => {
    const preview=state.wireMigrationPreview;
    return preview && preview.epoch===observe().epoch && preview.choice===state.wireMigrationChoice
      && typeof preview.legacyCombined==='boolean' && !state.wireMigrationStale;
  };
  const migrationControls = () => {
    if(!state.wireMigrationRequired&&!state.wireMigrationPreview&&!state.wireMigrationWriteUnknown)return '';
    const preview=state.wireMigrationPreview,p=preview?.envelope?.profile,locked=state.busy||guard.occupied()||!migrationReadAllowed();
    const executable=migrationReadAllowed()&&state.wireCapabilities?.energy_tariff?.execute===true;
    const unknown=t('Unknown','Nieznane');
    return `<fieldset data-wire-migration><legend>${esc(t('Migrate the saved legacy tariff','Migracja zapisanej starej taryfy'))}</legend>
      <p>${esc(t('Choose what the old energy rate meant using your tariff or invoice. No rates, fees or dates are inferred. Preview is read-only; saving is a separate action.', 'Wybierz znaczenie starej stawki energii na podstawie taryfy lub faktury. Ceny, opłaty ani daty nie są zgadywane. Podgląd jest tylko do odczytu; zapis to osobna czynność.'))}</p>
      <label>${esc(t('Meaning of the old energy rate','Znaczenie starej stawki energii'))}<select data-wire-migration-choice data-wire-focus="migration-choice"${locked||state.wireMigrationWriteUnknown?' disabled':''}>
      <option value=""${!state.wireMigrationChoice?' selected':''}>${esc(t('Choose explicitly','Wybierz jawnie'))}</option>
      <option value="components"${state.wireMigrationChoice==='components'?' selected':''}>${esc(t('Energy only; variable distribution is separate or unknown','Sama energia; dystrybucja zmienna osobno lub nieznana'))}</option>
      <option value="combined"${state.wireMigrationChoice==='combined'?' selected':''}>${esc(t('Combined rate; variable distribution is already included','Stawka łączna; dystrybucja zmienna jest już wliczona'))}</option></select></label>
      <button type="button" data-wire-action="migration-preview" data-wire-focus="migration-preview"${locked||!state.wireMigrationChoice||state.wireMigrationWriteUnknown?' disabled':''}>${esc(t('Preview migration without saving','Pokaż podgląd migracji bez zapisu'))}</button>
      ${p?`<section data-wire-migration-preview aria-label="${esc(t('Read-only server migration preview','Podgląd migracji z serwera, tylko odczyt'))}"><h4>${esc(p.name)}</h4><p>${esc(p.currency)} · ${esc(p.priceBasis)} · ${esc(p.validFrom||unknown)} → ${esc(p.validTo||unknown)}</p>
      <ul>${(p.zones||[]).map(z=>`<li>${esc(z.label||z.id)}: ${esc(z.energyRate??unknown)} / ${esc(z.variableRate??unknown)}</li>`).join('')}</ul>
      <ul>${(p.fixed||[]).map(f=>`<li>${esc(f.label)} [${esc(f.id)}]: ${esc(f.monthly??unknown)}</li>`).join('')}</ul>
      <details><summary>${esc(t('Full server profile and provenance','Pełny profil i pochodzenie danych z serwera'))}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(p,null,2))}</pre></details></section>`:''}
      <label><input type="checkbox" data-wire-migration-ack data-wire-focus="migration-ack"${state.wireMigrationHistoricalAck?' checked':''}${locked||!executable||!p||state.wireMigrationWriteUnknown?' disabled':''}>${esc(t('I acknowledge any historical calculation changes from this migration. Archived reports remain unchanged.', 'Potwierdzam ewentualne zmiany obliczeń historycznych wynikające z tej migracji. Archiwalne raporty pozostają bez zmian.'))}</label>
      <button type="button" data-wire-action="migration-save" data-wire-focus="migration-save"${locked||!executable||!migrationPreviewCurrent()||state.wireMigrationWriteUnknown?' disabled':''}>${esc(t('Save this migration','Zapisz tę migrację'))}</button>
      ${state.wireMigrationWriteUnknown?`<p role="status">${esc(t('The write outcome is UNKNOWN. Saving again is blocked. Read the stored result; no retry is sent.', 'Wynik zapisu jest UNKNOWN. Ponowny zapis jest zablokowany. Odczytaj zapisany wynik; próba nie jest ponawiana.'))}</p><button type="button" data-wire-action="migration-confirm" data-wire-focus="migration-confirm"${locked||!p?' disabled':''}>${esc(t('Read and confirm the stored result','Odczytaj i potwierdź zapisany wynik'))}</button>`:''}
    </fieldset>`;
  };
  const previewMigration = async () => {
    if(disposed||state.busy||guard.occupied()||!migrationReadAllowed()||state.wireMigrationWriteUnknown||!['components','combined'].includes(state.wireMigrationChoice))return;
    const token=ticket(),choice=state.wireMigrationChoice,legacyCombined=choice==='combined';
    state.busy=true;state.wireMigrationPreview=null;state.wireMigrationHistoricalAck=false;render();
    try{
      const result=await call(token,{type:'ha_tools_email/get_tariff_profile',legacy_combined:legacyCombined});
      if(!current(token))return;
      if(!envelope(result)||result.status!=='ready'||result.migration_preview!==true||!object(result.profile)||result.profile.rateSemantics!==(legacyCombined?'legacy_combined':'components')||typeof result.tariff_id!=='string'||typeof result.version_id!=='string')throw {code:'malformed'};
      state.wireMigrationStale=false;state.wireMigrationPreview={envelope:clone(result),choice,legacyCombined,epoch:token.epoch};
      message('not_checked',t('Server preview only. Nothing has been saved. Review the values and save separately if appropriate.', 'To tylko podgląd z serwera. Niczego nie zapisano. Sprawdź wartości i w razie potrzeby zapisz osobno.'));
    }catch(_){if(current(token))message('error',t('This interpretation could not be previewed. The original tariff and drafts are unchanged.', 'Nie udało się wyświetlić tej interpretacji. Oryginalna taryfa i szkice pozostają bez zmian.'));}
    finally{if(current(token)){state.busy=false;render();}}
  };
  const finishMigration = (stored, dirty) => {
    state.wireMigrationWriteUnknown=false;state.wireMigrationRequired=false;state.wireMigrationPreview=null;state.wireMigrationChoice='';state.wireMigrationHistoricalAck=false;state.wireMigrationStale=false;state.wireMigrationDirty=false;state.wireReadback=null;
    state.profile=clone(stored.profile);state.updated_at=stored.updated_at;state.backendAvailable=true;state.wireRequested={tariff_id:stored.tariff_id,version_id:stored.version_id};
    state.wireKey='version:'+stored.tariff_id+':'+stored.version_id;state._draftBaseline=clone(stored.profile);
    if(dirty){state.wireConflict=true;state.writeUnconfirmed=true;message('unconfirmed',t('Migration is stored and confirmed. Your separate unsaved draft is preserved; reconcile it with the stored version.', 'Migracja jest zapisana i potwierdzona. Osobny niezapisany szkic został zachowany; porównaj go z zapisaną wersją.'));}
    else{state.draft=clone(stored.profile);state.revision=stored.revision;state.wireConflict=false;state.writeUnconfirmed=false;message('success',t('Migration saved and confirmed by stored readback.', 'Migracja zapisana i potwierdzona odczytem.'));}
    if(typeof onSaved==='function')onSaved(clone(stored));
  };
  const confirmMigrationResult = (stored, preview) => envelope(stored)&&stored.status==='ready'&&stored.migration_preview!==true
    &&stored.updated_at!==null&&stored.revision===preview.envelope.revision+1&&stored.tariff_id===preview.envelope.tariff_id&&stored.version_id===preview.envelope.version_id
    &&equal(stored.profile,preview.envelope.profile);
  const saveMigration = async () => {
    if(disposed||state.busy||guard.occupied()||state.wireMigrationWriteUnknown||!migrationReadAllowed()||state.wireCapabilities?.energy_tariff?.execute!==true||!migrationPreviewCurrent())return;
    const token=ticket(),preview=clone(state.wireMigrationPreview),dirty=!equal(state.draft,seed(state.profile));
    state.busy=true;state.wireMigrationSaving=true;state.wireMigrationDispatched=false;state.wireMigrationDirty=dirty;render();
    try{
      const written=await call(token,{type:'ha_tools_email/set_tariff_profile',profile:clone(preview.envelope.profile),expected_revision:preview.envelope.revision,
        legacy_combined:preview.legacyCombined,historical_edit_ack:state.wireMigrationHistoricalAck===true},true);
      if(!current(token))return;
      if(!object(written)||written.revision!==preview.envelope.revision+1)throw {code:'unconfirmed'};
      const stored=await call(token,{type:'ha_tools_email/get_tariff_profile',tariff_id:preview.envelope.tariff_id,version_id:preview.envelope.version_id});
      if(!current(token))return;
      if(!confirmMigrationResult(stored,preview))throw {code:'unconfirmed'};
      finishMigration(stored,dirty);
    }catch(error){if(current(token)){
      if(error?.code==='historical_edit_ack_required')message('error',t('Review the preview and explicitly acknowledge historical changes before a separate save.', 'Sprawdź podgląd i jawnie potwierdź zmiany historyczne przed osobnym zapisem.'));
      else if(['tariff_revision_conflict','revision_conflict','conflict'].includes(error?.code)){state.wireMigrationStale=true;message('error',t('Revision conflict. Request a new read-only preview; this migration was not retried.', 'Konflikt rewizji. Poproś o nowy podgląd tylko do odczytu; nie ponowiono migracji.'));}
      else if(error?.code==='invalid_tariff_profile'||!state.wireMigrationDispatched)message('error',t('Migration was not dispatched or was rejected before storage. Original values and drafts remain.', 'Migracja nie została przekazana lub została odrzucona przed zapisem. Oryginalne wartości i szkice pozostają.'));
      else{state.wireMigrationWriteUnknown=true;state.writeUnconfirmed=true;unknown();}
    }}finally{if(current(token)){state.busy=false;state.wireMigrationSaving=false;render();}}
  };
  const confirmUnknownMigration = async () => {
    if(disposed||state.busy||guard.occupied()||!migrationReadAllowed()||!state.wireMigrationWriteUnknown||!state.wireMigrationPreview)return;
    const token=ticket(),preview=clone(state.wireMigrationPreview),dirty=state.wireMigrationDirty===true;state.busy=true;render();
    try{const stored=await call(token,{type:'ha_tools_email/get_tariff_profile',tariff_id:preview.envelope.tariff_id,version_id:preview.envelope.version_id});
      if(!current(token))return;if(!confirmMigrationResult(stored,preview))throw {code:'unconfirmed'};finishMigration(stored,dirty);
    }catch(_){if(current(token))message('unconfirmed',t('Stored migration outcome remains unconfirmed. Saving again stays blocked.', 'Wynik zapisanej migracji nadal nie jest potwierdzony. Ponowny zapis pozostaje zablokowany.'));}
    finally{if(current(token)){state.busy=false;render();}}
  };
  const wireFields = () => `${migrationControls()}<fieldset data-wire-panel><legend>${esc(t('Saved versions and server templates','Zapisane wersje i szablony serwera'))}</legend>
    <button type="button" data-wire-action="history" data-wire-focus="reload"${state.busy?' disabled':''}>${esc(t('Reload history','Wczytaj historię'))}</button>
    <button type="button" data-wire-action="templates" data-wire-focus="templates"${state.busy?' disabled':''}>${esc(t('Load G11 / G12 / G12w templates','Wczytaj szablony G11 / G12 / G12w'))}</button>
    ${state.wireConflict?`<button type="button" data-wire-action="stored"${state.busy?' disabled':''}>${esc(t('Use the newly loaded stored profile','Użyj właśnie wczytanego zapisanego profilu'))}</button>`:''}
    <label>${esc(t('Saved tariff','Zapisana taryfa'))}<select data-wire-tariff data-wire-focus="tariff"${state.busy?' disabled':''}><option value="">${esc(t('Choose explicitly','Wybierz jawnie'))}</option>${(state.wireEnvelope?.tariffs||[]).map(tariff=>`<option value="${esc(tariff.id)}">${esc(tariff.name)}</option>`).join('')}</select></label>
    <label>${esc(t('Saved version','Zapisana wersja'))}<select data-wire-history data-wire-focus="history"${state.busy?' disabled':''}><option value="">${esc(t('Choose explicitly','Wybierz jawnie'))}</option>${(state.wireEnvelope?.tariff_profiles||[]).map(v=>`<option value="${esc(v.version_id)}">${esc(v.profile.name)} · ${esc(v.profile.validFrom||t('Unknown start','Nieznany początek'))} → ${esc(v.profile.validTo||t('Open end','Bez daty końca'))}</option>`).join('')}</select></label>
    <label>${esc(t('Server template (draft only)','Szablon serwera (tylko szkic)'))}<select data-wire-template data-wire-focus="template"${!mutable()?' disabled':''}><option value="">${esc(t('Choose explicitly','Wybierz jawnie'))}</option>${(state.wireTemplates||[]).map(item=>`<option value="${esc(item.id)}">${esc(item.id)}</option>`).join('')}</select></label>
    <p>${esc(t('A template never saves or activates itself. Set your effective date and prices. Existing fixed fees are retained. Drafts are kept when switching versions.', 'Szablon nie zapisuje ani nie aktywuje taryfy. Ustaw datę obowiązywania i własne ceny. Dotychczasowe opłaty stałe pozostają. Szkice są zachowane przy zmianie wersji.'))}</p></fieldset>
    <fieldset><legend>${esc(t('Fixed monthly fee rows','Składniki opłat stałych'))}</legend>${(state.draft.fixed||[]).map((f,i)=>`<div class="ht-tariff-grid">${field('fixed.'+i+'.id',t('Identifier','Identyfikator'))}${field('fixed.'+i+'.label',t('Label','Etykieta'))}${field('fixed.'+i+'.monthly',t('Monthly amount (blank = unknown)','Kwota miesięczna (pusta = nieznana)'),'number')}${button('remove-fixed:'+i,t('Remove fee row','Usuń składnik'))}</div>`).join('')}${button('add-fixed',t('Add fixed fee','Dodaj opłatę stałą'))}</fieldset>
    ${state.draft.requiresHolidayDates===true?`<label><input type="checkbox" data-wire-holidays data-wire-focus="holidays"${!mutable()?' disabled':''}>${esc(t('I reviewed the public holiday exceptions below; an empty list means no holidays selected.', 'Sprawdzono wyjątki świąteczne poniżej; pusta lista oznacza brak wybranych świąt.'))}</label>`:''}
    <label><input type="checkbox" data-wire-historical data-wire-focus="ack"${state.wireHistoricalAck?' checked':''}${!mutable()?' disabled':''}>${esc(t('I acknowledge edits to the selected historical version. Archived reports stay unchanged.', 'Potwierdzam edycję wybranej wersji historycznej. Archiwalne raporty pozostają bez zmian.'))}</label>`;
  const fetchTemplates = async () => {
    if(!wireProfile || disposed || state.busy || guard.occupied())return;
    const token=ticket();state.busy=true;render();
    try{const result=await call(token,{type:'ha_tools_email/list_tariff_templates'});
      if(!current(token))return;
      if(!Array.isArray(result?.templates)||result.templates.length>8||result.templates.some(x=>!['G11','G12','G12w'].includes(x.id)||x.profile?.schema!==2||!Array.isArray(x.profile.zones)||!Array.isArray(x.profile.fixed)||!Array.isArray(x.profile.rules)||!Array.isArray(x.profile.exceptions)||x.profile.zones.some(z=>!object(z)||z.energyRate!==null||z.variableRate!==null)))throw {code:'malformed'};
      state.wireTemplates=clone(result.templates);message('not_checked',t('Choose a server template explicitly. No changes have been saved.', 'Wybierz jawnie szablon serwera. Niczego nie zapisano.'));
    }catch(_){if(current(token)){state.wireTemplates=[];message('error',t('Templates could not be confirmed. Draft preserved.','Nie potwierdzono szablonów. Zachowano szkic.'));}}
    finally{if(current(token)){state.busy=false;render();}}
  };
  async function openMode(mode='edit'){
    if(!wireProfile || disposed)return;
    await load();if(mode==='templates'&&!state.wireMigrationRequired)await fetchTemplates();
  }
  const bindWire = () => {
    if(!wireProfile)return;
    root.querySelector('[data-wire-migration-choice]')?.addEventListener('change',event=>{
      if(state.busy||guard.occupied()||state.wireMigrationWriteUnknown||!migrationReadAllowed())return;
      if(!['','components','combined'].includes(event.target.value))return;
      state.wireMigrationChoice=event.target.value;state.wireMigrationPreview=null;state.wireMigrationHistoricalAck=false;state.wireMigrationStale=false;render();
    });
    root.querySelector('[data-wire-migration-ack]')?.addEventListener('change',event=>{if(!state.busy&&!state.wireMigrationWriteUnknown&&migrationReadAllowed())state.wireMigrationHistoricalAck=event.target.checked;});
    root.querySelector('[data-wire-action="migration-preview"]')?.addEventListener('click',()=>void previewMigration());
    root.querySelector('[data-wire-action="migration-save"]')?.addEventListener('click',()=>void saveMigration());
    root.querySelector('[data-wire-action="migration-confirm"]')?.addEventListener('click',()=>void confirmUnknownMigration());
    root.querySelector('[data-wire-action="stored"]')?.addEventListener('click',()=>{if(state.busy||guard.occupied())return;stashWire();state.draft=seed(state.profile);state.revision=state.wireEnvelope?.revision;state.writeUnconfirmed=false;state.wireConflict=false;state.feedText=undefined;state.feedError=null;render();});
    root.querySelector('[data-wire-action="history"]')?.addEventListener('click',()=>void load());
    root.querySelector('[data-wire-action="templates"]')?.addEventListener('click',()=>void fetchTemplates());
    root.querySelector('[data-wire-tariff]')?.addEventListener('change',event=>{
      const id=event.target.value;if(!id||state.busy||guard.occupied())return;
      stashWire();state.wireSwitch='tariff:'+id;state.wireRequested={tariff_id:id};void load();
    });
    root.querySelector('[data-wire-history]')?.addEventListener('change',event=>{
      const id=event.target.value;if(!id||state.busy||guard.occupied())return;
      stashWire();state.wireSwitch='version:'+state.wireEnvelope?.tariff_id+':'+id;state.wireRequested={tariff_id:state.wireEnvelope?.tariff_id,version_id:id};void load();
    });
    root.querySelector('[data-wire-template]')?.addEventListener('change',event=>{
      if(!mutable())return;
      const item=state.wireTemplates?.find(row=>row.id===event.target.value);if(!item)return;
      stashWire();const key='template:'+(state.wireEnvelope?.tariff_id||'')+':'+item.id,base=state.draft,template=clone(item.profile);
      state.draft=clone(state.wireDrafts?.[key]?.draft)||{...clone(base),...template,
        fixed:clone(base.fixed||template.fixed),origin:clone(base.origin||template.origin),
        templateSource:clone(item.origin),rateSemantics:'components',validityClock:'civil',validFrom:null,validTo:null};
      if(!state.wireDrafts?.[key]){delete state.draft.dynamic;delete state.draft.provenance;}state.wireKey=key;state.wireHistoricalAck=false;state.feedText=undefined;state.feedError=null;
      message('not_checked',t('Template draft only: enter effective date and every energy price before saving.','To tylko szkic szablonu: wpisz datę i wszystkie ceny energii przed zapisem.'));render();
      root.querySelector('[data-path="validFrom"]')?.focus();
    });
    root.querySelector('[data-wire-historical]')?.addEventListener('change',event=>{if(mutable())state.wireHistoricalAck=event.target.checked;});
    root.querySelector('[data-wire-holidays]')?.addEventListener('change',event=>{if(mutable()&&event.target.checked){state.draft.requiresHolidayDates=false;render();}});
  };
  function render() {
    if (disposed) return;
    const active = root.getRootNode().activeElement;
    const focused = active && root.contains(active) ? active : root.querySelector(':focus');
    const focusKey = focused ? { path: focused.dataset.path, action: focused.dataset.action, weekday: focused.dataset.weekday, feed: focused.dataset.feed, wire: focused.dataset.wireFocus,
      selection: typeof focused.selectionStart === 'number' ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection } : null } : resumeFocus;
    const documentFocus = root.ownerDocument.activeElement, ownerRoot = root.getRootNode();
    const externalFocus = documentFocus && documentFocus !== root.ownerDocument.body &&
      documentFocus !== ownerRoot.host && !root.contains(documentFocus);
    if (focused && state.busy) resumeFocus = focusKey;
    const a = observe();
    if (state.busy && (!wireProfile || state.wireSaving) && (!available(a) || !canEdit(a)) && state.message) unknown();
    const p = state.draft;
    root.innerHTML = `<style>${css}${family()?.css || ''}</style><section class="ht-tariff-v3" aria-label="${esc(t('Tariff settings', 'Ustawienia taryfy'))}"><h3>${esc(t('Your electricity tariff', 'Twoja taryfa energii'))}</h3><p>${esc(wireProfile ? t('Choose server hours explicitly, then enter your prices, effective date and holiday exceptions.', 'Wybierz jawnie godziny serwera, a potem wpisz ceny, datę obowiązywania i wyjątki świąteczne.') : t('Enter your own rates and hours. Names G11/G12/G12w/G12n do not fill rates, holidays or schedules.', 'Wpisz własne ceny i godziny. Nazwy G11/G12/G12w/G12n nie uzupełniają cen, świąt ani harmonogramu.'))}</p>${
      !canEdit(a) ? `<p>${esc(t('Household access: read only.', 'Dostęp domownika: tylko odczyt.'))}</p>` : ''}${
      !available(a) || state.backendAvailable === false ? `<p>${esc(t('Tariff backend unavailable. No local fallback.', 'Backend taryf jest niedostępny. Brak lokalnego zapisu zastępczego.'))}</p>` :
        !Number.isSafeInteger(state.revision) ? `<p>${esc(t('Backend availability not checked. Load the tariff first.', 'Dostępność backendu nie została sprawdzona. Najpierw wczytaj taryfę.'))}</p>` : ''}
${invalidMarker(state.profile) ? `<p role="alert">${esc(t('The stored tariff is invalid. Create and save a valid replacement. No rates were guessed.', 'Zapisana taryfa jest niepoprawna. Utwórz i zapisz poprawny profil. Nie przyjęto domyślnych stawek.'))}</p>` : ''}
<div class="ht-tariff-grid">${field('type', t('Tariff name type', 'Typ nazwy taryfy'), 'text', ['Custom', 'G11', 'G12', 'G12w', 'G12n'].map(v => [v, v]))}${field('name', wireProfile?t('Tariff name (required)', 'Nazwa taryfy (wymagana)'):t('Tariff name (optional)', 'Nazwa taryfy (opcjonalna)'))}${field('currency', t('Currency ISO 4217', 'Waluta ISO 4217'))}${field('timezone', t('IANA timezone', 'Strefa czasowa IANA'))}${field('clock.mode', t('Tariff clock', 'Zegar taryfy'), 'text', [['civil', t('Civil time (DST)', 'Czas lokalny (zmiana czasu)')], ['fixed', t('Fixed UTC offset', 'Stałe przesunięcie UTC')]])}${field('clock.offsetMinutes', t('Fixed offset minutes', 'Stałe przesunięcie w minutach'), 'number')}${field('priceBasis', t('Price basis', 'Podstawa ceny'), 'text', [['gross', t('Gross', 'Brutto')], ['net', t('Net', 'Netto')]])}${field('validFrom', wireProfile?t('Valid from (required)', 'Obowiązuje od (wymagane)'):t('Valid from (optional)', 'Ważna od (opcjonalnie)'), 'date')}${field('validTo', wireProfile?t('Valid until (exclusive)', 'Do dnia (bez tego dnia)'):t('Valid to (optional)', 'Ważna do (opcjonalnie)'), 'date')}${wireProfile ? '' : field('fixedMonthly', t('Fixed monthly fee (separate)', 'Opłata stała miesięczna (osobno)'), 'number')}</div>
${wireProfile ? wireFields() : ''}
<h3>${esc(t('Energy and variable fees per kWh', 'Energia i opłaty zmienne za kWh'))}</h3><p>${esc(wireProfile ? t('Empty fees stay unknown; zero is a known zero. Calendar fee shares are calculated by the backend.', 'Puste opłaty pozostają nieznane; zero jest znaną wartością. Udział opłat za okres oblicza backend.') : t('Empty = unknown; zero is a known zero. Fixed monthly fees are shown separately, never prorated.', 'Puste = nieznane; zero jest znaną wartością zero. Opłata stała jest osobna, bez proporcjonalnego naliczania.'))}</p>${
(p.zones || []).map((_, i) => `<fieldset><legend>${esc(t('Zone', 'Strefa'))} ${i + 1}</legend><div class="ht-tariff-grid">${field(`zones.${i}.id`, t('Zone ID', 'ID strefy'))}${field(`zones.${i}.label`, t('Zone label', 'Etykieta strefy'))}${field(`zones.${i}.energyRate`, t('Energy / kWh', 'Energia / kWh'), 'number')}${field(`zones.${i}.variableRate`, t('Variable fees / kWh (optional)', 'Opłaty zmienne / kWh (opcjonalne)'), 'number')}${field(`zones.${i}.classification`, t('Zone type (optional)', 'Rodzaj strefy (opcjonalnie)'), 'text', [['', t('Unknown', 'Nieznana')], ['cheap', t('Cheap', 'Tania')], ['expensive', t('Expensive', 'Droga')], ['mixed', t('Mixed', 'Mieszana')]])}</div>${mutable() ? button(`remove-zone:${i}`, t('Remove zone', 'Usuń strefę')) : ''}</fieldset>`).join('')}${mutable() ? button('add-zone', t('Add zone', 'Dodaj strefę')) : ''}${field('defaultZone', t('Default zone (optional)', 'Strefa domyślna (opcjonalna)'), 'text', zoneChoices())}
<h3>${esc(t('Schedule rules', 'Reguły harmonogramu'))}</h3>${rows('rules')}${mutable() ? button('add-rule', t('Add rule', 'Dodaj regułę')) : ''}<h3>${esc(t('Date exceptions', 'Wyjątki dat'))}</h3>${rows('exceptions')}${mutable() ? button('add-exception', t('Add date exception', 'Dodaj wyjątek daty')) : ''}
<details><summary>${esc(t('Advanced: absolute dynamic price feed', 'Zaawansowane: bezwzględne przedziały cen dynamicznych'))}</summary><p>${esc(t('Optional dynamic feed overrides schedule prices. Use explicit UTC/offset timestamps. Only this feed uses JSON. Each interval may include classification: cheap, expensive or mixed; omission means unknown.', 'Opcjonalny feed dynamiczny zastępuje ceny harmonogramu. Użyj znaczników UTC lub z przesunięciem. JSON służy wyłącznie temu feedowi. Przedział może mieć classification: cheap, expensive lub mixed; brak oznacza nieznaną strefę.'))}</p><label class="ht-tariff-field"><span>${esc(t('Dynamic feed JSON (empty = off)', 'Feed dynamiczny JSON (pusty = wyłączony)'))}</span><textarea data-feed="true"${mutable() ? '' : ' disabled'}>${esc(state.feedText ?? (p.dynamic == null ? '' : JSON.stringify(p.dynamic, null, 2)))}</textarea></label>${field('allowNegativeEnergy', t('Negative energy prices', 'Ujemne ceny energii'), 'text', [['false', t('Disabled', 'Wyłączone')], ['true', t('Explicitly allowed', 'Jawnie dozwolone')]])}</details>
<div role="status" aria-live="polite" data-status="${esc(state.status)}">${statusHtml()}${state.message ? ': ' + esc(localMessage()) : ''}</div><div class="ht-tariff-actions"><button type="button" data-action="load"${state.busy || guard.occupied() || !available(a) ? ' disabled' : ''}>${esc(t('Load stored tariff', 'Wczytaj zapisaną taryfę'))}</button>${canEdit(a) ? `<button type="button" data-action="save"${state.busy || guard.occupied() || !available(a) || state.writeUnconfirmed || state.backendAvailable === false || !Number.isSafeInteger(state.revision) ? ' disabled' : ''}>${esc(t('Save tariff', 'Zapisz taryfę'))}</button><button type="button" data-action="cancel"${state.busy || guard.occupied() ? ' disabled' : ''}>${esc(t('Cancel', 'Anuluj'))}</button>` : ''}</div></section>`;
    bindWire();
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
      if(wireProfile && action==='add-fixed'){
        p.fixed ||= [];let id='fee-'+(p.fixed.length+1);while(p.fixed.some(f=>f.id===id))id+='-new';p.fixed.push({id,label:'',monthly:null});
      }else if(wireProfile && action==='remove-fixed')p.fixed.splice(Number(args[0]),1);
      else if (action === 'add-zone') {
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
        (focusKey.weekday && el.dataset.weekday === focusKey.weekday) || (focusKey.feed && el.dataset.feed === focusKey.feed) || (focusKey.wire && el.dataset.wireFocus===focusKey.wire));
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
  return { render, load, cancel, openMode, dispose: () => { disposed = true; operation++; unsubscribe(); unsubscribeWire(); } };
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
    const bookSnapshot = isSnapshot && descriptor.snapshot?.source === 'shared';
    const wireDescriptor = bookSnapshot ? {...descriptor,...descriptor.snapshot} : descriptor;
    if(wireDescriptor.source==='override') request.profile=copy(wireDescriptor.profile);
    if(!isSnapshot) request.queries=batch.map(j=>({buckets:j.buckets}));
    try {
      const result=await guard.call(token,request);
      if(!still(token,version,key) || isSnapshot && snapshotSlot !== batch[0] || !envelope(result,wireDescriptor)) return;
      if(isSnapshot) {
        const r=result;
        if(!['ready','partial','unavailable'].includes(r.status) || !finite(stamp(r.generated_at)) || !r.current || typeof r.current.available!=='boolean' ||
          ![null,'cheap','expensive','mixed'].includes(r.current.zone_class) || !['energy_rate','variable_rate','usage_rate'].every(k=>number(r.current[k])) ||
          ![null,true,false].includes(r.current.cheap) || !r.today || !['energy_cost','variable_cost','usage_cost'].every(k=>number(r.today[k])) ||
          !(r.currency===null || typeof r.currency==='string' && /^[A-Z]{3}$/.test(r.currency)) ||
          !r.next_cheap || !['known','unknown','not_found_in_horizon'].includes(r.next_cheap.status) ||
          r.next_cheap.status==='known' && !finite(stamp(r.next_cheap.start))) throw Error('invalid_backend_response');
        if(!bookSnapshot && r.currency !== (wireDescriptor.profile?.currency ?? null)) throw Error('invalid_backend_response');
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
// Native administrator UI; all pricing and statistics remain server owned.
function createEnergyStatisticsUiV53({card,guard,host,isActive}) {
  const text = (en,pl) => String(card._hass?.locale?.language || card._hass?.language || '').startsWith('pl') ? pl : en;
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const keys = (v,list) => object(v) && Object.keys(v).length === list.length && list.every(k => Object.hasOwn(v,k));
  const str = (v,max=1024) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const integer = v => Number.isSafeInteger(v) && v >= 0;
  // Signatures are opaque JSON, never reconstructed from browser state. Bound
  // depth, nodes and characters before copying, including fields not rendered in UI.
  const detached = value => {
    let nodes=0,bytes=0;
    const copy = (v,depth) => {
      if (++nodes > 32768 || depth > 8) throw Error('invalid_statistics');
      if (v === null || typeof v === 'boolean') return v;
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') { bytes+=v.length; if(bytes>262144 || v.length>16384) throw Error('invalid_statistics'); return v; }
      if (Array.isArray(v)) { if(v.length>4096) throw Error('invalid_statistics'); return v.map(x=>copy(x,depth+1)); }
      if (!object(v)) throw Error('invalid_statistics');
      const out={};
      for(const k of Object.keys(v)) {
        if(k==='__proto__' || k==='constructor' || k==='prototype' || k.length>128) throw Error('invalid_statistics');
        bytes+=k.length; out[k]=copy(v[k],depth+1);
      }
      return out;
    };
    return copy(value,0);
  };
  const binding = value => {
    const v=detached(value);
    if(!keys(v,['entry_id','source_signature','normalization_signature','source_ids','measurement_timezone','policy_signature','feature_access_revision','tariff_id','currency','price_basis','membership_mode']) ||
      !['entry_id','measurement_timezone','tariff_id','currency','price_basis'].every(k=>str(v[k])) || v.membership_mode!=='current_snapshot' ||
      !Array.isArray(v.source_ids) || v.source_ids.length>4096 || v.source_ids.some(s=>!str(s)) || new Set(v.source_ids).size!==v.source_ids.length) throw Error('invalid_statistics');
    return v;
  };
  const status = value => {
    const v=detached(value);
    if(!keys(v,['enabled','revision','reader_scope','warning','membership_mode','pending','author_user_id','active_epoch','dataset','catalog',...(Object.hasOwn(v,'automation')?['automation']:[]),...(Object.hasOwn(v,'unconfirmed_history')?['unconfirmed_history']:[])]) || typeof v.enabled!=='boolean' || typeof v.pending!=='boolean' || !integer(v.revision) ||
      v.reader_scope!=='all_authenticated_ha_users' || v.membership_mode!=='current_snapshot' || !str(v.warning,4096) || (v.author_user_id!==null&&!str(v.author_user_id,128)) || (v.active_epoch!==null&&!str(v.active_epoch,128)) ||
      !Array.isArray(v.catalog) || v.catalog.length>4096) throw Error('invalid_statistics');
    if(Object.hasOwn(v,'unconfirmed_history') && (!integer(v.unconfirmed_history) || v.unconfirmed_history>4096)) throw Error('invalid_statistics');
    if(Object.hasOwn(v,'automation') && (!keys(v.automation,['state','last_completed_hour']) ||
      !['disabled','starting','active','paused','unavailable'].includes(v.automation.state) ||
      (v.automation.last_completed_hour!==null && (!str(v.automation.last_completed_hour,64) || !Number.isFinite(Date.parse(v.automation.last_completed_hour)))))) throw Error('invalid_statistics');
    if(v.dataset!==null) v.dataset=binding(v.dataset);
    if(v.enabled && (!v.dataset || !v.author_user_id || !v.active_epoch)) throw Error('invalid_statistics');
    const ids=new Set();
    for(const row of v.catalog) {
      if(!keys(row,['statistic_id','name','currency','price_basis','epoch','current_dataset']) || !['statistic_id','name','currency','price_basis','epoch'].every(k=>str(row[k])) || typeof row.current_dataset!=='boolean' || ids.has(row.statistic_id)) throw Error('invalid_statistics');
      ids.add(row.statistic_id);
    }
    return v;
  };
  const prepared = value => {
    if(!keys(value,['proposal','revision','warning','membership_mode']) || !integer(value.revision) || !str(value.warning,4096) || value.membership_mode!=='current_snapshot') throw Error('invalid_statistics');
    return {proposal:binding(value.proposal),revision:value.revision,warning:value.warning,membership_mode:value.membership_mode};
  };
  let dialog=null, token=null, generation=0, snapshot=null, proposal=null, checked=false, note='', opener=null;
  let raw=null, busy=false, uncertain=false, subscription=null;
  const allowed = () => card.isConnected && card.preview!==true && host.isConnected && isActive() && card._hass?.user?.is_admin===true;
  const current = task => {
    try { return !!dialog?.isConnected && dialog.open && allowed() && task.generation===generation && guard.current(task.token,true); } catch (_) { return false; }
  };
  const dispose = unsubscribe => { try { Promise.resolve(unsubscribe?.()).catch(()=>{}); } catch (_) { /* No transport diagnostic is rendered or logged. */ } };
  const close = () => {
    generation++; dispose(subscription); subscription=null; snapshot=null; proposal=null; checked=false; token=null; note='';
    const previous=opener; opener=null;
    if(dialog) { const previousDialog=dialog; dialog=null; if(previousDialog.open) previousDialog.close(); previousDialog.remove(); }
    // Do not free raw on cancel, public timeout, disconnect or role change.
    if(previous?.isConnected && allowed()) previous.focus({preventScroll:true});
  };
  const update = () => { if(dialog && (!allowed() || !guard.current(token,true) || !dialog.isConnected)) close(); };
  const paint = () => {
    if(!dialog || !current({generation,token})) { update(); return; }
    const busyNow=busy || !!raw || guard.occupied();
    dialog.querySelector('[data-statistics-note]').textContent=note || text('Review the dataset before enabling. Enabling starts automatic updates every hour.','Sprawdź zestaw przed włączeniem. Włączenie uruchamia automatyczną aktualizację co godzinę.');
    dialog.querySelector('[data-statistics-state]').textContent=snapshot ? text(snapshot.enabled?'Enabled':'Disabled',snapshot.enabled?'Włączone':'Wyłączone') + (snapshot.pending?text(' · Unconfirmed operation',' · Niepotwierdzona operacja'):'') : text('Status unavailable','Stan niedostępny');
    if(snapshot?.automation) {
      const state=snapshot.automation.state;
      const label=state==='paused' ? text('Paused — review sources and permissions, then enable again.','Wstrzymane — sprawdź źródła i uprawnienia, potem włącz ponownie.') :
        state==='active' ? text('Automatic updates every hour','Aktualizacja automatyczna co godzinę') :
        state==='starting' ? text('Starting automatic updates','Uruchamianie aktualizacji automatycznych') :
        state==='unavailable' ? text('Automatic updates unavailable — enable again after checking the integration.','Aktualizacja automatyczna niedostępna — sprawdź integrację i włącz ponownie.') :
        text('Automatic updates disabled','Aktualizacja automatyczna wyłączona');
      dialog.querySelector('[data-statistics-state]').textContent+=' · '+label;
    }
    const data=dialog.querySelector('[data-statistics-dataset]'); data.replaceChildren();
    const row=(parent,value)=>{const p=document.createElement('p');p.textContent=value;parent.append(p);};
    const p=proposal?.proposal;
    if(p) { row(data,text('Proposed dataset','Proponowany zestaw')+`: ${p.currency} · ${p.price_basis}`); row(data,text('Sources: ','Źródła: ')+p.source_ids.join(', ')); }
    const list=dialog.querySelector('[data-statistics-catalog]');list.replaceChildren();
    if(snapshot) {
      row(list,text('Existing statistics: ','Istniejące statystyki: ')+snapshot.catalog.length);
      if(snapshot.unconfirmed_history) row(list,text('Unconfirmed history: ','Niepotwierdzona historia: ')+snapshot.unconfirmed_history+text('. No retries. Previously queued work may still finish; published history remains readable.','. Bez ponowień. Wcześniej zakolejkowana praca może się zakończyć; opublikowana historia pozostaje czytelna.'));
      for(const item of snapshot.catalog) row(list,`${item.name} · ${item.statistic_id} · ${item.currency} · ${item.price_basis} · ${text(item.current_dataset?'current dataset':'earlier dataset',item.current_dataset?'bieżący zestaw':'wcześniejszy zestaw')}`);
    }
    const checkbox=dialog.querySelector('input');checkbox.checked=checked;checkbox.disabled=busyNow || uncertain || !proposal;
    const own=snapshot?.enabled && snapshot.author_user_id===card._hass?.user?.id;
    dialog.querySelector('[data-statistics-read]').disabled=busyNow;
    dialog.querySelector('[data-statistics-enable]').disabled=busyNow || uncertain || !checked || !proposal || !snapshot || (snapshot.pending && snapshot.author_user_id!==card._hass?.user?.id) || proposal.revision!==snapshot.revision;
    dialog.querySelector('[data-statistics-disable]').disabled=busyNow || uncertain || !snapshot || (!snapshot.enabled && !snapshot.pending);
    dialog.querySelector('[data-statistics-refresh]').disabled=busyNow || uncertain || !own || snapshot.pending;
    dialog.querySelector('[data-statistics-backfill]').disabled=busyNow || uncertain || !own || snapshot.pending || !checked || !proposal || proposal.revision!==snapshot.revision;
  };
  const subscribe = async task => {
    if(subscription) return;
    const connection=card._hass?.connection;
    if(typeof connection?.subscribeMessage!=='function' || raw || guard.occupied()) throw Error('statistics_subscription_unavailable');
    const lane={publicDone:false,settled:false};raw=lane;
    let expired=false,timer;
    const acknowledgement=Promise.resolve().then(()=>{
      if(!current(task)) throw Error('statistics_cancelled');
      return connection.subscribeMessage(()=>{if(current(task))close();},{type:'ha_tools_email/subscribe_analysis_updates'});
    }).then(dispose=>{
      if(typeof dispose!=='function') throw Error('statistics_subscription_unavailable');
      if(expired || !current(task)) { const lateDispose=dispose; try { Promise.resolve(lateDispose()).catch(()=>{}); } catch (_) {} throw Error('statistics_cancelled'); }
      subscription=dispose;
    }).finally(()=>{lane.settled=true;if(lane.publicDone && raw===lane)raw=null;paint();});
    try {
      await Promise.race([acknowledgement,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(Error('statistics_subscription_timeout'));},15000);})]);
    } finally {
      clearTimeout(timer);lane.publicDone=true;if(lane.settled && raw===lane)raw=null;
    }
  };
  const call = async (task,operation,payload={},write=false) => {
    if(!current(task) || raw || guard.occupied()) throw Error('statistics_busy');
    const lane={publicDone:false,settled:false,wire:true}; raw=lane;
    try {
      const value=await guard.call(task.token,{type:`ha_tools_email/energy_statistics_${operation}`,...payload},true);
      if(!current(task)) throw Error('statistics_cancelled');
      return value;
    } catch(error) { if(write) uncertain=true; throw error; }
    finally {
      lane.publicDone=true;
      if(lane.settled || !guard.occupied()) { if(raw===lane) raw=null; }
      paint();
    }
  };
  const run = async operation => {
    update(); if(!dialog || busy || raw || guard.occupied()) return;
    const task={generation,token}; if(!current(task)) return;
    busy=true;note='';paint();
    try {
      if(operation==='read') {
        proposal=null;checked=false;snapshot=null;
        await subscribe(task);
        if(!current(task))return;
        snapshot=status(await call(task,'status'));
        if(!current(task)) return;
        // Readback reconciles an uncertain write; no mutation is retried.
        uncertain=false;paint();
        // A confirmed pending intent can still be disabled, or reauthorized
        // for the same dataset with a fresh proposal and explicit consent.
        // Proposal/source failure must not discard the confirmed control state.
        try {
          const next=prepared(await call(task,'prepare'));
          if(!current(task)) return;
          if(next.revision!==snapshot.revision) throw Error('statistics_changed');
          proposal=next;
        } catch (_) {
          if(!current(task)) return;
          proposal=null;checked=false;
          note=text('Proposal unavailable. Sharing can still be disabled.','Propozycja niedostępna. Nadal można wyłączyć udostępnianie.');
        }
      } else {
        const before=snapshot, chosen=proposal;
        if(uncertain || !before) return;
        let payload;
        if(operation==='enable') {
          if(!checked || !chosen || chosen.revision!==before.revision || (before.pending && before.author_user_id!==card._hass?.user?.id)) return;
          payload={proposal:detached(chosen.proposal),expected_revision:chosen.revision,acknowledge_global:true,acknowledge_current_membership:true};
        } else if(operation==='disable') {
          if(!before.enabled && !before.pending) return; payload={expected_revision:before.revision};
        } else {
          if(before.pending || !before.enabled || before.author_user_id!==card._hass?.user?.id) return;
          if(operation==='backfill' && (!checked || !chosen || chosen.revision!==before.revision)) return;
          payload=operation==='backfill'?{backfill:true,acknowledge_current_membership:true}:{backfill:false,acknowledge_current_membership:false};
        }
        // A failed or malformed mutation ACK is uncertain until explicit readback.
        uncertain=true;proposal=null;checked=false;
        const result=status(await call(task,operation==='backfill'?'refresh':operation,payload,true));
        if(!current(task)) return;
        if((operation==='enable' && (!result.enabled || result.revision<=before.revision)) || (operation==='disable' && (result.enabled || result.revision<=before.revision))) throw Error('statistics_unconfirmed');
        snapshot=result;uncertain=false;
        note=result.pending ? text('Sharing change confirmed. A prior statistics import remains unconfirmed.','Zmiana udostępniania potwierdzona. Wcześniejszy import statystyk pozostaje niepotwierdzony.') : text('Operation confirmed. Read status to review a new proposal.','Operacja potwierdzona. Odczytaj stan, aby sprawdzić nową propozycję.');
      }
    } catch(error) {
      if(current(task)) {
        proposal=null;checked=false;
        if(error?.code==='unauthorized') { snapshot=null;note=text('Administrator access denied.','Brak dostępu administratora.'); }
        else note=uncertain ? text('Operation unconfirmed. Read status before another change; no automatic retry.','Operacja niepotwierdzona. Odczytaj stan przed kolejną zmianą; bez automatycznego ponawiania.') : text('Unavailable or dataset changed. Read status again.','Niedostępne lub zestaw się zmienił. Odczytaj stan ponownie.');
      }
    } finally { busy=false;paint(); }
  };
  const open = origin => {
    update(); if(dialog) return;
    const next=guard.snapshot(); if(!allowed() || !guard.available(next) || !guard.current(next,true)) return;
    token=next;generation++;opener=origin;
    dialog=document.createElement('dialog');dialog.dataset.energyStatisticsDialog='';dialog.setAttribute('aria-label',text('Cost statistics','Statystyki kosztów'));
    const style=document.createElement('style');style.textContent='[data-energy-statistics-dialog]{box-sizing:border-box;width:min(640px,calc(100vw - 32px));max-height:85vh;overflow:auto;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);background:var(--card-background-color);color:var(--primary-text-color);padding:20px;font-size:14px}[data-energy-statistics-dialog]::backdrop{background:rgba(0,0,0,.45)}[data-energy-statistics-dialog] h2{font-size:20px}[data-energy-statistics-dialog] p{overflow-wrap:anywhere}[data-energy-statistics-dialog] label{display:flex;gap:12px;align-items:center;min-height:44px}[data-energy-statistics-dialog] input{min-width:24px;min-height:24px}[data-energy-statistics-dialog] button{font:inherit;min-height:44px;min-width:44px;padding:10px 14px;margin:4px;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);color:var(--primary-text-color)}[data-energy-statistics-dialog] button:focus-visible,[data-energy-statistics-dialog] input:focus-visible{outline:3px solid var(--primary-color);outline-offset:2px}[data-statistics-catalog]{font-size:12px}';
    dialog.append(style);
    const element=(tag,value,attr)=>{const e=document.createElement(tag);if(value)e.textContent=value;if(attr)e.setAttribute(attr,'');dialog.append(e);return e;};
    element('h2',text('Cost statistics','Statystyki kosztów'));
    element('p',text('Published history is readable by all authenticated Home Assistant users. Disabling stops future writes; existing history remains readable, including exported copies.','Opublikowaną historię mogą czytać wszyscy zalogowani użytkownicy Home Assistant. Wyłączenie zatrzymuje przyszłe zapisy; istniejąca historia pozostaje dostępna, także w wyeksportowanych kopiach.'));
    element('p',text('History uses the current source membership, including when adding the last 7 days. Historical membership is not reconstructed. After enabling, the last completed hour is added automatically, then every hour.','Historia używa aktualnego przypisania źródeł, także przy dodawaniu ostatnich 7 dni. Dawne przypisanie nie jest odtwarzane. Po włączeniu ostatnia zakończona godzina jest dodawana automatycznie, potem co godzinę.'));
    element('p',null,'data-statistics-state');element('p',null,'data-statistics-note').setAttribute('role','status');element('div',null,'data-statistics-dataset');element('div',null,'data-statistics-catalog');
    const label=element('label'),checkbox=document.createElement('input');checkbox.type='checkbox';label.append(checkbox,document.createTextNode(text('I agree to global sharing and using the current source membership for this dataset.','Zgadzam się na udostępnienie wszystkim oraz użycie aktualnego przypisania źródeł dla tego zestawu.')));
    checkbox.addEventListener('change',()=>{update();if(!dialog)return;checked=checkbox.checked;paint();});
    for(const [action,en,pl] of [['read','Read status','Odczytaj stan'],['enable','Enable','Włącz'],['disable','Disable','Wyłącz'],['refresh','Refresh statistics','Odśwież statystyki'],['backfill','Add 7 days with current membership','Dodaj 7 dni z aktualnym przypisaniem']]) {
      const button=element('button',text(en,pl),`data-statistics-${action}`);button.type='button';button.addEventListener('click',()=>{void run(action);});
    }
    const cancel=element('button',text('Close','Zamknij'),'data-statistics-close');cancel.type='button';cancel.addEventListener('click',close);
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('close',()=>{if(dialog && !dialog.open)close();});
    host.append(dialog);
    if(typeof dialog.showModal!=='function') { close();return; }
    try { dialog.showModal(); } catch (_) { close();return; }
    cancel.focus({preventScroll:true});paint();void run('read');
  };
  guard.subscribe(()=>{if(dialog)close();});
  guard.subscribeWire(()=>{if(raw?.wire){raw.settled=true;if(raw.publicDone)raw=null;}paint();});
  return {open,close,stop:close,update};
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
  let confirmedRevision = null, confirmedUpdatedAt = null, pending = null, attemptedEpoch = null, cachedKey, cachedModel, editorRoot, editor, focusKey = null, wireRoot, wireEditor;
  const state = () => (card._tariffEditorState ||= { profile: null, revision: null, status: 'not_checked', busy: false });
  const effectiveConfig = () => {
    const config = card._config || {};
    if (Object.hasOwn(config, 'tariff_profile')) return config;
    return card._sharedTariffProfile != null && same(card._sharedTariffAssociation, identity(card._hass))
      ? { ...config, tariff_profile: card._sharedTariffProfile } : config;
  };
  const activeProfile = () => legacyProfile(effectiveConfig(), card._hass?.config, kind);
  const describe = () => {
    const confirmedShared = !Object.hasOwn(card._config || {}, 'tariff_profile') &&
      card._sharedTariffReadStatus === 'success' && same(card._sharedTariffAssociation, identity());
    const shared = confirmedShared && card._sharedTariffProfile != null;
    return {profile: activeProfile() ?? null, source: shared ? 'shared' : 'override', revision: shared ? confirmedRevision : null,
      ready: Object.hasOwn(card._config || {}, 'tariff_profile') || card._sharedTariffReadStatus === 'success',
      // The public household snapshot belongs to the server's active book.
      // Legacy price queries retain their profile and currency contract.
      ...(confirmedShared ? {snapshot:{source:'shared',revision:confirmedRevision}} : {})};
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
    wireEditor?.dispose?.();wireRoot?.replaceChildren();wireRoot=null;wireEditor=null;card._tariffWireEditorState=null;card._tariffProfileModeV53=false;
    backend.invalidate();
    cachedKey = undefined; cachedModel = undefined; editorRoot?.replaceChildren(); editor?.dispose?.(); editorRoot = null; editor = null; focusKey = null;
    for (const mount of card.shadowRoot?.querySelectorAll('[data-tariff-mount]') || []) mount.replaceChildren();
    const details = card.shadowRoot?.querySelector('[data-tariff-details]'); if (details) details.open = false;
    // Pending raw request remains owned by guard; a new epoch cannot free it.
  };
  guard.subscribe(purge);
  const reset = (...nextHass) => guard.observe(...nextHass);
  // An explicit read blocked by another raw request waits for real settlement.
  // Acquire synchronously in the listener so queued snapshot jobs cannot steal it.
  const acquireRead = token => new Promise(resolve => {
    let finished = false, unWire = () => {}, unAuthority = () => {};
    const finish = owner => {
      if (finished) return;
      finished = true; unWire(); unAuthority(); resolve(owner);
    };
    const check = () => {
      if (finished) return;
      if (!guard.current(token)) { finish(null); return; }
      if (guard.occupied()) return;
      try { finish(guard.reserve?.(token) || { release: () => {} }); }
      catch (_) { finish(null); }
    };
    unWire = guard.subscribeWire(check);
    unAuthority = guard.subscribe(check);
    check();
  });
  const load = async (force = false, minimumRevision = 0) => {
    const token = identity();
    if (!guard.available(token)) return false;
    if (card._sharedTariffReadStatus === 'success' && same(card._sharedTariffAssociation, token) && confirmedRevision >= minimumRevision) return true;
    if (pending) return pending;
    // A timed-out tariff read keeps its original raw fence; never queue its replay.
    if (guard.occupied() && attemptedEpoch === token.epoch) return false;
    if (!force && attemptedEpoch === token.epoch) return false;
    attemptedEpoch = token.epoch;
    const operation = (async () => {
      let owner = null;
      if (guard.occupied()) {
        owner = await acquireRead(token);
        if (!owner) return false;
      }
      try {
        const result = await guard.call(token, { type: 'ha_tools_email/get_tariff' }, false, owner);
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
      } finally { owner?.release(); }
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
      action: active.dataset.action, weekday: active.dataset.weekday, feed: active.dataset.feed, wire:active.dataset.wireFocus,
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
    <div data-tariff-mount></div><div data-tariff-wire-mount hidden></div></details>`;
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
  const mountWire = root => {
    if(wireRoot!==root || !wireEditor){
      wireEditor?.dispose?.();wireRoot=root;
      const saved=card._tariffWireEditorState ||= {profile:null,revision:null,status:'not_checked',busy:false,backendAvailable:false};
      wireEditor=createSettings({root,getHass:()=>card._hass,language,state:saved,validate:createModel,guard,wireProfile:true,
        ui:()=>createUi({language:language()}),
        onSaved:()=>{backend.invalidate();cachedKey=undefined;cachedModel=undefined;card._analysisHostV53?.invalidate();card._build1ClientV53?.refresh();},
        onCancel:()=>{card._tariffSettingsOpen=false;const details=card.shadowRoot?.querySelector('[data-tariff-details]');if(details){details.open=false;details.querySelector('summary')?.focus();}}});
    }
    wireEditor.render();
  };
  const openProfile = async (mode='edit') => {
    if(!['edit','history','templates'].includes(mode))return false;
    card._tariffSettingsOpen=true;card._tariffProfileModeV53=true;
    const details=card.shadowRoot?.querySelector('[data-tariff-details]');if(!details)return false;
    details.open=true;bind();await wireEditor?.openMode?.(mode);
    if(guard.available(identity()))wireRoot?.querySelector(mode==='templates'?'[data-wire-template]':'[data-wire-history]')?.focus();
    return true;
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
    let wire=details.querySelector('[data-tariff-wire-mount]');
    if(wireRoot && wire!==wireRoot){wire.replaceWith(wireRoot);wire=wireRoot;}
    root.hidden=card._tariffProfileModeV53===true;wire.hidden=!root.hidden;
    if (!details.dataset.bound) {
      details.dataset.bound = 'true';
      details.addEventListener('toggle', () => {
        card._tariffSettingsOpen = details.open;
        if (details.open) {if(card._tariffProfileModeV53)mountWire(wire);else mount(root);}
      });
    }
    if (details.open) {if(card._tariffProfileModeV53)mountWire(wire);else mount(root);}
    if (focusKey) {
      const key = focusKey; focusKey = null;
      const target = key.summary ? details.querySelector('summary') : details.open &&
        [...(card._tariffProfileModeV53?wire:root).querySelectorAll('input,select,textarea,button')].find(el =>
          (key.path && el.dataset.path === key.path) || (key.action && el.dataset.action === key.action) ||
          (key.weekday && el.dataset.weekday === key.weekday) || (key.feed && el.dataset.feed === key.feed) || (key.wire && el.dataset.wireFocus===key.wire));
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
  const statistics = options => createEnergyStatisticsUiV53({card,guard,...options});
  return { createGuard: createTariffGuardV3, statistics, reportStatus, summary, analysis: () => createEnergyAnalysisHostV53({card}), model, profile: activeProfile, currency, reset, load, snapshot, markup, bind, openProfile, guard, backend, ui: () => createUi({ language: language() }) };
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
  // Additive HA facts are separate from tariff-book totals. Reject malformed facts
  // before caching: neither a current price nor a partial amount is a period bill.
  const validateNativePricing = native => {
    if (native === null || native === undefined) return true;
    const keys = (v, allowed) => object(v) && Object.keys(v).every(k=>allowed.includes(k));
    const text = v => typeof v === 'string' && v.length > 0 && v.length <= 256;
    const reason = v => v === null || text(v);
    const amount = v => v === null || typeof v === 'string' && v.length <= 1024 && decimal(v);
    const currency = v => v === null || typeof v === 'string' && /^[A-Z]{3}$/.test(v);
    const integer = v => Number.isSafeInteger(v) && v >= 0;
    if (!keys(native,['schema','source','period_cost','current_prices','provenance']) || native.schema !== 1 || native.source !== 'ha_energy' ||
      !Array.isArray(native.current_prices) || native.current_prices.length > 512 || !Array.isArray(native.provenance) || native.provenance.length > 512) return false;
    const p=native.period_cost, c=p?.coverage;
    if (!keys(p,['status','amount','recorded_amount','currency','scope','coverage','components_status','fixed_fees_status','reason']) ||
      !['ready','partial','unavailable','not_configured'].includes(p.status) || !amount(p.amount) || !amount(p.recorded_amount) || !currency(p.currency) ||
      p.scope !== 'grid_import_recorded_cost' || p.components_status !== 'unknown' || p.fixed_fees_status !== 'unknown' || !reason(p.reason) ||
      !keys(c,['complete','expected_source_hours','measured_source_hours']) || typeof c.complete !== 'boolean' || !integer(c.expected_source_hours) ||
      !integer(c.measured_source_hours) || c.measured_source_hours > c.expected_source_hours ||
      c.complete !== (c.expected_source_hours > 0 && c.measured_source_hours === c.expected_source_hours)) return false;
    if (p.status === 'ready' ? !c.complete || p.amount === null || p.recorded_amount === null || p.currency === null || p.reason !== null : p.amount !== null || c.complete) return false;
    if (p.status === 'partial' && (p.recorded_amount === null || p.currency === null) ||
      ['unavailable','not_configured'].includes(p.status) && p.recorded_amount !== null) return false;
    return native.current_prices.every(row=>keys(row,['source_id','origin','price','currency','energy_unit','observed_at','historical','status','reason']) &&
      text(row.source_id) && ['number_energy_price','entity_energy_price'].includes(row.origin) && amount(row.price) && currency(row.currency) &&
      row.energy_unit === 'kWh' && Number.isFinite(stamp(row.observed_at)) && row.historical === false && reason(row.reason) &&
      (row.status === 'ready' ? row.price !== null && row.currency !== null && row.reason === null : row.status === 'unavailable' && row.price === null)) &&
      native.provenance.every(row=>keys(row,['energy_source_id','cost_statistic_id']) && text(row.energy_source_id) && (row.cost_statistic_id === null || text(row.cost_statistic_id)));
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
    return validateNativePricing(dto.native_pricing) && walk(dto);
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
  const briefNumber=(value,places,minimum=places,signed=false)=>{
    if(!valid(value))return unknown();
    const options={minimumFractionDigits:minimum,maximumFractionDigits:places};
    const shown=number(value,options),direction=compare(value,'0');
    if(direction && shown.replace(/^[-+−]/,'')===number('0',options))
      return (direction<0?'>−':'<')+number(places===0?'1':'0.'+'0'.repeat(places-1)+'1',options);
    return (signed&&direction>0?'+':'')+shown;
  };
  const briefEnergy=(value,signed=false)=>valid(value)?`${briefNumber(value,1,1,signed)} kWh`:unknown();
  const briefMoney=(value,currency,signed=false)=>valid(value)?`${briefNumber(value,2,2,signed)} ${pl&&currency==='PLN'?'zł':currency||t('currency unknown','waluta nieznana')}`:unknown();
  const briefRate=(value,currency)=>valid(value)?`${briefNumber(value,4,2)} ${pl&&currency==='PLN'?'zł':currency||t('currency unknown','waluta nieznana')}`:unknown();
  const briefPercent=value=>valid(value)?ui.number(value,{style:'percent',maximumFractionDigits:0}).replace(/\s+(?=%)/g,''):unknown();
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
  const nativeCostLabel = () => t('Cost recorded in HA','Koszt zapisany w HA');
  const nativeDisclaimer = () => t('Source: Home Assistant Energy, recorded grid-import cost. Cost breakdown and fixed fees are unknown; this is not a complete bill.',
    'Źródło: Home Assistant Energy, zapisany koszt poboru z sieci. Rozbicie kosztu i opłaty stałe są nieznane; to nie jest pełny rachunek.');
  const nativeFacts = snapshot => !snapshot.active_tariff_id && snapshot.native_pricing?.schema === 1 && snapshot.native_pricing.source === 'ha_energy' ? snapshot.native_pricing : null;
  const nativeComplete = snapshot => {
    const p=nativeFacts(snapshot)?.period_cost;
    return p?.status === 'ready' && p.coverage?.complete === true && valid(p.amount) && /^[A-Z]{3}$/.test(p.currency || '') ? p : null;
  };
  const nativeMoney = p => `${number(p.amount,{minimumFractionDigits:2,maximumFractionDigits:2})} ${p.currency}`;
  const nativeDetails = snapshot => {
    const native=nativeFacts(snapshot); if (!native) return '';
    const p=native.period_cost, complete=nativeComplete(snapshot), c=p.coverage;
    const label=complete?nativeCostLabel():p.status==='partial'?t('Partial cost recorded in HA','Niepełny koszt zapisany w HA'):t('HA recorded cost unavailable','Zapisany koszt HA niedostępny');
    const value=complete?nativeMoney(complete):p.status==='partial'?money(p.recorded_amount,p.currency):unknown();
    const prices=native.current_prices.map(row=>[esc(row.source_id),esc(row.status==='ready'?money(row.price,row.currency)+'/kWh':unknown()),esc(dateTime(row.observed_at))]);
    return `<section data-analysis-native-pricing><h4>${esc(label)}</h4><p><strong>${esc(value)}</strong>${p.status==='partial'?' · '+esc(t('Recorded subset only; full-period cost unavailable','Tylko zapisany podzbiór; koszt całego okresu niedostępny')):''}</p><p class="analysis-note">${esc(nativeDisclaimer())}</p>
      <details data-analysis-native-details><summary>${esc(t('Exact HA cost and source details','Dokładny koszt HA i źródło'))}</summary><p>${esc(label)}: ${esc(p.amount ?? p.recorded_amount ?? unknown())} ${esc(p.currency || '')}</p><p>${esc(t('Source hours measured / expected','Godziny źródeł zmierzone / oczekiwane'))}: ${esc(c.measured_source_hours)} / ${esc(c.expected_source_hours)}</p>${p.reason?`<p>${esc(p.reason)}</p>`:''}<ul>${native.provenance.map(row=>`<li>${esc(row.energy_source_id)} · ${esc(row.cost_statistic_id || unknown())}</li>`).join('')}</ul></details>
      ${prices.length?`<h4>${esc(t('Current prices · now','Bieżące ceny · teraz'))}</h4><p class="analysis-note">${esc(t('Observed now; not a price for the selected period. No historical cost is calculated from these prices.','Odczytane teraz; nie są cenami za wybrany okres. Nie obliczamy z nich kosztu historycznego.'))}</p>${table(t('Current prices · now','Bieżące ceny · teraz'),[t('Source','Źródło'),t('Price now','Cena teraz'),t('Observed at','Czas odczytu')],prices)}<details data-analysis-native-price-details><summary>${esc(t('Exact current price values','Dokładne wartości bieżących cen'))}</summary><ul>${native.current_prices.map(row=>`<li>${esc(row.source_id)}: ${esc(row.price ?? unknown())} ${esc(row.currency || '')}/kWh · ${esc(row.origin)} · ${esc(row.observed_at)}</li>`).join('')}</ul></details>`:''}</section>`;
  };
  // Describe the displayed household total only with a matching producer delta.
  // Paired/common measurements may be useful in Comparison, but are a different total.
  const kpiComparison = (snapshot,data=false) => {
    const kind=snapshot.context?.comparison_kind || 'previous', c=snapshot.comparisons?.[kind];
    if (!comparisons[kind] || c?.status!=='ready' || c.reason!=null || c.comparison_scope!=='calendar_totals' ||
        snapshot.coverage?.complete!==true || snapshot.totals?.measurement_complete!==true ||
        !valid(c.current_kwh) || !valid(snapshot.totals.kwh) || compare(c.current_kwh,snapshot.totals.kwh)!==0 || !valid(c.delta_kwh))
      return t('No comparable baseline — incomplete or unavailable data','Brak porównywalnego odniesienia — dane niepełne lub niedostępne');
    const direction=compare(c.delta_kwh,'0'), text=direction<0?t('Decrease','Spadek'):direction>0?t('Increase','Wzrost'):t('No change','Bez zmian');
    return `${comparisons[kind]} · ${text} ${data?quantity(c.delta_kwh,'kWh',true):briefEnergy(c.delta_kwh,true)}${valid(c.percent)?' · '+(data?quantity(c.percent,'%',true):briefNumber(c.percent,0,0,true)+'%'):''}`;
  };
  const peakClock = (snapshot,peak) => {
    const plain=ui.clock(peak.start), start=Date.parse(peak.start);
    // Repeated local hours still require the offset, including the first fold.
    const repeated=[-120,-90,-60,-30,30,60,90,120].some(minutes=>{
      const other=new Date(start+minutes*60000).toISOString();
      return ui.clock(other)===plain && ui.date(other)===ui.date(peak.start);
    });
    return ui.clock(peak.start,ui.timeZone!==snapshot.period?.timezone || repeated);
  };
  const tiles = (snapshot, overview=false, data=false) => {
    const total=snapshot.totals || {}, supplied=overview&&Object.hasOwn(snapshot,'period_summary'), native=nativeComplete(snapshot);
    const base=[
      [t('Consumption','Zużycie'),data?quantity(total.kwh):briefEnergy(total.kwh)], [native?nativeCostLabel():t('Cost','Koszt'),native?nativeMoney(native):data?money(total.total_cost,total.currency):briefMoney(total.total_cost,total.currency)],
      native ? [t('Source','Źródło'),'Home Assistant Energy'] : [t('Effective price','Cena efektywna'),(data?money(total.effective_price,total.currency):briefRate(total.effective_price,total.currency)) + (valid(total.effective_price) ? '/kWh' : '')],
      [t('Measurement coverage','Pokrycie pomiarów'),coverage(snapshot.coverage)]
    ];
    if(!supplied)return `<div class="analysis-tiles">${base.map(([label,value],index)=>`<div class="analysis-tile ${index<2?'analysis-tile-primary':'analysis-tile-secondary'}"><span>${esc(label)}</span><strong>${esc(value)}</strong>${index===0?`<span data-analysis-kpi-comparison>${esc(kpiComparison(snapshot,data))}</span>`:''}</div>`).join('')}</div>`;
    const frame=periodWindow(snapshot),share=shareProof(snapshot,frame),peak=peakProof(snapshot,frame);
    const knownPeak=peak&&peak.kwh!==null,localPeak=knownPeak&&peak.reason!=='measurement_timezone_unavailable',partialPeak=peak&&(peak.status==='partial'||knownPeak&&!snapshot.totals?.measurement_complete);
    const shareNote=share?.reason==='zero_total_kwh'?t('No share for a zero energy total','Brak udziału przy zerowym zużyciu'):share?.status==='ready'?(data?quantity(share.known_cheap_kwh):briefEnergy(share.known_cheap_kwh)):t('Full-period share unavailable','Brak udziału za cały okres');
    return `<div class="analysis-tiles">${base.slice(0,2).map(([label,value],index)=>`<div class="analysis-tile analysis-tile-primary"><span>${esc(label)}</span><strong>${esc(value)}</strong>${index===0?`<span data-analysis-kpi-comparison>${esc(kpiComparison(snapshot,data))}</span>`:''}${index===1?`<span>${esc(base[2][0])}: ${esc(base[2][1])}</span>`:''}</div>`).join('')}
      <div class="analysis-tile analysis-tile-secondary" data-analysis-cheap-share><span>${esc(t('Cheap-zone share','Udział taniej strefy'))}</span><strong>${esc(share?.status==='ready'?(data?percentage(share.ratio):briefPercent(share.ratio)):unknown())}</strong><span>${esc(shareNote)}</span></div>
      <div class="analysis-tile analysis-tile-secondary" data-analysis-peak${knownPeak?` data-analysis-peak-id="${esc(peak.id)}"`:''}><span>${esc(partialPeak?t('Highest observed hour','Najwyższe zarejestrowane zużycie'):t('Highest hour','Godzina szczytu'))}</span><strong>${esc(localPeak?peakClock(snapshot,peak)||unknown():unknown())}</strong><span>${esc(knownPeak?(data?quantity(peak.kwh):briefEnergy(peak.kwh))+(localPeak?' · '+date(peak.start):''):unknown())}</span>${partialPeak?`<span>${esc(t('Incomplete period','Niepełny okres'))}</span>`:''}${peak?.reason==='measurement_timezone_unavailable'?`<span>${esc(t('Measurement time zone unavailable','Brak strefy czasu pomiarów'))}</span>`:''}</div></div>`;
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
    if(matches.length===1&&matches[0].classification==='cheap')return 'var(--analysis-zone-cheap,var(--hat-zone-cheap, var(--_hat-zone-cheap)))';
    if(matches.length===1&&matches[0].classification==='expensive')return 'var(--analysis-zone-expensive,var(--hat-zone-exp, var(--_hat-zone-exp)))';
    let hash=0;for(const char of JSON.stringify([version,zone]))hash=(hash*31+char.charCodeAt(0))>>>0;
    return ['var(--hat-s1, var(--_hat-s1))','var(--hat-d2, var(--_hat-d2))','var(--hat-s2, var(--_hat-s2))','var(--hat-s5, var(--_hat-s5))','var(--hat-s3, var(--_hat-s3))','var(--hat-s4, var(--_hat-s4))','var(--hat-unmeasured, var(--_hat-unmeasured))','var(--hat-crit, var(--_hat-crit))'][hash%8];
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
    const legend=items=>`<ul class="analysis-flow-labels">${items.map(item=>`<li>${swatch(item)}<span>${esc(item.label)} · ${esc(briefEnergy(item.kwh))} · ${esc(briefPercent(shareGeometry(item.kwh,total)))}</span></li>`).join('')}</ul>`;
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
      ${zoneLegend}${options.view === 'data'?table(t('Measured intervals · usage cost without fixed fees','Przedziały pomiarowe · koszt zużycia bez opłat stałych'),[t('Period','Okres'),currentLabel+' kWh',t('Household usage cost','Koszt zużycia gospodarstwa'),baselineLabel+' kWh',t('Real baseline intervals','Rzeczywiste przedziały odniesienia'),...(series.common?[t('Whole household kWh','Całe gospodarstwo kWh')]:[]),...(hasZones?[t('Tariff zones in this interval','Strefy taryfy w przedziale')]:[])],rows,'','data-analysis-bin'):`<div class="analysis-chart-scroll"><div class="analysis-chart" style="--analysis-point-count:${Math.max(1,points.length)}" role="group" aria-label="${esc(t('Current and baseline consumption, select a point for values','Bieżące zużycie i odniesienie, wybierz punkt, aby odczytać wartości'))}">${points.map(p=>`<button type="button" class="analysis-point${p.visualCurrent==null?' analysis-missing':''}" data-analysis-action="point" data-analysis-value="${p.index}" aria-pressed="${String(options.selected)===String(p.index)}" aria-label="${esc(pointText(p))}"><span class="analysis-column analysis-series-current" aria-hidden="true" ${columnZones.get(p.index)?` data-analysis-column-zone="${esc(columnZones.get(p.index).key)}"`:''} style="height:${width(p.visualCurrent,max)*1.68}px${columnZones.get(p.index)?';background:'+columnZones.get(p.index).color:options.section==='comparison'?'':';background:var(--secondary-text-color,var(--hat-unmeasured, var(--_hat-unmeasured)))'}"></span>${p.marker?`<span data-analysis-marker class="analysis-baseline-line analysis-series-baseline" aria-label="${esc(pointText(p))}" style="bottom:${40+width(p.marker.baseline,max)*1.68}px"></span>`:''}<span class="analysis-point-label"${axisLabels.has(p.index)&&!majorTicks.has(p.index)?' data-analysis-axis-minor':''} aria-hidden="true">${esc(axisLabels.get(p.index)||'')}</span></button>`).join('')}</div></div>`}
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
    const groupMoney=(value,brief=false)=>groupCurrency?(brief?briefMoney(value,groupCurrency):money(value,groupCurrency)):unknown();
    const details=table(t('Group measurements and usage costs','Pomiary grup i koszty zużycia'),[t('Group','Grupa'),'kWh',t('Usage cost','Koszt zużycia'),t('Coverage','Pokrycie')],rows.map(({label,row})=>[esc(label),esc(quantity(row.kwh)),esc(groupMoney(row.usage_cost)),esc(coverage(row.coverage))]))+
      `<p class="analysis-note">${esc(t('Assignments follow the current Home Assistant registry. No room and unmeasured energy are separate. Group costs exclude household fixed fees.','Przypisania pochodzą z aktualnego rejestru Home Assistant. Bez pokoju i Niezmierzone są osobnymi pozycjami. Koszty grup nie obejmują opłat stałych gospodarstwa.'))}</p>`;
    return `<section data-analysis-groups><h3>${esc(t('Energy flow — from and to','Przepływ energii — skąd i dokąd'))}</h3>${options.view==='data'?'':flow.markup}<div${options.view==='data'?'':' class="analysis-group-summary"'}><div><h4>${esc(t('Selected groups · share of household energy','Wybrane grupy · udział energii gospodarstwa'))}</h4>
      <ol class="analysis-ranking" data-analysis-ranking>${rows.map(({id,label,row})=>`<li data-analysis-rank-id="${esc(id)}" class="${id==='unmeasured'?'analysis-unmeasured':''}"><div><strong><i class="analysis-flow-swatch ${id==='unmeasured'?'analysis-hatched':'rank-'+(colors.get(id)??4)}" aria-hidden="true"></i>${esc(label)}</strong><span>${esc(options.view==='data'?quantity(row.kwh):briefEnergy(row.kwh))} · <span data-analysis-rank-share>${esc(flow.groupReady?(options.view==='data'?percentage(shareGeometry(row.kwh,snapshot.totals?.kwh)):briefPercent(shareGeometry(row.kwh,snapshot.totals?.kwh))):unknown())}</span> · ${esc(groupMoney(row.usage_cost,options.view!=='data'))}</span></div><div class="analysis-track" aria-hidden="true"><span class="analysis-rank rank-${colors.get(id)??4}" style="width:${width(row.kwh,max)}%"></span></div></li>`).join('')}</ol>
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
    const summaryMoney=(value,currency,signed=false)=>data?money(value,currency,signed):briefMoney(value,currency,signed);
    const summaryRate=(value,currency)=>data?money(value,currency):briefRate(value,currency);
    const summaryEnergy=value=>data?quantity(value):briefEnergy(value);
    if (nativeFacts(snapshot)) return `<section class="analysis-rate76" data-analysis-rates><h3>${esc(t('Rates and costs','Stawki i koszty'))}</h3>${nativeDetails(snapshot)}</section>`;
    const currencyKnown=typeof total.currency==='string'&&/^[A-Z]{3}$/.test(total.currency)&&['gross','net'].includes(total.price_basis);
    const positive=value=>valid(value)&&compare(value,'0')>=0;
    const componentKeys=['energy_cost','variable_cost','legacy_combined_cost','fixed_cost'];
    // Only geometry uses Number. Amounts, rates, deltas and monthly fees remain
    // producer values passed directly to the shared formatter, never added here.
    const costReady=currencyKnown&&total.measurement_complete===true&&total.pricing_complete===true&&total.components_complete===true&&
      positive(total.total_cost)&&componentKeys.every(key=>positive(total[key])&&compare(total[key],total.total_cost)<=0);
    const componentLegend=componentKeys.map(key=>`<li><span class="analysis-rate76-swatch analysis-rate76-${key}" aria-hidden="true"></span><span>${esc(costLabels[key])}: <strong>${esc(summaryMoney(total[key],total.currency))}</strong></span></li>`).join('');
    const costGraphic=!data&&costReady?`<div class="analysis-rate76-track" aria-hidden="true">${componentKeys.map(key=>`<span class="analysis-rate76-${key}" data-analysis-rate76-bar style="width:${width(total[key],Number(total.total_cost))}%" title="${esc(costLabels[key]+': '+summaryMoney(total[key],total.currency))}"></span>`).join('')}</div>`:'';
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
      const monthly=Object.entries(feeLabels).filter(([key])=>Object.hasOwn(rate.fixed_monthly || {},key)).map(([key,label])=>`<li>${esc(label)}: <strong>${esc(summaryMoney(rate.fixed_monthly[key],rate.currency))}</strong> / ${esc(t('month','miesiąc'))}</li>`);
      if(rate.legacy_combined_monthly!=null)monthly.push(`<li>${esc(t('Legacy combined monthly fee','Dawna łączna opłata miesięczna'))}: <strong>${esc(summaryMoney(rate.legacy_combined_monthly,rate.currency))}</strong> / ${esc(t('month','miesiąc'))}</li>`);
      const dynamic=(profile.dynamic?.intervals || []).map(row=>[esc(`${dateTime(row.from)} – ${dateTime(row.to)}`),esc(summaryRate(row.energyRate,rate.currency)),esc(summaryRate(row.variableRate,rate.currency))]);
      return `<article class="analysis-rate76-card" data-analysis-rate76-version="${esc(rate.version_id)}"><h4>${esc(t('Rates effective from','Stawki obowiązujące od'))} ${esc(date(rate.valid_from))}${rate.valid_to?' – '+esc(date(rate.valid_to)):''}</h4>
        <p class="analysis-rate76-meta">${esc(rate.currency || unknown())} · ${esc(basis(rate.price_basis))} · ${esc(profile.timezone || unknown())} · ${esc(clock)}</p>
        <ul class="analysis-rate76-rate-list">${zones.map(zone=>{
          const rules=[...(profile.rules || []).filter(rule=>rule.zone===zone.id).map(rule=>ruleText(rule)),...(profile.exceptions || []).filter(rule=>rule.zone===zone.id).map(rule=>t('Exception','Wyjątek')+': '+ruleText(rule))];
          if(zone.id===profile.defaultZone)rules.push(t('Default outside matching rules','Domyślna poza pasującymi regułami'));
          return `<li><strong>${esc(zone.label || t('Unnamed zone','Strefa bez nazwy'))}</strong><div class="analysis-rate76-schedule">${rules.length?rules.map(rule=>`<p>${esc(rule)}</p>`).join(''):esc(unknown())}</div><dl class="analysis-rate76-rate-values"><div><dt>${esc(legacy?t('Combined usage / kWh','Łączna stawka zużycia / kWh'):t('Energy / kWh','Energia / kWh'))}</dt><dd>${esc(summaryRate(zone.energyRate,rate.currency))}</dd></div><div><dt>${esc(t('Distribution / kWh','Dystrybucja / kWh'))}</dt><dd>${esc(legacy?unknown():summaryRate(zone.variableRate,rate.currency))}</dd></div><div><dt>${esc(t('Total / kWh','Razem / kWh'))}</dt><dd data-analysis-rate76-total="${esc(zone.id)}">${esc(summaryRate(combinedRates.get(zone.id),rate.currency))}</dd></div></dl></li>`;
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
    const zoneGraphic=!data&&zoneReady?`<div class="analysis-rate76-track" aria-hidden="true">${proof.zones.map(zone=>`<span data-analysis-rate76-bar style="background:${zoneColor(zone.version_id,zone.zone_id,snapshot)};width:${width(zone.usage_cost,Number(total.usage_cost))}%" title="${esc(zone.label+': '+summaryMoney(zone.usage_cost,proof.currency))}"></span>`).join('')}</div>`:'';
    const zoneRows=proof?.zones.map(zone=>{
      const rate=(snapshot.rates || []).find(row=>row.version_id===zone.version_id),complete=proof.status==='ready'&&zone.complete;
      const known=[[t('Known energy cost','Znany koszt energii'),'energy_cost'],[t('Known distribution cost','Znany koszt dystrybucji'),'variable_cost'],[t('Known legacy usage cost','Znany dawny koszt zużycia'),'legacy_combined_cost']].map(([label,key])=>`${label}: ${summaryMoney(zone.known_costs[key],proof.currency)}`).join(' · ');
      return `<li data-analysis-rate76-zone="${esc(zone.version_id+'|'+zone.zone_id)}"><span class="analysis-rate76-swatch" style="background:${zoneColor(zone.version_id,zone.zone_id,snapshot)}" aria-hidden="true"></span><div><strong>${esc(zone.label)}</strong><span class="analysis-rate76-meta"> · ${esc(t('Rates from','Stawki od'))} ${esc(rate?date(rate.valid_from):unknown())}</span><p>${esc(complete?summaryEnergy(zone.kwh):t('Recorded','Zarejestrowano')+': '+summaryEnergy(zone.recorded_kwh))} · <strong>${esc(summaryMoney(complete?zone.usage_cost:null,proof.currency))}</strong></p>${!complete?`<p class="analysis-rate76-meta">${esc(known)}</p>`:''}</div></li>`;
    }).join('') || '';
    const level=['areas','floors','devices'].includes(options.level)?options.level:'areas';
    const groupRows=rowsFor(groups,level).sort((a,b)=>valid(a.row.usage_cost)&&valid(b.row.usage_cost)?compare(b.row.usage_cost,a.row.usage_cost):valid(a.row.usage_cost)?-1:valid(b.row.usage_cost)?1:0);
    const groupCurrency=currencyKnown&&groups.currency===total.currency&&groups.price_basis===total.price_basis;
    const groupMax=maximum(groupRows.filter(({row})=>positive(row.usage_cost)).map(({row})=>row.usage_cost));
    const groupTitle=level==='devices'?t('Cost by device','Koszt według urządzeń'):level==='floors'?t('Cost by floor','Koszt według pięter'):t('Cost by room','Koszt według pokoi');
    const ranked=groupRows.map(({id,label,row})=>`<li data-analysis-rate76-group="${esc(id)}"${id==='unmeasured'?' class="analysis-rate76-unmeasured"':''}><div class="analysis-rate76-rank-value"><strong>${esc(label)}</strong><strong>${esc(summaryMoney(row.usage_cost,groups.currency))}</strong></div>${!data&&groupCurrency&&row.measurement_complete===true&&positive(row.usage_cost)?`<div class="analysis-rate76-track" aria-hidden="true"><span data-analysis-rate76-bar style="background:${zoneColor('group-'+level,id)};width:${width(row.usage_cost,groupMax)}%"></span></div>`:''}<p class="analysis-rate76-meta">${esc(data?quantity(row.kwh):briefEnergy(row.kwh))} · ${esc(coverage(row.coverage))}</p></li>`).join('');
    const groupValues=table(t('Group measurements and usage costs','Pomiary grup i koszty zużycia'),[t('Group','Grupa'),'kWh',t('Usage cost','Koszt zużycia')],groupRows.map(({label,row})=>[esc(label),esc(quantity(row.kwh)),esc(money(row.usage_cost,groups.currency))]));
    const alternativeRows=(snapshot.alternatives || []).filter(row=>row.tariff_id!==snapshot.active_tariff_id);
    const comparable=row=>row.comparable===true&&currencyKnown&&row.currency===total.currency&&row.price_basis===total.price_basis;
    const alternatives=alternativeRows.map(row=>[esc(row.tariff_name || t('Unnamed tariff','Taryfa bez nazwy')),esc(quantity(row.kwh)),esc(money(row.total_cost,row.currency)),esc(comparable(row)?money(row.delta_cost,row.currency,true):unknown())]);
    const costTable=table(t('Household cost for selected period','Koszt gospodarstwa za wybrany okres'),[t('Component','Składnik'),t('Cost','Koszt')],Object.entries(costLabels).map(([key,label])=>[esc(label),esc(money(total[key],total.currency))]),'data-analysis-cost-components class="analysis-rate76-table"');
    return `<section class="analysis-rate76" data-analysis-rates><div class="analysis-rate76-heading"><h3>${esc(t('Rates and costs','Stawki i koszty'))}</h3><div class="analysis-switch">${button('view','chart',t('Chart','Wykres'),!data)}${button('view','data',t('Data','Dane'),data)}</div></div>
      <div class="analysis-rate76-current" data-analysis-rate76-current>${visibleRates || `<p>${esc(unknown())}</p>`}</div>
      <div class="analysis-rate76-layout"><div><section class="analysis-rate76-card" data-analysis-rate76-cost><h4>${esc(t('Household cost for selected period','Koszt gospodarstwa za wybrany okres'))}</h4><p><strong>${esc(summaryMoney(total.total_cost,total.currency))}</strong> · ${esc(t('Effective price','Cena efektywna'))}: ${esc(summaryRate(total.effective_price,total.currency))}${valid(total.effective_price)?'/kWh':''}</p>
        ${costGraphic}<ul class="analysis-rate76-legend">${componentLegend}</ul>
        ${!costReady?`<p class="analysis-rate76-meta">${esc(t('A complete positive cost breakdown is unavailable. Available amounts retain their signs.','Pełne dodatnie rozbicie kosztu jest niedostępne. Dostępne kwoty zachowują swój znak.'))}</p>`:compare(total.total_cost,'0')===0?`<p class="analysis-rate76-meta">${esc(t('Zero cost','Koszt zerowy'))}</p>`:''}
        ${data?costTable:`<details class="analysis-rate76-history"><summary>${esc(t('Exact cost components','Dokładne składniki kosztu'))}</summary>${costTable}</details>`}
        ${snapshot.fees?.components?`<details class="analysis-rate76-history" data-analysis-fee-details><summary>${esc(t('Fixed fee components for period','Składniki opłat stałych za okres'))}</summary>${table(t('Fixed fee components for period','Składniki opłat stałych za okres'),[t('Component','Składnik'),t('Cost','Koszt')],Object.entries(snapshot.fees.components).map(([key,value])=>[esc(feeLabels[key]||t('Legacy combined fee','Dawna opłata łączna')),esc(money(value,total.currency))]))}</details>`:''}</section>
      <section class="analysis-rate76-card" data-analysis-rate76-zones><h4>${esc(t('Cost by tariff zone','Koszt według stref taryfy'))}</h4><p class="analysis-rate76-meta">${esc(t('Whole selected period · usage cost without fixed fees','Cały wybrany okres · koszt zużycia bez opłat stałych'))}</p>${zoneGraphic}
        ${proof?`<ul class="analysis-rate76-zone-list">${zoneRows}</ul>${proof.status!=='ready'?`<p class="analysis-rate76-meta">${esc(proof.status==='partial'?t('Incomplete period · recorded energy and known costs only','Niepełny okres · tylko zarejestrowana energia i znane koszty'):t('No tariff cost data for this period','Brak kosztów taryfy za ten okres'))}</p>`:''}`:`<p>${esc(t('No data: matching whole-period zone costs are unavailable.','Brak danych: brak zgodnych kosztów stref za cały okres.'))}</p>`}
        ${zoneDetails?`<details class="analysis-rate76-history"><summary>${esc(t('Zone coverage and provenance','Pokrycie i pochodzenie stref'))}</summary><p>${esc(zoneDetails.note)}</p><ul>${zoneDetails.entries.map(entry=>`<li>${esc(entry.text)}</li>`).join('')}</ul></details>`:''}</section></div>
      <section class="analysis-rate76-card" data-analysis-rate76-groups><h4>${esc(groupTitle)}</h4><p class="analysis-rate76-meta">${esc(groups.currency || unknown())} · ${esc(basis(groups.price_basis))}</p><ol class="analysis-rate76-rank-list">${ranked}</ol>${data?'':`<details data-analysis-rate76-group-values><summary>${esc(t('Group measurements and costs','Pomiary i koszty grup'))}</summary>${groupValues}</details>`}${!groupRows.length?`<p>${esc(unknown())}</p>`:''}<p class="analysis-rate76-meta">${esc(t('Group costs exclude household fixed fees. No room and unmeasured energy are separate. Bars rank known nonnegative costs in the same currency and basis.','Koszty grup nie obejmują opłat stałych gospodarstwa. Bez pokoju i Niezmierzone to osobne pozycje. Paski porównują znane nieujemne koszty w tej samej walucie i podstawie.'))}</p></section></div>
      <section><h4>${esc(t('Same measured energy in alternative tariffs · no activation','Ta sama zmierzona energia w innych taryfach · bez aktywacji'))}</h4><div class="analysis-rate76-alternatives">${alternativeRows.map(row=>`<article class="analysis-rate76-card" data-analysis-rate76-alternative><strong>${esc(row.tariff_name || t('Unnamed tariff','Taryfa bez nazwy'))}</strong><p>${esc(summaryEnergy(row.kwh))} · <strong>${esc(summaryMoney(row.total_cost,row.currency))}</strong> · ${esc(basis(row.price_basis))}</p><p>${esc(comparable(row)?t('Difference','Różnica')+': '+summaryMoney(row.delta_cost,row.currency,true):t('No comparable difference','Brak porównywalnej różnicy'))}</p><p class="analysis-rate76-meta">${esc(t('Same measured energy · no activation','Ta sama zmierzona energia · bez aktywacji'))}</p></article>`).join('') || `<p>${esc(t('No alternative tariff comparison available','Brak porównania alternatywnej taryfy'))}</p>`}</div>
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
      ${section==='overview'?tiles(snapshot,true,options.view==='data')+nativeDetails(snapshot):''}${section==='rates'?filters+ratesView(snapshot,options):section==='comparison'?comparisonView(snapshot,options,kind)+filters:chart(snapshot,options)+filters+groupsView(snapshot,level,options)}
      <details data-analysis-source-details><summary>${esc(t('Source and time details','Źródło i szczegóły czasu'))}</summary><p>${esc(t('Measurement calendar','Kalendarz pomiarów'))}: ${esc(period.timezone||unknown())}</p><p>UTC: ${esc(period.start)} – ${esc(period.end)}</p></details></div>`;
  };
  const styles = () => `

.energy-analysis-v53 .analysis-rate76{font-size:14px;line-height:20px;min-width:0;--analysis-rate76-energy:var(--hat-s1, var(--_hat-s1));--analysis-rate76-distribution:var(--hat-d2, var(--_hat-d2));--analysis-rate76-fixed:var(--hat-text-2, var(--_hat-text-2));--analysis-rate76-legacy:var(--hat-s3, var(--_hat-s3))}
.energy-analysis-v53 .analysis-rate76-meta{font-size:12px;color:var(--hat-text-2, var(--_hat-text-2));overflow-wrap:anywhere}
.energy-analysis-v53 .analysis-rate76-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.energy-analysis-v53 .analysis-rate76-card{min-width:0;border:1px solid var(--hat-border, var(--_hat-border));border-radius:var(--hat-radius, var(--_hat-radius));background:var(--hat-card, var(--_hat-card));padding:12px;overflow-wrap:anywhere}
.energy-analysis-v53 .analysis-rate76-card h4{margin-top:0}
.energy-analysis-v53 .analysis-rate76-current{display:grid;gap:12px}
.energy-analysis-v53 .analysis-rate76-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
.energy-analysis-v53 .analysis-rate76-layout>div{min-width:0}
.energy-analysis-v53 .analysis-rate76-rate-list,.energy-analysis-v53 .analysis-rate76-monthly,.energy-analysis-v53 .analysis-rate76-legend,.energy-analysis-v53 .analysis-rate76-zone-list,.energy-analysis-v53 .analysis-rate76-rank-list{list-style:none;padding:0;margin:8px 0}
.energy-analysis-v53 .analysis-rate76-rate-list>li{display:grid;grid-template-columns:minmax(80px,.6fr) minmax(0,1.2fr) minmax(0,1.2fr);gap:12px;align-items:start;padding:12px 0;border-top:1px solid var(--hat-border, var(--_hat-border))}
.energy-analysis-v53 .analysis-rate76-schedule p{margin:0 0 4px}
.energy-analysis-v53 .analysis-rate76-rate-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-rate76-rate-values dt{font-size:12px;color:var(--hat-text-2, var(--_hat-text-2))}
.energy-analysis-v53 .analysis-rate76-rate-values dd{font-weight:600;margin:4px 0 0}
.energy-analysis-v53 .analysis-rate76-monthly{display:flex;flex-wrap:wrap;gap:8px 16px}
.energy-analysis-v53 .analysis-rate76-track{display:flex;height:14px;min-width:0;max-width:100%;background:var(--hat-chip, var(--_hat-chip));border-radius:4px;overflow:hidden;margin:10px 0}
.energy-analysis-v53 .analysis-rate76-track>span{display:block;min-width:0;height:100%;flex-shrink:0}
.energy-analysis-v53 .analysis-rate76-energy_cost{background:var(--analysis-rate76-energy)}
.energy-analysis-v53 .analysis-rate76-variable_cost{background:var(--analysis-rate76-distribution)}
.energy-analysis-v53 .analysis-rate76-fixed_cost{background:var(--analysis-rate76-fixed)}
.energy-analysis-v53 .analysis-rate76-legacy_combined_cost{background:var(--analysis-rate76-legacy)}
.energy-analysis-v53 .analysis-rate76-legend{display:flex;flex-wrap:wrap;gap:8px 16px}
.energy-analysis-v53 .analysis-rate76-legend>li,.energy-analysis-v53 .analysis-rate76-zone-list>li{display:flex;align-items:baseline;gap:6px;min-width:0}
.energy-analysis-v53 .analysis-rate76-zone-list>li{padding:8px 0;border-bottom:1px solid var(--hat-border, var(--_hat-border))}
.energy-analysis-v53 .analysis-rate76-swatch{display:inline-block;width:10px;height:10px;flex:0 0 10px;border-radius:2px}
.energy-analysis-v53 .analysis-rate76-rank-list>li{padding:12px 0;border-bottom:1px solid var(--hat-border, var(--_hat-border))}
.energy-analysis-v53 .analysis-rate76-rank-value{display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px 12px;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-rate76-unmeasured .analysis-rate76-track>span{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--hat-unmeasured, var(--_hat-unmeasured)) 3px,var(--hat-unmeasured, var(--_hat-unmeasured)) 4px)!important;border:1px solid var(--hat-unmeasured, var(--_hat-unmeasured))}
.energy-analysis-v53 .analysis-rate76-alternatives{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:12px}
.energy-analysis-v53 .analysis-rate76-history{border-top:1px solid var(--hat-border, var(--_hat-border));margin-top:12px}
.energy-analysis-v53 .analysis-rate76-history .analysis-table-wrap{overflow:visible}
.energy-analysis-v53 .analysis-rate76-history table,.energy-analysis-v53 .analysis-rate76-table{table-layout:fixed;width:100%;overflow-wrap:anywhere}
@container energy-analysis (max-width:600px){.energy-analysis-v53 .analysis-rate76-layout{grid-template-columns:minmax(0,1fr);gap:0}.energy-analysis-v53 .analysis-rate76-rate-list>li{grid-template-columns:minmax(0,1fr);gap:6px}.energy-analysis-v53 .analysis-rate76-card{padding:12px}.energy-analysis-v53 .analysis-rate76-rate-values{gap:8px}.energy-analysis-v53 .analysis-rate76-history th,.energy-analysis-v53 .analysis-rate76-history td{padding:8px 4px}}
.energy-analysis-v53{font-family:var(--hat-font, var(--_hat-font));font-size:14px;line-height:20px;color:var(--hat-text, var(--_hat-text));min-width:0;max-width:100%;width:100%;overflow-wrap:anywhere;container-type:inline-size;container-name:energy-analysis}
.energy-analysis-v53 *{box-sizing:border-box}
.energy-analysis-v53 h3,.energy-analysis-v53 h4{font-size:1em;margin:12px 0 8px}
.energy-analysis-v53 p{margin:8px 0}
.energy-analysis-v53 section{min-width:0;margin-block:12px}
.energy-analysis-v53 .analysis-switch,.energy-analysis-v53 .analysis-section-title,.energy-analysis-v53 .analysis-period-controls{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.energy-analysis-v53 .analysis-period-controls{justify-content:space-between}
.energy-analysis-v53 .analysis-period{font-size:12px;color:var(--hat-text-2, var(--_hat-text-2));margin:4px 0}
.energy-analysis-v53 .analysis-controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:12px;align-items:end;margin-block:16px}
.energy-analysis-v53 .analysis-section-title{justify-content:space-between}
.energy-analysis-v53 .analysis-calendar-fields{display:grid;gap:12px;padding-block:8px}
.energy-analysis-v53 [data-analysis-calendar-options]{margin:0;min-width:0}
.energy-analysis-v53 [data-analysis-calendar-options] summary{min-height:44px}
.energy-analysis-v53 label{display:flex;flex-direction:column;gap:4px;max-width:100%;min-width:0;font-size:12px}
.energy-analysis-v53 .analysis-controls select,.energy-analysis-v53 .analysis-controls input{width:100%;min-width:0;font-size:14px}
.energy-analysis-v53 button,.energy-analysis-v53 select,.energy-analysis-v53 input{font:inherit;color:var(--hat-text, var(--_hat-text));background:var(--hat-card, var(--_hat-card));border:1px solid var(--hat-border, var(--_hat-border));border-radius:8px;min-height:44px;min-width:44px;padding:8px;max-width:100%}
.energy-analysis-v53 button{cursor:pointer;white-space:normal}
.energy-analysis-v53 button[aria-pressed="true"]{border-color:var(--hat-primary, var(--_hat-primary));box-shadow:inset 0 0 0 1px var(--hat-primary, var(--_hat-primary))}
.energy-analysis-v53 button:focus-visible,.energy-analysis-v53 select:focus-visible,.energy-analysis-v53 input:focus-visible,.energy-analysis-v53 summary:focus-visible{outline:2px solid var(--hat-primary, var(--_hat-primary));outline-offset:2px}
.energy-analysis-v53 summary{min-height:44px;padding:12px 0;cursor:pointer}
.energy-analysis-v53 .analysis-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}
.energy-analysis-v53 .analysis-tile{min-width:0;border:1px solid var(--hat-border, var(--_hat-border));border-radius:var(--hat-radius, var(--_hat-radius));padding:12px 16px;background:var(--hat-card, var(--_hat-card));box-shadow:none}
.energy-analysis-v53 .analysis-tile span,.energy-analysis-v53 .analysis-tile strong{display:block}
.energy-analysis-v53 .analysis-tile span{font-size:12px;color:var(--hat-text-2, var(--_hat-text-2))}
.energy-analysis-v53 .analysis-tile strong{font-size:1.35em;margin-top:4px;font-variant-numeric:tabular-nums}
.energy-analysis-v53 .analysis-period-zones{list-style:none;margin:8px 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:8px}
.energy-analysis-v53 .analysis-period-zones li{min-width:0;display:grid;gap:4px;padding:8px 10px;border:1px solid var(--hat-border, var(--_hat-border));border-radius:8px}
.energy-analysis-v53 .analysis-period-zones li>span:last-child{font-size:12px;color:var(--hat-text-2, var(--_hat-text-2))}
.energy-analysis-v53 [data-analysis-period-summary-details]{border-top:1px solid var(--hat-border, var(--_hat-border));margin-top:8px}
.energy-analysis-v53 .analysis-note{color:var(--hat-text-2, var(--_hat-text-2))}
.energy-analysis-v53 .analysis-table-wrap{overflow:auto;max-width:100%}
.energy-analysis-v53 table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;text-align:start}
.energy-analysis-v53 caption{text-align:start;font-weight:600;padding:8px 0}
.energy-analysis-v53 th,.energy-analysis-v53 td{padding:12px 8px;border-bottom:1px solid var(--hat-border, var(--_hat-border));vertical-align:top;text-align:start}
.energy-analysis-v53 th{font-weight:600}
.energy-analysis-v53 .analysis-chart-scroll{min-width:0;max-width:100%;width:100%;overflow:visible;padding:4px 2px}
.energy-analysis-v53 .analysis-chart{display:grid;grid-template-columns:repeat(var(--analysis-point-count),minmax(0,1fr));align-items:stretch;height:212px;min-width:0;max-width:100%;width:100%;gap:2px}
.energy-analysis-v53 .analysis-point{position:relative;display:flex;align-items:flex-end;justify-content:center;min-width:0;max-width:100%;width:100%;height:212px;padding:0 0 40px;border:0;border-radius:0;background:transparent;touch-action:manipulation}
.energy-analysis-v53 .analysis-point:focus-visible{outline-offset:0;z-index:1}
.energy-analysis-v53 .analysis-point[aria-pressed="true"]{box-shadow:inset 0 0 0 1px var(--hat-primary, var(--_hat-primary))}
.energy-analysis-v53 .analysis-column{display:block;width:100%;max-height:168px;background:var(--energy-grid-consumption-color,var(--hat-s1, var(--_hat-s1)));border-radius:3px 3px 0 0;min-height:1px}
.energy-analysis-v53 .analysis-baseline-line{display:block;position:absolute;inset-inline:0;height:0;border-top:3px dashed var(--hat-d2, var(--_hat-d2));pointer-events:none}\n.energy-analysis-v53 [data-analysis-series-legend] .analysis-series-current:before{content:"● ";color:var(--secondary-text-color,var(--hat-unmeasured, var(--_hat-unmeasured)))}\n.energy-analysis-v53 [data-analysis-series-legend] .analysis-series-baseline:before{content:"━ ";color:var(--hat-d2, var(--_hat-d2))}\n.energy-analysis-v53 [data-analysis-baseline-range]{display:inline-block}\n.energy-analysis-v53 .analysis-point-label{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);width:max-content;font-size:12px;line-height:16px}
.energy-analysis-v53 .analysis-point:first-child .analysis-point-label{left:0;transform:none}
.energy-analysis-v53 .analysis-point:last-child .analysis-point-label{left:auto;right:0;transform:none}
.energy-analysis-v53 .analysis-missing{background:repeating-linear-gradient(135deg,transparent,transparent 5px,var(--hat-border, var(--_hat-border)) 5px,var(--hat-border, var(--_hat-border)) 6px)}
.energy-analysis-v53 .analysis-flow{display:grid;grid-template-columns:minmax(120px,.3fr) minmax(0,1fr);gap:16px;align-items:start}
.energy-analysis-v53 .analysis-flow-source{display:flex;flex-direction:column;gap:4px;padding:12px;border-inline-start:4px solid var(--energy-grid-consumption-color,var(--hat-s1, var(--_hat-s1)));background:var(--hat-chip, var(--_hat-chip));border-radius:8px;min-width:0}
.energy-analysis-v53 .analysis-flow-source>span:first-child{font-size:12px;color:var(--hat-text-2, var(--_hat-text-2))}
.energy-analysis-v53 .analysis-flow-destination{min-width:0}
.energy-analysis-v53 .analysis-flow-destination h4{margin-top:0}
.energy-analysis-v53 [data-analysis-group-details],.energy-analysis-v53 [data-analysis-rate-history],.energy-analysis-v53 [data-analysis-fee-details],.energy-analysis-v53 [data-analysis-source-details]{border-top:1px solid var(--hat-border, var(--_hat-border));margin-top:12px}
.energy-analysis-v53 .analysis-ranking,.energy-analysis-v53 .analysis-deltas{list-style:none;margin:0;padding:0}
.energy-analysis-v53 .analysis-ranking li,.energy-analysis-v53 .analysis-deltas li{padding:8px 0;border-bottom:1px solid var(--hat-border, var(--_hat-border))}
.energy-analysis-v53 .analysis-ranking li>div:first-child,.energy-analysis-v53 .analysis-deltas li>div:first-child{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}
.energy-analysis-v53 .analysis-track,.energy-analysis-v53 .analysis-delta-track{height:8px;background:var(--hat-chip, var(--_hat-chip));border-radius:999px;margin-top:8px;position:relative}
.energy-analysis-v53 .analysis-rank{display:block;height:100%;background:var(--energy-device-consumption-color,var(--hat-d1, var(--_hat-d1)))}
.energy-analysis-v53 .rank-0{background:var(--analysis-rank-0,var(--hat-d1, var(--_hat-d1)))}.energy-analysis-v53 .rank-1{background:var(--analysis-rank-1,var(--hat-d2, var(--_hat-d2)))}.energy-analysis-v53 .rank-2{background:var(--analysis-rank-2,var(--hat-d3, var(--_hat-d3)))}.energy-analysis-v53 .rank-3{background:var(--analysis-rank-3,var(--hat-d4, var(--_hat-d4)))}.energy-analysis-v53 .rank-4{background:var(--analysis-rank-4,var(--hat-unmeasured, var(--_hat-unmeasured)))}
.energy-analysis-v53 .analysis-unmeasured .analysis-rank{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--hat-unmeasured, var(--_hat-unmeasured)) 3px,var(--hat-unmeasured, var(--_hat-unmeasured)) 4px);border:1px solid var(--hat-unmeasured, var(--_hat-unmeasured))}
.energy-analysis-v53 .analysis-delta-track:before{content:'';position:absolute;left:50%;height:100%;border-left:1px solid var(--hat-text-2, var(--_hat-text-2))}
.energy-analysis-v53 .analysis-decrease{position:absolute;right:50%;height:100%;background:var(--hat-s1, var(--_hat-s1))}
.energy-analysis-v53 .analysis-increase{position:absolute;left:50%;height:100%;background:var(--hat-crit, var(--_hat-crit))}

.energy-analysis-v53{--analysis-zone-cheap:var(--hat-zone-cheap, var(--_hat-zone-cheap));--analysis-zone-expensive:var(--hat-zone-exp, var(--_hat-zone-exp));--analysis-rank-0:var(--hat-d1, var(--_hat-d1));--analysis-rank-1:var(--hat-d2, var(--_hat-d2));--analysis-rank-2:var(--hat-d3, var(--_hat-d3));--analysis-rank-3:var(--hat-d4, var(--_hat-d4));--analysis-rank-4:var(--hat-unmeasured, var(--_hat-unmeasured))}
.energy-analysis-v53 .analysis-group-summary{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:24px;align-items:start}
.energy-analysis-v53 .analysis-group-summary>div{min-width:0}
.energy-analysis-v53 .analysis-sankey-wrap{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr) minmax(0,1fr);align-items:center;gap:12px}
.energy-analysis-v53 .analysis-sankey{display:block;width:100%;height:250px;color:var(--hat-text, var(--_hat-text))}
.energy-analysis-v53 [data-analysis-flow-side]>path{stroke:var(--hat-text, var(--_hat-text));stroke-width:.3}
.energy-analysis-v53 .analysis-household{text-align:center;font-weight:600}
.energy-analysis-v53 .analysis-flow-labels{list-style:none;padding:0;margin:0;min-width:0;display:grid;gap:12px}
.energy-analysis-v53 .analysis-flow-labels li{min-width:0;display:flex;align-items:baseline;gap:6px}
.energy-analysis-v53 .analysis-flow-swatch{display:inline-block;flex:none;width:12px;height:12px;margin-inline-end:5px;border:1px solid var(--hat-text, var(--_hat-text));border-radius:2px;vertical-align:baseline}
.energy-analysis-v53 .analysis-composition{display:flex;height:16px;max-width:100%;border:1px solid var(--hat-text, var(--_hat-text));border-radius:4px;overflow:hidden}
.energy-analysis-v53 .analysis-composition>span{height:100%;min-width:0;border-inline-end:1px solid var(--hat-text, var(--_hat-text))}
.energy-analysis-v53 .analysis-hatched{background:repeating-linear-gradient(135deg,transparent,transparent 3px,var(--hat-text, var(--_hat-text)) 3px,var(--hat-text, var(--_hat-text)) 4px)}
.energy-analysis-v53 .analysis-zone-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-size:12px}
.energy-analysis-v53 .analysis-mobile-composition{display:none}
@container energy-analysis (max-width:600px){.energy-analysis-v53 .analysis-group-summary{grid-template-columns:minmax(0,1fr);gap:8px}.energy-analysis-v53 .analysis-sankey{display:none}.energy-analysis-v53 .analysis-sankey-wrap{display:none}.energy-analysis-v53 .analysis-mobile-composition{display:block}.energy-analysis-v53 .analysis-flow-labels{display:flex;flex-wrap:wrap;gap:6px 12px;margin-block:8px}}
@container energy-analysis (max-width:480px){.energy-analysis-v53 [data-analysis-axis-minor]{visibility:hidden}.energy-analysis-v53 .analysis-flow{grid-template-columns:minmax(0,1fr);gap:12px}.energy-analysis-v53 .analysis-flow-source{flex-direction:row;flex-wrap:wrap;align-items:baseline;gap:6px 12px}.energy-analysis-v53 .analysis-period-controls{align-items:flex-start}.energy-analysis-v53 th,.energy-analysis-v53 td{padding:8px 4px}.energy-analysis-v53 .analysis-switch{gap:4px}}
@container energy-analysis (max-width:360px){.energy-analysis-v53 .analysis-controls{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.energy-analysis-v53 .analysis-controls>label:last-child{grid-column:1/-1}.energy-analysis-v53 .analysis-chart{gap:1px}.energy-analysis-v53 .analysis-tile{padding:12px}.energy-analysis-v53 .analysis-ranking li>div:first-child{display:grid;gap:2px}.energy-analysis-v53 .analysis-tile strong{font-size:1.2em}}
/* Mobile keeps two primary readings and a compact secondary pair. No values are hidden. */
@container energy-analysis (max-width:480px){.energy-analysis-v53 .analysis-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}.energy-analysis-v53 .analysis-tile-secondary{padding:6px 10px;border:0;border-radius:0;background:transparent}.energy-analysis-v53 .analysis-tile-secondary strong{font-size:14px;margin-top:2px}.energy-analysis-v53 .analysis-tile-secondary span{font-size:12px}}

.energy-analysis-v53 :is(button,select,input){font:14px/20px var(--hat-font, var(--_hat-font))}
.energy-analysis-v53 :is(label,.analysis-period,.analysis-rate76-meta,.analysis-zone-legend,.analysis-point-label){font-size:12px;line-height:16px}
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
this._tariffHostController = createTariffHostV3({ card: this, kind: 'optimizer', createModel: createEnergyTariffV3, legacyProfile: energyTariffProfileV3, createSettings: createTariffSettingsV3, createUi: createUiV3, ...this._createTariffConsumerV3(createTariffGuardV3) });
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
      guard.call = (token, request, admin = false, owner = null) => {
        const dispatched = request.type === 'ha_tools_email/set_tariff' && !guard.occupied() && guard.current(token, admin);
        const result = call(token, request, admin, owner);
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
      const unsubscribe = guard.subscribe(() => queueMicrotask(() => {
        // Setters assign the prospective hass before this pure render executes.
        if (active && this.ownerDocument?.defaultView?.document) this._repriceTariffV3();
      }));
      this._tariffConsumerUnsubscribeV3 = () => { active = false; unsubscribe(); };
    }
    _tariffContextV3() {
      return { config: this._config, tab: this._currentTab, range: this._patternsState?.period || 7,
        sources: this._tariffSourceIds || [], windowEnd: this._tariffWindowEnd ?? null };
    }
    _observeTariffContextV3() { this._getTariffHostV3().guard.observe(); }
    _createEnergyReadV3() {
      const host = this._getTariffHostV3(), source = this._hass;
      this._tariffWindowEnd = Math.floor(Date.now() / ENERGY_HOUR) * ENERGY_HOUR;
      let token = host.guard.observe();
      const current = () => host.guard.current(token);
      const assertCurrent = () => { if (!current() || !this._analysisLegacyAllowedV53()) throw { code: 'energy_context_changed' }; };
      // The facade preserves readEnergyHours' complete source/unit/window behavior.
      const hass = { ...source, callWS: async request => {
        assertCurrent();
        const result = await source.callWS.call(source, request);
        assertCurrent();
        if (request.type === 'energy/get_prefs') {
          this._tariffSourceIds = energyImportIds(result);
          token = host.guard.observe();
        }
        return result;
      } };
      return { hass, current };
    }

    _repriceTariffV3() {
      if (this._sharedTariffProfile != null) this._sharedTariffExpectedV3 = true;
      this._generateRecommendations();
      this._generateComparisonData();
      if (this._energyModel) this._preparePatterns();
      this._render();
    }


  _todayTariffCosts() {
    const model = this._energyModel;
    if (!model?.points) return this._getTariffV3().priceBuckets([]);
    const rows = [...model.points].filter(([stamp]) => stamp >= model.todayStart && stamp < model.end)
      .map(([stamp, point]) => ({ from: stamp, to: stamp + ENERGY_HOUR, kwh: point.kwh }));
    const priced = this._getTariffV3().priceBuckets(rows, { from: model.todayStart, to: model.end });
    return this._todayWindow?.boundaryComplete === false
      ? { ...priced, complete: false, kwh: null, energyCost: null, variableCost: null, usageCost: null }
      : priced;
  }

  _generateRecommendations() {
    // Kept as an internal navigation compatibility hook. No hypothetical savings.
    this._recommendations = [];
  }

  _generateComparisonData() {
    const model = this._energyModel;
    const thisWeek = model?.summary(model.end - 168 * ENERGY_HOUR, model.end).total ?? null;
    const lastWeek = model?.summary(model.end - 336 * ENERGY_HOUR, model.end - 168 * ENERGY_HOUR).total ?? null;
    const configuredPeak = this._config.peak_rate ?? this._config.energy_price;
    const peakRate = configuredPeak == null || configuredPeak === '' ? NaN : Number(configuredPeak);
    const offPeakRate = Number(this._config.off_peak_rate ?? peakRate);
    this._comparisonData = {
      thisWeek, lastWeek, thisMonth: null, lastMonth: null,
      dailyBreakdown: this._dailyTotals || [],
      costCurrency: this._config.currency || this._hass?.config?.currency || null,
      costPerKwh: Number.isFinite(peakRate) && peakRate >= 0 ? peakRate : null,
      offPeakRate: Number.isFinite(offPeakRate) && offPeakRate >= 0 ? offPeakRate : null,
      hasDualTariff: Number.isFinite(peakRate) && Number.isFinite(offPeakRate) && peakRate !== offPeakRate,
      peakCostWeekly: null, offPeakCostWeekly: null
    };
  }

  _render() {
    const periodFormat = createFormatUi();
    const periodContext = this._getTariffHostV3().guard.snapshot();
    const periodUi = periodFormat.capturePeriods(this.shadowRoot, this._periodUiContextV4, periodContext);
    this._periodUiContextV4 = periodContext;
    const powerSetup = this.shadowRoot.querySelector('[data-power-setup]');
    if (powerSetup) this._powerSetupOpenV4 = powerSetup.open;
    const active = this.shadowRoot.activeElement;
    const focusPower = active?.id === 'power-sensor-guide';
    const focusControl = active?.dataset?.patternControl;
    const focusDashboard = active?.dataset?.dashboardControl;
    const focusTab = active?.dataset?.tab;
    const focusPicker = active?.matches('.energy-tab-picker select');
    this._patternsResize?.disconnect();
    this._destroyAllCharts();
    this.shadowRoot.innerHTML = this._getStyles() + this._getTemplate();
    bindEnergySupport(this.shadowRoot, 'ha-energy-optimizer', this._hass?.locale?.language || this._hass?.language);
    this._setupEventListeners();
    if (focusPower) this.shadowRoot.getElementById('power-sensor-guide')?.focus({preventScroll:true});
    this._bindTariffSettings();
    this._renderCurrentTab();
    this._bindPatterns();
    this._bindDashboardChartV3();
    if (focusDashboard) this.shadowRoot.querySelector(`[data-dashboard-control="${focusDashboard}"]`)?.focus();
    else if (focusControl) this.shadowRoot.querySelector(`[data-pattern-control="${focusControl}"]`)?.focus();
    else if (focusTab) this.shadowRoot.querySelector(`[data-tab="${focusTab}"]`)?.focus();
    else if (focusPicker) this.shadowRoot.querySelector('.energy-tab-picker select')?.focus();
    periodFormat.restorePeriods(this.shadowRoot, periodUi);
  }

  _patternsRows() {
    const data = this._patternsDataset;
    const state = this._patternsState;
    return state.resolution === 'hour' ? data.hours.filter(r => r.key === state.day) : data.days;
  }

  _preparePatterns() {
    const identity = JSON.stringify([this._energyModel?.ids || [], this._energyModel?.zone || 'UTC']);
    const reset = !this._patternsState || this._patternsState.identity !== identity;
    if (reset) {
      this._patternsState = { identity, period: 7, view: 'chart', resolution: 'day', metric: 'kwh', type: 'line', day: null, selected: null };
    }
    this._patternsDataset = createEnergyPatternsV3(this._energyModel, this._getTariffV3(), { days: this._patternsState.period });
    if (reset && !this._patternsDataset.days.some(r => r.complete) && this._patternsDataset.hours.some(r => !r.missing)) {
      this._patternsState.resolution = 'hour';
    }
    this._selectPatternsRow();
  }

  _selectPatternsRow() {
    const data = this._patternsDataset, state = this._patternsState;
    if (!data.days.some(r => r.key === state.day)) state.day = data.days.at(-1)?.key ?? null;
    const rows = this._patternsRows();
    if (!rows.some(r => r.id === state.selected)) state.selected = rows.at(-1)?.id ?? null;
  }

  _patternsNumber(value) {
    // Preserve exact nullable measured numbers in both Chart details and Data.
    return typeof value !== 'number' || !Number.isFinite(value) ? this._text('Unavailable', 'Niedostępne') :
      new Intl.NumberFormat(this._hass?.locale?.language || this._hass?.language || 'en',
        { maximumSignificantDigits: 12, useGrouping: false }).format(value === 0 ? 0 : value);
  }

  _patternsDisplayNumberV5(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? createFormatUi.forHass(this._hass).number(value === 0 ? 0 : value, { maximumFractionDigits: 3 }) : this._patternsNumber(value);
  }

  _pointTechnicalDetailsV5(scope, row) {
    const t = (en, pl) => this._text(en, pl);
    const key = JSON.stringify([scope, row.id, row.from, row.to, row.source]);
    const exact = value => typeof value === 'number' && Number.isFinite(value) ? String(value === 0 ? 0 : value) : t('Unavailable', 'Niedostępne');
    return `<details data-energy-point-technical data-energy-period-key="${_esc(key)}"><summary>${t('Source and time details', 'Źródło i szczegóły czasu')}</summary>
      <p>${_esc(row.source.join(', '))} · ${_esc(row.timezone)}</p>
      <p>UTC: ${_esc(new Date(row.from).toISOString())} — ${_esc(new Date(row.to).toISOString())}</p>
      <p data-energy-exact-values>${t('Exact measured values', 'Dokładne wartości zmierzone')}: ${_esc(exact(row.kwh))} kWh · ${t('Energy cost', 'Koszt energii')}: ${_esc(exact(row.energyCost))} ${_esc(row.currency || '')} · ${t('Variable fees', 'Opłaty zmienne')}: ${_esc(exact(row.variableCost))} ${_esc(row.currency || '')}</p>${row.priceMissing ? `<p>${_esc(row.priceMissing)}</p>` : ''}</details>`;
  }

  _patternsRowLabel(row) {
    const format = createFormatUi.forHass(this._hass);
    return this._patternsState.resolution === 'day' ? format.date(row.from) : format.pointLabel(row.from);
  }

  _patternsDetail(row) {
    if (!row) return this._text('No measured rows in this window.', 'Brak pomiarów w tym okresie.');
    const cost = field => `${this._patternsDisplayNumberV5(row[field])} ${_esc(row.currency || '')}`;
    return `<strong>${_esc(this._patternsRowLabel(row))}</strong><br>
      ${this._text('Consumption', 'Zużycie')}: ${_esc(this._patternsDisplayNumberV5(row.kwh))} kWh ·
      ${this._text('Energy cost', 'Koszt energii')}: ${cost('energyCost')} ·
      ${this._text('Variable fees', 'Opłaty zmienne')}: ${cost('variableCost')}<br>
      ${row.missing ? this._text('Missing measurement or partial day', 'Brak pomiaru lub niepełny dzień') : this._text('Measured', 'Zmierzone')}
      ${row.priceMissing ? ' · ' + this._text('Price unavailable', 'Cena niedostępna') + ': ' + _esc(this._patternsPriceReason(row.priceMissing)) : ''}
      ${row.variableMissing && !row.priceMissing ? ' · ' + this._text('Variable fee unavailable', 'Opłata zmienna niedostępna') : ''}${this._pointTechnicalDetailsV5('patterns', row)}`;
  }

  _patternsPriceReason(reason) {
    const known = {
      mixed_rate_bucket: ['Mixed price within measured bucket', 'Różne ceny w zmierzonym przedziale'],
      missing_rate: ['Missing historical rate', 'Brak stawki historycznej'],
      invalid_measurement: ['Missing measurement', 'Brak pomiaru'],
      invalid_profile: ['Invalid tariff profile', 'Nieprawidłowy profil taryfy'],
      outside_validity: ['Outside tariff validity', 'Poza okresem ważności taryfy']
    };
    return known[reason] ? this._text(...known[reason]) : this._text('Tariff coverage unavailable', 'Brak pokrycia taryfą');
  }

  _patternsChart(width = 600) {
    const rows = this._patternsRows(), state = this._patternsState;
    const unit = state.metric === 'kwh' ? 'kWh' : this._patternsDataset.currency || this._text('Currency unavailable', 'Brak waluty');
    const values = rows.map(r => r[state.metric]);
    const known = values.filter(v => v !== null);
    const low = Math.min(0, ...known), high = Math.max(0, ...known);
    const upper = high === low ? low + 1 : high;
    const w = Math.max(180, width), h = 250, left = 65, right = w - 15, top = 25, bottom = 195;
    const x = i => left + (i + 0.5) * (right - left) / Math.max(1, rows.length);
    const y = v => bottom - (v - low) / (upper - low) * (bottom - top);
    let marks = '', path = '';
    const flush = () => { if (path) marks += `<path data-pattern-segment d="${path}" fill="none" stroke="var(--bento-primary)" stroke-width="2"/>`; path = ''; };
    values.forEach((value, i) => {
      const identity = `data-pattern-id="${_esc(rows[i].id)}" data-pattern-value="${value === null ? 'null' : value}"`;
      if (value === null) { flush(); marks += `<g ${identity}></g>`; return; }
      const title = `${this._patternsRowLabel(rows[i])}: ${this._patternsNumber(value)} ${unit}`;
      if (state.type === 'bar') {
        const zero = y(0), py = y(value);
        marks += `<rect ${identity} x="${x(i) - Math.max(1, (right-left)/Math.max(1, rows.length)*0.3)}" y="${Math.min(zero, py)}" width="${Math.max(2, (right-left)/Math.max(1, rows.length)*0.6)}" height="${Math.max(1, Math.abs(zero-py))}" fill="var(--bento-primary)"><title>${_esc(title)}</title></rect>`;
      } else {
        path += `${path ? ' L' : 'M'}${x(i)},${y(value)}`;
        marks += `<circle ${identity} cx="${x(i)}" cy="${y(value)}" r="${rows[i].id === state.selected ? 5 : 3}" fill="var(--bento-primary)"><title>${_esc(title)}</title></circle>`;
      }
    });
    flush();
    const ticks = [low, (low + upper) / 2, upper];
    const grid = ticks.map(v => `<line x1="${left}" x2="${right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--bento-border)"/><text x="${left-8}" y="${y(v)+5}" text-anchor="end">${_esc(Number(v.toPrecision(4)))}</text>`).join('');
    const format = createFormatUi.forHass(this._hass);
    const axis = format.chartTicks(rows.map(row => row.from), state.resolution).map(tick => `<text x="${x(tick.index)}" y="220" text-anchor="middle">${_esc(tick.label)}</text>`).join('');
    return `<svg data-pattern-chart data-unit="${_esc(unit)}" viewBox="0 0 ${w} ${h}" width="100%" height="250" role="img" aria-label="${_esc(this._text('Measured series; choose a row below for details', 'Seria pomiarowa; wybierz poniżej wiersz ze szczegółami'))}">
      <text x="${left}" y="17">${_esc(unit)}</text>${grid}${marks}${axis}${!known.length ? `<text x="${(left+right)/2}" y="110" text-anchor="middle">${this._text('No data', 'Brak danych')}</text>` : ''}</svg>`;
  }

  _patternsMarkup(reuseProjection = false) {
    if (!reuseProjection || !this._patternsDataset) this._preparePatterns();
    else this._selectPatternsRow();
    const data = this._patternsDataset, state = this._patternsState, rows = this._patternsRows();
    const format = createFormatUi.forHass(this._hass);
    const t = (en, pl) => this._text(en, pl);
    const option = (value, current, label) => `<option value="${_esc(value)}" ${value === current ? 'selected' : ''}>${_esc(label)}</option>`;
    const weekdays = data.weekdays.filter(r => r.count).map(r => {
      // Known Sunday (UTC noon) anchors locale names without changing measurement timezone.
      const day = new Intl.DateTimeFormat(this._hass?.locale?.language || this._hass?.language || 'en', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 4 + r.weekday, 12)));
      return `<li>${_esc(day)}: ${_esc(this._patternsNumber(r.kwh))} kWh · ${r.count} ${t('complete days', 'pełnych dni')}</li>`;
    }).join('');
    const selected = rows.find(r => r.id === state.selected);
    return `<section class="patterns-measured" aria-label="${t('Measured patterns', 'Zmierzone wzorce')}">
      <h3>${t('Your measured consumption', 'Twoje zmierzone zużycie')}</h3>
      <p data-pattern-range data-pattern-source-summary>Energy Dashboard · ${t('Sources', 'Źródła')}: ${_esc(format.number(data.source.length))} · ${data.from === null ? t('No data', 'Brak danych') : `${_esc(format.range(new Date(data.from).toISOString(), new Date(data.to).toISOString()))} · ${_esc(format.timeZone)}`} · ${data.hours.filter(r => !r.missing).length}/${data.hours.length} ${t('measured hours', 'zmierzonych godzin')}</p>
      ${!data.source.length || data.partialWindow || data.hours.some(r => r.missing) ? `<p data-pattern-coverage-warning role="status">${!data.source.length ? t('No Energy Dashboard grid source', 'Brak źródła sieciowego Energy Dashboard') + ' · ' : ''}${data.partialWindow ? t('Partial window', 'Niepełny okres') + ' · ' : ''}${data.hours.some(r => r.missing) ? t('Missing measurement or partial day', 'Brak pomiaru lub niepełny dzień') : ''}</p>` : ''}
      <details data-pattern-source data-energy-period-key="${_esc(JSON.stringify(['patterns-source', data.source, data.from, data.to]))}"><summary>${t('Source and time details', 'Źródło i szczegóły czasu')}</summary>
      <p>${_esc(data.source.join(', ') || t('No Energy Dashboard grid source', 'Brak źródła sieciowego Energy Dashboard'))} · ${_esc(data.timezone)}</p>
      ${data.from === null ? '' : `<p>UTC: ${_esc(new Date(data.from).toISOString())} — ${_esc(new Date(data.to).toISOString())}</p>`}
      <p>${data.availableDays}/${data.requestedDays} ${t('loaded local dates', 'wczytanych dat lokalnych')}.
      ${t('Only complete local days are totalled. Measured hours remain available on partial dates. DST clock gaps have no bucket; repeated hours retain UTC offsets.', 'Sumujemy tylko pełne dni lokalne. Zmierzone godziny niepełnych dat pozostają dostępne. Luki po zmianie czasu nie mają przedziału; powtórzone godziny zachowują przesunięcie UTC.')}</p></details>
      <div class="patterns-controls">
        <label>${t('Period', 'Okres')}<select data-pattern-control="period">${option(7, state.period, t('7 days', '7 dni'))}${option(30, state.period, t('30 days (loaded data)', '30 dni (wczytane dane)'))}</select></label>
        <label>${t('Resolution', 'Przedziały')}<select data-pattern-control="resolution">${option('day', state.resolution, t('Daily trend', 'Trend dzienny'))}${option('hour', state.resolution, t('Hours of selected date', 'Godziny wybranej daty'))}</select></label>
        ${state.resolution === 'hour' ? `<label>${t('Local date', 'Data lokalna')}<select data-pattern-control="day">${data.days.map(r => option(r.key, state.day, format.date(r.from))).join('')}</select></label>` : ''}
        <label>${t('Measure', 'Miara')}<select data-pattern-control="metric">${option('kwh', state.metric, t('Consumption · kWh', 'Zużycie · kWh'))}${option('energyCost', state.metric, t('Energy cost', 'Koszt energii'))}${option('variableCost', state.metric, t('Variable fees', 'Opłaty zmienne'))}</select></label>
        <label>${t('Chart type', 'Typ wykresu')}<select data-pattern-control="type">${option('line', state.type, t('Line', 'Linia'))}${option('bar', state.type, t('Bars', 'Słupki'))}</select></label>
      </div>
      <div class="patterns-switch" role="group" aria-label="${t('Presentation', 'Prezentacja')}">
        <button type="button" data-pattern-control="chart" aria-pressed="${state.view === 'chart'}">${t('Chart', 'Wykres')}</button>
        <button type="button" data-pattern-control="data" aria-pressed="${state.view === 'data'}">${t('Data', 'Dane')}</button>
      </div>
      ${state.view === 'chart' ? `<div data-pattern-plot>${this._patternsChart()}</div>` : `<div class="patterns-table" data-pattern-control="table" tabindex="0" role="region" aria-label="${t('Measured data table', 'Tabela zmierzonych danych')}"><table>
        <caption>${t('Exact measured values', 'Dokładne wartości zmierzone')} · kWh / ${_esc(data.currency || t('currency unavailable', 'brak waluty'))} · ${_esc(data.timezone)}</caption>
        <thead><tr><th>${t('Date / hour', 'Data / godzina')}</th><th>kWh</th><th>${t('Energy cost', 'Koszt energii')} (${_esc(data.currency || '—')})</th><th>${t('Variable fees', 'Opłaty zmienne')} (${_esc(data.currency || '—')})</th><th>${t('Coverage', 'Pokrycie')}</th></tr></thead><tbody>
        ${rows.map(r => `<tr data-pattern-row="${_esc(r.id)}" data-kwh="${r.kwh === null ? 'null' : r.kwh}" data-energy-cost="${r.energyCost === null ? 'null' : r.energyCost}" data-variable-cost="${r.variableCost === null ? 'null' : r.variableCost}" data-timezone="${_esc(r.timezone)}"><th scope="row">${_esc(this._patternsRowLabel(r))}<br><small>${_esc(new Date(r.from).toISOString())}</small></th><td>${_esc(this._patternsNumber(r.kwh))}</td><td>${_esc(this._patternsNumber(r.energyCost))}</td><td>${_esc(this._patternsNumber(r.variableCost))}</td><td>${r.missing ? t('Partial / missing', 'Niepełne / brak') : t('Measured', 'Zmierzone')}${r.priceMissing ? '<br>' + _esc(this._patternsPriceReason(r.priceMissing)) : ''}${r.variableMissing && !r.priceMissing ? '<br>' + t('Variable fee unavailable', 'Opłata zmienna niedostępna') : ''}</td></tr>`).join('')}
        </tbody></table></div>`}
      <div class="patterns-controls">
        <button type="button" data-pattern-control="previous" ${!rows.length || rows[0].id === state.selected ? 'disabled' : ''}>${t('Previous row', 'Poprzedni wiersz')}</button>
        <label>${t('Point details (arrows, Home / End)', 'Szczegóły punktu (strzałki, Home / End)')}<select data-pattern-control="point" ${!rows.length ? 'disabled' : ''}>${rows.map(r => option(r.id, state.selected, this._patternsRowLabel(r))).join('')}</select></label>
        <button type="button" data-pattern-control="next" ${!rows.length || rows.at(-1).id === state.selected ? 'disabled' : ''}>${t('Next row', 'Następny wiersz')}</button>
      </div>
      <div data-pattern-detail role="status" aria-live="polite">${this._patternsDetail(selected)}</div>
      <details data-pattern-weekdays${state.weekdaysOpen ? ' open' : ''}><summary data-pattern-control="weekdays">${t('Weekday averages · complete days only', 'Średnie według dnia tygodnia · tylko pełne dni')}</summary><ul>${weekdays || `<li>${t('No complete measured days', 'Brak pełnych zmierzonych dni')}</li>`}</ul></details>
      <p>${t('Tariff', 'Taryfa')}: ${_esc(data.tariffTimezone || '—')} · ${_esc(data.priceBasis === 'gross' ? t('gross', 'brutto') : data.priceBasis === 'net' ? t('net', 'netto') : t('basis unavailable', 'brak podstawy ceny'))}.
      ${t('Fixed monthly fee (separate; never added to daily/hourly costs)', 'Opłata stała miesięczna (osobno; nigdy nie doliczana do kosztów dziennych/godzinowych)')}: ${_esc(this._patternsNumber(data.fixedMonthly ?? null))} ${_esc(data.currency || '')}</p>
      </section>`;
  }

  _bindPatterns() {
    if(!this._analysisLegacyAllowedV53())return;
    const panel = this.shadowRoot.getElementById('patterns');
    if (!panel) return;
    const state = this._patternsState;
    const weekdayDetails = panel.querySelector('[data-pattern-weekdays]');
    weekdayDetails?.addEventListener('toggle', () => { state.weekdaysOpen = weekdayDetails.open; });
    const redraw = (focus, reuseProjection = true) => {
      const format = createFormatUi(), context = this._getTariffHostV3().guard.snapshot();
      const details = format.capturePeriods(panel, context, context);
      this._patternsResize?.disconnect();
      panel.innerHTML = this._patternsMarkup(reuseProjection);
      this._bindPatterns();
      panel.querySelector(`[data-pattern-control="${focus}"]`)?.focus();
      format.restorePeriods(this.shadowRoot, details);
    };
    panel.querySelectorAll('select[data-pattern-control]').forEach(el => el.addEventListener('change', () => {
      const field = el.dataset.patternControl;
      state[field === 'period' ? 'period' : field === 'point' ? 'selected' : field] = field === 'period' ? Number(el.value) : el.value;
      if (field === 'period') this._observeTariffNavigationV3();
      redraw(field, field !== 'period');
    }));
    panel.querySelectorAll('button[data-pattern-control]').forEach(el => el.addEventListener('click', () => {
      const field = el.dataset.patternControl;
      if (field === 'chart' || field === 'data') state.view = field;
      else {
        const rows = this._patternsRows(), index = rows.findIndex(r => r.id === state.selected);
        state.selected = rows[Math.max(0, Math.min(rows.length-1, index + (field === 'previous' ? -1 : 1)))]?.id ?? null;
      }
      redraw(field === 'previous' || field === 'next' ? 'point' : field);
    }));
    panel.querySelector('[data-pattern-control="point"]')?.addEventListener('keydown', event => {
      const rows = this._patternsRows();
      const index = rows.findIndex(r => r.id === state.selected);
      const moves = { ArrowLeft: index-1, ArrowUp: index-1, ArrowRight: index+1, ArrowDown: index+1, Home: 0, End: rows.length-1, Enter: index };
      if (!Object.hasOwn(moves, event.key)) return;
      event.preventDefault();
      state.selected = rows[Math.max(0, Math.min(rows.length-1, moves[event.key]))]?.id ?? null;
      redraw('point');
    });
    const plot = panel.querySelector('[data-pattern-plot]');
    if (plot) {
      const resize = () => {
        if (!plot.isConnected || !this._patternsDataset || !this._patternsState) return;
        plot.innerHTML = this._patternsChart(plot.clientWidth || 600);
      };
      resize();
      plot.addEventListener('click', event => {
        const svg = plot.querySelector('svg'), rect = svg.getBoundingClientRect();
        if (!rect.width) return;
        const rows = this._patternsRows(), w = Math.max(180, plot.clientWidth || 600);
        const i = Math.max(0, Math.min(rows.length-1, Math.floor(((event.clientX-rect.left) / rect.width * w - 65) / (w-80) * rows.length)));
        state.selected = rows[i]?.id ?? null;
        redraw('point');
      });
      if (typeof ResizeObserver !== 'undefined') {
        this._patternsResize = new ResizeObserver(resize);
        this._patternsResize.observe(plot);
      }
    }
  }

  _getStyles() {
    return `
      <style>
/* Measured Patterns: native 44px controls; dense points use a separate row navigator. */
.patterns-measured { container-type:inline-size; container-name:measured-patterns; color:var(--bento-text,var(--primary-text-color)); font-size:14px; line-height:1.5; min-width:0; }
.patterns-measured p,.patterns-measured [data-pattern-detail] { overflow-wrap:anywhere; }
.patterns-controls,.patterns-switch { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; align-items:end; }
.patterns-controls label { display:flex; flex-direction:column; gap:4px; min-width:0; max-width:100%; flex:1 1 180px; }
.patterns-measured select,.patterns-measured button { box-sizing:border-box; min-height:44px; min-width:44px; max-width:100%; padding:8px 12px; font:inherit; white-space:normal; overflow-wrap:anywhere; color:var(--bento-text,var(--primary-text-color)); background:var(--card-background-color); border:1px solid var(--bento-border); border-radius:8px; }
.patterns-switch button[aria-pressed="true"] { border:2px solid var(--bento-primary); background:var(--bento-primary-light); font-weight:600; }
.patterns-measured button:disabled { opacity:.55; }
.patterns-measured [data-pattern-plot] { width:100%; min-width:0; }
.patterns-measured svg { display:block; max-width:100%; }
.patterns-measured svg text { fill:var(--bento-text,var(--primary-text-color)); font:14px/20px var(--hat-font, var(--_hat-font)); }
.patterns-measured [data-pattern-detail] { padding:12px; border:1px solid var(--bento-border); border-radius:8px; background:var(--bento-primary-light); }
.patterns-measured summary { min-height:44px; cursor:pointer; padding:8px 0; box-sizing:border-box; }
.patterns-table { max-width:100%; overflow:auto; margin:12px 0; }
.patterns-table table { border-collapse:collapse; width:100%; font-size:14px; }
.patterns-table th,.patterns-table td { text-align:left; padding:12px; border-bottom:1px solid var(--bento-border); vertical-align:top; }
.patterns-table caption { text-align:left; padding:8px; }
.patterns-table small { font-size:14px; }
@container measured-patterns (max-width:500px) { .patterns-controls label { flex-basis:100%; } }

/* Card-owned support footer; never depends on or mutates another component. */
.donate-section[data-source="own-card"] { margin:24px 0 4px; padding:16px 24px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:16px; border:1px solid var(--bento-border); border-radius:var(--bento-radius-sm); background:var(--bento-primary-light); color:var(--bento-text); }
.donate-section[data-source="own-card"] .donate-text { display:flex; flex-direction:column; gap:4px; flex:1; min-width:220px; }
.donate-section[data-source="own-card"] .donate-buttons { display:flex; flex-wrap:wrap; gap:8px; }
.donate-section[data-source="own-card"] a { color:var(--bento-primary); font-weight:700; text-decoration:none; }
/* ===== BENTO LIGHT MODE DESIGN SYSTEM ===== */

/* keyboard a11y */
:focus-visible { outline: 2px solid var(--bento-primary, #6366f1); outline-offset: 2px; border-radius: 3px; }

:host {
  color-scheme: light;
  container-type: inline-size;

  font-family: var(--hat-font, var(--_hat-font));
}
:host(.bento-dark) {
  color-scheme: dark;

}

/* Card */
.card, .ha-card, ha-card, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-md);
  box-shadow: var(--bento-shadow-sm);
  font-family: var(--hat-font, var(--_hat-font));
  color: var(--bento-text);
  overflow: hidden;
}

/* Headers */
.card-header, .header, .card-title, h1, h2, h3 {
  color: var(--bento-text);
  font-family: var(--hat-font, var(--_hat-font));
}
.card-header, .header {
  border-bottom: 1px solid var(--bento-border) !important;
  padding-bottom: 12px !important;
  margin-bottom: 16px !important;
}

/* Tabs */
.tabs, .tab-bar, .tab-nav, .tab-header {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--bento-border);
  padding: 0 4px;
  margin-bottom: 24px;
  overflow-x: auto;
}
.tab, .tab-btn, .tab-button {
  padding: 12px 16px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--hat-font, var(--_hat-font));
  color: var(--bento-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: var(--bento-transition);
  white-space: nowrap;
  border-radius: 0;
}
.tab:hover, .tab-btn:hover, .tab-button:hover {
  color: var(--bento-primary);
  background: var(--bento-primary-light);
}
.tab.active, .tab-btn.active, .tab-button.active {
  color: var(--bento-primary);
  border-bottom-color: var(--bento-primary);
  background: rgba(59, 130, 246, 0.04);
  font-weight: 600;
}

/* Tab content */
.tab-content { display: none; }
.tab-content.active { display: block; animation: bentoFadeIn 0.3s ease-out; }
@keyframes bentoFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* Buttons */
button, .btn, .action-btn {
  font-family: var(--hat-font, var(--_hat-font));
  font-size: 14px;
  font-weight: 500;
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
  cursor: pointer;
}
button.active, .btn.active, .btn-primary, .action-btn.active {
  background: var(--bento-primary);
  color: var(--bento-on-primary);
  border-color: var(--bento-primary);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}

/* Status badges */
.badge, .status-badge, .tag, .chip {
  padding: 4px 12px;
  border-radius: 20px;
  font-size:12px;
  font-weight: 600;
  font-family: var(--hat-font, var(--_hat-font));
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-success, .status-ok, .status-good { background: var(--bento-success-light); color: var(--hat-good-text, var(--_hat-good-text)); }
.badge-error, .status-error, .status-critical { background: var(--bento-error-light); color: var(--hat-crit-text, var(--_hat-crit-text)); }
.badge-warning, .status-warning { background: var(--bento-warning-light); color: var(--hat-warn-text, var(--_hat-warn-text)); }
.badge-info, .status-info { background: var(--bento-primary-light); color: var(--bento-primary); }

/* Tables */
table { width: 100%; border-collapse: separate; border-spacing: 0; font-family: var(--hat-font, var(--_hat-font)); }
th { background: var(--bento-bg); color: var(--bento-text-secondary); font-size:12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 12px 16px; text-align: left; border-bottom: 2px solid var(--bento-border); }
td { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 14px; }
tr:hover td { background: var(--bento-primary-light); }
tr:last-child td { border-bottom: none; }

/* Inputs & selects */
input, select, textarea {
  font-family: var(--hat-font, var(--_hat-font));
  font-size: 14px;
  padding: 8px 12px;
  border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-card);
  color: var(--bento-text);
  transition: var(--bento-transition);
  outline: none;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--bento-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Stat cards */
.stat-card, .stat, .metric-card, .stat-box, .overview-stat, .kpi-card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  padding: 16px;
  transition: var(--bento-transition);
}
.stat-card:hover, .stat:hover, .metric-card:hover { box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-value, .metric-value, .stat-number { font-size: 28px; font-weight: 700; color: var(--bento-text); font-family: var(--hat-font, var(--_hat-font)); }
.stat-label, .metric-label, .stat-title { font-size: 12px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

/* Canvas override (prevent Bento CSS from distorting charts) */
canvas {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  border: none;
}

/* Pagination */
.pagination, .pag {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  padding: 16px 0;
  border-top: 1px solid var(--bento-border);
}
.pagination-btn, .pag-btn {
  padding: 8px 16px;
  border: 1.5px solid var(--bento-border);
  background: var(--bento-card);
  color: var(--bento-text);
  border-radius: var(--bento-radius-xs);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  font-family: var(--hat-font, var(--_hat-font));
  transition: var(--bento-transition);
}
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 14px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-select { padding: 8px 12px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 12px; font-family: var(--hat-font, var(--_hat-font)); }

/* Empty state */
.empty-state, .no-data, .no-results {
  text-align: center;
  padding: 48px 24px;
  color: var(--bento-text-secondary);
  font-size: 14px;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); }

/* ===== END BENTO LIGHT MODE ===== */

        :host {
          --text-color: var(--hat-text, var(--_hat-text));
          --secondary-text: var(--hat-text-2, var(--_hat-text-2));
          --bg-color: var(--hat-card, var(--_hat-card));
          --primary: var(--hat-primary, var(--_hat-primary));
          --divider: var(--hat-border, var(--_hat-border));
          --success: var(--hat-good-text, var(--_hat-good-text));
          --warning: var(--hat-warn-text, var(--_hat-warn-text));
          --danger: var(--hat-crit-text, var(--_hat-crit-text));
        }

        * {
          box-sizing: border-box;
        }

        .card-container {
          background: var(--bg-color);
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 16px;
          font-family: var(--hat-font, var(--_hat-font));
        }

        .card-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-color);
          margin: 0 0 16px 0;
        }

        .data-source-badge {
          font-size:12px;
          color: var(--bento-text-secondary);
          margin-bottom: 8px;
        }

        .tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--divider);
          margin-bottom: 24px;
          flex-wrap: wrap;
        }

        .tab-button {
          min-height: 44px;
          padding: 8px 16px;
          border: none;
          background: none;
          color: var(--secondary-text);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.3s ease;
          white-space: nowrap;
        }

        .tab-button:hover {
          color: var(--text-color);
        }

        .tab-button.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }

        .tab-content {
          display: none;
        }

        .tab-content.active {
          display: block;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 24px;
        }

        .summary-card {
          background: var(--secondary-background-color, #f4f6f9);
          color: var(--text-color);
          border: 1px solid var(--divider);
          min-width: 0;
          overflow-wrap: anywhere;
          padding: 16px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .summary-card.alt {
          background: color-mix(in srgb, var(--success) 8%, var(--bg-color));
        }

        .summary-card.warn {
          background: color-mix(in srgb, var(--warning) 8%, var(--bg-color));
        }

        .summary-value {
          font-size: clamp(22px, 4cqi, 28px);
          color: var(--bento-primary);
          font-weight: 700;
          margin: 8px 0;
        }

        .summary-label {
          font-size: 12px;
          color: var(--text-color);
          text-transform: none;
          letter-spacing: 0.5px;
        }

        .chart-container {
          background: rgba(0, 0, 0, 0.02);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 24px;
          border: 1px solid var(--divider);
        }

        .chart-plot {
          position: relative;
          height: clamp(220px, 32vw, 320px);
          min-width: 0;
        }

        .chart-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-color);
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        canvas {
          max-width: 100%;
          height: auto;
          display: block;
        }

        .stats-row {
          display: flex;
          gap: 24px;
          margin: 16px 0;
          padding: 12px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 6px;
        }

        .stat-item {
          flex: 1;
        }

        .stat-label {
          font-size: 12px;
          color: var(--secondary-text);
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-color);
        }

        .recommendation {
          background: rgba(0, 0, 0, 0.02);
          border-left: 4px solid var(--primary);
          padding: 16px;
          margin-bottom: 12px;
          border-radius: 4px;
          display: flex;
          gap: 12px;
        }

        .recommendation.high {
          border-left-color: var(--danger);
        }

        .recommendation.medium {
          border-left-color: var(--warning);
        }

        .recommendation.low {
          border-left-color: var(--success);
        }

        .rec-icon {
          font-size: 24px;
          min-width: 32px;
        }

        .rec-content {
          flex: 1;
        }

        .rec-title {
          font-weight: 600;
          color: var(--text-color);
          margin-bottom: 4px;
        }

        .rec-description {
          font-size: 12px;
          color: var(--secondary-text);
          margin-bottom: 8px;
        }

        .rec-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .savings-badge {
          background: var(--success);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 600;
        }

        .difficulty-badge {
          background: rgba(0, 0, 0, 0.1);
          color: var(--text-color);
          padding: 2px 8px;
          border-radius: 12px;
          font-size:12px;
        }

        .comparison-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }

        .comparison-card {
          background: rgba(0, 0, 0, 0.02);
          padding: 16px;
          border-radius: 8px;
          border: 1px solid var(--divider);
        }

        .comparison-title {
          font-size: 12px;
          color: var(--secondary-text);
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .comparison-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-color);
          margin-bottom: 4px;
        }

        .change-indicator {
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .change-up {
          color: var(--danger);
        }

        .change-down {
          color: var(--success);
        }

        .heatmap-legend {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          font-size:12px;
          justify-content: flex-end;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .power-setup { grid-column:1 / -1; margin:0; overflow-wrap:anywhere; font-size:14px; }
        .power-setup summary, .power-setup select { min-height:44px; max-width:100%; }
        .power-setup summary { display:list-item; list-style-position:inside; box-sizing:border-box; padding:12px 0; cursor:pointer; color:var(--primary-color); }
        .power-setup label { display:flex; flex-direction:column; gap:8px; }
        .power-setup select { font:inherit; color:var(--primary-text-color); background:var(--card-background-color); border:1px solid var(--divider-color); border-radius:10px; padding:8px; }
        .power-setup pre { white-space:pre-wrap; overflow-wrap:anywhere; }
        .power-draw { text-align:left; }
        .power-draw-value { font-size:clamp(22px, 4cqi, 28px); font-weight:700; margin:8px 0; color:var(--bento-primary); }
        .power-draw-unit { font-size:12px; color:var(--text-color); }
        @container (max-width: 760px) { .grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
        @container (max-width: 270px) { .grid { grid-template-columns:minmax(0,1fr); } }
        @media (max-width: 768px) {
          .comparison-grid {
            grid-template-columns: 1fr;
          }

          .stats-row {
            flex-direction: column;
            gap: 12px;
          }

          .tabs {
            gap: 4px;
          }

          .tab-button {
            padding: 8px 12px;
            font-size: 14px;
          }
        }
        @container (max-width: 500px) {
          .card-container .tabs { display:flex; flex-wrap:nowrap; gap:4px; overflow-x:auto; overflow-y:hidden; }
          .card-container .tabs>button { flex:0 0 auto; min-width:44px; white-space:nowrap; font-size:14px; padding:8px 12px; }
        }
      
/* Optimizer schema2 heading/tools stay auxiliary to measured analysis. */
.optimizer-heading{display:flex;align-items:center;flex-wrap:wrap;gap:0 12px;min-height:44px}
.optimizer-heading .card-title{flex:1 1 180px;min-width:0;margin:0;font-size:20px}
.optimizer-heading>[data-energy-options-help][open]{flex-basis:100%;width:100%}
.optimizer-tools{margin:0 0 4px;min-width:0}
.optimizer-tools .power-setup summary{padding:8px 0;font-size:14px}
.optimizer-tools .power-draw{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;min-height:44px;margin:0;padding:8px 0;background:transparent;box-shadow:none;border:0}
.optimizer-tools .power-draw-value{font-size:14px;margin:0}
.optimizer-tools .power-draw-unit{font-size:12px}
@container energy-card (max-width:279.99px){.card-container .tabs{display:none}}
/* ===== MOBILE RESPONSIVE TABLE STYLES ===== */
.table-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .table-container {
    margin: 0 -16px;
    padding: 0 16px;
  }

  table {
    min-width: 600px;
  }

  th, td {
    padding: 12px 12px;
    font-size: 12px;
  }

  /* Hide non-essential columns on mobile */
  th:nth-child(n+4),
  td:nth-child(n+4) {
    display: none;
  }

  /* Adjust first few columns on mobile */
  th:first-child,
  td:first-child {
    min-width: 120px;
  }

  th:nth-child(2),
  td:nth-child(2) {
    min-width: 100px;
  }

  .card-container a { color: var(--primary-color, #4a90d9); }
  th:nth-child(3),
  td:nth-child(3) {
    min-width: 80px;
  }
}
/* Keep all measured Data columns visible, including fees and coverage on narrow cards. */
.patterns-table th,.patterns-table td { display:table-cell; font-size:14px; }
.patterns-table table { min-width:0; }
.patterns-table[data-pattern-control="table"] table { min-width:640px; }
.patterns-table th:first-child { min-width:140px; }
.patterns-table td,.patterns-table th { overflow-wrap:anywhere; }
.patterns-table[data-pattern-control="table"] td,.patterns-table[data-pattern-control="table"] th { overflow-wrap:normal; word-break:normal; }

/* Spec 5.3 full-view bridge; shared UI supplies defaults after vendoring. */
:host {
  --bento-primary: var(--hat-primary, var(--_hat-primary));
  --bento-on-primary: var(--hat-on-primary, var(--_hat-on-primary));
  --bento-primary-hover: color-mix(in srgb, var(--hat-primary-fill, var(--_hat-primary-fill)) 90%, var(--hat-text, var(--_hat-text)));
  --bento-primary-light: color-mix(in srgb, var(--hat-primary, var(--_hat-primary)) 8%, transparent);
  --bento-success: var(--hat-good, var(--_hat-good));
  --bento-error: var(--hat-crit, var(--_hat-crit));
  --bento-warning: var(--hat-warn, var(--_hat-warn));
  --bento-bg: var(--hat-bg, var(--_hat-bg));
  --bento-card: var(--hat-card, var(--_hat-card));
  --bento-border: var(--hat-border, var(--_hat-border));
  --bento-text: var(--hat-text, var(--_hat-text));
  --bento-text-secondary: var(--hat-text-2, var(--_hat-text-2));
  --bento-text-muted: var(--hat-text-2, var(--_hat-text-2));
  --bento-radius-xs: var(--hat-radius, var(--_hat-radius));
  --bento-radius-sm: var(--hat-radius, var(--_hat-radius));
  --bento-radius-md: var(--hat-radius, var(--_hat-radius));
  --bento-radius: var(--hat-radius, var(--_hat-radius));
  --bento-shadow-sm: var(--ha-card-box-shadow, none);
  --bento-shadow-md: var(--ha-card-box-shadow, none);
  --bento-shadow-lg: var(--ha-card-box-shadow, none);
  --bento-transition: var(--hat-motion,150ms ease);
  --bento-success-light: color-mix(in srgb, var(--hat-good, var(--_hat-good)) 8%, transparent);
  --bento-error-light: color-mix(in srgb, var(--hat-crit, var(--_hat-crit)) 8%, transparent);
  --bento-warning-light: color-mix(in srgb, var(--hat-warn, var(--_hat-warn)) 8%, transparent);
  --energy-value-blue: var(--hat-primary, var(--_hat-primary));
  --energy-value-amber: var(--hat-warn-text, var(--_hat-warn-text));
  --energy-value-green: var(--hat-good-text, var(--_hat-good-text));
  --energy-value-red: var(--hat-crit-text, var(--_hat-crit-text));
  --energy-value-neutral: var(--hat-text-2, var(--_hat-text-2));
  --energy-value-purple: var(--hat-d2, var(--_hat-d2));
  --energy-success-button: var(--hat-primary-fill, var(--_hat-primary-fill));
  font-family:var(--hat-font, var(--_hat-font));font-size:14px;line-height:20px;color:var(--hat-text, var(--_hat-text));
}

:is(.card,.card-container,.panel-root,ha-card,.stat,.stat-card) { border-radius:var(--hat-radius, var(--_hat-radius));box-shadow:var(--ha-card-box-shadow,none); }
:is(button,.btn,.tab,.tab-btn,.tab-button,input,select,textarea) { font-family:var(--hat-font, var(--_hat-font));font-size:14px;line-height:20px; }
:is(.btn-primary,button.active,.btn.active,.action-btn.active) { background:var(--hat-primary-fill, var(--_hat-primary-fill));color:var(--hat-on-primary, var(--_hat-on-primary));border-color:var(--hat-primary-fill, var(--_hat-primary-fill));box-shadow:none; }
:is(.btn-primary,button.active,.btn.active,.action-btn.active):hover { background:var(--hat-primary-fill, var(--_hat-primary-fill));color:var(--hat-on-primary, var(--_hat-on-primary));filter:brightness(.96); }
.btn-ok { background:var(--hat-primary-fill, var(--_hat-primary-fill));color:var(--hat-on-primary, var(--_hat-on-primary));border-color:var(--hat-primary-fill, var(--_hat-primary-fill)); }
:is(.badge,.status-badge,.tag,.chip,.trend-badge) { min-height:24px;box-sizing:border-box;border:1px solid currentColor;border-radius:999px;background:transparent;font-size:12px;line-height:16px;text-transform:none;letter-spacing:normal; }
:is(.badge-success,.badge-ok,.status-ok,.status-good,.trend-down) { color:var(--hat-good-text, var(--_hat-good-text)); }
:is(.badge-error,.badge-er,.status-error,.status-critical,.trend-up) { color:var(--hat-crit-text, var(--_hat-crit-text)); }
:is(.badge-warning,.badge-wa,.status-warning) { color:var(--hat-warn-text, var(--_hat-warn-text)); }
:is(.stat-value,.metric-value,.stat-number) { font-weight:600;line-height:34px;font-variant-numeric:tabular-nums; }
:is(.stat-label,.stat-sub,.header-sub,.panel-subtitle,.pagination-info,.pag-info) { font-size:12px;line-height:16px;color:var(--hat-text-2, var(--_hat-text-2)); }
:is(.card,.card-container,.panel-root) a { color:var(--hat-primary, var(--_hat-primary));text-underline-offset:2px; }
:is(.insights-measured,.patterns-measured) svg text { font-family:var(--hat-font, var(--_hat-font)); }
:is(.insights-measured,.patterns-measured) { line-height:20px; }
:is(.card,.card-container,.panel-root) :is(button,input,select,summary,a):focus-visible { outline:2px solid var(--hat-primary, var(--_hat-primary));outline-offset:2px; }
@media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation:none;transition:none; } }

:is(.header-title,.panel-title){font-size:16px;line-height:22px;font-weight:600}

:is(.card,.card-container,.panel-root) td{font-size:14px;line-height:20px}

.step-num{background:var(--hat-primary-fill, var(--_hat-primary-fill));color:var(--hat-on-primary, var(--_hat-on-primary))}

${this._getTariffHostV3().ui().css}
</style>
    `;
  }

  _text(en, pl) {
    const language = this._hass?.locale?.language || this._hass?.language || 'en';
    return language.split('-')[0] === 'pl' ? pl : en;
  }

  _applyChartTheme(config) {
    const style = getComputedStyle(this);
    const text = style.getPropertyValue('--primary-text-color').trim() || '#172335';
    const border = style.getPropertyValue('--divider-color').trim() || '#d6dce5';
    config.options.color = text;
    config.options.locale = this._hass?.locale?.language || this._hass?.language || 'en';
    const legend = config.options.plugins?.legend;
    if (legend) legend.labels = { ...legend.labels, color: text };
    for (const scale of Object.values(config.options.scales || {})) {
      scale.ticks = { ...scale.ticks, color: text };
      scale.title = { ...scale.title, color: text };
      scale.grid = { ...scale.grid, color: border };
    }
    return config;
  }

  _powerMarkupV4() {
    const t = (en, pl) => this._text(en, pl);
    if (this._currentPowerW !== null && this._hass?.user?.id && this._hass?.connection?.connected !== false) return `<div class="summary-card power-draw"><div class="power-draw-unit">${t('Current Power Draw', 'Moc chwilowa')}</div><div class="power-draw-value">${createFormatUi(this._hass?.locale?.language || this._hass?.language || 'en').number(this._currentPowerW / 1000, {minimumFractionDigits:2, maximumFractionDigits:2})}</div><div class="power-draw-unit">kW</div></div>`;
    const sensors = Object.entries(this._hass?.states || {}).filter(([id, state]) => id.startsWith('sensor.') && ['W','kW'].includes(state?.attributes?.unit_of_measurement));
    const selected = sensors.some(([id]) => id === this._powerSetupEntityV4) ? this._powerSetupEntityV4 : '';
    return `<div class="power-setup">${this._config.power_entity ? `<p data-power-status>${t('Current power: configured sensor unavailable or has an unsupported unit. Check the sensor (W or kW).', 'Moc chwilowa: pomiar skonfigurowanego czujnika jest niedostępny lub ma nieobsługiwaną jednostkę. Sprawdź czujnik (W lub kW).')}</p>` : ''}
      <details data-power-setup${this._powerSetupOpenV4 ? ' open' : ''}><summary>${this._config.power_entity ? t('Choose sensor', 'Wybierz czujnik') : t('Instant power (optional) · Choose sensor', 'Moc chwilowa (opcjonalnie) · Wybierz czujnik')}</summary>
      <p>${t('Choose a power sensor below. Edit this card, open the code editor and add the selected setting, then save the card. This guide does not save card settings.', 'Wybierz czujnik mocy poniżej. Edytuj tę kartę, otwórz edytor kodu, dodaj wybrane ustawienie i zapisz kartę. Ten poradnik nie zapisuje ustawień karty.')}</p>
      <label>${t('Power sensor (W or kW)', 'Czujnik mocy (W lub kW)')}<select id="power-sensor-guide"><option value="">${t('Choose…', 'Wybierz…')}</option>${sensors.map(([id,state]) => `<option value="${_esc(id)}"${id === selected ? ' selected' : ''}>${_esc(state.attributes?.friendly_name || id)} (${_esc(id)})</option>`).join('')}</select></label>
      ${!sensors.length ? `<p>${t('No power sensors in W or kW were found in Home Assistant.', 'Nie znaleziono czujników mocy w W lub kW w Home Assistant.')}</p>` : ''}
      <pre><code tabindex="0">${_esc(selected ? 'power_entity: ' + selected : t('Select a sensor above.', 'Wybierz czujnik powyżej.'))}</code></pre></details></div>`;
  }

  _clearAnalysisLegacyV53() {
    this._energyModel=null;this._patternsDataset=null;this._patternsState=null;this._dashboardStateV3=null;
    this._energyData=[];this._weeklyData=[];this._hasRealData=false;this._todayWindow=null;
    this._comparisonData=null;this._recommendations=[];this._lastStatsFetch=0;
    this._hourlyBucketCounts=[];this._energySensorIds=[];this._dayKeys=[];this._dashboardChartDatasetV3=null;
  }
  _loadAnalysisLegacyV53() {
    this._render();void this._fetchEnergyStats();
  }
  _getTemplate() {
    if(!this._analysisLegacyAllowedV53()) {
      const tabs=[['dashboard','Overview','Przegląd'],['patterns','Patterns','Wzorce'],['recommendations','Tariff costs','Koszty taryfy'],['compare','Compare','Porównanie']];
      return `<div class="card-container"><div class="optimizer-heading"><h2 class="card-title">${_esc(this._config.title || 'Energy Optimizer')}</h2></div><div class="optimizer-tools">${this._powerMarkupV4()}</div>
      <div class="tabs optimizer-navigation" role="tablist">${tabs.map(([id,en,pl])=>`<button class="tab-button" data-tab="${id}" role="tab">${this._text(en,pl)}</button>`).join('')}</div>
      ${tabs.map(([id])=>`<div id="${id}" class="tab-content"></div>`).join('')}${this._tariffDetailsMarkup()}${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-optimizer') ? ENERGY_OPTIMIZER_DONATE_HTML : ''}</div>`;
    }
    const format = createFormatUi.forHass(this._hass);
    const window = this._todayWindow, selected = window?.selected;
    const periodMarkup = window ? format.periodMarkup({ ...window, sourceTimeZone:this._energyModel?.zone, label: this._text('Today', 'Dziś'),
      source: 'Energy Dashboard / Recorder · ' + format.count((this._energySensorIds || []).length, {one:this._text('source','źródło'),few:'źródła',many:'źródeł',other:this._text('sources','źródła')}), measured: selected?.filter(([, point]) => point.kwh !== null).length,
      expected: selected?.length, unit: this._text('completed intervals', 'zakończonych przedziałów'),
      details: (this._energySensorIds || []).join(', ') + '. ' + this._text('Only completed Recorder intervals are shown. Repeated local hours keep distinct UTC offsets; future or skipped hours are not measured zero.', 'Pokazano tylko zakończone przedziały Recorder. Powtórzone godziny zachowują odrębne przesunięcia UTC; przyszła lub pominięta godzina nie oznacza zmierzonego zera.') }) : '';

    if (!this._hasRealData) return `<div class="card-container"><h2 class="card-title">${_esc(this._config.title || 'Energy Optimizer')}</h2>${periodMarkup}${this._powerMarkupV4()}<div class="empty-state" role="status">${this._statsLoading ? this._text("Loading Energy Dashboard statistics…", "Ładowanie statystyk panelu Energia…") : this._energyError?.message?.includes('Missing Energy Dashboard statistic series') ? this._text("No recent Recorder statistics for the configured grid import.", "Brak bieżących statystyk Recorder dla skonfigurowanego importu z sieci.") : this._energyError?.message?.includes('No Energy Dashboard grid import source') ? this._text("No supported Energy Dashboard grid import statistics found.", "Nie znaleziono obsługiwanych statystyk importu z sieci w panelu Energia.") : this._energyError?.message?.includes('Incomplete Energy Dashboard hourly coverage') ? this._text("Some completed hours have no measurement. The period total is unavailable; measured hours remain in Patterns.", "Brakuje pomiarów dla części zakończonych godzin. Suma okresu jest niedostępna; zmierzone godziny są dostępne we Wzorcach.") : this._energyError ? this._text("Energy statistics could not be loaded.", "Nie udało się wczytać statystyk energii.") : this._text("No supported Energy Dashboard grid import statistics found.", "Nie znaleziono obsługiwanych statystyk importu z sieci w panelu Energia.")} <a href="/energy">${this._text("Open Energy Dashboard", "Otwórz panel Energia")}</a></div>${this._energyModel?.points ? `<div id="patterns">${this._patternsMarkup()}</div>` : ''}${this._tariffDetailsMarkup()}${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-optimizer') ? ENERGY_OPTIMIZER_DONATE_HTML : ''}</div>`;
    return `
      <div class="card-container">
        <h2 class="card-title">${_esc(this._config.title || 'Energy Optimizer')}</h2>

        ${periodMarkup}

        ${energyTodayBoundaryMarkup(this._todayWindow, this._energyModel?.zone || '', this._hass?.locale?.language || this._hass?.language || 'en')}
        <div class="tabs" role="tablist">
          <button class="tab-button active" data-tab="dashboard" role="tab" aria-selected="${this._currentTab === 'dashboard'}">${this._text("Dashboard", "Przegląd")}</button>
          <button class="tab-button" data-tab="patterns" role="tab" aria-selected="${this._currentTab === 'patterns'}">${this._text("Patterns", "Wzorce")}</button>
          <button class="tab-button" data-tab="recommendations" role="tab" aria-selected="${this._currentTab === 'recommendations'}">${this._text("Tariff costs", "Koszty taryfy")}</button>
          <button class="tab-button" data-tab="compare" role="tab" aria-selected="${this._currentTab === 'compare'}">${this._text("Compare", "Porównanie")}</button>
        </div>

        <div id="dashboard" class="tab-content active">
          <div class="grid">
            <div class="summary-card">
              <span class="summary-label">${this._text("Today's Usage", "Zużycie dzisiaj")}</span>
              <div class="summary-value">${this._calculateTodayUsage() === null ? 'N/A' : format.number(this._calculateTodayUsage(), {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
              <span class="summary-label">kWh</span>
            </div>
            <div class="summary-card alt">
              <span class="summary-label">${this._text("Cost Estimate", "Koszt okresu")}</span>
              <div class="summary-value">${this._calculateTodayCost() === null ? 'N/A' : format.number(this._calculateTodayCost(), {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
              <span class="summary-label">${_esc(this._todayTariffCosts().currency || '')} ${this._text('energy + variable fees', 'energia + opłaty zmienne')}</span>
            </div>
            <div class="summary-card warn">
              <span class="summary-label">${this._text("Highest consumption", "Najwyższe zużycie")}</span>
              ${this._peakHourMarkupV3()}
              <span class="summary-label">${this._text("Measured interval", "Zmierzony przedział")}</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">${this._text("Measured hours", "Zmierzone godziny")}</span>
              <div class="summary-value">${this._todayTariffCosts().rows.length}</div>
              <span class="summary-label">${this._text("Completed Recorder buckets", "Zakończone przedziały Recorder")}</span>
            </div>
            ${this._powerMarkupV4()}
          </div>

          ${this._dashboardChartMarkupV3()}
        </div>

        <div id="patterns" class="tab-content">${this._patternsMarkup()}</div>

        <div id="recommendations" class="tab-content">
          <div id="recommendations-list"></div>
        </div>

        <div id="compare" class="tab-content">
          <div class="comparison-grid">
            <div class="comparison-card"><div class="comparison-title">${this._text("Last 7 days (168 hours)", "Ostatnie 7 dni (168 godzin)")}</div><div class="comparison-value">${this._comparisonData.thisWeek === null ? 'N/A' : format.number(this._comparisonData.thisWeek, {minimumFractionDigits:2, maximumFractionDigits:2})}</div><div class="comparison-title">${this._text("kWh grid import", "kWh importu z sieci")}</div></div>
            <div class="comparison-card"><div class="comparison-title">${this._text("Previous 7 days (168 hours)", "Poprzednie 7 dni (168 godzin)")}</div><div class="comparison-value">${this._comparisonData.lastWeek === null ? 'N/A' : format.number(this._comparisonData.lastWeek, {minimumFractionDigits:2, maximumFractionDigits:2})}</div><div class="comparison-title">${this._text("kWh grid import", "kWh importu z sieci")}</div></div>
          </div>
          <p>${this._text("Only recorded periods are shown. Monthly and cost comparisons need complete source and tariff data.", "Pokazano tylko zarejestrowane okresy. Porównania miesięczne i kosztowe wymagają kompletnych źródeł oraz danych taryfy.")}</p>
        </div>
        ${this._tariffDetailsMarkup()}${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-optimizer') ? ENERGY_OPTIMIZER_DONATE_HTML : ''}
      </div>
    `;
  }

  _setupEventListeners() {
    const powerSetup = this.shadowRoot.querySelector('[data-power-setup]');
    powerSetup?.addEventListener('toggle', () => { this._powerSetupOpenV4 = powerSetup.open; });
    powerSetup?.querySelector('select')?.addEventListener('change', event => {
      this._powerSetupEntityV4 = event.target.value;
      powerSetup.querySelector('code').textContent = event.target.value ? 'power_entity: ' + event.target.value : this._text('Select a sensor above.', 'Wybierz czujnik powyżej.');
    });
    const buttons = this.shadowRoot.querySelectorAll('.tab-button');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        buttons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
        this._currentTab = button.dataset.tab;
        this._observeTariffNavigationV3();
        this._showTab(button.dataset.tab);
      });
    });
  }
  async _loadChartJS() {
    if (this._chartJsLoaded && HA_ENERGY_CHART) return HA_ENERGY_CHART;
    if (HA_ENERGY_CHART) {
      this._chartJsLoaded = true;
      return HA_ENERGY_CHART;
    }
    this.shadowRoot.querySelectorAll('canvas').forEach(canvas => {
      const fallback = document.createElement('div');
      fallback.className = 'chart-unavailable';
      fallback.setAttribute('role', 'status');
      fallback.textContent = this._text('Chart unavailable — numeric analysis remains available.', 'Wykres niedostępny — analiza liczbowa pozostaje dostępna.');
      canvas.replaceWith(fallback);
    });
    return null;
  }

  _destroyChart(chartKey) {
    if (this._charts[chartKey]) {
      this._charts[chartKey].destroy();
      delete this._charts[chartKey];
    }
  }

  _destroyAllCharts() {
    Object.keys(this._charts).forEach(key => {
      this._destroyChart(key);
    });
  }

  _showTab(tabName) {
    const tabs = this.shadowRoot.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    const tabEl = this.shadowRoot.getElementById(tabName);
    if (tabEl) {
      tabEl.classList.add('active');
    }

    const buttons = [...this.shadowRoot.querySelectorAll('.tab-button')];
    buttons.forEach(button => {
      const active = button.dataset.tab === tabName;
      button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
    });
    const picker = this.shadowRoot.querySelector('.energy-tab-picker select');
    if (picker) picker.value = String(buttons.findIndex(button => button.dataset.tab === tabName));
    if(!this._analysisLegacyAllowedV53()) {
      for(const tab of tabs)tab.replaceChildren();
      if(tabEl)tabEl.innerHTML=`<div data-analysis-mount-v53 data-analysis-section="${tabName==='patterns'?'patterns':tabName==='recommendations'?'rates':tabName==='compare'?'comparison':'overview'}"></div>`;
      this._syncAnalysisV53();return;
    }
    // Before legacy measurements arrive, the empty state has no tab container.
    // Keep the negotiated compatibility view mounted while its first read settles.
    this._getAnalysisHostV53().mount(tabEl || this.shadowRoot.querySelector('.card-container'));
    if (tabName === 'patterns') return; // SVG observes its own size; navigation never refetches measurements.
    if (tabName === 'recommendations') this._renderRecommendations();
    // Draw charts after showing tab (needed for canvas sizing)
    this._schedule(() => {
      if (tabName === 'dashboard') {
        this._drawDashboardChart().catch(err => console.error('Dashboard chart error:', err));
      } else if (tabName === 'compare') {
        this._drawComparisonChart().catch(err => console.error('Comparison chart error:', err));
      }
    }, 100);
  }

  _renderCurrentTab() {
    this._showTab(this._currentTab || 'dashboard');
  }

  _dashboardRowsV3() {
    const model = this._energyModel;
    return model?.points ? createEnergyPatternsV3({ ...model, start: model.todayStart }, this._getTariffV3()).hours : [];
  }

  _dashboardLabelV3(row) {
    return createFormatUi.forHass(this._hass).pointLabel(row.from);
  }

  _dashboardTariffV4(rows) {
    const profile = this._sharedTariffNeedsConfirmationV3() ? null : this._getTariffHostV3().profile();
    const zones = Array.isArray(profile?.zones) ? profile.zones : [];
    const palette = ['#3578cf', '#29856b', '#ad6c1e', '#8d63ba', '#bc5773', '#427f94'];
    const describe = row => {
      if (row.priceMissing || !row.tariffZones?.length) return { key: 'unavailable',
        label: this._text('Tariff unavailable', 'Taryfa niedostępna'), color: '#858a92' };
      const label = id => id === 'dynamic' ? this._text('Dynamic tariff', 'Taryfa dynamiczna') : zones.find(zone => zone.id === id)?.label || id;
      if (row.tariffZoneAttribution === 'multiple') return { key: 'multiple:' + JSON.stringify(row.tariffZones),
        label: this._text('Multiple zones (same rate)', 'Wiele stref (ta sama stawka)') + ': ' + row.tariffZones.map(label).join(' / '), color: '#80679b' };
      const index = zones.findIndex(zone => zone.id === row.tariffZone);
      return { key: row.tariffZone, label: label(row.tariffZone), color: index < palette.length ? palette[Math.max(0,index)] : `hsl(${Math.round(index * 137.5) % 360} 45% 45%)` };
    };
    const items = rows.map(describe), legend = [...new Map(items.map(item => [item.key, item])).values()];
    return { items, legend };
  }

  _dashboardChartMarkupV3() {
    const rows = this._dashboardRowsV3(), t = (en, pl) => this._text(en, pl);
    const tariff = this._dashboardTariffV4(rows);
    const identity = JSON.stringify([this._energyModel?.ids, this._energyModel?.zone, this._energyModel?.todayStart]);
    if (this._dashboardStateV3?.identity !== identity) this._dashboardStateV3 = { identity, view: 'chart', selected: null };
    const state = this._dashboardStateV3;
    if (!rows.some(row => row.id === state.selected)) state.selected = rows.at(-1)?.id ?? null;
    const selected = rows.find(row => row.id === state.selected);
    const number = row => row.kwh === null ? t('No measurement', 'Brak pomiaru') : `${this._patternsNumber(row.kwh)} kWh`;
    return `<section class="chart-container patterns-measured" data-dashboard-chart-section>
      <h3>${t('Hourly consumption · today', 'Zużycie godzinowe · dzisiaj')}</h3>
      <div data-dashboard-tariff-legend role="list" aria-label="${t('Tariff zones', 'Strefy taryfy')}" style="display:flex;flex-wrap:wrap;gap:12px;margin:12px 0">${tariff.legend.map(item => `<span role="listitem" style="display:inline-flex;gap:6px;align-items:center;overflow-wrap:anywhere"><span aria-hidden="true" style="width:14px;height:14px;flex:0 0 14px;background:${item.color};border-radius:3px"></span>${_esc(item.label)}</span>`).join('')}</div>
      <details data-dashboard-source><summary>${t('Source and time details', 'Źródło i szczegóły czasu')}</summary><p>${_esc(this._energyModel?.zone || '')} · ${_esc((this._energyModel?.ids || []).join(', '))}</p></details>
      <div class="patterns-switch" role="group" aria-label="${t('Presentation', 'Prezentacja')}">
        <button type="button" data-dashboard-control="chart" aria-pressed="${state.view === 'chart'}">${t('Chart', 'Wykres')}</button>
        <button type="button" data-dashboard-control="data" aria-pressed="${state.view === 'data'}">${t('Data', 'Dane')}</button>
      </div>
      ${state.view === 'chart' ? `<div class="chart-plot"><canvas id="dashboard-chart" role="img" aria-label="${t('Recorded consumption in kWh; exact values in Data and point details below', 'Zarejestrowane zużycie w kWh; dokładne wartości w Danych i szczegółach punktu poniżej')}"></canvas></div>` : `<div class="patterns-table" tabindex="0" role="region" aria-label="${t('Measured data table', 'Tabela zmierzonych danych')}"><table>
        <caption>${t('Same completed intervals as the chart', 'Te same zakończone przedziały co na wykresie')} · kWh</caption>
        <thead><tr><th scope="col">${t('Local hour and UTC interval', 'Godzina lokalna i przedział UTC')}</th><th scope="col">kWh</th><th scope="col">${t('Tariff zone', 'Strefa taryfy')}</th></tr></thead>
        <tbody>${rows.map((row, index) => `<tr data-dashboard-row="${_esc(row.id)}" data-kwh="${row.kwh === null ? 'null' : row.kwh}"><th scope="row">${_esc(this._dashboardLabelV3(row))}<br><small>${_esc(new Date(row.from).toISOString())} — ${_esc(new Date(row.to).toISOString())}</small></th><td>${_esc(number(row))}</td><td data-tariff-zone>${_esc(tariff.items[index].label)}</td></tr>`).join('')}</tbody>
      </table></div>`}
      <div class="patterns-controls"><label>${t('Point details (arrows, Home / End)', 'Szczegóły punktu (strzałki, Home / End)')}<select data-dashboard-control="point" ${rows.length ? '' : 'disabled'}>${rows.map(row => `<option value="${_esc(row.id)}" ${row.id === state.selected ? 'selected' : ''}>${_esc(this._dashboardLabelV3(row))}</option>`).join('')}</select></label></div>
      <div data-dashboard-detail role="status" aria-live="polite">${selected ? `${_esc(this._dashboardLabelV3(selected))}<br>${_esc(selected.kwh === null ? t('No measurement', 'Brak pomiaru') : this._patternsDisplayNumberV5(selected.kwh) + ' kWh')}<br>${_esc(this._dashboardTariffV4([selected]).items[0].label)}${selected.priceMissing ? '<br>' + _esc(this._patternsPriceReason(selected.priceMissing)) : ''}${this._pointTechnicalDetailsV5('dashboard', selected)}` : t('No completed intervals.', 'Brak zakończonych przedziałów.')}</div>
    </section>`;
  }

  _bindDashboardChartV3() {
    const section = this.shadowRoot.querySelector('[data-dashboard-chart-section]');
    if (!section) return;
    const redraw = key => {
      const format = createFormatUi(), context = this._getTariffHostV3().guard.snapshot();
      const details = format.capturePeriods(section, context, context);
      this._destroyChart('dashboard');
      section.outerHTML = this._dashboardChartMarkupV3();
      this._bindDashboardChartV3();
      this.shadowRoot.querySelector(`[data-dashboard-control="${key}"]`)?.focus({ preventScroll: true });
      format.restorePeriods(this.shadowRoot, details);
      if (this._dashboardStateV3.view === 'chart') this._drawDashboardChart();
    };
    section.querySelectorAll('button[data-dashboard-control]').forEach(button => button.addEventListener('click', () => {
      this._dashboardStateV3.view = button.dataset.dashboardControl;
      redraw(button.dataset.dashboardControl);
    }));
    const point = section.querySelector('[data-dashboard-control="point"]');
    point?.addEventListener('change', () => { this._dashboardStateV3.selected = point.value; redraw('point'); });
    point?.addEventListener('keydown', event => {
      const rows = this._dashboardRowsV3(), index = rows.findIndex(row => row.id === this._dashboardStateV3.selected);
      const move = { ArrowLeft: index - 1, ArrowUp: index - 1, ArrowRight: index + 1, ArrowDown: index + 1, Home: 0, End: rows.length - 1 };
      if (!Object.hasOwn(move, event.key)) return;
      event.preventDefault();
      this._dashboardStateV3.selected = rows[Math.max(0, Math.min(rows.length - 1, move[event.key]))]?.id ?? null;
      redraw('point');
    });
  }

  async _drawDashboardChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('dashboard-chart');
      if (!canvas) return;

      this._destroyChart('dashboard');

      const ctx = canvas.getContext('2d');
      const rows = this._dashboardRowsV3();
      const format = createFormatUi.forHass(this._hass);
      const labels = format.chartLabels(rows.map(row => row.from));
      const axisTicks = new Map(format.chartTicks(rows.map(row => row.from)).map(tick => [tick.index, tick.label]));
      const data = rows.map(row => row.kwh);

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: this._text("Energy Usage (kWh)", "Zużycie energii (kWh)"),
            data: data,
            backgroundColor: this._dashboardTariffV4(rows).items.map(item => item.color),
            borderColor: this._dashboardTariffV4(rows).items.map(item => item.color),
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: undefined,
          plugins: {
            legend: {
              display: false,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh · ${this._dashboardTariffV4(rows).items[context.dataIndex]?.label || ''}`;
                },
                title: (context) => {
                  return this._dashboardLabelV3(rows[context[0].dataIndex]);
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Energy (kWh)", "Energia (kWh)")
              }
            },
            x: {
              ticks: {
                autoSkip: false, minRotation: 0, maxRotation: 0,
                callback(value) { return axisTicks.get(Number(value)) || ''; }
              },
              title: {
                display: true,
                text: this._text("Hour of Day", "Godzina dnia")
              }
            }
          }
        }
      };

      this._charts['dashboard'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing dashboard chart:', error);
    }
  }
_drawHeatmap() {
    try {
      const canvas = this.shadowRoot.getElementById('heatmap-canvas');
      if (!canvas) return;

      this._fixCanvasSize(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = 200 * dpr;
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = 200;
      const padding = 40;
      const days = (this._dayKeys || []).map(key => key.slice(5));
      const cellWidth = (width - padding * 2) / 24;
      const cellHeight = (height - padding * 2) / 7;

      // Find min/max for color scaling
      const allValues = (this._weeklyData || []).flat().filter(value => typeof value === 'number');
      const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
      const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
      const range = maxVal - minVal || 1;

      // Helper to get color from value (blue to red gradient)
      const getColor = (val) => {
        const normalized = (val - minVal) / range;
        const hue = (1 - normalized) * 240; // 240 = blue, 0 = red
        return `hsl(${hue}, 70%, 50%)`;
      };

      // Draw cells
      (this._weeklyData || []).forEach((dayData, dayIndex) => {
        dayData.forEach((value, hourIndex) => {
          const x = padding + hourIndex * cellWidth;
          const y = padding + dayIndex * cellHeight;

          ctx.fillStyle = value === null ? 'rgba(128,128,128,0.15)' : getColor(value);
          ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);

          // Draw cell border
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellWidth - 1, cellHeight - 1);
        });
      });

      // Day labels (Y-axis)
      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--primary-text-color').trim() || '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      days.forEach((day, i) => {
        const y = padding + (i + 0.5) * cellHeight;
        ctx.fillText(day, padding - 10, y);
      });

      // Hour labels (X-axis)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let h = 0; h < 24; h += 3) {
        const x = padding + (h + 0.5) * cellWidth;
        ctx.fillText(h + ':00', x, height - padding + 5);
      }

      // Legend
      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--primary-text-color').trim() || '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      const legendX = padding;
      const legendY = height - 15;
      ctx.fillText(`Min: ${minVal.toFixed(2)} kWh`, legendX, legendY);
      ctx.fillText(`Max: ${maxVal.toFixed(2)} kWh • Grey = unavailable`, legendX + 120, legendY);
    } catch (err) {
      console.error('Heatmap error:', err);
    }
  }


  async _drawTrendChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('trend-chart');
      if (!canvas) return;

      this._destroyChart('trend');

      const ctx = canvas.getContext('2d');
      const dailyTotals = this._dailyTotals || [];
      const labels = this._dayKeys || [];

      const chartConfig = {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: this._text('Daily Total Usage (kWh)', 'Dzienne zużycie energii (kWh)'),
            data: dailyTotals,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: 'rgb(59, 130, 246)',
            pointBorderColor: 'white',
            pointBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Daily Total (kWh)", "Zużycie dzienne (kWh)")
              }
            },
            x: {
              title: {
                display: true,
                text: this._text("Date (Home Assistant timezone)", "Data (strefa Home Assistant)")
              }
            }
          }
        }
      };

      this._charts['trend'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing trend chart:', error);
    }
  }
async _drawWeekdayChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('weekday-chart');
      if (!canvas) return;

      this._destroyChart('weekday');

      const ctx = canvas.getContext('2d');
      const dailyTotals = this._dailyTotals || [];
      const labels = this._dayKeys || [];

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: this._text('Daily Total Usage (kWh)', 'Dzienne zużycie energii (kWh)'),
            data: dailyTotals,
            backgroundColor: [
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(59, 130, 246, 0.7)',
              'rgba(59, 130, 246, 0.7)'
            ],
            borderColor: [
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(59, 130, 246)',
              'rgb(59, 130, 246)'
            ],
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Daily Total (kWh)", "Zużycie dzienne (kWh)")
              }
            },
            x: {
              title: {
                display: true,
                text: this._text("Date (Home Assistant timezone)", "Data (strefa Home Assistant)")
              }
            }
          }
        }
      };

      this._charts['weekday'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing weekday chart:', error);
    }
  }
async _drawComparisonChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('comparison-chart');
      if (!canvas) return;

      this._destroyChart('comparison');

      const ctx = canvas.getContext('2d');
      
      const compData = this._comparisonData || {};
      const labels = [this._text("Last 7 days", "Ostatnie 7 dni"), this._text("Previous 7 days", "Poprzednie 7 dni")];

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: this._text('Grid import (kWh)', 'Import z sieci (kWh)'),
            data: [compData.thisWeek ?? null, compData.lastWeek ?? null],
            backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(100, 116, 139, 0.7)'],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.dataset.label}: ${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Daily Total (kWh)", "Zużycie dzienne (kWh)")
              }
            },
            x: {
              title: {
                display: true,
                text: 'Completed period'
              }
            }
          }
        }
      };

      this._charts['comparison'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing comparison chart:', error);
    }
  }


  _renderRecommendations() {
    const container = this.shadowRoot.getElementById('recommendations-list');
    if (!container) return;
    const result = this._todayTariffCosts();
    const format = createFormatUi(this._hass?.locale?.language || this._hass?.language || 'en', this._hass?.config?.time_zone || 'UTC');
    const number = value => typeof value === 'number' && Number.isFinite(value) ? format.number(value, {minimumFractionDigits:2, maximumFractionDigits:2}) : this._text('No data', 'Brak danych');
    const rateNumber = value => typeof value === 'number' && Number.isFinite(value) ? format.number(value, {maximumSignificantDigits:12, useGrouping:false}) : this._text('No data', 'Brak danych');
    const unit = _esc(result.currency || '');
    const groups = new Map();
    if (result.complete) for (const row of result.rows) {
      const key = JSON.stringify([row.zones || [row.zone], row.energyRate, row.variableRate]);
      if (!groups.has(key)) groups.set(key, { ...row, kwh: 0, energyCost: 0, variableCost: row.variableCost === null ? null : 0 });
      const group = groups.get(key); group.kwh += row.kwh; group.energyCost += row.energyCost;
      if (group.variableCost !== null) group.variableCost += row.variableCost;
    }
    const profile = this._getTariffHostV3().profile();
    const zoneLabel = row => {
      const label = id => profile?.zones?.find(zone => zone.id === id)?.label || id;
      return row.zoneAttribution === 'multiple'
        ? `${this._text('Multiple zones (same rate)', 'Wiele stref (ta sama stawka)')}: ${row.zones.map(label).join(', ')}`
        : label(row.zone);
    };
    container.innerHTML = `<h3>${this._text('Tariff costs', 'Koszty taryfy')}</h3>
      <p>${this._text('Measured grid import × configured prices. Energy and fees are shown separately.', 'Zmierzony import z sieci × skonfigurowane stawki. Energia i opłaty są pokazane osobno.')}</p>
      <p>${this._text('Tariff clock', 'Zegar taryfy')}: ${_esc(result.timezone || '')} · ${result.priceBasis === 'net' ? this._text('net', 'netto') : this._text('gross', 'brutto')}</p>
      ${!result.complete ? `<p role="status">${this._text('Cost unavailable: incomplete measurements or tariff. Configure a valid tariff and check source coverage.', 'Koszt niedostępny: niepełne pomiary lub taryfa. Skonfiguruj poprawną taryfę i sprawdź kompletność źródeł.')}</p>` : `
      <div style="max-width:100%;overflow:auto"><table><caption>${this._text('Measured consumption by tariff zone', 'Zmierzony import według stref taryfy')}</caption><thead><tr>
        <th>${this._text('Zone', 'Strefa')}</th><th>kWh</th><th>${this._text('Energy rate', 'Stawka energii')} (${unit}/kWh)</th><th>${this._text('Energy cost', 'Koszt energii')} (${unit})</th><th>${this._text('Variable fees', 'Opłaty zmienne')} (${unit})</th>
      </tr></thead><tbody>${[...groups.values()].map(row => `<tr><th scope="row">${_esc(zoneLabel(row))}</th><td>${number(row.kwh)}</td><td>${rateNumber(row.energyRate)}</td><td>${number(row.energyCost)}</td><td>${number(row.variableCost)}</td></tr>`).join('')}</tbody></table></div>`}
      <p>${this._text('Measured usage', 'Zmierzony import')}: ${number(result.kwh)} kWh</p>
      <p><b>${this._text('Energy cost', 'Koszt energii')}: ${number(result.energyCost)} ${unit}</b></p>
      <p>${this._text('Variable fees', 'Opłaty zmienne')}: ${number(result.variableCost)} ${unit}</p>
      <p>${this._text('Usage cost (energy + variable fees)', 'Koszt zużycia (energia + opłaty zmienne)')}: ${number(result.usageCost)} ${unit}</p>
      <p>${this._text('Fixed monthly fees (shown separately, not added to this period)', 'Stałe opłaty miesięczne (osobno, nie doliczane do tego okresu)')}: ${number(result.fixedMonthly)} ${unit}</p>`;
  }

  _calculateTodayUsage() {
    return this._todayWindow?.total ?? null;
  }

  _calculateTodayCost() {
    return this._energySnapshotV5?.today?.usage_cost ?? null;
  }

  _getPeakRowV3() {
    const rows = this._dashboardRowsV3(false);
    const maximum = Math.max(0, ...rows.map(row => row.kwh ?? 0));
    return maximum > 0 ? rows.find(row => row.kwh === maximum) : null;
  }

  _getPeakHour() { return this._getPeakRowV3()?.hour ?? null; }

  _peakHourMarkupV3() {
    const row = this._getPeakRowV3(), format = createFormatUi.forHass(this._hass);
    return row ? `<div data-dashboard-peak="${_esc(row.id)}" data-kwh="${row.kwh}"><div class="summary-value">${_esc(format.clock(row.from, format.timeZone !== this._hass?.config?.time_zone))}</div><span class="summary-label">${_esc(format.date(row.from))}</span></div>` : '<div class="summary-value">N/A</div>';
  }

  _calculateEfficiencyScore() {
    const peakRatio = this._calculatePeakRatio();
    if (peakRatio === null) return 'N/A';
    const baseScore = 100;
    const peakPenalty = Math.min(30, peakRatio * 5);
    return Math.max(30, baseScore - peakPenalty).toFixed(0);
  }

  _calculatePeakRatio() {
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    const peakBuckets = this._hourlyBucketCounts.slice(peakStart, peakEnd).reduce((a, b) => a + b, 0);
    const offPeakBuckets = this._hourlyBucketCounts.slice(0, peakStart).concat(this._hourlyBucketCounts.slice(peakEnd)).reduce((a, b) => a + b, 0);
    if (!peakBuckets || !offPeakBuckets) return null;
    const peakUsage = this._energyData.slice(peakStart, peakEnd).reduce((a, b) => a + (b ?? 0), 0) / peakBuckets;
    const offPeakUsage = this._calculateOffPeakAverage();
    return offPeakUsage > 0 ? peakUsage / offPeakUsage : null;
  }

  _calculateOffPeakAverage() {
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    const hours = Array.from({ length: 24 }, (_, hour) => hour).filter(hour => hour < peakStart || hour >= peakEnd);
    const buckets = hours.reduce((sum, hour) => sum + (this._hourlyBucketCounts[hour] || 0), 0);
    return buckets ? hours.reduce((sum, hour) => sum + (this._energyData[hour] ?? 0), 0) / buckets : null;
  }
  // --- Pagination helper ---
  _renderPagination(tabName, totalItems) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const pageSize = this._pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(this._currentPage[tabName], totalPages);
    this._currentPage[tabName] = page;
    return `
      <div class="pagination">
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&#8249; ${this._text('Prev', 'Poprzednia')}</button>
        <span class="pagination-info">${page} / ${totalPages} (${totalItems})</span>
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>${this._text('Next', 'Następna')} &#8250;</button>
        <select class="page-size-select" data-page-tab="${tabName}" data-action="page-size">
          ${[10,15,25,50].map(s => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}/page</option>`).join('')}
        </select>
      </div>`;
  }

  _paginateItems(items, tabName) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const start = (this._currentPage[tabName] - 1) * this._pageSize;
    return items.slice(start, start + this._pageSize);
  }

  _setupPaginationListeners() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.pageTab;
        const page = parseInt(e.target.dataset.page);
        if (tab && page > 0) {
          this._currentPage[tab] = page;
          this._render ? this._render() : (this.render ? this.render() : this.renderCard());
        }
      });
    });
    this.shadowRoot.querySelectorAll('.page-size-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this._pageSize = parseInt(e.target.value);
        // Reset all pages to 1
        Object.keys(this._currentPage).forEach(k => this._currentPage[k] = 1);
        this._render ? this._render() : (this.render ? this.render() : this.renderCard());
      });
    });
  }
  // --- Seeded random for stable data ---
  _seededRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  // --- Canvas size fix for Bento CSS ---
  _fixCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }

  getCardSize() { return 10; }

  getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }

  static getStubConfig() { return { type: 'custom:ha-energy-optimizer', title: 'Energy Optimizer' }; }

}

  class HaEnergyOptimizerEditor extends HTMLElement {
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
      const values = { title: this._config.title ?? 'Energy Optimizer', currency: this._config.currency ?? this._hass?.config?.currency ?? '' };
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
        <h3>Energy Optimizer</h3>
              <div style="margin-bottom:12px;">
                <label for="cf_title" style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
                <input type="text" id="cf_title" value="${_esc(this._config?.title ?? 'Energy Optimizer')}"
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

// HA_ENERGY_BUILD1_V53_START
// Pure frontend controller; the existing integration owns scheduling and DST.
// Vendor the exported factory inside consumer IIFEs; no global or second scheduler.
function createHaToolsEmailSchedules({ changed = () => {}, timeoutMs = 8000,
  kind = 'log_digest', recipientEditor = false, projectPreview = null, contextLost = () => {} } = {}) {
  if (!['log_digest', 'energy_report'].includes(kind)) throw new Error('Unsupported schedule kind');
  // Addresses are deliberately separate from controller metadata/history/export.
  recipientEditor = recipientEditor === true && kind === 'energy_report';
  let privateRows = new Map(), privateDraft = null, pendingRecipients = null;
  let connectionOffline = false, browserOffline = globalThis.navigator?.onLine === false, watchedConnection = null;
  let unwatch = () => {};
  const recipients = value => {
    if (!Array.isArray(value) || value.length > 128 || value.some(v => typeof v !== 'string' || !v.trim() || v.length > 255 || /[\r\n]/.test(v)))
      throw { code: 'invalid_recipients' };
    return [...value];
  };
  // Missing channels is the historical email contract. Never infer a target
  // from list position; native defaults/availability belong to the host UI.
  const normalizeChannels = (value, allowEmpty = false) => {
    if (!Array.isArray(value) || value.length > 32 || (!allowEmpty && !value.length)) throw {code:'invalid_channels'};
    const result=[];
    for (let target of value) {
      if (typeof target === 'string' && target.startsWith('notify:')) target='notify.'+target.slice(7);
      if (typeof target !== 'string' || !(['email','persistent_notification'].includes(target) || /^notify\.[a-z0-9_]{1,128}$/.test(target))) throw {code:'invalid_channels'};
      if (!result.includes(target)) result.push(target);
    }
    return result;
  };
  const cloneRow = row => ({...row,...(Array.isArray(row.channels)?{channels:[...row.channels]}:{})});
  const editable = ['id', 'kind', 'cadence', 'time', 'enabled', 'timezone', 'weekday', 'month_day', 'channels'];
  let hass = null, context = null, epoch = 0, checked = false, rows = [], draft = null;
  let calendarCompatible = false, mailCompatible = false;
  let reading = null, writing = false, previewing = null, pendingExpected = null, preview = null;
  let status = { state: 'not_checked', reason: 'initial' }, previewStatus = { state: 'not_checked', reason: 'initial' };
  const cancellations = new Set();
  const capture = value => ({ user: value?.user?.id ?? value?.user ?? null, admin: value?.user?.is_admin === true,
    connection: value?.connection ?? null, online: !!value && !browserOffline && !connectionOffline && value.connected !== false && value.connection?.connected !== false });
  const allowed = () => !!hass && context?.admin && context?.online && !browserOffline && !connectionOffline && hass.user?.is_admin === true && hass.connected !== false && hass.connection?.connected !== false;
  const notify = () => changed();
  const reset = () => {
    epoch++; for (const cancel of [...cancellations]) cancel(); cancellations.clear();
    calendarCompatible = false; mailCompatible = false; checked = false; rows = []; draft = null; privateRows = new Map(); privateDraft = null; pendingRecipients = null; reading = null; writing = false; previewing = null;
    pendingExpected = null; preview = null; status = { state: 'not_checked', reason: 'initial' };
    previewStatus = { state: 'not_checked', reason: 'initial' };
  };
  const request = (source, message, holder = null) => new Promise((resolve, reject) => {
    let done = false;
    const finish = (fn, value) => { if (done) return; done = true; clearTimeout(timer); cancellations.delete(cancel); fn(value); };
    const cancel = () => finish(reject, { code: 'stale_context' });
    const timer = setTimeout(() => finish(reject, { code: 'request_timeout' }), timeoutMs);
    cancellations.add(cancel);
    if (holder) holder.cancel = cancel;
    Promise.resolve().then(() => { if (!done && allowed()) return source.callWS(message); if (!done) throw { code: 'stale_context' }; }).then(value => finish(resolve, value), error => finish(reject, error));
  });
  const same = (expected, actual) => expected.deleted ? !actual : !!actual && editable.every(key =>
    key === 'channels' ? JSON.stringify(expected.channels || ['email']) === JSON.stringify(actual.channels || ['email']) : Object.prototype.hasOwnProperty.call(expected, key) ? actual[key] === expected[key] : key !== 'timezone' || actual[key] === undefined) &&
    (pendingRecipients === null || JSON.stringify(pendingRecipients) === JSON.stringify(privateRows.get(expected.id)));
  const cleanRows = result => {
    if (!result || !Array.isArray(result.schedules) || result.schedules.length > 500) throw { code: 'invalid_response' };
    const ids = new Set(), nextPrivate = new Map();
    const cleanList = result.schedules.map(raw => {
      if (!raw || typeof raw.id !== 'string' || !/^[\w.:-]{1,255}$/.test(raw.id) || ids.has(raw.id) || typeof raw.kind !== 'string') throw { code: 'invalid_response' };
      ids.add(raw.id);
      // Only allowlisted calendar metadata is exposed; arbitrary stored fields stay on the server.
      if (recipientEditor && raw.kind === kind) nextPrivate.set(raw.id, recipients(raw.recipients ?? []));
      const clean = { id: raw.id, kind: ['log_digest', 'energy_report'].includes(raw.kind) ? raw.kind : 'unknown' };
      if (raw.kind === kind) {
        if(Object.hasOwn(raw,'channels')&&kind!=='energy_report')throw {code:'invalid_response'};
        for (const key of editable.filter(key => !['id', 'kind'].includes(key))) if (Object.prototype.hasOwnProperty.call(raw, key)) clean[key] = key === 'channels' ? normalizeChannels(raw[key]) : raw[key];
        if (raw.timezone !== undefined && typeof raw.timezone !== 'string') throw { code: 'invalid_response' };
        if (raw.weekday !== undefined && (!Number.isInteger(raw.weekday) || raw.weekday < 0 || raw.weekday > 6)) throw { code: 'invalid_response' };
        if (raw.month_day !== undefined && (!Number.isInteger(raw.month_day) || raw.month_day < 1 || raw.month_day > 31)) throw { code: 'invalid_response' };
        if (raw.timezone) try { new Intl.DateTimeFormat('en', { timeZone: raw.timezone }); } catch (_) { throw { code: 'invalid_response' }; }
        clean.next_fire = typeof raw.next_fire === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(raw.next_fire) && Number.isFinite(Date.parse(raw.next_fire)) ? raw.next_fire : null;
        clean.effective_timezone = null;
        if (typeof raw.effective_timezone === 'string' && raw.effective_timezone.length <= 128)
          try { new Intl.DateTimeFormat('en', { timeZone: raw.effective_timezone }); clean.effective_timezone = raw.effective_timezone; } catch (_) {}
      }
      if (raw.kind === kind && (!['daily', 'weekly', 'monthly'].includes(raw.cadence) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw.time) || typeof raw.enabled !== 'boolean')) throw { code: 'invalid_response' };
      return clean;
    });
    privateRows = nextPrivate;
    return cleanList;
  };
  // list_schedules also exists in 2.1.2, which silently drops calendar fields.
  // Confirm the loaded integration through HA's manifest API before any mutation.
  const supportsCalendar = (manifest, minimumMinor = 2) => {
    if (manifest?.domain !== 'ha_tools_email' || typeof manifest.version !== 'string' ||
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) return false;
    const version = manifest.version.split('.').map(Number);
    return version.every(Number.isSafeInteger) && version.join('.') === manifest.version && (version[0] > 2 || version[0] === 2 && version[1] >= minimumMinor);
  };
  const unavailable = error => ['unknown_command', 'not_found'].includes(error?.code);
  const read = () => {
    if (!allowed()) return Promise.resolve();
    if (typeof hass.callWS !== 'function') { checked = true; status = { state: 'not_checked', reason: 'unavailable' }; notify(); return Promise.resolve(); }
    if (reading) return reading.promise;
    const token = { epoch, promise: null }, source = hass;
    reading = token; calendarCompatible = false; mailCompatible = false; checked = true; status = { state: pendingExpected ? 'unconfirmed' : 'not_checked', reason: 'loading' };
    token.promise = (async () => {
      try {
        const manifest = await request(source, { type: 'manifest/get', integration: 'ha_tools_email' }, token);
        if (epoch !== token.epoch || reading !== token || !allowed()) return;
        mailCompatible = supportsCalendar(manifest, 3);
        if (!supportsCalendar(manifest)) throw { code: 'not_found' };
        const response = await request(source, { type: 'ha_tools_email/list_schedules' }, token);
        if (epoch !== token.epoch || reading !== token || !allowed()) return;
        rows = cleanRows(response); calendarCompatible = true;
        if (pendingExpected) {
          if (same(pendingExpected, rows.find(row => row.id === pendingExpected.id))) {
            const deleted = pendingExpected.deleted;
            pendingExpected = null; pendingRecipients = null; privateDraft = null; draft = null; status = { state: 'success', reason: deleted ? 'deleted' : 'saved' };
          } else status = { state: 'unconfirmed', reason: 'readback_mismatch' };
        } else status = { state: rows.some(row => row.kind === kind) ? 'success' : 'no_data', reason: 'loaded' };
      } catch (error) {
        if (epoch !== token.epoch || reading !== token || !allowed()) return;
        rows = []; privateRows.clear();
        status = { state: pendingExpected ? 'unconfirmed' : 'not_checked',
          reason: unavailable(error) ? 'unavailable' : error?.code === 'request_timeout' ? 'read_timeout' : 'read_failed' };
      } finally { if (epoch === token.epoch && reading === token) { reading = null; notify(); } }
    })();
    notify(); return token.promise;
  };
  const validate = value => {
    if (Object.hasOwn(value,'channels')) { if(kind !== 'energy_report')throw {code:'invalid_channels'}; normalizeChannels(value.channels); }
    if (!['daily', 'weekly', 'monthly'].includes(value.cadence) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)) throw { code: 'invalid_fields' };
    if (value.timezone) {
      if (value.timezone.length > 128 || /^(posix\/|right\/)|^(localtime|posixrules)$/.test(value.timezone)) throw { code: 'invalid_timezone' };
      try { new Intl.DateTimeFormat('en', { timeZone: value.timezone }); } catch (_) { throw { code: 'invalid_timezone' }; }
    }
    if (value.cadence === 'weekly' && (!Number.isInteger(value.weekday) || value.weekday < 0 || value.weekday > 6)) throw { code: 'invalid_fields' };
    if (value.cadence === 'monthly' && (!Number.isInteger(value.month_day) || value.month_day < 1 || value.month_day > 31)) throw { code: 'invalid_fields' };
  };
  const save = async () => {
    if (!allowed() || !calendarCompatible || !draft || writing || reading || pendingExpected || !['success', 'no_data', 'error'].includes(status.state)) return;
    let expected;
    try {
      validate(draft);
      expected = { id: draft.id, kind, cadence: draft.cadence, time: draft.time, enabled: draft.enabled === true };
      if (Object.hasOwn(draft,'channels')) expected.channels=normalizeChannels(draft.channels);
      if (draft.timezone) expected.timezone = draft.timezone;
      if (draft.cadence === 'weekly') expected.weekday = draft.weekday;
      if (draft.cadence === 'monthly') expected.month_day = draft.month_day;
      if (recipientEditor && privateDraft !== null) expected.recipients = recipients(privateDraft);
    } catch (error) { status = { state: 'error', reason: error.code || 'invalid_fields' }; notify(); return; }
    const useHaTimezone = !!rows.find(row => row.id === draft.id)?.timezone && !draft.timezone;
    const requestEpoch = epoch, source = hass;
    pendingRecipients = expected.recipients ? [...expected.recipients] : null;
    pendingExpected = Object.fromEntries(Object.entries(expected).filter(([key]) => key !== 'recipients')); writing = true; status = { state: 'not_checked', reason: 'saving' }; notify();
    try {
      await request(source, { type: 'ha_tools_email/set_schedule', action: 'upsert', schedule: useHaTimezone ? { ...expected, use_ha_timezone: true } : expected });
      if (requestEpoch !== epoch || !allowed()) return;
      // The acknowledgement (and its embedded schedules) cannot confirm storage: use a separate read.
      await read();
    } catch (error) {
      if (requestEpoch !== epoch || !allowed()) return;
      const rejected = ['invalid_payload', 'unauthorized', 'unknown_command', 'not_found'].includes(error?.code);
      if (rejected) { pendingExpected = null; pendingRecipients = null; }
      status = { state: rejected ? 'error' : 'unconfirmed', reason: rejected ? 'save_rejected' : 'write_unknown' };
    } finally { if (requestEpoch === epoch) { writing = false; notify(); } }
  };
  const previewRead = (manual = null) => {
    if (!allowed() || (!manual && !calendarCompatible) || reading || previewing || writing || pendingExpected) return previewing?.promise || Promise.resolve();
    const selection = manual || draft || rows.find(row => row.kind === kind);
    if (!selection) return Promise.resolve();
    try { if (manual) {
      if (!['daily', 'weekly', 'monthly'].includes(selection.cadence) || !['rolling', 'calendar'].includes(selection.period_mode)) throw { code: 'invalid_fields' };
    } else validate(selection); } catch (error) { previewStatus = { state: 'error', reason: error.code }; notify(); return Promise.resolve(); }
    const token = { epoch, promise: null }, source = hass;
    const message = { type: 'ha_tools_email/' + (kind === 'energy_report' ? 'preview_energy_report' : 'preview_log_digest'), cadence: selection.cadence };
    if (kind === 'energy_report') message.calendar_period = true;
    if (selection.timezone) message.timezone = selection.timezone;
    previewing = token; preview = null; previewStatus = { state: 'not_checked', reason: 'loading' };
    token.promise = (async () => {
      try {
        if (manual) {
          const manifest = await request(source, { type: 'manifest/get', integration: 'ha_tools_email' }, token);
          if (epoch !== token.epoch || previewing !== token || !allowed()) return;
          if (!supportsCalendar(manifest, 3)) throw { code: 'mail_upgrade_required' };
        }
        if (manual || mailCompatible) {
          delete message.calendar_period;
          message.format = 'mail'; message.period_mode = manual?.period_mode || 'calendar';
          if (kind === 'log_digest' && manual?.max_entries !== undefined) message.max_entries = manual.max_entries;
        }
        const response = await request(source, message, token);
        if (epoch !== token.epoch || previewing !== token || !allowed()) return;
        if (message.format === 'mail') {
          if (!response || response.cadence !== message.cadence || typeof response.subject !== 'string' ||
            typeof response.body !== 'string' || typeof response.html !== 'string' || response.html.length > 2000000 ||
            typeof response.period?.from !== 'string' || typeof response.period?.to !== 'string' ||
            !Number.isFinite(Date.parse(response.period.from)) || !Number.isFinite(Date.parse(response.period.to)) ||
            Date.parse(response.period.from) >= Date.parse(response.period.to) ||
            response.period.semantics !== (message.period_mode === 'calendar' ? 'previous_completed_calendar_period' :
              kind === 'log_digest' ? 'rolling_retained_last_observed' : 'rolling_completed_hours') ||
            typeof response.source !== 'object' || response.source === null ||
            response.source.name !== (kind === 'log_digest' ? 'system_log' : 'recorder') ||
            typeof response.source.complete !== 'boolean' ||
            typeof response.generated_at !== 'string' || !Number.isFinite(Date.parse(response.generated_at))) throw { code: 'invalid_response' };
          preview = { cadence: response.cadence, subject: response.subject, body: response.body, html: response.html,
            period: { ...response.period }, source: { ...response.source }, generated_at: response.generated_at,
            effective_timezone: response.effective_timezone };
          previewStatus = { state: response.source.status === 'no_data' ? 'no_data' : response.source.complete === false ? 'partial' : 'success', reason: 'loaded' }; return;
        }
        if (kind === 'energy_report') {
          if (typeof projectPreview !== 'function') throw { code: 'invalid_response' };
          const projected = projectPreview(response, message);
          if (!projected || !['success', 'partial', 'no_data'].includes(projected.state)) throw { code: 'invalid_response' };
          preview = projected.value; previewStatus = { state: projected.state, reason: 'loaded' };
          return;
        }
        if (!response || response.cadence !== message.cadence || !(response.total === null || (Number.isInteger(response.total) && response.total >= 0)) ||
          typeof response.period?.from !== 'string' || typeof response.period?.to !== 'string' ||
          response.period.semantics !== 'previous_completed_calendar_period' || typeof response.effective_timezone !== 'string' ||
          response.source?.name !== 'system_log' || response.source.count_semantics !== 'retained_aggregates' ||
          typeof response.source.complete !== 'boolean' || !Number.isInteger(response.source.retained_entries) ||
          response.source.retained_entries < 0) throw { code: 'invalid_response' };
        preview = { cadence: response.cadence, total: response.total,
          unique_problems: Number.isInteger(response.unique_problems) && response.unique_problems >= 0 ? response.unique_problems : null,
          counts_complete: response.counts_complete === true,
          period: { from: response.period.from, to: response.period.to, semantics: response.period.semantics },
          effective_timezone: response.effective_timezone,
          source: { name: response.source.name, complete: response.source.complete, count_semantics: response.source.count_semantics, retained_entries: response.source.retained_entries } };
        previewStatus = { state: response.source.complete ? (response.source.retained_entries ? 'success' : 'no_data') : 'partial', reason: 'loaded' };
      } catch (error) {
        if (epoch !== token.epoch || previewing !== token || !allowed()) return;
        preview = null; previewStatus = { state: 'not_checked', reason: error?.code === 'mail_upgrade_required' ? 'mail_upgrade_required' : unavailable(error) ? 'unavailable' : error?.code === 'request_timeout' ? 'read_timeout' : 'read_failed' };
      } finally { if (epoch === token.epoch && previewing === token) { previewing = null; notify(); } }
    })();
    notify(); return token.promise;
  };
  return {
    setContext(value) {
      if (watchedConnection !== (value?.connection ?? null)) {
        unwatch(); connectionOffline = false; watchedConnection = value?.connection ?? null;
        const source = watchedConnection;
        const disconnect = () => { if (watchedConnection !== source) return; connectionOffline = true; reset(); if (context) context.online = false; contextLost(); notify(); };
        const ready = () => { if (watchedConnection !== source) return; connectionOffline = false; reset(); if (context) context.online = !browserOffline && hass?.connected !== false; contextLost(); notify(); };
        const offline = () => { browserOffline = true; reset(); if (context) context.online = false; contextLost(); notify(); };
        const online = () => { browserOffline = false; reset(); if (context) context.online = !connectionOffline && hass?.connected !== false && source?.connected !== false; contextLost(); notify(); };
        source?.addEventListener?.('disconnected', disconnect); source?.addEventListener?.('ready', ready);
        globalThis.addEventListener?.('offline', offline); globalThis.addEventListener?.('online', online);
        unwatch = () => { source?.removeEventListener?.('disconnected', disconnect); source?.removeEventListener?.('ready', ready);
          globalThis.removeEventListener?.('offline', offline); globalThis.removeEventListener?.('online', online); };
      }
      const next = capture(value);
      if (!context || Object.keys(next).some(key => next[key] !== context[key]) || !next.admin || !next.online) reset();
      hass = value; context = next;
    },
    discard() { unwatch(); watchedConnection = null; reset(); hass = null; context = null; },
    online() { return allowed(); },
    recipientsFor(id) { return allowed() && recipientEditor && privateRows.has(id) ? [...privateRows.get(id)] : null; },
    recipientModel() { return allowed() && recipientEditor && draft && privateDraft !== null ? [...privateDraft] : null; },
    updateRecipients(value) {
      if (!allowed() || !recipientEditor || !draft || writing || pendingExpected) return;
      privateDraft = [...value];
    },
    ensureRead() { if (!checked && allowed()) return read(); },
    refresh() { if (!writing) return read(); },
    edit(id) {
      if (!allowed() || !calendarCompatible || writing || pendingExpected || reading || !['success', 'no_data', 'error'].includes(status.state)) return;
      const row = rows.find(value => value.id === id && value.kind === kind);
      if (!row) return;
      previewing?.cancel?.(); previewing = null;
      privateDraft = recipientEditor ? [...(privateRows.get(id) || [])] : null;
      draft = { ...cloneRow(row), timezone: row.timezone || '', weekday: row.weekday ?? 0, month_day: row.month_day ?? 1 };
      preview = null; previewStatus = { state: 'not_checked', reason: 'initial' }; notify();
    },
    create(options = {}) {
      if (!allowed() || !calendarCompatible || reading || writing || pendingExpected || !['success', 'no_data'].includes(status.state)) return;
      let newChannels;
      if(Object.hasOwn(options,'channels')) {try {if(kind!=='energy_report')throw {code:'invalid_channels'};newChannels=normalizeChannels(options.channels,true);}catch(error){status={state:'error',reason:error.code};notify();return;}}
      // New IDs are allocated only after the explicit New action, never on open.
      let id;
      try {
        if (globalThis.crypto?.randomUUID) id = globalThis.crypto.randomUUID();
        else {
          const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
          bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
          const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
          id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
      } catch (_) { status = { state: 'error', reason: 'id_unavailable' }; notify(); return; }
      previewing?.cancel?.(); previewing = null;
      privateDraft = recipientEditor ? [] : null;
      draft = { id, kind, cadence: 'daily', time: '08:00', enabled: false,
        timezone: '', weekday: 0, month_day: 1, ...(newChannels?{channels:newChannels}:{}) };
      preview = null; previewStatus = { state: 'not_checked', reason: 'initial' }; notify();
    },
    update(key, value) {
      if (!allowed() || !draft || writing || pendingExpected || !editable.includes(key) || ['id', 'kind'].includes(key)) return;
      if(key==='channels') {try {if(kind!=='energy_report')throw {code:'invalid_channels'};value=normalizeChannels(value,true);}catch(error){status={state:'error',reason:error.code};notify();return;}}
      draft = { ...draft, [key]: value };
      // A preview belongs to its exact selection; invalidate callbacks after an edit.
      if (previewing) { previewing.cancel?.(); previewing = null; }
      preview = null; previewStatus = { state: 'not_checked', reason: 'initial' };
    },
    cancel() { draft = null; privateDraft = null; preview = null; previewing?.cancel?.(); previewing = null; previewStatus = { state: 'not_checked', reason: 'initial' }; notify(); },
    save, preview: () => previewRead(), previewMail: selection => previewRead({ ...selection }),
    clearPreview() { previewing?.cancel?.(); previewing = null; preview = null; previewStatus = { state: 'not_checked', reason: 'initial' }; },
    async remove(id) {
      if (!allowed() || !calendarCompatible || reading || writing || pendingExpected || !rows.some(row => row.id === id && row.kind === kind) || !['success', 'no_data', 'error'].includes(status.state)) return;
      const requestEpoch = epoch, source = hass;
      pendingExpected = { id, deleted: true }; pendingRecipients = null; writing = true;
      status = { state: 'not_checked', reason: 'saving' }; notify();
      try {
        await request(source, { type: 'ha_tools_email/set_schedule', action: 'delete', schedule_id: id });
        if (requestEpoch === epoch && allowed()) await read();
      } catch (error) {
        if (requestEpoch !== epoch || !allowed()) return;
        const rejected = ['invalid_payload', 'unauthorized', 'unknown_command', 'not_found'].includes(error?.code);
        if (rejected) pendingExpected = null;
        status = { state: rejected ? 'error' : 'unconfirmed', reason: rejected ? 'save_rejected' : 'write_unknown' };
      } finally { if (requestEpoch === epoch) { writing = false; notify(); } }
    },
    model() { return { rows: rows.map(cloneRow), draft: draft ? cloneRow(draft) : null, status: { ...status },
      reading: !!reading, writing, locked: !!pendingExpected, previewing: !!previewing,
      preview: preview ? { ...preview } : null, previewStatus: { ...previewStatus } }; }
  };
}


// Local presentation only: consumers supply the existing immutable backend HTML.
// Reuse this factory for Log manual/schedule frames without sharing card/user state.
function createHaToolsMailPresentation({ escape = value => String(value), language = () => 'en' } = {}) {
  let states = new Map();
  const stateFor = id => {
    if (!states.has(id)) states.set(id, { device: 'phone', theme: 'light' });
    return states.get(id);
  };
  const supportsTheme = html => /<meta\b(?=[^>]*\sname\s*=\s*["']ha-tools-mail-presentation["'])(?=[^>]*\scontent\s*=\s*["']1["'])[^>]*>/i.test(html.replace(/<!--[\s\S]*?-->/g, ''));
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'">`;
  const text = (pl, en) => language() === 'pl' ? pl : en;
  return {
    clear() { states = new Map(); },
    render(html, id, title) {
      const state = stateFor(id), themed = supportsTheme(html);
      if (!themed) state.theme = 'light';
      const button = (group, value, label, disabled = false) => `<button type="button" data-mail-preview-${group}="${value}" aria-pressed="${state[group] === value}" ${disabled ? 'disabled' : ''} style="min-height:44px;min-width:44px;padding:8px 12px;font:inherit;cursor:pointer">${label}</button>`;
      return `<div data-mail-presentation="${escape(id)}" style="min-width:0;max-width:100%">
        <div role="group" aria-label="${text('Rozmiar podglądu', 'Preview size')}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0"><span>${text('Rozmiar:', 'Size:')}</span>${button('device', 'phone', text('Telefon', 'Phone'))}${button('device', 'desktop', text('Komputer', 'Computer'))}</div>
        <div role="group" aria-label="${text('Motyw podglądu', 'Preview theme')}" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:8px 0"><span>${text('Motyw:', 'Theme:')}</span>${button('theme', 'light', text('Jasny', 'Light'))}${button('theme', 'dark', text('Ciemny', 'Dark'), !themed)}</div>
        ${!themed ? `<p role="status">${text('Ciemny podgląd wymaga HA Tools Email 2.4+.', 'Dark preview requires HA Tools Email 2.4+.')}</p>` : ''}
        <div data-mail-preview-scroll style="max-width:100%;min-width:0;overflow-x:auto"><iframe id="${escape(id)}" title="${escape(title)}" sandbox="" referrerpolicy="no-referrer" style="display:block;box-sizing:border-box;width:${state.device === 'phone' ? 390 : 680}px;max-width:none;height:600px;border:1px solid var(--divider-color,#ddd);background:white"></iframe></div></div>`;
    },
    bind(root, id, html) {
      const frame = root.getElementById(id), state = stateFor(id), themed = supportsTheme(html);
      const controls = frame?.closest('[data-mail-presentation]');
      if (!controls) return;
      if (!themed) state.theme = 'light';
      const paint = () => {
        frame.style.width = `${state.device === 'phone' ? 390 : 680}px`;
        // Prefix before CSP and the untouched payload: explicit light also beats OS dark.
        const srcdoc = `<html data-mail-preview-theme="${state.theme}">` + csp + html;
        if (frame.srcdoc !== srcdoc) frame.srcdoc = srcdoc;
        for (const button of controls.querySelectorAll('button')) {
          const selected = button.dataset.mailPreviewDevice ? state.device === button.dataset.mailPreviewDevice : state.theme === button.dataset.mailPreviewTheme;
          button.setAttribute('aria-pressed', String(selected));
          button.style.fontWeight = selected ? '700' : '400';
          button.style.boxShadow = selected ? 'inset 0 0 0 2px var(--primary-color,#395fd1)' : '';
        }
      };
      for (const button of controls.querySelectorAll('button')) button.onclick = () => {
        if (button.disabled) return;
        const device = button.dataset.mailPreviewDevice, theme = button.dataset.mailPreviewTheme;
        if (device === 'phone' || device === 'desktop') state.device = device;
        if (themed && (theme === 'light' || theme === 'dark')) state.theme = theme;
        paint();
      };
      paint();
    }
  };
}
// Per-card transport; raw calls stay occupied across every identity/selection edge.
function createEnergyModelV53({card,guard,format,onChange=()=>{},isActive=()=>true}) {
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  let enabled=false,identity=null,epoch=0,raw=null,pending=false,ack=false,selection={period:'day',mode:'full'};
  let unsub=[],wire=null,authority=null,subscribing=null;
  let view={status:'idle',model:null,current:null,preview:null,capabilities:null,supported:null,error:null};
  const context=()=>{const h=card._hass,t=guard.observe();return [h?.connection,h?.callWS,h?.user?.id,h?.user?.is_active,h?.user?.is_admin,h?.connected,h?.connection?.connected,card.isConnected,JSON.stringify(h?.locale||{}),h?.config?.time_zone,t.epoch,isActive()];};
  const same=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const available=()=>enabled&&isActive()&&card.isConnected&&card.preview!==true&&!!card._hass?.user?.id&&card._hass.user.is_active!==false&&card._hass.connected!==false&&guard.available(guard.snapshot());
  const emit=()=>onChange();
  function clear(status='idle',resetSupport=false){epoch++;pending=false;const supported=resetSupport?null:view.supported;view={status,model:null,current:null,preview:null,capabilities:null,supported,error:null};emit();}
  function dispose(){for(const fn of unsub){try{fn();}catch(_){}}unsub=[];ack=false;subscribing=null;}
  function stop(){enabled=false;dispose();identity=null;authority?.();wire?.();authority=wire=null;clear('idle',true);}
  function observe(){const next=context();if(!same(identity,next)){const keepLegacy=view.supported===false&&identity&&identity[0]===next[0]&&identity[1]===next[1];dispose();identity=next;clear(keepLegacy?'legacy':'idle',!keepLegacy);pending=available()&&!keepLegacy;}return available();}
  const current=e=>e===epoch&&available()&&same(identity,context());
  function invalidate(){if(!enabled)return;clear(available()?'loading':'idle');pending=available();queueMicrotask(()=>{if(observe())pump();});}
  async function subscribe(){
    if(ack)return true;
    if(subscribing)return subscribing;
    if(!available())return false;
    const e=epoch,c=card._hass.connection,association=identity;
    const task=(async()=>{
      if(typeof c?.subscribeMessage!=='function')throw Error('subscription_unavailable');
      const off=await c.subscribeMessage(()=>{if(enabled&&same(association,context()))invalidate();},{type:'ha_tools_email/subscribe_analysis_updates'});
      if(!current(e)){off?.();return false;}
      if(typeof off!=='function')throw Error('subscription_unavailable');
      unsub.push(off);ack=true;
      // The secured subscription already includes server energy ticks.
      return true;
    })();subscribing=task;
    try{return await task;}finally{if(subscribing===task)subscribing=null;}
  }
  function capabilities(caps){
    // An old capability envelope is a compatibility result, not malformed new data.
    if(caps?.energy_model_schema!=='ha_tools.energy_report/1'){
      view.supported=false;view.status='legacy';view.capabilities=null;emit();return false;
    }
    view.supported=true;
    if(caps.status!=='ready'||!Number.isSafeInteger(caps.revision)||!caps.capabilities||typeof caps.capabilities!=='object')throw Error('invalid_capabilities');
    view.capabilities=clone(caps.capabilities);
    const allowed=feature=>view.capabilities[feature]?.visible===true&&view.capabilities[feature]?.read===true;
    if(!allowed('energy_analysis')&&!allowed('energy_reports')){view.status='denied';emit();return false;}
    return true;
  }
  const validModel=(m,s)=>m?.schema==='ha_tools.energy_report/1'&&m.period?.kind===s.period&&m.period?.timezone===card._hass?.config?.time_zone&&Number.isFinite(Date.parse(m.period.start))&&Number.isFinite(Date.parse(m.period.end))&&m.totals&&typeof m.totals==='object'&&m.coverage&&Array.isArray(m.hourly);
  async function pump(){
    if(!observe()||!pending||raw||guard.occupied())return;
    pending=false;const e=epoch,s={...selection},token=guard.snapshot();
    // Reserve the complete read sequence; snapshot/report listeners share this guard.
    const reservation=guard.reserve?.(token);
    const call=request=>guard.call(token,request,false,reservation);
    const lane={};raw=lane;view.status='loading';emit();
    try {
      const caps=await call({type:'ha_tools_email/feature_capabilities'});
      if(!current(e)||!capabilities(caps))return;
      // Subscribe only after schema negotiation; confirm grants again after ACK
      // to close the policy-change gap before the first authoritative model read.
      if(!ack){
        if(!await subscribe()||!current(e))return;
        const confirmed=await call({type:'ha_tools_email/feature_capabilities'});
        if(!current(e)||!capabilities(confirmed))return;
      }
      if(view.capabilities.energy_analysis?.visible!==true||view.capabilities.energy_analysis?.read!==true){view.status='ready';emit();return;}
      emit();
      const model=await call({type:'ha_tools_email/energy_report',...s,representation:'model'});
      if(!current(e))return;
      if(!validModel(model,s))throw Error('invalid_energy_model');
      view.model=clone(model);view.status='ready';emit();
      // Independent today snapshot. Do not infer current zone/price from a full period.
      let live=null;try{live=await call({type:'ha_tools_email/energy_report',period:'day',mode:'so_far',representation:'model'});}catch(error){if(['unauthorized','not_allowed'].includes(error?.code))throw error;}
      if(!current(e))return;
      if(validModel(live,{period:'day'}))view.current=clone(live.current||null);
      emit();
    } catch(error){if(current(e)){view.model=null;view.current=null;view.preview=null;view.capabilities=null;if(error?.code==='unknown_command'&&view.supported!==true){view.supported=false;view.status='legacy';}else view.status=['unauthorized','not_allowed'].includes(error?.code)?'denied':'error';view.error=error?.code||error?.message||'unavailable';emit();}}
    finally{if(raw===lane)raw=null;reservation?.release();emit();if(pending)void pump();}
  }
  function update(next=selection){
    if(!['day','week','month','year'].includes(next.period)||!['full','so_far'].includes(next.mode||'full'))throw Error('invalid_energy_selection');
    if(next.date!==undefined&&(!/^\d{4}-\d{2}-\d{2}$/.test(next.date)||!Number.isFinite(Date.parse(next.date))||new Date(next.date).toISOString().slice(0,10)!==next.date))throw Error('invalid_energy_date');
    const s={period:next.period,mode:next.mode||'full',...(next.date?{date:next.date}:{})};
    if(!enabled){enabled=true;authority=guard.subscribe(()=>invalidate());wire=guard.subscribeWire(()=>queueMicrotask(()=>pump()));}
    const changed=JSON.stringify(s)!==JSON.stringify(selection);selection=s;
    const was=identity;observe();if(changed){clear();pending=true;}else if(!was)pending=available();
    if(pending)void pump();
  }
  async function preview(){
    observe();const grant=view.capabilities?.energy_reports;
    if(!available()||!ack||raw||guard.occupied()||grant?.visible!==true||grant?.read!==true)return false;
    const e=epoch,token=guard.snapshot(),lane={};raw=lane;view.preview=null;emit();
    const ui=format.forHass(card._hass),request={type:'ha_tools_email/energy_report',period:selection.period,...(selection.date?{anchor:selection.date}:{}),language:String(ui.language).startsWith('pl')?'pl':'en',date_language:String(ui.dateLanguage).startsWith('pl')?'pl':'en',timezone:ui.timeZone,hour_cycle:['h11','h12'].includes(ui.hourCycle)?'12':'24'};
    try{const result=await guard.call(token,request);if(!current(e))return false;
      if(typeof result?.html!=='string'||result.context?.access_purpose!=='report_read'||result.period?.kind!==selection.period||result.display?.timezone!==request.timezone||result.display?.language!==request.language||result.display?.hour_cycle!==request.hour_cycle||result.display?.date_language!==request.date_language)throw Error('invalid_report_preview');
      view.preview={html:result.html};emit();return true;
    }catch(error){if(current(e)){view.preview=null;view.error=error?.code||'preview_unavailable';if(['unauthorized','not_allowed'].includes(error?.code)){clear('denied');pending=false;}emit();}return false;}
    finally{if(raw===lane)raw=null;if(pending)void pump();}
  }
  function state(){observe();return clone({...view,busy:!!raw,selection});}
  return {update,state,preview,stop,refresh:invalidate};
}
// Existing server stores and send_now dispatcher; no scheduler, SMTP setup or auto retry.
function createEnergyReportsActionsV53({card,guard,getCapabilities,isActive=()=>false,isModelBusy=()=>false,onChange=()=>{},format=null,createSchedules=typeof createHaToolsEmailSchedules==='function'?createHaToolsEmailSchedules:null}){
 const copy=v=>v==null?v:JSON.parse(JSON.stringify(v)),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pl=()=>String(card._hass?.locale?.language||card._hass?.language||'en').startsWith('pl'),t=(en,polish)=>pl()?polish:en;
 const channelLabels=()=>({email:t('Email','E-mail'),persistent_notification:t('HA notification','Powiadomienie HA'),'notify.persistent_notification':t('HA notification','Powiadomienie HA'),'notify.send_message':t('HA message','Wiadomość HA')});
 const channelLabel=(id,name)=>{
  const supplied=name??state.targets.find(target=>target.id===id)?.name;
  if(supplied&&supplied!==id)return supplied;
  const labels=channelLabels();return Object.hasOwn(labels,id)?labels[id]:supplied||id;
 };
 const cadenceLabel=c=>({daily:t('Daily','Dzienny'),weekly:t('Weekly','Tygodniowy'),monthly:t('Monthly','Miesięczny')}[c]||String(c||''));
 const weekdays=()=>[t('Monday','Poniedziałek'),t('Tuesday','Wtorek'),t('Wednesday','Środa'),t('Thursday','Czwartek'),t('Friday','Piątek'),t('Saturday','Sobota'),t('Sunday','Niedziela')];
 const grants=()=>getCapabilities()?.energy_reports,readable=()=>grants()?.visible===true&&grants()?.read===true;
 const executable=()=>readable()&&grants()?.execute===true&&card._hass?.user?.is_admin===true;
 let knownGrants=null;
 const context=()=>{const h=card._hass,token=guard.observe(),g=getCapabilities()?.energy_reports||knownGrants;return [h?.connection,h?.callWS,h?.user?.id,h?.user?.is_admin,h?.user?.is_active,h?.connected,h?.connection?.connected,token.epoch,isActive(),g?.visible===true&&g?.read===true,g?.execute];};
 const same=(a,b)=>a&&a.length===b.length&&a.every((v,i)=>v===b[i]);
 const available=()=>isActive()&&readable()&&card.isConnected&&card.preview!==true&&card._hass?.user?.is_active!==false&&guard.available(guard.snapshot());
 let scheduleReview=null;
 let identity=null,epoch=0,raw=null,pending=false,loaded=false,refreshSchedules=false,root=null,store=null,proxy=null,unwire=null,unauthority=null,form=null,serial=0;
 let state={status:'idle',schedules:[],deliveries:[],targets:[],reportStatus:null,outcome:null,message:null};
 const failed=new Set(['preparation_failed','authentication_failed','recipients_refused','tls_failed','send_failed']);
 function emit(){paint();onChange();}
 function clear(){epoch++;pending=false;loaded=false;form=null;scheduleReview=null;state={status:'idle',schedules:[],deliveries:[],targets:[],reportStatus:null,outcome:null,message:null};store?.discard?.();store=null;proxy=null;if(root){root.replaceChildren();root._reportMarkup=null;}}
 const current=(e,token)=>e===epoch&&available()&&same(identity,context())&&guard.current(token);
 function observe(){if(getCapabilities()?.energy_reports)knownGrants=copy(getCapabilities().energy_reports);const next=context();if(!same(identity,next)){identity=next;clear();}return available();}
 function stop(){identity=null;knownGrants=null;clear();unwire?.();unauthority?.();unwire=unauthority=null;root=null;}
 function storeChanged(){if(!store||!available())return;if(!store.model().draft)scheduleReview=null;state.schedules=store.model().rows.filter(r=>r.kind==='energy_report').map(r=>({...r,channel:(r.channels||['email']).join(', '),editable:true}));emit();}
 // An ACK is not readback. Keep an accepted write associated while a secured
 // update refreshes model grants; subsequent reads wait and require fresh grants.
 const associated=(e,token)=>e===epoch&&isActive()&&card.isConnected&&card.preview!==true&&same(identity,context())&&guard.current(token);
 function acquireScheduleRead(e,token){
  return new Promise(resolve=>{
   let finished=false,unwire=()=>{},unauthority=()=>{};
   const finish=owner=>{if(finished)return;finished=true;unwire();unauthority();resolve(owner);};
   const check=()=>{
    if(finished)return;
    if(!associated(e,token)){finish(null);return;}
    if(isModelBusy()||guard.occupied())return;
    if(!current(e,token)){finish(null);return;}
    try{finish(guard.reserve?.(token)||{release:()=>{}});}catch(_){finish(null);}
   };
   unwire=guard.subscribeWire(check);unauthority=guard.subscribe(check);check();
  });
 }
 async function protectedCall(request){
  const e=epoch,token=guard.snapshot(),admin=card._hass?.user?.is_admin===true;
  let owner=null;
  const readback=['manifest/get','ha_tools_email/list_schedules'].includes(request.type);
  if(readback&&(isModelBusy()||guard.occupied()))owner=await acquireScheduleRead(e,token);
  if(!current(e,token)||!admin||(!owner&&guard.occupied())){owner?.release();throw {code:'stale_context'};}
  if(request.type==='ha_tools_email/set_schedule'){
   if(!executable())throw {code:'unauthorized'};
   const caps=await guard.call(token,{type:'ha_tools_email/feature_capabilities'});
   if(!current(e,token)||caps?.status!=='ready'||caps?.capabilities?.energy_reports?.read!==true||caps?.capabilities?.energy_reports?.execute!==true||caps?.capabilities?.energy_reports?.visible!==true)throw {code:'unauthorized'};
   if(request.action!=='delete'){
    const wanted=request.schedule?.channels||['email'];
    const targets=await guard.call(token,{type:'ha_tools_email/list_delivery_targets'});
    if(!current(e,token))throw {code:'stale_context'};
    if(!Array.isArray(targets)||!wanted.length||wanted.some(id=>!targets.some(t=>t&&t.id===id))){
      if(Array.isArray(targets))state.targets=targets.filter(t=>t&&typeof t.id==='string'&&(t.id==='email'||t.id==='persistent_notification'||/^notify\.[a-z0-9_]{1,128}$/.test(t.id))).map(t=>({id:t.id,name:String(t.name||t.id),default:t.default===true}));
      state.message=t('A selected delivery target is unavailable. Choose a current target and review again.','Wybrany cel dostarczenia jest niedostępny. Wybierz aktualny cel i sprawdź ponownie.');emit();
      throw {code:'invalid_payload'};
    }
   }

  }
  try{
   const result=await guard.call(token,request,true,owner);
   if(!(request.type==='ha_tools_email/set_schedule'?associated(e,token):current(e,token)))throw {code:'stale_context'};
   return result;
  }finally{owner?.release();}
 }
 function schedules(){
  if(store||!createSchedules||card._hass?.user?.is_admin!==true)return store;
  // An existing controller instance keeps the exact same backend store/protocol.
  // Proxy every raw request through this card's shared wire fence.
  proxy={...card._hass,callWS:protectedCall};
  store=createSchedules({kind:'energy_report',recipientEditor:true,changed:storeChanged,contextLost:()=>{form=null;}});store.setContext(proxy);return store;
 }
 async function load(){
  if(!observe()||loaded||raw||isModelBusy()||guard.occupied())return;
  pending=false;const e=epoch,token=guard.snapshot(),lane={};raw=lane;state.status='loading';emit();
  try{
   // Safe bounded household facts; never get_config or get_attempt_history here.
   try{state.reportStatus=await guard.call(token,{type:'ha_tools_email/get_report_status',purpose:'energy_report'});}catch(error){state.reportStatus=null;throw error;}
   if(!current(e,token))return;
   if(executable()){
    try{const targets=await guard.call(token,{type:'ha_tools_email/list_delivery_targets'});if(!current(e,token))return;
     state.targets=Array.isArray(targets)?targets.filter(r=>r&&typeof r.id==='string'&&(r.id==='email'||r.id==='persistent_notification'||/^notify\.[a-z0-9_]{1,128}$/.test(r.id))).map(r=>({id:r.id,name:String(r.name||r.id),default:r.default===true})):[];
    }catch(error){state.targets=[];throw error;}
   }
   if(card._hass?.user?.is_admin===true){
    try{const history=await guard.call(token,{type:'ha_tools_email/get_attempt_history'},true);if(!current(e,token))return;
     state.deliveries=(history?.schema===1&&Array.isArray(history.attempts)?history.attempts:[]).filter(r=>r.kind==='energy_report'&&typeof r.id==='string'&&typeof r.timestamp==='string'&&Number.isFinite(Date.parse(r.timestamp))).slice(0,5).map(r=>({id:r.id,at:r.timestamp,name:cadenceLabel(r.cadence),cadence:r.cadence,channel:r.channel||(['accepted_by_smtp'].includes(r.outcome)?'email':null),status:failed.has(r.outcome)?'failed':r.outcome,retryable:failed.has(r.outcome)}));
    }catch(error){state.deliveries=[];throw error;}
   }
   if(!current(e,token))return;loaded=true;state.status='ready';
  }catch(error){if(current(e,token)){if(error?.code==='wire_occupied'){pending=true;state.status='loading';}else{loaded=true;state.status='error';}}}finally{if(raw===lane)raw=null;if(current(e,token)){emit();if(state.status==='ready'&&card._hass?.user?.is_admin===true){const c=schedules();if(refreshSchedules){refreshSchedules=false;await c?.refresh?.();}else await c?.ensureRead?.();}}}
 }
 function update(){
  if(!unwire)unwire=guard.subscribeWire(()=>queueMicrotask(()=>{if(pending)void load();else emit();}));
  if(!unauthority)unauthority=guard.subscribe(()=>{clear();identity=null;emit();});
  if(!observe())return;
  if(!loaded){pending=true;void load();}
 }
 function defaultChannel(){return state.targets.find(r=>r.default&&r.id.startsWith('notify.mobile_app_'))?.id||state.targets.find(r=>r.id==='persistent_notification')?.id||'';}
 function openSend({email=false,retryId=null}={}){
  observe();if(!executable()||raw||guard.occupied())return false;
  const row=retryId?state.deliveries.find(r=>r.id===retryId&&r.retryable):null;if(retryId&&!row)return false;
  form={id:++serial,phase:'draft',channel:email?(state.targets.some(r=>r.id==='email')?'email':''):defaultChannel(),recipients:'',cadence:['daily','weekly','monthly'].includes(row?.cadence)?row.cadence:'daily',retryId:row?.id||null,consumed:false};state.outcome=null;state.message=email&&!form.channel?t('Configure email in HA Tools Email to enable email delivery.','Skonfiguruj e-mail w HA Tools Email, aby włączyć ten kanał.'):null;emit();root?.querySelector('[data-report-field="channel"]')?.focus();return true;
 }
 const recipients=text=>String(text).split(',').map(v=>v.trim()).filter(Boolean);
 function review(){
  observe();if(!executable()||!form||form.consumed||raw||guard.occupied())return false;
  if(!state.targets.some(r=>r.id===form.channel)){state.message=t('Choose an available channel.','Wybierz dostępny kanał.');emit();return false;}
  const to=recipients(form.recipients);if(form.channel==='email'&&(!to.length||to.length>128||to.some(v=>v.length>255||/[\r\n]/.test(v)||!v.includes('@')))){state.message=t('Enter the email recipients before confirming.','Wpisz odbiorców e-mail przed potwierdzeniem.');emit();return false;}
  form.phase='review';state.message=null;emit();root?.querySelector('[data-report-action="confirm"]')?.focus();return true;
 }
 async function confirm(){
  observe();if(!executable()||!form||form.phase!=='review'||form.consumed||raw||guard.occupied())return false;
  const plan=copy(form),e=epoch,token=guard.snapshot(),lane={};form.consumed=true;raw=lane;state.outcome='pending';emit();let dispatched=false;
  try{
   const caps=await guard.call(token,{type:'ha_tools_email/feature_capabilities'});
   if(!current(e,token)||caps?.status!=='ready'||caps?.capabilities?.energy_reports?.visible!==true||caps?.capabilities?.energy_reports?.execute!==true)throw {code:'unauthorized'};
   const targets=await guard.call(token,{type:'ha_tools_email/list_delivery_targets'});
   if(!current(e,token)||!Array.isArray(targets)||!targets.some(r=>r.id===plan.channel))throw {code:'target_unavailable'};
   const request={type:'ha_tools_email/send_now',kind:'energy_report',cadence:plan.cadence,period_mode:'calendar',channels:[plan.channel]};
   if(plan.channel==='email')request.recipients=recipients(plan.recipients);
   dispatched=true;
   const result=await guard.call(token,request,true);
   if(!current(e,token)){if(e===epoch&&same(identity,context())){state.outcome='outcome_unknown';form=null;emit();}return false;}
   const parts=Array.isArray(result?.channels)?result.channels:Array.isArray(result?.results)?result.results:[result];
   const statuses=parts.map(r=>r?.status);
   const accepted=result?.ok===true&&parts.length>0&&parts.every(r=>r?.ok===true&&['accepted_by_notify','accepted_by_smtp'].includes(r.status)&&typeof r.attempt_id==='string'&&r.attempt_id.length>0);
   state.outcome=accepted?(statuses.every(s=>s==='accepted_by_notify')?'accepted_by_notify':'accepted_by_smtp'):'outcome_unknown';
   form=null;emit();return accepted;
  }catch(error){if(current(e,token)){state.outcome=dispatched?'outcome_unknown':'not_sent';state.message=null;form=null;emit();}return false;}
  finally{if(raw===lane)raw=null;emit();}
 }
 function reviewSchedule(){
  observe();const sm=store?.model(),d=sm?.draft;
  if(!executable()||raw||guard.occupied()||!d||sm.reading||sm.writing||sm.locked)return false;
  if(!['daily','weekly','monthly'].includes(d.cadence)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)){state.message=t('Check schedule cadence and time.','Sprawdź częstotliwość i godzinę harmonogramu.');emit();return false;}
  if(d.cadence==='weekly'&&(!Number.isInteger(d.weekday)||d.weekday<0||d.weekday>6)||d.cadence==='monthly'&&(!Number.isInteger(d.month_day)||d.month_day<1||d.month_day>31)){state.message=t('Check the selected day.','Sprawdź wybrany dzień.');emit();return false;}
  const selected=d.channels||['email'],to=store.recipientModel()||[];
  if(!selected.length||selected.some(id=>!state.targets.some(t=>t.id===id))){state.message=t('Choose available delivery channels before reviewing.','Wybierz dostępne kanały przed sprawdzeniem.');emit();return false;}
  if(selected.includes('email')&&(!to.length||to.some(v=>!v.includes('@')||/[\r\n]/.test(v)))){state.message=t('Enter explicit email recipients before reviewing this schedule.','Wpisz odbiorców e-mail przed sprawdzeniem harmonogramu.');emit();return false;}
  scheduleReview={signature:JSON.stringify({draft:d,recipients:to}),draft:copy(d),recipients:[...to],consumed:false};state.message=null;emit();root?.querySelector('[data-report-action="confirm-schedule"]')?.focus();return true;
 }
 async function confirmSchedule(){
  observe();const sm=store?.model();
  if(!executable()||raw||guard.occupied()||!scheduleReview||scheduleReview.consumed||!sm?.draft||sm.reading||sm.writing||sm.locked)return false;
  if(scheduleReview.signature!==JSON.stringify({draft:sm.draft,recipients:store.recipientModel()||[]})){scheduleReview=null;emit();return false;}
  const scheduleStore=store;
  scheduleReview.consumed=true;emit();await scheduleStore.save();
  return store===scheduleStore&&executable()&&scheduleStore.model().status.state==='success';
 }
 function scheduleAction(action,id){
  observe();if(!executable()||raw||guard.occupied())return false;
  const c=schedules();if(!c)return false;const m=c.model();if(m.reading||m.writing||m.locked)return false;scheduleReview=null;state.message=null;
  if(action==='add'){c.create({channels:defaultChannel()?[defaultChannel()]:[]});}
  else if(action==='edit')c.edit(id);
  else if(action==='toggle'){c.edit(id);const d=c.model().draft;if(d){c.update('enabled',!d.enabled);reviewSchedule();}}
  emit();return !!c.model().draft;
 }
 function mount(next){if(root!==next){root=next;if(root){root.addEventListener('input',input);root.addEventListener('change',input);root.addEventListener('click',click);}}update();paint();}
 function input(event){
  if(!available())return;const node=event.target;
  if(node.dataset.reportField&&form&&!form.consumed){form[node.dataset.reportField]=node.value;form.phase='draft';const reviewButton=root.querySelector('[data-report-action="review"]');if(reviewButton)reviewButton.disabled=!form.channel;}
  if(node.dataset.scheduleField&&executable()){scheduleReview=null;const key=node.dataset.scheduleField;store?.update(key,node.type==='checkbox'?node.checked:['weekday','month_day'].includes(key)?Number(node.value):node.value);}
  if(node.dataset.scheduleRecipients!==undefined&&executable()){scheduleReview=null;store?.updateRecipients(recipients(node.value));}
  if(node.dataset.scheduleChannels!==undefined&&executable()){scheduleReview=null;store?.update('channels',[...node.selectedOptions].map(o=>o.value));paint();}
 }
 function click(event){const button=event.target.closest?.('[data-report-action]');if(!button||button.disabled||!root?.contains(button))return;const a=button.dataset.reportAction;
  if(a==='review')review();else if(a==='confirm')void confirm();else if(a==='cancel'){form=null;emit();}else if(a==='edit-send'){if(form&&!form.consumed)form.phase='draft';emit();}else if(a==='save-schedule')reviewSchedule();else if(a==='confirm-schedule')void confirmSchedule();else if(a==='edit-schedule'){scheduleReview=null;emit();}else if(a==='cancel-schedule'){scheduleReview=null;store?.cancel();emit();}else if(a==='new')openSend();else if(a==='reload'){refreshSchedules=true;loaded=false;pending=true;void load();}
 }
 function paint(){
  if(!root||!available())return;
  const status={accepted_by_notify:t('Accepted by Home Assistant; phone delivery is not confirmed.','Przyjęte przez Home Assistant; doręczenie na telefon nie jest potwierdzone.'),accepted_by_smtp:t('Accepted by SMTP; inbox delivery is not confirmed.','Przyjęte przez SMTP; doręczenie do skrzynki nie jest potwierdzone.'),outcome_unknown:t('Outcome unknown. Check history before creating a new report. No automatic retry.','Wynik nieznany. Sprawdź historię przed utworzeniem nowego raportu. Brak automatycznej ponownej wysyłki.'),pending:t('Sending…','Wysyłanie…'),not_sent:t('Not sent. Check access and available channels.','Nie wysłano. Sprawdź dostęp i kanały.')};
  const button=(action,label,disabled=false)=>`<button type="button" data-report-action="${action}" ${disabled?'disabled':''}>${label}</button>`;
  const field=(key,label,type='text',value='')=>`<label>${label}<input type="${type}" data-report-field="${key}" value="${esc(value)}"></label>`;
  let html='<style>[data-build1-reports-host] label{display:grid;gap:4px;margin:8px 0}[data-build1-reports-host] input,[data-build1-reports-host] select,[data-build1-reports-host] button{min-height:44px;font:inherit;max-width:100%}[data-build1-reports-host] fieldset{min-width:0;margin:12px 0}</style>';
  if(state.status==='error')html+=`<p role="status">${t('Report status could not be loaded. Refresh to retry.','Nie udało się wczytać stanu raportów. Odśwież, aby ponowić.')}</p>`;
  if(state.outcome)html+=`<p role="status">${esc(status[state.outcome]||state.outcome)}</p>`;
  const next=state.reportStatus?.schema===1&&state.reportStatus?.purpose==='energy_report'&&state.reportStatus?.schedule_state==='enabled'?state.reportStatus.next_report_at:null;
  if(typeof next==='string'&&Number.isFinite(Date.parse(next)))html+=`<p>${t('Next report','Następny raport')}: ${esc(format?.forHass?.(card._hass)?.dateTime(next)||next)}</p>`;
  if(state.message)html+=`<p role="status">${esc(state.message)}</p>`;
  if(form){
   const locked=form.consumed||raw!==null;
   html+=`<fieldset><legend>${t('Send a new energy report','Wyślij nowy raport energii')}</legend><p>${t('Previous completed calendar period. This does not send the selected historical preview.','Poprzedni zakończony okres kalendarzowy. Nie wysyła wybranego podglądu historycznego.')}</p>`;
   if(form.phase==='review')html+=`<p>${esc(cadenceLabel(form.cadence))} · ${esc(channelLabel(form.channel))}${form.channel==='email'?' · '+esc(form.recipients):''}</p>${button('confirm',t('Confirm send once','Potwierdź jedną wysyłkę'),locked)}${button('edit-send',t('Edit','Edytuj'),locked)}`;
   else html+=`<label>${t('Channel','Kanał')}<select data-report-field="channel"><option value="">${t('Choose a channel','Wybierz kanał')}</option>${state.targets.map(r=>`<option value="${esc(r.id)}" ${r.id===form.channel?'selected':''}>${esc(channelLabel(r.id,r.name))}</option>`).join('')}</select></label><label>${t('Period','Okres')}<select data-report-field="cadence">${['daily','weekly','monthly'].map(c=>`<option value="${c}" ${form.cadence===c?'selected':''}>${esc(cadenceLabel(c))}</option>`).join('')}</select></label>${field('recipients',t('Email recipients (used only for email)','Odbiorcy e-mail (tylko dla kanału e-mail)'),'text',form.recipients)}${button('review',t('Review delivery','Sprawdź wysyłkę'),locked||!form.channel)}`;
   html+=button('cancel',t('Cancel','Anuluj'),locked)+'</fieldset>';
  }
  const sm=store?.model(),d=sm?.draft;
  if(d&&executable()){
   const entry=(key,label,type='text')=>`<label>${label}<input type="${type}" data-schedule-field="${key}" value="${esc(d[key]??'')}"></label>`;
   const selected=d.channels||['email'],missing=selected.filter(id=>!state.targets.some(target=>target.id===id));
   if(scheduleReview){
    const plan=scheduleReview,channels=plan.draft.channels||['email'];
    html+=`<fieldset><legend>${t('Review recurring report','Sprawdź raport cykliczny')}</legend><p>${esc(cadenceLabel(plan.draft.cadence))} · ${esc(plan.draft.time)} · ${esc(plan.draft.timezone||card._hass?.config?.time_zone||'HA')} · ${plan.draft.enabled?t('Enabled','Włączony'):t('Disabled','Wyłączony')}</p>${plan.draft.cadence==='weekly'?`<p>${t('Weekday','Dzień tygodnia')}: ${esc(weekdays()[plan.draft.weekday])}</p>`:plan.draft.cadence==='monthly'?`<p>${t('Day of month','Dzień miesiąca')}: ${esc(plan.draft.month_day)}</p>`:''}<p>${esc(channels.map(id=>channelLabel(id)).join(', '))}</p>${channels.includes('email')?`<p>${esc(plan.recipients.join(', '))}</p>`:''}${button('confirm-schedule',t('Confirm schedule save','Potwierdź zapis harmonogramu'),plan.consumed||sm.writing||sm.reading||sm.locked)}${button('edit-schedule',t('Edit','Edytuj'),sm.writing||sm.locked)}${button('cancel-schedule',t('Cancel','Anuluj'),sm.writing)}</fieldset>`;
   }else{
    html+=`<fieldset><legend>${t('Recurring energy report','Cykliczny raport energii')}</legend><label>${t('Channels (select one or more)','Kanały (wybierz co najmniej jeden)')}<select multiple data-schedule-channels>${state.targets.map(target=>`<option value="${esc(target.id)}" ${selected.includes(target.id)?'selected':''}>${esc(channelLabel(target.id,target.name))}</option>`).join('')}</select></label>${missing.length?`<p role="status">${t('Unavailable selected targets; choose current targets: ','Niedostępne wybrane cele; wybierz aktualne cele: ')}${esc(missing.map(id=>channelLabel(id)).join(', '))}</p>`:''}<label>${t('Cadence','Częstotliwość')}<select data-schedule-field="cadence">${['daily','weekly','monthly'].map(c=>`<option value="${c}" ${d.cadence===c?'selected':''}>${esc(cadenceLabel(c))}</option>`).join('')}</select></label>${entry('time',t('Time','Godzina'),'time')}${entry('timezone',t('Time zone (empty: HA)','Strefa czasu (pusta: HA)'))}${d.cadence==='weekly'?`<label>${t('Weekday','Dzień tygodnia')}<select data-schedule-field="weekday">${weekdays().map((label,index)=>`<option value="${index}" ${d.weekday===index?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`:d.cadence==='monthly'?entry('month_day',t('Day of month 1–31','Dzień miesiąca 1–31'),'number'):''}<label><input type="checkbox" data-schedule-field="enabled" ${d.enabled?'checked':''}>${t('Enabled','Włączony')}</label>${selected.includes('email')?`<label>${t('Email recipients','Odbiorcy e-mail')}<input data-schedule-recipients value="${esc((store.recipientModel()||[]).join(', '))}"></label>`:''}${button('save-schedule',t('Review schedule','Sprawdź harmonogram'),sm.writing||sm.reading||sm.locked)}${button('cancel-schedule',t('Cancel','Anuluj'),sm.writing)}</fieldset>`;
   }

  }
  if(sm?.status?.state==='error')html+=`<p role="status">${t('Schedule not saved. Check its fields, access and current delivery targets.','Harmonogram nie został zapisany. Sprawdź pola, dostęp i aktualne cele dostarczenia.')}</p>`;
  if(sm?.status?.state==='unconfirmed')html+=`<p role="status">${t('Schedule save is unconfirmed. Reload before another change.','Zapis harmonogramu niepotwierdzony. Wczytaj przed kolejną zmianą.')}</p>`;
  html+=button('reload',t('Refresh report status and history','Odśwież stan raportów i historię'),!!raw||guard.occupied());
  if(state.outcome==='outcome_unknown'||state.outcome==='accepted_by_notify'||state.outcome==='accepted_by_smtp')html+=button('new',t('New report','Nowy raport'),!!raw||!executable());
  if(root._reportMarkup===html)return;
  const focus=root.getRootNode().activeElement,selector=focus?.dataset?.reportField?['reportField',focus.dataset.reportField]:focus?.dataset?.scheduleField?['scheduleField',focus.dataset.scheduleField]:focus?.dataset?.scheduleRecipients!==undefined?['scheduleRecipients','']:focus?.dataset?.scheduleChannels!==undefined?['scheduleChannels','']:null;
  const selection=focus&&typeof focus.selectionStart==='number'?[focus.selectionStart,focus.selectionEnd,focus.selectionDirection]:null;
  root.innerHTML=html;root._reportMarkup=html;
  if(selector){const next=[...root.querySelectorAll('input,select')].find(n=>n.dataset[selector[0]]===selector[1]);next?.focus({preventScroll:true});if(next&&selection)next.setSelectionRange(...selection);}
 }
 function snapshot(){observe();const sm=store?.model();return copy({...state,busy:!!raw||guard.occupied(),canExecute:executable(),canManageSchedules:executable()&&!!store&&!sm.reading&&!sm.writing&&!sm.locked,formOpen:!!form});}
 return {mount,update,stop,state:snapshot,openSend,review,confirm,scheduleAction,reviewSchedule,confirmSchedule,refresh:()=>{refreshSchedules=true;loaded=false;pending=true;void load();}};
}
/** Pure Build1 presentation. No clock, persistence, network or HA calls.
 * markup accepts an energy_report/1 and options:
 * section: overview|breakdown|costs|reports; group: devices|rooms|floors;
 * current: {label,rate,next_change,next_label,cheap_share,cheap_kwh,as_of};
 * schedules: [{id,name,cadence,time,channel,enabled}],
 * deliveries: [{id,at,name,channel,status}], previewText: string.
 * current is a separately supplied live snapshot; never inferred from a full-day report.
 * Controls only emit data-energy-build1/action/value/id attributes; host owns authority.
 */
function createEnergyBuild1ViewV53({format, language = format?.language || 'en'} = {}) {
  const pl=String(language).startsWith('pl'), t=(en,polish)=>pl?polish:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=v=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
  const valid=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
  const unknown=()=>t('No data','Brak danych');
  const formatted=(name,...args)=>{const value=format?.[name]?.(...args);return esc(value??unknown());};
  const energy=(v,period='day',role='table')=>formatted('reportEnergy',v,{role,period});
  const money=(v,c)=>formatted('reportMoney',v,c);
  const rate=(v,c)=>formatted('reportRate',v,c);
  const percent=(v,role='share')=>formatted('reportPercent',v,{role});
  const ratio=v=>valid(v)?percent(Number(v)*100):esc(unknown());
  const exact=v=>valid(v)?formatted('number',v):esc(unknown());
  const when=v=>formatted('dateTime',v);
  const date=v=>formatted('calendarDate',v);
  const action=(name,label,value='',extra='')=>`<button type="button" data-energy-build1="${esc(name)}" data-value="${esc(value)}" ${extra}>${label}</button>`;
  const heading=(name,note='')=>`<div class="sec2"><b>${name}</b><span>${note}</span></div>`;
  const empty=()=>`<p class="info">${unknown()}</p>`;
  const kpi=(label,value,note='')=>`<div class="k"><div class="l">${label}</div><div class="v">${value}</div><div class="n">${note}</div></div>`;
  const row=(label,value,note='')=>`<div class="row3"><span>${label}${note?`<small>${note}</small>`:''}</span><span class="r">${value}</span></div>`;
  const table=(caption,columns,rows)=>`<div class="table-wrap"><table class="ct"><caption>${caption}</caption><thead><tr>${columns.map(v=>`<th scope="col">${v}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(c=>`<tr>${c.map((v,i)=>`<${i?'td':'th scope="row"'}>${v}</${i?'td':'th'}>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}">${unknown()}</td></tr>`}</tbody></table></div>`;
  const sections={overview:t('Overview','Przegląd'),breakdown:t('Breakdown','Rozbicie'),costs:t('Costs','Koszty'),reports:t('Reports','Raporty')};
  const periods={day:t('Day','Dzień'),week:t('Week','Tydzień'),month:t('Month','Miesiąc'),year:t('Year','Rok')};
  const groups={devices:t('Devices','Urządzenia'),rooms:t('Rooms','Pokoje'),floors:t('Floors','Piętra')};
  const colors={d1:'var(--hat-d1)',d2:'var(--hat-d2)',d3:'var(--hat-d3)',d4:'var(--hat-d4)',other:'var(--hat-text-3)',unmeasured:'var(--hat-unmeasured)'};
  const color=(r,i)=>colors[r.color]||'var(--hat-text-3)';
  // Number conversions below only size bars or convert ratios to display percentages.
  const width=(value,max)=>valid(value)&&max>0?Math.max(0,Math.min(100,Number(value)/max*100)):0;
  const isUnmeasured=r=>r.id==='_unmeasured'||r.area_id==='_unmeasured'||r.color==='unmeasured';
  const itemName=(r,group)=>{
    if(isUnmeasured(r))return t('Unmeasured','Niezmierzone');
    // grouped() uses an explicit null identity for the unassigned bucket. A
    // matching name alone is never enough to translate a real HA area/device.
    if(group==='rooms'&&r.area_id===null&&r.name==='Bez pokoju')return t('No room','Bez pokoju');
    if(group==='floors'&&r.floor_id===null&&r.name==='Bez piętra')return t('No floor','Bez piętra');
    return r.name||unknown();
  };
  const channelLabels={email:t('Email','E-mail'),persistent_notification:t('HA notification','Powiadomienie HA'),'notify.persistent_notification':t('HA notification','Powiadomienie HA'),'notify.send_message':t('HA message','Wiadomość HA')};
  const channelText=value=>{
    const text=String(value||unknown()),ids=text.split(',').map(id=>id.trim());
    return ids.some(id=>Object.hasOwn(channelLabels,id))?ids.map(id=>Object.hasOwn(channelLabels,id)?channelLabels[id]:id).join(', '):text;
  };
  // Backend model/1 may use its semantic key as the label. Translate only this
  // allowlist; already descriptive/custom labels remain producer-owned text.
  const comparisonLabels={
    previous_day:t('Previous day','Poprzedni dzień'),
    same_weekday_last_week:t('Same weekday last week','Ten sam dzień tydzień temu'),
    avg_7d:t('7-day average','Średnia 7 dni'),
    previous_week:t('Previous week','Poprzedni tydzień'),
    previous_month:t('Previous month','Poprzedni miesiąc'),
    previous_year:t('Previous year','Poprzedni rok'),
    same_week_last_year:t('Same week last year','Ten sam tydzień rok temu'),
    same_month_last_year:t('Same month last year','Ten sam miesiąc rok temu'),
    previous:t('Previous period','Poprzedni okres'),
  };
  const comparisonLabel=r=>{
    const label=String(r.label??''),semantic=label.trim();
    if(semantic&&!Object.hasOwn(comparisonLabels,semantic))return label;
    const key=Object.hasOwn(comparisonLabels,r.key)?r.key:semantic;
    return Object.hasOwn(comparisonLabels,key)?comparisonLabels[key]:t('Previous period','Poprzedni okres');
  };
  const doubleMessage=()=>t('Device total exceeds import — check the Energy dashboard','Suma urządzeń przekracza import — sprawdź panel Energia');
  // Classification must be producer-supplied; list order and labels are not prices.
  const zoneClass=z=>z?.classification||z?.zone_class||(z?.cheap===true?'cheap':z?.cheap===false?'expensive':null);
  const zoneFill=z=>zoneClass(z)==='cheap'?'var(--hat-zone-cheap)':['expensive','exp'].includes(zoneClass(z))?'var(--hat-zone-exp)':'var(--hat-text-3)';
  function chart(m,current={}){
    const hourly=m.period?.kind==='day',rows=list(hourly?m.hourly:m.daily),resolution=hourly?'hour':'day';
    const values=rows.flatMap(r=>[r.kwh,r.prev_kwh]).filter(valid).map(Number),max=Math.max(0,...values);
    const labels=format?.chartLabels?.(rows.map(r=>r.start),resolution)||rows.map(r=>format?.dateTime?.(r.start)||unknown());
    const zone=id=>list(m.zones).find(z=>z.id===id);
    const bars=rows.map((r,i)=>{
      const future=r.future===true||(hourly&&Number.isFinite(Date.parse(current.as_of))&&Date.parse(r.start)>=Date.parse(current.as_of));
      // Daily zone segments are already aggregated by the producer. Only scale geometry.
      const segments=!hourly&&list(r.zones).length?list(r.zones):[{id:r.zone,kwh:r.kwh}];
      const fill=future?`<i style="height:${width(r.prev_kwh,max)}%;background:var(--hat-ghost)"></i>`:segments.map(z=>`<i style="height:${width(z.kwh,max)}%;background:${zoneFill(zone(z.id))}"></i>`).join('');
      return `<div class="c" title="${esc(labels[i])}: ${energy(r.kwh,m.period?.kind)}"><span class="chart-stack">${fill}</span>${valid(r.prev_kwh)?`<em style="bottom:${width(r.prev_kwh,max)}%"></em>`:''}</div>`;
    }).join('');
    const now=Date.parse(current.as_of),begin=Date.parse(m.period?.start),end=Date.parse(m.period?.end);
    const marker=hourly&&Number.isFinite(now)&&now>=begin&&now<end?`<span class="now" style="left:${width(now-begin,end-begin)}%" title="${when(current.as_of)}"></span>`:'';
    const zoneLabel=r=>hourly?esc(zone(r.zone)?.label||unknown()):list(r.zones).length?list(r.zones).map(z=>`${esc(zone(z.id)?.label||unknown())}: ${energy(z.kwh,m.period?.kind)}`).join(' · '):esc(unknown());
    const data=table(hourly?t('Hourly data','Dane godzinowe'):t('Daily data','Dane dzienne'),[hourly?t('Time','Czas'):t('Date','Data'),t('Energy','Energia'),t('Previous','Poprzednio'),hourly?t('Zone','Strefa'):t('Zones','Strefy'),t('Cost','Koszt')],rows.map((r,i)=>[esc(labels[i]),energy(r.kwh,m.period?.kind),energy(r.prev_kwh,m.period?.kind),zoneLabel(r),money(r.cost,m.currency)]));
    return `${heading(t('Energy during the period','Zużycie w okresie'),t('Color = zone · line = previous','Kolor = strefa · kreska = poprzednio'))}${rows.length?`<div class="cols24" data-energy-build1-series="${hourly?'hourly':'daily'}" role="img" aria-label="${t('Energy chart; full values in Data','Wykres energii; pełne wartości w Danych')}">${bars}${marker}</div><div class="axis"><span>${esc(labels[0])}</span><span>${esc(labels.at(-1))}</span></div><div class="legend">${list(m.zones).map(z=>`<span><i style="background:${zoneFill(z)}"></i>${esc(z.label)}</span>`).join('')}<span>${t('Line: previous period','Kreska: poprzedni okres')}</span></div>`:empty()}<details data-energy-build1-disclosure="chart-data"><summary>${t('Data','Dane')}</summary>${data}${table(t('Exact values','Pełne wartości'),[t('Time','Czas'),'kWh',m.currency?esc(m.currency):unknown()],rows.map((r,i)=>[esc(labels[i]),exact(r.kwh),exact(r.cost)]))}</details>`;
  }
  function overview(m,o,partial){
    const total=m.totals||{},current=o.current||{},period=m.period?.kind;
    const cheapZones=list(m.zones).filter(z=>zoneClass(z)==='cheap'),cheap=cheapZones.length===1?cheapZones[0]:null;
    const comparisons=list(m.comparisons),previous=comparisons.find(r=>['previous_day','previous'].includes(r.key));
    const comparison=r=>partial||r.coverage_ok!==true?esc(t('Insufficient coverage for comparison','Za mało danych do porównania')):`${energy(r.delta_kwh,period)} (${percent(r.delta_pct,'change')})`;
    const top=list(m.ranking).filter(r=>!String(r.id||'').startsWith('_')).slice(0,3);
    return `<div class="kpi4">${kpi(t('Consumption','Zużycie'),energy(total.import_kwh,period,'tile'),previous?comparison(previous):'')}${kpi(t('Usage cost','Koszt zużycia'),money(total.usage_cost,m.currency),rate(total.effective_rate,m.currency))}${kpi(t('In the cheap zone','W taniej strefie'),partial?unknown():ratio(cheap?.share),energy(cheap?.kwh,period))}${kpi(t('Now','Teraz'),esc(current.label||unknown()),`${rate(current.rate,current.currency)}${current.next_change?` · ${esc(current.next_label||'')} ${when(current.next_change)}`:''}`)}</div>${current.as_of?`<p class="info">${t('Live snapshot','Stan bieżący')}: ${when(current.as_of)}</p>`:''}${chart(m,current)}<div class="two"><div>${heading(t('Comparison','Porównanie'),t('Same measurement window','Ten sam zakres pomiaru'))}${comparisons.length?comparisons.map(r=>row(esc(comparisonLabel(r)),comparison(r),energy(r.kwh,period))).join(''):empty()}</div><div>${heading(t('Largest consumers','Największe zużycie'),action('section',sections.breakdown,'breakdown'))}${top.length?top.map(r=>row(esc(itemName(r)),energy(r.kwh,period))).join(''):empty()}</div></div>`;
  }
  function breakdown(m,o,partial,double){
    const group=Object.hasOwn(groups,o.group)?o.group:'devices',period=m.period?.kind;
    const rows=(group==='devices'?list(m.ranking).length?list(m.ranking):list(m.devices):list(m[group])).filter(r=>!(group==='rooms'&&r.area_id===null&&valid(r.kwh)&&Number(r.kwh)===0));
    const safe=rows.filter(r=>!(double&&isUnmeasured(r))),max=Math.max(0,...safe.filter(r=>valid(r.kwh)).map(r=>Number(r.kwh)));
    const value=(r,f)=>double&&isUnmeasured(r)?esc(doubleMessage()):f();
    const one=(r,i,child=false)=>`<div class="rk2${child?' child':''}"><div class="nm"><i class="sw${isUnmeasured(r)?' hatch':''}" style="background:${color(r,i)}"></i><span>${child?'↳ ':''}${esc(itemName(r,child?undefined:group))}${child?` <small>(${t('included','w tym')})</small>`:''}${r.count!==undefined?`<small>${exact(r.count)} ${formatted('reportPlural',r.count,pl?{one:'urządzenie',few:'urządzenia',many:'urządzeń'}:{one:'device',other:'devices'})}</small>`:''}</span></div><div class="bar"><i class="${isUnmeasured(r)?'hatch':''}" style="width:${double&&isUnmeasured(r)?0:width(r.kwh,max)}%;background:${color(r,i)}"></i></div><div class="v">${value(r,()=>energy(r.kwh,period))}</div><div class="p">${partial||double?'—':ratio(r.share)}</div><div class="c">${child?'':value(r,()=>money(r.cost,m.currency))}</div></div>`;
    return `<div class="seg2">${Object.entries(groups).map(([key,label])=>action('group',label,key,`aria-pressed="${group===key}"`)).join('')}</div>${heading(`${energy(m.totals?.import_kwh,period)} ${t('imported','importu')}`,t('Energy dashboard devices · hourly zone costs','Urządzenia z panelu Energia · koszt wg stref każdej godziny'))}<div class="compbar" aria-hidden="true">${safe.map((r,i)=>`<i class="${isUnmeasured(r)?'hatch':''}" style="width:${width(r.kwh,Number(m.totals?.import_kwh))}%;background:${color(r,i)}"></i>`).join('')}</div>${rows.length?rows.map((r,i)=>`${r.id==='_other_measured'?`<details data-energy-build1-disclosure="other-measured"><summary>${t('Other measured devices','Pozostałe zmierzone')}</summary>${one(r,i)}${list(r.children).map(c=>one(c,i,true)).join('')}${list(r.children).length?'':`<p class="info">${t('Individual readings are unavailable in this snapshot.','Odczyty poszczególnych urządzeń nie są dostępne w tym stanie.')}</p>`}</details>`:one(r,i)+list(r.children).map(c=>one(c,i,true)).join('')}`).join(''):empty()}<p class="info">${t('Unmeasured = import minus top-level devices. Included children are not counted twice. Rooms follow HA areas; no proportional allocation.','Niezmierzone = import − suma urządzeń najwyższego poziomu. Urządzenia „w tym” nie są liczone drugi raz. Pokoje według obszarów HA; bez podziału proporcjonalnego.')}</p>`;
  }
  function costs(m,o){
    const v=m.totals||{},tf=m.tariff||{},c=m.currency;
    const charges=[[t('Active energy','Energia czynna'),money(v.energy_cost,c)],[t('Variable distribution','Dystrybucja zmienna'),money(v.variable_cost,c)],[`${t('Usage cost','Koszt zużycia')}<small>${t('Effective rate','Cena efektywna')}: ${rate(v.effective_rate,c)}</small>`,money(v.usage_cost,c)],[t('Fixed charges allocated to this period','Opłaty stałe przypadające na okres'),money(v.fixed_share,c)],[t('Total including fixed charges','Razem z opłatami stałymi'),money(v.total_with_fixed,c)]];
    const alternatives=o.showAlternatives===false?'':list(m.alternatives).map(a=>`<p class="info">${esc(a.tariff)} · ${rate(a.rate,c)} · ${money(a.cost,c)} · ${t('difference','różnica')}: ${money(a.delta,c)}<br>${t('Informational comparison for unchanged consumption.','Porównanie informacyjne przy niezmienionym zużyciu.')}</p>`).join('');
    return `<div class="two"><div>${heading(t('Cost for the period','Koszt okresu'),m.price_basis==='gross'?t('gross','brutto'):m.price_basis==='net'?t('net','netto'):unknown())}${table(t('Cost components','Składniki kosztu'),[t('Component','Składnik'),t('Cost','Koszt')],charges)}${alternatives}</div><div>${heading(`${t('Tariff','Taryfa')} ${esc(tf.name||unknown())}`,`${tf.valid_from?date(tf.valid_from):unknown()} · ${action('tariff-history',t('History','Historia'))}`)}${table(t('Zone rates','Stawki stref'),[t('Zone / hours','Strefa / godziny'),t('Energy + distribution = rate','Energia + dystrybucja = stawka')],list(tf.zones).map(z=>[`${esc(z.label)}<small>${esc(z.hours_label||unknown())}</small>`,`${rate(z.energy_rate,c)} + ${rate(z.variable_rate,c)} = <b>${rate(z.rate,c)}</b>`]))}${heading(t('Fixed charges','Opłaty stałe'),`${money(tf.fixed_monthly,c)} / ${t('month','mies.')}`)}${table(t('Monthly fixed charges','Miesięczne opłaty stałe'),[t('Component','Składnik'),t('Monthly','Miesięcznie')],list(tf.fixed).map(f=>[esc(f.label),money(f.monthly,c)]))}<div class="hat-acts">${action('tariff-edit',t('Edit tariff','Edytuj taryfę'))}${action('tariff-template',t('Tariff templates','Szablony taryf'))}</div></div></div>`;
  }
  function reports(m,o){
    const schedules=list(o.schedules),deliveries=list(o.deliveries).slice(0,5),editable=o.canManageReports===true;
    const disabled=editable?'':'disabled',scheduleDisabled=(o.canManageSchedules??editable)?'':'disabled';
    const status={delivered:t('Delivered','Dostarczone'),failed:t('Failed','Błąd'),pending:t('Pending','Oczekuje'),accepted_by_notify:t('Accepted by HA','Przyjęte przez HA'),accepted_by_smtp:t('Accepted by SMTP','Przyjęte przez SMTP'),outcome_unknown:t('Outcome unknown','Wynik nieznany'),transport_outcome_unknown:t('Outcome unknown','Wynik nieznany'),partial_acceptance:t('Partly accepted','Częściowo przyjęte'),sent:t('Sent','Wysłano')};
    return `${heading(t('Schedule','Harmonogram'),t('HA notification or email','Powiadomienie HA lub e-mail'))}<div class="list">${schedules.length?schedules.map(s=>`<div class="it"><div class="txt">${esc(s.name||s.cadence||unknown())}<small>${esc(s.cadence||'')} · ${esc(s.time||unknown())} · ${esc(channelText(s.channel))}</small></div>${action('schedule-toggle',s.enabled===true?t('Enabled','Włączony'):s.enabled===false?t('Disabled','Wyłączony'):unknown(),s.id,`${s.editable===false?'disabled':scheduleDisabled} aria-pressed="${s.enabled===true}"`)}${action('schedule-edit',t('Edit','Edytuj'),s.id,s.editable===false?'disabled':scheduleDisabled)}</div>`).join(''):`<p>${t('No schedules supplied.','Nie dostarczono harmonogramów.')}</p>`}</div><div class="hat-acts">${action('send-now',t('Send daily now','Wyślij dzienny teraz'),'day',disabled)}${action('schedule-add',t('+ Report','+ Raport'),'',scheduleDisabled)}${action('email-add',t('Add email','Dodaj e-mail'),'',disabled)}</div>${heading(t('Preview','Podgląd'),t('The same report as in the email','Ten sam raport co w e-mailu'))}<div class="preview-controls">${action('preview-device',t('Phone','Telefon'),'phone')}${action('preview-device',t('Desktop','Komputer'),'desktop')}${action('preview-theme',t('Light','Jasny'),'light')}${action('preview-theme',t('Dark','Ciemny'),'dark')}${action('preview-load',t('Load preview','Wczytaj podgląd'))}</div><div class="prev" data-energy-build1-preview>${typeof o.previewText==='string'?`<pre>${esc(o.previewText)}</pre>`:`<p>${t('Load the report preview.','Wczytaj podgląd raportu.')}</p>`}</div>${heading(t('Recent deliveries','Ostatnie wysyłki'))}<div class="list">${deliveries.length?deliveries.map(d=>`<div class="it"><div class="txt">${when(d.at)} · ${esc(d.name||'')}<small>${esc(channelText(d.channel))}</small></div><span class="status">${esc(status[d.status]||d.status||unknown())}</span>${d.status==='failed'&&d.retryable!==false?action('delivery-retry',t('New report','Nowy raport'),d.id,disabled):''}</div>`).join(''):`<p>${t('No delivery history supplied.','Nie dostarczono historii wysyłek.')}</p>`}</div>`;
  }
  function markup(model,options={}){
    const m=model&&typeof model==='object'?model:{},o=options,section=Object.hasOwn(sections,o.section)?o.section:'overview';
    const issues=list(m.issues),double=m.unmeasured?.status==='double_counting'||issues.some(i=>i.code==='double_counting');
    const partial=m.coverage?.complete!==true,missing=issues.some(i=>i.code==='no_grid_meter');
    const currentPeriod=Object.hasOwn(periods,m.period?.kind)?m.period.kind:Object.hasOwn(periods,o.period)?o.period:'day';
    const header=`<div class="ehd"><ha-icon icon="mdi:lightning-bolt" class="hat-ic"></ha-icon><div class="txt"><div class="t">${esc(o.title||t('Energy','Energia'))}</div><div class="s">${t('Tariff','Taryfa')} ${esc(m.tariff?.name||unknown())} · ${t('HA Energy dashboard data','Dane z panelu Energia HA')}</div></div><div class="seg2">${Object.entries(periods).map(([key,label])=>action('period',label,key,`aria-pressed="${key===currentPeriod}"`)).join('')}</div><div class="nav">${action('previous','‹','',`aria-label="${t('Previous period','Poprzedni okres')}"`)}<b>${formatted('range',m.period?.start,m.period?.end)}</b>${action('next','›','',`aria-label="${t('Next period','Następny okres')}"`)}</div></div>`;
    const tabs=`<nav class="tabs2" aria-label="${t('Energy sections','Sekcje energii')}">${Object.entries(sections).map(([key,label])=>action('section',label,key,`aria-current="${key===section?'page':'false'}"`)).join('')}${action('more','⋯','',`aria-label="${t('More sections','Więcej sekcji')}"`)}</nav>`;
    let content;
    if(o.loading)content=`<div class="skeleton" role="status" aria-busy="true">${t('Loading…','Wczytywanie…')}</div>`;
    else if(section==='reports'&&o.reportAccess===true)content=reports(m,o);
    else if(missing)content=`<p>${t('The Energy dashboard is not configured.','Panel Energia nie jest skonfigurowany.')}</p>${action('configure-energy',t('Configure Energy','Skonfiguruj Energię'))}`;
    else if(m.schema!=='ha_tools.energy_report/1')content=`<p role="status">${t('Energy report unavailable.','Raport energii niedostępny.')}</p>`;
    else content=(partial?`<p class="notice" role="status">${t('Incomplete data','Dane niepełne')} (${exact(m.coverage?.measured_hours)}/${exact(m.coverage?.expected_hours)} h)</p>`:'')+(double?`<p class="notice" role="alert">${doubleMessage()}</p>`:'')+(section==='overview'?overview(m,o,partial):section==='breakdown'?breakdown(m,o,partial,double):section==='costs'?costs(m,o):reports(m,o));
    return `<section class="hat build1 cq" data-energy-build1-section="${section}">${header}${tabs}<div class="build1-panel">${content}</div></section>`;
  }
  function styles(){return BUILD1_STYLES_V53;}
  return {markup,styles};
}
const BUILD1_STYLES_V53=`
.build1{--hat-card:var(--ha-card-background,var(--card-background-color,#fff));--hat-text:var(--primary-text-color,#111827);--hat-text-2:var(--secondary-text-color,#4b5563);--hat-text-3:var(--secondary-text-color,#6b7280);--hat-chip:var(--secondary-background-color,#f3f4f6);--hat-border:var(--divider-color,#e5e7eb);--hat-primary:var(--primary-color,#2563eb);--hat-grid:color-mix(in srgb,var(--hat-text) 6%,var(--hat-card));--hat-ghost:color-mix(in srgb,var(--hat-text) 16%,var(--hat-card));--hat-zone-cheap:#1baf7a;--hat-zone-exp:#2a78d6;--hat-d1:#eb6834;--hat-d2:#6250d6;--hat-d3:#e87ba4;--hat-d4:#eda100;--hat-unmeasured:#9ca3af;color:var(--hat-text);font:14px var(--ha-font-family-body,Roboto,system-ui,sans-serif);padding:16px;box-sizing:border-box;container-type:inline-size;min-width:0;overflow-wrap:anywhere}
:host(.hat-dark) .build1,.build1.hat-dark{--hat-zone-cheap:#199e70;--hat-zone-exp:#3987e5;--hat-d1:#d95926;--hat-d2:#9085e9;--hat-d3:#d55181;--hat-d4:#c98500;--hat-unmeasured:#6b7280}
.build1 *{box-sizing:border-box}.build1 button{font:inherit;color:inherit;border:1px solid var(--hat-border);background:var(--hat-chip);border-radius:999px;padding:6px 12px;min-height:44px;cursor:pointer}.build1 button:disabled{opacity:.6;cursor:default}.build1 button:focus-visible,.build1 summary:focus-visible{outline:2px solid var(--hat-primary);outline-offset:2px}.build1 button[aria-pressed=true]{background:var(--hat-card);font-weight:600}.build1 .ehd{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.build1 .txt{flex:1;min-width:120px}.build1 .t{font-size:16px;font-weight:600;line-height:22px}.build1 .s,.build1 small,.build1 .info{font-size:12px;color:var(--hat-text-2)}.build1 small{display:block}.build1 .hat-ic{--mdc-icon-size:20px;color:var(--hat-zone-exp);background:color-mix(in srgb,var(--hat-zone-exp) 18%,transparent);border-radius:50%;padding:8px;width:36px;height:36px}.build1 .seg2{display:inline-flex;flex-wrap:wrap;background:var(--hat-chip);border-radius:24px;padding:2px}.build1 .seg2 button{font-size:12px;border:0}.build1 .nav{display:flex;align-items:center;gap:6px;min-width:0}.build1 .nav b{font-size:14px;font-weight:500}.build1 .tabs2{display:flex;gap:16px;border-bottom:1px solid var(--hat-border);margin:12px 0 16px;overflow-x:auto}.build1 .tabs2 button{background:none;border:0;border-radius:0;padding:10px 0;white-space:nowrap;color:var(--hat-text-2)}.build1 .tabs2 button[aria-current=page]{color:var(--hat-text);font-weight:600;box-shadow:inset 0 -2px 0 var(--hat-primary)}.build1 .kpi4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.build1 .k{border:1px solid var(--hat-border);border-radius:12px;padding:10px 12px;min-width:0}.build1 .k .l,.build1 .k .n{font-size:12px;color:var(--hat-text-2)}.build1 .k .v{font-size:24px;font-weight:600;line-height:30px;font-variant-numeric:tabular-nums}.build1 .sec2{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:baseline;margin:20px 0 8px}.build1 .sec2 b{font-size:16px;font-weight:600}.build1 .sec2>span{font-size:12px;color:var(--hat-text-2)}.build1 .cols24{display:flex;gap:2px;align-items:flex-end;height:120px;position:relative}.build1 .cols24 .c{flex:1;position:relative;height:100%;display:flex;align-items:flex-end}.build1 .cols24 .chart-stack{display:flex;flex-direction:column-reverse;justify-content:flex-start;width:100%;height:100%}.build1 .cols24 .c i{display:block;width:100%;border-radius:2px 2px 0 0}.build1 .cols24 .c em{position:absolute;left:0;right:0;height:2px;background:var(--hat-text);opacity:.7}.build1 .cols24 .now{position:absolute;top:0;bottom:0;border-left:2px dashed var(--hat-text-2)}.build1 .axis{display:flex;justify-content:space-between;font-size:12px;color:var(--hat-text-2)}.build1 .legend{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0;font-size:12px}.build1 .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px}.build1 summary{min-height:44px;padding:12px 0;cursor:pointer}.build1 .row3{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 0;border-top:1px solid var(--hat-border)}.build1 .row3 .r{text-align:right;font-weight:600}.build1 .rk2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 88px 40px 80px;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--hat-border)}.build1 .rk2 .bar{height:10px;border-radius:999px;background:var(--hat-grid);overflow:hidden}.build1 .rk2 .bar i{display:block;height:100%;border-radius:999px}.build1 .rk2 .v,.build1 .rk2 .p,.build1 .rk2 .c{text-align:right;font-variant-numeric:tabular-nums}.build1 .rk2 .v{font-weight:600}.build1 .rk2 .p{font-size:12px;color:var(--hat-text-2)}.build1 .rk2 .nm{display:flex;align-items:center;gap:8px;min-width:0}.build1 .child{padding-left:28px;color:var(--hat-text-2)}.build1 .sw{width:10px;height:10px;border-radius:3px;flex:none}.build1 .hatch{background-image:repeating-linear-gradient(135deg,var(--hat-unmeasured) 0 2px,transparent 2px 6px)!important;background-color:transparent!important;box-shadow:inset 0 0 0 1px var(--hat-unmeasured)}.build1 .compbar{display:flex;gap:2px;height:14px;margin:4px 0 8px;overflow:hidden;border-radius:999px}.build1 .compbar i{display:block;height:100%;flex:none}.build1 .table-wrap{overflow-x:auto}.build1 .ct{width:100%;border-collapse:collapse;font-size:14px}.build1 .ct td,.build1 .ct th{padding:8px 4px;border-top:1px solid var(--hat-border);text-align:left;font-variant-numeric:tabular-nums}.build1 .ct td:last-child{text-align:right}.build1 caption{text-align:left;font-size:12px;color:var(--hat-text-2);padding:8px 0}.build1 .info{line-height:18px}.build1 .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}.build1 .two>div{min-width:0}.build1 .list .it{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--hat-border)}.build1 .hat-acts,.build1 .preview-controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.build1 .prev{border:1px solid var(--hat-border);border-radius:12px;padding:12px}.build1 pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}.build1 .notice{padding:12px;background:var(--hat-chip);border-left:3px solid var(--hat-primary)}.build1 .skeleton{min-height:420px;background:var(--hat-chip);padding:16px;border-radius:12px}
@container(max-width:520px){.build1 .kpi4{grid-template-columns:repeat(2,minmax(0,1fr))}.build1 .two{grid-template-columns:1fr}.build1 .rk2{grid-template-columns:minmax(0,1.4fr) minmax(0,.8fr) 72px 70px;gap:6px}.build1 .rk2 .p{display:none}.build1 .ehd>.seg2{order:3}.build1 .k .v{font-size:20px}.build1 .nav{flex-wrap:wrap}.build1 .tabs2{gap:16px}}
`;

// Presentation-only copy: never alter the backend report or execute iframe script.
function energyBuild1PreviewDocumentV53(html,theme,document){
  const mode=theme==='dark'?'dark':'light';
  const parsed=new document.defaultView.DOMParser().parseFromString(String(html),'text/html');
  parsed.documentElement.setAttribute('data-mail-preview-theme',mode);
  parsed.documentElement.style.colorScheme=mode;
  for(const style of parsed.querySelectorAll('style')){
    // Force only color-scheme media features. Keep width/print/other constraints.
    // Negative viewport widths are always false per Media Queries; zero min is true.
    style.textContent=style.textContent.replace(/@media\b([^{}]*)\{/gi,(all,query)=>'@media'+query.replace(/\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi,(_,wanted)=>wanted.toLowerCase()===mode?'(min-width: 0px)':'(max-width: -1px)')+'{');
  }
  for(const meta of parsed.querySelectorAll('meta[name="color-scheme"],meta[name="supported-color-schemes"]'))meta.setAttribute('content',mode);
  const policy=parsed.createElement('meta');policy.setAttribute('http-equiv','Content-Security-Policy');policy.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; navigate-to 'none'";parsed.head.prepend(policy);
  return '<!doctype html>'+parsed.documentElement.outerHTML;
}
// Installed outside generated constructor bodies, before customElements.define.
function installEnergyBuild1HostV53({Card,name,format,createClient=createEnergyModelV53,createView=createEnergyBuild1ViewV53,createReports=typeof createEnergyReportsActionsV53==='function'?createEnergyReportsActionsV53:null}) {
  const key=name==='ha-energy-optimizer'?'_currentTab':'_activeTab';
  const defaults=name==='ha-energy-insights'?'breakdown':name==='ha-energy-email'?'reports':'overview';
  const aliases={dashboard:'overview',daily:'breakdown',weekly:'breakdown',monthly:'breakdown',compare:'costs',recommendations:'costs',schedule:'reports',preview:'reports',send:'reports',history:'reports'};
  const canonical=v=>['overview','breakdown','costs','reports'].includes(v)?v:aliases[v];
  const baseTab={overview:name==='ha-energy-optimizer'?'dashboard':'overview',breakdown:name==='ha-energy-insights'?'daily':name==='ha-energy-optimizer'?'dashboard':'overview',costs:name==='ha-energy-optimizer'?'recommendations':'overview',reports:name==='ha-energy-email'?'overview':name==='ha-energy-optimizer'?'dashboard':'overview'};
  const nativeReportRoute=card=>name==='ha-energy-email'&&(card._build1ConfigV53?.default_tab==='preview'||card._emailCompactSendFlowV106||card._optionsExpandedV5&&card[key]==='send');
  const eligible=card=>!nativeReportRoute(card)&&!card._build1CompatLegacyV53&&!card._build1LegacyV53&&(!(card._config?.compact&&!card._config?.variant))&&(!['tile','compact'].includes(card._config?.variant)||card._optionsExpandedV5);
  const full=card=>eligible(card)&&card._build1ClientV53?.state().supported===true;
  const active=card=>eligible(card)&&card.isConnected&&card.preview!==true;
  const pl=card=>String(card._hass?.locale?.language||card._hass?.language||'en').startsWith('pl');
  const text=(card,en,polish)=>pl(card)?polish:en;
  let painting=new WeakSet();
  const presentations=new WeakMap();
  function client(card){return card._build1ClientV53 ||= createClient({card,guard:card._getTariffHostV3().guard,format,isActive:()=>active(card),onChange:()=>changed(card)});}
  function changed(card){
    if(full(card)){paint(card);return;}
    // Pending/old capability replies must leave existing forms, focus and startup alone.
    if(!card._build1MountedV53)return;
    card._build1ReportsV53?.stop();card._build1MountedV53=false;card._domBuilt=false;presentations.delete(card);
    card.shadowRoot?.replaceChildren();
    queueMicrotask(()=>{if(card.isConnected&&!full(card))hass?.set?.call(card,card._hass);});
  }
  function probe(card){
    if(!active(card)||!card._hass?.user?.id||card._hass.user.is_active===false||card._hass.connected===false||typeof card._hass?.callWS!=='function'||typeof card._hass?.connection?.subscribeMessage!=='function')return;
    // Reuse the existing host's confirmed legacy classification. Do not disturb
    // its Recorder lane or restart already completed compatibility discovery.
    if(card._analysisHostV53?.legacyAllowed?.()===true&&!card._build1ClientV53)return;
    client(card).update(card._build1SelectionV53||{period:options(card).period_default||'day',mode:'full'});
  }
  function reports(card){
    if(!createReports||typeof card._getTariffHostV3().guard.call!=='function')return null;
    return card._build1ReportsV53 ||= createReports({card,format,isModelBusy:()=>client(card).state().busy,guard:card._getTariffHostV3().guard,getCapabilities:()=>client(card).state().capabilities,isActive:()=>active(card)&&card._build1SectionV53==='reports',onChange:()=>{if(!painting.has(card))paint(card);}});
  }
  function options(card){return card._build1ConfigV53||card._config||{};}
  function paint(card){
    if(!full(card)||!card.shadowRoot||painting.has(card))return;
    painting.add(card);
    try {
      const c=options(card),ctl=client(card),s=ctl.state(),ui=format.forHass(card._hass),v=createView({format:ui,language:ui.language});
      if(!card._build1MountedV53){card._analysisHostV53?.stop();card._reportHostV53?.stop();}
      card._build1MountedV53=true;
      const analysisAllowed=s.capabilities?.energy_analysis?.visible===true&&s.capabilities?.energy_analysis?.read===true;
      const reportAllowed=s.capabilities?.energy_reports?.visible===true&&s.capabilities?.energy_reports?.read===true;
      const section=!analysisAllowed&&reportAllowed?'reports':card._build1SectionV53||defaults;card._build1SectionV53=section;
      const reportActions=section==='reports'?reports(card):null;
      if(section!=='reports')card._build1ReportsV53?.stop();
      reportActions?.update();const reportState=reportActions?.state();
      const sectionFeature=section==='reports'?'energy_reports':section==='costs'?'energy_tariff':'energy_analysis';
      const sectionGrant=s.capabilities?.[sectionFeature];
      const sectionAllowed=sectionGrant?.visible===true&&sectionGrant?.read===true;
      const root=card.shadowRoot,doc=root.ownerDocument;
      let memory=presentations.get(card);
      if(!memory){memory={details:new Map(),markup:null,section:null,selection:null,focus:null,scrolls:[]};presentations.set(card,memory);}
      const scope=JSON.stringify(s.selection||card._build1SelectionV53||{});
      const scopeChanged=memory.section!==section||memory.selection!==scope;
      if(scopeChanged){memory.details.clear();memory.focus=null;memory.scrolls=[];memory.section=section;memory.selection=scope;}
      const focused=root.activeElement;
      const focus=focused?.dataset?.energyBuild1,focusValue=focused?.dataset?.value;
      const content=root.querySelector('[data-build1-content]');
      if(content?.contains(focused)){
        if(focus)memory.focus={action:focus,value:focusValue};
        else if(!scopeChanged&&focused?.tagName==='SUMMARY')memory.focus={disclosure:focused.parentElement.dataset.energyBuild1Disclosure};
      }else if(focused||doc.activeElement!==card&&doc.activeElement!==doc.body)memory.focus=null;
      if(!scopeChanged)for(const details of content?.querySelectorAll('[data-energy-build1-disclosure]')||[])memory.details.set(details.dataset.energyBuild1Disclosure,details.open);
      const scrollers=[...content?.querySelectorAll('.table-wrap')||[]];
      if(!scopeChanged&&scrollers.length)memory.scrolls=scrollers.map(node=>[node.scrollLeft,node.scrollTop]);
      card._applyThemeV150?.();
      // A stable connected shell keeps the existing tariff editor and its inputs alive.
      if(!root.querySelector('[data-build1-content]')){root.innerHTML='<style data-build1-style></style><ha-card><div data-build1-content></div><div data-build1-extra></div><div data-build1-tariff-host></div><div data-build1-reports-host></div></ha-card>';memory.markup=null;}
      const style=root.querySelector('[data-build1-style]');if(style.textContent!==v.styles())style.textContent=v.styles();
      const panel=root.querySelector('[data-build1-content]');
      const markup=v.markup(sectionAllowed?s.model:null,{section,group:card._build1GroupV53,current:s.current||{},title:c.title,showAlternatives:c.show_alternatives!==false,loading:s.status==='loading',reportAccess:section==='reports'&&reportAllowed,period:s.selection?.period,canManageReports:reportState?.canExecute===true&&!reportState?.busy,canManageSchedules:reportState?.canManageSchedules===true&&!reportState?.busy,schedules:reportState?.schedules,deliveries:reportState?.deliveries});
      const replaced=memory.markup!==markup;
      if(replaced){panel.innerHTML=markup;memory.markup=markup;}
      for(const details of panel.querySelectorAll('[data-energy-build1-disclosure]'))if(memory.details.has(details.dataset.energyBuild1Disclosure))details.open=memory.details.get(details.dataset.energyBuild1Disclosure);
      if(replaced)[...panel.querySelectorAll('.table-wrap')].forEach((node,i)=>{if(memory.scrolls[i]){node.scrollLeft=memory.scrolls[i][0];node.scrollTop=memory.scrolls[i][1];}});
      const visible=c.tabs?.map(canonical).filter(Boolean);
      for(const button of panel.querySelectorAll('[data-energy-build1="section"]')){
        const tab=button.dataset.value,feature=tab==='reports'?'energy_reports':tab==='costs'?'energy_tariff':null;
        button.hidden=!!(['overview','breakdown','costs'].includes(tab)&&!analysisAllowed||visible?.length&&!visible.includes(tab)||feature&&s.capabilities?.[feature]?.visible===false);
      }
      const extra=root.querySelector('[data-build1-extra]'),extraKey=JSON.stringify([s.status,section,card._build1OverflowV53,card._hass?.user?.is_admin,ui.language]);
      const extraChanged=memory.extraKey!==extraKey;
      if(extraChanged){extra.replaceChildren();memory.extraKey=extraKey;}
      if(['tile','compact'].includes(c.variant)&&card._optionsExpandedV5){
        let back=root.querySelector('[data-energy-back]');if(!back){back=document.createElement('button');back.type='button';back.setAttribute('data-energy-back','');root.querySelector('ha-card').prepend(back);}back.textContent=text(card,'Back','Wróć');back.style.cssText='min-height:44px';
        back.onclick=()=>{card._optionsExpandedV5=false;card._build1MountedV53=false;ctl.stop();card._domBuilt=false;card._render();card.shadowRoot.querySelector('[data-energy-open]')?.focus({preventScroll:true});};
      }else root.querySelector('[data-energy-back]')?.remove();

      if(extraChanged&&(s.status==='error'||s.status==='denied')){const p=document.createElement('p');p.setAttribute('role','status');p.textContent=s.status==='denied'?text(card,'Access unavailable for this account.','Dostęp dla tego konta jest niedostępny.'):text(card,'Energy report unavailable. Check HA Tools Email and retry.','Raport energii niedostępny. Sprawdź HA Tools Email i ponów.');extra.append(p);const retry=document.createElement('button');retry.textContent=text(card,'Retry','Ponów');retry.onclick=()=>ctl.refresh();extra.append(retry);}
      // Existing editor owns tariffs, migrations, validation, and write authority.
      const tariffArea=root.querySelector('[data-build1-tariff-host]');
      const tariffGrant=s.capabilities?.energy_tariff;
      const revoked=tariffGrant&&(tariffGrant.visible!==true||tariffGrant.read!==true);
      if(revoked){tariffArea.replaceChildren();card._tariffSettingsOpen=false;}
      tariffArea.hidden=section!=='costs'||!!revoked;
      if(section==='costs'&&sectionAllowed){
        if(!tariffArea.firstChild){tariffArea.innerHTML=card._getTariffHostV3().markup();card._getTariffHostV3().bind();}
      }
      if(s.preview?.html&&s.capabilities?.energy_reports?.read===true&&s.capabilities?.energy_reports?.visible===true){
        const holder=panel.querySelector('[data-energy-build1-preview]');if(holder){
          let frame=holder.querySelector('iframe');if(!frame){holder.replaceChildren();frame=doc.createElement('iframe');frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');holder.append(frame);}
          frame.title=text(card,'Energy report preview','Podgląd raportu energii');frame.style.cssText=`display:block;width:100%;max-width:${card._build1DeviceV53==='phone'?'390px':'100%'};height:560px;border:0;`;
          const srcdoc=energyBuild1PreviewDocumentV53(s.preview.html,card._build1ThemeV53||'light',doc);if(frame.srcdoc!==srcdoc)frame.srcdoc=srcdoc;
        }
      }else panel.querySelector('[data-energy-build1-preview] iframe')?.remove();
      let reportsArea=root.querySelector('[data-build1-reports-host]');if(!reportsArea){reportsArea=doc.createElement('div');reportsArea.setAttribute('data-build1-reports-host','');root.querySelector('ha-card').append(reportsArea);}reportsArea.hidden=section!=='reports';if(reportActions)reportActions.mount(reportsArea);
      const implemented=new Set(['section','group','period','previous','next','more','preview-load','preview-device','preview-theme','tariff-edit','tariff-history','tariff-template','configure-energy',...(reportActions?['send-now','email-add','schedule-toggle','schedule-add','schedule-edit','delivery-retry']:[])]);
      for(const b of root.querySelectorAll('[data-energy-build1]')){
        const action=b.dataset.energyBuild1;
        if(!implemented.has(action)){b.disabled=true;b.title=text(card,'This action is not connected in this version.','Ta akcja nie jest podłączona w tej wersji.');}
        if(['tariff-edit','tariff-template'].includes(action))b.disabled=s.capabilities?.energy_tariff?.execute!==true;
        if(action==='tariff-history')b.disabled=s.capabilities?.energy_tariff?.visible!==true||s.capabilities?.energy_tariff?.read!==true;
        if(action==='preview-load')b.disabled=s.busy||s.capabilities?.energy_reports?.read!==true||s.capabilities?.energy_reports?.visible!==true;
        if(['previous','next'].includes(action))b.disabled=!s.model;
        if(['preview-device','preview-theme'].includes(action))b.setAttribute('aria-pressed',String(b.dataset.value===(action==='preview-device'?card._build1DeviceV53||'desktop':card._build1ThemeV53||'light')));
        b.onclick=()=>{if(!b.disabled)void actionFor(card,action,b.dataset.value);};
      }
      if(replaced&&memory.focus&&(!root.activeElement||root.activeElement===focused)){
        const hint=memory.focus;let target;
        if(hint.action)target=[...panel.querySelectorAll('[data-energy-build1]')].find(b=>b.dataset.energyBuild1===hint.action&&b.dataset.value===hint.value);
        else if(hint.disclosure)target=[...panel.querySelectorAll('[data-energy-build1-disclosure]')].find(d=>d.dataset.energyBuild1Disclosure===hint.disclosure)?.querySelector('summary');
        if(target&&!target.disabled)target.focus({preventScroll:true});
      }
      if(extraChanged&&card._build1OverflowV53){
        const choices=name==='ha-energy-optimizer'?[['patterns','Patterns','Wzorce'],['recommendations','Recommendations','Rekomendacje']]:name==='ha-energy-insights'?[['tips','Recommendations','Rekomendacje']]:[['config','Email settings','Ustawienia e-mail'],['schedule','Schedules','Harmonogramy'],['send','Send form','Formularz wysyłki'],['history','History','Historia']];
        for(const [tab,en,polish] of choices){if(name==='ha-energy-email'&&card._hass?.user?.is_admin!==true)continue;const b=document.createElement('button');b.textContent=text(card,en,polish);b.onclick=()=>legacy(card,tab);extra.append(b);}
      }
    }finally{painting.delete(card);}
  }
  function render(card){if(!full(card)||!card._hass?.user?.id||!card.shadowRoot)return false;client(card).update(card._build1SelectionV53||{period:options(card).period_default||'day',mode:'full'});paint(card);return true;}
  function legacy(card,tab){card._build1LegacyV53=true;card._build1OverflowV53=false;card._build1MountedV53=false;card._build1ClientV53?.stop();card._domBuilt=false;card[key]=tab;card._render();const b=document.createElement('button');b.textContent=text(card,'Back to Energy','Wróć do Energii');b.onclick=()=>{card._build1LegacyV53=false;card._domBuilt=false;card._render();probe(card);};card.shadowRoot.prepend(b);}
  async function actionFor(card,action,value){
    if(!active(card))return;
    const ctl=client(card),s=ctl.state();
    if(action==='section'){card._build1SectionV53=value;paint(card);}
    else if(action==='group'){card._build1GroupV53=value;paint(card);}
    else if(action==='period'){card._build1SelectionV53={period:value,mode:'full'};ctl.update(card._build1SelectionV53);paint(card);}
    else if(action==='previous'||action==='next'){
      if(!s.model)return;const period=s.selection.period,parts=new Intl.DateTimeFormat('en-CA',{timeZone:card._hass.config.time_zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(s.model.period.start));const f=Object.fromEntries(parts.map(p=>[p.type,p.value]));const d=new Date(`${f.year}-${f.month}-${f.day}T12:00:00Z`),n=action==='next'?1:-1;
      if(period==='year')d.setUTCFullYear(d.getUTCFullYear()+n);else if(period==='month')d.setUTCMonth(d.getUTCMonth()+n);else d.setUTCDate(d.getUTCDate()+n*(period==='week'?7:1));
      card._build1SelectionV53={period,mode:'full',date:d.toISOString().slice(0,10)};ctl.update(card._build1SelectionV53);paint(card);
    } else if(action==='send-now'){reports(card)?.openSend();}
    else if(action==='email-add'){reports(card)?.openSend({email:true});}
    else if(action==='delivery-retry'){reports(card)?.openSend({retryId:value});}
    else if(action==='schedule-add'){reports(card)?.scheduleAction('add');}
    else if(action==='schedule-toggle'){reports(card)?.scheduleAction('toggle',value);}
    else if(action==='schedule-edit'){reports(card)?.scheduleAction('edit',value);}
    else if(action==='preview-load')await ctl.preview();
    else if(action==='preview-device'){card._build1DeviceV53=value;paint(card);}
    else if(action==='preview-theme'){card._build1ThemeV53=value;paint(card);}
    else if(action==='more'){card._build1OverflowV53=!card._build1OverflowV53;paint(card);}
    else if(['tariff-edit','tariff-history','tariff-template'].includes(action)){const grant=s.capabilities?.energy_tariff;if(grant?.visible!==true||grant?.read!==true||action!=='tariff-history'&&grant.execute!==true)return;card._tariffSettingsOpen=true;paint(card);await card._getTariffHostV3().openProfile(action==='tariff-history'?'history':action==='tariff-template'?'templates':'edit');}
    else if(action==='configure-energy'){history.pushState(null,'','/energy');window.dispatchEvent(new CustomEvent('location-changed'));}
  }
  const set=Card.prototype.setConfig;
  Card.prototype.setConfig=function(config={}){
    if(config.period_default!==undefined&&!['day','week','month','year'].includes(config.period_default))throw Error('period_default: day / week / month / year');
    if(config.show_alternatives!==undefined&&typeof config.show_alternatives!=='boolean')throw Error('show_alternatives: boolean');
    this._build1ReportsV53?.stop();presentations.delete(this);this._build1MountedV53=false;this._build1ClientV53?.stop();this._build1CompatLegacyV53=false;this._build1ConfigV53={...config};this._build1LegacyV53=['patterns','tips','config'].includes(config.default_tab);this._build1SectionV53=canonical(config.default_tab)||(config.tabs?.map(canonical).filter(Boolean).includes(defaults)?defaults:config.tabs?.map(canonical).find(Boolean))||defaults;this._build1SelectionV53={period:config.period_default||'day',mode:'full'};
    const nativeTabs=name==='ha-energy-optimizer'?['dashboard','patterns','recommendations','compare']:name==='ha-energy-insights'?['overview','daily','weekly','monthly','tips']:['overview','schedule','preview','send','config','history'];
    const translate=v=>nativeTabs.includes(v)?v:baseTab[canonical(v)]||v;
    const legacyConfig={...config};if(config.default_tab)legacyConfig.default_tab=translate(config.default_tab);if(config.tabs)legacyConfig.tabs=[...new Set(config.tabs.map(translate))];
    const result=set.call(this,legacyConfig);probe(this);render(this);return result;
  };
  const hass=Object.getOwnPropertyDescriptor(Card.prototype,'hass');
  if(hass?.set)Object.defineProperty(Card.prototype,'hass',{...hass,set(value){
    // The original setter owns first discovery, context purges, quiet recovery,
    // and existing form/transport lifetimes until this identity confirms schema.
    if(full(this)){
      this._hass=value;this._lang=String(value?.locale?.language||value?.language||'en').startsWith('pl')?'pl':'en';this._build1ClientV53.update(this._build1SelectionV53);
      if(render(this))return;
    }
    const result=hass.set.call(this,value);probe(this);return result;
  }});
  for(const method of ['_render','_renderTab','_renderCurrentTab','_updateContent']){const old=Card.prototype[method];if(old)Card.prototype[method]=function(...args){if(render(this))return;if(!eligible(this))this._build1ClientV53?.stop();const result=old.apply(this,args);if(this._optionsExpandedV5)probe(this);return result;};}
  const connected=Card.prototype.connectedCallback;
  Card.prototype.connectedCallback=function(){
    if(full(this)){this._tariffHostController?.guard.resume();probe(this);render(this);}
    else{connected?.call(this);probe(this);}
  };
  const disconnected=Card.prototype.disconnectedCallback;
  Card.prototype.disconnectedCallback=function(){this._build1ReportsV53?.stop();presentations.delete(this);this._build1ClientV53?.stop();return disconnected?.call(this);};
}
// HA_ENERGY_BUILD1_V53_END
// HA_DASHBOARD_PLACEMENT_V53_START
// Native HA dialog-manager (frontend 20260826.7) owns this transient session.
// Its provideHass subscription supplies current identity after Lovelace replaces
// the initiating card. Neither an old card nor a cached hass authorizes Undo.
function createNativeDashboardPlacementV53(options) {
  const {host, getHass, getCardConfig, getSourceKey, createGuard} = options;
  let ancestor = host;
  while (ancestor && ancestor.localName !== 'home-assistant')
    ancestor = ancestor.parentElement || ancestor.getRootNode?.().host;
  if (!ancestor || typeof ancestor.provideHass !== 'function') return null;
  const doc = host.ownerDocument, win = doc.defaultView;
  const tag = 'ha-tools-dashboard-placement-dialog-v53';
  const copy = value => JSON.parse(JSON.stringify(value));
  const route = () => win.location.pathname + win.location.search + win.location.hash;
  if (!win.customElements.get(tag)) {
    win.customElements.define(tag, class extends win.HTMLElement {
      set hass(value) {
        this._hass = value;
        this._guard?.observe(value);
        if (this._request && !this._sourceCurrent()) this.closeDialog();
        this._controller?.update();
      }
      get hass() { return this._hass; }
      _sourceCurrent() {
        const request = this._request;
        if (!request || request.cancelled || route() !== request.route) return false;
        return request.transferred || request.sourceCurrent();
      }
      showDialog(request) {
        this.closeDialog();
        if (request.cancelled) return;
        this._request = request; request.owner = this;
        // HA calls showDialog before appending the native element.
        win.queueMicrotask(() => this._start());
      }
      connectedCallback() { this._start(); }
      disconnectedCallback() { this.closeDialog(); }
      _start() {
        const request = this._request;
        if (!request || this._guard || !this.isConnected) return;
        if (!this._sourceCurrent() || this._hass?.connection !== request.connection ||
            this._hass?.user?.id !== request.user) { this.closeDialog(); return; }
        const guard = createGuard({getHass:() => this._hass,
          getContext:() => ({card:request.card,route:route()}),browser:win});
        this._guard = guard; this._token = guard.snapshot();
        if (!guard.current(this._token,true)) { this.closeDialog(); return; }
        this._unsubscribe = guard.subscribe(() => this.closeDialog());
        this._routeChanged = () => { if (!this._sourceCurrent()) this.closeDialog(); };
        for (const event of ['location-changed','popstate','hashchange']) win.addEventListener(event,this._routeChanged);
        this._controller ||= createDashboardPlacementV53({host:this,nativeOwned:true,
          getHass:() => this._sourceCurrent() && this._guard?.current(this._token,true) ? this._hass : null,
          getCardConfig:() => this._request?.card,
          getSourceKey:() => this._token?.epoch,
          onClose:() => { if (this._request) this.closeDialog(); }});
        if (!this._controller.open()) this.closeDialog();
      }
      transfer(request) {
        // Only a transaction already sent by the user's Add/Undo may outlive
        // a real source disconnect. A preview or unrelated teardown closes.
        if (this._request !== request || request.cancelled || route() !== request.route ||
            !this.isConnected || !this._guard?.current(this._token,true)) return false;
        // The source is already disconnected when its lifecycle callback runs.
        // Validate the sent transaction using the live native owner, rather
        // than requiring that detached source to remain connected.
        request.transferred = true;
        if (!this._controller?.acceptsOwnRemount()) { request.transferred = false; return false; }
        request.sourceCurrent = null; // Release all references to the old source.
        return true;
      }
      closeDialog() {
        const request = this._request;
        if (!request) return true;
        this._request = null; request.cancelled = true; request.owner = null;
        request.sourceCurrent = null; request.card = null; request.connection = null; request.user = null;
        this._unsubscribe?.(); this._unsubscribe = null;
        for (const event of ['location-changed','popstate','hashchange']) win.removeEventListener(event,this._routeChanged);
        this._routeChanged = null;
        const guard = this._guard; this._guard = null; this._token = null;
        this._controller?.close(); // Retain the raw lane until actual settlement.
        guard?.dispose();
        this.dispatchEvent(new win.CustomEvent('dialog-closed',{detail:{dialog:tag},bubbles:true,composed:true}));
        return true;
      }
    });
  }
  let request = null;
  function close() {
    if (!request) return;
    request.cancelled = true;
    if (request.owner?._request === request) request.owner.closeDialog();
    request.sourceCurrent = null; request.card = null; request = null;
  }
  return {
    open() {
      if (request && !request.cancelled) return true;
      const hass = getHass();
      if (!hass || !host.isConnected) return false;
      const card = copy(getCardConfig());
      const known = ['custom:ha-energy-optimizer','custom:ha-energy-insights','custom:ha-energy-email'];
      if (!known.includes(card?.type) || !options.cardTypes.includes(card.type)) return false;
      const source = JSON.stringify(getSourceKey()), signature = JSON.stringify(card);
      const next = {card,route:route(),connection:hass.connection,user:hass.user.id,cancelled:false,transferred:false,owner:null,
        sourceCurrent:() => {
          const live = getHass();
          return host.isConnected && live?.connection === next.connection && live?.user?.id === next.user &&
            JSON.stringify(getCardConfig()) === signature && JSON.stringify(getSourceKey()) === source;
        }};
      request = next;
      host.dispatchEvent(new win.CustomEvent('show-dialog',{bubbles:true,composed:true,detail:{
        dialogTag:tag,dialogImport:() => Promise.resolve(),dialogParams:next,addHistory:false}}));
      return true;
    },
    close,destroy:close,
    update() {
      if (!request || request.cancelled) return;
      if (!request.transferred && !request.sourceCurrent()) close();
      else request.owner?._controller?.update();
    },
    sourceDisconnected() {
      if (request?.owner?.transfer(request)) return true;
      close(); return false;
    }
  };
}
// Lovelace save has no CAS: compare-before-save reduces, but cannot eliminate,
// the race with another editor between the final read and the native save.
function createDashboardPlacementV53({host, getHass, getCardConfig,
  cardTypes = ['custom:ha-energy-optimizer', 'custom:ha-energy-insights', 'custom:ha-energy-email'],
  getSourceKey = () => null, createGuard, nativeOwned = false, onClose = () => {}}) {
  if (!nativeOwned) {
    const native = createNativeDashboardPlacementV53({host,getHass,getCardConfig,getSourceKey,cardTypes,createGuard});
    if (native) return native;
  }
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
    if (old) onClose();
  }
  function update() {
    if (!session || !current(session)) return;
    const card = dialog.querySelector('[data-preview]')?.firstElementChild;
    if (card) card.hass = getHass();
    paint();
  }
  function destroy() { close(); destroyed = true; }
  return {open,close,destroy,update,acceptsOwnRemount:() => !!session?.tx && current(session)};
}
// HA_DASHBOARD_PLACEMENT_V53_END
// HA_ENERGY_CARD_OPTIONS_V5_START
// Presentation-only card options. Only UI preferences are stored locally; no pricing, backend writes or requests.
function createEnergyCardOptionsV5({ Card, Editor, name, title, tabs, labels }) {
  const originalTabs = tabs;
  const build1Tabs = ['overview','breakdown','costs','reports'];
  const build1Labels = [['Overview','Breakdown','Costs','Reports'],['Przegląd','Rozbicie','Koszty','Raporty']];
  tabs = [...new Set([...originalTabs,...build1Tabs])];
  labels = [0,1].map(lang => tabs.map(id => build1Tabs.includes(id) ? build1Labels[lang][build1Tabs.indexOf(id)] : labels[lang][originalTabs.indexOf(id)]));
  const key = name === 'ha-energy-optimizer' ? '_currentTab' : '_activeTab';
  const pl = host => String(host._hass?.locale?.language || host._hass?.language || navigator.language || '').startsWith('pl');
  const t = (host, en, polish) => pl(host) ? polish : en;
  const visible = config => config.tabs || tabs;
  const variant = config => config.variant || (config.compact ? 'legacy' : 'full');
  const simple = host => ['tile','compact'].includes(variant(host._config || {})) && !host._optionsExpandedV5;

  // Placement retains its raw lane. A native dialog can take ownership of an
  // already-sent transaction across the expected Lovelace source remount.
  const placementFull = host => !simple(host) && !(variant(host._config || {}) === 'legacy' && !host._optionsExpandedV5);
  const placementGuard = host => host._getTariffHostV3().guard;
  const placementAllowed = host => {
    if (!host.isConnected || host.preview === true || !placementFull(host) || host._hass?.user?.is_admin !== true) return false;
    const guard = placementGuard(host), token = guard.snapshot();
    return guard.available(token) && guard.current(token,true);
  };
  const stopPlacement = host => {
    if (!host._dashboardPlacementV53?.sourceDisconnected?.()) host._dashboardPlacementV53?.close();
    host._energyStatisticsV110?.close();
    host._dashboardPlacementUnsubscribeV53?.(); delete host._dashboardPlacementUnsubscribeV53;
    delete host._dashboardPlacementGuardV53;
    host._dashboardPlacementMountV53?.remove();
    host._energyStatisticsMountV110?.remove();
    // Retain this factory and its mount for remount. destroy()+new would lose
    // occupancy of an unresolved native call; close() already purges snapshots.
  };
  const syncPlacement = host => {
    const root = host.shadowRoot;
    // Disconnect already closed or transferred placement. A queued render of
    // the old card must not cancel the session now owned by native HA.
    if (!root || !host.isConnected) return;
    if (!placementAllowed(host)) {
      host._dashboardPlacementV53?.close();
      host._energyStatisticsV110?.close(); host._energyStatisticsMountV110?.remove();
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
        host._dashboardPlacementV53?.close(); host._energyStatisticsV110?.close(); syncPlacement(host);
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
          createGuard:host._getTariffHostV3().createGuard,
          getSourceKey:() => placementGuard(host).snapshot().epoch
        });
        host._dashboardPlacementV53.open();
      });
      footer.append(css,button); parent.append(footer);
    }
    let statistics = footer.querySelector('[data-energy-statistics-open]');
    if (!statistics) {
      statistics = document.createElement('button'); statistics.type = 'button'; statistics.dataset.energyStatisticsOpen = '';
      statistics.addEventListener('click', () => {
        if (!placementAllowed(host)) { syncPlacement(host); return; }
        host._energyStatisticsMountV110 ||= document.createElement('div');
        root.append(host._energyStatisticsMountV110);
        host._energyStatisticsV110 ||= host._getTariffHostV3().statistics({host:host._energyStatisticsMountV110,isActive:() => placementAllowed(host)});
        host._energyStatisticsV110.open(statistics);
      });
      footer.append(statistics);
    }
    statistics.textContent = t(host,'Cost statistics','Statystyki kosztów');
    if (host._energyStatisticsMountV110 && host._energyStatisticsMountV110.parentNode !== root) root.append(host._energyStatisticsMountV110);
    host._energyStatisticsV110?.update();
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
    if(config.period_default!==undefined&&!['day','week','month','year'].includes(config.period_default))throw new Error('period_default: day / week / month / year');
    if(config.show_alternatives!==undefined&&typeof config.show_alternatives!=='boolean')throw new Error('show_alternatives: boolean');
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
    if (simple(this)) return variant(this._config) === 'tile' ? {columns:6,rows:1,min_columns:6} : {columns:12,rows:'auto',min_columns:6};
    return {columns:variant(this._config || {}) === 'legacy' ? 6 : 12,min_columns:3,min_rows:variant(this._config || {}) === 'legacy' ? 2 : 3};
  };
  const originalSize = Card.prototype.getCardSize;
  Card.prototype.getCardSize = function() { return simple(this) ? (variant(this._config) === 'tile' ? 1 : 4) : variant(this._config || {}) === 'legacy' && !this._optionsExpandedV5 ? 3 : originalSize?.call(this) || 10; };
  const style = `:host{display:block;min-width:0;color-scheme:light;--bento-primary:var(--hat-primary-fill,var(--_hat-primary-fill,#2563eb));--bento-primary-hover:var(--hat-primary-fill,var(--_hat-primary-fill,#2563eb));--bento-on-primary:var(--hat-on-primary,var(--_hat-on-primary,#fff));--bento-text-muted:var(--hat-text-2,var(--secondary-text-color,#4b5563));--energy-value-blue:var(--hat-text,var(--primary-text-color,#111827));--energy-value-amber:var(--hat-warn-text,var(--_hat-warn-readout,#9a5b05));--energy-value-green:var(--hat-good-text,var(--_hat-good-text,#15803d));--energy-value-red:var(--hat-crit-text,var(--_hat-crit-text,#b91c1c));--energy-value-neutral:var(--hat-text-2,var(--secondary-text-color,#4b5563));--energy-value-purple:var(--hat-d2,var(--_hat-d2,#6250d6));--energy-success-button:var(--hat-primary-fill,var(--_hat-primary-fill,#2563eb));--energy-kpi-tone:var(--hat-chip,var(--secondary-background-color,#f3f4f6));--energy-kpi-tone-alt:var(--energy-kpi-tone)}
:host(.bento-dark){color-scheme:dark}
.stat,.stat-card{background:var(--energy-kpi-tone)}.stat:nth-child(even),.stat-card:nth-child(even){background:var(--energy-kpi-tone-alt)}
.btn-primary,button.btn-primary{color:var(--bento-on-primary)}
.ht-tariff-v3 [data-status=success]{color:var(--energy-value-green)}.ht-tariff-v3 [data-status=error]{color:var(--energy-value-red)}.ht-tariff-v3 [data-status=partial],.ht-tariff-v3 [data-status=unconfirmed]{color:var(--energy-value-amber)}
 [data-energy-options-help], [data-energy-compact]{box-sizing:border-box;padding:16px;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border-radius:12px;font-size:14px;overflow-wrap:anywhere} [data-energy-options-help] summary, [data-energy-expand]{min-height:44px;box-sizing:border-box;padding:12px;cursor:pointer} [data-energy-compact] dl{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:12px 0} [data-energy-compact] dt{font-size:13px;color:var(--secondary-text-color,#50545b)} [data-energy-compact] dd{margin:0 0 12px;font-weight:600;font-size:18px} [data-energy-expand]{color:var(--primary-text-color,#202124);background:var(--secondary-background-color,#eee);border:1px solid var(--divider-color,#888);border-radius:8px;font:inherit} [data-energy-options-help] summary:focus-visible,[data-energy-expand]:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer{flex:0 0 auto;padding:0;background:transparent;border-radius:0}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]{flex:1 1 100%;width:100%}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer>summary{min-height:44px;padding:12px 8px;font-size:14px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]>p{margin:0 0 8px}`;
  const simpleStyle = `:host{display:block;min-width:0;container-type:inline-size;container-name:energy-simple-card;--energy-simple-cheap:var(--hat-zone-cheap,var(--_hat-zone-cheap,#1baf7a));--energy-simple-expensive:var(--hat-zone-exp,var(--_hat-zone-exp,#2a78d6))}
:host(.bento-dark){--energy-simple-cheap:var(--hat-zone-cheap,#199e70);--energy-simple-expensive:var(--hat-zone-exp,#3987e5)}
[data-energy-simple]{box-sizing:border-box;display:grid;gap:8px;min-width:0;color:var(--primary-text-color);font-size:14px;cursor:pointer}
[data-energy-simple] h2,[data-energy-simple] p{margin:0} [data-energy-simple] h2{font-size:16px;line-height:22px;font-weight:600;min-width:0} [data-energy-name]{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-energy-simple] ha-icon{display:flex;align-items:center;justify-content:center;flex:none;width:36px;height:36px;border-radius:50%;--mdc-icon-size:20px;color:var(--primary-color);background:color-mix(in srgb,currentColor 14%,transparent)}
[data-energy-heading]{display:flex;align-items:center;gap:12px;min-width:0} [data-energy-heading-text]{flex:1;min-width:0}
[data-energy-primary-label]{font-size:12px;line-height:16px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-energy-primary]{font-size:28px;line-height:34px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums} [data-energy-unit]{font-size:14px;line-height:20px;font-weight:400;letter-spacing:normal;color:var(--secondary-text-color)}
[data-energy-simple] button,[data-energy-back]{min-height:44px;min-width:44px;padding:8px 12px;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:14px;cursor:pointer}
[data-energy-simple]:focus-visible,[data-energy-simple] button:focus-visible,[data-energy-back]:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
[data-energy-simple=tile]{height:56px;grid-template-columns:36px minmax(0,1fr);column-gap:12px;row-gap:0;align-items:center;padding:0 8px 0 12px}
[data-energy-report-status][data-energy-simple=tile]{grid-template-columns:36px minmax(0,1fr) auto} [data-energy-simple=tile] [data-energy-heading]{display:contents} [data-energy-simple=tile] h2{font-size:14px;line-height:20px;font-weight:500}
[data-energy-simple=tile] [data-energy-primary]{font-size:12px;line-height:16px;font-weight:400;letter-spacing:normal;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-energy-state-short]{display:none} [data-energy-simple=tile] button{position:relative;height:36px;min-height:36px;min-width:36px;padding:0 10px;border:0;border-radius:999px} [data-energy-simple=tile] button:after{content:'';position:absolute;inset:-4px}
[data-energy-simple=compact]{padding:12px 16px 16px;max-height:248px;overflow:hidden} [data-energy-values]{display:flex;align-items:baseline;gap:8px;min-width:0} [data-energy-cost]{font-size:20px;line-height:26px;font-weight:600;font-variant-numeric:tabular-nums} [data-energy-comparison]{margin-inline-start:auto;max-width:46%;font-size:12px;line-height:16px;text-align:end;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--secondary-text-color)}
[data-energy-report-status] [data-energy-cost]{font-size:12px;line-height:16px;font-weight:400} [data-energy-report-status] [data-energy-comparison]{margin:0;max-width:none;text-align:start} [data-energy-secondary]{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;line-height:16px} [data-energy-zone-wrapper] p{font-size:12px;line-height:16px;margin:0 0 4px}
[data-energy-zonebar]{position:relative;height:28px;overflow:hidden;border:1px solid var(--divider-color);border-radius:4px;background:var(--disabled-color,var(--secondary-background-color))} [data-energy-zonebar] span{position:absolute;bottom:0;box-sizing:border-box;border-inline-end:1px solid var(--ha-card-background,var(--card-background-color))}[data-energy-measurement=unknown]{height:100%;background:transparent!important;border:1px dashed var(--secondary-text-color)}[data-energy-zone-axis]{display:flex;justify-content:space-between;font-size:12px;line-height:16px;color:var(--secondary-text-color)} [data-energy-zone=cheap]{background:var(--energy-simple-cheap)} [data-energy-zone=expensive]{background:var(--energy-simple-expensive)} [data-energy-zone=mixed]{background:var(--info-color,var(--primary-color))} [data-energy-zone=unknown]{background:var(--disabled-color,var(--secondary-background-color))}
[data-energy-zone-legend]{display:flex;gap:12px;flex-wrap:wrap;color:var(--secondary-text-color);font-size:12px;line-height:16px} [data-energy-zone-legend] span:before{content:'';display:inline-block;width:8px;height:8px;margin-inline-end:4px;background:var(--disabled-color)} [data-energy-zone-legend] [data-zone=cheap]:before{background:var(--energy-simple-cheap)} [data-energy-zone-legend] [data-zone=expensive]:before{background:var(--energy-simple-expensive)}`;
  const canOpen = host => {
    const config = host._config || {};
    if (!host.isConnected || host.preview === true || host._hass?.user?.is_active === false || !simple(host)) return false;
    const guard = host._getTariffHostV3().guard, token = guard.snapshot();
    return guard.available(token) && guard.current(token) && (config.tap_target !== 'more-info' || !!host._hass?.states?.[config.entity]);
  };
  const open = host => {
    if (!canOpen(host)) return;
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
    return {percent:c.percent,cutoff:p.end,baseline:c.baseline_kwh};
  };
  const paintZoneBar = (bar, analysis, host, format) => {
    if (!bar) return;
    bar.replaceChildren();
    const unknown = t(host,'Unknown','Brak danych');
    const names = {cheap:t(host,'Cheap','Tania'),expensive:t(host,'Expensive','Droga'),mixed:t(host,'Mixed','Mieszana')};
    const p = analysis?.period, chart = analysis?.chart, window = analysis?.period_summary?.window;
    const start = Date.parse(p?.start), end = Date.parse(p?.calendar_end), observed = Date.parse(p?.end);
    const rows = chart?.bins;
    const note = t(host,'Measured day energy with tariff zones; missing measurements are not zero.','Zmierzona energia doby w strefach taryfy; brak pomiaru nie oznacza zera.');
    const descriptions = [];
    bar.setAttribute('aria-label',`${note} ${unknown}`);
    // Position/width are time geometry only. Never sum bins, quantities or costs.
    if (p?.kind !== 'day' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 48*3600000 ||
        !Number.isFinite(observed) || observed > end || window?.start !== p.start || window?.end !== p.end || window?.timezone !== p.timezone ||
        chart?.timezone !== p.timezone || chart?.status !== 'ready' || chart.coverage_kind !== 'complete_household_hours' || chart.fixed_fee_scope !== 'household_period_only' ||
        !Array.isArray(rows) || rows.length > 48) return;
    const measured = row => row.complete === true && row.expected_seconds === (row.to-row.from)/1000 && row.measured_seconds === row.expected_seconds &&
      (typeof row.kwh === 'number' || typeof row.kwh === 'string' && row.kwh.trim() !== '') && Number.isFinite(Number(row.kwh)) && Number(row.kwh) >= 0 && String(row.recorded_kwh) === String(row.kwh);
    const comparison=analysis.comparisons?.previous,baseline=comparison?.baseline_analysis;
    const previousRows=comparison?.status==='ready' && comparison.reason===null && comparison.comparison_scope==='calendar_totals' &&
      baseline?.schema===2 && baseline.period?.kind==='day' && baseline.period.timezone===p.timezone &&
      baseline.chart?.status==='ready' && baseline.chart.timezone===p.timezone && baseline.chart.coverage_kind==='complete_household_hours' &&
      baseline.chart.fixed_fee_scope==='household_period_only' && Array.isArray(baseline.chart.bins) && baseline.chart.bins.length<=48 ? baseline.chart.bins : [];
    // Geometry shares the largest proven measured hour today/yesterday; no quantities or costs are recomputed.
    const maximum = Math.max(0,...[...rows,...previousRows].filter(measured).map(row=>Number(row.kwh)));
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
      const known = measured(row);
      const label = proven ? names[classification] : unknown;
      const description = `${format.pointLabel(row.start)}–${format.pointLabel(row.end)}: ${known ? format.number(row.kwh,{minimumFractionDigits:1,maximumFractionDigits:1}) + ' kWh' : unknown} · ${label}`;
      const segment = document.createElement('span');
      segment.dataset.energyZone = proven ? classification : 'unknown';
      segment.dataset.energyMeasurement = known ? 'ready' : 'unknown';
      if (known) segment.style.height = `${maximum > 0 ? 100*Number(row.kwh)/maximum : 0}%`;
      segment.style.left = `${100*(row.from-start)/(end-start)}%`;
      segment.style.width = `${100*(row.to-row.from)/(end-start)}%`;
      segment.title = description; segment.setAttribute('aria-hidden','true');
      bar.append(segment); descriptions.push(description);
    }
    bar.setAttribute('aria-label',[note,...descriptions,observed < end ? t(host,'Remaining time: Unknown','Pozostały czas: brak danych') : ''].filter(Boolean).join(' '));
  };
  const compactActionsStyle = '[data-energy-simple=compact] [data-energy-actions]{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}[data-energy-simple=compact] [data-energy-actions] button{flex:1 1 120px;min-width:0}';
  const reportStatusStyle = '[data-energy-report-status][data-energy-simple=compact] [data-energy-primary]{font-size:14px;line-height:20px}';
  const narrowSimpleStyle = `@container energy-simple-card (max-width:279px){
    [data-energy-state-long]{display:none} [data-energy-state-short]{display:inline}
  }
  @container energy-simple-card (max-width:219px){
    [data-energy-simple=tile] button{display:none}
  }
  @container energy-simple-card (max-width:320px){
    [data-energy-values]{flex-wrap:wrap} [data-energy-comparison]{max-width:100%;flex-basis:100%;text-align:start;margin-inline-start:0}
    [data-energy-report-status][data-energy-simple=compact]{padding:6px;gap:2px}
    [data-energy-report-status] [data-energy-actions]{flex-wrap:nowrap}
    [data-energy-report-status] [data-energy-actions] button{flex:1 1 0;min-width:44px;padding-inline:4px}
  }`;

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
    const tariffTile = !email && mode === 'tile';
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
    // Display bounds preserve a nonzero producer reading that rounds below the visible unit.
    const brief = (value,places) => {
      const options={minimumFractionDigits:places,maximumFractionDigits:places},shown=format.number(value,options),raw=String(value).trim();
      return /[1-9]/.test(raw.split(/[eE]/)[0]) && shown.replace(/^[-+−]/,'')===format.number('0',options)
        ? (raw.startsWith('-')?'>−':'<')+format.number('0.'+'0'.repeat(places-1)+'1',options) : shown;
    };
    const energy = total?.measurement_complete !== false && numeric(total?.kwh) ? `${brief(total.kwh,1)} kWh` : unknown;
    const native = !analysis?.active_tariff_id && analysis?.native_pricing?.source === 'ha_energy' && analysis?.native_pricing?.schema === 1 ? analysis.native_pricing.period_cost : null;
    const nativeReady = native?.status === 'ready' && native.coverage?.complete === true && numeric(native.amount) && /^[A-Z]{3}$/.test(native.currency || '');
    const bookReady = total?.pricing_complete === true && numeric(total.usage_cost) && /^[A-Z]{3}$/.test(total.currency || '');
    const money = total?.pricing_complete === true && numeric(total.usage_cost) && /^[A-Z]{3}$/.test(total.currency || '')
      ? `${brief(total.usage_cost,2)} ${total.currency}` : nativeReady ? `${brief(native.amount,2)} ${native.currency}` : unknown;
    const difference = elapsed ? `${format.number(elapsed.percent,{maximumFractionDigits:1,signDisplay:'exceptZero'})}%` : unknown;
    const comparisonName = elapsed ? `${t(host,'vs yesterday through','vs wczoraj do')} ${format.clock(elapsed.cutoff)}` : t(host,'Yesterday at same hour','Wczoraj o tej samej godzinie');
    const zones = {cheap:t(host,'Cheap','Tania'),expensive:t(host,'Expensive','Droga'),mixed:t(host,'Mixed','Mieszana')};
    const zone = snapshot?.status !== 'unavailable' && snapshot?.current?.available === true ? zones[snapshot.current.zone_class] || unknown : unknown;
    const next = snapshot?.status !== 'unavailable' ? snapshot?.next_cheap : null;
    const nextKnown = next?.status === 'known' && typeof next.start === 'string' && Number.isFinite(Date.parse(next.start));
    const nextLabel = nextKnown
      ? format.pointLabel(next.start) || unknown : next?.status === 'not_found_in_horizon' ? t(host,'None in next 8 days','Brak w kolejnych 8 dniach') : unknown;
    let section = root.querySelector(`[data-energy-simple="${mode}"]`);
    if (!section) {
      host._analysisHostV53?.stop(); host._optionsResizeV5?.disconnect();
      host._featureAccessV53?.stop(); host._reportHostV53?.stop();
      host._timers?.forEach(timer => clearTimeout(timer)); host._timers?.clear(); host._renderScheduled = false;
      root.innerHTML = `<style>${host._getTariffHostV3().ui().css}${simpleStyle}${email ? compactActionsStyle + reportStatusStyle : ''}${narrowSimpleStyle}</style><ha-card data-energy-simple="${mode}" role="button" tabindex="0"${!email ? ' data-energy-open' : ''}><div data-energy-heading><ha-icon aria-hidden="true"></ha-icon><div data-energy-heading-text><h2><span data-energy-name></span></h2>${mode === 'compact' ? '<p data-energy-primary-label></p>' : '<div data-energy-primary role="status"></div>'}</div></div>${mode === 'compact' ? email ? '<div data-energy-primary role="status"></div><div data-energy-secondary><span data-energy-cost></span><span data-energy-comparison></span></div>' : '<div data-energy-values><div data-energy-primary role="status"></div><span data-energy-cost></span><span data-energy-comparison></span></div><div data-energy-zone-wrapper><p data-energy-zone-caption></p><div data-energy-zonebar role="img"></div><div data-energy-zone-axis></div><div data-energy-zone-legend></div></div>' : ''}${email ? mode === 'compact' ? '<div data-energy-actions><button type="button" data-energy-open></button></div>' : '<button type="button" data-energy-open></button>' : ''}</ha-card>`;
      section = root.querySelector('[data-energy-simple]');
      section.addEventListener('click', event => {
        if (event.target.closest?.('button,a,input,select,textarea')) return;
        open(host);
      });
      section.addEventListener('keydown', event => {
        if (event.target !== section || !['Enter',' '].includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat) open(host);
      });
      const openButton = section.querySelector('[data-energy-open]');
      openButton?.addEventListener('click', () => open(host));
      openButton?.addEventListener('keydown', event => {
        if (['Enter',' '].includes(event.key) && !event.repeat) { event.preventDefault(); event.currentTarget.click(); }
      });
    }
    if (email) section.dataset.energyReportStatus = '';
    if (tariffTile) section.dataset.energyTariffTile = '';
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
    icon.setAttribute('icon', email ? 'mdi:email-fast-outline' : 'mdi:lightning-bolt');
    const tone = snapshot?.status !== 'unavailable' && snapshot?.current?.available === true ? snapshot.current.zone_class : null;
    icon.style.color = {cheap:'var(--energy-simple-cheap)',expensive:'var(--energy-simple-expensive)',mixed:'var(--warning-color,var(--primary-color))'}[tone] || 'var(--primary-color)';
    const surfaceName = config.title && config.title !== title ? config.title : email ? t(host,'Energy report','Raport energii') : mode === 'compact' ? t(host,'Energy today','Energia dziś') : t(host,'Energy','Energia');
    section.querySelector('[data-energy-name]').textContent = surfaceName;
    section.querySelector('[data-energy-name]').title = surfaceName;
    const primary = section.querySelector('[data-energy-primary]');
    const shortReport = report?.schedule_state === 'enabled' && report.next_report_at ? `${format.date(report.next_report_at,true)} · ${format.clock(report.next_report_at)}` : unknown;
    if (mode === 'tile') {
      let long = primary.querySelector('[data-energy-state-long]'), short = primary.querySelector('[data-energy-state-short]');
      if (!long || !short) {
        long = document.createElement('span'); long.dataset.energyStateLong = '';
        short = document.createElement('span'); short.dataset.energyStateShort = '';
        primary.replaceChildren(long,short);
      }
      const nextShort = nextKnown ? `${t(host,'Cheap from','Tania od')} ${format.clock(next.start) || unknown}` : nextLabel;
      long.textContent = email ? shortReport : `${zone} · ${nextShort}`;
      short.textContent = email ? shortReport : nextKnown ? `${zone} · ${format.clock(next.start) || unknown}` : `${zone} · ${nextLabel}`;
    } else if (email) primary.textContent = nextReport;
    else {
      primary.replaceChildren(document.createTextNode(total?.measurement_complete !== false && numeric(total?.kwh) ? brief(total.kwh,1) + ' ' : unknown));
      if (energy !== unknown) { const unit = document.createElement('span'); unit.dataset.energyUnit = ''; unit.textContent = 'kWh'; primary.append(unit); }
    }
    primary.title = email ? `${t(host,'Scheduled report','Zaplanowany raport')}: ${nextReport}` : mode === 'tile' ? `${zone} · ${nextKnown ? t(host,'Cheap from','Tania od') + ' ' : ''}${nextLabel}` : primary.textContent;
    primary.setAttribute('aria-label',primary.title);
    if (mode === 'compact') {
      const primaryLabel=section.querySelector('[data-energy-primary-label]');
      const activeTariff=analysis?.active_tariff_id ? analysis.alternatives?.find(row=>row.tariff_id===analysis.active_tariff_id)?.tariff_name : null;
      const tariffLabel=typeof activeTariff==='string' && activeTariff.trim() ? activeTariff : unknown;
      primaryLabel.textContent = email ? t(host,'Scheduled report','Zaplanowany raport') : analysis?.period?.end ? `${t(host,'Through','Do')} ${format.clock(analysis.period.end) || unknown} · ${nativeReady?t(host,'Home Assistant Energy','Home Assistant Energy'):t(host,'Tariff','Taryfa')+' '+tariffLabel}` : unknown;
      primaryLabel.title=primaryLabel.textContent;
      section.querySelector('[data-energy-cost]').textContent = email ? `${t(host,'Last attempt','Ostatnia próba')}: ${lastAttempt}` : money;
      const costLine = section.querySelector('[data-energy-cost]');
      if (!email && money !== unknown) {
        const currency = bookReady ? total.currency : native.currency;
        costLine.replaceChildren(document.createTextNode(money.slice(0,-currency.length)));
        const unit = document.createElement('span'); unit.dataset.energyUnit = ''; unit.textContent = currency; costLine.append(unit);
      }
      costLine.title = !email && !bookReady && nativeReady ? `${t(host,'Cost recorded in HA','Koszt zapisany w HA')}: ${costLine.textContent}. ${t(host,'Source: Home Assistant Energy. Cost breakdown and fixed fees are unknown; this is not a complete bill.','Źródło: Home Assistant Energy. Rozbicie kosztu i opłaty stałe są nieznane; to nie jest pełny rachunek.')}` : email ? costLine.textContent : `${t(host,'Usage cost','Koszt zużycia')}: ${money}`;
      costLine.setAttribute('aria-label',costLine.title);
      section.querySelector('[data-energy-comparison]').textContent = email ? `${t(host,'Result','Wynik')}: ${result} · ${t(host,'Recipients of that attempt','Odbiorcy tej próby')}: ${recipients}` : elapsed ? `${difference} ${comparisonName}${numeric(elapsed.baseline) ? ` (${brief(elapsed.baseline,1)} kWh)` : ''}` : `${comparisonName}: ${difference}`;
      const caption = section.querySelector('[data-energy-zone-caption]');
      if (caption) caption.textContent = t(host,'Measured day energy','Zmierzona energia w ciągu dnia');
      paintZoneBar(section.querySelector('[data-energy-zonebar]'),analysis,host,format);
      const comparison = section.querySelector('[data-energy-comparison]');
      comparison.title = comparison.textContent;
      const axis = section.querySelector('[data-energy-zone-axis]');
      if (axis) {
        axis.replaceChildren();
        const start = Date.parse(analysis?.period?.start), end = Date.parse(analysis?.period?.calendar_end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) for (const instant of [start,start+(end-start)/2,end]) {
          const point = document.createElement('span'); point.textContent = format.clock(new Date(instant).toISOString()) || unknown; axis.append(point);
        }
      }
      const legend = section.querySelector('[data-energy-zone-legend]');
      if (legend) {
        legend.replaceChildren();
        for (const [zone,label] of [['cheap',t(host,'Cheap','Tania')],['expensive',t(host,'Expensive','Droga')],['unknown',unknown]]) {
          const item = document.createElement('span'); item.dataset.zone = zone; item.textContent = label; legend.append(item);
        }
      }
    }
    const available = canOpen(host);
    section.setAttribute('aria-disabled',String(!available));
    section.tabIndex = available ? 0 : -1;
    section.setAttribute('aria-label',[surfaceName,primary.title,section.querySelector('[data-energy-cost]')?.getAttribute('aria-label'),section.querySelector('[data-energy-comparison]')?.textContent].filter(Boolean).join('. '));
    const button = section.querySelector('[data-energy-open]');
    if (button) {
      button.textContent = mode === 'tile' ? '✉' : t(host,'Open','Otwórz');
      button.setAttribute('aria-label',`${t(host,'Open','Otwórz')} ${surfaceName}`);
      button.disabled = !available;
    }
  };
  // Simple surfaces do not run the full cards' discovery/config/schedule paths.
  Card.prototype._applyThemeV150 = function() { this._getTariffHostV3().ui().applyTheme(this); };
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
    } finally { this._syncDashboardPlacementV53(); this._applyThemeV150(); }
  }});
  const connected = Card.prototype.connectedCallback;
  Card.prototype.connectedCallback = function() {
    try {
      if (!simple(this) && this.preview !== true) return connected?.call(this);
      this._tariffHostController?.guard.resume(); this._render();
    } finally { this._syncDashboardPlacementV53(); this._applyThemeV150(); }
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
    const statisticsMount = this._energyStatisticsMountV110;
    if (statisticsMount?.isConnected && statisticsMount.querySelector('dialog[open]')) {
      this._energyStatisticsV110.update();
      if (statisticsMount.querySelector('dialog[open]')) return;
    }
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
    } finally { this._syncDashboardPlacementV53(); this._applyThemeV150(); }
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
      fields.innerHTML = `<style>label[data-option-row]{display:flex;align-items:center;gap:8px;min-height:44px}select,input[type=number],input[type=search]{min-height:44px;box-sizing:border-box;width:100%;font:inherit;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#888);border-radius:8px;padding:8px}fieldset{margin:12px 0;border:1px solid var(--divider-color,#888)}[data-option-row] input{width:24px;height:24px;min-height:24px;margin:0}select:focus-visible,input:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}[data-config-error]{color:var(--energy-value-red,#b91c1c)}</style><label data-option-label="variant" for="cf_variant"></label><select id="cf_variant" data-config="variant"><option value="" data-variant-label="legacy"></option><option value="tile" data-variant-label="tile"></option><option value="compact" data-variant-label="compact"></option><option value="full" data-variant-label="full"></option></select><label data-option-label="tap_target" for="cf_tap_target"></label><select id="cf_tap_target" data-config="tap_target"><option value="full" data-target-label="full"></option><option value="energy" data-target-label="energy"></option><option value="more-info" data-target-label="more-info"></option></select><div data-entity-chooser><label data-option-label="entity_search" for="cf_entity_search"></label><input id="cf_entity_search" type="search" data-entity-search><label data-option-label="entity" for="cf_entity"></label><select id="cf_entity" data-config="entity"></select><p data-entity-hint></p></div><label data-option-label="default_tab" for="cf_default_tab"></label><select id="cf_default_tab" data-config="default_tab">${tabs.map(id=>`<option value="${id}"></option>`).join('')}</select><fieldset><legend data-option-label="tabs"></legend>${tabs.map(id=>`<label data-option-row><input type="checkbox" data-tab-option="${id}"><span data-tab-label="${id}"></span></label>`).join('')}</fieldset><label data-option-label="period_default" for="cf_period_default"></label><select id="cf_period_default" data-config="period_default">${['day','week','month','year'].map(v=>`<option value="${v}">${v}</option>`).join('')}</select>${['show_alternatives','compact','show_help','show_support'].map(id=>`<label data-option-row><input type="checkbox" data-config="${id}"><span data-option-label="${id}"></span></label>`).join('')}<label data-option-label="chart_hours" for="cf_chart_hours"></label><input id="cf_chart_hours" type="number" min="1" max="744" step="1" data-config="chart_hours"><p data-config-error role="alert"></p>`;
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
    const names = {period_default:t(this,'Default period','Domyślny okres'),show_alternatives:t(this,'Show tariff comparison','Pokaż porównanie taryf'),entity:t(this,'Existing entity for details','Istniejąca encja do szczegółów'),entity_search:t(this,'Find entity','Znajdź encję'),variant:t(this,'Variant','Wariant'),tap_target:t(this,'Open destination','Cel otwarcia'),default_tab:t(this,'Default tab','Domyślna zakładka'),tabs:t(this,'Visible tabs','Widoczne zakładki'),compact:t(this,'Compact view','Widok kompaktowy'),show_help:t(this,'Show help','Pokaż pomoc'),show_support:t(this,'Show project support','Pokaż wsparcie projektu'),chart_hours:t(this,'Hourly chart range (1–744 hours; empty = full range)','Zakres wykresów godzinowych (1–744 godz.; puste = cały zakres)')};
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
    for(const field of fields.querySelectorAll('[data-config]')) {const option=field.dataset.config;field.setAttribute('aria-label',names[option]);if(option==='compact')field.disabled=!!this._config.variant;if(field.type==='checkbox')field.checked=option==='compact'?this._config[option]===true:this._config[option]!==false;else if(option!=='entity'&&root.activeElement!==field)field.value=this._config[option]??(option==='period_default'?'day':option==='default_tab'?visible(this._config)[0]:option==='tap_target'?'full':'');}
  };
}
// HA_ENERGY_CARD_OPTIONS_V5_END
createEnergyCardOptionsV5({ Card: HaEnergyOptimizer, Editor: HaEnergyOptimizerEditor, name: "ha-energy-optimizer", title: "Energy Optimizer", tabs: ["dashboard", "patterns", "recommendations", "compare"], labels: [["Overview", "Patterns", "Tariff costs", "Compare"], ["Przegląd", "Wzorce", "Koszty taryfy", "Porównanie"]] });
installEnergyBuild1HostV53({Card:HaEnergyOptimizer,name:"ha-energy-optimizer",format:createFormatUi});
if (!customElements.get('ha-energy-optimizer-editor')) customElements.define('ha-energy-optimizer-editor', HaEnergyOptimizerEditor);
if (!customElements.get('ha-energy-optimizer')) { customElements.define('ha-energy-optimizer', HaEnergyOptimizer); }
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'ha-energy-optimizer')) { window.customCards.push({ type: 'ha-energy-optimizer', name: 'Energy Optimizer', description: 'Optimize energy usage, schedules and costs for Home Assistant', preview: false }); }

