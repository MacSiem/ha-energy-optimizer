"use strict";
// Owner runs RED before source patch, then syncs normal embedded consumers for GREEN.
// Same actual-custom-element harness and backend fixtures as energy-analysis-cards-v53.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
const {energyBackend,drainBackend}=require('./helpers/energy-backend-fixture.cjs');
const {patterns}=require('./helpers/energy-patterns-fixture.cjs');
const producer=JSON.parse(fs.readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
const clone=x=>JSON.parse(JSON.stringify(x));
async function settle(){for(let i=0;i<4;i++)await drainBackend();}
function setup({language='en',config={},states={},snapshot=producer,analysisError=null}={}){
 const errors=[],requests=[],unexpected=[],network=[],services=[],subscriptions=[];
 const console=new VirtualConsole();console.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 console.on('error',(...a)=>errors.push(a.join(' ')));
 const dom=new JSDOM('<body></body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:console}),w=dom.window,NativeDate=w.Date;
 w.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:['2026-10-18T12:34:00Z']));}static now(){return NativeDate.parse('2026-10-18T12:34:00Z');}};
 w.ResizeObserver=class{observe(){}disconnect(){}unobserve(){}};
 w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:390,height:44}]:[];};
 w.HTMLCanvasElement.prototype.getContext=()=>({});w.fetch=(...a)=>{network.push(a);throw Error('network forbidden');};
 w.eval(['src/optimizer.js','src/energy-insights.js','src/energy-email.js'].map(p=>fs.readFileSync(p,'utf8')).join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 const card=w.document.createElement('ha-energy-optimizer');card.getBoundingClientRect=()=>({width:390});
 const connection=new w.EventTarget();connection.connected=true;connection.subscribeMessage=async(fn,q)=>{
  assert.equal(q.type,'ha_tools_email/subscribe_analysis_updates');const row={fn,active:true};subscriptions.push(row);return ()=>{row.active=false;};
 };
 const backend=energyBackend(card,async q=>{
  // Explicit old-backend capability envelope: absence of energy_model_schema
  // keeps this fixture on its existing schema-2 analysis protocol.
  if(q.type==='ha_tools_email/feature_capabilities')return {status:'ready',revision:1,capabilities:{energy_analysis:{visible:true,read:true,execute:false}}};
  if(q.type==='ha_tools_email/energy_analysis'){if(analysisError)throw analysisError;return clone(snapshot);}
  if(q.type==='ha_tools_email/energy_patterns')return patterns(q.days);
  if(q.type==='ha_tools_email/get_tariff')return {profile:clone(producer.rates[0].profile),revision:4,updated_at:null};
  unexpected.push(q);throw {code:'unexpected_command'};
 },{profile:producer.rates[0].profile,revision:4});
 let hass={user:{id:'reader',is_active:true,is_admin:false,groups:[],group_ids:[]},connected:true,connection,
  language,locale:{language,time_zone:'server',time_format:'24'},config:{time_zone:snapshot.period.timezone,currency:'EUR'},states,services:{},
  callWS:q=>{requests.push(clone(q));return backend(q);},callService:(...a)=>{services.push(a);throw Error('write forbidden');}};
 card.setConfig({title:'Energy',show_support:false,instance_id:'firstscreen90',...config});
 const api={w,card,requests,subscriptions,get hass(){return hass;},
  async mount(){w.document.body.append(card);card.hass=hass;await settle();},
  update(h){hass=h;card.hass=h;},
  control(action,value){const n=card.shadowRoot.querySelector(`[data-analysis-action="${action}"]${value===undefined?'':`[data-analysis-value="${value}"]`}`);assert.ok(n,action);return n;},
  tab(id){const n=card.shadowRoot.querySelector(`.tabs [data-tab="${id}"]`);assert.ok(n,id);n.click();},
  quiet(){assert.deepEqual(unexpected,[]);assert.deepEqual(network,[]);assert.deepEqual(services,[]);assert.deepEqual(errors,[]);assert.equal(requests.filter(q=>q.type==='energy/get_prefs'||q.type.startsWith('recorder/')).length,0);},
  close(){card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
 return api;
}
for(const language of ['en','pl'])test('firstscreen hierarchy uses real producer facts, exact details and ordinary accessible controls '+language,async()=>{
 const snapshot=clone(producer);snapshot.groups.areas.office.kwh=snapshot.groups.areas.office.recorded_kwh='49.999999999999545';
 const raw=JSON.stringify(snapshot),f=setup({language,snapshot});try{await f.mount();const root=f.card.shadowRoot;
  assert.equal(root.querySelectorAll('.analysis-tile-primary').length,2);assert.equal(root.querySelectorAll('.analysis-tile-secondary').length,2);
  assert.equal(root.querySelector('.analysis-tile-primary strong').textContent,language==='pl'?'250,0 kWh':'250.0 kWh');
  assert.equal(root.querySelectorAll('.analysis-tile-primary strong')[1].textContent,language==='pl'?'247,00 EUR':'247.00 EUR');
  assert.ok(root.querySelector('.analysis-tile-secondary[data-analysis-cheap-share]'));assert.ok(root.querySelector('.analysis-tile-secondary[data-analysis-peak]'));
  const heading=root.querySelector('.optimizer-heading');assert.ok(heading);assert.ok(heading.querySelector('.card-title'));assert.ok(heading.querySelector('[data-energy-options-help]'));
  assert.equal(root.querySelector('[data-energy-options-help]').open,false);assert.ok(root.querySelector('.optimizer-tools [data-power-setup]'));
  const nav=root.querySelector('.optimizer-navigation');assert.ok(nav);assert.equal(nav.querySelectorAll('[data-tab]').length,4);
  assert.equal(nav.querySelectorAll('[tabindex="0"]').length,1);assert.equal(nav.querySelector('[aria-selected="true"]').dataset.tab,'dashboard');
  const reads=f.requests.length;f.control('view','data').click();assert.equal(root.querySelectorAll('[data-analysis-bin]').length,24);
  assert.ok(root.textContent.includes(language==='pl'?'49,999999999999545':'49.999999999999545'));
  f.control('view','chart').click();assert.ok(root.querySelector('[data-analysis-chart]'));assert.equal(f.requests.length,reads,'view changes stay local');
  assert.equal(JSON.stringify(snapshot),raw);assert.equal(f.card._analysisHostV53.state().snapshot.snapshot_id,producer.snapshot_id);f.quiet();
 }finally{f.close();}
});
test('help manual state remains user/instance bound in compact heading; other cards keep their old anchors',async()=>{
 const f=setup();try{await f.mount();const root=f.card.shadowRoot;let help=root.querySelector('[data-energy-options-help]');
  const reads=f.requests.length;help.querySelector('summary').click();assert.equal(help.open,true);f.card._render();help=root.querySelector('[data-energy-options-help]');assert.equal(help.open,true);
  help.querySelector('summary').click();assert.equal(help.open,false);f.card._render();assert.equal(root.querySelector('[data-energy-options-help]').open,false);assert.equal(f.requests.length,reads);
  f.update({...f.hass,user:{...f.hass.user,id:'other'}});await settle();assert.equal(root.querySelector('[data-energy-options-help]').open,false);
  f.card.getBoundingClientRect=()=>({width:900});f.card._helpResizeV5(900);assert.equal(root.querySelector('[data-energy-options-help]').open,true,'new user has wide automatic default, not previous manual close');
  for(const type of ['ha-energy-insights','ha-energy-email']){const card=f.w.document.createElement(type);card.setConfig({show_support:false});card._hass=f.hass;card._render();const other=card.shadowRoot.querySelector('[data-energy-options-help]');assert.ok(other);assert.equal(other.closest('.optimizer-heading'),null);card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();}
  f.quiet();
 }finally{f.close();}
});
for(const [state,unit,expect] of [['0','W','0.00'],['1000','W','1.00'],['2','kW','2.00'],['unavailable','W',null],['10','kWh',null]])test('compact tools retain configured power semantics '+state+' '+unit,async()=>{
 const f=setup({config:{power_entity:'sensor.power'},states:{'sensor.power':{state,attributes:{unit_of_measurement:unit}}}});try{await f.mount();const root=f.card.shadowRoot,tools=root.querySelector('.optimizer-tools');assert.ok(tools);
  if(expect!==null){assert.equal(tools.querySelector('.power-draw-value').textContent,expect);assert.equal(tools.querySelector('[data-power-status]'),null);}
  else {assert.ok(tools.querySelector('[data-power-status]'));assert.ok(tools.querySelector('[data-power-setup]'));assert.equal(tools.querySelector('.power-draw'),null);}
  f.quiet();
 }finally{f.close();}
});
test('optional power guide preserves W/kW-only snippet workflow and focus without saving YAML',async()=>{
 const f=setup({states:{'sensor.power':{state:'0',attributes:{unit_of_measurement:'W',friendly_name:'Meter'}},'sensor.energy':{state:'1',attributes:{unit_of_measurement:'kWh'}}}});try{await f.mount();const root=f.card.shadowRoot,guide=root.querySelector('[data-power-setup]');
  assert.equal(guide.open,false);assert.equal(root.querySelector('[data-power-status]'),null);guide.open=true;
  const select=guide.querySelector('select');assert.deepEqual([...select.options].map(n=>n.value),['','sensor.power']);select.value='sensor.power';select.dispatchEvent(new f.w.Event('change',{bubbles:true}));select.focus();
  assert.match(guide.querySelector('code').textContent,/power_entity: sensor.power/);assert.equal(f.card._config.power_entity,undefined);const reads=f.requests.length;
  f.card._render();assert.equal(root.querySelector('[data-power-setup]').open,true);assert.equal(root.activeElement.id,'power-sensor-guide');assert.equal(f.requests.length,reads);f.quiet();
 }finally{f.close();}
});
test('four tabs keep keyboard navigation, Chart/Data and calendar state through local redraw',async()=>{
 const f=setup({snapshot:JSON.parse(fs.readFileSync('tests/fixtures/analysis-partial-v53.json','utf8'))});try{await f.mount();const root=f.card.shadowRoot,nav=root.querySelector('.optimizer-navigation');assert.ok(nav);
  const first=nav.querySelector('[data-tab="dashboard"]');first.focus();first.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'End',bubbles:true}));await settle();assert.equal(f.card._currentTab,'compare');assert.equal(root.activeElement.dataset.tab,'compare');
  root.activeElement.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));await settle();assert.equal(f.card._currentTab,'dashboard');
  const calendar=root.querySelector('[data-analysis-calendar-options]');calendar.open=true;const reads=f.requests.length;f.control('view','data').click();assert.equal(root.querySelector('[data-analysis-calendar-options]').open,true);f.control('view','chart').click();assert.equal(f.requests.length,reads);
  f.tab('recommendations');await settle();assert.ok(root.querySelector('[data-analysis-rates]'));f.tab('patterns');await settle();assert.ok(root.querySelector('[data-pattern-root]'));f.tab('dashboard');await settle();assert.ok(root.querySelector('[data-analysis-chart]'));f.quiet();
 }finally{f.close();}
});

