// Pure regression through all three consumers and their actual shared sources.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const root = join(__dirname, '..');
const { JSDOM } = require('jsdom');
const code = ['src/optimizer.js','src/energy-insights.js','src/energy-email.js','src/chart-vendor.js'].map(p=>readFileSync(join(root,p),'utf8')).join('');
const H=3600000, now=Date.parse('2026-10-13T12:00:00Z');
for (const type of ['ha-energy-optimizer','ha-energy-insights','ha-energy-email']) {
  for (const [unit, factor] of [['constructor',null],['toString',null],['__proto__',null],['hasOwnProperty',null],['W',null],['Wh',0.001],['kWh',1],['MWh',1000]]) {
    test(`${type}: ${unit} ${factor===null?'is unsupported':'retains correct conversion'}`,async t=>{
      const dom=new JSDOM('',{runScripts:'dangerously',url:'http://localhost/'});
      const NativeDate=dom.window.Date;
      dom.window.Date=class extends NativeDate { constructor(...args){super(...(args.length?args:[now]));} static now(){return now;} };
      dom.window.eval(code);
      const card=dom.window.document.createElement(type); card._schedule=()=>{};
      const profile={schema:1,currency:'EUR',timezone:'UTC',clock:{mode:'civil'},priceBasis:'gross',defaultZone:'a',zones:[{id:'a',energyRate:1,variableRate:0}]};
      card.setConfig({tariff_profile:profile,show_support:false});
      const calls=[];
      card._hass={user:{id:'pure-fixture',is_admin:true},connection:{connected:true},language:'en',locale:{language:'en'},config:{currency:'EUR',time_zone:'UTC'},states:{},callWS:async req=>{
        calls.push(req.type);
        if(req.type==='energy/get_prefs')return {energy_sources:[{type:'grid',stat_energy_from:'fixture:grid'}]};
        if(req.type==='recorder/get_statistics_metadata')return {'fixture:grid':{statistic_id:'fixture:grid',has_sum:true,unit_class:null,statistics_unit_of_measurement:unit,name:'Synthetic source'}};
        if(req.type==='recorder/statistics_during_period')return {'fixture:grid':Array.from({length:(Date.parse(req.end_time)-Date.parse(req.start_time))/H},(_,i)=>({start:Date.parse(req.start_time)+i*H,change:1}))};
        throw Error(`Unexpected mock request: ${req.type}`);
      }};
      try {
        if(type==='ha-energy-optimizer')await card._fetchEnergyStats();
        else if(type==='ha-energy-insights')await card._fetchData();
        else await card._fetchRecorderStats('day');
        const value=type==='ha-energy-email'?card._periodCache_day?.[0]?.month:type==='ha-energy-insights'?card._data?.todayKwh:card._todayWindow?.total;
        t.diagnostic(JSON.stringify({type,unit,state:type==='ha-energy-email'?card._periodStatus_day:type==='ha-energy-insights'?(card._error||'accepted'):(card._energyError?.message||'accepted'),value:String(value),calls}));
        if(factor===null) {
          if(type==='ha-energy-email'){assert.equal(card._periodStatus_day,'unsupported');assert.equal(card._periodCache_day.length,0);assert.equal(card._periodCoverage_day.sources[0].status,'unsupported');}
          else if(type==='ha-energy-insights')assert.match(card._error||'',/Unsupported Energy Dashboard statistic metadata/);
          else {assert.equal(card._hasRealData,false);assert.match(card._energyError?.message||'',/Unsupported Energy Dashboard statistic metadata/);}
        } else { const expected=(type==='ha-energy-email'?24:12)*factor; assert.ok(Number.isFinite(value) && Math.abs(value-expected)<1e-9, `${value} must equal ${expected} kWh within floating-point tolerance`); }
      } finally {card._tariffConsumerUnsubscribeV3?.();card._getTariffHostV3().guard.dispose();dom.window.close();}
    });
  }
}
