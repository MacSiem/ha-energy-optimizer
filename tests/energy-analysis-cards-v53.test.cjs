// Owner executes against pinned sources; patch worker did not execute product/tests.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const {energyBackend,drainBackend}=require('./helpers/energy-backend-fixture.cjs');
const {patterns}=require('./helpers/energy-patterns-fixture.cjs');
const base=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(base,file),'utf8');
const producer=JSON.parse(read('tests/fixtures/analysis-partial-v53.json'));
const clone=value=>JSON.parse(JSON.stringify(value));
const ANALYSIS='ha_tools_email/energy_analysis';
const EVENTS=['ha_tools_email_energy_analysis_updated','ha_tools_email_feature_access_updated'];
const cases=[
  {type:'ha-energy-optimizer',home:'dashboard',other:'patterns',key:'_currentTab'},
  {type:'ha-energy-insights',home:'overview',other:'daily',key:'_activeTab'},
  {type:'ha-energy-email',home:'overview',other:'preview',key:'_activeTab'},
];
const settle=async()=>{for(let i=0;i<4;i++)await drainBackend();};
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});promise.catch(()=>{});return {promise,resolve,reject};}
const history=request=>request.type==='energy/get_prefs'||request.type.startsWith('recorder/');

function setup(spec,{response=()=>clone(producer),legacy=false,subscribeError=null}={}) {
  const errors=[],unexpected=[],ws=[],subscriptions=[],serviceCalls=[],network=[];
  const console=new VirtualConsole();
  console.on('error',(...args)=>errors.push(args.map(value=>String(value?.message||value)).join(' ')));
  console.on('jsdomError',error=>{
    // jsdom's CSS parser cannot represent container queries; DOM assertions still run.
    if(error.type==='css parsing'||error.message==='Could not parse CSS stylesheet')return;
    errors.push(error.message);
  });
  const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',pretendToBeVisual:true,
    url:'http://localhost/',virtualConsole:console});
  const w=dom.window,NativeDate=w.Date;
  let now=Date.parse('2026-10-18T12:34:00Z');
  w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
  // Same browser-only substitutes as the existing DOM/chart/options harnesses.
  w.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
  w.HTMLElement.prototype.getClientRects=function(){return this.isConnected?[{width:900,height:44}]:[];};
  w.HTMLCanvasElement.prototype.getContext=()=>({});
  w.fetch=(...args)=>{network.push(args);return Promise.reject(Error('External fetch forbidden in DOM regression'));};
  // One bundle evaluation retains optimizer lexical constants required by the two IIFEs.
  // No factories/prototype methods/hass setters are replaced or extracted.
  w.eval(['src/optimizer.js','src/energy-insights.js','src/energy-email.js'].map(read).join('\n')+
    '\nconst HA_ENERGY_CHART=class{constructor(){}destroy(){}update(){}};');
  const card=w.document.createElement(spec.type);
  let currentResponse=response,raw=0,maxRaw=0,unsubscribed=0;
  function connection(){
    const conn=new w.EventTarget();conn.connected=true;
    conn.subscribeMessage=async(callback,message)=>{
      assert.equal(message.type,'ha_tools_email/subscribe_analysis_updates');
      if(subscribeError)throw subscribeError;
      const entry={connection:conn,callback,message,active:true};subscriptions.push(entry);
      return ()=>{assert.equal(entry.active,true,'unsubscribe exactly once');entry.active=false;unsubscribed++;};
    };
    return conn;
  }
  // Modern mode rejects every Recorder command rather than giving all commands a success DTO.
  const backend=energyBackend(card,async request=>{
    if(request.type==='ha_tools_email/energy_patterns')return patterns(request.days);
    if(request.type===ANALYSIS){
      raw++;maxRaw=Math.max(raw,maxRaw);
      try{return await currentResponse(request);}finally{raw--;}
    }
    if(spec.type==='ha-energy-email'&&request.type==='ha_tools_email/feature_capabilities')return {status:'ready',revision:1,capabilities:{energy_reports:{visible:true,read:false,execute:false}}};
    if(request.type==='ha_tools_email/get_tariff')return {profile:clone(producer.rates[0].profile),revision:4,updated_at:null};
    if(legacy&&request.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.fixture_grid'}],device_consumption:[]};
    if(legacy&&request.type==='recorder/get_statistics_metadata')return {'sensor.fixture_grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh',name:'Measured fixture grid'}};
    if(legacy&&request.type==='recorder/statistics_during_period'){
      const start=Date.parse(request.start_time),end=Date.parse(request.end_time);
      assert.equal(request.period,'hour');assert.deepEqual(Array.from(request.statistic_ids),['sensor.fixture_grid']);
      return {'sensor.fixture_grid':Array.from({length:(end-start)/3600000},(_,i)=>({start:start+i*3600000,change:2}))};
    }
    unexpected.push(clone(request));throw {code:'unexpected_test_command',message:request.type};
  },{profile:producer.rates[0].profile,revision:4});
  const callWS=request=>{ws.push(clone(request));return backend(request);};
  let hass={user:{id:'reader',is_admin:false,is_owner:false,is_active:true,groups:[],group_ids:[]},connection:connection(),
    language:'en',locale:{language:'en',time_zone:'server',time_format:'24'},
    config:{time_zone:'UTC',currency:'EUR'},states:{},services:{},
    callWS,callService:(...args)=>{serviceCalls.push(args);return Promise.reject(Error('No service writes allowed'));}};
  card.setConfig({title:'Actual '+spec.type,default_tab:spec.home,show_help:false,show_support:false});
  const active=conn=>subscriptions.filter(entry=>entry.active&&(!conn||entry.connection===conn));
  const api={w,card,spec,ws,subscriptions,unexpected,errors,network,serviceCalls,connection,
    advance(ms){now+=ms;},get hass(){return hass;},get maxRaw(){return maxRaw;},get raw(){return raw;},get unsubscribed(){return unsubscribed;},
    get analyses(){return ws.filter(request=>request.type===ANALYSIS);},
    setResponse(next){currentResponse=next;},
    update(next=hass){hass=next;card.hass=hass;},
    async mount(){w.document.body.append(card);api.update();await settle();},
    active,emit(event,conn=hass.connection){for(const entry of active(conn))entry.callback({});},
    tab(id){const button=card.shadowRoot.querySelector(`.tabs [data-tab="${id}"]`);assert.ok(button,'actual tab '+id);button.click();},
    assertSubscriptions(count=1){assert.equal(active().length,count);if(count===1)assert.deepEqual(active().map(row=>row.message.type),['ha_tools_email/subscribe_analysis_updates']);},
    assertQuiet(){assert.deepEqual(unexpected,[],'all WS commands have an explicit protocol fixture');assert.deepEqual(serviceCalls,[]);assert.deepEqual(network,[]);assert.deepEqual(errors,[]);},
    assertNoHistory(){assert.deepEqual(ws.filter(history),[],'schema2 must never consult legacy Recorder');},
    close(){card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();},
  };
  return api;
}
function analysisRoot(f){const root=f.card.shadowRoot.querySelector('.energy-analysis-v53');assert.ok(root,'real schema2 view mounted inside card shadow root');return root;}
function control(f,action,value){const element=f.card.shadowRoot.querySelector(`[data-analysis-action="${action}"]${value===undefined?'':`[data-analysis-value="${value}"]`}`);assert.ok(element,action);return element;}
function change(f,action,value){const element=control(f,action);element.value=value;element.dispatchEvent(new f.w.Event('change',{bubbles:true}));}
function ready(f){
  const root=analysisRoot(f),tiles=[...root.querySelectorAll('.analysis-tile strong')].map(el=>el.textContent);
  assert.match(tiles[0],/240/);assert.match(tiles[1],/241/);assert.match(tiles[1],/EUR|€/);
  assert.equal(root.querySelectorAll('[data-analysis-action="point"]').length,24);
  assert.match(root.querySelector('[data-analysis-groups]').textContent,/Unmeasured/);
  assert.equal(f.card._analysisHostV53.state().snapshot.snapshot_id,producer.snapshot_id);
  assert.equal(control(f,'anchor').value,producer.context.period_anchor);
  if(control(f,'level').value==='areas'){
    const zero=[...root.querySelectorAll('[data-analysis-groups] tbody tr')].find(row=>row.querySelector('th')?.textContent==='No room');
    assert.ok(zero,'producer unassigned zero remains separate from unmeasured');
    assert.match(zero.children[1].textContent,/^0 kWh$/);assert.match(zero.children[2].textContent,/^0(?:[.,]0+)? EUR$/);
    assert.doesNotMatch(zero.textContent,/Unavailable/);
  }
}
function empty(f){
  assert.equal(f.card.shadowRoot.querySelector('.analysis-tiles'),null);
  assert.equal(f.card.shadowRoot.querySelector('[data-analysis-groups]'),null);
  assert.equal(f.card._analysisHostV53.state().snapshot,null);
  assert.equal(f.card._analysisHostV53.legacyAllowed(),false);
}
function selection(f){
  assert.equal(control(f,'level').value,'devices');
  assert.equal(control(f,'view','data').getAttribute('aria-pressed'),'true');
  assert.equal(control(f,'point','0').getAttribute('aria-pressed'),'true');
}

