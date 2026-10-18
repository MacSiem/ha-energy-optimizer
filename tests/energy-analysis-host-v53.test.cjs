// Run after sync-tariff --write in the owner's isolated candidate; worker does not execute.
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const base=path.resolve(__dirname,'..');
const source=file=>fs.readFileSync(path.join(base,file),'utf8');
const fixture=JSON.parse(source('tests/fixtures/analysis-partial-v53.json'));
const clone=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function settled(){for(let i=0;i<8;i++)await tick();}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(response=()=>clone(fixture)) {
  const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost',runScripts:'outside-only'});
  const w=dom.window;
  const format=source('src/optimizer.js').match(/\/\/ HA_FORMAT_UI_START\n([\s\S]*?)\/\/ HA_FORMAT_UI_END/)[1];
  // Reproduce the consumer's private lazy closure, including strict semantics.
  // Separate strict evals deliberately do not expose factories on window.
  const modules=['analysis','analysis-binding','analysis-view','analysis-host'].map(name=>source(`shared/ha-tools-energy-${name}.js`));
  const createHost=w.eval('\"use strict\";(function(){\n'+[format,...modules].join('\n')+'\nreturn createEnergyAnalysisHostV53;})()');
  const card=w.document.createElement('section');w.document.body.append(card);
  const listeners=new Map(), calls=[];
  let unsubscribed=0, legacy=0, cleared=0;
  card._hass={user:{id:'reader',is_active:true},config:{time_zone:'UTC'},locale:{language:'en',time_zone:'server',time_format:'24'},
    connection:{connected:true,subscribeEvents:async(callback,event)=>{
      const entry={callback,event};listeners.set(entry,entry);return ()=>{listeners.delete(entry);unsubscribed++;};
    }},callWS:message=>{calls.push(clone(message));return Promise.resolve().then(()=>response(message));}};
  card._analysisIsActiveV53=()=>true;
  card._clearAnalysisLegacyV53=()=>{cleared++;card.oldPrivateRows=null;};
  let host;
  card._render=()=>{
    const root=w.document.createElement('div');root.dataset.analysisMountV53='';
    card.replaceChildren(root);host.mount(root);return root;
  };
  card._loadAnalysisLegacyV53=()=>{
    legacy++;card.oldPrivateRows=['old'];card.textContent='legacy measured rows';host.mount(card);
  };
  host=createHost({card});
  return {w,card,host,calls,listeners,render:()=>card._render(),
    emit:event=>{for(const row of [...listeners.values()])if(row.event===event)row.callback({event:{}});},
    get legacy(){return legacy;},get cleared(){return cleared;},get unsubscribed(){return unsubscribed;},close:()=>{host.stop();dom.window.close();}};
}
test('real producer fixture renders in actual DOM; inactive host performs no I/O',async()=>{
  const h=harness();try {
    await settled();assert.equal(h.calls.length,0);assert.equal(h.listeners.size,0);
    h.render();await settled();
    assert.equal(h.calls.length,1);assert.equal(h.calls[0].type,'ha_tools_email/energy_analysis');
    assert.ok(h.card.querySelector('.analysis-tiles'));assert.ok(h.card.querySelector('[data-analysis-chart]'));
    assert.match(h.card.textContent,/241/);assert.match(h.card.textContent,/Unmeasured/);
    assert.ok(h.listeners.size>=2);
  } finally{h.close();}
});
test('view, group, point controls persist through parent rerender without more wire requests',async()=>{
  const h=harness();try {
    h.render();await settled();
    h.card.querySelector('[data-analysis-action="view"][data-analysis-value="data"]').click();
    assert.ok(h.card.querySelector('table[data-analysis-bin]') || h.card.querySelector('[data-analysis-bin]'));
    const point=h.card.querySelector('[data-analysis-action="point"]');assert.ok(point);point.click();
    const level=h.card.querySelector('[data-analysis-action="level"]');level.value='devices';level.dispatchEvent(new h.w.Event('change',{bubbles:true}));
    h.render();await settled();
    assert.equal(h.calls.length,1);assert.equal(h.card.querySelector('[data-analysis-action="level"]').value,'devices');
    assert.equal(h.card.querySelector('[data-analysis-action="view"][data-analysis-value="data"]').getAttribute('aria-pressed'),'true');
    assert.equal(h.card.querySelector('[data-analysis-action="point"]').getAttribute('aria-pressed'),'true');
  } finally{h.close();}
});
test('calendar anchor and comparison controls dispatch backend selections; no local billing',async()=>{
  const h=harness();try {
    h.render();await settled();
    const anchor=h.card.querySelector('[data-analysis-action="anchor"]');anchor.value=fixture.context.period_anchor;anchor.dispatchEvent(new h.w.Event('change',{bubbles:true}));await settled();
    assert.equal(h.calls.at(-1).anchor,fixture.context.period_anchor);
    const comparison=h.card.querySelector('[data-analysis-action="comparison"]');comparison.value='mean7';comparison.dispatchEvent(new h.w.Event('change',{bubbles:true}));await settled();
    assert.equal(h.calls.at(-1).comparison,'mean7');
    // A producer fixture for a different comparison must fail validation, not fabricate a baseline.
    assert.equal(h.host.state().error,'invalid_analysis_response');assert.equal(h.legacy,0);
    h.card.querySelector('[data-analysis-action="retry"]').click();await settled();assert.equal(h.calls.length,4);
  } finally{h.close();}
});
for(const error of [{code:'unauthorized'},{code:'not_allowed'},{code:'invalid_format'},new Error('unknown_command'),new Error('network')]) {
  test(`failure ${error.code || error.message} never activates legacy`,async()=>{
    const h=harness(()=>Promise.reject(error));try {
      h.render();await settled();assert.equal(h.legacy,0);assert.equal(h.calls.length,1);assert.equal(h.host.state().snapshot,null);
      assert.ok(h.card.querySelector('[role="status"]'));assert.equal(h.card.querySelector('.analysis-tiles'),null);
    } finally{h.close();}
  });
}
test('only structured unknown_command permits one compatibility transition; events revoke it',async()=>{
  let old=true;const h=harness(()=>old?Promise.reject({code:'unknown_command'}):Promise.reject({code:'unauthorized'}));try {
    h.render();await settled();assert.equal(h.legacy,1);assert.equal(h.calls.length,1);assert.equal(h.host.legacyAllowed(),true);
    h.host.mount(h.card);await settled();assert.equal(h.legacy,1);assert.equal(h.calls.length,1);
    assert.ok(h.card.querySelector('[data-analysis-upgrade-v53]'));old=false;
    h.emit('ha_tools_email_feature_access_updated');await settled();
    assert.equal(h.calls.length,2);assert.equal(h.host.legacyAllowed(),false);assert.equal(h.card.oldPrivateRows,null);
    assert.doesNotMatch(h.card.textContent,/legacy measured rows/);assert.equal(h.legacy,1);
  } finally{h.close();}
});
test('real update event refreshes active view and clears stale content before response',async()=>{
  const next=deferred();let wait=false;const h=harness(()=>wait?next.promise:clone(fixture));try {
    h.render();await settled();assert.ok(h.card.querySelector('.analysis-tiles'));wait=true;
    h.emit('ha_tools_email_energy_analysis_updated');await settled();
    assert.equal(h.card.querySelector('.analysis-tiles'),null);assert.equal(h.calls.length,2);
    next.resolve(clone(fixture));await settled();assert.ok(h.card.querySelector('.analysis-tiles'));
  } finally{h.close();}
});
test('unmount unsubscribes and ignores late wire response; remount waits for original wire',async()=>{
  const pending=deferred();const h=harness(()=>pending.promise);try {
    h.render();await settled();h.host.stop();h.card.remove();assert.equal(h.listeners.size,0);assert.ok(h.unsubscribed>=2);
    h.emit('ha_tools_email_energy_analysis_updated');await settled();assert.equal(h.calls.length,1);
    pending.resolve(clone(fixture));await settled();assert.equal(h.host.state().snapshot,null);assert.equal(h.card.querySelector('.analysis-tiles'),null);
  } finally{h.close();}
});
test('identity changes purge old private rows and reject delayed result',async()=>{
  const old=deferred();let first=true;const h=harness(()=>first?(first=false,old.promise):Promise.reject({code:'unauthorized'}));try {
    h.render();await settled();h.card.oldPrivateRows=['secret'];h.card._hass.user={id:'replacement',is_active:true};
    h.host.observe();h.render();await settled();assert.equal(h.card.oldPrivateRows,null);
    assert.equal(h.calls.length,1);old.resolve(clone(fixture));await settled();
    assert.equal(h.calls.length,2);assert.equal(h.host.state().snapshot,null);assert.equal(h.card.querySelector('.analysis-tiles'),null);
  } finally{h.close();}
});
test('language and clock presentation reproject existing snapshot without new wire request',async()=>{
  const h=harness();try {
    h.render();await settled();const before=h.card.textContent;
    h.card._hass.locale={language:'pl',time_zone:'server',time_format:'12'};h.render();await settled();
    assert.equal(h.calls.length,1);assert.match(h.card.textContent,/Zużycie/);assert.notEqual(h.card.textContent,before);
    assert.equal(h.card.querySelector('[data-analysis-action="anchor"]').value,fixture.context.period_anchor);
    assert.equal(h.host.state().snapshot.snapshot_id,fixture.snapshot_id);
  } finally{h.close();}
});
test('measurement timezone identity must be reauthorized rather than display old measurements',async()=>{
  const h=harness();try {
    h.render();await settled();h.card._hass.config.time_zone='Europe/Warsaw';h.host.observe();h.render();await settled();
    assert.equal(h.calls.length,2);assert.equal(h.host.state().error,'invalid_analysis_response');assert.equal(h.card.querySelector('.analysis-tiles'),null);
  } finally{h.close();}
});
test('three source consumers keep prototype lifecycle and lazy factory wiring',()=>{
  const sync=source('scripts/sync-tariff.cjs');assert.match(sync,/shared\/ha-tools-energy-analysis-host\.js/);
  assert.match(source('shared/ha-tools-tariff-host.js'),/analysis: \(\) => createEnergyAnalysisHostV53\(\{card\}\)/);
  for(const file of ['src/optimizer.js','src/energy-insights.js','src/energy-email.js']) {
    const text=source(file);assert.match(text,/_getAnalysisHostV53\(\) \{ return this\._analysisHostV53 \|\|= this\._getTariffHostV3\(\)\.analysis\(\)/);
    assert.match(text,/disconnectedCallback\(\) \{\s*this\._analysisHostV53\?\.stop\(\)/);
    assert.match(text,/this\._hass = hass;\s*this\._analysisHostV53\?\.observe\(\)/);
    assert.match(text,/data-analysis-mount-v53/);assert.match(text,/if\(!this\._analysisLegacyAllowedV53\(\)\)return;/);
    assert.match(text,/!current\(\) \|\| !this\._analysisLegacyAllowedV53\(\)/);
  }
  assert.match(source('src/optimizer.js'),/_powerMarkupV4\(\)/);assert.match(source('src/optimizer.js'),/Patterns/);
  for(const tab of ['schedule','preview','send','config','history'])assert.ok(source('src/energy-email.js').includes(`case '${tab}'`));
});
