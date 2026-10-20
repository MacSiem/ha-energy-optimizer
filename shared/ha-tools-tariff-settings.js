'use strict';
// Node-only dependency; runtime consumers vendor the guard in their own closure.
if (typeof module !== 'undefined' && module.exports) var { createTariffGuardV3 } = require('./ha-tools-tariff-guard.js');

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
      && state.wireCapabilities?.energy_tariff?.execute === true && !state.wireMigrationRequired
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
      else{state.wireCapabilities=null;state.wireEnvelope=null;state.wireTemplates=[];state.wireDrafts={};state.draft=blank();state.profile=null;root.replaceChildren();}
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
    let result;try{result=await guard.call(token,request);}catch(error){if(['unauthorized','not_allowed'].includes(error?.code))rejectAuthority(null);throw error;}
    const after=await guard.call(token,{type:'ha_tools_email/feature_capabilities'});
    if(!current(token) || !authorized(after) || after.revision!==before.revision){rejectAuthority(after);throw {code:'unauthorized'};}
    state.wireCapabilities=clone(after.capabilities);
    if(request.type==='ha_tools_email/get_tariff_profile'){
      if(!object(result)||!['ready','empty','inactive','migration_required'].includes(result.status)||!Array.isArray(result.tariff_profiles)||result.tariff_profiles.length>32||!Array.isArray(result.tariffs)||result.tariffs.length>8||result.tariff_profiles.some(v=>!object(v)||typeof v.version_id!=='string'||!object(v.profile)||v.profile.schema!==2||typeof v.profile.name!=='string'||!Array.isArray(v.profile.fixed))||result.tariffs.some(tariff=>!object(tariff)||typeof tariff.id!=='string'||typeof tariff.name!=='string'))throw {code:'malformed'};
      state.wireEnvelope=clone(result);
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
    if(wireProfile){state.wireCapabilities=null;state.wireEnvelope=null;state.wireTemplates=[];state.wireDrafts={};state.wireRequested=null;state.wireReadback=null;state.wireKey=null;state.wireHistoricalAck=false;}
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
        message('unconfirmed',t('Legacy tariff semantics need explicit migration before editing. No prices were inferred.', 'Semantyka starej taryfy wymaga jawnej migracji przed edycją. Nie przyjęto stawek.'));return;
      }
      if (!envelope(result)) throw { code: 'malformed' };
      if(wireProfile){state.wireMigrationRequired=false;state.wireHistoricalAck=false;}
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
  const wireFields = () => `<fieldset data-wire-panel><legend>${esc(t('Saved versions and server templates','Zapisane wersje i szablony serwera'))}</legend>
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

if (typeof module !== 'undefined' && module.exports) module.exports = { createTariffSettingsV3 };