for(const spec of cases){
  test(`${spec.type}: actual registration, hass setter and lifecycle are lazy until mount`,async()=>{
    const f=setup(spec);try{
      const C=f.w.customElements.get(spec.type);assert.ok(f.card instanceof C);
      assert.equal(typeof C.prototype.connectedCallback,'function');assert.equal(typeof C.prototype.disconnectedCallback,'function');
      assert.equal(typeof Object.getOwnPropertyDescriptor(C.prototype,'hass').set,'function');
      f.update();await settle();assert.equal(f.analyses.length,0);f.assertSubscriptions(0);f.assertNoHistory();
      f.w.document.body.append(f.card);await settle();ready(f);assert.equal(f.analyses.length,1);f.assertSubscriptions();
      f.card.remove();await settle();f.assertSubscriptions(0);assert.equal(f.unsubscribed,1);
      const requests=f.ws.length;f.emit(EVENTS[0]);f.update();await settle();assert.equal(f.ws.length,requests);
      f.assertQuiet();
    }finally{f.close();}
  });
  test(`${spec.type}: full schema2 content, known zero and selections survive tab, refresh and new hass`,async()=>{
    const f=setup(spec);try{
      await f.mount();ready(f);f.assertSubscriptions();assert.equal(f.analyses.length,1);
      control(f,'view','data').click();control(f,'point','0').click();change(f,'level','devices');selection(f);
      const rows=f.card.shadowRoot.querySelectorAll('tr[data-analysis-bin]');assert.equal(rows.length,24);assert.match(rows[0].textContent,/10/);
      f.tab(spec.other);await settle();assert.equal(f.card[spec.key],spec.other);
      if(spec.type==='ha-energy-email'){
        // Preview owns one sanitized control subscription but report reads stay denied.
        // Administrative config is intentionally absent for this household identity.
        assert.equal(f.card.shadowRoot.querySelector('[data-tab="config"]'),null);
        f.assertSubscriptions(1);empty(f);const reads=f.analyses.length;f.emit(EVENTS[0]);await settle();assert.equal(f.analyses.length,reads);
        assert.equal(f.ws.filter(q=>q.type==='ha_tools_email/energy_report').length,0);
      }else if(spec.type==='ha-energy-optimizer'){
        // Patterns has its own producer DTO; calendar selections must survive returning home.
        const patternsRoot=f.card.shadowRoot.querySelector('#patterns [data-pattern-root]');assert.ok(patternsRoot);
        assert.equal(patternsRoot.querySelector('[data-pattern-control="period"]').value,'7');
        assert.equal(patternsRoot.querySelector('[data-pattern-control="resolution"]').value,'day');
        assert.equal(patternsRoot.querySelector('[data-pattern-control="point"]').value,'2026-05-05');
        assert.equal(f.ws.filter(q=>q.type==='ha_tools_email/energy_patterns').length,1);
        assert.equal(f.analyses.length,1);f.assertSubscriptions();
      }else{ready(f);selection(f);assert.equal(f.analyses.length,1);f.assertSubscriptions();}
      f.tab(spec.home);await settle();ready(f);selection(f);f.assertSubscriptions();
      // The measured zero is a real producer cost, checked in the rendered cost table.
      if(spec.type==='ha-energy-optimizer'){
        f.tab('recommendations');await settle();
        const table=f.card.shadowRoot.querySelector('[data-analysis-cost-components]');assert.ok(table);
        const row=[...table.querySelectorAll('tbody tr')].find(el=>el.textContent.includes('Variable distribution'));
        assert.ok(row);assert.match(row.querySelector('td').textContent,/^0(?:[.,]0+)? EUR$/);assert.doesNotMatch(row.textContent,/Unavailable/);
        f.tab(spec.home);await settle();selection(f);
      }
      const before=f.analyses.length;control(f,'retry').click();await settle();assert.equal(f.analyses.length,before+1);ready(f);selection(f);
      f.emit(EVENTS[0]);await settle();assert.equal(f.analyses.length,before+2);ready(f);selection(f);f.assertSubscriptions();
      f.update({...f.hass,states:{...f.hass.states},locale:{...f.hass.locale,language:'pl'}});await settle();
      assert.equal(f.analyses.length,before+2);assert.match(analysisRoot(f).textContent,/Zużycie/);selection(f);
      assert.equal(f.card[spec.key],spec.home);f.assertNoHistory();f.assertQuiet();
    }finally{f.close();}
  });
  for(const error of [{code:'unauthorized'},{code:'not_allowed'},{code:'invalid_format'},new Error('unknown_command')]){
    test(`${spec.type}: ${error.code||error.message} cannot activate Recorder compatibility`,async()=>{
      const f=setup(spec,{response:()=>Promise.reject(error)});try{
        await f.mount();empty(f);assert.equal(f.analyses.length,1);assert.ok(f.card.shadowRoot.querySelector('[role="status"]'));
        assert.match(f.card.shadowRoot.textContent,/Access or backend response could not be confirmed/);
        f.update({...f.hass});await settle();empty(f);f.assertNoHistory();f.assertSubscriptions();f.assertQuiet();
      }finally{f.close();}
    });
  }
  test(`${spec.type}: calendar and comparison controls send real selections, incompatible DTO fails closed`,async()=>{
    const f=setup(spec);try{
      await f.mount();ready(f);
      change(f,'anchor',producer.context.period_anchor);await settle();ready(f);
      assert.equal(f.analyses.at(-1).anchor,producer.context.period_anchor);
      change(f,'comparison','mean7');await settle();
      assert.equal(f.analyses.at(-1).comparison,'mean7');
      assert.equal(f.card._analysisHostV53.state().error,'invalid_analysis_response');
      empty(f);f.assertNoHistory();f.assertSubscriptions();f.assertQuiet();
    }finally{f.close();}
  });
  test(`${spec.type}: feature access event immediately removes previous private rows`,async()=>{
    const denied=deferred();const f=setup(spec);try{
      await f.mount();ready(f);f.setResponse(()=>denied.promise);f.emit(EVENTS[1]);
      assert.equal(f.card.shadowRoot.querySelector('.analysis-tiles'),null,'erase synchronously before reauthorization');
      await settle();assert.equal(f.analyses.length,2);assert.equal(f.raw,1);empty(f);
      denied.reject({code:'unauthorized'});await settle();empty(f);assert.equal(f.maxRaw,1);f.assertSubscriptions();
      assert.doesNotMatch(f.card.shadowRoot.textContent,/241[.,]00|240[.,]00/);f.assertNoHistory();f.assertQuiet();
    }finally{denied.reject({code:'unauthorized'});f.close();}
  });
  for(const boundary of ['same-object user','connection','unmount/remount']){
    test(`${spec.type}: delayed old response across ${boundary} stays one wire and never leaks`,async()=>{
      const old=deferred(),fresh=deferred();let reads=0;
      const f=setup(spec,{response:()=>++reads===1?old.promise:fresh.promise});try{
        await f.mount();assert.equal(f.analyses.length,1);assert.equal(f.raw,1);f.assertSubscriptions();
        const previousConnection=f.hass.connection;
        if(boundary==='same-object user'){f.hass.user.id='replacement';f.update();}
        if(boundary==='connection')f.update({...f.hass,connection:f.connection()});
        if(boundary==='unmount/remount'){
          f.card.remove();await settle();f.assertSubscriptions(0);empty(f);const count=f.analyses.length;
          f.emit(EVENTS[0],previousConnection);f.update();await settle();assert.equal(f.analyses.length,count);
          f.w.document.body.append(f.card);
        }
        await settle();assert.equal(f.analyses.length,1,'raw old transport must settle before queued new dispatch');empty(f);
        if(boundary==='connection')assert.equal(f.active(previousConnection).length,0);
        old.resolve(clone(producer));await settle();
        assert.equal(f.analyses.length,2);assert.equal(f.maxRaw,1);empty(f);f.assertSubscriptions();
        fresh.reject({code:'unauthorized'});await settle();empty(f);assert.equal(f.raw,0);
        f.card.remove();await settle();f.assertSubscriptions(0);
        assert.equal(f.unsubscribed,f.subscriptions.length,'every accepted subscription released');f.assertNoHistory();f.assertQuiet();
      }finally{old.resolve(clone(producer));fresh.reject({code:'unauthorized'});f.close();}
    });
  }
  test(`${spec.type}: only structured unknown_command enters real legacy measurements; revocation purges them`,async()=>{
    const f=setup(spec,{legacy:true,response:()=>Promise.reject({code:'unknown_command'})});try{
      await f.mount();assert.equal(f.analyses.length,1);assert.equal(f.card._analysisHostV53.legacyAllowed(),true);
      assert.ok(f.card.shadowRoot.querySelector('[data-analysis-upgrade-v53]'),'visible compatibility explanation');
      assert.ok(f.ws.some(r=>r.type==='recorder/statistics_during_period'),'actual consumer reads Recorder fixture');
      if(spec.type==='ha-energy-optimizer'){
        assert.equal(f.card._hasRealData,true);assert.ok(f.card._energyModel.points.size>0);
        assert.match(f.card.shadowRoot.querySelector('.summary-value').textContent,/24/);
      }else if(spec.type==='ha-energy-insights'){
        assert.equal(f.card._data.todayKwh,24);assert.match(f.card.shadowRoot.querySelector('.panel-body').textContent,/24/);
      }else{
        assert.equal(f.card._periodCache_day[0].month,48);assert.match(f.card.shadowRoot.getElementById('tab-content').textContent,/48/);
      }
      const measured=f.ws.filter(history).length;
      f.setResponse(()=>Promise.reject({code:'unauthorized'}));f.emit(EVENTS[1]);await settle();empty(f);
      assert.equal(f.ws.filter(history).length,measured,'revoked legacy cannot continue Recorder');
      assert.equal(f.card.shadowRoot.querySelector('[data-analysis-upgrade-v53]'),null);
      if(spec.type==='ha-energy-optimizer')assert.equal(f.card._energyModel,null);
      else if(spec.type==='ha-energy-insights')assert.equal(f.card._data,null);
      else assert.equal(f.card._periodCache_day,null);
      f.assertSubscriptions();f.assertQuiet();
    }finally{f.close();}
  });
}

