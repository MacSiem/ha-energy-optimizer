'use strict';
// Existing server stores and send_now dispatcher; no scheduler, SMTP setup or auto retry.
function createEnergyReportsActionsV53({card,guard,getCapabilities,isActive=()=>false,onChange=()=>{},format=null,createSchedules=typeof createHaToolsEmailSchedules==='function'?createHaToolsEmailSchedules:null}){
 const copy=v=>v==null?v:JSON.parse(JSON.stringify(v)),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pl=()=>String(card._hass?.locale?.language||card._hass?.language||'en').startsWith('pl'),t=(en,polish)=>pl()?polish:en;
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
 async function protectedCall(request){
  const e=epoch,token=guard.snapshot(),admin=card._hass?.user?.is_admin===true;
  if(!current(e,token)||!admin||guard.occupied())throw {code:'stale_context'};
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
  const result=await guard.call(token,request,true);
  if(!current(e,token))throw {code:'stale_context'};
  return result;
 }
 function schedules(){
  if(store||!createSchedules||card._hass?.user?.is_admin!==true)return store;
  // An existing controller instance keeps the exact same backend store/protocol.
  // Proxy every raw request through this card's shared wire fence.
  proxy={...card._hass,callWS:protectedCall};
  store=createSchedules({kind:'energy_report',recipientEditor:true,changed:storeChanged,contextLost:()=>{form=null;}});store.setContext(proxy);return store;
 }
 async function load(){
  if(!observe()||loaded||raw||guard.occupied())return;
  pending=false;loaded=true;const e=epoch,token=guard.snapshot(),lane={};raw=lane;state.status='loading';emit();
  try{
   // Safe bounded household facts; never get_config or get_attempt_history here.
   try{state.reportStatus=await guard.call(token,{type:'ha_tools_email/get_report_status',purpose:'energy_report'});}catch(_){state.reportStatus=null;}
   if(!current(e,token))return;
   if(executable()){
    try{const targets=await guard.call(token,{type:'ha_tools_email/list_delivery_targets'});if(!current(e,token))return;
     state.targets=Array.isArray(targets)?targets.filter(r=>r&&typeof r.id==='string'&&(r.id==='email'||r.id==='persistent_notification'||/^notify\.[a-z0-9_]{1,128}$/.test(r.id))).map(r=>({id:r.id,name:String(r.name||r.id),default:r.default===true})):[];
    }catch(_){state.targets=[];}
   }
   if(card._hass?.user?.is_admin===true){
    try{const history=await guard.call(token,{type:'ha_tools_email/get_attempt_history'},true);if(!current(e,token))return;
     state.deliveries=(history?.schema===1&&Array.isArray(history.attempts)?history.attempts:[]).filter(r=>r.kind==='energy_report'&&typeof r.id==='string'&&typeof r.timestamp==='string'&&Number.isFinite(Date.parse(r.timestamp))).slice(0,5).map(r=>({id:r.id,at:r.timestamp,name:r.cadence||'energy_report',cadence:r.cadence,channel:r.channel||(['accepted_by_smtp'].includes(r.outcome)?'email':null),status:failed.has(r.outcome)?'failed':r.outcome,retryable:failed.has(r.outcome)}));
    }catch(_){state.deliveries=[];}
   }
   if(!current(e,token))return;state.status='ready';
  }catch(_){if(current(e,token))state.status='error';}finally{if(raw===lane)raw=null;if(current(e,token)){emit();if(card._hass?.user?.is_admin===true){const c=schedules();if(refreshSchedules){refreshSchedules=false;await c?.refresh?.();}else await c?.ensureRead?.();}}}
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
  scheduleReview.consumed=true;emit();await store.save();return store.model().status.state==='success';
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
  if(state.outcome)html+=`<p role="status">${esc(status[state.outcome]||state.outcome)}</p>`;
  const next=state.reportStatus?.schema===1&&state.reportStatus?.purpose==='energy_report'&&state.reportStatus?.schedule_state==='enabled'?state.reportStatus.next_report_at:null;
  if(typeof next==='string'&&Number.isFinite(Date.parse(next)))html+=`<p>${t('Next report','Następny raport')}: ${esc(format?.forHass?.(card._hass)?.dateTime(next)||next)}</p>`;
  if(state.message)html+=`<p role="status">${esc(state.message)}</p>`;
  if(form){
   const locked=form.consumed||raw!==null;
   html+=`<fieldset><legend>${t('Send a new energy report','Wyślij nowy raport energii')}</legend><p>${t('Previous completed calendar period. This does not send the selected historical preview.','Poprzedni zakończony okres kalendarzowy. Nie wysyła wybranego podglądu historycznego.')}</p>`;
   if(form.phase==='review')html+=`<p>${esc(form.cadence)} · ${esc(form.channel)}${form.channel==='email'?' · '+esc(form.recipients):''}</p>${button('confirm',t('Confirm send once','Potwierdź jedną wysyłkę'),locked)}${button('edit-send',t('Edit','Edytuj'),locked)}`;
   else html+=`<label>${t('Channel','Kanał')}<select data-report-field="channel"><option value="">${t('Choose a channel','Wybierz kanał')}</option>${state.targets.map(r=>`<option value="${esc(r.id)}" ${r.id===form.channel?'selected':''}>${esc(r.name)}</option>`).join('')}</select></label><label>${t('Period','Okres')}<select data-report-field="cadence">${['daily','weekly','monthly'].map(c=>`<option value="${c}" ${form.cadence===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>${field('recipients',t('Email recipients (used only for email)','Odbiorcy e-mail (tylko dla kanału e-mail)'),'text',form.recipients)}${button('review',t('Review delivery','Sprawdź wysyłkę'),locked||!form.channel)}`;
   html+=button('cancel',t('Cancel','Anuluj'),locked)+'</fieldset>';
  }
  const sm=store?.model(),d=sm?.draft;
  if(d&&executable()){
   const entry=(key,label,type='text')=>`<label>${label}<input type="${type}" data-schedule-field="${key}" value="${esc(d[key]??'')}"></label>`;
   const selected=d.channels||['email'],missing=selected.filter(id=>!state.targets.some(target=>target.id===id));
   if(scheduleReview){
    const plan=scheduleReview,channels=plan.draft.channels||['email'];
    html+=`<fieldset><legend>${t('Review recurring report','Sprawdź raport cykliczny')}</legend><p>${esc(plan.draft.cadence)} · ${esc(plan.draft.time)} · ${esc(plan.draft.timezone||card._hass?.config?.time_zone||'HA')} · ${plan.draft.enabled?t('Enabled','Włączony'):t('Disabled','Wyłączony')}</p>${plan.draft.cadence==='weekly'?`<p>${t('Weekday (0 Sunday – 6 Saturday)','Dzień tygodnia (0 niedziela – 6 sobota)')}: ${esc(plan.draft.weekday)}</p>`:plan.draft.cadence==='monthly'?`<p>${t('Day of month','Dzień miesiąca')}: ${esc(plan.draft.month_day)}</p>`:''}<p>${esc(channels.join(', '))}</p>${channels.includes('email')?`<p>${esc(plan.recipients.join(', '))}</p>`:''}${button('confirm-schedule',t('Confirm schedule save','Potwierdź zapis harmonogramu'),plan.consumed||sm.writing||sm.reading||sm.locked)}${button('edit-schedule',t('Edit','Edytuj'),sm.writing||sm.locked)}${button('cancel-schedule',t('Cancel','Anuluj'),sm.writing)}</fieldset>`;
   }else{
    html+=`<fieldset><legend>${t('Recurring energy report','Cykliczny raport energii')}</legend><label>${t('Channels (select one or more)','Kanały (wybierz co najmniej jeden)')}<select multiple data-schedule-channels>${state.targets.map(target=>`<option value="${esc(target.id)}" ${selected.includes(target.id)?'selected':''}>${esc(target.name)}</option>`).join('')}</select></label>${missing.length?`<p role="status">${t('Unavailable selected targets; choose current targets: ','Niedostępne wybrane cele; wybierz aktualne cele: ')}${esc(missing.join(', '))}</p>`:''}<label>${t('Cadence','Częstotliwość')}<select data-schedule-field="cadence">${['daily','weekly','monthly'].map(c=>`<option value="${c}" ${d.cadence===c?'selected':''}>${c}</option>`).join('')}</select></label>${entry('time',t('Time','Godzina'),'time')}${entry('timezone',t('Time zone (empty: HA)','Strefa czasu (pusta: HA)'))}${entry('weekday',t('Weekday 0–6','Dzień tygodnia 0–6'),'number')}${entry('month_day',t('Day of month 1–31','Dzień miesiąca 1–31'),'number')}<label><input type="checkbox" data-schedule-field="enabled" ${d.enabled?'checked':''}>${t('Enabled','Włączony')}</label>${selected.includes('email')?`<label>${t('Email recipients','Odbiorcy e-mail')}<input data-schedule-recipients value="${esc((store.recipientModel()||[]).join(', '))}"></label>`:''}${button('save-schedule',t('Review schedule','Sprawdź harmonogram'),sm.writing||sm.reading||sm.locked)}${button('cancel-schedule',t('Cancel','Anuluj'),sm.writing)}</fieldset>`;
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
if(typeof module!=='undefined'&&module.exports)module.exports={createEnergyReportsActionsV53};