test('ordinary peak follows 12/24/System without redundant offset; exact calendar/offset/ties remain in details',async()=>{
 const f=setup();try{await f.mount();const root=f.card.shadowRoot,peak=producer.period_summary.peak_hour,reads=f.requests.length;
  for(const choice of ['12','24','system']){
   f.update({...f.hass,locale:{...f.hass.locale,time_format:choice}});await settle();
   const region=choice==='system'?f.w.Intl.DateTimeFormat().resolvedOptions().locale:'en';
   const cycle=choice==='12'?'h12':choice==='24'?'h23':f.w.Intl.DateTimeFormat(region,{hour:'numeric'}).resolvedOptions().hourCycle;
   assert.equal(root.querySelector('[data-analysis-peak] strong').textContent,f.w.Intl.DateTimeFormat(region,{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hourCycle:cycle}).format(Date.parse(peak.start)));
   const detail=root.querySelector('[data-analysis-period-summary-details]');assert.ok(detail.textContent.includes('Europe/Warsaw'));assert.match(detail.textContent,/Hours tied at this value/);assert.match(detail.textContent,/GMT\+2|UTC\+02:00/);assert.ok(root.querySelector('[data-analysis-source-details]').textContent.includes(producer.period.start));
  }
  assert.equal(f.requests.length,reads);f.quiet();
 }finally{f.close();}
});
test('denied analysis retains an explicit access error and cannot fall back to private Recorder rows',async()=>{
 const f=setup({analysisError:{code:'unauthorized'}});try{await f.mount();const root=f.card.shadowRoot;
  assert.equal(root.querySelector('.analysis-tiles'),null);assert.match(root.textContent,/Access or backend response could not be confirmed/);assert.equal(f.requests.filter(q=>q.type==='ha_tools_email/energy_analysis').length,1);f.quiet();
 }finally{f.close();}
});