test('Insights weekly/monthly tabs request their period and never accept a day fixture as a different period',async()=>{
  const f=setup(cases[1]);try{
    await f.mount();ready(f);
    for(const [tab,period] of [['weekly','week'],['monthly','month']]){
      f.tab(tab);await settle();assert.equal(f.card._activeTab,tab);assert.equal(f.analyses.at(-1).period,period);
      assert.equal(f.card._analysisHostV53.state().error,'invalid_analysis_response');empty(f);f.assertSubscriptions();
    }
    f.tab('daily');await settle();ready(f);assert.equal(f.analyses.at(-1).period,'day');
    f.assertNoHistory();f.assertQuiet();
  }finally{f.close();}
});

test('bundle discovery registers all three cards, editors and Email alias without analysis I/O',async()=>{
  const f=setup(cases[0]);try{
    for(const spec of cases){
      const C=f.w.customElements.get(spec.type),Editor=f.w.customElements.get(spec.type+'-editor');assert.ok(C);assert.ok(Editor);
      const listing=f.w.customCards.filter(row=>row.type===spec.type);assert.equal(listing.length,1);assert.ok(listing[0].name);
      const card=f.w.document.createElement(spec.type);assert.ok(card instanceof C);assert.ok(C.getConfigElement() instanceof Editor);
    }
    const alias=f.w.document.createElement('ha-energy-optimizer-email');assert.ok(alias instanceof f.w.customElements.get('ha-energy-email'));
    await settle();assert.deepEqual(f.ws,[]);f.assertSubscriptions(0);f.assertQuiet();
  }finally{f.close();}
});

