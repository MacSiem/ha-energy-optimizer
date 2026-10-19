// --- Bundled card: ha-energy-email (v3.3.0 bundle)
(function() {
  'use strict';

  // Component-local XSS protection: never reads from or publishes a global helper.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

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

  // Component-local persistence retains this card's existing localStorage keys.
  const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-email] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

// BEGIN vendored ha-tools-email-history factory
// Pure ES-module factory. Vendor this function inside each consumer's own IIFE.
// Neither the controller nor renderer sends, saves, retries, or reads on open.
function createHaToolsEmailHistory({ escape = value => String(value == null ? '' : value).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]), clock = () => Date.now(),
  setTimer = setTimeout, clearTimer = clearTimeout, changed = () => {} } = {}) {
  const kinds = new Set(['manual', 'test', 'log_digest', 'energy_report']);
  const cadences = new Set(['daily', 'weekly', 'monthly']);
  const outcomes = new Set(['accepted_by_smtp', 'preparation_failed', 'authentication_failed',
    'recipients_refused', 'partial_acceptance', 'tls_failed', 'transport_outcome_unknown',
    'send_failed', 'cancelled_outcome_unknown', 'outcome_unknown']);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const periodPattern = /^(daily:\d{4}-\d{2}-\d{2}|weekly:\d{4}-W\d{2}|monthly:\d{4}-\d{2})$/;
  let epoch = 0, context = null, pending = null, cancelPending = null;
  const empty = status => ({ status, attempts: [], limit: 128, retentionDays: 90, observedAt: null });
  const controller = { state: empty('idle'), timeoutMs: 10000 };
  const publish = state => { controller.state = state; changed(); };
  controller.discard = () => {
    epoch++;
    if (cancelPending) cancelPending();
    cancelPending = null; pending = null;
    publish(empty('idle'));
  };
  controller.setContext = hass => {
    const next = { admin: hass?.user?.is_admin === true,
      user: hass?.user?.id ?? hass?.user, connection: hass?.connection ?? null,
      online: !!hass && hass.connected !== false && hass.connection?.connected !== false,
      timezone: typeof hass?.config?.time_zone === 'string' ? hass.config.time_zone : null };
    if (context && (context.admin !== next.admin || context.user !== next.user ||
      context.connection !== next.connection || context.online !== next.online)) controller.discard();
    context = next;
    return next.admin && next.online;
  };
  function decode(value) {
    if (!value || value.schema !== 1 || value.limit !== 128 || value.retention_days !== 90 ||
      !Array.isArray(value.attempts)) return empty('unconfirmed');
    const now = clock(), cutoff = now - 90 * 86400000, seen = new Set(), rows = [];
    let partial = value.attempts.length > 128;
    for (const raw of value.attempts.slice(0, 128)) {
      const stamp = typeof raw?.timestamp === 'string' && raw.timestamp.length <= 64 &&
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(raw.timestamp) ? Date.parse(raw.timestamp) : NaN;
      if (!raw || typeof raw.id !== 'string' || !uuid.test(raw.id) ||
        !Number.isFinite(stamp) || stamp < cutoff || stamp > now || seen.has(raw.id.toLowerCase())) {
        partial = true; continue;
      }
      seen.add(raw.id.toLowerCase());
      const source = ['manual', 'schedule', 'unknown'].includes(raw.source) ? raw.source : 'unknown';
      const kind = kinds.has(raw.kind) ? raw.kind : null;
      const cadence = cadences.has(raw.cadence) ? raw.cadence : null;
      const period = typeof raw.period === 'string' && periodPattern.test(raw.period) ? raw.period : null;
      const scheduleRef = typeof raw.schedule_ref === 'string' && /^[0-9a-f]{64}$/.test(raw.schedule_ref) ? raw.schedule_ref : null;
      const recipientCount = Number.isInteger(raw.recipient_count) && raw.recipient_count >= 0 && raw.recipient_count <= 100000 ? raw.recipient_count : null;
      const outcome = outcomes.has(raw.outcome) ? raw.outcome : 'outcome_unknown';
      if (source !== raw.source || kind !== raw.kind || cadence !== raw.cadence || period !== raw.period ||
        scheduleRef !== raw.schedule_ref || recipientCount !== raw.recipient_count || outcome !== raw.outcome) partial = true;
      rows.push({ id: raw.id, timestamp: raw.timestamp, source, kind, cadence, period,
        schedule_ref: scheduleRef, recipient_count: recipientCount, outcome });
    }
    return { ...empty(partial ? 'partial' : 'ready'), attempts: rows, observedAt: new Date(now).toISOString() };
  }
  controller.refresh = hass => {
    if (!controller.setContext(hass)) return Promise.resolve(controller.state);
    if (pending) return pending;
    const token = ++epoch;
    publish(empty('loading'));
    let timer;
    const invalidated = new Promise(resolve => { cancelPending = () => resolve({ stale: true }); });
    const deadline = new Promise(resolve => { timer = setTimer(() => resolve({ timeout: true }), controller.timeoutMs); });
    const read = Promise.resolve().then(() => {
      if (token !== epoch) return { stale: true };
      return hass.callWS({ type: 'ha_tools_email/get_attempt_history' });
    }).then(value => ({ value }), () => ({ failed: true }));
    pending = Promise.race([read, deadline, invalidated]).then(result => {
      clearTimer(timer);
      if (token !== epoch) return controller.state;
      pending = null; cancelPending = null;
      if (result.stale) return controller.state;
      publish(result.timeout ? empty('unconfirmed') : result.failed ? empty('error') : decode(result.value));
      // The request epoch changes after the timeout; late results have no side effects.
      epoch++;
      return controller.state;
    });
    return pending;
  };
  controller.render = (language = 'en') => {
    const pl = language === 'pl', state = controller.state;
    let timezone = context?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
    catch (_) { timezone = 'UTC'; }
    const labels = pl ? ['Data', 'Źródło', 'Rodzaj', 'Częstotliwość', 'Okres', 'Odbiorcy (liczba)', 'Wynik'] :
      ['Date', 'Source', 'Kind', 'Cadence', 'Period', 'Recipient count', 'Outcome'];
    const text = {
      idle: pl ? 'Nie sprawdzono. Odśwież, aby odczytać historię serwera.' : 'Not checked. Refresh to read server history.',
      loading: pl ? 'Wczytywanie historii serwera…' : 'Loading server history…',
      error: pl ? 'Historia niedostępna. Możesz ponownie odczytać dane.' : 'History unavailable. You can read the data again.',
      unconfirmed: pl ? 'Odczyt niepotwierdzony. Nie pokazujemy wcześniejszych wierszy.' : 'Read unconfirmed. Previous rows are not shown.',
      partial: pl ? 'Częściowy odczyt: pokazano wyłącznie poprawne metadane.' : 'Partial read: only valid metadata is shown.',
      ready: state.attempts.length ? (pl ? 'Odczytano zachowaną historię.' : 'Retained history read.') :
        (pl ? 'Brak zachowanych prób wysyłki.' : 'No retained send attempts.')
    };
    const date = stamp => {
      const dt = new Date(stamp);
      return `${dt.toLocaleString(pl ? 'pl-PL' : 'en-US', { timeZone: timezone })} (${stamp})`;
    };
    const range = state.attempts.map(row => row.timestamp).sort((a, b) => Date.parse(a) - Date.parse(b));
    const outcomeLabels = pl ? {
      accepted_by_smtp: 'Przyjęte przez serwer SMTP', preparation_failed: 'Błąd przygotowania',
      authentication_failed: 'Błąd uwierzytelnienia', recipients_refused: 'Odbiorcy odrzuceni',
      partial_acceptance: 'Częściowe przyjęcie przez SMTP', tls_failed: 'Błąd TLS',
      transport_outcome_unknown: 'Nieznany wynik transportu', send_failed: 'Błąd wysyłania',
      cancelled_outcome_unknown: 'Przerwano; wynik nieznany', outcome_unknown: 'Wynik nieznany'
    } : {
      accepted_by_smtp: 'Accepted by SMTP server', preparation_failed: 'Preparation failed',
      authentication_failed: 'Authentication failed', recipients_refused: 'Recipients refused',
      partial_acceptance: 'Partial SMTP acceptance', tls_failed: 'TLS failed',
      transport_outcome_unknown: 'Transport outcome unknown', send_failed: 'Send failed',
      cancelled_outcome_unknown: 'Cancelled; outcome unknown', outcome_unknown: 'Outcome unknown'
    };
    const sourceLabels = pl ? { manual: 'Ręcznie', schedule: 'Harmonogram', unknown: 'Nieznane' } :
      { manual: 'Manual', schedule: 'Scheduled', unknown: 'Unknown' };
    const kindLabels = pl ? { manual: 'Wiadomość', test: 'Test', log_digest: 'Raport dziennika', energy_report: 'Raport energii' } :
      { manual: 'Message', test: 'Test', log_digest: 'Log digest', energy_report: 'Energy report' };
    const cadenceLabels = pl ? { daily: 'Codziennie', weekly: 'Co tydzień', monthly: 'Co miesiąc' } :
      { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };
    const periodLabel = value => {
      if (value === null) return '—';
      const [cadence, key] = value.split(':');
      const prefix = pl ? { daily: 'Dzień', weekly: 'Tydzień', monthly: 'Miesiąc' } :
        { daily: 'Day', weekly: 'Week', monthly: 'Month' };
      return `${prefix[cadence]} ${key}`;
    };
    const rows = state.attempts.map(row => [date(row.timestamp), sourceLabels[row.source], kindLabels[row.kind] ?? '—', cadenceLabels[row.cadence] ?? '—',
      periodLabel(row.period), row.recipient_count ?? '—', outcomeLabels[row.outcome]]);
    return `<section class="attempt-history" aria-label="${pl ? 'Historia prób SMTP' : 'SMTP attempt history'}">
      <h3>${pl ? 'Serwerowa historia prób wysyłki' : 'Server send attempt history'}</h3>
      <p>${pl ? 'Metadane prób z serwera Home Assistant. Przyjęcie przez SMTP nie potwierdza dostarczenia. Wyniki nieznane i częściowe nie uruchamiają ponownej wysyłki.' :
        'Attempt metadata from your Home Assistant server. SMTP acceptance does not confirm delivery. Unknown and partial outcomes do not trigger another send.'}</p>
      <p>${pl ? 'Strefa czasu widoku' : 'Display timezone'}: ${escape(timezone)}.</p>
      <p>${pl ? 'Maksymalnie 128 prób / 90 dni. To zachowany zakres, nie pełna historia.' : 'At most 128 attempts / 90 days. This is the retained range, not a complete history.'}</p>
      <p>${pl ? 'Odczytano o' : 'Read at'}: ${state.observedAt ? escape(date(state.observedAt)) : '—'}. ${pl ? 'Zakres dotyczy chwili odczytu.' : 'The range describes the time of this read.'}</p>
      <p>${pl ? 'Najstarsza' : 'Oldest'}: ${range.length ? escape(date(range[0])) : '—'} · ${pl ? 'Najnowsza' : 'Newest'}: ${range.length ? escape(date(range[range.length - 1])) : '—'}</p>
      <div class="history-actions"><button type="button" id="history-refresh" ${state.status === 'loading' ? 'aria-busy="true"' : ''}>${pl ? 'Odśwież historię' : 'Refresh history'}</button>
      <button type="button" id="history-discard">${pl ? 'Odrzuć odczyt' : 'Discard read'}</button></div>
      <p role="status" aria-live="polite">${text[state.status]}</p>
      ${rows.length ? `<table class="history-records" role="table"><caption>${pl ? 'Zachowane metadane prób' : 'Retained attempt metadata'}</caption><thead role="rowgroup"><tr role="row">${labels.map(label => `<th scope="col" role="columnheader">${label}</th>`).join('')}</tr></thead>
        <tbody role="rowgroup">${rows.map((cells, index) => {
          const row = state.attempts[index];
          return `<tr role="row" data-attempt-id="${escape(row.id)}" data-source="${escape(row.source)}" data-kind="${escape(row.kind ?? '')}" data-cadence="${escape(row.cadence ?? '')}" data-period="${escape(row.period ?? '')}" data-outcome="${escape(row.outcome)}">${cells.map((cell, i) => `<td role="cell" data-label="${labels[i]}">${escape(cell)}</td>`).join('')}</tr>`;
        }).join('')}</tbody></table>` : ''}
    </section>`;
  };
  return controller;
}
// END vendored ha-tools-email-history factory

// BEGIN vendored ha-tools-email-schedules factory
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
  const editable = ['id', 'kind', 'cadence', 'time', 'enabled', 'timezone', 'weekday', 'month_day'];
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
    Object.prototype.hasOwnProperty.call(expected, key) ? actual[key] === expected[key] : key !== 'timezone' || actual[key] === undefined) &&
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
        for (const key of editable.filter(key => !['id', 'kind'].includes(key))) if (Object.prototype.hasOwnProperty.call(raw, key)) clean[key] = raw[key];
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
      draft = { ...row, timezone: row.timezone || '', weekday: row.weekday ?? 0, month_day: row.month_day ?? 1 };
      preview = null; previewStatus = { state: 'not_checked', reason: 'initial' }; notify();
    },
    create() {
      if (!allowed() || !calendarCompatible || reading || writing || pendingExpected || !['success', 'no_data'].includes(status.state)) return;
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
        timezone: '', weekday: 0, month_day: 1 };
      preview = null; previewStatus = { state: 'not_checked', reason: 'initial' }; notify();
    },
    update(key, value) {
      if (!allowed() || !draft || writing || pendingExpected || !editable.includes(key) || ['id', 'kind'].includes(key)) return;
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
    model() { return { rows: rows.map(row => ({ ...row })), draft: draft ? { ...draft } : null, status: { ...status },
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
// END vendored ha-tools-email-schedules factory

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
  // HA_ENERGY_REPORT_V53_START
'use strict';
// One read lane across identities. Invalidating a view does not cancel a wire.
function createEnergyReportV53({card, format}) {
  let root=null, identity=null, session=0, revision=0, intent=0, active=false;
  let ack=null, unsubscribe=null, raw=null, pending=null, capabilities=null, report=null;
  let status='idle', legacy=false, watched=null, offline=false, focusHint=null;
  let selection={period:'day',comparison:'previous'};
  const urls=new Set();
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const preferences=()=>{
    const ui=format.forHass(card._hass);
    return {key:ui.key,language:String(ui.language).startsWith('pl')?'pl':'en',date_language:String(ui.dateLanguage).startsWith('pl')?'pl':'en',timezone:ui.timeZone,
      hour_cycle:['h11','h12'].includes(ui.hourCycle)?'12':'24'};
  };
  const context=()=>{
    const h=card._hass,p=preferences();
    return [h?.connection,h?.user?.id,h?.user?.is_active,h?.user?.is_admin,h?.config?.time_zone,
      h?.connected,h?.connection?.connected,card.isConnected,offline,p.key,p.language,p.timezone,p.hour_cycle,
      JSON.stringify(h?.locale||{})];
  };
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const available=()=>card.isConnected && !!card._hass?.user?.id && card._hass?.user?.is_active!==false &&
    card._hass?.connected!==false && card._hass?.connection?.connected!==false && !offline;
  const mounted=()=>active&&root?.isConnected&&card._activeTab==='preview';
  const current=(s,r)=>mounted()&&s===session&&(r===undefined||r===revision)&&same(identity,context())&&available();
  const text=(en,pl)=>preferences().language==='pl'?pl:en;
  function purge(){const focused=root?.getRootNode()?.activeElement?.dataset?.energyReport;if(['period','comparison','anchor','read'].includes(focused))focusHint=focused;report=null;card._mailPreview?.clearPreview();card._backendReportPreviews=null;for(const url of urls)URL.revokeObjectURL(url);urls.clear();root?.replaceChildren();}
  function cancel(){
    session++;revision++;intent++;active=false;ack=null;pending=null;capabilities=null;legacy=false;status='idle';purge();
    if(unsubscribe){const dispose=unsubscribe;unsubscribe=null;try{dispose();}catch(_) {}}
    // raw remains occupied until the actual underlying request settles.
  }
  function unwatch(){
    if(!watched)return;
    watched.removeEventListener?.('disconnected',disconnected);watched.removeEventListener?.('ready',ready);
    window.removeEventListener('offline',disconnected);window.removeEventListener('online',ready);watched=null;
  }
  function disconnected(){offline=true;observe();paint();}
  function ready(){offline=false;const target=root;observe();if(target?.isConnected)mount(target);}
  function watch(){
    const connection=card._hass?.connection;if(watched===connection)return;
    unwatch();offline=false;watched=connection;
    connection?.addEventListener?.('disconnected',disconnected);connection?.addEventListener?.('ready',ready);
    window.addEventListener('offline',disconnected);window.addEventListener('online',ready);
  }
  function observe(){
    const next=context(),contextChanged=!same(identity,next);
    if(contextChanged){cancel();identity=next;}
    return {...state(),contextChanged};
  }
  function fallback(error){
    if(error?.code==='unknown_command'&&card._hass?.user?.is_admin===true&&available()){
      purge();capabilities=null;pending=null;legacy=true;status='legacy';paint();return true;
    }
    return false;
  }
  function queue(kind,request=null){pending={kind,request,session,revision,intent};pump();}
  function pump(){
    if(raw||!pending)return;
    const task=pending;pending=null;
    if(!current(task.session,task.revision)||legacy)return;
    const source=card._hass;
    const token={task};raw=token;
    Promise.resolve().then(()=>{
      if(!current(task.session,task.revision)||legacy)return null;
      return source.callWS(task.kind==='caps'?{type:'ha_tools_email/feature_capabilities'}:task.request);
    }).then(result=>{
      if(!current(task.session,task.revision)||legacy)return;
      if(task.kind==='caps'){
        const c=result?.capabilities?.energy_reports;
        if(result?.status!=='ready'||!c||['visible','read','execute'].some(k=>typeof c[k]!=='boolean'))throw Error('invalid_capabilities');
        capabilities={visible:c.visible,read:c.read,execute:c.execute};status=c.visible&&c.read?'idle':'denied';paint();
      } else {
        if(task.intent!==intent)return;
        const p=task.request;
        if(!capabilities?.visible||!capabilities?.read||!result||typeof result.snapshot_id!=='string'||!result.snapshot_id||
          ['html','text','csv'].some(k=>typeof result[k]!=='string')||result.context?.access_purpose!=='report_read'||
          result.period?.kind!==p.period||result.display?.language!==p.language||result.display?.date_language!==p.date_language||result.display?.timezone!==p.timezone||result.display?.hour_cycle!==p.hour_cycle)throw Error('invalid_report');
        report={snapshot_id:result.snapshot_id,html:result.html,text:result.text,csv:result.csv};status='ready';paint();
      }
    }).catch(error=>{
      if(!current(task.session,task.revision)||task.kind==='report'&&task.intent!==intent)return;
      if(!fallback(error)){purge();if(task.kind==='caps'||error?.code==='unauthorized')capabilities=null;status=error?.code==='unauthorized'?'denied':'error';paint();}
    }).finally(()=>{if(raw===token)raw=null;pump();});
  }
  function signal(){
    if(!mounted())return;
    revision++;intent++;pending=null;capabilities=null;legacy=false;status='loading';purge();paint();queue('caps');
  }
  function start(){
    if(active)return;
    if(!available()){status='error';return;}
    active=true;identity=context();status='loading';const s=session;
    const connection=card._hass.connection;
    if(typeof connection?.subscribeMessage!=='function'){status='error';paint();return;}
    ack=Promise.resolve().then(()=>{
      if(!current(s))return null;
      return connection.subscribeMessage(()=>{if(current(s)&&unsubscribe)signal();},{type:'ha_tools_email/subscribe_analysis_updates'});
    }).then(dispose=>{
      if(typeof dispose!=='function'){if(current(s))throw Error('subscription_unavailable');return;}
      if(!current(s)){try{dispose();}catch(_){}return;}
      unsubscribe=dispose;queue('caps');
    }).catch(error=>{if(current(s)&&!fallback(error)){status='error';purge();paint();}});
  }
  function read(){
    observe();if(!mounted()||legacy||!unsubscribe||!capabilities?.visible||!capabilities?.read)return;
    intent++;purge();status='loading';
    const p=preferences();const request={type:'ha_tools_email/energy_report',...selection,language:p.language,date_language:p.date_language,timezone:p.timezone,hour_cycle:p.hour_cycle};
    queue('report',request);paint();
  }
  function navigate(){
    const admin=card._hass?.user?.is_admin===true;
    for(const tab of ['schedule','send','config','history']){
      if(!admin){card.shadowRoot.querySelector('.tabs [data-tab="'+tab+'"]')?.remove();card.shadowRoot.querySelector('#email-tab-select option[value="'+tab+'"]')?.remove();}
    }
    if(capabilities?.visible===false){card.shadowRoot.querySelector('.tabs [data-tab="preview"]')?.remove();card.shadowRoot.querySelector('#email-tab-select option[value="preview"]')?.remove();}
  }
  function download(kind){
    observe();if(!mounted()||!report||!capabilities?.read||!capabilities?.visible)return;
    const types={csv:['text/csv;charset=utf-8','csv'],text:['text/plain;charset=utf-8','txt'],html:['text/html;charset=utf-8','html']};
    if(!types[kind])return;
    const [type,extension]=types[kind],snapshot=report;
    const url=URL.createObjectURL(new Blob([snapshot[kind]],{type}));urls.add(url);
    const anchor=root.ownerDocument.createElement('a');anchor.href=url;
    anchor.download='energy-report-'+snapshot.snapshot_id.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,96)+'.'+extension;
    root.append(anchor);try{anchor.click();}finally{anchor.remove();URL.revokeObjectURL(url);urls.delete(url);}
  }
  function action(event){
    const node=event.target.closest?.('[data-energy-report]');if(!node||!root?.contains(node))return;
    const name=node.dataset.energyReport;
    if(event.type==='click'){
      if(name==='read')read();else if(name.startsWith('download-'))download(name.slice(9));else if(name==='retry'){if(unsubscribe)signal();else{cancel();identity=context();start();paint();}}
      return;
    }
    if(!['period','anchor','comparison'].includes(name))return;
    const value=node.value;
    if(name==='period'&&!['day','week','month','year'].includes(value))return;
    if(name==='comparison'&&!['previous','year_ago','same_weekday','mean7'].includes(value))return;
    if(name==='anchor'&&value&&!/^\d{4}-\d{2}-\d{2}$/.test(value))return;
    if(name==='anchor'&&!value)delete selection.anchor;else selection[name]=value;
    const choices=selection.period==='day'?['previous','same_weekday','mean7']:['previous','year_ago'];
    if(!choices.includes(selection.comparison))selection.comparison='previous';
    intent++;if(pending?.kind==='report')pending=null;purge();status=capabilities?.read?'idle':status;paint();
  }
  function paint(){
    if(!root?.isConnected||card._activeTab!=='preview')return;
    navigate();
    if(legacy){
      // Old mail preview is still explicitly requested by an active administrator.
      root.innerHTML=card._tabPreview();card._bindMailControls();card._bindMailFrame('manual-mail-frame',card._mailPreview.model().preview);return;
    }
    const focus=root.getRootNode().activeElement?.dataset?.energyReport||focusHint;focusHint=null;
    const labels=preferences().language==='pl'?['Dzień','Tydzień','Miesiąc','Rok']:['Day','Week','Month','Year'];
    const comparisons=selection.period==='day'?['previous','same_weekday','mean7']:['previous','year_ago'];
    const names={previous:text('Previous period','Poprzedni okres'),same_weekday:text('Same weekday','Ten sam dzień tygodnia'),mean7:text('Mean of 7 previous days','Średnia z 7 poprzednich dni'),year_ago:text('Same period last year','Ten sam okres rok temu')};
    const message=status==='ready'?text('Report ready. Downloads use the same report.','Raport gotowy. Pliki zawierają ten sam raport.'):status==='loading'?text('Loading…','Wczytywanie…'):status==='denied'?text('Ask your administrator for access to energy reports.','Poproś administratora o dostęp do raportów energii.'):status==='error'?text('Report unavailable. Check access and update HA Tools Email, then retry.','Raport niedostępny. Sprawdź dostęp i zaktualizuj HA Tools Email, a następnie ponów.'):text('Choose a period and read your energy report here. Email setup is optional.','Wybierz okres i odczytaj raport energii tutaj. Konfiguracja email jest opcjonalna.');
    const enabled=available()&&capabilities?.visible&&capabilities?.read;
    const select=(name,title,values)=>`<label style="display:grid;gap:4px">${title}<select id="energy-report-${name}" data-energy-report="${name}">${values.map(([value,label])=>`<option value="${value}" ${selection[name]===value?'selected':''}>${esc(label)}</option>`).join('')}</select></label>`;
    root.innerHTML=`<section aria-label="${text('Energy report','Raport energii')}" style="min-width:0;overflow-wrap:anywhere;font-size:14px"><h3>${text('Energy report in Home Assistant','Raport energii w Home Assistant')}</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">${select('period',text('Period','Okres'),['day','week','month','year'].map((v,i)=>[v,labels[i]]))}<label style="display:grid;gap:4px">${text('Date in the measurement calendar (optional)','Data w kalendarzu pomiarów (opcjonalnie)')}<input id="energy-report-anchor" type="date" data-energy-report="anchor" value="${esc(selection.anchor||'')}" style="min-height:44px;font:inherit"></label>${select('comparison',text('Compare with','Porównaj z'),comparisons.map(v=>[v,names[v]]))}</div><p data-energy-report="status" role="status">${message}</p><button id="energy-report-read" type="button" data-energy-report="read" ${enabled?'':'disabled'}>${text('Read report','Odczytaj raport')}</button>${status==='error'||status==='denied'?`<button type="button" data-energy-report="retry">${text('Check access again','Sprawdź dostęp ponownie')}</button>`:''}<div data-energy-report="output"></div></section>`;
    if(report&&enabled){
      const output=root.querySelector('[data-energy-report="output"]'),doc=root.ownerDocument;
      const frame=doc.createElement('iframe');frame.dataset.energyReport='html';frame.title=text('Energy report','Raport energii');frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');frame.style.cssText='width:100%;height:560px;border:0;display:block;';
      frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; navigate-to \'none\'">'+report.html;
      output.append(frame);
      const details=doc.createElement('details'),summary=doc.createElement('summary'),pre=doc.createElement('pre');summary.textContent=text('Text and full numbers','Tekst i pełne liczby');pre.dataset.energyReport='text';pre.textContent=report.text;pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;';details.append(summary,pre);output.append(details);
      for(const [kind,label] of [['csv','CSV'],['text',text('Text','Tekst')],['html','HTML']]){const button=doc.createElement('button');button.type='button';button.dataset.energyReport='download-'+kind;button.textContent=text('Download ','Pobierz ')+label;output.append(button);}
    }
    if(focus)root.querySelector('[data-energy-report="'+focus+'"]')?.focus({preventScroll:true});
  }
  function mount(next){
    watch();observe();
    if(!next?.isConnected||!card.isConnected){stop();return;}
    if(root!==next){if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.replaceChildren();}root=next;root.addEventListener('click',action);root.addEventListener('change',action);}
    start();paint();
  }
  function stop(){cancel();unwatch();if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.replaceChildren();root=null;}identity=null;}
  function state(){return {status,report:report?{...report}:null,capabilities:capabilities?{...capabilities}:null,legacy,selection:{...selection}};}
  return {mount,stop,observe,state,read};
}
// HA_ENERGY_REPORT_V53_END

