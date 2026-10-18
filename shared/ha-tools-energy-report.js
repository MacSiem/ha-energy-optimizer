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
    return {key:ui.key,language:String(ui.language).startsWith('pl')?'pl':'en',timezone:ui.timeZone,
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
    const next=context();if(!same(identity,next)){cancel();identity=next;}
    return state();
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
          result.period?.kind!==p.period||result.display?.language!==p.language||result.display?.timezone!==p.timezone||result.display?.hour_cycle!==p.hour_cycle)throw Error('invalid_report');
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
    const p=preferences();const request={type:'ha_tools_email/energy_report',...selection,language:p.language,timezone:p.timezone,hour_cycle:p.hour_cycle};
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
if (typeof module !== 'undefined' && module.exports) module.exports={createEnergyReportV53};