for(const spec of cases){
 test(`${spec.type}: old subscription and old analysis support legacy through one wire`,async()=>{
  const f=setup(spec,{legacy:true,subscribeError:{code:'unknown_command'},response:()=>Promise.reject({code:'unknown_command'})});try{
   await f.mount();assert.equal(f.analyses.length,1);assert.equal(f.maxRaw,1);
   assert.equal(f.card._analysisHostV53.legacyAllowed(),true);
   assert.ok(f.ws.some(history));f.assertSubscriptions(0);f.assertQuiet();
  }finally{f.close();}
 });
 test(`${spec.type}: modern ready response without subscription ACK stays invisible`,async()=>{
  const pending=deferred();const f=setup(spec,{subscribeError:{code:'unknown_command'},response:()=>pending.promise});try{
   await f.mount();assert.equal(f.analyses.length,1);empty(f);
   const seen=[];const observer=new f.w.MutationObserver(()=>seen.push({tile:!!f.card.shadowRoot.querySelector(".analysis-tile"),snapshot:f.card.shadowRoot.textContent.includes(producer.snapshot_id)}));
   observer.observe(f.card.shadowRoot,{childList:true,subtree:true});
   pending.resolve(clone(producer));await settle();observer.disconnect();
   empty(f);assert.equal(f.card._analysisHostV53.state().error,'analysis_subscription_unavailable');
   assert.ok(seen.every(state=>!state.tile&&!state.snapshot));
   assert.equal(f.maxRaw,1);f.assertNoHistory();f.assertSubscriptions(0);f.assertQuiet();
  }finally{f.close();}
 });
}

