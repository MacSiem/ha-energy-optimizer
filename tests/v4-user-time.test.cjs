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
});
function fixture(){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),charts=[];
 dom.window.captureChart=cfg=>charts.push(cfg);dom.window.HTMLCanvasElement.prototype.getContext=()=>({});
 dom.window.eval(readFileSync('src/optimizer.js','utf8')+'\nconst HA_ENERGY_CHART=class{constructor(ctx,cfg){window.captureChart(cfg)}destroy(){}};');
 dom.window.eval(readFileSync('src/energy-insights.js','utf8'));
 const card=dom.window.document.createElement('ha-energy-optimizer');card._schedule=()=>{};card._hass=hass();card.setConfig({show_support:false,energy_price:2,currency:'EUR'});
 card._energyModel={ids:['sensor.qa_grid'],zone:'Europe/Warsaw',start:stamp,todayStart:stamp,end:stamp+2*H,summary:()=>({total:2}),points:new Map([[stamp,{kwh:1}],[stamp+H,{kwh:1}]])};
 card._todayWindow={start:new Date(stamp).toISOString(),end:new Date(stamp+2*H).toISOString(),total:2,boundaryComplete:true};card._hasRealData=true;card._loadChartJS=async()=>{};card._render();
 return {dom,card,charts,close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
test('Dashboard axis is short local time; tooltip and Data use the same friendly absolute point',async()=>{
 const f=fixture();try{
  const before=f.card._dashboardRowsV3().map(r=>({id:r.id,kwh:r.kwh,energyCost:r.energyCost}));await f.card._drawDashboardChart();const cfg=f.charts.at(-1);
  assert.equal(cfg.data.labels[0],'18:00');assert.match(cfg.options.plugins.tooltip.callbacks.title([{dataIndex:0,label:cfg.data.labels[0]}]),/15 paź.*18:00/);
  f.card.shadowRoot.querySelector('[data-dashboard-control="data"]').click();assert.match(f.card.shadowRoot.querySelector('[data-dashboard-row] th').textContent,/15 paź.*18:00/);
  assert.deepEqual(f.card._dashboardRowsV3().map(r=>({id:r.id,kwh:r.kwh,energyCost:r.energyCost})),before,'presentation does not change bucket identities, values or prices');
 }finally{f.close();}
});
test('Patterns and Insights chart axes and titles use local friendly dates',()=>{
 const f=fixture();try{
  f.card._patternsMarkup();const row=f.card._dashboardRowsV3()[0];assert.match(f.card._patternsRowLabel(row),/15 paź.*18:00/);
  const insight=f.dom.window.document.createElement('ha-energy-insights');insight._hass=hass();insight._lang='pl';insight._insightChartDataset={hours:[row],currency:'EUR'};insight._insightChartState={resolution:'hour',metric:'kwh',type:'bar',selected:row.id};
  assert.match(insight._insightRowLabelV3(row),/15 paź.*18:00/);const root=f.dom.window.document.createElement('div');root.innerHTML=insight._insightSvgV3(400);
  assert.match(root.querySelector('title').textContent,/15 paź.*18:00/);assert.equal([...root.querySelectorAll('text')].at(-1).textContent,'18:00');
  insight._getTariffHostV3().guard.dispose();
 }finally{f.close();}
});
