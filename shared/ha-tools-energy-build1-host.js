'use strict';
if(typeof module!=='undefined'&&module.exports)var {createEnergyModelV53}=require('./ha-tools-energy-model.js'),{createEnergyBuild1ViewV53}=require('./ha-tools-energy-build1-view.js');
// Presentation-only copy: never alter the backend report or execute iframe script.
function energyBuild1PreviewDocumentV53(html,theme,document){
  const mode=theme==='dark'?'dark':'light';
  const parsed=new document.defaultView.DOMParser().parseFromString(String(html),'text/html');
  parsed.documentElement.setAttribute('data-mail-preview-theme',mode);
  parsed.documentElement.style.colorScheme=mode;
  for(const style of parsed.querySelectorAll('style')){
    // Force only color-scheme media features. Keep width/print/other constraints.
    // Negative viewport widths are always false per Media Queries; zero min is true.
    style.textContent=style.textContent.replace(/@media\b([^{}]*)\{/gi,(all,query)=>'@media'+query.replace(/\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi,(_,wanted)=>wanted.toLowerCase()===mode?'(min-width: 0px)':'(max-width: -1px)')+'{');
  }
  for(const meta of parsed.querySelectorAll('meta[name="color-scheme"],meta[name="supported-color-schemes"]'))meta.setAttribute('content',mode);
  const policy=parsed.createElement('meta');policy.setAttribute('http-equiv','Content-Security-Policy');policy.content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; navigate-to 'none'";parsed.head.prepend(policy);
  return '<!doctype html>'+parsed.documentElement.outerHTML;
}
// Installed outside generated constructor bodies, before customElements.define.
function installEnergyBuild1HostV53({Card,name,format,createClient=createEnergyModelV53,createView=createEnergyBuild1ViewV53}) {
  const key=name==='ha-energy-optimizer'?'_currentTab':'_activeTab';
  const defaults=name==='ha-energy-insights'?'breakdown':name==='ha-energy-email'?'reports':'overview';
  const aliases={dashboard:'overview',daily:'breakdown',weekly:'breakdown',monthly:'breakdown',compare:'costs',recommendations:'costs',schedule:'reports',preview:'reports',send:'reports',history:'reports'};
  const canonical=v=>['overview','breakdown','costs','reports'].includes(v)?v:aliases[v];
  const baseTab={overview:name==='ha-energy-optimizer'?'dashboard':'overview',breakdown:name==='ha-energy-insights'?'daily':name==='ha-energy-optimizer'?'dashboard':'overview',costs:name==='ha-energy-optimizer'?'recommendations':'overview',reports:name==='ha-energy-email'?'overview':name==='ha-energy-optimizer'?'dashboard':'overview'};
  const nativeReportRoute=card=>name==='ha-energy-email'&&(card._build1ConfigV53?.default_tab==='preview'||card._emailCompactSendFlowV106||card._optionsExpandedV5&&card[key]==='send');
  const eligible=card=>!nativeReportRoute(card)&&!card._build1CompatLegacyV53&&!card._build1LegacyV53&&(!(card._config?.compact&&!card._config?.variant))&&(!['tile','compact'].includes(card._config?.variant)||card._optionsExpandedV5);
  const full=card=>eligible(card)&&card._build1ClientV53?.state().supported===true;
  const active=card=>eligible(card)&&card.isConnected&&card.preview!==true;
  const pl=card=>String(card._hass?.locale?.language||card._hass?.language||'en').startsWith('pl');
  const text=(card,en,polish)=>pl(card)?polish:en;
  let painting=new WeakSet();
  const presentations=new WeakMap();
  function client(card){return card._build1ClientV53 ||= createClient({card,guard:card._getTariffHostV3().guard,format,isActive:()=>active(card),onChange:()=>changed(card)});}
  function changed(card){
    if(full(card)){paint(card);return;}
    // Pending/old capability replies must leave existing forms, focus and startup alone.
    if(!card._build1MountedV53)return;
    card._build1MountedV53=false;card._domBuilt=false;presentations.delete(card);
    card.shadowRoot?.replaceChildren();
    queueMicrotask(()=>{if(card.isConnected&&!full(card))hass?.set?.call(card,card._hass);});
  }
  function probe(card){
    if(!active(card)||!card._hass?.user?.id||card._hass.user.is_active===false||card._hass.connected===false||typeof card._hass?.callWS!=='function'||typeof card._hass?.connection?.subscribeMessage!=='function')return;
    // Reuse the existing host's confirmed legacy classification. Do not disturb
    // its Recorder lane or restart already completed compatibility discovery.
    if(card._analysisHostV53?.legacyAllowed?.()===true&&!card._build1ClientV53)return;
    client(card).update(card._build1SelectionV53||{period:options(card).period_default||'day',mode:'full'});
  }
  function options(card){return card._build1ConfigV53||card._config||{};}
  function paint(card){
    if(!full(card)||!card.shadowRoot||painting.has(card))return;
    painting.add(card);
    try {
      const c=options(card),ctl=client(card),s=ctl.state(),ui=format.forHass(card._hass),v=createView({format:ui,language:ui.language});
      if(!card._build1MountedV53){card._analysisHostV53?.stop();card._reportHostV53?.stop();}
      card._build1MountedV53=true;
      const section=card._build1SectionV53||defaults;
      const sectionFeature=section==='reports'?'energy_reports':section==='costs'?'energy_tariff':'energy_analysis';
      const sectionGrant=s.capabilities?.[sectionFeature];
      const sectionAllowed=sectionGrant?.visible===true&&sectionGrant?.read===true;
      const root=card.shadowRoot,doc=root.ownerDocument;
      let memory=presentations.get(card);
      if(!memory){memory={details:new Map(),markup:null,section:null,selection:null,focus:null,scrolls:[]};presentations.set(card,memory);}
      const scope=JSON.stringify(s.selection||card._build1SelectionV53||{});
      const scopeChanged=memory.section!==section||memory.selection!==scope;
      if(scopeChanged){memory.details.clear();memory.focus=null;memory.scrolls=[];memory.section=section;memory.selection=scope;}
      const focused=root.activeElement;
      const focus=focused?.dataset?.energyBuild1,focusValue=focused?.dataset?.value;
      const content=root.querySelector('[data-build1-content]');
      if(content?.contains(focused)){
        if(focus)memory.focus={action:focus,value:focusValue};
        else if(!scopeChanged&&focused?.tagName==='SUMMARY')memory.focus={disclosure:focused.parentElement.dataset.energyBuild1Disclosure};
      }else if(focused||doc.activeElement!==card&&doc.activeElement!==doc.body)memory.focus=null;
      if(!scopeChanged)for(const details of content?.querySelectorAll('[data-energy-build1-disclosure]')||[])memory.details.set(details.dataset.energyBuild1Disclosure,details.open);
      const scrollers=[...content?.querySelectorAll('.table-wrap')||[]];
      if(!scopeChanged&&scrollers.length)memory.scrolls=scrollers.map(node=>[node.scrollLeft,node.scrollTop]);
      card._applyThemeV150?.();
      // A stable connected shell keeps the existing tariff editor and its inputs alive.
      if(!root.querySelector('[data-build1-content]')){root.innerHTML='<style data-build1-style></style><ha-card><div data-build1-content></div><div data-build1-extra></div><div data-build1-tariff-host></div></ha-card>';memory.markup=null;}
      const style=root.querySelector('[data-build1-style]');if(style.textContent!==v.styles())style.textContent=v.styles();
      const panel=root.querySelector('[data-build1-content]');
      const markup=v.markup(sectionAllowed?s.model:null,{section,group:card._build1GroupV53,current:s.current||{},title:c.title,showAlternatives:c.show_alternatives!==false,loading:s.status==='loading',canManageReports:false});
      const replaced=memory.markup!==markup;
      if(replaced){panel.innerHTML=markup;memory.markup=markup;}
      for(const details of panel.querySelectorAll('[data-energy-build1-disclosure]'))if(memory.details.has(details.dataset.energyBuild1Disclosure))details.open=memory.details.get(details.dataset.energyBuild1Disclosure);
      if(replaced)[...panel.querySelectorAll('.table-wrap')].forEach((node,i)=>{if(memory.scrolls[i]){node.scrollLeft=memory.scrolls[i][0];node.scrollTop=memory.scrolls[i][1];}});
      const visible=c.tabs?.map(canonical).filter(Boolean);
      for(const button of panel.querySelectorAll('[data-energy-build1="section"]')){
        const tab=button.dataset.value,feature=tab==='reports'?'energy_reports':tab==='costs'?'energy_tariff':null;
        button.hidden=!!(visible?.length&&!visible.includes(tab)||feature&&s.capabilities?.[feature]?.visible===false);
      }
      const extra=root.querySelector('[data-build1-extra]'),extraKey=JSON.stringify([s.status,section,card._build1OverflowV53,card._hass?.user?.is_admin,ui.language]);
      const extraChanged=memory.extraKey!==extraKey;
      if(extraChanged){extra.replaceChildren();memory.extraKey=extraKey;}
      if(['tile','compact'].includes(c.variant)&&card._optionsExpandedV5){
        let back=root.querySelector('[data-energy-back]');if(!back){back=document.createElement('button');back.type='button';back.setAttribute('data-energy-back','');root.querySelector('ha-card').prepend(back);}back.textContent=text(card,'Back','Wróć');back.style.cssText='min-height:44px';
        back.onclick=()=>{card._optionsExpandedV5=false;card._build1MountedV53=false;ctl.stop();card._domBuilt=false;card._render();card.shadowRoot.querySelector('[data-energy-open]')?.focus({preventScroll:true});};
      }else root.querySelector('[data-energy-back]')?.remove();

      if(extraChanged&&(s.status==='error'||s.status==='denied')){const p=document.createElement('p');p.setAttribute('role','status');p.textContent=s.status==='denied'?text(card,'Access unavailable for this account.','Dostęp dla tego konta jest niedostępny.'):text(card,'Energy report unavailable. Check HA Tools Email and retry.','Raport energii niedostępny. Sprawdź HA Tools Email i ponów.');extra.append(p);const retry=document.createElement('button');retry.textContent=text(card,'Retry','Ponów');retry.onclick=()=>ctl.refresh();extra.append(retry);}
      // Existing editor owns tariffs, migrations, validation, and write authority.
      const tariffArea=root.querySelector('[data-build1-tariff-host]');
      const tariffGrant=s.capabilities?.energy_tariff;
      const revoked=tariffGrant&&(tariffGrant.visible!==true||tariffGrant.read!==true);
      if(revoked){tariffArea.replaceChildren();card._tariffSettingsOpen=false;}
      tariffArea.hidden=section!=='costs'||!!revoked;
      if(section==='costs'&&sectionAllowed){
        if(!tariffArea.firstChild){tariffArea.innerHTML=card._getTariffHostV3().markup();card._getTariffHostV3().bind();}
      }
      if(s.preview?.html&&s.capabilities?.energy_reports?.read===true&&s.capabilities?.energy_reports?.visible===true){
        const holder=panel.querySelector('[data-energy-build1-preview]');if(holder){
          let frame=holder.querySelector('iframe');if(!frame){holder.replaceChildren();frame=doc.createElement('iframe');frame.setAttribute('sandbox','');frame.setAttribute('referrerpolicy','no-referrer');holder.append(frame);}
          frame.title=text(card,'Energy report preview','Podgląd raportu energii');frame.style.cssText=`display:block;width:100%;max-width:${card._build1DeviceV53==='phone'?'390px':'100%'};height:560px;border:0;`;
          const srcdoc=energyBuild1PreviewDocumentV53(s.preview.html,card._build1ThemeV53||'light',doc);if(frame.srcdoc!==srcdoc)frame.srcdoc=srcdoc;
        }
      }else panel.querySelector('[data-energy-build1-preview] iframe')?.remove();
      const implemented=new Set(['section','group','period','previous','next','more','preview-load','preview-device','preview-theme','tariff-edit','configure-energy']);
      for(const b of root.querySelectorAll('[data-energy-build1]')){
        const action=b.dataset.energyBuild1;
        if(!implemented.has(action)){b.disabled=true;b.title=text(card,'This action is not connected in this version.','Ta akcja nie jest podłączona w tej wersji.');}
        if(action==='tariff-edit')b.disabled=s.capabilities?.energy_tariff?.execute!==true;
        if(action==='preview-load')b.disabled=s.busy||s.capabilities?.energy_reports?.read!==true||s.capabilities?.energy_reports?.visible!==true;
        if(['previous','next'].includes(action))b.disabled=!s.model;
        if(['preview-device','preview-theme'].includes(action))b.setAttribute('aria-pressed',String(b.dataset.value===(action==='preview-device'?card._build1DeviceV53||'desktop':card._build1ThemeV53||'light')));
        b.onclick=()=>{if(!b.disabled)void actionFor(card,action,b.dataset.value);};
      }
      if(replaced&&memory.focus&&(!root.activeElement||root.activeElement===focused)){
        const hint=memory.focus;let target;
        if(hint.action)target=[...panel.querySelectorAll('[data-energy-build1]')].find(b=>b.dataset.energyBuild1===hint.action&&b.dataset.value===hint.value);
        else if(hint.disclosure)target=[...panel.querySelectorAll('[data-energy-build1-disclosure]')].find(d=>d.dataset.energyBuild1Disclosure===hint.disclosure)?.querySelector('summary');
        if(target&&!target.disabled)target.focus({preventScroll:true});
      }
      if(extraChanged&&card._build1OverflowV53){
        const choices=name==='ha-energy-optimizer'?[['patterns','Patterns','Wzorce'],['recommendations','Recommendations','Rekomendacje']]:name==='ha-energy-insights'?[['tips','Recommendations','Rekomendacje']]:[['config','Email settings','Ustawienia e-mail'],['schedule','Schedules','Harmonogramy'],['send','Send form','Formularz wysyłki'],['history','History','Historia']];
        for(const [tab,en,polish] of choices){if(name==='ha-energy-email'&&card._hass?.user?.is_admin!==true)continue;const b=document.createElement('button');b.textContent=text(card,en,polish);b.onclick=()=>legacy(card,tab);extra.append(b);}
      }
    }finally{painting.delete(card);}
  }
  function render(card){if(!full(card)||!card._hass?.user?.id||!card.shadowRoot)return false;client(card).update(card._build1SelectionV53||{period:options(card).period_default||'day',mode:'full'});paint(card);return true;}
  function legacy(card,tab){card._build1LegacyV53=true;card._build1OverflowV53=false;card._build1MountedV53=false;card._build1ClientV53?.stop();card._domBuilt=false;card[key]=tab;card._render();const b=document.createElement('button');b.textContent=text(card,'Back to Energy','Wróć do Energii');b.onclick=()=>{card._build1LegacyV53=false;card._domBuilt=false;card._render();probe(card);};card.shadowRoot.prepend(b);}
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
    presentations.delete(this);this._build1MountedV53=false;this._build1ClientV53?.stop();this._build1CompatLegacyV53=false;this._build1ConfigV53={...config};this._build1LegacyV53=['patterns','tips','config'].includes(config.default_tab);this._build1SectionV53=canonical(config.default_tab)||(config.tabs?.map(canonical).filter(Boolean).includes(defaults)?defaults:config.tabs?.map(canonical).find(Boolean))||defaults;this._build1SelectionV53={period:config.period_default||'day',mode:'full'};
    const nativeTabs=name==='ha-energy-optimizer'?['dashboard','patterns','recommendations','compare']:name==='ha-energy-insights'?['overview','daily','weekly','monthly','tips']:['overview','schedule','preview','send','config','history'];
    const translate=v=>nativeTabs.includes(v)?v:baseTab[canonical(v)]||v;
    const legacyConfig={...config};if(config.default_tab)legacyConfig.default_tab=translate(config.default_tab);if(config.tabs)legacyConfig.tabs=[...new Set(config.tabs.map(translate))];
    const result=set.call(this,legacyConfig);probe(this);render(this);return result;
  };
  const hass=Object.getOwnPropertyDescriptor(Card.prototype,'hass');
  if(hass?.set)Object.defineProperty(Card.prototype,'hass',{...hass,set(value){
    // The original setter owns first discovery, context purges, quiet recovery,
    // and existing form/transport lifetimes until this identity confirms schema.
    if(full(this)){
      this._hass=value;this._lang=String(value?.locale?.language||value?.language||'en').startsWith('pl')?'pl':'en';this._build1ClientV53.update(this._build1SelectionV53);
      if(render(this))return;
    }
    const result=hass.set.call(this,value);probe(this);return result;
  }});
  for(const method of ['_render','_renderTab','_renderCurrentTab','_updateContent']){const old=Card.prototype[method];if(old)Card.prototype[method]=function(...args){if(render(this))return;if(!eligible(this))this._build1ClientV53?.stop();const result=old.apply(this,args);if(this._optionsExpandedV5)probe(this);return result;};}
  const connected=Card.prototype.connectedCallback;
  Card.prototype.connectedCallback=function(){
    if(full(this)){this._tariffHostController?.guard.resume();probe(this);render(this);}
    else{connected?.call(this);probe(this);}
  };
  const disconnected=Card.prototype.disconnectedCallback;
  Card.prototype.disconnectedCallback=function(){presentations.delete(this);this._build1ClientV53?.stop();return disconnected?.call(this);};
}
if(typeof module!=='undefined'&&module.exports)module.exports={installEnergyBuild1HostV53,energyBuild1PreviewDocumentV53};