for(const language of ['en','pl'])test('Insights useful Tips are available without reading measurements or access to analysis: '+language,async()=>{
 const f=setup({...cases[1],home:'tips'},{response:()=>Promise.reject({code:'unauthorized'})});
 try {
  f.update({...f.hass,language,locale:{...f.hass.locale,language}});await f.mount();
  const tips=f.card.shadowRoot.querySelectorAll('[data-energy-tips-v53] .tip-card');
  assert.equal(tips.length,5);assert.equal(f.analyses.length,0);f.assertSubscriptions(0);f.assertNoHistory();
  assert.equal(f.card.shadowRoot.querySelector('.analysis-tiles'),null);
  for(const tip of tips){const heading=tip.querySelector('strong').textContent,body=tip.querySelector('p').textContent;assert.ok(heading.length>2);assert.ok(body.length>20);assert.notEqual(heading,body);}
  assert.match(tips[0].textContent,/Energy Dashboard|panelu Energia/);
  assert.doesNotMatch(f.card.shadowRoot.querySelector('[data-energy-tips-v53]').textContent,/energy_price|template sensors|ENERGY STAR/);
  f.tab('overview');await settle();assert.equal(f.analyses.length,1);f.assertSubscriptions();
  f.tab('tips');await settle();assert.equal(f.analyses.length,1);f.assertSubscriptions(0);assert.equal(f.card.shadowRoot.querySelectorAll('[data-energy-tips-v53] .tip-card').length,5);
  assert.equal(f.card.shadowRoot.querySelector('.analysis-tiles'),null);f.assertQuiet();
 }finally{f.close();}
});

