'use strict';
// Only an active analysis view owns these subscriptions; never auto-load cards.
function createEnergyAnalysisBindingV53({card, controller, onInvalidate = () => {}}) {
  const events = ['ha_tools_email_energy_analysis_updated', 'ha_tools_email_feature_access_updated'];
  let generation=0, intent=0, identity=null, activation=null, enabled=false, failure=null;
  const subscriptions=new Set();
  const context=()=>({connection:card?._hass?.connection,user:card?._hass?.user?.id,
    zone:card?._hass?.config?.time_zone,available:card?.isConnected!==false &&
    card?._hass?.connection?.connected!==false && !!card?._hass?.user?.id});
  const same=(a,b)=>a && b && a.connection===b.connection && a.user===b.user &&
    a.zone===b.zone && a.available===b.available;
  const stop=()=>{
    generation++;intent++;enabled=false;identity=null;activation=null;failure=null;
    for(const unsubscribe of subscriptions) {try{unsubscribe();}catch(_){} }
    subscriptions.clear();controller.disconnect();
  };
  const start=()=>{
    const next=context();
    if(enabled && same(identity,next))return activation;
    stop();
    if(!next.available || typeof next.connection?.subscribeEvents!=='function')return Promise.resolve(false);
    enabled=true;identity=next;controller.connect();
    const token=generation;
    const current=()=>enabled && token===generation && same(next,context());
    activation=Promise.all(events.map(event=>Promise.resolve().then(()=>{
      if(!current())return null;
      return next.connection.subscribeEvents(()=>{
        if(!current())return;
        controller.invalidate();onInvalidate();
      },event);
    }).then(unsubscribe=>{
      if(typeof unsubscribe!=='function') {if(current())throw Error('analysis_subscription_unavailable');return;}
      if(!current()){try{unsubscribe();}catch(_){}return;}
      subscriptions.add(unsubscribe);
    }))).then(()=>current()).catch(()=>{
      if(current()){stop();failure='analysis_subscription_unavailable';}return false;
    });
    return activation;
  };
  const read=async selection=>{
    const ready=start(), selected=++intent;
    if(await ready && enabled && selected===intent && same(identity,context()))return controller.read(selection);
    return observe();
  };
  const observe=()=>{
    if(enabled && !same(identity,context()))stop();
    return failure ? {status:'error',selection:null,snapshot:null,error:failure} : controller.state();
  };
  // A confirmed tariff revision or existing guard invalidation uses this path.
  const invalidate=()=>{controller.invalidate();if(enabled)onInvalidate();};
  return {read,observe,stop,invalidate};
}
if(typeof module!=='undefined' && module.exports)module.exports={createEnergyAnalysisBindingV53};
