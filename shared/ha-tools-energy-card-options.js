// Presentation-only card options. Only UI preferences are stored locally; no pricing, backend writes or requests.
function createEnergyCardOptionsV5({ Card, Editor, name, title, tabs, labels }) {
  const originalTabs = tabs;
  const build1Tabs = ['overview','breakdown','costs','reports'];
  const build1Labels = [['Overview','Breakdown','Costs','Reports'],['Przegląd','Rozbicie','Koszty','Raporty']];
  tabs = [...new Set([...originalTabs,...build1Tabs])];
  labels = [0,1].map(lang => tabs.map(id => build1Tabs.includes(id) ? build1Labels[lang][build1Tabs.indexOf(id)] : labels[lang][originalTabs.indexOf(id)]));
  const key = name === 'ha-energy-optimizer' ? '_currentTab' : '_activeTab';
  const pl = host => String(host._hass?.locale?.language || host._hass?.language || navigator.language || '').startsWith('pl');
  const t = (host, en, polish) => pl(host) ? polish : en;
  const visible = config => config.tabs || tabs;
  const variant = config => config.variant || (config.compact ? 'legacy' : 'full');
  const simple = host => ['tile','compact'].includes(variant(host._config || {})) && !host._optionsExpandedV5;

  // Placement retains its raw lane. A native dialog can take ownership of an
  // already-sent transaction across the expected Lovelace source remount.
  const placementFull = host => !simple(host) && !(variant(host._config || {}) === 'legacy' && !host._optionsExpandedV5);
  const placementGuard = host => host._getTariffHostV3().guard;
  const placementAllowed = host => {
    if (!host.isConnected || host.preview === true || !placementFull(host) || host._hass?.user?.is_admin !== true) return false;
    const guard = placementGuard(host), token = guard.snapshot();
    return guard.available(token) && guard.current(token,true);
  };
  const stopPlacement = host => {
    if (!host._dashboardPlacementV53?.sourceDisconnected?.()) host._dashboardPlacementV53?.close();
    host._energyStatisticsV110?.close();
    host._dashboardPlacementUnsubscribeV53?.(); delete host._dashboardPlacementUnsubscribeV53;
    delete host._dashboardPlacementGuardV53;
    host._dashboardPlacementMountV53?.remove();
    host._energyStatisticsMountV110?.remove();
    // Retain this factory and its mount for remount. destroy()+new would lose
    // occupancy of an unresolved native call; close() already purges snapshots.
  };
  const syncPlacement = host => {
    const root = host.shadowRoot;
    // Disconnect already closed or transferred placement. A queued render of
    // the old card must not cancel the session now owned by native HA.
    if (!root || !host.isConnected) return;
    if (!placementAllowed(host)) {
      host._dashboardPlacementV53?.close();
      host._energyStatisticsV110?.close(); host._energyStatisticsMountV110?.remove();
      host._dashboardPlacementMountV53?.remove();
      root.querySelector('[data-energy-dashboard-footer]')?.remove();
      return;
    }
    const guard = placementGuard(host);
    if (host._dashboardPlacementGuardV53 !== guard || !host._dashboardPlacementUnsubscribeV53) {
      host._dashboardPlacementUnsubscribeV53?.();
      host._dashboardPlacementGuardV53 = guard;
      host._dashboardPlacementUnsubscribeV53 = guard.subscribe(() => {
        // Includes authoritative browser/connection/source edges between hass setters.
        host._dashboardPlacementV53?.close(); host._energyStatisticsV110?.close(); syncPlacement(host);
      });
    }
    const parent = root.querySelector('.card-container,.panel-root,.card') || root.querySelector('ha-card') || root;
    let footer = root.querySelector('[data-energy-dashboard-footer]');
    if (!footer) {
      footer = document.createElement('footer'); footer.dataset.energyDashboardFooter = '';
      const css = document.createElement('style');
      css.textContent = '[data-energy-dashboard-footer]{margin-block-start:12px;padding:8px 0;display:flex;flex-wrap:wrap;gap:8px}[data-energy-dashboard-footer] button{min-height:44px;min-width:44px;padding:10px 14px;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:14px;cursor:pointer}[data-energy-dashboard-footer] button:focus-visible{outline:3px solid var(--primary-color);outline-offset:2px}';
      const button = document.createElement('button'); button.type = 'button'; button.dataset.energyDashboardAdd = '';
      button.addEventListener('click', () => {
        if (!placementAllowed(host)) { syncPlacement(host); return; }
        if (!host._dashboardPlacementMountV53) {
          host._dashboardPlacementMountV53 = document.createElement('div');
          host._dashboardPlacementMountV53.dataset.energyDashboardMount = '';
        }
        root.append(host._dashboardPlacementMountV53);
        host._dashboardPlacementV53 ||= createDashboardPlacementV53({
          host:host._dashboardPlacementMountV53,
          getHass:() => placementAllowed(host) ? host._hass : null,
          getCardConfig:() => ({...(host._optionsConfigV5 || {}),type:`custom:${name}`}),
          cardTypes:[`custom:${name}`],
          createGuard:host._getTariffHostV3().createGuard,
          getSourceKey:() => placementGuard(host).snapshot().epoch
        });
        host._dashboardPlacementV53.open();
      });
      footer.append(css,button); parent.append(footer);
    }
    let statistics = footer.querySelector('[data-energy-statistics-open]');
    if (!statistics) {
      statistics = document.createElement('button'); statistics.type = 'button'; statistics.dataset.energyStatisticsOpen = '';
      statistics.addEventListener('click', () => {
        if (!placementAllowed(host)) { syncPlacement(host); return; }
        host._energyStatisticsMountV110 ||= document.createElement('div');
        root.append(host._energyStatisticsMountV110);
        host._energyStatisticsV110 ||= host._getTariffHostV3().statistics({host:host._energyStatisticsMountV110,isActive:() => placementAllowed(host)});
        host._energyStatisticsV110.open(statistics);
      });
      footer.append(statistics);
    }
    statistics.textContent = t(host,'Cost statistics','Statystyki kosztów');
    if (host._energyStatisticsMountV110 && host._energyStatisticsMountV110.parentNode !== root) root.append(host._energyStatisticsMountV110);
    host._energyStatisticsV110?.update();
    const button = footer.querySelector('[data-energy-dashboard-add]');
    button.textContent = t(host,'Add to dashboard','Dodaj do dashboardu');
    // Retain the mount node across ordinary full-DOM redraws. Reattach before
    // update() so a synchronous redraw does not masquerade as a source teardown.
    if (host._dashboardPlacementMountV53 && host._dashboardPlacementMountV53.parentNode !== root) root.append(host._dashboardPlacementMountV53);
    host._dashboardPlacementV53?.update();
  };
  Card.prototype._syncDashboardPlacementV53 = function() { syncPlacement(this); };

  // Only the picker stub opts new cards in. Existing YAML is never migrated.
  Card.getStubConfig = () => ({type: `custom:${name}`, title, variant: 'compact'});

  const validate = config => {
    if (config.variant !== undefined && !['tile','compact','full'].includes(config.variant)) throw new Error('variant: tile / compact / full');
    if (config.tap_target !== undefined && !['full','energy','more-info'].includes(config.tap_target)) throw new Error('tap_target: full / energy / more-info');
    if (config.entity !== undefined && config.tap_target === 'more-info' && (typeof config.entity !== 'string' || !/^[a-z_]+\.[a-z0-9_]+$/.test(config.entity))) throw new Error('more-info: choose an entity / wybierz encję');

    if (config.tabs !== undefined && (!Array.isArray(config.tabs) || !config.tabs.length || config.tabs.some(id => !tabs.includes(id)) || new Set(config.tabs).size !== config.tabs.length)) throw new Error('tabs: choose at least one known visible tab / wybierz widoczną zakładkę');
    if (config.default_tab !== undefined && !visible(config).includes(config.default_tab)) throw new Error('default_tab must be a visible tab / domyślna zakładka musi być widoczna');
    if(config.period_default!==undefined&&!['day','week','month','year'].includes(config.period_default))throw new Error('period_default: day / week / month / year');
    if(config.show_alternatives!==undefined&&typeof config.show_alternatives!=='boolean')throw new Error('show_alternatives: boolean');
    for (const option of ['compact', 'show_help', 'show_support']) if (config[option] !== undefined && typeof config[option] !== 'boolean') throw new Error(`${option}: expected true or false`);
    if (config.chart_hours !== undefined && (!Number.isInteger(config.chart_hours) || config.chart_hours < 1 || config.chart_hours > 744)) throw new Error('chart_hours: 1–744 whole hours / pełnych godzin');
  };
  const navigationButtons = host => [...host.shadowRoot.querySelectorAll('.tabs [data-tab]')]
    .filter(button => !button.hidden && !button.disabled && visible(host._config || {}).includes(button.dataset.tab));
  const syncNavigation = host => {
    const buttons = navigationButtons(host);
    for (const button of host.shadowRoot.querySelectorAll('.tabs [data-tab]')) {
      const active = buttons.includes(button) && button.dataset.tab === host[key];
      button.tabIndex = active ? 0 : -1;
      button.setAttribute('aria-selected', String(active));
    }
    const active = buttons.find(button => button.dataset.tab === host[key]);
    const track = active?.closest('.tabs');
    if (!track?.clientWidth) return;
    // Reveal horizontally without moving the page during ordinary hass updates.
    const point = active.getBoundingClientRect(), bounds = track.getBoundingClientRect();
    if (point.left < bounds.left) track.scrollLeft -= bounds.left - point.left;
    else if (point.right > bounds.right) track.scrollLeft += point.right - bounds.right;
  };
  const originalSet = Card.prototype.setConfig;
  Card.prototype.setConfig = function(config = {}) {
    validate(config);
    const previous = this._optionsConfigV5;
    const changed = previous ? previous.default_tab !== config.default_tab : config.default_tab !== undefined;
    this._optionsConfigV5 = { ...config };
    if (previous && (variant(previous) !== variant(config) || previous.tap_target !== config.tap_target || previous.entity !== config.entity)) {
      this._optionsExpandedV5 = false; this._domBuilt = false;
      this._analysisHostV53?.stop();
    }
    if (this._config) {
      this._config = {...this._config};
      for (const option of ['default_tab','tabs','compact','variant','tap_target','entity','show_help','show_support','chart_hours']) if (!(option in config)) delete this._config[option];
    }
    if (changed || !visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    // Existing integrations own their complete configuration and backend context.
    try {
      const result = originalSet.call(this, config);
      if (this._hass && (name === 'ha-energy-insights' || simple(this))) this._render();
      return result;
    } finally { this._syncDashboardPlacementV53(); }
  };
  Card.prototype.getGridOptions = function() {
    if (simple(this)) return variant(this._config) === 'tile' ? {columns:6,rows:1,min_columns:6} : {columns:12,rows:'auto',min_columns:6};
    return {columns:variant(this._config || {}) === 'legacy' ? 6 : 12,min_columns:3,min_rows:variant(this._config || {}) === 'legacy' ? 2 : 3};
  };
  const originalSize = Card.prototype.getCardSize;
  Card.prototype.getCardSize = function() { return simple(this) ? (variant(this._config) === 'tile' ? 1 : 4) : variant(this._config || {}) === 'legacy' && !this._optionsExpandedV5 ? 3 : originalSize?.call(this) || 10; };
  const style = `:host{display:block;min-width:0;color-scheme:light;--bento-primary:var(--hat-primary-fill,var(--_hat-primary-fill,#2563eb));--bento-primary-hover:var(--hat-primary-fill,var(--_hat-primary-fill,#2563eb));--bento-on-primary:var(--hat-on-primary,var(--_hat-on-primary,#fff));--bento-text-muted:var(--hat-text-2,var(--secondary-text-color,#4b5563));--energy-value-blue:var(--hat-text,var(--primary-text-color,#111827));--energy-value-amber:var(--hat-warn-text,var(--_hat-warn-readout,#9a5b05));--energy-value-green:var(--hat-good-text,var(--_hat-good-text,#15803d));--energy-value-red:var(--hat-crit-text,var(--_hat-crit-text,#b91c1c));--energy-value-neutral:var(--hat-text-2,var(--secondary-text-color,#4b5563));--energy-value-purple:var(--hat-d2,var(--_hat-d2,#6250d6));--energy-success-button:var(--hat-primary-fill,var(--_hat-primary-fill,#2563eb));--energy-kpi-tone:var(--hat-chip,var(--secondary-background-color,#f3f4f6));--energy-kpi-tone-alt:var(--energy-kpi-tone)}
:host(.bento-dark){color-scheme:dark}
.stat,.stat-card{background:var(--energy-kpi-tone)}.stat:nth-child(even),.stat-card:nth-child(even){background:var(--energy-kpi-tone-alt)}
.btn-primary,button.btn-primary{color:var(--bento-on-primary)}
.ht-tariff-v3 [data-status=success]{color:var(--energy-value-green)}.ht-tariff-v3 [data-status=error]{color:var(--energy-value-red)}.ht-tariff-v3 [data-status=partial],.ht-tariff-v3 [data-status=unconfirmed]{color:var(--energy-value-amber)}
 [data-energy-options-help], [data-energy-compact]{box-sizing:border-box;padding:16px;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border-radius:12px;font-size:14px;overflow-wrap:anywhere} [data-energy-options-help] summary, [data-energy-expand]{min-height:44px;box-sizing:border-box;padding:12px;cursor:pointer} [data-energy-compact] dl{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:12px 0} [data-energy-compact] dt{font-size:13px;color:var(--secondary-text-color,#50545b)} [data-energy-compact] dd{margin:0 0 12px;font-weight:600;font-size:18px} [data-energy-expand]{color:var(--primary-text-color,#202124);background:var(--secondary-background-color,#eee);border:1px solid var(--divider-color,#888);border-radius:8px;font:inherit} [data-energy-options-help] summary:focus-visible,[data-energy-expand]:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer{flex:0 0 auto;padding:0;background:transparent;border-radius:0}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]{flex:1 1 100%;width:100%}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer>summary{min-height:44px;padding:12px 8px;font-size:14px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]>p{margin:0 0 8px}`;
  const simpleStyle = `:host{display:block;min-width:0;container-type:inline-size;container-name:energy-simple-card;--energy-simple-cheap:var(--hat-zone-cheap,var(--_hat-zone-cheap,#1baf7a));--energy-simple-expensive:var(--hat-zone-exp,var(--_hat-zone-exp,#2a78d6))}
:host(.bento-dark){--energy-simple-cheap:var(--hat-zone-cheap,#199e70);--energy-simple-expensive:var(--hat-zone-exp,#3987e5)}
[data-energy-simple]{box-sizing:border-box;display:grid;gap:8px;min-width:0;color:var(--primary-text-color);font-size:14px;cursor:pointer}
[data-energy-simple] h2,[data-energy-simple] p{margin:0} [data-energy-simple] h2{font-size:16px;line-height:22px;font-weight:600;min-width:0} [data-energy-name]{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-energy-simple] ha-icon{display:flex;align-items:center;justify-content:center;flex:none;width:36px;height:36px;border-radius:50%;--mdc-icon-size:20px;color:var(--primary-color);background:color-mix(in srgb,currentColor 14%,transparent)}
[data-energy-heading]{display:flex;align-items:center;gap:12px;min-width:0} [data-energy-heading-text]{flex:1;min-width:0}
[data-energy-primary-label]{font-size:12px;line-height:16px;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-energy-primary]{font-size:28px;line-height:34px;font-weight:600;letter-spacing:-.01em;font-variant-numeric:tabular-nums} [data-energy-unit]{font-size:14px;line-height:20px;font-weight:400;letter-spacing:normal;color:var(--secondary-text-color)}
[data-energy-simple] button,[data-energy-back]{min-height:44px;min-width:44px;padding:8px 12px;border:1px solid var(--divider-color);border-radius:var(--ha-card-border-radius,12px);background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;font-size:14px;cursor:pointer}
[data-energy-simple]:focus-visible,[data-energy-simple] button:focus-visible,[data-energy-back]:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}
[data-energy-simple=tile]{height:56px;grid-template-columns:36px minmax(0,1fr);column-gap:12px;row-gap:0;align-items:center;padding:0 8px 0 12px}
[data-energy-report-status][data-energy-simple=tile]{grid-template-columns:36px minmax(0,1fr) auto} [data-energy-simple=tile] [data-energy-heading]{display:contents} [data-energy-simple=tile] h2{font-size:14px;line-height:20px;font-weight:500}
[data-energy-simple=tile] [data-energy-primary]{font-size:12px;line-height:16px;font-weight:400;letter-spacing:normal;color:var(--secondary-text-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-energy-state-short]{display:none} [data-energy-simple=tile] button{position:relative;height:36px;min-height:36px;min-width:36px;padding:0 10px;border:0;border-radius:999px} [data-energy-simple=tile] button:after{content:'';position:absolute;inset:-4px}
[data-energy-simple=compact]{padding:12px 16px 16px;max-height:248px;overflow:hidden} [data-energy-values]{display:flex;align-items:baseline;gap:8px;min-width:0} [data-energy-cost]{font-size:20px;line-height:26px;font-weight:600;font-variant-numeric:tabular-nums} [data-energy-comparison]{margin-inline-start:auto;max-width:46%;font-size:12px;line-height:16px;text-align:end;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;color:var(--secondary-text-color)}
[data-energy-report-status] [data-energy-cost]{font-size:12px;line-height:16px;font-weight:400} [data-energy-report-status] [data-energy-comparison]{margin:0;max-width:none;text-align:start} [data-energy-secondary]{display:flex;flex-wrap:wrap;gap:4px 16px;font-size:12px;line-height:16px} [data-energy-zone-wrapper] p{font-size:12px;line-height:16px;margin:0 0 4px}
[data-energy-zonebar]{position:relative;height:28px;overflow:hidden;border:1px solid var(--divider-color);border-radius:4px;background:var(--disabled-color,var(--secondary-background-color))} [data-energy-zonebar] span{position:absolute;bottom:0;box-sizing:border-box;border-inline-end:1px solid var(--ha-card-background,var(--card-background-color))}[data-energy-measurement=unknown]{height:100%;background:transparent!important;border:1px dashed var(--secondary-text-color)}[data-energy-zone-axis]{display:flex;justify-content:space-between;font-size:12px;line-height:16px;color:var(--secondary-text-color)} [data-energy-zone=cheap]{background:var(--energy-simple-cheap)} [data-energy-zone=expensive]{background:var(--energy-simple-expensive)} [data-energy-zone=mixed]{background:var(--info-color,var(--primary-color))} [data-energy-zone=unknown]{background:var(--disabled-color,var(--secondary-background-color))}
[data-energy-zone-legend]{display:flex;gap:12px;flex-wrap:wrap;color:var(--secondary-text-color);font-size:12px;line-height:16px} [data-energy-zone-legend] span:before{content:'';display:inline-block;width:8px;height:8px;margin-inline-end:4px;background:var(--disabled-color)} [data-energy-zone-legend] [data-zone=cheap]:before{background:var(--energy-simple-cheap)} [data-energy-zone-legend] [data-zone=expensive]:before{background:var(--energy-simple-expensive)}`;
  const canOpen = host => {
    const config = host._config || {};
    if (!host.isConnected || host.preview === true || host._hass?.user?.is_active === false || !simple(host)) return false;
    const guard = host._getTariffHostV3().guard, token = guard.snapshot();
    return guard.available(token) && guard.current(token) && (config.tap_target !== 'more-info' || !!host._hass?.states?.[config.entity]);
  };
  const open = host => {
    if (!canOpen(host)) return;
    const config = host._config || {};
    if (config.tap_target === 'energy') {
      // Fixed HA route only: configuration cannot supply a URL.
      history.pushState(null, '', '/energy'); window.dispatchEvent(new CustomEvent('location-changed')); return;
    }
    if (config.tap_target === 'more-info') {
      if (host._hass?.states?.[config.entity]) host.dispatchEvent(new CustomEvent('hass-more-info', {detail:{entityId:config.entity},bubbles:true,composed:true}));
      return;
    }
    host._optionsExpandedV5 = true; host._domBuilt = false;
    if (host._hass && hassDescriptor?.set) hassDescriptor.set.call(host,host._hass);
    host._render();
    host.shadowRoot.querySelector('[data-energy-back]')?.focus({preventScroll:true});
  };
  // Reuse one real controller across context changes and remounts: disconnect()
  // clears authority/cache while its occupied raw request survives until settlement.
  const summaryFor = host => host._simpleSummaryV95 ||= (() => {
    let identity = null, needsRead = true, scheduled = false;
    const active = () => host.isConnected && simple(host) && variant(host._config || {}) === 'compact';
    const context = () => { const h = host._hass; return [h?.connection,h?.user?.id,h?.user?.is_active,h?.user?.is_admin,h?.user?.is_owner,JSON.stringify(h?.user?.groups || []),JSON.stringify(h?.user?.group_ids || []),h?.connected,h?.config?.time_zone,h?.connection?.connected,h?.callWS]; };
    const same = (a,b) => a && b && a.every((value,index) => value === b[index]);
    const paint = () => {
      if (scheduled) return;
      scheduled = true; queueMicrotask(() => { scheduled = false; if (active()) host._render(); });
    };
    const binding = host._getTariffHostV3().summary({onChange:paint,onInvalidate:() => { needsRead = true; paint(); }});
    const stop = () => { identity = null; needsRead = true; binding.stop(); };
    const state = () => {
      const next = context();
      if (!same(identity,next)) { binding.stop(); identity = next; needsRead = true; }
      // observe() masks unacknowledged data and immediately revokes stale snapshots.
      const current = binding.observe();
      if (active() && needsRead) {
        needsRead = false;
        void binding.read({period:'day',comparison:'previous'}).then(paint);
      }
      return current;
    };
    return {state,stop};
  })();
  const tileFor = host => host._simpleTileV95 ||= (() => {
    const tariff = host._getTariffHostV3();
    let attemptedEpoch = null, unsubscribe = null, timer = null;
    const active = () => host.isConnected && simple(host) && variant(host._config || {}) === 'tile';
    const paint = () => {
      // Run after the raw guard and tariff load promise both settle.
      if (timer !== null) return;
      timer = setTimeout(() => { timer = null; if (active()) host._render(); },0);
    };
    const stop = () => { unsubscribe?.(); unsubscribe = null; clearTimeout(timer); timer = null; attemptedEpoch = null; };
    const state = () => {
      if (!unsubscribe) unsubscribe = tariff.guard.subscribeWire(paint);
      const token = tariff.guard.snapshot();
      if (active() && !Object.hasOwn(host._config || {},'tariff_profile') && tariff.guard.available(token) &&
          host._sharedTariffReadStatus !== 'success' && attemptedEpoch !== token.epoch && !tariff.guard.occupied()) {
        attemptedEpoch = token.epoch;
        // This is the existing bounded shared-tariff read, independent of the
        // analysis subscription/permission. Never load SMTP or schedule settings.
        void tariff.load().then(paint);
      }
      return tariff.backend.snapshot();
    };
    return {state,stop};
  })();
  // The backend aligns unfinished current calendar days to the previous local
  // cutoff. A ready full previous-day total is not proof of this comparison.
  const elapsedComparison = analysis => {
    const p = analysis?.period, c = analysis?.comparisons?.previous, b = c?.baseline_periods?.length === 1 ? c.baseline_periods[0] : null;
    const stamp = value => typeof value === 'string' ? Date.parse(value) : NaN;
    const day = value => typeof value === 'string' ? value.slice(0,10) : '';
    const clock = value => typeof value === 'string' ? value.slice(11,19) : '';
    const ready = row => row?.status === 'ready' && row.reason === null && row.partial === true && row.calendar_clamped === false &&
      Array.isArray(row.clamps) && row.clamps.length === 0 && row.recorder_hour_aligned === true &&
      stamp(row.start) === stamp(row.local_start) && stamp(row.end) === stamp(row.local_end) &&
      stamp(row.calendar_end) === stamp(row.calendar_local_end) && stamp(row.start) < stamp(row.end) && stamp(row.end) < stamp(row.calendar_end) &&
      clock(row.local_start) === '00:00:00' && day(row.local_start) === day(row.local_end);
    if (p?.kind !== 'day' || !ready(p) || !ready(b) || p.timezone !== b.timezone || p.timezone !== analysis.context?.measurement_timezone ||
        c?.status !== 'ready' || c.reason !== null || c.comparison_scope !== 'calendar_totals' ||
        c.chart?.status !== 'ready' || c.chart.reconciles_comparison_energy !== true ||
        clock(p.local_end) !== clock(b.local_end) || p.end_fold !== b.end_fold ||
        ![0,1].includes(p.end_fold) || ![0,1].includes(b.end_fold) ||
        !((typeof c.percent === 'number' || typeof c.percent === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(c.percent)) && Number.isFinite(Number(c.percent)))) return null;
    const prior = new Date(stamp(day(p.local_start) + 'T00:00:00Z') - 86400000);
    if (!Number.isFinite(prior.getTime()) || prior.toISOString().slice(0,10) !== day(b.local_start)) return null;
    try {
      const parts = new Intl.DateTimeFormat('en',{timeZone:p.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(analysis.generated_at));
      const fields = Object.fromEntries(parts.map(part => [part.type,part.value]));
      if (`${fields.year}-${fields.month}-${fields.day}` !== day(p.local_start)) return null;
    } catch (_) { return null; }
    return {percent:c.percent,cutoff:p.end,baseline:c.baseline_kwh};
  };
  const paintZoneBar = (bar, analysis, host, format) => {
    if (!bar) return;
    bar.replaceChildren();
    const unknown = t(host,'Unknown','Brak danych');
    const names = {cheap:t(host,'Cheap','Tania'),expensive:t(host,'Expensive','Droga'),mixed:t(host,'Mixed','Mieszana')};
    const p = analysis?.period, chart = analysis?.chart, window = analysis?.period_summary?.window;
    const start = Date.parse(p?.start), end = Date.parse(p?.calendar_end), observed = Date.parse(p?.end);
    const rows = chart?.bins;
    const note = t(host,'Measured day energy with tariff zones; missing measurements are not zero.','Zmierzona energia doby w strefach taryfy; brak pomiaru nie oznacza zera.');
    const descriptions = [];
    bar.setAttribute('aria-label',`${note} ${unknown}`);
    // Position/width are time geometry only. Never sum bins, quantities or costs.
    if (p?.kind !== 'day' || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || end-start > 48*3600000 ||
        !Number.isFinite(observed) || observed > end || window?.start !== p.start || window?.end !== p.end || window?.timezone !== p.timezone ||
        chart?.timezone !== p.timezone || chart?.status !== 'ready' || chart.coverage_kind !== 'complete_household_hours' || chart.fixed_fee_scope !== 'household_period_only' ||
        !Array.isArray(rows) || rows.length > 48) return;
    const measured = row => row.complete === true && row.expected_seconds === (row.to-row.from)/1000 && row.measured_seconds === row.expected_seconds &&
      (typeof row.kwh === 'number' || typeof row.kwh === 'string' && row.kwh.trim() !== '') && Number.isFinite(Number(row.kwh)) && Number(row.kwh) >= 0 && String(row.recorded_kwh) === String(row.kwh);
    const comparison=analysis.comparisons?.previous,baseline=comparison?.baseline_analysis;
    const previousRows=comparison?.status==='ready' && comparison.reason===null && comparison.comparison_scope==='calendar_totals' &&
      baseline?.schema===2 && baseline.period?.kind==='day' && baseline.period.timezone===p.timezone &&
      baseline.chart?.status==='ready' && baseline.chart.timezone===p.timezone && baseline.chart.coverage_kind==='complete_household_hours' &&
      baseline.chart.fixed_fee_scope==='household_period_only' && Array.isArray(baseline.chart.bins) && baseline.chart.bins.length<=48 ? baseline.chart.bins : [];
    // Geometry shares the largest proven measured hour today/yesterday; no quantities or costs are recomputed.
    const maximum = Math.max(0,...[...rows,...previousRows].filter(measured).map(row=>Number(row.kwh)));
    let last = start;
    for (const row of rows) {
      if (!Number.isFinite(row.from) || !Number.isFinite(row.to) || row.to <= row.from || row.from < last || row.from < start || row.to > observed ||
          Date.parse(row.start) !== row.from || Date.parse(row.end) !== row.to) { bar.replaceChildren(); bar.setAttribute('aria-label',`${note} ${unknown}`); return; }
      last = row.to;
      const z = row.zone_breakdown, zone = z?.zones?.length === 1 ? z.zones[0] : null;
      const rates = (analysis.rates || []).filter(rate => rate.version_id === zone?.version_id);
      const definitions = rates.length === 1 ? (rates[0].profile?.zones || []).filter(item => item.id === zone?.zone_id) : [];
      const classification = definitions.length === 1 ? definitions[0].classification : null;
      const proven = row.complete === true && row.expected_seconds === (row.to-row.from)/1000 && row.measured_seconds === row.expected_seconds &&
        row.currency === analysis.totals?.currency && row.price_basis === analysis.totals?.price_basis && row.kwh !== null && row.kwh !== undefined &&
        z?.status === 'ready' && z.reason === null && z.scope === 'complete_household_hours' && z.fixed_fee_scope === 'household_period_only' &&
        z.reconciles_recorded_kwh === true && z.reconciles_known_costs === true && zone?.complete === true && zone.measured_seconds === row.measured_seconds &&
        z.currency === row.currency && z.price_basis === row.price_basis && String(zone.kwh) === String(row.kwh) && String(row.recorded_kwh) === String(row.kwh) &&
        String(zone.recorded_kwh) === String(row.kwh) && Object.hasOwn(names,classification);
      const known = measured(row);
      const label = proven ? names[classification] : unknown;
      const description = `${format.pointLabel(row.start)}–${format.pointLabel(row.end)}: ${known ? format.number(row.kwh,{minimumFractionDigits:1,maximumFractionDigits:1}) + ' kWh' : unknown} · ${label}`;
      const segment = document.createElement('span');
      segment.dataset.energyZone = proven ? classification : 'unknown';
      segment.dataset.energyMeasurement = known ? 'ready' : 'unknown';
      if (known) segment.style.height = `${maximum > 0 ? 100*Number(row.kwh)/maximum : 0}%`;
      segment.style.left = `${100*(row.from-start)/(end-start)}%`;
      segment.style.width = `${100*(row.to-row.from)/(end-start)}%`;
      segment.title = description; segment.setAttribute('aria-hidden','true');
      bar.append(segment); descriptions.push(description);
    }
    bar.setAttribute('aria-label',[note,...descriptions,observed < end ? t(host,'Remaining time: Unknown','Pozostały czas: brak danych') : ''].filter(Boolean).join(' '));
  };
  const compactActionsStyle = '[data-energy-simple=compact] [data-energy-actions]{grid-column:1/-1;display:flex;gap:8px;flex-wrap:wrap}[data-energy-simple=compact] [data-energy-actions] button{flex:1 1 120px;min-width:0}';
  const reportStatusStyle = '[data-energy-report-status][data-energy-simple=compact] [data-energy-primary]{font-size:14px;line-height:20px}';
  const narrowSimpleStyle = `@container energy-simple-card (max-width:279px){
    [data-energy-state-long]{display:none} [data-energy-state-short]{display:inline}
  }
  @container energy-simple-card (max-width:219px){
    [data-energy-simple=tile] button{display:none}
  }
  @container energy-simple-card (max-width:320px){
    [data-energy-values]{flex-wrap:wrap} [data-energy-comparison]{max-width:100%;flex-basis:100%;text-align:start;margin-inline-start:0}
    [data-energy-report-status][data-energy-simple=compact]{padding:6px;gap:2px}
    [data-energy-report-status] [data-energy-actions]{flex-wrap:nowrap}
    [data-energy-report-status] [data-energy-actions] button{flex:1 1 0;min-width:44px;padding-inline:4px}
  }`;

  const narrowEnergyStyle = `
  [data-energy-simple=compact]:not([data-energy-report-status]){overflow:auto;scrollbar-width:thin}
  [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-zone-axis]{position:relative;min-height:16px}
  [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-zone-axis] span{position:absolute;white-space:nowrap;line-height:16px}
  @container energy-simple-card (max-width:279px){
    [data-energy-simple=compact]:not([data-energy-report-status]){padding:8px;gap:4px}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-heading]{gap:8px;align-items:flex-start}
    [data-energy-simple=compact]:not([data-energy-report-status]) ha-icon{width:28px;height:28px;--mdc-icon-size:18px}
    [data-energy-simple=compact]:not([data-energy-report-status]) h2{font-size:14px;line-height:18px}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-name],
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-primary-label]{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-values]{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 8px;align-items:baseline}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-primary]{font-size:18px;line-height:22px;min-width:0;overflow-wrap:anywhere}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-cost]{font-size:16px;line-height:22px;min-width:0;text-align:end;overflow-wrap:anywhere}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-unit]{font-size:12px;line-height:16px;white-space:nowrap}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-comparison]{grid-column:1/-1;display:block;max-width:none;margin:0;text-align:start;-webkit-line-clamp:unset;overflow:visible;overflow-wrap:anywhere}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-zonebar]{height:20px}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-zone-legend]{gap:0 8px}
    [data-energy-simple=compact]:not([data-energy-report-status]) [data-energy-zone-legend] span{white-space:nowrap}
  }`;

  const emailStatusFor = host => host._emailStatusV100 ||= (() => {
    let scheduled = false;
    const active = () => name === 'ha-energy-email' && host.isConnected && host.preview !== true && simple(host);
    return host._getTariffHostV3().reportStatus({isActive:active,wantsExecute:() => active() && variant(host._config || {}) === 'compact' && visible(host._config || {}).includes('send') && host._hass?.user?.is_admin === true,onChange:() => {
      if (scheduled) return;
      scheduled = true; queueMicrotask(() => { scheduled = false; if (active()) host._render(); });
    }});
  })();
  const stopCompactSend = (host, purge = true) => {
    const active = host._emailCompactSendFlowV106;
    delete host._emailCompactSendFlowV106;
    host._emailCompactSendUnsubscribeV106?.(); delete host._emailCompactSendUnsubscribeV106;
    if (!active) return;
    const prior = host._emailCompactSendPriorV106; delete host._emailCompactSendPriorV106;
    if (prior) { host._firstRender = prior.firstRender; host._initialDiscoveryStartedV3 = prior.discovery; host._activeTab = prior.tab; }
    host._optionsExpandedV5 = false; host._domBuilt = false;
    if (purge) host._clearEmailContext?.();
  };
  const openCompactSend = async host => {
    if (name !== 'ha-energy-email' || host.preview === true || !host.isConnected || !simple(host) || variant(host._config || {}) !== 'compact' || !visible(host._config || {}).includes('send') || host._hass?.user?.is_admin !== true) return;
    const guard = host._getTariffHostV3().guard, token = guard.snapshot();
    const config = JSON.stringify(host._optionsConfigV5);
    if (!guard.current(token,true) || guard.occupied()) return;
    const permitted = await emailStatusFor(host).authorizeExecute();
    if (!host.isConnected || host.preview === true || !simple(host) || variant(host._config || {}) !== 'compact' || !visible(host._config || {}).includes('send') || JSON.stringify(host._optionsConfigV5) !== config || !guard.current(token,true)) return;
    if (!permitted) { host.shadowRoot.querySelector('[data-energy-open]')?.focus({preventScroll:true}); return; }
    // Navigation only. The existing form owns period choice, recipient review and the
    // final send buttons; neither a cadence nor a dispatch is selected here.
    host._emailCompactSendPriorV106 = {firstRender:host._firstRender,discovery:host._initialDiscoveryStartedV3,tab:host._activeTab};
    host._emailCompactSendFlowV106 = true;
    host._initialDiscoveryStartedV3 = false;
    host._optionsExpandedV5 = true; host._domBuilt = false;
    // Initialize the native identity in its existing no-discovery Config route,
    // then open Send. The send form needs bounded settings/previews, not the
    // legacy overview's Recorder/device discovery pipeline.
    host._activeTab = 'config';
    if (hassDescriptor?.set) hassDescriptor.set.call(host,host._hass);
    host.setActiveTab('send');
    host._emailCompactSendUnsubscribeV106 = guard.subscribe(() => {
      stopCompactSend(host); if (host.isConnected) host._render();
    });
    host.shadowRoot.querySelector('#mail-period-mode')?.focus({preventScroll:true});
    // Private settings are read only after this explicit, freshly authorized
    // navigation; they never become a prerequisite of the compact status DTO.
    void host._loadEmailBackendConfig?.().catch(() => {});
  };
  const renderSimple = host => {
    const root = host.shadowRoot, config = host._config || {}, mode = variant(config);
    const unknown = t(host,'Unknown','Brak danych'), email = name === 'ha-energy-email';
    const tariffTile = !email && mode === 'tile';
    const summary = !email && mode === 'compact' ? summaryFor(host).state() : null;
    const analysis = summary?.status === 'ready' ? summary.snapshot : null;
    const snapshot = !email && mode === 'tile' ? tileFor(host).state() : null;
    const format = createFormatUi.forHass(host._hass);
    const reportState = email ? emailStatusFor(host).state() : null;
    const report = reportState?.status === 'ready' ? reportState.snapshot : null;
    const nextReport = report?.schedule_state === 'enabled' && report.next_report_at ? format.dateTime(report.next_report_at) || unknown : unknown;
    const attempt = report?.history_state === 'ready' ? report.last_attempt : null;
    const lastAttempt = attempt ? format.dateTime(attempt.timestamp) || unknown : unknown;
    const outcomes = {
      accepted_by_smtp:t(host,'Mail server accepted; delivery unconfirmed','Serwer poczty przyjął; doręczenie niepotwierdzone'),
      preparation_failed:t(host,'Preparation failed','Przygotowanie nieudane'),authentication_failed:t(host,'Authentication failed','Uwierzytelnienie nieudane'),
      recipients_refused:t(host,'Recipients refused','Odbiorcy odrzuceni'),partial_acceptance:t(host,'Partial SMTP acceptance','Częściowe przyjęcie przez SMTP'),
      tls_failed:t(host,'TLS failed','Błąd TLS'),transport_outcome_unknown:t(host,'Transport outcome unknown','Wynik transportu nieznany'),
      send_failed:t(host,'Attempt failed','Próba nieudana'),cancelled_outcome_unknown:t(host,'Cancelled; outcome unknown','Anulowano; wynik nieznany'),outcome_unknown:unknown
    };
    const result = attempt ? outcomes[attempt.outcome] || unknown : unknown;
    const recipients = attempt?.recipient_count !== null && attempt?.recipient_count !== undefined ? format.number(attempt.recipient_count) : unknown;
    const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value));
    const total = analysis?.totals, elapsed = elapsedComparison(analysis);
    // Display bounds preserve a nonzero producer reading that rounds below the visible unit.
    const brief = (value,places) => {
      const options={minimumFractionDigits:places,maximumFractionDigits:places},shown=format.number(value,options),raw=String(value).trim();
      return /[1-9]/.test(raw.split(/[eE]/)[0]) && shown.replace(/^[-+−]/,'')===format.number('0',options)
        ? (raw.startsWith('-')?'>−':'<')+format.number('0.'+'0'.repeat(places-1)+'1',options) : shown;
    };
    const energy = total?.measurement_complete !== false && numeric(total?.kwh) ? `${brief(total.kwh,1)} kWh` : unknown;
    const native = !analysis?.active_tariff_id && analysis?.native_pricing?.source === 'ha_energy' && analysis?.native_pricing?.schema === 1 ? analysis.native_pricing.period_cost : null;
    const nativeReady = native?.status === 'ready' && native.coverage?.complete === true && numeric(native.amount) && /^[A-Z]{3}$/.test(native.currency || '');
    const bookReady = total?.pricing_complete === true && numeric(total.usage_cost) && /^[A-Z]{3}$/.test(total.currency || '');
    const money = total?.pricing_complete === true && numeric(total.usage_cost) && /^[A-Z]{3}$/.test(total.currency || '')
      ? `${brief(total.usage_cost,2)} ${total.currency}` : nativeReady ? `${brief(native.amount,2)} ${native.currency}` : unknown;
    const difference = elapsed ? `${format.number(elapsed.percent,{maximumFractionDigits:1,signDisplay:'exceptZero'})}%` : unknown;
    const comparisonName = elapsed ? `${t(host,'vs yesterday through','vs wczoraj do')} ${format.clock(elapsed.cutoff)}` : t(host,'Yesterday at same hour','Wczoraj o tej samej godzinie');
    const zones = {cheap:t(host,'Cheap','Tania'),expensive:t(host,'Expensive','Droga'),mixed:t(host,'Mixed','Mieszana')};
    const zone = snapshot?.status !== 'unavailable' && snapshot?.current?.available === true ? zones[snapshot.current.zone_class] || unknown : unknown;
    const next = snapshot?.status !== 'unavailable' ? snapshot?.next_cheap : null;
    const nextKnown = next?.status === 'known' && typeof next.start === 'string' && Number.isFinite(Date.parse(next.start));
    const nextLabel = nextKnown
      ? format.pointLabel(next.start) || unknown : next?.status === 'not_found_in_horizon' ? t(host,'None in next 8 days','Brak w kolejnych 8 dniach') : unknown;
    let section = root.querySelector(`[data-energy-simple="${mode}"]`);
    if (!section) {
      host._analysisHostV53?.stop(); host._optionsResizeV5?.disconnect();
      host._featureAccessV53?.stop(); host._reportHostV53?.stop();
      host._timers?.forEach(timer => clearTimeout(timer)); host._timers?.clear(); host._renderScheduled = false;
      root.innerHTML = `<style>${host._getTariffHostV3().ui().css}${simpleStyle}${email ? compactActionsStyle + reportStatusStyle : ''}${narrowSimpleStyle}${narrowEnergyStyle}</style><ha-card data-energy-simple="${mode}" role="button" tabindex="0"${!email ? ' data-energy-open' : ''}><div data-energy-heading><ha-icon aria-hidden="true"></ha-icon><div data-energy-heading-text><h2><span data-energy-name></span></h2>${mode === 'compact' ? '<p data-energy-primary-label></p>' : '<div data-energy-primary role="status"></div>'}</div></div>${mode === 'compact' ? email ? '<div data-energy-primary role="status"></div><div data-energy-secondary><span data-energy-cost></span><span data-energy-comparison></span></div>' : '<div data-energy-values><div data-energy-primary role="status"></div><span data-energy-cost></span><span data-energy-comparison></span></div><div data-energy-zone-wrapper><p data-energy-zone-caption></p><div data-energy-zonebar role="img"></div><div data-energy-zone-axis></div><div data-energy-zone-legend></div></div>' : ''}${email ? mode === 'compact' ? '<div data-energy-actions><button type="button" data-energy-open></button></div>' : '<button type="button" data-energy-open></button>' : ''}</ha-card>`;
      section = root.querySelector('[data-energy-simple]');
      section.addEventListener('click', event => {
        if (event.target.closest?.('button,a,input,select,textarea')) return;
        open(host);
      });
      section.addEventListener('keydown', event => {
        if (event.target !== section || !['Enter',' '].includes(event.key)) return;
        event.preventDefault();
        if (!event.repeat) open(host);
      });
      const openButton = section.querySelector('[data-energy-open]');
      openButton?.addEventListener('click', () => open(host));
      openButton?.addEventListener('keydown', event => {
        if (['Enter',' '].includes(event.key) && !event.repeat) { event.preventDefault(); event.currentTarget.click(); }
      });
    }
    if (email) section.dataset.energyReportStatus = '';
    if (tariffTile) section.dataset.energyTariffTile = '';
    const grant = reportState?.capabilities;
    const showSend = email && mode === 'compact' && visible(config).includes('send') && host.preview !== true && host._hass?.user?.is_admin === true && grant?.visible === true;
    let send = section.querySelector('[data-energy-send-now]');
    if (!showSend) send?.remove();
    else {
      if (!send) {
        send = document.createElement('button'); send.type = 'button'; send.dataset.energySendNow = '';
        send.addEventListener('click', () => { void openCompactSend(host); });
        send.addEventListener('keydown', event => { if (['Enter',' '].includes(event.key) && !event.repeat) { event.preventDefault(); event.currentTarget.click(); } });
        section.querySelector('[data-energy-actions]').append(send);
      }
      send.textContent = t(host,'Send now','Wyślij teraz');
      send.title = grant.execute === true ? t(host,'Review the recipient and choose a period in the send form; nothing is sent yet.','Sprawdź odbiorcę i wybierz okres w formularzu; nic nie jest jeszcze wysyłane.') : t(host,'Sending is unavailable for this account.','Wysyłka jest niedostępna dla tego konta.');
      send.setAttribute('aria-label',t(host,'Send now — open send form','Wyślij teraz — otwórz formularz wysyłki'));
      send.disabled = grant.execute !== true || reportState.busy || host._getTariffHostV3().guard.occupied();
    }
    const icon = section.querySelector('ha-icon');
    icon.setAttribute('icon', email ? 'mdi:email-fast-outline' : 'mdi:lightning-bolt');
    const tone = snapshot?.status !== 'unavailable' && snapshot?.current?.available === true ? snapshot.current.zone_class : null;
    icon.style.color = {cheap:'var(--energy-simple-cheap)',expensive:'var(--energy-simple-expensive)',mixed:'var(--warning-color,var(--primary-color))'}[tone] || 'var(--primary-color)';
    const surfaceName = config.title && config.title !== title ? config.title : email ? t(host,'Energy report','Raport energii') : mode === 'compact' ? t(host,'Energy today','Energia dziś') : t(host,'Energy','Energia');
    section.querySelector('[data-energy-name]').textContent = surfaceName;
    section.querySelector('[data-energy-name]').title = surfaceName;
    const primary = section.querySelector('[data-energy-primary]');
    const shortReport = report?.schedule_state === 'enabled' && report.next_report_at ? `${format.date(report.next_report_at,true)} · ${format.clock(report.next_report_at)}` : unknown;
    if (mode === 'tile') {
      let long = primary.querySelector('[data-energy-state-long]'), short = primary.querySelector('[data-energy-state-short]');
      if (!long || !short) {
        long = document.createElement('span'); long.dataset.energyStateLong = '';
        short = document.createElement('span'); short.dataset.energyStateShort = '';
        primary.replaceChildren(long,short);
      }
      const nextShort = nextKnown ? `${t(host,'Cheap from','Tania od')} ${format.clock(next.start) || unknown}` : nextLabel;
      long.textContent = email ? shortReport : `${zone} · ${nextShort}`;
      short.textContent = email ? shortReport : nextKnown ? `${zone} · ${format.clock(next.start) || unknown}` : `${zone} · ${nextLabel}`;
    } else if (email) primary.textContent = nextReport;
    else {
      primary.replaceChildren(document.createTextNode(total?.measurement_complete !== false && numeric(total?.kwh) ? brief(total.kwh,1) + ' ' : unknown));
      if (energy !== unknown) { const unit = document.createElement('span'); unit.dataset.energyUnit = ''; unit.textContent = 'kWh'; primary.append(unit); }
    }
    primary.title = email ? `${t(host,'Scheduled report','Zaplanowany raport')}: ${nextReport}` : mode === 'tile' ? `${zone} · ${nextKnown ? t(host,'Cheap from','Tania od') + ' ' : ''}${nextLabel}` : primary.textContent;
    primary.setAttribute('aria-label',primary.title);
    if (mode === 'compact') {
      const primaryLabel=section.querySelector('[data-energy-primary-label]');
      const activeTariff=analysis?.active_tariff_id ? analysis.alternatives?.find(row=>row.tariff_id===analysis.active_tariff_id)?.tariff_name : null;
      const tariffLabel=typeof activeTariff==='string' && activeTariff.trim() ? activeTariff : unknown;
      primaryLabel.textContent = email ? t(host,'Scheduled report','Zaplanowany raport') : analysis?.period?.end ? `${t(host,'Through','Do')} ${format.clock(analysis.period.end) || unknown} · ${nativeReady?t(host,'Home Assistant Energy','Home Assistant Energy'):t(host,'Tariff','Taryfa')+' '+tariffLabel}` : unknown;
      primaryLabel.title=primaryLabel.textContent;
      section.querySelector('[data-energy-cost]').textContent = email ? `${t(host,'Last attempt','Ostatnia próba')}: ${lastAttempt}` : money;
      const costLine = section.querySelector('[data-energy-cost]');
      if (!email && money !== unknown) {
        const currency = bookReady ? total.currency : native.currency;
        costLine.replaceChildren(document.createTextNode(money.slice(0,-currency.length)));
        const unit = document.createElement('span'); unit.dataset.energyUnit = ''; unit.textContent = currency; costLine.append(unit);
      }
      costLine.title = !email && !bookReady && nativeReady ? `${t(host,'Cost recorded in HA','Koszt zapisany w HA')}: ${costLine.textContent}. ${t(host,'Source: Home Assistant Energy. Cost breakdown and fixed fees are unknown; this is not a complete bill.','Źródło: Home Assistant Energy. Rozbicie kosztu i opłaty stałe są nieznane; to nie jest pełny rachunek.')}` : email ? costLine.textContent : `${t(host,'Usage cost','Koszt zużycia')}: ${money}`;
      costLine.setAttribute('aria-label',costLine.title);
      section.querySelector('[data-energy-comparison]').textContent = email ? `${t(host,'Result','Wynik')}: ${result} · ${t(host,'Recipients of that attempt','Odbiorcy tej próby')}: ${recipients}` : elapsed ? `${difference} ${comparisonName}${numeric(elapsed.baseline) ? ` (${brief(elapsed.baseline,1)} kWh)` : ''}` : `${comparisonName}: ${difference}`;
      const caption = section.querySelector('[data-energy-zone-caption]');
      if (caption) caption.textContent = t(host,'Measured day energy','Zmierzona energia w ciągu dnia');
      paintZoneBar(section.querySelector('[data-energy-zonebar]'),analysis,host,format);
      const comparison = section.querySelector('[data-energy-comparison]');
      comparison.title = comparison.textContent;
      const axis = section.querySelector('[data-energy-zone-axis]');
      if (axis) {
        axis.replaceChildren();
        const start = Date.parse(analysis?.period?.start), end = Date.parse(analysis?.period?.calendar_end);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start && end-start <= 48*3600000) {
          // Reuse the format layer's compact 24-hour axis notation. Full point
          // labels retain the user's 12/24-hour clock and DST offsets.
          const values=Array.from({length:Math.ceil((end-start)/3600000)},(_,index)=>new Date(start+index*3600000).toISOString());
          const ticks=format.chartTicks(values,'hour');
          const selected=[...new Set([0,Math.floor((ticks.length-1)/2),ticks.length-1])].map(index=>ticks[index]).filter(Boolean);
          axis.setAttribute('aria-label',t(host,'Hourly ticks (24-hour notation)','Godziny osi (zapis 24-godzinny)'));
          for(const tick of selected){
            const value=values[tick.index],instant=Date.parse(value),position=100*(instant-start)/(end-start);
            const point=document.createElement('span');point.textContent=tick.label;point.title=format.pointLabel(value)||unknown;
            point.style.left=`${position}%`;point.style.transform=position<=10?'translateX(0)':position>=90?'translateX(-100%)':'translateX(-50%)';
            axis.append(point);
          }
        }
      }
      const legend = section.querySelector('[data-energy-zone-legend]');
      if (legend) {
        legend.replaceChildren();
        for (const [zone,label] of [['cheap',t(host,'Cheap','Tania')],['expensive',t(host,'Expensive','Droga')],['unknown',unknown]]) {
          const item = document.createElement('span'); item.dataset.zone = zone; item.textContent = label; legend.append(item);
        }
      }
    }
    const available = canOpen(host);
    section.setAttribute('aria-disabled',String(!available));
    section.tabIndex = available ? 0 : -1;
    section.setAttribute('aria-label',[surfaceName,primary.title,section.querySelector('[data-energy-cost]')?.getAttribute('aria-label'),section.querySelector('[data-energy-comparison]')?.textContent].filter(Boolean).join('. '));
    const button = section.querySelector('[data-energy-open]');
    if (button) {
      button.textContent = mode === 'tile' ? '✉' : t(host,'Open','Otwórz');
      button.setAttribute('aria-label',`${t(host,'Open','Otwórz')} ${surfaceName}`);
      button.disabled = !available;
    }
  };
  // Simple surfaces do not run the full cards' discovery/config/schedule paths.
  Card.prototype._applyThemeV150 = function() { this._getTariffHostV3().ui().applyTheme(this); };
  const hassDescriptor = Object.getOwnPropertyDescriptor(Card.prototype,'hass');
  if (hassDescriptor?.set) Object.defineProperty(Card.prototype,'hass',{...hassDescriptor,set(value) {
    try {
      // Observe a sender entered from compact before choosing the full setter.
      // A revoked context returns to compact before legacy full discovery can run.
      if (this._emailCompactSendFlowV106) { this._hass = value; this._tariffHostController?.guard.observe(); }
      // A real inert preview renders the actual card but does not start the
      // full surface's legacy discovery of SMTP, settings or schedules.
      if (!simple(this) && this.preview !== true) return hassDescriptor.set.call(this,value);
      this._hass = value;
      if (this.preview === true) this._lang = pl(this) ? 'pl' : 'en';
      this.classList.toggle('bento-dark',value?.themes?.darkMode === true);
      this._tariffHostController?.guard.observe();
      this._render();
    } finally { this._syncDashboardPlacementV53(); this._applyThemeV150(); }
  }});
  const connected = Card.prototype.connectedCallback;
  Card.prototype.connectedCallback = function() {
    try {
      if (!simple(this) && this.preview !== true) return connected?.call(this);
      this._tariffHostController?.guard.resume(); this._render();
    } finally { this._syncDashboardPlacementV53(); this._applyThemeV150(); }
  };
  for (const method of ['_repriceTariffV3','_syncAnalysisV53']) {
    const original = Card.prototype[method]; if (!original) continue;
    Card.prototype[method] = function(...args) { if (simple(this)) return this._render(); return original.apply(this,args); };
  }
  const render = Card.prototype._render;
  Card.prototype._render = function(...args) {
    try {
    // Preserve native showModal top-layer/focus state through ordinary source
    // updates. A source/role/config edge makes update() close it, then rendering resumes.
    const statisticsMount = this._energyStatisticsMountV110;
    if (statisticsMount?.isConnected && statisticsMount.querySelector('dialog[open]')) {
      this._energyStatisticsV110.update();
      if (statisticsMount.querySelector('dialog[open]')) return;
    }
    const placementMount = this._dashboardPlacementMountV53;
    if (placementMount?.isConnected && placementMount.querySelector('dialog[open]')) {
      this._dashboardPlacementV53.update();
      if (placementMount.querySelector('dialog[open]')) return;
    }
    const config = this._config || {};
    if (!simple(this) || this.preview === true) this._emailStatusV100?.stop();
    if (!simple(this) || variant(config) !== 'compact') this._simpleSummaryV95?.stop();
    if (!simple(this) || variant(config) !== 'tile') this._simpleTileV95?.stop();
    if (!visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    if (simple(this)) { renderSimple(this); return; }
    if (variant(config) === 'legacy' && !this._optionsExpandedV5) {
      this._getTariffHostV3?.().backend?.snapshot();
      const snapshot = this._energySnapshotV5;
      const format = createFormatUi.forHass(this._hass);
      const value = snapshot?.today?.usage_cost;
      const cost = typeof value === 'number' && Number.isFinite(value) && snapshot?.currency ? `${format.number(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${snapshot.currency}` : 'N/A';
      const classes = {cheap: t(this, 'Cheap', 'Tania'), expensive: t(this, 'Expensive', 'Droga'), mixed: t(this, 'Mixed', 'Mieszana')};
      const zone = snapshot?.current?.available === true ? classes[snapshot.current.zone_class] || 'N/A' : 'N/A';
      const next = snapshot?.next_cheap;
      const stamp = typeof next?.start === 'string' && Number.isFinite(Date.parse(next.start)) ? next.start : null;
      const cheap = next?.status === 'known' && stamp ? format.pointLabel(stamp) : next?.status === 'not_found_in_horizon' ? t(this, 'Not found in the next 8 days', 'Nie znaleziono w kolejnych 8 dniach') : 'N/A';
      const root = this.shadowRoot;
      let compact = root.querySelector('[data-energy-compact]');
      if (!compact) {
        root.innerHTML = `<style>${style}</style><section data-energy-compact><h2></h2><dl><dt></dt><dd data-cost></dd><dt></dt><dd data-zone></dd><dt></dt><dd data-next></dd></dl><p data-availability role="status"></p><button type="button" data-energy-expand></button></section>`;
        compact = root.querySelector('[data-energy-compact]');
        compact.querySelector('button').addEventListener('click', () => { this._optionsExpandedV5 = true; this._domBuilt = false; this._render(); const target = root.querySelector('[data-tab]:not([hidden])'); target?.focus({preventScroll:true}); });
      }
      compact.querySelector('h2').textContent = config.title ?? title;
      const names = [t(this, 'Cost today', 'Koszt dziś'),t(this, 'Current zone', 'Bieżąca strefa'),t(this, 'Next cheap period', 'Następny tani termin')];
      compact.querySelectorAll('dt').forEach((node, i) => node.textContent = names[i]);
      compact.querySelector('[data-cost]').textContent = cost;
      compact.querySelector('[data-zone]').textContent = zone;
      compact.querySelector('[data-next]').textContent = cheap;
      compact.querySelector('[data-availability]').textContent = !snapshot || snapshot.status === 'unavailable' || [cost,zone,cheap].includes('N/A') ? t(this, 'Some energy data is unavailable. N/A is not zero.', 'Część danych energii jest niedostępna. N/A nie oznacza zera.') : snapshot.status === 'partial' ? t(this, 'Partial energy data.', 'Niepełne dane energii.') : '';
      compact.querySelector('button').textContent = t(this, 'Open full view', 'Otwórz pełny widok');
      return;
    }
    const restoreBack = this.shadowRoot.activeElement?.matches('[data-energy-back]');
    const result = render.apply(this, args);
    this._applyCardOptionsV5();
    if (restoreBack) this.shadowRoot.querySelector('[data-energy-back]')?.focus({preventScroll:true});
    return result;
    } finally { this._syncDashboardPlacementV53(); this._applyThemeV150(); }
  };
  Card.prototype._applyCardOptionsV5 = function() {
    this._syncDashboardPlacementV53();
    if (simple(this)) return;
    const root = this.shadowRoot, config = this._config || {}, allowed = visible(config);
    if (this._optionsExpandedV5 && ['tile','compact'].includes(variant(config)) && !root.querySelector('[data-energy-back]')) {
      const css = document.createElement('style'); css.textContent = simpleStyle; root.append(css);
      const back = document.createElement('button'); back.type = 'button'; back.dataset.energyBack = '';
      back.textContent = t(this,'Back to summary','Wróć do podsumowania');
      back.addEventListener('click', () => { const fromSend = this._emailCompactSendFlowV106; stopCompactSend(this); this._optionsExpandedV5 = false; this._domBuilt = false; this._render(); (fromSend ? root.querySelector('[data-energy-send-now]') || root.querySelector('[data-energy-open]') : root.querySelector('[data-energy-open]'))?.focus({preventScroll:true}); });
      root.prepend(back);
    }
    const back = root.querySelector('[data-energy-back]');
    if (back) back.textContent = t(this,'Back to summary','Wróć do podsumowania');

    const heading = root.querySelector('[data-energy-card-title]'); if (heading) heading.textContent = config.title ?? title;
    for (const button of root.querySelectorAll('.tabs [data-tab]')) { button.hidden = !allowed.includes(button.dataset.tab); button.style.display = button.hidden ? 'none' : ''; }
    for (const option of root.querySelectorAll('.energy-tab-picker option, #email-tab-select option')) { option.hidden = !allowed.includes(option.value); option.disabled = option.hidden; }
    for (const select of root.querySelectorAll('.energy-tab-picker select, #email-tab-select')) select.value = this[key];
    syncNavigation(this);
    if (!this._optionsNavigationBoundV5) {
      this._optionsNavigationBoundV5 = true;
      // The ShadowRoot survives content redraws. Bind once and resolve live buttons.
      root.addEventListener('click', event => {
        if (event.target.closest?.('.tabs [data-tab]')) syncNavigation(this);
      });
      root.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const current = event.target.closest?.('.tabs [data-tab]');
        const buttons = navigationButtons(this), index = buttons.indexOf(current);
        if (index < 0) return;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
        event.preventDefault();
        const id = buttons[next].dataset.tab;
        buttons[next].click(); // Preserve each card's existing navigation and request guards.
        syncNavigation(this);
        navigationButtons(this).find(button => button.dataset.tab === id)?.focus({preventScroll:true});
      });
    }
    // Only optional guidance is affected. Warnings, unknowns and setup errors stay visible.
    const helpKey = [name, 'options-help', config.instance_id || 'default', this._hass?.user?.id || 'anonymous'].join(':');
    if (this._helpStorageContextV5 !== helpKey) {
      this._helpStorageContextV5 = helpKey;
      this._helpManualOpenV5 = null; // null = responsive default; booleans = explicit gestures.
      try {
        const saved = localStorage.getItem(helpKey);
        if (saved === 'closed' || saved === 'open') this._helpManualOpenV5 = saved === 'open';
      } catch (_) { /* In-memory manual choice still works when storage is unavailable. */ }
    }
    let help = root.querySelector('[data-energy-options-help]');
    if (!help && root.children.length) {
      const css = document.createElement('style'); css.textContent = style; root.append(css);
      help = document.createElement('details'); help.dataset.energyOptionsHelp = '';
      if (name === 'ha-energy-optimizer') help.classList.add('energy-options-help-optimizer');
      help.innerHTML = '<summary></summary><p></p>';
      // Native keyboard activation also produces a summary click. Record intent before
      // the browser changes `open`; programmatic/queued toggle events never save state.
      help.querySelector('summary').addEventListener('click', () => {
        if (root.querySelector('[data-energy-options-help]') !== help) return;
        this._helpManualOpenV5 = !help.open;
        try { localStorage.setItem(this._helpStorageContextV5, this._helpManualOpenV5 ? 'open' : 'closed'); }
        catch (_) { /* Preserve the explicit choice for this element. */ }
      });
    }
    if (!help) return;
    // Keep this disclosure immediately after the header, before both the narrow
    // picker and the normal tabs. Move an existing node only when its anchor changes.
    const header = root.querySelector('.panel-header, .header, .card-title');
    const navigation = root.querySelector('.energy-tab-picker, .email-tab-picker, .tabs');
    if (header) {
      if (header.nextElementSibling !== help) header.after(help);
    } else if (navigation) {
      if (help.nextElementSibling !== navigation) navigation.before(help);
    } else if (help.parentNode !== root) root.append(help);
    help.hidden = config.show_help === false;
    help.querySelector('summary').textContent = t(this, 'Help', 'Pomoc');
    help.querySelector('p').textContent = t(this, 'Card options change the view only. N/A means unavailable data. Hour limits apply to hourly charts, without changing calendar periods, measurements or tariff prices.', 'Opcje karty zmieniają tylko widok. N/A oznacza brak danych. Limit godzin dotyczy wykresów godzinowych, bez zmiany okresów kalendarza, pomiarów ani cen taryfy.');
    this._helpResizeV5 = width => {
      // A queued callback from a discarded render cannot update its detached disclosure.
      if (root.querySelector('[data-energy-options-help]') !== help) return;
      this._helpDefaultOpenV5 = width >= 600;
      help.open = this._helpManualOpenV5 ?? this._helpDefaultOpenV5;
    };
    this._helpResizeV5(this.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'function') {
      if (!this._optionsResizeV5) this._optionsResizeV5 = new ResizeObserver(entries => {
        if (entries[0]) this._helpResizeV5?.(entries[0].contentRect.width);
      });
      this._optionsResizeV5.observe(this); // Idempotent; resumes observation after reconnect.
    }
  };
  // Hour limits slice the presentation array, retaining source records and stable IDs.
  Card.prototype._limitChartRowsV5 = function(rows) {
    const hours = this._config?.chart_hours;
    if (!hours || !rows.length) return rows;
    const end = Math.max(...rows.map(row => Number(row.to || row.from)));
    return rows.filter(row => Number(row.from) >= end - hours * 3600000);
  };
  for (const method of ['_dashboardRowsV3','_patternsRows','_insightChartRowsV3']) {
    const original = Card.prototype[method]; if (!original) continue;
    Card.prototype[method] = function(...args) {
      const rows = original.apply(this,args);
      const hour = method === '_dashboardRowsV3' || (method === '_patternsRows' ? this._patternsState?.resolution === 'hour' : this._insightChartState?.resolution === 'hour');
      return hour && args[0] !== false ? this._limitChartRowsV5(rows) : rows;
    };
  }
  for (const method of ['_updateContent','_renderTab','_renderCurrentTab']) {
    const original = Card.prototype[method]; if (!original) continue;
    Card.prototype[method] = function(...args) { if (simple(this)) return this._render(); const value = original.apply(this,args); this._applyCardOptionsV5(); return value; };
  }
  const disconnect = Card.prototype.disconnectedCallback;
  Card.prototype.disconnectedCallback = function() { stopCompactSend(this); stopPlacement(this); this._emailStatusV100?.stop(); this._simpleSummaryV95?.stop(); this._simpleTileV95?.stop(); this._optionsResizeV5?.disconnect(); return disconnect?.call(this); };
  // Reuse existing editor text fields and their focus/caret-preserving synchronization.
  const editorRender = Editor.prototype._render;
  Editor.prototype._render = function(...args) { editorRender.apply(this,args); this._renderOptionsV5(); };
  Editor.prototype._renderOptionsV5 = function() {
    const root = this.shadowRoot;
    let fields = root.querySelector('[data-energy-option-fields]');
    if (!fields) {
      fields = document.createElement('div'); fields.dataset.energyOptionFields = '';
      fields.innerHTML = `<style>label[data-option-row]{display:flex;align-items:center;gap:8px;min-height:44px}select,input[type=number],input[type=search]{min-height:44px;box-sizing:border-box;width:100%;font:inherit;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#888);border-radius:8px;padding:8px}fieldset{margin:12px 0;border:1px solid var(--divider-color,#888)}[data-option-row] input{width:24px;height:24px;min-height:24px;margin:0}select:focus-visible,input:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}[data-config-error]{color:var(--energy-value-red,#b91c1c)}</style><label data-option-label="variant" for="cf_variant"></label><select id="cf_variant" data-config="variant"><option value="" data-variant-label="legacy"></option><option value="tile" data-variant-label="tile"></option><option value="compact" data-variant-label="compact"></option><option value="full" data-variant-label="full"></option></select><label data-option-label="tap_target" for="cf_tap_target"></label><select id="cf_tap_target" data-config="tap_target"><option value="full" data-target-label="full"></option><option value="energy" data-target-label="energy"></option><option value="more-info" data-target-label="more-info"></option></select><div data-entity-chooser><label data-option-label="entity_search" for="cf_entity_search"></label><input id="cf_entity_search" type="search" data-entity-search><label data-option-label="entity" for="cf_entity"></label><select id="cf_entity" data-config="entity"></select><p data-entity-hint></p></div><label data-option-label="default_tab" for="cf_default_tab"></label><select id="cf_default_tab" data-config="default_tab">${tabs.map(id=>`<option value="${id}"></option>`).join('')}</select><fieldset><legend data-option-label="tabs"></legend>${tabs.map(id=>`<label data-option-row><input type="checkbox" data-tab-option="${id}"><span data-tab-label="${id}"></span></label>`).join('')}</fieldset><label data-option-label="period_default" for="cf_period_default"></label><select id="cf_period_default" data-config="period_default">${['day','week','month','year'].map(v=>`<option value="${v}">${v}</option>`).join('')}</select>${['show_alternatives','compact','show_help','show_support'].map(id=>`<label data-option-row><input type="checkbox" data-config="${id}"><span data-option-label="${id}"></span></label>`).join('')}<label data-option-label="chart_hours" for="cf_chart_hours"></label><input id="cf_chart_hours" type="number" min="1" max="744" step="1" data-config="chart_hours"><p data-config-error role="alert"></p>`;
      root.append(fields);
      fields.addEventListener('input', event => { if (event.target.matches('[data-entity-search]')) this._renderOptionsV5(); });
      fields.addEventListener('change', event => {
        const field = event.target;
        if (!field.matches('[data-config],[data-tab-option]')) return;
        const candidate = {...this._config};
        if (field.dataset.tabOption) candidate.tabs = [...fields.querySelectorAll('[data-tab-option]:checked')].map(node=>node.dataset.tabOption);
        else { const option = field.dataset.config; if (['chart_hours','variant','entity'].includes(option) && field.value === '') delete candidate[option]; else candidate[option] = field.type === 'checkbox' ? field.checked : option === 'chart_hours' ? Number(field.value) : field.value; }
        // An implicit default is the first visible tab; explicit defaults must remain visible.
        try { validate(candidate); if (field.dataset.tabOption && !candidate.tabs.includes(candidate.default_tab || tabs[0])) throw new Error(t(this,'The default tab must remain visible.','Domyślna zakładka musi być widoczna.')); }
        catch(error) { fields.querySelector('[data-config-error]').textContent = error.message; this._renderOptionsV5(); return; }
        fields.querySelector('[data-config-error]').textContent = '';
        this._config = candidate;
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...candidate}},bubbles:true,composed:true}));
      });
    }
    const names = {period_default:t(this,'Default period','Domyślny okres'),show_alternatives:t(this,'Show tariff comparison','Pokaż porównanie taryf'),entity:t(this,'Existing entity for details','Istniejąca encja do szczegółów'),entity_search:t(this,'Find entity','Znajdź encję'),variant:t(this,'Variant','Wariant'),tap_target:t(this,'Open destination','Cel otwarcia'),default_tab:t(this,'Default tab','Domyślna zakładka'),tabs:t(this,'Visible tabs','Widoczne zakładki'),compact:t(this,'Compact view','Widok kompaktowy'),show_help:t(this,'Show help','Pokaż pomoc'),show_support:t(this,'Show project support','Pokaż wsparcie projektu'),chart_hours:t(this,'Hourly chart range (1–744 hours; empty = full range)','Zakres wykresów godzinowych (1–744 godz.; puste = cały zakres)')};
    const variants = {legacy:t(this,'Existing configuration (unchanged)','Istniejąca konfiguracja (bez zmian)'),tile:t(this,'Tile','Kafelek'),compact:t(this,'Compact','Kompaktowy'),full:t(this,'Full','Pełny')};
    fields.querySelectorAll('[data-variant-label]').forEach(node => node.textContent = variants[node.dataset.variantLabel]);
    const targets = {full:t(this,'Full card','Pełna karta'),energy:t(this,'Home Assistant Energy','Energia Home Assistant'),'more-info':t(this,'Entity details (existing entity required)','Szczegóły encji (wymagana istniejąca encja)')};
    fields.querySelectorAll('[data-target-label]').forEach(node => node.textContent = targets[node.dataset.targetLabel]);
    fields.querySelectorAll('[data-option-label]').forEach(node=>node.textContent=names[node.dataset.optionLabel]);
    // Native select: at most 200 matching existing entities, plus the selected
    // existing entity. Search finds any ID/name without rendering thousands of rows.
    const states = this._hass?.states || {}, search = fields.querySelector('[data-entity-search]');
    const query = search.value.trim().toLocaleLowerCase();
    const ids = Object.keys(states).filter(id => /^[a-z_]+\.[a-z0-9_]+$/.test(id));
    const matches = ids.filter(id => `${id} ${states[id]?.attributes?.friendly_name || ''}`.toLocaleLowerCase().includes(query)).sort().slice(0,200);
    if (states[this._config.entity] && !matches.includes(this._config.entity)) matches.unshift(this._config.entity);
    const select = fields.querySelector('[data-config="entity"]');
    const options = [[ '', t(this,'Choose an existing entity','Wybierz istniejącą encję') ],...matches.map(id => [id,`${states[id]?.attributes?.friendly_name || id} (${id})`])];
    const signature = JSON.stringify(options);
    if (select.dataset.optionsSignature !== signature) {
      select.replaceChildren(...options.map(([value,label]) => { const node = document.createElement('option'); node.value = value; node.textContent = label; return node; }));
      select.dataset.optionsSignature = signature;
    }
    select.value = states[this._config.entity] ? this._config.entity : '';
    fields.querySelector('[data-entity-hint]').textContent = t(this,'Choose an existing entity to enable Entity details. Search shows up to 200 matches.','Wybierz istniejącą encję, aby włączyć jej szczegóły. Wyszukiwanie pokazuje do 200 wyników.');

    tabs.forEach((id,index)=>{const label=labels[pl(this)?1:0][index];fields.querySelector(`[data-tab-label="${id}"]`).textContent=label;const option=fields.querySelector(`option[value="${id}"]`);option.textContent=label;option.disabled=!visible(this._config).includes(id);fields.querySelector(`[data-tab-option="${id}"]`).checked=visible(this._config).includes(id);});
    for(const field of fields.querySelectorAll('[data-config]')) {const option=field.dataset.config;field.setAttribute('aria-label',names[option]);if(option==='compact')field.disabled=!!this._config.variant;if(field.type==='checkbox')field.checked=option==='compact'?this._config[option]===true:this._config[option]!==false;else if(option!=='entity'&&root.activeElement!==field)field.value=this._config[option]??(option==='period_default'?'day':option==='default_tab'?visible(this._config)[0]:option==='tap_target'?'full':'');}
  };
}
