// HA Energy Optimizer Bundle v3.5.4
// HTML escape helper — wrap any user-derived string before interpolation into innerHTML.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Card-owned support footer; never mutate sibling cards or the document.
const ENERGY_OPTIMIZER_DONATE_HTML = `<div class="donate-section" data-source="own-card" style="margin:8px 0 0;padding:4px 0;background:none;border:0;box-shadow:none;min-height:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-direction:row;justify-content:flex-start;text-align:left"><a href="https://buymeacoffee.com/macsiem" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--secondary-text-color,#64748b);font-weight:400;text-decoration:underline">Optional support for HA Tools</a><button type="button" class="support-dismiss" aria-label="Dismiss support link" style="margin-left:auto;padding:2px 6px;min-height:0;line-height:1;border:0;background:none;color:var(--secondary-text-color,#64748b);cursor:pointer">×</button></div>`;
const energySupportDismissed = key => { try { return localStorage.getItem(key + '-support-dismissed') === '1'; } catch (_) { return false; } };
const localizeEnergySupport = (root, language) => {
  const footer = root.querySelector('.donate-section[data-source="own-card"]');
  const link = footer?.querySelector('a');
  const dismiss = footer?.querySelector('.support-dismiss');
  const polish = language?.split('-')[0] === 'pl';
  if (link) link.textContent = polish ? 'Opcjonalne wsparcie dla HA Tools' : 'Optional support for HA Tools';
  if (dismiss) dismiss.setAttribute('aria-label', polish ? 'Ukryj link wsparcia' : 'Dismiss support link');
};
const bindEnergySupport = (root, key, language) => {
  localizeEnergySupport(root, language);
  root.querySelector('.support-dismiss')?.addEventListener('click', () => { try { localStorage.setItem(key + '-support-dismissed', '1'); } catch (_) {} root.querySelector('.donate-section[data-source="own-card"]')?.remove(); });
};

// Recorder WS uses milliseconds; older captures may use seconds or ISO strings.
const energyTimestamp = value => typeof value === 'number' ? (value > 1e11 ? value : value * 1000) : typeof value === 'string' ? Date.parse(value) : NaN;
const energyFactor = unit => ({ Wh: 0.001, kWh: 1, MWh: 1000 })[unit];
const energyImportIds = prefs => [...new Set((prefs?.energy_sources || [])
  .filter(source => source?.type === 'grid')
  .flatMap(source => source.stat_energy_from ? [source.stat_energy_from] : (source.flow_from || []).map(flow => flow?.stat_energy_from).filter(Boolean)))];
const ENERGY_HOUR = 3600000;

async function readEnergyHours(hass, hours) {
  const ids = energyImportIds(await hass.callWS({ type: 'energy/get_prefs' }));
  if (!ids.length) return { ids, noSensors: true };
  const raw = await hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: ids });
  const metadata = Array.isArray(raw) ? Object.fromEntries(raw.map(row => [row.statistic_id, row])) : raw || {};
  const factors = {};
  for (const id of ids) {
    const row = metadata[id];
    factors[id] = energyFactor(row?.statistics_unit_of_measurement ?? row?.unit_of_measurement);
    if (row?.has_sum !== true || !factors[id] || (row.unit_class && row.unit_class !== 'energy')) throw new Error('Unsupported Energy Dashboard statistic metadata');
  }
  const now = new Date();
  const end = Math.floor(now.getTime() / ENERGY_HOUR) * ENERGY_HOUR;
  const start = end - hours * ENERGY_HOUR;
  const stats = await hass.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(start).toISOString(),
    end_time: new Date(end).toISOString(), statistic_ids: ids, period: 'hour', types: ['change'] });
  if (ids.some(id => !Array.isArray(stats?.[id]) || !stats[id].length)) return { ids, noSeries: true };
  const sources = ids.map(id => {
    const buckets = new Map();
    for (const point of stats[id]) {
      const stamp = energyTimestamp(point?.start);
      if (!Number.isFinite(stamp) || stamp % ENERGY_HOUR !== 0 || typeof point.change !== 'number' || !Number.isFinite(point.change) || point.change < 0) throw new Error('Invalid or incomplete Energy Dashboard statistic bucket');
      if (stamp < start || stamp >= end) continue;
      if (buckets.has(stamp)) throw new Error('Duplicate Energy Dashboard statistic bucket');
      buckets.set(stamp, point.change * factors[id]);
    }
    return buckets;
  });
  const zone = hass.config?.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23', weekday: 'short' });
  const local = stamp => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(stamp)).map(part => [part.type, part.value]));
    return { key: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
  };
  const points = new Map();
  for (let stamp = start; stamp < end; stamp += ENERGY_HOUR) {
    points.set(stamp, { ...local(stamp), kwh: sources.every(source => source.has(stamp)) ? sources.reduce((sum, source) => sum + source.get(stamp), 0) : null });
  }
  const today = local(now.getTime()).key;
  const todayStamps = [...points].filter(([, point]) => point.key === today).map(([stamp]) => stamp);
  const todayStart = todayStamps[0] ?? end;
  const summary = (from, to, rate) => {
    const selected = [...points].filter(([stamp]) => stamp >= from && stamp < to);
    const complete = selected.length > 0 && selected.length === (to - from) / ENERGY_HOUR && selected.every(([, point]) => point.kwh !== null);
    let cost = complete && rate && (hass.config?.currency) ? 0 : null;
    // A caller may provide an explicit currency when HA has none.
    if (complete && rate?.currency) cost = 0;
    for (const [, point] of selected) {
      const price = rate?.(point.hour, point.weekday);
      if (price === null || price === undefined || point.kwh === null) cost = null;
      else if (cost !== null) cost += point.kwh * price;
    }
    return { total: complete ? selected.reduce((sum, [, point]) => sum + point.kwh, 0) : null, cost,
      start: new Date(from).toISOString(), end: new Date(to).toISOString(), selected, complete };
  };
  const daily = (from, to, rate) => {
    const groups = new Map();
    for (const [stamp, point] of points) {
      if (stamp < from || stamp >= to) continue;
      if (!groups.has(point.key)) groups.set(point.key, []);
      groups.get(point.key).push(stamp);
    }
    return [...groups].map(([key, stamps]) => ({ key, ...summary(stamps[0], stamps.at(-1) + ENERGY_HOUR, rate) }));
  };
  const hourlyToday = new Array(24).fill(null);
  const counts = new Array(24).fill(0);
  for (let hour = 0; hour < 24; hour++) {
    const rows = todayStamps.map(stamp => points.get(stamp)).filter(point => point.hour === hour);
    if (rows.length && rows.every(point => point.kwh !== null)) { hourlyToday[hour] = rows.reduce((sum, point) => sum + point.kwh, 0); counts[hour] = rows.length; }
  }
  return { ids, zone, start, end, todayStart, points, summary, daily, hourlyToday, counts };
}

