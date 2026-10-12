// Pure frontend controller; the existing integration owns scheduling and DST.
// Vendor the exported factory inside consumer IIFEs; no global or second scheduler.
export function createHaToolsEmailSchedules({ changed = () => {}, timeoutMs = 8000,
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
  let reading = null, writing = false, previewing = null, pendingExpected = null, preview = null;
  let status = { state: 'not_checked', reason: 'initial' }, previewStatus = { state: 'not_checked', reason: 'initial' };
  const cancellations = new Set();
  const capture = value => ({ user: value?.user?.id ?? value?.user ?? null, admin: value?.user?.is_admin === true,
    connection: value?.connection ?? null, online: !!value && !browserOffline && !connectionOffline && value.connected !== false && value.connection?.connected !== false });
  const allowed = () => !!hass && context?.admin && context?.online && !browserOffline && !connectionOffline && hass.user?.is_admin === true && hass.connected !== false && hass.connection?.connected !== false;
  const notify = () => changed();
  const reset = () => {
    epoch++; for (const cancel of [...cancellations]) cancel(); cancellations.clear();
    checked = false; rows = []; draft = null; privateRows = new Map(); privateDraft = null; pendingRecipients = null; reading = null; writing = false; previewing = null;
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
  const unavailable = error => ['unknown_command', 'not_found'].includes(error?.code);
  const read = () => {
    if (!allowed()) return Promise.resolve();
    if (typeof hass.callWS !== 'function') { checked = true; status = { state: 'not_checked', reason: 'unavailable' }; notify(); return Promise.resolve(); }
    if (reading) return reading.promise;
    const token = { epoch, promise: null }, source = hass;
    reading = token; checked = true; status = { state: pendingExpected ? 'unconfirmed' : 'not_checked', reason: 'loading' };
    token.promise = (async () => {
      try {
        const response = await request(source, { type: 'ha_tools_email/list_schedules' }, token);
        if (epoch !== token.epoch || reading !== token || !allowed()) return;
        rows = cleanRows(response);
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
    if (!allowed() || !draft || writing || reading || pendingExpected || !['success', 'no_data', 'error'].includes(status.state)) return;
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
  const previewRead = () => {
    if (!allowed() || previewing || writing) return previewing?.promise || Promise.resolve();
    const selection = draft || rows.find(row => row.kind === kind);
    if (!selection) return Promise.resolve();
    try { validate(selection); } catch (error) { previewStatus = { state: 'error', reason: error.code }; notify(); return Promise.resolve(); }
    const token = { epoch, promise: null }, source = hass;
    const message = { type: 'ha_tools_email/' + (kind === 'energy_report' ? 'preview_energy_report' : 'preview_log_digest'), cadence: selection.cadence };
    if (kind === 'energy_report') message.calendar_period = true;
    if (selection.timezone) message.timezone = selection.timezone;
    previewing = token; preview = null; previewStatus = { state: 'not_checked', reason: 'loading' };
    token.promise = (async () => {
      try {
        const response = await request(source, message, token);
        if (epoch !== token.epoch || previewing !== token || !allowed()) return;
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
        preview = null; previewStatus = { state: 'not_checked', reason: unavailable(error) ? 'unavailable' : 'read_failed' };
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
      if (!allowed() || writing || pendingExpected || reading || !['success', 'no_data', 'error'].includes(status.state)) return;
      const row = rows.find(value => value.id === id && value.kind === kind);
      if (!row) return;
      previewing?.cancel?.(); previewing = null;
      privateDraft = recipientEditor ? [...(privateRows.get(id) || [])] : null;
      draft = { ...row, timezone: row.timezone || '', weekday: row.weekday ?? 0, month_day: row.month_day ?? 1 };
      preview = null; previewStatus = { state: 'not_checked', reason: 'initial' }; notify();
    },
    create() {
      if (!allowed() || reading || writing || pendingExpected || !['success', 'no_data'].includes(status.state)) return;
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
    save, preview: previewRead,
    async remove(id) {
      if (!allowed() || reading || writing || pendingExpected || !rows.some(row => row.id === id && row.kind === kind) || !['success', 'no_data', 'error'].includes(status.state)) return;
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
