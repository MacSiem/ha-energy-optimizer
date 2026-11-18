'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function setup(kind){
 let now=0,id=0, jobs=new Map(),resolve;
 const sandbox={Intl,setTimeout:(fn,ms)=>{jobs.set(++id,{fn,at:now+ms});return id},clearTimeout:n=>jobs.delete(n)};
 vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(__dirname,'../shared/ha-tools-email-schedules.js'),'utf8').replace(/^export function /gm,'function ')+';this.factory=createHaToolsEmailSchedules;',sandbox);
 const wire=new Promise(r=>resolve=r), calls=[]; const hass={user:{id:'a',is_admin:true},connection:{connected:true},callWS:m=>{calls.push(m);return m.type==='manifest/get'?Promise.resolve({domain:'ha_tools_email',version:'2.4.8'}):wire;}};
 const c=sandbox.factory({kind});c.setContext(hass);
 const tick=ms=>{now+=ms;for(const [n,j] of [...jobs])if(j.at<=now){jobs.delete(n);j.fn();}};
 const response={cadence:'monthly',subject:'s',body:'b',html:'<p>ok</p>',period:{start:'2026-09-30T22:00:00Z',end:'2026-10-31T23:00:00Z',semantics:'previous_completed_calendar_period'},source:{name:kind==='energy_report'?'recorder':'system_log',complete:true},generated_at:'2026-11-18T12:00:00Z'};
 return {c,resolve,tick,response,calls};
}
test('monthly Energy waits after 8s and accepts the native period DTO',async()=>{
 const f=setup('energy_report'); const pending=f.c.previewMail({cadence:'monthly',period_mode:'calendar'});await settle();f.tick(8001);await settle();assert.equal(f.c.model().previewStatus.reason,'loading');f.resolve(f.response);await pending;assert.equal(f.c.model().previewStatus.state,'success');assert.equal(f.c.model().preview.period.from,f.response.period.start);f.c.discard();
});
for (const [kind,cadence] of [['energy_report','daily'],['log_digest','monthly']]) test(`${kind} ${cadence} retains 8s deadline`,async()=>{
 const f=setup(kind);const pending=f.c.previewMail({cadence,period_mode:'calendar'});await settle();f.tick(8000);await pending;assert.equal(f.c.model().previewStatus.reason,'read_timeout');f.resolve(f.response);await settle();assert.equal(f.c.model().preview,null);f.c.discard();
});
test('monthly Energy selection invalidation and unmount discard late reply',async()=>{
 for(const action of ['clearPreview','discard']){const f=setup('energy_report');const pending=f.c.previewMail({cadence:'monthly',period_mode:'calendar'});await settle();f.tick(8001);f.c[action]();f.resolve(f.response);await pending;assert.equal(f.c.model().preview,null);f.c.discard();}
});
test('monthly Energy deadline rejects after 120s and ignores late reply',async()=>{
 const f=setup('energy_report');const pending=f.c.previewMail({cadence:'monthly',period_mode:'calendar'});await settle();f.tick(119999);await settle();assert.equal(f.c.model().previewStatus.reason,'loading');f.tick(1);await pending;assert.equal(f.c.model().previewStatus.reason,'read_timeout');f.resolve(f.response);await settle();assert.equal(f.c.model().preview,null);f.c.discard();
});
test('Energy accepts legacy from/to and rejects conflicting native bounds',async()=>{
 for(const conflict of [false,true]){const f=setup('energy_report');const pending=f.c.previewMail({cadence:'monthly',period_mode:'calendar'});await settle();const p=f.response.period;p.from=p.start;p.to=p.end;if(conflict)p.start='2026-09-01T00:00:00Z';else {delete p.start;delete p.end;}f.resolve(f.response);await pending;assert.equal(f.c.model().previewStatus.state,conflict?'not_checked':'success');f.c.discard();}
});
