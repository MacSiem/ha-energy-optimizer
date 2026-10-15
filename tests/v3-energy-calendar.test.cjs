// Tests first against maintained source. Owner runs through run_build_receipt.py; zero live HA/SMTP.
'use strict';
const { test } = require('node:test'); const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom'); const fs = require('node:fs'); const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/energy-email.js'), 'utf8');
const settle = async () => { for (let i=0;i<30;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r=>resolve=r); return { promise, resolve }; };
const row = extra => ({ id: 'energy-existing', kind: 'energy_report', cadence: 'weekly', weekday: 0, enabled: false,
  time: '08:30', recipients: ['old@example.invalid'], effective_timezone: 'Europe/Warsaw', next_fire: null, ...extra });
function fixture(t, options={}) {
  const dom=new JSDOM('',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true}); t.after(()=>dom.window.close());
  const w=dom.window; w.eval('const ENERGY_OPTIMIZER_DONATE_HTML=""; const bindEnergySupport=()=>{}; const energySupportDismissed=()=>true;\n' + source);
  const card=w.document.createElement('ha-energy-email'); card._firstRender=true; card._discoveryDone=true; card._lastPeriodRefresh=Date.now(); card._emailBackendChecked=true;
  card._emailBackendAvailable=true; card._emailBackendConfig={smtp_configured:true}; card._schedule=()=>{}; card._config.show_support=false;
  let rows=options.rows||[row()]; const calls=[]; const services=[]; const connection=new w.EventTarget(); connection.connected=true;
  const hass={user:{id:'a',is_admin:true},connection,config:{currency:'EUR',time_zone:'Europe/Warsaw'},states:options.states||{},language:options.lang||'en',
    callService:async (...args)=>services.push(args), callWS:async msg=>{ calls.push(msg);
      if(msg.type==='manifest/get')return {domain:'ha_tools_email',version:options.backendVersion||'2.2.0'};
      if(msg.type.endsWith('/list_schedules'))return options.list?options.list(calls.filter(c=>c.type.endsWith('/list_schedules')).length):{schedules:rows};
      if(msg.type.endsWith('/set_schedule')) {if(options.save)return options.save(msg); if(msg.action==='delete') rows=rows.filter(r=>r.id!==msg.schedule_id);
        else{const next={...(rows.find(r=>r.id===msg.schedule.id)||{}),...msg.schedule};if(next.use_ha_timezone)delete next.timezone;delete next.use_ha_timezone;rows=rows.filter(r=>r.id!==next.id).concat(next);}return {schedules:rows};}
      if(msg.type.endsWith('/preview_energy_report'))return typeof options.preview==='function'?options.preview(msg):options.preview||{...calendar(msg.cadence),effective_timezone:msg.timezone||'Europe/Warsaw'};
      if(msg.type.endsWith('/get_config'))return options.config?options.config():{smtp_configured:true,schedules:[],default_recipient:'default@example.invalid'};
      if(msg.type.endsWith('/send_now'))return options.sendAck ?? {success:true}; throw new Error('Unexpected API '+msg.type); }};
  card.hass=hass; w.document.body.append(card); const root=card.shadowRoot;
  const click=id=>{const el=root.getElementById(id);assert.ok(el,id);el.click();};
  const input=(id,value)=>{const el=root.getElementById(id);assert.ok(el,id);if(el.type==='checkbox')el.checked=value;else el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));};
  return {w,card,hass,connection,root,calls,services,click,input,open:async()=>{card.setActiveTab('schedule');await settle();}};
}
const calendar=cadence=>({cadence,effective_timezone:'Europe/Warsaw',status:'ready',total_kwh:0,total_cost:0,
  energyCost:0,variableCost:null,fixedMonthly:null,currency:'EUR',source_ids:['sensor.grid'],
  period:{start:'2026-10-05T00:00:00+02:00',end:'2026-10-12T00:00:00+02:00',cadence,semantics:'previous_completed_calendar_period'},
  devices:[{entity_id:'sensor.grid',name:'Grid',kwh:0,cost:0}]});
