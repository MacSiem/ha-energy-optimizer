"use strict";
// Read-only bounded report facts. One retained raw lane; no private API fallback.
function createReportStatusV53({card,guard,purpose,getSourceKey = () => guard.snapshot().epoch,isActive = () => false,onChange = () => {}}) {
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
  const emit = () => { try { onChange(); } catch (_) { /* UI failures cannot release a wire. */ } };
  const active = () => card.isConnected && card.preview !== true && isActive() && card._hass?.connected !== false;
  const primitive = key => typeof key === 'number' && Number.isSafeInteger(key) && key >= 0;
  const source = () => { const key = getSourceKey(); if (!primitive(key)) throw Error('invalid_source_key'); return key; };
  const same = (a,b) => a && b && a.every((value,index) => value === b[index]);
  const reset = () => {
    clearTimeout(expiry); expiry = null;
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
    revision++; snapshot = null; pending = enabled && active(); status = pending ? 'loading' : 'idle'; emit(); queue();
  };
  const failure = error => error?.code === 'unauthorized' || error?.code === 'not_allowed' ? 'denied' : error?.code === 'unknown_command' ? 'unsupported' : 'unavailable';
  function update() {
    let token,key;
    try { token = guard.snapshot(); key = source(); }
    catch (_) { reset(); status = 'unavailable'; return; }
    if (!active() || !guard.available(token)) { if (enabled || identity || snapshot || pending) reset(); return; }
    const next = [token.epoch,key,card._hass?.connected];
    if (enabled && same(identity,next)) return;
    reset(); enabled = true; identity = next; pending = true; status = 'loading';
    const task = {generation,token,key};
    const connection = card._hass?.connection;
    if (typeof connection?.subscribeMessage !== 'function') { pending = false; status = 'unavailable'; return; }
    const operation = Promise.resolve().then(() => {
      if (!controlCurrent(task)) return null;
      return connection.subscribeMessage(() => { if (unsubscribe && controlCurrent(task)) invalidate(); },{type:'ha_tools_email/subscribe_analysis_updates'});
    }).then(dispose => {
      if (typeof dispose !== 'function') { if (controlCurrent(task)) throw {code:'subscription_unavailable'}; return; }
      if (!controlCurrent(task)) { try { dispose(); } catch (_) {} return; }
      unsubscribe = dispose; pending = true; queue(); emit();
    }).catch(error => {
      if (controlCurrent(task)) { snapshot = null; pending = false; status = failure(error); emit(); }
    }).finally(() => { if (activation === operation) activation = null; });
    activation = operation;
  }
  function pump() {
    if (!pending || !enabled || !unsubscribe || raw || guard.occupied() || !active()) return;
    let key,token;
    try { key = source(); token = guard.snapshot(); } catch (_) { reset(); status = 'unavailable'; emit(); return; }
    const task = {generation,revision,key,token,settled:false,publicDone:false,startedAt:performance.now()};
    if (!controlCurrent(task)) return;
    raw = task; pending = false; status = 'loading'; snapshot = null;
    let request;
    try { request = guard.call(token,{type:'ha_tools_email/get_report_status',purpose}); }
    catch (error) { request = Promise.reject(error); }
    Promise.resolve(request).then(value => {
      if (!current(task)) return;
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
      if (current(task)) { snapshot = null; status = failure(error); if (error?.code === 'wire_occupied') pending = true; emit(); }
    }).finally(() => {
      task.publicDone = true;
      if (task.settled || !guard.occupied()) { if (raw === task) raw = null; queue(); }
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
    update(); if (pending) queue();
    return {status,busy:raw !== null,snapshot:snapshot ? {...snapshot,last_attempt:snapshot.last_attempt ? {...snapshot.last_attempt} : null} : null};
  };
  return {state,update:() => { update(); queue(); },stop};
}
if (typeof module !== 'undefined' && module.exports) module.exports = {createReportStatusV53};
