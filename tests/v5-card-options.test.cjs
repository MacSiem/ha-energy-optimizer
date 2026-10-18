const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const files=['optimizer','energy-insights','energy-email'];
function setup(){const dom=new JSDOM('',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});dom.window.eval(files.map(f=>fs.readFileSync(`src/${f}.js`,'utf8')).join('\n'));return dom;}
for(const name of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email']){
 test(`${name}: visual options preserve unknown keys and focused editor nodes`,()=>{const dom=setup(),w=dom.window;try{const C=w.customElements.get(name),e=C.getConfigElement();e.setConfig({type:`custom:${name}`,custom_nested:{keep:true}});w.document.body.append(e);const events=[];e.addEventListener('config-changed',event=>{events.push(event.detail.config);e.setConfig(event.detail.config);});for(const key of ['default_tab','compact','show_help','show_support','chart_hours'])assert.ok(e.shadowRoot.querySelector(`[data-config="${key}"]`),key);const input=e.shadowRoot.querySelector('#cf_title');input.focus();input.value='Edited title';input.setSelectionRange(2,5,'backward');input.dispatchEvent(new w.Event('input'));e.hass={language:'pl',locale:{language:'pl'}};assert.equal(e.shadowRoot.activeElement,input);assert.equal(input.selectionDirection,'backward');assert.equal(events.at(-1).custom_nested.keep,true);const tabs=e.shadowRoot.querySelector('[data-tab-option]');tabs.checked=false;tabs.dispatchEvent(new w.Event('change',{bubbles:true}));assert.match(e.shadowRoot.querySelector('[data-config-error]').textContent,/visible|widoczna/);assert.equal(events.length,1);}finally{w.close();}});
 test(`${name}: compact only consumes backend snapshot and expands locally`,()=>{const dom=setup(),w=dom.window;try{const c=w.document.createElement(name);c.setConfig({compact:true});c._energySnapshotV5={currency:'EUR',today:{usage_cost:-1.5},current:{available:true,zone_class:'cheap',cheap:true},next_cheap:{status:'known',start:'2026-10-18T12:00:00+00:00'}};c._render();assert.ok(c.shadowRoot.querySelector('[data-energy-compact]'));assert.match(c.shadowRoot.textContent,/EUR/);assert.match(c.shadowRoot.textContent,/-1[,.]50/);const old=c._energySnapshotV5;c.shadowRoot.querySelector('[data-energy-expand]').click();assert.equal(c._optionsExpandedV5,true);assert.equal(c._energySnapshotV5,old);assert.equal(c.getGridOptions().min_columns,3);assert.throws(()=>c.setConfig({tabs:[],default_tab:'hidden'}),/visible|widoczna/);}finally{w.close();}});
 test(`${name}: default tab validates without mutating config and survives same-config echo`,()=>{const dom=setup(),w=dom.window;try{const c=w.document.createElement(name),key=name==='ha-energy-optimizer'?'_currentTab':'_activeTab',tabs=name==='ha-energy-optimizer'?['dashboard','patterns']:name==='ha-energy-insights'?['overview','daily']:['overview','schedule'];const config={tabs,default_tab:tabs[1]};c.setConfig(config);assert.equal(c[key],tabs[1]);c[key]=tabs[0];c.setConfig({...config});assert.equal(c[key],tabs[0]);assert.throws(()=>c.setConfig({tabs:[tabs[0]],default_tab:tabs[1]}),/visible|widoczna/);assert.equal(c[key],tabs[0]);}finally{w.close();}});
}
for(const name of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email']) {
 test(`${name}: unknown compact never falls back to local price and support options survive echo`,()=>{const dom=setup(),w=dom.window;try{const c=w.document.createElement(name);c.setConfig({compact:true,currency:'PLN',energy_price:99});c._render();assert.equal(c.shadowRoot.querySelector('[data-cost]').textContent,'N/A');assert.equal(c.shadowRoot.querySelector('[data-zone]').textContent,'N/A');assert.equal(c.shadowRoot.querySelector('[data-next]').textContent,'N/A');c.setConfig({compact:true,show_help:false,show_support:false});assert.equal(c._config.show_support,false);assert.equal(c._config.show_help,false);c._energySnapshotV5={currency:null,today:{usage_cost:0},current:{available:true,zone_class:null},next_cheap:{status:'not_found_in_horizon'}};c._render();assert.equal(c.shadowRoot.querySelector('[data-cost]').textContent,'N/A');assert.match(c.shadowRoot.querySelector('[data-next]').textContent,/8/);c.setConfig({});assert.equal(c._config.compact,undefined);}finally{w.close();}});
 test(`${name}: chart hours preserve raw rows and boundaries`,()=>{const dom=setup(),w=dom.window;try{const c=w.document.createElement(name);c.setConfig({chart_hours:2});const rows=Array.from({length:5},(_,i)=>({id:`utc-${i}`,from:i*3600000,to:(i+1)*3600000,kwh:i}));const raw=JSON.stringify(rows),display=c._limitChartRowsV5(rows);assert.equal(display.length,2);assert.equal(display[0],rows[3]);assert.equal(JSON.stringify(rows),raw);assert.throws(()=>c.setConfig({chart_hours:0}),/chart_hours/);assert.throws(()=>c.setConfig({chart_hours:1.5}),/chart_hours/);}finally{w.close();}});
 test(`${name}: optional help follows resize and manual close without deleting warnings`,()=>{const dom=setup(),w=dom.window;try{let callback,observed=0;w.ResizeObserver=class {constructor(cb){callback=cb;}observe(){observed++;}disconnect(){}};const c=w.document.createElement(name);c.setConfig({});c.shadowRoot.innerHTML='<p role="alert">Missing measurements</p><div class="tabs"><button data-tab="hidden">Hidden</button></div>';c.getBoundingClientRect=()=>({width:900});c._applyCardOptionsV5();const help=c.shadowRoot.querySelector('[data-energy-options-help]');assert.equal(help.open,true);callback([{contentRect:{width:390}}]);assert.equal(help.open,false);callback([{contentRect:{width:900}}]);assert.equal(help.open,true);help.querySelector('summary').click();assert.equal(help.open,false);callback([{contentRect:{width:1280}}]);assert.equal(help.open,false);c._config.show_help=false;c._applyCardOptionsV5();assert.equal(c.shadowRoot.querySelector('[data-energy-options-help]'),help);assert.equal(help.hidden,true);assert.equal(c.shadowRoot.querySelector('[role="alert"]').textContent,'Missing measurements');assert.equal(c.shadowRoot.querySelector('[data-tab="hidden"]').hidden,true);assert.ok(observed>0);}finally{w.close();}});
}
test('Optimizer chart_hours limits the plotted projection without changing full-day cost or peak KPI',()=>{const dom=setup(),w=dom.window;try{const c=w.document.createElement('ha-energy-optimizer');c._hass={user:{id:'qa',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en'},config:{time_zone:'UTC',currency:'EUR'},states:{}};c.setConfig({chart_hours:2,energy_price:2,currency:'EUR'});const start=Date.parse('2026-10-18T00:00:00Z'),end=start+10*3600000;c._energyModel={ids:['sensor.grid'],zone:'UTC',start,todayStart:start,end,summary:()=>({total:19}),points:new Map(Array.from({length:10},(_,i)=>[start+i*3600000,{kwh:i===0?10:1}]))};const raw=[...c._energyModel.points];assert.equal(c._dashboardRowsV3().length,2);assert.equal(c._todayTariffCosts().rows.length,10);assert.equal(c._todayTariffCosts().energyCost,38);assert.equal(c._getPeakRowV3().from,start);assert.deepEqual([...c._energyModel.points],raw);}finally{w.close();}});
for(const name of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email']) test(`${name}: each visual option emits usable config, preserving unknown keys, field identity and selection`,()=>{const dom=setup(),w=dom.window;try{const editor=w.customElements.get(name).getConfigElement();editor.setConfig({type:`custom:${name}`,unknown:{nested:['kept']}});w.document.body.append(editor);const events=[];editor.addEventListener('config-changed',e=>{events.push(e.detail.config);editor.setConfig(e.detail.config);});for(const option of ['compact','show_help','show_support','chart_hours','default_tab']){const field=editor.shadowRoot.querySelector(`[data-config="${option}"]`);field.focus();if(field.type==='checkbox')field.checked=option==='compact';else field.value=option==='chart_hours'?'48':field.options[1].value;const value=field.type==='checkbox'?field.checked:option==='chart_hours'?48:field.value;field.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(events.at(-1)[option],value);assert.equal(editor.shadowRoot.activeElement,field);assert.equal(editor.shadowRoot.querySelector(`[data-config="${option}"]`),field);assert.equal(events.at(-1).unknown.nested[0],'kept');}const initial=editor.shadowRoot.querySelector('[data-tab-option]');initial.checked=false;initial.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(events.at(-1).tabs.includes(initial.dataset.tabOption),false);assert.equal(events.at(-1).tabs.includes(events.at(-1).default_tab),true);const number=editor.shadowRoot.querySelector('[data-config="chart_hours"]');number.value='';number.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(Object.hasOwn(events.at(-1),'chart_hours'),false);editor.hass={language:'pl',locale:{language:'pl'}};assert.equal(editor.shadowRoot.querySelector('[data-option-label="compact"]').textContent,'Widok kompaktowy');}finally{w.close();}});

// Direct shared-factory coverage: owner regenerates the three consumers after both writers finish.
function helpFixture(name, storage = {}) {
  const dom = new JSDOM('', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const w = dom.window;
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  const observers = [];
  w.ResizeObserver = class {
    constructor(callback) { this.callback = callback; this.observations = 0; this.disconnects = 0; observers.push(this); }
    observe() { this.observations++; }
    disconnect() { this.disconnects++; }
  };
  w.eval(fs.readFileSync('shared/ha-tools-energy-card-options.js', 'utf8') + `
    class HelpCard extends HTMLElement {
      constructor() { super(); this.attachShadow({mode:'open'}); this._config={}; }
      setConfig(config) { this._config={...config}; }
      _render() {}
    }
    class HelpEditor extends HTMLElement { _render() {} }
    createEnergyCardOptionsV5({Card:HelpCard,Editor:HelpEditor,name:${JSON.stringify(name)},title:'Energy',tabs:['overview'],labels:[['Overview'],['Przegląd']]});
    customElements.define('help-fixture-card',HelpCard);
  `);
  const create = (width = 900, { user = 'qa', instance = 'default' } = {}) => {
    const card = w.document.createElement('help-fixture-card');
    card.setConfig({instance_id:instance});
    card._hass = {user:{id:user}, language:'en'};
    card.getBoundingClientRect = () => ({width});
    card.shadowRoot.innerHTML = '<div class="card"><header class="header">Heading</header><label class="energy-tab-picker"><select><option value="overview">Overview</option></select></label><nav class="tabs"><button data-tab="overview">Overview</button></nav><input id="unsaved" value="draft"><p role="alert">Missing measurements</p></div>';
    w.document.body.append(card);
    card._applyCardOptionsV5();
    return card;
  };
  return {dom,w,observers,create, saved:()=>Object.fromEntries(Array.from({length:w.localStorage.length},(_,index)=>{const key=w.localStorage.key(index);return [key,w.localStorage.getItem(key)];}))};
}
for (const name of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email']) {
  test(`${name}: W15 explicit close survives new element/reload; programmatic toggle never saves a gesture`, () => {
    const f = helpFixture(name);
    let saved;
    try {
      const card=f.create(),help=card.shadowRoot.querySelector('[data-energy-options-help]');
      assert.equal(help.open,true);
      help.open=false;help.dispatchEvent(new f.w.Event('toggle'));
      assert.deepEqual(f.saved(),{},'programmatic changes must not become a saved close');
      card._applyCardOptionsV5();assert.equal(help.open,true,'automatic wide default remains available');
      help.querySelector('summary').click();assert.equal(help.open,false);
      saved=f.saved();assert.ok(Object.values(saved).includes('closed'));
      const next=f.create(),nextHelp=next.shadowRoot.querySelector('[data-energy-options-help]');assert.equal(nextHelp.open,false);
      nextHelp.open=true;nextHelp.dispatchEvent(new f.w.Event('toggle'));assert.deepEqual(f.saved(),saved,'queued programmatic toggle cannot override the recorded close');
      next._applyCardOptionsV5();assert.equal(nextHelp.open,false);
      const otherUser=f.create(900,{user:'different'});assert.equal(otherUser.shadowRoot.querySelector('[data-energy-options-help]').open,true);
      const otherInstance=f.create(900,{instance:'different'});assert.equal(otherInstance.shadowRoot.querySelector('[data-energy-options-help]').open,true);
    } finally { f.w.close(); }
    const reload=helpFixture(name,saved);
    try {assert.equal(reload.create().shadowRoot.querySelector('[data-energy-options-help]').open,false);} finally {reload.w.close();}
  });
  test(`${name}: W15 help sits after header before picker/tabs, keeps drafts/focus and cleans resize observer`, () => {
    const f=helpFixture(name);
    try {
      const card=f.create(390),root=card.shadowRoot,help=root.querySelector('[data-energy-options-help]'),header=root.querySelector('.header'),picker=root.querySelector('.energy-tab-picker');
      assert.equal(help.previousElementSibling,header);assert.equal(help.nextElementSibling,picker);assert.equal(help.open,false);
      assert.deepEqual(f.saved(),{},'narrow automatic collapse is not saved');
      const draft=root.querySelector('#unsaved');draft.focus();draft.setSelectionRange(1,4,'backward');
      const observer=f.observers.at(-1);card.getBoundingClientRect=()=>({width:1280});observer.callback([{contentRect:{width:1280}}]);assert.equal(help.open,true);
      card._hass.language='pl';card._applyCardOptionsV5();
      assert.equal(root.querySelector('[data-energy-options-help]'),help);assert.equal(root.activeElement,draft);assert.equal(draft.value,'draft');assert.equal(draft.selectionDirection,'backward');assert.equal(help.querySelector('summary').textContent,'Pomoc');
      assert.equal(f.observers.length,1,'ordinary updates reuse the observer');
      help.querySelector('summary').click();observer.callback([{contentRect:{width:1280}}]);assert.equal(help.open,false);
      card.remove();assert.ok(observer.disconnects>0);
      f.w.document.body.append(card);card._applyCardOptionsV5();assert.equal(help.open,false);
      assert.equal(root.querySelector('[role="alert"]').textContent,'Missing measurements');
    } finally { f.w.close(); }
  });
}