test('Schedule open uses readonly shared list only; explicit New is disabled and Cancel never writes',async t=>{
  const f=fixture(t,{rows:[]});await f.open();assert.deepEqual(f.calls.map(c=>c.type),['manifest/get','ha_tools_email/list_schedules']);assert.equal(f.services.length,0);
  f.click('schedule-new');assert.match(f.card._serverSchedules.model().draft.id,/^[0-9a-f-]{36}$/i);assert.equal(f.root.getElementById('schedule-enabled').checked,false);
  f.click('schedule-cancel');assert.equal(f.calls.length,2);assert.equal(f.root.getElementById('schedule-save'),null);
});
test('actual DOM edits monthly day/IANA/recipient; Save confirms only exact independent readback',async t=>{
  const f=fixture(t);await f.open();f.click('schedule-edit-0');f.input('schedule-cadence','monthly');f.input('schedule-month-day','31');f.input('schedule-timezone','America/New_York');
  f.input('schedule-recipients','new@example.invalid');f.input('schedule-time','09:15');f.root.getElementById('schedule-save').focus();f.click('schedule-save');await settle();
  const writes=f.calls.filter(c=>c.type.endsWith('/set_schedule'));assert.equal(writes.length,1);assert.equal(writes[0].schedule.kind,'energy_report');assert.equal(writes[0].schedule.month_day,31);
  assert.equal(writes[0].schedule.timezone,'America/New_York');assert.deepEqual(Array.from(writes[0].schedule.recipients),['new@example.invalid']);
  assert.equal(f.calls.filter(c=>c.type.endsWith('/list_schedules')).length,2);assert.match(f.root.querySelector('.server-schedules').textContent,/Success/);
  assert.equal(f.root.activeElement.id,'schedule-edit-0');assert.doesNotMatch(JSON.stringify(f.card._serverSchedules.model()),/example.invalid/);
});
test('recipient mismatch keeps Unconfirmed locked despite matching ACK; no repeat write',async t=>{
  const f=fixture(t,{save:msg=>({schedule:msg.schedule})});await f.open();f.click('schedule-edit-0');f.input('schedule-recipients','new@example.invalid');f.click('schedule-save');await settle();
  assert.match(f.root.textContent,/Unconfirmed/);assert.equal(f.root.getElementById('schedule-save').disabled,true);f.click('schedule-save');assert.equal(f.calls.filter(c=>c.type.endsWith('/set_schedule')).length,1);
});
test('explicit calendar Preview uses flag; zero stays zero; null remains unavailable; no send/write/history',async t=>{
  const data={...calendar('weekly'),effective_timezone:'Asia/Tokyo',unexpected:'PRIVATE',smtp_password:'SECRET',error:'RAW_ERROR',source_ids:['sensor.grid'],raw_config:{password:'SECRET'}};
  const f=fixture(t,{preview:data});await f.open();f.click('schedule-edit-0');f.input('schedule-timezone','Asia/Tokyo');f.click('schedule-preview');await settle();
  const msg=f.calls.find(c=>c.type.endsWith('/preview_energy_report'));assert.equal(msg.calendar_period,true);assert.equal(msg.timezone,'Asia/Tokyo');
  const p=f.root.querySelector('.schedule-preview');assert.match(p.textContent,/0[.,]00.*kWh/);assert.match(p.textContent,/2026-10-05/);assert.match(p.textContent,/Grid import sources/);assert.doesNotMatch(JSON.stringify(f.card._serverSchedules.model().preview),/sensor.grid/);
  assert.match(p.textContent,/Variable|zmienne/);assert.match(p.textContent,/Fixed|stała/);assert.doesNotMatch(p.textContent,/PRIVATE|SECRET|RAW_ERROR/);
  assert.equal(f.calls.some(c=>/set_schedule|send_now|history/.test(c.type)),false);assert.equal(f.services.length,0);
});
test('partial calendar response cannot become Success or fabricated zero',async t=>{
  const f=fixture(t,{preview:{...calendar('weekly'),status:'partial',total_kwh:null,total_cost:null,energyCost:null}});await f.open();f.click('schedule-edit-0');f.click('schedule-preview');await settle();
  const p=f.root.querySelector('.schedule-preview');assert.match(p.textContent,/Partial/);assert.doesNotMatch(p.textContent,/Success/);assert.match(p.textContent,/No data|Brak danych/);
});
test('background and language render preserve recipient draft and keyboard focus',async t=>{
  const f=fixture(t);await f.open();f.click('schedule-edit-0');f.input('schedule-recipients','draft@example.invalid');f.root.getElementById('schedule-recipients').focus();f.card._render();
  assert.equal(f.root.activeElement.id,'schedule-recipients');assert.equal(f.root.getElementById('schedule-recipients').value,'draft@example.invalid');
  f.card.hass={...f.hass,language:'pl'};assert.match(f.root.textContent,/Zapisz/);assert.equal(f.root.activeElement.id,'schedule-recipients');
  assert.equal(f.root.getElementById('schedule-recipients').value,'draft@example.invalid');
});
for(const boundary of ['user','role','connection-event','browser-offline','disconnect'])test('actual context boundary discards draft and stale list on '+boundary,async t=>{
  const pending=deferred();const f=fixture(t,{list:n=>n===1?{schedules:[row()]}:pending.promise});await f.open();f.click('schedule-edit-0');f.click('schedule-refresh');await settle();
  if(boundary==='user')f.card.hass={...f.hass,user:{id:'b',is_admin:true}};
  if(boundary==='role')f.card.hass={...f.hass,user:{id:'a',is_admin:false}};
  if(boundary==='connection-event')f.connection.dispatchEvent(new f.w.Event('disconnected'));
  if(boundary==='browser-offline')f.w.dispatchEvent(new f.w.Event('offline'));
  if(boundary==='disconnect')f.card.remove();
  pending.resolve({schedules:[row({id:'stale-private'})]});await settle();assert.equal(f.card._serverSchedules.model().draft,null);
  assert.doesNotMatch(f.root.textContent,/stale-private|old@example.invalid/);
});
test('late backend config/default recipient never populates another administrator',async t=>{
  const pending=deferred();const f=fixture(t,{config:()=>pending.promise});const work=f.card._loadEmailBackendConfig();await settle();
  f.card.hass={...f.hass,user:{id:'b',is_admin:true}};pending.resolve({default_recipient:'OLD_USER_PRIVATE',smtp_configured:true,schedules:[row()]});await work;
  assert.notEqual(f.card._detectedRecipient,'OLD_USER_PRIVATE');assert.doesNotMatch(f.root.textContent,/OLD_USER_PRIVATE/);
});
test('config retains three default previews with original current-range payload',async t=>{
  const f=fixture(t);await f.card._loadEmailBackendConfig();const previews=f.calls.filter(c=>c.type.endsWith('/preview_energy_report'));
  assert.equal(previews.length,3);assert.deepEqual(previews.map(c=>c.cadence),['daily','weekly','monthly']);assert.ok(previews.every(c=>!('calendar_period'in c)&&!('timezone'in c)));
});
test('known legacy IDs and local status warn about duplicate sends; Send now/Delete remain explicit controls',async t=>{
  const f=fixture(t,{states:{'automation.send_daily_energy_report':{state:'unavailable'},'automation.send_weekly_energy_report':{state:'off'}}});await f.open();
  assert.match(f.root.textContent,/automation.send_daily_energy_report/);assert.match(f.root.textContent,/Unknown|Nieznany/);assert.match(f.root.textContent,/duplicate|duplikat/i);
  assert.ok(f.root.getElementById('schedule-send-0'));assert.ok(f.root.getElementById('schedule-delete-0'));assert.ok(f.root.getElementById('btn-smtp-test'));
  assert.equal(f.calls.some(c=>/send_now|set_schedule/.test(c.type)),false);f.click('schedule-delete-0');await settle();assert.equal(f.calls.filter(c=>c.type.endsWith('/set_schedule')).length,1);
});

