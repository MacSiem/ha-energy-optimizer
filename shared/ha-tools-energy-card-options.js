// Presentation-only card options. Only UI preferences are stored locally; no pricing, backend writes or requests.
function createEnergyCardOptionsV5({ Card, Editor, name, title, tabs, labels }) {
  const key = name === 'ha-energy-optimizer' ? '_currentTab' : '_activeTab';
  const pl = host => String(host._hass?.locale?.language || host._hass?.language || navigator.language || '').startsWith('pl');
  const t = (host, en, polish) => pl(host) ? polish : en;
  const visible = config => config.tabs || tabs;
  const validate = config => {
    if (config.tabs !== undefined && (!Array.isArray(config.tabs) || !config.tabs.length || config.tabs.some(id => !tabs.includes(id)) || new Set(config.tabs).size !== config.tabs.length)) throw new Error('tabs: choose at least one known visible tab / wybierz widoczną zakładkę');
    if (config.default_tab !== undefined && !visible(config).includes(config.default_tab)) throw new Error('default_tab must be a visible tab / domyślna zakładka musi być widoczna');
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
    if (previous && previous.compact !== config.compact) { this._optionsExpandedV5 = false; this._domBuilt = false; }
    if (this._config) {
      this._config = {...this._config};
      for (const option of ['default_tab','tabs','compact','show_help','show_support','chart_hours']) if (!(option in config)) delete this._config[option];
    }
    if (changed || !visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    // Existing integrations own their complete configuration and backend context.
    const result = originalSet.call(this, config);
    if (this._hass && name === 'ha-energy-insights') this._render();
    return result;
  };
  Card.prototype.getGridOptions = function() { return { columns: this._config?.compact ? 6 : 12, min_columns: 3, min_rows: this._config?.compact ? 2 : 3 }; };
  const originalSize = Card.prototype.getCardSize;
  Card.prototype.getCardSize = function() { return this._config?.compact && !this._optionsExpandedV5 ? 3 : originalSize?.call(this) || 10; };
  const style = `:host{display:block;min-width:0;color-scheme:light;--bento-primary:#1d4ed8;--bento-primary-hover:#1e40af;--bento-on-primary:#fff;--bento-text-muted:var(--secondary-text-color,#475569);--energy-value-blue:#1d4ed8;--energy-value-amber:#92400e;--energy-value-green:#166534;--energy-value-red:#b91c1c;--energy-value-neutral:#475569;--energy-value-purple:#6d28d9;--energy-success-button:#166534;--energy-kpi-tone:#eff6ff;--energy-kpi-tone-alt:#f0fdf4}
:host(.bento-dark){color-scheme:dark;--bento-primary:#a5b4fc;--bento-primary-hover:#c7d2fe;--bento-on-primary:#111827;--bento-text-muted:var(--secondary-text-color,#cbd5e1);--energy-value-blue:#93c5fd;--energy-value-amber:#fcd34d;--energy-value-green:#86efac;--energy-value-red:#fca5a5;--energy-value-neutral:#cbd5e1;--energy-value-purple:#c4b5fd;--energy-success-button:#166534;--energy-kpi-tone:#17273d;--energy-kpi-tone-alt:#172d25}
.stat,.stat-card{background:var(--energy-kpi-tone)!important}.stat:nth-child(even),.stat-card:nth-child(even){background:var(--energy-kpi-tone-alt)!important}
.btn-primary,button.btn-primary{color:var(--bento-on-primary)}
.ht-tariff-v3 [data-status=success]{color:var(--energy-value-green)}.ht-tariff-v3 [data-status=error]{color:var(--energy-value-red)}.ht-tariff-v3 [data-status=partial],.ht-tariff-v3 [data-status=unconfirmed]{color:var(--energy-value-amber)}
 [data-energy-options-help], [data-energy-compact]{box-sizing:border-box;padding:16px;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border-radius:12px;font-size:14px;overflow-wrap:anywhere} [data-energy-options-help] summary, [data-energy-expand]{min-height:44px;box-sizing:border-box;padding:12px;cursor:pointer} [data-energy-compact] dl{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin:12px 0} [data-energy-compact] dt{font-size:13px;color:var(--secondary-text-color,#50545b)} [data-energy-compact] dd{margin:0 0 12px;font-weight:600;font-size:18px} [data-energy-expand]{color:var(--primary-text-color,#202124);background:var(--secondary-background-color,#eee);border:1px solid var(--divider-color,#888);border-radius:8px;font:inherit} [data-energy-options-help] summary:focus-visible,[data-energy-expand]:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer{flex:0 0 auto;padding:0;background:transparent;border-radius:0}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]{flex:1 1 100%;width:100%}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer>summary{min-height:44px;padding:12px 8px;font-size:14px}
.optimizer-heading>[data-energy-options-help].energy-options-help-optimizer[open]>p{margin:0 0 8px}`;
  const render = Card.prototype._render;
  Card.prototype._render = function(...args) {
    const config = this._config || {};
    if (!visible(config).includes(this[key])) this[key] = config.default_tab || visible(config)[0];
    if (config.compact && !this._optionsExpandedV5) {
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
    const result = render.apply(this, args);
    this._applyCardOptionsV5();
    return result;
  };
  Card.prototype._applyCardOptionsV5 = function() {
    const root = this.shadowRoot, config = this._config || {}, allowed = visible(config);
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
    Card.prototype[method] = function(...args) { const value = original.apply(this,args); this._applyCardOptionsV5(); return value; };
  }
  const disconnect = Card.prototype.disconnectedCallback;
  Card.prototype.disconnectedCallback = function() { this._optionsResizeV5?.disconnect(); return disconnect?.call(this); };
  // Reuse existing editor text fields and their focus/caret-preserving synchronization.
  const editorRender = Editor.prototype._render;
  Editor.prototype._render = function(...args) { editorRender.apply(this,args); this._renderOptionsV5(); };
  Editor.prototype._renderOptionsV5 = function() {
    const root = this.shadowRoot;
    let fields = root.querySelector('[data-energy-option-fields]');
    if (!fields) {
      fields = document.createElement('div'); fields.dataset.energyOptionFields = '';
      fields.innerHTML = `<style>label[data-option-row]{display:flex;align-items:center;gap:8px;min-height:44px}select,input[type=number]{min-height:44px;box-sizing:border-box;width:100%;font:inherit;color:var(--primary-text-color,#202124);background:var(--card-background-color,#fff);border:1px solid var(--divider-color,#888);border-radius:8px;padding:8px}fieldset{margin:12px 0;border:1px solid var(--divider-color,#888)}[data-option-row] input{width:24px;height:24px;min-height:24px;margin:0}select:focus-visible,input:focus-visible{outline:3px solid var(--primary-color,#1565c0);outline-offset:2px}[data-config-error]{color:var(--energy-value-red,#b91c1c)}</style><label data-option-label="default_tab" for="cf_default_tab"></label><select id="cf_default_tab" data-config="default_tab">${tabs.map(id=>`<option value="${id}"></option>`).join('')}</select><fieldset><legend data-option-label="tabs"></legend>${tabs.map(id=>`<label data-option-row><input type="checkbox" data-tab-option="${id}"><span data-tab-label="${id}"></span></label>`).join('')}</fieldset>${['compact','show_help','show_support'].map(id=>`<label data-option-row><input type="checkbox" data-config="${id}"><span data-option-label="${id}"></span></label>`).join('')}<label data-option-label="chart_hours" for="cf_chart_hours"></label><input id="cf_chart_hours" type="number" min="1" max="744" step="1" data-config="chart_hours"><p data-config-error role="alert"></p>`;
      root.append(fields);
      fields.addEventListener('change', event => {
        const field = event.target;
        if (!field.matches('[data-config],[data-tab-option]')) return;
        const candidate = {...this._config};
        if (field.dataset.tabOption) candidate.tabs = [...fields.querySelectorAll('[data-tab-option]:checked')].map(node=>node.dataset.tabOption);
        else { const option = field.dataset.config; if (option === 'chart_hours' && field.value === '') delete candidate[option]; else candidate[option] = field.type === 'checkbox' ? field.checked : option === 'chart_hours' ? Number(field.value) : field.value; }
        // An implicit default is the first visible tab; explicit defaults must remain visible.
        try { validate(candidate); if (field.dataset.tabOption && !candidate.tabs.includes(candidate.default_tab || tabs[0])) throw new Error(t(this,'The default tab must remain visible.','Domyślna zakładka musi być widoczna.')); }
        catch(error) { fields.querySelector('[data-config-error]').textContent = error.message; this._renderOptionsV5(); return; }
        fields.querySelector('[data-config-error]').textContent = '';
        this._config = candidate;
        this.dispatchEvent(new CustomEvent('config-changed',{detail:{config:{...candidate}},bubbles:true,composed:true}));
      });
    }
    const names = {default_tab:t(this,'Default tab','Domyślna zakładka'),tabs:t(this,'Visible tabs','Widoczne zakładki'),compact:t(this,'Compact view','Widok kompaktowy'),show_help:t(this,'Show help','Pokaż pomoc'),show_support:t(this,'Show project support','Pokaż wsparcie projektu'),chart_hours:t(this,'Hourly chart range (1–744 hours; empty = full range)','Zakres wykresów godzinowych (1–744 godz.; puste = cały zakres)')};
    fields.querySelectorAll('[data-option-label]').forEach(node=>node.textContent=names[node.dataset.optionLabel]);
    tabs.forEach((id,index)=>{const label=labels[pl(this)?1:0][index];fields.querySelector(`[data-tab-label="${id}"]`).textContent=label;const option=fields.querySelector(`option[value="${id}"]`);option.textContent=label;option.disabled=!visible(this._config).includes(id);fields.querySelector(`[data-tab-option="${id}"]`).checked=visible(this._config).includes(id);});
    for(const field of fields.querySelectorAll('[data-config]')) {const option=field.dataset.config;field.setAttribute('aria-label',names[option]);if(field.type==='checkbox')field.checked=option==='compact'?this._config[option]===true:this._config[option]!==false;else if(root.activeElement!==field)field.value=this._config[option]??(option==='default_tab'?visible(this._config)[0]:'');}
  };
}
