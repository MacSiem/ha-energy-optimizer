'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createTariffHostV3}=require('../shared/ha-tools-tariff-host.js');
const {createEnergyTariffV3,energyTariffProfileV3}=require('../shared/ha-tools-energy-tariff.js');
const profile={schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'day',zones:[{id:'day',energyRate:1,variableRate:0}]};
const setup=()=>{
 const card={_config:{},_hass:{config:{time_zone:'UTC',currency:'EUR'},user:{id:'fixture'},connection:{connected:true}}};
 const host=createTariffHostV3({card,kind:'optimizer',createModel:createEnergyTariffV3,legacyProfile:energyTariffProfileV3,createSettings:()=>{},createUi:()=>{},readTimeoutMs:5});
 return {card,host};
};
test('bounded shared tariff read releases its coalesced pending operation and ignores late response',async()=>{
 const {card,host}=setup();let resolve,calls=0;
 card._hass.callWS=()=>{calls++;return new Promise(r=>{resolve=r;});};
 const first=host.load(),coalesced=host.load();
 assert.deepEqual(await Promise.race([Promise.all([first,coalesced]),new Promise(r=>setTimeout(()=>r('still pending'),100))]),[false,false]);
 assert.equal(calls,1);assert.equal(card._sharedTariffReadStatus,'unconfirmed');
 resolve({profile,revision:1,updated_at:null});await Promise.resolve();await Promise.resolve();
 assert.equal(card._sharedTariffProfile??null,null);
 card._hass.callWS=async()=>({profile,revision:2,updated_at:null});
 assert.equal(await host.load(),true);assert.equal(card._sharedTariffReadStatus,'success');
 assert.equal(host.model().rateAt('2026-01-01T12:00Z').energyRate,1);
});
test('a stale connection failure cannot mark the new connection read unconfirmed',async()=>{
 const {card,host}=setup();card._hass.callWS=()=>new Promise(()=>{});
 const pending=host.load();card._hass={...card._hass,user:{id:'new'},connection:{connected:true}};host.reset(card._hass);
 card._hass.callWS=async()=>({profile,revision:1,updated_at:null});assert.equal(await host.load(),true);
 assert.equal(await Promise.race([pending,new Promise(r=>setTimeout(()=>r('still pending'),100))]),false);
 assert.equal(card._sharedTariffReadStatus,'success');
});
