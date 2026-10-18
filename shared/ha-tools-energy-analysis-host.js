'use strict';
if (typeof module !== 'undefined' && module.exports) var {createEnergyAnalysisV53} = require('./ha-tools-energy-analysis.js'), {createEnergyAnalysisBindingV53} = require('./ha-tools-energy-analysis-binding.js'), {createEnergyAnalysisViewV53} = require('./ha-tools-energy-analysis-view.js'), {createEnergyPatternsViewV53} = require('./ha-tools-energy-patterns-view.js');

// Owns only the currently mounted schema2 view. Card methods own legacy compatibility.
function createEnergyAnalysisHostV53({card}) {
  let root=null, section='overview', route=null, identity=null, mode='schema2', started=false, ticket=0;
  let selection={period:'day',comparison:'previous'}, options={level:'areas',view:'chart',selected:null};
  let calendarSelection={...selection}, patterns={days:7}, resizeObserver=null, patternWidth=0;
  const patternsView=()=>createEnergyPatternsViewV53({card,width:root?.clientWidth||patternWidth||356});
  const context=()=>[card._hass?.connection,card._hass?.user?.id,card._hass?.user?.is_active,card._hass?.user?.is_admin,card._hass?.connected,
    card._hass?.config?.time_zone,card._hass?.connection?.connected];
  const same=(a,b)=>a && b && a.every((v,i)=>v===b[i]);
  const pl=()=>String(card._hass?.locale?.language || card._hass?.language || 'en').startsWith('pl');
  const text=(en,polish)=>pl()?polish:en;
  const active=()=>card.isConnected && root?.isConnected;
  const controller=createEnergyAnalysisV53({card,onChange:()=>paint()});
  const binding=createEnergyAnalysisBindingV53({card,controller,onInvalidate:()=>{
    mode='schema2';started=false;ticket++;card._clearAnalysisLegacyV53();
    if(active()) {root.replaceChildren();card._render();if(active() && !started)void read();}
  }});
  function observe() {
    const next=context();
    if(!same(identity,next)) {
      // Clear legacy rows before any newly authorized response can arrive.
      if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('keydown',keydown);root.replaceChildren();}root=null;
      resizeObserver?.disconnect();resizeObserver=null;patterns={days:7};patternWidth=0;
      if(section==='patterns')selection={kind:'patterns',days:7};started=false;mode='schema2';ticket++;
      binding.stop();card._clearAnalysisLegacyV53();identity=next;
    }
    return binding.observe();
  }
  function paint() {
    if(!active() || mode==='legacy')return;
    const state=binding.observe(), view=section==='patterns'?patternsView():createEnergyAnalysisViewV53({card});
    if(section==='patterns'&&state.status==='ready'&&state.snapshot?.kind==='patterns')patterns=view.normalize(state.snapshot,patterns);
    const focus=root.getRootNode().activeElement;
    const saved=root.contains(focus)?{action:focus.dataset.analysisAction,value:focus.dataset.analysisValue}:null;
    root.innerHTML=`<style>${view.styles()}</style>` +
      (section==='patterns'?view.markup(state.status==='ready'&&state.snapshot?.kind==='patterns'?state.snapshot:null,patterns,state):state.status==='ready' ? view.markup(state.snapshot,{...selection,...options,section}) :
        `<p role="status">${state.status==='loading'?text('Loading energy analysis…','Ładowanie analizy energii…'):
          state.status==='error'?text('Energy analysis unavailable. Access or backend response could not be confirmed.','Analiza energii niedostępna. Nie potwierdzono dostępu lub odpowiedzi serwera.'):text('Energy analysis','Analiza energii')}</p>`) +
      `<button type="button" data-analysis-action="retry">${text('Retry','Ponów')}</button>`;
    if(saved) [...root.querySelectorAll('[data-analysis-action]')].find(el=>el.dataset.analysisAction===saved.action && el.dataset.analysisValue===saved.value)?.focus({preventScroll:true});
  }
  async function read() {
    if(!active() || mode==='legacy')return;
    const token=++ticket;started=true;
    const state=await binding.read(selection);
    if(token!==ticket || !active())return;
    if(selection.kind!=='patterns' && state.status==='error' && state.error==='unknown_command') {
      // Controller exposes this only for a structured error.code from the wire.
      mode='legacy';root.replaceChildren();
      card._loadAnalysisLegacyV53();
    } else paint();
  }
  function action(event) {
    const control=event.target.closest('[data-analysis-action]');
    if(!control || !root?.contains(control))return;
    const name=control.dataset.analysisAction;
    if(event.type==='click' && control.matches('select,input') || event.type==='change' && !control.matches('select,input'))return;
    const value=control.matches('select,input')?control.value:control.dataset.analysisValue;
    if(name==='retry') {binding.invalidate();return;}
    if(name.startsWith('pattern-')){patternAction(event,name.slice(8),value);return;}
    if(name==='period') {
      if(!['day','week','month','year'].includes(value))return;
      selection.period=value;
      if(value!=='day' && ['same_weekday','mean7'].includes(selection.comparison))selection.comparison='previous';
    } else if(name==='anchor') {if(value)selection.anchor=value;else delete selection.anchor;}
    else if(name==='comparison')selection.comparison=value;
    else if(name==='level')options.level=value;
    else if(name==='view')options.view=value;
    else if(name==='point')options.selected=value;
    else return;
    if(['period','anchor','comparison'].includes(name)) {options.selected=null;void read();}else paint();
  }
  function patternAction(event,name,value){
    if(section!=='patterns')return;
    if(name==='period'){
      if(!['7','30'].includes(String(value)))return;
      patterns.days=Number(value);selection={kind:'patterns',days:patterns.days};void read();return;
    }
    const state=binding.observe();if(state.status!=='ready'||state.snapshot?.kind!=='patterns')return;
    const view=patternsView(),snapshot=state.snapshot;patterns=view.normalize(snapshot,patterns);
    if(name==='resolution'&&['day','hour'].includes(value)){patterns.resolution=value;patterns.selected=null;}
    else if(name==='day'&&snapshot.patterns.days.some(row=>row.local_date===value)){patterns.day=value;patterns.selected=null;}
    else if(name==='metric'&&['kwh','energy_cost','variable_cost'].includes(value))patterns.metric=value;
    else if(name==='type'&&['line','bar'].includes(value))patterns.type=value;
    else if(name==='view'&&['chart','data'].includes(value))patterns.view=value;
    else if(name==='point'&&view.rows(snapshot,patterns).some(row=>row.id===value))patterns.selected=value;
    else if(name==='step'&&['previous','next'].includes(value)){
      const rows=view.rows(snapshot,patterns),index=rows.findIndex(row=>row.id===patterns.selected);
      patterns.selected=rows[Math.max(0,Math.min(rows.length-1,index+(value==='previous'?-1:1)))]?.id??null;
    }else if(name==='weekdays'){event.preventDefault();patterns.weekdaysOpen=!patterns.weekdaysOpen;}
    else return;
    paint();
  }
  function keydown(event){
    if(section!=='patterns'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter'].includes(event.key))return;
    const node=event.target.closest('[data-analysis-action]');
    if(!node||!['pattern-point','pattern-keyboard'].includes(node.dataset.analysisAction))return;
    const state=binding.observe();if(state.status!=='ready'||state.snapshot?.kind!=='patterns')return;
    event.preventDefault();const view=patternsView();patterns=view.normalize(state.snapshot,patterns);
    const rows=view.rows(state.snapshot,patterns),index=rows.findIndex(row=>row.id===patterns.selected);
    const move={ArrowLeft:index-1,ArrowUp:index-1,ArrowRight:index+1,ArrowDown:index+1,Home:0,End:rows.length-1,Enter:index}[event.key];
    patterns.selected=rows[Math.max(0,Math.min(rows.length-1,move))]?.id??null;paint();
  }
  function mount(next, nextSection='overview', period=null) {
    observe();
    if(!next || !card.isConnected || !next.isConnected) {stop();return;}
    const previousSection=section;section=nextSection;
    if(previousSection!==section && (previousSection==='patterns'||section==='patterns')){
      if(section==='patterns'){calendarSelection={...selection};selection={kind:'patterns',days:patterns.days||7};}
      else selection={...calendarSelection};
      ticket++;started=false;controller.invalidate();
    }
    if(section!=='patterns' && ['day','week','month','year'].includes(period) && period!==route) {
      route=period;selection.period=period;options.selected=null;started=false;
      if(period!=='day' && ['same_weekday','mean7'].includes(selection.comparison))selection.comparison='previous';
    }
    if(root!==next) {
      if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('keydown',keydown);if(!root.contains(next))root.replaceChildren();}
      root=next;root.addEventListener('click',action);root.addEventListener('change',action);root.addEventListener('keydown',keydown);
      resizeObserver?.disconnect();resizeObserver=null;
      if(section==='patterns' && typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(entries=>{
        const width=entries[0]?.contentRect?.width;if(active()&&section==='patterns'&&width>0&&width!==patternWidth){patternWidth=width;paint();}
      });resizeObserver.observe(root);}
    }
    if(mode==='legacy' && !root.querySelector('[data-analysis-upgrade-v53]')) {
      const hint=root.ownerDocument.createElement('p');hint.dataset.analysisUpgradeV53='';hint.setAttribute('role','status');
      hint.textContent=text('Upgrade HA Tools Email for schema2 analysis. Showing compatible legacy measurements.','Zaktualizuj HA Tools Email, aby używać analizy schema2. Pokazano zgodne starsze pomiary.');root.prepend(hint);
    }
    paint();if(!started && mode!=='legacy')void read();
  }
  function stop() {
    ticket++;started=false;mode='schema2';binding.stop();resizeObserver?.disconnect();resizeObserver=null;
    if(root){root.removeEventListener('click',action);root.removeEventListener('change',action);root.removeEventListener('keydown',keydown);root.replaceChildren();root=null;}
  }
  const legacyAllowed=()=>{observe();return mode==='legacy' && card.isConnected && card._analysisIsActiveV53() && card._hass?.user?.is_active!==false;};
  return {mount,stop,observe,legacyAllowed,invalidate:binding.invalidate,state:binding.observe};
}
if (typeof module !== 'undefined' && module.exports) module.exports={createEnergyAnalysisHostV53};
