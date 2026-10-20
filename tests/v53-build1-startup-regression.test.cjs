'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
function fixture(name='ha-energy-insights'){
 const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'}),w=dom.window;
 w.eval(readFileSync(path.join(__dirname,'../shared/ha-tools-energy-build1-host.js'),'utf8'));
 let callback,updates=0,stops=0;const state={supported:null,status:'idle',selection:{period:'day'},capabilities:null,model:null};
 const counters={renders:0,setters:0,connects:0};
 class Card extends w.HTMLElement{
  constructor(){super();this.attachShadow({mode:'open'});this._config={};}
  setConfig(c){this._config=c;this._activeTab=c.default_tab||'overview';this._render();}
  set hass(h){counters.setters++;this._hass=h;this._render();}
  _render(){counters.renders++;this.shadowRoot.innerHTML='<div data-legacy><input id="draft" value="kept"></div>';}
  connectedCallback(){counters.connects++;this._render();}
  _getTariffHostV3(){return {guard:{observe:()=>{}},markup:()=>'',bind:()=>{}};}
 }
 w.installEnergyBuild1HostV53({Card,name,format:{forHass:()=>({language:'en'})},createClient:opts=>{callback=opts.onChange;return {state:()=>state,update:()=>{updates++;},stop:()=>{stops++;},refresh:()=>{}};},createView:()=>({styles:()=>'',markup:()=>'<section data-new>new</section>'})});
 w.customElements.define('test-energy-card',Card);const card=w.document.createElement('test-energy-card');
 return {dom,w,card,state,counters,updates:()=>updates,stops:()=>stops,signal:()=>callback?.(),hass:()=>({user:{id:'user',is_active:true},connected:true,config:{time_zone:'UTC'},locale:{language:'en'},connection:{connected:true,subscribeMessage:()=>{}},callWS:()=>{}})};
}
test('a card without HA user keeps its native render and connected callback',()=>{const f=fixture();try{f.card.setConfig({});f.w.document.body.append(f.card);f.card.hass={config:{time_zone:'UTC'}};assert.ok(f.card.shadowRoot.querySelector('[data-legacy]'));assert.equal(f.counters.connects,1);assert.equal(f.counters.setters,1);assert.equal(f.updates(),0);}finally{f.dom.window.close();}});
test('pending and old capabilities retain the same legacy form and focus',()=>{const f=fixture();try{f.card.setConfig({});f.w.document.body.append(f.card);f.card.hass=f.hass();const draft=f.card.shadowRoot.querySelector('#draft');draft.focus();draft.value='unsaved';f.signal();assert.equal(f.card.shadowRoot.querySelector('#draft'),draft);f.state.supported=false;f.state.status='legacy';f.signal();assert.equal(f.card.shadowRoot.querySelector('#draft'),draft);assert.equal(f.card.shadowRoot.activeElement,draft);assert.equal(draft.value,'unsaved');assert.equal(f.card.shadowRoot.querySelector('[data-new]'),null);}finally{f.dom.window.close();}});
test('only a confirmed schema activates the new default breakdown surface',()=>{const f=fixture();try{f.card.setConfig({});f.w.document.body.append(f.card);f.card.hass=f.hass();assert.ok(f.card.shadowRoot.querySelector('[data-legacy]'));f.state.supported=true;f.state.status='ready';f.signal();assert.ok(f.card.shadowRoot.querySelector('[data-new]'));assert.equal(f.card._build1SectionV53,'breakdown');}finally{f.dom.window.close();}});
test('native weekly default and tabs are preserved before negotiation',()=>{const f=fixture();try{f.card.setConfig({default_tab:'weekly',tabs:['weekly','monthly']});assert.equal(f.card._activeTab,'weekly');assert.deepEqual(Array.from(f.card._config.tabs),['weekly','monthly']);assert.ok(f.card.shadowRoot.querySelector('[data-legacy]'));}finally{f.dom.window.close();}});
test('confirmed existing legacy analysis does not restart protocol discovery',()=>{const f=fixture();try{f.card._analysisHostV53={legacyAllowed:()=>true};f.card.setConfig({});f.w.document.body.append(f.card);f.card.hass=f.hass();assert.equal(f.updates(),0);assert.ok(f.card.shadowRoot.querySelector('[data-legacy]'));}finally{f.dom.window.close();}});

test('expanded compact keeps a Back action after confirmed new capabilities',()=>{const f=fixture();try{f.card.setConfig({variant:'compact'});f.w.document.body.append(f.card);f.card.hass=f.hass();f.card._optionsExpandedV5=true;f.card.hass=f.hass();f.state.supported=true;f.state.status='ready';f.signal();const back=f.card.shadowRoot.querySelector('[data-energy-back]');assert.ok(back);back.click();assert.equal(f.card._optionsExpandedV5,false);assert.ok(f.card.shadowRoot.querySelector('[data-legacy]'));}finally{f.dom.window.close();}});