class HaEnergyOptimizer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._timers = new Set();
    this._firstHassRender = false;
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this._hass = null;
    // Default config so the card works in panel/sidebar mode where setConfig() is never called.
    this._config = { title: 'Energy Optimizer' };
    this._currentTab = 'dashboard';
    this._energyData = [];
    this._hourlyBucketCounts = [];
    this._weeklyData = [];
    this._recommendations = [];
    this._comparisonData = null;
    // --- Real data fields ---
    this._hasRealData = false;
    this._currentPowerW = 0;
    this._statsLoading = false;
    this._lastStatsFetch = 0;
    this._energySensorIds = [];
    this._energyError = null;
    this._charts = {};
    this._chartJsLoaded = false;
    // Initialize data structures so panel/sidebar mode (no setConfig) renders without crashing.
    this._generateRecommendations();
    this._generateComparisonData();
  }
  disconnectedCallback() {
    this._timers.forEach(timer => clearTimeout(timer));
    this._timers.clear();
    this._renderScheduled = false;
    this._destroyAllCharts();
  }

  _schedule(callback, delay) {
    const timer = setTimeout(() => {
      this._timers.delete(timer);
      if (this.isConnected) callback();
    }, delay);
    this._timers.add(timer);
    return timer;
  }

  // No visual editor is advertised: 'ha-energy-optimizer-editor' was never
  // registered, so returning it here handed Home Assistant an unknown element
  // and the card's visual editor came up blank. Falling back to HA's built-in
  // editor is correct until a real editor element ships.

  static getStubConfig() {
    return {
      type: 'custom:ha-energy-optimizer',
      title: 'Energy Optimizer',
      peak_hours: { start: 6, end: 22 }
    };
  }

  setConfig(config) {
    this._config = config || { title: 'Energy Optimizer' };
    this._generateRecommendations();
    this._generateComparisonData();
    if (this._hass) this._render();
  }

  set hass(hass) {
    try {
      var _bg = (getComputedStyle(this).getPropertyValue('--card-background-color') || getComputedStyle(this).getPropertyValue('--primary-background-color') || '').trim();
      var _d = false;
      if (_bg) {
        var _h, _r, _g, _b, _m;
        if (_bg.charAt(0) === '#') { _h = _bg.slice(1); if (_h.length === 3) _h = _h.replace(/(.)/g, '$1$1'); _r = parseInt(_h.slice(0,2),16); _g = parseInt(_h.slice(2,4),16); _b = parseInt(_h.slice(4,6),16); }
        else { _m = _bg.match(/[\d.]+/g); if (_m) { _r = +_m[0]; _g = +_m[1]; _b = +_m[2]; } }
        if (_r != null) _d = (0.2126*_r + 0.7152*_g + 0.0722*_b) / 255 < 0.5;
      } else if (hass && hass.themes) { _d = !!hass.themes.darkMode; }
      this.classList.toggle('bento-dark', _d);
    } catch (e) {}
    this._hass = hass;
    if (!hass) return;
    try {
      const now = Date.now();
      if (!this._firstHassRender) {
        this._firstHassRender = true;
        this._updateEnergyData();
        this._fetchEnergyStats();
        this._render();
        this._lastRenderTime = now;
        return;
      }
      if (now - (this._lastRenderTime || 0) < 10000) {
        if (!this._renderScheduled) {
          this._renderScheduled = true;
          this._schedule(() => {
            this._renderScheduled = false;
            try {
              const newHash = Object.keys(hass.states).length + '_' + (hass.states['sun.sun'] ? hass.states['sun.sun'].state : '');
              if (newHash === this._lastStateHash) return;
              this._lastStateHash = newHash;
              this._updateEnergyData();
              this._render();
              this._lastRenderTime = Date.now();
            } catch (e) { this._renderError(e); }
          }, 5000 - (now - (this._lastRenderTime || 0)));
        }
        return;
      }
      this._updateEnergyData();
      this._render();
      this._lastRenderTime = now;
    } catch (e) {
      this._renderError(e);
    }
  }

  _renderError(e) {
    console.error('[ha-energy-optimizer] render error:', e);
    const msg = (e && e.message) ? e.message : String(e);
    if (this.shadowRoot) {
      this.shadowRoot.innerHTML =
        '<div style="padding:16px;font-family:system-ui,sans-serif;color:#b91c1c;">' +
        '<strong>Energy Optimizer — render error.</strong><br>' +
        msg.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) +
        '</div>';
    }
  }

  async _fetchEnergyStats() {
    if (!this._hass || !this._hass.callWS) return;
    if (this._statsLoading) return;
    this._statsLoading = true;
    this._energyError = null;
    try {
      const model = await readEnergyHours(this._hass, 24 * 15);
      if (model.noSensors || model.noSeries) throw new Error(model.noSeries ? 'Missing Energy Dashboard statistic series' : 'No Energy Dashboard grid import source');
      const today = model.summary(model.todayStart, model.end);
      if (!today.complete) throw new Error('Incomplete Energy Dashboard hourly coverage');
      this._energyModel = model;
      this._todayWindow = today;
      this._energySensorIds = model.ids;
      this._hourlyBucketCounts = model.counts;
      this._energyData = model.hourlyToday;
      const days = model.daily(model.start, model.end).slice(-7);
      this._dayKeys = days.map(day => day.key);
      this._weeklyData = days.map(day => {
        const values = new Array(24).fill(null);
        for (const [, point] of day.selected) {
          if (point.kwh !== null) values[point.hour] = (values[point.hour] ?? 0) + point.kwh;
        }
        return values;
      });
      this._dailyTotals = days.map(day => day.total);
      this._hasRealData = true;
      this._generateRecommendations();
      this._generateComparisonData();
    } catch (err) {
      this._energyError = err;
      this._hasRealData = false;
      this._energyData = [];
      this._hourlyBucketCounts = [];
      this._weeklyData = [];
      this._recommendations = [];
      this._comparisonData = null;
      this._energyModel = null;
      this._todayWindow = null;
      this._dailyTotals = [];
      console.warn('Energy Optimizer: Energy statistics unavailable');
    } finally {
      this._statsLoading = false;
      if (this.isConnected) this._render();
    }
  }

  _updateEnergyData() {
    if (!this._hass) return;
    const configured = this._config.power_entity && this._hass.states[this._config.power_entity];
    const unit = configured?.attributes?.unit_of_measurement;
    const value = configured ? Number(configured.state) : NaN;
    this._currentPowerW = Number.isFinite(value) && (unit === 'W' || unit === 'kW') ? value * (unit === 'kW' ? 1000 : 1) : null;

    // Fetch stats every 5 minutes (not on every hass update)
    const now = Date.now();
    if (!this._lastStatsFetch || (now - this._lastStatsFetch) > 300000) {
      this._lastStatsFetch = now;
      this._fetchEnergyStats();
    }
  }

  _generateRecommendations() {
    this._recommendations = [];
    if (!this._hasRealData) return;
    const peakRate = this._config.peak_rate == null || this._config.peak_rate === '' ? NaN : Number(this._config.peak_rate);
    const offPeakRate = this._config.off_peak_rate == null || this._config.off_peak_rate === '' ? NaN : Number(this._config.off_peak_rate);
    if (!Number.isFinite(peakRate) || !Number.isFinite(offPeakRate) || peakRate <= offPeakRate) return;
    const start = this._config.peak_hours?.start ?? 6;
    const end = this._config.peak_hours?.end ?? 22;
    const peakKwh = this._energyData.slice(start, end).reduce((sum, value) => sum + (value ?? 0), 0);
    if (peakKwh <= 0) return;
    this._recommendations = [{
      id: 1, icon: '↘', title: this._text('Consider shifting flexible loads to off-peak', 'Rozważ przeniesienie elastycznego zużycia poza godziny szczytu'),
      description: this._text(`Measured grid import during configured peak hours: ${peakKwh.toFixed(2)} kWh today. This is a scenario, not a measured appliance saving.`, `Zmierzony import z sieci w skonfigurowanych godzinach szczytu: ${peakKwh.toFixed(2)} kWh dzisiaj. To scenariusz, a nie zmierzona oszczędność urządzeń.`),
      savings: peakKwh * 0.3 * (peakRate - offPeakRate),
      difficulty: 'manual', impact: 'medium'
    }];
  }

  _generateComparisonData() {
    const model = this._energyModel;
    const thisWeek = model?.summary(model.end - 168 * ENERGY_HOUR, model.end).total ?? null;
    const lastWeek = model?.summary(model.end - 336 * ENERGY_HOUR, model.end - 168 * ENERGY_HOUR).total ?? null;
    const configuredPeak = this._config.peak_rate ?? this._config.energy_price;
    const peakRate = configuredPeak == null || configuredPeak === '' ? NaN : Number(configuredPeak);
    const offPeakRate = Number(this._config.off_peak_rate ?? peakRate);
    this._comparisonData = {
      thisWeek, lastWeek, thisMonth: null, lastMonth: null,
      dailyBreakdown: this._dailyTotals || [],
      costCurrency: this._config.currency || this._hass?.config?.currency || null,
      costPerKwh: Number.isFinite(peakRate) && peakRate >= 0 ? peakRate : null,
      offPeakRate: Number.isFinite(offPeakRate) && offPeakRate >= 0 ? offPeakRate : null,
      hasDualTariff: Number.isFinite(peakRate) && Number.isFinite(offPeakRate) && peakRate !== offPeakRate,
      peakCostWeekly: null, offPeakCostWeekly: null
    };
  }

  _render() {
    this._destroyAllCharts();
    this.shadowRoot.innerHTML = this._getStyles() + this._getTemplate();
    bindEnergySupport(this.shadowRoot, 'ha-energy-optimizer', this._hass?.locale?.language || this._hass?.language);
    this._setupEventListeners();
    this._renderCurrentTab();
  }

  _getStyles() {
    return `
      <style>
/* Card-owned support footer; never depends on or mutates another component. */
.donate-section[data-source="own-card"] { margin:24px 0 4px; padding:18px 20px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; border:1px solid var(--bento-border); border-radius:var(--bento-radius-sm); background:var(--bento-primary-light); color:var(--bento-text); }
.donate-section[data-source="own-card"] .donate-text { display:flex; flex-direction:column; gap:4px; flex:1; min-width:220px; }
.donate-section[data-source="own-card"] .donate-buttons { display:flex; flex-wrap:wrap; gap:8px; }
.donate-section[data-source="own-card"] a { color:var(--bento-primary); font-weight:700; text-decoration:none; }
/* ===== BENTO LIGHT MODE DESIGN SYSTEM ===== */

/* keyboard a11y */
:focus-visible { outline: 2px solid var(--bento-primary, #6366f1); outline-offset: 2px; border-radius: 3px; }

:host {
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-primary-light: rgba(59, 130, 246, 0.08);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.08);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.08);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.08);
  --bento-bg: #F8FAFC;
  --bento-card: #FFFFFF;
  --bento-border: #E2E8F0;
  --bento-text: #1E293B;
  --bento-text-secondary: #64748B;
  --bento-text-muted: #94A3B8;
  --bento-radius-xs: 6px;
  --bento-radius-sm: 10px;
  --bento-radius-md: 16px;
  --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
  --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
:host(.bento-dark) {
  --bento-bg: var(--primary-background-color, #1a1a2e);
  --bento-card: var(--card-background-color, #16213e);
  --bento-text: var(--primary-text-color, #e2e8f0);
  --bento-text-secondary: var(--secondary-text-color, #94a3b8);
  --bento-text-muted: var(--disabled-text-color, #64748b);
  --bento-border: var(--divider-color, #334155);
}

/* Card */
.card, .ha-card, ha-card, .main-card, .exporter-card, .security-card, .reports-card, .storage-card, .chore-card, .cry-card, .backup-card, .network-card, .sentence-card, .energy-card, .panel-card {
  background: var(--bento-card) !important;
  border: 1px solid var(--bento-border) !important;
  border-radius: var(--bento-radius-md) !important;
  box-shadow: var(--bento-shadow-sm) !important;
  font-family: 'Inter', sans-serif !important;
  color: var(--bento-text) !important;
  overflow: hidden;
}

/* Headers */
.card-header, .header, .card-title, h1, h2, h3 {
  color: var(--bento-text) !important;
  font-family: 'Inter', sans-serif !important;
}
.card-header, .header {
  border-bottom: 1px solid var(--bento-border) !important;
  padding-bottom: 12px !important;
  margin-bottom: 16px !important;
}

/* Tabs */
.tabs, .tab-bar, .tab-nav, .tab-header {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--bento-border);
  padding: 0 4px;
  margin-bottom: 20px;
  overflow-x: auto;
}
.tab, .tab-btn, .tab-button {
  padding: 10px 18px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  color: var(--bento-text-secondary);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: var(--bento-transition);
  white-space: nowrap;
  border-radius: 0;
}
.tab:hover, .tab-btn:hover, .tab-button:hover {
  color: var(--bento-primary);
  background: var(--bento-primary-light);
}
.tab.active, .tab-btn.active, .tab-button.active {
  color: var(--bento-primary);
  border-bottom-color: var(--bento-primary);
  background: rgba(59, 130, 246, 0.04);
  font-weight: 600;
}

/* Tab content */
.tab-content { display: none; }
.tab-content.active { display: block; animation: bentoFadeIn 0.3s ease-out; }
@keyframes bentoFadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }

/* Buttons */
button, .btn, .action-btn {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--bento-radius-xs);
  transition: var(--bento-transition);
  cursor: pointer;
}
button.active, .btn.active, .btn-primary, .action-btn.active {
  background: var(--bento-primary) !important;
  color: white !important;
  border-color: var(--bento-primary) !important;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}

/* Status badges */
.badge, .status-badge, .tag, .chip {
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.badge-success, .status-ok, .status-good { background: var(--bento-success-light); color: var(--bento-success); }
.badge-error, .status-error, .status-critical { background: var(--bento-error-light); color: var(--bento-error); }
.badge-warning, .status-warning { background: var(--bento-warning-light); color: var(--bento-warning); }
.badge-info, .status-info { background: var(--bento-primary-light); color: var(--bento-primary); }

/* Tables */
table { width: 100%; border-collapse: separate; border-spacing: 0; font-family: 'Inter', sans-serif; }
th { background: var(--bento-bg); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 14px; text-align: left; border-bottom: 2px solid var(--bento-border); }
td { padding: 12px 14px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 13px; }
tr:hover td { background: var(--bento-primary-light); }
tr:last-child td { border-bottom: none; }

/* Inputs & selects */
input, select, textarea {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  padding: 8px 12px;
  border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-card);
  color: var(--bento-text);
  transition: var(--bento-transition);
  outline: none;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--bento-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Stat cards */
.stat-card, .stat, .metric-card, .stat-box, .overview-stat, .kpi-card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm);
  padding: 16px;
  transition: var(--bento-transition);
}
.stat-card:hover, .stat:hover, .metric-card:hover { box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-value, .metric-value, .stat-number { font-size: 28px; font-weight: 700; color: var(--bento-text); font-family: 'Inter', sans-serif; }
.stat-label, .metric-label, .stat-title { font-size: 12px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }

/* Canvas override (prevent Bento CSS from distorting charts) */
canvas {
  max-width: 100% !important;
  height: auto !important;
  width: auto !important;
  border: none !important;
}

/* Pagination */
.pagination, .pag {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 16px 0;
  border-top: 1px solid var(--bento-border);
}
.pagination-btn, .pag-btn {
  padding: 8px 14px;
  border: 1.5px solid var(--bento-border);
  background: var(--bento-card);
  color: var(--bento-text);
  border-radius: var(--bento-radius-xs);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: 'Inter', sans-serif;
  transition: var(--bento-transition);
}
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 13px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-select { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 12px; font-family: 'Inter', sans-serif; }

/* Empty state */
.empty-state, .no-data, .no-results {
  text-align: center;
  padding: 48px 24px;
  color: var(--bento-text-secondary);
  font-size: 14px;
}

/* Scrollbar */
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); }

/* ===== END BENTO LIGHT MODE ===== */

        :host {
          --text-color: var(--primary-text-color, #000);
          --secondary-text: var(--secondary-text-color, #666);
          --bg-color: var(--card-background-color, #fff);
          --primary: var(--primary-color, #3498db);
          --divider: var(--divider-color, #e0e0e0);
          --success: #4caf50;
          --warning: #ff9800;
          --danger: #f44336;
        }

        * {
          box-sizing: border-box;
        }

        .card-container {
          background: var(--bg-color);
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        .card-title {
          font-size: 20px;
          font-weight: 600;
          color: var(--text-color);
          margin: 0 0 16px 0;
        }

        .data-source-badge {
          font-size: 11px;
          color: var(--bento-text-muted);
          margin-bottom: 8px;
        }

        .tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--divider);
          margin-bottom: 20px;
          overflow-x: auto;
        }

        .tab-button {
          padding: 8px 16px;
          border: none;
          background: none;
          color: var(--secondary-text);
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          border-bottom: 3px solid transparent;
          transition: all 0.3s ease;
          white-space: nowrap;
        }

        .tab-button:hover {
          color: var(--text-color);
        }

        .tab-button.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }

        .tab-content {
          display: none;
        }

        .tab-content.active {
          display: block;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .summary-card {
          background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary), #000 12%) 100%);
          color: white;
          padding: 16px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .summary-card.alt {
          background: linear-gradient(135deg, var(--success) 0%, color-mix(in srgb, var(--success), #000 12%) 100%);
        }

        .summary-card.warn {
          background: linear-gradient(135deg, var(--warning) 0%, color-mix(in srgb, var(--warning), #000 12%) 100%);
        }

        .summary-value {
          font-size: 28px;
          font-weight: 700;
          margin: 8px 0;
        }

        .summary-label {
          font-size: 12px;
          opacity: 0.9;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .chart-container {
          background: rgba(0, 0, 0, 0.02);
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 20px;
          border: 1px solid var(--divider);
        }

        .chart-plot {
          position: relative;
          height: clamp(220px, 32vw, 320px);
          min-width: 0;
        }

        .chart-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-color);
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        canvas {
          max-width: 100%;
          height: auto;
          display: block;
        }

        .stats-row {
          display: flex;
          gap: 20px;
          margin: 16px 0;
          padding: 12px;
          background: rgba(0, 0, 0, 0.02);
          border-radius: 6px;
        }

        .stat-item {
          flex: 1;
        }

        .stat-label {
          font-size: 12px;
          color: var(--secondary-text);
          text-transform: uppercase;
          margin-bottom: 4px;
        }

        .stat-value {
          font-size: 18px;
          font-weight: 600;
          color: var(--text-color);
        }

        .recommendation {
          background: rgba(0, 0, 0, 0.02);
          border-left: 4px solid var(--primary);
          padding: 16px;
          margin-bottom: 12px;
          border-radius: 4px;
          display: flex;
          gap: 12px;
        }

        .recommendation.high {
          border-left-color: var(--danger);
        }

        .recommendation.medium {
          border-left-color: var(--warning);
        }

        .recommendation.low {
          border-left-color: var(--success);
        }

        .rec-icon {
          font-size: 24px;
          min-width: 32px;
        }

        .rec-content {
          flex: 1;
        }

        .rec-title {
          font-weight: 600;
          color: var(--text-color);
          margin-bottom: 4px;
        }

        .rec-description {
          font-size: 12px;
          color: var(--secondary-text);
          margin-bottom: 8px;
        }

        .rec-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
        }

        .savings-badge {
          background: var(--success);
          color: white;
          padding: 2px 8px;
          border-radius: 12px;
          font-weight: 600;
        }

        .difficulty-badge {
          background: rgba(0, 0, 0, 0.1);
          color: var(--text-color);
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 11px;
        }

        .comparison-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
          margin-bottom: 20px;
        }

        .comparison-card {
          background: rgba(0, 0, 0, 0.02);
          padding: 16px;
          border-radius: 8px;
          border: 1px solid var(--divider);
        }

        .comparison-title {
          font-size: 12px;
          color: var(--secondary-text);
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .comparison-value {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-color);
          margin-bottom: 4px;
        }

        .change-indicator {
          font-size: 12px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .change-up {
          color: var(--danger);
        }

        .change-down {
          color: var(--success);
        }

        .heatmap-legend {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          font-size: 11px;
          justify-content: flex-end;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .legend-color {
          width: 12px;
          height: 12px;
          border-radius: 2px;
        }

        .power-draw {
          background: linear-gradient(135deg, var(--primary) 0%, color-mix(in srgb, var(--primary), #000 12%) 100%);
          color: white;
          padding: 16px;
          border-radius: 8px;
          text-align: center;
        }

        .power-draw-value {
          font-size: 36px;
          font-weight: 700;
          margin: 8px 0;
        }

        .power-draw-unit {
          font-size: 14px;
          opacity: 0.9;
        }

        @media (max-width: 768px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .comparison-grid {
            grid-template-columns: 1fr;
          }

          .stats-row {
            flex-direction: column;
            gap: 12px;
          }

          .tabs {
            gap: 4px;
          }

          .tab-button {
            padding: 8px 12px;
            font-size: 12px;
          }
        }
      
/* ===== MOBILE RESPONSIVE TABLE STYLES ===== */
.table-container {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

@media (max-width: 768px) {
  .table-container {
    margin: 0 -16px;
    padding: 0 16px;
  }

  table {
    min-width: 600px;
  }

  th, td {
    padding: 10px 10px;
    font-size: 12px;
  }

  /* Hide non-essential columns on mobile */
  th:nth-child(n+4),
  td:nth-child(n+4) {
    display: none;
  }

  /* Adjust first few columns on mobile */
  th:first-child,
  td:first-child {
    min-width: 120px;
  }

  th:nth-child(2),
  td:nth-child(2) {
    min-width: 100px;
  }

  .card-container a { color: var(--primary-color, #4a90d9); }
  th:nth-child(3),
  td:nth-child(3) {
    min-width: 80px;
  }
}</style>
    `;
  }

  _text(en, pl) {
    const language = this._hass?.locale?.language || this._hass?.language || 'en';
    return language.split('-')[0] === 'pl' ? pl : en;
  }

  _applyChartTheme(config) {
    const style = getComputedStyle(this);
    const text = style.getPropertyValue('--primary-text-color').trim() || '#172335';
    const border = style.getPropertyValue('--divider-color').trim() || '#d6dce5';
    config.options.color = text;
    const legend = config.options.plugins?.legend;
    if (legend) legend.labels = { ...legend.labels, color: text };
    for (const scale of Object.values(config.options.scales || {})) {
      scale.ticks = { ...scale.ticks, color: text };
      scale.title = { ...scale.title, color: text };
      scale.grid = { ...scale.grid, color: border };
    }
    return config;
  }

  _getTemplate() {
    if (!this._hasRealData) return `<div class="card-container"><h2 class="card-title">${_esc(this._config.title || 'Energy Optimizer')}</h2><div class="empty-state" role="status">${this._statsLoading ? this._text("Loading Energy Dashboard statistics…", "Ładowanie statystyk panelu Energia…") : this._energyError?.message?.includes('Missing Energy Dashboard statistic series') ? this._text("No recent Recorder statistics for the configured grid import.", "Brak bieżących statystyk Recorder dla skonfigurowanego importu z sieci.") : this._energyError?.message?.includes('No Energy Dashboard grid import source') ? this._text("No supported Energy Dashboard grid import statistics found.", "Nie znaleziono obsługiwanych statystyk importu z sieci w panelu Energia.") : this._energyError ? this._text("Energy statistics could not be loaded.", "Nie udało się wczytać statystyk energii.") : this._text("No supported Energy Dashboard grid import statistics found.", "Nie znaleziono obsługiwanych statystyk importu z sieci w panelu Energia.")} <a href="/energy">${this._text("Open Energy Dashboard", "Otwórz panel Energia")}</a></div>${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-optimizer') ? ENERGY_OPTIMIZER_DONATE_HTML : ''}</div>`;
    return `
      <div class="card-container">
        <h2 class="card-title">${_esc(this._config.title || 'Energy Optimizer')}</h2>

        <div class="data-source-badge">
          📊 ${this._text('Grid import from', 'Import z sieci ze źródeł panelu Energia:')} ${(this._energySensorIds || []).length}${this._text(' Energy Dashboard source(s)', '')}<br>
          ${_esc(this._todayWindow?.start || '')} — ${_esc(this._todayWindow?.end || '')} • ${_esc(this._energyModel?.zone || '')}
        </div>

        <div class="tabs" role="tablist">
          <button class="tab-button active" data-tab="dashboard" role="tab" aria-selected="${this._currentTab === 'dashboard'}">${this._text("Dashboard", "Przegląd")}</button>
          <button class="tab-button" data-tab="patterns" role="tab" aria-selected="${this._currentTab === 'patterns'}">${this._text("Patterns", "Wzorce")}</button>
          <button class="tab-button" data-tab="recommendations" role="tab" aria-selected="${this._currentTab === 'recommendations'}">${this._text("Recommendations", "Zalecenia")}</button>
          <button class="tab-button" data-tab="compare" role="tab" aria-selected="${this._currentTab === 'compare'}">${this._text("Compare", "Porównanie")}</button>
        </div>

        <div id="dashboard" class="tab-content active">
          <div class="grid">
            <div class="summary-card">
              <span class="summary-label">${this._text("Today's Usage", "Zużycie dzisiaj")}</span>
              <div class="summary-value">${this._calculateTodayUsage().toFixed(2)}</div>
              <span class="summary-label">kWh</span>
            </div>
            <div class="summary-card alt">
              <span class="summary-label">${this._text("Cost Estimate", "Koszt okresu")}</span>
              <div class="summary-value">${this._calculateTodayCost() === null ? 'N/A' : this._calculateTodayCost().toFixed(2)}</div>
              <span class="summary-label">${_esc(this._config.currency || this._hass?.config?.currency || '')}${(this._config.off_peak_rate && this._config.peak_rate !== this._config.off_peak_rate) ? this._text(' (configured dual tariff)', ' (skonfigurowana taryfa dwustrefowa)') : ''}</span>
            </div>
            ${(this._config.off_peak_rate && this._config.peak_rate !== this._config.off_peak_rate) ? `
            <div class="summary-card" style="border-left:3px solid var(--success)">
              <span class="summary-label">${this._text("Potential Savings", "Możliwe oszczędności")}</span>
              <div class="summary-value">${this._calculatePotentialSavings() === null ? 'N/A' : this._calculatePotentialSavings().toFixed(2)}</div>
              <span class="summary-label">${_esc(this._config.currency || this._hass?.config?.currency || '')}${this._text('/day scenario for 30% shifted', '/dzień w scenariuszu przeniesienia 30% zużycia')}</span>
            </div>` : `
            <div class="summary-card warn">
              <span class="summary-label">${this._text("Peak Hour", "Godzina szczytu")}</span>
              <div class="summary-value">${this._getPeakHour() === null ? 'N/A' : this._getPeakHour() + ':00'}</div>
              <span class="summary-label">${this._text("Highest consumption", "Największe zużycie")}</span>
            </div>`}
            <div class="summary-card">
              <span class="summary-label">${this._text("Efficiency Score", "Wskaźnik efektywności")}</span>
              <div class="summary-value">N/A</div>
              <span class="summary-label">/ 100</span>
            </div>
          </div>

          <div class="power-draw">
            <div class="power-draw-unit">${this._text("Current Power Draw", "Aktualna moc")}</div>
            <div class="power-draw-value">${this._currentPowerW === null ? 'N/A' : (this._currentPowerW / 1000).toFixed(2)}</div>
            <div class="power-draw-unit">kW</div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>${this._text("24-Hour Usage", "Zużycie godzinowe dzisiaj")}</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">${this._text("kWh by hour", "kWh według godzin")}</span>
            </div>
            <div class="chart-plot"><canvas id="dashboard-chart"></canvas></div>
          </div>
        </div>

        <div id="patterns" class="tab-content">
          <div class="chart-container">
            <div class="chart-title">
              <span>${this._text("Weekly Heat Map", "Tygodniowa mapa zużycia")}</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">${this._text("Energy intensity by day & hour", "Zużycie według dnia i godziny")}</span>
            </div>
            <canvas id="heatmap-canvas"></canvas>
            <div class="heatmap-legend">
              <div class="legend-item">
                <div class="legend-color" style="background: #1e3a8a;"></div>
                <span>${this._text("Low", "Niskie")}</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #3b82f6;"></div>
                <span>${this._text("Moderate", "Umiarkowane")}</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #fbbf24;"></div>
                <span>${this._text("High", "Wysokie")}</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #dc2626;"></div>
                <span>${this._text("Peak", "Szczyt")}</span>
              </div>
            </div>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <div class="stat-label">${this._text("Peak Usage", "Zużycie szczytowe")}</div>
              <div class="stat-value">${(this._energyData.reduce((a, b) => Math.max(a, b), 0)).toFixed(2)} kWh</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">${this._text("Off-Peak Usage", "Zużycie poza szczytem")}</div>
              <div class="stat-value">${this._calculateOffPeakAverage() === null ? 'N/A' : this._calculateOffPeakAverage().toFixed(2) + ' kWh/h'}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">${this._text("Ratio", "Proporcja")}</div>
              <div class="stat-value">${this._calculatePeakRatio() === null ? 'N/A' : this._calculatePeakRatio().toFixed(1) + ':1'}</div>
            </div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>${this._text("7-Day Trend", "Trend z ostatnich 7 dni")}</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">${this._text("Completed hourly measurements", "Ukończone pomiary godzinowe")}</span>
            </div>
            <div class="chart-plot"><canvas id="trend-chart"></canvas></div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>${this._text("Daily Consumption", "Zużycie dzienne")}</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">${this._text("Dates in Home Assistant timezone", "Daty w strefie czasowej Home Assistant")}</span>
            </div>
            <div class="chart-plot"><canvas id="weekday-chart"></canvas></div>
          </div>
        </div>

        <div id="recommendations" class="tab-content">
          <div id="recommendations-list"></div>
        </div>

        <div id="compare" class="tab-content">
          <div class="comparison-grid">
            <div class="comparison-card"><div class="comparison-title">${this._text("Last 7 days (168 hours)", "Ostatnie 7 dni (168 godzin)")}</div><div class="comparison-value">${this._comparisonData.thisWeek === null ? 'N/A' : this._comparisonData.thisWeek.toFixed(2)}</div><div class="comparison-title">${this._text("kWh grid import", "kWh importu z sieci")}</div></div>
            <div class="comparison-card"><div class="comparison-title">${this._text("Previous 7 days (168 hours)", "Poprzednie 7 dni (168 godzin)")}</div><div class="comparison-value">${this._comparisonData.lastWeek === null ? 'N/A' : this._comparisonData.lastWeek.toFixed(2)}</div><div class="comparison-title">${this._text("kWh grid import", "kWh importu z sieci")}</div></div>
          </div>
          <p>${this._text("Only recorded periods are shown. Monthly and cost comparisons need complete source and tariff data.", "Pokazano tylko zarejestrowane okresy. Porównania miesięczne i kosztowe wymagają kompletnych źródeł oraz danych taryfy.")}</p>
        </div>
        ${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-optimizer') ? ENERGY_OPTIMIZER_DONATE_HTML : ''}
      </div>
    `;
  }

  _setupEventListeners() {
    const buttons = this.shadowRoot.querySelectorAll('.tab-button');
    buttons.forEach(button => {
      button.addEventListener('click', () => {
        buttons.forEach(b => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
        this._currentTab = button.dataset.tab;
        this._showTab(button.dataset.tab);
      });
    });
  }
  async _loadChartJS() {
    if (this._chartJsLoaded && HA_ENERGY_CHART) return HA_ENERGY_CHART;
    if (HA_ENERGY_CHART) {
      this._chartJsLoaded = true;
      return HA_ENERGY_CHART;
    }
    this.shadowRoot.querySelectorAll('canvas').forEach(canvas => {
      const fallback = document.createElement('div');
      fallback.className = 'chart-unavailable';
      fallback.setAttribute('role', 'status');
      fallback.textContent = this._text('Chart unavailable — numeric analysis remains available.', 'Wykres niedostępny — analiza liczbowa pozostaje dostępna.');
      canvas.replaceWith(fallback);
    });
    return null;
  }

  _destroyChart(chartKey) {
    if (this._charts[chartKey]) {
      this._charts[chartKey].destroy();
      delete this._charts[chartKey];
    }
  }

  _destroyAllCharts() {
    Object.keys(this._charts).forEach(key => {
      this._destroyChart(key);
    });
  }

  _showTab(tabName) {
    const tabs = this.shadowRoot.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    const tabEl = this.shadowRoot.getElementById(tabName);
    if (tabEl) {
      tabEl.classList.add('active');
    }

    // Draw charts after showing tab (needed for canvas sizing)
    this._schedule(() => {
      if (tabName === 'dashboard') {
        this._drawDashboardChart().catch(err => console.error('Dashboard chart error:', err));
      } else if (tabName === 'patterns') {
        this._drawHeatmap();
        this._drawTrendChart().catch(err => console.error('Trend chart error:', err));
        this._drawWeekdayChart().catch(err => console.error('Weekday chart error:', err));
      } else if (tabName === 'recommendations') {
        this._renderRecommendations();
      } else if (tabName === 'compare') {
        this._drawComparisonChart().catch(err => console.error('Comparison chart error:', err));
      }
    }, 100);
  }

  _renderCurrentTab() {
    this._schedule(() => this._showTab('dashboard'), 100);
  }

  async _drawDashboardChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('dashboard-chart');
      if (!canvas) return;

      this._destroyChart('dashboard');

      const ctx = canvas.getContext('2d');
      const labels = Array.from({ length: 24 }, (_, i) => `${i}:00`);
      const data = this._energyData || Array(24).fill(0);

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: this._text("Energy Usage (kWh)", "Zużycie energii (kWh)"),
            data: data,
            backgroundColor: data.map((val, hour) => {
              const isPeak = hour >= (this._config?.peak_hours?.start || 6) && hour < (this._config?.peak_hours?.end || 22);
              return isPeak ? 'rgba(59, 130, 246, 0.7)' : 'rgba(100, 200, 100, 0.7)';
            }),
            borderColor: data.map((val, hour) => {
              const isPeak = hour >= (this._config?.peak_hours?.start || 6) && hour < (this._config?.peak_hours?.end || 22);
              return isPeak ? 'rgb(59, 130, 246)' : 'rgb(100, 200, 100)';
            }),
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: undefined,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                },
                title: (context) => {
                  return context[0].label;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Energy (kWh)", "Energia (kWh)")
              }
            },
            x: {
              title: {
                display: true,
                text: this._text("Hour of Day", "Godzina dnia")
              }
            }
          }
        }
      };

      this._charts['dashboard'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing dashboard chart:', error);
    }
  }
