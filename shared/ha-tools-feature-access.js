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
if (typeof module !== 'undefined' && module.exports) module.exports={createFeatureAccessV53};