// Actual producer/service/pricing fixture with synthetic provider IO; no native HA claim.
for(const fixtureFile of ['analysis-wholeperiod-v53.json','analysis-wholeperiod78-v53.json'])for(const spec of cases)test(`${spec.type}: proven whole-period facts reach the actual card and survive presentation changes (${fixtureFile})`,async()=>{
 const snapshot=JSON.parse(read('tests/fixtures/'+fixtureFile));
 const f=setup(spec,{response:()=>clone(snapshot)});
 try{
  f.update({...f.hass,config:{...f.hass.config,time_zone:'Europe/Warsaw'}});
  await f.mount();assert.ok(f.card.shadowRoot.querySelector('.energy-analysis-v53'),JSON.stringify({state:f.card._analysisHostV53?.state(),zone:f.card._hass?.config?.time_zone,requests:f.analyses,errors:f.errors}));const root=analysisRoot(f);
  assert.match(root.querySelector('.analysis-tile strong').textContent,/^250 kWh$/);
  assert.match(root.querySelector('[data-analysis-cheap-share] strong').textContent,/^23[.,]2\s?%$/);
  const peak=root.querySelector('[data-analysis-peak]');assert.equal(peak.dataset.analysisPeakId,snapshot.period_summary.peak_hour.id);
  assert.match(peak.querySelector('strong').textContent,/18:00/);assert.match(peak.textContent,/22 kWh/);
  const zones=root.querySelector('[data-analysis-period-zone-total]');assert.ok(zones);assert.equal(zones.querySelectorAll('[data-analysis-period-zone]').length,2);
  assert.match(zones.textContent,/58 kWh/);assert.match(zones.textContent,/192 kWh/);assert.match(zones.textContent,/211.2 EUR/);
  assert.equal(f.card._analysisHostV53.state().snapshot.snapshot_id,snapshot.snapshot_id);
  assert.ok(root.querySelector('[data-analysis-sankey]'),'proven flow reaches the actual custom element');
  const reads=f.analyses.length;
  if(fixtureFile==='analysis-wholeperiod78-v53.json'&&spec.type==='ha-energy-optimizer'){
   f.tab('recommendations');await settle();const rates=analysisRoot(f).querySelector('[data-analysis-rates]');assert.ok(rates);
   assert.equal(rates.querySelector('[data-analysis-rate76-total="low"]').textContent,'0.6 EUR');
   assert.equal(rates.querySelector('[data-analysis-rate76-total="high"]').textContent,'1.1 EUR');
   assert.match(rates.querySelector('[data-analysis-rate76-cost]').textContent,/247 EUR/);
   assert.equal(f.analyses.length,reads,'tab presentation reuses the same authorized snapshot');
   f.tab(spec.home);await settle();assert.equal(f.analyses.length,reads);
  }
  control(f,'view','data').click();assert.equal(f.card.shadowRoot.querySelectorAll('[data-analysis-bin]').length,24);
  f.update({...f.hass,locale:{...f.hass.locale,language:'pl'}});await settle();
  assert.match(f.card.shadowRoot.querySelector('[data-analysis-cheap-share]').textContent,/taniej/);
  assert.equal(f.analyses.length,reads);assert.equal(f.card._analysisHostV53.state().snapshot.snapshot_id,snapshot.snapshot_id);
  f.assertNoHistory();f.assertQuiet();
 }finally{f.close();}
});