_drawHeatmap() {
    try {
      const canvas = this.shadowRoot.getElementById('heatmap-canvas');
      if (!canvas) return;

      this._fixCanvasSize(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      canvas.width = rect.width * dpr;
      canvas.height = 200 * dpr;
      ctx.scale(dpr, dpr);

      const width = rect.width;
      const height = 200;
      const padding = 40;
      const days = (this._dayKeys || []).map(key => key.slice(5));
      const cellWidth = (width - padding * 2) / 24;
      const cellHeight = (height - padding * 2) / 7;

      // Find min/max for color scaling
      const allValues = (this._weeklyData || []).flat().filter(value => typeof value === 'number');
      const minVal = allValues.length > 0 ? Math.min(...allValues) : 0;
      const maxVal = allValues.length > 0 ? Math.max(...allValues) : 1;
      const range = maxVal - minVal || 1;

      // Helper to get color from value (blue to red gradient)
      const getColor = (val) => {
        const normalized = (val - minVal) / range;
        const hue = (1 - normalized) * 240; // 240 = blue, 0 = red
        return `hsl(${hue}, 70%, 50%)`;
      };

      // Draw cells
      (this._weeklyData || []).forEach((dayData, dayIndex) => {
        dayData.forEach((value, hourIndex) => {
          const x = padding + hourIndex * cellWidth;
          const y = padding + dayIndex * cellHeight;

          ctx.fillStyle = value === null ? 'rgba(128,128,128,0.15)' : getColor(value);
          ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);

          // Draw cell border
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, cellWidth - 1, cellHeight - 1);
        });
      });

      // Day labels (Y-axis)
      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--primary-text-color').trim() || '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      days.forEach((day, i) => {
        const y = padding + (i + 0.5) * cellHeight;
        ctx.fillText(day, padding - 10, y);
      });

      // Hour labels (X-axis)
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      for (let h = 0; h < 24; h += 3) {
        const x = padding + (h + 0.5) * cellWidth;
        ctx.fillText(h + ':00', x, height - padding + 5);
      }

      // Legend
      ctx.fillStyle = getComputedStyle(this).getPropertyValue('--primary-text-color').trim() || '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      const legendX = padding;
      const legendY = height - 15;
      ctx.fillText(`Min: ${minVal.toFixed(2)} kWh`, legendX, legendY);
      ctx.fillText(`Max: ${maxVal.toFixed(2)} kWh • Grey = unavailable`, legendX + 120, legendY);
    } catch (err) {
      console.error('Heatmap error:', err);
    }
  }


  async _drawTrendChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('trend-chart');
      if (!canvas) return;

      this._destroyChart('trend');

      const ctx = canvas.getContext('2d');
      const dailyTotals = this._dailyTotals || [];
      const labels = this._dayKeys || [];

      const chartConfig = {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: this._text('Daily Total Usage (kWh)', 'Dzienne zużycie energii (kWh)'),
            data: dailyTotals,
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointBackgroundColor: 'rgb(59, 130, 246)',
            pointBorderColor: 'white',
            pointBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Daily Total (kWh)", "Zużycie dzienne (kWh)")
              }
            },
            x: {
              title: {
                display: true,
                text: this._text("Date (Home Assistant timezone)", "Data (strefa Home Assistant)")
              }
            }
          }
        }
      };

      this._charts['trend'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing trend chart:', error);
    }
  }
