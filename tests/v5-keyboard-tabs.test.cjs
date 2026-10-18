"use strict";
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const cases=[['ha-energy-optimizer',['dashboard','patterns','compare']],['ha-energy-insights',['overview','daily','tips']],['ha-energy-email',['overview','preview','config']]];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function mounted(name,tabs){
 const dom=new JSDOM('',{runScripts:'dangerously',pretendToBeVisual:true,url:'http://localhost/'}),w=dom.window,NativeDate=w.Date,now=Date.parse('2026-10-16T12:30:00Z'),requests=[];
 w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 w.eval(['optimizer.js','energy-insights.js','energy-email.js','chart-vendor.js'].map(f=>readFileSync('src/'+f,'utf8')).join('\n'));
 const card=w.document.createElement(name);card._schedule=()=>{};card.setConfig({tabs,show_support:false,show_help:false});
 const hass={user:{id:'qa',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en',time_zone:'server'},config:{time_zone:'UTC',currency:'EUR'},states:{},services:{},callWS:async request=>{
  requests.push(request.type);
  if(request.type==='ha_tools_email/get_config')return {smtp_configured:true,schedules:[]};
  if(request.type==='ha_tools_email/preview_energy_report')return {status:'no_sources',sources:[]};
  if(request.type==='ha_tools_email/get_tariff')throw {code:'unknown_command'};
  if(request.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'sensor.qa_grid'}]};
  if(request.type==='recorder/get_statistics_metadata')return {'sensor.qa_grid':{has_sum:true,unit_class:'energy',statistics_unit_of_measurement:'kWh'}};
  if(request.type==='recorder/statistics_during_period'){const start=Date.parse(request.start_time),end=Date.parse(request.end_time);return {'sensor.qa_grid':Array.from({length:(end-start)/3600000},(_,i)=>({start:start+i*3600000,change:i%4}))};}
  throw Error(request.type);
 }};
 w.document.body.append(card);card.hass=hass;for(let i=0;i<15;i++)await tick();
 const root=card.shadowRoot,button=id=>[...root.querySelectorAll('.tabs [data-tab]')].find(b=>b.dataset.tab===id);
 assert.ok(button(tabs[0]),'actual mounted renderer must expose navigation');
 const selected=()=>[...root.querySelectorAll('.tabs [data-tab][aria-selected="true"]')].filter(b=>!b.hidden);
 return {w,dom,card,root,button,selected,requests,async settle(){for(let i=0;i<4;i++)await tick();},close(){card.remove();w.close();}};
}
for(const [name,tabs] of cases){
 test(`${name}: keyboard arrows/Home/End activate only visible tabs and focus the current rendered button`,async()=>{
  const f=await mounted(name,tabs);try{
   const press=async(key,from,next)=>{const old=f.button(from);old.focus();assert.equal(f.root.activeElement,old);const event=new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});old.dispatchEvent(event);await f.settle();assert.equal(event.defaultPrevented,true,key);assert.equal(f.selected().length,1);assert.equal(f.selected()[0].dataset.tab,next,key+' activates the next visible tab');assert.equal(f.root.activeElement,f.button(next),key+' focuses a live button after redraw');assert.equal(f.button(next).tabIndex,0);assert.ok([...f.root.querySelectorAll('.tabs [data-tab]')].filter(b=>b!==f.button(next)).every(b=>b.tabIndex===-1));};
   await press('ArrowRight',tabs[0],tabs[1]);await press('End',tabs[1],tabs[2]);await press('ArrowRight',tabs[2],tabs[0]);await press('ArrowLeft',tabs[0],tabs[2]);await press('Home',tabs[2],tabs[0]);f.button(tabs[1]).disabled=true;await press('ArrowRight',tabs[0],tabs[2]);f.button(tabs[1]).disabled=false;await press('Home',tabs[2],tabs[0]);
   assert.ok(!f.requests.some(t=>/set_tariff|send|save_prefs/.test(t)),'view navigation never writes prices/preferences or sends reports');
  }finally{f.close();}
 });
 test(`${name}: redraw and repeated options application do not duplicate keyboard navigation or intercept modified/input keys`,async()=>{
  const f=await mounted(name,tabs);try{
   f.card._render();f.card._applyCardOptionsV5();f.card._applyCardOptionsV5();await f.settle();
   const first=f.button(tabs[0]);first.focus();for(const modifier of ['ctrlKey','altKey','metaKey']){const modified=new f.w.KeyboardEvent('keydown',{key:'ArrowRight',[modifier]:true,bubbles:true,cancelable:true});first.dispatchEvent(modified);assert.equal(modified.defaultPrevented,false);assert.equal(f.selected()[0].dataset.tab,tabs[0]);}
   const input=f.w.document.createElement('input');f.root.append(input);input.focus();input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(f.selected()[0].dataset.tab,tabs[0]);assert.equal(f.root.activeElement,input);
   first.focus();first.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));await f.settle();assert.equal(f.selected()[0].dataset.tab,tabs[1],'one key moves exactly one visible tab after replacement');assert.equal(f.root.activeElement,f.button(tabs[1]));
  }finally{f.close();}
 });
}
