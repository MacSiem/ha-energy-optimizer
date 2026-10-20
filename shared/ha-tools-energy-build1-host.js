'use strict';
if(typeof module!=='undefined'&&module.exports)var {createEnergyModelV53}=require('./ha-tools-energy-model.js'),{createEnergyBuild1ViewV53}=require('./ha-tools-energy-build1-view.js');
// Installed outside generated constructor bodies, before customElements.define.
function installEnergyBuild1HostV53({Card,name,format,createClient=createEnergyModelV53,createView=createEnergyBuild1ViewV53}) {
  const key=name==='ha-energy-optimizer'?'_currentTab':'_activeTab';
  const defaults=name==='ha-energy-insights'?'breakdown':name==='ha-energy-email'?'reports':'overview';
  const aliases={dashboard:'overview',daily:'breakdown',weekly:'breakdown',monthly:'breakdown',compare:'costs',recommendations:'costs',schedule:'reports',preview:'reports',send:'reports',history:'reports'};
  const canonical=v=>['overview','breakdown','costs','reports'].includes(v)?v:aliases[v];
  const baseTab={overview:name==='ha-energy-optimizer'?'dashboard':'overview',breakdown:name==='ha-energy-insights'?'daily':name==='ha-energy-optimizer'?'dashboard':'overview',costs:name==='ha-energy-optimizer'?'recommendations':'overview',reports:name==='ha-energy-email'?'overview':name==='ha-energy-optimizer'?'dashboard':'overview'};
  const full=card=>!card._build1CompatLegacyV53&&!card._build1LegacyV53&&(!(card._config?.compact&&!card._config?.variant))&&(!['tile','compact'].includes(card._config?.variant)||card._optionsExpandedV5);
  const active=card=>full(card)&&card.isConnected&&card.preview!==true;
  const pl=card=>String(card._hass?.locale?.language||card._hass?.language||'en').startsWith('pl');
  const text=(card,en,polish)=>pl(card)?polish:en;
  let painting=new WeakSet();
  function client(card){return card._build1ClientV53 ||= createClient({card,guard:card._getTariffHostV3().guard,format,isActive:()=>active(card),onChange:()=>paint(card)});}
  function options(card){return card._build1ConfigV53||card._config||{};}
  function paint(card){
    if(!full(card)||!card.shadowRoot||painting.has(card))return;
    painting.add(card);
    try {
      const c=options(card),ctl=client(card),s=ctl.state(),ui=format.forHass(card._hass),v=createView({format:ui,language:ui.language});
      if(s.status==='legacy'){card._build1CompatLegacyV53=true;card._domBuilt=false;queueMicrotask(()=>card._render());return;}
      const section=card._build1SectionV53||defaults;
      const sectionFeature=section==='reports'?'energy_reports':section==='costs'?'energy_tariff':'energy_analysis';
      const sectionGrant=s.capabilities?.[sectionFeature];
      const sectionAllowed=sectionGrant?.visible===true&&sectionGrant?.read===true;
      const root=card.shadowRoot,focus=root.activeElement?.dataset?.energyBuild1,focusValue=root.activeElement?.dataset?.value;
      card._applyThemeV150?.();
      root.innerHTML=`<style>${v.styles()}</style><ha-card>${v.markup(sectionAllowed?s.model:null,{section,group:card._build1GroupV53,current:s.current||{},title:c.title,showAlternatives:c.show_alternatives!==false,loading:s.status==='loading',canManageReports:false})}<div data-build1-extra></div></ha-card>`;
      const visible=c.tabs?.map(canonical).filter(Boolean);
      for(const [tab,feature] of [['reports','energy_reports'],['costs','energy_tariff']])if(s.capabilities?.[feature]?.visible===false)root.querySelectorAll('[data-energy-build1="section"]').forEach(b=>{if(b.dataset.value===tab)b.remove();});
      if(visible?.length)for(const b of root.querySelectorAll('[data-energy-build1="section"]'))if(!visible.includes(b.dataset.value))b.remove();
      const extra=root.querySelector('[data-build1-extra]');
      if(s.status==='error'||s.status==='denied'){const p=document.createElement('p');p.setAttribute('role','status');p.textContent=s.status==='denied'?text(card,'Access unavailable for this account.','Dostęp dla tego konta jest niedostępny.'):text(card,'Energy report unavailable. Check HA Tools Email and retry.','Raport energii niedostępny. Sprawdź HA Tools Email i ponów.');extra.append(p);const retry=document.createElement('button');retry.textContent=text(card,'Retry','Ponów');retry.onclick=()=>ctl.refresh();extra.append(retry);}
      // Existing editor owns tariffs, migrations, validation, and write authority.
      if(section==='costs'&&sectionAllowed){const mount=document.createElement('div');mount.innerHTML=card._getTariffHostV3().markup();extra.append(mount);card._getTariffHostV3().bind();}
      if(s.preview?.html&&s.capabilities?.energy_reports?.read===true&&s.capabilities?.energy_reports?.visible===true){
        const holder=root.querySelector('[data-energy-build1-preview]');if(holder){holder.replaceChildren();const frame=document.createElement('iframe');frame.title=text(card,'Energy report preview','Podgląd raportu energii');frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');frame.style.cssText=`display:block;width:100%;max-width:${card._build1DeviceV53==='phone'?'390px':'100%'};height:560px;border:0;color-scheme:${card._build1ThemeV53||'light'};`;
          frame.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'; navigate-to \'none\'">'+s.preview.html;holder.append(frame);}
      }
      const implemented=new Set(['section','group','period','previous','next','more','preview-load','preview-device','preview-theme','tariff-edit','configure-energy']);
      for(const b of root.querySelectorAll('[data-energy-build1]')){
        const action=b.dataset.energyBuild1;
        if(!implemented.has(action)){b.disabled=true;b.title=text(card,'This action is not connected in this version.','Ta akcja nie jest podłączona w tej wersji.');}
        if(action==='tariff-edit')b.disabled=s.capabilities?.energy_tariff?.execute!==true;
        if(action==='preview-load')b.disabled=s.busy||s.capabilities?.energy_reports?.read!==true||s.capabilities?.energy_reports?.visible!==true;
        if(['previous','next'].includes(action))b.disabled=!s.model;
        b.addEventListener('click',()=>{if(!b.disabled)void actionFor(card,action,b.dataset.value);});
        if(action===focus&&b.dataset.value===focusValue)b.focus({preventScroll:true});
      }
      if(card._build1OverflowV53){
        const choices=name==='ha-energy-optimizer'?[['patterns','Patterns','Wzorce'],['recommendations','Recommendations','Rekomendacje']]:name==='ha-energy-insights'?[['tips','Recommendations','Rekomendacje']]:[['config','Email settings','Ustawienia e-mail'],['schedule','Schedules','Harmonogramy'],['send','Send form','Formularz wysyłki'],['history','History','Historia']];
        for(const [tab,en,polish] of choices){if(name==='ha-energy-email'&&card._hass?.user?.is_admin!==true)continue;const b=document.createElement('button');b.textContent=text(card,en,polish);b.onclick=()=>legacy(card,tab);extra.append(b);}
      }
    }finally{painting.delete(card);}
  }
  function render(card){if(!full(card))return false;if(!card._hass||!card.shadowRoot)return true;client(card).update(card._build1SelectionV53||{period:options(card).period_default||'day',mode:'full'});paint(card);return true;}
  function legacy(card,tab){card._build1LegacyV53=true;card._build1OverflowV53=false;card._build1ClientV53?.stop();card._domBuilt=false;card[key]=tab;card._render();const b=document.createElement('button');b.textContent=text(card,'Back to Energy','Wróć do Energii');b.onclick=()=>{card._build1LegacyV53=false;card._domBuilt=false;render(card);};card.shadowRoot.prepend(b);}
  async function actionFor(card,action,value){
    if(!active(card))return;
    const ctl=client(card),s=ctl.state();
    if(action==='section'){card._build1SectionV53=value;paint(card);}
    else if(action==='group'){card._build1GroupV53=value;paint(card);}
    else if(action==='period'){card._build1SelectionV53={period:value,mode:'full'};ctl.update(card._build1SelectionV53);paint(card);}
    else if(action==='previous'||action==='next'){
      if(!s.model)return;const period=s.selection.period,parts=new Intl.DateTimeFormat('en-CA',{timeZone:card._hass.config.time_zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(s.model.period.start));const f=Object.fromEntries(parts.map(p=>[p.type,p.value]));const d=new Date(`${f.year}-${f.month}-${f.day}T12:00:00Z`),n=action==='next'?1:-1;
      if(period==='year')d.setUTCFullYear(d.getUTCFullYear()+n);else if(period==='month')d.setUTCMonth(d.getUTCMonth()+n);else d.setUTCDate(d.getUTCDate()+n*(period==='week'?7:1));
      card._build1SelectionV53={period,mode:'full',date:d.toISOString().slice(0,10)};ctl.update(card._build1SelectionV53);paint(card);
    } else if(action==='preview-load')await ctl.preview();
    else if(action==='preview-device'){card._build1DeviceV53=value;paint(card);}
    else if(action==='preview-theme'){card._build1ThemeV53=value;paint(card);}
    else if(action==='more'){card._build1OverflowV53=!card._build1OverflowV53;paint(card);}
    else if(action==='tariff-edit'){if(s.capabilities?.energy_tariff?.execute!==true)return;card._tariffSettingsOpen=true;paint(card);const details=card.shadowRoot.querySelector('[data-tariff-details]');if(details){details.open=true;card._getTariffHostV3().bind();details.querySelector('summary')?.focus();}}
    else if(action==='configure-energy'){history.pushState(null,'','/energy');window.dispatchEvent(new CustomEvent('location-changed'));}
  }
  const set=Card.prototype.setConfig;
  Card.prototype.setConfig=function(config={}){
    if(config.period_default!==undefined&&!['day','week','month','year'].includes(config.period_default))throw Error('period_default: day / week / month / year');
    if(config.show_alternatives!==undefined&&typeof config.show_alternatives!=='boolean')throw Error('show_alternatives: boolean');
    this._build1ClientV53?.stop();this._build1CompatLegacyV53=false;this._build1ConfigV53={...config};this._build1LegacyV53=['patterns','tips','config'].includes(config.default_tab);this._build1SectionV53=canonical(config.default_tab)||(config.tabs?.map(canonical).filter(Boolean).includes(defaults)?defaults:config.tabs?.map(canonical).find(Boolean))||defaults;this._build1SelectionV53={period:config.period_default||'day',mode:'full'};
    const legacyConfig={...config};if(canonical(config.default_tab))legacyConfig.default_tab=baseTab[canonical(config.default_tab)];if(config.tabs)legacyConfig.tabs=[...new Set(config.tabs.map(v=>baseTab[canonical(v)]||v))];
    const result=set.call(this,legacyConfig);render(this);return result;
  };
  const hass=Object.getOwnPropertyDescriptor(Card.prototype,'hass');
  if(hass?.set)Object.defineProperty(Card.prototype,'hass',{...hass,set(value){if(!full(this)){this._build1ClientV53?.stop();return hass.set.call(this,value);}this._hass=value;this._lang=String(value?.locale?.language||value?.language||'en').startsWith('pl')?'pl':'en';this._tariffHostController?.guard.observe();render(this);}});
  for(const method of ['_render','_renderTab','_renderCurrentTab','_updateContent']){const old=Card.prototype[method];if(old)Card.prototype[method]=function(...args){if(render(this))return;this._build1ClientV53?.stop();return old.apply(this,args);};}
  const connected=Card.prototype.connectedCallback;
  Card.prototype.connectedCallback=function(){if(full(this)){this._tariffHostController?.guard.resume();render(this);}else connected?.call(this);};
  const disconnected=Card.prototype.disconnectedCallback;
  Card.prototype.disconnectedCallback=function(){this._build1ClientV53?.stop();return disconnected?.call(this);};
}
if(typeof module!=='undefined'&&module.exports)module.exports={installEnergyBuild1HostV53};