async _drawWeekdayChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('weekday-chart');
      if (!canvas) return;

      this._destroyChart('weekday');

      const ctx = canvas.getContext('2d');
      const dailyTotals = this._dailyTotals || [];
      const labels = this._dayKeys || [];

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: this._text('Daily Total Usage (kWh)', 'Dzienne zużycie energii (kWh)'),
            data: dailyTotals,
            backgroundColor: [
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(100, 200, 100, 0.7)',
              'rgba(59, 130, 246, 0.7)',
              'rgba(59, 130, 246, 0.7)'
            ],
            borderColor: [
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(100, 200, 100)',
              'rgb(59, 130, 246)',
              'rgb(59, 130, 246)'
            ],
            borderWidth: 1,
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Daily Total (kWh)", "Zużycie dzienne (kWh)")
              }
            },
            x: {
              title: {
                display: true,
                text: this._text("Date (Home Assistant timezone)", "Data (strefa Home Assistant)")
              }
            }
          }
        }
      };

      this._charts['weekday'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing weekday chart:', error);
    }
  }
async _drawComparisonChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('comparison-chart');
      if (!canvas) return;

      this._destroyChart('comparison');

      const ctx = canvas.getContext('2d');
      
      const compData = this._comparisonData || {};
      const labels = [this._text("Last 7 days", "Ostatnie 7 dni"), this._text("Previous 7 days", "Poprzednie 7 dni")];

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: this._text('Grid import (kWh)', 'Import z sieci (kWh)'),
            data: [compData.thisWeek ?? null, compData.lastWeek ?? null],
            backgroundColor: ['rgba(59, 130, 246, 0.7)', 'rgba(100, 116, 139, 0.7)'],
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              callbacks: {
                label: (context) => {
                  return `${context.dataset.label}: ${context.formattedValue} kWh`;
                }
              }
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: this._text("Daily Total (kWh)", "Zużycie dzienne (kWh)")
              }
            },
            x: {
              title: {
                display: true,
                text: 'Completed period'
              }
            }
          }
        }
      };

      this._charts['comparison'] = new HA_ENERGY_CHART(ctx, this._applyChartTheme(chartConfig));
    } catch (error) {
      console.error('Error drawing comparison chart:', error);
    }
  }


  _renderRecommendations() {
    const container = this.shadowRoot.getElementById('recommendations-list');
    if (!container) return;
    if (!this._recommendations.length) { container.textContent = this._text('No evidence-based savings scenario available. A time-dependent tariff and measured consumption are needed to compare peak and off-peak hours.', 'Brak scenariusza oszczędności opartego na danych. Porównanie godzin szczytu i poza szczytem wymaga taryfy zależnej od czasu oraz zmierzonego zużycia.'); return; }
    container.innerHTML = this._recommendations.map(rec => `
      <div class="recommendation ${_esc(rec.impact)}">
        <div class="rec-icon">${_esc(rec.icon)}</div>
        <div class="rec-content">
          <div class="rec-title">${_esc(rec.title)}</div>
          <div class="rec-description">${_esc(rec.description)}</div>
          <div class="rec-footer">
            <div class="savings-badge">${this._text('Scenario', 'Scenariusz')}: ${_esc(rec.savings.toFixed(2))} ${_esc(this._config.currency || this._hass?.config?.currency || '')}${this._text('/day', '/dzień')}</div>
            <div class="difficulty-badge">${rec.difficulty === 'manual' ? this._text('manual', 'ręcznie') : _esc(rec.difficulty)}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  _calculateTodayUsage() {
    return this._energyData.reduce((a, b) => a + (b ?? 0), 0);
  }

  _calculateTodayCost() {
    const configuredPeak = this._config.peak_rate ?? this._config.energy_price;
    const peakRate = configuredPeak == null || configuredPeak === '' ? NaN : Number(configuredPeak);
    const offPeakRate = Number(this._config.off_peak_rate ?? peakRate);
    if (!Number.isFinite(peakRate) || !Number.isFinite(offPeakRate) || peakRate < 0 || offPeakRate < 0 || !(this._config.currency || this._hass?.config?.currency)) return null;
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    let cost = 0;
    this._energyData.forEach((kwh, hour) => {
      const rate = (hour >= peakStart && hour < peakEnd) ? peakRate : offPeakRate;
      cost += (kwh ?? 0) * rate;
    });
    return cost;
  }

  _calculatePotentialSavings() {
    const peakRate = this._config.peak_rate == null || this._config.peak_rate === '' ? NaN : Number(this._config.peak_rate);
    const offPeakRate = this._config.off_peak_rate == null || this._config.off_peak_rate === '' ? NaN : Number(this._config.off_peak_rate);
    if (!Number.isFinite(peakRate) || !Number.isFinite(offPeakRate) || peakRate <= offPeakRate) return null;
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    let savings = 0;
    this._energyData.forEach((kwh, hour) => {
      if (hour >= peakStart && hour < peakEnd) {
        savings += (kwh ?? 0) * (peakRate - offPeakRate) * 0.3;
      }
    });
    return savings;
  }

  _getPeakHour() {
    const maximum = Math.max(0, ...this._energyData.map(value => value ?? 0));
    return maximum > 0 ? this._energyData.indexOf(maximum) : null;
  }

  _calculateEfficiencyScore() {
    const peakRatio = this._calculatePeakRatio();
    if (peakRatio === null) return 'N/A';
    const baseScore = 100;
    const peakPenalty = Math.min(30, peakRatio * 5);
    return Math.max(30, baseScore - peakPenalty).toFixed(0);
  }

  _calculatePeakRatio() {
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    const peakBuckets = this._hourlyBucketCounts.slice(peakStart, peakEnd).reduce((a, b) => a + b, 0);
    const offPeakBuckets = this._hourlyBucketCounts.slice(0, peakStart).concat(this._hourlyBucketCounts.slice(peakEnd)).reduce((a, b) => a + b, 0);
    if (!peakBuckets || !offPeakBuckets) return null;
    const peakUsage = this._energyData.slice(peakStart, peakEnd).reduce((a, b) => a + (b ?? 0), 0) / peakBuckets;
    const offPeakUsage = this._calculateOffPeakAverage();
    return offPeakUsage > 0 ? peakUsage / offPeakUsage : null;
  }

  _calculateOffPeakAverage() {
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    const hours = Array.from({ length: 24 }, (_, hour) => hour).filter(hour => hour < peakStart || hour >= peakEnd);
    const buckets = hours.reduce((sum, hour) => sum + (this._hourlyBucketCounts[hour] || 0), 0);
    return buckets ? hours.reduce((sum, hour) => sum + (this._energyData[hour] ?? 0), 0) / buckets : null;
  }
  // --- Pagination helper ---
  _renderPagination(tabName, totalItems) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const pageSize = this._pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(this._currentPage[tabName], totalPages);
    this._currentPage[tabName] = page;
    return `
      <div class="pagination">
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&#8249; ${this._text('Prev', 'Poprzednia')}</button>
        <span class="pagination-info">${page} / ${totalPages} (${totalItems})</span>
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>${this._text('Next', 'Następna')} &#8250;</button>
        <select class="page-size-select" data-page-tab="${tabName}" data-action="page-size">
          ${[10,15,25,50].map(s => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}/page</option>`).join('')}
        </select>
      </div>`;
  }

  _paginateItems(items, tabName) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const start = (this._currentPage[tabName] - 1) * this._pageSize;
    return items.slice(start, start + this._pageSize);
  }

  _setupPaginationListeners() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.pageTab;
        const page = parseInt(e.target.dataset.page);
        if (tab && page > 0) {
          this._currentPage[tab] = page;
          this._render ? this._render() : (this.render ? this.render() : this.renderCard());
        }
      });
    });
    this.shadowRoot.querySelectorAll('.page-size-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this._pageSize = parseInt(e.target.value);
        // Reset all pages to 1
        Object.keys(this._currentPage).forEach(k => this._currentPage[k] = 1);
        this._render ? this._render() : (this.render ? this.render() : this.renderCard());
      });
    });
  }
  // --- Seeded random for stable data ---
  _seededRandom(seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  // --- Canvas size fix for Bento CSS ---
  _fixCanvasSize(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
  }

  getCardSize() { return 10; }

  getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }

  static getStubConfig() { return { type: 'custom:ha-energy-optimizer', title: 'Energy Optimizer' }; }

}

if (!customElements.get('ha-energy-optimizer')) { customElements.define('ha-energy-optimizer', HaEnergyOptimizer); }
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'ha-energy-optimizer')) { window.customCards.push({ type: 'ha-energy-optimizer', name: 'Energy Optimizer', description: 'Optimize energy usage, schedules and costs for Home Assistant', preview: false }); }

