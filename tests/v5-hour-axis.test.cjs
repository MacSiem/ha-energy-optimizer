'use strict';
// Catches ordinal/first-middle-last ticks that drift from the user's clock.
process.env.TZ='America/New_York';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');const {JSDOM}=require('jsdom');
const H=3600000,start=Date.parse('2026-10-17T21:00:00Z'); // local 17:00
function fixture(count=15){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),charts=[];
 dom.window.captureChart=cfg=>charts.push(cfg);dom.window.HTMLCanvasElement.prototype.getContext=()=>({});
 dom.window.eval(readFileSync('src/optimizer.js','utf8')+readFileSync('src/energy-insights.js','utf8')+'\nconst HA_ENERGY_CHART=class{constructor(ctx,cfg){window.captureChart(cfg)}destroy(){}};');
 const card=dom.window.document.createElement('ha-energy-optimizer');card._schedule=()=>{};
 card._hass={user:{id:'qa',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en',time_zone:'local',time_format:'12'},config:{time_zone:'Asia/Tokyo',currency:'EUR'},states:{}};
 card.setConfig({show_support:false,energy_price:2,currency:'EUR'});
 card._energyModel={ids:['sensor.qa'],zone:'Asia/Tokyo',start,todayStart:start,end:start+count*H,summary:()=>({total:15}),points:new Map(Array.from({length:count},(_,i)=>[start+i*H,{kwh:i===13?0:1}]))};
 card._todayWindow={start:new Date(start).toISOString(),end:new Date(start+count*H).toISOString(),total:14,boundaryComplete:true};card._hasRealData=true;card._loadChartJS=async()=>{};card._render();
 const rows=Array.from({length:count},(_,i)=>({id:String(start+i*H),from:new Date(start+i*H).toISOString(),to:new Date(start+(i+1)*H).toISOString(),key:'2026-10-18',hour:i,kwh:i===13?0:1,energyCost:2,variableCost:0.5}));
 return{dom,card,charts,rows,close(){card._getTariffHostV3().guard.dispose();dom.window.close();}};
}
for(const count of [15,24])for(const width of [390,1280])test(`${count} hourly SVG axes at ${width} align to three-hour display clock and keep all points`,()=>{
 const f=fixture(count);try{
  f.card._patternsDataset={hours:f.rows,days:[],currency:'EUR'};f.card._patternsState={resolution:'hour',day:'2026-10-18',metric:'kwh',type:'line',selected:f.rows[13].id};
  const insight=f.dom.window.document.createElement('ha-energy-insights');insight._hass=f.card._hass;insight._lang='en';insight._insightChartDataset={hours:f.rows,currency:'EUR'};insight._insightChartState={resolution:'hour',metric:'kwh',type:'bar',selected:f.rows[13].id};
  try{for(const [html,selector,axisY]of[[f.card._patternsChart(width),'[data-pattern-id]','220'],[insight._insightSvgV3(width),'[data-insights-point]','242']]){
   const root=f.dom.window.document.createElement('div');root.innerHTML=html;
   assert.deepEqual([...root.querySelectorAll(`text[y="${axisY}"]`)].map(n=>n.textContent),count===15?['18','21','00','03','06']:['18','21','00','03','06','09','12','15']);
   assert.equal(root.querySelectorAll('title').length,count,'tick thinning keeps every measured point including zero');
   assert.match(root.querySelectorAll('title')[13].textContent,/Oct 18.*06:00 AM GMT-4.*0 kWh/,'full user-formatted date remains on the measured zero');
  }}finally{insight._getTariffHostV3().guard.dispose();}
 }finally{f.close();}
});
test('Dashboard aligns labels to clock hours instead of every third data index',async()=>{
 const f=fixture();try{await f.card._drawDashboardChart();const cfg=f.charts.at(-1),ticks=cfg.options.scales.x.ticks;
 const context={getLabelForValue:i=>cfg.data.labels[i]};
 assert.deepEqual(Array.from(cfg.data.labels,(_,i)=>ticks.callback.call(context,i,i)).filter(Boolean),['18','21','00','03','06']);
 assert.equal(cfg.data.datasets[0].data.length,15);assert.equal(cfg.data.datasets[0].data[13],0);
 assert.match(cfg.options.plugins.tooltip.callbacks.title([{dataIndex:13}]),/Oct 18.*06:00 AM GMT-4/);
 }finally{f.close();}
});
