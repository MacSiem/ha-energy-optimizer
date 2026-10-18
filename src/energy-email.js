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
  const stamp = value => typeof value === 'number' ? (Number.isFinite(value) ? value : NaN) : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? Date.parse(value) : NaN;
  const localized = (value, options, locale = language) => {
    const time = stamp(value);
    if (!Number.isFinite(time)) return null;
    try { return new Intl.DateTimeFormat(locale, {timeZone, ...options}).format(time); } catch (_) { return null; }
  };
  const clock = (value, withOffset = false) => localized(value, {hour:'2-digit', minute:'2-digit', hourCycle, ...(withOffset ? {timeZoneName:'shortOffset'} : {})});
  const date = (value, short = false) => localized(value, {day:'numeric', month:'short', ...(short ? {} : {year:'numeric'})}, dateLanguage);
  const pointLabel = value => localized(value, {year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hourCycle, timeZoneName:'shortOffset'}, dateLanguage);
  const chartLabels = (values, resolution = 'hour') => {
    const showDate = resolution === 'day' || values.length > 1 && stamp(values.at(-1)) - stamp(values[0]) >= 86400000;
    const labels = values.map(value => resolution === 'day' ? date(value, true) : `${showDate ? date(value, true) + ' ' : ''}${clock(value)}`);
    const counts = new Map();
    for (const label of labels) counts.set(label, (counts.get(label) || 0) + 1);
    return labels.map((label, index) => counts.get(label) < 2 ? label : resolution === 'day' ? pointLabel(values[index])
      : `${showDate ? date(values[index], true) + ' ' : ''}${clock(values[index], true)}`);
  };
  const key = JSON.stringify([language, timeZone, hourCycle, dateLanguage]);
  const numbers = new Intl.NumberFormat(language);
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
      const clock = new Intl.DateTimeFormat(language, {timeZone, hour:'2-digit', minute:'2-digit', hourCycle});
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
  return {timeZone, key, clock, date, pointLabel, chartLabels, number:(value, options)=>options ? new Intl.NumberFormat(language, options).format(value) : numbers.format(value), count, dateTime, range, periodMarkup, capturePeriods, restorePeriods};
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
  let systemZone;
  try { systemZone = validZone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch (_) {}
  const serverZone = validZone(hass?.config?.time_zone);
  const timeZone = (locale.time_zone === 'server' ? serverZone : systemZone) || serverZone || 'UTC';
  const clockLanguage = locale.time_format === 'system' ? systemLanguage || language : language;
  const hourCycle = locale.time_format === '12' ? 'h12' : locale.time_format === '24' ? 'h23'
    : new Intl.DateTimeFormat(clockLanguage, {hour:'numeric'}).resolvedOptions().hourCycle;
  return createFormatUi(language, timeZone, {hourCycle, dateLanguage:locale.date_format === 'system' ? systemLanguage || language : language});
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
        this._serverSchedules.setContext(hass);
        this._mailPreview.setContext(hass);
        this._attemptHistory.setContext(hass);
        if (this._activeTab === 'history') this._render();
        if (!hass) { this.shadowRoot.replaceChildren(); return; }
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
        if (!this._emailBackendChecked && this._activeTab !== 'schedule') this._loadEmailBackendConfig().catch(e => this._showToast('⚠️ ' + (e?.message || e)));
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
this._tariffHostController = createTariffHostV3({ card: this, kind: 'email', createModel: createEnergyTariffV3, legacyProfile: energyTariffProfileV3, createSettings: createTariffSettingsV3, createUi: createUiV3, ...this._createTariffConsumerV3(createTariffGuardV3) });
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
      if (!this._sharedTariffExpectedV3 || Object.hasOwn(this._config, 'tariff_profile')) return;
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
      const assertCurrent = () => { if (!current()) throw { code: 'energy_context_changed' }; };
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
      if (Object.hasOwn(this._config, 'tariff_profile') || this._sharedTariffProfile != null || this._sharedTariffNeedsConfirmationV3()) return null;
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
      if (this._discoveryDone || this._initialDiscoveryPromise || !this.isConnected ||
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
          .stat-label { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
          .stat-sub { font-size: 11px; color: var(--bento-text-secondary); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
          .card .tabs{flex-wrap:wrap;overflow:visible}
          .card .tab-btn{white-space:normal;overflow-wrap:anywhere;flex:0 1 auto}
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
              <div class="header-sub">${recipientDisplay} \u00A0\u2022\u00A0 ${this._hass?.user?.is_admin === true ? `<button type="button" id="price-display" aria-label="${L ? 'Edytuj taryfę energii' : 'Edit energy tariff'}">${_esc(this._tariffHeaderCurrencyV3())} ${_esc(this._getTariffLabel())} \u270E</button>` : `<span id="price-display">${_esc(this._tariffHeaderCurrencyV3())} ${_esc(this._getTariffLabel())}</span>`}</div>
            </div>
          </div>
          <label class="email-tab-picker">${L ? 'Widok' : 'View'}<select id="email-tab-select" aria-label="${L ? 'Widok' : 'View'}">${['overview','schedule','preview','send','config','history'].map((tab,i)=>`<option value="${tab}" ${this._activeTab===tab?'selected':''}>${(L?['Przegląd','Harmonogram','Podgląd','Wyślij teraz','Ustawienia','Historia']:['Overview','Schedule','Preview','Send Now','Config','History'])[i]}</option>`).join('')}</select></label>
          <div class="tabs" role="tablist" aria-label="${L ? 'Widoki Energy Email' : 'Energy Email views'}">
            <button class="tab-btn ${this._activeTab === 'overview' ? 'active' : ''}" id="email-tab-overview" data-tab="overview">\u{1F4CA} ${L ? "Przegląd" : "Overview"}</button>
            <button class="tab-btn ${this._activeTab === 'schedule' ? 'active' : ''}" id="email-tab-schedule" data-tab="schedule">\u{1F4C5} ${L ? "Harmonogram" : "Schedule"}</button>
            <button class="tab-btn ${this._activeTab === 'preview' ? 'active' : ''}" id="email-tab-preview" data-tab="preview">\u{1F4CB} ${L ? "Podgląd" : "Preview"}</button>
            <button class="tab-btn ${this._activeTab === 'send' ? 'active' : ''}" id="email-tab-send" data-tab="send">\u{1F4E4} ${L ? "Wyślij teraz" : "Send Now"}</button>
            <button class="tab-btn ${this._activeTab === 'config' ? 'active' : ''}" id="email-tab-config" data-tab="config">\u2699\uFE0F ${L ? "Ustawienia" : "Config"}</button>
            <button class="tab-btn ${this._activeTab === 'history' ? 'active' : ''}" id="email-tab-history" data-tab="history">${L ? 'Historia' : 'History'}</button>
          </div>
          <div id="tab-content" tabindex="-1" role="region" aria-label="${(L ? {overview:'Przegląd',schedule:'Harmonogram',preview:'Podgląd',send:'Wyślij teraz',config:'Ustawienia',history:'Historia'} : {overview:'Overview',schedule:'Schedule',preview:'Preview',send:'Send Now',config:'Config',history:'History'})[this._activeTab] || 'Energy Email'}"></div>
          ${this._tariffDetailsMarkup()}
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
      this._bindTariffSettings();
      this._bindEmailEvents();
      this._bindPriceEdit();
      if (renderToken === this._emailContextVersion && this._hass?.user?.is_admin === true) {
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

    _renderTab(fullRender = false) {
      if (!fullRender) this._checkActionFocus();
      const el = this.shadowRoot.getElementById('tab-content');
      if (!el) return;
      const periodFormat = createFormatUi();
      const periodContext = this._getTariffHostV3().guard.snapshot();
      const periodUi = periodFormat.capturePeriods(this.shadowRoot, this._periodUiContextV4, periodContext);
      this._periodUiContextV4 = periodContext;
      const focused = this.shadowRoot.activeElement, focusId = focused?.id;
      const selection = typeof focused?.selectionStart === 'number' ? [focused.selectionStart,focused.selectionEnd,focused.selectionDirection] : null;
      const legacyFields = this._activeTab === 'schedule' ? [...el.querySelectorAll('input[id],select[id]')]
        .filter(field => /^(schedule-(?:time|recipients|enabled)-(?:daily|weekly|monthly)|time-(?:daily|weekly|monthly)|day-weekly)$/.test(field.id))
        .map(field => ({ id: field.id, value: field.value, checked: field.checked })) : [];
      if (this._hass?.user?.is_admin !== true && ['schedule', 'preview', 'send', 'config', 'history'].includes(this._activeTab)) {
        el.innerHTML = `<div class="empty-state" role="status">${this._lang === 'pl' ? 'Tylko administrator może zmieniać ustawienia i wysyłać raporty. Podgląd energii jest dostępny w zakładce Przegląd.' : 'Only administrators can change settings and send reports. Energy data remains available in Overview.'}</div>`;
        return;
      }
      switch (this._activeTab) {
        case 'overview': el.innerHTML = this._tabOverview(); this._attachOverviewEvents(); break;
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
        return `<button class="overview-period-btn" id="overview-period-${p}" data-period="${p}" style="padding:5px 12px;font-size:11px;border-radius:6px;cursor:pointer;border:1px solid var(--bento-border);background:${period === p ? 'var(--bento-primary)' : 'var(--bento-bg)'};color:${period === p ? '#fff' : 'var(--bento-text)'};font-weight:${period === p ? '600' : '400'};">${lb}</button>`;
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
            <div class="stat-value" style="color:#F59E0B">${format.number(complete ? totalEnergy : recordedEnergy, {minimumFractionDigits:1, maximumFractionDigits:1})}</div>
            <div class="stat-label">${!complete ? (L ? 'Zarejestrowane zużycie · ' : 'Recorded usage · ') : ''}kWh ${periodLabel}</div>
            <div class="stat-sub source-coverage">${displayData.length}/${coverage?.sources?.length ?? displayData.length} ${L ? 'źródeł z pomiarami' : 'sources with measurements'}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#3B82F6">${this._formatCost(totalCost)}</div>
            <div class="stat-label">${_esc(this._tariffCurrency())} ${L ? 'Koszt' : 'Cost'}</div>
            <div class="stat-sub">@ ${_esc(this._getTariffLabel())}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#10B981">${displayData.length > 0 ? _esc(displayData[0].name.split(' ').slice(0,2).join(' ')) : '-'}</div>
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
            const entityInfo = d.entity_id ? `<span style="font-size:10px;color:var(--bento-text-muted)" title="${_esc(d.entity_id)}">${_esc((d.entity_id.split('.')[1] || d.entity_id).substring(0,20))}</span>` : '';
            return `<div class="device-row" title="${_esc(d.entity_id || d.name)}">
              <div class="device-name">${_esc(d.name)} ${entityInfo}${Number.isFinite(d.measuredHours) ? `<div class="helper">${d.measuredHours}/${d.expectedHours} ${L ? 'zmierzonych godzin' : 'measured hours'}</div>` : ''}</div>
              <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
              <div class="device-val">${this._fmt(d.month, 1)} kWh</div>
              <div style="font-size:11px;color:var(--bento-text-secondary);min-width:60px;text-align:right">${diffStr}</div>
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
    return `<section class="schedule-preview"><h4>${_esc(preview.subject)}</h4>
      <dl><dt>${pl ? 'Od (włącznie)' : 'From (inclusive)'}</dt><dd>${_esc(date(preview.period.from))}</dd>
      <dt>${pl ? 'Do (wyłącznie)' : 'To (exclusive)'}</dt><dd>${_esc(date(preview.period.to))}</dd>
      <dt>${pl ? 'Wygenerowano' : 'Generated'}</dt><dd>${_esc(date(preview.generated_at))}</dd>
      <dt>${pl ? 'Źródło' : 'Source'}</dt><dd>${_esc(source)}${preview.source?.complete === false ? (pl ? ' — częściowe dane' : ' — partial data') : ''}</dd></dl>
      <iframe id="${id}" title="${(pl ? 'Podgląd maila energii' : 'Energy mail preview')}" sandbox="" referrerpolicy="no-referrer" style="width:100%;height:600px;border:1px solid var(--divider-color,#ddd);background:white"></iframe></section>`;
  }

    _bindMailFrame(id, preview) {
      const frame = this.shadowRoot.getElementById(id);
      if (!frame || typeof preview?.html !== 'string') return;
      frame.srcdoc = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'">` + preview.html;
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
            <div><span style="font-size:18px;font-weight:700;color:#F59E0B">${totalEnergy === null ? 'N/A' : this._fmt(totalEnergy, 1)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">kWh</span></div>
            <div><span style="font-size:18px;font-weight:700;color:#3B82F6">${this._formatCost(totalCost)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">${_esc(this._tariffCurrency())}</span></div>
          </div>
          <table class="preview-table">
            <thead><tr><th>${L ? 'Źródło importu' : 'Import source'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'} (${_esc(this._tariffCurrency())})</th></tr></thead>
            <tbody>${top5.map(d => `<tr><td>${_esc(d.name)}</td><td>${d.current === null ? 'N/A' : this._fmt(d.current, 2)}</td><td>${this._formatCost(d.cost)}</td></tr>`).join('')}
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
            <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">${_esc(this._getTariffLabel())} \u2022 HA Energy Email Card</p>
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

    connectedCallback() {
      if (this._tariffHostController) {
        this._tariffHostController.guard.resume();
        // Reconfirm shared prices for this mount; reuse settled measurements.
        this._observeTariffNavigationV3();
      }
      if (this._initialDiscoveryStartedV3) this._ensureInitialDiscovery();
    }

    disconnectedCallback() {
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
      this._observeTariffNavigationV3();
      if (tabId === 'schedule') { this._serverSchedules.setContext(this._hass); this._serverSchedules.ensureRead(); }
      if (tabId === 'history') this._attemptHistory.setContext(this._hass);
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
  // HA_ENERGY_CARD_OPTIONS_V5_START
// Presentation-only card options. No pricing, storage, backend writes or requests.
function createEnergyCardOptionsV5({ Card, Editor, name, title, tabs, labels }) {
  const key = name === 'ha-energy-optimizer' ? '_currentTab' : '_activeTab';
  const pl = host => String(host._hass?.locale?.language || host._hass?.language || navigator.language || '').startsWith('pl');
  const t = (host, en, polish) => pl(host) ? polish : en;
  const visible = config => config.tabs || tabs;
  const validate = config => {
    if (config.tabs !== undefined && (!Array.isArray(config.tabs) || !config.tabs.length || config.tabs.some(id => !tabs.includes(id)) || new Set(config.tabs).size !== config.tabs.length)) throw new Error('tabs: choose at least one known visible tab / wybierz widoczną zakładkę');
    if (config.default_tab !== undefined && !visible(config).includes(config.default_tab)) throw new Error('default_tab must be a visible tab / domyślna zakładka musi być widoczna');
    for (const option of ['compact', 'show_help', 'show_support']) if (config[option] !== undefined && typeof config[option] !== 'boolean') throw new Error(`${option}: expected true or false`);
    if (config.chart_hours !== undefined && (!Number.isInteger(config.chart_hours) || config.chart_hours < 1 || config.chart_hours > 744)) throw new Error('chart_hours: 1–744 whole hours / pełnych godzin');
  };
  const originalSet = Card.prototype.setConfig;
  Card.prototype.setConfig = function(config = {}) {
    validate(config);
    const previous = this._optionsConfigV5;
    const changed = !previous || previous.default_tab !== config.default_tab;
    this._optionsConfigV5 = { ...config };
    if (previous && previous.compact !== config.compact) { this._optionsExpandedV5 = false; this._domBuilt = false; }
    if (this._config) {
      this._config = {...this._config};
      for (const option of ['default_tab','tabs','compact','show_help','show_support','chart_hours']) if (!(option in config)) delete this._config[option];
    }
    if (changed || !visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    // Existing integrations own their complete configuration and backend context.
    const result = originalSet.call(this, config);
    if (this._hass && name === 'ha-energy-insights') this._render();
    return result;
  };
  Card.prototype.getGridOptions = function() { return { columns: this._config?.compact ? 6 : 12, min_columns: 3, min_rows: this._config?.compact ? 2 : 3 }; };
  const originalSize = Card.prototype.getCardSize;
  Card.prototype.getCardSize = function() { return this._config?.compact && !this._optionsExpandedV5 ? 3 : originalSize?.call(this) || 10; };
  const style = `:host{display:block;min-width:0} [data-energy-options-help], [data-energy-compact]{box-sizing:border-box;padding:16px;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border-radius:12px;font-size:14px;overflow-wrap:anywhere} [data-energy-options-help] summary, [data-energy-expand]{min-height:44px;box-sizing:border-box;padding:12px;cursor:pointer} [data-energy-compact] dl{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:12px 0} [data-energy-compact] dt{font-size:13px;color:var(--secondary-text-color,#50545b)} [data-energy-compact] dd{margin:0 0 12px;font-weight:600;font-size:18px} [data-energy-expand]{color:var(--primary-text-color,#202124);background:var(--secondary-background-color,#eee);border:1px solid var(--divider-color,#888);border-radius:8px;font:inherit} [data-energy-options-help] summary:focus-visible,[data-energy-expand]:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}`;
  const render = Card.prototype._render;
  Card.prototype._render = function(...args) {
    const config = this._config || {};
    if (!visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    if (config.compact && !this._optionsExpandedV5) {
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
    const result = render.apply(this, args);
    this._applyCardOptionsV5();
    return result;
  };
  Card.prototype._applyCardOptionsV5 = function() {
    const root = this.shadowRoot, config = this._config || {}, allowed = visible(config);
    const heading = root.querySelector('[data-energy-card-title]'); if (heading) heading.textContent = config.title ?? title;
    for (const button of root.querySelectorAll('.tabs [data-tab]')) { button.hidden = !allowed.includes(button.dataset.tab); button.style.display = button.hidden ? 'none' : ''; }
    for (const option of root.querySelectorAll('.energy-tab-picker option, #email-tab-select option')) { option.hidden = !allowed.includes(option.value); option.disabled = option.hidden; }
    for (const select of root.querySelectorAll('.energy-tab-picker select, #email-tab-select')) select.value = this[key];
    // Only optional guidance is affected. Warnings, unknowns and setup errors stay visible.
    let help = root.querySelector('[data-energy-options-help]');
    if (!help && root.children.length) {
      const css = document.createElement('style'); css.textContent = style; root.append(css);
      help = document.createElement('details'); help.dataset.energyOptionsHelp = '';
      help.innerHTML = '<summary></summary><p></p>'; root.append(help);
      help.addEventListener('toggle', event => { if (event.isTrusted && help.open !== this._helpDefaultOpenV5) this._helpManualOpenV5 = help.open; });
      help.querySelector('summary').addEventListener('click', () => { this._helpManualOpenV5 = !help.open; });
    }
    if (!help) return;
    help.hidden = config.show_help === false;
    help.querySelector('summary').textContent = t(this, 'Help', 'Pomoc');
    help.querySelector('p').textContent = t(this, 'Card options change the view only. N/A means unavailable data. Hour limits apply to hourly charts, without changing calendar periods, measurements or tariff prices.', 'Opcje karty zmieniają tylko widok. N/A oznacza brak danych. Limit godzin dotyczy wykresów godzinowych, bez zmiany okresów kalendarza, pomiarów ani cen taryfy.');
    const resize = width => { this._helpDefaultOpenV5 = width >= 600; help.open = this._helpManualOpenV5 ?? this._helpDefaultOpenV5; };
    resize(this.getBoundingClientRect().width);
    this._optionsResizeV5?.disconnect();
    if (typeof ResizeObserver === 'function') { this._optionsResizeV5 = new ResizeObserver(entries => resize(entries[0].contentRect.width)); this._optionsResizeV5.observe(this); }
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
      return hour ? this._limitChartRowsV5(rows) : rows;
    };
  }
  for (const method of ['_updateContent','_renderTab','_renderCurrentTab']) {
    const original = Card.prototype[method]; if (!original) continue;
    Card.prototype[method] = function(...args) { const value = original.apply(this,args); this._applyCardOptionsV5(); return value; };
  }
  const disconnect = Card.prototype.disconnectedCallback;
  Card.prototype.disconnectedCallback = function() { this._optionsResizeV5?.disconnect(); return disconnect?.call(this); };
  // Reuse existing editor text fields and their focus/caret-preserving synchronization.
  const editorRender = Editor.prototype._render;
  Editor.prototype._render = function(...args) { editorRender.apply(this,args); this._renderOptionsV5(); };
  Editor.prototype._renderOptionsV5 = function() {
    const root = this.shadowRoot;
    let fields = root.querySelector('[data-energy-option-fields]');
    if (!fields) {
      fields = document.createElement('div'); fields.dataset.energyOptionFields = '';
      fields.innerHTML = `<style>label[data-option-row]{display:flex;align-items:center;gap:8px;min-height:44px}select,input[type=number]{min-height:44px;box-sizing:border-box;width:100%;font:inherit;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#888);border-radius:8px;padding:8px}fieldset{margin:12px 0;border:1px solid var(--divider-color,#888)}[data-option-row] input{width:24px;height:24px;min-height:24px;margin:0}select:focus-visible,input:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}[data-config-error]{color:var(--error-color,#b42318)}</style><label data-option-label="default_tab" for="cf_default_tab"></label><select id="cf_default_tab" data-config="default_tab">${tabs.map(id=>`<option value="${id}"></option>`).join('')}</select><fieldset><legend data-option-label="tabs"></legend>${tabs.map(id=>`<label data-option-row><input type="checkbox" data-tab-option="${id}"><span data-tab-label="${id}"></span></label>`).join('')}</fieldset>${['compact','show_help','show_support'].map(id=>`<label data-option-row><input type="checkbox" data-config="${id}"><span data-option-label="${id}"></span></label>`).join('')}<label data-option-label="chart_hours" for="cf_chart_hours"></label><input id="cf_chart_hours" type="number" min="1" max="744" step="1" data-config="chart_hours"><p data-config-error role="alert"></p>`;
      root.append(fields);
      fields.addEventListener('change', event => {
        const field = event.target;
        if (!field.matches('[data-config],[data-tab-option]')) return;
        const candidate = {...this._config};
        if (field.dataset.tabOption) candidate.tabs = [...fields.querySelectorAll('[data-tab-option]:checked')].map(node=>node.dataset.tabOption);
        else { const option = field.dataset.config; if (option === 'chart_hours' && field.value === '') delete candidate[option]; else candidate[option] = field.type === 'checkbox' ? field.checked : option === 'chart_hours' ? Number(field.value) : field.value; }
        // An implicit default is the first visible tab; explicit defaults must remain visible.
        try { validate(candidate); if (field.dataset.tabOption && !candidate.tabs.includes(candidate.default_tab || tabs[0])) throw new Error(t(this,'The default tab must remain visible.','Domyślna zakładka musi być widoczna.')); }
        catch(error) { fields.querySelector('[data-config-error]').textContent = error.message; this._renderOptionsV5(); return; }
        fields.querySelector('[data-config-error]').textContent = '';
        this._config = candidate;
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...candidate}},bubbles:true,composed:true}));
      });
    }
    const names = {default_tab:t(this,'Default tab','Domyślna zakładka'),tabs:t(this,'Visible tabs','Widoczne zakładki'),compact:t(this,'Compact view','Widok kompaktowy'),show_help:t(this,'Show help','Pokaż pomoc'),show_support:t(this,'Show project support','Pokaż wsparcie projektu'),chart_hours:t(this,'Hourly chart range (1–744 hours; empty = full range)','Zakres wykresów godzinowych (1–744 godz.; puste = cały zakres)')};
    fields.querySelectorAll('[data-option-label]').forEach(node=>node.textContent=names[node.dataset.optionLabel]);
    tabs.forEach((id,index)=>{const label=labels[pl(this)?1:0][index];fields.querySelector(`[data-tab-label="${id}"]`).textContent=label;const option=fields.querySelector(`option[value="${id}"]`);option.textContent=label;option.disabled=!visible(this._config).includes(id);fields.querySelector(`[data-tab-option="${id}"]`).checked=visible(this._config).includes(id);});
    for(const field of fields.querySelectorAll('[data-config]')) {const option=field.dataset.config;field.setAttribute('aria-label',names[option]);if(field.type==='checkbox')field.checked=option==='compact'?this._config[option]===true:this._config[option]!==false;else if(root.activeElement!==field)field.value=this._config[option]??(option==='default_tab'?visible(this._config)[0]:'');}
  };
}
// HA_ENERGY_CARD_OPTIONS_V5_END
createEnergyCardOptionsV5({ Card: HAEnergyEmail, Editor: HaEnergyEmailEditor, name: "ha-energy-email", title: "Energy Email Reports", tabs: ["overview", "schedule", "preview", "send", "config", "history"], labels: [["Overview", "Schedule", "Preview", "Send now", "Config", "History"], ["Przegląd", "Harmonogram", "Podgląd", "Wyślij teraz", "Ustawienia", "Historia"]] });
if (!customElements.get('ha-energy-email-editor')) { customElements.define('ha-energy-email-editor', HaEnergyEmailEditor); }


  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === 'ha-energy-email')) window.customCards.push({ type: 'ha-energy-email', name: 'Energy Email Reports', description: 'Send energy reports via email. Auto-discovers energy sensors.', preview: true });
})();

