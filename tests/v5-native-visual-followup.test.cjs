'use strict';
const {isolateLegacyAnalysis}=require('./helpers/legacy-analysis-fixture.cjs');
// Source-only follow-up to native findings; owner runs after shared consumer sync.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const email=fs.readFileSync('src/energy-email.js','utf8');
const insights=fs.readFileSync('src/energy-insights.js','utf8');
const options=fs.readFileSync('shared/ha-tools-energy-card-options.js','utf8');
function setup(){const dom=new JSDOM('',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'});dom.window.eval(fs.readFileSync('src/optimizer.js','utf8')+insights+email);return dom;}
function luminance(hex){const rgb=hex.match(/[a-f\d]{2}/gi).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb.reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const values=[luminance(a),luminance(b)].sort((a,b)=>a-b);return(values[1]+.05)/(values[0]+.05);}
function palette(dark=false){const selector=dark?':host(.bento-dark)':':host';const block=options.slice(options.indexOf(selector+'{')).split('}')[0];return Object.fromEntries([...block.matchAll(/(--[a-z-]+):(#(?:[a-f\d]{6}))/gi)].map(m=>[m[1],m[2]]));}
test('Email local specificity preserves one scroll row, fading edges, 44px tabs and the narrow picker',()=>{
 const tabs=email.match(/\.card \.tabs\{([^}]+)\}/)[1],buttons=email.match(/\.card \.tab-btn\{([^}]+)\}/)[1];
 assert.match(tabs,/flex-wrap:nowrap/);assert.match(tabs,/overflow-x:auto/);assert.match(tabs,/overflow-y:hidden/);assert.match(tabs,/mask-image:linear-gradient/);assert.match(buttons,/white-space:nowrap/);assert.match(buttons,/flex:0 0 auto/);assert.match(buttons,/min-height:44px/);
 assert.match(email,/@container energy-card \(max-width:279(?:\.99)?px\)\{\.card \.tabs\{display:none !important\}/);
 for(const id of ['overview','schedule','preview','send','config','history']) assert.match(email,new RegExp(`id="email-tab-${id}" data-tab="${id}"`));
});
test('semantic success/error/warning text meets AA on actual light and dark card/KPI tones without changing bar pigments',()=>{
 for(const dark of [false,true]){const p=palette(dark);for(const name of ['green','red','amber','neutral','purple']){const fg=p[`--energy-value-${name}`];assert.ok(fg,`${name} semantic text token`);for(const bg of dark?['#16213e',p['--energy-kpi-tone'],p['--energy-kpi-tone-alt']]:['#ffffff',p['--energy-kpi-tone'],p['--energy-kpi-tone-alt'],'#eff6f3','#fef0f0','#fff7eb'])assert.ok(ratio(fg,bg)>=4.5,`${dark?'dark':'light'} ${name} ${fg}/${bg} must meet AA`);}}
 assert.doesNotMatch(email,/class="stat-value" style="color:#10B981"/i);
 assert.match(options,/\[data-status=success\]\{color:var\(--energy-value-green\)/);
 assert.match(options,/\[data-status=error\]\{color:var\(--energy-value-red\)/);
 for(const source of [email,insights]){assert.match(source,/\.trend-up\s*\{[^}]*color:\s*var\(--energy-value-red/);assert.match(source,/\.trend-down\s*\{[^}]*color:\s*var\(--energy-value-green/);assert.match(source,/\.device-bar\s*\{[^}]*background:\s*var\(--bento-primary\)/);}
});
test('Email Largest Import uses semantic text while preserving its measured input and bar source',()=>{
 const dom=setup(),w=dom.window,c=w.document.createElement('ha-energy-email');
 try{const data=[{name:'Grid Import',month:90.60000056,lastMonth:100,cost:1}];const raw=JSON.stringify(data);c._getOverviewDataForPeriod=()=>data;c._periodStatus_day='ready';c._formatCost=()=> '1.00';c._tariffCurrency=()=> 'EUR';c._getTariffLabel=()=> 'Shared tariff';
 const root=w.document.createElement('div');root.innerHTML=c._tabOverview();const value=root.querySelector('[data-email-largest-import]');assert.ok(value);assert.equal(value.textContent,'Grid Import');assert.match(value.getAttribute('style'),/color:var\(--energy-value-green/);assert.equal(JSON.stringify(data),raw);assert.ok(root.querySelector('.device-bar'));
 }finally{w.close();}
});
function chartFixture(language='en'){
 const dom=setup(),w=dom.window,c=w.document.createElement('ha-energy-insights');isolateLegacyAnalysis(c);c._schedule=()=>{};w.document.body.append(c);c.setConfig({show_support:false});c._getTariffHostV3=()=>({bind(){},guard:{snapshot:()=>({}),dispose(){}}});c._hass={user:{id:'qa',is_admin:true},connection:{connected:true},language,locale:{language},config:{time_zone:'Europe/Warsaw',currency:'EUR'},states:{}};c._lang=language;
 const from=Date.parse('2026-10-25T00:00:00Z'),source=['sensor.private_grid','external:import<raw>'];
 const rows=[0,1].map(i=>({id:`absolute:${from+i*3600000}`,from:from+i*3600000,to:from+(i+1)*3600000,hour:2,timezone:'Europe/Warsaw',source,kwh:i?0:90.60000056,energyCost:i?-1.25:181.20000112,variableCost:0,currency:'EUR',measuredHours:1,hours:1,missing:false,recordedKwh:null,priceMissing:false}));
 c._prepareInsightChartV3=()=>{};c._renderInsightDevicesV3=()=>'';c._insightChartDataset={source,timezone:'Europe/Warsaw',currency:'EUR',window:{from,to:from+2*3600000},hours:rows,days:rows};c._insightChartState={resolution:'hour',metric:'kwh',type:'bar',view:'chart',selected:rows[0].id,page:0};
 c._activeTab='weekly';c._domBuilt=true;c._loading=false;c._error=null;c._renderTabContent=()=>c._renderInsightChartV3('weekly');c.shadowRoot.innerHTML='<div class="panel-body">'+c._renderTabContent()+'</div>';c._bindInsightContentV3();return{dom,w,c,rows,close(){c._getTariffHostV3().guard.dispose();w.close();}};
}
for(const language of ['en','pl'])test(`Insights ${language} keeps IDs/exact UTC behind closed disclosures and preserves raw values/selected identity`,()=>{
 const f=chartFixture(language);try{const root=f.c.shadowRoot,technical=[...root.querySelectorAll('[data-insights-source-details]')];assert.ok(technical.length>=2);assert.ok(technical.every(el=>!el.open));
 const clone=root.querySelector('[data-insights-analysis]').cloneNode(true);clone.querySelectorAll('[data-insights-source-details]').forEach(el=>el.remove());assert.doesNotMatch(clone.textContent,/sensor\.private_grid|external:import|2026-10-25T00:00:00\.000Z/);assert.match(clone.textContent,/90[,.]60000056/);assert.ok(clone.querySelector('[data-insights-source-count]'));
 assert.match(technical.map(el=>el.textContent).join(' '),/sensor\.private_grid/);assert.match(technical.map(el=>el.textContent).join(' '),/2026-10-25T00:00:00\.000Z/);assert.equal(f.c._insightChartState.selected,f.rows[0].id);
 const raw=JSON.stringify(f.rows);root.querySelector('[data-insights-control="data"]').click();assert.equal(JSON.stringify(f.rows),raw);assert.equal(root.querySelector('[data-insights-row]').dataset.insightsRow,f.rows[0].id);assert.equal(root.querySelector('[data-insights-row]').dataset.value,'90.60000056');assert.match(root.querySelector('[data-insights-row]').textContent,/2026-10-25T00:00:00\.000Z/);
 }finally{f.close();}
});
test('Insights source disclosure keeps manual state and summary/point focus across locale repaint without another source read',()=>{
 const f=chartFixture();try{const root=f.c.shadowRoot,details=root.querySelector('[data-insights-source-details]');details.open=true;details.querySelector('summary').focus();const key=details.dataset.insightsSourceDetails;f.c._lang='pl';f.c._updateContent();const focused=root.activeElement;assert.equal(focused.tagName,'SUMMARY');assert.equal(focused.parentElement.dataset.insightsSourceDetails,key);assert.equal(focused.parentElement.open,true);assert.match(focused.textContent,/Źródło/);
 const point=root.querySelector('[data-insights-control="point"]');point.focus();point.value=f.rows[1].id;point.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.equal(f.c._insightChartState.selected,f.rows[1].id);assert.equal(root.activeElement.dataset.insightsControl,'point');assert.equal(f.c._insightChartDataset.hours,f.rows);
 }finally{f.close();}
});

test('Insights uses the user system time for labels and retains the distinct measurement calendar in details',()=>{
 const f=chartFixture();try{
  const Native=f.w.Intl.DateTimeFormat;
  const create=args=>{
   const formatter=Reflect.construct(Native,args);
   if(!args.length){const resolved=formatter.resolvedOptions.bind(formatter);formatter.resolvedOptions=()=>({...resolved(),timeZone:'Europe/Warsaw'});}
   return formatter;
  };
  f.w.Intl.DateTimeFormat=new Proxy(Native,{apply:(_target,_this,args)=>create(args),construct:(_target,args)=>create(args)});
  f.c._hass.config.time_zone='Asia/Tokyo';f.c._hass.locale={language:'en',time_zone:'local',time_format:'24'};
  f.c._insightChartDataset.timezone='Asia/Tokyo';f.rows.forEach((row,index)=>{row.timezone='Asia/Tokyo';row.hour=9+index;});
  const raw=JSON.stringify(f.rows),selected=f.c._insightChartState.selected;f.c._updateContent();
  const root=f.c.shadowRoot,chartDetails=root.querySelector('[data-insights-source-details]');
  const zone=[...chartDetails.querySelectorAll('dt')].find(el=>el.textContent==='Measurement time zone');
  assert.equal(zone.nextElementSibling.textContent,'Asia/Tokyo');
  const day=new Native('en',{timeZone:'Europe/Warsaw',dateStyle:'medium'}),clock=new Native('en',{timeZone:'Europe/Warsaw',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const {from,to}=f.c._insightChartDataset.window;
  assert.equal(root.querySelector('[data-insights-chart-range]').textContent,`${day.format(from)} (${clock.format(from)}–${clock.format(to)})`);
  const point=new Native('en',{timeZone:'Europe/Warsaw',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'});
  assert.equal(root.querySelector('[data-insights-control="point"] option').textContent,point.format(f.rows[0].from));
  assert.equal(JSON.stringify(f.rows),raw);assert.equal(f.c._insightChartState.selected,selected);
 }finally{f.close();}
});
test('reloading the Energy bundle preserves foreign card metadata and registers each Energy card once',()=>{
 const dom=setup(),w=dom.window;try{
  const foreign={type:'foreign-card',name:'Foreign card'};w.customCards.push(foreign);
  const originalDefinitions=['ha-energy-optimizer','ha-energy-insights','ha-energy-email'].map(type=>w.customElements.get(type));
  w.eval(fs.readFileSync('src/optimizer.js','utf8')+insights+email);
  for(const [index,type] of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email'].entries()){
   assert.equal(w.customCards.filter(card=>card.type===type).length,1,type);
   assert.equal(w.customElements.get(type),originalDefinitions[index]);
  }
  assert.ok(w.customCards.includes(foreign));
 }finally{w.close();}
});
