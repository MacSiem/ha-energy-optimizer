'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),{JSDOM,VirtualConsole}=require('jsdom');
const producer=JSON.parse(fs.readFileSync('tests/fixtures/analysis-wholeperiod78-v53.json','utf8'));
const clone=v=>JSON.parse(JSON.stringify(v));
const drain=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,1));};
function setup(name,legacy,own=false){
 const errors=[],calls=[],vc=new VirtualConsole();
 vc.on('jsdomError',e=>{if(e.type!=='css parsing'&&!e.message.includes('CSS stylesheet'))errors.push(e.message);});
 const dom=new JSDOM('<body></body>',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window;
 w.ResizeObserver=class{observe(){}disconnect(){}};w.fetch=()=>{throw Error('network forbidden');};w.HTMLCanvasElement.prototype.getContext=()=>({});
 w.eval(['optimizer','energy-insights','energy-email'].map(f=>fs.readFileSync(`src/${f}.js`,'utf8')).join('\n')+'\nconst HA_ENERGY_CHART=class{destroy(){}update(){}};');
 const card=w.document.createElement(name),override={...clone(producer.rates[0].profile),currency:'PLN'};
 card.setConfig({variant:'tile',...(own?{tariff_profile:override}:{})});
 const connection=new w.EventTarget();connection.connected=true;
 const hass={user:{id:'reader',is_active:true,is_admin:false},connection,connected:true,config:{time_zone:'Europe/Warsaw',currency:'EUR'},language:'en',locale:{language:'en',time_zone:'server',time_format:'24'},states:{},services:{},callService(){throw Error('write forbidden');},
  async callWS(q){calls.push(clone(q));
   if(q.type==='ha_tools_email/get_tariff')return {profile:clone(legacy),revision:4,updated_at:null};
   if(q.type==='ha_tools_email/energy_snapshot'){
    const explicit=Object.hasOwn(q,'profile'),valid=own||!explicit;
    return {schema:1,generated_at:new Date().toISOString(),profile_source:explicit?'override':'shared',tariff_revision:explicit?null:4,status:valid?'ready':'unavailable',currency:valid?(own?'PLN':'EUR'):null,
     current:{available:valid,zone_class:valid?(own?'cheap':'expensive'):null,cheap:valid?own:null,energy_rate:valid?1:null,variable_rate:valid?.1:null,usage_rate:valid?1.1:null},
     today:{usage_cost:valid?80:null,energy_cost:valid?70:null,variable_cost:valid?10:null},next_cheap:{status:valid?'known':'unknown',start:valid?'2026-10-20T18:00:00Z':null}};
   }
   throw Error('Unexpected read '+q.type);
  }};
 return {card,calls,errors,async mount(){w.document.body.append(card);card.hass=hass;await drain();},close(){card.remove();card._tariffConsumerUnsubscribeV3?.();card._tariffHostController?.guard.dispose();w.close();}};
}
for(const name of ['ha-energy-optimizer','ha-energy-insights']){
 for(const [label,legacy] of [['null',null],['invalid',{schema:0}],['different currency',{...clone(producer.rates[0].profile),currency:'PLN'}]])test(`${name}: book-owned tile ignores ${label} legacy profile without overriding the shared snapshot`,async()=>{
  const f=setup(name,legacy);try{
   await f.mount();const requests=f.calls.filter(q=>q.type==='ha_tools_email/energy_snapshot');
   assert.equal(requests.length,1,'one bounded shared snapshot');assert.equal(Object.hasOwn(requests[0],'profile'),false,'book authority must not become an explicit legacy override');
   assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Expensive/,'current canonical book state reaches the actual mounted tile');
   assert.deepEqual(f.errors,[]);
  }finally{f.close();}
 });
 test(`${name}: explicit card profile keeps its independent legacy override`,async()=>{
  const f=setup(name,null,true);try{await f.mount();const q=f.calls.find(q=>q.type==='ha_tools_email/energy_snapshot');assert.equal(q.profile.currency,'PLN');assert.match(f.card.shadowRoot.querySelector('[data-energy-primary]').textContent,/Cheap/);assert.deepEqual(f.errors,[]);}finally{f.close();}
 });
}
