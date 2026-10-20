// Run only after normal owner sync. This test evaluates the generated consumers
// byte-for-byte: no options overlay, engine injection, controller or binding doubles.
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
const producer=JSON.parse(fs.readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
const tick=async()=>{for(let i=0;i<16;i++)await new Promise(resolve=>setImmediate(resolve));};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const names=['ha-energy-optimizer','ha-energy-insights'];
function elapsed(){
 // Existing schema2 producer fixture projected onto the native resolver's
 // unfinished local-day shape. Scalar constants are fixture facts, not UI sums.
 const d=clone(producer),p=d.period,c=d.comparisons.previous,b=c.baseline_periods[0];
 d.generated_at='2026-10-10T10:34:00+00:00';p.end='2026-10-10T10:00:00+00:00';p.local_end='2026-10-10T12:00:00+02:00';p.hours=12;p.partial=true;
 b.end='2026-10-09T10:00:00+00:00';b.local_end='2026-10-09T12:00:00+02:00';b.hours=12;b.partial=true;
 d.period_summary={window:{...d.period_summary.window,end:p.end}};d.chart.bins=d.chart.bins.slice(0,12);d.buckets=d.buckets.slice(0,12);
 d.coverage.expected_source_seconds=d.coverage.measured_source_seconds=43200;
 for(const key of ['expected_current_seconds','expected_baseline_seconds','measured_current_seconds','measured_baseline_seconds','common_source_seconds'])c.coverage[key]=43200;
 d.totals.kwh='104.0';d.totals.energy_cost='92.50';d.totals.variable_cost='10.40';d.totals.usage_cost='102.90';
 c.current_kwh=104;c.baseline_kwh=83.2;c.delta_kwh=20.8;c.percent=25;c.chart.markers=c.chart.markers.slice(0,12);
 return d;
}
function setup(name,{reply=()=>clone(producer),manualAck=false,language='en'}={}){
 const errors=[],calls=[],subscriptions=[],unexpected=[];
 const vc=new VirtualConsole();vc.on('error',(...a)=>errors.push(a.join(' ')));vc.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const dom=new JSDOM('<body></body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}};w.fetch=()=>{throw Error('network forbidden');};w.HTMLCanvasElement.prototype.getContext=()=>({});
 w.eval(['optimizer','energy-insights','energy-email'].map(file=>fs.readFileSync(`src/${file}.js`,'utf8')).join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 assert.equal(typeof w.createEnergyAnalysisV53,'undefined','engine stays inside generated tariff block');
 assert.equal(typeof w.createEnergyAnalysisBindingV53,'undefined','binding stays inside generated tariff block');
 const C=w.customElements.get(name),card=w.document.createElement(name);card.setConfig(C.getStubConfig());
 assert.equal(card._config.variant,'compact','normal generated consumer must contain synced options');
 assert.equal(Object.hasOwn(card._config,'tariff_profile'),false);
 let current=reply,raw=0,maxRaw=0;
 const connection=new w.EventTarget();connection.connected=true;
 connection.subscribeMessage=(callback,q)=>{
  assert.equal(q.type,'ha_tools_email/subscribe_analysis_updates');const ack=deferred(),row={callback,ack,active:false};subscriptions.push(row);
  row.confirm=()=>{row.active=true;ack.resolve(()=>{row.active=false;});};if(!manualAck)row.confirm();return ack.promise;
 };
 let hass={user:{id:'reader',is_active:true,is_admin:false},connection,connected:true,config:{time_zone:producer.period.timezone,currency:'EUR'},locale:{language,time_zone:'server',time_format:'24'},language,states:{},services:{},
  callWS:async q=>{calls.push(clone(q));if(q.type==='ha_tools_email/get_report_status' && q.purpose==='energy_report')throw {code:'unknown_command'};if(q.type==='ha_tools_email/energy_analysis'){raw++;maxRaw=Math.max(maxRaw,raw);try{return await current(q);}finally{raw--;}}unexpected.push(q);throw {code:'unexpected_command'};},callService(){throw Error('service forbidden');}};
 return {w,card,calls,errors,subscriptions,get hass(){return hass;},get maxRaw(){return maxRaw;},set reply(fn){current=fn;},async mount(){w.document.body.append(card);card.hass=hass;await tick();},update(next){hass=next;card.hass=hass;},ack(){subscriptions.at(-1).confirm();},signal(){subscriptions.filter(s=>s.active).at(-1)?.callback({data:{registry_revision:42}});},quiet(){assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);},close(){card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
}
for(const name of names){
 for(const language of ['en','pl'])test(`${name} generated consumer: lexical bridge reads actual schema2 and draws proven day bins (${language})`,async()=>{
  const f=setup(name,{language});try{
   await f.mount();const root=f.card.shadowRoot;assert.equal(typeof f.card._getTariffHostV3().summary,'function');
   assert.deepEqual(f.calls,[{type:'ha_tools_email/energy_analysis',period:'day',comparison:'previous'}]);
   assert.match(root.querySelector('[data-energy-primary]').textContent,/250[,.]0 kWh/);assert.match(root.querySelector('[data-energy-cost]').textContent,/246[,.]00 EUR/);
   assert.match(root.querySelector('[data-energy-comparison]').textContent,/Unknown|Brak danych/,'full historical day does not pretend to be same-hour comparison');
   const bar=root.querySelector('[data-energy-zonebar]');assert.ok(bar);assert.equal(root.querySelectorAll('[data-energy-zonebar]').length,1);assert.equal(bar.querySelectorAll('[data-energy-zone]').length,24);
   assert.ok(bar.querySelector('[data-energy-zone="cheap"]'));assert.ok(bar.querySelector('[data-energy-zone="expensive"]'));assert.match(bar.getAttribute('aria-label'),/Cheap|Tania/);
   const button=root.querySelector('[data-energy-open]');button.focus();const count=f.calls.length;f.card._render();assert.equal(root.activeElement,button);assert.equal(f.calls.length,count);f.quiet();
  }finally{f.close();}
 });
 test(`${name} generated consumer: confirmed current partial and yesterday same local cutoff display server delta, future remains neutral`,async()=>{
  const d=elapsed(),original=JSON.stringify(d),f=setup(name,{reply:()=>d});try{
   await f.mount();const root=f.card.shadowRoot;assert.equal(root.querySelector('[data-energy-primary]').textContent,'104.0 kWh');assert.match(root.querySelector('[data-energy-comparison]').textContent,/\+25% vs yesterday through 12:00/);
   const bar=root.querySelector('[data-energy-zonebar]');assert.equal(bar.children.length,12);assert.match(bar.getAttribute('aria-label'),/Remaining time: Unknown/);assert.equal(bar.children[0].style.left,'0%');
   assert.equal(JSON.stringify(d),original,'presentation does not mutate period, amounts, proofs or bins');f.quiet();
  }finally{f.close();}
 });
 for(const defect of ['full-day','other-cutoff','clamped','common-measurements','unreconciled','wrong-baseline-date','unknown-percent'])test(`${name} generated consumer: ${defect} cannot claim yesterday at the same hour`,async()=>{
  const d=elapsed(),b=d.comparisons.previous.baseline_periods[0];
  if(defect==='full-day')Object.assign(b,{end:b.calendar_end,local_end:b.calendar_local_end,partial:false});
  if(defect==='other-cutoff'){b.end='2026-10-09T11:00:00+00:00';b.local_end='2026-10-09T13:00:00+02:00';}
  if(defect==='clamped'){b.calendar_clamped=true;b.clamps=['shared_calendar_alignment'];}
  if(defect==='common-measurements')d.comparisons.previous.comparison_scope='common_measurements';
  if(defect==='unreconciled')d.comparisons.previous.chart.reconciles_comparison_energy=false;
  if(defect==='wrong-baseline-date'){b.start='2026-10-08T22:00:00+00:00';b.local_start='2026-10-09T00:00:00+02:00';b.end='2026-10-08T10:00:00+00:00';b.local_end='2026-10-08T12:00:00+02:00';}
  if(defect==='unknown-percent')d.comparisons.previous.percent=null;
  const f=setup(name,{reply:()=>d});try{await f.mount();assert.match(f.card.shadowRoot.querySelector('[data-energy-comparison]').textContent,/Unknown/);assert.doesNotMatch(f.card.shadowRoot.querySelector('[data-energy-comparison]').textContent,/25%/);f.quiet();}finally{f.close();}
 });
 for(const defect of ['no-proof','no-classification','duplicate-version','mixed-zones','unreconciled','partial-bin','overlap'])test(`${name} generated consumer: ${defect} yields neutral zone geometry, never inferred tariffs`,async()=>{
  const d=clone(producer);
  if(defect==='no-proof')delete d.chart.bins[0].zone_breakdown;
  if(defect==='no-classification')delete d.rates[0].profile.zones[0].classification;
  if(defect==='duplicate-version')d.rates.push(clone(d.rates[0]));
  if(defect==='mixed-zones')d.chart.bins[0].zone_breakdown.zones.push(clone(d.chart.bins[0].zone_breakdown.zones[0]));
  if(defect==='unreconciled')d.chart.bins[0].zone_breakdown.reconciles_recorded_kwh=false;
  if(defect==='partial-bin')d.chart.bins[0].complete=false;
  if(defect==='overlap'){d.chart.bins[1].from=d.chart.bins[0].from;d.chart.bins[1].start=d.chart.bins[0].start;}
  const f=setup(name,{reply:()=>d});try{
   await f.mount();const bar=f.card.shadowRoot.querySelector('[data-energy-zonebar]');assert.ok(bar);
   if(defect==='overlap')assert.equal(bar.children.length,0);else assert.equal(bar.children[0].dataset.energyZone,'unknown');f.quiet();
  }finally{f.close();}
 });
 test(`${name} generated consumer: real bridge ACK/events/current context keep one raw request through identity and revocation`,async()=>{
  const first=deferred(),f=setup(name,{reply:()=>first.promise,manualAck:true});try{
   await f.mount();assert.equal(f.calls.length,0);f.ack();await tick();assert.equal(f.calls.length,1);
   f.reply=()=>elapsed();f.update({...f.hass,user:{id:'other',is_active:true,is_admin:true}});await tick();f.ack();await tick();assert.equal(f.calls.length,1);
   assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Unknown/);
   const stale=clone(producer);stale.totals.kwh='987654';first.resolve(stale);await tick();assert.equal(f.maxRaw,1);assert.equal(f.calls.length,2);assert.equal(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,'104.0 kWh');
   f.reply=()=>Promise.reject({code:'unauthorized'});f.signal();await tick();assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Unknown/);assert.equal(f.card.shadowRoot.querySelector('[data-energy-zonebar]').children.length,0);
   const row=f.subscriptions.at(-1);f.card.remove();assert.equal(row.active,false);f.quiet();
  }finally{f.close();}
 });
}
test('generated Email simple view uses no lexical engine, private data or tariff zone bar',async()=>{
 const f=setup('ha-energy-email');try{await f.mount();assert.deepEqual(f.calls,[{type:'ha_tools_email/get_report_status',purpose:'energy_report'}]);assert.equal(f.subscriptions.length,1);assert.equal(f.card.shadowRoot.querySelector('[data-energy-zonebar]'),null);assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Unknown/);f.quiet();}finally{f.close();}
});

for(const language of ['en','pl'])test(`generated compact preserves the explicit 6.5% comparison exception (${language})`,async()=>{
 const dto=elapsed();dto.comparisons.previous.percent=6.5;const f=setup('ha-energy-optimizer',{language,reply:()=>dto});
 try{await f.mount();assert.match(f.card.shadowRoot.querySelector('[data-energy-comparison]').textContent,language==='pl'?/\+6,5%.*83,2 kWh/:/\+6\.5%.*83\.2 kWh/);f.quiet();}finally{f.close();}
});

for(const name of names) test(`${name} compact day chart uses measured heights and preserves unknown and zero`,async()=>{
 const value=clone(producer),original=JSON.stringify(value),f=setup(name,{reply:()=>value});
 try{
  await f.mount();const root=f.card.shadowRoot,bar=root.querySelector('[data-energy-zonebar]');
  const heights=[...bar.children].map(n=>Number.parseFloat(n.style.height));
  assert.equal(heights.length,value.chart.bins.length);assert.ok(heights.every(n=>Number.isFinite(n)&&n>=0&&n<=100));
  assert.ok(new Set(heights).size>1,'different measured kWh do not become a uniform tariff strip');
  assert.match(bar.children[0].title,/4[,.]0 kWh/);assert.ok(root.querySelector('[data-energy-zone-axis]'));
  assert.equal(JSON.stringify(value),original);f.quiet();
 }finally{f.close();}
 const zero=clone(producer),first=zero.chart.bins[0];first.kwh=first.recorded_kwh='0';
 first.zone_breakdown.zones[0].kwh=first.zone_breakdown.zones[0].recorded_kwh='0';
 const z=setup(name,{reply:()=>zero});try{await z.mount();assert.equal(z.card.shadowRoot.querySelector('[data-energy-zonebar]').children[0].style.height,'0%');z.quiet();}finally{z.close();}
 const partial=clone(producer);partial.chart.bins[0].complete=false;
 const u=setup(name,{reply:()=>partial});try{await u.mount();const segment=u.card.shadowRoot.querySelector('[data-energy-zonebar]').children[0];assert.equal(segment.dataset.energyMeasurement,'unknown');assert.equal(segment.style.height,'');assert.match(segment.title,/Unknown/);u.quiet();}finally{u.close();}
});