// HA_FEATURE_ACCESS_V53_START
"use strict";
// Settings only. This editor never derives grants from visibility or from a user list.
// Native HA authorization is independently rechecked by the backend on every call.
function createFeatureAccessV53({card, guard}) {
  const catalog={energy_analysis:['visible','read'],energy_tariff:['visible','read','execute'],energy_reports:['visible','read','execute'],log_reports:['visible','read','execute']};
  const modes=['inherit','household','admin','selected_users'];
  const clone=value=>value===null?null:JSON.parse(JSON.stringify(value));
  const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
  const language=()=>String(card._hass?.locale?.language||card._hass?.language||card._lang||'en').startsWith('pl');
  const text=(en,pl)=>language()?pl:en;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const userId=id=>typeof id==='string'&&id.length>0&&id.length<=128&&id===id.trim()&&!/[\u0000-\u001f\u007f-\u009f]/.test(id);
  function policy(value) {
    if(!value||typeof value!=='object'||Array.isArray(value)||value.schema!==1||!value.features||typeof value.features!=='object'||Array.isArray(value.features)||Object.keys(value).sort().join(',')!=='features,schema')throw {code:'invalid_feature_access'};
    if(JSON.stringify(value).length>65536)throw {code:'invalid_feature_access'};
    for(const [feature,operations] of Object.entries(value.features)) {
      if(!Object.hasOwn(catalog,feature)||!operations||typeof operations!=='object'||Array.isArray(operations))throw {code:'invalid_feature_access'};
      for(const [operation,rule] of Object.entries(operations)) {
        if(!catalog[feature].includes(operation)||!rule||!modes.includes(rule.mode)||Array.isArray(rule))throw {code:'invalid_feature_access'};
        const selected=rule.mode==='selected_users',keys=Object.keys(rule).sort().join(',');
        if(keys!=='mode'&&(!selected||keys!=='mode,user_ids'))throw {code:'invalid_feature_access'};
        if(selected&&rule.user_ids!==undefined&&(!Array.isArray(rule.user_ids)||rule.user_ids.length>128||!rule.user_ids.every(userId)))throw {code:'invalid_feature_access'};
      }
    }
    return clone(value);
  }
  function envelope(value) {
    if(value?.status!=='ready'||!Number.isSafeInteger(value.revision)||value.revision<0)throw {code:'invalid_feature_access'};
    return {policy:policy(value.policy),revision:value.revision};
  }
  let root=null,identity=null,generation=0,opened=false,running=false,pendingLoad=false;
  let draft=null,revision=null,baseline=null,users=[],usersUnavailable=false,dirty=false,blocked=false,revoked=false,status='idle';
  let unsubscribe=null,unsubscribeWire=null;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const context=()=>{const t=guard.observe();return [t.connection,t.callWS,t.user,t.admin,t.owner,t.active,t.groups,t.groupIds,t.connected,t.online,card._hass?.connected,card.isConnected,card._activeTab,t.epoch];};
  const allowed=()=>card.isConnected&&card._activeTab==='config'&&card._hass?.connected!==false&&guard.current(guard.observe(),true);
  const active=()=>allowed()&&opened&&root?.open&&root.isConnected&&!revoked;
  const busy=()=>running||guard.occupied();
  function clear(close=true) {
    generation++;pendingLoad=false;draft=null;revision=null;baseline=null;users=[];dirty=false;blocked=false;revoked=false;usersUnavailable=false;status='idle';
    // running and the shared guard's raw occupation intentionally survive epochs.
    if(close){opened=false;if(root)root.open=false;}
    root?.querySelector('[data-feature-access-body]')?.replaceChildren();
  }
  function observe() {
    const next=context(),contextChanged=!same(identity,next);
    if(contextChanged) {
      if(!same(identity?.slice(0,-1),next.slice(0,-1)))clear();
      else {
        // A tariff/config epoch is not a user gesture to discard an access draft.
        // Keep it, fence old responses and require an explicit policy reload.
        generation++;pendingLoad=false;blocked=true;
        if(!revoked)status=draft?'conflict':'error';
      }
      identity=next;paint();
    }
    return {contextChanged};
  }
  const current=(g,token)=>g===generation&&active()&&guard.current(token,true)&&same(identity,context());
  function failure(error,writing=false) {
    if(error?.code==='unauthorized'||error?.code==='not_allowed') {
      generation++;pendingLoad=false;draft=null;revision=null;baseline=null;users=[];usersUnavailable=false;dirty=false;blocked=true;revoked=true;status='denied';
    } else {
      if(writing)blocked=true;
      status=error?.code==='unknown_command'?'unsupported':error?.code==='feature_access_revision_conflict'||error?.code==='feature_access_changed'?'conflict':writing?'unconfirmed':'error';
    }
  }
  function queueLoad() {
    observe();if(!active())return;
    pendingLoad=true;status='loading';paint();pump();
  }
  function nativeUsers(value) {
    if(!Array.isArray(value))throw {code:'user_list_unavailable'};
    const ids=new Set(),result=[];
    for(const user of value) {
      if(!user||!userId(user.id)||ids.has(user.id)||user.system_generated===true)continue;
      ids.add(user.id);result.push({id:user.id,name:typeof user.name==='string'&&user.name.trim()?user.name.slice(0,256):text('Unnamed account','Konto bez nazwy'),active:user.is_active!==false});
    }
    return result.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  }
  async function pump() {
    if(!pendingLoad||running||guard.occupied()||!active())return;
    pendingLoad=false;running=true;
    const g=generation,token=guard.observe();status='loading';paint();
    try {
      const result=envelope(await guard.call(token,{type:'ha_tools_email/get_feature_access'},true));
      if(!current(g,token))return;
      let choices=[],unavailable=false;
      try {choices=nativeUsers(await guard.call(token,{type:'config/auth/list'},true));}
      catch(error){if(error?.code==='unauthorized'||error?.code==='not_allowed')throw error;unavailable=true;}
      if(!current(g,token))return;
      draft=result.policy;revision=result.revision;baseline=canonical(draft);dirty=false;blocked=false;users=choices;usersUnavailable=unavailable;status='ready';
    } catch(error) {if(current(g,token))failure(error);}
    finally {running=false;paint();pump();}
  }
  async function save() {
    observe();if(!active()||busy()||blocked||!dirty||draft===null||revision===null)return;
    const g=generation,token=guard.observe(),expected=revision,sent=policy(draft);
    running=true;status='saving';paint();
    try {
      const result=envelope(await guard.call(token,{type:'ha_tools_email/set_feature_access',policy:sent,expected_revision:expected},true));
      if(!current(g,token))return;
      if(result.revision!==expected+1||canonical(result.policy)!==canonical(sent))throw {code:'feature_access_save_unconfirmed'};
      draft=result.policy;revision=result.revision;baseline=canonical(draft);dirty=false;blocked=false;status='saved';
    } catch(error) {if(current(g,token))failure(error,true);}
    finally {running=false;paint();pump();}
  }
  function changed() {dirty=canonical(draft)!==baseline;if(!blocked)status='ready';paint();}
  function action(event) {
    const node=event.target.closest?.('[data-feature-access]');if(!node||!root?.contains(node))return;
    if(event.type==='click') {if(node.dataset.featureAccess==='save')void save();else if(node.dataset.featureAccess==='reload'&&!busy()&&!revoked)queueLoad();return;}
    observe();if(!active()||busy()||!draft)return;
    const row=node.closest('[data-access-feature]'),feature=row?.dataset.accessFeature,operation=row?.dataset.accessOperation;
    if(!Object.hasOwn(catalog,feature)||!catalog[feature].includes(operation))return;
    if(node.dataset.featureAccess==='mode') {
      if(!modes.includes(node.value))return;
      const previous=draft.features[feature]?.[operation];
      const rule={mode:node.value};if(node.value==='selected_users')rule.user_ids=previous?.mode==='selected_users'?[...(previous.user_ids||[])]:[];
      (draft.features[feature]||={})[operation]=rule;changed();
    } else if(node.dataset.featureAccess==='user') {
      const user=users[Number(node.dataset.accessUser)],rule=draft.features[feature]?.[operation];
      if(!user?.active||rule?.mode!=='selected_users')return;
      const ids=new Set(rule.user_ids||[]);if(node.checked)ids.add(user.id);else ids.delete(user.id);
      if(ids.size>128)return;rule.user_ids=[...ids].sort();changed();
    }
  }
  function toggle() {
    if(!root)return;
    const next=root.open;if(next===opened)return;
    if(!next){clear();paint();return;}
    observe();if(!allowed()){root.open=false;return;}
    opened=true;queueLoad();
  }
  function watch() {
    if(unsubscribe)return;
    unsubscribe=guard.subscribe(()=>{root?.querySelector('[data-feature-access-body]')?.replaceChildren();queueMicrotask(()=>{observe();paint();});});
    unsubscribeWire=guard.subscribeWire(()=>queueMicrotask(()=>{observe();paint();pump();}));
  }
  function message() {
    if(!allowed()||status==='denied')return text('Administrator access is required. Reopen after your account access is confirmed.','Wymagany jest dostęp administratora. Otwórz ponownie po potwierdzeniu uprawnień konta.');
    if(status==='unsupported')return text('Update HA Tools Email to manage household access, then reload. No changes were saved.','Zaktualizuj HA Tools Email, aby zarządzać dostępem domowników, a następnie wczytaj ponownie. Nie zapisano zmian.');
    if(status==='conflict')return text('Access settings changed elsewhere. Your draft is kept. Reload explicitly before saving.','Ustawienia dostępu zmieniły się w innym miejscu. Zachowano szkic. Przed zapisem wczytaj ponownie.');
    if(status==='unconfirmed')return text('Save could not be confirmed. Your draft is kept. Reload before trying another save.','Nie udało się potwierdzić zapisu. Zachowano szkic. Wczytaj ponownie przed kolejnym zapisem.');
    if(status==='error')return text('Access settings could not be read. Reload explicitly to retry.','Nie udało się odczytać ustawień dostępu. Wczytaj ponownie, aby ponowić próbę.');
    if(busy()||pendingLoad)return text('Waiting for the current operation…','Oczekiwanie na bieżącą operację…');
    if(usersUnavailable&&status==='ready')return text('Access loaded. The user account list is unavailable; saved choices are kept.','Wczytano dostęp. Lista kont użytkowników jest niedostępna; zachowano zapisane wybory.');
    if(status==='saved')return text('Saved. Home Assistant still checks each user’s own permissions.','Zapisano. Home Assistant nadal sprawdza własne uprawnienia każdego użytkownika.');
    return dirty?text('Unsaved changes. Save explicitly to apply them.','Niezapisane zmiany. Użyj Zapisz, aby je zastosować.'):text('Choose access separately for each action.','Ustaw dostęp osobno dla każdego działania.');
  }
  function paint() {
    const body=root?.querySelector('[data-feature-access-body]');if(!body)return;
    if(!opened){body.replaceChildren();return;}
    const focus=root.getRootNode().activeElement?.id,disabled=!active()||busy()||pendingLoad;
    const titles={energy_analysis:text('Energy analysis','Analiza energii'),energy_tariff:text('Energy tariffs','Taryfy energii'),energy_reports:text('Energy reports','Raporty energii'),log_reports:text('Log reports','Raporty dziennika')};
    const operations={visible:text('Visible in the interface','Widoczność w interfejsie'),read:text('Read data','Odczyt danych'),execute:text('Run actions or change settings','Uruchamianie działań lub zmiana ustawień')};
    const modeName={inherit:text('Default','Domyślnie'),household:text('Household','Domownicy'),admin:text('Administrators','Administratorzy'),selected_users:text('Selected users','Wybrani użytkownicy')};
    const defaultRole=(feature,operation)=>feature==='energy_analysis'||feature==='energy_tariff'&&operation!=='execute'?modeName.household:modeName.admin;
    const row=(feature,operation)=>{
      const rule=draft.features[feature]?.[operation]||{mode:'inherit'},prefix='feature-access-'+feature+'-'+operation;
      let choices='';
      if(rule.mode==='selected_users') {
        const ids=new Set(rule.user_ids||[]),available=new Set(users.map(user=>user.id));
        choices=users.map((user,index)=>!user.active&&!ids.has(user.id)?'':`<label class="fa-user"><input id="${prefix}-user-${index}" type="checkbox" data-feature-access="user" data-access-user="${index}" ${ids.has(user.id)?'checked':''} ${disabled||!user.active?'disabled':''}><span>${esc(user.name)}${!user.active?' ('+text('inactive; saved choice retained','nieaktywne; zachowano wybór')+')':''}</span></label>`).join('');
        const missing=[...ids].filter(id=>!available.has(id)).length;
        if(missing)choices+=`<p>${missing} ${text('saved account choices are unavailable; they are kept.','zapisanych kont jest niedostępnych; zachowano je.')}</p>`;
        if(!users.some(user=>user.active))choices+=`<p>${text('No available accounts to add. Existing choices are kept.','Brak dostępnych kont do dodania. Zachowano dotychczasowe wybory.')}</p>`;
      }
      return `<div class="fa-rule" data-access-feature="${feature}" data-access-operation="${operation}"><label for="${prefix}">${operations[operation]}</label><select id="${prefix}" data-feature-access="mode" ${disabled?'disabled':''}>${modes.map(mode=>`<option value="${mode}" ${mode===rule.mode?'selected':''}>${modeName[mode]}${mode==='inherit'?' ('+defaultRole(feature,operation)+')':''}</option>`).join('')}</select>${choices}</div>`;
    };
    body.innerHTML=`<style>[data-feature-access-body]{font-size:14px;overflow-wrap:anywhere;min-width:0}[data-feature-access-body] fieldset{border:1px solid var(--divider-color,#888);border-radius:8px;margin:16px 0;padding:12px;min-width:0}[data-feature-access-body] legend{font-weight:600;padding:0 4px}[data-feature-access-body] .fa-rule{display:grid;gap:6px;margin:10px 0}[data-feature-access-body] select,[data-feature-access-body] button{font:inherit;min-height:44px;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#888);border-radius:8px;padding:8px;max-width:100%}[data-feature-access-body] .fa-user{display:flex;align-items:center;gap:8px;min-height:44px}[data-feature-access-body] .fa-user input{width:22px;height:22px;flex:0 0 auto}[data-feature-access-body] :focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}[data-feature-access-body] .fa-actions{display:flex;flex-wrap:wrap;gap:8px}</style>
      <p data-feature-access="explanation">${text('Visibility controls whether a feature is shown; visibility does not grant permission to read data or run actions. Home Assistant permissions remain the upper bound for each user. Active administrators retain access. Default keeps the existing household and administrator rules.','Widoczność określa, czy funkcja jest pokazywana; widoczność nie nadaje uprawnień do odczytu ani uruchamiania działań. Uprawnienia Home Assistant pozostają górną granicą dla każdego użytkownika. Aktywni administratorzy zachowują dostęp. Domyślnie zachowuje dotychczasowe reguły domowników i administratorów.')}</p>
      <p data-feature-access="status" role="status" aria-live="polite">${message()}</p>
      ${usersUnavailable?`<p>${text('The account list is unavailable. Existing selected users are kept. Reload to try again.','Lista kont jest niedostępna. Zachowano dotychczasowych wybranych użytkowników. Wczytaj ponownie, aby spróbować jeszcze raz.')}</p>`:''}
      ${draft?Object.keys(catalog).map(feature=>`<fieldset><legend>${titles[feature]}</legend>${catalog[feature].map(op=>row(feature,op)).join('')}</fieldset>`).join(''):''}
      <div class="fa-actions"><button id="feature-access-save" type="button" data-feature-access="save" ${disabled||blocked||!dirty||!draft?'disabled':''}>${text('Save','Zapisz')}</button><button id="feature-access-reload" type="button" data-feature-access="reload" ${!active()||busy()?'disabled':''}>${dirty?text('Discard changes and reload','Odrzuć zmiany i wczytaj ponownie'):text('Reload','Wczytaj ponownie')}</button></div>
      <p>${text('Closing this section discards unsaved changes.','Zamknięcie tej sekcji odrzuca niezapisane zmiany.')}</p>`;
    if(focus)body.querySelectorAll('[id]').forEach(node=>{if(node.id===focus)node.focus({preventScroll:true});});
  }
  function mount(next) {
    observe();watch();
    if(!next?.isConnected||!allowed()){stop();return;}
    if(root!==next){if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('toggle',toggle);root.replaceChildren();}root=next;root.open=opened;root.addEventListener('click',action);root.addEventListener('change',action);root.addEventListener('toggle',toggle);paint();}
  }
  function stop() {
    clear();if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('toggle',toggle);root.replaceChildren();root=null;}
    unsubscribe?.();unsubscribeWire?.();unsubscribe=null;unsubscribeWire=null;identity=null;
  }
  function state() {observe();return {draft:clone(draft),revision,users:clone(users),dirty,status,opened,busy:busy()};}
  return {mount,stop,observe,state};
}
// HA_FEATURE_ACCESS_V53_END

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
      this._emailContextVersion = 0;
      this._emailContextIdentity = null;
      this._backendConfigRead = null;
      this._serverSchedules = createHaToolsEmailSchedules({ kind: 'energy_report', recipientEditor: true,
        projectPreview: (response, message) => this._projectCalendarPreview(response, message),
        contextLost: () => { this._clearEmailContext(); this._scheduleSaveFocus = null; this._render(); },
        changed: () => { if (this._activeTab === 'schedule') this._renderTab(); } });
      this._mailPresentation = createHaToolsMailPresentation({ escape: _esc, language: () => this._lang });
      this._mailCadence = 'daily';
      this._mailPeriodMode = 'rolling';
      this._mailPreview = createHaToolsEmailSchedules({ kind: 'energy_report',
        changed: () => { if (this._activeTab === 'preview') this._renderTab(); } });
      this._attemptHistory = createHaToolsEmailHistory({ escape: _esc, changed: () => { if (this._activeTab === 'history') this._renderTab(); } });
      this._lastSent = {};
      this._lastSentOutcome = {};
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
          for (const period of ['day', 'week', 'month']) {
            this[`_periodCache_${period}`] = null;
            this[`_periodRaw_${period}`] = null;
            this[`_periodWindow_${period}`] = null;
            this[`_periodCoverage_${period}`] = null;
            this[`_periodStatus_${period}`] = 'no_data';
            this[`_periodCacheTime_${period}`] = 0;
          }
          // Keep an occupied refresh promise until its old wire really settles.
          this._lastPeriodRefresh = 0;
          this._lastRenderTime = 0;
        }
        const emailContextChanged = this._resetEmailContext(hass);
        this._resetTariffContext(hass);
        this._hass = hass;
        this._analysisHostV53?.observe();
        const reportObservation = this._reportHostV53?.observe();
        const accessObservation = this._featureAccessV53?.observe();
        this._serverSchedules.setContext(hass);
        this._mailPreview.setContext(hass);
        this._attemptHistory.setContext(hass);
        if (this._activeTab === 'history') this._render();
        if (!hass) { this.shadowRoot.replaceChildren(); return; }
        if (this._activeTab==='config') {
          // Closed access settings never trigger legacy SMTP discovery or repaint on ordinary HA traffic.
          const needsRender = !this._firstRender || !this._featureAccessV53 || accessObservation?.contextChanged || previousLanguage !== this._lang || presentationChanged;
          this._firstRender = true;
          if (needsRender) this._render();
          return;
        }
        if (this._activeTab==='preview' && this._firstRender) {
          // Ordinary HA state traffic must preserve the report iframe, scroll,
          // open disclosures and focused controls. Identity/format changes purge.
          if (!this._reportHostV53 || reportObservation?.contextChanged) this._render();
          return;
        }
        if (this._initialDiscoveryStartedV3) this._ensureInitialDiscovery();
        if ((emailContextChanged || measurementsChanged) && this._firstRender) { this._render(); return; }
        const now = Date.now();
        if (!this._firstRender) {
          this._firstRender = true;
          this._initialDiscoveryStartedV3 = true;
          this._ensureInitialDiscovery();
          this._render();
          this._lastRenderTime = now;
          return;
        }
        if (previousLanguage !== this._lang || presentationChanged) {
          this._renderPreservingDrafts();
          this._lastRenderTime = now;
          return;
        }
        if (!this._emailBackendChecked && !['schedule','preview'].includes(this._activeTab)) this._loadEmailBackendConfig().catch(e => this._showToast('⚠️ ' + (e?.message || e)));
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
      this._observeTariffContextV3();
      if (this._hass?.states) this._render();
    }


    getCardSize() { return 4; }

    getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }

    _getTariffV3(proposed) {
      const host = this._getTariffHostV3();
      return arguments.length ? host.model(proposed) : this._sharedTariffNeedsConfirmationV3() ? host.model({ schema: 0 }) : host.model();
    }
    _getTariffHostV3() {
      if (this._tariffHostController) return this._tariffHostController;
      // HA_TARIFF_V3_START sha256=edbea0b8cf79b7eaf6a37a5859361650a234db6877f18b9c4b045d455e54f229
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
    if(!keys(v,['enabled','revision','reader_scope','warning','membership_mode','pending','author_user_id','active_epoch','dataset','catalog']) || typeof v.enabled!=='boolean' || typeof v.pending!=='boolean' || !integer(v.revision) ||
      v.reader_scope!=='all_authenticated_ha_users' || v.membership_mode!=='current_snapshot' || !str(v.warning,4096) || (v.author_user_id!==null&&!str(v.author_user_id,128)) || (v.active_epoch!==null&&!str(v.active_epoch,128)) ||
      !Array.isArray(v.catalog) || v.catalog.length>4096) throw Error('invalid_statistics');
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
    dialog.querySelector('[data-statistics-note]').textContent=note || text('Review the dataset before enabling. Enabling does not publish statistics.','Sprawdź zestaw przed włączeniem. Włączenie nie publikuje statystyk.');
    dialog.querySelector('[data-statistics-state]').textContent=snapshot ? text(snapshot.enabled?'Enabled':'Disabled',snapshot.enabled?'Włączone':'Wyłączone') + (snapshot.pending?text(' · Unconfirmed operation',' · Niepotwierdzona operacja'):'') : text('Status unavailable','Stan niedostępny');
    const data=dialog.querySelector('[data-statistics-dataset]'); data.replaceChildren();
    const row=(parent,value)=>{const p=document.createElement('p');p.textContent=value;parent.append(p);};
    const p=proposal?.proposal;
    if(p) { row(data,text('Proposed dataset','Proponowany zestaw')+`: ${p.currency} · ${p.price_basis}`); row(data,text('Sources: ','Źródła: ')+p.source_ids.join(', ')); }
    const list=dialog.querySelector('[data-statistics-catalog]');list.replaceChildren();
    if(snapshot) {
      row(list,text('Existing statistics: ','Istniejące statystyki: ')+snapshot.catalog.length);
      for(const item of snapshot.catalog) row(list,`${item.name} · ${item.statistic_id} · ${item.currency} · ${item.price_basis} · ${text(item.current_dataset?'current dataset':'earlier dataset',item.current_dataset?'bieżący zestaw':'wcześniejszy zestaw')}`);
    }
    const checkbox=dialog.querySelector('input');checkbox.checked=checked;checkbox.disabled=busyNow || uncertain || !proposal;
    const own=snapshot?.enabled && snapshot.author_user_id===card._hass?.user?.id;
    dialog.querySelector('[data-statistics-read]').disabled=busyNow;
    dialog.querySelector('[data-statistics-enable]').disabled=busyNow || uncertain || !checked || !proposal || !snapshot || snapshot.pending || proposal.revision!==snapshot.revision;
    dialog.querySelector('[data-statistics-disable]').disabled=busyNow || uncertain || !snapshot?.enabled || snapshot.pending;
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
        if(!snapshot.pending) {
          const next=prepared(await call(task,'prepare'));
          if(!current(task)) return;
          if(next.revision!==snapshot.revision) throw Error('statistics_changed');
          proposal=next;
        }
      } else {
        const before=snapshot, chosen=proposal;
        if(uncertain || !before || before.pending) return;
        let payload;
        if(operation==='enable') {
          if(!checked || !chosen || chosen.revision!==before.revision) return;
          payload={proposal:detached(chosen.proposal),expected_revision:chosen.revision,acknowledge_global:true,acknowledge_current_membership:true};
        } else if(operation==='disable') {
          if(!before.enabled) return; payload={expected_revision:before.revision};
        } else {
          if(!before.enabled || before.author_user_id!==card._hass?.user?.id) return;
          if(operation==='backfill' && (!checked || !chosen || chosen.revision!==before.revision)) return;
          payload=operation==='backfill'?{backfill:true,acknowledge_current_membership:true}:{backfill:false,acknowledge_current_membership:false};
        }
        // A failed or malformed mutation ACK is uncertain until explicit readback.
        uncertain=true;proposal=null;checked=false;
        const result=status(await call(task,operation==='backfill'?'refresh':operation,payload,true));
        if(!current(task)) return;
        if((operation==='enable' && (!result.enabled || result.revision<=before.revision)) || (operation==='disable' && (result.enabled || result.revision<=before.revision))) throw Error('statistics_unconfirmed');
        snapshot=result;uncertain=result.pending;
        note=result.pending ? text('Operation unconfirmed. Read status before another change.','Operacja niepotwierdzona. Odczytaj stan przed kolejną zmianą.') : text('Operation confirmed. Read status to review a new proposal.','Operacja potwierdzona. Odczytaj stan, aby sprawdzić nową propozycję.');
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
    element('p',text('History uses the current source membership, including when adding the last 7 days. Historical membership is not reconstructed. No automatic publishing cadence is configured here.','Historia używa aktualnego przypisania źródeł, także przy dodawaniu ostatnich 7 dni. Dawne przypisanie nie jest odtwarzane. Ten dialog nie ustawia automatycznej publikacji.'));
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
  const statistics = options => createEnergyStatisticsUiV53({card,guard,...options});
  return { statistics, reportStatus, summary, analysis: () => createEnergyAnalysisHostV53({card}), model, profile: activeProfile, currency, reset, load, snapshot, markup, bind, guard, backend, ui: () => createUi({ language: language() }) };
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
this._tariffHostController = createTariffHostV3({ card: this, kind: 'email', createModel: createEnergyTariffV3, legacyProfile: energyTariffProfileV3, createSettings: createTariffSettingsV3, createUi: createUiV3, ...this._createTariffConsumerV3(createTariffGuardV3) });
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
    _tariffDetailsMarkup() { return this._getTariffHostV3().markup(); }
    _bindTariffSettings() {
      if (this._tariffWriteUnconfirmedV3) {
        this._tariffEditorState ||= { profile: null, revision: null, status: 'not_checked', busy: false };
        this._tariffEditorState.writeUnconfirmed = true;
      }
      this._getTariffHostV3().bind();
      // Email owns its named navigation and stable IDs; discard the host's generic duplicate.
      this.shadowRoot.querySelector('.energy-tab-picker')?.remove();
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
      const unsubscribe = guard.subscribe(() => queueMicrotask(() => {
        // Setters assign the prospective hass before this pure render executes.
        if (active && this.ownerDocument?.defaultView?.document) this._repriceTariffV3();
      }));
      this._tariffConsumerUnsubscribeV3 = () => { active = false; unsubscribe(); };
    }
    _tariffContextV3() {
      return { config: this._config, tab: this._activeTab, range: [this._overviewPeriod, this._reportPeriod],
        sources: this._tariffSourceIds || [], windowEnd: this._tariffWindowEnd ?? null };
    }
    _observeTariffContextV3() { this._getTariffHostV3().guard.observe(); }
    _observeTariffNavigationV3() {
      // Context purge and editor/write fences remain in force for tabs and periods.
      this._sharedTariffExpectedV3 ||= this._sharedTariffProfile != null;
      this._observeTariffContextV3();
      if (['preview','config'].includes(this._activeTab) || !this._sharedTariffExpectedV3 || Object.hasOwn(this._config, 'tariff_profile')) return;
      const guard = this._getTariffHostV3().guard, token = guard.snapshot();
      void this._loadSharedTariffProfile().then(confirmed => {
        if (confirmed && guard.current(token) && this.isConnected) this._repriceTariffV3();
      });
    }
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
      if (!this._hass) return;
      if (this._sharedTariffProfile != null) this._sharedTariffExpectedV3 = true;
      for (const period of ['day', 'week', 'month']) {
        if (!['ready', 'partial', 'unsupported'].includes(this[`_periodStatus_${period}`])) continue;
        const measured = this[`_periodRaw_${period}`];
        if (!measured) continue;
        const rows = new Map(measured.map(row => [row.id, row]));
        this[`_periodCache_${period}`] = this[`_periodCache_${period}`].map(row => {
          const source = rows.get(row.entity_id);
          return source ? { ...row, cost: row.complete === false ? null : this._bucketCost(source.buckets, source.unit) } : row;
        });
      }
      this._render();
    }


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
      // A monthly aggregate cannot be priced as timestamped measured buckets.
      return null;
    }

    _bucketCost(buckets, unit) {
      const factor = energyFactor(unit);
      if (!factor) return null;
      const rows = [...buckets].map(([stamp, change]) => ({ from: stamp, to: stamp + ENERGY_HOUR, kwh: change * factor }));
      return this._getTariffV3().priceBuckets(rows).energyCost;
    }

    _formatCost(value) {
      return typeof value === 'number' && Number.isFinite(value) ? createFormatUi(this._hass?.locale?.language || this._hass?.language || this._lang || 'en').number(value, {minimumFractionDigits:2, maximumFractionDigits:2}) : 'N/A';
    }

    _sharedTariffNeedsConfirmationV3() {
      return this._sharedTariffExpectedV3 && !Object.hasOwn(this._config, 'tariff_profile') && this._sharedTariffReadStatus !== 'success';
    }

    _tariffHeaderCurrencyV3() {
      return this._sharedTariffNeedsConfirmationV3() ? '' : this._tariffCurrency();
    }

    _getTariffLabel() {
      if (this._sharedTariffNeedsConfirmationV3()) return this._lang === 'pl' ? 'Wspólna taryfa niepotwierdzona' : 'Shared tariff not confirmed';
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
      return createFormatUi(this._hass?.locale?.language || this._hass?.language || this._lang || 'en').number(this._float(v), {minimumFractionDigits:decimals, maximumFractionDigits:decimals});
    }

    // --- auto-discovery ---

    _ensureInitialDiscovery() {
      if (['preview','config'].includes(this._activeTab) || this._discoveryDone || this._initialDiscoveryPromise || !this.isConnected ||
        !this._hass?.callWS || !this._emailIdentity(this._hass).online) return;
      // Preserve occupancy until the old discovery settles. A normal hass
      // update or mount can then resume discovery with a fresh context token.
      const token = this._emailContextToken();
      const operation = this._discoverAll();
      this._initialDiscoveryPromise = operation;
      operation.catch(e => { if (this.isConnected) this._renderError(e); }).finally(() => {
        if (this._initialDiscoveryPromise === operation) this._initialDiscoveryPromise = null;
        if (!this._emailContextMatches(token)) this._ensureInitialDiscovery();
      });
    }

    async _discoverAll() {
      const token = this._emailContextToken();
      await this._loadEmailBackendConfig();
      if (!this._emailContextMatches(token)) return;
      await this._ensureHelpers();
      if (!this._emailContextMatches(token)) return;
      this._discoverRecipient();
      this._discoveryDone = true;
      this._render();
      // Fetch recorder stats in background (for period views)
      this._fetchAllPeriodStats().then(() => {
        // Incomplete, absent and failed reads have no totals cache, but their
        // settled status must still replace the initial empty state on quiet HA.
        if (this._emailContextMatches(token)) this._render();
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
      if (this._hass?.user?.is_admin === true && recipient && recipient.includes('@')) this._detectedRecipient = recipient;
      if (this._hass?.user?.is_admin === true && service && service.length > 0) this._detectedService = service;
      if (/^\d{2}:\d{2}$/.test(dailyTime)) this._scheduleDefaults.daily = dailyTime;
      if (/^\d{2}:\d{2}$/.test(weeklyTime)) this._scheduleDefaults.weekly_time = weeklyTime;
      if (weeklyDay && weeklyDay.length >= 3) this._scheduleDefaults.weekly_day = weeklyDay;
      if (/^\d{2}:\d{2}$/.test(monthlyTime)) this._scheduleDefaults.monthly_time = monthlyTime;
      if (price && !isNaN(parseFloat(price)) && parseFloat(price) >= 0) this._config.energy_price = parseFloat(price);
      const excluded = read('excluded');
      if (excluded) this._excludedDevices = new Set(excluded.split(',').map(s => s.trim()).filter(Boolean));
    }

    _requireAdmin() {
      if (this._hass?.user?.is_admin === true && this._hass.connected !== false && this._hass.connection?.connected !== false && (!this._emailContextIdentity || this._serverSchedules.online())) return true;
      this._showToast(this._lang === 'pl' ? 'Tylko administrator może zmieniać ustawienia i wysyłać raporty.' : 'Only administrators can change settings and send reports.');
      return false;
    }

    async _saveToHelper(key, value) {
      const token = this._emailContextToken(), source = this._hass;
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
          await source.callService('input_text', 'set_value', { entity_id: eid, value: text });
        } else {
          localStorage.setItem(`ha-energy-email-${key}`, text);
        }
        return this._emailContextCurrent(token);
      } catch (e) {
        if (!this._emailContextCurrent(token)) return false;
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

    _emailIdentity(hass) {
      return { user: hass?.user?.id ?? hass?.user ?? null, admin: hass?.user?.is_admin === true,
        connection: hass?.connection ?? null, online: !!hass && hass.connected !== false && hass.connection?.connected !== false };
    }

    _clearEmailContext() {
      this._clearActionFocus();
      this._mailPreview?.clearPreview();
      this._mailPresentation?.clear();
      this._emailContextVersion++;
      this.shadowRoot?.replaceChildren();
      this._backendConfigRead = null;
      this._emailBackendChecked = true;
      this._emailBackendAvailable = false;
      this._emailBackendConfig = null;
      this._emailBackendError = null;
      this._emailBackendMissing = false;
      this._emailBackendReportsUnsupported = false;
      this._backendReportPreviews = {};
      this._emailSchedules = [];
      this._scheduleBusy = {};
      this._detectedRecipient = null;
      this._detectedService = null;
      this._configEntriesChecked = false;
      this._helpersChecked = false;
      this._smtpStatus = null;
      this._sendResult = null;
      this._legacyActionResult = null;
      this._smtpTesting = !!this._smtpRequest;
      this._sending = !!this._emailSendRequest;
      this._scheduleSaveFocus = null;
      this._lastSent = {};
      this._lastSentOutcome = {};
    }

    _resetEmailContext(hass) {
      const next = this._emailIdentity(hass), prior = this._emailContextIdentity;
      const changed = !!prior && Object.keys(next).some(key => next[key] !== prior[key]);
      if (changed) this._clearEmailContext();
      this._emailContextIdentity = next;
      return changed;
    }

    _emailContextToken() {
      return { version: this._emailContextVersion, ...this._emailIdentity(this._hass) };
    }

    _emailContextMatches(token) {
      const next = this._emailIdentity(this._hass);
      return token.version === this._emailContextVersion &&
        ['user', 'admin', 'connection', 'online'].every(key => token[key] === next[key]);
    }

    _emailContextCurrent(token) {
      const next = this._emailIdentity(this._hass);
      return token.version === this._emailContextVersion && next.admin && next.online &&
        (!this._emailContextIdentity || this._serverSchedules.online()) &&
        ['user', 'admin', 'connection', 'online'].every(key => token[key] === next[key]);
    }

    _projectCalendarPreview(raw, message) {
      const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
      const stamp = value => typeof value === 'string' && value.length <= 64 &&
        /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
      if (!raw || raw.cadence !== message.cadence || raw.period?.cadence !== message.cadence ||
        raw.period?.semantics !== 'previous_completed_calendar_period' || !stamp(raw.period.start) || !stamp(raw.period.end) ||
        Date.parse(raw.period.end) <= Date.parse(raw.period.start) || !['ready', 'partial', 'no_data', 'unsupported'].includes(raw.status) ||
        !Array.isArray(raw.source_ids) || raw.source_ids.length > 500 ||
        raw.source_ids.some(id => typeof id !== 'string' || !/^[\w.:-]{1,255}$/.test(id)) ||
        !(raw.total_kwh === null || numeric(raw.total_kwh) !== null)) throw { code: 'invalid_response' };
      try { if (typeof raw.effective_timezone !== 'string' || raw.effective_timezone.length > 128) throw 0;
        const actualZone = new Intl.DateTimeFormat('en', { timeZone: raw.effective_timezone }).resolvedOptions().timeZone;
        if (message.timezone && actualZone !== new Intl.DateTimeFormat('en', { timeZone: message.timezone }).resolvedOptions().timeZone) throw 0;
      } catch (_) { throw { code: 'invalid_response' }; }
      const value = { cadence: raw.cadence, effective_timezone: raw.effective_timezone, status: raw.status,
        period: { start: raw.period.start, end: raw.period.end, cadence: raw.period.cadence, semantics: raw.period.semantics },
        source_count: raw.source_ids.length,
        total_kwh: raw.status === 'ready' ? numeric(raw.total_kwh) : null,
        total_cost: numeric(raw.total_cost), energyCost: numeric(raw.energyCost), variableCost: numeric(raw.variableCost),
        usageCost: numeric(raw.usageCost), fixedMonthly: numeric(raw.fixedMonthly),
        currency: typeof raw.currency === 'string' && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null,
        priceBasis: ['gross', 'net'].includes(raw.priceBasis) ? raw.priceBasis : null,
        tariff_complete: typeof raw.tariff_complete === 'boolean' ? raw.tariff_complete : null };
      return { state: value.status === 'partial' || (value.status === 'ready' && value.total_kwh === null) ? 'partial' :
        ['no_data','unsupported'].includes(value.status) ? 'no_data' : 'success', value };
    }

    async _emailWs(command, payload = {}) {
      const hass = this._hass;
      if (!hass?.callWS) throw new Error('Home Assistant websocket API is unavailable');
      return hass.callWS({ type: 'ha_tools_email/' + command, ...payload });
    }

    async _emailReadonlyWs(hass, message) {
      const delay = Number.isFinite(this._emailReadonlyTimeoutMs) && this._emailReadonlyTimeoutMs > 0 ? this._emailReadonlyTimeoutMs : 15000;
      let timer;
      try {
        return await Promise.race([hass.callWS(message), new Promise((_, reject) => {
          timer = setTimeout(() => reject({code:'readonly_timeout'}), delay);
        })]);
      } finally { clearTimeout(timer); }
    }

    async _loadEmailBackendConfig(options = {}) {
      const hass = this._hass;
      if (hass?.user?.is_admin !== true || hass.connected === false || hass.connection?.connected === false ||
        (this._emailContextIdentity && !this._serverSchedules.online())) return null;
      if (this._backendConfigRead) return this._backendConfigRead;
      if (!hass?.callWS) { this._emailBackendChecked = true; this._emailBackendAvailable = false; return null; }
      const token = this._emailContextToken();
      const operation = (async () => {
        try {
          const resp = await this._emailReadonlyWs(hass, { type: 'ha_tools_email/get_config' });
          if (!this._emailContextCurrent(token)) return null;
          this._emailBackendChecked = true;
          this._emailBackendMissing = false;
          this._emailBackendConfig = resp || {};
          this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : [];
          this._emailBackendError = null;
          if (resp?.default_recipient && !this._config.recipient && !this._detectedRecipient) this._detectedRecipient = resp.default_recipient;
          let reportsUnsupported = false;
          const previews = {};
          await Promise.all(['daily', 'weekly', 'monthly'].map(async cadence => {
            try { previews[cadence] = await this._emailReadonlyWs(hass, { type: 'ha_tools_email/preview_energy_report', cadence }); }
            catch (e) { previews[cadence] = null; if (e?.code === 'unknown_command') reportsUnsupported = true; }
          }));
          if (!this._emailContextCurrent(token)) return null;
          this._backendReportPreviews = previews;
          this._emailBackendReportsUnsupported = reportsUnsupported;
          this._emailBackendAvailable = true;
          this._render();
          return resp;
        } catch (e) {
          if (!this._emailContextCurrent(token)) return null;
          this._emailBackendChecked = true; this._emailBackendAvailable = false;
          this._emailBackendConfig = null; this._emailSchedules = [];
          this._emailBackendMissing = e?.code === 'unknown_command';
          this._emailBackendError = 'Email configuration read unavailable';
          if (options.showErrors) this._showToast(this._lang === 'pl' ? 'Nie udało się odczytać konfiguracji email.' : 'Email configuration could not be read.');
          this._render(); return null;
        }
      })();
      this._backendConfigRead = operation;
      try { return await operation; } finally { if (this._backendConfigRead === operation) this._backendConfigRead = null; }
    }

    async _refreshBackendSchedules() {
      this._serverSchedules.setContext(this._hass);
      return this._serverSchedules.refresh();
    }

    _getEnergySchedule(cadence) {
      return this._serverSchedules.model().rows.find(s => s.kind === 'energy_report' && s.cadence === cadence) || (this._emailSchedules || []).find(s => s && s.kind === 'energy_report' && s.cadence === cadence) || null;
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
      const recipients = this._serverSchedules.recipientsFor(schedule?.id) ?? (Array.isArray(schedule?.recipients) ? schedule.recipients : []);
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
          const token = this._emailContextToken(), source = this._hass;
          source.callWS({ type: 'config/config_entries' }).then(entries => {
            if (!this._emailContextCurrent(token)) return;
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
      if (this._hass?.user?.is_admin !== true) return '';
      if (this._config.recipient) return this._config.recipient;
      if (this._detectedRecipient) return this._detectedRecipient;
      return '';
    }

    async _saveRecipient(email) {
      const token = this._emailContextToken();
      if (!await this._saveToHelper('recipient', email)) return false;
      if (!this._emailContextCurrent(token)) return false;
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
      if (['error', 'no_data', 'no_sources'].includes(this[`_periodStatus_${period}`])) return [];
      const cached = this[`_periodCache_${period}`];
      return Array.isArray(cached) ? [...cached].sort((a, b) => b.month - a.month) : [];
    }

    async _fetchRecorderStats(period) {
      if(!this._analysisLegacyAllowedV53())return;
      const hours = { day: 24, week: 168, month: 720 }[period];
      if (!hours || !this._hass?.callWS) return;
      const cacheKey = `_periodCache_${period}`;
      const statusKey = `_periodStatus_${period}`;
      const read = this._createEnergyReadV3();
      this[statusKey] = 'no_data';
      const end = new Date(Math.floor(Date.now() / 3600000) * 3600000);
      const start = new Date(end.getTime() - hours * 3600000);
      this[`_periodWindow_${period}`] = { start: start.toISOString(), end: end.toISOString() };
      try {
        const prefs = await read.hass.callWS({ type: 'energy/get_prefs' });
        const ids = energyImportIds(prefs);
        if (!ids.length) { this[statusKey] = 'no_sources'; return; }
        const rawMetadata = await read.hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: ids });
        const metadata = Array.isArray(rawMetadata) ? Object.fromEntries(rawMetadata.map(row => [row.statistic_id, row])) : (rawMetadata || {});
        const stats = await read.hass.callWS({ type: 'recorder/statistics_during_period',
          start_time: start.toISOString(), end_time: end.toISOString(), statistic_ids: ids,
          period: 'hour', types: ['change'] });
        await this._loadSharedTariffProfile();
        if (!read.current()) return false;
        const result = [], measured = [], coverage = [];
        let unsupported = false;
        const hasSamples = ids.some(id => stats?.[id]?.length);
        for (const id of ids) {
          const meta = metadata[id];
          const unit = meta?.statistics_unit_of_measurement || meta?.unit_of_measurement;
          if (meta?.has_sum !== true || !energyFactor(unit) || (meta.unit_class && meta.unit_class !== 'energy')) {
            unsupported = true;
            coverage.push({ id, measuredHours: 0, expectedHours: hours, complete: false, status: 'unsupported' });
            continue;
          }
          const buckets = new Map(), rejected = new Set();
          let invalid = false;
          for (const point of stats?.[id] || []) {
            const stamp = energyTimestamp(point.start);
            const change = typeof point.change === 'number' ? point.change : NaN;
            if (!Number.isFinite(stamp) || stamp < start.getTime() || stamp >= end.getTime() ||
                (stamp - start.getTime()) % 3600000 !== 0 || buckets.has(stamp) || rejected.has(stamp) || !Number.isFinite(change) || change < 0) {
              invalid = true;
              if (Number.isFinite(stamp)) { buckets.delete(stamp); rejected.add(stamp); }
              continue;
            }
            buckets.set(stamp, change);
          }
          const complete = buckets.size === hours && !invalid;
          coverage.push({ id, measuredHours: buckets.size, expectedHours: hours, complete, status: complete ? 'ready' : 'partial' });
          if (!buckets.size) continue;
          const kwh = [...buckets.values()].reduce((sum, value) => sum + value * energyFactor(unit), 0);
          measured.push({ id, unit, buckets });
          result.push({ name: read.hass.states?.[id]?.attributes?.friendly_name || meta.name || id,
            key: id, entity_id: id, month: kwh, lastMonth: null, complete,
            measuredHours: buckets.size, expectedHours: hours,
            cost: complete ? this._bucketCost(buckets, unit) : null, source: 'recorder' });
        }
        if (!read.current()) return false;
        this[`_periodRaw_${period}`] = measured;
        this[cacheKey] = result;
        this[`_periodCoverage_${period}`] = { measuredHours: coverage.reduce((sum, row) => sum + row.measuredHours, 0), expectedHours: ids.length * hours, sources: coverage };
        this[statusKey] = coverage.every(row => row.complete) ? 'ready' : unsupported ? 'unsupported' : hasSamples ? 'partial' : 'no_data';
        this[`_periodCacheTime_${period}`] = Date.now();
      } catch (e) {
        if (!read.current()) return false;
        this[statusKey] = 'error';
        console.warn('Energy Email: complete Recorder period data unavailable');
      } finally {
        if (read.current()) this._initialMeasurementsSettledV3 = true;
      }
    }

    // Coalesce refreshes and retry unavailable data without polling every HA update.
    async _fetchAllPeriodStats() {
      if(!this._analysisLegacyAllowedV53())return;
      if (this._periodRefreshPromise) return this._periodRefreshPromise;
      let interrupted = false;
      this._lastPeriodRefresh = Date.now();
      // One accepted source/window epoch for each complete period; no cross-period race.
      this._periodRefreshPromise = (async () => {
        for (const period of ['day', 'week', 'month']) {
          if (await this._fetchRecorderStats(period) === false) {
            // A stale tab/mount read supplied no current data. Keep the next
            // normal hass update eligible. Only an unfinished first load
            // resumes after this complete refresh releases its occupancy.
            this._lastPeriodRefresh = 0;
            interrupted = true;
            break;
          }
        }
      })();
      try { await this._periodRefreshPromise; }
      finally {
        this._periodRefreshPromise = null;
        if (interrupted && !this._initialMeasurementsSettledV3 && this._activeTab === 'overview') queueMicrotask(() => {
          const guard = this._getTariffHostV3().guard;
          if (this.isConnected && guard.available(guard.observe())) {
            this._fetchAllPeriodStats().then(() => { if (this.isConnected) this._render(); }).catch(() => {});
          }
        });
      }
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

    _clearActionFocus() {
      const pending = this._actionFocus;
      if (!pending) return;
      this.ownerDocument.removeEventListener('focusin', pending.onFocus, true);
      this.ownerDocument.defaultView.removeEventListener('blur', pending.onBlur);
      this.ownerDocument.defaultView.removeEventListener('offline', pending.onBlur);
      pending.context.connection?.removeEventListener?.('disconnected', pending.onBlur);
      pending.context.connection?.removeEventListener?.('ready', pending.onBlur);
      this._actionFocus = null;
    }

    _rememberActionFocus(id) {
      const origin = this.shadowRoot.activeElement;
      if (!this.isConnected || origin?.id !== id) return;
      this._clearActionFocus();
      const pending = { id, anchor: origin, tab: this._activeTab, context: this._emailContextToken() };
      // A late response must not undo the user's move away, even a brief one.
      pending.onFocus = event => { if (!event.composedPath().includes(pending.anchor)) this._clearActionFocus(); };
      pending.onBlur = () => this._clearActionFocus();
      this._actionFocus = pending;
      this.ownerDocument.addEventListener('focusin', pending.onFocus, true);
      this.ownerDocument.defaultView.addEventListener('blur', pending.onBlur);
      this.ownerDocument.defaultView.addEventListener('offline', pending.onBlur);
      pending.context.connection?.addEventListener?.('disconnected', pending.onBlur);
      pending.context.connection?.addEventListener?.('ready', pending.onBlur);
    }

    _checkActionFocus() {
      const pending = this._actionFocus;
      if (pending && (!this.isConnected || pending.tab !== this._activeTab ||
          !this._emailContextCurrent(pending.context) || this.shadowRoot.activeElement !== pending.anchor)) this._clearActionFocus();
    }

    _restoreActionFocus() {
      const pending = this._actionFocus;
      if (!pending) return;
      const root = this.shadowRoot;
      const visible = el => el && !el.disabled && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const legacy = /^(enable|disable)-(daily|weekly|monthly)$/.test(pending.id);
      const busy = legacy ? !!this._automationRequest : pending.id === 'btn-smtp-test' ? this._smtpTesting : this._sending;
      const alternate = legacy ? root.getElementById(pending.id.replace(/^(enable|disable)/, value => value === 'enable' ? 'disable' : 'enable')) : null;
      const anchor = root.getElementById('tab-content');
      const target = busy ? anchor : [root.getElementById(pending.id), alternate, root.getElementById('email-tab-' + pending.tab), root.getElementById('email-tab-select'), anchor].find(visible);
      if (visible(target)) { pending.anchor = target; target.focus({ preventScroll: true }); }
      if (!busy || root.activeElement !== pending.anchor) this._clearActionFocus();
    }

    _render() {
      if (!this._hass) return;
      const periodFormat = createFormatUi();
      const periodContext = this._getTariffHostV3().guard.snapshot();
      const periodUi = periodFormat.capturePeriods(this.shadowRoot, this._periodUiContextV4, periodContext);
      this._periodUiContextV4 = periodContext;
      this._checkActionFocus();
      const renderToken = this._emailContextVersion;
      const focus = this.shadowRoot.activeElement;
      const focusId = focus?.id;
      const selection = typeof focus?.selectionStart === 'number' ? [focus.selectionStart, focus.selectionEnd, focus.selectionDirection] : null;
      const formFields = [...this.shadowRoot.querySelectorAll('input[id], select[id], textarea[id]')]
        .filter(field => !field.id.startsWith('schedule-') && field.id !== 'email-tab-select')
        .map(field => ({ id: field.id, value: field.value, checked: field.checked }));
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const analysisOverview = this._activeTab === 'overview' && !this._analysisHostV53?.legacyAllowed();
      const recipientDisplay = analysisOverview ? (L ? 'Analiza energii' : 'Energy analysis') : this._activeTab==='preview' ? (L ? 'Raport energii w Home Assistant' : 'Energy report in Home Assistant') : recipient
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
          .card { container-type: inline-size; container-name: energy-card; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-md); padding: 20px; box-shadow: var(--bento-shadow-sm); box-sizing: border-box; max-width: 100%; overflow: hidden; }
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
          .stat-label { font-size:12px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
          .stat-sub { font-size:12px; color: var(--bento-text-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .stat-sub.source-coverage { white-space: normal; overflow-wrap: anywhere; }
          .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
          .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .device-row:hover { background: var(--bento-primary-light); }
          .device-name { flex: 1; font-size: 13px; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .device-val { font-size: 12px; font-weight: 600; color: var(--bento-primary); min-width: 70px; text-align: right; white-space: nowrap; flex-shrink: 0; }
          .device-bar-wrap { flex: 1; background: var(--bento-border); border-radius: 4px; height: 6px; overflow: hidden; }
          .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
          .schedule-card { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 10px; box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .schedule-card .config-input { box-sizing: border-box; min-width: 0; max-width: 100%; }
          .schedule-card input:not([type="checkbox"]), .schedule-card select { min-height: 44px; min-width: 44px; box-sizing: border-box; }
          .schedule-toggle { display: inline-flex; align-items: center; min-height: 44px; min-width: 44px; gap: 8px; cursor: pointer; }
          .schedule-toggle input[type="checkbox"] { width: 24px; height: 24px; flex: 0 0 24px; margin: 0; }
          .schedule-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; overflow: hidden; }
          .schedule-name { font-size: 14px; font-weight: 600; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size:12px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
          .badge-ok { background: var(--bento-success-light); color: var(--energy-value-green,#166534); }
          .badge-er { background: var(--bento-error-light); color: var(--energy-value-red,#b91c1c); }
          .badge-wa { background: var(--bento-warning-light); color: var(--energy-value-amber,#92400e); }
          .badge-pr { background: var(--bento-primary-light); color: var(--bento-text); }
          .badge-auto { background: rgba(139,92,246,.1); color: var(--energy-value-purple,#6d28d9); }
          .schedule-meta { font-size: 12px; color: var(--bento-text-secondary); }
          .schedule-meta span { margin-right: 12px; }
          .btn-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
          .btn { padding: 8px 16px; border-radius: var(--bento-radius-xs); border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; }
          .btn:hover { background: var(--bento-bg); }
          .btn:disabled { opacity: .45; cursor: not-allowed; }
          .btn-primary { background: var(--bento-primary) !important; color: var(--bento-on-primary,#fff) !important; border-color: var(--bento-primary) !important; box-shadow: 0 2px 8px rgba(59,130,246,.3); }
          .btn-primary:hover { background: var(--bento-primary-hover) !important; }
          .btn-ok { background: var(--energy-success-button,#166534) !important; color: #fff !important; border-color: var(--energy-success-button,#166534) !important; }
          .smtp-section { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
          .smtp-missing { border-color: #f59e0b40; background: #fef3c720; }
          .smtp-header { display: flex; align-items: center; gap: 12px; }
          .smtp-icon { font-size: 24px; }
          .smtp-title { font-weight: 700; font-size: 14px; color: var(--bento-text); }
          .smtp-detail { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }
          .smtp-detail code { background: var(--bento-border); padding: 1px 6px; border-radius: 4px; font-size:12px; }
          .smtp-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
          .smtp-guide { margin-top: 16px; }
          .guide-title { font-weight: 700; font-size: 14px; margin-bottom: 12px; color: var(--bento-text); }
          .guide-steps { display: flex; flex-direction: column; gap: 16px; }
          .guide-step { display: flex; gap: 12px; }
          .step-num { flex-shrink: 0; width: 28px; height: 28px; background: var(--bento-primary); color: var(--bento-on-primary,#fff); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
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
          .preview-table th { background: var(--bento-border); padding: 5px 8px; text-align: left; font-weight: 600; font-size:12px; }
          .preview-table td { padding: 5px 8px; border-bottom: 1px solid var(--bento-border); }
          .preview-table tr:last-child td { border-bottom: none; }
          .trend-up { color: var(--energy-value-red,#b91c1c); }
          .trend-down { color: var(--energy-value-green,#166534); }
          .pagination-row { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px 0 4px; }
          .pagination-btn { padding: 6px 14px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-bg); color: var(--bento-text); font-size: 12px; cursor: pointer; transition: all .15s; }
          .pagination-btn:hover:not([disabled]) { background: var(--bento-primary-light); border-color: var(--bento-primary); color: var(--bento-primary); }
          .pagination-btn[disabled] { opacity: 0.4; cursor: not-allowed; }
          .pagination-info { font-size: 12px; color: var(--bento-text-secondary); }
          .info-row { display: flex; gap: 6px; align-items: flex-start; padding: 10px; background: var(--bento-primary-light); border-radius: var(--bento-radius-xs); margin-bottom: 12px; font-size: 12px; color: var(--bento-text); }
          .info-warn { background: var(--bento-warning-light); }
          .auto-on { color: var(--energy-value-green,#166534); }
          .auto-off { color: var(--energy-value-red,#b91c1c); }
          .auto-unknown { color: var(--energy-value-amber,#92400e); }
          .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: 6px; vertical-align: middle; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .last-sent { font-size:12px; color: var(--bento-text); margin-top: 4px; }
          .empty-state { text-align: center; padding: 32px 20px; }
          .empty-state .big { font-size: 40px; margin-bottom: 12px; }
          .empty-state .title { font-size: 15px; font-weight: 600; color: var(--bento-text); margin-bottom: 6px; }
          .empty-state .desc { font-size: 13px; color: var(--bento-text-secondary); line-height: 1.6; max-width: 400px; margin: 0 auto; }
          .source-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 10px; font-size:12px; font-weight: 600; margin-left: 6px; }
          .source-auto { background: rgba(139,92,246,.1); color: var(--energy-value-purple,#6d28d9); }
          .email-setup { background: var(--bento-warning-light); border: 1px solid rgba(245,158,11,.3); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 16px; }
          .email-setup-title { font-size: 13px; font-weight: 600; color: var(--bento-text); margin-bottom: 8px; }
          .email-input-row { display: flex; gap: 8px; align-items: center; }
          .email-input { flex: 1; padding: 8px 12px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 13px; font-family: 'Inter', sans-serif; background: var(--bento-card); color: var(--bento-text); outline: none; }
          .email-input:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px var(--bento-primary-light); }
          .email-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 12px; background: var(--bento-success-light); border-radius: var(--bento-radius-xs); font-size: 12px; color: var(--bento-text); }
          .email-edit-btn { background: none; border: none; color: var(--bento-primary); cursor: pointer; font-size:12px; padding: 2px 6px; font-family: 'Inter', sans-serif; }
          .email-edit-btn:hover { text-decoration: underline; }
          .source-manual { background: var(--bento-success-light); color: var(--energy-value-green,#166534); }
          .config-section { margin-bottom: 20px; }
          .config-section-title { font-size: 13px; font-weight: 700; color: var(--bento-text); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
          .device-toggle { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
          .device-toggle:hover { background: var(--bento-primary-light); }
          .device-toggle label { flex: 1; font-size: 13px; color: var(--bento-text); cursor: pointer; display: flex; align-items: center; gap: 8px; }
          .device-toggle .dt-val { font-size:12px; color: var(--bento-text-secondary); min-width: 60px; text-align: right; }
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
          .device-count { font-size:12px; color: var(--bento-text-muted); font-weight: 400; }
          @media (max-width: 768px) {
            .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
            .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
            .card { padding: 14px; }
            .grid3 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .grid2 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .stat-value { font-size: 18px; }
            .stat-label { font-size:12px; }
          }
          @media (max-width: 480px) {
            .tabs { gap: 1px; }
            .tab-btn { padding: 5px 8px; font-size:12px; }
            .grid3 { grid-template-columns: 1fr; gap: 8px; }
            .grid2 { grid-template-columns: 1fr; gap: 8px; }
            .stat-value { font-size: 16px; }
          }



          ${this._getTariffHostV3().ui().css}
          .email-action-result{padding:12px;border:1px solid var(--bento-border);border-radius:10px;margin:12px 0;overflow-wrap:anywhere}
          .email-action-result p{margin:8px 0 0;line-height:1.5}
          .card a{color:#2563eb;text-underline-offset:2px}
          :host(.bento-dark) .card a{color:#93c5fd}
          :host .ht-result-state--not_checked,:host .ht-result-state--no_data{color:var(--bento-text-secondary,#64748b)}
          .card button,.card select{min-height:44px;min-width:44px;box-sizing:border-box}
          .card :is(button,input,select,[tabindex]):focus-visible{outline:3px solid var(--bento-primary);outline-offset:2px}
          .header>div:last-child{min-width:0}.header-sub{overflow-wrap:anywhere}
          #price-display:is(button){font:inherit;white-space:normal;overflow-wrap:anywhere;max-width:100%;padding:8px;border:1px dashed var(--bento-primary);border-radius:8px;background:var(--bento-card);color:var(--bento-primary);cursor:pointer}
          .price-inline{display:inline-flex;align-items:center;flex-wrap:wrap;gap:4px;max-width:100%}
          .price-inline input{min-height:44px;box-sizing:border-box}
          .card .tabs{display:flex;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;max-width:100%;padding-inline:12px;scroll-padding-inline:12px;mask-image:linear-gradient(to right,transparent,#000 12px,#000 calc(100% - 12px),transparent);-webkit-mask-image:linear-gradient(to right,transparent,#000 12px,#000 calc(100% - 12px),transparent)}
          .card .tab-btn{white-space:nowrap;overflow-wrap:normal;flex:0 0 auto;min-height:44px;min-width:44px}
          .email-tab-picker{display:none}
          .history-actions{display:flex;flex-wrap:wrap;gap:8px}
          .history-actions button{padding:10px 14px;border:1px solid var(--bento-border);border-radius:10px;background:var(--bento-card);color:var(--bento-text);font:inherit;cursor:pointer}
          .history-actions button:focus-visible{outline:3px solid var(--bento-primary);outline-offset:2px}
          .attempt-history p{line-height:1.55}.history-records{font-size:14px}
          .attempt-history{overflow-wrap:anywhere;color:var(--bento-text)}
          .history-records{width:100%;border-collapse:collapse}
          .history-records th,.history-records td{padding:10px;text-align:left;border-bottom:1px solid var(--bento-border);overflow-wrap:anywhere}
          @container energy-card (max-width:499px){
            .history-records thead{position:absolute;clip-path:inset(50%);width:1px;height:1px;overflow:hidden}
            .history-records,.history-records tbody{display:block}
            .history-records tbody tr{display:block;border:1px solid var(--bento-border);border-radius:10px;margin-block:12px;padding:8px}
            .history-records tbody td{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:10px;border:0;padding:8px}
            .history-records tbody td::before{content:attr(data-label);font-weight:600}
          }
          @container energy-card (max-width:279px){.card .tabs{display:none !important}.email-tab-picker{display:block}.email-tab-picker select{width:100%}}

  </style>

        <div class="card">
          <div class="header">
            <div class="header-icon">\u{1F4E7}</div>
            <div>
              <div class="header-title">${_esc(this._config.title)}</div>
              <div class="header-sub">${recipientDisplay} ${analysisOverview || ['preview','config'].includes(this._activeTab) ? '' : `\u00A0\u2022\u00A0 ${this._hass?.user?.is_admin === true ? `<button type="button" id="price-display" aria-label="${L ? 'Edytuj taryfę energii' : 'Edit energy tariff'}">${_esc(this._tariffHeaderCurrencyV3())} ${_esc(this._getTariffLabel())} \u270E</button>` : `<span id="price-display">${_esc(this._tariffHeaderCurrencyV3())} ${_esc(this._getTariffLabel())}</span>`}`}</div>
            </div>
          </div>
          <label class="email-tab-picker">${L ? 'Widok' : 'View'}<select id="email-tab-select" aria-label="${L ? 'Widok' : 'View'}">${['overview','schedule','preview','send','config','history'].map((tab,i)=>({tab,i})).filter(({tab})=>this._hass?.user?.is_admin===true||['overview','preview'].includes(tab)).map(({tab,i})=>`<option value="${tab}" ${this._activeTab===tab?'selected':''}>${(L?['Przegląd','Harmonogram','Podgląd','Wyślij teraz','Ustawienia','Historia']:['Overview','Schedule','Preview','Send Now','Config','History'])[i]}</option>`).join('')}</select></label>
          <div class="tabs" role="tablist" aria-label="${L ? 'Widoki Energy Email' : 'Energy Email views'}">
            <button class="tab-btn ${this._activeTab === 'overview' ? 'active' : ''}" id="email-tab-overview" data-tab="overview">\u{1F4CA} ${L ? "Przegląd" : "Overview"}</button>
            ${this._hass?.user?.is_admin===true ? `<button class="tab-btn ${this._activeTab === 'schedule' ? 'active' : ''}" id="email-tab-schedule" data-tab="schedule">\u{1F4C5} ${L ? "Harmonogram" : "Schedule"}</button>` : ''}
            <button class="tab-btn ${this._activeTab === 'preview' ? 'active' : ''}" id="email-tab-preview" data-tab="preview">\u{1F4CB} ${L ? "Podgląd" : "Preview"}</button>
            ${this._hass?.user?.is_admin===true ? `<button class="tab-btn ${this._activeTab === 'send' ? 'active' : ''}" id="email-tab-send" data-tab="send">\u{1F4E4} ${L ? "Wyślij teraz" : "Send Now"}</button>` : ''}
            ${this._hass?.user?.is_admin===true ? `<button class="tab-btn ${this._activeTab === 'config' ? 'active' : ''}" id="email-tab-config" data-tab="config">\u2699\uFE0F ${L ? "Ustawienia" : "Config"}</button>` : ''}
            ${this._hass?.user?.is_admin===true ? `<button class="tab-btn ${this._activeTab === 'history' ? 'active' : ''}" id="email-tab-history" data-tab="history">${L ? 'Historia' : 'History'}</button>` : ''}
          </div>
          <div id="tab-content" tabindex="-1" role="region" aria-label="${(L ? {overview:'Przegląd',schedule:'Harmonogram',preview:'Podgląd',send:'Wyślij teraz',config:'Ustawienia',history:'Historia'} : {overview:'Overview',schedule:'Schedule',preview:'Preview',send:'Send Now',config:'Config',history:'History'})[this._activeTab] || 'Energy Email'}"></div>
          ${['preview','config'].includes(this._activeTab) ? '' : this._tariffDetailsMarkup()}
          ${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-email') ? OWN_SUPPORT_FOOTER : ''}
        </div>
        <div class="toast" id="toast"></div>
      `
      bindEnergySupport(this.shadowRoot, 'ha-energy-email', this._hass?.locale?.language || this._hass?.language);
      this.shadowRoot.querySelectorAll('.tab-btn').forEach(t => {
        t.addEventListener('click', () => {
          this.setActiveTab(t.dataset.tab);
          history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this._activeTab);
        });
      });
      this.shadowRoot.getElementById('email-tab-select')?.addEventListener('change', event => this.setActiveTab(event.target.value));
      this._renderTab(true);
      if(!['preview','config'].includes(this._activeTab))this._bindTariffSettings();
      this._bindEmailEvents();
      this._bindPriceEdit();
      if (renderToken === this._emailContextVersion && (this._hass?.user?.is_admin === true || this._activeTab==='preview')) {
        for (const saved of formFields) { const field = this.shadowRoot.getElementById(saved.id); if (!field) continue;
          field.value = saved.value; if (typeof saved.checked === 'boolean') field.checked = saved.checked; }
        const target = focusId && this.shadowRoot.getElementById(focusId);
        if (!this._actionFocus && target && !target.disabled) { target.focus({ preventScroll: true }); if (selection && target.setSelectionRange) try { target.setSelectionRange(...selection); } catch (_) {} }
      }
      this._restoreActionFocus();
      periodFormat.restorePeriods(this.shadowRoot, periodUi);
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
          const token = this._emailContextToken();
          if (!await this._saveToHelper('recipient', '')) return;
          if (!this._emailContextCurrent(token)) return;
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
      if (Object.hasOwn(this._config, 'tariff_profile') || this._sharedTariffProfile != null || this._sharedTariffNeedsConfirmationV3()) {
        priceEl.addEventListener('click', () => {
          const details = root.querySelector('[data-tariff-details]');
          if (details) { details.open = true; this._bindTariffSettings(); (details.querySelector('input:not(:disabled),select:not(:disabled)') || details.querySelector('summary'))?.focus({ preventScroll: true }); }
        });
        return;
      }
      priceEl.addEventListener('click', (e) => {
        e.preventDefault();
        const L = this._lang === 'pl';
        const cur = this._getAvgRate();
        // Replace the price display with an inline input
        const token = this._emailContextToken(), tab = this._activeTab;
        const inputHtml = `<span class="price-inline">
          <span>${_esc(this._tariffCurrency())}</span>
          <input type="number" id="price-input" aria-label="${L ? 'Cena energii za kWh' : 'Energy price per kWh'}" value="${cur ?? ''}" step="0.01" min="0" style="width:70px;padding:3px 6px;border:1.5px solid var(--bento-primary);border-radius:4px;font-size:12px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;text-align:center">
          <span>/kWh</span>
          <button id="price-save" class="btn btn-primary" style="padding:3px 10px;font-size:12px;margin:0" aria-label="${L ? 'Zapisz' : 'Save'}">\u2714</button>
          <button id="price-cancel" class="btn" style="padding:3px 8px;font-size:12px;margin:0" aria-label="${L ? 'Anuluj' : 'Cancel'}">\u2716</button>
        </span>`;
        // Find just the price part and replace
        const priceSpan = root.getElementById('price-display');
        priceSpan.outerHTML = inputHtml;
        const input = root.getElementById('price-input');
        const saveBtn = root.getElementById('price-save');
        const cancelBtn = root.getElementById('price-cancel');
        if (input) input.focus();
        const ownsPriceFocus = () => tab === this._activeTab && /^price-(input|save|cancel)$/.test(root.activeElement?.id || '');
        const close = (returnFocus = ownsPriceFocus()) => {
          if (!this._emailContextCurrent(token)) return;
          this._render();
          if (returnFocus) root.getElementById('price-display')?.focus({ preventScroll: true });
        };
        const save = async () => {
          const val = parseFloat(input.value);
          if (Number.isFinite(val) && val >= 0) {
            if (!await this._saveToHelper('price', String(val)) || !this._emailContextCurrent(token)) return;
            const returnFocus = ownsPriceFocus();
            this._config.energy_price = val;
            this._observeTariffContextV3();
            this._repriceTariffV3();
            close(returnFocus);
          }
        };
        if (saveBtn) saveBtn.addEventListener('click', save);
        if (cancelBtn) cancelBtn.addEventListener('click', () => close());
        if (input) input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); save(); }
          if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
      });
    }

    _clearAnalysisLegacyV53() {
      for(const period of ['day','week','month']) {
        for(const key of ['Cache','Raw','Window','Coverage'])this[`_period${key}_${period}`]=null;
        this[`_periodStatus_${period}`]='no_data';this[`_periodCacheTime_${period}`]=0;
      }
      this._lastPeriodRefresh=0;
    }
    _loadAnalysisLegacyV53() {
      this._render();void this._fetchAllPeriodStats().then(()=>{if(this.isConnected)this._renderTab();});
    }
    _renderTab(fullRender = false) {
      if (!fullRender) this._checkActionFocus();
      const el = this.shadowRoot.getElementById('tab-content');
      if (!el) return;
      if(this._activeTab!=='preview')this._reportHostV53?.stop();
      if(this._activeTab!=='config')this._featureAccessV53?.stop();
      if(this._activeTab==='preview') {
        this._analysisHostV53?.stop();
        this._reportHostV53 ||= createEnergyReportV53({card:this,format:createFormatUi});
        // Reuse this root: report redraws preserve controls and focused selection.
        this._reportHostV53.mount(el);return;
      }
      if(this._activeTab==='overview' && !this._analysisLegacyAllowedV53()) {
        el.innerHTML='<div data-analysis-mount-v53></div>';this._syncAnalysisV53();return;
      }
      if(this._activeTab!=='overview')this._analysisHostV53?.stop();
      const periodFormat = createFormatUi();
      const periodContext = this._getTariffHostV3().guard.snapshot();
      const periodUi = periodFormat.capturePeriods(this.shadowRoot, this._periodUiContextV4, periodContext);
      this._periodUiContextV4 = periodContext;
      const focused = this.shadowRoot.activeElement, focusId = focused?.id;
      const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart,focused.selectionEnd,focused.selectionDirection] : null;
      const legacyFields = this._activeTab === 'schedule' ? [...el.querySelectorAll('input[id],select[id]')]
        .filter(field => /^(schedule-(?:time|recipients|enabled)-(?:daily|weekly|monthly)|time-(?:daily|weekly|monthly)|day-weekly)$/.test(field.id))
        .map(field => ({ id: field.id, value: field.value, checked: field.checked })) : [];
      if (this._hass?.user?.is_admin !== true && ['schedule', 'send', 'config', 'history'].includes(this._activeTab)) {
        el.innerHTML = `<div class="empty-state" role="status">${this._lang === 'pl' ? 'Tylko administrator może zmieniać ustawienia i wysyłać raporty. Podgląd energii jest dostępny w zakładce Przegląd.' : 'Only administrators can change settings and send reports. Energy data remains available in Overview.'}</div>`;
        return;
      }
      switch (this._activeTab) {
        case 'overview': el.innerHTML = this._tabOverview(); this._attachOverviewEvents(); this._getAnalysisHostV53().mount(el); break;
        case 'schedule': el.innerHTML = this._tabSchedule(); this._attachScheduleEvents(); break;
        case 'preview':  el.innerHTML = this._tabPreview(); this._bindMailControls(); this._bindMailFrame('manual-mail-frame', this._mailPreview.model().preview); break;
        case 'send':     el.innerHTML = this._tabSend(); this._attachSendEvents(); break;
        case 'config':   el.innerHTML = this._tabConfig(); this._attachConfigEvents(); break;
        case 'history': {
          const focusId = this.shadowRoot.activeElement?.id;
          el.innerHTML = this._attemptHistory.render(this._lang);
          el.querySelector('#history-refresh')?.addEventListener('click', () => this._refreshAttemptHistory());
          el.querySelector('#history-discard')?.addEventListener('click', () => this._discardAttemptHistory());
          if (focusId) this.shadowRoot.getElementById(focusId)?.focus({preventScroll:true});
          break;
        }
      }
      this.shadowRoot.getElementById('btn-smtp-test')?.addEventListener('click', () => this._testSmtp());
      for (const saved of legacyFields) { const field = this.shadowRoot.getElementById(saved.id); if (!field) continue;
        field.value = saved.value; if (typeof saved.checked === 'boolean') field.checked = saved.checked; }
      if (focusId && !this._actionFocus) {
        let target = this.shadowRoot.getElementById(focusId);
        if ((!target || target.disabled) && focusId.startsWith('overview-page-')) target = this.shadowRoot.getElementById('overview-period-' + this._overviewPeriod);
        if (target && !target.disabled) { target.focus({ preventScroll: true }); if (selection && target.setSelectionRange) try { target.setSelectionRange(...selection); } catch (_) {} }
      }
      if (!fullRender) this._restoreActionFocus();
      const m = this._serverSchedules.model();
      if (this._scheduleSaveFocus && !m.writing && !m.reading) {
        const index = m.rows.filter(row => row.kind === 'energy_report').findIndex(row => row.id === this._scheduleSaveFocus);
        const target = m.status.reason === 'saved' && index >= 0 ? this.shadowRoot.getElementById('schedule-edit-' + index) : this.shadowRoot.getElementById('schedule-save');
        const outerActive = this.getRootNode().activeElement;
        if (target && !target.disabled && (!outerActive || outerActive === this || outerActive === this.ownerDocument.body)) target.focus({ preventScroll: true });
        this._scheduleSaveFocus = null;
      }
      periodFormat.restorePeriods(this.shadowRoot, periodUi);
    }

    _updateLiveData() {
      // Preserve forms while the user edits settings or schedules.
      if (this._activeTab !== 'overview') return;
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
          this._observeTariffNavigationV3();
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
        btn.addEventListener('click', () => { this._reportPeriod = btn.dataset.period; this._observeTariffNavigationV3(); this._renderTab(); });
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
      const complete = this[`_periodStatus_${period}`] === 'ready';
      const recordedEnergy = displayData.length ? displayData.reduce((sum, d) => sum + d.month, 0) : null;
      const totalEnergy = complete ? recordedEnergy : null;
      const coverage = this[`_periodCoverage_${period}`];
      const coverageNote = coverage ? `${coverage.measuredHours}/${coverage.expectedHours} ${L ? 'źródłogodzin' : 'source-hours'}` : '';
      const format = createFormatUi.forHass(this._hass);
      const periodMarkup = window ? format.periodMarkup({ ...window, sourceTimeZone:this._hass?.config?.time_zone, label: periodLabel, source: 'Energy Dashboard / Recorder',
        measured: coverage?.measuredHours, expected: coverage?.expectedHours, unit: L ? 'źródłogodzin' : 'source-hours',
        details: L ? 'Ruchome okno. Pokrycie liczone oddzielnie dla każdego skonfigurowanego źródła.' : 'Rolling window. Coverage counts each configured source separately.' }) : '';

      const totalCost = complete && displayData.length && displayData.every(d => typeof d.cost === 'number' && Number.isFinite(d.cost))
        ? displayData.reduce((sum, d) => sum + d.cost, 0) : null;
      const maxVal = Math.max(...displayData.map(x => x.month)) || 1;
      const periodBtns = ['day', 'week', 'month'].map(p => {
        const lb = p === 'total' ? (L ? 'Wszystko' : 'All') : p === 'day' ? '24h' : p === 'week' ? '7d' : '30d';
        return `<button class="overview-period-btn" id="overview-period-${p}" data-period="${p}" style="padding:5px 12px;font-size:12px;border-radius:6px;cursor:pointer;border:1px solid var(--bento-border);background:${period === p ? 'var(--bento-primary)' : 'var(--bento-bg)'};color:${period === p ? 'var(--bento-on-primary)' : 'var(--bento-text)'};font-weight:${period === p ? '600' : '400'};">${lb}</button>`;
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
          ${periodMarkup}`;
      }
      return `
        ${periodMarkup}
        <div class="info-row">${L ? 'Import z sieci: źródła skonfigurowane w Energy Dashboard.' : 'Grid import: sources configured in Energy Dashboard.'}</div>
        ${!complete ? `<div class="info-row" role="status">${L ? 'Zarejestrowane zużycie' : 'Recorded usage'}: ${format.number(recordedEnergy, {minimumFractionDigits:1, maximumFractionDigits:1})} kWh. ${L ? 'Niepełne dane — suma całego okresu niedostępna.' : 'Incomplete data — full-period total unavailable.'} ${_esc(coverageNote)} ${coverage?.sources?.some(row => row.status === 'unsupported') ? (L ? 'Co najmniej jedno źródło ma nieobsługiwane metadane energii.' : 'At least one source has unsupported energy metadata.') : ''}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div class="section-title" style="margin:0;">\u{1F4CA} ${periodLabel}</div>
          <div style="display:flex;gap:4px;">${periodBtns}</div>
        </div>
        <div class="grid3">
          <div class="stat">
            <div class="stat-value" style="color:var(--energy-value-amber)">${format.number(complete ? totalEnergy : recordedEnergy, {minimumFractionDigits:1, maximumFractionDigits:1})}</div>
            <div class="stat-label">${!complete ? (L ? 'Zarejestrowane zużycie · ' : 'Recorded usage · ') : ''}kWh ${periodLabel}</div>
            <div class="stat-sub source-coverage">${displayData.length}/${coverage?.sources?.length ?? displayData.length} ${L ? 'źródeł z pomiarami' : 'sources with measurements'}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:var(--energy-value-blue)">${this._formatCost(totalCost)}</div>
            <div class="stat-label">${_esc(this._tariffCurrency())} ${L ? 'Koszt' : 'Cost'}</div>
            <div class="stat-sub">@ ${_esc(this._getTariffLabel())}</div>
          </div>
          <div class="stat">
            <div class="stat-value" data-email-largest-import style="color:var(--energy-value-green,#166534)">${displayData.length > 0 ? _esc(displayData[0].name.split(' ').slice(0,2).join(' ')) : '-'}</div>
            <div class="stat-label">${L ? 'Największy import' : 'Largest Import'}</div>
            <div class="stat-sub">${displayData.length > 0 ? this._fmt(displayData[0].month, 1) + ' kWh' : ''}</div>
          </div>
        </div>
        <div class="section-title">\u26A1 ${L ? 'Import według źródła' : 'Import by Source'}</div>
        ${(() => {
          const perPage = this._devicesPerPage || 20;
          const totalPages = Math.ceil(displayData.length / perPage);
          const page = this._devicePage = Math.max(0, Math.min(this._devicePage || 0, totalPages - 1));
          const pageData = displayData.slice(page * perPage, (page + 1) * perPage);
          const rows = pageData.map(d => {
            const pct = maxVal > 0 ? (d.month / maxVal * 100) : 0;
            const diff = d.month - d.lastMonth;
            const diffStr = d.lastMonth > 0 && diff !== 0 ? `<span class="${diff > 0 ? 'trend-up' : 'trend-down'}">${diff > 0 ? '+' : ''}${this._fmt(diff, 1)} kWh</span>` : '';
            const entityInfo = d.entity_id ? `<span style="font-size:12px;color:var(--bento-text-muted)" title="${_esc(d.entity_id)}">${_esc((d.entity_id.split('.')[1] || d.entity_id).substring(0,20))}</span>` : '';
            return `<div class="device-row" title="${_esc(d.entity_id || d.name)}">
              <div class="device-name">${_esc(d.name)} ${entityInfo}${Number.isFinite(d.measuredHours) ? `<div class="helper">${d.measuredHours}/${d.expectedHours} ${L ? 'zmierzonych godzin' : 'measured hours'}</div>` : ''}</div>
              <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
              <div class="device-val">${this._fmt(d.month, 1)} kWh</div>
              <div style="font-size:12px;color:var(--bento-text-secondary);min-width:60px;text-align:right">${diffStr}</div>
            </div>`;
          }).join('');
          const pagination = totalPages > 1 ? `
            <div class="pagination-row">
              <button class="pagination-btn" id="overview-page-prev" data-page-prev ${page === 0 ? 'disabled' : ''}>\u2190 ${L ? 'Poprzednia' : 'Prev'}</button>
              <span class="pagination-info">${L ? 'Strona' : 'Page'} ${page + 1} / ${totalPages}</span>
              <button class="pagination-btn" id="overview-page-next" data-page-next ${page >= totalPages - 1 ? 'disabled' : ''}>${L ? 'Nast\u0119pna' : 'Next'} \u2192</button>
            </div>` : '';
          return rows + pagination;
        })()}`;
    }

    _tabSchedule() {
      return this._renderSmtpSection() + this._emailResultMarkup('send', this._sendResult) + `<button class="btn" id="email-config-refresh" type="button">${this._lang === 'pl' ? 'Odczytaj status SMTP' : 'Read SMTP status'}</button>` + this._renderEnergyCalendar() + this._renderLegacyScheduleTab(true);
    }

    _renderEnergyCalendar() {
      const m = this._serverSchedules.model(), pl = this._lang === 'pl', ui = this._getTariffHostV3().ui();
      const tr = (polish, english) => pl ? polish : english;
      const status = value => `<p role="status" aria-live="polite" data-state="${_esc(value.state)}">${ui.statusHtml(value.state)}</p>`;
      const reasons = { initial: tr('Nie odczytano harmonogramów.', 'Schedules have not been read.'), loading: tr('Odczytywanie…', 'Reading…'),
        loaded: tr('Dane odczytane z serwera.', 'Data read from the server.'), saving: tr('Zapisywanie…', 'Saving…'),
        saved: tr('Zapis potwierdzony niezależnym odczytem wszystkich edytowanych pól.', 'Save confirmed by independent readback of all edited fields.'),
        deleted: tr('Usunięcie potwierdzone niezależnym odczytem.', 'Deletion confirmed by independent readback.'),
        readback_mismatch: tr('Nie potwierdzono zapisu. Nie zapisuj ponownie; odśwież odczyt.', 'Save not confirmed. Do not repeat the write; refresh the read.'),
        write_unknown: tr('Wynik zapisu nieznany. Odśwież odczyt; ponowny zapis jest zablokowany.', 'Save outcome unknown. Refresh the read; another write is locked.'),
        unavailable: tr('Kalendarz niedostępny. Wymagana integracja HA Tools Email 2.2.0+. Zaktualizuj ją i odśwież świadomie.', 'Calendar unavailable. HA Tools Email 2.2.0+ is required. Update it and refresh explicitly.'),
        read_timeout: tr('Odczyt przekroczył limit czasu. Odśwież świadomie.', 'Read timed out. Refresh explicitly.'),
        read_failed: tr('Odczyt niepotwierdzony. Odśwież świadomie.', 'Read not confirmed. Refresh explicitly.'),
        save_rejected: tr('Serwer odrzucił zapis.', 'Server rejected the save.'), invalid_fields: tr('Sprawdź godzinę i dzień.', 'Check time and day.'),
        invalid_timezone: tr('Podaj poprawną strefę IANA.', 'Enter a valid IANA timezone.'), invalid_recipients: tr('Sprawdź odbiorców.', 'Check recipients.'),
        id_unavailable: tr('Nie można utworzyć bezpiecznego ID.', 'A safe ID cannot be created.') };
      const cadence = value => ({ daily: tr('Codziennie', 'Daily'), weekly: tr('Co tydzień', 'Weekly'), monthly: tr('Co miesiąc', 'Monthly') })[value] || tr('Nieznane', 'Unknown');
      const days = pl ? ['Poniedziałek','Wtorek','Środa','Czwartek','Piątek','Sobota','Niedziela'] : ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
      const busy = m.reading || m.writing || m.locked, editable = this._serverSchedules.online() && !busy && ['success','no_data','error'].includes(m.status.state);
      const rows = m.rows.filter(row => row.kind === 'energy_report'), d = m.draft;
      const field = (id, label, type, value, extra = '') => `<label for="${id}">${label}<input id="${id}" type="${type}" value="${_esc(value)}" ${extra} ${busy ? 'disabled' : ''}></label>`;
      const select = (id, label, values, selected) => `<label for="${id}">${label}<select id="${id}" ${busy ? 'disabled' : ''}>${values.map(([value,label]) => `<option value="${_esc(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${_esc(label)}</option>`).join('')}</select></label>`;
      const editor = d ? `<fieldset class="schedule-editor"><legend>${tr('Edycja harmonogramu energii','Edit energy schedule')}</legend><p>ID: ${_esc(d.id)}</p><div class="server-schedule-fields">
        ${select('schedule-cadence',tr('Częstotliwość','Cadence'),['daily','weekly','monthly'].map(c=>[c,cadence(c)]),d.cadence)}
        ${field('schedule-time',tr('Godzina lokalna (HH:MM)','Local wall time (HH:MM)'),'time',d.time,'required')}
        ${field('schedule-timezone',tr('Strefa IANA (puste: strefa HA)','IANA timezone (blank: HA timezone)'),'text',d.timezone,'maxlength="128"')}
        ${d.cadence === 'weekly' ? select('schedule-weekday',tr('Dzień tygodnia','Weekday'),days.map((v,i)=>[i,v]),d.weekday) : ''}
        ${d.cadence === 'monthly' ? field('schedule-month-day',tr('Dzień miesiąca (1–31)','Day of month (1–31)'),'number',d.month_day,'min="1" max="31" step="1"') : ''}
        ${field('schedule-recipients',tr('Odbiorcy (przecinki; puste: konfiguracja centralna)','Recipients (commas; blank: central configuration)'),'text',(this._serverSchedules.recipientModel() || []).join(', '))}
        <label class="schedule-checkbox" for="schedule-enabled"><input type="checkbox" id="schedule-enabled" ${d.enabled ? 'checked' : ''} ${busy ? 'disabled' : ''}>${tr('Włączony','Enabled')}</label></div>
        <p>${tr('Nowy harmonogram jest wyłączony. Zapis włączonego harmonogramu uruchamia przyszłe wysyłki.','A new schedule is disabled. Saving an enabled schedule activates future deliveries.')}</p>
        <div class="server-schedule-actions"><button id="schedule-save" type="button" ${editable ? '' : 'disabled'}>${tr('Zapisz','Save')}</button><button id="schedule-cancel" type="button">${tr('Anuluj','Cancel')}</button>
        <button id="schedule-preview" type="button" ${m.previewing || m.writing || !this._serverSchedules.online() ? 'disabled' : ''}>${tr('Podgląd okresu (tylko odczyt)','Preview period (readonly)')}</button></div></fieldset>` : '';
      const p = m.preview, number = value => value === null ? tr('Brak danych','No data') : this._fmt(value, 2);
      const basis = p?.priceBasis === 'gross' ? tr('brutto','gross') : p?.priceBasis === 'net' ? tr('netto','net') : tr('nieznana','unknown');
      const preview = p?.html !== undefined ? status(m.previewStatus) + this._renderMailFrame(p, 'schedule-mail-frame') : p ? `<section class="schedule-preview"><h4>${tr('Podgląd kalendarza energii','Energy calendar preview')}</h4>${status(m.previewStatus)}
        <p>${tr('Poprzedni zakończony okres kalendarzowy; koniec przedziału jest wyłączny.','Previous completed calendar period; the end is exclusive.')}</p>
        <dl><dt>${tr('Od / do','From / to')}</dt><dd>${_esc(p.period.start)} / ${_esc(p.period.end)}</dd>
        <dt>${tr('Efektywna strefa raportu','Effective report timezone')}</dt><dd>${_esc(p.effective_timezone)}</dd>
        <dt>${tr('Źródła importu z sieci (Energy Dashboard)','Grid import sources (Energy Dashboard)')}</dt><dd>${p.source_count}</dd>
        <dt>${tr('Pokrycie: status danych Recorder','Coverage: Recorder data status')}</dt><dd>${_esc(p.status === 'ready' ? tr('Kompletne','Complete') : p.status === 'partial' ? tr('Częściowe','Partial') : tr('Niedostępne','Unavailable'))}</dd>
        <dt>${tr('Import energii','Energy import')}</dt><dd>${number(p.total_kwh)} kWh</dd>
        <dt>${tr('Koszt energii','Energy cost')}</dt><dd>${number(p.energyCost)} ${_esc(p.currency ?? '')}</dd>
        <dt>${tr('Opłaty zmienne','Variable fees')}</dt><dd>${number(p.variableCost)} ${_esc(p.currency ?? '')}</dd>
        <dt>${tr('Koszt zużycia','Usage cost')}</dt><dd>${number(p.usageCost)} ${_esc(p.currency ?? '')}</dd>
        <dt>${tr('Opłata stała miesięczna (osobno, bez proporcji)','Fixed monthly fee (separate, not prorated)')}</dt><dd>${number(p.fixedMonthly)} ${_esc(p.currency ?? '')}</dd>
        <dt>${tr('Koszt raportu ze źródła','Report cost from source')}</dt><dd>${number(p.total_cost)} ${_esc(p.currency ?? '')}</dd>
        <dt>${tr('Podstawa / kompletność taryfy','Basis / tariff completeness')}</dt><dd>${basis} / ${p.tariff_complete === true ? tr('Kompletna','Complete') : p.tariff_complete === false ? tr('Częściowa','Partial') : tr('Nieznana','Unknown')}</dd></dl>
        <p>${tr('Zegar taryfy pozostaje niezależny od strefy kalendarza raportu. Podgląd nie wysyła emaila ani nie zapisuje historii.','The tariff clock remains independent of the report calendar timezone. Preview does not send email or save history.')}</p></section>` :
        m.previewStatus.reason !== 'initial' ? `<section class="schedule-preview">${status(m.previewStatus)}<p>${_esc(reasons[m.previewStatus.reason] || reasons.read_failed)}</p></section>` : '';
      return `<style>${ui.css}
        .server-schedules{container-type:inline-size;container-name:energy-schedules;min-width:0;max-width:100%;overflow-wrap:anywhere}
        .server-schedule-list,.server-schedule-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
        .server-schedules article,.server-schedules fieldset{min-width:0;margin:12px 0;padding:12px;border:1px solid var(--bento-border);border-radius:10px}
        .server-schedules h3,.server-schedules h4{margin:12px 0 8px}
        .legacy-schedule-ids{min-width:0;max-width:100%;overflow-wrap:anywhere}
        .server-schedules button,.server-schedules input:not([type=checkbox]),.server-schedules select{min-height:44px;min-width:44px;box-sizing:border-box;font:inherit;border:1px solid var(--bento-border);border-radius:8px;color:var(--bento-text);background:var(--bento-bg)}
        .server-schedules input:not([type=checkbox]),.server-schedules select{display:block;width:100%;padding:8px}
        .server-schedules button{padding:8px 12px;cursor:pointer;white-space:normal;overflow-wrap:anywhere}
        .server-schedules button:disabled{cursor:default;color:var(--bento-text-secondary)}
        .server-schedules button:focus-visible,.server-schedules input:focus-visible,.server-schedules select:focus-visible{outline:3px solid var(--bento-primary);outline-offset:2px}
        .server-schedule-fields label{display:flex;flex-direction:column;gap:6px;min-width:0}
        .server-schedule-fields .schedule-checkbox{flex-direction:row;align-items:center;cursor:pointer}
        .server-schedule-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.server-schedules input[type=checkbox]{width:24px;height:24px}.server-schedules label{min-height:44px}
        .server-schedules dl{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:8px}.server-schedules dd{margin:0}
        @container energy-schedules (max-width:499.99px){.server-schedule-list,.server-schedule-fields,.server-schedules dl{grid-template-columns:minmax(0,1fr)}.server-schedule-actions button{flex:1 1 150px}}
      </style><section class="server-schedules"><h3>${tr('Kalendarz raportów energii','Energy report calendar')}</h3>${status(m.status)}<p>${_esc(reasons[m.status.reason] || reasons.read_failed)}</p>
      <div class="server-schedule-actions"><button id="schedule-refresh" type="button" ${m.reading || m.writing ? 'disabled' : ''}>${tr('Odśwież harmonogramy','Refresh schedules')}</button>
      <button id="schedule-new" type="button" ${editable && ['success','no_data'].includes(m.status.state) ? '' : 'disabled'}>${tr('Nowy harmonogram','New schedule')}</button></div>
      <p>${tr('Poniedziałek=0. Dzień 31 używa ostatniego dnia krótszego miesiąca. Nieistniejąca godzina DST przesuwa się do przodu o lukę; powtórzona używa pierwszego wystąpienia. Serwer wyznacza kolejny termin.','Monday=0. Day 31 uses the last day of a shorter month. A nonexistent DST time is shifted forward by the gap; repeated times use the first occurrence. The server determines the next fire time.')}</p>
      <div class="server-schedule-list">${rows.map((row,i)=>`<article><h4>${_esc(cadence(row.cadence))}</h4><p>ID: ${_esc(row.id)}</p><p>${_esc(row.time)} · ${row.enabled ? tr('Włączony','Enabled') : tr('Wyłączony','Disabled')} · ${_esc(row.effective_timezone ?? tr('Nieznana strefa','Unknown timezone'))}</p>
      <p>${tr('Kolejny termin','Next fire')}: ${_esc(row.next_fire ?? tr('Brak terminu','No scheduled fire'))}</p>
      ${row.cadence === 'weekly' ? `<p>${_esc(days[row.weekday] ?? tr('Nieznany dzień','Unknown weekday'))}</p>` : row.cadence === 'monthly' ? `<p>${tr('Dzień miesiąca','Day of month')}: ${_esc(row.month_day ?? '—')}</p>` : ''}
      <div class="server-schedule-actions"><button id="schedule-edit-${i}" type="button" data-calendar-edit="${_esc(row.id)}" ${editable ? '' : 'disabled'}>${tr('Edytuj','Edit')}</button>
      <button id="schedule-send-${i}" type="button" data-calendar-send="${_esc(row.id)}" ${busy || !this._serverSchedules.online() || this._sending || this._smtpRequest ? 'disabled' : ''}>${tr('Wyślij teraz — ','Send now — ')}${_esc(this._mailPeriodLabel(row.cadence, 'rolling'))}</button>
      <button id="schedule-send-calendar-${i}" type="button" data-calendar-period-send="${_esc(row.id)}" ${busy || !this._serverSchedules.online() || this._sending || this._smtpRequest ? 'disabled' : ''}>${tr('Wyślij poprzedni okres kalendarzowy','Send previous calendar period')}</button>
      <button id="schedule-delete-${i}" type="button" data-calendar-delete="${_esc(row.id)}" ${editable ? '' : 'disabled'}>${tr('Usuń','Delete')}</button></div></article>`).join('')}</div>${editor}${preview}</section>`;
    }

    _bindEnergyCalendar() {
      const root = this.shadowRoot, c = this._serverSchedules;
      this._bindMailFrame('schedule-mail-frame', c.model().preview);
      root.querySelectorAll('[data-calendar-period-send]').forEach(button => button.addEventListener('click', () => this._sendCalendarPeriodNow(button.dataset.calendarPeriodSend)));
      root.getElementById('schedule-refresh')?.addEventListener('click', () => c.refresh());
      root.getElementById('schedule-new')?.addEventListener('click', () => { c.create(); root.getElementById('schedule-cadence')?.focus(); });
      root.querySelectorAll('[data-calendar-edit]').forEach(button => button.addEventListener('click', () => { c.edit(button.dataset.calendarEdit); root.getElementById('schedule-cadence')?.focus(); }));
      root.querySelectorAll('[data-calendar-delete]').forEach(button => button.addEventListener('click', () => c.remove(button.dataset.calendarDelete)));
      root.querySelectorAll('[data-calendar-send]').forEach(button => button.addEventListener('click', () => this._sendCalendarNow(button.dataset.calendarSend)));
      root.getElementById('schedule-save')?.addEventListener('click', () => { this._scheduleSaveFocus = c.model().draft?.id; void c.save(); });
      root.getElementById('schedule-cancel')?.addEventListener('click', () => { c.cancel(); root.getElementById('schedule-refresh')?.focus(); });
      root.getElementById('schedule-preview')?.addEventListener('click', () => c.preview());
      for (const [id,key] of [['schedule-cadence','cadence'],['schedule-time','time'],['schedule-timezone','timezone'],['schedule-weekday','weekday'],['schedule-month-day','month_day'],['schedule-enabled','enabled']]) {
        const input = root.getElementById(id);
        input?.addEventListener('input', () => { c.update(key,input.type === 'checkbox' ? input.checked : ['weekday','month_day'].includes(key) ? Number(input.value) : input.value); });
        input?.addEventListener('change', () => { c.update(key,input.type === 'checkbox' ? input.checked : ['weekday','month_day'].includes(key) ? Number(input.value) : input.value); if (key === 'cadence') this._renderTab(); });
      }
      root.getElementById('schedule-recipients')?.addEventListener('input', event => c.updateRecipients(this._splitRecipients(event.target.value)));
    }

    async _sendCalendarNow(id) {
      if (!this._requireAdmin() || !this._serverSchedules.online() || this._sending) return;
      const row = this._serverSchedules.model().rows.find(row => row.id === id && row.kind === 'energy_report');
      if (!row) return;
      // Manual send remains explicit and independent from readonly calendar preview.
      return this._sendReportViaBackend(row.cadence, { period_mode: 'rolling', recipients: this._serverSchedules.recipientsFor(id) ?? [] });
    }

    async _sendCalendarPeriodNow(id) {
      if (!this._requireAdmin() || !this._serverSchedules.online()) return;
      const row = this._serverSchedules.model().rows.find(row => row.id === id && row.kind === 'energy_report');
      if (!row) return;
      return this._sendReportViaBackend(row.cadence, { period_mode: 'calendar',
        timezone: row.timezone || row.effective_timezone || this._hass?.config?.time_zone,
        recipients: this._serverSchedules.recipientsFor(id) ?? [] });
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
          <label class="schedule-toggle" style="font-size:12px;color:var(--bento-text-secondary);font-weight:600;white-space:nowrap"><input type="checkbox" id="schedule-enabled-${cadence}" ${enabled ? 'checked' : ''}> ${L ? 'W\u0142\u0105czony' : 'Enabled'}</label>
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
          <label class="schedule-toggle" style="font-size:12px;color:var(--bento-text-secondary);font-weight:600;white-space:nowrap"><input type="checkbox" id="schedule-enabled-${cadence}" ${schedule.enabled ? 'checked' : ''}> ${L ? 'W\u0142\u0105czony lokalnie' : 'Enabled locally'}</label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary schedule-save" data-cadence="${cadence}">${L ? 'Zapisz lokalnie' : 'Save locally'}</button>
          <button class="btn schedule-send" data-cadence="${cadence}">${L ? 'Wy\u015Blij teraz' : 'Send now'}</button>
          <button class="btn schedule-delete" data-cadence="${cadence}">${L ? 'Wyczy\u015B\u0107' : 'Clear'}</button>
        </div>
      </div>`;
    }

    _renderLegacyScheduleTab(calendarVisible = false) {
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const service = this._detectedService || this._config?.notify_service || '';
      const dailyId = 'automation.send_daily_energy_report';
      const weeklyId = 'automation.send_weekly_energy_report';
      const monthlyId = 'automation.send_monthly_energy_report';
      const dailyState = this._state(dailyId, 'missing');
      const weeklyState = this._state(weeklyId, 'missing');
      const monthlyState = this._state(monthlyId, 'missing');
      const exists = (s) => s === 'on' || s === 'off';
      const badge = (state) => {
        if (state === 'on') return '<span class="badge badge-ok">\u2705 ' + (L ? 'Aktywny' : 'Active') + '</span>';
        if (state === 'off') return '<span class="badge badge-er">\u274C ' + (L ? 'Wyłączony' : 'Disabled') + '</span>';
        return '<span class="badge badge-wa">? ' + (L ? 'Nieznany stan' : 'Unknown state') + '</span>';
      };
      const recipientInfo = recipient ? `\u{1F4E7} ${_esc(recipient)}` : `\u{1F4E7} <i>${L ? 'Brak — ustaw email powy\u017Cej' : 'None — set email above'}</i>`;
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
              ? `<button class="btn btn-ok" id="${disableId}" ${this._automationRequest ? 'disabled' : ''}>${L ? 'Wy\u0142\u0105cz' : 'Disable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`
              : `<button class="btn btn-primary" id="${enableId}" ${this._automationRequest ? 'disabled' : ''}>${L ? 'W\u0142\u0105cz' : 'Enable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`)
              : state === 'missing' ? `<button class="btn btn-primary" id="${createId}">\u2795 ${L ? 'Utw\u00F3rz automatyzacj\u0119' : 'Create Automation'}</button>` : ''}
          </div>
        </div>`;
      };
      return `
        ${calendarVisible ? '' : this._renderSmtpSection()}
        <p>${L ? 'Oba systemy mogą wysyłać raporty; możliwe duplikaty. Brak encji nie potwierdza wyłączenia.' : 'Both systems may send reports; duplicate deliveries are possible. An absent entity does not confirm disabled automation.'}</p>
        <p class="legacy-schedule-ids"><code>${dailyId}</code>: ${_esc(dailyState)} · <code>${weeklyId}</code>: ${_esc(weeklyState)} · <code>${monthlyId}</code>: ${_esc(monthlyState)}</p>
        <div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L
          ? 'Tryb legacy: harmonogramy lokalne zapisuj\u0105 si\u0119 tylko w tej przegl\u0105darce. Stare automatyzacje HA pozostaj\u0105 dost\u0119pne poni\u017Cej.'
          : 'Legacy mode: local schedules are saved only in this browser. Existing HA automation controls remain available below.'}</div>
        ${!recipient && !service ? `<div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L
          ? '<b>Brak adresu email.</b> Ustaw email w polu powy\u017Cej lub domy\u015Blnego odbiorc\u0119 w <a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>.'
          : '<b>No email recipient.</b> Set an email in the field above or a default recipient in <a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>.'}</div>` : ''}
        ${['daily', 'weekly', 'monthly'].map(c => this._renderLegacyScheduleCard(c)).join('')}
        <div class="section-title">${L ? 'Starsze automatyzacje HA' : 'Legacy HA Automations'}</div>
        ${this._legacyActionMarkup()}
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
              ? 'Poniższe pola starszych automatyzacji HA (email, serwis, godziny) są zapisywane w Home Assistant. Harmonogramy lokalne pozostają tylko w tej przeglądarce.'
              : 'The legacy HA automation fields below (email, service, times) are stored in Home Assistant. Local schedules remain only in this browser.')
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
            <div>${ready ? this._fmt(data.total_kwh, 1) : 'N/A'} kWh · ${this._formatCost(data.total_cost)} ${_esc(this._tariffCurrency())}</div>
            ${data.total_cost === null ? `<div>${L ? 'Taryfa nieskonfigurowana' : 'Tariff not configured'}</div>` : ''}
            <table class="preview-table"><thead><tr><th>${L ? 'Źródło' : 'Source'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'}</th></tr></thead>
            <tbody>${rows.map(row => `<tr><td>${_esc(row.name)}</td><td>${typeof row.kwh === 'number' && Number.isFinite(row.kwh) ? this._fmt(row.kwh, 2) : 'N/A'}</td><td>${this._formatCost(row.cost)}</td></tr>`).join('')}</tbody></table>
          </div>`;
        }).join('');
    }

    _mailPeriodLabel(cadence, mode = this._mailPeriodMode) {
      const pl = this._lang === 'pl', index = ['daily', 'weekly', 'monthly'].indexOf(cadence);
      return (mode === 'calendar' ? (pl ? ['Poprzedni pełny dzień', 'Poprzedni pełny tydzień ISO (od poniedziałku)', 'Poprzedni pełny miesiąc'] :
        ['Previous completed day', 'Previous completed ISO week (Monday)', 'Previous completed month']) :
        (pl ? ['Ostatnie 24 h ukończonych godzin Recorder', 'Ostatnie 7 dni ukończonych godzin Recorder', 'Ostatnie 30 dni ukończonych godzin Recorder'] :
        ['Last 24 h of completed Recorder hours', 'Last 7 days of completed Recorder hours', 'Last 30 days of completed Recorder hours']))[index] || '';
    }

  _renderMailControls(showCadence = true) {
    const pl = this._lang === 'pl';
    const i = Math.max(0, ['daily', 'weekly', 'monthly'].indexOf(this._mailCadence));
    const rolling = showCadence ? (pl ? ['Ostatnie 24 godziny', 'Ostatnie 7 dni', 'Ostatnie 30 dni'] : ['Last 24 hours', 'Last 7 days', 'Last 30 days'])[i] : (pl ? 'Ostatni okres' : 'Rolling period');
    const calendar = showCadence ? (pl ? ['Poprzedni pełny dzień', 'Poprzedni pełny tydzień', 'Poprzedni pełny miesiąc'] : ['Previous completed day', 'Previous completed ISO week', 'Previous completed month'])[i] : (pl ? 'Pełny okres kalendarzowy' : 'Completed calendar period');
    const field = 'display:grid;gap:4px;min-width:0', select = 'width:100%;min-width:0;min-height:44px';
    return `<div class="mail-controls" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:12px">${showCadence ? `<label style="${field}">${pl ? 'Częstotliwość' : 'Cadence'} <select style="${select}" id="mail-cadence">${['daily', 'weekly', 'monthly'].map((value, i) => `<option value="${value}" ${this._mailCadence === value ? 'selected' : ''}>${(pl ? ['Dzienny', 'Tygodniowy', 'Miesięczny'] : ['Daily', 'Weekly', 'Monthly'])[i]}</option>`).join('')}</select></label>` : ''}
      <label style="${field}">${pl ? 'Okres' : 'Period'} <select style="${select}" id="mail-period-mode"><option value="rolling" ${this._mailPeriodMode === 'rolling' ? 'selected' : ''}>${rolling}</option><option value="calendar" ${this._mailPeriodMode === 'calendar' ? 'selected' : ''}>${calendar}</option></select></label></div>`;
  }


    _bindMailControls() {
      for (const [id,key,values] of [['mail-cadence','_mailCadence',['daily','weekly','monthly']],['mail-period-mode','_mailPeriodMode',['rolling','calendar']]]) {
        const field = this.shadowRoot.getElementById(id);
        if (field) field.disabled = !!this._emailSendRequest || !!this._smtpRequest;
        field?.addEventListener('change', event => {
          if (!values.includes(event.target.value)) return;
          this[key] = event.target.value; this._mailPreview.clearPreview(); this._renderTab();
        });
      }
      this.shadowRoot.getElementById('mail-preview')?.addEventListener('click', () =>
        this._mailPreview.previewMail({cadence:this._mailCadence, period_mode:this._mailPeriodMode}));
      this.shadowRoot.getElementById('mail-discard')?.addEventListener('click', () => { this._mailPreview.clearPreview(); this._renderTab(); });
    }

  _renderMailFrame(preview, id) {
    if (!preview || typeof preview.html !== 'string') return '';
    const pl = this._lang === 'pl', locale = pl ? 'pl-PL' : 'en-US';
    const zone = preview.effective_timezone || 'UTC';
    const date = value => {
      try { return new Intl.DateTimeFormat(locale, { timeZone: zone, year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value)); }
      catch (_) { return pl ? 'Czas niedostępny' : 'Time unavailable'; }
    };
    const source = preview.source?.name === 'system_log' ? (pl ? 'Zachowane wpisy dziennika HA' : 'Retained HA log entries') : (pl ? 'Statystyki energii Recorder' : 'Recorder energy statistics');
    return `<section class="schedule-preview" style="min-width:0;max-width:100%"><h4>${_esc(preview.subject)}</h4>
      <dl><dt>${pl ? 'Od (włącznie)' : 'From (inclusive)'}</dt><dd>${_esc(date(preview.period.from))}</dd>
      <dt>${pl ? 'Do (wyłącznie)' : 'To (exclusive)'}</dt><dd>${_esc(date(preview.period.to))}</dd>
      <dt>${pl ? 'Wygenerowano' : 'Generated'}</dt><dd>${_esc(date(preview.generated_at))}</dd>
      <dt>${pl ? 'Źródło' : 'Source'}</dt><dd>${_esc(source)}${preview.source?.complete === false ? (pl ? ' — częściowe dane' : ' — partial data') : ''}</dd></dl>
      ${this._mailPresentation.render(preview.html, id, pl ? 'Podgląd maila energii' : 'Energy mail preview')}</section>`;
  }

    _bindMailFrame(id, preview) {
      if (typeof preview?.html !== 'string') return;
      this._mailPresentation.bind(this.shadowRoot, id, preview.html);
    }

    _tabPreview() {
      const pl = this._lang === 'pl', m = this._mailPreview.model(), ui = this._getTariffHostV3().ui();
      const reasons = {initial: pl ? 'Nie odczytano maila.' : 'Mail has not been read.', loading: pl ? 'Odczytywanie…' : 'Reading…',
        loaded: pl ? 'Podgląd z serwera; nie wysłano maila.' : 'Server preview; no email sent.',
        mail_upgrade_required: pl ? 'Podgląd maila wymaga HA Tools Email 2.3.0+.' : 'Mail preview requires HA Tools Email 2.3.0+.'};
      return `<h3>${pl ? 'Rzeczywisty mail z backendu' : 'Actual backend mail'}</h3>${this._renderMailControls()}
        <p>${_esc(this._mailPeriodLabel(this._mailCadence))}</p><button class="btn" type="button" id="mail-preview" ${m.previewing || !this._mailPreview.online() ? 'disabled' : ''}>${pl ? 'Odczytaj podgląd maila' : 'Read mail preview'}</button>
        <button class="btn" type="button" id="mail-discard">${pl ? 'Odrzuć podgląd' : 'Discard preview'}</button>
        <div role="status">${ui.statusHtml(m.previewStatus.state)}<p>${_esc(reasons[m.previewStatus.reason] || (pl ? 'Odczyt niepotwierdzony. Spróbuj ponownie świadomie.' : 'Read unconfirmed. Read again explicitly.'))}</p></div>
        ${this._renderMailFrame(m.preview, 'manual-mail-frame')}
        <details><summary>${pl ? 'Zgodnościowe zestawienie energii (nie podgląd maila)' : 'Compatibility energy summary (not a mail preview)'}</summary>${this._tabLegacyPreview()}</details>`;
    }

    _tabLegacyPreview() {
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
        const hasData = this[`_periodStatus_${p.key}`] === 'ready' && devData.length > 0 && devData.every(d => typeof d.current === 'number' && Number.isFinite(d.current));
        const totalEnergy = hasData ? devData.reduce((s, d) => s + d.current, 0) : null;
        const totalCost = hasData && devData.every(d => typeof d.cost === 'number' && Number.isFinite(d.cost)) ? devData.reduce((s, d) => s + d.cost, 0) : null;
        const top5 = devData.slice(0, 5);
        const isPeriodData = devData.length > 0 && devData[0].hasPeriod;
        const periodNote = !hasData ? `<div role="status">${L ? 'Niepełne dane — suma okresu niedostępna. Wiersze pokazują tylko zarejestrowane pomiary.' : 'Incomplete data — period total unavailable. Rows show recorded measurements only.'}</div>` : '';
        return `<div class="preview-box" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px">${p.icon} ${title} \u2013 ${today}</h3>
          ${periodNote}
          <div style="font-size:12px;color:var(--bento-text-secondary);margin-bottom:10px">\u{1F4E7} ${_esc(recipientLine)} \u00A0\u2022\u00A0 ${range} \u00A0\u2022\u00A0 ${devData.length} ${L ? 'źródeł' : 'sources'}</div>
          <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap">
            <div><span style="font-size:18px;font-weight:700;color:var(--energy-value-amber)">${totalEnergy === null ? 'N/A' : this._fmt(totalEnergy, 1)}</span> <span style="font-size:12px;color:var(--bento-text-secondary)">kWh</span></div>
            <div><span style="font-size:18px;font-weight:700;color:var(--energy-value-blue)">${this._formatCost(totalCost)}</span> <span style="font-size:12px;color:var(--bento-text-secondary)">${_esc(this._tariffCurrency())}</span></div>
          </div>
          <table class="preview-table">
            <thead><tr><th>${L ? 'Źródło importu' : 'Import source'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'} (${_esc(this._tariffCurrency())})</th></tr></thead>
            <tbody>${top5.map(d => `<tr><td>${_esc(d.name)}</td><td>${d.current === null ? 'N/A' : this._fmt(d.current, 2)}</td><td>${this._formatCost(d.cost)}</td></tr>`).join('')}
            ${devData.length > 5 ? `<tr><td colspan="3" style="text-align:center;color:var(--bento-text-secondary);font-size:12px">+ ${devData.length - 5} ${L ? 'więcej źródeł' : 'more sources'}...</td></tr>` : ''}</tbody>
          </table>
        </div>`;
      };
      return `

        <div class="section-title" style="margin-top:0">\u{1F4CB} ${L ? 'Podgl\u0105d raport\u00F3w email' : 'Email Report Previews'}</div>
        ${periods.map(p => renderReport(p)).join('')}
        <div style="font-size:12px;color:var(--bento-text-secondary);margin-top:4px">${L ? 'Podgląd skonfigurowanych źródeł Energy Dashboard; ukończone godziny Recorder.' : 'Configured Energy Dashboard source preview; completed Recorder hours.'}</div>`;
    }

    _tabSend() {
      const L = this._lang === 'pl';
      const manualLabel = L ? 'Ręcznie' : 'Manual';
      const sendingLabel = L ? 'Wysyłam...' : 'Sending...';
      const lastSentLabel = cadence => this._lastSentOutcome[cadence] === 'accepted_by_smtp' ? (L ? 'Ostatnio przyjęto przez SMTP: ' : 'Last accepted by SMTP: ') : (L ? 'Ostatnie żądanie wysyłki: ' : 'Last send request: ');
      const smtpConfig = this._renderSmtpSection();
      const canSend = this._hasHaToolsEmail() && !this._smtpRequest;
      const backendReports = this._emailBackendAvailable && !this._emailBackendReportsUnsupported;
      const quickDisabled = this._sending || (backendReports ? true : !canSend);
      const modeText = backendReports
        ? (L ? 'Wyślij raport energii przez HA Tools Email 2.1.2+.' : 'Send an energy report using HA Tools Email 2.1.2+.')
        : (L ? 'R\u0119cznie wy\u015Blij raport energii poprzez ha_tools_email.' : 'Manually trigger an energy report via ha_tools_email.');
      return `
        ${this._emailResultMarkup('send', this._sendResult)}
        <div class="info-row">\u{1F4E4}\u00A0 ${modeText}</div>
        ${smtpConfig}
        ${this._renderMailControls(false)}
        ${(this._emailBackendAvailable || this._hasLegacyHaToolsEmail()) ? `<div style="font-size:12px;color:var(--bento-text-secondary);margin:16px 0 12px;padding:10px;background:var(--bento-primary-light);border-radius:var(--bento-radius-xs)">${L ? '💡 Konfiguracja SMTP: <a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '💡 SMTP settings: <a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</div>` : ''}
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u2600\uFE0F ${L ? 'Wy\u015Blij raport dzienny' : 'Send Daily Report Now'}</div><span class="badge badge-pr">${manualLabel}</span></div>
          <p>${_esc(this._mailPeriodLabel('daily'))}</p>
          <div id="last-daily" class="last-sent">${this._lastSent.daily ? lastSentLabel('daily') + this._lastSent.daily : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-daily" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? `<span class="spinner"></span>${sendingLabel}` : (L ? '\u2600\uFE0F Wyślij raport dzienny' : '\u2600\uFE0F Send Daily')}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4C6} ${L ? 'Wy\u015Blij raport tygodniowy' : 'Send Weekly Report Now'}</div><span class="badge badge-pr">${manualLabel}</span></div>
          <p>${_esc(this._mailPeriodLabel('weekly'))}</p>
          <div id="last-weekly" class="last-sent">${this._lastSent.weekly ? lastSentLabel('weekly') + this._lastSent.weekly : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-weekly" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? `<span class="spinner"></span>${sendingLabel}` : (L ? '\u{1F4E4} Wyślij raport tygodniowy' : '\u{1F4E4} Send Weekly')}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4C8} ${L ? 'Wy\u015Blij raport miesi\u0119czny' : 'Send Monthly Report Now'}</div><span class="badge badge-pr">${manualLabel}</span></div>
          <p>${_esc(this._mailPeriodLabel('monthly'))}</p>
          <div id="last-monthly" class="last-sent">${this._lastSent.monthly ? lastSentLabel('monthly') + this._lastSent.monthly : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-monthly" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? `<span class="spinner"></span>${sendingLabel}` : (L ? '\u{1F4C8} Wyślij raport miesięczny' : '\u{1F4C8} Send Monthly')}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4E7} ${L ? 'Szybkie podsumowanie' : 'Quick Summary'}</div><span class="badge badge-ok">${L ? 'Natychmiast' : 'Instant'}</span></div>
          <div class="schedule-meta">${backendReports
            ? (L ? 'Tryb backendu u\u017Cywa wysy\u0142ki daily/weekly/monthly przez send_now.' : 'Backend mode uses daily/weekly/monthly send_now actions.')
            : (L ? 'Tekstowe podsumowanie aktualnych danych energii.' : 'Plain-text summary of current energy stats.')}</div>
          <div id="last-quick" class="last-sent">${this._lastSent.quick ? lastSentLabel('quick') + this._lastSent.quick : ''}</div>
          <div class="btn-row"><button class="btn btn-ok" id="send-quick" ${quickDisabled ? 'disabled' : ''}>\u26A1 ${L ? 'Wy\u015Blij' : 'Send Quick Summary'}</button></div>
        </div>`;
    }

    _attachSendEvents() {
      this._bindMailControls();
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
        <details data-feature-access-v53 class="config-section"><summary style="min-height:44px;cursor:pointer;font-weight:600">${L ? 'Dostęp domowników' : 'Household access'}</summary><div data-feature-access-body></div></details>
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
      this._featureAccessV53 ||= createFeatureAccessV53({card:this,guard:this._getTariffHostV3().guard});
      this._featureAccessV53.mount(root.querySelector('[data-feature-access-v53]'));
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
          this._observeTariffContextV3();
          this._repriceTariffV3();
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Stawka zapisana' : 'Price saved'));
          this._render();
        }
      });
    }

    _attachScheduleEvents() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      root.getElementById('email-config-refresh')?.addEventListener('click', () => this._loadEmailBackendConfig({ showErrors: true }));
      this._bindEnergyCalendar();
      root.querySelectorAll('.schedule-save').forEach(btn => btn.addEventListener('click', () => this._saveLegacySchedule(btn.dataset.cadence)));
      root.querySelectorAll('.schedule-delete').forEach(btn => btn.addEventListener('click', () => this._deleteLegacySchedule(btn.dataset.cadence)));
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
      if (!this._requireAdmin() || this._emailBackendReportsUnsupported) return;
      const existing = this._getEnergySchedule(cadence);
      if (!existing?.id) return; // New UUIDs are allocated by the explicit New action only.
      this._serverSchedules.edit(existing.id);
      return this._serverSchedules.save();
    }

    async _deleteBackendSchedule(cadence) {
      if (!this._requireAdmin()) return;
      const existing = this._getEnergySchedule(cadence);
      if (existing?.id) return this._serverSchedules.remove(existing.id);
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

    _legacyActionMarkup() {
      const r = this._legacyActionResult;
      if (!r) return '';
      const pl = this._lang === 'pl', ui = this._getTariffHostV3().ui();
      const action = r.enable ? (pl ? 'Włączenie' : 'Enable') : (pl ? 'Wyłączenie' : 'Disable');
      const explanation = r.state === 'success'
        ? (pl ? 'Żądany stan potwierdzony w Home Assistant.' : 'Requested state confirmed in Home Assistant.')
        : r.state === 'not_checked'
          ? (pl ? 'Żądanie trwa; stan niepotwierdzony.' : 'Request in progress; state unconfirmed.')
          : (pl ? 'Wynik niepotwierdzony. Sprawdź stan w HA przed ponowieniem.' : 'Outcome unconfirmed. Check the state in HA before retrying.');
      return `<div class="email-action-result" data-automation-result role="status" aria-live="polite">${ui.statusHtml(r.state)}<p>${_esc(action)}: <code>${_esc(r.entity)}</code></p><p>${_esc(explanation)}</p></div>`;
    }

    async _toggleAuto(entity_id, enable) {
      if (!this._requireAdmin() || this._automationRequest || typeof enable !== 'boolean') return;
      const cadence = ['daily', 'weekly', 'monthly'].find(value => entity_id === 'automation.send_' + value + '_energy_report');
      const before = this._hass?.states?.[entity_id]?.state, expected = enable ? 'on' : 'off';
      if (!cadence || !['on', 'off'].includes(before) || before === expected) return;
      const token = this._emailContextToken(), source = this._hass;
      const request = this._automationRequest = {};
      this._legacyActionResult = { state: 'not_checked', entity: entity_id, enable };
      this._rememberActionFocus((enable ? 'enable-' : 'disable-') + cadence);
      this._renderTab();
      try {
        await source.callService('automation', enable ? 'turn_on' : 'turn_off', { entity_id }, undefined, false);
        if (!this._emailContextCurrent(token)) return;
        const confirmed = this._hass?.states?.[entity_id]?.state === expected;
        this._legacyActionResult = { state: confirmed ? 'success' : 'unconfirmed', entity: entity_id, enable };
      } catch (_) {
        if (this._emailContextCurrent(token)) this._legacyActionResult = { state: 'unconfirmed', entity: entity_id, enable };
      } finally {
        if (this._automationRequest === request) this._automationRequest = null;
        if (this.isConnected) this._renderTab();
      }
    }

    _emailResultText(result) {
      const pl = this._lang === 'pl';
      const texts = {
        sending: ['Send request in progress; delivery unconfirmed.', 'Żądanie wysyłki trwa; doręczenie niepotwierdzone.'],
        accepted_by_smtp: ['Accepted by SMTP; delivery unconfirmed.', 'Przyjęte przez SMTP; doręczenie niepotwierdzone.'],
        request_completed: ['Request completed; SMTP acceptance and delivery unconfirmed. Inspect History before retrying.', 'Żądanie zakończone; przyjęcie przez SMTP i doręczenie niepotwierdzone. Przed ponowieniem sprawdź Historię.'],
        transport_unknown: ['Send outcome unconfirmed. Inspect History; no automatic retry.', 'Wynik wysyłki niepotwierdzony. Sprawdź Historię; nie ponawiamy automatycznie.'],
        no_data: ['Complete Recorder data is unavailable for this period. No email was sent.', 'Brak kompletnych danych Recorder dla tego okresu. Nie wysłano emaila.'],
        smtp_unconfigured: ['Configure SMTP in HA Tools Email before sending.', 'Przed wysyłką skonfiguruj SMTP w HA Tools Email.'],
        integration_missing: ['HA Tools Email service is unavailable. No email was sent.', 'Usługa HA Tools Email jest niedostępna. Nie wysłano emaila.'],
        mail_upgrade_required: ['Update HA Tools Email to stable 2.3.0+ for calendar sending. No email was sent.', 'Zaktualizuj HA Tools Email do stabilnego 2.3.0+ dla wysyłki kalendarzowej. Nie wysłano emaila.'],
        upgrade_required: ['Update HA Tools Email to 2.1.2 or newer. No test was sent.', 'Zaktualizuj HA Tools Email do 2.1.2 lub nowszego. Nie wysłano testu.'],
        not_tested: ['SMTP is configured. No test was sent; use Send Now to request a report.', 'SMTP jest skonfigurowany. Nie wysłano testu; użyj Wyślij teraz, aby zamówić raport.'],
        prepare_failed: ['The report could not be prepared. No email was sent. Check HA logs.', 'Nie udało się przygotować raportu. Nie wysłano emaila. Sprawdź logi HA.']
      };
      return (texts[result?.reason] || texts.transport_unknown)[pl ? 1 : 0];
    }

    _emailResultMarkup(kind, result) {
      if (!result) return '';
      const ui = this._getTariffHostV3().ui();
      return `<div class="email-action-result" data-email-result="${kind}" role="status">${ui.statusHtml(result.state)}<p>${_esc(this._emailResultText(result))}</p></div>`;
    }

    _setEmailActionResult(kind, state, reason) {
      const result = { state, reason };
      if (kind === 'smtp') this._smtpStatus = result; else this._sendResult = result;
      const status = this._getTariffHostV3().ui().status(state);
      this._showToast(status.icon + ' ' + status.label + ': ' + this._emailResultText(result));
    }

    async _sendReportViaBackend(cadence, options = {}) {
      if (!this._requireAdmin()) return;
      const mode = options.period_mode ?? this._mailPeriodMode;
      if (!['rolling', 'calendar'].includes(mode)) return;
      if (mode === 'rolling' && this._emailBackendReportsUnsupported) return this._sendReport(cadence, {legacy:true});
      if (!this._hass || this._sending || this._emailSendRequest || this._smtpRequest) return;
      if (!['daily', 'weekly', 'monthly'].includes(cadence)) return;
      if (!this._emailBackendConfig?.smtp_configured) {
        this._setEmailActionResult('send', 'error', 'smtp_unconfigured'); this._renderTab(); return;
      }
      const recipients = [...(options.recipients ?? this._scheduleRecipients(cadence))];
      const timezone = mode === 'calendar' ? options.timezone : undefined;
      if (recipients.length > 128 || recipients.some(v => typeof v !== 'string' || !v.trim() || v.length > 255 || /[\r\n]/.test(v))) return;
      const token = this._emailContextToken(), source = this._hass;
      const request = this._emailSendRequest = {};
      this._sendResult = { state: 'not_checked', reason: 'sending' };
      this._rememberActionFocus('send-' + cadence);
      this._sending = true;
      this._scheduleBusy[cadence] = true;
      this._renderTab(); this._attachSendEvents();
      let dispatched = false;
      try {
        let manifest;
        try { manifest = await this._emailReadonlyWs(source, { type: 'manifest/get', integration: 'ha_tools_email' }); }
        catch (_) { if (mode === 'calendar') throw {code:'mail_upgrade_required'}; }
        if (!this._emailContextCurrent(token)) return;
        const version = manifest?.version, parts = typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version) ? version.split('.').map(Number) : [];
        const modern = manifest?.domain === 'ha_tools_email' && parts.length === 3 && parts.every(Number.isSafeInteger) && parts.join('.') === version && (parts[0] > 2 || parts[0] === 2 && parts[1] >= 3);
        if (mode === 'calendar' && !modern) {
          this._setEmailActionResult('send', 'error', 'mail_upgrade_required'); return;
        }
        const selection = modern ? {period_mode:mode, ...(mode === 'calendar' && timezone ? {timezone} : {})} : {};
        dispatched = true;
        const acknowledgement = await source.callWS({ type: 'ha_tools_email/send_now', kind: 'energy_report', cadence, recipients, ...selection });
        if (!this._emailContextCurrent(token)) return;
        const accepted = modern ? acknowledgement?.ok === true && acknowledgement.status === 'accepted_by_smtp' && typeof acknowledgement.attempt_id === 'string' && acknowledgement.attempt_id.trim().length > 0 :
          acknowledgement?.success !== false && (acknowledgement?.status === 'accepted_by_smtp' || (acknowledgement?.status === undefined && acknowledgement?.success === true));
        if (!accepted) { this._setEmailActionResult('send', 'unconfirmed', 'transport_unknown'); return; }
        this._lastSentOutcome[cadence] = 'accepted_by_smtp';
        this._lastSent[cadence] = new Date().toLocaleString((this._lang === 'pl' ? 'pl-PL' : 'en-US'), { hour12: false });
        this._setEmailActionResult('send', 'success', 'accepted_by_smtp');
      } catch (error) {
        if (this._emailContextCurrent(token)) this._setEmailActionResult('send', dispatched ? 'unconfirmed' : 'error', dispatched ? 'transport_unknown' : error?.code === 'mail_upgrade_required' ? 'mail_upgrade_required' : 'prepare_failed');
      } finally {
        if (this._emailSendRequest === request) { this._emailSendRequest = null; this._sending = false; }
        if (this._emailContextCurrent(token)) this._scheduleBusy[cadence] = false;
        if (this.isConnected) this._renderTab();
      }
    }

    async _sendReport(type, options = {}) {
      if (!this._requireAdmin()) return;
      if (!this._hass || this._sending || this._emailSendRequest || this._smtpRequest) return;
      if (!options.legacy && ['daily', 'weekly', 'monthly'].includes(type) && (this._mailPeriodMode === 'calendar' || this._emailBackendAvailable && !this._emailBackendReportsUnsupported)) {
        await this._sendReportViaBackend(type);
        return;
      }
      const token = this._emailContextToken(), request = this._emailSendRequest = {};
      let dispatched = false;
      this._sendResult = { state: 'not_checked', reason: 'sending' };
      this._rememberActionFocus('send-' + type);
      this._sending = true;
      this._renderTab(); this._attachSendEvents();
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const price = this._getAvgRate();
      const currency = this._tariffCurrency();
      const dateStr = new Date().toISOString().split('T')[0];
      const nowStr = new Date().toLocaleString((this._lang === 'pl' ? 'pl-PL' : 'en-US'), { hour12: false });
      try {
        if (!this._hasHaToolsEmail()) { this._setEmailActionResult('send', 'error', 'integration_missing'); return; }
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
        if (!this._emailContextCurrent(token)) return;
        const cached = this[`_periodCache_${periodKey}`];
        if (this[`_periodStatus_${periodKey}`] !== 'ready' || !cached?.length) {
          this._setEmailActionResult('send', 'no_data', 'no_data'); return;
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
          const kwh = this._fmt(d.month || 0, 2);
          const cost = this._formatCost(d.cost ?? this._cost(d.month));
          const pct = totalKwh > 0 ? this._fmt((d.month / totalKwh) * 100, 0) : 0;
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
                <div style="font-size:28px;font-weight:700;color:#d97706">${this._fmt(totalKwh, 1)}</div>
                <div style="font-size:12px;color:#92400e;margin-top:2px">kWh</div>
              </div>
              <div style="flex:1;background:#dbeafe;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;color:#1d4ed8">${this._formatCost(totalCost)}</div>
                <div style="font-size:12px;color:#1e40af;margin-top:2px">${_esc(currency)}</div>
              </div>
              <div style="flex:1;background:#d1fae5;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:16px;font-weight:700;color:#047857">${topDevice ? _esc(topDevice.name.split(' ').slice(0,2).join(' ')) : '-'}</div>
                <div style="font-size:12px;color:#065f46;margin-top:2px">${L ? 'Top' : 'Top'}: ${topDevice ? this._fmt(topDevice.month, 1) : 0} kWh</div>
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
                <td style="padding:12px 14px;text-align:right">${this._fmt(totalKwh, 2)}</td>
                <td style="padding:12px 14px;text-align:right">${this._formatCost(totalCost)}</td>
                <td style="padding:12px 14px;text-align:right">100%</td>
              </tr></tbody>
            </table>
            <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;text-align:center">${_esc(this._getTariffLabel())} \u2022 HA Energy Email Card</p>
          </div>
        </div>`;
        const title = `\u26A1 ${typeName} ${L ? 'raport energii' : 'Energy Report'} \u2013 ${dateStr}`;
        const plainText = `${typeName} ${L ? 'raport energii' : 'Energy Report'} - ${dateStr}\n${windowText}\n${L ? '\u0141\u0105cznie' : 'Total'}: ${this._fmt(totalKwh, 2)} kWh / ${this._formatCost(totalCost)} ${currency}\n${devices.map(d => `${d.name}: ${this._fmt(d.month || 0, 2)} kWh`).join('\n')}`;
        // Built-in SMTP via ha_tools_email
        if (!this._emailContextCurrent(token)) return;
        dispatched = true;
        await this._sendViaHaToolsEmail(recipient || '', title, plainText, html);
        if (!this._emailContextCurrent(token)) return;
        this._lastSentOutcome[type] = 'request_completed';
        this._lastSent[type] = nowStr;
        this._setEmailActionResult('send', 'unconfirmed', 'request_completed');
      } catch (_) {
        if (this._emailContextCurrent(token)) this._setEmailActionResult('send', dispatched ? 'unconfirmed' : 'error', dispatched ? 'transport_unknown' : 'prepare_failed');
      } finally {
        if (this._emailSendRequest === request) { this._emailSendRequest = null; this._sending = false; }
        if (this.isConnected) this._renderTab();
      }
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
      await hass.callService('ha_tools_email', 'send', data, undefined, false);
    }

    // --- SMTP Configuration via ha_tools_email ---

    _renderSmtpSection() {
      const L = this._lang === 'pl';
      const statusBadge = this._emailResultMarkup('smtp', this._smtpStatus);
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
              <button class="btn btn-primary" id="btn-smtp-test" ${this._smtpTesting || this._emailSendRequest ? 'disabled' : ''}>${this._smtpTesting ? (L ? 'Wysy\u0142am...' : 'Sending...') : (L ? 'Test SMTP' : 'Test SMTP')}</button>
              ${statusBadge}
            </div>
          </div>`;
        }
        return `<div class="smtp-section smtp-missing">
          <div class="smtp-header"><div class="smtp-icon">\u26A0\uFE0F</div><div>
            <div class="smtp-title">${L ? 'SMTP nie skonfigurowany w ha_tools_email' : 'SMTP Not Configured in ha_tools_email'}</div>
            <div class="smtp-detail">${L ? 'Ustaw serwer, login i has\u0142o w' : 'Set the server, login and password in'} <b>${L ? '<a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '<a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</b></div>
          </div></div>
          ${statusBadge}
        </div>`;
      }
      if (this._hasLegacyHaToolsEmail()) {
        return `<div class="smtp-section">
          <div class="smtp-header"><div class="smtp-icon">\u2705</div><div>
            <div class="smtp-title">${L ? 'Usługi HA Tools Email dostępne (legacy)' : 'HA Tools Email services available (legacy)'}</div>
            <div class="smtp-detail">${L ? 'U\u017Cywam us\u0142ug Home Assistant ha_tools_email.send/test.' : 'Using Home Assistant ha_tools_email.send/test services.'}</div>
          </div></div>
          <div class="smtp-actions" style="margin-top:12px">
            <button class="btn btn-primary" id="btn-smtp-test" ${this._smtpTesting || this._emailSendRequest ? 'disabled' : ''}>${this._smtpTesting ? (L ? 'Wysy\u0142am...' : 'Sending...') : (L ? 'Wy\u015Blij testowy email' : 'Send Test Email')}</button>
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
        ${statusBadge}
      </div>`;
    }

    async _testSmtp() {
      const token = this._emailContextToken();
      if (!this._requireAdmin() || !this._hass || this._smtpTesting || this._smtpRequest || this._emailSendRequest) return;
      if (this._emailBackendReportsUnsupported && !this._hasLegacyHaToolsEmail()) {
        this._setEmailActionResult('smtp', 'error', 'upgrade_required'); this._render(); return;
      }
      if (this._emailBackendAvailable && !this._emailBackendConfig?.smtp_configured) {
        this._setEmailActionResult('smtp', 'error', 'smtp_unconfigured'); this._render(); return;
      }
      if (!this._hass.services?.ha_tools_email?.test) {
        this._setEmailActionResult('smtp', this._emailBackendAvailable ? 'not_checked' : 'error', this._emailBackendAvailable ? 'not_tested' : 'integration_missing');
        this._render(); return;
      }
      const source = this._hass, request = this._smtpRequest = {};
      this._smtpStatus = { state: 'not_checked', reason: 'sending' };
      this._rememberActionFocus('btn-smtp-test');
      this._smtpTesting = true;
      this._render();
      try {
        await source.callService('ha_tools_email', 'test', {}, undefined, false);
        if (this._emailContextCurrent(token)) this._setEmailActionResult('smtp', 'unconfirmed', 'request_completed');
      } catch (_) {
        if (this._emailContextCurrent(token)) this._setEmailActionResult('smtp', 'unconfirmed', 'transport_unknown');
      } finally {
        if (this._smtpRequest === request) { this._smtpRequest = null; this._smtpTesting = false; }
        if (this.isConnected) this._render();
      }
    }

    _showToast(msg) {
      const toast = this.shadowRoot.getElementById('toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      this._schedule(() => toast.classList.remove('show'), 3500);
    }


    _analysisIsActiveV53() {return this._activeTab==='overview';}
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
        if(!this.isConnected)return;
        if(['preview','config'].includes(this._activeTab)){this._render();return;}
        if(!this._analysisIsActiveV53())return;
        if(this.shadowRoot?.querySelector('[data-analysis-mount-v53]'))this._syncAnalysisV53();
        else this._render();
      });
    }
      if (this._tariffHostController) {
        this._tariffHostController.guard.resume();
        // Reconfirm shared prices for this mount; reuse settled measurements.
        this._observeTariffNavigationV3();
      }
      if (this._initialDiscoveryStartedV3) this._ensureInitialDiscovery();
    }

    disconnectedCallback() {
      this._featureAccessV53?.stop();
      this._reportHostV53?.stop();
      this._analysisHostV53?.stop();
      this._optionsResizeV5?.disconnect();
      this._tariffHostController?.guard.suspend();
      this._clearEmailContext();
      this._serverSchedules.discard();
      this._mailPreview.discard();
      this.shadowRoot.getElementById('tab-content')?.replaceChildren();
      this._attemptHistory.discard();
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

    _refreshAttemptHistory() { return this._attemptHistory.refresh(this._hass); }
    _discardAttemptHistory() { this._attemptHistory.discard(); }

    setActiveTab(tabId) {
      this._activeTab = tabId;
      if(tabId!=='preview' && this._initialDiscoveryStartedV3)this._ensureInitialDiscovery();
      this._observeTariffNavigationV3();
      if (tabId === 'schedule') { this._serverSchedules.setContext(this._hass); this._serverSchedules.ensureRead(); }
      if (tabId === 'history') this._attemptHistory.setContext(this._hass);
      this._render();
    }
  }

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
      const values = { title: this._config.title ?? 'Energy Email Reports', currency: this._config.currency ?? this._hass?.config?.currency ?? '', energy_price: this._config.energy_price ?? '' };
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
        <h3>Energy Email Reports</h3>
              <div style="margin-bottom:12px;">
                <label for="cf_title" style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
                <input type="text" id="cf_title" value="${_esc(this._config?.title ?? 'Energy Email Reports')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label for="cf_currency" style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency ?? this._hass?.config?.currency ?? '')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label for="cf_energy_price" style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Energy price</label>
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
    if (!root) return;
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
createEnergyCardOptionsV5({ Card: HAEnergyEmail, Editor: HaEnergyEmailEditor, name: "ha-energy-email", title: "Energy Email Reports", tabs: ["overview", "schedule", "preview", "send", "config", "history"], labels: [["Overview", "Schedule", "Preview", "Send now", "Config", "History"], ["Przegląd", "Harmonogram", "Podgląd", "Wyślij teraz", "Ustawienia", "Historia"]] });
// Custom elements capture lifecycle callbacks when registered. Install options first.
  if (!customElements.get('ha-energy-email')) customElements.define('ha-energy-email', HAEnergyEmail);
  // Energy Optimizer is the canonical owner of ha-energy-email. The alias below is always
  // free, so the HA Tools Email & Reports compatibility shim can delegate to this card
  // whichever bundle Home Assistant happens to load first.
  if (!customElements.get('ha-energy-optimizer-email')) customElements.define('ha-energy-optimizer-email', class extends HAEnergyEmail {});
if (!customElements.get('ha-energy-email-editor')) { customElements.define('ha-energy-email-editor', HaEnergyEmailEditor); }


  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === 'ha-energy-email')) window.customCards.push({ type: 'ha-energy-email', name: 'Energy Email Reports', description: 'Send energy reports via email. Auto-discovers energy sensors.', preview: true });
})();