test('readonly Preview failure does not expose raw errors or write/send',async t=>{
  const f=fixture(t,{preview:()=>{throw {code:'transport_failure',message:'PRIVATE_SMTP_ADDRESS@example.invalid'};}});await f.open();f.click('schedule-edit-0');f.click('schedule-preview');await settle();
  assert.match(f.root.querySelector('.schedule-preview').textContent,/Not checked/);assert.doesNotMatch(f.root.textContent,/PRIVATE_SMTP_ADDRESS/);
  assert.equal(f.calls.some(c=>/send_now|set_schedule/.test(c.type)),false);
});
test('coalesced readonly Preview drops old selection after cadence edit',async t=>{
  const pending=deferred();const f=fixture(t,{preview:()=>pending.promise});await f.open();f.click('schedule-edit-0');
  f.click('schedule-preview');f.root.getElementById('schedule-preview').click();await settle();assert.equal(f.calls.filter(c=>c.type.endsWith('/preview_energy_report')).length,1);
  f.input('schedule-cadence','monthly');pending.resolve({...calendar('weekly'),total_kwh:999});await settle();assert.equal(f.card._serverSchedules.model().preview,null);assert.doesNotMatch(f.root.querySelector('.server-schedules').textContent,/999/);
});
test('schedule Send now remains an explicit original API using this row recipients',async t=>{
  const f=fixture(t);await f.open();f.click('schedule-send-0');await settle();const sends=f.calls.filter(c=>c.type.endsWith('/send_now'));
  assert.equal(sends.length,1);assert.equal(sends[0].kind,'energy_report');assert.equal(sends[0].cadence,'weekly');assert.deepEqual(Array.from(sends[0].recipients),['old@example.invalid']);
  assert.equal(f.calls.some(c=>c.type.endsWith('/set_schedule')),false);assert.equal(f.services.length,0);
});
test('calendar Preview rejects a mismatching explicit timezone rather than claiming Success',async t=>{
  const f=fixture(t,{preview:calendar('weekly')});await f.open();f.click('schedule-edit-0');f.input('schedule-timezone','Asia/Tokyo');f.click('schedule-preview');await settle();
  assert.equal(f.card._serverSchedules.model().preview,null);assert.match(f.root.querySelector('.schedule-preview').textContent,/Not checked/);
});
test('late recipient helper ACK cannot repopulate the next user UI',async t=>{
  const pending=deferred();const f=fixture(t);f.hass.states['input_text.energy_email_recipient']={state:'old@example.invalid',attributes:{max:255}};
  f.hass.callService=()=>pending.promise;const save=f.card._saveRecipient('edited@example.invalid');await settle();
  f.card.hass={...f.hass,user:{id:'b',is_admin:true}};pending.resolve();assert.equal(await save,false);assert.doesNotMatch(f.root.textContent,/edited@example.invalid/);
});