test('modern Email Overview header does not claim an unrelated legacy tariff or currency',async()=>{
 const f=setup(cases[2]);try{f.update({...f.hass,config:{...f.hass.config,currency:'PLN'}});await f.mount();
  const header=f.card.shadowRoot.querySelector('.header-sub');assert.ok(header);assert.doesNotMatch(header.textContent,/PLN|Tariff not configured|Shared tariff not confirmed/);assert.match(header.textContent,/Energy analysis/);
  f.assertNoHistory();f.assertQuiet();
 }finally{f.close();}
});
test('unchanged ordinary hass updates preserve mounted Optimizer controls after throttle interval',async()=>{
 const f=setup(cases[0]);try{await f.mount();f.advance(11000);f.update({...f.hass});await settle();
  const calendar=f.card.shadowRoot.querySelector('[data-analysis-calendar-options]');calendar.open=true;
  const anchor=control(f,'anchor');anchor.focus();const count=f.analyses.length;
  f.advance(11000);f.update({...f.hass});await settle();
  assert.equal(f.card.shadowRoot.querySelector('[data-analysis-calendar-options]'),calendar);assert.equal(calendar.open,true);assert.equal(f.card.shadowRoot.activeElement,anchor);assert.equal(f.analyses.length,count);f.assertQuiet();
 }finally{f.close();}
});

