// HA Energy Optimizer Bundle v3.5.3
// HTML escape helper — wrap any user-derived string before interpolation into innerHTML.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Card-owned support footer; never mutate sibling cards or the document.
const ENERGY_OPTIMIZER_DONATE_HTML = `<div class="donate-section" data-source="own-card" style="margin:8px 0 0;padding:4px 0;background:none;border:0;box-shadow:none;min-height:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex-direction:row;justify-content:flex-start;text-align:left"><a href="https://buymeacoffee.com/macsiem" target="_blank" rel="noopener noreferrer" style="font-size:11px;color:var(--secondary-text-color,#64748b);font-weight:400;text-decoration:underline">Optional support for HA Tools</a><button type="button" class="support-dismiss" aria-label="Dismiss support link" style="margin-left:auto;padding:2px 6px;min-height:0;line-height:1;border:0;background:none;color:var(--secondary-text-color,#64748b);cursor:pointer">×</button></div>`;
const energySupportDismissed = key => { try { return localStorage.getItem(key + '-support-dismissed') === '1'; } catch (_) { return false; } };
const bindEnergySupport = (root, key) => root.querySelector('.support-dismiss')?.addEventListener('click', () => { try { localStorage.setItem(key + '-support-dismissed', '1'); } catch (_) {} root.querySelector('.donate-section[data-source="own-card"]')?.remove(); });

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
    bindEnergySupport(this.shadowRoot, 'ha-energy-optimizer');
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

// --- Bundled card: ha-energy-insights (v3.3.0 bundle)
(function() {
  'use strict';

  // Component-local persistence retains this card's existing localStorage keys.
  const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-insights] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

  const OWN_SUPPORT_FOOTER = ENERGY_OPTIMIZER_DONATE_HTML;
  const LOCAL_BENTO_CSS = `.donate-section[data-source="own-card"]{margin:16px 20px 20px;padding:16px 18px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);background:var(--bento-primary-light);color:var(--bento-text)}.donate-section[data-source="own-card"] .donate-text{display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px}.donate-section[data-source="own-card"] .donate-buttons{display:flex;flex-wrap:wrap;gap:8px}.donate-section[data-source="own-card"] a{color:var(--bento-primary);font-weight:700;text-decoration:none}`;

  // Component-local XSS protection: never reads from or publishes a global helper.
  const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"\']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  /**
   * HA Energy Insights - Bento Light Mode Panel Tool
   * Energy monitoring with cost tracking, device breakdown, and efficiency recommendations
   * v2.0.0 - Converted from Lovelace Card to Panel Tool Pattern
   */

  class HAEnergyInsights extends HTMLElement {
    static getConfigElement() { return document.createElement('ha-energy-insights-editor'); }
    static getStubConfig() { return { type: 'custom:ha-energy-insights', title: 'Energy Insights' }; }
    constructor() {
      super();
      this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
      this.attachShadow({ mode: 'open' });
      this._toolId = this.tagName.toLowerCase().replace('ha-', '');

      // State fields
      this._hass = null;
      this._activeTab = 'overview';
      this._data = null;
      this._loading = true;
      this._error = null;
      this._charts = {};
      this._chartJsReady = false;
      this._lastRenderTime = 0;
      this._renderScheduled = false;
      this._firstHassRender = false;
      this._domBuilt = false;
      this._lastDataHash = '';
      this._lastDataFetch = 0;
      this._timers = new Set();

      // Configuration
      this._config = {
        title: 'Energy Insights',
        days_history: 7
      };
    }

    // ===== TRANSLATIONS (i18n) =====
    static get _translations() {
      return {
        en: {
          energyInsights: 'Energy Insights',
          overview: 'Overview',
          daily: 'Daily',
          weekly: 'Weekly',
          monthly: 'Monthly',
          tips: 'Tips',
          today: 'Today',
          thisWeek: 'Last 7 days',
          thisMonth: 'Last 30 days',
          trend: 'Trend',
          vsLastWeek: 'vs previous 7 days',
          topDevices: 'Top 5 Devices',
          noSensors: 'No supported grid import statistics in Energy Dashboard. Configure an energy source in Home Assistant.',
          noSeries: 'One or more configured grid import sources have no recent Recorder statistics. Totals are unavailable until every source has data.',
          hourlyConsumption: 'Hourly Consumption (today)',
          dailyConsumption: 'Daily Consumption (7 days)',
          monthlyConsumption: 'Daily Consumption (30 days)',
          refresh: 'Refresh',
          loading: 'Loading energy data...',
          error: 'Failed to load energy data',

          // Recommendations
          highConsumption: 'Consumption significantly higher than usual — check devices and heating.',
          slightlyHigher: 'Consumption slightly higher than last week — monitor usage.',
          lowerThanUsual: 'Consumption lower than usual — great savings!',
          highToday: 'High consumption today — check high-power devices.',
          veryLow: 'Very low consumption today. Everything looks good!',
          normalUsage: 'Energy consumption is normal. Continue monitoring.',

          // Tips
          sensorSetup: 'Use template sensors to track appliance energy consumption.',
          costTracking: 'Update energy_price with your local electricity rate.',
          peakHours: 'Monitor peak consumption hours to optimize usage.',
          deviceBreakdown: 'Compare device-level energy consumption to identify top consumers.',
          efficientAppliances: 'Replace old appliances with ENERGY STAR certified models.',

          partOfHATools: 'Part of HA Tools ecosystem',
          openToolsPanel: 'Open Tools Panel',
        },
        pl: {
          energyInsights: 'Analiza Energii',
          overview: 'Przegląd',
          daily: 'Dziś',
          weekly: 'Tydzień',
          monthly: 'Miesiąc',
          tips: 'Porady',
          today: 'Dzisiaj',
          thisWeek: 'Ostatnie 7 dni',
          thisMonth: 'Ostatnie 30 dni',
          trend: 'Trend',
          vsLastWeek: 'vs poprzednie 7 dni',
          topDevices: 'Top 5 Urządzeń',
          noSensors: 'Brak obsługiwanych statystyk importu sieciowego w panelu Energia. Skonfiguruj źródło energii w HA.',
          noSeries: 'Co najmniej jedno skonfigurowane źródło importu nie ma aktualnych statystyk Recorder. Sumy będą dostępne, gdy każde źródło dostarczy dane.',
          hourlyConsumption: 'Zużycie Godzinowe (dzisiaj)',
          dailyConsumption: 'Zużycie Dzienne (7 dni)',
          monthlyConsumption: 'Zużycie Dzienne (30 dni)',
          refresh: 'Odśwież',
          loading: 'Wczytywanie danych energii...',
          error: 'Nie udało się załadować danych energii',

          // Recommendations
          highConsumption: 'Zużycie znacznie wyższe niż zwykle — sprawdź urządzenia i ogrzewanie.',
          slightlyHigher: 'Zużycie nieco wyższe niż w poprzednim tygodniu — monitoruj zużycie.',
          lowerThanUsual: 'Zużycie niższe niż zwykle — świetne oszczędności!',
          highToday: 'Wysokie zużycie dzisiaj — sprawdź urządzenia o dużej mocy.',
          veryLow: 'Bardzo niskie zużycie dzisiaj. Wszystko wygląda dobrze!',
          normalUsage: 'Zużycie energii w normie. Kontynuuj monitorowanie.',

          // Tips
          sensorSetup: 'Użyj sensorów template do śledzenia zużycia energii przez urządzenia.',
          costTracking: 'Zaktualizuj energy_price rzeczywistą ceną energii.',
          peakHours: 'Monitoruj godziny szczytowego zużycia aby zoptymalizować użytkowanie.',
          deviceBreakdown: 'Porównuj zużycie energii na poziomie urządzeń.',
          efficientAppliances: 'Zastąp stare urządzenia certyfikowanymi urządzeniami ENERGY STAR.',

          partOfHATools: 'Część ekosystemu HA Tools',
          openToolsPanel: 'Otwórz Panel Narzędzi',
        }
      };
    }

    _t(key) {
      const lang = this._hass?.language || localStorage.getItem('ha-tools-language') || 'en';
      const T = HAEnergyInsights._translations;
      return (T[lang] || T['en'])[key] || T['en'][key] || key;
    }

    setConfig(config) {
      this._config = { ...this._config, ...(config || {}) };
      this._syncSupport();
    }
    _getRate(hour, dayOfWeek) {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const dayStart = c.energy_day_hour_start ?? 6;
      const nightStart = c.energy_night_hour_start ?? 22;
      const isDay = dayStart < nightStart ? (hour >= dayStart && hour < nightStart) : (hour >= dayStart || hour < nightStart);
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      let raw;
      if (mode === 'day_night') raw = isDay ? c.energy_price_day : c.energy_price_night;
      else if (mode === 'weekday_weekend') raw = isWeekend ? c.energy_price_weekend : c.energy_price_weekday;
      else if (mode === 'mixed') raw = isWeekend ? (isDay ? c.energy_price_we_day : c.energy_price_we_night) : (isDay ? c.energy_price_wd_day : c.energy_price_wd_night);
      else raw = c.energy_price;
      return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null;
    }

    _getTariffLabel() {
      const currency = this._config.currency || this._hass?.config?.currency || '';
      const rate = this._getRate(12, 1);
      const L = this._lang === 'pl';
      return rate === null
        ? (L ? 'Koszt niedostępny: skonfiguruj taryfę' : 'Cost unavailable: configure a tariff')
        : `${currency} / kWh (${L ? 'skonfigurowana taryfa' : 'configured tariff'})`;
    }

    set hass(hass) {
      try {
        const previousLanguage = this._lang;
        const language = hass?.locale?.language || hass?.language;
        if (language) this._lang = language.startsWith('pl') ? 'pl' : 'en';
        this._hass = hass;
        if (!hass) return;

        const now = Date.now();
        if (!this._firstHassRender) {
          this._firstHassRender = true;
          this._activeTab = localStorage.getItem('ha-tools-energy-insights-active-tab') || 'overview';
          this._loadChartJs();
          this._fetchData();
          this._render();
          this._lastRenderTime = now;
          return;
        }

        if (previousLanguage !== this._lang && this._domBuilt) {
          const header = this.shadowRoot.querySelector('.panel-header');
          if (header) header.outerHTML = this._renderHeader();
          this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
            btn.textContent = this._t(btn.dataset.tab);
          });
          this._updateContent();
          if (this._chartJsReady) this._renderCharts();
        }
        this._syncChartTheme();

        // Fetch new data every 5 minutes (recorder stats don't change often)
        if (!this._lastDataFetch || (now - this._lastDataFetch) > 300000) {
          this._lastDataFetch = now;
          this._fetchData();
        }
      } catch (e) {
        this._renderError(e);
      }
    }

    connectedCallback() {
      // Cleanup on disconnect
    }

    disconnectedCallback() {
      this._timers.forEach(timer => clearTimeout(timer));
      this._timers.clear();
      Object.values(this._charts).forEach(c => {
        try { c.destroy(); } catch(e) { console.debug('[ha-energy-insights] caught:', e); }
      });
      this._charts = {};
    }

    _schedule(callback, delay) {
      const timer = setTimeout(() => {
        this._timers.delete(timer);
        if (this.isConnected) callback();
      }, delay);
      this._timers.add(timer);
      return timer;
    }

    _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

    // ===== DATA LOADING =====

    _loadChartJs() {
      if (HA_ENERGY_CHART) {
        this._chartJsReady = true;
        return;
      }
      this._chartJsReady = false;
    }

    async _fetchData() {
      if (!this._hass || !this._hass.callWS) return;
      this._loading = true;
      this._error = null;
      this._data = null;
      if (this._domBuilt) this._updateLoadingState();

      try {
        const model = await readEnergyHours(this._hass, 720);
        if (model.noSensors || model.noSeries) {
          this._data = { sensors: model.ids, noSensors: model.noSensors, noSeries: model.noSeries };
        } else {
          const rate = (hour, weekday) => this._getRate(hour, weekday);
          rate.currency = this._config.currency;
          const today = model.summary(model.todayStart, model.end, rate);
          if (!today.complete) throw new Error('Incomplete Energy Dashboard hourly coverage');
          const week = model.summary(model.end - 168 * ENERGY_HOUR, model.end, rate);
          const previous = model.summary(model.end - 336 * ENERGY_HOUR, model.end - 168 * ENERGY_HOUR, rate);
          const month = model.summary(model.start, model.end, rate);
          const weekDays = model.daily(model.end - 168 * ENERGY_HOUR, model.end, rate);
          const monthDays = model.daily(model.start, model.end, rate);
          this._data = { sensors: model.ids, noSensors: false, topDevices: [],
            todayKwh: today.total, todayCost: today.cost, thisWeekKwh: week.total, prevWeekKwh: previous.total,
            monthKwh: month.total, weekCost: week.cost, monthCost: month.cost,
            dailyCosts: model.hourlyToday.map((kwh, hour) => {
              const point = [...model.points.values()].find(p => p.key === model.points.get(model.todayStart)?.key && p.hour === hour);
              const price = point ? rate(hour, point.weekday) : null;
              return kwh !== null && price !== null && (rate.currency || this._hass.config?.currency) ? kwh * price : null;
            }),
            dailyData: model.hourlyToday, weeklyData: weekDays.map(day => day.total), monthlyData: monthDays.map(day => day.total),
            weekLabels: weekDays.map(day => day.key), monthLabels: monthDays.map(day => day.key),
            weeklyCosts: weekDays.map(day => day.cost), monthlyCosts: monthDays.map(day => day.cost),
            windows: { daily: today, weekly: week, monthly: month }, zone: model.zone };
        }

        this._loading = false;
        this._updateContent();
        if (this._chartJsReady) this._renderCharts();
      } catch (err) {
        console.error('[ha-energy-insights]', err);
        this._error = err.message || this._t('error');
        this._loading = false;
        this._updateContent();
      }
    }

    _getRecommendation(trendDiff, todayKwh) {
      return this._lang === 'pl' ? 'Pokazano wyłącznie zarejestrowany import z sieci; bez pomiaru urządzeń nie można przypisać zużycia konkretnym odbiornikom.' : 'Only recorded grid import is shown; without device measurements, usage cannot be attributed to appliances.';
    }

    // ===== RENDERING =====

    _updateLoadingState() {
      const body = this.shadowRoot?.querySelector('.panel-body');
      if (!body) return;
      if (this._loading) {
        body.innerHTML = this._renderLoading();
      }
    }

    _updateContent() {
      if (!this._domBuilt) {
        this._render();
        return;
      }
      // Targeted DOM update — replace only panel-body content
      const body = this.shadowRoot?.querySelector('.panel-body');
      if (!body) return;
      if (this._loading) {
        body.innerHTML = this._renderLoading();
      } else if (this._error) {
        body.innerHTML = this._renderError();
      } else {
        body.innerHTML = this._renderTabContent();
      }
      // Update tab bar active state
      this.shadowRoot.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === this._activeTab);
      });
    }

    _syncSupport() {
      const footer = this.shadowRoot.querySelector('.donate-section[data-source="own-card"]');
      if (footer) footer.style.display = this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-insights') ? '' : 'none';
    }

    _render() {
      if (!this._hass) return;
      if (this._domBuilt) {
        this._syncSupport();
        this._updateContent();
        return;
      }
      this.shadowRoot.innerHTML = `
  ${this._getStyles()}
        <div class="panel-root">
          ${this._renderHeader()}
          ${this._renderTabBar()}
          <div class="panel-body">
            ${this._loading ? this._renderLoading() : ''}
            ${this._error && !this._loading ? this._renderError() : ''}
            ${!this._loading && !this._error ? this._renderTabContent() : ''}
          </div>
          ${this._renderToolsBanner()}
          ${OWN_SUPPORT_FOOTER}
        </div>
      `
      this._domBuilt = true;
      this._bindEvents();
      this._syncSupport();
    }

    _getStyles() {
      return `
        <style>${LOCAL_BENTO_CSS}

          * { box-sizing: border-box; }


  /* ===== BENTO DESIGN SYSTEM (local fallback) ===== */

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
    --bento-bg: var(--primary-background-color, #F8FAFC);
    --bento-card: var(--card-background-color, #FFFFFF);
    --bento-border: var(--divider-color, #E2E8F0);
    --bento-text: var(--primary-text-color, #1E293B);
    --bento-text-secondary: var(--secondary-text-color, #64748B);
    --bento-text-muted: var(--disabled-text-color, #94A3B8);
    --bento-radius-xs: 6px;
    --bento-radius-sm: 10px;
    --bento-radius-md: 16px;
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
    --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
    --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  :host {
            font-family: 'Inter', sans-serif;
            display: block;
            background: var(--bento-bg);
            color: var(--bento-text);
          }

  :host(.bento-dark) {
      --bento-bg: var(--primary-background-color, #1a1a2e);
      --bento-card: var(--card-background-color, #16213e);
      --bento-text: var(--primary-text-color, #e2e8f0);
      --bento-text-secondary: var(--secondary-text-color, #94a3b8);
      --bento-border: var(--divider-color, #334155);
      --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
      --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    }
          @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin { to { transform: rotate(360deg); } }
          .panel-root { display: flex; flex-direction: column; height: 100%; background: var(--bento-bg); border-radius: var(--bento-radius-md); overflow: hidden; }
          .panel-header { padding: 24px 24px 16px; border-bottom: 1px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-md) var(--bento-radius-md) 0 0; }
          .panel-title { font-size: 17px; font-weight: 700; color: var(--bento-text); margin: 0; display: flex; align-items: center; gap: 10px; }
          .panel-title-icon { font-size: 24px; }
          .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); padding: 0 24px; background: var(--bento-card); overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--bento-border) transparent; }
          .tabs::-webkit-scrollbar { height: 4px; }
          .tabs::-webkit-scrollbar-track { background: transparent; }
          .tabs::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
          .tab-btn { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--bento-text-secondary); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
          .tab-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
          .tab-btn.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); font-weight: 600; }
          .panel-body { flex: 1; overflow-y: auto; padding: 20px; animation: fadeSlideIn 0.3s ease-out; }
          .stats-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
          .stat-card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; text-align: center; min-width: 0; overflow: hidden; box-shadow: var(--bento-shadow-sm); }
          .stat-card:hover { box-shadow: var(--bento-shadow-md); }
          .stat-label { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
          .stat-value { font-size: 24px; font-weight: 700; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2; }
          .stat-value.highlight { color: var(--bento-primary); }
          .stat-sub { font-size: 11px; color: var(--bento-text-muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .recommendation { background: var(--bento-primary-light); border: 1px solid rgba(59,130,246,.2); border-radius: var(--bento-radius-sm); padding: 14px 16px; font-size: 13px; color: var(--bento-text); margin-bottom: 16px; display: flex; align-items: flex-start; gap: 10px; }
          .recommendation-icon { font-size: 18px; flex-shrink: 0; }
          .trend-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
          .trend-up { background: var(--bento-error-light); color: var(--bento-error); }
          .trend-down { background: var(--bento-success-light); color: var(--bento-success); }
          .trend-neutral { background: rgba(158,158,158,.15); color: #9e9e9e; }
          .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
          .device-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 16px; }
          .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
          .device-row:hover { background: var(--bento-primary-light); }
          .device-rank { font-size: 11px; font-weight: 700; color: var(--bento-primary); width: 24px; flex-shrink: 0; text-align: center; }
          .device-name { font-size: 13px; font-weight: 500; flex: 1; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .device-bar-wrap { width: 70px; height: 6px; background: var(--bento-border); border-radius: 4px; overflow: hidden; flex-shrink: 0; }
          .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
          .device-value { font-size: 12px; font-weight: 600; color: var(--bento-primary); flex-shrink: 0; min-width: 70px; text-align: right; }
          .chart-container { position: relative; height: 240px; margin-bottom: 12px; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; box-shadow: var(--bento-shadow-md); }
          canvas { max-width: 100%; display: block; }
          .chart-label { text-align: center; font-size: 12px; color: var(--bento-text-secondary); margin-top: 8px; }
          .tips-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; margin-top: 16px; }
          .tip-card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; font-size: 13px; color: var(--bento-text); box-shadow: var(--bento-shadow-md); }
          .tip-card strong { color: var(--bento-primary); display: block; margin-bottom: 4px; font-size: 12px; text-transform: uppercase; letter-spacing: .3px; }
          .loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px; gap: 16px; color: var(--bento-text-secondary); font-size: 14px; }
          .spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top-color: var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; }
          .error-msg { padding: 16px; background: var(--bento-error-light); border-left: 4px solid var(--bento-error); border-radius: var(--bento-radius-xs); font-size: 13px; color: var(--bento-error); }
          .no-sensors { padding: 40px 24px; text-align: center; color: var(--bento-text-secondary); font-size: 13px; }
          button { font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; border-radius: var(--bento-radius-xs); transition: all .2s; cursor: pointer; border: none; padding: 8px 14px; background: var(--bento-primary); color: white; }
          button:hover { background: #2563EB; }
          .refresh-btn { background: transparent; color: var(--bento-text-secondary); padding: 4px; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; }
          .refresh-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
          .refresh-btn svg { width: 18px; height: 18px; }
          .tools-banner { background: var(--bento-card); border-top: 1px solid var(--bento-border); padding: 12px 24px; text-align: center; font-size: 12px; color: var(--bento-text-secondary); }
          .tools-banner a { color: var(--bento-primary); text-decoration: none; font-weight: 600; }
          .tools-banner a:hover { text-decoration: underline; }
          @media (max-width: 768px) {
            .panel-header { padding: 16px; }
            .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
            .tabs { flex-wrap: wrap; gap: 4px; padding: 0 16px; }
            .tab-btn { min-width: auto; font-size: 12px; padding: 6px 10px; }
            .device-list { overflow-x: auto; }
            .chart-container canvas { max-height: 200px; }
            .tip-card { padding: 12px; }
          }
          @media (max-width: 480px) {
            .tabs { gap: 1px; }
            .tab-btn { padding: 5px 8px; font-size: 11px; }
            .stat-value { font-size: 18px; }
          }
          @media (max-width: 360px) {
            .stats-grid { grid-template-columns: 1fr !important; }
          }

  </style>
      `;
    }

    _renderHeader() {
      return `
        <div class="panel-header">
          <h1 class="panel-title">
            <span class="panel-title-icon">⚡</span>
            ${this._t('energyInsights')}
          </h1>
        </div>
      `;
    }

    _renderTabBar() {
      const tabs = [
        { id: 'overview', label: this._t('overview') },
        { id: 'daily', label: this._t('daily') },
        { id: 'weekly', label: this._t('weekly') },
        { id: 'monthly', label: this._t('monthly') },
        { id: 'tips', label: this._t('tips') }
      ];

      return `
        <div class="tabs">
          ${tabs.map(tab => `
            <button class="tab-btn${this._activeTab === tab.id ? ' active' : ''}" data-tab="${tab.id}">
              ${tab.label}
            </button>
          `).join('')}
        </div>
      `;
    }

    _renderLoading() {
      return `
        <div class="loading">
          <div class="spinner"></div>
          <span>${this._t('loading')}</span>
        </div>
      `;
    }

    _renderError(e) {
      if (e) {
        console.error('[ha-energy-insights] render error:', e);
        const msg = _esc(e && e.message ? e.message : String(e));
        if (this.shadowRoot) {
          this.shadowRoot.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif;color:#b91c1c;"><strong>Energy Insights render error.</strong><br>${msg}</div>`;
        }
        return '';
      }
      return `<div class="error-msg">⚠ ${_esc(this._error || this._t('error'))}</div>`;
    }

    _renderTabContent() {
      if (!this._data) return '';

      if (this._data.noSensors) {
        return `<div class="no-sensors">${this._t('noSensors')} <a href="/energy">Energy Dashboard</a></div>`;
      }
      if (this._data.noSeries) {
        return `<div class="no-sensors" role="status">${this._t('noSeries')}</div>`;
      }

      switch (this._activeTab) {
        case 'overview': return this._renderOverview();
        case 'daily': return this._renderChartTab('daily');
        case 'weekly': return this._renderChartTab('weekly');
        case 'monthly': return this._renderChartTab('monthly');
        case 'tips': return this._renderTips();
        default: return this._renderOverview();
      }
    }

    _renderOverview() {
      if (!this._data) return '';
      const d = this._data;
      const cur = this._config.currency || this._hass?.config?.currency || '';
      const fmt = v => typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'N/A';

      const trendDiff = d.thisWeekKwh !== null && d.prevWeekKwh > 0
        ? ((d.thisWeekKwh - d.prevWeekKwh) / d.prevWeekKwh * 100)
        : null;
      const trendClass = trendDiff > 5 ? 'trend-up' : trendDiff < -5 ? 'trend-down' : 'trend-neutral';
      const trendIcon = trendDiff > 5 ? '↑' : trendDiff < -5 ? '↓' : '→';
      const trendLabel = trendDiff === null ? 'N/A' : trendDiff > 0 ? `+${fmt(trendDiff)}%` : `${fmt(trendDiff)}%`;
      const rec = this._getRecommendation(trendDiff, d.todayKwh);

      let html = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${this._t('today')}</div>
            <div class="stat-value highlight">${fmt(d.todayKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.todayCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisWeek')}</div>
            <div class="stat-value">${fmt(d.thisWeekKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.weekCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisMonth')}</div>
            <div class="stat-value">${fmt(d.monthKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.monthCost)} ${_esc(cur)}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('trend')}</div>
            <div class="stat-value"><span class="trend-badge ${trendClass}">${trendIcon} ${trendLabel}</span></div>
            <div class="stat-sub">${this._t('vsLastWeek')}</div>
          </div>
        </div>

        <div class="recommendation">
          <span class="recommendation-icon">💡</span>
          <span>${rec}</span>
        </div>
      `;

      if (d.topDevices && d.topDevices.length > 0) {
        const maxKwh = d.topDevices[0].kwh || 1;
        html += `<div class="section-title">${this._t('topDevices')}</div><div class="device-list">`;
        d.topDevices.forEach((dev, i) => {
          const pct = Math.round((dev.kwh / maxKwh) * 100);
          const valStr = dev.uom === 'W'
            ? `${dev.rawVal.toFixed(0)} W`
            : `${dev.kwh.toFixed(2)} kWh`;
          html += `
            <div class="device-row">
              <div class="device-rank">#${i + 1}</div>
              <div class="device-name" title="${_esc(dev.entity_id)}">${_esc(dev.name)}</div>
              <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
              <div class="device-value">${valStr}</div>
            </div>
          `;
        });
        html += `</div>`;
      }

      return html;
    }

    _renderChartTab(period) {
      const labels = {
        daily: 'hourlyConsumption',
        weekly: 'dailyConsumption',
        monthly: 'monthlyConsumption'
      };
      return `
        <div class="section-title">${this._t(labels[period] || 'overview')}</div>
        <div class="chart-container">
          ${this._chartJsReady ? `<canvas id="chart-${period}"></canvas>` : '<div class="chart-unavailable" role="status">Chart unavailable — numeric analysis remains available.</div>'}
        </div>
        <div class="chart-label">${_esc(this._data?.windows?.[period]?.start || '')} — ${_esc(this._data?.windows?.[period]?.end || '')} • ${_esc(this._data?.zone || '')}</div>
        <div class="chart-label">kWh • ${_esc(this._getTariffLabel())}</div>
      `;
    }

    _renderTips() {
      const tips = [
        { title: 'Sensor Setup', key: 'sensorSetup' },
        { title: 'Cost Tracking', key: 'costTracking' },
        { title: 'Peak Hours', key: 'peakHours' },
        { title: 'Device Breakdown', key: 'deviceBreakdown' },
        { title: 'Efficient Appliances', key: 'efficientAppliances' }
      ];

      return `
        <div class="tips-grid">
          ${tips.map(tip => `
            <div class="tip-card">
              <strong>💡 ${this._t(tip.key).split('—')[0].trim()}</strong>
              <span>${this._t(tip.key).split('—').pop().trim()}</span>
            </div>
          `).join('')}
        </div>
      `;
    }

    _renderToolsBanner() {
      return '';
    }

    // ===== CHARTS =====

    _chartThemeColors() {
      const style = getComputedStyle(this);
      return {
        text: style.getPropertyValue('--primary-text-color').trim() || (this._hass?.themes?.darkMode ? '#e2e8f0' : '#172335'),
        grid: style.getPropertyValue('--divider-color').trim() || (this._hass?.themes?.darkMode ? '#334155' : '#d6dce5')
      };
    }

    _syncChartTheme() {
      const { text, grid } = this._chartThemeColors();
      for (const chart of Object.values(this._charts)) {
        const { x, y } = chart.options.scales;
        if (x.ticks.color === text && y.ticks.color === text && y.grid.color === grid) continue;
        x.ticks.color = text;
        y.ticks.color = text;
        y.grid.color = grid;
        chart.update('none');
      }
    }

    _renderCharts() {
      if (!HA_ENERGY_CHART || !this._data) return;

      const chartDefs = {
        daily:   { data: this._data.dailyData,   labels: this._buildHourLabels(24) },
        weekly:  { data: this._data.weeklyData,   labels: this._data.weekLabels },
        monthly: { data: this._data.monthlyData,  labels: this._data.monthLabels }
      };

      if (this._activeTab in chartDefs) {
        const def = chartDefs[this._activeTab];
        const canvasId = `chart-${this._activeTab}`;
        const canvas = this.shadowRoot.getElementById(canvasId);
        if (!canvas) return;

        if (this._charts[this._activeTab]) {
          try { this._charts[this._activeTab].destroy(); } catch(e) { console.debug('[ha-energy-insights] caught:', e); }
        }

        const primaryColor = getComputedStyle(this).getPropertyValue('--bento-primary').trim() || '#4A90D9';
        const theme = this._chartThemeColors();

        this._charts[this._activeTab] = new HA_ENERGY_CHART(canvas, {
          type: 'bar',
          data: {
            labels: def.labels,
            datasets: [{
              label: 'kWh',
              data: def.data,
              backgroundColor: primaryColor + '80',
              borderColor: primaryColor,
              borderWidth: 1.5,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: ctx => {
                    const kwh = ctx.raw;
                    if (typeof kwh !== 'number') return 'N/A';
                    const cost = this._data[`${this._activeTab}Costs`]?.[ctx.dataIndex];
                    return ` ${kwh.toFixed(2)} kWh (${typeof cost === 'number' ? cost.toFixed(2) : 'N/A'} ${this._config.currency || this._hass?.config?.currency || ''})`;
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { color: theme.text, font: { size: 11 }, maxRotation: 45 },
                grid: { color: 'transparent' }
              },
              y: {
                ticks: { color: theme.text, font: { size: 11 } },
                grid: { color: theme.grid },
                beginAtZero: true
              }
            }
          }
        });
      }
    }

    _buildDayLabels(days) {
      const labels = [];
      const now = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        labels.push(`${d.getDate()}.${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
      return labels;
    }

    _buildHourLabels(hours) {
      const labels = [];
      for (let i = 0; i < hours; i++) {
        labels.push(`${String(i).padStart(2, '0')}:00`);
      }
      return labels;
    }

    // ===== EVENT BINDING =====

    _bindEvents() {
      const shadow = this.shadowRoot;
      shadow.querySelector('.support-dismiss')?.addEventListener('click', () => {
        try { localStorage.setItem('ha-energy-insights-support-dismissed', '1'); } catch (_) {}
        this._syncSupport();
      });

      shadow.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._activeTab = btn.dataset.tab;
          localStorage.setItem('ha-tools-energy-insights-active-tab', this._activeTab);
          history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this._activeTab);
          // Update tab content only (no full DOM rebuild)
          this._updateContent();
          if (this._chartJsReady && this._data && this._activeTab !== 'overview' && this._activeTab !== 'tips') {
            this._schedule(() => this._renderCharts(), 0);
          }
        });
      });
    }

    setActiveTab(tabId) {
      this._activeTab = tabId;
      this._render();
    }

    getCardSize() { return 8; }

    getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }
  }

  if (!customElements.get('ha-energy-insights')) {
    customElements.define('ha-energy-insights', HAEnergyInsights);
  }



  class HaEnergyInsightsEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
    }
    setConfig(config) {
      this._config = { ...config };
      this._render();
    }
    _dispatch() {
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    _render() {
      this.shadowRoot.innerHTML = `
        <style>
              :host { display:block; padding:16px; }
              h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
              input { outline:none; transition:border-color .2s; }
              input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
          </style>
        <h3>Energy Insights</h3>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
                <input type="text" id="cf_title" value="${_esc(this._config?.title || 'Energy Insights')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency || this._hass?.config?.currency || '')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
      `;
          const f_title = this.shadowRoot.querySelector('#cf_title');
          if (f_title) f_title.addEventListener('input', (e) => {
            this._config = { ...this._config, title: e.target.value };
            this._dispatch();
          });
          const f_currency = this.shadowRoot.querySelector('#cf_currency');
          if (f_currency) f_currency.addEventListener('input', (e) => {
            this._config = { ...this._config, currency: e.target.value };
            this._dispatch();
          });
    }
    connectedCallback() { this._render(); }
  }
  if (!customElements.get('ha-energy-insights-editor')) { customElements.define('ha-energy-insights-editor', HaEnergyInsightsEditor); }


  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'ha-energy-insights', name: 'Energy Insights', description: 'Recorded grid import, costs and period trends', preview: false });
})();

// --- Bundled card: ha-energy-email (v3.3.0 bundle)
(function() {
  'use strict';

  // Component-local XSS protection: never reads from or publishes a global helper.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

  // Component-local persistence retains this card's existing localStorage keys.
  const haToolsPersistence = { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-email] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

  const OWN_SUPPORT_FOOTER = ENERGY_OPTIMIZER_DONATE_HTML;
  const LOCAL_BENTO_CSS = `.donate-section[data-source="own-card"]{margin:24px 0 4px;padding:18px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);background:var(--bento-primary-light);color:var(--bento-text)}.donate-section[data-source="own-card"] .donate-text{display:flex;flex-direction:column;gap:4px;flex:1;min-width:220px}.donate-section[data-source="own-card"] .donate-buttons{display:flex;flex-wrap:wrap;gap:8px}.donate-section[data-source="own-card"] a{color:var(--bento-primary);font-weight:700;text-decoration:none}`;

  /**
   * HA Energy Email Card v3.4.0
   * Send daily/weekly/monthly energy usage reports as HTML email.
   * v3.4.0: HA Tools Email v2.0.0 websocket backend for SMTP status, schedules, and send_now.
   *         HA-native persistent storage (input_text helpers) for cross-device sync.
   *         Legacy automation creation remains available when backend WS is unavailable.
   *         Auto-discovery of energy sensors and notify services.
   *         Falls back to manual config (sensor.energy_report_devices) if available.
   *
   * Config:
   *   type: custom:ha-energy-email
   *   title: Energy Email Reports          (optional)
   *   recipient: your@email.com            (optional, auto-detected from notify service)
   *   currency: EUR                        (optional, defaults to Home Assistant currency)
   *   energy_price: 0.30                   (optional tariff; no assumed default)
   *   notify_service: email_report         (optional, auto-detected)
   */
  class HAEnergyEmail extends HTMLElement {
    static getConfigElement() { return document.createElement('ha-energy-email-editor'); }
    constructor() {
      super();
      this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
      this.attachShadow({ mode: 'open' });
      this._toolId = this.tagName.toLowerCase().replace('ha-', '');
      this._hass = null;
      this._config = {
        title: 'Energy Email Reports',
        recipient: '',
        currency: '',
        energy_price: null,
        energy_tariff_mode: 'flat',
        energy_price_day: null,
        energy_price_night: null,
        energy_price_weekday: null,
        energy_price_weekend: null,
        energy_price_wd_day: null,
        energy_price_wd_night: null,
        energy_price_we_day: null,
        energy_price_we_night: null,
        energy_day_hour_start: 6,
        energy_night_hour_start: 22,
        notify_service: '',
      };
      this._activeTab = 'overview';
      this._lastSent = {};
      this._sending = false;
      this._firstRender = false;
      this._lastRenderTime = 0;
      this._renderScheduled = false;
      this._timers = new Set();
      this._reportPeriod = 'week';
      this._overviewPeriod = 'day';
      this._discoveredDevices = null;
      this._detectedRecipient = null;
      this._detectedService = null;
      this._helpersChecked = false;
      this._helpersReady = false;
      this._discoveryDone = false;
      this._excludedDevices = new Set();
      this._devicePage = 0;
      this._devicesPerPage = 20;
      // Default schedule times
      this._scheduleDefaults = { daily: '07:30', weekly_day: 'mon', weekly_time: '08:00', monthly_time: '08:00' };
      this._emailBackendChecked = false;
      this._emailBackendAvailable = false;
      this._emailBackendConfig = null;
      this._emailBackendError = null;
      this._backendReportPreviews = {};
      this._emailSchedules = [];
      this._scheduleBusy = {};
      this._legacySchedules = this._loadLegacySchedules();
      this._smtpTesting = false;
      this._smtpStatus = null;
    }

    _sanitize(str) {
      if (!str) return str;
      try { return decodeURIComponent(escape(str)); } catch(e) { return str; }
    }

    _loadLegacySchedules() {
      const defaults = {
        daily: { kind: 'energy_report', cadence: 'daily', time: '07:30', recipients: [], enabled: false },
        weekly: { kind: 'energy_report', cadence: 'weekly', time: '08:00', recipients: [], enabled: false },
        monthly: { kind: 'energy_report', cadence: 'monthly', time: '08:00', recipients: [], enabled: false }
      };
      try {
        const raw = localStorage.getItem('ha-energy-email-schedules');
        if (!raw) return defaults;
        const saved = JSON.parse(raw);
        return {
          daily: { ...defaults.daily, ...(saved.daily || {}) },
          weekly: { ...defaults.weekly, ...(saved.weekly || {}) },
          monthly: { ...defaults.monthly, ...(saved.monthly || {}) }
        };
      } catch (e) {
        console.debug('[ha-energy-email] legacy schedule load failed:', e);
        return defaults;
      }
    }

    _saveLegacySchedules() {
      try {
        localStorage.setItem('ha-energy-email-schedules', JSON.stringify(this._legacySchedules || {}));
      } catch (e) {
        this._showToast(this._lang === 'pl' ? 'Nie udało się zapisać harmonogramu lokalnie' : 'Could not save local schedule');
      }
    }

    _renderError(e) {
      console.error('[ha-energy-email] render error:', e);
      const msg = _esc(e && e.message ? e.message : String(e));
      if (this.shadowRoot) {
        this.shadowRoot.innerHTML = `<div style="padding:16px;font-family:system-ui,sans-serif;color:#b91c1c;"><strong>Energy Email render error.</strong><br>${msg}</div>`;
      }
    }

    set hass(hass) {
      try {
        const previousLanguage = this._lang;
        const language = hass?.locale?.language || hass?.language;
        if (language) this._lang = language.startsWith('pl') ? 'pl' : 'en';
        this._hass = hass;
        if (!hass) return;
        const now = Date.now();
        if (!this._firstRender) {
          this._firstRender = true;
          this._discoverAll().catch(e => this._renderError(e));
          this._render();
          this._lastRenderTime = now;
          return;
        }
        if (previousLanguage !== this._lang) {
          this._renderPreservingDrafts();
          this._lastRenderTime = now;
          return;
        }
        if (!this._emailBackendChecked) this._loadEmailBackendConfig().catch(e => this._showToast('⚠️ ' + (e?.message || e)));
        if (now - this._lastRenderTime < 10000) {
          if (!this._renderScheduled) {
            this._renderScheduled = true;
            this._schedule(() => {
              this._renderScheduled = false;
              if (!this.isConnected) return;
              try {
                this._updateLiveData();
                this._lastRenderTime = Date.now();
              } catch (e) {
                this._renderError(e);
              }
            }, 5000);
          }
          return;
        }
        this._updateLiveData();
        this._lastRenderTime = now;
      } catch (e) {
        this._renderError(e);
      }
    }




    get _t() {
      const T = {
        pl: {
          title: 'Email Energetyczny',
          loading: 'Wczytywanie...',
          noData: 'Brak danych',
          error: 'Błąd',
          refresh: 'Odśwież',
          save: 'Zapisz',
          cancel: 'Anuluj',
          smtpConfigWarning: 'Skonfiguruj SMTP w: Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj.',
          locale: (this._lang === 'pl' ? 'pl-PL' : 'en-US'),
        },
        en: {
          title: 'Energy Email',
          loading: 'Loading...',
          noData: 'No data',
          error: 'Error',
          refresh: 'Refresh',
          save: 'Save',
          cancel: 'Cancel',
          smtpConfigWarning: 'Set up SMTP in: Settings \u2192 Devices & services \u2192 HA Tools Email \u2192 Configure.',
          locale: 'en-US',
        },
      };
      return T[this._lang] || T.en;
    }

    setConfig(config) {
      const cfg = config || {};
      const price = (key) => {
        const value = cfg[key];
        if (value === undefined) return this._config[key];
        if (value === null || value === '') return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
      };
      this._config = {
        ...this._config,
        ...cfg,
        title: cfg.title || this._config.title || 'Energy Email Reports',
        recipient: cfg.recipient || this._config.recipient || '',
        currency: cfg.currency || this._config.currency || '',
        energy_price: price('energy_price'),
        energy_tariff_mode: cfg.energy_tariff_mode || this._config.energy_tariff_mode || 'flat',
        energy_price_day: price('energy_price_day'),
        energy_price_night: price('energy_price_night'),
        energy_price_weekday: price('energy_price_weekday'),
        energy_price_weekend: price('energy_price_weekend'),
        energy_price_wd_day: price('energy_price_wd_day'),
        energy_price_wd_night: price('energy_price_wd_night'),
        energy_price_we_day: price('energy_price_we_day'),
        energy_price_we_night: price('energy_price_we_night'),
        energy_day_hour_start: Number.isInteger(Number(cfg.energy_day_hour_start)) ? Number(cfg.energy_day_hour_start) : this._config.energy_day_hour_start,
        energy_night_hour_start: Number.isInteger(Number(cfg.energy_night_hour_start)) ? Number(cfg.energy_night_hour_start) : this._config.energy_night_hour_start,
        notify_service: cfg.notify_service || this._config.notify_service || '',
      };
      if (this._hass?.states) this._render();
    }


    getCardSize() { return 4; }

    getGridOptions() { return { columns: 12, min_rows: 3, min_columns: 6 }; }

    _getRate(hour, dayOfWeek) {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const dayStart = c.energy_day_hour_start ?? 6;
      const nightStart = c.energy_night_hour_start ?? 22;
      const isDay = (dayStart < nightStart) ? (hour >= dayStart && hour < nightStart) : (hour >= dayStart || hour < nightStart);
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      let value;
      switch (mode) {
        case 'day_night':
          value = isDay ? c.energy_price_day : c.energy_price_night; break;
        case 'weekday_weekend':
          value = isWeekend ? c.energy_price_weekend : c.energy_price_weekday; break;
        case 'mixed':
          value = isWeekend ? (isDay ? c.energy_price_we_day : c.energy_price_we_night) : (isDay ? c.energy_price_wd_day : c.energy_price_wd_night); break;
        default:
          value = c.energy_price;
      }
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
    }

    _getAvgRate() {
      const mode = this._config.energy_tariff_mode || 'flat';
      if (mode === 'flat') return this._getRate(12, 1);
      let sum = 0;
      for (let dow = 0; dow < 7; dow++) {
        for (let h = 0; h < 24; h++) {
          const rate = this._getRate(h, dow);
          if (rate === null) return null;
          sum += rate;
        }
      }
      return sum / 168;
    }

    _cost(kwh) {
      // Aggregate consumption cannot price a time-dependent tariff.
      if ((this._config.energy_tariff_mode || 'flat') !== 'flat') return null;
      const rate = this._getRate(12, 1);
      return rate === null || !Number.isFinite(kwh) ? null : kwh * rate;
    }

    _bucketCost(buckets, unit) {
      const divisor = 1 / energyFactor(unit);
      if ((this._config.energy_tariff_mode || 'flat') === 'flat') {
        return this._cost([...buckets.values()].reduce((sum, value) => sum + value, 0) / divisor);
      }
      const timeZone = this._hass?.config?.time_zone;
      if (!timeZone) return null;
      try {
        const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
        const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        let cost = 0;
        for (const [stamp, change] of buckets) {
          const date = new Date(stamp);
          const rate = this._getRate(Number(hourFormat.format(date)), days.indexOf(dayFormat.format(date)));
          if (rate === null) return null;
          cost += change / divisor * rate;
        }
        return Number.isFinite(cost) ? cost : null;
      } catch (e) { return null; }
    }

    _formatCost(value) {
      return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : 'N/A';
    }

    _getTariffLabel() {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const cur = c.currency || this._hass?.config?.currency || '';
      if (this._getAvgRate() === null) return this._lang === 'pl' ? 'Taryfa nieskonfigurowana' : 'Tariff not configured';
      const suffix = this._lang === 'pl' ?
        { 'day_night': '/kWh (dzień/noc)', 'weekday_weekend': '/kWh (roboczy/weekend)' } :
        { 'day_night': '/kWh (day/night)', 'weekday_weekend': '/kWh (weekday/weekend)' };
      switch (mode) {
        case 'day_night': return c.energy_price_day + '/' + c.energy_price_night + ' ' + cur + (suffix['day_night'] || '');
        case 'weekday_weekend': return c.energy_price_weekday + '/' + c.energy_price_weekend + ' ' + cur + (suffix['weekday_weekend'] || '');
        case 'mixed': return 'mix: ' + c.energy_price_wd_day + '/' + c.energy_price_wd_night + '/' + c.energy_price_we_day + '/' + c.energy_price_we_night + ' ' + cur;
        default: return c.energy_price + ' ' + cur + '/kWh';
      }
    }


    static getStubConfig() {
      return {
        type: 'custom:ha-energy-email',
        title: 'Energy Email Reports'
      };
    }

    _state(entity_id, fallback = '0') {
      if (!this._hass) return fallback;
      const s = this._hass.states[entity_id];
      return s ? s.state : fallback;
    }

    _attr(entity_id, attr, fallback = null) {
      if (!this._hass) return fallback;
      const s = this._hass.states[entity_id];
      return s && s.attributes[attr] !== undefined ? s.attributes[attr] : fallback;
    }

    _float(v, fallback = 0) {
      const n = parseFloat(v);
      return isNaN(n) ? fallback : n;
    }

    _fmt(v, decimals = 2) {
      return this._float(v).toFixed(decimals);
    }

    // --- auto-discovery ---

    async _discoverAll() {
      await this._loadEmailBackendConfig();
      await this._ensureHelpers();
      this._discoverRecipient();
      this._discoveryDone = true;
      this._render();
      // Fetch recorder stats in background (for period views)
      this._fetchAllPeriodStats().then(() => {
        if (this._periodCache_day || this._periodCache_week || this._periodCache_month) this._render();
      }).catch(() => {});
    }

    // --- HA-native persistent storage via input_text helpers ---

    // Helper config: 'key' is our logical name, 'name' generates entity_id (HA slugifies name → entity_id)
    // e.g. name "Energy Email Recipient" → input_text.energy_email_recipient
    static get HELPERS() {
      return [
        { key: 'recipient', name: 'Energy Email Recipient', max: 255 },
        { key: 'service', name: 'Energy Email Service', max: 100 },
        { key: 'daily_time', name: 'Energy Email Daily Time', max: 5 },
        { key: 'weekly_time', name: 'Energy Email Weekly Time', max: 5 },
        { key: 'weekly_day', name: 'Energy Email Weekly Day', max: 3 },
        { key: 'monthly_time', name: 'Energy Email Monthly Time', max: 5 },
        { key: 'price', name: 'Energy Email Price', max: 10 },
        { key: 'excluded', name: 'Energy Email Excluded', max: 255 },
      ];
    }

    // Resolve helper key → entity_id by scanning hass.states for matching friendly_name
    _helperEntity(key) {
      const cfg = HAEnergyEmail.HELPERS.find(h => h.key === key);
      if (!cfg) return null;
      // First try exact slug match (name lowercased, spaces→underscores)
      const slug = cfg.name.toLowerCase().replace(/\s+/g, '_');
      const directEid = `input_text.${slug}`;
      if (this._hass?.states?.[directEid]) return directEid;
      // Fallback: scan all input_text entities for matching friendly_name
      if (this._hass?.states) {
        for (const [eid, state] of Object.entries(this._hass.states)) {
          if (eid.startsWith('input_text.energy_email') && state.attributes?.friendly_name === cfg.name) return eid;
        }
      }
      return directEid; // return expected eid even if not found yet
    }

    async _ensureHelpers() {
      if (this._helpersChecked) return;
      this._helpersChecked = true;
      // Opening a card must not create entities or change the household configuration.
      this._helpersReady = HAEnergyEmail.HELPERS.every(helper =>
        !!this._hass?.states?.[this._helperEntity(helper.key)]);
      this._loadFromHelpers();
    }

    _loadFromHelpers() {
      const s = this._hass?.states;
      if (!s) return;
      const read = (key) => {
        const eid = this._helperEntity(key);
        return this._readHelper(key);
      };
      const recipient = read('recipient');
      const service = read('service');
      const dailyTime = read('daily_time');
      const weeklyTime = read('weekly_time');
      const weeklyDay = read('weekly_day');
      const monthlyTime = read('monthly_time');
      const price = read('price');
      if (recipient && recipient.includes('@')) this._detectedRecipient = recipient;
      if (service && service.length > 0) this._detectedService = service;
      if (/^\d{2}:\d{2}$/.test(dailyTime)) this._scheduleDefaults.daily = dailyTime;
      if (/^\d{2}:\d{2}$/.test(weeklyTime)) this._scheduleDefaults.weekly_time = weeklyTime;
      if (weeklyDay && weeklyDay.length >= 3) this._scheduleDefaults.weekly_day = weeklyDay;
      if (/^\d{2}:\d{2}$/.test(monthlyTime)) this._scheduleDefaults.monthly_time = monthlyTime;
      if (price && !isNaN(parseFloat(price)) && parseFloat(price) >= 0) this._config.energy_price = parseFloat(price);
      const excluded = read('excluded');
      if (excluded) this._excludedDevices = new Set(excluded.split(',').map(s => s.trim()).filter(Boolean));
    }

    _requireAdmin() {
      if (this._hass?.user?.is_admin === true) return true;
      this._showToast(this._lang === 'pl' ? 'Tylko administrator może zmieniać ustawienia i wysyłać raporty.' : 'Only administrators can change settings and send reports.');
      return false;
    }

    async _saveToHelper(key, value) {
      if (!this._requireAdmin()) return;
      const eid = this._helperEntity(key);
      try {
        if (!this._hass?.states?.[eid]) throw new Error('Helper not configured');
        await this._hass.callService('input_text', 'set_value', { entity_id: eid, value: value || '' });
      } catch (e) {
        // Fallback to localStorage
        try { localStorage.setItem(`ha-energy-email-${key}`, value); } catch(e2) { console.debug('[ha-energy-email] caught:', e); }
      }
    }

    _readHelper(key) {
      const eid = this._helperEntity(key);
      const s = this._hass?.states?.[eid];
      if (s && s.state && s.state !== 'unknown' && s.state !== '') return s.state;
      // Fallback to localStorage
      try { return localStorage.getItem(`ha-energy-email-${key}`) || ''; } catch(e) { return ''; }
    }

    async _emailWs(command, payload = {}) {
      const hass = this._hass;
      if (!hass?.callWS) throw new Error('Home Assistant websocket API is unavailable');
      return hass.callWS({ type: 'ha_tools_email/' + command, ...payload });
    }

    async _loadEmailBackendConfig(options = {}) {
      const showErrors = !!options.showErrors;
      if (this._hass?.user?.is_admin !== true) {
        this._emailBackendChecked = true;
        this._emailBackendError = 'Administrator access is required for email configuration.';
        return null;
      }
      const hass = this._hass;
      if (!hass?.callWS) {
        this._emailBackendChecked = true;
        this._emailBackendAvailable = false;
        return null;
      }
      try {
        const resp = await hass.callWS({ type: 'ha_tools_email/get_config' });
        this._emailBackendChecked = true;
        this._emailBackendAvailable = true;
        this._emailBackendConfig = resp || {};
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : [];
        this._emailBackendError = null;
        if (resp?.default_recipient && !this._config.recipient) this._detectedRecipient = resp.default_recipient;
        await Promise.all(['daily', 'weekly', 'monthly'].map(async cadence => {
          try {
            this._backendReportPreviews[cadence] = await this._emailWs('preview_energy_report', { cadence });
          } catch (e) {
            this._backendReportPreviews[cadence] = null;
          }
        }));
        this._render();
        return resp;
      } catch (e) {
        this._emailBackendChecked = true;
        this._emailBackendAvailable = false;
        this._emailBackendConfig = null;
        this._emailSchedules = [];
        this._emailBackendError = e?.message || String(e);
        if (showErrors) this._showToast('⚠️ ' + (this._lang === 'pl' ? 'Backend email niedostępny: ' : 'Email backend unavailable: ') + this._emailBackendError);
        this._render();
        return null;
      }
    }

    async _refreshBackendSchedules(showErrors = false) {
      if (!this._emailBackendAvailable) return;
      try {
        const resp = await this._emailWs('list_schedules');
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : [];
        this._emailBackendError = null;
        this._render();
      } catch (e) {
        this._emailBackendError = e?.message || String(e);
        if (showErrors) this._showToast('❌ ' + (this._lang === 'pl' ? 'Nie udało się pobrać harmonogramów: ' : 'Could not load schedules: ') + this._emailBackendError);
      }
    }

    _getEnergySchedule(cadence) {
      return (this._emailSchedules || []).find(s => s && s.kind === 'energy_report' && s.cadence === cadence) || null;
    }

    _defaultScheduleTime(cadence) {
      if (cadence === 'weekly') return this._scheduleDefaults.weekly_time || '08:00';
      if (cadence === 'monthly') return this._scheduleDefaults.monthly_time || '08:00';
      return this._scheduleDefaults.daily || '07:30';
    }

    _splitRecipients(value) {
      return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
    }

    _scheduleRecipients(cadence) {
      const input = this.shadowRoot?.getElementById('schedule-recipients-' + cadence);
      if (input) return this._splitRecipients(input.value);
      const schedule = this._getEnergySchedule(cadence) || this._legacySchedules?.[cadence];
      const recipients = Array.isArray(schedule?.recipients) ? schedule.recipients : [];
      if (recipients.length) return recipients;
      const recipient = this._getRecipient();
      return recipient ? [recipient] : [];
    }

    _discoverRecipient() {
      if (this._hass?.user?.is_admin !== true) return;
      if (!this._config.recipient && !this._detectedRecipient && this._emailBackendConfig?.default_recipient) {
        this._detectedRecipient = this._emailBackendConfig.default_recipient;
        return;
      }
      // Try to get SMTP recipient from HA helper first
      if (!this._config.recipient && !this._detectedRecipient) {
        const savedRecipient = this._readHelper('recipient');
        if (savedRecipient && savedRecipient.includes('@')) { this._detectedRecipient = savedRecipient; return; }
        // Try config_entries API to get ha_tools_email default recipient
        if (!this._detectedRecipient && !this._configEntriesChecked) {
          this._configEntriesChecked = true;
          this._hass.callWS({ type: 'config/config_entries' }).then(entries => {
            const haToolsEntry = entries.find(e => e.domain === 'ha_tools_email');
            if (haToolsEntry && haToolsEntry.data) {
              const r = haToolsEntry.data.default_recipient;
              if (r) { this._detectedRecipient = r; this._render(); }
            }
          }).catch(() => {});
        }
      }
    }

    _getRecipient() {
      if (this._config.recipient) return this._config.recipient;
      if (this._detectedRecipient) return this._detectedRecipient;
      return '';
    }

    _saveRecipient(email) {
      if (!this._requireAdmin()) return;
      this._saveToHelper('recipient', email);
      this._detectedRecipient = email;
      this._render();
    }

    _devices() {
      const manual = this._attr('sensor.energy_report_devices', 'devices');
      if (manual && Array.isArray(manual) && manual.length > 0) {
        return manual;
      }
      return [];
    }

    _getOverviewDataForPeriod(period) {
      return this._getAutoDataForPeriod(period === 'total' ? 'month' : period);
    }

    _getAutoDataForPeriod(period) {
      const cached = this[`_periodCache_${period}`];
      return Array.isArray(cached) ? [...cached].sort((a, b) => b.month - a.month) : [];
    }

    async _fetchRecorderStats(period) {
      const hours = { day: 24, week: 168, month: 720 }[period];
      if (!hours || !this._hass?.callWS) return;
      const cacheKey = `_periodCache_${period}`;
      const statusKey = `_periodStatus_${period}`;
      this[cacheKey] = [];
      this[statusKey] = 'no_data';
      const end = new Date(Math.floor(Date.now() / 3600000) * 3600000);
      const start = new Date(end.getTime() - hours * 3600000);
      this[`_periodWindow_${period}`] = { start: start.toISOString(), end: end.toISOString() };
      try {
        const prefs = await this._hass.callWS({ type: 'energy/get_prefs' });
        const ids = energyImportIds(prefs);
        if (!ids.length) { this[statusKey] = 'no_sources'; return; }
        const rawMetadata = await this._hass.callWS({ type: 'recorder/get_statistics_metadata', statistic_ids: ids });
        const metadata = Array.isArray(rawMetadata) ? Object.fromEntries(rawMetadata.map(row => [row.statistic_id, row])) : (rawMetadata || {});
        const stats = await this._hass.callWS({ type: 'recorder/statistics_during_period',
          start_time: start.toISOString(), end_time: end.toISOString(), statistic_ids: ids,
          period: 'hour', types: ['change'] });
        const result = [];
        const hasSamples = ids.some(id => stats?.[id]?.length);
        for (const id of ids) {
          const meta = metadata[id];
          const unit = meta?.statistics_unit_of_measurement || meta?.unit_of_measurement;
          if (meta?.has_sum !== true || !energyFactor(unit) || (meta.unit_class && meta.unit_class !== 'energy')) {
            this[statusKey] = 'unsupported'; return;
          }
          const buckets = new Map();
          for (const point of stats?.[id] || []) {
            const stamp = energyTimestamp(point.start);
            const change = typeof point.change === 'number' ? point.change : NaN;
            if (!Number.isFinite(stamp) || stamp < start.getTime() || stamp >= end.getTime() ||
                (stamp - start.getTime()) % 3600000 !== 0 || buckets.has(stamp) || !Number.isFinite(change) || change < 0) {
              this[statusKey] = 'partial'; return;
            }
            buckets.set(stamp, change);
          }
          if (buckets.size !== hours) { this[statusKey] = hasSamples ? 'partial' : 'no_data'; return; }
          const kwh = [...buckets.values()].reduce((sum, value) => sum + value * energyFactor(unit), 0);
          result.push({ name: this._hass.states?.[id]?.attributes?.friendly_name || id,
            key: id, entity_id: id, month: kwh, lastMonth: null, cost: this._bucketCost(buckets, unit), source: 'recorder' });
        }
        this[cacheKey] = result;
        this[statusKey] = 'ready';
        this[`_periodCacheTime_${period}`] = Date.now();
      } catch (e) {
        this[statusKey] = 'error';
        console.warn('Energy Email: complete Recorder period data unavailable');
      }
    }

    // Coalesce refreshes and retry unavailable data without polling every HA update.
    async _fetchAllPeriodStats() {
      if (this._periodRefreshPromise) return this._periodRefreshPromise;
      this._lastPeriodRefresh = Date.now();
      this._periodRefreshPromise = Promise.all([
        this._fetchRecorderStats('day'), this._fetchRecorderStats('week'), this._fetchRecorderStats('month')
      ]);
      try { await this._periodRefreshPromise; }
      finally { this._periodRefreshPromise = null; }
    }

    _filterExcluded(data) {
      if (!this._excludedDevices || this._excludedDevices.size === 0) return data;
      return data.filter(d => {
        const key = d.key || d.entity_id || d.name;
        return !this._excludedDevices.has(key);
      });
    }

    _getOverviewData() {
      return this._getOverviewDataForPeriod(this._overviewPeriod || 'day');
    }

    _autoState(id) {
      const s = this._state(id, 'unknown');
      return s === 'on' ? '\u2705 Enabled' : s === 'off' ? '\u274C Disabled' : '\u2753 Unknown';
    }

    _autoStateClass(id) {
      const s = this._state(id, 'unknown');
      return s === 'on' ? 'auto-on' : s === 'off' ? 'auto-off' : 'auto-unknown';
    }

    // --- main render ---

    _renderPreservingDrafts() {
      const root = this.shadowRoot;
      const focused = root.activeElement;
      const focusId = focused?.id;
      const focusTab = focused?.dataset?.tab;
      const selection = focused?.selectionStart != null ? [focused.selectionStart, focused.selectionEnd, focused.selectionDirection] : null;
      const fields = [...root.querySelectorAll('input[id], select[id], textarea[id]')].map(field => ({ id: field.id, value: field.value, checked: field.checked }));
      const tabsScroll = root.querySelector('.tabs')?.scrollLeft || 0;
      this._render();
      // Reopen an unsaved inline tariff editor without committing the draft.
      if (fields.some(field => field.id === 'price-input')) root.getElementById('price-display')?.click();
      for (const saved of fields) {
        const field = root.getElementById(saved.id);
        if (!field) continue;
        field.value = saved.value;
        if (typeof saved.checked === 'boolean') field.checked = saved.checked;
      }
      const target = focusId ? root.getElementById(focusId) : [...root.querySelectorAll('[data-tab]')].find(el => el.dataset.tab === focusTab);
      target?.focus({ preventScroll: true });
      if (selection && target?.setSelectionRange) target.setSelectionRange(...selection);
      const tabs = root.querySelector('.tabs');
      if (tabs) tabs.scrollLeft = tabsScroll;
    }

    _render() {
      if (!this._hass) return;
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const recipientDisplay = recipient
        ? `${L ? 'Do' : 'To'}: ${_esc(recipient)}`
        : (L ? 'Nie ustawiono odbiorcy' : 'No recipient set');
      this.shadowRoot.innerHTML = `
        <style>${LOCAL_BENTO_CSS}


  /* ===== BENTO DESIGN SYSTEM (local fallback) ===== */

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
    --bento-bg: var(--primary-background-color, #F8FAFC);
    --bento-card: var(--card-background-color, #FFFFFF);
    --bento-border: var(--divider-color, #E2E8F0);
    --bento-text: var(--primary-text-color, #1E293B);
    --bento-text-secondary: var(--secondary-text-color, #64748B);
    --bento-text-muted: var(--disabled-text-color, #94A3B8);
    --bento-radius-xs: 6px;
    --bento-radius-sm: 10px;
    --bento-radius-md: 16px;
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
    --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
    --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  :host {
            font-family: 'Inter', sans-serif;
          }

  :host(.bento-dark) {
      --bento-bg: var(--primary-background-color, #1a1a2e);
      --bento-card: var(--card-background-color, #16213e);
      --bento-text: var(--primary-text-color, #e2e8f0);
      --bento-text-secondary: var(--secondary-text-color, #94a3b8);
      --bento-border: var(--divider-color, #334155);
      --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
      --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
    }
          .card { background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-md); padding: 20px; box-shadow: var(--bento-shadow-sm); box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
          .header-icon { font-size: 24px; }
          .header-title { font-size: 17px; font-weight: 700; color: var(--bento-text); }
          .header-sub { font-size: 12px; color: var(--bento-text-secondary); margin-top: 1px; }
          .tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); margin-bottom: 18px; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; scrollbar-color: var(--bento-border) transparent; -webkit-overflow-scrolling: touch; }
          .tabs::-webkit-scrollbar { height: 4px; }
          .tabs::-webkit-scrollbar-track { background: transparent; }
          .tabs::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
          .tab-btn { padding: 8px 16px; border: none; background: transparent; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--bento-text-secondary); border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all .2s; white-space: nowrap; font-family: 'Inter', sans-serif; border-radius: 0; }
          .tab-btn:hover { color: var(--bento-primary); background: var(--bento-primary-light); }
          .tab-btn.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); font-weight: 600; }
          .grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; margin-bottom: 16px; }
          .grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 10px; margin-bottom: 16px; }
          @media (max-width: 768px) { .grid3 { grid-template-columns: repeat(2, 1fr); } }
          @media (max-width: 480px) { .grid3 { grid-template-columns: 1fr; } .grid2 { grid-template-columns: repeat(2, 1fr); } }
          .stat { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; text-align: center; min-width: 0; overflow: hidden; box-sizing: border-box; }
          .stat-value { font-size: 24px; font-weight: 700; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .stat-label { font-size: 11px; font-weight: 500; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .4px; margin-top: 2px; }
          .stat-sub { font-size: 11px; color: var(--bento-text-muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .section-title { font-size: 13px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 8px; }
          .device-row { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .device-row:hover { background: var(--bento-primary-light); }
          .device-name { flex: 1; font-size: 13px; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .device-val { font-size: 12px; font-weight: 600; color: var(--bento-primary); min-width: 70px; text-align: right; white-space: nowrap; flex-shrink: 0; }
          .device-bar-wrap { flex: 1; background: var(--bento-border); border-radius: 4px; height: 6px; overflow: hidden; }
          .device-bar { height: 100%; background: var(--bento-primary); border-radius: 4px; transition: width .4s; }
          .schedule-card { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 10px; box-sizing: border-box; max-width: 100%; overflow: hidden; }
          .schedule-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; overflow: hidden; }
          .schedule-name { font-size: 14px; font-weight: 600; color: var(--bento-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
          .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; }
          .badge-ok { background: var(--bento-success-light); color: var(--bento-success); }
          .badge-er { background: var(--bento-error-light); color: var(--bento-error); }
          .badge-wa { background: var(--bento-warning-light); color: var(--bento-warning); }
          .badge-pr { background: var(--bento-primary-light); color: var(--bento-primary); }
          .badge-auto { background: rgba(139,92,246,.1); color: #8B5CF6; }
          .schedule-meta { font-size: 12px; color: var(--bento-text-secondary); }
          .schedule-meta span { margin-right: 12px; }
          .btn-row { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
          .btn { padding: 8px 16px; border-radius: var(--bento-radius-xs); border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); font-size: 13px; font-weight: 500; cursor: pointer; font-family: 'Inter', sans-serif; transition: all .2s; }
          .btn:hover { background: var(--bento-bg); }
          .btn:disabled { opacity: .45; cursor: not-allowed; }
          .btn-primary { background: var(--bento-primary) !important; color: #fff !important; border-color: var(--bento-primary) !important; box-shadow: 0 2px 8px rgba(59,130,246,.3); }
          .btn-primary:hover { background: #2563EB !important; }
          .btn-ok { background: var(--bento-success) !important; color: #fff !important; border-color: var(--bento-success) !important; }
          .smtp-section { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: 12px; padding: 16px; margin-bottom: 16px; }
          .smtp-missing { border-color: #f59e0b40; background: #fef3c720; }
          .smtp-header { display: flex; align-items: center; gap: 12px; }
          .smtp-icon { font-size: 24px; }
          .smtp-title { font-weight: 700; font-size: 14px; color: var(--bento-text); }
          .smtp-detail { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }
          .smtp-detail code { background: var(--bento-border); padding: 1px 6px; border-radius: 4px; font-size: 11px; }
          .smtp-actions { display: flex; align-items: center; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
          .smtp-guide { margin-top: 16px; }
          .guide-title { font-weight: 700; font-size: 14px; margin-bottom: 12px; color: var(--bento-text); }
          .guide-steps { display: flex; flex-direction: column; gap: 16px; }
          .guide-step { display: flex; gap: 12px; }
          .step-num { flex-shrink: 0; width: 28px; height: 28px; background: var(--bento-primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
          .guide-step p { margin: 4px 0; font-size: 13px; color: var(--bento-text-secondary); line-height: 1.5; }
          .guide-step pre { background: #1e293b; color: #e2e8f0; padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; line-height: 1.6; white-space: pre; margin: 8px 0; max-width: 100%; box-sizing: border-box; }
          .guide-step a { color: var(--bento-primary); text-decoration: none; }
          .guide-step a:hover { text-decoration: underline; }
          .guide-alt { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--bento-border); }
          .smtp-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
          .smtp-table th { background: var(--bento-border); padding: 6px 10px; text-align: left; font-weight: 600; }
          .smtp-table td { padding: 6px 10px; border-bottom: 1px solid var(--bento-border); }
          .smtp-table tr:hover td { background: var(--bento-border); }
          .toast { display: none; position: fixed; bottom: 24px; right: 24px; z-index: 9999; background: #1e293b; color: #e2e8f0; padding: 12px 20px; border-radius: var(--bento-radius-sm); font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.3); max-width: 320px; }
          .toast.show { display: block; animation: slideUp .3s ease-out; }
          @keyframes slideUp { from { opacity:0; transform: translateY(12px); } to { opacity:1; transform: translateY(0); } }
          .preview-box { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; font-size: 13px; color: var(--bento-text); max-height: 320px; overflow-y: auto; }
          .preview-box h3 { font-size: 15px; margin: 0 0 10px; }
          .preview-box h4 { font-size: 13px; margin: 14px 0 6px; color: var(--bento-text-secondary); }
          .preview-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .preview-table th { background: var(--bento-border); padding: 5px 8px; text-align: left; font-weight: 600; font-size: 11px; }
          .preview-table td { padding: 5px 8px; border-bottom: 1px solid var(--bento-border); }
          .preview-table tr:last-child td { border-bottom: none; }
          .trend-up { color: var(--bento-error); }
          .trend-down { color: var(--bento-success); }
          .pagination-row { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 12px 0 4px; }
          .pagination-btn { padding: 6px 14px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-bg); color: var(--bento-text); font-size: 12px; cursor: pointer; transition: all .15s; }
          .pagination-btn:hover:not([disabled]) { background: var(--bento-primary-light); border-color: var(--bento-primary); color: var(--bento-primary); }
          .pagination-btn[disabled] { opacity: 0.4; cursor: not-allowed; }
          .pagination-info { font-size: 12px; color: var(--bento-text-secondary); }
          .info-row { display: flex; gap: 6px; align-items: flex-start; padding: 10px; background: var(--bento-primary-light); border-radius: var(--bento-radius-xs); margin-bottom: 12px; font-size: 12px; color: var(--bento-text); }
          .info-warn { background: var(--bento-warning-light); }
          .auto-on { color: var(--bento-success); }
          .auto-off { color: var(--bento-error); }
          .auto-unknown { color: var(--bento-warning); }
          .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spin .6s linear infinite; margin-right: 6px; vertical-align: middle; }
          @keyframes spin { to { transform: rotate(360deg); } }
          .last-sent { font-size: 11px; color: var(--bento-text-muted); margin-top: 4px; }
          .empty-state { text-align: center; padding: 32px 20px; }
          .empty-state .big { font-size: 40px; margin-bottom: 12px; }
          .empty-state .title { font-size: 15px; font-weight: 600; color: var(--bento-text); margin-bottom: 6px; }
          .empty-state .desc { font-size: 13px; color: var(--bento-text-secondary); line-height: 1.6; max-width: 400px; margin: 0 auto; }
          .source-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; margin-left: 6px; }
          .source-auto { background: rgba(139,92,246,.1); color: #8B5CF6; }
          .email-setup { background: var(--bento-warning-light); border: 1px solid rgba(245,158,11,.3); border-radius: var(--bento-radius-sm); padding: 14px; margin-bottom: 16px; }
          .email-setup-title { font-size: 13px; font-weight: 600; color: var(--bento-text); margin-bottom: 8px; }
          .email-input-row { display: flex; gap: 8px; align-items: center; }
          .email-input { flex: 1; padding: 8px 12px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 13px; font-family: 'Inter', sans-serif; background: var(--bento-card); color: var(--bento-text); outline: none; }
          .email-input:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px var(--bento-primary-light); }
          .email-bar { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 8px 12px; background: var(--bento-success-light); border-radius: var(--bento-radius-xs); font-size: 12px; color: var(--bento-text); }
          .email-edit-btn { background: none; border: none; color: var(--bento-primary); cursor: pointer; font-size: 11px; padding: 2px 6px; font-family: 'Inter', sans-serif; }
          .email-edit-btn:hover { text-decoration: underline; }
          .source-manual { background: var(--bento-success-light); color: var(--bento-success); }
          .config-section { margin-bottom: 20px; }
          .config-section-title { font-size: 13px; font-weight: 700; color: var(--bento-text); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
          .device-toggle { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--bento-radius-xs); transition: background .15s; }
          .device-toggle:hover { background: var(--bento-primary-light); }
          .device-toggle label { flex: 1; font-size: 13px; color: var(--bento-text); cursor: pointer; display: flex; align-items: center; gap: 8px; }
          .device-toggle .dt-val { font-size: 11px; color: var(--bento-text-secondary); min-width: 60px; text-align: right; }
          .toggle-switch { position: relative; width: 36px; height: 20px; flex-shrink: 0; }
          .toggle-switch input { opacity: 0; width: 0; height: 0; }
          .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background: var(--bento-border); border-radius: 20px; transition: .2s; }
          .toggle-slider::before { content: ''; position: absolute; height: 16px; width: 16px; left: 2px; bottom: 2px; background: #fff; border-radius: 50%; transition: .2s; }
          .toggle-switch input:checked + .toggle-slider { background: var(--bento-primary); }
          .toggle-switch input:checked + .toggle-slider::before { transform: translateX(16px); }
          .config-input-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
          .config-input-row label { font-size: 12px; color: var(--bento-text-secondary); min-width: 80px; font-weight: 500; }
          .config-input { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); font-size: 13px; background: var(--bento-card); color: var(--bento-text); font-family: 'Inter', sans-serif; }
          .config-input:focus { border-color: var(--bento-primary); outline: none; box-shadow: 0 0 0 3px var(--bento-primary-light); }
          .device-count { font-size: 11px; color: var(--bento-text-muted); font-weight: 400; }
          @media (max-width: 768px) {
            .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
            .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
            .card { padding: 14px; }
            .grid3 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .grid2 { grid-template-columns: repeat(2, 1fr); gap: 8px; }
            .stat-value { font-size: 18px; }
            .stat-label { font-size: 10px; }
          }
          @media (max-width: 480px) {
            .tabs { gap: 1px; }
            .tab-btn { padding: 5px 8px; font-size: 11px; }
            .grid3 { grid-template-columns: 1fr; gap: 8px; }
            .grid2 { grid-template-columns: 1fr; gap: 8px; }
            .stat-value { font-size: 16px; }
          }


  </style>

        <div class="card">
          <div class="header">
            <div class="header-icon">\u{1F4E7}</div>
            <div>
              <div class="header-title">${_esc(this._config.title)}</div>
              <div class="header-sub">${recipientDisplay} \u00A0\u2022\u00A0 <span id="price-display" style="cursor:pointer;color:var(--bento-primary);border-bottom:1px dashed var(--bento-primary)" title="${L ? 'Kliknij aby zmieni\u0107' : 'Click to change'}">${_esc(this._config.currency || this._hass?.config?.currency || '')} ${_esc(this._getTariffLabel())} \u270E</span></div>
            </div>
          </div>
          <div class="tabs">
            <button class="tab-btn ${this._activeTab === 'overview' ? 'active' : ''}" data-tab="overview">\u{1F4CA} ${L ? "Przegląd" : "Overview"}</button>
            <button class="tab-btn ${this._activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">\u{1F4C5} ${L ? "Harmonogram" : "Schedule"}</button>
            <button class="tab-btn ${this._activeTab === 'preview' ? 'active' : ''}" data-tab="preview">\u{1F4CB} ${L ? "Podgląd" : "Preview"}</button>
            <button class="tab-btn ${this._activeTab === 'send' ? 'active' : ''}" data-tab="send">\u{1F4E4} ${L ? "Wyślij teraz" : "Send Now"}</button>
            <button class="tab-btn ${this._activeTab === 'config' ? 'active' : ''}" data-tab="config">\u2699\uFE0F ${L ? "Ustawienia" : "Config"}</button>
          </div>
          <div id="tab-content"></div>
          ${this._hass?.user?.is_admin && this._config?.show_support !== false && !energySupportDismissed('ha-energy-email') ? OWN_SUPPORT_FOOTER : ''}
        </div>
        <div class="toast" id="toast"></div>
      `
      bindEnergySupport(this.shadowRoot, 'ha-energy-email');
      this.shadowRoot.querySelectorAll('.tab-btn').forEach(t => {
        t.addEventListener('click', () => {
          this._activeTab = t.dataset.tab;
          history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this._activeTab);
          this.shadowRoot.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'));
          t.classList.add('active');
          this._renderTab();
        });
      });
      this._renderTab();
      this._bindEmailEvents();
      this._bindPriceEdit();
      if (this._hass?.user?.is_admin !== true) {
        const price = this.shadowRoot.getElementById('price-display');
        if (price) { price.style.cursor = 'default'; price.style.borderBottom = 'none'; price.removeAttribute('title'); }
      }
    }

    _bindEmailEvents() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      const saveBtn = root.getElementById('email-save');
      const editBtn = root.getElementById('email-edit');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const input = root.getElementById('email-input');
          if (input && input.value && input.value.includes('@')) {
            this._saveRecipient(input.value.trim());
          }
        });
        const input = root.getElementById('email-input');
        if (input) {
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value && input.value.includes('@')) {
              this._saveRecipient(input.value.trim());
            }
          });
        }
      }
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          this._saveToHelper('recipient', '');
          this._detectedRecipient = null;
          this._render();
        });
      }
    }

    _bindPriceEdit() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      const priceEl = root.getElementById('price-display');
      if (!priceEl) return;
      priceEl.addEventListener('click', (e) => {
        e.preventDefault();
        const L = this._lang === 'pl';
        const cur = this._getAvgRate();
        // Replace the price display with an inline input
        const container = priceEl.parentElement;
        const origHtml = container.innerHTML;
        const inputHtml = `<span style="display:inline-flex;align-items:center;gap:4px">
          <span>${_esc(this._config.currency || this._hass?.config?.currency || '')}</span>
          <input type="number" id="price-input" value="${cur ?? ''}" step="0.01" min="0" style="width:70px;padding:3px 6px;border:1.5px solid var(--bento-primary);border-radius:4px;font-size:12px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;text-align:center">
          <span>/kWh</span>
          <button id="price-save" class="btn btn-primary" style="padding:3px 10px;font-size:11px;margin:0" aria-label="${L ? 'Zapisz' : 'Save'}">\u2714</button>
          <button id="price-cancel" class="btn" style="padding:3px 8px;font-size:11px;margin:0" aria-label="${L ? 'Anuluj' : 'Cancel'}">\u2716</button>
        </span>`;
        // Find just the price part and replace
        const priceSpan = root.getElementById('price-display');
        priceSpan.outerHTML = inputHtml;
        const input = root.getElementById('price-input');
        const saveBtn = root.getElementById('price-save');
        const cancelBtn = root.getElementById('price-cancel');
        if (input) input.focus();
        const save = () => {
          const val = parseFloat(input.value);
          if (Number.isFinite(val) && val >= 0) {
            this._config.energy_price = val;
            this._saveToHelper('price', String(val));
            this._fetchAllPeriodStats().then(() => this._render());
            this._render();
          }
        };
        if (saveBtn) saveBtn.addEventListener('click', save);
        if (cancelBtn) cancelBtn.addEventListener('click', () => this._render());
        if (input) input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') this._render();
        });
      });
    }

    _renderTab() {
      const el = this.shadowRoot.getElementById('tab-content');
      if (!el) return;
      if (this._hass?.user?.is_admin !== true && ['schedule', 'send', 'config'].includes(this._activeTab)) {
        el.innerHTML = `<div class="empty-state" role="status">${this._lang === 'pl' ? 'Tylko administrator może zmieniać ustawienia i wysyłać raporty. Podgląd energii jest dostępny w zakładce Przegląd.' : 'Only administrators can change settings and send reports. Energy data remains available in Overview.'}</div>`;
        return;
      }
      switch (this._activeTab) {
        case 'overview': el.innerHTML = this._tabOverview(); this._attachOverviewEvents(); break;
        case 'schedule': el.innerHTML = this._tabSchedule(); this._attachScheduleEvents(); break;
        case 'preview':  el.innerHTML = this._tabPreview(); break;
        case 'send':     el.innerHTML = this._tabSend(); this._attachSendEvents(); break;
        case 'config':   el.innerHTML = this._tabConfig(); this._attachConfigEvents(); break;
      }
    }

    _updateLiveData() {
      // Preserve forms while the user edits settings or schedules.
      if (!['overview', 'preview'].includes(this._activeTab)) return;
      if (this._discoveryDone && Date.now() - (this._lastPeriodRefresh || 0) > 300000) {
        this._fetchAllPeriodStats().then(() => { if (this.isConnected) this._renderTab(); }).catch(() => {});
        if (this._emailBackendAvailable) this._loadEmailBackendConfig();
      }
      this._renderTab();
    }

    _attachOverviewEvents() {
      this.shadowRoot.querySelectorAll('.overview-period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = btn.dataset.period;
          this._overviewPeriod = p;
          this._devicePage = 0;
          // Refresh recorder stats if cache is older than 60s
          const cacheTime = this[`_periodCacheTime_${p}`] || 0;
          if (p !== 'total' && Date.now() - cacheTime > 60000) {
            this._fetchRecorderStats(p).then(() => this._renderTab()).catch(() => {});
          }
          this._renderTab();
        });
      });
      const prevBtn = this.shadowRoot.querySelector('[data-page-prev]');
      if (prevBtn) prevBtn.addEventListener('click', () => { this._devicePage = Math.max(0, (this._devicePage || 0) - 1); this._renderTab(); });
      const nextBtn = this.shadowRoot.querySelector('[data-page-next]');
      if (nextBtn) nextBtn.addEventListener('click', () => { this._devicePage = (this._devicePage || 0) + 1; this._renderTab(); });
    }

    _attachPeriodEvents() {
      this.shadowRoot.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => { this._reportPeriod = btn.dataset.period; this._renderTab(); });
      });
    }

    // --- tabs ---

    _tabOverview() {
      const L = this._lang === 'pl';
      const period = ['day', 'week', 'month'].includes(this._overviewPeriod) ? this._overviewPeriod : 'day';
      const periodLabels = {
        total: { lbl: 'Total', lblPl: '\u0141\u0105cznie', sub: '', subPl: '' },
        day:   { lbl: 'Last 24h', lblPl: 'Ostatnie 24h', sub: 'Last 24h', subPl: 'Ostatnie 24h' },
        week:  { lbl: 'Last 7 days', lblPl: 'Ostatnie 7 dni', sub: 'Last 7 days', subPl: 'Ostatnie 7 dni' },
        month: { lbl: 'Last 30 days', lblPl: 'Ostatnie 30 dni', sub: 'Last 30 days', subPl: 'Ostatnie 30 dni' },
      };
      const pl = periodLabels[period];
      const periodLabel = L ? pl.lblPl : pl.lbl;
      const displayData = this._getOverviewDataForPeriod(period);
      const window = this[`_periodWindow_${period}`];
      const periodNote = window ? `${window.start} — ${window.end}` : '';
      const totalEnergy = displayData.length ? displayData.reduce((sum, d) => sum + d.month, 0) : null;
      const totalCost = displayData.length && displayData.every(d => typeof d.cost === 'number' && Number.isFinite(d.cost))
        ? displayData.reduce((sum, d) => sum + d.cost, 0) : null;
      const maxVal = Math.max(...displayData.map(x => x.month)) || 1;
      const periodBtns = ['day', 'week', 'month'].map(p => {
        const lb = p === 'total' ? (L ? 'Wszystko' : 'All') : p === 'day' ? '24h' : p === 'week' ? '7d' : '30d';
        return `<button class="overview-period-btn" data-period="${p}" style="padding:5px 12px;font-size:11px;border-radius:6px;cursor:pointer;border:1px solid var(--bento-border);background:${period === p ? 'var(--bento-primary)' : 'var(--bento-bg)'};color:${period === p ? '#fff' : 'var(--bento-text)'};font-weight:${period === p ? '600' : '400'};">${lb}</button>`;
      }).join('');
      if (!displayData.length) {
        const status = this[`_periodStatus_${period}`] || 'no_data';
        const messages = L ? {
          no_sources: 'Skonfiguruj źródło importu z sieci w panelu Energia, aby wyświetlić zużycie.',
          no_data: 'Brak statystyk Recorder dla skonfigurowanych źródeł w tym okresie. Sumy będą dostępne, gdy każde źródło dostarczy dane.',
          partial: 'Statystyki okresu są niepełne lub nieprawidłowe. Sprawdź dane każdego źródła w panelu Energia; suma pozostaje niedostępna.',
          unsupported: 'Źródło importu wymaga statystyk energii w Wh, kWh lub MWh. Sprawdź konfigurację źródła w panelu Energia.',
          error: 'Nie udało się odczytać statystyk energii. Sprawdź połączenie z Home Assistant i ponów odczyt.'
        } : {
          no_sources: 'Configure a grid-import source in Energy Dashboard to display usage.',
          no_data: 'No Recorder statistics for the configured sources in this period. Totals become available when every source has data.',
          partial: 'Period statistics are incomplete or invalid. Check every source in Energy Dashboard; the total remains unavailable.',
          unsupported: 'The import source requires energy statistics in Wh, kWh or MWh. Check its Energy Dashboard configuration.',
          error: 'Energy statistics could not be loaded. Check your Home Assistant connection and retry.'
        };
        return `<div class="section-title">${periodLabel}</div><div>${periodBtns}</div>
          <div class="empty-state" role="status">${_esc(messages[status] || messages.error)}${['no_sources', 'partial', 'unsupported'].includes(status) ? ` <a href="/energy">${L ? 'Otwórz panel Energia' : 'Open Energy Dashboard'}</a>` : ''}</div>
          ${periodNote ? `<div class="info-row" style="overflow-wrap:anywhere">${_esc(periodNote)}</div>` : ''}`;
      }
      return `
        ${periodNote ? `<div class="info-row" style="overflow-wrap:anywhere">${_esc(periodNote)}</div>` : ''}
        <div class="info-row">${L ? 'Import z sieci: źródła skonfigurowane w Energy Dashboard.' : 'Grid import: sources configured in Energy Dashboard.'}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div class="section-title" style="margin:0;">\u{1F4CA} ${periodLabel}</div>
          <div style="display:flex;gap:4px;">${periodBtns}</div>
        </div>
        <div class="grid3">
          <div class="stat">
            <div class="stat-value" style="color:#F59E0B">${totalEnergy === null ? 'N/A' : totalEnergy.toFixed(1)}</div>
            <div class="stat-label">kWh ${periodLabel}</div>
            <div class="stat-sub">${displayData.length} ${L ? 'źródeł importu' : 'import sources'}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#3B82F6">${this._formatCost(totalCost)}</div>
            <div class="stat-label">${_esc(this._config.currency || this._hass?.config?.currency || '')} ${L ? 'Koszt' : 'Cost'}</div>
            <div class="stat-sub">@ ${_esc(this._getTariffLabel())}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#10B981">${displayData.length > 0 ? _esc(displayData[0].name.split(' ').slice(0,2).join(' ')) : '-'}</div>
            <div class="stat-label">${L ? 'Największy import' : 'Largest Import'}</div>
            <div class="stat-sub">${displayData.length > 0 ? displayData[0].month.toFixed(1) + ' kWh' : ''}</div>
          </div>
        </div>
        <div class="section-title">\u26A1 ${L ? 'Import według źródła' : 'Import by Source'}</div>
        ${(() => {
          const page = this._devicePage || 0;
          const perPage = this._devicesPerPage || 20;
          const totalPages = Math.ceil(displayData.length / perPage);
          const pageData = displayData.slice(page * perPage, (page + 1) * perPage);
          const rows = pageData.map(d => {
            const pct = maxVal > 0 ? (d.month / maxVal * 100) : 0;
            const diff = d.month - d.lastMonth;
            const diffStr = d.lastMonth > 0 && diff !== 0 ? `<span class="${diff > 0 ? 'trend-up' : 'trend-down'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)} kWh</span>` : '';
            const entityInfo = d.entity_id ? `<span style="font-size:10px;color:var(--bento-text-muted)" title="${_esc(d.entity_id)}">${_esc((d.entity_id.split('.')[1] || d.entity_id).substring(0,20))}</span>` : '';
            return `<div class="device-row" title="${_esc(d.entity_id || d.name)}">
              <div class="device-name">${_esc(d.name)} ${entityInfo}</div>
              <div class="device-bar-wrap"><div class="device-bar" style="width:${pct}%"></div></div>
              <div class="device-val">${d.month.toFixed(1)} kWh</div>
              <div style="font-size:11px;color:var(--bento-text-secondary);min-width:60px;text-align:right">${diffStr}</div>
            </div>`;
          }).join('');
          const pagination = totalPages > 1 ? `
            <div class="pagination-row">
              <button class="pagination-btn" data-page-prev ${page === 0 ? 'disabled' : ''}>\u2190 ${L ? 'Poprzednia' : 'Prev'}</button>
              <span class="pagination-info">${L ? 'Strona' : 'Page'} ${page + 1} / ${totalPages}</span>
              <button class="pagination-btn" data-page-next ${page >= totalPages - 1 ? 'disabled' : ''}>${L ? 'Nast\u0119pna' : 'Next'} \u2192</button>
            </div>` : '';
          return rows + pagination;
        })()}`;
    }

    _tabSchedule() {
      const L = this._lang === 'pl';
      const cadences = ['daily', 'weekly', 'monthly'];
      if (this._emailBackendAvailable) {
        return `
          ${this._renderSmtpSection()}
          <div class="info-row">\u{1F4BE}\u00A0 ${L ? 'Raporty energii wymagają HA Tools Email 2.1.2+. Harmonogramy są zapisywane w integracji.' : 'Energy reports require HA Tools Email 2.1.2+. Schedules are stored in the integration.'}</div>
          ${cadences.map(c => this._renderBackendScheduleCard(c)).join('')}
        `;
      }
      return this._renderLegacyScheduleTab();
    }

    _renderBackendScheduleCard(cadence) {
      const L = this._lang === 'pl';
      const labels = {
        daily: ['\u2600\uFE0F', L ? 'Raport dzienny' : 'Daily Report', L ? 'Codziennie' : 'Daily'],
        weekly: ['\u{1F4C6}', L ? 'Raport tygodniowy' : 'Weekly Report', L ? 'Co tydzie\u0144' : 'Weekly'],
        monthly: ['\u{1F4C8}', L ? 'Raport miesi\u0119czny' : 'Monthly Report', L ? 'Co miesi\u0105c' : 'Monthly']
      };
      const [icon, title, cadenceLabel] = labels[cadence] || labels.daily;
      const schedule = this._getEnergySchedule(cadence);
      const time = schedule?.time || this._defaultScheduleTime(cadence);
      const recipients = Array.isArray(schedule?.recipients) && schedule.recipients.length ? schedule.recipients.join(', ') : this._getRecipient();
      const enabled = schedule ? schedule.enabled !== false : true;
      const busy = !!this._scheduleBusy[cadence];
      const status = schedule
        ? (enabled ? '<span class="badge badge-ok">\u2705 Active</span>' : '<span class="badge badge-er">\u274C Disabled</span>')
        : '<span class="badge badge-wa">\u2795 ' + (L ? 'Nie utworzony' : 'Not Created') + '</span>';
      return `<div class="schedule-card" data-schedule-card="${cadence}">
        <div class="schedule-row"><div class="schedule-name">${icon} ${title}</div>${status}</div>
        <div class="schedule-meta"><span>${cadenceLabel}</span><span>${L ? 'Raport energii' : 'Energy report'}</span>${schedule?.id ? `<span>${_esc(schedule.id)}</span>` : ''}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;margin-top:10px">
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Godzina' : 'Time'}<input class="config-input" type="time" id="schedule-time-${cadence}" value="${_esc(time)}" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Odbiorcy' : 'Recipients'}<input class="config-input" type="text" id="schedule-recipients-${cadence}" value="${_esc(recipients || '')}" placeholder="name@example.com, other@example.com" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:600;white-space:nowrap"><input type="checkbox" id="schedule-enabled-${cadence}" ${enabled ? 'checked' : ''}> ${L ? 'W\u0142\u0105czony' : 'Enabled'}</label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary schedule-save" data-cadence="${cadence}" ${busy ? 'disabled' : ''}>${schedule ? (L ? 'Aktualizuj' : 'Update') : (L ? 'Utw\u00F3rz' : 'Create')}</button>
          <button class="btn schedule-send" data-cadence="${cadence}" ${busy || !this._emailBackendConfig?.smtp_configured ? 'disabled' : ''}>${L ? 'Wy\u015Blij teraz' : 'Send now'}</button>
          <button class="btn schedule-delete" data-cadence="${cadence}" ${busy || !schedule ? 'disabled' : ''}>${L ? 'Usu\u0144' : 'Delete'}</button>
        </div>
      </div>`;
    }

    _renderLegacyScheduleCard(cadence) {
      const L = this._lang === 'pl';
      const labels = {
        daily: ['\u2600\uFE0F', L ? 'Raport dzienny' : 'Daily Report'],
        weekly: ['\u{1F4C6}', L ? 'Raport tygodniowy' : 'Weekly Report'],
        monthly: ['\u{1F4C8}', L ? 'Raport miesi\u0119czny' : 'Monthly Report']
      };
      const [icon, title] = labels[cadence] || labels.daily;
      const schedule = this._legacySchedules?.[cadence] || { kind: 'energy_report', cadence, time: this._defaultScheduleTime(cadence), recipients: [], enabled: false };
      const recipients = Array.isArray(schedule.recipients) && schedule.recipients.length ? schedule.recipients.join(', ') : this._getRecipient();
      return `<div class="schedule-card" data-schedule-card="${cadence}">
        <div class="schedule-row"><div class="schedule-name">${icon} ${title}</div><span class="badge ${schedule.enabled ? 'badge-ok' : 'badge-wa'}">${schedule.enabled ? '\u2705 localStorage' : '\u26AB localStorage'}</span></div>
        <div class="schedule-meta">${L ? 'Fallback lokalny. Nie tworzy harmonogramu po stronie HA.' : 'Local fallback. Does not create a Home Assistant server schedule.'}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end;margin-top:10px">
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Godzina' : 'Time'}<input class="config-input" type="time" id="schedule-time-${cadence}" value="${_esc(schedule.time || this._defaultScheduleTime(cadence))}" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Odbiorcy' : 'Recipients'}<input class="config-input" type="text" id="schedule-recipients-${cadence}" value="${_esc(recipients || '')}" placeholder="name@example.com" style="width:100%;margin-top:4px"></label>
          <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:600;white-space:nowrap"><input type="checkbox" id="schedule-enabled-${cadence}" ${schedule.enabled ? 'checked' : ''}> ${L ? 'W\u0142\u0105czony lokalnie' : 'Enabled locally'}</label>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary schedule-save" data-cadence="${cadence}">${L ? 'Zapisz lokalnie' : 'Save locally'}</button>
          <button class="btn schedule-send" data-cadence="${cadence}">${L ? 'Wy\u015Blij teraz' : 'Send now'}</button>
          <button class="btn schedule-delete" data-cadence="${cadence}">${L ? 'Wyczy\u015B\u0107' : 'Clear'}</button>
        </div>
      </div>`;
    }

    _renderLegacyScheduleTab() {
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const service = this._detectedService || this._config?.notify_service || '';
      const dailyId = 'automation.send_daily_energy_report';
      const weeklyId = 'automation.send_weekly_energy_report';
      const monthlyId = 'automation.send_monthly_energy_report';
      const dailyState = this._state(dailyId, 'missing');
      const weeklyState = this._state(weeklyId, 'missing');
      const monthlyState = this._state(monthlyId, 'missing');
      const exists = (s) => s !== 'missing' && s !== 'unavailable';
      const badge = (state) => {
        if (state === 'on') return '<span class="badge badge-ok">\u2705 Active</span>';
        if (state === 'off') return '<span class="badge badge-er">\u274C Disabled</span>';
        return '<span class="badge badge-wa">\u2795 ' + (L ? 'Nie utworzony' : 'Not Created') + '</span>';
      };
      const recipientInfo = recipient ? `\u{1F4E7} ${recipient}` : `\u{1F4E7} <i>${L ? 'Brak — ustaw email powy\u017Cej' : 'None — set email above'}</i>`;
      const sd = this._scheduleDefaults;
      const dayNames = L
        ? { mon: 'Poniedzia\u0142ek', tue: 'Wtorek', wed: '\u015Aroda', thu: 'Czwartek', fri: 'Pi\u0105tek', sat: 'Sobota', sun: 'Niedziela' }
        : { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
      const dayOptions = Object.entries(dayNames).map(([k, v]) => `<option value="${k}" ${sd.weekly_day === k ? 'selected' : ''}>${v}</option>`).join('');
      const weeklyDayLabel = dayNames[sd.weekly_day] || dayNames.mon;
      const scheduleCard = (icon, nameL, nameE, state, timeLabel, enableId, disableId, createId, timeInputId, timeValue, extraInputHtml) => {
        const name = L ? nameL : nameE;
        const ex = exists(state);
        return `<div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">${icon} ${name}</div>${badge(state)}</div>
          <div class="schedule-meta"><span>\u{1F552} ${timeLabel}</span><span>${recipientInfo}</span></div>
          <div style="display:flex;gap:8px;align-items:center;margin-top:10px;flex-wrap:wrap">
            <label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500">${L ? 'Godzina' : 'Time'}:</label>
            <input type="time" id="${timeInputId}" value="${timeValue}" style="padding:5px 10px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;">
            ${extraInputHtml || ''}
          </div>
          <div class="btn-row">
            ${ex ? (state === 'on'
              ? `<button class="btn btn-ok" id="${disableId}">${L ? 'Wy\u0142\u0105cz' : 'Disable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`
              : `<button class="btn btn-primary" id="${enableId}">${L ? 'W\u0142\u0105cz' : 'Enable'}</button><button class="btn" id="update-${createId}">\u{1F504} ${L ? 'Aktualizuj' : 'Update'}</button>`)
              : `<button class="btn btn-primary" id="${createId}">\u2795 ${L ? 'Utw\u00F3rz automatyzacj\u0119' : 'Create Automation'}</button>`}
          </div>
        </div>`;
      };
      return `
        ${this._renderSmtpSection()}
        <div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L
          ? 'Tryb legacy: harmonogramy lokalne zapisuj\u0105 si\u0119 tylko w tej przegl\u0105darce. Stare automatyzacje HA pozostaj\u0105 dost\u0119pne poni\u017Cej.'
          : 'Legacy mode: local schedules are saved only in this browser. Existing HA automation controls remain available below.'}</div>
        ${!recipient && !service ? `<div class="info-row info-warn">\u26A0\uFE0F\u00A0 ${L
          ? '<b>Brak adresu email.</b> Ustaw email w polu powy\u017Cej lub domy\u015Blnego odbiorc\u0119 w <a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>.'
          : '<b>No email recipient.</b> Set an email in the field above or a default recipient in <a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>.'}</div>` : ''}
        ${['daily', 'weekly', 'monthly'].map(c => this._renderLegacyScheduleCard(c)).join('')}
        <div class="section-title">${L ? 'Starsze automatyzacje HA' : 'Legacy HA Automations'}</div>
        ${scheduleCard(
          '\u2600\uFE0F', 'Raport dzienny', 'Daily Report', dailyState,
          `${L ? 'Codziennie o' : 'Every day at'} ${sd.daily}`,
          'enable-daily', 'disable-daily', 'create-daily', 'time-daily', sd.daily, ''
        )}
        ${scheduleCard(
          '\u{1F4C6}', 'Raport tygodniowy', 'Weekly Report', weeklyState,
          `${weeklyDayLabel} ${L ? 'o' : 'at'} ${sd.weekly_time}`,
          'enable-weekly', 'disable-weekly', 'create-weekly', 'time-weekly', sd.weekly_time,
          `<label style="font-size:12px;color:var(--bento-text-secondary);font-weight:500;margin-left:8px">${L ? 'Dzie\u0144' : 'Day'}:</label>
           <select id="day-weekly" style="padding:5px 10px;border:1.5px solid var(--bento-border);border-radius:var(--bento-radius-xs);font-size:13px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif">${dayOptions}</select>`
        )}
        ${scheduleCard(
          '\u{1F4C8}', 'Raport miesi\u0119czny', 'Monthly Report', monthlyState,
          `${L ? '1. dzie\u0144 miesi\u0105ca o' : '1st of month at'} ${sd.monthly_time}`,
          'enable-monthly', 'disable-monthly', 'create-monthly', 'time-monthly', sd.monthly_time, ''
        )}
        <div style="margin-top:12px;padding:12px 16px;background:rgba(59,130,246,0.08);border-left:3px solid var(--bento-primary,#3B82F6);border-radius:6px;font-size:13px;color:var(--bento-text);">
          <strong>\u2139\uFE0F Info:</strong> ${this._helpersReady
            ? (L
              ? 'Ustawienia (email, serwis, godziny) są zapisywane w Home Assistant i działają na każdym urządzeniu.'
              : 'Settings (email, service, times) are stored in Home Assistant and work across all your devices.')
            : (L
              ? 'Helpery HA niedostępne. Ustawienia (email, serwis, godziny) są zapisywane tylko w tej przeglądarce.'
              : 'HA helpers unavailable. Settings (email, service, times) are saved only in this browser.')}
        </div>`;
    }

    _backendPreviewHtml() {
      const L = this._lang === 'pl';
      const labels = L ? ['Raport dzienny', 'Raport tygodniowy', 'Raport miesięczny'] : ['Daily Report', 'Weekly Report', 'Monthly Report'];
      return `<div class="section-title">${L ? 'Podgląd raportów email' : 'Email Report Previews'}</div>` +
        ['daily', 'weekly', 'monthly'].map((cadence, index) => {
          const data = this._backendReportPreviews?.[cadence];
          if (!data) return `<div class="preview-box"><h3>${labels[index]}</h3><div role="status">${L ? 'Podgląd serwera niedostępny. Zaktualizuj HA Tools Email.' : 'Server preview unavailable. Update HA Tools Email.'}</div></div>`;
          const ready = data.status === 'ready' && typeof data.total_kwh === 'number' && Number.isFinite(data.total_kwh);
          const rows = ready && Array.isArray(data.devices) ? data.devices : [];
          const message = data.status === 'partial'
            ? (L ? 'Niepełne dane — suma okresu niedostępna.' : 'Incomplete data — period total unavailable.')
            : (L ? 'Brak danych energii dla tego okresu.' : 'No energy data available for this period.');
          return `<div class="preview-box" style="margin-bottom:14px">
            <h3>${labels[index]}</h3>
            <div>${L ? 'Import z sieci: źródła Energy Dashboard' : 'Grid import: Energy Dashboard sources'}</div>
            <div style="overflow-wrap:anywhere">${_esc(data.period?.start || '—')} → ${_esc(data.period?.end || '—')}</div>
            <div>${L ? 'Ukończone godziny Recorder; ten sam model co wysyłka i harmonogram.' : 'Completed Recorder hours; same model as sending and schedules.'}</div>
            ${ready ? '' : `<div role="status">${message}</div>`}
            <div>${ready ? data.total_kwh.toFixed(1) : 'N/A'} kWh · ${this._formatCost(data.total_cost)} ${_esc(this._config.currency || this._hass?.config?.currency || '')}</div>
            ${data.total_cost === null ? `<div>${L ? 'Taryfa nieskonfigurowana' : 'Tariff not configured'}</div>` : ''}
            <table class="preview-table"><thead><tr><th>${L ? 'Źródło' : 'Source'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'}</th></tr></thead>
            <tbody>${rows.map(row => `<tr><td>${_esc(row.name)}</td><td>${typeof row.kwh === 'number' && Number.isFinite(row.kwh) ? row.kwh.toFixed(2) : 'N/A'}</td><td>${this._formatCost(row.cost)}</td></tr>`).join('')}</tbody></table>
          </div>`;
        }).join('');
    }

    _tabPreview() {
      const L = this._lang === 'pl';
      if (!this._discoveryDone) {
        return `<div class="empty-state"><div class="big"><span class="spinner" style="width:32px;height:32px;border-width:3px;border-color:var(--bento-primary);border-top-color:transparent;"></span></div><div class="title">${L ? '\u0141adowanie danych...' : 'Loading data...'}</div></div>`;
      }
      if (this._emailBackendAvailable) return this._backendPreviewHtml();
      const devices = this._devices();
      const autoDevices = this._discoveredDevices || [];
      const isAuto = devices.length === 0 && autoDevices.length > 0;
      const today = new Date().toISOString().split('T')[0];
      const recipient = this._getRecipient();
      const recipientLine = recipient || '—';
      const periods = [
        { key: 'day', icon: '\u2600\uFE0F', titleL: 'Raport dzienny', titleE: 'Daily Report', rangeL: 'Ostatnie 24h', rangeE: 'Last 24h' },
        { key: 'week', icon: '\u{1F4C6}', titleL: 'Raport tygodniowy', titleE: 'Weekly Report', rangeL: 'Ostatnie 7 dni', rangeE: 'Last 7 days' },
        { key: 'month', icon: '\u{1F4C8}', titleL: 'Raport miesi\u0119czny', titleE: 'Monthly Report', rangeL: 'Ostatnie 30 dni', rangeE: 'Last 30 days' },
      ];
      const getDevData = period => this._getAutoDataForPeriod(period).map(d => ({
        name: d.name, current: d.month, previous: null, cost: d.cost, hasPeriod: true
      }));
      const renderReport = (p) => {
        const title = L ? p.titleL : p.titleE;
        const window = this[`_periodWindow_${p.key}`];
        const range = window ? `${_esc(window.start)} → ${_esc(window.end)}` : (L ? p.rangeL : p.rangeE);
        const devData = getDevData(p.key);
        const hasData = devData.length > 0 && devData.every(d => typeof d.current === 'number' && Number.isFinite(d.current));
        const totalEnergy = hasData ? devData.reduce((s, d) => s + d.current, 0) : null;
        const totalCost = hasData && devData.every(d => typeof d.cost === 'number' && Number.isFinite(d.cost)) ? devData.reduce((s, d) => s + d.cost, 0) : null;
        const top5 = devData.slice(0, 5);
        const isPeriodData = devData.length > 0 && devData[0].hasPeriod;
        const periodNote = !hasData ? `<div role="status">${L ? 'Brak kompletnych danych dla tego okresu.' : 'No complete data available for this period.'}</div>` : '';
        return `<div class="preview-box" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px">${p.icon} ${title} \u2013 ${today}</h3>
          ${periodNote}
          <div style="font-size:12px;color:var(--bento-text-secondary);margin-bottom:10px">\u{1F4E7} ${_esc(recipientLine)} \u00A0\u2022\u00A0 ${range} \u00A0\u2022\u00A0 ${devData.length} ${L ? 'źródeł' : 'sources'}</div>
          <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap">
            <div><span style="font-size:18px;font-weight:700;color:#F59E0B">${totalEnergy === null ? 'N/A' : totalEnergy.toFixed(1)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">kWh</span></div>
            <div><span style="font-size:18px;font-weight:700;color:#3B82F6">${this._formatCost(totalCost)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">${_esc(this._config.currency || this._hass?.config?.currency || '')}</span></div>
          </div>
          <table class="preview-table">
            <thead><tr><th>${L ? 'Źródło importu' : 'Import source'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'} (${_esc(this._config.currency || this._hass?.config?.currency || '')})</th></tr></thead>
            <tbody>${top5.map(d => `<tr><td>${_esc(d.name)}</td><td>${d.current === null ? 'N/A' : d.current.toFixed(2)}</td><td>${this._formatCost(d.cost)}</td></tr>`).join('')}
            ${devData.length > 5 ? `<tr><td colspan="3" style="text-align:center;color:var(--bento-text-secondary);font-size:11px">+ ${devData.length - 5} ${L ? 'więcej źródeł' : 'more sources'}...</td></tr>` : ''}</tbody>
          </table>
        </div>`;
      };
      return `

        <div class="section-title" style="margin-top:0">\u{1F4CB} ${L ? 'Podgl\u0105d raport\u00F3w email' : 'Email Report Previews'}</div>
        ${periods.map(p => renderReport(p)).join('')}
        <div style="font-size:11px;color:var(--bento-text-secondary);margin-top:4px">${L ? 'Podgląd skonfigurowanych źródeł Energy Dashboard; ukończone godziny Recorder.' : 'Configured Energy Dashboard source preview; completed Recorder hours.'}</div>`;
    }

    _tabSend() {
      const L = this._lang === 'pl';
      const smtpConfig = this._renderSmtpSection();
      const canSend = this._hasHaToolsEmail();
      const quickDisabled = this._sending || (this._emailBackendAvailable ? true : !canSend);
      const modeText = this._emailBackendAvailable
        ? (L ? 'Wyślij raport energii przez HA Tools Email 2.1.2+.' : 'Send an energy report using HA Tools Email 2.1.2+.')
        : (L ? 'R\u0119cznie wy\u015Blij raport energii poprzez ha_tools_email.' : 'Manually trigger an energy report via ha_tools_email.');
      return `
        <div class="info-row">\u{1F4E4}\u00A0 ${modeText}</div>
        ${smtpConfig}
        <div style="font-size:12px;color:var(--bento-text-secondary);margin:16px 0 12px;padding:10px;background:var(--bento-primary-light);border-radius:var(--bento-radius-xs)">${L ? '💡 Konfiguracja SMTP: <a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '💡 SMTP settings: <a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u2600\uFE0F ${L ? 'Wy\u015Blij raport dzienny' : 'Send Daily Report Now'}</div><span class="badge badge-pr">Manual</span></div>
          <div id="last-daily" class="last-sent">${this._lastSent.daily ? 'Last sent: ' + this._lastSent.daily : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-daily" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? '<span class="spinner"></span>Sending...' : '\u2600\uFE0F Send Daily'}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4C6} ${L ? 'Wy\u015Blij raport tygodniowy' : 'Send Weekly Report Now'}</div><span class="badge badge-pr">Manual</span></div>
          <div id="last-weekly" class="last-sent">${this._lastSent.weekly ? 'Last sent: ' + this._lastSent.weekly : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-weekly" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? '<span class="spinner"></span>Sending...' : '\u{1F4E4} Send Weekly'}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4C8} ${L ? 'Wy\u015Blij raport miesi\u0119czny' : 'Send Monthly Report Now'}</div><span class="badge badge-pr">Manual</span></div>
          <div id="last-monthly" class="last-sent">${this._lastSent.monthly ? 'Last sent: ' + this._lastSent.monthly : ''}</div>
          <div class="btn-row"><button class="btn btn-primary" id="send-monthly" ${this._sending || !canSend ? 'disabled' : ''}>${this._sending ? '<span class="spinner"></span>Sending...' : '\u{1F4C8} Send Monthly'}</button></div>
        </div>
        <div class="schedule-card">
          <div class="schedule-row"><div class="schedule-name">\u{1F4E7} ${L ? 'Szybkie podsumowanie' : 'Quick Summary'}</div><span class="badge badge-ok">Instant</span></div>
          <div class="schedule-meta">${this._emailBackendAvailable
            ? (L ? 'Tryb backendu u\u017Cywa wysy\u0142ki daily/weekly/monthly przez send_now.' : 'Backend mode uses daily/weekly/monthly send_now actions.')
            : (L ? 'Tekstowe podsumowanie aktualnych danych energii.' : 'Plain-text summary of current energy stats.')}</div>
          <div id="last-quick" class="last-sent">${this._lastSent.quick ? 'Last sent: ' + this._lastSent.quick : ''}</div>
          <div class="btn-row"><button class="btn btn-ok" id="send-quick" ${quickDisabled ? 'disabled' : ''}>\u26A1 ${L ? 'Wy\u015Blij' : 'Send Quick Summary'}</button></div>
        </div>`;
    }

    _attachSendEvents() {
      const root = this.shadowRoot;
      const sendDaily = root.getElementById('send-daily');
      const sendWeekly = root.getElementById('send-weekly');
      const sendMonthly = root.getElementById('send-monthly');
      const sendQuick = root.getElementById('send-quick');
      if (sendDaily) sendDaily.addEventListener('click', () => this._sendReport('daily'));
      if (sendWeekly) sendWeekly.addEventListener('click', () => this._sendReport('weekly'));
      if (sendMonthly) sendMonthly.addEventListener('click', () => this._sendReport('monthly'));
      if (sendQuick) sendQuick.addEventListener('click', () => this._sendReport('quick'));
    }

    _tabConfig() {
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const price = this._getAvgRate();
      const currency = this._config.currency || this._hass?.config?.currency || '';

      return `
        <div class="config-section">
          <div class="config-section-title">\u{1F4E7} ${L ? 'Ustawienia email' : 'Email Settings'}</div>
          <div class="config-input-row">
            <label>${L ? 'Odbiorca' : 'Recipient'}:</label>
            <input type="email" id="cfg-email" class="config-input" value="${_esc(recipient)}" placeholder="your@email.com" style="flex:1">
            <button class="btn btn-primary" id="cfg-email-save" style="padding:6px 14px;font-size:12px">${L ? 'Zapisz' : 'Save'}</button>
          </div>
          <div class="config-input-row">
            <label>${L ? 'Stawka' : 'Price'}:</label>
            <input type="number" id="cfg-price" class="config-input" value="${_esc(price ?? '')}" step="0.01" min="0" style="width:80px">
            <span style="font-size:12px;color:var(--bento-text-secondary)">${_esc(currency)}/kWh</span>
            <button class="btn btn-primary" id="cfg-price-save" style="padding:6px 14px;font-size:12px">${L ? 'Zapisz' : 'Save'}</button>
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">${L ? 'Źródła raportu' : 'Report sources'}</div>
          <p>${L ? 'Raport obejmuje wszystkie źródła importu z sieci skonfigurowane w Energy Dashboard. Liczniki urządzeń i eksport nie są dodawane do sumy.' : 'Reports include every grid-import source configured in Energy Dashboard. Appliance counters and exports are excluded from the total.'}</p>
          <a href="/energy">${L ? 'Otwórz Energy Dashboard' : 'Open Energy Dashboard'}</a>
        </div>

        <div class="config-section">
          <div class="config-section-title">\u{1F4BE} ${L ? 'Zapis ustawie\u0144' : 'Storage Info'}</div>
          <div style="font-size:12px;color:var(--bento-text-secondary);line-height:1.8">
            ${this._helpersReady
              ? `\u2705 ${L ? 'Ustawienia zapisywane w Home Assistant (input_text helpers). Dzia\u0142a na ka\u017Cdym urz\u0105dzeniu.' : 'Settings stored in Home Assistant (input_text helpers). Works across all devices.'}`
              : `\u26A0\uFE0F ${L ? 'Helpery HA niedost\u0119pne. Ustawienia zapisywane lokalnie w przegl\u0105darce.' : 'HA helpers unavailable. Settings saved locally in browser.'}`}
          </div>
        </div>`;
    }

    _attachConfigEvents() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      // Email save
      const emailSave = root.getElementById('cfg-email-save');
      if (emailSave) emailSave.addEventListener('click', () => {
        const input = root.getElementById('cfg-email');
        if (input && input.value && input.value.includes('@')) {
          this._saveRecipient(input.value.trim());
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Email zapisany' : 'Email saved'));
        }
      });
      // Price save
      const priceSave = root.getElementById('cfg-price-save');
      if (priceSave) priceSave.addEventListener('click', () => {
        const input = root.getElementById('cfg-price');
        const val = parseFloat(input?.value);
        if (Number.isFinite(val) && val >= 0) {
          this._config.energy_price = val;
          this._saveToHelper('price', String(val));
          this._fetchAllPeriodStats().then(() => this._render());
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Stawka zapisana' : 'Price saved'));
          this._render();
        }
      });
    }

    _attachScheduleEvents() {
      if (this._hass?.user?.is_admin !== true) return;
      const root = this.shadowRoot;
      const btnSmtpTest = root.getElementById('btn-smtp-test');
      if (btnSmtpTest) { btnSmtpTest.addEventListener('click', () => this._testSmtp()); }
      root.querySelectorAll('.schedule-save').forEach(btn => btn.addEventListener('click', () => this._saveSchedule(btn.dataset.cadence)));
      root.querySelectorAll('.schedule-delete').forEach(btn => btn.addEventListener('click', () => this._deleteSchedule(btn.dataset.cadence)));
      root.querySelectorAll('.schedule-send').forEach(btn => btn.addEventListener('click', () => this._sendScheduleNow(btn.dataset.cadence)));
      // Time inputs — save on change
      const timeInputs = [
        ['time-daily', 'daily_time', 'daily'],
        ['time-weekly', 'weekly_time', 'weekly_time'],
        ['time-monthly', 'monthly_time', 'monthly_time'],
      ];
      timeInputs.forEach(([id, helperKey, schedKey]) => {
        const input = root.getElementById(id);
        if (input) input.addEventListener('change', () => {
          this._scheduleDefaults[schedKey] = input.value;
          this._saveToHelper(helperKey, input.value);
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Godzina zapisana' : 'Time saved'));
        });
      });
      const daySelect = root.getElementById('day-weekly');
      if (daySelect) daySelect.addEventListener('change', () => {
        this._scheduleDefaults.weekly_day = daySelect.value;
        this._saveToHelper('weekly_day', daySelect.value);
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Dzie\u0144 zapisany' : 'Day saved'));
      });
      // Enable/disable existing automations
      const ids = [['enable-daily','disable-daily','automation.send_daily_energy_report'],['enable-weekly','disable-weekly','automation.send_weekly_energy_report'],['enable-monthly','disable-monthly','automation.send_monthly_energy_report']];
      ids.forEach(([en,dis,eid]) => {
        const eBtn = root.getElementById(en); const dBtn = root.getElementById(dis);
        if (eBtn) eBtn.addEventListener('click', () => this._toggleAuto(eid, true));
        if (dBtn) dBtn.addEventListener('click', () => this._toggleAuto(eid, false));
      });
      // Create automation buttons
      const createBtns = [
        ['create-daily', 'daily'],
        ['create-weekly', 'weekly'],
        ['create-monthly', 'monthly'],
      ];
      createBtns.forEach(([id, type]) => {
        const btn = root.getElementById(id);
        if (btn) btn.addEventListener('click', () => this._createAutomation(type));
      });
      // Update automation buttons
      const updateBtns = [
        ['update-create-daily', 'daily'],
        ['update-create-weekly', 'weekly'],
        ['update-create-monthly', 'monthly'],
      ];
      updateBtns.forEach(([id, type]) => {
        const btn = root.getElementById(id);
        if (btn) btn.addEventListener('click', () => this._createAutomation(type, true));
      });
    }

    async _saveSchedule(cadence) {
      if (this._emailBackendAvailable) return this._saveBackendSchedule(cadence);
      return this._saveLegacySchedule(cadence);
    }

    async _deleteSchedule(cadence) {
      if (this._emailBackendAvailable) return this._deleteBackendSchedule(cadence);
      return this._deleteLegacySchedule(cadence);
    }

    async _sendScheduleNow(cadence) {
      if (this._emailBackendAvailable) return this._sendReportViaBackend(cadence);
      return this._sendReport(cadence);
    }

    async _saveBackendSchedule(cadence) {
      if (!this._requireAdmin()) return;
      if (!cadence) return;
      const existing = this._getEnergySchedule(cadence);
      const time = this.shadowRoot?.getElementById('schedule-time-' + cadence)?.value || this._defaultScheduleTime(cadence);
      const recipients = this._scheduleRecipients(cadence);
      const enabled = !!this.shadowRoot?.getElementById('schedule-enabled-' + cadence)?.checked;
      this._scheduleBusy[cadence] = true;
      this._render();
      try {
        const resp = await this._emailWs('set_schedule', {
          action: 'upsert',
          schedule: { id: existing?.id, kind: 'energy_report', cadence, time, recipients, enabled }
        });
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : (resp?.schedule ? [...this._emailSchedules.filter(s => s.id !== resp.schedule.id), resp.schedule] : this._emailSchedules);
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram zapisany' : 'Schedule saved'));
      } catch (e) {
        this._showToast('\u274C ' + (this._lang === 'pl' ? 'Nie uda\u0142o si\u0119 zapisa\u0107 harmonogramu: ' : 'Could not save schedule: ') + (e?.message || 'Unknown error'));
      } finally {
        this._scheduleBusy[cadence] = false;
        await this._refreshBackendSchedules(false);
        this._render();
      }
    }

    async _deleteBackendSchedule(cadence) {
      if (!this._requireAdmin()) return;
      const existing = this._getEnergySchedule(cadence);
      if (!existing?.id) return;
      this._scheduleBusy[cadence] = true;
      this._render();
      try {
        const resp = await this._emailWs('set_schedule', { action: 'delete', schedule_id: existing.id });
        this._emailSchedules = Array.isArray(resp?.schedules) ? resp.schedules : this._emailSchedules.filter(s => s.id !== existing.id);
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram usuni\u0119ty' : 'Schedule deleted'));
      } catch (e) {
        this._showToast('\u274C ' + (this._lang === 'pl' ? 'Nie uda\u0142o si\u0119 usun\u0105\u0107 harmonogramu: ' : 'Could not delete schedule: ') + (e?.message || 'Unknown error'));
      } finally {
        this._scheduleBusy[cadence] = false;
        this._render();
      }
    }

    _saveLegacySchedule(cadence) {
      if (!this._requireAdmin()) return;
      if (!cadence) return;
      const time = this.shadowRoot?.getElementById('schedule-time-' + cadence)?.value || this._defaultScheduleTime(cadence);
      const recipients = this._scheduleRecipients(cadence);
      const enabled = !!this.shadowRoot?.getElementById('schedule-enabled-' + cadence)?.checked;
      this._legacySchedules = this._legacySchedules || {};
      this._legacySchedules[cadence] = { kind: 'energy_report', cadence, time, recipients, enabled };
      this._saveLegacySchedules();
      this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram zapisany lokalnie' : 'Schedule saved locally'));
      this._render();
    }

    _deleteLegacySchedule(cadence) {
      if (!this._requireAdmin()) return;
      if (!cadence) return;
      this._legacySchedules = this._legacySchedules || {};
      this._legacySchedules[cadence] = { kind: 'energy_report', cadence, time: this._defaultScheduleTime(cadence), recipients: [], enabled: false };
      this._saveLegacySchedules();
      this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram lokalny wyczyszczony' : 'Local schedule cleared'));
      this._render();
    }

    // --- Automation creation ---

    async _createAutomation(type, update = false) {
      if (!this._requireAdmin()) return;
      if (this._emailBackendAvailable) return this._saveBackendSchedule(type);
      this._showToast(this._lang === 'pl' ? 'Harmonogram raportów Recorder wymaga HA Tools Email 2.1.2 lub nowszego.' : 'Recorder report schedules require HA Tools Email 2.1.2 or newer.');
    }

    // --- HA service calls ---

    async _toggleAuto(entity_id, enable) {
      if (!this._requireAdmin()) return;
      if (!this._hass) return;
      try {
        await this._hass.callService('automation', enable ? 'turn_on' : 'turn_off', { entity_id });
        this._showToast(`\u2705 Automation ${enable ? 'enabled' : 'disabled'}`);
        this._schedule(() => this._renderTab(), 800);
      } catch (e) { this._showToast('\u274C Error: ' + (e.message || 'Unknown error')); }
    }

    async _sendReportViaBackend(cadence) {
      if (!this._requireAdmin()) return;
      if (!this._hass || this._sending) return;
      const L = this._lang === 'pl';
      if (!['daily', 'weekly', 'monthly'].includes(cadence)) return;
      if (!this._emailBackendConfig?.smtp_configured) {
        this._showToast('\u274C ' + (L ? 'SMTP nie skonfigurowany w backendzie ha_tools_email' : 'SMTP is not configured in ha_tools_email backend'));
        return;
      }
      const recipients = this._scheduleRecipients(cadence);
      this._sending = true;
      this._scheduleBusy[cadence] = true;
      this._renderTab(); this._attachSendEvents();
      try {
        await this._emailWs('send_now', { kind: 'energy_report', cadence, recipients });
        this._lastSent[cadence] = new Date().toLocaleString((this._lang === 'pl' ? 'pl-PL' : 'en-US'), { hour12: false });
        this._showToast('\u2705 ' + (L ? 'Raport wys\u0142any przez backend' : 'Report sent by backend'));
      } catch (e) {
        this._showToast('\u274C Send failed: ' + (e?.message || 'Unknown error'));
      } finally {
        this._sending = false;
        this._scheduleBusy[cadence] = false;
        this._renderTab(); this._attachSendEvents();
      }
    }

    async _sendReport(type) {
      if (!this._requireAdmin()) return;
      if (!this._hass || this._sending) return;
      if (this._emailBackendAvailable && ['daily', 'weekly', 'monthly'].includes(type)) {
        await this._sendReportViaBackend(type);
        return;
      }
      this._sending = true;
      this._renderTab(); this._attachSendEvents();
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const price = this._getAvgRate();
      const currency = this._config.currency || this._hass?.config?.currency || '';
      const dateStr = new Date().toISOString().split('T')[0];
      const nowStr = new Date().toLocaleString((this._lang === 'pl' ? 'pl-PL' : 'en-US'), { hour12: false });
      try {
        if (!this._hasHaToolsEmail()) throw new Error(L ? 'Integracja HA Tools Email nie jest zainstalowana. Zainstaluj j\u0105 z HACS i ustaw SMTP w Konfiguruj.' : 'The HA Tools Email integration is not installed. Install it from HACS and set up SMTP in Configure.');
        // Get device data — fetch from recorder for period reports
        const periodMap = { daily: 'day', weekly: 'week', monthly: 'month', quick: 'week' };
        const periodKey = periodMap[type] || 'week';
        const periodLabels = {
          daily: L ? 'Ostatnie 24h' : 'Last 24 hours',
          weekly: L ? 'Ostatnie 7 dni' : 'Last 7 days',
          monthly: L ? 'Ostatnie 30 dni' : 'Last 30 days',
          quick: L ? 'Podsumowanie' : 'Summary'
        };
        // Fetch fresh recorder stats
        await this._fetchRecorderStats(periodKey);
        const cached = this[`_periodCache_${periodKey}`];
        if (this[`_periodStatus_${periodKey}`] !== 'ready' || !cached?.length) {
          throw new Error(L ? 'Brak kompletnych danych Recorder dla tego okresu.' : 'Complete Recorder data is unavailable for this period.');
        }
        const devices = [...cached].sort((a, b) => b.month - a.month);
        const window = this[`_periodWindow_${periodKey}`];
        const windowText = `${window.start} → ${window.end}`;

        const totalKwh = devices.reduce((s, d) => s + (d.month || 0), 0);
        const rowCosts = devices.map(d => d.cost ?? this._cost(d.month));
        const totalCost = rowCosts.every(cost => typeof cost === 'number' && Number.isFinite(cost)) ? rowCosts.reduce((sum, cost) => sum + cost, 0) : null;
        const topDevice = devices[0];
        // Build HTML email
        const typeName = { daily: L ? 'Dzienny' : 'Daily', weekly: L ? 'Tygodniowy' : 'Weekly', monthly: L ? 'Miesi\u0119czny' : 'Monthly', quick: L ? 'Podsumowanie' : 'Summary' }[type] || type;
        const deviceRows = devices.map((d, i) => {
          const kwh = (d.month || 0).toFixed(2);
          const cost = this._formatCost(d.cost ?? this._cost(d.month));
          const pct = totalKwh > 0 ? ((d.month / totalKwh) * 100).toFixed(0) : 0;
          const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
          return `<tr style="background:${bg}"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">${_esc(d.name)}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${kwh}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right">${cost}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">${pct}%</td></tr>`;
        }).join('');
        const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 28px;color:#fff">
            <h1 style="margin:0;font-size:22px;font-weight:700">\u26A1 ${L ? 'Raport energii' : 'Energy Report'} \u2014 ${typeName}</h1>
            <p style="margin:6px 0 0;opacity:.85;font-size:14px">${dateStr} \u2022 ${_esc(windowText)} \u2022 ${devices.length} ${L ? 'źródeł' : 'sources'}</p>
          </div>
          <div style="padding:20px 28px">
            <div style="display:flex;gap:16px;margin-bottom:20px">
              <div style="flex:1;background:#fef3c7;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;color:#d97706">${totalKwh.toFixed(1)}</div>
                <div style="font-size:12px;color:#92400e;margin-top:2px">kWh</div>
              </div>
              <div style="flex:1;background:#dbeafe;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;color:#1d4ed8">${this._formatCost(totalCost)}</div>
                <div style="font-size:12px;color:#1e40af;margin-top:2px">${_esc(currency)}</div>
              </div>
              <div style="flex:1;background:#d1fae5;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:16px;font-weight:700;color:#047857">${topDevice ? _esc(topDevice.name.split(' ').slice(0,2).join(' ')) : '-'}</div>
                <div style="font-size:12px;color:#065f46;margin-top:2px">${L ? 'Top' : 'Top'}: ${topDevice ? topDevice.month.toFixed(1) : 0} kWh</div>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
              <thead><tr style="background:#f1f5f9">
                <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${L ? 'Źródło importu' : 'Import source'}</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">kWh</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${_esc(currency)}</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">%</th>
              </tr></thead>
              <tbody>${deviceRows}
              <tr style="background:#f1f5f9;font-weight:700">
                <td style="padding:12px 14px;font-size:14px">${L ? '\u0141\u0105cznie' : 'Total'}</td>
                <td style="padding:12px 14px;text-align:right">${totalKwh.toFixed(2)}</td>
                <td style="padding:12px 14px;text-align:right">${this._formatCost(totalCost)}</td>
                <td style="padding:12px 14px;text-align:right">100%</td>
              </tr></tbody>
            </table>
            <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">${_esc(this._getTariffLabel())} \u2022 HA Energy Email Card</p>
          </div>
        </div>`;
        const title = `\u26A1 ${typeName} ${L ? 'raport energii' : 'Energy Report'} \u2013 ${dateStr}`;
        const plainText = `${typeName} ${L ? 'raport energii' : 'Energy Report'} - ${dateStr}\n${windowText}\n${L ? '\u0141\u0105cznie' : 'Total'}: ${totalKwh.toFixed(2)} kWh / ${this._formatCost(totalCost)} ${currency}\n${devices.map(d => `${d.name}: ${(d.month||0).toFixed(2)} kWh`).join('\n')}`;
        // Built-in SMTP via ha_tools_email
        await this._sendViaHaToolsEmail(recipient || '', title, plainText, html);
        this._lastSent[type] = nowStr;
        this._showToast(`\u2705 ${typeName} ${L ? 'wys\u0142any!' : 'sent!'}`);
      } catch (e) { this._showToast('\u274C Error: ' + (e.message || 'Check HA logs')); }
      finally { this._sending = false; this._renderTab(); this._attachSendEvents(); }
    }

    // --- HA Tools Email (built-in SMTP) ---

    _hasLegacyHaToolsEmail() {
      return !!this._hass?.services?.ha_tools_email?.send;
    }

    _hasHaToolsEmail() {
      if (this._emailBackendAvailable) return !!this._emailBackendConfig?.smtp_configured;
      return this._hasLegacyHaToolsEmail();
    }

    async _sendViaHaToolsEmail(to, subject, body, html) {
      if (!this._requireAdmin()) return;
      const hass = this._hass;
      if (!hass) throw new Error('Home Assistant is not ready');
      if (!this._hasLegacyHaToolsEmail()) throw new Error(this._lang === 'pl' ? 'Brak us\u0142ugi ha_tools_email.send' : 'ha_tools_email.send service is unavailable');
      const data = { subject, body };
      if (html) data.html = html;
      if (to) data.to = to;
      await hass.callService('ha_tools_email', 'send', data);
    }

    // --- SMTP Configuration via ha_tools_email ---

    _renderSmtpSection() {
      const L = this._lang === 'pl';
      const statusBadge = this._smtpStatus
        ? (this._smtpStatus.ok
          ? `<span class="badge badge-ok">\u2705 Test OK ${_esc(this._smtpStatus.time || '')}</span>`
          : `<span class="badge badge-er">\u274C ${_esc(this._smtpStatus.error || '')}</span>`)
        : '';
      if (this._emailBackendAvailable) {
        const cfg = this._emailBackendConfig || {};
        const scheduleCount = (this._emailSchedules || []).filter(s => s.kind === 'energy_report').length;
        if (cfg.smtp_configured) {
          const server = cfg.server ? `${_esc(cfg.server)}:${_esc(cfg.port || '')}` : (L ? 'serwer SMTP skonfigurowany' : 'SMTP server configured');
          const sender = cfg.sender ? _esc(cfg.sender) : (L ? 'nadawca z konfiguracji' : 'configured sender');
          const recipient = cfg.default_recipient ? _esc(cfg.default_recipient) : (L ? 'brak domy\u015Blnego odbiorcy' : 'no default recipient');
          return `<div class="smtp-section">
            <div class="smtp-header"><div class="smtp-icon">\u2705</div><div>
              <div class="smtp-title">${L ? 'SMTP skonfigurowany (ha_tools_email v2)' : 'SMTP Configured (ha_tools_email v2)'}</div>
              <div class="smtp-detail">${server} \u2022 ${sender} \u2022 ${recipient}</div>
              <div class="smtp-detail">${L ? 'Harmonogramy na backendzie: ' : 'Server schedules: '}${scheduleCount}</div>
              <div class="smtp-detail">${L ? 'Zmie\u0144 w' : 'Change in'} <b>${L ? '<a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '<a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</b></div>
            </div></div>
            <div class="smtp-actions" style="margin-top:12px">
              <button class="btn btn-primary" id="btn-smtp-test" ${this._smtpTesting ? 'disabled' : ''}>${this._smtpTesting ? (L ? 'Wysy\u0142am...' : 'Sending...') : (L ? 'Test SMTP' : 'Test SMTP')}</button>
              ${statusBadge}
            </div>
          </div>`;
        }
        return `<div class="smtp-section smtp-missing">
          <div class="smtp-header"><div class="smtp-icon">\u26A0\uFE0F</div><div>
            <div class="smtp-title">${L ? 'SMTP nie skonfigurowany w ha_tools_email' : 'SMTP Not Configured in ha_tools_email'}</div>
            <div class="smtp-detail">${L ? 'Ustaw serwer, login i has\u0142o w' : 'Set the server, login and password in'} <b>${L ? '<a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '<a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</b></div>
          </div></div>
        </div>`;
      }
      if (this._hasLegacyHaToolsEmail()) {
        return `<div class="smtp-section">
          <div class="smtp-header"><div class="smtp-icon">\u2705</div><div>
            <div class="smtp-title">${L ? 'SMTP skonfigurowany (legacy ha_tools_email)' : 'SMTP Configured (legacy ha_tools_email)'}</div>
            <div class="smtp-detail">${L ? 'U\u017Cywam us\u0142ug Home Assistant ha_tools_email.send/test.' : 'Using Home Assistant ha_tools_email.send/test services.'}</div>
          </div></div>
          <div class="smtp-actions" style="margin-top:12px">
            <button class="btn btn-primary" id="btn-smtp-test" ${this._smtpTesting ? 'disabled' : ''}>${this._smtpTesting ? (L ? 'Wysy\u0142am...' : 'Sending...') : (L ? 'Wy\u015Blij testowy email' : 'Send Test Email')}</button>
            ${statusBadge}
          </div>
        </div>`;
      }
      return `<div class="smtp-section smtp-missing">
        <div class="smtp-header"><div class="smtp-icon">\u26A0\uFE0F</div><div>
          <div class="smtp-title">${L ? 'SMTP nie skonfigurowany' : 'SMTP Not Configured'}</div>
          <div class="smtp-detail">${L ? 'Otw\u00F3rz' : 'Open'} <b>${L ? '<a href="/config/integrations/integration/ha_tools_email">Ustawienia \u2192 Urz\u0105dzenia i us\u0142ugi \u2192 HA Tools Email \u2192 Konfiguruj</a>' : '<a href="/config/integrations/integration/ha_tools_email">Settings \u2192 Devices &amp; services \u2192 HA Tools Email \u2192 Configure</a>'}</b></div>
        </div></div>
      </div>`;
    }

    async _testSmtp() {
      if (!this._requireAdmin()) return;
      if (!this._hass) return;
      if (this._emailBackendAvailable && !this._emailBackendConfig?.smtp_configured) {
        this._smtpStatus = { ok: false, error: (this._lang === 'pl' ? 'SMTP nie skonfigurowany' : 'SMTP not configured') };
        this._showToast('\u274C ' + this._smtpStatus.error);
        this._render();
        return;
      }
      if (this._emailBackendAvailable && !this._hasLegacyHaToolsEmail()) {
        this._smtpStatus = { ok: true, service: 'ha_tools_email/ws', time: new Date().toLocaleTimeString((this._lang === 'pl' ? 'pl-PL' : 'en-US')) };
        this._showToast('\u2139\uFE0F ' + (this._lang === 'pl' ? 'Backend SMTP jest skonfigurowany. U\u017Cyj Send Now, aby wys\u0142a\u0107 raport testowy.' : 'Backend SMTP is configured. Use Send Now to send a test report.'));
        this._render();
        return;
      }
      if (!this._hasLegacyHaToolsEmail()) { this._showToast('\u274C ' + (this._lang === 'pl' ? 'ha_tools_email nie zainstalowany' : 'ha_tools_email not installed')); return; }
      this._smtpTesting = true;
      this._render();
      try {
        const hass = this._hass;
        await hass.callService('ha_tools_email', 'test', {});
        this._smtpStatus = { ok: true, service: 'ha_tools_email', time: new Date().toLocaleTimeString((this._lang === 'pl' ? 'pl-PL' : 'en-US')) };
        this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Testowy email wysy\u0142any!' : 'Test email sent!'));
      } catch (e) {
        this._smtpStatus = { ok: false, error: e.message || 'Check HA logs' };
        this._showToast('\u274C SMTP test failed: ' + this._smtpStatus.error);
      } finally {
        this._smtpTesting = false;
        this._render();
      }
    }

    _showToast(msg) {
      const toast = this.shadowRoot.getElementById('toast');
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add('show');
      this._schedule(() => toast.classList.remove('show'), 3500);
    }

    disconnectedCallback() {
      this._timers.forEach(timer => clearTimeout(timer));
      this._timers.clear();
      this._renderScheduled = false;
    }

    _schedule(callback, delay) {
      const timer = setTimeout(() => {
        this._timers.delete(timer);
        if (this.isConnected) callback();
      }, delay);
      this._timers.add(timer);
      return timer;
    }

    setActiveTab(tabId) {
      this._activeTab = tabId;
      this._render();
    }
  }

  if (!customElements.get('ha-energy-email')) customElements.define('ha-energy-email', HAEnergyEmail);
  // Energy Optimizer is the canonical owner of ha-energy-email. The alias below is always
  // free, so the HA Tools Email & Reports compatibility shim can delegate to this card
  // whichever bundle Home Assistant happens to load first.
  if (!customElements.get('ha-energy-optimizer-email')) customElements.define('ha-energy-optimizer-email', class extends HAEnergyEmail {});
  class HaEnergyEmailEditor extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this._config = {};
    }
    setConfig(config) {
      this._config = { ...config };
      this._render();
    }
    _dispatch() {
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
    }
    _render() {
      this.shadowRoot.innerHTML = `
        <style>
              :host { display:block; padding:16px; }
              h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
              input { outline:none; transition:border-color .2s; }
              input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
          </style>
        <h3>Energy Email Reports</h3>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
                <input type="text" id="cf_title" value="${_esc(this._config?.title || 'Energy Email Reports')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Currency</label>
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency || this._hass?.config?.currency || '')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Energy price</label>
                <input type="text" id="cf_energy_price" value="${_esc(this._config?.energy_price ?? '')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
      `;
          const f_title = this.shadowRoot.querySelector('#cf_title');
          if (f_title) f_title.addEventListener('input', (e) => {
            this._config = { ...this._config, title: e.target.value };
            this._dispatch();
          });
          const f_currency = this.shadowRoot.querySelector('#cf_currency');
          if (f_currency) f_currency.addEventListener('input', (e) => {
            this._config = { ...this._config, currency: e.target.value };
            this._dispatch();
          });
          const f_energy_price = this.shadowRoot.querySelector('#cf_energy_price');
          if (f_energy_price) f_energy_price.addEventListener('input', (e) => {
            this._config = { ...this._config, energy_price: e.target.value };
            this._dispatch();
          });
    }
    connectedCallback() { this._render(); }
  }
  if (!customElements.get('ha-energy-email-editor')) { customElements.define('ha-energy-email-editor', HaEnergyEmailEditor); }


  window.customCards = window.customCards || [];
  if (!window.customCards.some(c => c.type === 'ha-energy-email')) window.customCards.push({ type: 'ha-energy-email', name: 'Energy Email Reports', description: 'Send energy reports via email. Auto-discovers energy sensors.', preview: true });
})();

/* HA_ENERGY_CHART_VENDOR_START: generated from chart.js 4.5.1 */
const HA_ENERGY_CHART = (() => {
  const module = { exports: {} };
  const exports = module.exports;
/*!
 * Chart.js v4.5.1
 * https://www.chartjs.org
 * (c) 2025 Chart.js Contributors
 * Released under the MIT License
 */
!function(t,e){"object"==typeof exports&&"undefined"!=typeof module?module.exports=e():"function"==typeof define&&define.amd?define(e):(t="undefined"!=typeof globalThis?globalThis:t||self).Chart=e()}(this,(function(){"use strict";var t=Object.freeze({__proto__:null,get Colors(){return Jo},get Decimation(){return ta},get Filler(){return ba},get Legend(){return Ma},get SubTitle(){return Pa},get Title(){return ka},get Tooltip(){return Na}});function e(){}const i=(()=>{let t=0;return()=>t++})();function s(t){return null==t}function n(t){if(Array.isArray&&Array.isArray(t))return!0;const e=Object.prototype.toString.call(t);return"[object"===e.slice(0,7)&&"Array]"===e.slice(-6)}function o(t){return null!==t&&"[object Object]"===Object.prototype.toString.call(t)}function a(t){return("number"==typeof t||t instanceof Number)&&isFinite(+t)}function r(t,e){return a(t)?t:e}function l(t,e){return void 0===t?e:t}const h=(t,e)=>"string"==typeof t&&t.endsWith("%")?parseFloat(t)/100:+t/e,c=(t,e)=>"string"==typeof t&&t.endsWith("%")?parseFloat(t)/100*e:+t;function d(t,e,i){if(t&&"function"==typeof t.call)return t.apply(i,e)}function u(t,e,i,s){let a,r,l;if(n(t))if(r=t.length,s)for(a=r-1;a>=0;a--)e.call(i,t[a],a);else for(a=0;a<r;a++)e.call(i,t[a],a);else if(o(t))for(l=Object.keys(t),r=l.length,a=0;a<r;a++)e.call(i,t[l[a]],l[a])}function f(t,e){let i,s,n,o;if(!t||!e||t.length!==e.length)return!1;for(i=0,s=t.length;i<s;++i)if(n=t[i],o=e[i],n.datasetIndex!==o.datasetIndex||n.index!==o.index)return!1;return!0}function g(t){if(n(t))return t.map(g);if(o(t)){const e=Object.create(null),i=Object.keys(t),s=i.length;let n=0;for(;n<s;++n)e[i[n]]=g(t[i[n]]);return e}return t}function p(t){return-1===["__proto__","prototype","constructor"].indexOf(t)}function m(t,e,i,s){if(!p(t))return;const n=e[t],a=i[t];o(n)&&o(a)?x(n,a,s):e[t]=g(a)}function x(t,e,i){const s=n(e)?e:[e],a=s.length;if(!o(t))return t;const r=(i=i||{}).merger||m;let l;for(let e=0;e<a;++e){if(l=s[e],!o(l))continue;const n=Object.keys(l);for(let e=0,s=n.length;e<s;++e)r(n[e],t,l,i)}return t}function b(t,e){return x(t,e,{merger:_})}function _(t,e,i){if(!p(t))return;const s=e[t],n=i[t];o(s)&&o(n)?b(s,n):Object.prototype.hasOwnProperty.call(e,t)||(e[t]=g(n))}const y={"":t=>t,x:t=>t.x,y:t=>t.y};function v(t){const e=t.split("."),i=[];let s="";for(const t of e)s+=t,s.endsWith("\\")?s=s.slice(0,-1)+".":(i.push(s),s="");return i}function M(t,e){const i=y[e]||(y[e]=function(t){const e=v(t);return t=>{for(const i of e){if(""===i)break;t=t&&t[i]}return t}}(e));return i(t)}function w(t){return t.charAt(0).toUpperCase()+t.slice(1)}const k=t=>void 0!==t,S=t=>"function"==typeof t,P=(t,e)=>{if(t.size!==e.size)return!1;for(const i of t)if(!e.has(i))return!1;return!0};function D(t){return"mouseup"===t.type||"click"===t.type||"contextmenu"===t.type}const C=Math.PI,O=2*C,A=O+C,T=Number.POSITIVE_INFINITY,L=C/180,E=C/2,R=C/4,I=2*C/3,z=Math.log10,F=Math.sign;function V(t,e,i){return Math.abs(t-e)<i}function B(t){const e=Math.round(t);t=V(t,e,t/1e3)?e:t;const i=Math.pow(10,Math.floor(z(t))),s=t/i;return(s<=1?1:s<=2?2:s<=5?5:10)*i}function W(t){const e=[],i=Math.sqrt(t);let s;for(s=1;s<i;s++)t%s==0&&(e.push(s),e.push(t/s));return i===(0|i)&&e.push(i),e.sort(((t,e)=>t-e)).pop(),e}function N(t){return!function(t){return"symbol"==typeof t||"object"==typeof t&&null!==t&&!(Symbol.toPrimitive in t||"toString"in t||"valueOf"in t)}(t)&&!isNaN(parseFloat(t))&&isFinite(t)}function H(t,e){const i=Math.round(t);return i-e<=t&&i+e>=t}function j(t,e,i){let s,n,o;for(s=0,n=t.length;s<n;s++)o=t[s][i],isNaN(o)||(e.min=Math.min(e.min,o),e.max=Math.max(e.max,o))}function $(t){return t*(C/180)}function Y(t){return t*(180/C)}function U(t){if(!a(t))return;let e=1,i=0;for(;Math.round(t*e)/e!==t;)e*=10,i++;return i}function X(t,e){const i=e.x-t.x,s=e.y-t.y,n=Math.sqrt(i*i+s*s);let o=Math.atan2(s,i);return o<-.5*C&&(o+=O),{angle:o,distance:n}}function q(t,e){return Math.sqrt(Math.pow(e.x-t.x,2)+Math.pow(e.y-t.y,2))}function K(t,e){return(t-e+A)%O-C}function G(t){return(t%O+O)%O}function J(t,e,i,s){const n=G(t),o=G(e),a=G(i),r=G(o-n),l=G(a-n),h=G(n-o),c=G(n-a);return n===o||n===a||s&&o===a||r>l&&h<c}function Z(t,e,i){return Math.max(e,Math.min(i,t))}function Q(t){return Z(t,-32768,32767)}function tt(t,e,i,s=1e-6){return t>=Math.min(e,i)-s&&t<=Math.max(e,i)+s}function et(t,e,i){i=i||(i=>t[i]<e);let s,n=t.length-1,o=0;for(;n-o>1;)s=o+n>>1,i(s)?o=s:n=s;return{lo:o,hi:n}}const it=(t,e,i,s)=>et(t,i,s?s=>{const n=t[s][e];return n<i||n===i&&t[s+1][e]===i}:s=>t[s][e]<i),st=(t,e,i)=>et(t,i,(s=>t[s][e]>=i));function nt(t,e,i){let s=0,n=t.length;for(;s<n&&t[s]<e;)s++;for(;n>s&&t[n-1]>i;)n--;return s>0||n<t.length?t.slice(s,n):t}const ot=["push","pop","shift","splice","unshift"];function at(t,e){t._chartjs?t._chartjs.listeners.push(e):(Object.defineProperty(t,"_chartjs",{configurable:!0,enumerable:!1,value:{listeners:[e]}}),ot.forEach((e=>{const i="_onData"+w(e),s=t[e];Object.defineProperty(t,e,{configurable:!0,enumerable:!1,value(...e){const n=s.apply(this,e);return t._chartjs.listeners.forEach((t=>{"function"==typeof t[i]&&t[i](...e)})),n}})})))}function rt(t,e){const i=t._chartjs;if(!i)return;const s=i.listeners,n=s.indexOf(e);-1!==n&&s.splice(n,1),s.length>0||(ot.forEach((e=>{delete t[e]})),delete t._chartjs)}function lt(t){const e=new Set(t);return e.size===t.length?t:Array.from(e)}const ht="undefined"==typeof window?function(t){return t()}:window.requestAnimationFrame;function ct(t,e){let i=[],s=!1;return function(...n){i=n,s||(s=!0,ht.call(window,(()=>{s=!1,t.apply(e,i)})))}}function dt(t,e){let i;return function(...s){return e?(clearTimeout(i),i=setTimeout(t,e,s)):t.apply(this,s),e}}const ut=t=>"start"===t?"left":"end"===t?"right":"center",ft=(t,e,i)=>"start"===t?e:"end"===t?i:(e+i)/2,gt=(t,e,i,s)=>t===(s?"left":"right")?i:"center"===t?(e+i)/2:e;function pt(t,e,i){const n=e.length;let o=0,a=n;if(t._sorted){const{iScale:r,vScale:l,_parsed:h}=t,c=t.dataset&&t.dataset.options?t.dataset.options.spanGaps:null,d=r.axis,{min:u,max:f,minDefined:g,maxDefined:p}=r.getUserBounds();if(g){if(o=Math.min(it(h,d,u).lo,i?n:it(e,d,r.getPixelForValue(u)).lo),c){const t=h.slice(0,o+1).reverse().findIndex((t=>!s(t[l.axis])));o-=Math.max(0,t)}o=Z(o,0,n-1)}if(p){let t=Math.max(it(h,r.axis,f,!0).hi+1,i?0:it(e,d,r.getPixelForValue(f),!0).hi+1);if(c){const e=h.slice(t-1).findIndex((t=>!s(t[l.axis])));t+=Math.max(0,e)}a=Z(t,o,n)-o}else a=n-o}return{start:o,count:a}}function mt(t){const{xScale:e,yScale:i,_scaleRanges:s}=t,n={xmin:e.min,xmax:e.max,ymin:i.min,ymax:i.max};if(!s)return t._scaleRanges=n,!0;const o=s.xmin!==e.min||s.xmax!==e.max||s.ymin!==i.min||s.ymax!==i.max;return Object.assign(s,n),o}class xt{constructor(){this._request=null,this._charts=new Map,this._running=!1,this._lastDate=void 0}_notify(t,e,i,s){const n=e.listeners[s],o=e.duration;n.forEach((s=>s({chart:t,initial:e.initial,numSteps:o,currentStep:Math.min(i-e.start,o)})))}_refresh(){this._request||(this._running=!0,this._request=ht.call(window,(()=>{this._update(),this._request=null,this._running&&this._refresh()})))}_update(t=Date.now()){let e=0;this._charts.forEach(((i,s)=>{if(!i.running||!i.items.length)return;const n=i.items;let o,a=n.length-1,r=!1;for(;a>=0;--a)o=n[a],o._active?(o._total>i.duration&&(i.duration=o._total),o.tick(t),r=!0):(n[a]=n[n.length-1],n.pop());r&&(s.draw(),this._notify(s,i,t,"progress")),n.length||(i.running=!1,this._notify(s,i,t,"complete"),i.initial=!1),e+=n.length})),this._lastDate=t,0===e&&(this._running=!1)}_getAnims(t){const e=this._charts;let i=e.get(t);return i||(i={running:!1,initial:!0,items:[],listeners:{complete:[],progress:[]}},e.set(t,i)),i}listen(t,e,i){this._getAnims(t).listeners[e].push(i)}add(t,e){e&&e.length&&this._getAnims(t).items.push(...e)}has(t){return this._getAnims(t).items.length>0}start(t){const e=this._charts.get(t);e&&(e.running=!0,e.start=Date.now(),e.duration=e.items.reduce(((t,e)=>Math.max(t,e._duration)),0),this._refresh())}running(t){if(!this._running)return!1;const e=this._charts.get(t);return!!(e&&e.running&&e.items.length)}stop(t){const e=this._charts.get(t);if(!e||!e.items.length)return;const i=e.items;let s=i.length-1;for(;s>=0;--s)i[s].cancel();e.items=[],this._notify(t,e,Date.now(),"complete")}remove(t){return this._charts.delete(t)}}var bt=new xt;
/*!
 * @kurkle/color v0.3.2
 * https://github.com/kurkle/color#readme
 * (c) 2023 Jukka Kurkela
 * Released under the MIT License
 */function _t(t){return t+.5|0}const yt=(t,e,i)=>Math.max(Math.min(t,i),e);function vt(t){return yt(_t(2.55*t),0,255)}function Mt(t){return yt(_t(255*t),0,255)}function wt(t){return yt(_t(t/2.55)/100,0,1)}function kt(t){return yt(_t(100*t),0,100)}const St={0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,A:10,B:11,C:12,D:13,E:14,F:15,a:10,b:11,c:12,d:13,e:14,f:15},Pt=[..."0123456789ABCDEF"],Dt=t=>Pt[15&t],Ct=t=>Pt[(240&t)>>4]+Pt[15&t],Ot=t=>(240&t)>>4==(15&t);function At(t){var e=(t=>Ot(t.r)&&Ot(t.g)&&Ot(t.b)&&Ot(t.a))(t)?Dt:Ct;return t?"#"+e(t.r)+e(t.g)+e(t.b)+((t,e)=>t<255?e(t):"")(t.a,e):void 0}const Tt=/^(hsla?|hwb|hsv)\(\s*([-+.e\d]+)(?:deg)?[\s,]+([-+.e\d]+)%[\s,]+([-+.e\d]+)%(?:[\s,]+([-+.e\d]+)(%)?)?\s*\)$/;function Lt(t,e,i){const s=e*Math.min(i,1-i),n=(e,n=(e+t/30)%12)=>i-s*Math.max(Math.min(n-3,9-n,1),-1);return[n(0),n(8),n(4)]}function Et(t,e,i){const s=(s,n=(s+t/60)%6)=>i-i*e*Math.max(Math.min(n,4-n,1),0);return[s(5),s(3),s(1)]}function Rt(t,e,i){const s=Lt(t,1,.5);let n;for(e+i>1&&(n=1/(e+i),e*=n,i*=n),n=0;n<3;n++)s[n]*=1-e-i,s[n]+=e;return s}function It(t){const e=t.r/255,i=t.g/255,s=t.b/255,n=Math.max(e,i,s),o=Math.min(e,i,s),a=(n+o)/2;let r,l,h;return n!==o&&(h=n-o,l=a>.5?h/(2-n-o):h/(n+o),r=function(t,e,i,s,n){return t===n?(e-i)/s+(e<i?6:0):e===n?(i-t)/s+2:(t-e)/s+4}(e,i,s,h,n),r=60*r+.5),[0|r,l||0,a]}function zt(t,e,i,s){return(Array.isArray(e)?t(e[0],e[1],e[2]):t(e,i,s)).map(Mt)}function Ft(t,e,i){return zt(Lt,t,e,i)}function Vt(t){return(t%360+360)%360}function Bt(t){const e=Tt.exec(t);let i,s=255;if(!e)return;e[5]!==i&&(s=e[6]?vt(+e[5]):Mt(+e[5]));const n=Vt(+e[2]),o=+e[3]/100,a=+e[4]/100;return i="hwb"===e[1]?function(t,e,i){return zt(Rt,t,e,i)}(n,o,a):"hsv"===e[1]?function(t,e,i){return zt(Et,t,e,i)}(n,o,a):Ft(n,o,a),{r:i[0],g:i[1],b:i[2],a:s}}const Wt={x:"dark",Z:"light",Y:"re",X:"blu",W:"gr",V:"medium",U:"slate",A:"ee",T:"ol",S:"or",B:"ra",C:"lateg",D:"ights",R:"in",Q:"turquois",E:"hi",P:"ro",O:"al",N:"le",M:"de",L:"yello",F:"en",K:"ch",G:"arks",H:"ea",I:"ightg",J:"wh"},Nt={OiceXe:"f0f8ff",antiquewEte:"faebd7",aqua:"ffff",aquamarRe:"7fffd4",azuY:"f0ffff",beige:"f5f5dc",bisque:"ffe4c4",black:"0",blanKedOmond:"ffebcd",Xe:"ff",XeviTet:"8a2be2",bPwn:"a52a2a",burlywood:"deb887",caMtXe:"5f9ea0",KartYuse:"7fff00",KocTate:"d2691e",cSO:"ff7f50",cSnflowerXe:"6495ed",cSnsilk:"fff8dc",crimson:"dc143c",cyan:"ffff",xXe:"8b",xcyan:"8b8b",xgTMnPd:"b8860b",xWay:"a9a9a9",xgYF:"6400",xgYy:"a9a9a9",xkhaki:"bdb76b",xmagFta:"8b008b",xTivegYF:"556b2f",xSange:"ff8c00",xScEd:"9932cc",xYd:"8b0000",xsOmon:"e9967a",xsHgYF:"8fbc8f",xUXe:"483d8b",xUWay:"2f4f4f",xUgYy:"2f4f4f",xQe:"ced1",xviTet:"9400d3",dAppRk:"ff1493",dApskyXe:"bfff",dimWay:"696969",dimgYy:"696969",dodgerXe:"1e90ff",fiYbrick:"b22222",flSOwEte:"fffaf0",foYstWAn:"228b22",fuKsia:"ff00ff",gaRsbSo:"dcdcdc",ghostwEte:"f8f8ff",gTd:"ffd700",gTMnPd:"daa520",Way:"808080",gYF:"8000",gYFLw:"adff2f",gYy:"808080",honeyMw:"f0fff0",hotpRk:"ff69b4",RdianYd:"cd5c5c",Rdigo:"4b0082",ivSy:"fffff0",khaki:"f0e68c",lavFMr:"e6e6fa",lavFMrXsh:"fff0f5",lawngYF:"7cfc00",NmoncEffon:"fffacd",ZXe:"add8e6",ZcSO:"f08080",Zcyan:"e0ffff",ZgTMnPdLw:"fafad2",ZWay:"d3d3d3",ZgYF:"90ee90",ZgYy:"d3d3d3",ZpRk:"ffb6c1",ZsOmon:"ffa07a",ZsHgYF:"20b2aa",ZskyXe:"87cefa",ZUWay:"778899",ZUgYy:"778899",ZstAlXe:"b0c4de",ZLw:"ffffe0",lime:"ff00",limegYF:"32cd32",lRF:"faf0e6",magFta:"ff00ff",maPon:"800000",VaquamarRe:"66cdaa",VXe:"cd",VScEd:"ba55d3",VpurpN:"9370db",VsHgYF:"3cb371",VUXe:"7b68ee",VsprRggYF:"fa9a",VQe:"48d1cc",VviTetYd:"c71585",midnightXe:"191970",mRtcYam:"f5fffa",mistyPse:"ffe4e1",moccasR:"ffe4b5",navajowEte:"ffdead",navy:"80",Tdlace:"fdf5e6",Tive:"808000",TivedBb:"6b8e23",Sange:"ffa500",SangeYd:"ff4500",ScEd:"da70d6",pOegTMnPd:"eee8aa",pOegYF:"98fb98",pOeQe:"afeeee",pOeviTetYd:"db7093",papayawEp:"ffefd5",pHKpuff:"ffdab9",peru:"cd853f",pRk:"ffc0cb",plum:"dda0dd",powMrXe:"b0e0e6",purpN:"800080",YbeccapurpN:"663399",Yd:"ff0000",Psybrown:"bc8f8f",PyOXe:"4169e1",saddNbPwn:"8b4513",sOmon:"fa8072",sandybPwn:"f4a460",sHgYF:"2e8b57",sHshell:"fff5ee",siFna:"a0522d",silver:"c0c0c0",skyXe:"87ceeb",UXe:"6a5acd",UWay:"708090",UgYy:"708090",snow:"fffafa",sprRggYF:"ff7f",stAlXe:"4682b4",tan:"d2b48c",teO:"8080",tEstN:"d8bfd8",tomato:"ff6347",Qe:"40e0d0",viTet:"ee82ee",JHt:"f5deb3",wEte:"ffffff",wEtesmoke:"f5f5f5",Lw:"ffff00",LwgYF:"9acd32"};let Ht;function jt(t){Ht||(Ht=function(){const t={},e=Object.keys(Nt),i=Object.keys(Wt);let s,n,o,a,r;for(s=0;s<e.length;s++){for(a=r=e[s],n=0;n<i.length;n++)o=i[n],r=r.replace(o,Wt[o]);o=parseInt(Nt[a],16),t[r]=[o>>16&255,o>>8&255,255&o]}return t}(),Ht.transparent=[0,0,0,0]);const e=Ht[t.toLowerCase()];return e&&{r:e[0],g:e[1],b:e[2],a:4===e.length?e[3]:255}}const $t=/^rgba?\(\s*([-+.\d]+)(%)?[\s,]+([-+.e\d]+)(%)?[\s,]+([-+.e\d]+)(%)?(?:[\s,/]+([-+.e\d]+)(%)?)?\s*\)$/;const Yt=t=>t<=.0031308?12.92*t:1.055*Math.pow(t,1/2.4)-.055,Ut=t=>t<=.04045?t/12.92:Math.pow((t+.055)/1.055,2.4);function Xt(t,e,i){if(t){let s=It(t);s[e]=Math.max(0,Math.min(s[e]+s[e]*i,0===e?360:1)),s=Ft(s),t.r=s[0],t.g=s[1],t.b=s[2]}}function qt(t,e){return t?Object.assign(e||{},t):t}function Kt(t){var e={r:0,g:0,b:0,a:255};return Array.isArray(t)?t.length>=3&&(e={r:t[0],g:t[1],b:t[2],a:255},t.length>3&&(e.a=Mt(t[3]))):(e=qt(t,{r:0,g:0,b:0,a:1})).a=Mt(e.a),e}function Gt(t){return"r"===t.charAt(0)?function(t){const e=$t.exec(t);let i,s,n,o=255;if(e){if(e[7]!==i){const t=+e[7];o=e[8]?vt(t):yt(255*t,0,255)}return i=+e[1],s=+e[3],n=+e[5],i=255&(e[2]?vt(i):yt(i,0,255)),s=255&(e[4]?vt(s):yt(s,0,255)),n=255&(e[6]?vt(n):yt(n,0,255)),{r:i,g:s,b:n,a:o}}}(t):Bt(t)}class Jt{constructor(t){if(t instanceof Jt)return t;const e=typeof t;let i;var s,n,o;"object"===e?i=Kt(t):"string"===e&&(o=(s=t).length,"#"===s[0]&&(4===o||5===o?n={r:255&17*St[s[1]],g:255&17*St[s[2]],b:255&17*St[s[3]],a:5===o?17*St[s[4]]:255}:7!==o&&9!==o||(n={r:St[s[1]]<<4|St[s[2]],g:St[s[3]]<<4|St[s[4]],b:St[s[5]]<<4|St[s[6]],a:9===o?St[s[7]]<<4|St[s[8]]:255})),i=n||jt(t)||Gt(t)),this._rgb=i,this._valid=!!i}get valid(){return this._valid}get rgb(){var t=qt(this._rgb);return t&&(t.a=wt(t.a)),t}set rgb(t){this._rgb=Kt(t)}rgbString(){return this._valid?(t=this._rgb)&&(t.a<255?`rgba(${t.r}, ${t.g}, ${t.b}, ${wt(t.a)})`:`rgb(${t.r}, ${t.g}, ${t.b})`):void 0;var t}hexString(){return this._valid?At(this._rgb):void 0}hslString(){return this._valid?function(t){if(!t)return;const e=It(t),i=e[0],s=kt(e[1]),n=kt(e[2]);return t.a<255?`hsla(${i}, ${s}%, ${n}%, ${wt(t.a)})`:`hsl(${i}, ${s}%, ${n}%)`}(this._rgb):void 0}mix(t,e){if(t){const i=this.rgb,s=t.rgb;let n;const o=e===n?.5:e,a=2*o-1,r=i.a-s.a,l=((a*r==-1?a:(a+r)/(1+a*r))+1)/2;n=1-l,i.r=255&l*i.r+n*s.r+.5,i.g=255&l*i.g+n*s.g+.5,i.b=255&l*i.b+n*s.b+.5,i.a=o*i.a+(1-o)*s.a,this.rgb=i}return this}interpolate(t,e){return t&&(this._rgb=function(t,e,i){const s=Ut(wt(t.r)),n=Ut(wt(t.g)),o=Ut(wt(t.b));return{r:Mt(Yt(s+i*(Ut(wt(e.r))-s))),g:Mt(Yt(n+i*(Ut(wt(e.g))-n))),b:Mt(Yt(o+i*(Ut(wt(e.b))-o))),a:t.a+i*(e.a-t.a)}}(this._rgb,t._rgb,e)),this}clone(){return new Jt(this.rgb)}alpha(t){return this._rgb.a=Mt(t),this}clearer(t){return this._rgb.a*=1-t,this}greyscale(){const t=this._rgb,e=_t(.3*t.r+.59*t.g+.11*t.b);return t.r=t.g=t.b=e,this}opaquer(t){return this._rgb.a*=1+t,this}negate(){const t=this._rgb;return t.r=255-t.r,t.g=255-t.g,t.b=255-t.b,this}lighten(t){return Xt(this._rgb,2,t),this}darken(t){return Xt(this._rgb,2,-t),this}saturate(t){return Xt(this._rgb,1,t),this}desaturate(t){return Xt(this._rgb,1,-t),this}rotate(t){return function(t,e){var i=It(t);i[0]=Vt(i[0]+e),i=Ft(i),t.r=i[0],t.g=i[1],t.b=i[2]}(this._rgb,t),this}}function Zt(t){if(t&&"object"==typeof t){const e=t.toString();return"[object CanvasPattern]"===e||"[object CanvasGradient]"===e}return!1}function Qt(t){return Zt(t)?t:new Jt(t)}function te(t){return Zt(t)?t:new Jt(t).saturate(.5).darken(.1).hexString()}const ee=["x","y","borderWidth","radius","tension"],ie=["color","borderColor","backgroundColor"];const se=new Map;function ne(t,e,i){return function(t,e){e=e||{};const i=t+JSON.stringify(e);let s=se.get(i);return s||(s=new Intl.NumberFormat(t,e),se.set(i,s)),s}(e,i).format(t)}const oe={values:t=>n(t)?t:""+t,numeric(t,e,i){if(0===t)return"0";const s=this.chart.options.locale;let n,o=t;if(i.length>1){const e=Math.max(Math.abs(i[0].value),Math.abs(i[i.length-1].value));(e<1e-4||e>1e15)&&(n="scientific"),o=function(t,e){let i=e.length>3?e[2].value-e[1].value:e[1].value-e[0].value;Math.abs(i)>=1&&t!==Math.floor(t)&&(i=t-Math.floor(t));return i}(t,i)}const a=z(Math.abs(o)),r=isNaN(a)?1:Math.max(Math.min(-1*Math.floor(a),20),0),l={notation:n,minimumFractionDigits:r,maximumFractionDigits:r};return Object.assign(l,this.options.ticks.format),ne(t,s,l)},logarithmic(t,e,i){if(0===t)return"0";const s=i[e].significand||t/Math.pow(10,Math.floor(z(t)));return[1,2,3,5,10,15].includes(s)||e>.8*i.length?oe.numeric.call(this,t,e,i):""}};var ae={formatters:oe};const re=Object.create(null),le=Object.create(null);function he(t,e){if(!e)return t;const i=e.split(".");for(let e=0,s=i.length;e<s;++e){const s=i[e];t=t[s]||(t[s]=Object.create(null))}return t}function ce(t,e,i){return"string"==typeof e?x(he(t,e),i):x(he(t,""),e)}class de{constructor(t,e){this.animation=void 0,this.backgroundColor="rgba(0,0,0,0.1)",this.borderColor="rgba(0,0,0,0.1)",this.color="#666",this.datasets={},this.devicePixelRatio=t=>t.chart.platform.getDevicePixelRatio(),this.elements={},this.events=["mousemove","mouseout","click","touchstart","touchmove"],this.font={family:"'Helvetica Neue', 'Helvetica', 'Arial', sans-serif",size:12,style:"normal",lineHeight:1.2,weight:null},this.hover={},this.hoverBackgroundColor=(t,e)=>te(e.backgroundColor),this.hoverBorderColor=(t,e)=>te(e.borderColor),this.hoverColor=(t,e)=>te(e.color),this.indexAxis="x",this.interaction={mode:"nearest",intersect:!0,includeInvisible:!1},this.maintainAspectRatio=!0,this.onHover=null,this.onClick=null,this.parsing=!0,this.plugins={},this.responsive=!0,this.scale=void 0,this.scales={},this.showLine=!0,this.drawActiveElementsOnTop=!0,this.describe(t),this.apply(e)}set(t,e){return ce(this,t,e)}get(t){return he(this,t)}describe(t,e){return ce(le,t,e)}override(t,e){return ce(re,t,e)}route(t,e,i,s){const n=he(this,t),a=he(this,i),r="_"+e;Object.defineProperties(n,{[r]:{value:n[e],writable:!0},[e]:{enumerable:!0,get(){const t=this[r],e=a[s];return o(t)?Object.assign({},e,t):l(t,e)},set(t){this[r]=t}}})}apply(t){t.forEach((t=>t(this)))}}var ue=new de({_scriptable:t=>!t.startsWith("on"),_indexable:t=>"events"!==t,hover:{_fallback:"interaction"},interaction:{_scriptable:!1,_indexable:!1}},[function(t){t.set("animation",{delay:void 0,duration:1e3,easing:"easeOutQuart",fn:void 0,from:void 0,loop:void 0,to:void 0,type:void 0}),t.describe("animation",{_fallback:!1,_indexable:!1,_scriptable:t=>"onProgress"!==t&&"onComplete"!==t&&"fn"!==t}),t.set("animations",{colors:{type:"color",properties:ie},numbers:{type:"number",properties:ee}}),t.describe("animations",{_fallback:"animation"}),t.set("transitions",{active:{animation:{duration:400}},resize:{animation:{duration:0}},show:{animations:{colors:{from:"transparent"},visible:{type:"boolean",duration:0}}},hide:{animations:{colors:{to:"transparent"},visible:{type:"boolean",easing:"linear",fn:t=>0|t}}}})},function(t){t.set("layout",{autoPadding:!0,padding:{top:0,right:0,bottom:0,left:0}})},function(t){t.set("scale",{display:!0,offset:!1,reverse:!1,beginAtZero:!1,bounds:"ticks",clip:!0,grace:0,grid:{display:!0,lineWidth:1,drawOnChartArea:!0,drawTicks:!0,tickLength:8,tickWidth:(t,e)=>e.lineWidth,tickColor:(t,e)=>e.color,offset:!1},border:{display:!0,dash:[],dashOffset:0,width:1},title:{display:!1,text:"",padding:{top:4,bottom:4}},ticks:{minRotation:0,maxRotation:50,mirror:!1,textStrokeWidth:0,textStrokeColor:"",padding:3,display:!0,autoSkip:!0,autoSkipPadding:3,labelOffset:0,callback:ae.formatters.values,minor:{},major:{},align:"center",crossAlign:"near",showLabelBackdrop:!1,backdropColor:"rgba(255, 255, 255, 0.75)",backdropPadding:2}}),t.route("scale.ticks","color","","color"),t.route("scale.grid","color","","borderColor"),t.route("scale.border","color","","borderColor"),t.route("scale.title","color","","color"),t.describe("scale",{_fallback:!1,_scriptable:t=>!t.startsWith("before")&&!t.startsWith("after")&&"callback"!==t&&"parser"!==t,_indexable:t=>"borderDash"!==t&&"tickBorderDash"!==t&&"dash"!==t}),t.describe("scales",{_fallback:"scale"}),t.describe("scale.ticks",{_scriptable:t=>"backdropPadding"!==t&&"callback"!==t,_indexable:t=>"backdropPadding"!==t})}]);function fe(){return"undefined"!=typeof window&&"undefined"!=typeof document}function ge(t){let e=t.parentNode;return e&&"[object ShadowRoot]"===e.toString()&&(e=e.host),e}function pe(t,e,i){let s;return"string"==typeof t?(s=parseInt(t,10),-1!==t.indexOf("%")&&(s=s/100*e.parentNode[i])):s=t,s}const me=t=>t.ownerDocument.defaultView.getComputedStyle(t,null);function xe(t,e){return me(t).getPropertyValue(e)}const be=["top","right","bottom","left"];function _e(t,e,i){const s={};i=i?"-"+i:"";for(let n=0;n<4;n++){const o=be[n];s[o]=parseFloat(t[e+"-"+o+i])||0}return s.width=s.left+s.right,s.height=s.top+s.bottom,s}const ye=(t,e,i)=>(t>0||e>0)&&(!i||!i.shadowRoot);function ve(t,e){if("native"in t)return t;const{canvas:i,currentDevicePixelRatio:s}=e,n=me(i),o="border-box"===n.boxSizing,a=_e(n,"padding"),r=_e(n,"border","width"),{x:l,y:h,box:c}=function(t,e){const i=t.touches,s=i&&i.length?i[0]:t,{offsetX:n,offsetY:o}=s;let a,r,l=!1;if(ye(n,o,t.target))a=n,r=o;else{const t=e.getBoundingClientRect();a=s.clientX-t.left,r=s.clientY-t.top,l=!0}return{x:a,y:r,box:l}}(t,i),d=a.left+(c&&r.left),u=a.top+(c&&r.top);let{width:f,height:g}=e;return o&&(f-=a.width+r.width,g-=a.height+r.height),{x:Math.round((l-d)/f*i.width/s),y:Math.round((h-u)/g*i.height/s)}}const Me=t=>Math.round(10*t)/10;function we(t,e,i,s){const n=me(t),o=_e(n,"margin"),a=pe(n.maxWidth,t,"clientWidth")||T,r=pe(n.maxHeight,t,"clientHeight")||T,l=function(t,e,i){let s,n;if(void 0===e||void 0===i){const o=t&&ge(t);if(o){const t=o.getBoundingClientRect(),a=me(o),r=_e(a,"border","width"),l=_e(a,"padding");e=t.width-l.width-r.width,i=t.height-l.height-r.height,s=pe(a.maxWidth,o,"clientWidth"),n=pe(a.maxHeight,o,"clientHeight")}else e=t.clientWidth,i=t.clientHeight}return{width:e,height:i,maxWidth:s||T,maxHeight:n||T}}(t,e,i);let{width:h,height:c}=l;if("content-box"===n.boxSizing){const t=_e(n,"border","width"),e=_e(n,"padding");h-=e.width+t.width,c-=e.height+t.height}h=Math.max(0,h-o.width),c=Math.max(0,s?h/s:c-o.height),h=Me(Math.min(h,a,l.maxWidth)),c=Me(Math.min(c,r,l.maxHeight)),h&&!c&&(c=Me(h/2));return(void 0!==e||void 0!==i)&&s&&l.height&&c>l.height&&(c=l.height,h=Me(Math.floor(c*s))),{width:h,height:c}}function ke(t,e,i){const s=e||1,n=Me(t.height*s),o=Me(t.width*s);t.height=Me(t.height),t.width=Me(t.width);const a=t.canvas;return a.style&&(i||!a.style.height&&!a.style.width)&&(a.style.height=`${t.height}px`,a.style.width=`${t.width}px`),(t.currentDevicePixelRatio!==s||a.height!==n||a.width!==o)&&(t.currentDevicePixelRatio=s,a.height=n,a.width=o,t.ctx.setTransform(s,0,0,s,0,0),!0)}const Se=function(){let t=!1;try{const e={get passive(){return t=!0,!1}};fe()&&(window.addEventListener("test",null,e),window.removeEventListener("test",null,e))}catch(t){}return t}();function Pe(t,e){const i=xe(t,e),s=i&&i.match(/^(\d+)(\.\d+)?px$/);return s?+s[1]:void 0}function De(t){return!t||s(t.size)||s(t.family)?null:(t.style?t.style+" ":"")+(t.weight?t.weight+" ":"")+t.size+"px "+t.family}function Ce(t,e,i,s,n){let o=e[n];return o||(o=e[n]=t.measureText(n).width,i.push(n)),o>s&&(s=o),s}function Oe(t,e,i,s){let o=(s=s||{}).data=s.data||{},a=s.garbageCollect=s.garbageCollect||[];s.font!==e&&(o=s.data={},a=s.garbageCollect=[],s.font=e),t.save(),t.font=e;let r=0;const l=i.length;let h,c,d,u,f;for(h=0;h<l;h++)if(u=i[h],null==u||n(u)){if(n(u))for(c=0,d=u.length;c<d;c++)f=u[c],null==f||n(f)||(r=Ce(t,o,a,r,f))}else r=Ce(t,o,a,r,u);t.restore();const g=a.length/2;if(g>i.length){for(h=0;h<g;h++)delete o[a[h]];a.splice(0,g)}return r}function Ae(t,e,i){const s=t.currentDevicePixelRatio,n=0!==i?Math.max(i/2,.5):0;return Math.round((e-n)*s)/s+n}function Te(t,e){(e||t)&&((e=e||t.getContext("2d")).save(),e.resetTransform(),e.clearRect(0,0,t.width,t.height),e.restore())}function Le(t,e,i,s){Ee(t,e,i,s,null)}function Ee(t,e,i,s,n){let o,a,r,l,h,c,d,u;const f=e.pointStyle,g=e.rotation,p=e.radius;let m=(g||0)*L;if(f&&"object"==typeof f&&(o=f.toString(),"[object HTMLImageElement]"===o||"[object HTMLCanvasElement]"===o))return t.save(),t.translate(i,s),t.rotate(m),t.drawImage(f,-f.width/2,-f.height/2,f.width,f.height),void t.restore();if(!(isNaN(p)||p<=0)){switch(t.beginPath(),f){default:n?t.ellipse(i,s,n/2,p,0,0,O):t.arc(i,s,p,0,O),t.closePath();break;case"triangle":c=n?n/2:p,t.moveTo(i+Math.sin(m)*c,s-Math.cos(m)*p),m+=I,t.lineTo(i+Math.sin(m)*c,s-Math.cos(m)*p),m+=I,t.lineTo(i+Math.sin(m)*c,s-Math.cos(m)*p),t.closePath();break;case"rectRounded":h=.516*p,l=p-h,a=Math.cos(m+R)*l,d=Math.cos(m+R)*(n?n/2-h:l),r=Math.sin(m+R)*l,u=Math.sin(m+R)*(n?n/2-h:l),t.arc(i-d,s-r,h,m-C,m-E),t.arc(i+u,s-a,h,m-E,m),t.arc(i+d,s+r,h,m,m+E),t.arc(i-u,s+a,h,m+E,m+C),t.closePath();break;case"rect":if(!g){l=Math.SQRT1_2*p,c=n?n/2:l,t.rect(i-c,s-l,2*c,2*l);break}m+=R;case"rectRot":d=Math.cos(m)*(n?n/2:p),a=Math.cos(m)*p,r=Math.sin(m)*p,u=Math.sin(m)*(n?n/2:p),t.moveTo(i-d,s-r),t.lineTo(i+u,s-a),t.lineTo(i+d,s+r),t.lineTo(i-u,s+a),t.closePath();break;case"crossRot":m+=R;case"cross":d=Math.cos(m)*(n?n/2:p),a=Math.cos(m)*p,r=Math.sin(m)*p,u=Math.sin(m)*(n?n/2:p),t.moveTo(i-d,s-r),t.lineTo(i+d,s+r),t.moveTo(i+u,s-a),t.lineTo(i-u,s+a);break;case"star":d=Math.cos(m)*(n?n/2:p),a=Math.cos(m)*p,r=Math.sin(m)*p,u=Math.sin(m)*(n?n/2:p),t.moveTo(i-d,s-r),t.lineTo(i+d,s+r),t.moveTo(i+u,s-a),t.lineTo(i-u,s+a),m+=R,d=Math.cos(m)*(n?n/2:p),a=Math.cos(m)*p,r=Math.sin(m)*p,u=Math.sin(m)*(n?n/2:p),t.moveTo(i-d,s-r),t.lineTo(i+d,s+r),t.moveTo(i+u,s-a),t.lineTo(i-u,s+a);break;case"line":a=n?n/2:Math.cos(m)*p,r=Math.sin(m)*p,t.moveTo(i-a,s-r),t.lineTo(i+a,s+r);break;case"dash":t.moveTo(i,s),t.lineTo(i+Math.cos(m)*(n?n/2:p),s+Math.sin(m)*p);break;case!1:t.closePath()}t.fill(),e.borderWidth>0&&t.stroke()}}function Re(t,e,i){return i=i||.5,!e||t&&t.x>e.left-i&&t.x<e.right+i&&t.y>e.top-i&&t.y<e.bottom+i}function Ie(t,e){t.save(),t.beginPath(),t.rect(e.left,e.top,e.right-e.left,e.bottom-e.top),t.clip()}function ze(t){t.restore()}function Fe(t,e,i,s,n){if(!e)return t.lineTo(i.x,i.y);if("middle"===n){const s=(e.x+i.x)/2;t.lineTo(s,e.y),t.lineTo(s,i.y)}else"after"===n!=!!s?t.lineTo(e.x,i.y):t.lineTo(i.x,e.y);t.lineTo(i.x,i.y)}function Ve(t,e,i,s){if(!e)return t.lineTo(i.x,i.y);t.bezierCurveTo(s?e.cp1x:e.cp2x,s?e.cp1y:e.cp2y,s?i.cp2x:i.cp1x,s?i.cp2y:i.cp1y,i.x,i.y)}function Be(t,e,i,s,n){if(n.strikethrough||n.underline){const o=t.measureText(s),a=e-o.actualBoundingBoxLeft,r=e+o.actualBoundingBoxRight,l=i-o.actualBoundingBoxAscent,h=i+o.actualBoundingBoxDescent,c=n.strikethrough?(l+h)/2:h;t.strokeStyle=t.fillStyle,t.beginPath(),t.lineWidth=n.decorationWidth||2,t.moveTo(a,c),t.lineTo(r,c),t.stroke()}}function We(t,e){const i=t.fillStyle;t.fillStyle=e.color,t.fillRect(e.left,e.top,e.width,e.height),t.fillStyle=i}function Ne(t,e,i,o,a,r={}){const l=n(e)?e:[e],h=r.strokeWidth>0&&""!==r.strokeColor;let c,d;for(t.save(),t.font=a.string,function(t,e){e.translation&&t.translate(e.translation[0],e.translation[1]),s(e.rotation)||t.rotate(e.rotation),e.color&&(t.fillStyle=e.color),e.textAlign&&(t.textAlign=e.textAlign),e.textBaseline&&(t.textBaseline=e.textBaseline)}(t,r),c=0;c<l.length;++c)d=l[c],r.backdrop&&We(t,r.backdrop),h&&(r.strokeColor&&(t.strokeStyle=r.strokeColor),s(r.strokeWidth)||(t.lineWidth=r.strokeWidth),t.strokeText(d,i,o,r.maxWidth)),t.fillText(d,i,o,r.maxWidth),Be(t,i,o,d,r),o+=Number(a.lineHeight);t.restore()}function He(t,e){const{x:i,y:s,w:n,h:o,radius:a}=e;t.arc(i+a.topLeft,s+a.topLeft,a.topLeft,1.5*C,C,!0),t.lineTo(i,s+o-a.bottomLeft),t.arc(i+a.bottomLeft,s+o-a.bottomLeft,a.bottomLeft,C,E,!0),t.lineTo(i+n-a.bottomRight,s+o),t.arc(i+n-a.bottomRight,s+o-a.bottomRight,a.bottomRight,E,0,!0),t.lineTo(i+n,s+a.topRight),t.arc(i+n-a.topRight,s+a.topRight,a.topRight,0,-E,!0),t.lineTo(i+a.topLeft,s)}function je(t,e=[""],i,s,n=(()=>t[0])){const o=i||t;void 0===s&&(s=ti("_fallback",t));const a={[Symbol.toStringTag]:"Object",_cacheable:!0,_scopes:t,_rootScopes:o,_fallback:s,_getTarget:n,override:i=>je([i,...t],e,o,s)};return new Proxy(a,{deleteProperty:(e,i)=>(delete e[i],delete e._keys,delete t[0][i],!0),get:(i,s)=>qe(i,s,(()=>function(t,e,i,s){let n;for(const o of e)if(n=ti(Ue(o,t),i),void 0!==n)return Xe(t,n)?Ze(i,s,t,n):n}(s,e,t,i))),getOwnPropertyDescriptor:(t,e)=>Reflect.getOwnPropertyDescriptor(t._scopes[0],e),getPrototypeOf:()=>Reflect.getPrototypeOf(t[0]),has:(t,e)=>ei(t).includes(e),ownKeys:t=>ei(t),set(t,e,i){const s=t._storage||(t._storage=n());return t[e]=s[e]=i,delete t._keys,!0}})}function $e(t,e,i,s){const a={_cacheable:!1,_proxy:t,_context:e,_subProxy:i,_stack:new Set,_descriptors:Ye(t,s),setContext:e=>$e(t,e,i,s),override:n=>$e(t.override(n),e,i,s)};return new Proxy(a,{deleteProperty:(e,i)=>(delete e[i],delete t[i],!0),get:(t,e,i)=>qe(t,e,(()=>function(t,e,i){const{_proxy:s,_context:a,_subProxy:r,_descriptors:l}=t;let h=s[e];S(h)&&l.isScriptable(e)&&(h=function(t,e,i,s){const{_proxy:n,_context:o,_subProxy:a,_stack:r}=i;if(r.has(t))throw new Error("Recursion detected: "+Array.from(r).join("->")+"->"+t);r.add(t);let l=e(o,a||s);r.delete(t),Xe(t,l)&&(l=Ze(n._scopes,n,t,l));return l}(e,h,t,i));n(h)&&h.length&&(h=function(t,e,i,s){const{_proxy:n,_context:a,_subProxy:r,_descriptors:l}=i;if(void 0!==a.index&&s(t))return e[a.index%e.length];if(o(e[0])){const i=e,s=n._scopes.filter((t=>t!==i));e=[];for(const o of i){const i=Ze(s,n,t,o);e.push($e(i,a,r&&r[t],l))}}return e}(e,h,t,l.isIndexable));Xe(e,h)&&(h=$e(h,a,r&&r[e],l));return h}(t,e,i))),getOwnPropertyDescriptor:(e,i)=>e._descriptors.allKeys?Reflect.has(t,i)?{enumerable:!0,configurable:!0}:void 0:Reflect.getOwnPropertyDescriptor(t,i),getPrototypeOf:()=>Reflect.getPrototypeOf(t),has:(e,i)=>Reflect.has(t,i),ownKeys:()=>Reflect.ownKeys(t),set:(e,i,s)=>(t[i]=s,delete e[i],!0)})}function Ye(t,e={scriptable:!0,indexable:!0}){const{_scriptable:i=e.scriptable,_indexable:s=e.indexable,_allKeys:n=e.allKeys}=t;return{allKeys:n,scriptable:i,indexable:s,isScriptable:S(i)?i:()=>i,isIndexable:S(s)?s:()=>s}}const Ue=(t,e)=>t?t+w(e):e,Xe=(t,e)=>o(e)&&"adapters"!==t&&(null===Object.getPrototypeOf(e)||e.constructor===Object);function qe(t,e,i){if(Object.prototype.hasOwnProperty.call(t,e)||"constructor"===e)return t[e];const s=i();return t[e]=s,s}function Ke(t,e,i){return S(t)?t(e,i):t}const Ge=(t,e)=>!0===t?e:"string"==typeof t?M(e,t):void 0;function Je(t,e,i,s,n){for(const o of e){const e=Ge(i,o);if(e){t.add(e);const o=Ke(e._fallback,i,n);if(void 0!==o&&o!==i&&o!==s)return o}else if(!1===e&&void 0!==s&&i!==s)return null}return!1}function Ze(t,e,i,s){const a=e._rootScopes,r=Ke(e._fallback,i,s),l=[...t,...a],h=new Set;h.add(s);let c=Qe(h,l,i,r||i,s);return null!==c&&((void 0===r||r===i||(c=Qe(h,l,r,c,s),null!==c))&&je(Array.from(h),[""],a,r,(()=>function(t,e,i){const s=t._getTarget();e in s||(s[e]={});const a=s[e];if(n(a)&&o(i))return i;return a||{}}(e,i,s))))}function Qe(t,e,i,s,n){for(;i;)i=Je(t,e,i,s,n);return i}function ti(t,e){for(const i of e){if(!i)continue;const e=i[t];if(void 0!==e)return e}}function ei(t){let e=t._keys;return e||(e=t._keys=function(t){const e=new Set;for(const i of t)for(const t of Object.keys(i).filter((t=>!t.startsWith("_"))))e.add(t);return Array.from(e)}(t._scopes)),e}function ii(t,e,i,s){const{iScale:n}=t,{key:o="r"}=this._parsing,a=new Array(s);let r,l,h,c;for(r=0,l=s;r<l;++r)h=r+i,c=e[h],a[r]={r:n.parse(M(c,o),h)};return a}const si=Number.EPSILON||1e-14,ni=(t,e)=>e<t.length&&!t[e].skip&&t[e],oi=t=>"x"===t?"y":"x";function ai(t,e,i,s){const n=t.skip?e:t,o=e,a=i.skip?e:i,r=q(o,n),l=q(a,o);let h=r/(r+l),c=l/(r+l);h=isNaN(h)?0:h,c=isNaN(c)?0:c;const d=s*h,u=s*c;return{previous:{x:o.x-d*(a.x-n.x),y:o.y-d*(a.y-n.y)},next:{x:o.x+u*(a.x-n.x),y:o.y+u*(a.y-n.y)}}}function ri(t,e="x"){const i=oi(e),s=t.length,n=Array(s).fill(0),o=Array(s);let a,r,l,h=ni(t,0);for(a=0;a<s;++a)if(r=l,l=h,h=ni(t,a+1),l){if(h){const t=h[e]-l[e];n[a]=0!==t?(h[i]-l[i])/t:0}o[a]=r?h?F(n[a-1])!==F(n[a])?0:(n[a-1]+n[a])/2:n[a-1]:n[a]}!function(t,e,i){const s=t.length;let n,o,a,r,l,h=ni(t,0);for(let c=0;c<s-1;++c)l=h,h=ni(t,c+1),l&&h&&(V(e[c],0,si)?i[c]=i[c+1]=0:(n=i[c]/e[c],o=i[c+1]/e[c],r=Math.pow(n,2)+Math.pow(o,2),r<=9||(a=3/Math.sqrt(r),i[c]=n*a*e[c],i[c+1]=o*a*e[c])))}(t,n,o),function(t,e,i="x"){const s=oi(i),n=t.length;let o,a,r,l=ni(t,0);for(let h=0;h<n;++h){if(a=r,r=l,l=ni(t,h+1),!r)continue;const n=r[i],c=r[s];a&&(o=(n-a[i])/3,r[`cp1${i}`]=n-o,r[`cp1${s}`]=c-o*e[h]),l&&(o=(l[i]-n)/3,r[`cp2${i}`]=n+o,r[`cp2${s}`]=c+o*e[h])}}(t,o,e)}function li(t,e,i){return Math.max(Math.min(t,i),e)}function hi(t,e,i,s,n){let o,a,r,l;if(e.spanGaps&&(t=t.filter((t=>!t.skip))),"monotone"===e.cubicInterpolationMode)ri(t,n);else{let i=s?t[t.length-1]:t[0];for(o=0,a=t.length;o<a;++o)r=t[o],l=ai(i,r,t[Math.min(o+1,a-(s?0:1))%a],e.tension),r.cp1x=l.previous.x,r.cp1y=l.previous.y,r.cp2x=l.next.x,r.cp2y=l.next.y,i=r}e.capBezierPoints&&function(t,e){let i,s,n,o,a,r=Re(t[0],e);for(i=0,s=t.length;i<s;++i)a=o,o=r,r=i<s-1&&Re(t[i+1],e),o&&(n=t[i],a&&(n.cp1x=li(n.cp1x,e.left,e.right),n.cp1y=li(n.cp1y,e.top,e.bottom)),r&&(n.cp2x=li(n.cp2x,e.left,e.right),n.cp2y=li(n.cp2y,e.top,e.bottom)))}(t,i)}const ci=t=>0===t||1===t,di=(t,e,i)=>-Math.pow(2,10*(t-=1))*Math.sin((t-e)*O/i),ui=(t,e,i)=>Math.pow(2,-10*t)*Math.sin((t-e)*O/i)+1,fi={linear:t=>t,easeInQuad:t=>t*t,easeOutQuad:t=>-t*(t-2),easeInOutQuad:t=>(t/=.5)<1?.5*t*t:-.5*(--t*(t-2)-1),easeInCubic:t=>t*t*t,easeOutCubic:t=>(t-=1)*t*t+1,easeInOutCubic:t=>(t/=.5)<1?.5*t*t*t:.5*((t-=2)*t*t+2),easeInQuart:t=>t*t*t*t,easeOutQuart:t=>-((t-=1)*t*t*t-1),easeInOutQuart:t=>(t/=.5)<1?.5*t*t*t*t:-.5*((t-=2)*t*t*t-2),easeInQuint:t=>t*t*t*t*t,easeOutQuint:t=>(t-=1)*t*t*t*t+1,easeInOutQuint:t=>(t/=.5)<1?.5*t*t*t*t*t:.5*((t-=2)*t*t*t*t+2),easeInSine:t=>1-Math.cos(t*E),easeOutSine:t=>Math.sin(t*E),easeInOutSine:t=>-.5*(Math.cos(C*t)-1),easeInExpo:t=>0===t?0:Math.pow(2,10*(t-1)),easeOutExpo:t=>1===t?1:1-Math.pow(2,-10*t),easeInOutExpo:t=>ci(t)?t:t<.5?.5*Math.pow(2,10*(2*t-1)):.5*(2-Math.pow(2,-10*(2*t-1))),easeInCirc:t=>t>=1?t:-(Math.sqrt(1-t*t)-1),easeOutCirc:t=>Math.sqrt(1-(t-=1)*t),easeInOutCirc:t=>(t/=.5)<1?-.5*(Math.sqrt(1-t*t)-1):.5*(Math.sqrt(1-(t-=2)*t)+1),easeInElastic:t=>ci(t)?t:di(t,.075,.3),easeOutElastic:t=>ci(t)?t:ui(t,.075,.3),easeInOutElastic(t){const e=.1125;return ci(t)?t:t<.5?.5*di(2*t,e,.45):.5+.5*ui(2*t-1,e,.45)},easeInBack(t){const e=1.70158;return t*t*((e+1)*t-e)},easeOutBack(t){const e=1.70158;return(t-=1)*t*((e+1)*t+e)+1},easeInOutBack(t){let e=1.70158;return(t/=.5)<1?t*t*((1+(e*=1.525))*t-e)*.5:.5*((t-=2)*t*((1+(e*=1.525))*t+e)+2)},easeInBounce:t=>1-fi.easeOutBounce(1-t),easeOutBounce(t){const e=7.5625,i=2.75;return t<1/i?e*t*t:t<2/i?e*(t-=1.5/i)*t+.75:t<2.5/i?e*(t-=2.25/i)*t+.9375:e*(t-=2.625/i)*t+.984375},easeInOutBounce:t=>t<.5?.5*fi.easeInBounce(2*t):.5*fi.easeOutBounce(2*t-1)+.5};function gi(t,e,i,s){return{x:t.x+i*(e.x-t.x),y:t.y+i*(e.y-t.y)}}function pi(t,e,i,s){return{x:t.x+i*(e.x-t.x),y:"middle"===s?i<.5?t.y:e.y:"after"===s?i<1?t.y:e.y:i>0?e.y:t.y}}function mi(t,e,i,s){const n={x:t.cp2x,y:t.cp2y},o={x:e.cp1x,y:e.cp1y},a=gi(t,n,i),r=gi(n,o,i),l=gi(o,e,i),h=gi(a,r,i),c=gi(r,l,i);return gi(h,c,i)}const xi=/^(normal|(\d+(?:\.\d+)?)(px|em|%)?)$/,bi=/^(normal|italic|initial|inherit|unset|(oblique( -?[0-9]?[0-9]deg)?))$/;function _i(t,e){const i=(""+t).match(xi);if(!i||"normal"===i[1])return 1.2*e;switch(t=+i[2],i[3]){case"px":return t;case"%":t/=100}return e*t}const yi=t=>+t||0;function vi(t,e){const i={},s=o(e),n=s?Object.keys(e):e,a=o(t)?s?i=>l(t[i],t[e[i]]):e=>t[e]:()=>t;for(const t of n)i[t]=yi(a(t));return i}function Mi(t){return vi(t,{top:"y",right:"x",bottom:"y",left:"x"})}function wi(t){return vi(t,["topLeft","topRight","bottomLeft","bottomRight"])}function ki(t){const e=Mi(t);return e.width=e.left+e.right,e.height=e.top+e.bottom,e}function Si(t,e){t=t||{},e=e||ue.font;let i=l(t.size,e.size);"string"==typeof i&&(i=parseInt(i,10));let s=l(t.style,e.style);s&&!(""+s).match(bi)&&(console.warn('Invalid font style specified: "'+s+'"'),s=void 0);const n={family:l(t.family,e.family),lineHeight:_i(l(t.lineHeight,e.lineHeight),i),size:i,style:s,weight:l(t.weight,e.weight),string:""};return n.string=De(n),n}function Pi(t,e,i,s){let o,a,r,l=!0;for(o=0,a=t.length;o<a;++o)if(r=t[o],void 0!==r&&(void 0!==e&&"function"==typeof r&&(r=r(e),l=!1),void 0!==i&&n(r)&&(r=r[i%r.length],l=!1),void 0!==r))return s&&!l&&(s.cacheable=!1),r}function Di(t,e,i){const{min:s,max:n}=t,o=c(e,(n-s)/2),a=(t,e)=>i&&0===t?0:t+e;return{min:a(s,-Math.abs(o)),max:a(n,o)}}function Ci(t,e){return Object.assign(Object.create(t),e)}function Oi(t,e,i){return t?function(t,e){return{x:i=>t+t+e-i,setWidth(t){e=t},textAlign:t=>"center"===t?t:"right"===t?"left":"right",xPlus:(t,e)=>t-e,leftForLtr:(t,e)=>t-e}}(e,i):{x:t=>t,setWidth(t){},textAlign:t=>t,xPlus:(t,e)=>t+e,leftForLtr:(t,e)=>t}}function Ai(t,e){let i,s;"ltr"!==e&&"rtl"!==e||(i=t.canvas.style,s=[i.getPropertyValue("direction"),i.getPropertyPriority("direction")],i.setProperty("direction",e,"important"),t.prevTextDirection=s)}function Ti(t,e){void 0!==e&&(delete t.prevTextDirection,t.canvas.style.setProperty("direction",e[0],e[1]))}function Li(t){return"angle"===t?{between:J,compare:K,normalize:G}:{between:tt,compare:(t,e)=>t-e,normalize:t=>t}}function Ei({start:t,end:e,count:i,loop:s,style:n}){return{start:t%i,end:e%i,loop:s&&(e-t+1)%i==0,style:n}}function Ri(t,e,i){if(!i)return[t];const{property:s,start:n,end:o}=i,a=e.length,{compare:r,between:l,normalize:h}=Li(s),{start:c,end:d,loop:u,style:f}=function(t,e,i){const{property:s,start:n,end:o}=i,{between:a,normalize:r}=Li(s),l=e.length;let h,c,{start:d,end:u,loop:f}=t;if(f){for(d+=l,u+=l,h=0,c=l;h<c&&a(r(e[d%l][s]),n,o);++h)d--,u--;d%=l,u%=l}return u<d&&(u+=l),{start:d,end:u,loop:f,style:t.style}}(t,e,i),g=[];let p,m,x,b=!1,_=null;const y=()=>b||l(n,x,p)&&0!==r(n,x),v=()=>!b||0===r(o,p)||l(o,x,p);for(let t=c,i=c;t<=d;++t)m=e[t%a],m.skip||(p=h(m[s]),p!==x&&(b=l(p,n,o),null===_&&y()&&(_=0===r(p,n)?t:i),null!==_&&v()&&(g.push(Ei({start:_,end:t,loop:u,count:a,style:f})),_=null),i=t,x=p));return null!==_&&g.push(Ei({start:_,end:d,loop:u,count:a,style:f})),g}function Ii(t,e){const i=[],s=t.segments;for(let n=0;n<s.length;n++){const o=Ri(s[n],t.points,e);o.length&&i.push(...o)}return i}function zi(t,e){const i=t.points,s=t.options.spanGaps,n=i.length;if(!n)return[];const o=!!t._loop,{start:a,end:r}=function(t,e,i,s){let n=0,o=e-1;if(i&&!s)for(;n<e&&!t[n].skip;)n++;for(;n<e&&t[n].skip;)n++;for(n%=e,i&&(o+=n);o>n&&t[o%e].skip;)o--;return o%=e,{start:n,end:o}}(i,n,o,s);if(!0===s)return Fi(t,[{start:a,end:r,loop:o}],i,e);return Fi(t,function(t,e,i,s){const n=t.length,o=[];let a,r=e,l=t[e];for(a=e+1;a<=i;++a){const i=t[a%n];i.skip||i.stop?l.skip||(s=!1,o.push({start:e%n,end:(a-1)%n,loop:s}),e=r=i.stop?a:null):(r=a,l.skip&&(e=a)),l=i}return null!==r&&o.push({start:e%n,end:r%n,loop:s}),o}(i,a,r<a?r+n:r,!!t._fullLoop&&0===a&&r===n-1),i,e)}function Fi(t,e,i,s){return s&&s.setContext&&i?function(t,e,i,s){const n=t._chart.getContext(),o=Vi(t.options),{_datasetIndex:a,options:{spanGaps:r}}=t,l=i.length,h=[];let c=o,d=e[0].start,u=d;function f(t,e,s,n){const o=r?-1:1;if(t!==e){for(t+=l;i[t%l].skip;)t-=o;for(;i[e%l].skip;)e+=o;t%l!=e%l&&(h.push({start:t%l,end:e%l,loop:s,style:n}),c=n,d=e%l)}}for(const t of e){d=r?d:t.start;let e,o=i[d%l];for(u=d+1;u<=t.end;u++){const r=i[u%l];e=Vi(s.setContext(Ci(n,{type:"segment",p0:o,p1:r,p0DataIndex:(u-1)%l,p1DataIndex:u%l,datasetIndex:a}))),Bi(e,c)&&f(d,u-1,t.loop,c),o=r,c=e}d<u-1&&f(d,u-1,t.loop,c)}return h}(t,e,i,s):e}function Vi(t){return{backgroundColor:t.backgroundColor,borderCapStyle:t.borderCapStyle,borderDash:t.borderDash,borderDashOffset:t.borderDashOffset,borderJoinStyle:t.borderJoinStyle,borderWidth:t.borderWidth,borderColor:t.borderColor}}function Bi(t,e){if(!e)return!1;const i=[],s=function(t,e){return Zt(e)?(i.includes(e)||i.push(e),i.indexOf(e)):e};return JSON.stringify(t,s)!==JSON.stringify(e,s)}function Wi(t,e,i){return t.options.clip?t[i]:e[i]}function Ni(t,e){const i=e._clip;if(i.disabled)return!1;const s=function(t,e){const{xScale:i,yScale:s}=t;return i&&s?{left:Wi(i,e,"left"),right:Wi(i,e,"right"),top:Wi(s,e,"top"),bottom:Wi(s,e,"bottom")}:e}(e,t.chartArea);return{left:!1===i.left?0:s.left-(!0===i.left?0:i.left),right:!1===i.right?t.width:s.right+(!0===i.right?0:i.right),top:!1===i.top?0:s.top-(!0===i.top?0:i.top),bottom:!1===i.bottom?t.height:s.bottom+(!0===i.bottom?0:i.bottom)}}var Hi=Object.freeze({__proto__:null,HALF_PI:E,INFINITY:T,PI:C,PITAU:A,QUARTER_PI:R,RAD_PER_DEG:L,TAU:O,TWO_THIRDS_PI:I,_addGrace:Di,_alignPixel:Ae,_alignStartEnd:ft,_angleBetween:J,_angleDiff:K,_arrayUnique:lt,_attachContext:$e,_bezierCurveTo:Ve,_bezierInterpolation:mi,_boundSegment:Ri,_boundSegments:Ii,_capitalize:w,_computeSegments:zi,_createResolver:je,_decimalPlaces:U,_deprecated:function(t,e,i,s){void 0!==e&&console.warn(t+': "'+i+'" is deprecated. Please use "'+s+'" instead')},_descriptors:Ye,_elementsEqual:f,_factorize:W,_filterBetween:nt,_getParentNode:ge,_getStartAndCountOfVisiblePoints:pt,_int16Range:Q,_isBetween:tt,_isClickEvent:D,_isDomSupported:fe,_isPointInArea:Re,_limitValue:Z,_longestText:Oe,_lookup:et,_lookupByKey:it,_measureText:Ce,_merger:m,_mergerIf:_,_normalizeAngle:G,_parseObjectDataRadialScale:ii,_pointInLine:gi,_readValueToProps:vi,_rlookupByKey:st,_scaleRangesChanged:mt,_setMinAndMaxByKey:j,_splitKey:v,_steppedInterpolation:pi,_steppedLineTo:Fe,_textX:gt,_toLeftRightCenter:ut,_updateBezierControlPoints:hi,addRoundedRectPath:He,almostEquals:V,almostWhole:H,callback:d,clearCanvas:Te,clipArea:Ie,clone:g,color:Qt,createContext:Ci,debounce:dt,defined:k,distanceBetweenPoints:q,drawPoint:Le,drawPointLegend:Ee,each:u,easingEffects:fi,finiteOrDefault:r,fontString:function(t,e,i){return e+" "+t+"px "+i},formatNumber:ne,getAngleFromPoint:X,getDatasetClipArea:Ni,getHoverColor:te,getMaximumSize:we,getRelativePosition:ve,getRtlAdapter:Oi,getStyle:xe,isArray:n,isFinite:a,isFunction:S,isNullOrUndef:s,isNumber:N,isObject:o,isPatternOrGradient:Zt,listenArrayEvents:at,log10:z,merge:x,mergeIf:b,niceNum:B,noop:e,overrideTextDirection:Ai,readUsedSize:Pe,renderText:Ne,requestAnimFrame:ht,resolve:Pi,resolveObjectKey:M,restoreTextDirection:Ti,retinaScale:ke,setsEqual:P,sign:F,splineCurve:ai,splineCurveMonotone:ri,supportsEventListenerOptions:Se,throttled:ct,toDegrees:Y,toDimension:c,toFont:Si,toFontString:De,toLineHeight:_i,toPadding:ki,toPercentage:h,toRadians:$,toTRBL:Mi,toTRBLCorners:wi,uid:i,unclipArea:ze,unlistenArrayEvents:rt,valueOrDefault:l});function ji(t,e,i,n){const{controller:o,data:a,_sorted:r}=t,l=o._cachedMeta.iScale,h=t.dataset&&t.dataset.options?t.dataset.options.spanGaps:null;if(l&&e===l.axis&&"r"!==e&&r&&a.length){const r=l._reversePixels?st:it;if(!n){const n=r(a,e,i);if(h){const{vScale:e}=o._cachedMeta,{_parsed:i}=t,a=i.slice(0,n.lo+1).reverse().findIndex((t=>!s(t[e.axis])));n.lo-=Math.max(0,a);const r=i.slice(n.hi).findIndex((t=>!s(t[e.axis])));n.hi+=Math.max(0,r)}return n}if(o._sharedOptions){const t=a[0],s="function"==typeof t.getRange&&t.getRange(e);if(s){const t=r(a,e,i-s),n=r(a,e,i+s);return{lo:t.lo,hi:n.hi}}}}return{lo:0,hi:a.length-1}}function $i(t,e,i,s,n){const o=t.getSortedVisibleDatasetMetas(),a=i[e];for(let t=0,i=o.length;t<i;++t){const{index:i,data:r}=o[t],{lo:l,hi:h}=ji(o[t],e,a,n);for(let t=l;t<=h;++t){const e=r[t];e.skip||s(e,i,t)}}}function Yi(t,e,i,s,n){const o=[];if(!n&&!t.isPointInArea(e))return o;return $i(t,i,e,(function(i,a,r){(n||Re(i,t.chartArea,0))&&i.inRange(e.x,e.y,s)&&o.push({element:i,datasetIndex:a,index:r})}),!0),o}function Ui(t,e,i,s,n,o){let a=[];const r=function(t){const e=-1!==t.indexOf("x"),i=-1!==t.indexOf("y");return function(t,s){const n=e?Math.abs(t.x-s.x):0,o=i?Math.abs(t.y-s.y):0;return Math.sqrt(Math.pow(n,2)+Math.pow(o,2))}}(i);let l=Number.POSITIVE_INFINITY;return $i(t,i,e,(function(i,h,c){const d=i.inRange(e.x,e.y,n);if(s&&!d)return;const u=i.getCenterPoint(n);if(!(!!o||t.isPointInArea(u))&&!d)return;const f=r(e,u);f<l?(a=[{element:i,datasetIndex:h,index:c}],l=f):f===l&&a.push({element:i,datasetIndex:h,index:c})})),a}function Xi(t,e,i,s,n,o){return o||t.isPointInArea(e)?"r"!==i||s?Ui(t,e,i,s,n,o):function(t,e,i,s){let n=[];return $i(t,i,e,(function(t,i,o){const{startAngle:a,endAngle:r}=t.getProps(["startAngle","endAngle"],s),{angle:l}=X(t,{x:e.x,y:e.y});J(l,a,r)&&n.push({element:t,datasetIndex:i,index:o})})),n}(t,e,i,n):[]}function qi(t,e,i,s,n){const o=[],a="x"===i?"inXRange":"inYRange";let r=!1;return $i(t,i,e,((t,s,l)=>{t[a]&&t[a](e[i],n)&&(o.push({element:t,datasetIndex:s,index:l}),r=r||t.inRange(e.x,e.y,n))})),s&&!r?[]:o}var Ki={evaluateInteractionItems:$i,modes:{index(t,e,i,s){const n=ve(e,t),o=i.axis||"x",a=i.includeInvisible||!1,r=i.intersect?Yi(t,n,o,s,a):Xi(t,n,o,!1,s,a),l=[];return r.length?(t.getSortedVisibleDatasetMetas().forEach((t=>{const e=r[0].index,i=t.data[e];i&&!i.skip&&l.push({element:i,datasetIndex:t.index,index:e})})),l):[]},dataset(t,e,i,s){const n=ve(e,t),o=i.axis||"xy",a=i.includeInvisible||!1;let r=i.intersect?Yi(t,n,o,s,a):Xi(t,n,o,!1,s,a);if(r.length>0){const e=r[0].datasetIndex,i=t.getDatasetMeta(e).data;r=[];for(let t=0;t<i.length;++t)r.push({element:i[t],datasetIndex:e,index:t})}return r},point:(t,e,i,s)=>Yi(t,ve(e,t),i.axis||"xy",s,i.includeInvisible||!1),nearest(t,e,i,s){const n=ve(e,t),o=i.axis||"xy",a=i.includeInvisible||!1;return Xi(t,n,o,i.intersect,s,a)},x:(t,e,i,s)=>qi(t,ve(e,t),"x",i.intersect,s),y:(t,e,i,s)=>qi(t,ve(e,t),"y",i.intersect,s)}};const Gi=["left","top","right","bottom"];function Ji(t,e){return t.filter((t=>t.pos===e))}function Zi(t,e){return t.filter((t=>-1===Gi.indexOf(t.pos)&&t.box.axis===e))}function Qi(t,e){return t.sort(((t,i)=>{const s=e?i:t,n=e?t:i;return s.weight===n.weight?s.index-n.index:s.weight-n.weight}))}function ts(t,e){const i=function(t){const e={};for(const i of t){const{stack:t,pos:s,stackWeight:n}=i;if(!t||!Gi.includes(s))continue;const o=e[t]||(e[t]={count:0,placed:0,weight:0,size:0});o.count++,o.weight+=n}return e}(t),{vBoxMaxWidth:s,hBoxMaxHeight:n}=e;let o,a,r;for(o=0,a=t.length;o<a;++o){r=t[o];const{fullSize:a}=r.box,l=i[r.stack],h=l&&r.stackWeight/l.weight;r.horizontal?(r.width=h?h*s:a&&e.availableWidth,r.height=n):(r.width=s,r.height=h?h*n:a&&e.availableHeight)}return i}function es(t,e,i,s){return Math.max(t[i],e[i])+Math.max(t[s],e[s])}function is(t,e){t.top=Math.max(t.top,e.top),t.left=Math.max(t.left,e.left),t.bottom=Math.max(t.bottom,e.bottom),t.right=Math.max(t.right,e.right)}function ss(t,e,i,s){const{pos:n,box:a}=i,r=t.maxPadding;if(!o(n)){i.size&&(t[n]-=i.size);const e=s[i.stack]||{size:0,count:1};e.size=Math.max(e.size,i.horizontal?a.height:a.width),i.size=e.size/e.count,t[n]+=i.size}a.getPadding&&is(r,a.getPadding());const l=Math.max(0,e.outerWidth-es(r,t,"left","right")),h=Math.max(0,e.outerHeight-es(r,t,"top","bottom")),c=l!==t.w,d=h!==t.h;return t.w=l,t.h=h,i.horizontal?{same:c,other:d}:{same:d,other:c}}function ns(t,e){const i=e.maxPadding;function s(t){const s={left:0,top:0,right:0,bottom:0};return t.forEach((t=>{s[t]=Math.max(e[t],i[t])})),s}return s(t?["left","right"]:["top","bottom"])}function os(t,e,i,s){const n=[];let o,a,r,l,h,c;for(o=0,a=t.length,h=0;o<a;++o){r=t[o],l=r.box,l.update(r.width||e.w,r.height||e.h,ns(r.horizontal,e));const{same:a,other:d}=ss(e,i,r,s);h|=a&&n.length,c=c||d,l.fullSize||n.push(r)}return h&&os(n,e,i,s)||c}function as(t,e,i,s,n){t.top=i,t.left=e,t.right=e+s,t.bottom=i+n,t.width=s,t.height=n}function rs(t,e,i,s){const n=i.padding;let{x:o,y:a}=e;for(const r of t){const t=r.box,l=s[r.stack]||{count:1,placed:0,weight:1},h=r.stackWeight/l.weight||1;if(r.horizontal){const s=e.w*h,o=l.size||t.height;k(l.start)&&(a=l.start),t.fullSize?as(t,n.left,a,i.outerWidth-n.right-n.left,o):as(t,e.left+l.placed,a,s,o),l.start=a,l.placed+=s,a=t.bottom}else{const s=e.h*h,a=l.size||t.width;k(l.start)&&(o=l.start),t.fullSize?as(t,o,n.top,a,i.outerHeight-n.bottom-n.top):as(t,o,e.top+l.placed,a,s),l.start=o,l.placed+=s,o=t.right}}e.x=o,e.y=a}var ls={addBox(t,e){t.boxes||(t.boxes=[]),e.fullSize=e.fullSize||!1,e.position=e.position||"top",e.weight=e.weight||0,e._layers=e._layers||function(){return[{z:0,draw(t){e.draw(t)}}]},t.boxes.push(e)},removeBox(t,e){const i=t.boxes?t.boxes.indexOf(e):-1;-1!==i&&t.boxes.splice(i,1)},configure(t,e,i){e.fullSize=i.fullSize,e.position=i.position,e.weight=i.weight},update(t,e,i,s){if(!t)return;const n=ki(t.options.layout.padding),o=Math.max(e-n.width,0),a=Math.max(i-n.height,0),r=function(t){const e=function(t){const e=[];let i,s,n,o,a,r;for(i=0,s=(t||[]).length;i<s;++i)n=t[i],({position:o,options:{stack:a,stackWeight:r=1}}=n),e.push({index:i,box:n,pos:o,horizontal:n.isHorizontal(),weight:n.weight,stack:a&&o+a,stackWeight:r});return e}(t),i=Qi(e.filter((t=>t.box.fullSize)),!0),s=Qi(Ji(e,"left"),!0),n=Qi(Ji(e,"right")),o=Qi(Ji(e,"top"),!0),a=Qi(Ji(e,"bottom")),r=Zi(e,"x"),l=Zi(e,"y");return{fullSize:i,leftAndTop:s.concat(o),rightAndBottom:n.concat(l).concat(a).concat(r),chartArea:Ji(e,"chartArea"),vertical:s.concat(n).concat(l),horizontal:o.concat(a).concat(r)}}(t.boxes),l=r.vertical,h=r.horizontal;u(t.boxes,(t=>{"function"==typeof t.beforeLayout&&t.beforeLayout()}));const c=l.reduce(((t,e)=>e.box.options&&!1===e.box.options.display?t:t+1),0)||1,d=Object.freeze({outerWidth:e,outerHeight:i,padding:n,availableWidth:o,availableHeight:a,vBoxMaxWidth:o/2/c,hBoxMaxHeight:a/2}),f=Object.assign({},n);is(f,ki(s));const g=Object.assign({maxPadding:f,w:o,h:a,x:n.left,y:n.top},n),p=ts(l.concat(h),d);os(r.fullSize,g,d,p),os(l,g,d,p),os(h,g,d,p)&&os(l,g,d,p),function(t){const e=t.maxPadding;function i(i){const s=Math.max(e[i]-t[i],0);return t[i]+=s,s}t.y+=i("top"),t.x+=i("left"),i("right"),i("bottom")}(g),rs(r.leftAndTop,g,d,p),g.x+=g.w,g.y+=g.h,rs(r.rightAndBottom,g,d,p),t.chartArea={left:g.left,top:g.top,right:g.left+g.w,bottom:g.top+g.h,height:g.h,width:g.w},u(r.chartArea,(e=>{const i=e.box;Object.assign(i,t.chartArea),i.update(g.w,g.h,{left:0,top:0,right:0,bottom:0})}))}};class hs{acquireContext(t,e){}releaseContext(t){return!1}addEventListener(t,e,i){}removeEventListener(t,e,i){}getDevicePixelRatio(){return 1}getMaximumSize(t,e,i,s){return e=Math.max(0,e||t.width),i=i||t.height,{width:e,height:Math.max(0,s?Math.floor(e/s):i)}}isAttached(t){return!0}updateConfig(t){}}class cs extends hs{acquireContext(t){return t&&t.getContext&&t.getContext("2d")||null}updateConfig(t){t.options.animation=!1}}const ds="$chartjs",us={touchstart:"mousedown",touchmove:"mousemove",touchend:"mouseup",pointerenter:"mouseenter",pointerdown:"mousedown",pointermove:"mousemove",pointerup:"mouseup",pointerleave:"mouseout",pointerout:"mouseout"},fs=t=>null===t||""===t;const gs=!!Se&&{passive:!0};function ps(t,e,i){t&&t.canvas&&t.canvas.removeEventListener(e,i,gs)}function ms(t,e){for(const i of t)if(i===e||i.contains(e))return!0}function xs(t,e,i){const s=t.canvas,n=new MutationObserver((t=>{let e=!1;for(const i of t)e=e||ms(i.addedNodes,s),e=e&&!ms(i.removedNodes,s);e&&i()}));return n.observe(document,{childList:!0,subtree:!0}),n}function bs(t,e,i){const s=t.canvas,n=new MutationObserver((t=>{let e=!1;for(const i of t)e=e||ms(i.removedNodes,s),e=e&&!ms(i.addedNodes,s);e&&i()}));return n.observe(document,{childList:!0,subtree:!0}),n}const _s=new Map;let ys=0;function vs(){const t=window.devicePixelRatio;t!==ys&&(ys=t,_s.forEach(((e,i)=>{i.currentDevicePixelRatio!==t&&e()})))}function Ms(t,e,i){const s=t.canvas,n=s&&ge(s);if(!n)return;const o=ct(((t,e)=>{const s=n.clientWidth;i(t,e),s<n.clientWidth&&i()}),window),a=new ResizeObserver((t=>{const e=t[0],i=e.contentRect.width,s=e.contentRect.height;0===i&&0===s||o(i,s)}));return a.observe(n),function(t,e){_s.size||window.addEventListener("resize",vs),_s.set(t,e)}(t,o),a}function ws(t,e,i){i&&i.disconnect(),"resize"===e&&function(t){_s.delete(t),_s.size||window.removeEventListener("resize",vs)}(t)}function ks(t,e,i){const s=t.canvas,n=ct((e=>{null!==t.ctx&&i(function(t,e){const i=us[t.type]||t.type,{x:s,y:n}=ve(t,e);return{type:i,chart:e,native:t,x:void 0!==s?s:null,y:void 0!==n?n:null}}(e,t))}),t);return function(t,e,i){t&&t.addEventListener(e,i,gs)}(s,e,n),n}class Ss extends hs{acquireContext(t,e){const i=t&&t.getContext&&t.getContext("2d");return i&&i.canvas===t?(function(t,e){const i=t.style,s=t.getAttribute("height"),n=t.getAttribute("width");if(t[ds]={initial:{height:s,width:n,style:{display:i.display,height:i.height,width:i.width}}},i.display=i.display||"block",i.boxSizing=i.boxSizing||"border-box",fs(n)){const e=Pe(t,"width");void 0!==e&&(t.width=e)}if(fs(s))if(""===t.style.height)t.height=t.width/(e||2);else{const e=Pe(t,"height");void 0!==e&&(t.height=e)}}(t,e),i):null}releaseContext(t){const e=t.canvas;if(!e[ds])return!1;const i=e[ds].initial;["height","width"].forEach((t=>{const n=i[t];s(n)?e.removeAttribute(t):e.setAttribute(t,n)}));const n=i.style||{};return Object.keys(n).forEach((t=>{e.style[t]=n[t]})),e.width=e.width,delete e[ds],!0}addEventListener(t,e,i){this.removeEventListener(t,e);const s=t.$proxies||(t.$proxies={}),n={attach:xs,detach:bs,resize:Ms}[e]||ks;s[e]=n(t,e,i)}removeEventListener(t,e){const i=t.$proxies||(t.$proxies={}),s=i[e];if(!s)return;({attach:ws,detach:ws,resize:ws}[e]||ps)(t,e,s),i[e]=void 0}getDevicePixelRatio(){return window.devicePixelRatio}getMaximumSize(t,e,i,s){return we(t,e,i,s)}isAttached(t){const e=t&&ge(t);return!(!e||!e.isConnected)}}function Ps(t){return!fe()||"undefined"!=typeof OffscreenCanvas&&t instanceof OffscreenCanvas?cs:Ss}var Ds=Object.freeze({__proto__:null,BasePlatform:hs,BasicPlatform:cs,DomPlatform:Ss,_detectPlatform:Ps});const Cs="transparent",Os={boolean:(t,e,i)=>i>.5?e:t,color(t,e,i){const s=Qt(t||Cs),n=s.valid&&Qt(e||Cs);return n&&n.valid?n.mix(s,i).hexString():e},number:(t,e,i)=>t+(e-t)*i};class As{constructor(t,e,i,s){const n=e[i];s=Pi([t.to,s,n,t.from]);const o=Pi([t.from,n,s]);this._active=!0,this._fn=t.fn||Os[t.type||typeof o],this._easing=fi[t.easing]||fi.linear,this._start=Math.floor(Date.now()+(t.delay||0)),this._duration=this._total=Math.floor(t.duration),this._loop=!!t.loop,this._target=e,this._prop=i,this._from=o,this._to=s,this._promises=void 0}active(){return this._active}update(t,e,i){if(this._active){this._notify(!1);const s=this._target[this._prop],n=i-this._start,o=this._duration-n;this._start=i,this._duration=Math.floor(Math.max(o,t.duration)),this._total+=n,this._loop=!!t.loop,this._to=Pi([t.to,e,s,t.from]),this._from=Pi([t.from,s,e])}}cancel(){this._active&&(this.tick(Date.now()),this._active=!1,this._notify(!1))}tick(t){const e=t-this._start,i=this._duration,s=this._prop,n=this._from,o=this._loop,a=this._to;let r;if(this._active=n!==a&&(o||e<i),!this._active)return this._target[s]=a,void this._notify(!0);e<0?this._target[s]=n:(r=e/i%2,r=o&&r>1?2-r:r,r=this._easing(Math.min(1,Math.max(0,r))),this._target[s]=this._fn(n,a,r))}wait(){const t=this._promises||(this._promises=[]);return new Promise(((e,i)=>{t.push({res:e,rej:i})}))}_notify(t){const e=t?"res":"rej",i=this._promises||[];for(let t=0;t<i.length;t++)i[t][e]()}}class Ts{constructor(t,e){this._chart=t,this._properties=new Map,this.configure(e)}configure(t){if(!o(t))return;const e=Object.keys(ue.animation),i=this._properties;Object.getOwnPropertyNames(t).forEach((s=>{const a=t[s];if(!o(a))return;const r={};for(const t of e)r[t]=a[t];(n(a.properties)&&a.properties||[s]).forEach((t=>{t!==s&&i.has(t)||i.set(t,r)}))}))}_animateOptions(t,e){const i=e.options,s=function(t,e){if(!e)return;let i=t.options;if(!i)return void(t.options=e);i.$shared&&(t.options=i=Object.assign({},i,{$shared:!1,$animations:{}}));return i}(t,i);if(!s)return[];const n=this._createAnimations(s,i);return i.$shared&&function(t,e){const i=[],s=Object.keys(e);for(let e=0;e<s.length;e++){const n=t[s[e]];n&&n.active()&&i.push(n.wait())}return Promise.all(i)}(t.options.$animations,i).then((()=>{t.options=i}),(()=>{})),n}_createAnimations(t,e){const i=this._properties,s=[],n=t.$animations||(t.$animations={}),o=Object.keys(e),a=Date.now();let r;for(r=o.length-1;r>=0;--r){const l=o[r];if("$"===l.charAt(0))continue;if("options"===l){s.push(...this._animateOptions(t,e));continue}const h=e[l];let c=n[l];const d=i.get(l);if(c){if(d&&c.active()){c.update(d,h,a);continue}c.cancel()}d&&d.duration?(n[l]=c=new As(d,t,l,h),s.push(c)):t[l]=h}return s}update(t,e){if(0===this._properties.size)return void Object.assign(t,e);const i=this._createAnimations(t,e);return i.length?(bt.add(this._chart,i),!0):void 0}}function Ls(t,e){const i=t&&t.options||{},s=i.reverse,n=void 0===i.min?e:0,o=void 0===i.max?e:0;return{start:s?o:n,end:s?n:o}}function Es(t,e){const i=[],s=t._getSortedDatasetMetas(e);let n,o;for(n=0,o=s.length;n<o;++n)i.push(s[n].index);return i}function Rs(t,e,i,s={}){const n=t.keys,o="single"===s.mode;let r,l,h,c;if(null===e)return;let d=!1;for(r=0,l=n.length;r<l;++r){if(h=+n[r],h===i){if(d=!0,s.all)continue;break}c=t.values[h],a(c)&&(o||0===e||F(e)===F(c))&&(e+=c)}return d||s.all?e:0}function Is(t,e){const i=t&&t.options.stacked;return i||void 0===i&&void 0!==e.stack}function zs(t,e,i){const s=t[e]||(t[e]={});return s[i]||(s[i]={})}function Fs(t,e,i,s){for(const n of e.getMatchingVisibleMetas(s).reverse()){const e=t[n.index];if(i&&e>0||!i&&e<0)return n.index}return null}function Vs(t,e){const{chart:i,_cachedMeta:s}=t,n=i._stacks||(i._stacks={}),{iScale:o,vScale:a,index:r}=s,l=o.axis,h=a.axis,c=function(t,e,i){return`${t.id}.${e.id}.${i.stack||i.type}`}(o,a,s),d=e.length;let u;for(let t=0;t<d;++t){const i=e[t],{[l]:o,[h]:d}=i;u=(i._stacks||(i._stacks={}))[h]=zs(n,c,o),u[r]=d,u._top=Fs(u,a,!0,s.type),u._bottom=Fs(u,a,!1,s.type);(u._visualValues||(u._visualValues={}))[r]=d}}function Bs(t,e){const i=t.scales;return Object.keys(i).filter((t=>i[t].axis===e)).shift()}function Ws(t,e){const i=t.controller.index,s=t.vScale&&t.vScale.axis;if(s){e=e||t._parsed;for(const t of e){const e=t._stacks;if(!e||void 0===e[s]||void 0===e[s][i])return;delete e[s][i],void 0!==e[s]._visualValues&&void 0!==e[s]._visualValues[i]&&delete e[s]._visualValues[i]}}}const Ns=t=>"reset"===t||"none"===t,Hs=(t,e)=>e?t:Object.assign({},t);class js{static defaults={};static datasetElementType=null;static dataElementType=null;constructor(t,e){this.chart=t,this._ctx=t.ctx,this.index=e,this._cachedDataOpts={},this._cachedMeta=this.getMeta(),this._type=this._cachedMeta.type,this.options=void 0,this._parsing=!1,this._data=void 0,this._objectData=void 0,this._sharedOptions=void 0,this._drawStart=void 0,this._drawCount=void 0,this.enableOptionSharing=!1,this.supportsDecimation=!1,this.$context=void 0,this._syncList=[],this.datasetElementType=new.target.datasetElementType,this.dataElementType=new.target.dataElementType,this.initialize()}initialize(){const t=this._cachedMeta;this.configure(),this.linkScales(),t._stacked=Is(t.vScale,t),this.addElements(),this.options.fill&&!this.chart.isPluginEnabled("filler")&&console.warn("Tried to use the 'fill' option without the 'Filler' plugin enabled. Please import and register the 'Filler' plugin and make sure it is not disabled in the options")}updateIndex(t){this.index!==t&&Ws(this._cachedMeta),this.index=t}linkScales(){const t=this.chart,e=this._cachedMeta,i=this.getDataset(),s=(t,e,i,s)=>"x"===t?e:"r"===t?s:i,n=e.xAxisID=l(i.xAxisID,Bs(t,"x")),o=e.yAxisID=l(i.yAxisID,Bs(t,"y")),a=e.rAxisID=l(i.rAxisID,Bs(t,"r")),r=e.indexAxis,h=e.iAxisID=s(r,n,o,a),c=e.vAxisID=s(r,o,n,a);e.xScale=this.getScaleForId(n),e.yScale=this.getScaleForId(o),e.rScale=this.getScaleForId(a),e.iScale=this.getScaleForId(h),e.vScale=this.getScaleForId(c)}getDataset(){return this.chart.data.datasets[this.index]}getMeta(){return this.chart.getDatasetMeta(this.index)}getScaleForId(t){return this.chart.scales[t]}_getOtherScale(t){const e=this._cachedMeta;return t===e.iScale?e.vScale:e.iScale}reset(){this._update("reset")}_destroy(){const t=this._cachedMeta;this._data&&rt(this._data,this),t._stacked&&Ws(t)}_dataCheck(){const t=this.getDataset(),e=t.data||(t.data=[]),i=this._data;if(o(e)){const t=this._cachedMeta;this._data=function(t,e){const{iScale:i,vScale:s}=e,n="x"===i.axis?"x":"y",o="x"===s.axis?"x":"y",a=Object.keys(t),r=new Array(a.length);let l,h,c;for(l=0,h=a.length;l<h;++l)c=a[l],r[l]={[n]:c,[o]:t[c]};return r}(e,t)}else if(i!==e){if(i){rt(i,this);const t=this._cachedMeta;Ws(t),t._parsed=[]}e&&Object.isExtensible(e)&&at(e,this),this._syncList=[],this._data=e}}addElements(){const t=this._cachedMeta;this._dataCheck(),this.datasetElementType&&(t.dataset=new this.datasetElementType)}buildOrUpdateElements(t){const e=this._cachedMeta,i=this.getDataset();let s=!1;this._dataCheck();const n=e._stacked;e._stacked=Is(e.vScale,e),e.stack!==i.stack&&(s=!0,Ws(e),e.stack=i.stack),this._resyncElements(t),(s||n!==e._stacked)&&(Vs(this,e._parsed),e._stacked=Is(e.vScale,e))}configure(){const t=this.chart.config,e=t.datasetScopeKeys(this._type),i=t.getOptionScopes(this.getDataset(),e,!0);this.options=t.createResolver(i,this.getContext()),this._parsing=this.options.parsing,this._cachedDataOpts={}}parse(t,e){const{_cachedMeta:i,_data:s}=this,{iScale:a,_stacked:r}=i,l=a.axis;let h,c,d,u=0===t&&e===s.length||i._sorted,f=t>0&&i._parsed[t-1];if(!1===this._parsing)i._parsed=s,i._sorted=!0,d=s;else{d=n(s[t])?this.parseArrayData(i,s,t,e):o(s[t])?this.parseObjectData(i,s,t,e):this.parsePrimitiveData(i,s,t,e);const a=()=>null===c[l]||f&&c[l]<f[l];for(h=0;h<e;++h)i._parsed[h+t]=c=d[h],u&&(a()&&(u=!1),f=c);i._sorted=u}r&&Vs(this,d)}parsePrimitiveData(t,e,i,s){const{iScale:n,vScale:o}=t,a=n.axis,r=o.axis,l=n.getLabels(),h=n===o,c=new Array(s);let d,u,f;for(d=0,u=s;d<u;++d)f=d+i,c[d]={[a]:h||n.parse(l[f],f),[r]:o.parse(e[f],f)};return c}parseArrayData(t,e,i,s){const{xScale:n,yScale:o}=t,a=new Array(s);let r,l,h,c;for(r=0,l=s;r<l;++r)h=r+i,c=e[h],a[r]={x:n.parse(c[0],h),y:o.parse(c[1],h)};return a}parseObjectData(t,e,i,s){const{xScale:n,yScale:o}=t,{xAxisKey:a="x",yAxisKey:r="y"}=this._parsing,l=new Array(s);let h,c,d,u;for(h=0,c=s;h<c;++h)d=h+i,u=e[d],l[h]={x:n.parse(M(u,a),d),y:o.parse(M(u,r),d)};return l}getParsed(t){return this._cachedMeta._parsed[t]}getDataElement(t){return this._cachedMeta.data[t]}applyStack(t,e,i){const s=this.chart,n=this._cachedMeta,o=e[t.axis];return Rs({keys:Es(s,!0),values:e._stacks[t.axis]._visualValues},o,n.index,{mode:i})}updateRangeFromParsed(t,e,i,s){const n=i[e.axis];let o=null===n?NaN:n;const a=s&&i._stacks[e.axis];s&&a&&(s.values=a,o=Rs(s,n,this._cachedMeta.index)),t.min=Math.min(t.min,o),t.max=Math.max(t.max,o)}getMinMax(t,e){const i=this._cachedMeta,s=i._parsed,n=i._sorted&&t===i.iScale,o=s.length,r=this._getOtherScale(t),l=((t,e,i)=>t&&!e.hidden&&e._stacked&&{keys:Es(i,!0),values:null})(e,i,this.chart),h={min:Number.POSITIVE_INFINITY,max:Number.NEGATIVE_INFINITY},{min:c,max:d}=function(t){const{min:e,max:i,minDefined:s,maxDefined:n}=t.getUserBounds();return{min:s?e:Number.NEGATIVE_INFINITY,max:n?i:Number.POSITIVE_INFINITY}}(r);let u,f;function g(){f=s[u];const e=f[r.axis];return!a(f[t.axis])||c>e||d<e}for(u=0;u<o&&(g()||(this.updateRangeFromParsed(h,t,f,l),!n));++u);if(n)for(u=o-1;u>=0;--u)if(!g()){this.updateRangeFromParsed(h,t,f,l);break}return h}getAllParsedValues(t){const e=this._cachedMeta._parsed,i=[];let s,n,o;for(s=0,n=e.length;s<n;++s)o=e[s][t.axis],a(o)&&i.push(o);return i}getMaxOverflow(){return!1}getLabelAndValue(t){const e=this._cachedMeta,i=e.iScale,s=e.vScale,n=this.getParsed(t);return{label:i?""+i.getLabelForValue(n[i.axis]):"",value:s?""+s.getLabelForValue(n[s.axis]):""}}_update(t){const e=this._cachedMeta;this.update(t||"default"),e._clip=function(t){let e,i,s,n;return o(t)?(e=t.top,i=t.right,s=t.bottom,n=t.left):e=i=s=n=t,{top:e,right:i,bottom:s,left:n,disabled:!1===t}}(l(this.options.clip,function(t,e,i){if(!1===i)return!1;const s=Ls(t,i),n=Ls(e,i);return{top:n.end,right:s.end,bottom:n.start,left:s.start}}(e.xScale,e.yScale,this.getMaxOverflow())))}update(t){}draw(){const t=this._ctx,e=this.chart,i=this._cachedMeta,s=i.data||[],n=e.chartArea,o=[],a=this._drawStart||0,r=this._drawCount||s.length-a,l=this.options.drawActiveElementsOnTop;let h;for(i.dataset&&i.dataset.draw(t,n,a,r),h=a;h<a+r;++h){const e=s[h];e.hidden||(e.active&&l?o.push(e):e.draw(t,n))}for(h=0;h<o.length;++h)o[h].draw(t,n)}getStyle(t,e){const i=e?"active":"default";return void 0===t&&this._cachedMeta.dataset?this.resolveDatasetElementOptions(i):this.resolveDataElementOptions(t||0,i)}getContext(t,e,i){const s=this.getDataset();let n;if(t>=0&&t<this._cachedMeta.data.length){const e=this._cachedMeta.data[t];n=e.$context||(e.$context=function(t,e,i){return Ci(t,{active:!1,dataIndex:e,parsed:void 0,raw:void 0,element:i,index:e,mode:"default",type:"data"})}(this.getContext(),t,e)),n.parsed=this.getParsed(t),n.raw=s.data[t],n.index=n.dataIndex=t}else n=this.$context||(this.$context=function(t,e){return Ci(t,{active:!1,dataset:void 0,datasetIndex:e,index:e,mode:"default",type:"dataset"})}(this.chart.getContext(),this.index)),n.dataset=s,n.index=n.datasetIndex=this.index;return n.active=!!e,n.mode=i,n}resolveDatasetElementOptions(t){return this._resolveElementOptions(this.datasetElementType.id,t)}resolveDataElementOptions(t,e){return this._resolveElementOptions(this.dataElementType.id,e,t)}_resolveElementOptions(t,e="default",i){const s="active"===e,n=this._cachedDataOpts,o=t+"-"+e,a=n[o],r=this.enableOptionSharing&&k(i);if(a)return Hs(a,r);const l=this.chart.config,h=l.datasetElementScopeKeys(this._type,t),c=s?[`${t}Hover`,"hover",t,""]:[t,""],d=l.getOptionScopes(this.getDataset(),h),u=Object.keys(ue.elements[t]),f=l.resolveNamedOptions(d,u,(()=>this.getContext(i,s,e)),c);return f.$shared&&(f.$shared=r,n[o]=Object.freeze(Hs(f,r))),f}_resolveAnimations(t,e,i){const s=this.chart,n=this._cachedDataOpts,o=`animation-${e}`,a=n[o];if(a)return a;let r;if(!1!==s.options.animation){const s=this.chart.config,n=s.datasetAnimationScopeKeys(this._type,e),o=s.getOptionScopes(this.getDataset(),n);r=s.createResolver(o,this.getContext(t,i,e))}const l=new Ts(s,r&&r.animations);return r&&r._cacheable&&(n[o]=Object.freeze(l)),l}getSharedOptions(t){if(t.$shared)return this._sharedOptions||(this._sharedOptions=Object.assign({},t))}includeOptions(t,e){return!e||Ns(t)||this.chart._animationsDisabled}_getSharedOptions(t,e){const i=this.resolveDataElementOptions(t,e),s=this._sharedOptions,n=this.getSharedOptions(i),o=this.includeOptions(e,n)||n!==s;return this.updateSharedOptions(n,e,i),{sharedOptions:n,includeOptions:o}}updateElement(t,e,i,s){Ns(s)?Object.assign(t,i):this._resolveAnimations(e,s).update(t,i)}updateSharedOptions(t,e,i){t&&!Ns(e)&&this._resolveAnimations(void 0,e).update(t,i)}_setStyle(t,e,i,s){t.active=s;const n=this.getStyle(e,s);this._resolveAnimations(e,i,s).update(t,{options:!s&&this.getSharedOptions(n)||n})}removeHoverStyle(t,e,i){this._setStyle(t,i,"active",!1)}setHoverStyle(t,e,i){this._setStyle(t,i,"active",!0)}_removeDatasetHoverStyle(){const t=this._cachedMeta.dataset;t&&this._setStyle(t,void 0,"active",!1)}_setDatasetHoverStyle(){const t=this._cachedMeta.dataset;t&&this._setStyle(t,void 0,"active",!0)}_resyncElements(t){const e=this._data,i=this._cachedMeta.data;for(const[t,e,i]of this._syncList)this[t](e,i);this._syncList=[];const s=i.length,n=e.length,o=Math.min(n,s);o&&this.parse(0,o),n>s?this._insertElements(s,n-s,t):n<s&&this._removeElements(n,s-n)}_insertElements(t,e,i=!0){const s=this._cachedMeta,n=s.data,o=t+e;let a;const r=t=>{for(t.length+=e,a=t.length-1;a>=o;a--)t[a]=t[a-e]};for(r(n),a=t;a<o;++a)n[a]=new this.dataElementType;this._parsing&&r(s._parsed),this.parse(t,e),i&&this.updateElements(n,t,e,"reset")}updateElements(t,e,i,s){}_removeElements(t,e){const i=this._cachedMeta;if(this._parsing){const s=i._parsed.splice(t,e);i._stacked&&Ws(i,s)}i.data.splice(t,e)}_sync(t){if(this._parsing)this._syncList.push(t);else{const[e,i,s]=t;this[e](i,s)}this.chart._dataChanges.push([this.index,...t])}_onDataPush(){const t=arguments.length;this._sync(["_insertElements",this.getDataset().data.length-t,t])}_onDataPop(){this._sync(["_removeElements",this._cachedMeta.data.length-1,1])}_onDataShift(){this._sync(["_removeElements",0,1])}_onDataSplice(t,e){e&&this._sync(["_removeElements",t,e]);const i=arguments.length-2;i&&this._sync(["_insertElements",t,i])}_onDataUnshift(){this._sync(["_insertElements",0,arguments.length])}}class $s{static defaults={};static defaultRoutes=void 0;x;y;active=!1;options;$animations;tooltipPosition(t){const{x:e,y:i}=this.getProps(["x","y"],t);return{x:e,y:i}}hasValue(){return N(this.x)&&N(this.y)}getProps(t,e){const i=this.$animations;if(!e||!i)return this;const s={};return t.forEach((t=>{s[t]=i[t]&&i[t].active()?i[t]._to:this[t]})),s}}function Ys(t,e){const i=t.options.ticks,n=function(t){const e=t.options.offset,i=t._tickSize(),s=t._length/i+(e?0:1),n=t._maxLength/i;return Math.floor(Math.min(s,n))}(t),o=Math.min(i.maxTicksLimit||n,n),a=i.major.enabled?function(t){const e=[];let i,s;for(i=0,s=t.length;i<s;i++)t[i].major&&e.push(i);return e}(e):[],r=a.length,l=a[0],h=a[r-1],c=[];if(r>o)return function(t,e,i,s){let n,o=0,a=i[0];for(s=Math.ceil(s),n=0;n<t.length;n++)n===a&&(e.push(t[n]),o++,a=i[o*s])}(e,c,a,r/o),c;const d=function(t,e,i){const s=function(t){const e=t.length;let i,s;if(e<2)return!1;for(s=t[0],i=1;i<e;++i)if(t[i]-t[i-1]!==s)return!1;return s}(t),n=e.length/i;if(!s)return Math.max(n,1);const o=W(s);for(let t=0,e=o.length-1;t<e;t++){const e=o[t];if(e>n)return e}return Math.max(n,1)}(a,e,o);if(r>0){let t,i;const n=r>1?Math.round((h-l)/(r-1)):null;for(Us(e,c,d,s(n)?0:l-n,l),t=0,i=r-1;t<i;t++)Us(e,c,d,a[t],a[t+1]);return Us(e,c,d,h,s(n)?e.length:h+n),c}return Us(e,c,d),c}function Us(t,e,i,s,n){const o=l(s,0),a=Math.min(l(n,t.length),t.length);let r,h,c,d=0;for(i=Math.ceil(i),n&&(r=n-s,i=r/Math.floor(r/i)),c=o;c<0;)d++,c=Math.round(o+d*i);for(h=Math.max(o,0);h<a;h++)h===c&&(e.push(t[h]),d++,c=Math.round(o+d*i))}const Xs=(t,e,i)=>"top"===e||"left"===e?t[e]+i:t[e]-i,qs=(t,e)=>Math.min(e||t,t);function Ks(t,e){const i=[],s=t.length/e,n=t.length;let o=0;for(;o<n;o+=s)i.push(t[Math.floor(o)]);return i}function Gs(t,e,i){const s=t.ticks.length,n=Math.min(e,s-1),o=t._startPixel,a=t._endPixel,r=1e-6;let l,h=t.getPixelForTick(n);if(!(i&&(l=1===s?Math.max(h-o,a-h):0===e?(t.getPixelForTick(1)-h)/2:(h-t.getPixelForTick(n-1))/2,h+=n<e?l:-l,h<o-r||h>a+r)))return h}function Js(t){return t.drawTicks?t.tickLength:0}function Zs(t,e){if(!t.display)return 0;const i=Si(t.font,e),s=ki(t.padding);return(n(t.text)?t.text.length:1)*i.lineHeight+s.height}function Qs(t,e,i){let s=ut(t);return(i&&"right"!==e||!i&&"right"===e)&&(s=(t=>"left"===t?"right":"right"===t?"left":t)(s)),s}class tn extends $s{constructor(t){super(),this.id=t.id,this.type=t.type,this.options=void 0,this.ctx=t.ctx,this.chart=t.chart,this.top=void 0,this.bottom=void 0,this.left=void 0,this.right=void 0,this.width=void 0,this.height=void 0,this._margins={left:0,right:0,top:0,bottom:0},this.maxWidth=void 0,this.maxHeight=void 0,this.paddingTop=void 0,this.paddingBottom=void 0,this.paddingLeft=void 0,this.paddingRight=void 0,this.axis=void 0,this.labelRotation=void 0,this.min=void 0,this.max=void 0,this._range=void 0,this.ticks=[],this._gridLineItems=null,this._labelItems=null,this._labelSizes=null,this._length=0,this._maxLength=0,this._longestTextCache={},this._startPixel=void 0,this._endPixel=void 0,this._reversePixels=!1,this._userMax=void 0,this._userMin=void 0,this._suggestedMax=void 0,this._suggestedMin=void 0,this._ticksLength=0,this._borderValue=0,this._cache={},this._dataLimitsCached=!1,this.$context=void 0}init(t){this.options=t.setContext(this.getContext()),this.axis=t.axis,this._userMin=this.parse(t.min),this._userMax=this.parse(t.max),this._suggestedMin=this.parse(t.suggestedMin),this._suggestedMax=this.parse(t.suggestedMax)}parse(t,e){return t}getUserBounds(){let{_userMin:t,_userMax:e,_suggestedMin:i,_suggestedMax:s}=this;return t=r(t,Number.POSITIVE_INFINITY),e=r(e,Number.NEGATIVE_INFINITY),i=r(i,Number.POSITIVE_INFINITY),s=r(s,Number.NEGATIVE_INFINITY),{min:r(t,i),max:r(e,s),minDefined:a(t),maxDefined:a(e)}}getMinMax(t){let e,{min:i,max:s,minDefined:n,maxDefined:o}=this.getUserBounds();if(n&&o)return{min:i,max:s};const a=this.getMatchingVisibleMetas();for(let r=0,l=a.length;r<l;++r)e=a[r].controller.getMinMax(this,t),n||(i=Math.min(i,e.min)),o||(s=Math.max(s,e.max));return i=o&&i>s?s:i,s=n&&i>s?i:s,{min:r(i,r(s,i)),max:r(s,r(i,s))}}getPadding(){return{left:this.paddingLeft||0,top:this.paddingTop||0,right:this.paddingRight||0,bottom:this.paddingBottom||0}}getTicks(){return this.ticks}getLabels(){const t=this.chart.data;return this.options.labels||(this.isHorizontal()?t.xLabels:t.yLabels)||t.labels||[]}getLabelItems(t=this.chart.chartArea){return this._labelItems||(this._labelItems=this._computeLabelItems(t))}beforeLayout(){this._cache={},this._dataLimitsCached=!1}beforeUpdate(){d(this.options.beforeUpdate,[this])}update(t,e,i){const{beginAtZero:s,grace:n,ticks:o}=this.options,a=o.sampleSize;this.beforeUpdate(),this.maxWidth=t,this.maxHeight=e,this._margins=i=Object.assign({left:0,right:0,top:0,bottom:0},i),this.ticks=null,this._labelSizes=null,this._gridLineItems=null,this._labelItems=null,this.beforeSetDimensions(),this.setDimensions(),this.afterSetDimensions(),this._maxLength=this.isHorizontal()?this.width+i.left+i.right:this.height+i.top+i.bottom,this._dataLimitsCached||(this.beforeDataLimits(),this.determineDataLimits(),this.afterDataLimits(),this._range=Di(this,n,s),this._dataLimitsCached=!0),this.beforeBuildTicks(),this.ticks=this.buildTicks()||[],this.afterBuildTicks();const r=a<this.ticks.length;this._convertTicksToLabels(r?Ks(this.ticks,a):this.ticks),this.configure(),this.beforeCalculateLabelRotation(),this.calculateLabelRotation(),this.afterCalculateLabelRotation(),o.display&&(o.autoSkip||"auto"===o.source)&&(this.ticks=Ys(this,this.ticks),this._labelSizes=null,this.afterAutoSkip()),r&&this._convertTicksToLabels(this.ticks),this.beforeFit(),this.fit(),this.afterFit(),this.afterUpdate()}configure(){let t,e,i=this.options.reverse;this.isHorizontal()?(t=this.left,e=this.right):(t=this.top,e=this.bottom,i=!i),this._startPixel=t,this._endPixel=e,this._reversePixels=i,this._length=e-t,this._alignToPixels=this.options.alignToPixels}afterUpdate(){d(this.options.afterUpdate,[this])}beforeSetDimensions(){d(this.options.beforeSetDimensions,[this])}setDimensions(){this.isHorizontal()?(this.width=this.maxWidth,this.left=0,this.right=this.width):(this.height=this.maxHeight,this.top=0,this.bottom=this.height),this.paddingLeft=0,this.paddingTop=0,this.paddingRight=0,this.paddingBottom=0}afterSetDimensions(){d(this.options.afterSetDimensions,[this])}_callHooks(t){this.chart.notifyPlugins(t,this.getContext()),d(this.options[t],[this])}beforeDataLimits(){this._callHooks("beforeDataLimits")}determineDataLimits(){}afterDataLimits(){this._callHooks("afterDataLimits")}beforeBuildTicks(){this._callHooks("beforeBuildTicks")}buildTicks(){return[]}afterBuildTicks(){this._callHooks("afterBuildTicks")}beforeTickToLabelConversion(){d(this.options.beforeTickToLabelConversion,[this])}generateTickLabels(t){const e=this.options.ticks;let i,s,n;for(i=0,s=t.length;i<s;i++)n=t[i],n.label=d(e.callback,[n.value,i,t],this)}afterTickToLabelConversion(){d(this.options.afterTickToLabelConversion,[this])}beforeCalculateLabelRotation(){d(this.options.beforeCalculateLabelRotation,[this])}calculateLabelRotation(){const t=this.options,e=t.ticks,i=qs(this.ticks.length,t.ticks.maxTicksLimit),s=e.minRotation||0,n=e.maxRotation;let o,a,r,l=s;if(!this._isVisible()||!e.display||s>=n||i<=1||!this.isHorizontal())return void(this.labelRotation=s);const h=this._getLabelSizes(),c=h.widest.width,d=h.highest.height,u=Z(this.chart.width-c,0,this.maxWidth);o=t.offset?this.maxWidth/i:u/(i-1),c+6>o&&(o=u/(i-(t.offset?.5:1)),a=this.maxHeight-Js(t.grid)-e.padding-Zs(t.title,this.chart.options.font),r=Math.sqrt(c*c+d*d),l=Y(Math.min(Math.asin(Z((h.highest.height+6)/o,-1,1)),Math.asin(Z(a/r,-1,1))-Math.asin(Z(d/r,-1,1)))),l=Math.max(s,Math.min(n,l))),this.labelRotation=l}afterCalculateLabelRotation(){d(this.options.afterCalculateLabelRotation,[this])}afterAutoSkip(){}beforeFit(){d(this.options.beforeFit,[this])}fit(){const t={width:0,height:0},{chart:e,options:{ticks:i,title:s,grid:n}}=this,o=this._isVisible(),a=this.isHorizontal();if(o){const o=Zs(s,e.options.font);if(a?(t.width=this.maxWidth,t.height=Js(n)+o):(t.height=this.maxHeight,t.width=Js(n)+o),i.display&&this.ticks.length){const{first:e,last:s,widest:n,highest:o}=this._getLabelSizes(),r=2*i.padding,l=$(this.labelRotation),h=Math.cos(l),c=Math.sin(l);if(a){const e=i.mirror?0:c*n.width+h*o.height;t.height=Math.min(this.maxHeight,t.height+e+r)}else{const e=i.mirror?0:h*n.width+c*o.height;t.width=Math.min(this.maxWidth,t.width+e+r)}this._calculatePadding(e,s,c,h)}}this._handleMargins(),a?(this.width=this._length=e.width-this._margins.left-this._margins.right,this.height=t.height):(this.width=t.width,this.height=this._length=e.height-this._margins.top-this._margins.bottom)}_calculatePadding(t,e,i,s){const{ticks:{align:n,padding:o},position:a}=this.options,r=0!==this.labelRotation,l="top"!==a&&"x"===this.axis;if(this.isHorizontal()){const a=this.getPixelForTick(0)-this.left,h=this.right-this.getPixelForTick(this.ticks.length-1);let c=0,d=0;r?l?(c=s*t.width,d=i*e.height):(c=i*t.height,d=s*e.width):"start"===n?d=e.width:"end"===n?c=t.width:"inner"!==n&&(c=t.width/2,d=e.width/2),this.paddingLeft=Math.max((c-a+o)*this.width/(this.width-a),0),this.paddingRight=Math.max((d-h+o)*this.width/(this.width-h),0)}else{let i=e.height/2,s=t.height/2;"start"===n?(i=0,s=t.height):"end"===n&&(i=e.height,s=0),this.paddingTop=i+o,this.paddingBottom=s+o}}_handleMargins(){this._margins&&(this._margins.left=Math.max(this.paddingLeft,this._margins.left),this._margins.top=Math.max(this.paddingTop,this._margins.top),this._margins.right=Math.max(this.paddingRight,this._margins.right),this._margins.bottom=Math.max(this.paddingBottom,this._margins.bottom))}afterFit(){d(this.options.afterFit,[this])}isHorizontal(){const{axis:t,position:e}=this.options;return"top"===e||"bottom"===e||"x"===t}isFullSize(){return this.options.fullSize}_convertTicksToLabels(t){let e,i;for(this.beforeTickToLabelConversion(),this.generateTickLabels(t),e=0,i=t.length;e<i;e++)s(t[e].label)&&(t.splice(e,1),i--,e--);this.afterTickToLabelConversion()}_getLabelSizes(){let t=this._labelSizes;if(!t){const e=this.options.ticks.sampleSize;let i=this.ticks;e<i.length&&(i=Ks(i,e)),this._labelSizes=t=this._computeLabelSizes(i,i.length,this.options.ticks.maxTicksLimit)}return t}_computeLabelSizes(t,e,i){const{ctx:o,_longestTextCache:a}=this,r=[],l=[],h=Math.floor(e/qs(e,i));let c,d,f,g,p,m,x,b,_,y,v,M=0,w=0;for(c=0;c<e;c+=h){if(g=t[c].label,p=this._resolveTickFontOptions(c),o.font=m=p.string,x=a[m]=a[m]||{data:{},gc:[]},b=p.lineHeight,_=y=0,s(g)||n(g)){if(n(g))for(d=0,f=g.length;d<f;++d)v=g[d],s(v)||n(v)||(_=Ce(o,x.data,x.gc,_,v),y+=b)}else _=Ce(o,x.data,x.gc,_,g),y=b;r.push(_),l.push(y),M=Math.max(_,M),w=Math.max(y,w)}!function(t,e){u(t,(t=>{const i=t.gc,s=i.length/2;let n;if(s>e){for(n=0;n<s;++n)delete t.data[i[n]];i.splice(0,s)}}))}(a,e);const k=r.indexOf(M),S=l.indexOf(w),P=t=>({width:r[t]||0,height:l[t]||0});return{first:P(0),last:P(e-1),widest:P(k),highest:P(S),widths:r,heights:l}}getLabelForValue(t){return t}getPixelForValue(t,e){return NaN}getValueForPixel(t){}getPixelForTick(t){const e=this.ticks;return t<0||t>e.length-1?null:this.getPixelForValue(e[t].value)}getPixelForDecimal(t){this._reversePixels&&(t=1-t);const e=this._startPixel+t*this._length;return Q(this._alignToPixels?Ae(this.chart,e,0):e)}getDecimalForPixel(t){const e=(t-this._startPixel)/this._length;return this._reversePixels?1-e:e}getBasePixel(){return this.getPixelForValue(this.getBaseValue())}getBaseValue(){const{min:t,max:e}=this;return t<0&&e<0?e:t>0&&e>0?t:0}getContext(t){const e=this.ticks||[];if(t>=0&&t<e.length){const i=e[t];return i.$context||(i.$context=function(t,e,i){return Ci(t,{tick:i,index:e,type:"tick"})}(this.getContext(),t,i))}return this.$context||(this.$context=Ci(this.chart.getContext(),{scale:this,type:"scale"}))}_tickSize(){const t=this.options.ticks,e=$(this.labelRotation),i=Math.abs(Math.cos(e)),s=Math.abs(Math.sin(e)),n=this._getLabelSizes(),o=t.autoSkipPadding||0,a=n?n.widest.width+o:0,r=n?n.highest.height+o:0;return this.isHorizontal()?r*i>a*s?a/i:r/s:r*s<a*i?r/i:a/s}_isVisible(){const t=this.options.display;return"auto"!==t?!!t:this.getMatchingVisibleMetas().length>0}_computeGridLineItems(t){const e=this.axis,i=this.chart,s=this.options,{grid:n,position:a,border:r}=s,h=n.offset,c=this.isHorizontal(),d=this.ticks.length+(h?1:0),u=Js(n),f=[],g=r.setContext(this.getContext()),p=g.display?g.width:0,m=p/2,x=function(t){return Ae(i,t,p)};let b,_,y,v,M,w,k,S,P,D,C,O;if("top"===a)b=x(this.bottom),w=this.bottom-u,S=b-m,D=x(t.top)+m,O=t.bottom;else if("bottom"===a)b=x(this.top),D=t.top,O=x(t.bottom)-m,w=b+m,S=this.top+u;else if("left"===a)b=x(this.right),M=this.right-u,k=b-m,P=x(t.left)+m,C=t.right;else if("right"===a)b=x(this.left),P=t.left,C=x(t.right)-m,M=b+m,k=this.left+u;else if("x"===e){if("center"===a)b=x((t.top+t.bottom)/2+.5);else if(o(a)){const t=Object.keys(a)[0],e=a[t];b=x(this.chart.scales[t].getPixelForValue(e))}D=t.top,O=t.bottom,w=b+m,S=w+u}else if("y"===e){if("center"===a)b=x((t.left+t.right)/2);else if(o(a)){const t=Object.keys(a)[0],e=a[t];b=x(this.chart.scales[t].getPixelForValue(e))}M=b-m,k=M-u,P=t.left,C=t.right}const A=l(s.ticks.maxTicksLimit,d),T=Math.max(1,Math.ceil(d/A));for(_=0;_<d;_+=T){const t=this.getContext(_),e=n.setContext(t),s=r.setContext(t),o=e.lineWidth,a=e.color,l=s.dash||[],d=s.dashOffset,u=e.tickWidth,g=e.tickColor,p=e.tickBorderDash||[],m=e.tickBorderDashOffset;y=Gs(this,_,h),void 0!==y&&(v=Ae(i,y,o),c?M=k=P=C=v:w=S=D=O=v,f.push({tx1:M,ty1:w,tx2:k,ty2:S,x1:P,y1:D,x2:C,y2:O,width:o,color:a,borderDash:l,borderDashOffset:d,tickWidth:u,tickColor:g,tickBorderDash:p,tickBorderDashOffset:m}))}return this._ticksLength=d,this._borderValue=b,f}_computeLabelItems(t){const e=this.axis,i=this.options,{position:s,ticks:a}=i,r=this.isHorizontal(),l=this.ticks,{align:h,crossAlign:c,padding:d,mirror:u}=a,f=Js(i.grid),g=f+d,p=u?-d:g,m=-$(this.labelRotation),x=[];let b,_,y,v,M,w,k,S,P,D,C,O,A="middle";if("top"===s)w=this.bottom-p,k=this._getXAxisLabelAlignment();else if("bottom"===s)w=this.top+p,k=this._getXAxisLabelAlignment();else if("left"===s){const t=this._getYAxisLabelAlignment(f);k=t.textAlign,M=t.x}else if("right"===s){const t=this._getYAxisLabelAlignment(f);k=t.textAlign,M=t.x}else if("x"===e){if("center"===s)w=(t.top+t.bottom)/2+g;else if(o(s)){const t=Object.keys(s)[0],e=s[t];w=this.chart.scales[t].getPixelForValue(e)+g}k=this._getXAxisLabelAlignment()}else if("y"===e){if("center"===s)M=(t.left+t.right)/2-g;else if(o(s)){const t=Object.keys(s)[0],e=s[t];M=this.chart.scales[t].getPixelForValue(e)}k=this._getYAxisLabelAlignment(f).textAlign}"y"===e&&("start"===h?A="top":"end"===h&&(A="bottom"));const T=this._getLabelSizes();for(b=0,_=l.length;b<_;++b){y=l[b],v=y.label;const t=a.setContext(this.getContext(b));S=this.getPixelForTick(b)+a.labelOffset,P=this._resolveTickFontOptions(b),D=P.lineHeight,C=n(v)?v.length:1;const e=C/2,i=t.color,o=t.textStrokeColor,h=t.textStrokeWidth;let d,f=k;if(r?(M=S,"inner"===k&&(f=b===_-1?this.options.reverse?"left":"right":0===b?this.options.reverse?"right":"left":"center"),O="top"===s?"near"===c||0!==m?-C*D+D/2:"center"===c?-T.highest.height/2-e*D+D:-T.highest.height+D/2:"near"===c||0!==m?D/2:"center"===c?T.highest.height/2-e*D:T.highest.height-C*D,u&&(O*=-1),0===m||t.showLabelBackdrop||(M+=D/2*Math.sin(m))):(w=S,O=(1-C)*D/2),t.showLabelBackdrop){const e=ki(t.backdropPadding),i=T.heights[b],s=T.widths[b];let n=O-e.top,o=0-e.left;switch(A){case"middle":n-=i/2;break;case"bottom":n-=i}switch(k){case"center":o-=s/2;break;case"right":o-=s;break;case"inner":b===_-1?o-=s:b>0&&(o-=s/2)}d={left:o,top:n,width:s+e.width,height:i+e.height,color:t.backdropColor}}x.push({label:v,font:P,textOffset:O,options:{rotation:m,color:i,strokeColor:o,strokeWidth:h,textAlign:f,textBaseline:A,translation:[M,w],backdrop:d}})}return x}_getXAxisLabelAlignment(){const{position:t,ticks:e}=this.options;if(-$(this.labelRotation))return"top"===t?"left":"right";let i="center";return"start"===e.align?i="left":"end"===e.align?i="right":"inner"===e.align&&(i="inner"),i}_getYAxisLabelAlignment(t){const{position:e,ticks:{crossAlign:i,mirror:s,padding:n}}=this.options,o=t+n,a=this._getLabelSizes().widest.width;let r,l;return"left"===e?s?(l=this.right+n,"near"===i?r="left":"center"===i?(r="center",l+=a/2):(r="right",l+=a)):(l=this.right-o,"near"===i?r="right":"center"===i?(r="center",l-=a/2):(r="left",l=this.left)):"right"===e?s?(l=this.left+n,"near"===i?r="right":"center"===i?(r="center",l-=a/2):(r="left",l-=a)):(l=this.left+o,"near"===i?r="left":"center"===i?(r="center",l+=a/2):(r="right",l=this.right)):r="right",{textAlign:r,x:l}}_computeLabelArea(){if(this.options.ticks.mirror)return;const t=this.chart,e=this.options.position;return"left"===e||"right"===e?{top:0,left:this.left,bottom:t.height,right:this.right}:"top"===e||"bottom"===e?{top:this.top,left:0,bottom:this.bottom,right:t.width}:void 0}drawBackground(){const{ctx:t,options:{backgroundColor:e},left:i,top:s,width:n,height:o}=this;e&&(t.save(),t.fillStyle=e,t.fillRect(i,s,n,o),t.restore())}getLineWidthForValue(t){const e=this.options.grid;if(!this._isVisible()||!e.display)return 0;const i=this.ticks.findIndex((e=>e.value===t));if(i>=0){return e.setContext(this.getContext(i)).lineWidth}return 0}drawGrid(t){const e=this.options.grid,i=this.ctx,s=this._gridLineItems||(this._gridLineItems=this._computeGridLineItems(t));let n,o;const a=(t,e,s)=>{s.width&&s.color&&(i.save(),i.lineWidth=s.width,i.strokeStyle=s.color,i.setLineDash(s.borderDash||[]),i.lineDashOffset=s.borderDashOffset,i.beginPath(),i.moveTo(t.x,t.y),i.lineTo(e.x,e.y),i.stroke(),i.restore())};if(e.display)for(n=0,o=s.length;n<o;++n){const t=s[n];e.drawOnChartArea&&a({x:t.x1,y:t.y1},{x:t.x2,y:t.y2},t),e.drawTicks&&a({x:t.tx1,y:t.ty1},{x:t.tx2,y:t.ty2},{color:t.tickColor,width:t.tickWidth,borderDash:t.tickBorderDash,borderDashOffset:t.tickBorderDashOffset})}}drawBorder(){const{chart:t,ctx:e,options:{border:i,grid:s}}=this,n=i.setContext(this.getContext()),o=i.display?n.width:0;if(!o)return;const a=s.setContext(this.getContext(0)).lineWidth,r=this._borderValue;let l,h,c,d;this.isHorizontal()?(l=Ae(t,this.left,o)-o/2,h=Ae(t,this.right,a)+a/2,c=d=r):(c=Ae(t,this.top,o)-o/2,d=Ae(t,this.bottom,a)+a/2,l=h=r),e.save(),e.lineWidth=n.width,e.strokeStyle=n.color,e.beginPath(),e.moveTo(l,c),e.lineTo(h,d),e.stroke(),e.restore()}drawLabels(t){if(!this.options.ticks.display)return;const e=this.ctx,i=this._computeLabelArea();i&&Ie(e,i);const s=this.getLabelItems(t);for(const t of s){const i=t.options,s=t.font;Ne(e,t.label,0,t.textOffset,s,i)}i&&ze(e)}drawTitle(){const{ctx:t,options:{position:e,title:i,reverse:s}}=this;if(!i.display)return;const a=Si(i.font),r=ki(i.padding),l=i.align;let h=a.lineHeight/2;"bottom"===e||"center"===e||o(e)?(h+=r.bottom,n(i.text)&&(h+=a.lineHeight*(i.text.length-1))):h+=r.top;const{titleX:c,titleY:d,maxWidth:u,rotation:f}=function(t,e,i,s){const{top:n,left:a,bottom:r,right:l,chart:h}=t,{chartArea:c,scales:d}=h;let u,f,g,p=0;const m=r-n,x=l-a;if(t.isHorizontal()){if(f=ft(s,a,l),o(i)){const t=Object.keys(i)[0],s=i[t];g=d[t].getPixelForValue(s)+m-e}else g="center"===i?(c.bottom+c.top)/2+m-e:Xs(t,i,e);u=l-a}else{if(o(i)){const t=Object.keys(i)[0],s=i[t];f=d[t].getPixelForValue(s)-x+e}else f="center"===i?(c.left+c.right)/2-x+e:Xs(t,i,e);g=ft(s,r,n),p="left"===i?-E:E}return{titleX:f,titleY:g,maxWidth:u,rotation:p}}(this,h,e,l);Ne(t,i.text,0,0,a,{color:i.color,maxWidth:u,rotation:f,textAlign:Qs(l,e,s),textBaseline:"middle",translation:[c,d]})}draw(t){this._isVisible()&&(this.drawBackground(),this.drawGrid(t),this.drawBorder(),this.drawTitle(),this.drawLabels(t))}_layers(){const t=this.options,e=t.ticks&&t.ticks.z||0,i=l(t.grid&&t.grid.z,-1),s=l(t.border&&t.border.z,0);return this._isVisible()&&this.draw===tn.prototype.draw?[{z:i,draw:t=>{this.drawBackground(),this.drawGrid(t),this.drawTitle()}},{z:s,draw:()=>{this.drawBorder()}},{z:e,draw:t=>{this.drawLabels(t)}}]:[{z:e,draw:t=>{this.draw(t)}}]}getMatchingVisibleMetas(t){const e=this.chart.getSortedVisibleDatasetMetas(),i=this.axis+"AxisID",s=[];let n,o;for(n=0,o=e.length;n<o;++n){const o=e[n];o[i]!==this.id||t&&o.type!==t||s.push(o)}return s}_resolveTickFontOptions(t){return Si(this.options.ticks.setContext(this.getContext(t)).font)}_maxDigits(){const t=this._resolveTickFontOptions(0).lineHeight;return(this.isHorizontal()?this.width:this.height)/t}}class en{constructor(t,e,i){this.type=t,this.scope=e,this.override=i,this.items=Object.create(null)}isForType(t){return Object.prototype.isPrototypeOf.call(this.type.prototype,t.prototype)}register(t){const e=Object.getPrototypeOf(t);let i;(function(t){return"id"in t&&"defaults"in t})(e)&&(i=this.register(e));const s=this.items,n=t.id,o=this.scope+"."+n;if(!n)throw new Error("class does not have id: "+t);return n in s||(s[n]=t,function(t,e,i){const s=x(Object.create(null),[i?ue.get(i):{},ue.get(e),t.defaults]);ue.set(e,s),t.defaultRoutes&&function(t,e){Object.keys(e).forEach((i=>{const s=i.split("."),n=s.pop(),o=[t].concat(s).join("."),a=e[i].split("."),r=a.pop(),l=a.join(".");ue.route(o,n,l,r)}))}(e,t.defaultRoutes);t.descriptors&&ue.describe(e,t.descriptors)}(t,o,i),this.override&&ue.override(t.id,t.overrides)),o}get(t){return this.items[t]}unregister(t){const e=this.items,i=t.id,s=this.scope;i in e&&delete e[i],s&&i in ue[s]&&(delete ue[s][i],this.override&&delete re[i])}}class sn{constructor(){this.controllers=new en(js,"datasets",!0),this.elements=new en($s,"elements"),this.plugins=new en(Object,"plugins"),this.scales=new en(tn,"scales"),this._typedRegistries=[this.controllers,this.scales,this.elements]}add(...t){this._each("register",t)}remove(...t){this._each("unregister",t)}addControllers(...t){this._each("register",t,this.controllers)}addElements(...t){this._each("register",t,this.elements)}addPlugins(...t){this._each("register",t,this.plugins)}addScales(...t){this._each("register",t,this.scales)}getController(t){return this._get(t,this.controllers,"controller")}getElement(t){return this._get(t,this.elements,"element")}getPlugin(t){return this._get(t,this.plugins,"plugin")}getScale(t){return this._get(t,this.scales,"scale")}removeControllers(...t){this._each("unregister",t,this.controllers)}removeElements(...t){this._each("unregister",t,this.elements)}removePlugins(...t){this._each("unregister",t,this.plugins)}removeScales(...t){this._each("unregister",t,this.scales)}_each(t,e,i){[...e].forEach((e=>{const s=i||this._getRegistryForType(e);i||s.isForType(e)||s===this.plugins&&e.id?this._exec(t,s,e):u(e,(e=>{const s=i||this._getRegistryForType(e);this._exec(t,s,e)}))}))}_exec(t,e,i){const s=w(t);d(i["before"+s],[],i),e[t](i),d(i["after"+s],[],i)}_getRegistryForType(t){for(let e=0;e<this._typedRegistries.length;e++){const i=this._typedRegistries[e];if(i.isForType(t))return i}return this.plugins}_get(t,e,i){const s=e.get(t);if(void 0===s)throw new Error('"'+t+'" is not a registered '+i+".");return s}}var nn=new sn;class on{constructor(){this._init=void 0}notify(t,e,i,s){if("beforeInit"===e&&(this._init=this._createDescriptors(t,!0),this._notify(this._init,t,"install")),void 0===this._init)return;const n=s?this._descriptors(t).filter(s):this._descriptors(t),o=this._notify(n,t,e,i);return"afterDestroy"===e&&(this._notify(n,t,"stop"),this._notify(this._init,t,"uninstall"),this._init=void 0),o}_notify(t,e,i,s){s=s||{};for(const n of t){const t=n.plugin;if(!1===d(t[i],[e,s,n.options],t)&&s.cancelable)return!1}return!0}invalidate(){s(this._cache)||(this._oldCache=this._cache,this._cache=void 0)}_descriptors(t){if(this._cache)return this._cache;const e=this._cache=this._createDescriptors(t);return this._notifyStateChanges(t),e}_createDescriptors(t,e){const i=t&&t.config,s=l(i.options&&i.options.plugins,{}),n=function(t){const e={},i=[],s=Object.keys(nn.plugins.items);for(let t=0;t<s.length;t++)i.push(nn.getPlugin(s[t]));const n=t.plugins||[];for(let t=0;t<n.length;t++){const s=n[t];-1===i.indexOf(s)&&(i.push(s),e[s.id]=!0)}return{plugins:i,localIds:e}}(i);return!1!==s||e?function(t,{plugins:e,localIds:i},s,n){const o=[],a=t.getContext();for(const r of e){const e=r.id,l=an(s[e],n);null!==l&&o.push({plugin:r,options:rn(t.config,{plugin:r,local:i[e]},l,a)})}return o}(t,n,s,e):[]}_notifyStateChanges(t){const e=this._oldCache||[],i=this._cache,s=(t,e)=>t.filter((t=>!e.some((e=>t.plugin.id===e.plugin.id))));this._notify(s(e,i),t,"stop"),this._notify(s(i,e),t,"start")}}function an(t,e){return e||!1!==t?!0===t?{}:t:null}function rn(t,{plugin:e,local:i},s,n){const o=t.pluginScopeKeys(e),a=t.getOptionScopes(s,o);return i&&e.defaults&&a.push(e.defaults),t.createResolver(a,n,[""],{scriptable:!1,indexable:!1,allKeys:!0})}function ln(t,e){const i=ue.datasets[t]||{};return((e.datasets||{})[t]||{}).indexAxis||e.indexAxis||i.indexAxis||"x"}function hn(t){if("x"===t||"y"===t||"r"===t)return t}function cn(t,...e){if(hn(t))return t;for(const s of e){const e=s.axis||("top"===(i=s.position)||"bottom"===i?"x":"left"===i||"right"===i?"y":void 0)||t.length>1&&hn(t[0].toLowerCase());if(e)return e}var i;throw new Error(`Cannot determine type of '${t}' axis. Please provide 'axis' or 'position' option.`)}function dn(t,e,i){if(i[e+"AxisID"]===t)return{axis:e}}function un(t,e){const i=re[t.type]||{scales:{}},s=e.scales||{},n=ln(t.type,e),a=Object.create(null);return Object.keys(s).forEach((e=>{const r=s[e];if(!o(r))return console.error(`Invalid scale configuration for scale: ${e}`);if(r._proxy)return console.warn(`Ignoring resolver passed as options for scale: ${e}`);const l=cn(e,r,function(t,e){if(e.data&&e.data.datasets){const i=e.data.datasets.filter((e=>e.xAxisID===t||e.yAxisID===t));if(i.length)return dn(t,"x",i[0])||dn(t,"y",i[0])}return{}}(e,t),ue.scales[r.type]),h=function(t,e){return t===e?"_index_":"_value_"}(l,n),c=i.scales||{};a[e]=b(Object.create(null),[{axis:l},r,c[l],c[h]])})),t.data.datasets.forEach((i=>{const n=i.type||t.type,o=i.indexAxis||ln(n,e),r=(re[n]||{}).scales||{};Object.keys(r).forEach((t=>{const e=function(t,e){let i=t;return"_index_"===t?i=e:"_value_"===t&&(i="x"===e?"y":"x"),i}(t,o),n=i[e+"AxisID"]||e;a[n]=a[n]||Object.create(null),b(a[n],[{axis:e},s[n],r[t]])}))})),Object.keys(a).forEach((t=>{const e=a[t];b(e,[ue.scales[e.type],ue.scale])})),a}function fn(t){const e=t.options||(t.options={});e.plugins=l(e.plugins,{}),e.scales=un(t,e)}function gn(t){return(t=t||{}).datasets=t.datasets||[],t.labels=t.labels||[],t}const pn=new Map,mn=new Set;function xn(t,e){let i=pn.get(t);return i||(i=e(),pn.set(t,i),mn.add(i)),i}const bn=(t,e,i)=>{const s=M(e,i);void 0!==s&&t.add(s)};class _n{constructor(t){this._config=function(t){return(t=t||{}).data=gn(t.data),fn(t),t}(t),this._scopeCache=new Map,this._resolverCache=new Map}get platform(){return this._config.platform}get type(){return this._config.type}set type(t){this._config.type=t}get data(){return this._config.data}set data(t){this._config.data=gn(t)}get options(){return this._config.options}set options(t){this._config.options=t}get plugins(){return this._config.plugins}update(){const t=this._config;this.clearCache(),fn(t)}clearCache(){this._scopeCache.clear(),this._resolverCache.clear()}datasetScopeKeys(t){return xn(t,(()=>[[`datasets.${t}`,""]]))}datasetAnimationScopeKeys(t,e){return xn(`${t}.transition.${e}`,(()=>[[`datasets.${t}.transitions.${e}`,`transitions.${e}`],[`datasets.${t}`,""]]))}datasetElementScopeKeys(t,e){return xn(`${t}-${e}`,(()=>[[`datasets.${t}.elements.${e}`,`datasets.${t}`,`elements.${e}`,""]]))}pluginScopeKeys(t){const e=t.id;return xn(`${this.type}-plugin-${e}`,(()=>[[`plugins.${e}`,...t.additionalOptionScopes||[]]]))}_cachedScopes(t,e){const i=this._scopeCache;let s=i.get(t);return s&&!e||(s=new Map,i.set(t,s)),s}getOptionScopes(t,e,i){const{options:s,type:n}=this,o=this._cachedScopes(t,i),a=o.get(e);if(a)return a;const r=new Set;e.forEach((e=>{t&&(r.add(t),e.forEach((e=>bn(r,t,e)))),e.forEach((t=>bn(r,s,t))),e.forEach((t=>bn(r,re[n]||{},t))),e.forEach((t=>bn(r,ue,t))),e.forEach((t=>bn(r,le,t)))}));const l=Array.from(r);return 0===l.length&&l.push(Object.create(null)),mn.has(e)&&o.set(e,l),l}chartOptionScopes(){const{options:t,type:e}=this;return[t,re[e]||{},ue.datasets[e]||{},{type:e},ue,le]}resolveNamedOptions(t,e,i,s=[""]){const o={$shared:!0},{resolver:a,subPrefixes:r}=yn(this._resolverCache,t,s);let l=a;if(function(t,e){const{isScriptable:i,isIndexable:s}=Ye(t);for(const o of e){const e=i(o),a=s(o),r=(a||e)&&t[o];if(e&&(S(r)||vn(r))||a&&n(r))return!0}return!1}(a,e)){o.$shared=!1;l=$e(a,i=S(i)?i():i,this.createResolver(t,i,r))}for(const t of e)o[t]=l[t];return o}createResolver(t,e,i=[""],s){const{resolver:n}=yn(this._resolverCache,t,i);return o(e)?$e(n,e,void 0,s):n}}function yn(t,e,i){let s=t.get(e);s||(s=new Map,t.set(e,s));const n=i.join();let o=s.get(n);if(!o){o={resolver:je(e,i),subPrefixes:i.filter((t=>!t.toLowerCase().includes("hover")))},s.set(n,o)}return o}const vn=t=>o(t)&&Object.getOwnPropertyNames(t).some((e=>S(t[e])));const Mn=["top","bottom","left","right","chartArea"];function wn(t,e){return"top"===t||"bottom"===t||-1===Mn.indexOf(t)&&"x"===e}function kn(t,e){return function(i,s){return i[t]===s[t]?i[e]-s[e]:i[t]-s[t]}}function Sn(t){const e=t.chart,i=e.options.animation;e.notifyPlugins("afterRender"),d(i&&i.onComplete,[t],e)}function Pn(t){const e=t.chart,i=e.options.animation;d(i&&i.onProgress,[t],e)}function Dn(t){return fe()&&"string"==typeof t?t=document.getElementById(t):t&&t.length&&(t=t[0]),t&&t.canvas&&(t=t.canvas),t}const Cn={},On=t=>{const e=Dn(t);return Object.values(Cn).filter((t=>t.canvas===e)).pop()};function An(t,e,i){const s=Object.keys(t);for(const n of s){const s=+n;if(s>=e){const o=t[n];delete t[n],(i>0||s>e)&&(t[s+i]=o)}}}class Tn{static defaults=ue;static instances=Cn;static overrides=re;static registry=nn;static version="4.5.1";static getChart=On;static register(...t){nn.add(...t),Ln()}static unregister(...t){nn.remove(...t),Ln()}constructor(t,e){const s=this.config=new _n(e),n=Dn(t),o=On(n);if(o)throw new Error("Canvas is already in use. Chart with ID '"+o.id+"' must be destroyed before the canvas with ID '"+o.canvas.id+"' can be reused.");const a=s.createResolver(s.chartOptionScopes(),this.getContext());this.platform=new(s.platform||Ps(n)),this.platform.updateConfig(s);const r=this.platform.acquireContext(n,a.aspectRatio),l=r&&r.canvas,h=l&&l.height,c=l&&l.width;this.id=i(),this.ctx=r,this.canvas=l,this.width=c,this.height=h,this._options=a,this._aspectRatio=this.aspectRatio,this._layers=[],this._metasets=[],this._stacks=void 0,this.boxes=[],this.currentDevicePixelRatio=void 0,this.chartArea=void 0,this._active=[],this._lastEvent=void 0,this._listeners={},this._responsiveListeners=void 0,this._sortedMetasets=[],this.scales={},this._plugins=new on,this.$proxies={},this._hiddenIndices={},this.attached=!1,this._animationsDisabled=void 0,this.$context=void 0,this._doResize=dt((t=>this.update(t)),a.resizeDelay||0),this._dataChanges=[],Cn[this.id]=this,r&&l?(bt.listen(this,"complete",Sn),bt.listen(this,"progress",Pn),this._initialize(),this.attached&&this.update()):console.error("Failed to create chart: can't acquire context from the given item")}get aspectRatio(){const{options:{aspectRatio:t,maintainAspectRatio:e},width:i,height:n,_aspectRatio:o}=this;return s(t)?e&&o?o:n?i/n:null:t}get data(){return this.config.data}set data(t){this.config.data=t}get options(){return this._options}set options(t){this.config.options=t}get registry(){return nn}_initialize(){return this.notifyPlugins("beforeInit"),this.options.responsive?this.resize():ke(this,this.options.devicePixelRatio),this.bindEvents(),this.notifyPlugins("afterInit"),this}clear(){return Te(this.canvas,this.ctx),this}stop(){return bt.stop(this),this}resize(t,e){bt.running(this)?this._resizeBeforeDraw={width:t,height:e}:this._resize(t,e)}_resize(t,e){const i=this.options,s=this.canvas,n=i.maintainAspectRatio&&this.aspectRatio,o=this.platform.getMaximumSize(s,t,e,n),a=i.devicePixelRatio||this.platform.getDevicePixelRatio(),r=this.width?"resize":"attach";this.width=o.width,this.height=o.height,this._aspectRatio=this.aspectRatio,ke(this,a,!0)&&(this.notifyPlugins("resize",{size:o}),d(i.onResize,[this,o],this),this.attached&&this._doResize(r)&&this.render())}ensureScalesHaveIDs(){u(this.options.scales||{},((t,e)=>{t.id=e}))}buildOrUpdateScales(){const t=this.options,e=t.scales,i=this.scales,s=Object.keys(i).reduce(((t,e)=>(t[e]=!1,t)),{});let n=[];e&&(n=n.concat(Object.keys(e).map((t=>{const i=e[t],s=cn(t,i),n="r"===s,o="x"===s;return{options:i,dposition:n?"chartArea":o?"bottom":"left",dtype:n?"radialLinear":o?"category":"linear"}})))),u(n,(e=>{const n=e.options,o=n.id,a=cn(o,n),r=l(n.type,e.dtype);void 0!==n.position&&wn(n.position,a)===wn(e.dposition)||(n.position=e.dposition),s[o]=!0;let h=null;if(o in i&&i[o].type===r)h=i[o];else{h=new(nn.getScale(r))({id:o,type:r,ctx:this.ctx,chart:this}),i[h.id]=h}h.init(n,t)})),u(s,((t,e)=>{t||delete i[e]})),u(i,(t=>{ls.configure(this,t,t.options),ls.addBox(this,t)}))}_updateMetasets(){const t=this._metasets,e=this.data.datasets.length,i=t.length;if(t.sort(((t,e)=>t.index-e.index)),i>e){for(let t=e;t<i;++t)this._destroyDatasetMeta(t);t.splice(e,i-e)}this._sortedMetasets=t.slice(0).sort(kn("order","index"))}_removeUnreferencedMetasets(){const{_metasets:t,data:{datasets:e}}=this;t.length>e.length&&delete this._stacks,t.forEach(((t,i)=>{0===e.filter((e=>e===t._dataset)).length&&this._destroyDatasetMeta(i)}))}buildOrUpdateControllers(){const t=[],e=this.data.datasets;let i,s;for(this._removeUnreferencedMetasets(),i=0,s=e.length;i<s;i++){const s=e[i];let n=this.getDatasetMeta(i);const o=s.type||this.config.type;if(n.type&&n.type!==o&&(this._destroyDatasetMeta(i),n=this.getDatasetMeta(i)),n.type=o,n.indexAxis=s.indexAxis||ln(o,this.options),n.order=s.order||0,n.index=i,n.label=""+s.label,n.visible=this.isDatasetVisible(i),n.controller)n.controller.updateIndex(i),n.controller.linkScales();else{const e=nn.getController(o),{datasetElementType:s,dataElementType:a}=ue.datasets[o];Object.assign(e,{dataElementType:nn.getElement(a),datasetElementType:s&&nn.getElement(s)}),n.controller=new e(this,i),t.push(n.controller)}}return this._updateMetasets(),t}_resetElements(){u(this.data.datasets,((t,e)=>{this.getDatasetMeta(e).controller.reset()}),this)}reset(){this._resetElements(),this.notifyPlugins("reset")}update(t){const e=this.config;e.update();const i=this._options=e.createResolver(e.chartOptionScopes(),this.getContext()),s=this._animationsDisabled=!i.animation;if(this._updateScales(),this._checkEventBindings(),this._updateHiddenIndices(),this._plugins.invalidate(),!1===this.notifyPlugins("beforeUpdate",{mode:t,cancelable:!0}))return;const n=this.buildOrUpdateControllers();this.notifyPlugins("beforeElementsUpdate");let o=0;for(let t=0,e=this.data.datasets.length;t<e;t++){const{controller:e}=this.getDatasetMeta(t),i=!s&&-1===n.indexOf(e);e.buildOrUpdateElements(i),o=Math.max(+e.getMaxOverflow(),o)}o=this._minPadding=i.layout.autoPadding?o:0,this._updateLayout(o),s||u(n,(t=>{t.reset()})),this._updateDatasets(t),this.notifyPlugins("afterUpdate",{mode:t}),this._layers.sort(kn("z","_idx"));const{_active:a,_lastEvent:r}=this;r?this._eventHandler(r,!0):a.length&&this._updateHoverStyles(a,a,!0),this.render()}_updateScales(){u(this.scales,(t=>{ls.removeBox(this,t)})),this.ensureScalesHaveIDs(),this.buildOrUpdateScales()}_checkEventBindings(){const t=this.options,e=new Set(Object.keys(this._listeners)),i=new Set(t.events);P(e,i)&&!!this._responsiveListeners===t.responsive||(this.unbindEvents(),this.bindEvents())}_updateHiddenIndices(){const{_hiddenIndices:t}=this,e=this._getUniformDataChanges()||[];for(const{method:i,start:s,count:n}of e){An(t,s,"_removeElements"===i?-n:n)}}_getUniformDataChanges(){const t=this._dataChanges;if(!t||!t.length)return;this._dataChanges=[];const e=this.data.datasets.length,i=e=>new Set(t.filter((t=>t[0]===e)).map(((t,e)=>e+","+t.splice(1).join(",")))),s=i(0);for(let t=1;t<e;t++)if(!P(s,i(t)))return;return Array.from(s).map((t=>t.split(","))).map((t=>({method:t[1],start:+t[2],count:+t[3]})))}_updateLayout(t){if(!1===this.notifyPlugins("beforeLayout",{cancelable:!0}))return;ls.update(this,this.width,this.height,t);const e=this.chartArea,i=e.width<=0||e.height<=0;this._layers=[],u(this.boxes,(t=>{i&&"chartArea"===t.position||(t.configure&&t.configure(),this._layers.push(...t._layers()))}),this),this._layers.forEach(((t,e)=>{t._idx=e})),this.notifyPlugins("afterLayout")}_updateDatasets(t){if(!1!==this.notifyPlugins("beforeDatasetsUpdate",{mode:t,cancelable:!0})){for(let t=0,e=this.data.datasets.length;t<e;++t)this.getDatasetMeta(t).controller.configure();for(let e=0,i=this.data.datasets.length;e<i;++e)this._updateDataset(e,S(t)?t({datasetIndex:e}):t);this.notifyPlugins("afterDatasetsUpdate",{mode:t})}}_updateDataset(t,e){const i=this.getDatasetMeta(t),s={meta:i,index:t,mode:e,cancelable:!0};!1!==this.notifyPlugins("beforeDatasetUpdate",s)&&(i.controller._update(e),s.cancelable=!1,this.notifyPlugins("afterDatasetUpdate",s))}render(){!1!==this.notifyPlugins("beforeRender",{cancelable:!0})&&(bt.has(this)?this.attached&&!bt.running(this)&&bt.start(this):(this.draw(),Sn({chart:this})))}draw(){let t;if(this._resizeBeforeDraw){const{width:t,height:e}=this._resizeBeforeDraw;this._resizeBeforeDraw=null,this._resize(t,e)}if(this.clear(),this.width<=0||this.height<=0)return;if(!1===this.notifyPlugins("beforeDraw",{cancelable:!0}))return;const e=this._layers;for(t=0;t<e.length&&e[t].z<=0;++t)e[t].draw(this.chartArea);for(this._drawDatasets();t<e.length;++t)e[t].draw(this.chartArea);this.notifyPlugins("afterDraw")}_getSortedDatasetMetas(t){const e=this._sortedMetasets,i=[];let s,n;for(s=0,n=e.length;s<n;++s){const n=e[s];t&&!n.visible||i.push(n)}return i}getSortedVisibleDatasetMetas(){return this._getSortedDatasetMetas(!0)}_drawDatasets(){if(!1===this.notifyPlugins("beforeDatasetsDraw",{cancelable:!0}))return;const t=this.getSortedVisibleDatasetMetas();for(let e=t.length-1;e>=0;--e)this._drawDataset(t[e]);this.notifyPlugins("afterDatasetsDraw")}_drawDataset(t){const e=this.ctx,i={meta:t,index:t.index,cancelable:!0},s=Ni(this,t);!1!==this.notifyPlugins("beforeDatasetDraw",i)&&(s&&Ie(e,s),t.controller.draw(),s&&ze(e),i.cancelable=!1,this.notifyPlugins("afterDatasetDraw",i))}isPointInArea(t){return Re(t,this.chartArea,this._minPadding)}getElementsAtEventForMode(t,e,i,s){const n=Ki.modes[e];return"function"==typeof n?n(this,t,i,s):[]}getDatasetMeta(t){const e=this.data.datasets[t],i=this._metasets;let s=i.filter((t=>t&&t._dataset===e)).pop();return s||(s={type:null,data:[],dataset:null,controller:null,hidden:null,xAxisID:null,yAxisID:null,order:e&&e.order||0,index:t,_dataset:e,_parsed:[],_sorted:!1},i.push(s)),s}getContext(){return this.$context||(this.$context=Ci(null,{chart:this,type:"chart"}))}getVisibleDatasetCount(){return this.getSortedVisibleDatasetMetas().length}isDatasetVisible(t){const e=this.data.datasets[t];if(!e)return!1;const i=this.getDatasetMeta(t);return"boolean"==typeof i.hidden?!i.hidden:!e.hidden}setDatasetVisibility(t,e){this.getDatasetMeta(t).hidden=!e}toggleDataVisibility(t){this._hiddenIndices[t]=!this._hiddenIndices[t]}getDataVisibility(t){return!this._hiddenIndices[t]}_updateVisibility(t,e,i){const s=i?"show":"hide",n=this.getDatasetMeta(t),o=n.controller._resolveAnimations(void 0,s);k(e)?(n.data[e].hidden=!i,this.update()):(this.setDatasetVisibility(t,i),o.update(n,{visible:i}),this.update((e=>e.datasetIndex===t?s:void 0)))}hide(t,e){this._updateVisibility(t,e,!1)}show(t,e){this._updateVisibility(t,e,!0)}_destroyDatasetMeta(t){const e=this._metasets[t];e&&e.controller&&e.controller._destroy(),delete this._metasets[t]}_stop(){let t,e;for(this.stop(),bt.remove(this),t=0,e=this.data.datasets.length;t<e;++t)this._destroyDatasetMeta(t)}destroy(){this.notifyPlugins("beforeDestroy");const{canvas:t,ctx:e}=this;this._stop(),this.config.clearCache(),t&&(this.unbindEvents(),Te(t,e),this.platform.releaseContext(e),this.canvas=null,this.ctx=null),delete Cn[this.id],this.notifyPlugins("afterDestroy")}toBase64Image(...t){return this.canvas.toDataURL(...t)}bindEvents(){this.bindUserEvents(),this.options.responsive?this.bindResponsiveEvents():this.attached=!0}bindUserEvents(){const t=this._listeners,e=this.platform,i=(i,s)=>{e.addEventListener(this,i,s),t[i]=s},s=(t,e,i)=>{t.offsetX=e,t.offsetY=i,this._eventHandler(t)};u(this.options.events,(t=>i(t,s)))}bindResponsiveEvents(){this._responsiveListeners||(this._responsiveListeners={});const t=this._responsiveListeners,e=this.platform,i=(i,s)=>{e.addEventListener(this,i,s),t[i]=s},s=(i,s)=>{t[i]&&(e.removeEventListener(this,i,s),delete t[i])},n=(t,e)=>{this.canvas&&this.resize(t,e)};let o;const a=()=>{s("attach",a),this.attached=!0,this.resize(),i("resize",n),i("detach",o)};o=()=>{this.attached=!1,s("resize",n),this._stop(),this._resize(0,0),i("attach",a)},e.isAttached(this.canvas)?a():o()}unbindEvents(){u(this._listeners,((t,e)=>{this.platform.removeEventListener(this,e,t)})),this._listeners={},u(this._responsiveListeners,((t,e)=>{this.platform.removeEventListener(this,e,t)})),this._responsiveListeners=void 0}updateHoverStyle(t,e,i){const s=i?"set":"remove";let n,o,a,r;for("dataset"===e&&(n=this.getDatasetMeta(t[0].datasetIndex),n.controller["_"+s+"DatasetHoverStyle"]()),a=0,r=t.length;a<r;++a){o=t[a];const e=o&&this.getDatasetMeta(o.datasetIndex).controller;e&&e[s+"HoverStyle"](o.element,o.datasetIndex,o.index)}}getActiveElements(){return this._active||[]}setActiveElements(t){const e=this._active||[],i=t.map((({datasetIndex:t,index:e})=>{const i=this.getDatasetMeta(t);if(!i)throw new Error("No dataset found at index "+t);return{datasetIndex:t,element:i.data[e],index:e}}));!f(i,e)&&(this._active=i,this._lastEvent=null,this._updateHoverStyles(i,e))}notifyPlugins(t,e,i){return this._plugins.notify(this,t,e,i)}isPluginEnabled(t){return 1===this._plugins._cache.filter((e=>e.plugin.id===t)).length}_updateHoverStyles(t,e,i){const s=this.options.hover,n=(t,e)=>t.filter((t=>!e.some((e=>t.datasetIndex===e.datasetIndex&&t.index===e.index)))),o=n(e,t),a=i?t:n(t,e);o.length&&this.updateHoverStyle(o,s.mode,!1),a.length&&s.mode&&this.updateHoverStyle(a,s.mode,!0)}_eventHandler(t,e){const i={event:t,replay:e,cancelable:!0,inChartArea:this.isPointInArea(t)},s=e=>(e.options.events||this.options.events).includes(t.native.type);if(!1===this.notifyPlugins("beforeEvent",i,s))return;const n=this._handleEvent(t,e,i.inChartArea);return i.cancelable=!1,this.notifyPlugins("afterEvent",i,s),(n||i.changed)&&this.render(),this}_handleEvent(t,e,i){const{_active:s=[],options:n}=this,o=e,a=this._getActiveElements(t,s,i,o),r=D(t),l=function(t,e,i,s){return i&&"mouseout"!==t.type?s?e:t:null}(t,this._lastEvent,i,r);i&&(this._lastEvent=null,d(n.onHover,[t,a,this],this),r&&d(n.onClick,[t,a,this],this));const h=!f(a,s);return(h||e)&&(this._active=a,this._updateHoverStyles(a,s,e)),this._lastEvent=l,h}_getActiveElements(t,e,i,s){if("mouseout"===t.type)return[];if(!i)return e;const n=this.options.hover;return this.getElementsAtEventForMode(t,n.mode,n,s)}}function Ln(){return u(Tn.instances,(t=>t._plugins.invalidate()))}function En(){throw new Error("This method is not implemented: Check that a complete date adapter is provided.")}class Rn{static override(t){Object.assign(Rn.prototype,t)}options;constructor(t){this.options=t||{}}init(){}formats(){return En()}parse(){return En()}format(){return En()}add(){return En()}diff(){return En()}startOf(){return En()}endOf(){return En()}}var In={_date:Rn};function zn(t){const e=t.iScale,i=function(t,e){if(!t._cache.$bar){const i=t.getMatchingVisibleMetas(e);let s=[];for(let e=0,n=i.length;e<n;e++)s=s.concat(i[e].controller.getAllParsedValues(t));t._cache.$bar=lt(s.sort(((t,e)=>t-e)))}return t._cache.$bar}(e,t.type);let s,n,o,a,r=e._length;const l=()=>{32767!==o&&-32768!==o&&(k(a)&&(r=Math.min(r,Math.abs(o-a)||r)),a=o)};for(s=0,n=i.length;s<n;++s)o=e.getPixelForValue(i[s]),l();for(a=void 0,s=0,n=e.ticks.length;s<n;++s)o=e.getPixelForTick(s),l();return r}function Fn(t,e,i,s){return n(t)?function(t,e,i,s){const n=i.parse(t[0],s),o=i.parse(t[1],s),a=Math.min(n,o),r=Math.max(n,o);let l=a,h=r;Math.abs(a)>Math.abs(r)&&(l=r,h=a),e[i.axis]=h,e._custom={barStart:l,barEnd:h,start:n,end:o,min:a,max:r}}(t,e,i,s):e[i.axis]=i.parse(t,s),e}function Vn(t,e,i,s){const n=t.iScale,o=t.vScale,a=n.getLabels(),r=n===o,l=[];let h,c,d,u;for(h=i,c=i+s;h<c;++h)u=e[h],d={},d[n.axis]=r||n.parse(a[h],h),l.push(Fn(u,d,o,h));return l}function Bn(t){return t&&void 0!==t.barStart&&void 0!==t.barEnd}function Wn(t,e,i,s){let n=e.borderSkipped;const o={};if(!n)return void(t.borderSkipped=o);if(!0===n)return void(t.borderSkipped={top:!0,right:!0,bottom:!0,left:!0});const{start:a,end:r,reverse:l,top:h,bottom:c}=function(t){let e,i,s,n,o;return t.horizontal?(e=t.base>t.x,i="left",s="right"):(e=t.base<t.y,i="bottom",s="top"),e?(n="end",o="start"):(n="start",o="end"),{start:i,end:s,reverse:e,top:n,bottom:o}}(t);"middle"===n&&i&&(t.enableBorderRadius=!0,(i._top||0)===s?n=h:(i._bottom||0)===s?n=c:(o[Nn(c,a,r,l)]=!0,n=h)),o[Nn(n,a,r,l)]=!0,t.borderSkipped=o}function Nn(t,e,i,s){var n,o,a;return s?(a=i,t=Hn(t=(n=t)===(o=e)?a:n===a?o:n,i,e)):t=Hn(t,e,i),t}function Hn(t,e,i){return"start"===t?e:"end"===t?i:t}function jn(t,{inflateAmount:e},i){t.inflateAmount="auto"===e?1===i?.33:0:e}class $n extends js{static id="doughnut";static defaults={datasetElementType:!1,dataElementType:"arc",animation:{animateRotate:!0,animateScale:!1},animations:{numbers:{type:"number",properties:["circumference","endAngle","innerRadius","outerRadius","startAngle","x","y","offset","borderWidth","spacing"]}},cutout:"50%",rotation:0,circumference:360,radius:"100%",spacing:0,indexAxis:"r"};static descriptors={_scriptable:t=>"spacing"!==t,_indexable:t=>"spacing"!==t&&!t.startsWith("borderDash")&&!t.startsWith("hoverBorderDash")};static overrides={aspectRatio:1,plugins:{legend:{labels:{generateLabels(t){const e=t.data,{labels:{pointStyle:i,textAlign:s,color:n,useBorderRadius:o,borderRadius:a}}=t.legend.options;return e.labels.length&&e.datasets.length?e.labels.map(((e,r)=>{const l=t.getDatasetMeta(0).controller.getStyle(r);return{text:e,fillStyle:l.backgroundColor,fontColor:n,hidden:!t.getDataVisibility(r),lineDash:l.borderDash,lineDashOffset:l.borderDashOffset,lineJoin:l.borderJoinStyle,lineWidth:l.borderWidth,strokeStyle:l.borderColor,textAlign:s,pointStyle:i,borderRadius:o&&(a||l.borderRadius),index:r}})):[]}},onClick(t,e,i){i.chart.toggleDataVisibility(e.index),i.chart.update()}}}};constructor(t,e){super(t,e),this.enableOptionSharing=!0,this.innerRadius=void 0,this.outerRadius=void 0,this.offsetX=void 0,this.offsetY=void 0}linkScales(){}parse(t,e){const i=this.getDataset().data,s=this._cachedMeta;if(!1===this._parsing)s._parsed=i;else{let n,a,r=t=>+i[t];if(o(i[t])){const{key:t="value"}=this._parsing;r=e=>+M(i[e],t)}for(n=t,a=t+e;n<a;++n)s._parsed[n]=r(n)}}_getRotation(){return $(this.options.rotation-90)}_getCircumference(){return $(this.options.circumference)}_getRotationExtents(){let t=O,e=-O;for(let i=0;i<this.chart.data.datasets.length;++i)if(this.chart.isDatasetVisible(i)&&this.chart.getDatasetMeta(i).type===this._type){const s=this.chart.getDatasetMeta(i).controller,n=s._getRotation(),o=s._getCircumference();t=Math.min(t,n),e=Math.max(e,n+o)}return{rotation:t,circumference:e-t}}update(t){const e=this.chart,{chartArea:i}=e,s=this._cachedMeta,n=s.data,o=this.getMaxBorderWidth()+this.getMaxOffset(n)+this.options.spacing,a=Math.max((Math.min(i.width,i.height)-o)/2,0),r=Math.min(h(this.options.cutout,a),1),l=this._getRingWeight(this.index),{circumference:d,rotation:u}=this._getRotationExtents(),{ratioX:f,ratioY:g,offsetX:p,offsetY:m}=function(t,e,i){let s=1,n=1,o=0,a=0;if(e<O){const r=t,l=r+e,h=Math.cos(r),c=Math.sin(r),d=Math.cos(l),u=Math.sin(l),f=(t,e,s)=>J(t,r,l,!0)?1:Math.max(e,e*i,s,s*i),g=(t,e,s)=>J(t,r,l,!0)?-1:Math.min(e,e*i,s,s*i),p=f(0,h,d),m=f(E,c,u),x=g(C,h,d),b=g(C+E,c,u);s=(p-x)/2,n=(m-b)/2,o=-(p+x)/2,a=-(m+b)/2}return{ratioX:s,ratioY:n,offsetX:o,offsetY:a}}(u,d,r),x=(i.width-o)/f,b=(i.height-o)/g,_=Math.max(Math.min(x,b)/2,0),y=c(this.options.radius,_),v=(y-Math.max(y*r,0))/this._getVisibleDatasetWeightTotal();this.offsetX=p*y,this.offsetY=m*y,s.total=this.calculateTotal(),this.outerRadius=y-v*this._getRingWeightOffset(this.index),this.innerRadius=Math.max(this.outerRadius-v*l,0),this.updateElements(n,0,n.length,t)}_circumference(t,e){const i=this.options,s=this._cachedMeta,n=this._getCircumference();return e&&i.animation.animateRotate||!this.chart.getDataVisibility(t)||null===s._parsed[t]||s.data[t].hidden?0:this.calculateCircumference(s._parsed[t]*n/O)}updateElements(t,e,i,s){const n="reset"===s,o=this.chart,a=o.chartArea,r=o.options.animation,l=(a.left+a.right)/2,h=(a.top+a.bottom)/2,c=n&&r.animateScale,d=c?0:this.innerRadius,u=c?0:this.outerRadius,{sharedOptions:f,includeOptions:g}=this._getSharedOptions(e,s);let p,m=this._getRotation();for(p=0;p<e;++p)m+=this._circumference(p,n);for(p=e;p<e+i;++p){const e=this._circumference(p,n),i=t[p],o={x:l+this.offsetX,y:h+this.offsetY,startAngle:m,endAngle:m+e,circumference:e,outerRadius:u,innerRadius:d};g&&(o.options=f||this.resolveDataElementOptions(p,i.active?"active":s)),m+=e,this.updateElement(i,p,o,s)}}calculateTotal(){const t=this._cachedMeta,e=t.data;let i,s=0;for(i=0;i<e.length;i++){const n=t._parsed[i];null===n||isNaN(n)||!this.chart.getDataVisibility(i)||e[i].hidden||(s+=Math.abs(n))}return s}calculateCircumference(t){const e=this._cachedMeta.total;return e>0&&!isNaN(t)?O*(Math.abs(t)/e):0}getLabelAndValue(t){const e=this._cachedMeta,i=this.chart,s=i.data.labels||[],n=ne(e._parsed[t],i.options.locale);return{label:s[t]||"",value:n}}getMaxBorderWidth(t){let e=0;const i=this.chart;let s,n,o,a,r;if(!t)for(s=0,n=i.data.datasets.length;s<n;++s)if(i.isDatasetVisible(s)){o=i.getDatasetMeta(s),t=o.data,a=o.controller;break}if(!t)return 0;for(s=0,n=t.length;s<n;++s)r=a.resolveDataElementOptions(s),"inner"!==r.borderAlign&&(e=Math.max(e,r.borderWidth||0,r.hoverBorderWidth||0));return e}getMaxOffset(t){let e=0;for(let i=0,s=t.length;i<s;++i){const t=this.resolveDataElementOptions(i);e=Math.max(e,t.offset||0,t.hoverOffset||0)}return e}_getRingWeightOffset(t){let e=0;for(let i=0;i<t;++i)this.chart.isDatasetVisible(i)&&(e+=this._getRingWeight(i));return e}_getRingWeight(t){return Math.max(l(this.chart.data.datasets[t].weight,1),0)}_getVisibleDatasetWeightTotal(){return this._getRingWeightOffset(this.chart.data.datasets.length)||1}}class Yn extends js{static id="polarArea";static defaults={dataElementType:"arc",animation:{animateRotate:!0,animateScale:!0},animations:{numbers:{type:"number",properties:["x","y","startAngle","endAngle","innerRadius","outerRadius"]}},indexAxis:"r",startAngle:0};static overrides={aspectRatio:1,plugins:{legend:{labels:{generateLabels(t){const e=t.data;if(e.labels.length&&e.datasets.length){const{labels:{pointStyle:i,color:s}}=t.legend.options;return e.labels.map(((e,n)=>{const o=t.getDatasetMeta(0).controller.getStyle(n);return{text:e,fillStyle:o.backgroundColor,strokeStyle:o.borderColor,fontColor:s,lineWidth:o.borderWidth,pointStyle:i,hidden:!t.getDataVisibility(n),index:n}}))}return[]}},onClick(t,e,i){i.chart.toggleDataVisibility(e.index),i.chart.update()}}},scales:{r:{type:"radialLinear",angleLines:{display:!1},beginAtZero:!0,grid:{circular:!0},pointLabels:{display:!1},startAngle:0}}};constructor(t,e){super(t,e),this.innerRadius=void 0,this.outerRadius=void 0}getLabelAndValue(t){const e=this._cachedMeta,i=this.chart,s=i.data.labels||[],n=ne(e._parsed[t].r,i.options.locale);return{label:s[t]||"",value:n}}parseObjectData(t,e,i,s){return ii.bind(this)(t,e,i,s)}update(t){const e=this._cachedMeta.data;this._updateRadius(),this.updateElements(e,0,e.length,t)}getMinMax(){const t=this._cachedMeta,e={min:Number.POSITIVE_INFINITY,max:Number.NEGATIVE_INFINITY};return t.data.forEach(((t,i)=>{const s=this.getParsed(i).r;!isNaN(s)&&this.chart.getDataVisibility(i)&&(s<e.min&&(e.min=s),s>e.max&&(e.max=s))})),e}_updateRadius(){const t=this.chart,e=t.chartArea,i=t.options,s=Math.min(e.right-e.left,e.bottom-e.top),n=Math.max(s/2,0),o=(n-Math.max(i.cutoutPercentage?n/100*i.cutoutPercentage:1,0))/t.getVisibleDatasetCount();this.outerRadius=n-o*this.index,this.innerRadius=this.outerRadius-o}updateElements(t,e,i,s){const n="reset"===s,o=this.chart,a=o.options.animation,r=this._cachedMeta.rScale,l=r.xCenter,h=r.yCenter,c=r.getIndexAngle(0)-.5*C;let d,u=c;const f=360/this.countVisibleElements();for(d=0;d<e;++d)u+=this._computeAngle(d,s,f);for(d=e;d<e+i;d++){const e=t[d];let i=u,g=u+this._computeAngle(d,s,f),p=o.getDataVisibility(d)?r.getDistanceFromCenterForValue(this.getParsed(d).r):0;u=g,n&&(a.animateScale&&(p=0),a.animateRotate&&(i=g=c));const m={x:l,y:h,innerRadius:0,outerRadius:p,startAngle:i,endAngle:g,options:this.resolveDataElementOptions(d,e.active?"active":s)};this.updateElement(e,d,m,s)}}countVisibleElements(){const t=this._cachedMeta;let e=0;return t.data.forEach(((t,i)=>{!isNaN(this.getParsed(i).r)&&this.chart.getDataVisibility(i)&&e++})),e}_computeAngle(t,e,i){return this.chart.getDataVisibility(t)?$(this.resolveDataElementOptions(t,e).angle||i):0}}var Un=Object.freeze({__proto__:null,BarController:class extends js{static id="bar";static defaults={datasetElementType:!1,dataElementType:"bar",categoryPercentage:.8,barPercentage:.9,grouped:!0,animations:{numbers:{type:"number",properties:["x","y","base","width","height"]}}};static overrides={scales:{_index_:{type:"category",offset:!0,grid:{offset:!0}},_value_:{type:"linear",beginAtZero:!0}}};parsePrimitiveData(t,e,i,s){return Vn(t,e,i,s)}parseArrayData(t,e,i,s){return Vn(t,e,i,s)}parseObjectData(t,e,i,s){const{iScale:n,vScale:o}=t,{xAxisKey:a="x",yAxisKey:r="y"}=this._parsing,l="x"===n.axis?a:r,h="x"===o.axis?a:r,c=[];let d,u,f,g;for(d=i,u=i+s;d<u;++d)g=e[d],f={},f[n.axis]=n.parse(M(g,l),d),c.push(Fn(M(g,h),f,o,d));return c}updateRangeFromParsed(t,e,i,s){super.updateRangeFromParsed(t,e,i,s);const n=i._custom;n&&e===this._cachedMeta.vScale&&(t.min=Math.min(t.min,n.min),t.max=Math.max(t.max,n.max))}getMaxOverflow(){return 0}getLabelAndValue(t){const e=this._cachedMeta,{iScale:i,vScale:s}=e,n=this.getParsed(t),o=n._custom,a=Bn(o)?"["+o.start+", "+o.end+"]":""+s.getLabelForValue(n[s.axis]);return{label:""+i.getLabelForValue(n[i.axis]),value:a}}initialize(){this.enableOptionSharing=!0,super.initialize();this._cachedMeta.stack=this.getDataset().stack}update(t){const e=this._cachedMeta;this.updateElements(e.data,0,e.data.length,t)}updateElements(t,e,i,n){const o="reset"===n,{index:a,_cachedMeta:{vScale:r}}=this,l=r.getBasePixel(),h=r.isHorizontal(),c=this._getRuler(),{sharedOptions:d,includeOptions:u}=this._getSharedOptions(e,n);for(let f=e;f<e+i;f++){const e=this.getParsed(f),i=o||s(e[r.axis])?{base:l,head:l}:this._calculateBarValuePixels(f),g=this._calculateBarIndexPixels(f,c),p=(e._stacks||{})[r.axis],m={horizontal:h,base:i.base,enableBorderRadius:!p||Bn(e._custom)||a===p._top||a===p._bottom,x:h?i.head:g.center,y:h?g.center:i.head,height:h?g.size:Math.abs(i.size),width:h?Math.abs(i.size):g.size};u&&(m.options=d||this.resolveDataElementOptions(f,t[f].active?"active":n));const x=m.options||t[f].options;Wn(m,x,p,a),jn(m,x,c.ratio),this.updateElement(t[f],f,m,n)}}_getStacks(t,e){const{iScale:i}=this._cachedMeta,n=i.getMatchingVisibleMetas(this._type).filter((t=>t.controller.options.grouped)),o=i.options.stacked,a=[],r=this._cachedMeta.controller.getParsed(e),l=r&&r[i.axis],h=t=>{const e=t._parsed.find((t=>t[i.axis]===l)),n=e&&e[t.vScale.axis];if(s(n)||isNaN(n))return!0};for(const i of n)if((void 0===e||!h(i))&&((!1===o||-1===a.indexOf(i.stack)||void 0===o&&void 0===i.stack)&&a.push(i.stack),i.index===t))break;return a.length||a.push(void 0),a}_getStackCount(t){return this._getStacks(void 0,t).length}_getAxisCount(){return this._getAxis().length}getFirstScaleIdForIndexAxis(){const t=this.chart.scales,e=this.chart.options.indexAxis;return Object.keys(t).filter((i=>t[i].axis===e)).shift()}_getAxis(){const t={},e=this.getFirstScaleIdForIndexAxis();for(const i of this.chart.data.datasets)t[l("x"===this.chart.options.indexAxis?i.xAxisID:i.yAxisID,e)]=!0;return Object.keys(t)}_getStackIndex(t,e,i){const s=this._getStacks(t,i),n=void 0!==e?s.indexOf(e):-1;return-1===n?s.length-1:n}_getRuler(){const t=this.options,e=this._cachedMeta,i=e.iScale,s=[];let n,o;for(n=0,o=e.data.length;n<o;++n)s.push(i.getPixelForValue(this.getParsed(n)[i.axis],n));const a=t.barThickness;return{min:a||zn(e),pixels:s,start:i._startPixel,end:i._endPixel,stackCount:this._getStackCount(),scale:i,grouped:t.grouped,ratio:a?1:t.categoryPercentage*t.barPercentage}}_calculateBarValuePixels(t){const{_cachedMeta:{vScale:e,_stacked:i,index:n},options:{base:o,minBarLength:a}}=this,r=o||0,l=this.getParsed(t),h=l._custom,c=Bn(h);let d,u,f=l[e.axis],g=0,p=i?this.applyStack(e,l,i):f;p!==f&&(g=p-f,p=f),c&&(f=h.barStart,p=h.barEnd-h.barStart,0!==f&&F(f)!==F(h.barEnd)&&(g=0),g+=f);const m=s(o)||c?g:o;let x=e.getPixelForValue(m);if(d=this.chart.getDataVisibility(t)?e.getPixelForValue(g+p):x,u=d-x,Math.abs(u)<a){u=function(t,e,i){return 0!==t?F(t):(e.isHorizontal()?1:-1)*(e.min>=i?1:-1)}(u,e,r)*a,f===r&&(x-=u/2);const t=e.getPixelForDecimal(0),s=e.getPixelForDecimal(1),o=Math.min(t,s),h=Math.max(t,s);x=Math.max(Math.min(x,h),o),d=x+u,i&&!c&&(l._stacks[e.axis]._visualValues[n]=e.getValueForPixel(d)-e.getValueForPixel(x))}if(x===e.getPixelForValue(r)){const t=F(u)*e.getLineWidthForValue(r)/2;x+=t,u-=t}return{size:u,base:x,head:d,center:d+u/2}}_calculateBarIndexPixels(t,e){const i=e.scale,n=this.options,o=n.skipNull,a=l(n.maxBarThickness,1/0);let r,h;const c=this._getAxisCount();if(e.grouped){const i=o?this._getStackCount(t):e.stackCount,d="flex"===n.barThickness?function(t,e,i,s){const n=e.pixels,o=n[t];let a=t>0?n[t-1]:null,r=t<n.length-1?n[t+1]:null;const l=i.categoryPercentage;null===a&&(a=o-(null===r?e.end-e.start:r-o)),null===r&&(r=o+o-a);const h=o-(o-Math.min(a,r))/2*l;return{chunk:Math.abs(r-a)/2*l/s,ratio:i.barPercentage,start:h}}(t,e,n,i*c):function(t,e,i,n){const o=i.barThickness;let a,r;return s(o)?(a=e.min*i.categoryPercentage,r=i.barPercentage):(a=o*n,r=1),{chunk:a/n,ratio:r,start:e.pixels[t]-a/2}}(t,e,n,i*c),u="x"===this.chart.options.indexAxis?this.getDataset().xAxisID:this.getDataset().yAxisID,f=this._getAxis().indexOf(l(u,this.getFirstScaleIdForIndexAxis())),g=this._getStackIndex(this.index,this._cachedMeta.stack,o?t:void 0)+f;r=d.start+d.chunk*g+d.chunk/2,h=Math.min(a,d.chunk*d.ratio)}else r=i.getPixelForValue(this.getParsed(t)[i.axis],t),h=Math.min(a,e.min*e.ratio);return{base:r-h/2,head:r+h/2,center:r,size:h}}draw(){const t=this._cachedMeta,e=t.vScale,i=t.data,s=i.length;let n=0;for(;n<s;++n)null===this.getParsed(n)[e.axis]||i[n].hidden||i[n].draw(this._ctx)}},BubbleController:class extends js{static id="bubble";static defaults={datasetElementType:!1,dataElementType:"point",animations:{numbers:{type:"number",properties:["x","y","borderWidth","radius"]}}};static overrides={scales:{x:{type:"linear"},y:{type:"linear"}}};initialize(){this.enableOptionSharing=!0,super.initialize()}parsePrimitiveData(t,e,i,s){const n=super.parsePrimitiveData(t,e,i,s);for(let t=0;t<n.length;t++)n[t]._custom=this.resolveDataElementOptions(t+i).radius;return n}parseArrayData(t,e,i,s){const n=super.parseArrayData(t,e,i,s);for(let t=0;t<n.length;t++){const s=e[i+t];n[t]._custom=l(s[2],this.resolveDataElementOptions(t+i).radius)}return n}parseObjectData(t,e,i,s){const n=super.parseObjectData(t,e,i,s);for(let t=0;t<n.length;t++){const s=e[i+t];n[t]._custom=l(s&&s.r&&+s.r,this.resolveDataElementOptions(t+i).radius)}return n}getMaxOverflow(){const t=this._cachedMeta.data;let e=0;for(let i=t.length-1;i>=0;--i)e=Math.max(e,t[i].size(this.resolveDataElementOptions(i))/2);return e>0&&e}getLabelAndValue(t){const e=this._cachedMeta,i=this.chart.data.labels||[],{xScale:s,yScale:n}=e,o=this.getParsed(t),a=s.getLabelForValue(o.x),r=n.getLabelForValue(o.y),l=o._custom;return{label:i[t]||"",value:"("+a+", "+r+(l?", "+l:"")+")"}}update(t){const e=this._cachedMeta.data;this.updateElements(e,0,e.length,t)}updateElements(t,e,i,s){const n="reset"===s,{iScale:o,vScale:a}=this._cachedMeta,{sharedOptions:r,includeOptions:l}=this._getSharedOptions(e,s),h=o.axis,c=a.axis;for(let d=e;d<e+i;d++){const e=t[d],i=!n&&this.getParsed(d),u={},f=u[h]=n?o.getPixelForDecimal(.5):o.getPixelForValue(i[h]),g=u[c]=n?a.getBasePixel():a.getPixelForValue(i[c]);u.skip=isNaN(f)||isNaN(g),l&&(u.options=r||this.resolveDataElementOptions(d,e.active?"active":s),n&&(u.options.radius=0)),this.updateElement(e,d,u,s)}}resolveDataElementOptions(t,e){const i=this.getParsed(t);let s=super.resolveDataElementOptions(t,e);s.$shared&&(s=Object.assign({},s,{$shared:!1}));const n=s.radius;return"active"!==e&&(s.radius=0),s.radius+=l(i&&i._custom,n),s}},DoughnutController:$n,LineController:class extends js{static id="line";static defaults={datasetElementType:"line",dataElementType:"point",showLine:!0,spanGaps:!1};static overrides={scales:{_index_:{type:"category"},_value_:{type:"linear"}}};initialize(){this.enableOptionSharing=!0,this.supportsDecimation=!0,super.initialize()}update(t){const e=this._cachedMeta,{dataset:i,data:s=[],_dataset:n}=e,o=this.chart._animationsDisabled;let{start:a,count:r}=pt(e,s,o);this._drawStart=a,this._drawCount=r,mt(e)&&(a=0,r=s.length),i._chart=this.chart,i._datasetIndex=this.index,i._decimated=!!n._decimated,i.points=s;const l=this.resolveDatasetElementOptions(t);this.options.showLine||(l.borderWidth=0),l.segment=this.options.segment,this.updateElement(i,void 0,{animated:!o,options:l},t),this.updateElements(s,a,r,t)}updateElements(t,e,i,n){const o="reset"===n,{iScale:a,vScale:r,_stacked:l,_dataset:h}=this._cachedMeta,{sharedOptions:c,includeOptions:d}=this._getSharedOptions(e,n),u=a.axis,f=r.axis,{spanGaps:g,segment:p}=this.options,m=N(g)?g:Number.POSITIVE_INFINITY,x=this.chart._animationsDisabled||o||"none"===n,b=e+i,_=t.length;let y=e>0&&this.getParsed(e-1);for(let i=0;i<_;++i){const g=t[i],_=x?g:{};if(i<e||i>=b){_.skip=!0;continue}const v=this.getParsed(i),M=s(v[f]),w=_[u]=a.getPixelForValue(v[u],i),k=_[f]=o||M?r.getBasePixel():r.getPixelForValue(l?this.applyStack(r,v,l):v[f],i);_.skip=isNaN(w)||isNaN(k)||M,_.stop=i>0&&Math.abs(v[u]-y[u])>m,p&&(_.parsed=v,_.raw=h.data[i]),d&&(_.options=c||this.resolveDataElementOptions(i,g.active?"active":n)),x||this.updateElement(g,i,_,n),y=v}}getMaxOverflow(){const t=this._cachedMeta,e=t.dataset,i=e.options&&e.options.borderWidth||0,s=t.data||[];if(!s.length)return i;const n=s[0].size(this.resolveDataElementOptions(0)),o=s[s.length-1].size(this.resolveDataElementOptions(s.length-1));return Math.max(i,n,o)/2}draw(){const t=this._cachedMeta;t.dataset.updateControlPoints(this.chart.chartArea,t.iScale.axis),super.draw()}},PieController:class extends $n{static id="pie";static defaults={cutout:0,rotation:0,circumference:360,radius:"100%"}},PolarAreaController:Yn,RadarController:class extends js{static id="radar";static defaults={datasetElementType:"line",dataElementType:"point",indexAxis:"r",showLine:!0,elements:{line:{fill:"start"}}};static overrides={aspectRatio:1,scales:{r:{type:"radialLinear"}}};getLabelAndValue(t){const e=this._cachedMeta.vScale,i=this.getParsed(t);return{label:e.getLabels()[t],value:""+e.getLabelForValue(i[e.axis])}}parseObjectData(t,e,i,s){return ii.bind(this)(t,e,i,s)}update(t){const e=this._cachedMeta,i=e.dataset,s=e.data||[],n=e.iScale.getLabels();if(i.points=s,"resize"!==t){const e=this.resolveDatasetElementOptions(t);this.options.showLine||(e.borderWidth=0);const o={_loop:!0,_fullLoop:n.length===s.length,options:e};this.updateElement(i,void 0,o,t)}this.updateElements(s,0,s.length,t)}updateElements(t,e,i,s){const n=this._cachedMeta.rScale,o="reset"===s;for(let a=e;a<e+i;a++){const e=t[a],i=this.resolveDataElementOptions(a,e.active?"active":s),r=n.getPointPositionForValue(a,this.getParsed(a).r),l=o?n.xCenter:r.x,h=o?n.yCenter:r.y,c={x:l,y:h,angle:r.angle,skip:isNaN(l)||isNaN(h),options:i};this.updateElement(e,a,c,s)}}},ScatterController:class extends js{static id="scatter";static defaults={datasetElementType:!1,dataElementType:"point",showLine:!1,fill:!1};static overrides={interaction:{mode:"point"},scales:{x:{type:"linear"},y:{type:"linear"}}};getLabelAndValue(t){const e=this._cachedMeta,i=this.chart.data.labels||[],{xScale:s,yScale:n}=e,o=this.getParsed(t),a=s.getLabelForValue(o.x),r=n.getLabelForValue(o.y);return{label:i[t]||"",value:"("+a+", "+r+")"}}update(t){const e=this._cachedMeta,{data:i=[]}=e,s=this.chart._animationsDisabled;let{start:n,count:o}=pt(e,i,s);if(this._drawStart=n,this._drawCount=o,mt(e)&&(n=0,o=i.length),this.options.showLine){this.datasetElementType||this.addElements();const{dataset:n,_dataset:o}=e;n._chart=this.chart,n._datasetIndex=this.index,n._decimated=!!o._decimated,n.points=i;const a=this.resolveDatasetElementOptions(t);a.segment=this.options.segment,this.updateElement(n,void 0,{animated:!s,options:a},t)}else this.datasetElementType&&(delete e.dataset,this.datasetElementType=!1);this.updateElements(i,n,o,t)}addElements(){const{showLine:t}=this.options;!this.datasetElementType&&t&&(this.datasetElementType=this.chart.registry.getElement("line")),super.addElements()}updateElements(t,e,i,n){const o="reset"===n,{iScale:a,vScale:r,_stacked:l,_dataset:h}=this._cachedMeta,c=this.resolveDataElementOptions(e,n),d=this.getSharedOptions(c),u=this.includeOptions(n,d),f=a.axis,g=r.axis,{spanGaps:p,segment:m}=this.options,x=N(p)?p:Number.POSITIVE_INFINITY,b=this.chart._animationsDisabled||o||"none"===n;let _=e>0&&this.getParsed(e-1);for(let c=e;c<e+i;++c){const e=t[c],i=this.getParsed(c),p=b?e:{},y=s(i[g]),v=p[f]=a.getPixelForValue(i[f],c),M=p[g]=o||y?r.getBasePixel():r.getPixelForValue(l?this.applyStack(r,i,l):i[g],c);p.skip=isNaN(v)||isNaN(M)||y,p.stop=c>0&&Math.abs(i[f]-_[f])>x,m&&(p.parsed=i,p.raw=h.data[c]),u&&(p.options=d||this.resolveDataElementOptions(c,e.active?"active":n)),b||this.updateElement(e,c,p,n),_=i}this.updateSharedOptions(d,n,c)}getMaxOverflow(){const t=this._cachedMeta,e=t.data||[];if(!this.options.showLine){let t=0;for(let i=e.length-1;i>=0;--i)t=Math.max(t,e[i].size(this.resolveDataElementOptions(i))/2);return t>0&&t}const i=t.dataset,s=i.options&&i.options.borderWidth||0;if(!e.length)return s;const n=e[0].size(this.resolveDataElementOptions(0)),o=e[e.length-1].size(this.resolveDataElementOptions(e.length-1));return Math.max(s,n,o)/2}}});function Xn(t,e,i,s){const n=vi(t.options.borderRadius,["outerStart","outerEnd","innerStart","innerEnd"]);const o=(i-e)/2,a=Math.min(o,s*e/2),r=t=>{const e=(i-Math.min(o,t))*s/2;return Z(t,0,Math.min(o,e))};return{outerStart:r(n.outerStart),outerEnd:r(n.outerEnd),innerStart:Z(n.innerStart,0,a),innerEnd:Z(n.innerEnd,0,a)}}function qn(t,e,i,s){return{x:i+t*Math.cos(e),y:s+t*Math.sin(e)}}function Kn(t,e,i,s,n,o){const{x:a,y:r,startAngle:l,pixelMargin:h,innerRadius:c}=e,d=Math.max(e.outerRadius+s+i-h,0),u=c>0?c+s+i+h:0;let f=0;const g=n-l;if(s){const t=((c>0?c-s:0)+(d>0?d-s:0))/2;f=(g-(0!==t?g*t/(t+s):g))/2}const p=(g-Math.max(.001,g*d-i/C)/d)/2,m=l+p+f,x=n-p-f,{outerStart:b,outerEnd:_,innerStart:y,innerEnd:v}=Xn(e,u,d,x-m),M=d-b,w=d-_,k=m+b/M,S=x-_/w,P=u+y,D=u+v,O=m+y/P,A=x-v/D;if(t.beginPath(),o){const e=(k+S)/2;if(t.arc(a,r,d,k,e),t.arc(a,r,d,e,S),_>0){const e=qn(w,S,a,r);t.arc(e.x,e.y,_,S,x+E)}const i=qn(D,x,a,r);if(t.lineTo(i.x,i.y),v>0){const e=qn(D,A,a,r);t.arc(e.x,e.y,v,x+E,A+Math.PI)}const s=(x-v/u+(m+y/u))/2;if(t.arc(a,r,u,x-v/u,s,!0),t.arc(a,r,u,s,m+y/u,!0),y>0){const e=qn(P,O,a,r);t.arc(e.x,e.y,y,O+Math.PI,m-E)}const n=qn(M,m,a,r);if(t.lineTo(n.x,n.y),b>0){const e=qn(M,k,a,r);t.arc(e.x,e.y,b,m-E,k)}}else{t.moveTo(a,r);const e=Math.cos(k)*d+a,i=Math.sin(k)*d+r;t.lineTo(e,i);const s=Math.cos(S)*d+a,n=Math.sin(S)*d+r;t.lineTo(s,n)}t.closePath()}function Gn(t,e,i,s,n){const{fullCircles:o,startAngle:a,circumference:r,options:l}=e,{borderWidth:h,borderJoinStyle:c,borderDash:d,borderDashOffset:u,borderRadius:f}=l,g="inner"===l.borderAlign;if(!h)return;t.setLineDash(d||[]),t.lineDashOffset=u,g?(t.lineWidth=2*h,t.lineJoin=c||"round"):(t.lineWidth=h,t.lineJoin=c||"bevel");let p=e.endAngle;if(o){Kn(t,e,i,s,p,n);for(let e=0;e<o;++e)t.stroke();isNaN(r)||(p=a+(r%O||O))}g&&function(t,e,i){const{startAngle:s,pixelMargin:n,x:o,y:a,outerRadius:r,innerRadius:l}=e;let h=n/r;t.beginPath(),t.arc(o,a,r,s-h,i+h),l>n?(h=n/l,t.arc(o,a,l,i+h,s-h,!0)):t.arc(o,a,n,i+E,s-E),t.closePath(),t.clip()}(t,e,p),l.selfJoin&&p-a>=C&&0===f&&"miter"!==c&&function(t,e,i){const{startAngle:s,x:n,y:o,outerRadius:a,innerRadius:r,options:l}=e,{borderWidth:h,borderJoinStyle:c}=l,d=Math.min(h/a,G(s-i));if(t.beginPath(),t.arc(n,o,a-h/2,s+d/2,i-d/2),r>0){const e=Math.min(h/r,G(s-i));t.arc(n,o,r+h/2,i-e/2,s+e/2,!0)}else{const e=Math.min(h/2,a*G(s-i));if("round"===c)t.arc(n,o,e,i-C/2,s+C/2,!0);else if("bevel"===c){const a=2*e*e,r=-a*Math.cos(i+C/2)+n,l=-a*Math.sin(i+C/2)+o,h=a*Math.cos(s+C/2)+n,c=a*Math.sin(s+C/2)+o;t.lineTo(r,l),t.lineTo(h,c)}}t.closePath(),t.moveTo(0,0),t.rect(0,0,t.canvas.width,t.canvas.height),t.clip("evenodd")}(t,e,p),o||(Kn(t,e,i,s,p,n),t.stroke())}function Jn(t,e,i=e){t.lineCap=l(i.borderCapStyle,e.borderCapStyle),t.setLineDash(l(i.borderDash,e.borderDash)),t.lineDashOffset=l(i.borderDashOffset,e.borderDashOffset),t.lineJoin=l(i.borderJoinStyle,e.borderJoinStyle),t.lineWidth=l(i.borderWidth,e.borderWidth),t.strokeStyle=l(i.borderColor,e.borderColor)}function Zn(t,e,i){t.lineTo(i.x,i.y)}function Qn(t,e,i={}){const s=t.length,{start:n=0,end:o=s-1}=i,{start:a,end:r}=e,l=Math.max(n,a),h=Math.min(o,r),c=n<a&&o<a||n>r&&o>r;return{count:s,start:l,loop:e.loop,ilen:h<l&&!c?s+h-l:h-l}}function to(t,e,i,s){const{points:n,options:o}=e,{count:a,start:r,loop:l,ilen:h}=Qn(n,i,s),c=function(t){return t.stepped?Fe:t.tension||"monotone"===t.cubicInterpolationMode?Ve:Zn}(o);let d,u,f,{move:g=!0,reverse:p}=s||{};for(d=0;d<=h;++d)u=n[(r+(p?h-d:d))%a],u.skip||(g?(t.moveTo(u.x,u.y),g=!1):c(t,f,u,p,o.stepped),f=u);return l&&(u=n[(r+(p?h:0))%a],c(t,f,u,p,o.stepped)),!!l}function eo(t,e,i,s){const n=e.points,{count:o,start:a,ilen:r}=Qn(n,i,s),{move:l=!0,reverse:h}=s||{};let c,d,u,f,g,p,m=0,x=0;const b=t=>(a+(h?r-t:t))%o,_=()=>{f!==g&&(t.lineTo(m,g),t.lineTo(m,f),t.lineTo(m,p))};for(l&&(d=n[b(0)],t.moveTo(d.x,d.y)),c=0;c<=r;++c){if(d=n[b(c)],d.skip)continue;const e=d.x,i=d.y,s=0|e;s===u?(i<f?f=i:i>g&&(g=i),m=(x*m+e)/++x):(_(),t.lineTo(e,i),u=s,x=0,f=g=i),p=i}_()}function io(t){const e=t.options,i=e.borderDash&&e.borderDash.length;return!(t._decimated||t._loop||e.tension||"monotone"===e.cubicInterpolationMode||e.stepped||i)?eo:to}const so="function"==typeof Path2D;function no(t,e,i,s){so&&!e.options.segment?function(t,e,i,s){let n=e._path;n||(n=e._path=new Path2D,e.path(n,i,s)&&n.closePath()),Jn(t,e.options),t.stroke(n)}(t,e,i,s):function(t,e,i,s){const{segments:n,options:o}=e,a=io(e);for(const r of n)Jn(t,o,r.style),t.beginPath(),a(t,e,r,{start:i,end:i+s-1})&&t.closePath(),t.stroke()}(t,e,i,s)}class oo extends $s{static id="line";static defaults={borderCapStyle:"butt",borderDash:[],borderDashOffset:0,borderJoinStyle:"miter",borderWidth:3,capBezierPoints:!0,cubicInterpolationMode:"default",fill:!1,spanGaps:!1,stepped:!1,tension:0};static defaultRoutes={backgroundColor:"backgroundColor",borderColor:"borderColor"};static descriptors={_scriptable:!0,_indexable:t=>"borderDash"!==t&&"fill"!==t};constructor(t){super(),this.animated=!0,this.options=void 0,this._chart=void 0,this._loop=void 0,this._fullLoop=void 0,this._path=void 0,this._points=void 0,this._segments=void 0,this._decimated=!1,this._pointsUpdated=!1,this._datasetIndex=void 0,t&&Object.assign(this,t)}updateControlPoints(t,e){const i=this.options;if((i.tension||"monotone"===i.cubicInterpolationMode)&&!i.stepped&&!this._pointsUpdated){const s=i.spanGaps?this._loop:this._fullLoop;hi(this._points,i,t,s,e),this._pointsUpdated=!0}}set points(t){this._points=t,delete this._segments,delete this._path,this._pointsUpdated=!1}get points(){return this._points}get segments(){return this._segments||(this._segments=zi(this,this.options.segment))}first(){const t=this.segments,e=this.points;return t.length&&e[t[0].start]}last(){const t=this.segments,e=this.points,i=t.length;return i&&e[t[i-1].end]}interpolate(t,e){const i=this.options,s=t[e],n=this.points,o=Ii(this,{property:e,start:s,end:s});if(!o.length)return;const a=[],r=function(t){return t.stepped?pi:t.tension||"monotone"===t.cubicInterpolationMode?mi:gi}(i);let l,h;for(l=0,h=o.length;l<h;++l){const{start:h,end:c}=o[l],d=n[h],u=n[c];if(d===u){a.push(d);continue}const f=r(d,u,Math.abs((s-d[e])/(u[e]-d[e])),i.stepped);f[e]=t[e],a.push(f)}return 1===a.length?a[0]:a}pathSegment(t,e,i){return io(this)(t,this,e,i)}path(t,e,i){const s=this.segments,n=io(this);let o=this._loop;e=e||0,i=i||this.points.length-e;for(const a of s)o&=n(t,this,a,{start:e,end:e+i-1});return!!o}draw(t,e,i,s){const n=this.options||{};(this.points||[]).length&&n.borderWidth&&(t.save(),no(t,this,i,s),t.restore()),this.animated&&(this._pointsUpdated=!1,this._path=void 0)}}function ao(t,e,i,s){const n=t.options,{[i]:o}=t.getProps([i],s);return Math.abs(e-o)<n.radius+n.hitRadius}function ro(t,e){const{x:i,y:s,base:n,width:o,height:a}=t.getProps(["x","y","base","width","height"],e);let r,l,h,c,d;return t.horizontal?(d=a/2,r=Math.min(i,n),l=Math.max(i,n),h=s-d,c=s+d):(d=o/2,r=i-d,l=i+d,h=Math.min(s,n),c=Math.max(s,n)),{left:r,top:h,right:l,bottom:c}}function lo(t,e,i,s){return t?0:Z(e,i,s)}function ho(t){const e=ro(t),i=e.right-e.left,s=e.bottom-e.top,n=function(t,e,i){const s=t.options.borderWidth,n=t.borderSkipped,o=Mi(s);return{t:lo(n.top,o.top,0,i),r:lo(n.right,o.right,0,e),b:lo(n.bottom,o.bottom,0,i),l:lo(n.left,o.left,0,e)}}(t,i/2,s/2),a=function(t,e,i){const{enableBorderRadius:s}=t.getProps(["enableBorderRadius"]),n=t.options.borderRadius,a=wi(n),r=Math.min(e,i),l=t.borderSkipped,h=s||o(n);return{topLeft:lo(!h||l.top||l.left,a.topLeft,0,r),topRight:lo(!h||l.top||l.right,a.topRight,0,r),bottomLeft:lo(!h||l.bottom||l.left,a.bottomLeft,0,r),bottomRight:lo(!h||l.bottom||l.right,a.bottomRight,0,r)}}(t,i/2,s/2);return{outer:{x:e.left,y:e.top,w:i,h:s,radius:a},inner:{x:e.left+n.l,y:e.top+n.t,w:i-n.l-n.r,h:s-n.t-n.b,radius:{topLeft:Math.max(0,a.topLeft-Math.max(n.t,n.l)),topRight:Math.max(0,a.topRight-Math.max(n.t,n.r)),bottomLeft:Math.max(0,a.bottomLeft-Math.max(n.b,n.l)),bottomRight:Math.max(0,a.bottomRight-Math.max(n.b,n.r))}}}}function co(t,e,i,s){const n=null===e,o=null===i,a=t&&!(n&&o)&&ro(t,s);return a&&(n||tt(e,a.left,a.right))&&(o||tt(i,a.top,a.bottom))}function uo(t,e){t.rect(e.x,e.y,e.w,e.h)}function fo(t,e,i={}){const s=t.x!==i.x?-e:0,n=t.y!==i.y?-e:0,o=(t.x+t.w!==i.x+i.w?e:0)-s,a=(t.y+t.h!==i.y+i.h?e:0)-n;return{x:t.x+s,y:t.y+n,w:t.w+o,h:t.h+a,radius:t.radius}}var go=Object.freeze({__proto__:null,ArcElement:class extends $s{static id="arc";static defaults={borderAlign:"center",borderColor:"#fff",borderDash:[],borderDashOffset:0,borderJoinStyle:void 0,borderRadius:0,borderWidth:2,offset:0,spacing:0,angle:void 0,circular:!0,selfJoin:!1};static defaultRoutes={backgroundColor:"backgroundColor"};static descriptors={_scriptable:!0,_indexable:t=>"borderDash"!==t};circumference;endAngle;fullCircles;innerRadius;outerRadius;pixelMargin;startAngle;constructor(t){super(),this.options=void 0,this.circumference=void 0,this.startAngle=void 0,this.endAngle=void 0,this.innerRadius=void 0,this.outerRadius=void 0,this.pixelMargin=0,this.fullCircles=0,t&&Object.assign(this,t)}inRange(t,e,i){const s=this.getProps(["x","y"],i),{angle:n,distance:o}=X(s,{x:t,y:e}),{startAngle:a,endAngle:r,innerRadius:h,outerRadius:c,circumference:d}=this.getProps(["startAngle","endAngle","innerRadius","outerRadius","circumference"],i),u=(this.options.spacing+this.options.borderWidth)/2,f=l(d,r-a),g=J(n,a,r)&&a!==r,p=f>=O||g,m=tt(o,h+u,c+u);return p&&m}getCenterPoint(t){const{x:e,y:i,startAngle:s,endAngle:n,innerRadius:o,outerRadius:a}=this.getProps(["x","y","startAngle","endAngle","innerRadius","outerRadius"],t),{offset:r,spacing:l}=this.options,h=(s+n)/2,c=(o+a+l+r)/2;return{x:e+Math.cos(h)*c,y:i+Math.sin(h)*c}}tooltipPosition(t){return this.getCenterPoint(t)}draw(t){const{options:e,circumference:i}=this,s=(e.offset||0)/4,n=(e.spacing||0)/2,o=e.circular;if(this.pixelMargin="inner"===e.borderAlign?.33:0,this.fullCircles=i>O?Math.floor(i/O):0,0===i||this.innerRadius<0||this.outerRadius<0)return;t.save();const a=(this.startAngle+this.endAngle)/2;t.translate(Math.cos(a)*s,Math.sin(a)*s);const r=s*(1-Math.sin(Math.min(C,i||0)));t.fillStyle=e.backgroundColor,t.strokeStyle=e.borderColor,function(t,e,i,s,n){const{fullCircles:o,startAngle:a,circumference:r}=e;let l=e.endAngle;if(o){Kn(t,e,i,s,l,n);for(let e=0;e<o;++e)t.fill();isNaN(r)||(l=a+(r%O||O))}Kn(t,e,i,s,l,n),t.fill()}(t,this,r,n,o),Gn(t,this,r,n,o),t.restore()}},BarElement:class extends $s{static id="bar";static defaults={borderSkipped:"start",borderWidth:0,borderRadius:0,inflateAmount:"auto",pointStyle:void 0};static defaultRoutes={backgroundColor:"backgroundColor",borderColor:"borderColor"};constructor(t){super(),this.options=void 0,this.horizontal=void 0,this.base=void 0,this.width=void 0,this.height=void 0,this.inflateAmount=void 0,t&&Object.assign(this,t)}draw(t){const{inflateAmount:e,options:{borderColor:i,backgroundColor:s}}=this,{inner:n,outer:o}=ho(this),a=(r=o.radius).topLeft||r.topRight||r.bottomLeft||r.bottomRight?He:uo;var r;t.save(),o.w===n.w&&o.h===n.h||(t.beginPath(),a(t,fo(o,e,n)),t.clip(),a(t,fo(n,-e,o)),t.fillStyle=i,t.fill("evenodd")),t.beginPath(),a(t,fo(n,e)),t.fillStyle=s,t.fill(),t.restore()}inRange(t,e,i){return co(this,t,e,i)}inXRange(t,e){return co(this,t,null,e)}inYRange(t,e){return co(this,null,t,e)}getCenterPoint(t){const{x:e,y:i,base:s,horizontal:n}=this.getProps(["x","y","base","horizontal"],t);return{x:n?(e+s)/2:e,y:n?i:(i+s)/2}}getRange(t){return"x"===t?this.width/2:this.height/2}},LineElement:oo,PointElement:class extends $s{static id="point";parsed;skip;stop;static defaults={borderWidth:1,hitRadius:1,hoverBorderWidth:1,hoverRadius:4,pointStyle:"circle",radius:3,rotation:0};static defaultRoutes={backgroundColor:"backgroundColor",borderColor:"borderColor"};constructor(t){super(),this.options=void 0,this.parsed=void 0,this.skip=void 0,this.stop=void 0,t&&Object.assign(this,t)}inRange(t,e,i){const s=this.options,{x:n,y:o}=this.getProps(["x","y"],i);return Math.pow(t-n,2)+Math.pow(e-o,2)<Math.pow(s.hitRadius+s.radius,2)}inXRange(t,e){return ao(this,t,"x",e)}inYRange(t,e){return ao(this,t,"y",e)}getCenterPoint(t){const{x:e,y:i}=this.getProps(["x","y"],t);return{x:e,y:i}}size(t){let e=(t=t||this.options||{}).radius||0;e=Math.max(e,e&&t.hoverRadius||0);return 2*(e+(e&&t.borderWidth||0))}draw(t,e){const i=this.options;this.skip||i.radius<.1||!Re(this,e,this.size(i)/2)||(t.strokeStyle=i.borderColor,t.lineWidth=i.borderWidth,t.fillStyle=i.backgroundColor,Le(t,i,this.x,this.y))}getRange(){const t=this.options||{};return t.radius+t.hitRadius}}});function po(t,e,i,s){const n=t.indexOf(e);if(-1===n)return((t,e,i,s)=>("string"==typeof e?(i=t.push(e)-1,s.unshift({index:i,label:e})):isNaN(e)&&(i=null),i))(t,e,i,s);return n!==t.lastIndexOf(e)?i:n}function mo(t){const e=this.getLabels();return t>=0&&t<e.length?e[t]:t}function xo(t,e,{horizontal:i,minRotation:s}){const n=$(s),o=(i?Math.sin(n):Math.cos(n))||.001,a=.75*e*(""+t).length;return Math.min(e/o,a)}class bo extends tn{constructor(t){super(t),this.start=void 0,this.end=void 0,this._startValue=void 0,this._endValue=void 0,this._valueRange=0}parse(t,e){return s(t)||("number"==typeof t||t instanceof Number)&&!isFinite(+t)?null:+t}handleTickRangeOptions(){const{beginAtZero:t}=this.options,{minDefined:e,maxDefined:i}=this.getUserBounds();let{min:s,max:n}=this;const o=t=>s=e?s:t,a=t=>n=i?n:t;if(t){const t=F(s),e=F(n);t<0&&e<0?a(0):t>0&&e>0&&o(0)}if(s===n){let e=0===n?1:Math.abs(.05*n);a(n+e),t||o(s-e)}this.min=s,this.max=n}getTickLimit(){const t=this.options.ticks;let e,{maxTicksLimit:i,stepSize:s}=t;return s?(e=Math.ceil(this.max/s)-Math.floor(this.min/s)+1,e>1e3&&(console.warn(`scales.${this.id}.ticks.stepSize: ${s} would result generating up to ${e} ticks. Limiting to 1000.`),e=1e3)):(e=this.computeTickLimit(),i=i||11),i&&(e=Math.min(i,e)),e}computeTickLimit(){return Number.POSITIVE_INFINITY}buildTicks(){const t=this.options,e=t.ticks;let i=this.getTickLimit();i=Math.max(2,i);const n=function(t,e){const i=[],{bounds:n,step:o,min:a,max:r,precision:l,count:h,maxTicks:c,maxDigits:d,includeBounds:u}=t,f=o||1,g=c-1,{min:p,max:m}=e,x=!s(a),b=!s(r),_=!s(h),y=(m-p)/(d+1);let v,M,w,k,S=B((m-p)/g/f)*f;if(S<1e-14&&!x&&!b)return[{value:p},{value:m}];k=Math.ceil(m/S)-Math.floor(p/S),k>g&&(S=B(k*S/g/f)*f),s(l)||(v=Math.pow(10,l),S=Math.ceil(S*v)/v),"ticks"===n?(M=Math.floor(p/S)*S,w=Math.ceil(m/S)*S):(M=p,w=m),x&&b&&o&&H((r-a)/o,S/1e3)?(k=Math.round(Math.min((r-a)/S,c)),S=(r-a)/k,M=a,w=r):_?(M=x?a:M,w=b?r:w,k=h-1,S=(w-M)/k):(k=(w-M)/S,k=V(k,Math.round(k),S/1e3)?Math.round(k):Math.ceil(k));const P=Math.max(U(S),U(M));v=Math.pow(10,s(l)?P:l),M=Math.round(M*v)/v,w=Math.round(w*v)/v;let D=0;for(x&&(u&&M!==a?(i.push({value:a}),M<a&&D++,V(Math.round((M+D*S)*v)/v,a,xo(a,y,t))&&D++):M<a&&D++);D<k;++D){const t=Math.round((M+D*S)*v)/v;if(b&&t>r)break;i.push({value:t})}return b&&u&&w!==r?i.length&&V(i[i.length-1].value,r,xo(r,y,t))?i[i.length-1].value=r:i.push({value:r}):b&&w!==r||i.push({value:w}),i}({maxTicks:i,bounds:t.bounds,min:t.min,max:t.max,precision:e.precision,step:e.stepSize,count:e.count,maxDigits:this._maxDigits(),horizontal:this.isHorizontal(),minRotation:e.minRotation||0,includeBounds:!1!==e.includeBounds},this._range||this);return"ticks"===t.bounds&&j(n,this,"value"),t.reverse?(n.reverse(),this.start=this.max,this.end=this.min):(this.start=this.min,this.end=this.max),n}configure(){const t=this.ticks;let e=this.min,i=this.max;if(super.configure(),this.options.offset&&t.length){const s=(i-e)/Math.max(t.length-1,1)/2;e-=s,i+=s}this._startValue=e,this._endValue=i,this._valueRange=i-e}getLabelForValue(t){return ne(t,this.chart.options.locale,this.options.ticks.format)}}class _o extends bo{static id="linear";static defaults={ticks:{callback:ae.formatters.numeric}};determineDataLimits(){const{min:t,max:e}=this.getMinMax(!0);this.min=a(t)?t:0,this.max=a(e)?e:1,this.handleTickRangeOptions()}computeTickLimit(){const t=this.isHorizontal(),e=t?this.width:this.height,i=$(this.options.ticks.minRotation),s=(t?Math.sin(i):Math.cos(i))||.001,n=this._resolveTickFontOptions(0);return Math.ceil(e/Math.min(40,n.lineHeight/s))}getPixelForValue(t){return null===t?NaN:this.getPixelForDecimal((t-this._startValue)/this._valueRange)}getValueForPixel(t){return this._startValue+this.getDecimalForPixel(t)*this._valueRange}}const yo=t=>Math.floor(z(t)),vo=(t,e)=>Math.pow(10,yo(t)+e);function Mo(t){return 1===t/Math.pow(10,yo(t))}function wo(t,e,i){const s=Math.pow(10,i),n=Math.floor(t/s);return Math.ceil(e/s)-n}function ko(t,{min:e,max:i}){e=r(t.min,e);const s=[],n=yo(e);let o=function(t,e){let i=yo(e-t);for(;wo(t,e,i)>10;)i++;for(;wo(t,e,i)<10;)i--;return Math.min(i,yo(t))}(e,i),a=o<0?Math.pow(10,Math.abs(o)):1;const l=Math.pow(10,o),h=n>o?Math.pow(10,n):0,c=Math.round((e-h)*a)/a,d=Math.floor((e-h)/l/10)*l*10;let u=Math.floor((c-d)/Math.pow(10,o)),f=r(t.min,Math.round((h+d+u*Math.pow(10,o))*a)/a);for(;f<i;)s.push({value:f,major:Mo(f),significand:u}),u>=10?u=u<15?15:20:u++,u>=20&&(o++,u=2,a=o>=0?1:a),f=Math.round((h+d+u*Math.pow(10,o))*a)/a;const g=r(t.max,f);return s.push({value:g,major:Mo(g),significand:u}),s}class So extends tn{static id="logarithmic";static defaults={ticks:{callback:ae.formatters.logarithmic,major:{enabled:!0}}};constructor(t){super(t),this.start=void 0,this.end=void 0,this._startValue=void 0,this._valueRange=0}parse(t,e){const i=bo.prototype.parse.apply(this,[t,e]);if(0!==i)return a(i)&&i>0?i:null;this._zero=!0}determineDataLimits(){const{min:t,max:e}=this.getMinMax(!0);this.min=a(t)?Math.max(0,t):null,this.max=a(e)?Math.max(0,e):null,this.options.beginAtZero&&(this._zero=!0),this._zero&&this.min!==this._suggestedMin&&!a(this._userMin)&&(this.min=t===vo(this.min,0)?vo(this.min,-1):vo(this.min,0)),this.handleTickRangeOptions()}handleTickRangeOptions(){const{minDefined:t,maxDefined:e}=this.getUserBounds();let i=this.min,s=this.max;const n=e=>i=t?i:e,o=t=>s=e?s:t;i===s&&(i<=0?(n(1),o(10)):(n(vo(i,-1)),o(vo(s,1)))),i<=0&&n(vo(s,-1)),s<=0&&o(vo(i,1)),this.min=i,this.max=s}buildTicks(){const t=this.options,e=ko({min:this._userMin,max:this._userMax},this);return"ticks"===t.bounds&&j(e,this,"value"),t.reverse?(e.reverse(),this.start=this.max,this.end=this.min):(this.start=this.min,this.end=this.max),e}getLabelForValue(t){return void 0===t?"0":ne(t,this.chart.options.locale,this.options.ticks.format)}configure(){const t=this.min;super.configure(),this._startValue=z(t),this._valueRange=z(this.max)-z(t)}getPixelForValue(t){return void 0!==t&&0!==t||(t=this.min),null===t||isNaN(t)?NaN:this.getPixelForDecimal(t===this.min?0:(z(t)-this._startValue)/this._valueRange)}getValueForPixel(t){const e=this.getDecimalForPixel(t);return Math.pow(10,this._startValue+e*this._valueRange)}}function Po(t){const e=t.ticks;if(e.display&&t.display){const t=ki(e.backdropPadding);return l(e.font&&e.font.size,ue.font.size)+t.height}return 0}function Do(t,e,i,s,n){return t===s||t===n?{start:e-i/2,end:e+i/2}:t<s||t>n?{start:e-i,end:e}:{start:e,end:e+i}}function Co(t){const e={l:t.left+t._padding.left,r:t.right-t._padding.right,t:t.top+t._padding.top,b:t.bottom-t._padding.bottom},i=Object.assign({},e),s=[],o=[],a=t._pointLabels.length,r=t.options.pointLabels,l=r.centerPointLabels?C/a:0;for(let u=0;u<a;u++){const a=r.setContext(t.getPointLabelContext(u));o[u]=a.padding;const f=t.getPointPosition(u,t.drawingArea+o[u],l),g=Si(a.font),p=(h=t.ctx,c=g,d=n(d=t._pointLabels[u])?d:[d],{w:Oe(h,c.string,d),h:d.length*c.lineHeight});s[u]=p;const m=G(t.getIndexAngle(u)+l),x=Math.round(Y(m));Oo(i,e,m,Do(x,f.x,p.w,0,180),Do(x,f.y,p.h,90,270))}var h,c,d;t.setCenterPoint(e.l-i.l,i.r-e.r,e.t-i.t,i.b-e.b),t._pointLabelItems=function(t,e,i){const s=[],n=t._pointLabels.length,o=t.options,{centerPointLabels:a,display:r}=o.pointLabels,l={extra:Po(o)/2,additionalAngle:a?C/n:0};let h;for(let o=0;o<n;o++){l.padding=i[o],l.size=e[o];const n=Ao(t,o,l);s.push(n),"auto"===r&&(n.visible=To(n,h),n.visible&&(h=n))}return s}(t,s,o)}function Oo(t,e,i,s,n){const o=Math.abs(Math.sin(i)),a=Math.abs(Math.cos(i));let r=0,l=0;s.start<e.l?(r=(e.l-s.start)/o,t.l=Math.min(t.l,e.l-r)):s.end>e.r&&(r=(s.end-e.r)/o,t.r=Math.max(t.r,e.r+r)),n.start<e.t?(l=(e.t-n.start)/a,t.t=Math.min(t.t,e.t-l)):n.end>e.b&&(l=(n.end-e.b)/a,t.b=Math.max(t.b,e.b+l))}function Ao(t,e,i){const s=t.drawingArea,{extra:n,additionalAngle:o,padding:a,size:r}=i,l=t.getPointPosition(e,s+n+a,o),h=Math.round(Y(G(l.angle+E))),c=function(t,e,i){90===i||270===i?t-=e/2:(i>270||i<90)&&(t-=e);return t}(l.y,r.h,h),d=function(t){if(0===t||180===t)return"center";if(t<180)return"left";return"right"}(h),u=function(t,e,i){"right"===i?t-=e:"center"===i&&(t-=e/2);return t}(l.x,r.w,d);return{visible:!0,x:l.x,y:c,textAlign:d,left:u,top:c,right:u+r.w,bottom:c+r.h}}function To(t,e){if(!e)return!0;const{left:i,top:s,right:n,bottom:o}=t;return!(Re({x:i,y:s},e)||Re({x:i,y:o},e)||Re({x:n,y:s},e)||Re({x:n,y:o},e))}function Lo(t,e,i){const{left:n,top:o,right:a,bottom:r}=i,{backdropColor:l}=e;if(!s(l)){const i=wi(e.borderRadius),s=ki(e.backdropPadding);t.fillStyle=l;const h=n-s.left,c=o-s.top,d=a-n+s.width,u=r-o+s.height;Object.values(i).some((t=>0!==t))?(t.beginPath(),He(t,{x:h,y:c,w:d,h:u,radius:i}),t.fill()):t.fillRect(h,c,d,u)}}function Eo(t,e,i,s){const{ctx:n}=t;if(i)n.arc(t.xCenter,t.yCenter,e,0,O);else{let i=t.getPointPosition(0,e);n.moveTo(i.x,i.y);for(let o=1;o<s;o++)i=t.getPointPosition(o,e),n.lineTo(i.x,i.y)}}class Ro extends bo{static id="radialLinear";static defaults={display:!0,animate:!0,position:"chartArea",angleLines:{display:!0,lineWidth:1,borderDash:[],borderDashOffset:0},grid:{circular:!1},startAngle:0,ticks:{showLabelBackdrop:!0,callback:ae.formatters.numeric},pointLabels:{backdropColor:void 0,backdropPadding:2,display:!0,font:{size:10},callback:t=>t,padding:5,centerPointLabels:!1}};static defaultRoutes={"angleLines.color":"borderColor","pointLabels.color":"color","ticks.color":"color"};static descriptors={angleLines:{_fallback:"grid"}};constructor(t){super(t),this.xCenter=void 0,this.yCenter=void 0,this.drawingArea=void 0,this._pointLabels=[],this._pointLabelItems=[]}setDimensions(){const t=this._padding=ki(Po(this.options)/2),e=this.width=this.maxWidth-t.width,i=this.height=this.maxHeight-t.height;this.xCenter=Math.floor(this.left+e/2+t.left),this.yCenter=Math.floor(this.top+i/2+t.top),this.drawingArea=Math.floor(Math.min(e,i)/2)}determineDataLimits(){const{min:t,max:e}=this.getMinMax(!1);this.min=a(t)&&!isNaN(t)?t:0,this.max=a(e)&&!isNaN(e)?e:0,this.handleTickRangeOptions()}computeTickLimit(){return Math.ceil(this.drawingArea/Po(this.options))}generateTickLabels(t){bo.prototype.generateTickLabels.call(this,t),this._pointLabels=this.getLabels().map(((t,e)=>{const i=d(this.options.pointLabels.callback,[t,e],this);return i||0===i?i:""})).filter(((t,e)=>this.chart.getDataVisibility(e)))}fit(){const t=this.options;t.display&&t.pointLabels.display?Co(this):this.setCenterPoint(0,0,0,0)}setCenterPoint(t,e,i,s){this.xCenter+=Math.floor((t-e)/2),this.yCenter+=Math.floor((i-s)/2),this.drawingArea-=Math.min(this.drawingArea/2,Math.max(t,e,i,s))}getIndexAngle(t){return G(t*(O/(this._pointLabels.length||1))+$(this.options.startAngle||0))}getDistanceFromCenterForValue(t){if(s(t))return NaN;const e=this.drawingArea/(this.max-this.min);return this.options.reverse?(this.max-t)*e:(t-this.min)*e}getValueForDistanceFromCenter(t){if(s(t))return NaN;const e=t/(this.drawingArea/(this.max-this.min));return this.options.reverse?this.max-e:this.min+e}getPointLabelContext(t){const e=this._pointLabels||[];if(t>=0&&t<e.length){const i=e[t];return function(t,e,i){return Ci(t,{label:i,index:e,type:"pointLabel"})}(this.getContext(),t,i)}}getPointPosition(t,e,i=0){const s=this.getIndexAngle(t)-E+i;return{x:Math.cos(s)*e+this.xCenter,y:Math.sin(s)*e+this.yCenter,angle:s}}getPointPositionForValue(t,e){return this.getPointPosition(t,this.getDistanceFromCenterForValue(e))}getBasePosition(t){return this.getPointPositionForValue(t||0,this.getBaseValue())}getPointLabelPosition(t){const{left:e,top:i,right:s,bottom:n}=this._pointLabelItems[t];return{left:e,top:i,right:s,bottom:n}}drawBackground(){const{backgroundColor:t,grid:{circular:e}}=this.options;if(t){const i=this.ctx;i.save(),i.beginPath(),Eo(this,this.getDistanceFromCenterForValue(this._endValue),e,this._pointLabels.length),i.closePath(),i.fillStyle=t,i.fill(),i.restore()}}drawGrid(){const t=this.ctx,e=this.options,{angleLines:i,grid:s,border:n}=e,o=this._pointLabels.length;let a,r,l;if(e.pointLabels.display&&function(t,e){const{ctx:i,options:{pointLabels:s}}=t;for(let n=e-1;n>=0;n--){const e=t._pointLabelItems[n];if(!e.visible)continue;const o=s.setContext(t.getPointLabelContext(n));Lo(i,o,e);const a=Si(o.font),{x:r,y:l,textAlign:h}=e;Ne(i,t._pointLabels[n],r,l+a.lineHeight/2,a,{color:o.color,textAlign:h,textBaseline:"middle"})}}(this,o),s.display&&this.ticks.forEach(((t,e)=>{if(0!==e||0===e&&this.min<0){r=this.getDistanceFromCenterForValue(t.value);const i=this.getContext(e),a=s.setContext(i),l=n.setContext(i);!function(t,e,i,s,n){const o=t.ctx,a=e.circular,{color:r,lineWidth:l}=e;!a&&!s||!r||!l||i<0||(o.save(),o.strokeStyle=r,o.lineWidth=l,o.setLineDash(n.dash||[]),o.lineDashOffset=n.dashOffset,o.beginPath(),Eo(t,i,a,s),o.closePath(),o.stroke(),o.restore())}(this,a,r,o,l)}})),i.display){for(t.save(),a=o-1;a>=0;a--){const s=i.setContext(this.getPointLabelContext(a)),{color:n,lineWidth:o}=s;o&&n&&(t.lineWidth=o,t.strokeStyle=n,t.setLineDash(s.borderDash),t.lineDashOffset=s.borderDashOffset,r=this.getDistanceFromCenterForValue(e.reverse?this.min:this.max),l=this.getPointPosition(a,r),t.beginPath(),t.moveTo(this.xCenter,this.yCenter),t.lineTo(l.x,l.y),t.stroke())}t.restore()}}drawBorder(){}drawLabels(){const t=this.ctx,e=this.options,i=e.ticks;if(!i.display)return;const s=this.getIndexAngle(0);let n,o;t.save(),t.translate(this.xCenter,this.yCenter),t.rotate(s),t.textAlign="center",t.textBaseline="middle",this.ticks.forEach(((s,a)=>{if(0===a&&this.min>=0&&!e.reverse)return;const r=i.setContext(this.getContext(a)),l=Si(r.font);if(n=this.getDistanceFromCenterForValue(this.ticks[a].value),r.showLabelBackdrop){t.font=l.string,o=t.measureText(s.label).width,t.fillStyle=r.backdropColor;const e=ki(r.backdropPadding);t.fillRect(-o/2-e.left,-n-l.size/2-e.top,o+e.width,l.size+e.height)}Ne(t,s.label,0,-n,l,{color:r.color,strokeColor:r.textStrokeColor,strokeWidth:r.textStrokeWidth})})),t.restore()}drawTitle(){}}const Io={millisecond:{common:!0,size:1,steps:1e3},second:{common:!0,size:1e3,steps:60},minute:{common:!0,size:6e4,steps:60},hour:{common:!0,size:36e5,steps:24},day:{common:!0,size:864e5,steps:30},week:{common:!1,size:6048e5,steps:4},month:{common:!0,size:2628e6,steps:12},quarter:{common:!1,size:7884e6,steps:4},year:{common:!0,size:3154e7}},zo=Object.keys(Io);function Fo(t,e){return t-e}function Vo(t,e){if(s(e))return null;const i=t._adapter,{parser:n,round:o,isoWeekday:r}=t._parseOpts;let l=e;return"function"==typeof n&&(l=n(l)),a(l)||(l="string"==typeof n?i.parse(l,n):i.parse(l)),null===l?null:(o&&(l="week"!==o||!N(r)&&!0!==r?i.startOf(l,o):i.startOf(l,"isoWeek",r)),+l)}function Bo(t,e,i,s){const n=zo.length;for(let o=zo.indexOf(t);o<n-1;++o){const t=Io[zo[o]],n=t.steps?t.steps:Number.MAX_SAFE_INTEGER;if(t.common&&Math.ceil((i-e)/(n*t.size))<=s)return zo[o]}return zo[n-1]}function Wo(t,e,i){if(i){if(i.length){const{lo:s,hi:n}=et(i,e);t[i[s]>=e?i[s]:i[n]]=!0}}else t[e]=!0}function No(t,e,i){const s=[],n={},o=e.length;let a,r;for(a=0;a<o;++a)r=e[a],n[r]=a,s.push({value:r,major:!1});return 0!==o&&i?function(t,e,i,s){const n=t._adapter,o=+n.startOf(e[0].value,s),a=e[e.length-1].value;let r,l;for(r=o;r<=a;r=+n.add(r,1,s))l=i[r],l>=0&&(e[l].major=!0);return e}(t,s,n,i):s}class Ho extends tn{static id="time";static defaults={bounds:"data",adapters:{},time:{parser:!1,unit:!1,round:!1,isoWeekday:!1,minUnit:"millisecond",displayFormats:{}},ticks:{source:"auto",callback:!1,major:{enabled:!1}}};constructor(t){super(t),this._cache={data:[],labels:[],all:[]},this._unit="day",this._majorUnit=void 0,this._offsets={},this._normalized=!1,this._parseOpts=void 0}init(t,e={}){const i=t.time||(t.time={}),s=this._adapter=new In._date(t.adapters.date);s.init(e),b(i.displayFormats,s.formats()),this._parseOpts={parser:i.parser,round:i.round,isoWeekday:i.isoWeekday},super.init(t),this._normalized=e.normalized}parse(t,e){return void 0===t?null:Vo(this,t)}beforeLayout(){super.beforeLayout(),this._cache={data:[],labels:[],all:[]}}determineDataLimits(){const t=this.options,e=this._adapter,i=t.time.unit||"day";let{min:s,max:n,minDefined:o,maxDefined:r}=this.getUserBounds();function l(t){o||isNaN(t.min)||(s=Math.min(s,t.min)),r||isNaN(t.max)||(n=Math.max(n,t.max))}o&&r||(l(this._getLabelBounds()),"ticks"===t.bounds&&"labels"===t.ticks.source||l(this.getMinMax(!1))),s=a(s)&&!isNaN(s)?s:+e.startOf(Date.now(),i),n=a(n)&&!isNaN(n)?n:+e.endOf(Date.now(),i)+1,this.min=Math.min(s,n-1),this.max=Math.max(s+1,n)}_getLabelBounds(){const t=this.getLabelTimestamps();let e=Number.POSITIVE_INFINITY,i=Number.NEGATIVE_INFINITY;return t.length&&(e=t[0],i=t[t.length-1]),{min:e,max:i}}buildTicks(){const t=this.options,e=t.time,i=t.ticks,s="labels"===i.source?this.getLabelTimestamps():this._generate();"ticks"===t.bounds&&s.length&&(this.min=this._userMin||s[0],this.max=this._userMax||s[s.length-1]);const n=this.min,o=nt(s,n,this.max);return this._unit=e.unit||(i.autoSkip?Bo(e.minUnit,this.min,this.max,this._getLabelCapacity(n)):function(t,e,i,s,n){for(let o=zo.length-1;o>=zo.indexOf(i);o--){const i=zo[o];if(Io[i].common&&t._adapter.diff(n,s,i)>=e-1)return i}return zo[i?zo.indexOf(i):0]}(this,o.length,e.minUnit,this.min,this.max)),this._majorUnit=i.major.enabled&&"year"!==this._unit?function(t){for(let e=zo.indexOf(t)+1,i=zo.length;e<i;++e)if(Io[zo[e]].common)return zo[e]}(this._unit):void 0,this.initOffsets(s),t.reverse&&o.reverse(),No(this,o,this._majorUnit)}afterAutoSkip(){this.options.offsetAfterAutoskip&&this.initOffsets(this.ticks.map((t=>+t.value)))}initOffsets(t=[]){let e,i,s=0,n=0;this.options.offset&&t.length&&(e=this.getDecimalForValue(t[0]),s=1===t.length?1-e:(this.getDecimalForValue(t[1])-e)/2,i=this.getDecimalForValue(t[t.length-1]),n=1===t.length?i:(i-this.getDecimalForValue(t[t.length-2]))/2);const o=t.length<3?.5:.25;s=Z(s,0,o),n=Z(n,0,o),this._offsets={start:s,end:n,factor:1/(s+1+n)}}_generate(){const t=this._adapter,e=this.min,i=this.max,s=this.options,n=s.time,o=n.unit||Bo(n.minUnit,e,i,this._getLabelCapacity(e)),a=l(s.ticks.stepSize,1),r="week"===o&&n.isoWeekday,h=N(r)||!0===r,c={};let d,u,f=e;if(h&&(f=+t.startOf(f,"isoWeek",r)),f=+t.startOf(f,h?"day":o),t.diff(i,e,o)>1e5*a)throw new Error(e+" and "+i+" are too far apart with stepSize of "+a+" "+o);const g="data"===s.ticks.source&&this.getDataTimestamps();for(d=f,u=0;d<i;d=+t.add(d,a,o),u++)Wo(c,d,g);return d!==i&&"ticks"!==s.bounds&&1!==u||Wo(c,d,g),Object.keys(c).sort(Fo).map((t=>+t))}getLabelForValue(t){const e=this._adapter,i=this.options.time;return i.tooltipFormat?e.format(t,i.tooltipFormat):e.format(t,i.displayFormats.datetime)}format(t,e){const i=this.options.time.displayFormats,s=this._unit,n=e||i[s];return this._adapter.format(t,n)}_tickFormatFunction(t,e,i,s){const n=this.options,o=n.ticks.callback;if(o)return d(o,[t,e,i],this);const a=n.time.displayFormats,r=this._unit,l=this._majorUnit,h=r&&a[r],c=l&&a[l],u=i[e],f=l&&c&&u&&u.major;return this._adapter.format(t,s||(f?c:h))}generateTickLabels(t){let e,i,s;for(e=0,i=t.length;e<i;++e)s=t[e],s.label=this._tickFormatFunction(s.value,e,t)}getDecimalForValue(t){return null===t?NaN:(t-this.min)/(this.max-this.min)}getPixelForValue(t){const e=this._offsets,i=this.getDecimalForValue(t);return this.getPixelForDecimal((e.start+i)*e.factor)}getValueForPixel(t){const e=this._offsets,i=this.getDecimalForPixel(t)/e.factor-e.end;return this.min+i*(this.max-this.min)}_getLabelSize(t){const e=this.options.ticks,i=this.ctx.measureText(t).width,s=$(this.isHorizontal()?e.maxRotation:e.minRotation),n=Math.cos(s),o=Math.sin(s),a=this._resolveTickFontOptions(0).size;return{w:i*n+a*o,h:i*o+a*n}}_getLabelCapacity(t){const e=this.options.time,i=e.displayFormats,s=i[e.unit]||i.millisecond,n=this._tickFormatFunction(t,0,No(this,[t],this._majorUnit),s),o=this._getLabelSize(n),a=Math.floor(this.isHorizontal()?this.width/o.w:this.height/o.h)-1;return a>0?a:1}getDataTimestamps(){let t,e,i=this._cache.data||[];if(i.length)return i;const s=this.getMatchingVisibleMetas();if(this._normalized&&s.length)return this._cache.data=s[0].controller.getAllParsedValues(this);for(t=0,e=s.length;t<e;++t)i=i.concat(s[t].controller.getAllParsedValues(this));return this._cache.data=this.normalize(i)}getLabelTimestamps(){const t=this._cache.labels||[];let e,i;if(t.length)return t;const s=this.getLabels();for(e=0,i=s.length;e<i;++e)t.push(Vo(this,s[e]));return this._cache.labels=this._normalized?t:this.normalize(t)}normalize(t){return lt(t.sort(Fo))}}function jo(t,e,i){let s,n,o,a,r=0,l=t.length-1;i?(e>=t[r].pos&&e<=t[l].pos&&({lo:r,hi:l}=it(t,"pos",e)),({pos:s,time:o}=t[r]),({pos:n,time:a}=t[l])):(e>=t[r].time&&e<=t[l].time&&({lo:r,hi:l}=it(t,"time",e)),({time:s,pos:o}=t[r]),({time:n,pos:a}=t[l]));const h=n-s;return h?o+(a-o)*(e-s)/h:o}var $o=Object.freeze({__proto__:null,CategoryScale:class extends tn{static id="category";static defaults={ticks:{callback:mo}};constructor(t){super(t),this._startValue=void 0,this._valueRange=0,this._addedLabels=[]}init(t){const e=this._addedLabels;if(e.length){const t=this.getLabels();for(const{index:i,label:s}of e)t[i]===s&&t.splice(i,1);this._addedLabels=[]}super.init(t)}parse(t,e){if(s(t))return null;const i=this.getLabels();return((t,e)=>null===t?null:Z(Math.round(t),0,e))(e=isFinite(e)&&i[e]===t?e:po(i,t,l(e,t),this._addedLabels),i.length-1)}determineDataLimits(){const{minDefined:t,maxDefined:e}=this.getUserBounds();let{min:i,max:s}=this.getMinMax(!0);"ticks"===this.options.bounds&&(t||(i=0),e||(s=this.getLabels().length-1)),this.min=i,this.max=s}buildTicks(){const t=this.min,e=this.max,i=this.options.offset,s=[];let n=this.getLabels();n=0===t&&e===n.length-1?n:n.slice(t,e+1),this._valueRange=Math.max(n.length-(i?0:1),1),this._startValue=this.min-(i?.5:0);for(let i=t;i<=e;i++)s.push({value:i});return s}getLabelForValue(t){return mo.call(this,t)}configure(){super.configure(),this.isHorizontal()||(this._reversePixels=!this._reversePixels)}getPixelForValue(t){return"number"!=typeof t&&(t=this.parse(t)),null===t?NaN:this.getPixelForDecimal((t-this._startValue)/this._valueRange)}getPixelForTick(t){const e=this.ticks;return t<0||t>e.length-1?null:this.getPixelForValue(e[t].value)}getValueForPixel(t){return Math.round(this._startValue+this.getDecimalForPixel(t)*this._valueRange)}getBasePixel(){return this.bottom}},LinearScale:_o,LogarithmicScale:So,RadialLinearScale:Ro,TimeScale:Ho,TimeSeriesScale:class extends Ho{static id="timeseries";static defaults=Ho.defaults;constructor(t){super(t),this._table=[],this._minPos=void 0,this._tableRange=void 0}initOffsets(){const t=this._getTimestampsForTable(),e=this._table=this.buildLookupTable(t);this._minPos=jo(e,this.min),this._tableRange=jo(e,this.max)-this._minPos,super.initOffsets(t)}buildLookupTable(t){const{min:e,max:i}=this,s=[],n=[];let o,a,r,l,h;for(o=0,a=t.length;o<a;++o)l=t[o],l>=e&&l<=i&&s.push(l);if(s.length<2)return[{time:e,pos:0},{time:i,pos:1}];for(o=0,a=s.length;o<a;++o)h=s[o+1],r=s[o-1],l=s[o],Math.round((h+r)/2)!==l&&n.push({time:l,pos:o/(a-1)});return n}_generate(){const t=this.min,e=this.max;let i=super.getDataTimestamps();return i.includes(t)&&i.length||i.splice(0,0,t),i.includes(e)&&1!==i.length||i.push(e),i.sort(((t,e)=>t-e))}_getTimestampsForTable(){let t=this._cache.all||[];if(t.length)return t;const e=this.getDataTimestamps(),i=this.getLabelTimestamps();return t=e.length&&i.length?this.normalize(e.concat(i)):e.length?e:i,t=this._cache.all=t,t}getDecimalForValue(t){return(jo(this._table,t)-this._minPos)/this._tableRange}getValueForPixel(t){const e=this._offsets,i=this.getDecimalForPixel(t)/e.factor-e.end;return jo(this._table,i*this._tableRange+this._minPos,!0)}}});const Yo=["rgb(54, 162, 235)","rgb(255, 99, 132)","rgb(255, 159, 64)","rgb(255, 205, 86)","rgb(75, 192, 192)","rgb(153, 102, 255)","rgb(201, 203, 207)"],Uo=Yo.map((t=>t.replace("rgb(","rgba(").replace(")",", 0.5)")));function Xo(t){return Yo[t%Yo.length]}function qo(t){return Uo[t%Uo.length]}function Ko(t){let e=0;return(i,s)=>{const n=t.getDatasetMeta(s).controller;n instanceof $n?e=function(t,e){return t.backgroundColor=t.data.map((()=>Xo(e++))),e}(i,e):n instanceof Yn?e=function(t,e){return t.backgroundColor=t.data.map((()=>qo(e++))),e}(i,e):n&&(e=function(t,e){return t.borderColor=Xo(e),t.backgroundColor=qo(e),++e}(i,e))}}function Go(t){let e;for(e in t)if(t[e].borderColor||t[e].backgroundColor)return!0;return!1}var Jo={id:"colors",defaults:{enabled:!0,forceOverride:!1},beforeLayout(t,e,i){if(!i.enabled)return;const{data:{datasets:s},options:n}=t.config,{elements:o}=n,a=Go(s)||(r=n)&&(r.borderColor||r.backgroundColor)||o&&Go(o)||"rgba(0,0,0,0.1)"!==ue.borderColor||"rgba(0,0,0,0.1)"!==ue.backgroundColor;var r;if(!i.forceOverride&&a)return;const l=Ko(t);s.forEach(l)}};function Zo(t){if(t._decimated){const e=t._data;delete t._decimated,delete t._data,Object.defineProperty(t,"data",{configurable:!0,enumerable:!0,writable:!0,value:e})}}function Qo(t){t.data.datasets.forEach((t=>{Zo(t)}))}var ta={id:"decimation",defaults:{algorithm:"min-max",enabled:!1},beforeElementsUpdate:(t,e,i)=>{if(!i.enabled)return void Qo(t);const n=t.width;t.data.datasets.forEach(((e,o)=>{const{_data:a,indexAxis:r}=e,l=t.getDatasetMeta(o),h=a||e.data;if("y"===Pi([r,t.options.indexAxis]))return;if(!l.controller.supportsDecimation)return;const c=t.scales[l.xAxisID];if("linear"!==c.type&&"time"!==c.type)return;if(t.options.parsing)return;let{start:d,count:u}=function(t,e){const i=e.length;let s,n=0;const{iScale:o}=t,{min:a,max:r,minDefined:l,maxDefined:h}=o.getUserBounds();return l&&(n=Z(it(e,o.axis,a).lo,0,i-1)),s=h?Z(it(e,o.axis,r).hi+1,n,i)-n:i-n,{start:n,count:s}}(l,h);if(u<=(i.threshold||4*n))return void Zo(e);let f;switch(s(a)&&(e._data=h,delete e.data,Object.defineProperty(e,"data",{configurable:!0,enumerable:!0,get:function(){return this._decimated},set:function(t){this._data=t}})),i.algorithm){case"lttb":f=function(t,e,i,s,n){const o=n.samples||s;if(o>=i)return t.slice(e,e+i);const a=[],r=(i-2)/(o-2);let l=0;const h=e+i-1;let c,d,u,f,g,p=e;for(a[l++]=t[p],c=0;c<o-2;c++){let s,n=0,o=0;const h=Math.floor((c+1)*r)+1+e,m=Math.min(Math.floor((c+2)*r)+1,i)+e,x=m-h;for(s=h;s<m;s++)n+=t[s].x,o+=t[s].y;n/=x,o/=x;const b=Math.floor(c*r)+1+e,_=Math.min(Math.floor((c+1)*r)+1,i)+e,{x:y,y:v}=t[p];for(u=f=-1,s=b;s<_;s++)f=.5*Math.abs((y-n)*(t[s].y-v)-(y-t[s].x)*(o-v)),f>u&&(u=f,d=t[s],g=s);a[l++]=d,p=g}return a[l++]=t[h],a}(h,d,u,n,i);break;case"min-max":f=function(t,e,i,n){let o,a,r,l,h,c,d,u,f,g,p=0,m=0;const x=[],b=e+i-1,_=t[e].x,y=t[b].x-_;for(o=e;o<e+i;++o){a=t[o],r=(a.x-_)/y*n,l=a.y;const e=0|r;if(e===h)l<f?(f=l,c=o):l>g&&(g=l,d=o),p=(m*p+a.x)/++m;else{const i=o-1;if(!s(c)&&!s(d)){const e=Math.min(c,d),s=Math.max(c,d);e!==u&&e!==i&&x.push({...t[e],x:p}),s!==u&&s!==i&&x.push({...t[s],x:p})}o>0&&i!==u&&x.push(t[i]),x.push(a),h=e,m=0,f=g=l,c=d=u=o}}return x}(h,d,u,n);break;default:throw new Error(`Unsupported decimation algorithm '${i.algorithm}'`)}e._decimated=f}))},destroy(t){Qo(t)}};function ea(t,e,i,s){if(s)return;let n=e[t],o=i[t];return"angle"===t&&(n=G(n),o=G(o)),{property:t,start:n,end:o}}function ia(t,e,i){for(;e>t;e--){const t=i[e];if(!isNaN(t.x)&&!isNaN(t.y))break}return e}function sa(t,e,i,s){return t&&e?s(t[i],e[i]):t?t[i]:e?e[i]:0}function na(t,e){let i=[],s=!1;return n(t)?(s=!0,i=t):i=function(t,e){const{x:i=null,y:s=null}=t||{},n=e.points,o=[];return e.segments.forEach((({start:t,end:e})=>{e=ia(t,e,n);const a=n[t],r=n[e];null!==s?(o.push({x:a.x,y:s}),o.push({x:r.x,y:s})):null!==i&&(o.push({x:i,y:a.y}),o.push({x:i,y:r.y}))})),o}(t,e),i.length?new oo({points:i,options:{tension:0},_loop:s,_fullLoop:s}):null}function oa(t){return t&&!1!==t.fill}function aa(t,e,i){let s=t[e].fill;const n=[e];let o;if(!i)return s;for(;!1!==s&&-1===n.indexOf(s);){if(!a(s))return s;if(o=t[s],!o)return!1;if(o.visible)return s;n.push(s),s=o.fill}return!1}function ra(t,e,i){const s=function(t){const e=t.options,i=e.fill;let s=l(i&&i.target,i);void 0===s&&(s=!!e.backgroundColor);if(!1===s||null===s)return!1;if(!0===s)return"origin";return s}(t);if(o(s))return!isNaN(s.value)&&s;let n=parseFloat(s);return a(n)&&Math.floor(n)===n?function(t,e,i,s){"-"!==t&&"+"!==t||(i=e+i);if(i===e||i<0||i>=s)return!1;return i}(s[0],e,n,i):["origin","start","end","stack","shape"].indexOf(s)>=0&&s}function la(t,e,i){const s=[];for(let n=0;n<i.length;n++){const o=i[n],{first:a,last:r,point:l}=ha(o,e,"x");if(!(!l||a&&r))if(a)s.unshift(l);else if(t.push(l),!r)break}t.push(...s)}function ha(t,e,i){const s=t.interpolate(e,i);if(!s)return{};const n=s[i],o=t.segments,a=t.points;let r=!1,l=!1;for(let t=0;t<o.length;t++){const e=o[t],s=a[e.start][i],h=a[e.end][i];if(tt(n,s,h)){r=n===s,l=n===h;break}}return{first:r,last:l,point:s}}class ca{constructor(t){this.x=t.x,this.y=t.y,this.radius=t.radius}pathSegment(t,e,i){const{x:s,y:n,radius:o}=this;return e=e||{start:0,end:O},t.arc(s,n,o,e.end,e.start,!0),!i.bounds}interpolate(t){const{x:e,y:i,radius:s}=this,n=t.angle;return{x:e+Math.cos(n)*s,y:i+Math.sin(n)*s,angle:n}}}function da(t){const{chart:e,fill:i,line:s}=t;if(a(i))return function(t,e){const i=t.getDatasetMeta(e),s=i&&t.isDatasetVisible(e);return s?i.dataset:null}(e,i);if("stack"===i)return function(t){const{scale:e,index:i,line:s}=t,n=[],o=s.segments,a=s.points,r=function(t,e){const i=[],s=t.getMatchingVisibleMetas("line");for(let t=0;t<s.length;t++){const n=s[t];if(n.index===e)break;n.hidden||i.unshift(n.dataset)}return i}(e,i);r.push(na({x:null,y:e.bottom},s));for(let t=0;t<o.length;t++){const e=o[t];for(let t=e.start;t<=e.end;t++)la(n,a[t],r)}return new oo({points:n,options:{}})}(t);if("shape"===i)return!0;const n=function(t){const e=t.scale||{};if(e.getPointPositionForValue)return function(t){const{scale:e,fill:i}=t,s=e.options,n=e.getLabels().length,a=s.reverse?e.max:e.min,r=function(t,e,i){let s;return s="start"===t?i:"end"===t?e.options.reverse?e.min:e.max:o(t)?t.value:e.getBaseValue(),s}(i,e,a),l=[];if(s.grid.circular){const t=e.getPointPositionForValue(0,a);return new ca({x:t.x,y:t.y,radius:e.getDistanceFromCenterForValue(r)})}for(let t=0;t<n;++t)l.push(e.getPointPositionForValue(t,r));return l}(t);return function(t){const{scale:e={},fill:i}=t,s=function(t,e){let i=null;return"start"===t?i=e.bottom:"end"===t?i=e.top:o(t)?i=e.getPixelForValue(t.value):e.getBasePixel&&(i=e.getBasePixel()),i}(i,e);if(a(s)){const t=e.isHorizontal();return{x:t?s:null,y:t?null:s}}return null}(t)}(t);return n instanceof ca?n:na(n,s)}function ua(t,e,i){const s=da(e),{chart:n,index:o,line:a,scale:r,axis:l}=e,h=a.options,c=h.fill,d=h.backgroundColor,{above:u=d,below:f=d}=c||{},g=n.getDatasetMeta(o),p=Ni(n,g);s&&a.points.length&&(Ie(t,i),function(t,e){const{line:i,target:s,above:n,below:o,area:a,scale:r,clip:l}=e,h=i._loop?"angle":e.axis;t.save();let c=o;o!==n&&("x"===h?(fa(t,s,a.top),pa(t,{line:i,target:s,color:n,scale:r,property:h,clip:l}),t.restore(),t.save(),fa(t,s,a.bottom)):"y"===h&&(ga(t,s,a.left),pa(t,{line:i,target:s,color:o,scale:r,property:h,clip:l}),t.restore(),t.save(),ga(t,s,a.right),c=n));pa(t,{line:i,target:s,color:c,scale:r,property:h,clip:l}),t.restore()}(t,{line:a,target:s,above:u,below:f,area:i,scale:r,axis:l,clip:p}),ze(t))}function fa(t,e,i){const{segments:s,points:n}=e;let o=!0,a=!1;t.beginPath();for(const r of s){const{start:s,end:l}=r,h=n[s],c=n[ia(s,l,n)];o?(t.moveTo(h.x,h.y),o=!1):(t.lineTo(h.x,i),t.lineTo(h.x,h.y)),a=!!e.pathSegment(t,r,{move:a}),a?t.closePath():t.lineTo(c.x,i)}t.lineTo(e.first().x,i),t.closePath(),t.clip()}function ga(t,e,i){const{segments:s,points:n}=e;let o=!0,a=!1;t.beginPath();for(const r of s){const{start:s,end:l}=r,h=n[s],c=n[ia(s,l,n)];o?(t.moveTo(h.x,h.y),o=!1):(t.lineTo(i,h.y),t.lineTo(h.x,h.y)),a=!!e.pathSegment(t,r,{move:a}),a?t.closePath():t.lineTo(i,c.y)}t.lineTo(i,e.first().y),t.closePath(),t.clip()}function pa(t,e){const{line:i,target:s,property:n,color:o,scale:a,clip:r}=e,l=function(t,e,i){const s=t.segments,n=t.points,o=e.points,a=[];for(const t of s){let{start:s,end:r}=t;r=ia(s,r,n);const l=ea(i,n[s],n[r],t.loop);if(!e.segments){a.push({source:t,target:l,start:n[s],end:n[r]});continue}const h=Ii(e,l);for(const e of h){const s=ea(i,o[e.start],o[e.end],e.loop),r=Ri(t,n,s);for(const t of r)a.push({source:t,target:e,start:{[i]:sa(l,s,"start",Math.max)},end:{[i]:sa(l,s,"end",Math.min)}})}}return a}(i,s,n);for(const{source:e,target:h,start:c,end:d}of l){const{style:{backgroundColor:l=o}={}}=e,u=!0!==s;t.save(),t.fillStyle=l,ma(t,a,r,u&&ea(n,c,d)),t.beginPath();const f=!!i.pathSegment(t,e);let g;if(u){f?t.closePath():xa(t,s,d,n);const e=!!s.pathSegment(t,h,{move:f,reverse:!0});g=f&&e,g||xa(t,s,c,n)}t.closePath(),t.fill(g?"evenodd":"nonzero"),t.restore()}}function ma(t,e,i,s){const n=e.chart.chartArea,{property:o,start:a,end:r}=s||{};if("x"===o||"y"===o){let e,s,l,h;"x"===o?(e=a,s=n.top,l=r,h=n.bottom):(e=n.left,s=a,l=n.right,h=r),t.beginPath(),i&&(e=Math.max(e,i.left),l=Math.min(l,i.right),s=Math.max(s,i.top),h=Math.min(h,i.bottom)),t.rect(e,s,l-e,h-s),t.clip()}}function xa(t,e,i,s){const n=e.interpolate(i,s);n&&t.lineTo(n.x,n.y)}var ba={id:"filler",afterDatasetsUpdate(t,e,i){const s=(t.data.datasets||[]).length,n=[];let o,a,r,l;for(a=0;a<s;++a)o=t.getDatasetMeta(a),r=o.dataset,l=null,r&&r.options&&r instanceof oo&&(l={visible:t.isDatasetVisible(a),index:a,fill:ra(r,a,s),chart:t,axis:o.controller.options.indexAxis,scale:o.vScale,line:r}),o.$filler=l,n.push(l);for(a=0;a<s;++a)l=n[a],l&&!1!==l.fill&&(l.fill=aa(n,a,i.propagate))},beforeDraw(t,e,i){const s="beforeDraw"===i.drawTime,n=t.getSortedVisibleDatasetMetas(),o=t.chartArea;for(let e=n.length-1;e>=0;--e){const i=n[e].$filler;i&&(i.line.updateControlPoints(o,i.axis),s&&i.fill&&ua(t.ctx,i,o))}},beforeDatasetsDraw(t,e,i){if("beforeDatasetsDraw"!==i.drawTime)return;const s=t.getSortedVisibleDatasetMetas();for(let e=s.length-1;e>=0;--e){const i=s[e].$filler;oa(i)&&ua(t.ctx,i,t.chartArea)}},beforeDatasetDraw(t,e,i){const s=e.meta.$filler;oa(s)&&"beforeDatasetDraw"===i.drawTime&&ua(t.ctx,s,t.chartArea)},defaults:{propagate:!0,drawTime:"beforeDatasetDraw"}};const _a=(t,e)=>{let{boxHeight:i=e,boxWidth:s=e}=t;return t.usePointStyle&&(i=Math.min(i,e),s=t.pointStyleWidth||Math.min(s,e)),{boxWidth:s,boxHeight:i,itemHeight:Math.max(e,i)}};class ya extends $s{constructor(t){super(),this._added=!1,this.legendHitBoxes=[],this._hoveredItem=null,this.doughnutMode=!1,this.chart=t.chart,this.options=t.options,this.ctx=t.ctx,this.legendItems=void 0,this.columnSizes=void 0,this.lineWidths=void 0,this.maxHeight=void 0,this.maxWidth=void 0,this.top=void 0,this.bottom=void 0,this.left=void 0,this.right=void 0,this.height=void 0,this.width=void 0,this._margins=void 0,this.position=void 0,this.weight=void 0,this.fullSize=void 0}update(t,e,i){this.maxWidth=t,this.maxHeight=e,this._margins=i,this.setDimensions(),this.buildLabels(),this.fit()}setDimensions(){this.isHorizontal()?(this.width=this.maxWidth,this.left=this._margins.left,this.right=this.width):(this.height=this.maxHeight,this.top=this._margins.top,this.bottom=this.height)}buildLabels(){const t=this.options.labels||{};let e=d(t.generateLabels,[this.chart],this)||[];t.filter&&(e=e.filter((e=>t.filter(e,this.chart.data)))),t.sort&&(e=e.sort(((e,i)=>t.sort(e,i,this.chart.data)))),this.options.reverse&&e.reverse(),this.legendItems=e}fit(){const{options:t,ctx:e}=this;if(!t.display)return void(this.width=this.height=0);const i=t.labels,s=Si(i.font),n=s.size,o=this._computeTitleHeight(),{boxWidth:a,itemHeight:r}=_a(i,n);let l,h;e.font=s.string,this.isHorizontal()?(l=this.maxWidth,h=this._fitRows(o,n,a,r)+10):(h=this.maxHeight,l=this._fitCols(o,s,a,r)+10),this.width=Math.min(l,t.maxWidth||this.maxWidth),this.height=Math.min(h,t.maxHeight||this.maxHeight)}_fitRows(t,e,i,s){const{ctx:n,maxWidth:o,options:{labels:{padding:a}}}=this,r=this.legendHitBoxes=[],l=this.lineWidths=[0],h=s+a;let c=t;n.textAlign="left",n.textBaseline="middle";let d=-1,u=-h;return this.legendItems.forEach(((t,f)=>{const g=i+e/2+n.measureText(t.text).width;(0===f||l[l.length-1]+g+2*a>o)&&(c+=h,l[l.length-(f>0?0:1)]=0,u+=h,d++),r[f]={left:0,top:u,row:d,width:g,height:s},l[l.length-1]+=g+a})),c}_fitCols(t,e,i,s){const{ctx:n,maxHeight:o,options:{labels:{padding:a}}}=this,r=this.legendHitBoxes=[],l=this.columnSizes=[],h=o-t;let c=a,d=0,u=0,f=0,g=0;return this.legendItems.forEach(((t,o)=>{const{itemWidth:p,itemHeight:m}=function(t,e,i,s,n){const o=function(t,e,i,s){let n=t.text;n&&"string"!=typeof n&&(n=n.reduce(((t,e)=>t.length>e.length?t:e)));return e+i.size/2+s.measureText(n).width}(s,t,e,i),a=function(t,e,i){let s=t;"string"!=typeof e.text&&(s=va(e,i));return s}(n,s,e.lineHeight);return{itemWidth:o,itemHeight:a}}(i,e,n,t,s);o>0&&u+m+2*a>h&&(c+=d+a,l.push({width:d,height:u}),f+=d+a,g++,d=u=0),r[o]={left:f,top:u,col:g,width:p,height:m},d=Math.max(d,p),u+=m+a})),c+=d,l.push({width:d,height:u}),c}adjustHitBoxes(){if(!this.options.display)return;const t=this._computeTitleHeight(),{legendHitBoxes:e,options:{align:i,labels:{padding:s},rtl:n}}=this,o=Oi(n,this.left,this.width);if(this.isHorizontal()){let n=0,a=ft(i,this.left+s,this.right-this.lineWidths[n]);for(const r of e)n!==r.row&&(n=r.row,a=ft(i,this.left+s,this.right-this.lineWidths[n])),r.top+=this.top+t+s,r.left=o.leftForLtr(o.x(a),r.width),a+=r.width+s}else{let n=0,a=ft(i,this.top+t+s,this.bottom-this.columnSizes[n].height);for(const r of e)r.col!==n&&(n=r.col,a=ft(i,this.top+t+s,this.bottom-this.columnSizes[n].height)),r.top=a,r.left+=this.left+s,r.left=o.leftForLtr(o.x(r.left),r.width),a+=r.height+s}}isHorizontal(){return"top"===this.options.position||"bottom"===this.options.position}draw(){if(this.options.display){const t=this.ctx;Ie(t,this),this._draw(),ze(t)}}_draw(){const{options:t,columnSizes:e,lineWidths:i,ctx:s}=this,{align:n,labels:o}=t,a=ue.color,r=Oi(t.rtl,this.left,this.width),h=Si(o.font),{padding:c}=o,d=h.size,u=d/2;let f;this.drawTitle(),s.textAlign=r.textAlign("left"),s.textBaseline="middle",s.lineWidth=.5,s.font=h.string;const{boxWidth:g,boxHeight:p,itemHeight:m}=_a(o,d),x=this.isHorizontal(),b=this._computeTitleHeight();f=x?{x:ft(n,this.left+c,this.right-i[0]),y:this.top+c+b,line:0}:{x:this.left+c,y:ft(n,this.top+b+c,this.bottom-e[0].height),line:0},Ai(this.ctx,t.textDirection);const _=m+c;this.legendItems.forEach(((y,v)=>{s.strokeStyle=y.fontColor,s.fillStyle=y.fontColor;const M=s.measureText(y.text).width,w=r.textAlign(y.textAlign||(y.textAlign=o.textAlign)),k=g+u+M;let S=f.x,P=f.y;r.setWidth(this.width),x?v>0&&S+k+c>this.right&&(P=f.y+=_,f.line++,S=f.x=ft(n,this.left+c,this.right-i[f.line])):v>0&&P+_>this.bottom&&(S=f.x=S+e[f.line].width+c,f.line++,P=f.y=ft(n,this.top+b+c,this.bottom-e[f.line].height));if(function(t,e,i){if(isNaN(g)||g<=0||isNaN(p)||p<0)return;s.save();const n=l(i.lineWidth,1);if(s.fillStyle=l(i.fillStyle,a),s.lineCap=l(i.lineCap,"butt"),s.lineDashOffset=l(i.lineDashOffset,0),s.lineJoin=l(i.lineJoin,"miter"),s.lineWidth=n,s.strokeStyle=l(i.strokeStyle,a),s.setLineDash(l(i.lineDash,[])),o.usePointStyle){const a={radius:p*Math.SQRT2/2,pointStyle:i.pointStyle,rotation:i.rotation,borderWidth:n},l=r.xPlus(t,g/2);Ee(s,a,l,e+u,o.pointStyleWidth&&g)}else{const o=e+Math.max((d-p)/2,0),a=r.leftForLtr(t,g),l=wi(i.borderRadius);s.beginPath(),Object.values(l).some((t=>0!==t))?He(s,{x:a,y:o,w:g,h:p,radius:l}):s.rect(a,o,g,p),s.fill(),0!==n&&s.stroke()}s.restore()}(r.x(S),P,y),S=gt(w,S+g+u,x?S+k:this.right,t.rtl),function(t,e,i){Ne(s,i.text,t,e+m/2,h,{strikethrough:i.hidden,textAlign:r.textAlign(i.textAlign)})}(r.x(S),P,y),x)f.x+=k+c;else if("string"!=typeof y.text){const t=h.lineHeight;f.y+=va(y,t)+c}else f.y+=_})),Ti(this.ctx,t.textDirection)}drawTitle(){const t=this.options,e=t.title,i=Si(e.font),s=ki(e.padding);if(!e.display)return;const n=Oi(t.rtl,this.left,this.width),o=this.ctx,a=e.position,r=i.size/2,l=s.top+r;let h,c=this.left,d=this.width;if(this.isHorizontal())d=Math.max(...this.lineWidths),h=this.top+l,c=ft(t.align,c,this.right-d);else{const e=this.columnSizes.reduce(((t,e)=>Math.max(t,e.height)),0);h=l+ft(t.align,this.top,this.bottom-e-t.labels.padding-this._computeTitleHeight())}const u=ft(a,c,c+d);o.textAlign=n.textAlign(ut(a)),o.textBaseline="middle",o.strokeStyle=e.color,o.fillStyle=e.color,o.font=i.string,Ne(o,e.text,u,h,i)}_computeTitleHeight(){const t=this.options.title,e=Si(t.font),i=ki(t.padding);return t.display?e.lineHeight+i.height:0}_getLegendItemAt(t,e){let i,s,n;if(tt(t,this.left,this.right)&&tt(e,this.top,this.bottom))for(n=this.legendHitBoxes,i=0;i<n.length;++i)if(s=n[i],tt(t,s.left,s.left+s.width)&&tt(e,s.top,s.top+s.height))return this.legendItems[i];return null}handleEvent(t){const e=this.options;if(!function(t,e){if(("mousemove"===t||"mouseout"===t)&&(e.onHover||e.onLeave))return!0;if(e.onClick&&("click"===t||"mouseup"===t))return!0;return!1}(t.type,e))return;const i=this._getLegendItemAt(t.x,t.y);if("mousemove"===t.type||"mouseout"===t.type){const o=this._hoveredItem,a=(n=i,null!==(s=o)&&null!==n&&s.datasetIndex===n.datasetIndex&&s.index===n.index);o&&!a&&d(e.onLeave,[t,o,this],this),this._hoveredItem=i,i&&!a&&d(e.onHover,[t,i,this],this)}else i&&d(e.onClick,[t,i,this],this);var s,n}}function va(t,e){return e*(t.text?t.text.length:0)}var Ma={id:"legend",_element:ya,start(t,e,i){const s=t.legend=new ya({ctx:t.ctx,options:i,chart:t});ls.configure(t,s,i),ls.addBox(t,s)},stop(t){ls.removeBox(t,t.legend),delete t.legend},beforeUpdate(t,e,i){const s=t.legend;ls.configure(t,s,i),s.options=i},afterUpdate(t){const e=t.legend;e.buildLabels(),e.adjustHitBoxes()},afterEvent(t,e){e.replay||t.legend.handleEvent(e.event)},defaults:{display:!0,position:"top",align:"center",fullSize:!0,reverse:!1,weight:1e3,onClick(t,e,i){const s=e.datasetIndex,n=i.chart;n.isDatasetVisible(s)?(n.hide(s),e.hidden=!0):(n.show(s),e.hidden=!1)},onHover:null,onLeave:null,labels:{color:t=>t.chart.options.color,boxWidth:40,padding:10,generateLabels(t){const e=t.data.datasets,{labels:{usePointStyle:i,pointStyle:s,textAlign:n,color:o,useBorderRadius:a,borderRadius:r}}=t.legend.options;return t._getSortedDatasetMetas().map((t=>{const l=t.controller.getStyle(i?0:void 0),h=ki(l.borderWidth);return{text:e[t.index].label,fillStyle:l.backgroundColor,fontColor:o,hidden:!t.visible,lineCap:l.borderCapStyle,lineDash:l.borderDash,lineDashOffset:l.borderDashOffset,lineJoin:l.borderJoinStyle,lineWidth:(h.width+h.height)/4,strokeStyle:l.borderColor,pointStyle:s||l.pointStyle,rotation:l.rotation,textAlign:n||l.textAlign,borderRadius:a&&(r||l.borderRadius),datasetIndex:t.index}}),this)}},title:{color:t=>t.chart.options.color,display:!1,position:"center",text:""}},descriptors:{_scriptable:t=>!t.startsWith("on"),labels:{_scriptable:t=>!["generateLabels","filter","sort"].includes(t)}}};class wa extends $s{constructor(t){super(),this.chart=t.chart,this.options=t.options,this.ctx=t.ctx,this._padding=void 0,this.top=void 0,this.bottom=void 0,this.left=void 0,this.right=void 0,this.width=void 0,this.height=void 0,this.position=void 0,this.weight=void 0,this.fullSize=void 0}update(t,e){const i=this.options;if(this.left=0,this.top=0,!i.display)return void(this.width=this.height=this.right=this.bottom=0);this.width=this.right=t,this.height=this.bottom=e;const s=n(i.text)?i.text.length:1;this._padding=ki(i.padding);const o=s*Si(i.font).lineHeight+this._padding.height;this.isHorizontal()?this.height=o:this.width=o}isHorizontal(){const t=this.options.position;return"top"===t||"bottom"===t}_drawArgs(t){const{top:e,left:i,bottom:s,right:n,options:o}=this,a=o.align;let r,l,h,c=0;return this.isHorizontal()?(l=ft(a,i,n),h=e+t,r=n-i):("left"===o.position?(l=i+t,h=ft(a,s,e),c=-.5*C):(l=n-t,h=ft(a,e,s),c=.5*C),r=s-e),{titleX:l,titleY:h,maxWidth:r,rotation:c}}draw(){const t=this.ctx,e=this.options;if(!e.display)return;const i=Si(e.font),s=i.lineHeight/2+this._padding.top,{titleX:n,titleY:o,maxWidth:a,rotation:r}=this._drawArgs(s);Ne(t,e.text,0,0,i,{color:e.color,maxWidth:a,rotation:r,textAlign:ut(e.align),textBaseline:"middle",translation:[n,o]})}}var ka={id:"title",_element:wa,start(t,e,i){!function(t,e){const i=new wa({ctx:t.ctx,options:e,chart:t});ls.configure(t,i,e),ls.addBox(t,i),t.titleBlock=i}(t,i)},stop(t){const e=t.titleBlock;ls.removeBox(t,e),delete t.titleBlock},beforeUpdate(t,e,i){const s=t.titleBlock;ls.configure(t,s,i),s.options=i},defaults:{align:"center",display:!1,font:{weight:"bold"},fullSize:!0,padding:10,position:"top",text:"",weight:2e3},defaultRoutes:{color:"color"},descriptors:{_scriptable:!0,_indexable:!1}};const Sa=new WeakMap;var Pa={id:"subtitle",start(t,e,i){const s=new wa({ctx:t.ctx,options:i,chart:t});ls.configure(t,s,i),ls.addBox(t,s),Sa.set(t,s)},stop(t){ls.removeBox(t,Sa.get(t)),Sa.delete(t)},beforeUpdate(t,e,i){const s=Sa.get(t);ls.configure(t,s,i),s.options=i},defaults:{align:"center",display:!1,font:{weight:"normal"},fullSize:!0,padding:0,position:"top",text:"",weight:1500},defaultRoutes:{color:"color"},descriptors:{_scriptable:!0,_indexable:!1}};const Da={average(t){if(!t.length)return!1;let e,i,s=new Set,n=0,o=0;for(e=0,i=t.length;e<i;++e){const i=t[e].element;if(i&&i.hasValue()){const t=i.tooltipPosition();s.add(t.x),n+=t.y,++o}}if(0===o||0===s.size)return!1;return{x:[...s].reduce(((t,e)=>t+e))/s.size,y:n/o}},nearest(t,e){if(!t.length)return!1;let i,s,n,o=e.x,a=e.y,r=Number.POSITIVE_INFINITY;for(i=0,s=t.length;i<s;++i){const s=t[i].element;if(s&&s.hasValue()){const t=q(e,s.getCenterPoint());t<r&&(r=t,n=s)}}if(n){const t=n.tooltipPosition();o=t.x,a=t.y}return{x:o,y:a}}};function Ca(t,e){return e&&(n(e)?Array.prototype.push.apply(t,e):t.push(e)),t}function Oa(t){return("string"==typeof t||t instanceof String)&&t.indexOf("\n")>-1?t.split("\n"):t}function Aa(t,e){const{element:i,datasetIndex:s,index:n}=e,o=t.getDatasetMeta(s).controller,{label:a,value:r}=o.getLabelAndValue(n);return{chart:t,label:a,parsed:o.getParsed(n),raw:t.data.datasets[s].data[n],formattedValue:r,dataset:o.getDataset(),dataIndex:n,datasetIndex:s,element:i}}function Ta(t,e){const i=t.chart.ctx,{body:s,footer:n,title:o}=t,{boxWidth:a,boxHeight:r}=e,l=Si(e.bodyFont),h=Si(e.titleFont),c=Si(e.footerFont),d=o.length,f=n.length,g=s.length,p=ki(e.padding);let m=p.height,x=0,b=s.reduce(((t,e)=>t+e.before.length+e.lines.length+e.after.length),0);if(b+=t.beforeBody.length+t.afterBody.length,d&&(m+=d*h.lineHeight+(d-1)*e.titleSpacing+e.titleMarginBottom),b){m+=g*(e.displayColors?Math.max(r,l.lineHeight):l.lineHeight)+(b-g)*l.lineHeight+(b-1)*e.bodySpacing}f&&(m+=e.footerMarginTop+f*c.lineHeight+(f-1)*e.footerSpacing);let _=0;const y=function(t){x=Math.max(x,i.measureText(t).width+_)};return i.save(),i.font=h.string,u(t.title,y),i.font=l.string,u(t.beforeBody.concat(t.afterBody),y),_=e.displayColors?a+2+e.boxPadding:0,u(s,(t=>{u(t.before,y),u(t.lines,y),u(t.after,y)})),_=0,i.font=c.string,u(t.footer,y),i.restore(),x+=p.width,{width:x,height:m}}function La(t,e,i,s){const{x:n,width:o}=i,{width:a,chartArea:{left:r,right:l}}=t;let h="center";return"center"===s?h=n<=(r+l)/2?"left":"right":n<=o/2?h="left":n>=a-o/2&&(h="right"),function(t,e,i,s){const{x:n,width:o}=s,a=i.caretSize+i.caretPadding;return"left"===t&&n+o+a>e.width||"right"===t&&n-o-a<0||void 0}(h,t,e,i)&&(h="center"),h}function Ea(t,e,i){const s=i.yAlign||e.yAlign||function(t,e){const{y:i,height:s}=e;return i<s/2?"top":i>t.height-s/2?"bottom":"center"}(t,i);return{xAlign:i.xAlign||e.xAlign||La(t,e,i,s),yAlign:s}}function Ra(t,e,i,s){const{caretSize:n,caretPadding:o,cornerRadius:a}=t,{xAlign:r,yAlign:l}=i,h=n+o,{topLeft:c,topRight:d,bottomLeft:u,bottomRight:f}=wi(a);let g=function(t,e){let{x:i,width:s}=t;return"right"===e?i-=s:"center"===e&&(i-=s/2),i}(e,r);const p=function(t,e,i){let{y:s,height:n}=t;return"top"===e?s+=i:s-="bottom"===e?n+i:n/2,s}(e,l,h);return"center"===l?"left"===r?g+=h:"right"===r&&(g-=h):"left"===r?g-=Math.max(c,u)+n:"right"===r&&(g+=Math.max(d,f)+n),{x:Z(g,0,s.width-e.width),y:Z(p,0,s.height-e.height)}}function Ia(t,e,i){const s=ki(i.padding);return"center"===e?t.x+t.width/2:"right"===e?t.x+t.width-s.right:t.x+s.left}function za(t){return Ca([],Oa(t))}function Fa(t,e){const i=e&&e.dataset&&e.dataset.tooltip&&e.dataset.tooltip.callbacks;return i?t.override(i):t}const Va={beforeTitle:e,title(t){if(t.length>0){const e=t[0],i=e.chart.data.labels,s=i?i.length:0;if(this&&this.options&&"dataset"===this.options.mode)return e.dataset.label||"";if(e.label)return e.label;if(s>0&&e.dataIndex<s)return i[e.dataIndex]}return""},afterTitle:e,beforeBody:e,beforeLabel:e,label(t){if(this&&this.options&&"dataset"===this.options.mode)return t.label+": "+t.formattedValue||t.formattedValue;let e=t.dataset.label||"";e&&(e+=": ");const i=t.formattedValue;return s(i)||(e+=i),e},labelColor(t){const e=t.chart.getDatasetMeta(t.datasetIndex).controller.getStyle(t.dataIndex);return{borderColor:e.borderColor,backgroundColor:e.backgroundColor,borderWidth:e.borderWidth,borderDash:e.borderDash,borderDashOffset:e.borderDashOffset,borderRadius:0}},labelTextColor(){return this.options.bodyColor},labelPointStyle(t){const e=t.chart.getDatasetMeta(t.datasetIndex).controller.getStyle(t.dataIndex);return{pointStyle:e.pointStyle,rotation:e.rotation}},afterLabel:e,afterBody:e,beforeFooter:e,footer:e,afterFooter:e};function Ba(t,e,i,s){const n=t[e].call(i,s);return void 0===n?Va[e].call(i,s):n}class Wa extends $s{static positioners=Da;constructor(t){super(),this.opacity=0,this._active=[],this._eventPosition=void 0,this._size=void 0,this._cachedAnimations=void 0,this._tooltipItems=[],this.$animations=void 0,this.$context=void 0,this.chart=t.chart,this.options=t.options,this.dataPoints=void 0,this.title=void 0,this.beforeBody=void 0,this.body=void 0,this.afterBody=void 0,this.footer=void 0,this.xAlign=void 0,this.yAlign=void 0,this.x=void 0,this.y=void 0,this.height=void 0,this.width=void 0,this.caretX=void 0,this.caretY=void 0,this.labelColors=void 0,this.labelPointStyles=void 0,this.labelTextColors=void 0}initialize(t){this.options=t,this._cachedAnimations=void 0,this.$context=void 0}_resolveAnimations(){const t=this._cachedAnimations;if(t)return t;const e=this.chart,i=this.options.setContext(this.getContext()),s=i.enabled&&e.options.animation&&i.animations,n=new Ts(this.chart,s);return s._cacheable&&(this._cachedAnimations=Object.freeze(n)),n}getContext(){return this.$context||(this.$context=(t=this.chart.getContext(),e=this,i=this._tooltipItems,Ci(t,{tooltip:e,tooltipItems:i,type:"tooltip"})));var t,e,i}getTitle(t,e){const{callbacks:i}=e,s=Ba(i,"beforeTitle",this,t),n=Ba(i,"title",this,t),o=Ba(i,"afterTitle",this,t);let a=[];return a=Ca(a,Oa(s)),a=Ca(a,Oa(n)),a=Ca(a,Oa(o)),a}getBeforeBody(t,e){return za(Ba(e.callbacks,"beforeBody",this,t))}getBody(t,e){const{callbacks:i}=e,s=[];return u(t,(t=>{const e={before:[],lines:[],after:[]},n=Fa(i,t);Ca(e.before,Oa(Ba(n,"beforeLabel",this,t))),Ca(e.lines,Ba(n,"label",this,t)),Ca(e.after,Oa(Ba(n,"afterLabel",this,t))),s.push(e)})),s}getAfterBody(t,e){return za(Ba(e.callbacks,"afterBody",this,t))}getFooter(t,e){const{callbacks:i}=e,s=Ba(i,"beforeFooter",this,t),n=Ba(i,"footer",this,t),o=Ba(i,"afterFooter",this,t);let a=[];return a=Ca(a,Oa(s)),a=Ca(a,Oa(n)),a=Ca(a,Oa(o)),a}_createItems(t){const e=this._active,i=this.chart.data,s=[],n=[],o=[];let a,r,l=[];for(a=0,r=e.length;a<r;++a)l.push(Aa(this.chart,e[a]));return t.filter&&(l=l.filter(((e,s,n)=>t.filter(e,s,n,i)))),t.itemSort&&(l=l.sort(((e,s)=>t.itemSort(e,s,i)))),u(l,(e=>{const i=Fa(t.callbacks,e);s.push(Ba(i,"labelColor",this,e)),n.push(Ba(i,"labelPointStyle",this,e)),o.push(Ba(i,"labelTextColor",this,e))})),this.labelColors=s,this.labelPointStyles=n,this.labelTextColors=o,this.dataPoints=l,l}update(t,e){const i=this.options.setContext(this.getContext()),s=this._active;let n,o=[];if(s.length){const t=Da[i.position].call(this,s,this._eventPosition);o=this._createItems(i),this.title=this.getTitle(o,i),this.beforeBody=this.getBeforeBody(o,i),this.body=this.getBody(o,i),this.afterBody=this.getAfterBody(o,i),this.footer=this.getFooter(o,i);const e=this._size=Ta(this,i),a=Object.assign({},t,e),r=Ea(this.chart,i,a),l=Ra(i,a,r,this.chart);this.xAlign=r.xAlign,this.yAlign=r.yAlign,n={opacity:1,x:l.x,y:l.y,width:e.width,height:e.height,caretX:t.x,caretY:t.y}}else 0!==this.opacity&&(n={opacity:0});this._tooltipItems=o,this.$context=void 0,n&&this._resolveAnimations().update(this,n),t&&i.external&&i.external.call(this,{chart:this.chart,tooltip:this,replay:e})}drawCaret(t,e,i,s){const n=this.getCaretPosition(t,i,s);e.lineTo(n.x1,n.y1),e.lineTo(n.x2,n.y2),e.lineTo(n.x3,n.y3)}getCaretPosition(t,e,i){const{xAlign:s,yAlign:n}=this,{caretSize:o,cornerRadius:a}=i,{topLeft:r,topRight:l,bottomLeft:h,bottomRight:c}=wi(a),{x:d,y:u}=t,{width:f,height:g}=e;let p,m,x,b,_,y;return"center"===n?(_=u+g/2,"left"===s?(p=d,m=p-o,b=_+o,y=_-o):(p=d+f,m=p+o,b=_-o,y=_+o),x=p):(m="left"===s?d+Math.max(r,h)+o:"right"===s?d+f-Math.max(l,c)-o:this.caretX,"top"===n?(b=u,_=b-o,p=m-o,x=m+o):(b=u+g,_=b+o,p=m+o,x=m-o),y=b),{x1:p,x2:m,x3:x,y1:b,y2:_,y3:y}}drawTitle(t,e,i){const s=this.title,n=s.length;let o,a,r;if(n){const l=Oi(i.rtl,this.x,this.width);for(t.x=Ia(this,i.titleAlign,i),e.textAlign=l.textAlign(i.titleAlign),e.textBaseline="middle",o=Si(i.titleFont),a=i.titleSpacing,e.fillStyle=i.titleColor,e.font=o.string,r=0;r<n;++r)e.fillText(s[r],l.x(t.x),t.y+o.lineHeight/2),t.y+=o.lineHeight+a,r+1===n&&(t.y+=i.titleMarginBottom-a)}}_drawColorBox(t,e,i,s,n){const a=this.labelColors[i],r=this.labelPointStyles[i],{boxHeight:l,boxWidth:h}=n,c=Si(n.bodyFont),d=Ia(this,"left",n),u=s.x(d),f=l<c.lineHeight?(c.lineHeight-l)/2:0,g=e.y+f;if(n.usePointStyle){const e={radius:Math.min(h,l)/2,pointStyle:r.pointStyle,rotation:r.rotation,borderWidth:1},i=s.leftForLtr(u,h)+h/2,o=g+l/2;t.strokeStyle=n.multiKeyBackground,t.fillStyle=n.multiKeyBackground,Le(t,e,i,o),t.strokeStyle=a.borderColor,t.fillStyle=a.backgroundColor,Le(t,e,i,o)}else{t.lineWidth=o(a.borderWidth)?Math.max(...Object.values(a.borderWidth)):a.borderWidth||1,t.strokeStyle=a.borderColor,t.setLineDash(a.borderDash||[]),t.lineDashOffset=a.borderDashOffset||0;const e=s.leftForLtr(u,h),i=s.leftForLtr(s.xPlus(u,1),h-2),r=wi(a.borderRadius);Object.values(r).some((t=>0!==t))?(t.beginPath(),t.fillStyle=n.multiKeyBackground,He(t,{x:e,y:g,w:h,h:l,radius:r}),t.fill(),t.stroke(),t.fillStyle=a.backgroundColor,t.beginPath(),He(t,{x:i,y:g+1,w:h-2,h:l-2,radius:r}),t.fill()):(t.fillStyle=n.multiKeyBackground,t.fillRect(e,g,h,l),t.strokeRect(e,g,h,l),t.fillStyle=a.backgroundColor,t.fillRect(i,g+1,h-2,l-2))}t.fillStyle=this.labelTextColors[i]}drawBody(t,e,i){const{body:s}=this,{bodySpacing:n,bodyAlign:o,displayColors:a,boxHeight:r,boxWidth:l,boxPadding:h}=i,c=Si(i.bodyFont);let d=c.lineHeight,f=0;const g=Oi(i.rtl,this.x,this.width),p=function(i){e.fillText(i,g.x(t.x+f),t.y+d/2),t.y+=d+n},m=g.textAlign(o);let x,b,_,y,v,M,w;for(e.textAlign=o,e.textBaseline="middle",e.font=c.string,t.x=Ia(this,m,i),e.fillStyle=i.bodyColor,u(this.beforeBody,p),f=a&&"right"!==m?"center"===o?l/2+h:l+2+h:0,y=0,M=s.length;y<M;++y){for(x=s[y],b=this.labelTextColors[y],e.fillStyle=b,u(x.before,p),_=x.lines,a&&_.length&&(this._drawColorBox(e,t,y,g,i),d=Math.max(c.lineHeight,r)),v=0,w=_.length;v<w;++v)p(_[v]),d=c.lineHeight;u(x.after,p)}f=0,d=c.lineHeight,u(this.afterBody,p),t.y-=n}drawFooter(t,e,i){const s=this.footer,n=s.length;let o,a;if(n){const r=Oi(i.rtl,this.x,this.width);for(t.x=Ia(this,i.footerAlign,i),t.y+=i.footerMarginTop,e.textAlign=r.textAlign(i.footerAlign),e.textBaseline="middle",o=Si(i.footerFont),e.fillStyle=i.footerColor,e.font=o.string,a=0;a<n;++a)e.fillText(s[a],r.x(t.x),t.y+o.lineHeight/2),t.y+=o.lineHeight+i.footerSpacing}}drawBackground(t,e,i,s){const{xAlign:n,yAlign:o}=this,{x:a,y:r}=t,{width:l,height:h}=i,{topLeft:c,topRight:d,bottomLeft:u,bottomRight:f}=wi(s.cornerRadius);e.fillStyle=s.backgroundColor,e.strokeStyle=s.borderColor,e.lineWidth=s.borderWidth,e.beginPath(),e.moveTo(a+c,r),"top"===o&&this.drawCaret(t,e,i,s),e.lineTo(a+l-d,r),e.quadraticCurveTo(a+l,r,a+l,r+d),"center"===o&&"right"===n&&this.drawCaret(t,e,i,s),e.lineTo(a+l,r+h-f),e.quadraticCurveTo(a+l,r+h,a+l-f,r+h),"bottom"===o&&this.drawCaret(t,e,i,s),e.lineTo(a+u,r+h),e.quadraticCurveTo(a,r+h,a,r+h-u),"center"===o&&"left"===n&&this.drawCaret(t,e,i,s),e.lineTo(a,r+c),e.quadraticCurveTo(a,r,a+c,r),e.closePath(),e.fill(),s.borderWidth>0&&e.stroke()}_updateAnimationTarget(t){const e=this.chart,i=this.$animations,s=i&&i.x,n=i&&i.y;if(s||n){const i=Da[t.position].call(this,this._active,this._eventPosition);if(!i)return;const o=this._size=Ta(this,t),a=Object.assign({},i,this._size),r=Ea(e,t,a),l=Ra(t,a,r,e);s._to===l.x&&n._to===l.y||(this.xAlign=r.xAlign,this.yAlign=r.yAlign,this.width=o.width,this.height=o.height,this.caretX=i.x,this.caretY=i.y,this._resolveAnimations().update(this,l))}}_willRender(){return!!this.opacity}draw(t){const e=this.options.setContext(this.getContext());let i=this.opacity;if(!i)return;this._updateAnimationTarget(e);const s={width:this.width,height:this.height},n={x:this.x,y:this.y};i=Math.abs(i)<.001?0:i;const o=ki(e.padding),a=this.title.length||this.beforeBody.length||this.body.length||this.afterBody.length||this.footer.length;e.enabled&&a&&(t.save(),t.globalAlpha=i,this.drawBackground(n,t,s,e),Ai(t,e.textDirection),n.y+=o.top,this.drawTitle(n,t,e),this.drawBody(n,t,e),this.drawFooter(n,t,e),Ti(t,e.textDirection),t.restore())}getActiveElements(){return this._active||[]}setActiveElements(t,e){const i=this._active,s=t.map((({datasetIndex:t,index:e})=>{const i=this.chart.getDatasetMeta(t);if(!i)throw new Error("Cannot find a dataset at index "+t);return{datasetIndex:t,element:i.data[e],index:e}})),n=!f(i,s),o=this._positionChanged(s,e);(n||o)&&(this._active=s,this._eventPosition=e,this._ignoreReplayEvents=!0,this.update(!0))}handleEvent(t,e,i=!0){if(e&&this._ignoreReplayEvents)return!1;this._ignoreReplayEvents=!1;const s=this.options,n=this._active||[],o=this._getActiveElements(t,n,e,i),a=this._positionChanged(o,t),r=e||!f(o,n)||a;return r&&(this._active=o,(s.enabled||s.external)&&(this._eventPosition={x:t.x,y:t.y},this.update(!0,e))),r}_getActiveElements(t,e,i,s){const n=this.options;if("mouseout"===t.type)return[];if(!s)return e.filter((t=>this.chart.data.datasets[t.datasetIndex]&&void 0!==this.chart.getDatasetMeta(t.datasetIndex).controller.getParsed(t.index)));const o=this.chart.getElementsAtEventForMode(t,n.mode,n,i);return n.reverse&&o.reverse(),o}_positionChanged(t,e){const{caretX:i,caretY:s,options:n}=this,o=Da[n.position].call(this,t,e);return!1!==o&&(i!==o.x||s!==o.y)}}var Na={id:"tooltip",_element:Wa,positioners:Da,afterInit(t,e,i){i&&(t.tooltip=new Wa({chart:t,options:i}))},beforeUpdate(t,e,i){t.tooltip&&t.tooltip.initialize(i)},reset(t,e,i){t.tooltip&&t.tooltip.initialize(i)},afterDraw(t){const e=t.tooltip;if(e&&e._willRender()){const i={tooltip:e};if(!1===t.notifyPlugins("beforeTooltipDraw",{...i,cancelable:!0}))return;e.draw(t.ctx),t.notifyPlugins("afterTooltipDraw",i)}},afterEvent(t,e){if(t.tooltip){const i=e.replay;t.tooltip.handleEvent(e.event,i,e.inChartArea)&&(e.changed=!0)}},defaults:{enabled:!0,external:null,position:"average",backgroundColor:"rgba(0,0,0,0.8)",titleColor:"#fff",titleFont:{weight:"bold"},titleSpacing:2,titleMarginBottom:6,titleAlign:"left",bodyColor:"#fff",bodySpacing:2,bodyFont:{},bodyAlign:"left",footerColor:"#fff",footerSpacing:2,footerMarginTop:6,footerFont:{weight:"bold"},footerAlign:"left",padding:6,caretPadding:2,caretSize:5,cornerRadius:6,boxHeight:(t,e)=>e.bodyFont.size,boxWidth:(t,e)=>e.bodyFont.size,multiKeyBackground:"#fff",displayColors:!0,boxPadding:0,borderColor:"rgba(0,0,0,0)",borderWidth:0,animation:{duration:400,easing:"easeOutQuart"},animations:{numbers:{type:"number",properties:["x","y","width","height","caretX","caretY"]},opacity:{easing:"linear",duration:200}},callbacks:Va},defaultRoutes:{bodyFont:"font",footerFont:"font",titleFont:"font"},descriptors:{_scriptable:t=>"filter"!==t&&"itemSort"!==t&&"external"!==t,_indexable:!1,callbacks:{_scriptable:!1,_indexable:!1},animation:{_fallback:!1},animations:{_fallback:"animation"}},additionalOptionScopes:["interaction"]};return Tn.register(Un,$o,go,t),Tn.helpers={...Hi},Tn._adapters=In,Tn.Animation=As,Tn.Animations=Ts,Tn.animator=bt,Tn.controllers=nn.controllers.items,Tn.DatasetController=js,Tn.Element=$s,Tn.elements=go,Tn.Interaction=Ki,Tn.layouts=ls,Tn.platforms=Ds,Tn.Scale=tn,Tn.Ticks=ae,Object.assign(Tn,Un,$o,go,t,Ds),Tn.Chart=Tn,"undefined"!=typeof window&&(window.Chart=Tn),Tn}));
//# sourceMappingURL=chart.umd.min.js.map
  return module.exports.Chart || module.exports;
})();
