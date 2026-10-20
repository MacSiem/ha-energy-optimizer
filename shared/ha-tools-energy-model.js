'use strict';
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
      if(typeof c.subscribeEvents==='function') {
        Promise.resolve(c.subscribeEvents(()=>{if(enabled&&same(association,context()))invalidate();},'ha_tools_email_energy_updated')).then(fn=>{if(!enabled||!same(association,context())||!ack){fn?.();return;}if(typeof fn==='function')unsub.push(fn);}).catch(()=>{});
      }
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
    if(caps.status!=='ready'||!Number.isSafeInteger(caps.revision)||!caps.capabilities?.energy_analysis)throw Error('invalid_capabilities');
    view.capabilities=clone(caps.capabilities);
    const grant=view.capabilities.energy_analysis;
    if(grant.visible!==true||grant.read!==true){view.status='denied';emit();return false;}
    return true;
  }
  const validModel=(m,s)=>m?.schema==='ha_tools.energy_report/1'&&m.period?.kind===s.period&&m.period?.timezone===card._hass?.config?.time_zone&&Number.isFinite(Date.parse(m.period.start))&&Number.isFinite(Date.parse(m.period.end))&&m.totals&&typeof m.totals==='object'&&m.coverage&&Array.isArray(m.hourly);
  async function pump(){
    if(!observe()||!pending||raw||guard.occupied())return;
    pending=false;const e=epoch,s={...selection},token=guard.snapshot();
    const lane={};raw=lane;view.status='loading';emit();
    try {
      const caps=await guard.call(token,{type:'ha_tools_email/feature_capabilities'});
      if(!current(e)||!capabilities(caps))return;
      // Subscribe only after schema negotiation; confirm grants again after ACK
      // to close the policy-change gap before the first authoritative model read.
      if(!ack){
        if(!await subscribe()||!current(e))return;
        const confirmed=await guard.call(token,{type:'ha_tools_email/feature_capabilities'});
        if(!current(e)||!capabilities(confirmed))return;
      }
      emit();
      const model=await guard.call(token,{type:'ha_tools_email/energy_report',...s,representation:'model'});
      if(!current(e))return;
      if(!validModel(model,s))throw Error('invalid_energy_model');
      view.model=clone(model);view.status='ready';emit();
      // Independent today snapshot. Do not infer current zone/price from a full period.
      let live=null;try{live=await guard.call(token,{type:'ha_tools_email/energy_report',period:'day',mode:'so_far',representation:'model'});}catch(error){if(['unauthorized','not_allowed'].includes(error?.code))throw error;}
      if(!current(e))return;
      if(validModel(live,{period:'day'}))view.current=clone(live.current||null);
      emit();
    } catch(error){if(current(e)){view.model=null;view.current=null;view.preview=null;view.capabilities=null;if(error?.code==='unknown_command'&&view.supported!==true){view.supported=false;view.status='legacy';}else view.status=['unauthorized','not_allowed'].includes(error?.code)?'denied':'error';view.error=error?.code||error?.message||'unavailable';emit();}}
    finally{if(raw===lane)raw=null;if(pending)void pump();}
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
if(typeof module!=='undefined'&&module.exports)module.exports={createEnergyModelV53};
