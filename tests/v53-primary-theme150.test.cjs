'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {createUiV3}=require('../shared/ha-tools-ui.js');
function luminance(hex){const c=hex.replace('#','').match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const values=[luminance(a),luminance(b)].sort((x,y)=>x-y);return (values[1]+.05)/(values[0]+.05);}
for(const color of ['#000000','#ffffff','#777777','#03a9f4','#ffeb3b','#1baf7a','#eda100','#6250d6','#e87ba4','#f00','rgb(119, 119, 119)'])test(`primary text remains readable for HA theme ${color}`,()=>{
 const result=createUiV3().primaryColors(color);
 assert.match(result.fill,/^#[a-f0-9]{6}$/i);assert.match(result.foreground,/^#[a-f0-9]{6}$/i);
 assert.ok(contrast(result.fill,result.foreground)>=4.5,'contrast comes from resolved foreground and fill');
});
test('a usable custom primary remains the actual custom color',()=>{const r=createUiV3().primaryColors('#ffeb3b');assert.equal(r.fill,'#ffeb3b');});
test('unsupported or absent primary uses explicit light and dark fallbacks',()=>{
 for(const color of ['',null,'var(--missing)','transparent'])for(const dark of [false,true]){
  const r=createUiV3().primaryColors(color,{dark});assert.equal(r.fill,dark?'#818cf8':'#2563eb');assert.ok(contrast(r.fill,r.foreground)>=4.5);
 }
});
test('connected card updates computed pair for theme changes without touching a foreign token',()=>{
 const d=new JSDOM('<div></div>'),host=d.window.document.querySelector('div'),ui=createUiV3();
 host.style.setProperty('--primary-color','#ffeb3b');host.style.setProperty('--hat-s1','#123456');
 ui.applyTheme(host);const fill=host.style.getPropertyValue('--hat-primary-fill-computed'),text=host.style.getPropertyValue('--hat-on-primary-computed');
 assert.equal(fill,'#ffeb3b');assert.ok(contrast(fill,text)>=4.5);
 host.style.setProperty('--primary-color','#777777');ui.applyTheme(host);
 assert.notEqual(host.style.getPropertyValue('--hat-primary-fill-computed'),fill);
 assert.ok(contrast(host.style.getPropertyValue('--hat-primary-fill-computed'),host.style.getPropertyValue('--hat-on-primary-computed'))>=4.5);
 assert.equal(host.style.getPropertyValue('--hat-s1'),'#123456');
 const before=host.getAttribute('style');ui.applyTheme(host);assert.equal(host.getAttribute('style'),before);
 d.window.close();
});
