'use strict';
// DOM/format contracts only. JSDOM does not prove W22 geometry or overflow.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const fs=require('node:fs'),path=require('node:path');
const options=fs.readFileSync(path.join(__dirname,'../shared/ha-tools-energy-card-options.js'),'utf8');
const formatSource=fs.readFileSync(path.join(__dirname,'../shared/ha-tools-format.js'),'utf8');
const producer=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/analysis-wholeperiod78-v53.json'),'utf8'));
const tick=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function mount(name,language,clock,missing=false){
 const snapshot=structuredClone(producer);
 if(missing){snapshot.totals.measurement_complete=false;snapshot.totals.pricing_complete=false;snapshot.totals.kwh=null;snapshot.totals.usage_cost=null;}
 snapshot.active_tariff_id='qa-tariff';snapshot.alternatives=[{tariff_id:'qa-tariff',tariff_name:'QA80 tariff'}];
 const before=JSON.stringify(snapshot),vc=new VirtualConsole();
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.fetch=()=>{throw Error('network forbidden');};w.ResizeObserver=class{observe(){}disconnect(){}};
 w.__snapshot=snapshot;
 w.eval(formatSource+'\n'+options+`
 class CompactHarness extends HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'});this._config={};}
  setConfig(config){this._config={...config};}
  set hass(value){this._hass=value;}
  get hass(){return this._hass;}
  _render(){}
  _getTariffHostV3(){return this._tariff ||= {
   guard:{snapshot:()=>({epoch:0}),observe:()=>({epoch:0}),available:()=>true,current:()=>true,occupied:()=>false,resume(){}},
   ui:()=>({css:'',applyTheme(){}}),
   summary:()=>({observe:()=>({status:'ready',snapshot:window.__snapshot}),read:async()=>{},stop(){}})
  };}
 }
 class CompactEditor extends HTMLElement{_render(){}}
 createEnergyCardOptionsV5({Card:CompactHarness,Editor:CompactEditor,name:${JSON.stringify(name)},title:'Energy',tabs:['overview'],labels:[['Overview'],['Przegląd']]});
 customElements.define('qa-compact-card',CompactHarness);
 `);
 const card=w.document.createElement('qa-compact-card');card.setConfig({variant:'compact'});
 card.hass={user:{id:'reader',is_active:true,is_admin:false},connected:true,connection:{connected:true},locale:{language,time_format:clock,time_zone:'server'},language,config:{time_zone:'Europe/Warsaw'},states:{}};
 w.document.body.append(card);
 return {w,card,snapshot,before,close:()=>{card.remove();w.close();}};
}
for(const name of ['ha-energy-optimizer','ha-energy-insights'])for(const language of ['en','pl'])for(const clock of ['12','24']){
 test(`${name} compact ${language}/${clock}: short axis preserves complete accessible dates and all chart legends`,async()=>{
  const f=mount(name,language,clock,true);try{
   await tick();const root=f.card.shadowRoot;
   assert.equal(root.querySelector('[data-energy-primary]').textContent,language==='pl'?'Brak danych':'Unknown');
   assert.equal(root.querySelector('[data-energy-cost]').textContent,language==='pl'?'Brak danych':'Unknown');
   assert.match(root.querySelector('[data-energy-primary-label]').textContent,/QA80 tariff/);
   assert.match(root.querySelector('[data-energy-comparison]').textContent,/Unknown|Brak danych/);
   const ticks=[...root.querySelector('[data-energy-zone-axis]').children];
   assert.ok(ticks.length>0&&ticks.length<=3);
   assert.ok(ticks.every(node=>!/[AP]M/i.test(node.textContent)));
   assert.ok(ticks.every(node=>node.title&&node.style.left&&node.style.transform));
   assert.ok(root.querySelector('[data-energy-zone-axis]').getAttribute('aria-label'));
   assert.deepEqual([...root.querySelectorAll('[data-energy-zone-legend] span')].map(node=>node.dataset.zone),['cheap','expensive','unknown']);
   assert.ok(root.querySelector('[data-energy-zonebar]').getAttribute('aria-label'));
   assert.equal(JSON.stringify(f.snapshot),f.before);
  }finally{f.close();}
 });
}
test('compact formatting retains one energy/two money decimals and trusted tariff context',async()=>{
 const f=mount('ha-energy-optimizer','en','12');try{
  await tick();const root=f.card.shadowRoot;
  assert.equal(root.querySelector('[data-energy-primary]').textContent,'250.0 kWh');
  assert.equal(root.querySelector('[data-energy-cost]').textContent,'246.00 EUR');
  assert.match(root.querySelector('[data-energy-primary-label]').textContent,/QA80 tariff/);
  assert.equal(JSON.stringify(f.snapshot),f.before);
 }finally{f.close();}
});
test('narrow CSS preserves bounded height and readable content without touching tile/email actions',()=>{
 assert.match(options,/max-height:248px/);
 const narrow=options.split('const narrowEnergyStyle = `',2)[1].split('`;',1)[0];
 assert.match(narrow,/overflow:auto/);
 assert.match(narrow,/@container energy-simple-card \(max-width:279px\)/);
 assert.match(narrow,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(narrow,/font-size:18px;line-height:22px/);
 assert.match(narrow,/font-size:16px;line-height:22px/);
 assert.match(narrow,/font-size:12px;line-height:16px/);
 assert.match(narrow,/white-space:normal;overflow:visible;text-overflow:clip/);
 assert.match(narrow,/-webkit-line-clamp:unset;overflow:visible/);
 assert.doesNotMatch(narrow,/overflow:hidden|text-overflow:ellipsis|display:none/);
 for(const selector of narrow.matchAll(/^\s*(\[data-energy[^\n{]+)\{/gm))assert.ok(selector[1].startsWith('[data-energy-simple=compact]:not([data-energy-report-status])'));
 assert.match(options,/\[data-energy-simple\] button,\[data-energy-back\]\{min-height:44px;min-width:44px/);
});
