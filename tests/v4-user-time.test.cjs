"use strict";
process.env.TZ='America/New_York';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {JSDOM}=require('jsdom');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const stamp=Date.parse('2026-10-15T22:00:00Z'),H=3600000;
const hass=(extra={})=>({user:{id:'qa',is_admin:true},connection:{connected:true},language:'pl',locale:{language:'pl',time_zone:'local',time_format:'24',...extra},config:{time_zone:'Europe/Warsaw',currency:'EUR'},states:{}});
test('display uses the user system zone, with an explicit HA server-zone choice',()=>{
 const local=createFormatUi.forHass(hass());assert.equal(local.timeZone,'America/New_York');assert.match(local.dateTime(new Date(stamp).toISOString()),/15 paź.*18:00/);
 const server=createFormatUi.forHass(hass({time_zone:'server'}));assert.equal(server.timeZone,'Europe/Warsaw');assert.match(server.dateTime(new Date(stamp).toISOString()),/16 paź.*00:00/);
});
test('the user 12/24-hour preference applies to short chart clocks',()=>{
 const h=hass({language:'en',time_format:'12'});assert.match(createFormatUi.forHass(h).clock(stamp),/6:00.*PM/);
 h.locale.time_format='24';assert.equal(createFormatUi.forHass(h).clock(stamp),'18:00');
});
test('repeated local DST hours retain distinguishable point labels and absolute identities',()=>{
 const format=createFormatUi.forHass(hass({language:'en',time_format:'24'}));
 const first=Date.parse('2026-11-01T05:00:00Z'),second=first+H;
 assert.equal(format.clock(first),format.clock(second));assert.notEqual(format.pointLabel(first),format.pointLabel(second));
 assert.match(format.pointLabel(first),/GMT-4/);assert.match(format.pointLabel(second),/GMT-5/);
 const labels=format.chartLabels([first,second]);assert.notEqual(labels[0],labels[1]);assert.match(labels[0],/GMT-4/);assert.match(labels[1],/GMT-5/);
 const multi=format.chartLabels([first,first+48*H]);assert.match(multi[0],/Nov 1/);assert.match(multi[1],/Nov 3/);
});
function fixture(){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),charts=[];
 dom.window.captureChart=cfg=>charts.push(cfg);dom.window.HTMLCanvasElement.prototype.getContext=()=>({});
 dom.window.eval(readFileSync('src/optimizer.js','utf8')+readFileSync('src/energy-insights.js','utf8')+'\nconst HA_ENERGY_CHART=class{constructor(ctx,cfg){window.captureChart(cfg)}destroy(){}};');
 const card=dom.window.document.createElement('ha-energy-optimizer');card._schedule=()=>{};card._hass=hass();card.setConfig({show_support:false,energy_price:2,currency:'EUR'});
 card._energyModel={ids:['sensor.qa_grid'],zone:'Europe/Warsaw',start:stamp,todayStart:stamp,end:stamp+2*H,summary:()=>({total:2}),points:new Map([[stamp,{kwh:1}],[stamp+H,{kwh:1}]])};
 card._todayWindow={start:new Date(stamp).toISOString(),end:new Date(stamp+2*H).toISOString(),total:2,boundaryComplete:true};card._hasRealData=true;card._loadChartJS=async()=>{};card._render();
 return {dom,card,charts,close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
test('Dashboard axis is short local time; tooltip and Data use the same friendly absolute point',async()=>{
 const f=fixture();try{
  assert.match(f.card._peakHourMarkupV3(),/18:00.*GMT-4/);
  const before=f.card._dashboardRowsV3().map(r=>({id:r.id,kwh:r.kwh,energyCost:r.energyCost}));await f.card._drawDashboardChart();const cfg=f.charts.at(-1);
  assert.equal(cfg.data.labels[0],'18:00');assert.match(cfg.options.plugins.tooltip.callbacks.title([{dataIndex:0,label:cfg.data.labels[0]}]),/15 paź.*18:00/);
  f.card.shadowRoot.querySelector('[data-dashboard-control="data"]').click();assert.match(f.card.shadowRoot.querySelector('[data-dashboard-row] th').textContent,/15 paź.*18:00/);
  assert.deepEqual(f.card._dashboardRowsV3().map(r=>({id:r.id,kwh:r.kwh,energyCost:r.energyCost})),before,'presentation does not change bucket identities, values or prices');
 }finally{f.close();}
});
test('Patterns and Insights chart axes and titles use local friendly dates',()=>{
 const f=fixture();try{
  const patterns=f.dom.window.document.createElement('div');patterns.innerHTML=f.card._patternsMarkup();assert.match(patterns.querySelector('[data-pattern-control=day] option').textContent,/paź/);assert.doesNotMatch(patterns.querySelector('[data-pattern-range]').textContent,/\d{4}-\d\d-\d\dT/);const row=f.card._dashboardRowsV3()[0];assert.match(f.card._patternsRowLabel(row),/15 paź.*18:00/);
  const insight=f.dom.window.document.createElement('ha-energy-insights');insight._hass=hass();insight._lang='pl';insight._insightChartDataset={hours:[row],currency:'EUR'};insight._insightChartState={resolution:'hour',metric:'kwh',type:'bar',selected:row.id};
  assert.match(insight._insightRowLabelV3(row),/15 paź.*18:00/);const root=f.dom.window.document.createElement('div');root.innerHTML=insight._insightSvgV3(400);
  assert.match(root.querySelector('title').textContent,/15 paź.*18:00/);assert.equal([...root.querySelectorAll('text')].at(-1).textContent,'18:00');
  insight._getTariffHostV3().guard.dispose();
 }finally{f.close();}
});

test('an invalid system offset falls back to the validated HA calendar zone',()=>{
 const vm=require('node:vm');const DateTimeFormat=function(language,options){return arguments.length?new Intl.DateTimeFormat(language,options):{resolvedOptions:()=>({timeZone:'+00:00'})};};
 const factory=vm.runInNewContext(readFileSync('shared/ha-tools-format.js','utf8')+';createFormatUi',{Intl:{DateTimeFormat,NumberFormat:Intl.NumberFormat,PluralRules:Intl.PluralRules}});
 assert.equal(factory.forHass(hass()).timeZone,'Europe/Warsaw');
});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function mountedTimeChange(type, scenario='format'){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),NativeDate=dom.window.Date,now=Date.parse('2026-10-16T12:30:00Z');
 dom.window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 dom.window.eval(['optimizer.js','energy-insights.js','energy-email.js','chart-vendor.js'].map(n=>readFileSync('src/'+n,'utf8')).join(''));
 const card=dom.window.document.createElement(type);card._schedule=()=>{};card.setConfig({show_support:false,energy_price:2,currency:'EUR',power_entity:'sensor.qa_power'});
 const requests=[],context=hass(scenario==='calendar'?{time_zone:'server'}:{});context.states={'sensor.qa_power':{state:'0',attributes:{unit_of_measurement:'W'}}};context.services={};context.callWS=async req=>{
  requests.push(req.type);
  if(req.type==='ha_tools_email/get_config')return {smtp_configured:true,schedules:[]};
  if(req.type==='ha_tools_email/preview_energy_report')return {status:'no_sources',sources:[]};
  if(req.type==='ha_tools_email/get_tariff')throw {code:'unknown_command'};
  if(req.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.qa_grid'}]};
  if(req.type==='recorder/get_statistics_metadata')return {'sensor.qa_grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
  if(req.type==='recorder/statistics_during_period'){const from=Date.parse(req.start_time),to=Date.parse(req.end_time);return {'sensor.qa_grid':Array.from({length:(to-from)/H},(_,i)=>({start:from+i*H,change:1}))};}
  throw Error(req.type);
 };
 try{
  dom.window.document.body.append(card);card.hass=context;for(let i=0;i<15;i++)await tick();
  const root=card.shadowRoot,summary=()=>root.querySelector('[data-energy-period-summary]')?.textContent;
  const before=summary();assert.match(before,scenario==='calendar'?/Europe\/Warsaw/:/America\/New_York/);const count=requests.length;
  if(scenario==='calendar'){
   context.config.time_zone='UTC';card.hass=context;for(let i=0;i<15;i++)await tick();
   assert.match(summary()||'',/UTC/,'changed measurement calendar must recover without another hass event');
   assert.ok(requests.length>count,'calendar changes fetch new authoritative windows');return;
  }
  if(scenario==='compound'){context.states['sensor.qa_power']={state:'321',attributes:{unit_of_measurement:'W'}};card._lastStatsFetch=0;}
  const raw=root.querySelector('[data-energy-period-details]').textContent.match(/UTC:.*$/s)[0];
  context.locale.time_zone='server';card.hass=context;for(let i=0;i<4;i++)await tick();
  assert.match(summary(),/Europe\/Warsaw/);if(scenario==='compound')assert.equal(card._currentPowerW,321,'same event must update live power as well as formatting');assert.notEqual(summary(),before);assert.equal(requests.length,count,'format-only gesture must use already measured data');
  assert.equal(root.querySelector('[data-energy-period-details]').textContent.match(/UTC:.*$/s)[0],raw,'absolute window stays identical');
  context.locale.time_format='12';card.hass=context;for(let i=0;i<4;i++)await tick();assert.match(summary(),/AM|PM/);assert.equal(requests.length,count);
 }finally{card._getTariffHostV3().guard.dispose();dom.window.close();}
}
for(const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'])test(type+' reprojects an in-place profile time change without another Recorder read',()=>mountedTimeChange(type));
test('Optimizer handles a profile time change and live power in the same event',()=>mountedTimeChange('ha-energy-optimizer','compound'));
test('Optimizer refetches after an in-place server calendar change',()=>mountedTimeChange('ha-energy-optimizer','calendar'));
