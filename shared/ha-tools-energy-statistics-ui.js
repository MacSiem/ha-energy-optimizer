'use strict';
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
    if(!keys(v,['enabled','revision','reader_scope','warning','membership_mode','pending','author_user_id','active_epoch','dataset','catalog',...(Object.hasOwn(v,'automation')?['automation']:[])]) || typeof v.enabled!=='boolean' || typeof v.pending!=='boolean' || !integer(v.revision) ||
      v.reader_scope!=='all_authenticated_ha_users' || v.membership_mode!=='current_snapshot' || !str(v.warning,4096) || (v.author_user_id!==null&&!str(v.author_user_id,128)) || (v.active_epoch!==null&&!str(v.active_epoch,128)) ||
      !Array.isArray(v.catalog) || v.catalog.length>4096) throw Error('invalid_statistics');
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
if (typeof module !== 'undefined' && module.exports) module.exports = { createEnergyStatisticsUiV53 };
