'use strict';
/** Pure Build1 presentation. No clock, persistence, network or HA calls.
 * markup accepts an energy_report/1 and options:
 * section: overview|breakdown|costs|reports; group: devices|rooms|floors;
 * current: {label,rate,next_change,next_label,cheap_share,cheap_kwh,as_of};
 * schedules: [{id,name,cadence,time,channel,enabled}],
 * deliveries: [{id,at,name,channel,status}], previewText: string.
 * current is a separately supplied live snapshot; never inferred from a full-day report.
 * Controls only emit data-energy-build1/action/value/id attributes; host owns authority.
 */
function createEnergyBuild1ViewV53({format, language = format?.language || 'en'} = {}) {
  const pl=String(language).startsWith('pl'), t=(en,polish)=>pl?polish:en;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const list=v=>Array.isArray(v)?v.filter(x=>x&&typeof x==='object'):[];
  const valid=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v));
  const unknown=()=>t('No data','Brak danych');
  const formatted=(name,...args)=>{const value=format?.[name]?.(...args);return esc(value??unknown());};
  const energy=(v,period='day',role='table')=>formatted('reportEnergy',v,{role,period});
  const money=(v,c)=>formatted('reportMoney',v,c);
  const rate=(v,c)=>formatted('reportRate',v,c);
  const percent=(v,role='share')=>formatted('reportPercent',v,{role});
  const ratio=v=>valid(v)?percent(Number(v)*100):esc(unknown());
  const exact=v=>valid(v)?formatted('number',typeof v==='number'?String(v):v):esc(unknown());
  const when=v=>formatted('dateTime',v);
  const date=v=>formatted('calendarDate',v);
  const action=(name,label,value='',extra='')=>`<button type="button" data-energy-build1="${esc(name)}" data-value="${esc(value)}" ${extra}>${label}</button>`;
  const heading=(name,note='')=>`<div class="sec2"><b>${name}</b><span>${note}</span></div>`;
  const empty=()=>`<p class="info">${unknown()}</p>`;
  const kpi=(label,value,note='')=>`<div class="k"><div class="l">${label}</div><div class="v">${value}</div><div class="n">${note}</div></div>`;
  const row=(label,value,note='')=>`<div class="row3"><span>${label}${note?`<small>${note}</small>`:''}</span><span class="r">${value}</span></div>`;
  const table=(caption,columns,rows)=>`<div class="table-wrap"><table class="ct"><caption>${caption}</caption><thead><tr>${columns.map(v=>`<th scope="col">${v}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(c=>`<tr>${c.map((v,i)=>`<${i?'td':'th scope="row"'}>${v}</${i?'td':'th'}>`).join('')}</tr>`).join(''):`<tr><td colspan="${columns.length}">${unknown()}</td></tr>`}</tbody></table></div>`;
  const sections={overview:t('Overview','Przegląd'),breakdown:t('Breakdown','Rozbicie'),costs:t('Costs','Koszty'),reports:t('Reports','Raporty')};
  const periods={day:t('Day','Dzień'),week:t('Week','Tydzień'),month:t('Month','Miesiąc'),year:t('Year','Rok')};
  const groups={devices:t('Devices','Urządzenia'),rooms:t('Rooms','Pokoje'),floors:t('Floors','Piętra')};
  const colors={d1:'var(--hat-d1)',d2:'var(--hat-d2)',d3:'var(--hat-d3)',d4:'var(--hat-d4)',other:'var(--hat-text-3)',unmeasured:'var(--hat-unmeasured)'};
  const color=(r,i)=>colors[r.color]||'var(--hat-text-3)';
  // Number conversions below only size bars or convert ratios to display percentages.
  const width=(value,max)=>valid(value)&&max>0?Math.max(0,Math.min(100,Number(value)/max*100)):0;
  const isUnmeasured=r=>r.id==='_unmeasured'||r.area_id==='_unmeasured'||r.color==='unmeasured';
  const itemName=(r,group)=>{
    if(isUnmeasured(r))return t('Unmeasured','Niezmierzone');
    // grouped() uses an explicit null identity for the unassigned bucket. A
    // matching name alone is never enough to translate a real HA area/device.
    if(group==='rooms'&&r.area_id===null&&r.name==='Bez pokoju')return t('No room','Bez pokoju');
    if(group==='floors'&&r.floor_id===null&&r.name==='Bez piętra')return t('No floor','Bez piętra');
    return r.name||unknown();
  };
  const channelLabels={email:t('Email','E-mail'),persistent_notification:t('HA notification','Powiadomienie HA'),'notify.persistent_notification':t('HA notification','Powiadomienie HA'),'notify.send_message':t('HA message','Wiadomość HA')};
  const channelText=value=>{
    const text=String(value||unknown()),ids=text.split(',').map(id=>id.trim());
    return ids.some(id=>Object.hasOwn(channelLabels,id))?ids.map(id=>Object.hasOwn(channelLabels,id)?channelLabels[id]:id).join(', '):text;
  };
  // Backend model/1 may use its semantic key as the label. Translate only this
  // allowlist; already descriptive/custom labels remain producer-owned text.
  const comparisonLabels={
    previous_day:t('Previous day','Poprzedni dzień'),
    same_weekday_last_week:t('Same weekday last week','Ten sam dzień tydzień temu'),
    avg_7d:t('7-day average','Średnia 7 dni'),
    previous_week:t('Previous week','Poprzedni tydzień'),
    previous_month:t('Previous month','Poprzedni miesiąc'),
    previous_year:t('Previous year','Poprzedni rok'),
    same_week_last_year:t('Same week last year','Ten sam tydzień rok temu'),
    same_month_last_year:t('Same month last year','Ten sam miesiąc rok temu'),
    previous:t('Previous period','Poprzedni okres'),
  };
  const comparisonLabel=r=>{
    const label=String(r.label??''),semantic=label.trim();
    if(semantic&&!Object.hasOwn(comparisonLabels,semantic))return label;
    const key=Object.hasOwn(comparisonLabels,r.key)?r.key:semantic;
    return Object.hasOwn(comparisonLabels,key)?comparisonLabels[key]:t('Previous period','Poprzedni okres');
  };
  const doubleMessage=()=>t('Device total exceeds import — check the Energy dashboard','Suma urządzeń przekracza import — sprawdź panel Energia');
  // Classification must be producer-supplied; list order and labels are not prices.
  const zoneClass=z=>z?.classification||z?.zone_class||(z?.cheap===true?'cheap':z?.cheap===false?'expensive':null);
  const zoneTitle=(z,tariff={})=>{
    const label=z?.label || z?.id || unknown();
    if(String(label).toLowerCase()!=='flat')return label;
    const zones=list(tariff.zones);
    const allDay=zones.length===1 && tariff.defaultZone===z?.id && !list(tariff.rules).length && !list(tariff.exceptions).length && list(tariff.applied_history).length<=1;
    return allDay?t('All-day','Całodobowa'):t('Standard zone','Strefa standardowa');
  };
  const zoneHours=z=>{
    let hours=String(z?.hours_label||'');
    if(!hours)return unknown();
    if(/^\d{1,2}–\d{1,2}(?:, \d{1,2}–\d{1,2})*$/.test(hours))
      hours=hours.replace(/(\d{1,2})–(\d{1,2})/g,(_,a,b)=>`${a.padStart(2,'0')}:00–${b.padStart(2,'0')}:00`);
    return t('Reading hours: ','Godziny pomiarów: ')+hours;
  };
  const fixedTitle=(fixed,tariff={})=>{
    const label=fixed?.label||unknown(),key=fixed?.id;
    const canonical={subscription:t('Subscription','Abonament'),capacity:t('Capacity charge','Opłata mocowa'),distribution:t('Fixed distribution','Dystrybucja stała'),other:t('Other','Pozostałe')};
    if(Object.hasOwn(canonical,key)&&label===key)return canonical[key];
    if(key==='fixed'&&label==='opłaty stałe'&&tariff.fixedFeeSemantics==='legacy_combined')return t('Fixed charges','Opłaty stałe');
    return label;
  };
  const currentZoneTitle=(label,m)=>zoneTitle({id:list(m.tariff?.zones).find(z=>z.label===label||z.id===label)?.id,label},m.tariff);
  const zoneFill=z=>zoneClass(z)==='cheap'?'var(--hat-zone-cheap)':['expensive','exp'].includes(zoneClass(z))?'var(--hat-zone-exp)':'var(--hat-primary)';
  function chart(m,current={}){
    const hourly=m.period?.kind==='day',rows=list(hourly?m.hourly:m.daily),resolution=hourly?'hour':'day';
    const recorded=r=>valid(r.recorded_kwh)?r.recorded_kwh:r.kwh;
    const partialReading=r=>valid(r.recorded_kwh)&&(r.complete===false||!valid(r.kwh)||Number(r.recorded_kwh)!==Number(r.kwh));
    const hasPartial=rows.some(partialReading);
    const values=rows.flatMap(r=>[recorded(r),r.prev_kwh]).filter(valid).map(Number),max=Math.max(0,...values);
    const labels=format?.chartLabels?.(rows.map(r=>r.start),resolution)||rows.map(r=>format?.dateTime?.(r.start)||unknown());
    const zone=id=>list(m.zones).find(z=>z.id===id);
    const bars=rows.map((r,i)=>{
      const future=r.future===true||(hourly&&Number.isFinite(Date.parse(current.as_of))&&Date.parse(r.start)>=Date.parse(current.as_of));
      // Daily zone segments are already aggregated by the producer. Only scale geometry.
      const partial=partialReading(r);
      const segments=!partial&&!hourly&&list(r.zones).length?list(r.zones):[{id:r.zone,kwh:recorded(r)}];
      const fill=future?(valid(r.prev_kwh)?`<i style="height:${width(r.prev_kwh,max)}%;background:var(--hat-ghost)"></i>`:''):segments.filter(z=>valid(z.kwh)).map(z=>`<i ${partial?'data-partial-reading class="partial-reading" ':''}style="height:${width(z.kwh,max)}%;background-color:${zoneFill(zone(z.id))}"></i>`).join('');
      return `<div class="c" title="${esc(labels[i])}: ${partial?t('Known readings','Znane odczyty')+' '+energy(recorded(r),m.period?.kind)+' · '+t('incomplete','niepełne'):energy(r.kwh,m.period?.kind)}"><span class="chart-stack">${fill}</span>${valid(r.prev_kwh)?`<em style="bottom:${width(r.prev_kwh,max)}%"></em>`:''}</div>`;
    }).join('');
    const now=Date.parse(current.as_of),begin=Date.parse(m.period?.start),end=Date.parse(m.period?.end);
    const marker=hourly&&Number.isFinite(now)&&now>=begin&&now<end?`<span class="now" style="left:${width(now-begin,end-begin)}%" title="${when(current.as_of)}"></span>`:'';
    const zoneLabel=r=>hourly?esc(zoneTitle(zone(r.zone),m.tariff)):list(r.zones).length?list(r.zones).map(z=>`${esc(zoneTitle(zone(z.id),m.tariff))}: ${energy(z.kwh,m.period?.kind)}`).join(' · '):esc(unknown());
    const data=table(hourly?t('Hourly data','Dane godzinowe'):t('Daily data','Dane dzienne'),[hourly?t('Time','Czas'):t('Date','Data'),t('Energy','Energia'),...(hasPartial?[t('Known readings','Znane odczyty')]:[]),t('Previous','Poprzednio'),hourly?t('Zone','Strefa'):t('Zones','Strefy'),t('Cost','Koszt')],rows.map((r,i)=>[esc(labels[i]),energy(r.kwh,m.period?.kind),...(hasPartial?[`${energy(recorded(r),m.period?.kind)}${partialReading(r)?` · ${t('incomplete','niepełne')}${valid(r.measured_sources)&&valid(r.expected_sources)?` (${exact(r.measured_sources)}/${exact(r.expected_sources)})`:''}`:''}`]:[]),energy(r.prev_kwh,m.period?.kind),zoneLabel(r),money(r.cost,m.currency)]));
    return `${hasPartial?'<p class="info">'+t('Known readings; hatched bars are incomplete. Previous values use intervals with readings from every source.','Znane odczyty; kreskowane słupki są niepełne. Poprzednie wartości obejmują przedziały z odczytami wszystkich źródeł.')+'</p>':''}${heading(t('Energy during the period','Zużycie w okresie'),t('Color = zone · line = previous','Kolor = strefa · kreska = poprzednio'))}${rows.length?`<div class="cols24" data-energy-build1-series="${hourly?'hourly':'daily'}" role="img" aria-label="${t('Energy chart; full values in Data','Wykres energii; pełne wartości w Danych')}">${bars}${marker}</div><div class="axis"><span>${esc(labels[0])}</span><span>${esc(labels.at(-1))}</span></div><div class="legend">${list(m.zones).map(z=>`<span><i style="background:${zoneFill(z)}"></i>${esc(zoneTitle(z,m.tariff))}</span>`).join('')}<span>${t('Line: previous period','Kreska: poprzedni okres')}</span></div>`:empty()}<details data-energy-build1-disclosure="chart-data"><summary>${t('Data','Dane')}</summary>${data}${table(t('Exact values','Pełne wartości'),[t('Time','Czas'),'kWh',...(hasPartial?[t('Known readings','Znane odczyty')]:[]),m.currency?esc(m.currency):unknown()],rows.map((r,i)=>[esc(labels[i]),exact(r.kwh),...(hasPartial?[exact(recorded(r))]:[]),exact(r.cost)]))}</details>`;
  }
  function overview(m,o,partial){
    const total=m.totals||{},current=o.current||{},period=m.period?.kind;
    const cheapZones=list(m.zones).filter(z=>zoneClass(z)==='cheap'),cheap=cheapZones.length===1?cheapZones[0]:null;
    const comparisons=list(m.comparisons),previous=comparisons.find(r=>['previous_day','previous'].includes(r.key));
    const enoughCurrent=!partial||valid(m.coverage?.measured_hours)&&valid(m.coverage?.expected_hours)&&Number(m.coverage.expected_hours)>0&&Number(m.coverage.measured_hours)>=.9*Number(m.coverage.expected_hours);
    const comparison=r=>(!enoughCurrent&&r.comparison_scope!=='common_measurements')||r.coverage_ok!==true?esc(t('Insufficient coverage for comparison','Za mało danych do porównania')):`${energy(r.delta_kwh,period)}${partial&&r.comparison_scope!=='common_measurements'?'':` (${percent(r.delta_pct,'change')})`}`;
    const top=list(m.devices).filter(r=>valid(r.kwh)).sort((a,b)=>Number(b.kwh)-Number(a.kwh)||String(a.id).localeCompare(String(b.id))).slice(0,3);
    const gridKnown=valid(total.recorded_import_kwh)?total.recorded_import_kwh:total.import_kwh;
    const deviceOnly=partial&&!valid(gridKnown)?top[0]:null;
    const single=list(m.tariff?.zones).length===1&&!zoneClass(m.tariff.zones[0])&&list(m.zones).every(z=>z.id===m.tariff.zones[0].id&&!zoneClass(z));
    const zoneKpi=single?kpi(t('Single price zone','Jedna strefa cenowa'),esc(zoneTitle(m.tariff.zones[0],m.tariff)),t('No cheap / expensive split','Bez podziału na tanią i drogą strefę')):kpi(t('In the cheap zone','W taniej strefie'),partial?unknown():ratio(cheap?.share),cheap?energy(cheap.kwh,period):t('Zone classification unavailable','Brak klasyfikacji stref'));
    const recorded=valid(total.recorded_import_kwh)&&partial?`<p class="notice">${t('Known source readings','Znane odczyty źródeł')}: <b>${energy(total.recorded_import_kwh,period)}</b>. ${t('Partial source sum, not a complete household balance. The known readings cost covers this subtotal when rates are available; household balance and its cost details use complete-source intervals. Device costs use each device’s available readings.','Częściowa suma źródeł, nie pełny bilans. Koszt znanych odczytów obejmuje tę sumę, gdy stawki są dostępne; bilans i jego koszty obejmują przedziały z kompletem źródeł. Koszty urządzeń dotyczą ich dostępnych odczytów.')}</p>`:'';
    return `${recorded}<div class="kpi4">${kpi(deviceOnly?`${t('Device','Urządzenie')}: ${esc(deviceOnly.name||deviceOnly.id)}${deviceOnly.measurement_complete===false?` (${t('known readings','znane odczyty')})`:''}`:partial?t('Known source readings','Znane odczyty źródeł'):t('Consumption','Zużycie'),energy(deviceOnly?deviceOnly.kwh:partial?gridKnown:total.import_kwh,period,'tile'),deviceOnly?t('Grid import unavailable','Brak danych importu'):previous?comparison(previous):partial?(valid(total.recorded_import_kwh)?t('Partial source sum','Częściowa suma źródeł'):t('Complete-source intervals only','Tylko przedziały z kompletem źródeł')):'')}${kpi(partial?t('Known readings cost','Koszt znanych odczytów'):t('Usage cost','Koszt zużycia'),money(partial?total.recorded_usage_cost:total.usage_cost,m.currency),partial?'':rate(total.effective_rate,m.currency))}${zoneKpi}${kpi(t('Now','Teraz'),esc(currentZoneTitle(current.label,m)),`${rate(current.rate,current.currency)}${current.next_change?` · ${esc(current.next_label?currentZoneTitle(current.next_label,m):'')} ${when(current.next_change)}`:''}`)}</div>${current.as_of?`<p class="info">${t('Live snapshot','Stan bieżący')}: ${when(current.as_of)}</p>`:''}${chart(m,current)}<div class="two"><div>${heading(t('Comparison','Porównanie'),t('Full periods or matched hours','Pełne okresy lub wspólne godziny'))}${comparisons.length?comparisons.map(r=>row(esc(comparisonLabel(r)),comparison(r),`${r.comparison_scope==='calendar_totals'?t('Full periods · ','Pełne okresy · '):r.comparison_scope==='common_measurements'?t('Period total: ','Suma okresu: '):''}${energy(r.kwh,period)}${r.comparison_scope==='common_measurements'?` · ${t('Matched hours','Wspólne godziny')}: ${energy(r.compared_current_kwh,period)} / ${energy(r.compared_baseline_kwh,period)}`:''}`)).join(''):empty()}</div><div>${heading(t('Largest consumers','Największe zużycie'),action('section',sections.breakdown,'breakdown'))}${top.length?top.map(r=>row(esc(itemName(r))+(r.measurement_complete===false?` <small>(${t('known readings','znane odczyty')})</small>`:''),energy(r.kwh,period))).join(''):empty()}</div></div>`;
  }
  function breakdown(m,o,partial,double){
    const group=Object.hasOwn(groups,o.group)?o.group:'devices',period=m.period?.kind;
    const rows=(group==='devices'?list(m.ranking).length?list(m.ranking):list(m.devices):list(m[group])).filter(r=>!(group==='rooms'&&r.area_id===null&&valid(r.kwh)&&Number(r.kwh)===0));
    const groupPartial=r=>(partial||r.measurement_complete===false)&&!isUnmeasured(r)&&!valid(r.kwh)&&valid(r.recorded_kwh);
    const displayKwh=r=>groupPartial(r)?r.recorded_kwh:r.kwh;
    const incompleteComposition=partial||list(m.coverage?.missing_devices).length>0||rows.some(r=>r.measurement_complete===false||list(r.children).some(c=>c.measurement_complete===false));
    const safe=rows.filter(r=>!(double&&isUnmeasured(r))),max=Math.max(0,...safe.filter(r=>valid(displayKwh(r))).map(r=>Number(displayKwh(r))));
    const value=(r,f)=>double&&isUnmeasured(r)?esc(doubleMessage()):f();
    const one=(r,i,child=false)=>`<div class="rk2${child?' child':''}"><div class="nm"><i class="sw${isUnmeasured(r)?' hatch':''}" style="background:${color(r,i)}"></i><span>${child?'↳ ':''}${esc(itemName(r,child?undefined:group))}${groupPartial(r)||r.measurement_complete===false&&valid(r.kwh)?` <small>(${t('known readings','znane odczyty')})</small>`:''}${child?` <small>(${t('included','w tym')})</small>`:''}${r.count!==undefined?`<small>${exact(r.count)} ${formatted('reportPlural',r.count,pl?{one:'urządzenie',few:'urządzenia',many:'urządzeń'}:{one:'device',other:'devices'})}</small>`:''}</span></div><div class="bar"><i class="${isUnmeasured(r)?'hatch':''}" style="width:${double&&isUnmeasured(r)?0:width(displayKwh(r),max)}%;background:${color(r,i)}"></i></div><div class="v">${value(r,()=>energy(displayKwh(r),period))}</div><div class="p">${partial||double?'—':ratio(r.share)}</div><div class="c"${child?` title="${t('Included device cost; not added again','Koszt urządzenia w tym; nie jest dodawany ponownie')}"`:''}>${value(r,()=>money(r.cost,m.currency))}</div></div>`;
    return `<div class="seg2">${Object.entries(groups).map(([key,label])=>action('group',label,key,`aria-pressed="${group===key}"`)).join('')}</div>${heading(partial?(valid(m.totals?.recorded_import_kwh)?`${t('Known source readings','Znane odczyty źródeł')}: ${energy(m.totals.recorded_import_kwh,period)}`:valid(m.totals?.import_kwh)?`${t('Complete-source intervals','Przedziały z kompletem źródeł')}: ${energy(m.totals.import_kwh,period)}`:t('Device readings','Odczyty urządzeń')):`${energy(m.totals?.import_kwh,period)} ${t('imported','importu')}`,t('Energy dashboard devices · hourly zone costs','Urządzenia z panelu Energia · koszt wg stref każdej godziny'))}${incompleteComposition?'':`<div class="compbar" aria-hidden="true">${safe.map((r,i)=>`<i class="${isUnmeasured(r)?'hatch':''}" style="width:${width(r.kwh,Number(m.totals?.import_kwh))}%;background:${color(r,i)}"></i>`).join('')}</div>`}${rows.length?rows.map((r,i)=>`${r.id==='_other_measured'?`<details data-energy-build1-disclosure="other-measured"><summary>${t('Other measured devices','Pozostałe zmierzone')}</summary>${one(r,i)}${list(r.children).map(c=>one(c,i,true)).join('')}${list(r.children).length?'':`<p class="info">${t('Individual readings are unavailable in this snapshot.','Odczyty poszczególnych urządzeń nie są dostępne w tym stanie.')}</p>`}</details>`:one(r,i)+list(r.children).map(c=>one(c,i,true)).join('')}`).join(''):empty()}<p class="info">${t('Unmeasured = import minus top-level devices. Included children and their individual costs are shown for context and are not added twice. Rooms follow HA areas; no proportional allocation.','Niezmierzone = import − suma urządzeń najwyższego poziomu. Urządzenia „w tym” i ich koszty są informacyjne i nie są dodawane drugi raz. Pokoje według obszarów HA; bez podziału proporcjonalnego.')}</p>`;
  }
  function costs(m,o){
    const v=m.totals||{},tf=m.tariff||{},c=m.currency;
    const charges=[[t('Active energy','Energia czynna'),money(v.energy_cost,c)],[t('Variable distribution','Dystrybucja zmienna'),money(v.variable_cost,c)],[`${t('Usage cost','Koszt zużycia')}<small>${t('Effective rate','Cena efektywna')}: ${rate(v.effective_rate,c)}</small>`,money(v.usage_cost,c)],[t('Fixed charges allocated to this period','Opłaty stałe przypadające na okres'),money(v.fixed_share,c)],[t('Total including fixed charges','Razem z opłatami stałymi'),money(v.total_with_fixed,c)]];
    if(m.coverage?.complete!==true&&valid(v.recorded_import_kwh))charges.unshift([t('Known readings cost','Koszt znanych odczytów'),money(v.recorded_usage_cost,c)]);
    const alternatives=o.showAlternatives===false?'':list(m.alternatives).map(a=>`<p class="info">${esc(a.tariff)} · ${rate(a.rate,c)} · ${money(a.cost,c)} · ${t('difference','różnica')}: ${money(a.delta,c)}<br>${t('Informational comparison for unchanged consumption.','Porównanie informacyjne przy niezmienionym zużyciu.')}</p>`).join('');
    return `<div class="two"><div>${heading(t('Cost for the period','Koszt okresu'),m.price_basis==='gross'?t('gross','brutto'):m.price_basis==='net'?t('net','netto'):unknown())}${m.coverage?.complete!==true?`<p class="info">${t('Energy and usage costs cover complete-source intervals; fixed charges are shown separately.','Koszty energii i zużycia dotyczą przedziałów z kompletem źródeł; opłaty stałe są pokazane osobno.')}</p>`:''}${table(t('Cost components','Składniki kosztu'),[t('Component','Składnik'),t('Cost','Koszt')],charges)}${alternatives}</div><div>${heading(`${t('Tariff','Taryfa')} ${esc(tf.name||unknown())}`,`${tf.valid_from?date(tf.valid_from):unknown()} · ${action('tariff-history',t('History','Historia'))}`)}${table(t('Zone rates','Stawki stref'),[t('Zone / hours','Strefa / godziny'),t('Energy + distribution = rate','Energia + dystrybucja = stawka')],list(tf.zones).map(z=>[`${esc(zoneTitle(z,tf))}<small>${esc(zoneHours(z))}</small>`,tf.rateSemantics==='legacy_combined'?`${t('Components unknown','Składniki nieznane')} · <b>${rate(z.rate,c)}</b>`:`${rate(z.energy_rate,c)} + ${rate(z.variable_rate,c)} = <b>${rate(z.rate,c)}</b>`]))}${list(tf.zones).some(z=>z.hours_label)?`<p class="info">${t('Hours do not distinguish dates or repeated hours when clocks change.','Godziny nie rozróżniają dat ani powtórzeń przy zmianie czasu.')}</p>`:''}${heading(t('Fixed charges','Opłaty stałe'),`${money(tf.fixed_monthly,c)} / ${t('month','mies.')}`)}${table(t('Monthly fixed charges','Miesięczne opłaty stałe'),[t('Component','Składnik'),t('Monthly','Miesięcznie')],list(tf.fixed).map(f=>[esc(fixedTitle(f,tf)),money(f.monthly,c)]))}<div class="hat-acts">${action('tariff-edit',t('Edit tariff','Edytuj taryfę'))}${action('tariff-template',t('Tariff templates','Szablony taryf'))}</div></div></div>`;
  }
  function reports(m,o){
    const schedules=list(o.schedules),deliveries=list(o.deliveries).slice(0,5),editable=o.canManageReports===true;
    const disabled=editable?'':'disabled',scheduleDisabled=(o.canManageSchedules??editable)?'':'disabled';
    const status={delivered:t('Delivered','Dostarczone'),failed:t('Failed','Błąd'),pending:t('Pending','Oczekuje'),accepted_by_notify:t('Accepted by HA','Przyjęte przez HA'),accepted_by_smtp:t('Accepted by SMTP','Przyjęte przez SMTP'),outcome_unknown:t('Outcome unknown','Wynik nieznany'),transport_outcome_unknown:t('Outcome unknown','Wynik nieznany'),partial_acceptance:t('Partly accepted','Częściowo przyjęte'),sent:t('Sent','Wysłano')};
    return `${heading(t('Schedule','Harmonogram'),t('HA notification or email','Powiadomienie HA lub e-mail'))}<div class="list">${schedules.length?schedules.map(s=>`<div class="it"><div class="txt">${esc(s.name||s.cadence||unknown())}<small>${esc(s.cadence||'')} · ${esc(s.time||unknown())} · ${esc(channelText(s.channel))}</small></div>${action('schedule-toggle',s.enabled===true?t('Enabled','Włączony'):s.enabled===false?t('Disabled','Wyłączony'):unknown(),s.id,`${s.editable===false?'disabled':scheduleDisabled} aria-pressed="${s.enabled===true}"`)}${action('schedule-edit',t('Edit','Edytuj'),s.id,s.editable===false?'disabled':scheduleDisabled)}</div>`).join(''):`<p>${t('No schedules supplied.','Nie dostarczono harmonogramów.')}</p>`}</div><div class="hat-acts">${action('send-now',t('Send daily now','Wyślij dzienny teraz'),'day',disabled)}${action('schedule-add',t('+ Report','+ Raport'),'',scheduleDisabled)}${action('email-add',t('Add email','Dodaj e-mail'),'',disabled)}</div>${heading(t('Preview','Podgląd'),t('The same report as in the email','Ten sam raport co w e-mailu'))}<div class="preview-controls">${action('preview-device',t('Phone','Telefon'),'phone')}${action('preview-device',t('Desktop','Komputer'),'desktop')}${action('preview-theme',t('Light','Jasny'),'light')}${action('preview-theme',t('Dark','Ciemny'),'dark')}${action('preview-load',t('Load preview','Wczytaj podgląd'))}</div><div class="prev" data-energy-build1-preview>${typeof o.previewText==='string'?`<pre>${esc(o.previewText)}</pre>`:`<p>${t('Load the report preview.','Wczytaj podgląd raportu.')}</p>`}</div>${heading(t('Recent deliveries','Ostatnie wysyłki'))}<div class="list">${deliveries.length?deliveries.map(d=>`<div class="it"><div class="txt">${when(d.at)} · ${esc(d.name||'')}<small>${esc(channelText(d.channel))}</small></div><span class="status">${esc(status[d.status]||d.status||unknown())}</span>${d.status==='failed'&&d.retryable!==false?action('delivery-retry',t('New report','Nowy raport'),d.id,disabled):''}</div>`).join(''):`<p>${t('No delivery history supplied.','Nie dostarczono historii wysyłek.')}</p>`}</div>`;
  }
  function markup(model,options={}){
    const m=model&&typeof model==='object'?model:{},o=options,section=Object.hasOwn(sections,o.section)?o.section:'overview';
    const issues=list(m.issues),double=m.unmeasured?.status==='double_counting'||issues.some(i=>i.code==='double_counting');
    const partial=m.coverage?.complete!==true,missing=issues.some(i=>i.code==='no_grid_meter');
    const currentPeriod=Object.hasOwn(periods,m.period?.kind)?m.period.kind:Object.hasOwn(periods,o.period)?o.period:'day';
    const header=`<div class="ehd"><ha-icon icon="mdi:lightning-bolt" class="hat-ic"></ha-icon><div class="txt"><div class="t">${esc(o.title||t('Energy','Energia'))}</div><div class="s">${t('Tariff','Taryfa')} ${esc(m.tariff?.name||unknown())} · ${t('HA Energy dashboard data','Dane z panelu Energia HA')}</div></div><div class="seg2">${Object.entries(periods).map(([key,label])=>action('period',label,key,`aria-pressed="${key===currentPeriod}"`)).join('')}</div><div class="nav">${action('previous','‹','',`aria-label="${t('Previous period','Poprzedni okres')}"`)}<b>${formatted('range',m.period?.start,m.period?.end)}</b>${action('next','›','',`aria-label="${t('Next period','Następny okres')}"`)}</div></div>`;
    const tabs=`<nav class="tabs2" aria-label="${t('Energy sections','Sekcje energii')}">${Object.entries(sections).map(([key,label])=>action('section',label,key,`aria-current="${key===section?'page':'false'}"`)).join('')}${action('more','⋯','',`aria-label="${t('More sections','Więcej sekcji')}"`)}</nav>`;
    const missingRange=r=>{
      const a=Date.parse(r.start),b=Date.parse(r.end),start=Date.parse(m.period?.start),end=Date.parse(m.period?.end);
      if(!Number.isFinite(a)||!Number.isFinite(b))return esc(unknown());
      if(a===start&&b===end)return t('entire period','cały okres');
      const part=value=>{const display=format?.dateTime?.(value);if(!display)return esc(unknown());let offset='';try{offset=new Intl.DateTimeFormat('en',{timeZone:format?.timeZone||'UTC',timeZoneName:'shortOffset'}).formatToParts(new Date(value)).find(x=>x.type==='timeZoneName')?.value||'';}catch(_){}return `${esc(display)} ${esc(offset)}`.trim();};
      return `${part(r.start)} – ${part(r.end)}`;
    };
    const missingDevices=list(m.coverage?.missing_devices);
    const deviceNotice=missingDevices.length?`<div class="notice" role="status">${t('Missing device readings','Brakujące odczyty urządzeń')}: ${missingDevices.map(s=>`${esc(s.name||s.id)}: ${list(s.ranges).map(missingRange).join(', ')}`).join('; ')}</div>`:'';
    let content;
    if(o.loading)content=`<div class="skeleton" role="status" aria-busy="true">${t('Loading…','Wczytywanie…')}</div>`;
    else if(section==='reports'&&o.reportAccess===true)content=reports(m,o);
    else if(missing)content=`<p>${t('The Energy dashboard is not configured.','Panel Energia nie jest skonfigurowany.')}</p>${action('configure-energy',t('Configure Energy','Skonfiguruj Energię'))}`;
    else if(m.schema!=='ha_tools.energy_report/1')content=`<p role="status">${t('Energy report unavailable.','Raport energii niedostępny.')}</p>`;
    else content=deviceNotice+(partial?`<div class="notice" role="status">${m.coverage?.status==='no_data'?t('No data','Brak danych'):t('Incomplete data','Dane niepełne')} (${exact(m.coverage?.full_hours??m.coverage?.measured_hours)}/${exact(m.coverage?.expected_full_hours??m.coverage?.expected_hours)} ${t('complete hours','pełnych godzin')}${valid(m.coverage?.expected_source_hours)?` · ${exact(m.coverage?.measured_source_hours)}/${exact(m.coverage?.expected_source_hours)} ${t('source-hours','źródło-godzin')}`:''})${list(m.coverage?.missing_sources).length?`<p>${t('Missing sources','Brakujące źródła')}: ${list(m.coverage.missing_sources).map(s=>`${esc(s.name||s.id)}: ${list(s.ranges).map(missingRange).join(', ')}`).join('; ')}</p>`:''}</div>`:'')+(double?`<p class="notice" role="alert">${doubleMessage()}</p>`:'')+(section==='overview'?overview(m,o,partial):section==='breakdown'?breakdown(m,o,partial,double):section==='costs'?costs(m,o):reports(m,o));
    return `<section class="hat build1 cq" data-energy-build1-section="${section}">${header}${tabs}<div class="build1-panel">${content}</div></section>`;
  }
  function styles(){return BUILD1_STYLES_V53;}
  return {markup,styles};
}
const BUILD1_STYLES_V53=`
.build1{--hat-card:var(--ha-card-background,var(--card-background-color,#fff));--hat-text:var(--primary-text-color,#111827);--hat-text-2:var(--secondary-text-color,#4b5563);--hat-text-3:var(--secondary-text-color,#6b7280);--hat-chip:var(--secondary-background-color,#f3f4f6);--hat-border:var(--divider-color,#e5e7eb);--hat-primary:var(--primary-color,#2563eb);--hat-grid:color-mix(in srgb,var(--hat-text) 6%,var(--hat-card));--hat-ghost:color-mix(in srgb,var(--hat-text) 16%,var(--hat-card));--hat-zone-cheap:#1baf7a;--hat-zone-exp:#2a78d6;--hat-d1:#eb6834;--hat-d2:#6250d6;--hat-d3:#e87ba4;--hat-d4:#eda100;--hat-unmeasured:#9ca3af;color:var(--hat-text);font:14px var(--ha-font-family-body,Roboto,system-ui,sans-serif);padding:16px;box-sizing:border-box;container-type:inline-size;min-width:0;overflow-wrap:anywhere}
:host(.hat-dark) .build1,.build1.hat-dark{--hat-zone-cheap:#199e70;--hat-zone-exp:#3987e5;--hat-d1:#d95926;--hat-d2:#9085e9;--hat-d3:#d55181;--hat-d4:#c98500;--hat-unmeasured:#6b7280}
.build1 *{box-sizing:border-box}.build1 button{font:inherit;color:inherit;border:1px solid var(--hat-border);background:var(--hat-chip);border-radius:999px;padding:6px 12px;min-height:44px;cursor:pointer}.build1 button:disabled{opacity:.6;cursor:default}.build1 button:focus-visible,.build1 summary:focus-visible{outline:2px solid var(--hat-primary);outline-offset:2px}.build1 button[aria-pressed=true]{background:var(--hat-card);font-weight:600}.build1 .ehd{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.build1 .txt{flex:1;min-width:120px}.build1 .t{font-size:16px;font-weight:600;line-height:22px}.build1 .s,.build1 small,.build1 .info{font-size:12px;color:var(--hat-text-2)}.build1 small{display:block}.build1 .hat-ic{--mdc-icon-size:20px;color:var(--hat-zone-exp);background:color-mix(in srgb,var(--hat-zone-exp) 18%,transparent);border-radius:50%;padding:8px;width:36px;height:36px}.build1 .seg2{display:inline-flex;flex-wrap:wrap;background:var(--hat-chip);border-radius:24px;padding:2px}.build1 .seg2 button{font-size:12px;border:0}.build1 .nav{display:flex;align-items:center;gap:6px;min-width:0}.build1 .nav b{font-size:14px;font-weight:500}.build1 .tabs2{display:flex;gap:16px;border-bottom:1px solid var(--hat-border);margin:12px 0 16px;overflow-x:auto}.build1 .tabs2 button{background:none;border:0;border-radius:0;padding:10px 0;white-space:nowrap;color:var(--hat-text-2)}.build1 .tabs2 button[aria-current=page]{color:var(--hat-text);font-weight:600;box-shadow:inset 0 -2px 0 var(--hat-primary)}.build1 .kpi4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.build1 .k{border:1px solid var(--hat-border);border-radius:12px;padding:10px 12px;min-width:0}.build1 .k .l,.build1 .k .n{font-size:12px;color:var(--hat-text-2)}.build1 .k .v{font-size:24px;font-weight:600;line-height:30px;font-variant-numeric:tabular-nums}.build1 .sec2{display:flex;flex-wrap:wrap;gap:8px;justify-content:space-between;align-items:baseline;margin:20px 0 8px}.build1 .sec2 b{font-size:16px;font-weight:600}.build1 .sec2>span{font-size:12px;color:var(--hat-text-2)}.build1 .cols24{display:flex;gap:2px;align-items:flex-end;height:120px;position:relative}.build1 .cols24 .c{flex:1;position:relative;height:100%;display:flex;align-items:flex-end}.build1 .cols24 .partial-reading{background-image:repeating-linear-gradient(135deg,transparent 0 4px,var(--hat-card) 4px 6px)}.build1 .cols24 .chart-stack{display:flex;flex-direction:column-reverse;justify-content:flex-start;width:100%;height:100%}.build1 .cols24 .c i{display:block;width:100%;border-radius:2px 2px 0 0}.build1 .cols24 .c em{position:absolute;left:0;right:0;height:2px;background:var(--hat-text);opacity:.7}.build1 .cols24 .now{position:absolute;top:0;bottom:0;border-left:2px dashed var(--hat-text-2)}.build1 .axis{display:flex;justify-content:space-between;font-size:12px;color:var(--hat-text-2)}.build1 .legend{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0;font-size:12px}.build1 .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:4px}.build1 summary{min-height:44px;padding:12px 0;cursor:pointer}.build1 .row3{display:grid;grid-template-columns:1fr auto;gap:8px;padding:8px 0;border-top:1px solid var(--hat-border)}.build1 .row3 .r{text-align:right;font-weight:600}.build1 .rk2{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 88px 40px 80px;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--hat-border)}.build1 .rk2 .bar{height:10px;border-radius:999px;background:var(--hat-grid);overflow:hidden}.build1 .rk2 .bar i{display:block;height:100%;border-radius:999px}.build1 .rk2 .v,.build1 .rk2 .p,.build1 .rk2 .c{text-align:right;font-variant-numeric:tabular-nums}.build1 .rk2 .v{font-weight:600}.build1 .rk2 .p{font-size:12px;color:var(--hat-text-2)}.build1 .rk2 .nm{display:flex;align-items:center;gap:8px;min-width:0}.build1 .child{padding-left:28px;color:var(--hat-text-2)}.build1 .sw{width:10px;height:10px;border-radius:3px;flex:none}.build1 .hatch{background-image:repeating-linear-gradient(135deg,var(--hat-unmeasured) 0 2px,transparent 2px 6px)!important;background-color:transparent!important;box-shadow:inset 0 0 0 1px var(--hat-unmeasured)}.build1 .compbar{display:flex;gap:2px;height:14px;margin:4px 0 8px;overflow:hidden;border-radius:999px}.build1 .compbar i{display:block;height:100%;flex:none}.build1 .table-wrap{overflow-x:auto}.build1 .ct{width:100%;border-collapse:collapse;font-size:14px}.build1 .ct td,.build1 .ct th{padding:8px 4px;border-top:1px solid var(--hat-border);text-align:left;font-variant-numeric:tabular-nums}.build1 .ct td:last-child{text-align:right}.build1 caption{text-align:left;font-size:12px;color:var(--hat-text-2);padding:8px 0}.build1 .info{line-height:18px}.build1 .two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:24px}.build1 .two>div{min-width:0}.build1 .list .it{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--hat-border)}.build1 .hat-acts,.build1 .preview-controls{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.build1 .prev{border:1px solid var(--hat-border);border-radius:12px;padding:12px}.build1 pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}.build1 .notice{padding:12px;background:var(--hat-chip);border-left:3px solid var(--hat-primary)}.build1 .skeleton{min-height:420px;background:var(--hat-chip);padding:16px;border-radius:12px}
@container(max-width:520px){.build1 .kpi4{grid-template-columns:repeat(2,minmax(0,1fr))}.build1 .two{grid-template-columns:1fr}.build1 .rk2{grid-template-columns:minmax(0,1.4fr) minmax(0,.8fr) 72px 70px;gap:6px}.build1 .rk2 .p{display:none}.build1 .ehd>.seg2{order:3}.build1 .k .v{font-size:20px}.build1 .nav{flex-wrap:wrap}.build1 .tabs2{gap:16px}}
`;
if(typeof module!=='undefined'&&module.exports)module.exports={createEnergyBuild1ViewV53};
