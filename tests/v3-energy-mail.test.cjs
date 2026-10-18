// Owner runs RED before integration, GREEN after syncing shared and rebuilding the bundle.
// Synthetic WS only. jsdom checks DOM isolation; real browser QA is still required for CSP enforcement.
'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const tick = async () => {for(let i=0;i<50;i++) await Promise.resolve();};
const deferred = () => {let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const mail = (cadence='daily',mode='rolling',extra={}) => ({cadence,subject:'Server subject <script>TOP_SCRIPT</script> & "',
 body:'Backend plain text',html:'<h1 id="backend-html">BACKEND-123</h1><script>window.PWNED=true</script><img src="https://example.invalid/x" onerror="window.PWNED=true"><form action="https://example.invalid"><button>submit</button></form>',
 period:{from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z',semantics:mode==='calendar'?'previous_completed_calendar_period':'rolling_completed_hours'},
 source:{name:'recorder',complete:true,status:'ready'},generated_at:'2026-10-02T01:00:00Z',effective_timezone:'Europe/Warsaw',...extra});
const schedule={id:'energy-mail-fixture',kind:'energy_report',cadence:'weekly',weekday:0,time:'08:30',enabled:false,
 timezone:'Asia/Tokyo',effective_timezone:'Asia/Tokyo',recipients:['row@example.invalid']};
function fixture(t,file,options={}) {
 const dom=new JSDOM('',{url:'http://localhost/',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());const w=dom.window;
 if(options.shortTimeout){const original=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>original(fn,ms===8000?5:ms,...args);}
 const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
 w.eval((file.startsWith('src/')?'const ENERGY_OPTIMIZER_DONATE_HTML="";const bindEnergySupport=()=>{};const energySupportDismissed=()=>true;\n':'')+source);
 const card=w.document.createElement('ha-energy-email');card._firstRender=true;card._discoveryDone=false;card._lastPeriodRefresh=Date.now();card._emailBackendChecked=true;
 card._emailBackendAvailable=true;card._emailBackendConfig={smtp_configured:options.smtp!==false};card._schedule=()=>{};card._config.show_support=false;
 const calls=[],services=[],connection=new w.EventTarget();connection.connected=true;
 // An old backend rejects the dedicated modern report subscription structurally.
 // Exercise the real admin fallback before testing its retained legacy mail UI.
 connection.subscribeMessage=async()=>{throw {code:'unknown_command'};};
 const hass={user:{id:'mail-admin',is_admin:true},connection,config:{time_zone:'Europe/Warsaw',currency:'EUR'},states:{},language:'en',services:{ha_tools_email:{test:{},send:{}}},
 callService:async(...args)=>services.push(args),callWS:async message=>{calls.push(message);
  if(message.type==='manifest/get'){if(options.manifestError)throw {code:options.manifestError};return options.manifest||{domain:'ha_tools_email',version:options.version||'2.3.0'};}
  if(message.type==='ha_tools_email/preview_energy_report')return options.preview?options.preview(message):mail(message.cadence,message.period_mode);
  if(message.type==='ha_tools_email/send_now')return options.send?options.send(message):{ok:true,status:'accepted_by_smtp',attempt_id:'synthetic-attempt'};
  if(message.type==='ha_tools_email/list_schedules')return {schedules:[schedule]};
  if(message.type==='ha_tools_email/get_config')return {smtp_configured:options.smtp!==false,schedules:[],default_recipient:'default@example.invalid'};
  throw new Error('Unexpected readonly/write '+message.type);
 }};
 card.hass=hass;w.document.body.append(card);card._config.recipient='manual@example.invalid';
 const root=card.shadowRoot;
 return {w,card,hass,root,calls,services,connection,
  click:id=>{const el=root.getElementById(id);assert.ok(el,id);el.click();},
  change:(id,value)=>{const el=root.getElementById(id);assert.ok(el,id);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));},
  open:async tab=>{card.setActiveTab(tab);await tick();},sends:()=>calls.filter(c=>c.type==='ha_tools_email/send_now'),previews:()=>calls.filter(c=>c.type==='ha_tools_email/preview_energy_report')};
}
for(const file of ['src/energy-email.js','ha-energy-optimizer.js']) {
 for(const cadence of ['daily','weekly','monthly']) for(const mode of ['rolling','calendar']) test(`${file}: manual ${cadence}/${mode} preview and send share backend selection`,async t=>{
  const f=fixture(t,file);await f.open('preview');f.change('mail-cadence',cadence);f.change('mail-period-mode',mode);f.click('mail-preview');await tick();
  assert.equal(f.previews().length,1);assert.equal(f.previews()[0].format,'mail');assert.equal(f.previews()[0].period_mode,mode);assert.equal(f.previews()[0].cadence,cadence);
  assert.equal(f.sends().length,0);assert.equal(f.services.length,0);assert.equal(f.calls.some(c=>/set_schedule|history/.test(c.type)),false);
  const frame=f.root.getElementById('manual-mail-frame');assert.ok(frame);assert.equal(frame.getAttribute('sandbox'),'');assert.equal(frame.referrerPolicy||frame.getAttribute('referrerpolicy'),'no-referrer');
  assert.match(frame.srcdoc,/default-src 'none'/);assert.match(frame.srcdoc,/BACKEND-123/);assert.equal(f.root.querySelector('#backend-html'),null);assert.equal(f.root.querySelector('script'),null);assert.equal(f.w.PWNED,undefined);
  assert.match(f.root.querySelector('.schedule-preview h4').textContent,/<script>/);
  await f.open('send');assert.equal(f.root.getElementById('mail-period-mode').value,mode);f.click('send-'+cadence);await tick();
  assert.equal(f.sends().length,1);assert.equal(f.sends()[0].period_mode,mode);assert.equal(f.sends()[0].cadence,cadence);
  assert.match(f.root.textContent,/Accepted by SMTP; delivery unconfirmed/);assert.equal(f.services.length,0);
 });
 test(`${file}: mail preview needs neither discovery nor SMTP`,async t=>{
  const f=fixture(t,file,{smtp:false});await f.open('preview');f.click('mail-preview');await tick();
  assert.ok(f.root.getElementById('manual-mail-frame'));assert.equal(f.services.length,0);assert.equal(f.sends().length,0);
 });
 for(const status of ['no_data','partial'])test(`${file}: ${status} remains an honest server status without fabricated costs`,async t=>{
  const f=fixture(t,file,{preview:m=>mail(m.cadence,m.period_mode,{source:{name:'recorder',complete:false,status},html:'<p>No cost available</p>'})});
  await f.open('preview');f.click('mail-preview');await tick();const model=f.card._mailPreview.model();assert.equal(model.previewStatus.state,status);
  assert.doesNotMatch(f.root.textContent,/0[.,]00|Success/);assert.match(f.root.getElementById('manual-mail-frame').srcdoc,/No cost available/);
 });
 for(const invalid of [ {cadence:'monthly'},{source:{name:'wrong',complete:true}},{source:{name:'recorder'}},
  {period:{from:'2026-10-02T00:00:00Z',to:'2026-10-01T00:00:00Z',semantics:'rolling_completed_hours'}},
  {period:{from:'2026-10-01T00:00:00Z',to:'2026-10-02T00:00:00Z',semantics:'previous_completed_calendar_period'}}])test(`${file}: malformed mail ${JSON.stringify(invalid)} is rejected`,async t=>{
  const f=fixture(t,file,{preview:m=>mail(m.cadence,m.period_mode,invalid)});await f.open('preview');f.click('mail-preview');await tick();assert.equal(f.root.getElementById('manual-mail-frame'),null);assert.equal(f.card._mailPreview.model().preview,null);
 });
 test(`${file}: selection invalidation drops late response and ordinary hass update preserves iframe`,async t=>{
  const pending=deferred();let reads=0;const f=fixture(t,file,{preview:m=>++reads===1?pending.promise:mail(m.cadence,m.period_mode)});
  await f.open('preview');f.click('mail-preview');await tick();f.change('mail-cadence','monthly');pending.resolve(mail());await tick();assert.equal(f.root.getElementById('manual-mail-frame'),null);
  f.click('mail-preview');await tick();const frame=f.root.getElementById('manual-mail-frame');assert.ok(frame);
  f.card.hass={...f.hass,states:{'sensor.changed':{state:'1'}}};f.card._updateLiveData();assert.equal(f.root.getElementById('manual-mail-frame'),frame);assert.equal(f.root.getElementById('mail-cadence').value,'monthly');
 });
 for(const boundary of ['role','user','connection','offline','removal'])test(`${file}: ${boundary} discards pending preview`,async t=>{
  const pending=deferred(),f=fixture(t,file,{preview:()=>pending.promise});await f.open('preview');f.click('mail-preview');await tick();
  if(boundary==='role')f.card.hass={...f.hass,user:{id:'mail-admin',is_admin:false}};
  if(boundary==='user')f.card.hass={...f.hass,user:{id:'next-admin',is_admin:true}};
  if(boundary==='connection')f.card.hass={...f.hass,connection:new f.w.EventTarget()};
  if(boundary==='offline')f.w.dispatchEvent(new f.w.Event('offline'));
  if(boundary==='removal')f.card.remove();
  pending.resolve(mail('daily','rolling',{subject:'OLD_PRIVATE_MAIL'}));await tick();assert.equal(f.card._mailPreview.model().preview,null);assert.doesNotMatch(f.root.textContent,/OLD_PRIVATE_MAIL/);
 });
 test(`${file}: readonly preview deadline releases and ignores late HTML`,async t=>{
  const pending=deferred(),f=fixture(t,file,{shortTimeout:true,preview:()=>pending.promise});await f.open('preview');f.click('mail-preview');await tick();await new Promise(r=>setTimeout(r,30));
  assert.equal(f.card._mailPreview.model().previewing,false);pending.resolve(mail());await tick();assert.equal(f.card._mailPreview.model().preview,null);
 });
 for(const boundary of ['role','user','connection','offline','removal'])test(`${file}: raw send lock survives ${boundary} until exact promise settles`,async t=>{
  const pending=deferred(),f=fixture(t,file,{send:()=>pending.promise});await f.open('send');f.click('send-daily');await tick();assert.equal(f.sends().length,1);
  if(boundary==='role')f.card.hass={...f.hass,user:{id:'mail-admin',is_admin:false}};
  if(boundary==='user')f.card.hass={...f.hass,user:{id:'next-admin',is_admin:true}};
  if(boundary==='connection')f.connection.dispatchEvent(new f.w.Event('disconnected'));
  if(boundary==='offline')f.w.dispatchEvent(new f.w.Event('offline'));
  if(boundary==='removal')f.card.remove();
  assert.ok(f.card._emailSendRequest);assert.equal(f.card._sending,true);await f.card._sendReport('daily');await f.card._testSmtp();assert.equal(f.sends().length,1);assert.equal(f.services.length,0);
  pending.resolve({ok:true,status:'accepted_by_smtp',attempt_id:'late'});await tick();assert.equal(f.card._emailSendRequest,null);assert.equal(f.card._sending,false);assert.equal(f.card._lastSent.daily,undefined);
 });
 for(const version of ['2.2.0','2.3.0b1','2.3.0-rc.1','2.03.0','2.3.0\n','unknown'])test(`${file}: explicit calendar on ${version} never falls back to rolling or legacy`,async t=>{
  const f=fixture(t,file,{version});await f.open('send');f.change('mail-period-mode','calendar');f.click('send-weekly');await tick();assert.equal(f.sends().length,0);assert.equal(f.services.length,0);assert.match(f.root.textContent,/stable 2.3.0/);
 });
 for(const options of [{manifest:{domain:'wrong',version:'2.3.0'}},{manifestError:'unknown_command'}])test(`${file}: invalid manifest blocks new calendar contract ${JSON.stringify(options)}`,async t=>{
  const f=fixture(t,file,options);await f.open('send');f.change('mail-period-mode','calendar');f.click('send-daily');await tick();assert.equal(f.sends().length,0);assert.equal(f.services.length,0);
 });
 for(const ack of [{success:true},{status:'accepted_by_smtp'},{ok:true,status:'accepted_by_smtp',attempt_id:''},{ok:false,status:'accepted_by_smtp',attempt_id:'x'}])test(`${file}: modern acknowledgement must match exact accepted contract ${JSON.stringify(ack)}`,async t=>{
  const f=fixture(t,file,{send:()=>ack});await f.open('send');f.click('send-daily');await tick();assert.equal(f.card._lastSent.daily,undefined);assert.match(f.root.textContent,/unconfirmed/i);assert.doesNotMatch(f.root.textContent,/Accepted by SMTP; delivery/);
 });
 test(`${file}: old rolling payload and acknowledgement stay compatible`,async t=>{
  const f=fixture(t,file,{version:'2.2.0',send:()=>({success:true})});await f.open('send');f.click('send-daily');await tick();assert.equal(f.sends().length,1);assert.equal('period_mode' in f.sends()[0],false);assert.ok(f.card._lastSent.daily);
 });
 test(`${file}: schedule HTML and separate rolling/calendar sends preserve row recipients and timezone`,async t=>{
  const f=fixture(t,file);await f.open('schedule');await tick();f.click('schedule-edit-0');f.click('schedule-preview');await tick();
  assert.equal(f.previews()[0].format,'mail');assert.equal(f.previews()[0].period_mode,'calendar');assert.ok(f.root.getElementById('schedule-mail-frame'));
  assert.match(f.root.getElementById('schedule-send-0').textContent,/Last 7 days/);f.click('schedule-send-0');await tick();
  f.click('schedule-send-calendar-0');await tick();assert.equal(f.sends().length,2);assert.equal(f.sends()[0].period_mode,'rolling');assert.equal(f.sends()[1].period_mode,'calendar');assert.equal(f.sends()[1].timezone,'Asia/Tokyo');
  assert.deepEqual(Array.from(f.sends()[1].recipients),['row@example.invalid']);assert.equal(f.sends()[1].cadence,'weekly');assert.equal(f.calls.some(c=>/set_schedule/.test(c.type)),false);
 });
}
for(const file of ['src/energy-email.js','ha-energy-optimizer.js']) {
 test(`${file}: context lost during readonly manifest check prevents any raw dispatch`,async t=>{
  const pending=deferred(),f=fixture(t,file);const original=f.hass.callWS;
  f.hass.callWS=message=>message.type==='manifest/get'?pending.promise:original(message);
  await f.open('send');const work=f.card._sendReport('daily');await tick();assert.ok(f.card._emailSendRequest);
  f.card.hass={...f.hass,user:{id:'different',is_admin:true}};pending.resolve({domain:'ha_tools_email',version:'2.3.0'});await work;
  assert.equal(f.sends().length,0);assert.equal(f.services.length,0);assert.equal(f.card._emailSendRequest,null);
 });
 test(`${file}: calendar manifest timeout is readonly and never dispatches after late resolution`,async t=>{
  const pending=deferred(),f=fixture(t,file);const original=f.hass.callWS;
  f.hass.callWS=message=>message.type==='manifest/get'?pending.promise:original(message);f.card._emailReadonlyTimeoutMs=5;
  await f.open('send');f.change('mail-period-mode','calendar');await f.card._sendReport('daily');
  assert.equal(f.card._emailSendRequest,null);assert.equal(f.sends().length,0);pending.resolve({domain:'ha_tools_email',version:'2.3.0'});await tick();assert.equal(f.sends().length,0);
 });
 test(`${file}: household preview is gated, Overview stays readable`,async t=>{
  const f=fixture(t,file);f.card.hass={...f.hass,user:{id:'household',is_admin:false}};await f.open('preview');assert.equal(f.root.getElementById('mail-preview'),null);
  await f.open('overview');assert.doesNotMatch(f.root.textContent,/Only administrators/);assert.equal(f.previews().length,0);
 });
}


// MA-5: actual source/bundle DOM fixtures; run tests.patch first for actual RED.
const presentationMail = message => mail(message.cadence, message.period_mode, {
 html: '<!doctype html><html><head><meta name="ha-tools-mail-presentation" content="1"><style>html[data-mail-preview-theme="dark"]{background:#111;color:#fff}</style></head><body><h1>BACKEND-123</h1></body></html>'
});
const openPresentation = async (f, flow) => {
 await f.open(flow === 'manual' ? 'preview' : 'schedule');await tick();
 if(flow === 'schedule') f.click('schedule-edit-0');
 f.click(flow === 'manual' ? 'mail-preview' : 'schedule-preview');await tick();
 return f.root.getElementById(flow + '-mail-frame');
};
for(const file of ['src/energy-email.js','ha-energy-optimizer.js']) {
 for(const flow of ['manual','schedule']) test(`${file}: ${flow} local four-mode presentation preserves DOM, payload and transport`,async t=>{
  const f=fixture(t,file,{preview:presentationMail}),frame=await openPresentation(f,flow);
  const controls=frame.closest('[data-mail-presentation]');assert.ok(controls,'presentation controls');
  const controller=flow==='manual'?f.card._mailPreview:f.card._serverSchedules;
  const before=JSON.stringify(controller.model()),cached=controller.model().preview.html,calls=JSON.stringify(f.calls),services=JSON.stringify(f.services);
  const status=f.root.querySelector('.schedule-preview').textContent;
  assert.equal(controls.querySelectorAll('[role="group"]').length,2);
  for(const [device,width] of [['phone',390],['desktop',680]]) for(const theme of ['light','dark']) {
   for(const [group,value] of [['device',device],['theme',theme]]) {
    const button=controls.querySelector(`[data-mail-preview-${group}="${value}"]`);assert.ok(button);button.focus();button.click();
    assert.equal(f.root.activeElement,button);assert.equal(controls.querySelector(`[data-mail-preview-${group}="${value}"]`),button,'focused node survives');
    assert.equal(button.getAttribute('aria-pressed'),'true');assert.ok(parseInt(button.style.minHeight)>=44);
   }
   assert.equal(f.root.getElementById(flow+'-mail-frame'),frame);assert.equal(frame.style.width,width+'px');
   assert.ok(frame.srcdoc.startsWith(`<html data-mail-preview-theme="${theme}"><meta http-equiv="Content-Security-Policy"`));
   assert.ok(frame.srcdoc.endsWith(cached),'original HTML remains byte-for-byte suffix');
   for(const directive of ["default-src 'none'","script-src 'none'","connect-src 'none'","form-action 'none'","base-uri 'none'","img-src data:"]) assert.ok(frame.srcdoc.includes(directive));
   assert.equal(frame.getAttribute('sandbox'),'');assert.equal(frame.getAttribute('referrerpolicy'),'no-referrer');
   assert.equal(controls.querySelectorAll('[data-mail-preview-theme][aria-pressed="true"]').length,1);
   assert.equal(controls.querySelectorAll('[data-mail-preview-device][aria-pressed="true"]').length,1);
   assert.equal(JSON.stringify(controller.model()),before);assert.equal(JSON.stringify(f.calls),calls);assert.equal(JSON.stringify(f.services),services);
   assert.equal(f.root.querySelector('.schedule-preview').textContent,status);
  }
  const scroll=frame.parentElement;assert.ok(scroll.hasAttribute('data-mail-preview-scroll'));assert.equal(scroll.style.overflowX,'auto');assert.equal(scroll.style.maxWidth,'100%');assert.equal(frame.style.maxWidth,'none');
  assert.equal(f.sends().length,0);assert.equal(f.services.length,0);
  f.card.hass={...f.hass};assert.equal(f.root.getElementById(flow+'-mail-frame'),frame,'ordinary hass refresh retains cached preview');
 });
 for(const flow of ['manual','schedule']) test(`${file}: ${flow} legacy HTML keeps safe width preview and disables dark`,async t=>{
  const f=fixture(t,file),frame=await openPresentation(f,flow),controls=frame.closest('[data-mail-presentation]');assert.ok(controls);
  const dark=controls.querySelector('[data-mail-preview-theme="dark"]'),light=controls.querySelector('[data-mail-preview-theme="light"]');
  assert.equal(dark.disabled,true);assert.equal(light.getAttribute('aria-pressed'),'true');assert.match(controls.textContent,/requires HA Tools Email 2\.4\+/);
  const before=JSON.stringify(f.calls);dark.click();controls.querySelector('[data-mail-preview-device="desktop"]').click();
  assert.equal(frame.style.width,'680px');assert.match(frame.srcdoc,/^<html data-mail-preview-theme="light">/);assert.equal(dark.getAttribute('aria-pressed'),'false');assert.equal(JSON.stringify(f.calls),before);
  assert.match(frame.srcdoc,/BACKEND-123/);assert.equal(frame.getAttribute('sandbox'),'');assert.equal(f.w.PWNED,undefined);
 });
 test(`${file}: presentation state is ephemeral per user, instance and preview flow`,async t=>{
  const f=fixture(t,file,{preview:presentationMail}),g=fixture(t,file,{preview:presentationMail});
  const frame=await openPresentation(f,'manual'),controls=frame.closest('[data-mail-presentation]');assert.ok(controls);
  controls.querySelector('[data-mail-preview-device="desktop"]').click();controls.querySelector('[data-mail-preview-theme="dark"]').click();
  const other=await openPresentation(g,'manual');assert.equal(other.style.width,'390px');assert.match(other.srcdoc,/^<html data-mail-preview-theme="light">/);
  const scheduled=await openPresentation(f,'schedule');assert.equal(scheduled.style.width,'390px');assert.match(scheduled.srcdoc,/^<html data-mail-preview-theme="light">/);
  // The report host discards old report content on unmount; presentation choices remain local.
  await f.open('preview');if(file.startsWith('src/')){assert.equal(f.root.getElementById('manual-mail-frame'),null);f.click('mail-preview');await tick();}
  assert.equal(f.root.getElementById('manual-mail-frame').style.width,'680px');assert.match(f.root.getElementById('manual-mail-frame').srcdoc,/^<html data-mail-preview-theme="dark">/);
  f.card.hass={...f.hass,user:{id:'another-admin',is_admin:true}};
  const fresh=await openPresentation(f,'manual');assert.equal(fresh.style.width,'390px');assert.match(fresh.srcdoc,/^<html data-mail-preview-theme="light">/);
 });
 test(`${file}: Polish presentation labels use the existing card language`,async t=>{
  const f=fixture(t,file,{preview:presentationMail});f.card._lang='pl';const frame=await openPresentation(f,'manual'),controls=frame.closest('[data-mail-presentation]');assert.ok(controls);
  for(const label of ['Telefon','Komputer','Jasny','Ciemny']) assert.ok(controls.textContent.includes(label));
 });
}
