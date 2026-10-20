'use strict';
// Presentation-only regression cases; owner runs these through the FIFO lane.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {createEnergyBuild1ViewV53}=require('../shared/ha-tools-energy-build1-view.js');
const {createFormatUi}=require('../shared/ha-tools-format.js');
const golden=JSON.parse(readFileSync(join(__dirname,'fixtures/build1/golden-energy-2026-10-17.json'),'utf8'));
const fixture=()=>structuredClone(golden.model||golden);
const view=language=>createEnergyBuild1ViewV53({format:createFormatUi(language,'Europe/Warsaw'),language});
const labels=[
 ['previous_day','Previous day','Poprzedni dzień'],
 ['same_weekday_last_week','Same weekday last week','Ten sam dzień tydzień temu'],
 ['avg_7d','7-day average','Średnia 7 dni'],
 ['previous_week','Previous week','Poprzedni tydzień'],
 ['previous_month','Previous month','Poprzedni miesiąc'],
 ['same_week_last_year','Same week last year','Ten sam tydzień rok temu'],
 ['same_month_last_year','Same month last year','Ten sam miesiąc rok temu'],
 ['previous','Previous period','Poprzedni okres'],
];

for(const language of ['en','pl']){
 test(`backend semantic comparison keys become descriptive labels (${language})`,()=>{
  for(const [key,en,pl] of labels){
   for(const label of [key,undefined,'',` ${key} `]){
    const m=fixture();m.comparisons=[{...m.comparisons[0],key,label}];
    const before=JSON.stringify(m),html=view(language).markup(m);
    assert.ok(html.includes(language==='pl'?pl:en),`${key}/${label}`);
    assert.ok(!html.includes(`>${key}<`),key);
    assert.equal(JSON.stringify(m),before);
   }
  }
 });
 test(`explicit comparison labels stay literal and escaped (${language})`,()=>{
  for(const label of ['piątek, 16 paź','My previous_day meter review','<img src=x onerror="bad()"> & earlier']){
   const m=fixture();m.comparisons=[{...m.comparisons[0],key:'previous_day',label}];
   const html=view(language).markup(m);
   if(label.startsWith('<')){
    assert.ok(html.includes('&lt;img src=x onerror=&quot;bad()&quot;&gt; &amp; earlier'));
    assert.ok(!html.includes('<img src=x'));
   }else assert.ok(html.includes(label));
   assert.ok(!html.includes('<span>Previous day<small>'));
   assert.ok(!html.includes('<span>Poprzedni dzień<small>'));
  }
 });
 test(`synthetic unmeasured names localize by identity in all breakdown groups (${language})`,()=>{
  const expected=language==='pl'?'Niezmierzone':'Unmeasured';
  for(const identity of [{id:'_unmeasured'},{area_id:'_unmeasured'},{color:'unmeasured'}]){
   const m=fixture(),synthetic={name:'Synthetic stale locale',kwh:5.47,share:.29,cost:4.98,...identity};
   m.ranking=[synthetic];m.rooms=[synthetic];m.floors=[synthetic];
   for(const group of ['devices','rooms','floors']){
    const html=view(language).markup(m,{section:'breakdown',group});
    assert.ok(html.includes(`<span>${expected}`),`${group}/${JSON.stringify(identity)}`);
    assert.ok(!html.includes('Synthetic stale locale'));
   }
  }
 });
 test(`user device, room and child names are not translated (${language})`,()=>{
  const m=fixture(),user={id:'sensor.custom',name:'Niezmierzone',area_id:'custom-room',color:'d1',kwh:1.23,
   children:[{id:'sensor.child',name:'Unmeasured <custom> & child',kwh:.12}]};
  m.ranking=[user];m.rooms=[{...user,name:'Niezmierzone room'}];m.floors=[{...user,name:'Unmeasured floor'}];
  const v=view(language);
  assert.ok(v.markup(m,{section:'breakdown'}).includes('<span>Niezmierzone'));
  assert.ok(v.markup(m,{section:'breakdown'}).includes('Unmeasured &lt;custom&gt; &amp; child'));
  assert.ok(v.markup(m,{section:'breakdown',group:'rooms'}).includes('Niezmierzone room'));
  assert.ok(v.markup(m,{section:'breakdown',group:'floors'}).includes('Unmeasured floor'));
  assert.ok(v.markup(m).includes('Niezmierzone'));
 });
}

test('comparison label polish keeps coverage guards and exact backend readings',()=>{
 const m=fixture();m.comparisons=[{key:'previous_day',label:'previous_day',kwh:224,delta_kwh:6,delta_pct:2.6785714285714284,coverage_ok:true}];
 m.hourly[0].kwh='49.999999999999545';
 const before=JSON.stringify(m),v=view('en'),html=v.markup(m);
 assert.ok(html.includes('Previous day'));
 assert.ok(html.includes('49.999999999999545'));
 assert.ok(html.includes(createFormatUi('en').reportEnergy(6,{role:'table',period:'day'})));
 assert.equal(JSON.stringify(m),before);
 m.comparisons[0].coverage_ok=false;
 assert.ok(v.markup(m).includes('Insufficient coverage for comparison'));
 m.coverage.complete=false;
 assert.ok(v.markup(m).includes('Incomplete data'));
 assert.ok(v.markup(m).includes('Insufficient coverage for comparison'));
 m.schema='unsupported';
 assert.ok(v.markup(m).includes('Energy report unavailable.'));
 assert.ok(!v.markup(m).includes('49.999999999999545'));
});

test('unmeasured localization retains double-counting suppression',()=>{
 const m=fixture();m.unmeasured.status='double_counting';
 m.ranking=[{id:'_unmeasured',name:'Niezmierzone',kwh:-1234.56,cost:9876.54,share:.5}];
 const html=view('en').markup(m,{section:'breakdown'});
 assert.ok(html.includes('<span>Unmeasured'));
 assert.ok(html.includes('Device total exceeds import'));
 assert.ok(!html.includes('1,234.56'));
 assert.ok(!html.includes('9,876.54'));
});

test('missing comparison metadata uses a readable fallback without inventing dates',()=>{
 const m=fixture();m.comparisons=[{kwh:null,coverage_ok:false}];
 const html=view('en').markup(m);
 assert.ok(html.includes('Previous period'));
 assert.ok(html.includes('Insufficient coverage for comparison'));
 assert.ok(!html.includes('undefined'));
 m.comparisons=[];
 assert.ok(!view('en').markup(m).includes('<span>Previous day<small>'));
});