test('calendar status uses the canonical W4 Success icon and Partial preview badge',async t=>{
 const f=fixture(t,{preview:{...calendar('weekly'),status:'partial',total_kwh:null,total_cost:null}});await f.open();
 assert.match(f.root.querySelector('.server-schedules [data-result-state="success"]')?.textContent||'',/✓.*Success/);
 f.click('schedule-edit-0');f.click('schedule-preview');await settle();assert.match(f.root.querySelector('.schedule-preview [data-result-state="partial"]')?.textContent||'',/½.*Partial/);
});
test('calendar DST explanation matches the existing server gap-forward policy',async t=>{
 const f=fixture(t);await f.open();const text=f.root.querySelector('.server-schedules').textContent;
 assert.match(text,/shifted forward|moves forward/);assert.doesNotMatch(text,/nonexistent DST time is skipped/);
});
test('manual send acknowledgement says SMTP acceptance and unknown acknowledgement never claims sent',async t=>{
 const accepted=fixture(t,{sendAck:{status:'accepted_by_smtp'}});await accepted.open();accepted.click('schedule-send-0');await settle();
 assert.match(accepted.root.textContent,/Accepted by SMTP/);assert.doesNotMatch(accepted.root.textContent,/Report sent by backend/);
 const unknown=fixture(t,{sendAck:{status:'unknown'}});await unknown.open();unknown.click('schedule-send-0');await settle();
 assert.match(unknown.root.textContent,/unconfirmed/i);assert.equal(unknown.card._lastSent.weekly,undefined);
});
test('readonly SMTP configuration deadline releases pending state and ignores late private response',async t=>{
 const pending=deferred(),f=fixture(t,{config:()=>pending.promise});f.card._emailReadonlyTimeoutMs=5;
 let timer;const work=f.card._loadEmailBackendConfig();const completed=await Promise.race([work.then(()=>true),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),100);})]);clearTimeout(timer);
 pending.resolve({default_recipient:'CANARY-LATE',smtp_configured:true});await work;await settle();
 assert.equal(completed,true);assert.equal(f.card._backendConfigRead,null);assert.notEqual(f.card._detectedRecipient,'CANARY-LATE');assert.equal(f.card._emailBackendAvailable,false);
});

test('last SMTP acceptance follows its acknowledgement when backend availability changes; quick remains a request',async t=>{
 const f=fixture(t,{sendAck:{status:'accepted_by_smtp'}});await f.open();f.click('schedule-send-0');await settle();
 f.card._emailBackendAvailable=false;f.card._lastSent.quick='12:00';f.card.setActiveTab('send');
 assert.match(f.root.getElementById('last-weekly').textContent,/Last accepted by SMTP/);assert.match(f.root.getElementById('last-quick').textContent,/Last send request/);
});

for(const backendVersion of ['2.1.2','2.1.99','2.2.0b1']) test('actual Energy source blocks unsupported calendar '+backendVersion+' before mutation',async t=>{
 const f=fixture(t,{backendVersion});await f.open();assert.ok(f.root.getElementById('schedule-new').disabled);
 f.card._serverSchedules.create();await f.card._serverSchedules.save();await f.card._serverSchedules.remove('energy-existing');
 assert.equal(f.calls.some(c=>/set_schedule/.test(c.type)),false);assert.equal(f.services.length,0);
 assert.equal(f.card._serverSchedules.model().status.reason,'unavailable');assert.match(f.root.textContent,/2\.2\.0/);
});