for(const boundary of ['user','role','connection'])test('optimized hass refresh rebinds after '+boundary+' change',async()=>{
 const f=setup(cases[0]);try{await f.mount();f.advance(11000);f.update({...f.hass});await settle();
  const old=f.card.shadowRoot.querySelector('[data-analysis-calendar-options]');old.open=true;const reads=f.analyses.length;
  f.advance(11000);const next={...f.hass,user:{...f.hass.user}};
  if(boundary==='user')next.user.id='replacement';if(boundary==='role')next.user.is_admin=true;if(boundary==='connection')next.connection=f.connection();
  f.update(next);await settle();
  const current=f.card.shadowRoot.querySelector('[data-analysis-calendar-options]');assert.ok(current,'active analysis must remount in the new context');assert.notEqual(current,old);assert.equal(current.open,false);assert.equal(f.analyses.length,reads+1);f.assertQuiet();
 }finally{f.close();}
});
test('configured power still refreshes when the measured value changes',async()=>{
 const f=setup(cases[0]);try{
  f.card.setConfig({title:'Power',power_entity:'sensor.power',show_help:false,show_support:false});
  const meter=value=>({state:String(value),attributes:{unit_of_measurement:'W'}});
  f.update({...f.hass,states:{'sensor.power':meter(0)}});await f.mount();
  assert.equal(f.card.shadowRoot.querySelector('.power-draw-value').textContent,'0.00');
  f.advance(11000);f.update({...f.hass,states:{'sensor.power':meter(1000)}});await settle();
  assert.equal(f.card.shadowRoot.querySelector('.power-draw-value').textContent,'1.00');f.assertQuiet();
 }finally{f.close();}
});
