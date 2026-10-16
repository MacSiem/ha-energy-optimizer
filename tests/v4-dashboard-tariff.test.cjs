'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
function fixture(config={}) {
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),charts=[];
 dom.window.captureChart=cfg=>charts.push(cfg);
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({});
 dom.window.eval(readFileSync('src/optimizer.js','utf8')+'\nconst HA_ENERGY_CHART=class{constructor(ctx,cfg){window.captureChart(cfg)}destroy(){}};');
 const card=dom.window.document.createElement('ha-energy-optimizer');card._schedule=()=>{};
 card._hass={user:{id:'qa',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en'},config:{time_zone:'UTC',currency:'EUR'},states:{}};
 card.setConfig({show_support:false,peak_rate:1,off_peak_rate:0.5,peak_hours:{start:0,end:8},...config});
 const start=Date.parse('2026-01-01T00:00:00Z'),end=start+10*3600000;
 card._energyModel={ids:['sensor.qa_grid'],zone:'UTC',start,todayStart:start,end,points:new Map(Array.from({length:10},(_,h)=>[start+h*3600000,{kwh:1}]))};
 card._hasRealData=true;card._todayWindow={start:new Date(start).toISOString(),end:new Date(end).toISOString(),total:10,boundaryComplete:true};
 card._render();
 return {dom,card,charts,close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
test('configured midnight tariff starts at 00:00 in both priced rows and chart colors',async()=>{
 const f=fixture();try {
  const rows=f.card._dashboardRowsV3();assert.equal(rows[0].tariffZone,'day');assert.equal(rows[7].tariffZone,'day');assert.equal(rows[8].tariffZone,'night');
  await f.card._drawDashboardChart();const colors=Array.from(f.charts.at(-1).data.datasets[0].backgroundColor);
  assert.equal(colors[0],colors[7],'00:00 and 07:00 belong to the same configured day zone');
  assert.notEqual(colors[0],colors[8],'08:00 belongs to the configured night zone');
 }finally{f.close();}
});