const tariffFixtureProfile = {schema:1,name:'Fixture',currency:'CHF',timezone:'UTC',
 clock:{mode:'civil'},priceBasis:'gross',defaultZone:'a',zones:[{id:'a',energyRate:2,variableRate:0}]};
async function confirmedTariffFixture(t, nextRead) {
 const f=fixture(t);const original=f.hass.callWS;let reads=0;
 f.hass.config.currency='PLN';
 f.hass.callWS=async msg=>{
  if(msg.type!=='ha_tools_email/get_tariff')return original(msg);
  f.calls.push(msg);reads++;
  return reads===1?{profile:tariffFixtureProfile,revision:4,updated_at:null}:nextRead();
 };
 await f.card._loadSharedTariffProfile();f.card._render();
 assert.match(f.root.getElementById('price-display').textContent,/CHF Fixture/);
 return f;
}
for(const navigation of ['button','picker'])test('confirmed shared tariff is read again after '+navigation+' tab change without HA currency fallback',async t=>{
 const pending=deferred();const f=await confirmedTariffFixture(t,()=>pending.promise);
 if(navigation==='button')f.click('email-tab-schedule');
 else {const picker=f.root.getElementById('email-tab-select');picker.value='schedule';picker.dispatchEvent(new f.w.Event('change',{bubbles:true}));}
 await settle();
 const header=()=>f.root.getElementById('price-display').textContent;
 assert.doesNotMatch(header(),/PLN|not configured/);assert.match(header(),/not confirmed|Checking/i);
 assert.equal(f.card._sharedTariffProfile,null); // Context still purges the old authority.
 assert.equal(f.calls.filter(c=>c.type.endsWith('/get_tariff')).length,2);
 pending.resolve({profile:tariffFixtureProfile,revision:4,updated_at:null});await settle();
 assert.match(header(),/CHF Fixture/);assert.equal(f.card._activeTab,'schedule');
 assert.equal(f.calls.some(c=>/set_tariff|set_schedule|send_now/.test(c.type)),false);assert.equal(f.services.length,0);
});
test('failed shared tariff confirmation stays unavailable and never opens the legacy price writer',async t=>{
 const f=await confirmedTariffFixture(t,()=>{throw new Error('PRIVATE_TRANSPORT');});await f.open();
 const header=f.root.getElementById('price-display').textContent;
 assert.doesNotMatch(header,/PLN|not configured|PRIVATE_TRANSPORT/);assert.match(header,/not confirmed/i);
 f.click('price-display');assert.equal(f.root.getElementById('price-input'),null);
 assert.ok(f.root.querySelector('[data-tariff-details]').open);
 assert.equal(f.calls.filter(c=>c.type.endsWith('/get_tariff')).length,2);
 assert.equal(f.calls.some(c=>/set_tariff|set_schedule|send_now/.test(c.type)),false);assert.equal(f.services.length,0);
});
test('late tab tariff response cannot repopulate a different user or trigger a background retry',async t=>{
 const pending=deferred();const f=await confirmedTariffFixture(t,()=>pending.promise);await f.open();
 f.card.hass={...f.hass,user:{id:'b',is_admin:false}};
 pending.resolve({profile:{...tariffFixtureProfile,name:'OLD_USER_PRIVATE'},revision:4,updated_at:null});await settle();
 assert.equal(f.card._sharedTariffProfile,null);assert.doesNotMatch(f.root.textContent,/OLD_USER_PRIVATE|CHF Fixture/);
 assert.equal(f.calls.filter(c=>c.type.endsWith('/get_tariff')).length,2);
 assert.equal(f.calls.some(c=>/set_tariff|set_schedule|send_now/.test(c.type)),false);assert.equal(f.services.length,0);
});

test('shared tariff confirmed before offline/online is reconfirmed on the first later tab change',async t=>{
 const f=await confirmedTariffFixture(t,()=>({profile:tariffFixtureProfile,revision:4,updated_at:null}));
 f.w.dispatchEvent(new f.w.Event('offline'));f.w.dispatchEvent(new f.w.Event('online'));await settle();
 assert.equal(f.card._sharedTariffProfile,null);await f.open();
 assert.match(f.root.getElementById('price-display').textContent,/CHF Fixture/);
 assert.equal(f.calls.filter(c=>c.type.endsWith('/get_tariff')).length,2);assert.equal(f.services.length,0);
});
