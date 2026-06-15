// HA Energy Optimizer Bundle v3.4.3
// HTML escape helper — wrap any user-derived string before interpolation into innerHTML.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

class HaEnergyOptimizer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    // --- Throttle fields ---
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    // --- Pagination ---
    this._currentPage = {};
    this._pageSize = 15;
    this._hass = null;
    // Default config so the card works in panel/sidebar mode where setConfig() is never called.
    this._config = { title: 'Energy Optimizer' };
    this._currentTab = 'dashboard';
    this._energyData = [];
    this._weeklyData = [];
    this._recommendations = [];
    this._comparisonData = null;
    // --- Real data fields ---
    this._hasRealData = false;
    this._currentPowerW = 0;
    this._statsLoading = false;
    this._lastStatsFetch = 0;
    this._energySensorIds = [];    this._charts = {};
    this._chartJsLoaded = false;
    // Initialize data structures so panel/sidebar mode (no setConfig) renders without crashing.
    this._generateFallbackData();
    this._generateRecommendations();
    this._generateComparisonData();
  }
  disconnectedCallback() {
    this._destroyAllCharts();
  }

  static getConfigElement() {
    return document.createElement('ha-energy-optimizer-editor');
  }

  static getStubConfig() {
    return {
      type: 'custom:ha-energy-optimizer',
      title: 'Energy Optimizer',
      currency: 'PLN',
      peak_hours: { start: 6, end: 22 },
      entities: ['sensor.energy_total', 'sensor.energy_grid']
    };
  }

  setConfig(config) {
    this._config = config || { title: 'Energy Optimizer' };
    this._generateFallbackData();
    this._generateRecommendations();
    this._generateComparisonData();
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
          setTimeout(() => {
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

    try {
      // Step 1: Find all kWh statistic IDs
      const allStats = await this._hass.callWS({
        type: 'recorder/list_statistic_ids',
        statistic_type: 'sum'
      });
      const kwhIds = allStats
        .filter(s => s.statistics_unit_of_measurement === 'kWh')
        .filter(s => {
          const id = s.statistic_id;
          return !id.includes('_daily') && !id.includes('_weekly') && !id.includes('_monthly') && !id.includes('_last_') && !id.includes('_cost');
        })
        .map(s => s.statistic_id);

      if (kwhIds.length === 0) {
        this._statsLoading = false;
        this._hasRealData = false; this._recommendations = []; return; // No energy sensors
      }

      this._energySensorIds = kwhIds;

      // Step 2: Fetch 7 days of hourly statistics
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600000);
      const stats = await this._hass.callWS({
        type: 'recorder/statistics_during_period',
        start_time: weekAgo.toISOString(),
        end_time: now.toISOString(),
        statistic_ids: kwhIds,
        period: 'hour'
      });

      // Step 3: Aggregate all sensors into hourly totals for today (24h)
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const hourlyToday = new Array(24).fill(0);

      // Step 4: Aggregate into weekly data (7 days x 24 hours)
      const weeklyHourly = Array.from({length: 7}, () => new Array(24).fill(0));

      kwhIds.forEach(id => {
        const sensorData = stats[id] || [];
        sensorData.forEach(entry => {
          const change = Math.max(0, entry.change || 0); // ignore negative (meter resets)
          const entryDate = new Date(entry.start);
          const hour = entryDate.getHours();

          // Today's data
          if (entryDate >= todayStart) {
            hourlyToday[hour] += change;
          }

          // Weekly data - find which day (0=oldest, 6=today)
          const dayDiff = Math.floor((now - entryDate) / 86400000);
          const dayIndex = 6 - dayDiff;
          if (dayIndex >= 0 && dayIndex < 7) {
            weeklyHourly[dayIndex][hour] += change;
          }
        });
      });

      this._energyData = hourlyToday;
      this._weeklyData = weeklyHourly;
      this._hasRealData = true;

      // Recalculate dependent data
      this._generateRecommendations();
      this._generateComparisonData();

    } catch (err) {
      console.warn('Energy Optimizer: Failed to fetch stats, using demo fallback:', err.message);
      // Keep existing demo data as fallback
    }
    this._statsLoading = false;
  }

  _updateEnergyData() {
    if (!this._hass) return;
    // Update current power draw from power sensors
    const powerSensors = Object.entries(this._hass.states)
      .filter(([id, s]) => {
        const dc = s.attributes.device_class;
        const unit = s.attributes.unit_of_measurement;
        return (dc === 'power' || unit === 'W') && !isNaN(parseFloat(s.state));
      });
    this._currentPowerW = powerSensors.reduce((sum, [, s]) => sum + parseFloat(s.state), 0);

    // Fetch stats every 5 minutes (not on every hass update)
    const now = Date.now();
    if (!this._lastStatsFetch || (now - this._lastStatsFetch) > 300000) {
      this._lastStatsFetch = now;
      this._fetchEnergyStats();
    }
  }

  _generateFallbackData() {
    if (this._energyData && this._energyData.length > 0) return; // Use cached data
    // Generate 24-hour energy data
    const rng = this._seededRandom('energy-demo-data');
    this._energyData = [];
    const baseUsage = 0.5;
    for (let hour = 0; hour < 24; hour++) {
      let usage = baseUsage;
      if (hour >= 6 && hour <= 9) usage += 1.2; // Morning peak
      if (hour >= 18 && hour <= 21) usage += 1.8; // Evening peak
      if (hour >= 23 || hour <= 5) usage -= 0.3; // Night low
      usage += rng() * 0.3 - 0.15; // Random variation
      this._energyData.push(Math.max(0.1, usage));
    }

    // Generate weekly data (7 days x 24 hours)
    this._weeklyData = [];
    for (let day = 0; day < 7; day++) {
      const dayData = [];
      for (let hour = 0; hour < 24; hour++) {
        let usage = baseUsage;
        if (hour >= 6 && hour <= 9) usage += (day < 5 ? 1.2 : 0.8); // Weekday vs weekend
        if (hour >= 18 && hour <= 21) usage += (day < 5 ? 1.8 : 1.0);
        if (hour >= 23 || hour <= 5) usage -= 0.3;
        usage += rng() * 0.3 - 0.15;
        dayData.push(Math.max(0.1, usage));
      }
      this._weeklyData.push(dayData);
    }
  }

  _generateRecommendations() {
    if (!this._hasRealData) { this._recommendations = []; return; }
    const peakHourStart = this._config.peak_hours?.start || 6;
    const peakHourEnd = this._config.peak_hours?.end || 22;
    const avgPeakUsage = this._energyData.slice(peakHourStart, peakHourEnd).reduce((a, b) => a + b, 0) / (peakHourEnd - peakHourStart);
    const avgOffPeakUsage = this._energyData.slice(0, peakHourStart).concat(this._energyData.slice(peakHourEnd)).reduce((a, b) => a + b, 0) / (24 - (peakHourEnd - peakHourStart));

    this._recommendations = [
      {
        id: 1,
        icon: '🧺',
        title: `Shift laundry to off-peak hours`,
        description: `Your peak usage is ${peakHourStart}-${peakHourEnd}. Running laundry at night saves up to 30% on that load.`,
        savings: 12.5,
        difficulty: 'easy',
        impact: 'high'
      },
      {
        id: 2,
        icon: '🍽️',
        title: 'Use dishwasher in off-peak time',
        description: 'Schedule dishwasher runs for morning or late evening when rates are lower.',
        savings: 8.3,
        difficulty: 'easy',
        impact: 'medium'
      },
      {
        id: 3,
        icon: '🌡️',
        title: 'Optimize thermostat settings',
        description: `Reduce heating by 1°C during peak hours (${peakHourStart}-${peakHourEnd}) for consistent savings.`,
        savings: 15.0,
        difficulty: 'medium',
        impact: 'high'
      },
      {
        id: 4,
        icon: '💡',
        title: 'Replace with LED lighting',
        description: 'Your evening usage spikes significantly. LED bulbs reduce lighting energy by 75%.',
        savings: 6.2,
        difficulty: 'medium',
        impact: 'medium'
      },
      {
        id: 5,
        icon: '🔌',
        title: 'Reduce standby power consumption',
        description: 'Use smart power strips to eliminate phantom loads from devices in standby mode.',
        savings: 4.5,
        difficulty: 'easy',
        impact: 'low'
      }
    ];
  }

  _generateComparisonData() {
    if (!this._energyData || this._energyData.length === 0) return;
    const todayTotal = this._energyData.reduce((a, b) => a + b, 0);
    const dailyTotals = this._weeklyData.map(day => day.reduce((a, b) => a + b, 0));
    const thisWeekTotal = dailyTotals.reduce((a, b) => a + b, 0);
    // For "last week", if we have real data the weeklyData IS this week
    // Use average * 7 as estimate for comparison
    const avgDaily = thisWeekTotal / Math.max(1, dailyTotals.filter(d => d > 0).length);
    const lastWeekEstimate = thisWeekTotal * 0.95; // Conservative estimate

    const peakRate = this._config.peak_rate || this._config.energy_price || 0.65;
    const offPeakRate = this._config.off_peak_rate || peakRate;
    const hasDualTariff = peakRate !== offPeakRate;

    this._comparisonData = {
      thisWeek: thisWeekTotal,
      lastWeek: lastWeekEstimate,
      thisMonth: thisWeekTotal * 4.3,
      lastMonth: lastWeekEstimate * 4.3,
      dailyBreakdown: dailyTotals,
      costCurrency: this._config.currency || 'PLN',
      costPerKwh: peakRate,
      offPeakRate: offPeakRate,
      hasDualTariff: hasDualTariff,
      peakCostWeekly: hasDualTariff ? thisWeekTotal * 0.65 * peakRate : thisWeekTotal * peakRate,
      offPeakCostWeekly: hasDualTariff ? thisWeekTotal * 0.35 * offPeakRate : 0
    };
  }

  _render() {
    this._destroyAllCharts();
    this.shadowRoot.innerHTML = this._getStyles() + this._getTemplate();
    this._setupEventListeners();
    this._renderCurrentTab();
  }

  _getStyles() {
    return `
      <style>
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
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary)cc 100%);
          color: white;
          padding: 16px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .summary-card.alt {
          background: linear-gradient(135deg, var(--success) 0%, var(--success)cc 100%);
        }

        .summary-card.warn {
          background: linear-gradient(135deg, var(--warning) 0%, var(--warning)cc 100%);
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
          background: linear-gradient(135deg, var(--primary) 0%, var(--primary)cc 100%);
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

  th:nth-child(3),
  td:nth-child(3) {
    min-width: 80px;
  }
}</style>
    `;
  }

  _getTemplate() {
    return `
      <div class="card-container">
        <h2 class="card-title">${_esc(this._config.title || 'Energy Optimizer')}</h2>

        <div class="data-source-badge">
          ${this._hasRealData ? '\u{1F4CA} Dane z ' + (this._energySensorIds || []).length + ' sensor\u00F3w energii' : '\u26A0\uFE0F Demo data \u2014 brak sensor\u00F3w kWh'}
        </div>

        <div class="tabs" role="tablist">
          <button class="tab-button active" data-tab="dashboard" role="tab" aria-selected="${this._currentTab === 'dashboard'}">Dashboard</button>
          <button class="tab-button" data-tab="patterns" role="tab" aria-selected="${this._currentTab === 'patterns'}">Patterns</button>
          <button class="tab-button" data-tab="recommendations" role="tab" aria-selected="${this._currentTab === 'recommendations'}">Recommendations</button>
          <button class="tab-button" data-tab="compare" role="tab" aria-selected="${this._currentTab === 'compare'}">Compare</button>
        </div>

        <div id="dashboard" class="tab-content active">
          <div class="grid">
            <div class="summary-card">
              <span class="summary-label">Today's Usage</span>
              <div class="summary-value">${this._calculateTodayUsage().toFixed(2)}</div>
              <span class="summary-label">kWh</span>
            </div>
            <div class="summary-card alt">
              <span class="summary-label">Cost Estimate</span>
              <div class="summary-value">${this._calculateTodayCost().toFixed(2)}</div>
              <span class="summary-label">${_esc(this._config.currency || 'PLN')}${(this._config.off_peak_rate && this._config.peak_rate !== this._config.off_peak_rate) ? ' (dual-tariff)' : ''}</span>
            </div>
            ${(this._config.off_peak_rate && this._config.peak_rate !== this._config.off_peak_rate) ? `
            <div class="summary-card" style="border-left:3px solid var(--success)">
              <span class="summary-label">Potential Savings</span>
              <div class="summary-value">${this._calculatePotentialSavings().toFixed(2)}</div>
              <span class="summary-label">${_esc(this._config.currency || 'PLN')}/day by shifting to off-peak</span>
            </div>` : `
            <div class="summary-card warn">
              <span class="summary-label">Peak Hour</span>
              <div class="summary-value">${this._getPeakHour()}:00</div>
              <span class="summary-label">Highest consumption</span>
            </div>`}
            <div class="summary-card">
              <span class="summary-label">Efficiency Score</span>
              <div class="summary-value">${this._calculateEfficiencyScore()}</div>
              <span class="summary-label">/ 100</span>
            </div>
          </div>

          <div class="power-draw">
            <div class="power-draw-unit">Current Power Draw</div>
            <div class="power-draw-value">${(this._currentPowerW / 1000).toFixed(2)}</div>
            <div class="power-draw-unit">kW</div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>24-Hour Usage</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">kWh by hour</span>
            </div>
            <canvas id="dashboard-chart"></canvas>
          </div>
        </div>

        <div id="patterns" class="tab-content">
          <div class="chart-container">
            <div class="chart-title">
              <span>Weekly Heat Map</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">Energy intensity by day & hour</span>
            </div>
            <canvas id="heatmap-canvas"></canvas>
            <div class="heatmap-legend">
              <div class="legend-item">
                <div class="legend-color" style="background: #1e3a8a;"></div>
                <span>Low</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #3b82f6;"></div>
                <span>Moderate</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #fbbf24;"></div>
                <span>High</span>
              </div>
              <div class="legend-item">
                <div class="legend-color" style="background: #dc2626;"></div>
                <span>Peak</span>
              </div>
            </div>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <div class="stat-label">Peak Usage</div>
              <div class="stat-value">${(this._energyData.reduce((a, b) => Math.max(a, b), 0)).toFixed(2)} kWh</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Off-Peak Usage</div>
              <div class="stat-value">${(this._energyData.slice(0, this._config.peak_hours?.start || 6).reduce((a, b) => a + b, 0) / (this._config.peak_hours?.start || 6)).toFixed(2)} kWh/h</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Ratio</div>
              <div class="stat-value">${this._calculatePeakRatio().toFixed(1)}:1</div>
            </div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>7-Day Trend</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">Daily consumption average</span>
            </div>
            <canvas id="trend-chart"></canvas>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>Day-of-Week Comparison</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">Average daily usage</span>
            </div>
            <canvas id="weekday-chart"></canvas>
          </div>
        </div>

        <div id="recommendations" class="tab-content">
          <div id="recommendations-list"></div>
        </div>

        <div id="compare" class="tab-content">
          <div class="comparison-grid">
            <div class="comparison-card">
              <div class="comparison-title">This Week</div>
              <div class="comparison-value">${this._comparisonData.thisWeek.toFixed(2)}</div>
              <div class="comparison-title">kWh</div>
            </div>
            <div class="comparison-card">
              <div class="comparison-title">Last Week</div>
              <div class="comparison-value">${this._comparisonData.lastWeek.toFixed(2)}</div>
              <div class="change-indicator ${this._comparisonData.thisWeek > this._comparisonData.lastWeek ? 'change-up' : 'change-down'}">
                ${this._comparisonData.thisWeek > this._comparisonData.lastWeek ? '📈' : '📉'}
                ${Math.abs(((this._comparisonData.thisWeek - this._comparisonData.lastWeek) / this._comparisonData.lastWeek * 100)).toFixed(1)}%
              </div>
            </div>
          </div>

          <div class="comparison-grid">
            <div class="comparison-card">
              <div class="comparison-title">This Month</div>
              <div class="comparison-value">${this._comparisonData.thisMonth.toFixed(0)}</div>
              <div class="comparison-title">kWh</div>
            </div>
            <div class="comparison-card">
              <div class="comparison-title">Last Month</div>
              <div class="comparison-value">${this._comparisonData.lastMonth.toFixed(0)}</div>
              <div class="change-indicator ${this._comparisonData.thisMonth > this._comparisonData.lastMonth ? 'change-up' : 'change-down'}">
                ${this._comparisonData.thisMonth > this._comparisonData.lastMonth ? '📈' : '📉'}
                ${Math.abs(((this._comparisonData.thisMonth - this._comparisonData.lastMonth) / this._comparisonData.lastMonth * 100)).toFixed(1)}%
              </div>
            </div>
          </div>

          <div class="chart-container">
            <div class="chart-title">
              <span>Weekly Comparison</span>
              <span style="font-size: 12px; color: var(--secondary-text); font-weight: 400;">This week vs last week</span>
            </div>
            <canvas id="comparison-chart"></canvas>
          </div>

          <div class="stats-row">
            <div class="stat-item">
              <div class="stat-label">Cost Difference (Week)</div>
              <div class="stat-value" style="${this._comparisonData.thisWeek > this._comparisonData.lastWeek ? 'color: var(--danger)' : 'color: var(--success)'}">${((this._comparisonData.thisWeek - this._comparisonData.lastWeek) * this._comparisonData.costPerKwh).toFixed(2)} ${this._config.currency}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">Weekly Average Cost</div>
              <div class="stat-value">${(this._comparisonData.thisWeek * this._comparisonData.costPerKwh).toFixed(2)} ${this._config.currency}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _setupEventListeners() {
    const buttons = this.shadowRoot.querySelectorAll('.tab-button');
    buttons.forEach(button => {
      button.addEventListener('click', (e) => {
        buttons.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        this._currentTab = e.target.dataset.tab;
        this._showTab(e.target.dataset.tab);
      });
    });
  }
  async _loadChartJS() {
    if (this._chartJsLoaded) {
      return window.Chart;
    }

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js';
      script.async = true;
      script.onload = () => {
        this._chartJsLoaded = true;
        resolve(window.Chart);
      };
      script.onerror = () => {
        reject(new Error('Failed to load Chart.js'));
      };
      document.head.appendChild(script);
    });
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
    setTimeout(() => {
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
    setTimeout(() => this._showTab('dashboard'), 100);
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
            label: 'Energy Usage (kWh)',
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
                text: 'Energy (kWh)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Hour of Day'
              }
            }
          }
        }
      };

      this._charts['dashboard'] = new window.Chart(ctx, chartConfig);
    } catch (error) {
      console.error('Error drawing dashboard chart:', error);
    }
  }
_drawHeatmap() {
    const canvas = this.shadowRoot.getElementById('heatmap-canvas');
    if (!canvas) return;

    this._fixCanvasSize(canvas);
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 200;
    const padding = 40;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const cellWidth = (width - padding * 2) / 24;
    const cellHeight = (height - padding * 2) / 7;

    // Find min/max for color scaling
    const allValues = (this._weeklyData || []).flat();
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

        ctx.fillStyle = getColor(value);
        ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);

        // Draw cell border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, cellWidth - 1, cellHeight - 1);
      });
    });

    // Day labels (Y-axis)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
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
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    const legendX = padding;
    const legendY = height - 15;
    ctx.fillText(`Min: ${minVal.toFixed(2)} kWh`, legendX, legendY);
    ctx.fillText(`Max: ${maxVal.toFixed(2)} kWh`, legendX + 120, legendY);
  }


  async _drawTrendChart() {
    try {
      await this._loadChartJS();
      const canvas = this.shadowRoot.getElementById('trend-chart');
      if (!canvas) return;

      this._destroyChart('trend');

      const ctx = canvas.getContext('2d');
      const dailyTotals = this._weeklyData?.map(day => (day || []).reduce((a, b) => a + b, 0)) || [0, 0, 0, 0, 0, 0, 0];
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      const chartConfig = {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily Total Usage (kWh)',
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
                text: 'Daily Total (kWh)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Day of Week'
              }
            }
          }
        }
      };

      this._charts['trend'] = new window.Chart(ctx, chartConfig);
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
      const dailyTotals = this._weeklyData?.map(day => (day || []).reduce((a, b) => a + b, 0)) || [0, 0, 0, 0, 0, 0, 0];
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Daily Total Usage (kWh)',
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
                text: 'Daily Total (kWh)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Day of Week'
              }
            }
          }
        }
      };

      this._charts['weekday'] = new window.Chart(ctx, chartConfig);
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
      
      const compData = this._comparisonData || {
        thisWeek: [0, 0, 0, 0, 0, 0, 0],
        lastWeek: [0, 0, 0, 0, 0, 0, 0],
        average: [0, 0, 0, 0, 0, 0, 0]
      };

      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

      const chartConfig = {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'This Week (kWh)',
              data: compData.thisWeek,
              backgroundColor: 'rgba(59, 130, 246, 0.7)',
              borderColor: 'rgb(59, 130, 246)',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Last Week (kWh)',
              data: compData.lastWeek,
              backgroundColor: 'rgba(200, 200, 200, 0.7)',
              borderColor: 'rgb(200, 200, 200)',
              borderWidth: 1,
              borderRadius: 4
            },
            {
              label: 'Average (kWh)',
              data: compData.average,
              backgroundColor: 'rgba(100, 200, 100, 0.7)',
              borderColor: 'rgb(100, 200, 100)',
              borderWidth: 1,
              borderRadius: 4
            }
          ]
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
                text: 'Daily Total (kWh)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Day of Week'
              }
            }
          }
        }
      };

      this._charts['comparison'] = new window.Chart(ctx, chartConfig);
    } catch (error) {
      console.error('Error drawing comparison chart:', error);
    }
  }


  _renderRecommendations() {
    const container = this.shadowRoot.getElementById('recommendations-list');
    container.innerHTML = this._recommendations.map(rec => `
      <div class="recommendation ${rec.impact}">
        <div class="rec-icon">${rec.icon}</div>
        <div class="rec-content">
          <div class="rec-title">${rec.title}</div>
          <div class="rec-description">${rec.description}</div>
          <div class="rec-footer">
            <div class="savings-badge">Save ~${rec.savings}${_esc(this._config.currency || 'PLN')}/mo</div>
            <div class="difficulty-badge">${rec.difficulty}</div>
          </div>
        </div>
      </div>
    `).join('');
  }

  _calculateTodayUsage() {
    return this._energyData.reduce((a, b) => a + b, 0);
  }

  _calculateTodayCost() {
    const peakRate = this._config.peak_rate || this._config.energy_price || 0.65;
    const offPeakRate = this._config.off_peak_rate || peakRate;
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    let cost = 0;
    this._energyData.forEach((kwh, hour) => {
      const rate = (hour >= peakStart && hour < peakEnd) ? peakRate : offPeakRate;
      cost += kwh * rate;
    });
    return cost;
  }

  _calculatePotentialSavings() {
    const peakRate = this._config.peak_rate || this._config.energy_price || 0.65;
    const offPeakRate = this._config.off_peak_rate || peakRate;
    if (peakRate === offPeakRate) return 0;
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    let savings = 0;
    this._energyData.forEach((kwh, hour) => {
      if (hour >= peakStart && hour < peakEnd) {
        savings += kwh * (peakRate - offPeakRate) * 0.3;
      }
    });
    return savings;
  }

  _getPeakHour() {
    return this._energyData.indexOf(Math.max(...this._energyData));
  }

  _calculateEfficiencyScore() {
    const peakRatio = this._calculatePeakRatio();
    const baseScore = 100;
    const peakPenalty = Math.min(30, peakRatio * 5);
    return Math.max(30, baseScore - peakPenalty).toFixed(0);
  }

  _calculatePeakRatio() {
    const peakStart = this._config.peak_hours?.start || 6;
    const peakEnd = this._config.peak_hours?.end || 22;
    const peakUsage = this._energyData.slice(peakStart, peakEnd).reduce((a, b) => a + b, 0) / (peakEnd - peakStart);
    const offPeakUsage = this._energyData.slice(0, peakStart).concat(this._energyData.slice(peakEnd)).reduce((a, b) => a + b, 0) / (24 - (peakEnd - peakStart));
    return peakUsage / offPeakUsage;
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
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&#8249; Prev</button>
        <span class="pagination-info">${page} / ${totalPages} (${totalItems})</span>
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next &#8250;</button>
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

  getGridOptions() { return { rows: 10, columns: 12, min_rows: 3, min_columns: 6 }; }

  static getStubConfig() { return { type: 'custom:ha-energy-optimizer', title: 'Energy Optimizer' }; }

}

if (!customElements.get('ha-energy-optimizer')) { customElements.define('ha-energy-optimizer', HaEnergyOptimizer); }
window.customCards = window.customCards || [];
if (!window.customCards.some(c => c.type === 'ha-energy-optimizer')) { window.customCards.push({ type: 'ha-energy-optimizer', name: 'Energy Optimizer', description: 'Optimize energy usage, schedules and costs for Home Assistant', preview: false }); }

// --- Bundled card: ha-energy-insights (v3.3.0 bundle)
(function() {
  'use strict';

  // -- HA Tools Persistence (stub -- full impl in ha-tools-panel.js) --
  window._haToolsPersistence = window._haToolsPersistence || { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-insights] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

  // -- HA Tools Escape helper (fallback) --
  const _esc = window._haToolsEsc || ((s) => String(s == null ? '' : s).replace(/[&<>"\']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

  /**
   * HA Energy Insights - Bento Light Mode Panel Tool
   * Energy monitoring with cost tracking, device breakdown, and efficiency recommendations
   * v2.0.0 - Converted from Lovelace Card to Panel Tool Pattern
   */

  class HAEnergyInsights extends HTMLElement {
    static getConfigElement() { return document.createElement('ha-energy-insights-editor'); }
    static getStubConfig() { return { type: 'custom:ha-energy-insights', title: 'Energy Insights', currency: 'PLN' }; }
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

      // Configuration
      this._config = {
        title: 'Energy Insights',
        energy_price: 0.65,
        currency: 'PLN',
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
          thisWeek: 'This Week',
          thisMonth: 'This Month',
          trend: 'Trend',
          vsLastWeek: 'vs last week',
          topDevices: 'Top 5 Devices',
          noSensors: 'No energy sensors found. Add energy sensors (kWh/W) to Home Assistant.',
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
          thisWeek: 'Ten Tydzień',
          thisMonth: 'Ten Miesiąc',
          trend: 'Trend',
          vsLastWeek: 'vs poprzedni tydzień',
          topDevices: 'Top 5 Urządzeń',
          noSensors: 'Brak czujników energii. Dodaj sensory energii (kWh/W) do HA.',
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
    }
    _getRate(hour, dayOfWeek) {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const dayStart = c.energy_day_hour_start || 6;
      const nightStart = c.energy_night_hour_start || 22;
      const isDay = (dayStart < nightStart) ? (hour >= dayStart && hour < nightStart) : (hour >= dayStart || hour < nightStart);
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      switch (mode) {
        case 'day_night':
          return isDay ? (c.energy_price_day || 0.65) : (c.energy_price_night || 0.45);
        case 'weekday_weekend':
          return isWeekend ? (c.energy_price_weekend || 0.50) : (c.energy_price_weekday || 0.65);
        case 'mixed':
          if (isWeekend) return isDay ? (c.energy_price_we_day || 0.55) : (c.energy_price_we_night || 0.40);
          return isDay ? (c.energy_price_wd_day || 0.65) : (c.energy_price_wd_night || 0.45);
        default:
          return c.energy_price || 0.65;
      }
    }

    _getTariffLabel() {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const cur = c.currency || 'PLN';
      const suffix = this._lang === 'pl' ?
        { 'day_night': ' (dzień/noc)', 'weekday_weekend': ' (roboczy/weekend)' } :
        { 'day_night': ' (day/night)', 'weekday_weekend': ' (weekday/weekend)' };
      switch (mode) {
        case 'day_night':
          return cur + ' ' + (c.energy_price_day || 0.65) + '/' + (c.energy_price_night || 0.45) + (suffix['day_night'] || '');
        case 'weekday_weekend':
          return cur + ' ' + (c.energy_price_weekday || 0.65) + '/' + (c.energy_price_weekend || 0.50) + (suffix['weekday_weekend'] || '');
        case 'mixed':
          return cur + ' mix: ' + (c.energy_price_wd_day || 0.65) + '/' + (c.energy_price_wd_night || 0.45) + '/' + (c.energy_price_we_day || 0.55) + '/' + (c.energy_price_we_night || 0.40);
        default:
          return cur + ' @ ' + (c.energy_price || 0.65) + '/kWh';
      }
    }

    set hass(hass) {
      try {
        if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';
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
      Object.values(this._charts).forEach(c => {
        try { c.destroy(); } catch(e) { console.debug('[ha-energy-insights] caught:', e); }
      });
      this._charts = {};
    }

    _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

    // ===== DATA LOADING =====

    _loadChartJs() {
      if (window.Chart) {
        this._chartJsReady = true;
        return;
      }
      const script = document.createElement('script');
      script.src = '/local/community/ha-tools/vendor/chart.umd.min.js';
      script.onload = () => {
        this._chartJsReady = true;
        if (this._data) this._renderCharts();
      };
      script.onerror = () => console.warn('[ha-energy-insights] Chart.js failed to load');
      document.head.appendChild(script);
    }

    async _fetchData() {
      if (!this._hass || !this._hass.callWS) return;
      this._loading = true;
      this._error = null;
      if (this._domBuilt) this._updateLoadingState();

      try {
        // Step 1: Discover energy sensors via recorder statistic IDs
        const allStats = await this._hass.callWS({
          type: 'recorder/list_statistic_ids',
          statistic_type: 'sum'
        });
        const kwhIds = allStats
          .filter(s => s.statistics_unit_of_measurement === 'kWh' || s.statistics_unit_of_measurement === 'Wh')
          .filter(s => {
            const id = s.statistic_id;
            return !id.includes('_daily') && !id.includes('_weekly') && !id.includes('_monthly') && !id.includes('_last_') && !id.includes('_cost');
          });

        if (kwhIds.length === 0) {
          this._data = { sensors: [], noSensors: true };
          this._loading = false;
          this._updateContent();
          return;
        }

        const sensorIds = kwhIds.map(s => s.statistic_id);
        const sensorUnits = {};
        kwhIds.forEach(s => { sensorUnits[s.statistic_id] = s.statistics_unit_of_measurement; });

        // Step 2: Fetch 30 days of hourly statistics via recorder
        const now = new Date();
        const monthAgo = new Date(now.getTime() - 30 * 24 * 3600000);
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 3600000);

        const stats = await this._hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: monthAgo.toISOString(),
          end_time: now.toISOString(),
          statistic_ids: sensorIds,
          period: 'hour',
          types: ['change']
        });

        // Step 3: Aggregate data
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(now.getTime() - 7 * 24 * 3600000);
        const prevWeekStart = new Date(now.getTime() - 14 * 24 * 3600000);

        let todayKwh = 0;
        let thisWeekKwh = 0;
        let prevWeekKwh = 0;
        let monthKwh = 0;
        const hourlyToday = new Array(24).fill(0);
        const dailyWeek = new Array(7).fill(0);
        const dailyMonth = new Array(30).fill(0);
        const deviceTotals = {};

        sensorIds.forEach(id => {
          const entries = stats[id] || [];
          const isWh = sensorUnits[id] === 'Wh';
          let sensorMonthTotal = 0;

          entries.forEach(entry => {
            let change = Math.max(0, entry.change ?? 0);
            if (isWh) change /= 1000;

            const entryDate = new Date(entry.start);
            const hour = entryDate.getHours();
            const daysAgo = Math.floor((now - entryDate) / 86400000);

            // Today hourly
            if (entryDate >= todayStart) {
              hourlyToday[hour] += change;
              todayKwh += change;
            }

            // This week
            if (entryDate >= weekStart) {
              thisWeekKwh += change;
              const dayIdx = 6 - daysAgo;
              if (dayIdx >= 0 && dayIdx < 7) dailyWeek[dayIdx] += change;
            }

            // Previous week
            if (entryDate >= prevWeekStart && entryDate < weekStart) {
              prevWeekKwh += change;
            }

            // Monthly
            monthKwh += change;
            const monthDayIdx = 29 - daysAgo;
            if (monthDayIdx >= 0 && monthDayIdx < 30) dailyMonth[monthDayIdx] += change;

            sensorMonthTotal += change;
          });

          // Track per-device totals for Top Devices
          const friendlyName = this._hass.states?.[id]?.attributes?.friendly_name
            || id.replace('sensor.', '').replace(/_/g, ' ');
          const uom = this._hass.states?.[id]?.attributes?.unit_of_measurement || 'kWh';
          const rawVal = parseFloat(this._hass.states?.[id]?.state) || 0;
          deviceTotals[id] = {
            name: this._sanitize(friendlyName),
            kwh: sensorMonthTotal,
            entity_id: id,
            uom,
            rawVal
          };
        });

        // Top 5 devices by month consumption
        const topDevices = Object.values(deviceTotals)
          .filter(d => d.kwh > 0)
          .sort((a, b) => b.kwh - a.kwh)
          .slice(0, 5);

        // Round values
        const r2 = v => Math.round(v * 100) / 100;

        // Calculate tariff-aware costs
        let todayCost = 0;
        hourlyToday.forEach((kwh, hour) => {
          const dow = todayStart.getDay();
          todayCost += kwh * this._getRate(hour, dow);
        });

        let weekCost = 0;
        dailyWeek.forEach((dayKwh, dayIdx) => {
          const dayDate = new Date(now.getTime() - (6 - dayIdx) * 86400000);
          const dow = dayDate.getDay();
          weekCost += dayKwh * this._getRate(12, dow);
        });

        let monthCost = 0;
        dailyMonth.forEach((dayKwh, dayIdx) => {
          const dayDate = new Date(now.getTime() - (29 - dayIdx) * 86400000);
          const dow = dayDate.getDay();
          monthCost += dayKwh * this._getRate(12, dow);
        });

        this._data = {
          sensors: kwhIds,
          noSensors: false,
          todayKwh: r2(todayKwh),
          todayCost: r2(todayCost),
          topDevices,
          weeklyData: dailyWeek.map(r2),
          monthlyData: dailyMonth.map(r2),
          dailyData: hourlyToday.map(r2),
          thisWeekKwh: r2(thisWeekKwh),
          prevWeekKwh: r2(prevWeekKwh),
          monthKwh: r2(monthKwh),
          weekCost: r2(weekCost),
          monthCost: r2(monthCost),
        };

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
      if (trendDiff > 20) return this._t('highConsumption');
      if (trendDiff > 5)  return this._t('slightlyHigher');
      if (trendDiff < -10) return this._t('lowerThanUsual');
      if (todayKwh > 20)  return this._t('highToday');
      if (todayKwh < 1)   return this._t('veryLow');
      return this._t('normalUsage');
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

    _render() {
      if (!this._hass) return;
      if (this._domBuilt) {
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
        </div>
      `
      this._domBuilt = true;
      this._bindEvents();
    }

    _getStyles() {
      return `
        <style>${window.HAToolsBentoCSS || ""}

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
        return `<div class="no-sensors">${this._t('noSensors')}</div>`;
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
      const cur = this._config.currency || 'PLN';
      const fmt = v => v.toFixed(2);

      const trendDiff = d.prevWeekKwh > 0
        ? ((d.thisWeekKwh - d.prevWeekKwh) / d.prevWeekKwh * 100)
        : 0;
      const trendClass = trendDiff > 5 ? 'trend-up' : trendDiff < -5 ? 'trend-down' : 'trend-neutral';
      const trendIcon = trendDiff > 5 ? '↑' : trendDiff < -5 ? '↓' : '→';
      const trendLabel = trendDiff > 0 ? `+${fmt(trendDiff)}%` : `${fmt(trendDiff)}%`;
      const rec = this._getRecommendation(trendDiff, d.todayKwh);

      let html = `
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">${this._t('today')}</div>
            <div class="stat-value highlight">${fmt(d.todayKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.todayCost)} ${cur}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisWeek')}</div>
            <div class="stat-value">${fmt(d.thisWeekKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.weekCost)} ${cur}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">${this._t('thisMonth')}</div>
            <div class="stat-value">${fmt(d.monthKwh)}</div>
            <div class="stat-sub">kWh • ${fmt(d.monthCost)} ${cur}</div>
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
              <div class="device-name" title="${dev.entity_id}">${dev.name}</div>
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
          <canvas id="chart-${period}"></canvas>
        </div>
        <div class="chart-label">kWh • ${this._getTariffLabel()}</div>
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

    _renderCharts() {
      if (!window.Chart || !this._data) return;

      const chartDefs = {
        daily:   { data: this._data.dailyData,   labels: this._buildHourLabels(24) },
        weekly:  { data: this._data.weeklyData,   labels: this._buildDayLabels(7) },
        monthly: { data: this._data.monthlyData,  labels: this._buildDayLabels(30) }
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

        this._charts[this._activeTab] = new window.Chart(canvas, {
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
                    const kwh = ctx.raw || 0;
                    const hour = ctx.dataIndex || 0;
                    const rate = this._getRate(hour, new Date().getDay());
                    const cost = (kwh * rate).toFixed(2);
                    return ` ${kwh.toFixed(2)} kWh  (${cost} ${this._config.currency || 'PLN'})`;
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { color: getComputedStyle(this).getPropertyValue('--bento-text-secondary').trim(), font: { size: 11 }, maxRotation: 45 },
                grid: { color: 'transparent' }
              },
              y: {
                ticks: { color: getComputedStyle(this).getPropertyValue('--bento-text-secondary').trim(), font: { size: 11 } },
                grid: { color: 'rgba(0,0,0,0.05)' },
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

      shadow.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._activeTab = btn.dataset.tab;
          localStorage.setItem('ha-tools-energy-insights-active-tab', this._activeTab);
          history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this._activeTab);
          // Update tab content only (no full DOM rebuild)
          this._updateContent();
          if (this._chartJsReady && this._data && this._activeTab !== 'overview' && this._activeTab !== 'tips') {
            setTimeout(() => this._renderCharts(), 0);
          }
        });
      });
    }

    setActiveTab(tabId) {
      this._activeTab = tabId;
      this._render();
    }

    getCardSize() { return 8; }

    getGridOptions() { return { rows: 8, columns: 12, min_rows: 3, min_columns: 6 }; }
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
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency || 'PLN')}"
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
  window.customCards.push({ type: 'ha-energy-insights', name: 'Energy Insights', description: 'Energy dashboard: usage, costs, top devices, trends', preview: false });
})();

// --- Bundled card: ha-energy-email (v3.3.0 bundle)
(function() {
  'use strict';

  // XSS protection helper (global singleton — tools reuse via window._haToolsEsc)
  window._haToolsEsc = window._haToolsEsc || ((s) => typeof s === 'string' ? s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) : (s ?? ''));
  const _esc = window._haToolsEsc;

  // -- HA Tools Persistence (stub -- full impl in ha-tools-panel.js) --
  window._haToolsPersistence = window._haToolsPersistence || { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-tools-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-energy-email] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-tools-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

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
   *   currency: PLN                        (optional, default PLN)
   *   energy_price: 0.65                   (optional PLN/kWh)
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
        currency: 'PLN',
        energy_price: 0.65,
        energy_tariff_mode: 'flat',
        energy_price_day: 0.65,
        energy_price_night: 0.45,
        energy_price_weekday: 0.65,
        energy_price_weekend: 0.50,
        energy_price_wd_day: 0.65,
        energy_price_wd_night: 0.45,
        energy_price_we_day: 0.55,
        energy_price_we_night: 0.40,
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
      this._reportPeriod = 'week';
      this._overviewPeriod = 'total';
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
        if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';
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
        if (!this._emailBackendChecked) this._loadEmailBackendConfig().catch(e => this._showToast('⚠️ ' + (e?.message || e)));
        if (now - this._lastRenderTime < 10000) {
          if (!this._renderScheduled) {
            this._renderScheduled = true;
            setTimeout(() => {
              this._renderScheduled = false;
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
          smtpConfigWarning: 'Skonfiguruj SMTP w zakładce Schedule lub w ustawieniach Home Assistant.',
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
          smtpConfigWarning: 'Configure SMTP in the Schedule tab or in Home Assistant settings.',
          locale: 'en-US',
        },
      };
      return T[this._lang] || T.en;
    }

    setConfig(config) {
      const cfg = config || {};
      this._config = {
        ...this._config,
        ...cfg,
        title: cfg.title || this._config.title || 'Energy Email Reports',
        recipient: cfg.recipient || this._config.recipient || '',
        currency: cfg.currency || this._config.currency || 'PLN',
        energy_price: parseFloat(cfg.energy_price) || this._config.energy_price || 0.65,
        energy_tariff_mode: cfg.energy_tariff_mode || this._config.energy_tariff_mode || 'flat',
        energy_price_day: parseFloat(cfg.energy_price_day) || this._config.energy_price_day || 0.65,
        energy_price_night: parseFloat(cfg.energy_price_night) || this._config.energy_price_night || 0.45,
        energy_price_weekday: parseFloat(cfg.energy_price_weekday) || this._config.energy_price_weekday || 0.65,
        energy_price_weekend: parseFloat(cfg.energy_price_weekend) || this._config.energy_price_weekend || 0.50,
        energy_price_wd_day: parseFloat(cfg.energy_price_wd_day) || this._config.energy_price_wd_day || 0.65,
        energy_price_wd_night: parseFloat(cfg.energy_price_wd_night) || this._config.energy_price_wd_night || 0.45,
        energy_price_we_day: parseFloat(cfg.energy_price_we_day) || this._config.energy_price_we_day || 0.55,
        energy_price_we_night: parseFloat(cfg.energy_price_we_night) || this._config.energy_price_we_night || 0.40,
        energy_day_hour_start: parseInt(cfg.energy_day_hour_start) || this._config.energy_day_hour_start || 6,
        energy_night_hour_start: parseInt(cfg.energy_night_hour_start) || this._config.energy_night_hour_start || 22,
        notify_service: cfg.notify_service || this._config.notify_service || '',
      };
    }


    getCardSize() { return 4; }

    getGridOptions() { return { rows: 7, columns: 12, min_rows: 3, min_columns: 6 }; }

    _getRate(hour, dayOfWeek) {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const dayStart = c.energy_day_hour_start || 6;
      const nightStart = c.energy_night_hour_start || 22;
      const isDay = (dayStart < nightStart) ? (hour >= dayStart && hour < nightStart) : (hour >= dayStart || hour < nightStart);
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
      switch (mode) {
        case 'day_night':
          return isDay ? (c.energy_price_day || 0.65) : (c.energy_price_night || 0.45);
        case 'weekday_weekend':
          return isWeekend ? (c.energy_price_weekend || 0.50) : (c.energy_price_weekday || 0.65);
        case 'mixed':
          if (isWeekend) return isDay ? (c.energy_price_we_day || 0.55) : (c.energy_price_we_night || 0.40);
          return isDay ? (c.energy_price_wd_day || 0.65) : (c.energy_price_wd_night || 0.45);
        default:
          return c.energy_price || 0.65;
      }
    }

    _getAvgRate() {
      const mode = this._config.energy_tariff_mode || 'flat';
      if (mode === 'flat') return this._config.energy_price || 0.65;
      let sum = 0;
      for (let dow = 0; dow < 7; dow++) {
        for (let h = 0; h < 24; h++) {
          sum += this._getRate(h, dow);
        }
      }
      return sum / 168;
    }

    _getTariffLabel() {
      const c = this._config;
      const mode = c.energy_tariff_mode || 'flat';
      const cur = c.currency || 'PLN';
      const suffix = this._lang === 'pl' ?
        { 'day_night': '/kWh (dzień/noc)', 'weekday_weekend': '/kWh (roboczy/weekend)' } :
        { 'day_night': '/kWh (day/night)', 'weekday_weekend': '/kWh (weekday/weekend)' };
      switch (mode) {
        case 'day_night': return (c.energy_price_day || 0.65) + '/' + (c.energy_price_night || 0.45) + ' ' + cur + (suffix['day_night'] || '');
        case 'weekday_weekend': return (c.energy_price_weekday || 0.65) + '/' + (c.energy_price_weekend || 0.50) + ' ' + cur + (suffix['weekday_weekend'] || '');
        case 'mixed': return 'mix: ' + (c.energy_price_wd_day || 0.65) + '/' + (c.energy_price_wd_night || 0.45) + '/' + (c.energy_price_we_day || 0.55) + '/' + (c.energy_price_we_night || 0.40) + ' ' + cur;
        default: return (c.energy_price || 0.65) + ' ' + cur + '/kWh';
      }
    }


    static getStubConfig() {
      return {
        type: 'custom:ha-energy-email',
        title: 'Energy Email Reports',
        currency: 'PLN',
        energy_price: 0.65
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
      this._discoverEnergySensors();
      this._discoverRecipient();
      this._discoveryDone = true;
      this._render();
      // Fetch recorder stats in background (for period views)
      this._fetchAllPeriodStats().then(() => {
        if (this._periodCache_day || this._periodCache_week || this._periodCache_month) this._render();
      }).catch(() => {});
    }

    _discoverEnergySensors() {
      if (!this._hass) return;
      const states = this._hass.states;
      const energySensors = [];
      for (const [entityId, state] of Object.entries(states)) {
        if (!entityId.startsWith('sensor.')) continue;
        const attrs = state.attributes || {};
        const dc = attrs.device_class;
        const uom = attrs.unit_of_measurement;
        const sc = attrs.state_class;
        const val = parseFloat(state.state);
        if (dc === 'energy' || ((uom === 'kWh' || uom === 'Wh') && (sc === 'total_increasing' || sc === 'total' || sc === 'measurement'))) {
          if (isNaN(val) || state.state === 'unavailable' || state.state === 'unknown') continue;
          energySensors.push({
            entity_id: entityId,
            friendly_name: attrs.friendly_name || entityId.replace('sensor.', '').replace(/_/g, ' '),
            value: uom === 'Wh' ? val / 1000 : val,
            unit: 'kWh',
            device_class: dc,
            state_class: sc,
            icon: attrs.icon || 'mdi:flash',
            last_updated: state.last_updated
          });
        }
      }
      const deviceMap = {};
      for (const sensor of energySensors) {
        const eid = sensor.entity_id.replace('sensor.', '');
        let deviceKey = eid
          .replace(/_energy_?.*$/i, '')
          .replace(/_power_?.*$/i, '')
          .replace(/_electricity_?.*$/i, '')
          .replace(/_daily$/i, '')
          .replace(/_weekly$/i, '')
          .replace(/_monthly$/i, '')
          .replace(/_total$/i, '')
          .replace(/_kwh$/i, '')
          .replace(/_consumption$/i, '');
        if (!deviceMap[deviceKey]) {
          deviceMap[deviceKey] = {
            key: deviceKey,
            name: sensor.friendly_name.replace(/\s*(energy|power|electricity|daily|weekly|monthly|total|kwh|consumption)\s*/gi, '').trim() || deviceKey.replace(/_/g, ' '),
            sensors: []
          };
        }
        deviceMap[deviceKey].sensors.push(sensor);
      }
      const devices = [];
      for (const [key, device] of Object.entries(deviceMap)) {
        const sorted = device.sensors.sort((a, b) => {
          const priority = { total_increasing: 3, total: 2, measurement: 1 };
          return (priority[b.state_class] || 0) - (priority[a.state_class] || 0) || b.value - a.value;
        });
        const best = sorted[0];
        if (best) {
          devices.push({
            key: key,
            name: device.name.charAt(0).toUpperCase() + device.name.slice(1),
            entity_id: best.entity_id,
            value_kwh: best.value,
            sensor_count: device.sensors.length,
            all_sensors: device.sensors
          });
        }
      }
      devices.sort((a, b) => b.value_kwh - a.value_kwh);
      this._discoveredDevices = devices;
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
      // Use entity registry to check existence (hass.states may not have new helpers yet)
      let registeredIds = new Set();
      try {
        const entries = await this._hass.callWS({ type: 'config/entity_registry/list' });
        for (const e of entries) {
          if (e.entity_id.startsWith('input_text.energy_email')) registeredIds.add(e.entity_id);
        }
      } catch(e) { /* fallback to hass.states check */ }
      let created = 0;
      for (const h of HAEnergyEmail.HELPERS) {
        const slug = h.name.toLowerCase().replace(/\s+/g, '_');
        const eid = `input_text.${slug}`;
        if (registeredIds.has(eid) || this._hass.states[eid]) continue;
        try {
          await this._hass.callWS({ type: 'input_text/create', name: h.name, min: 0, max: h.max, initial: '', mode: 'text' });
          created++;
        } catch (e) {
          // May fail if already exists or no permission — that's ok
        }
      }
      // If we created helpers, wait for HA to register them in states
      if (created > 0) await new Promise(r => setTimeout(r, 1500));
      this._helpersReady = true;
      this._loadFromHelpers();
    }

    _loadFromHelpers() {
      const s = this._hass?.states;
      if (!s) return;
      const read = (key) => {
        const eid = this._helperEntity(key);
        const val = s[eid]?.state;
        return (val && val !== 'unknown' && val !== '') ? val : '';
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
      if (price && !isNaN(parseFloat(price)) && parseFloat(price) > 0) this._config.energy_price = parseFloat(price);
      const excluded = read('excluded');
      if (excluded) this._excludedDevices = new Set(excluded.split(',').map(s => s.trim()).filter(Boolean));
    }

    async _saveToHelper(key, value) {
      const eid = this._helperEntity(key);
      try {
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
      if (!this._hass) return;
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
      const manual = this._devices();
      if (manual.length === 0) return this._getOverviewData();
      if (period === 'total' || period === 'month') {
        return manual.map(d => ({
          name: d.name,
          month: this._float(this._state(period === 'total' ? (d.energy_month || d.energy_week) : d.energy_month, '0')),
          lastMonth: this._float(this._state(d.energy_last_month, '0')),
          cost: this._float(this._state(d.cost_month || d.cost_week, '0')),
          source: 'manual'
        })).sort((a, b) => b.month - a.month);
      }
      if (period === 'week') {
        return manual.map(d => ({
          name: d.name,
          month: this._float(this._state(d.energy_week, '0')),
          lastMonth: this._float(this._state(d.energy_last_week, '0')),
          cost: this._float(this._state(d.cost_week, '0')),
          source: 'manual'
        })).sort((a, b) => b.month - a.month);
      }
      if (period === 'day') {
        return manual.map(d => ({
          name: d.name,
          month: this._float(this._state(d.energy_day || d.energy_week, '0')),
          lastMonth: 0,
          cost: this._float(this._state(d.energy_day || d.energy_week, '0')) * this._getAvgRate(),
          source: 'manual'
        })).sort((a, b) => b.month - a.month);
      }
      return this._getOverviewData();
    }

    _getAutoDataForPeriod(period) {
      // Return cached recorder stats if available
      const cacheKey = `_periodCache_${period}`;
      if (this[cacheKey] && this[cacheKey].length > 0) return this._filterExcluded(this[cacheKey]).sort((a, b) => b.month - a.month);
      // Fallback: try suffix-based sensors
      if (!this._discoveredDevices) return [];
      const suffixMap = { day: /daily|_day|_24h/i, week: /weekly|_week|_7d/i, month: /monthly|_month|_30d/i };
      const regex = suffixMap[period];
      if (!regex) return [];
      const result = [];
      for (const dev of this._discoveredDevices) {
        if (!dev.all_sensors) continue;
        const match = dev.all_sensors.find(s => regex.test(s.entity_id) || regex.test(s.friendly_name));
        if (match) {
          result.push({
            name: dev.name, key: dev.key || dev.entity_id,
            month: match.value, lastMonth: 0,
            cost: match.value * this._getAvgRate(),
            entity_id: match.entity_id, source: 'auto'
          });
        }
      }
      return this._filterExcluded(result).sort((a, b) => b.month - a.month);
    }

    // Fetch energy consumption from HA recorder statistics (same as Energy Dashboard)
    async _fetchRecorderStats(period) {
      if (!this._hass || !this._discoveredDevices || this._discoveredDevices.length === 0) return;
      const now = new Date();
      const periodConfig = {
        day:   { hours: 24, statPeriod: 'hour' },
        week:  { hours: 168, statPeriod: 'day' },
        month: { hours: 720, statPeriod: 'day' }
      };
      const pc = periodConfig[period];
      if (!pc) return;
      const startTime = new Date(now.getTime() - pc.hours * 3600000);
      // Collect all total_increasing sensor entity_ids
      const sensorIds = [];
      const devMap = {};
      for (const dev of this._discoveredDevices) {
        // Pick the best total_increasing sensor per device
        const best = dev.all_sensors
          ? dev.all_sensors.find(s => s.state_class === 'total_increasing') || dev.all_sensors[0]
          : { entity_id: dev.entity_id };
        if (best && best.entity_id) {
          sensorIds.push(best.entity_id);
          devMap[best.entity_id] = dev;
        }
      }
      if (sensorIds.length === 0) return;
      try {
        const stats = await this._hass.callWS({
          type: 'recorder/statistics_during_period',
          start_time: startTime.toISOString(),
          end_time: now.toISOString(),
          statistic_ids: sensorIds,
          period: pc.statPeriod,
          types: ['change']
        });
        const result = [];
        for (const [entityId, dataPoints] of Object.entries(stats || {})) {
          const dev = devMap[entityId];
          if (!dev || !dataPoints || dataPoints.length === 0) continue;
          const totalChange = dataPoints.reduce((sum, dp) => sum + (dp.change || 0), 0);
          // Convert Wh to kWh if needed
          const attrs = this._hass.states?.[entityId]?.attributes || {};
          const kwh = attrs.unit_of_measurement === 'Wh' ? totalChange / 1000 : totalChange;
          if (kwh <= 0) continue;
          result.push({
            name: dev.name, key: dev.key || dev.entity_id,
            month: kwh, lastMonth: 0,
            cost: kwh * this._getAvgRate(),
            entity_id: entityId, source: 'auto'
          });
        }
        // Cache results
        this[`_periodCache_${period}`] = result;
        this[`_periodCacheTime_${period}`] = Date.now();
      } catch (e) {
        // recorder/statistics_during_period may not be available on older HA versions
        console.warn('Energy Email: recorder stats fetch failed:', e.message);
      }
    }

    // Fetch stats for all periods (called once during discovery)
    async _fetchAllPeriodStats() {
      await Promise.all([
        this._fetchRecorderStats('day'),
        this._fetchRecorderStats('week'),
        this._fetchRecorderStats('month')
      ]);
    }

    _filterExcluded(data) {
      if (!this._excludedDevices || this._excludedDevices.size === 0) return data;
      return data.filter(d => {
        const key = d.key || d.entity_id || d.name;
        return !this._excludedDevices.has(key);
      });
    }

    _getOverviewData() {
      const manual = this._devices();
      if (manual.length > 0) {
        return this._filterExcluded(manual.map(d => ({
          name: d.name, key: d.name,
          month: this._float(this._state(d.energy_month, '0')),
          lastMonth: this._float(this._state(d.energy_last_month, '0')),
          cost: this._float(this._state(d.cost_month, '0')),
          source: 'manual'
        }))).sort((a, b) => b.month - a.month);
      }
      if (this._discoveredDevices && this._discoveredDevices.length > 0) {
        return this._filterExcluded(this._discoveredDevices.map(d => ({
          name: d.name, key: d.key || d.entity_id,
          month: d.value_kwh,
          lastMonth: 0,
          cost: d.value_kwh * this._getAvgRate(),
          entity_id: d.entity_id,
          sensor_count: d.sensor_count,
          source: 'auto'
        }))).sort((a, b) => b.month - a.month);
      }
      return [];
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

    _render() {
      if (!this._hass) return;
      const L = this._lang === 'pl';
      const recipient = this._getRecipient();
      const recipientDisplay = recipient
        ? `To: ${_esc(recipient)}`
        : (L ? 'Nie ustawiono odbiorcy' : 'No recipient set');
      this.shadowRoot.innerHTML = `
        <style>${window.HAToolsBentoCSS || ""}


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
              <div class="header-sub">${recipientDisplay} \u00A0\u2022\u00A0 <span id="price-display" style="cursor:pointer;color:var(--bento-primary);border-bottom:1px dashed var(--bento-primary)" title="${L ? 'Kliknij aby zmieni\u0107' : 'Click to change'}">${_esc(this._config.currency)} ${this._getTariffLabel()} \u270E</span></div>
            </div>
          </div>
          <div class="tabs">
            <button class="tab-btn ${this._activeTab === 'overview' ? 'active' : ''}" data-tab="overview">\u{1F4CA} Overview</button>
            <button class="tab-btn ${this._activeTab === 'schedule' ? 'active' : ''}" data-tab="schedule">\u{1F4C5} Schedule</button>
            <button class="tab-btn ${this._activeTab === 'preview' ? 'active' : ''}" data-tab="preview">\u{1F4CB} Preview</button>
            <button class="tab-btn ${this._activeTab === 'send' ? 'active' : ''}" data-tab="send">\u{1F4E4} Send Now</button>
            <button class="tab-btn ${this._activeTab === 'config' ? 'active' : ''}" data-tab="config">\u2699\uFE0F Config</button>
          </div>
          <div id="tab-content"></div>
        </div>
        <div class="toast" id="toast"></div>
      `
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
      this._injectDiscovery();
      this._bindEmailEvents();
      this._bindPriceEdit();
    }

    _injectDiscovery() {
      if (customElements.get('ha-tools-panel')) return;
      const container = this.shadowRoot.querySelector('.card');
      if (!container) return;
      if (container.querySelector('ha-tools-discovery-banner')) return;
      const _inj = () => { if (window.HAToolsDiscovery) window.HAToolsDiscovery.inject(container, 'energy-email', true); };
      if (window.HAToolsDiscovery) { _inj(); return; }
      const s = document.createElement('script');
      s.src = '/local/community/ha-tools-panel/ha-tools-discovery.js?_=' + Date.now();
      s.async = true;
      s.onload = _inj;
      document.head.appendChild(s);
    }

    _bindEmailEvents() {
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
          <span>${_esc(this._config.currency)}</span>
          <input type="number" id="price-input" value="${cur}" step="0.01" min="0" style="width:70px;padding:3px 6px;border:1.5px solid var(--bento-primary);border-radius:4px;font-size:12px;background:var(--bento-card);color:var(--bento-text);font-family:'Inter',sans-serif;text-align:center">
          <span>/kWh</span>
          <button id="price-save" class="btn btn-primary" style="padding:3px 10px;font-size:11px;margin:0" aria-label="Save">\u2714</button>
          <button id="price-cancel" class="btn" style="padding:3px 8px;font-size:11px;margin:0" aria-label="Cancel">\u2716</button>
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
          if (!isNaN(val) && val > 0) {
            this._config.energy_price = val;
            this._saveToHelper('price', String(val));
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
      switch (this._activeTab) {
        case 'overview': el.innerHTML = this._tabOverview(); this._attachOverviewEvents(); break;
        case 'schedule': el.innerHTML = this._tabSchedule(); this._attachScheduleEvents(); break;
        case 'preview':  el.innerHTML = this._tabPreview(); break;
        case 'send':     el.innerHTML = this._tabSend(); this._attachSendEvents(); break;
        case 'config':   el.innerHTML = this._tabConfig(); this._attachConfigEvents(); break;
      }
    }

    _updateLiveData() {
      if (this._activeTab !== 'send') {
        this._discoverEnergySensors();
        this._renderTab();
      }
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
      const devData = this._getOverviewData();
      const isAuto = devData.length > 0 && devData[0].source === 'auto';
      const L = this._lang === 'pl';
      if (devData.length === 0 && !this._discoveryDone) {
        return `<div class="empty-state">
          <div class="big"><span class="spinner" style="width:32px;height:32px;border-width:3px;border-color:var(--bento-primary);border-top-color:transparent;"></span></div>
          <div class="title">${L ? 'Wyszukiwanie czujnik\u00F3w energii...' : 'Discovering energy sensors...'}</div>
          <div class="desc">${L
            ? 'Skanowanie urz\u0105dze\u0144 Home Assistant i konfiguracja ustawie\u0144. To potrwa chwil\u0119.'
            : 'Scanning Home Assistant devices and configuring settings. This will take a moment.'}</div>
        </div>`;
      }
      if (devData.length === 0) {
        return `<div class="empty-state">
          <div class="big">\u{1F50C}</div>
          <div class="title">${L ? 'Nie znaleziono czujnik\u00F3w energii' : 'No Energy Sensors Found'}</div>
          <div class="desc">${L
            ? 'Karta nie znalaz\u0142a \u017Cadnych czujnik\u00F3w energii w Home Assistant. Upewnij si\u0119, \u017Ce masz skonfigurowane urz\u0105dzenia z monitoringiem energii (np. Shelly, PZEM, smart plugi) lub dodaj je do HA Energy Dashboard.'
            : 'No energy sensors found in Home Assistant. Make sure you have energy monitoring devices configured (e.g., Shelly, PZEM, smart plugs) or add them to the HA Energy Dashboard.'}</div>
          <div style="margin-top:16px;"><a class="btn btn-primary" href="/config/energy" target="_blank">\u26A1 ${L ? 'Konfiguracja Energy' : 'Energy Config'}</a></div>
        </div>`;
      }
      const period = this._overviewPeriod || 'total';
      const periodLabels = {
        total: { lbl: 'Total', lblPl: '\u0141\u0105cznie', sub: '', subPl: '' },
        day:   { lbl: 'Today', lblPl: 'Dzisiaj', sub: 'Last 24h', subPl: 'Ostatnie 24h' },
        week:  { lbl: 'This Week', lblPl: 'Ten tydzie\u0144', sub: 'Last 7 days', subPl: 'Ostatnie 7 dni' },
        month: { lbl: 'This Month', lblPl: 'Ten miesi\u0105c', sub: 'Last 30 days', subPl: 'Ostatnie 30 dni' },
      };
      const pl = periodLabels[period];
      const periodLabel = L ? pl.lblPl : pl.lbl;
      let displayData;
      let periodNote = '';
      if (!isAuto && devData.length > 0 && devData[0].source === 'manual') {
        displayData = this._getOverviewDataForPeriod(period);
      } else if (isAuto && period !== 'total') {
        // Try to find period-specific sensors for auto-discovered devices
        try { displayData = this._getAutoDataForPeriod(period); } catch(e) { displayData = []; }
        const hasRealData = displayData.length > 0 && displayData.some(d => d.month > 0);
        if (!hasRealData) {
          displayData = devData;
          periodNote = L ? '(dane total \u2014 brak sensor\u00F3w per okres)' : '(total data \u2014 no per-period sensors)';
        }
      } else {
        displayData = devData;
      }
      const totalEnergy = displayData.reduce((s, d) => s + d.month, 0);
      const totalCost = isAuto ? totalEnergy * this._getAvgRate() : displayData.reduce((s, d) => s + d.cost, 0);
      const maxVal = Math.max(...displayData.map(x => x.month)) || 1;
      const periodBtns = ['day', 'week', 'month', 'total'].map(p => {
        const lb = p === 'total' ? (L ? 'Wszystko' : 'All') : p === 'day' ? '24h' : p === 'week' ? '7d' : '30d';
        return `<button class="overview-period-btn" data-period="${p}" style="padding:5px 12px;font-size:11px;border-radius:6px;cursor:pointer;border:1px solid var(--bento-border);background:${period === p ? 'var(--bento-primary)' : 'var(--bento-bg)'};color:${period === p ? '#fff' : 'var(--bento-text)'};font-weight:${period === p ? '600' : '400'};">${lb}</button>`;
      }).join('');
      return `
        ${isAuto ? `<div class="info-row">\u{1F50D}\u00A0 ${L ? 'Auto-discovery: znaleziono <b>' + displayData.length + '</b> urz\u0105dze\u0144 z czujnikami energii.' : 'Auto-discovery: found <b>' + displayData.length + '</b> devices with energy sensors.'} <span class="source-badge source-auto">AUTO</span>${periodNote ? `<br><span style="font-size:11px;color:var(--bento-warning)">${periodNote}</span>` : ''}</div>` : ''}
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div class="section-title" style="margin:0;">\u{1F4CA} ${periodLabel}</div>
          <div style="display:flex;gap:4px;">${periodBtns}</div>
        </div>
        <div class="grid3">
          <div class="stat">
            <div class="stat-value" style="color:#F59E0B">${totalEnergy.toFixed(1)}</div>
            <div class="stat-label">kWh ${periodLabel}</div>
            <div class="stat-sub">${displayData.length} ${L ? 'urz\u0105dze\u0144' : 'devices'}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#3B82F6">${totalCost.toFixed(2)}</div>
            <div class="stat-label">${_esc(this._config.currency)} ${L ? 'Koszt' : 'Cost'}</div>
            <div class="stat-sub">@ ${this._getTariffLabel()}</div>
          </div>
          <div class="stat">
            <div class="stat-value" style="color:#10B981">${displayData.length > 0 ? displayData[0].name.split(' ').slice(0,2).join(' ') : '-'}</div>
            <div class="stat-label">${L ? 'Najwi\u0119ksze zu\u017Cycie' : 'Top Consumer'}</div>
            <div class="stat-sub">${displayData.length > 0 ? displayData[0].month.toFixed(1) + ' kWh' : ''}</div>
          </div>
        </div>
        <div class="section-title">\u26A1 ${L ? 'Zu\u017Cycie wg urz\u0105dzenia' : 'Energy by Device'}</div>
        ${(() => {
          const page = this._devicePage || 0;
          const perPage = this._devicesPerPage || 20;
          const totalPages = Math.ceil(displayData.length / perPage);
          const pageData = displayData.slice(page * perPage, (page + 1) * perPage);
          const rows = pageData.map(d => {
            const pct = maxVal > 0 ? (d.month / maxVal * 100) : 0;
            const diff = d.month - d.lastMonth;
            const diffStr = d.lastMonth > 0 && diff !== 0 ? `<span class="${diff > 0 ? 'trend-up' : 'trend-down'}">${diff > 0 ? '+' : ''}${diff.toFixed(1)} kWh</span>` : '';
            const entityInfo = d.entity_id ? `<span style="font-size:10px;color:var(--bento-text-muted)" title="${d.entity_id}">${d.entity_id.split('.')[1].substring(0,20)}</span>` : '';
            return `<div class="device-row" title="${d.entity_id || d.name}">
              <div class="device-name">${d.name} ${entityInfo}</div>
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
          <div class="info-row">\u{1F4BE}\u00A0 ${L ? 'Harmonogramy s\u0105 zapisywane po stronie integracji HA Tools Email v2.0.0.' : 'Schedules are stored server-side by the HA Tools Email v2.0.0 integration.'}</div>
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
        <div class="schedule-meta"><span>${cadenceLabel}</span><span>kind: energy_report</span>${schedule?.id ? `<span>${_esc(schedule.id)}</span>` : ''}</div>
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
          ? '<b>Brak adresu email.</b> Ustaw email w polu powy\u017Cej lub skonfiguruj serwis notify z SMTP.'
          : '<b>No email recipient.</b> Set email in the field above or configure an SMTP notify service.'}</div>` : ''}
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
          <strong>\u2139\uFE0F ${L ? 'Info' : 'Info'}:</strong> ${L
            ? 'Ustawienia (email, serwis, godziny) s\u0105 zapisywane w Home Assistant i dzia\u0142aj\u0105 na ka\u017Cdym urz\u0105dzeniu.'
            : 'Settings (email, service, times) are stored in Home Assistant and work across all your devices.'}
        </div>`;
    }

    _tabPreview() {
      const L = this._lang === 'pl';
      if (!this._discoveryDone) {
        return `<div class="empty-state"><div class="big"><span class="spinner" style="width:32px;height:32px;border-width:3px;border-color:var(--bento-primary);border-top-color:transparent;"></span></div><div class="title">${L ? '\u0141adowanie danych...' : 'Loading data...'}</div></div>`;
      }
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
      const getDevData = (period) => {
        if (devices.length > 0) {
          return devices.map(d => {
            let current = 0, previous = 0, cost = 0;
            if (period === 'day') { current = this._float(this._state(d.energy_day || d.energy_week, '0')); cost = current * this._getAvgRate(); }
            else if (period === 'month') { current = this._float(this._state(d.energy_month, '0')); previous = this._float(this._state(d.energy_last_month, '0')); cost = this._float(this._state(d.cost_month || d.cost_week, '0')); }
            else { current = this._float(this._state(d.energy_week, '0')); previous = this._float(this._state(d.energy_last_week, '0')); cost = this._float(this._state(d.cost_week, '0')); }
            return { name: d.name, current, previous, cost };
          }).sort((a, b) => b.current - a.current);
        }
        try { var periodData = this._getAutoDataForPeriod(period); } catch(e) { var periodData = []; }
        if (periodData && periodData.length > 0 && periodData.some(d => d.month > 0)) {
          return periodData.map(d => ({ name: d.name, current: d.month, previous: d.lastMonth || 0, cost: d.cost || d.month * this._getAvgRate(), hasPeriod: true })).sort((a, b) => b.current - a.current);
        }
        return autoDevices.map(d => ({ name: d.name, current: d.value_kwh, previous: 0, cost: d.value_kwh * this._getAvgRate(), hasPeriod: false })).sort((a, b) => b.current - a.current);
      };
      const renderReport = (p) => {
        const title = L ? p.titleL : p.titleE;
        const range = L ? p.rangeL : p.rangeE;
        const devData = getDevData(p.key);
        const totalEnergy = devData.reduce((s, d) => s + d.current, 0);
        const totalCost = devData.reduce((s, d) => s + d.cost, 0);
        const top5 = devData.slice(0, 5);
        const isPeriodData = devData.length > 0 && devData[0].hasPeriod;
        const periodNote = !isPeriodData && isAuto ? `<div style="font-size:11px;color:var(--bento-text-secondary);margin-bottom:6px;font-style:italic">\u26A0 ${L ? 'Brak sensor\u00F3w dla tego okresu \u2014 pokazano dane total' : 'No period-specific sensors found \u2014 showing total data'}</div>` : '';
        return `<div class="preview-box" style="margin-bottom:14px">
          <h3 style="margin:0 0 8px">${p.icon} ${title} \u2013 ${today}</h3>
          ${periodNote}
          <div style="font-size:12px;color:var(--bento-text-secondary);margin-bottom:10px">\u{1F4E7} ${recipientLine} \u00A0\u2022\u00A0 ${range} \u00A0\u2022\u00A0 ${devData.length} ${L ? 'urz.' : 'dev.'}</div>
          <div style="display:flex;gap:16px;margin-bottom:10px;flex-wrap:wrap">
            <div><span style="font-size:18px;font-weight:700;color:#F59E0B">${totalEnergy.toFixed(1)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">kWh</span></div>
            <div><span style="font-size:18px;font-weight:700;color:#3B82F6">${totalCost.toFixed(2)}</span> <span style="font-size:11px;color:var(--bento-text-secondary)">${_esc(this._config.currency)}</span></div>
          </div>
          <table class="preview-table">
            <thead><tr><th>${L ? 'Urz\u0105dzenie' : 'Device'}</th><th>kWh</th><th>${L ? 'Koszt' : 'Cost'} (${_esc(this._config.currency)})</th></tr></thead>
            <tbody>${top5.map(d => `<tr><td>${d.name}</td><td>${d.current.toFixed(2)}</td><td>${d.cost.toFixed(2)}</td></tr>`).join('')}
            ${devData.length > 5 ? `<tr><td colspan="3" style="text-align:center;color:var(--bento-text-secondary);font-size:11px">+ ${devData.length - 5} ${L ? 'wi\u0119cej urz\u0105dze\u0144' : 'more devices'}...</td></tr>` : ''}</tbody>
          </table>
        </div>`;
      };
      return `
        ${isAuto ? `<div class="info-row">\u{1F50D}\u00A0 ${L ? 'Auto-discovery: dane z sensor\u00F3w total.' : 'Auto-discovery: showing total sensor data.'}</div>` : ''}
        <div class="section-title" style="margin-top:0">\u{1F4CB} ${L ? 'Podgl\u0105d raport\u00F3w email' : 'Email Report Previews'}</div>
        ${periods.map(p => renderReport(p)).join('')}
        <div style="font-size:11px;color:var(--bento-text-secondary);margin-top:4px">${L ? 'Podgl\u0105d tre\u015Bci emaila. Rzeczywisty email zawiera pe\u0142n\u0105 tabel\u0119 HTML.' : 'Preview of email content. Actual email contains full HTML table.'}</div>`;
    }

    _tabSend() {
      const L = this._lang === 'pl';
      const smtpConfig = this._renderSmtpSection();
      const canSend = this._hasHaToolsEmail();
      const quickDisabled = this._sending || (this._emailBackendAvailable ? true : !canSend);
      const modeText = this._emailBackendAvailable
        ? (L ? 'R\u0119cznie wy\u015Blij raport energii przez backend HA Tools Email v2.0.0.' : 'Manually trigger an energy report through the HA Tools Email v2.0.0 backend.')
        : (L ? 'R\u0119cznie wy\u015Blij raport energii poprzez ha_tools_email.' : 'Manually trigger an energy report via ha_tools_email.');
      return `
        <div class="info-row">\u{1F4E4}\u00A0 ${modeText}</div>
        ${smtpConfig}
        <div style="font-size:12px;color:var(--bento-text-secondary);margin:16px 0 12px;padding:10px;background:var(--bento-primary-light);border-radius:var(--bento-radius-xs)">${L ? '💡 Konfiguracja SMTP w: HA Tools Panel → Settings → Log Email' : '💡 SMTP configuration in: HA Tools Panel → Settings → Log Email'}</div>
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
      const allDevices = this._discoveredDevices || [];
      const manual = this._devices();
      const isAuto = manual.length === 0 && allDevices.length > 0;
      const devices = isAuto
        ? allDevices.map(d => ({ key: d.key || d.entity_id, name: d.name, value: d.value_kwh, entity_id: d.entity_id }))
        : manual.map(d => ({ key: d.name, name: d.name, value: this._float(this._state(d.energy_month || d.energy_week, '0')), entity_id: '' }));
      devices.sort((a, b) => a.name.localeCompare(b.name));
      const excluded = this._excludedDevices;
      const enabledCount = devices.filter(d => !excluded.has(d.key)).length;

      const recipient = this._getRecipient();
      const price = this._getAvgRate();
      const currency = this._config.currency || 'PLN';

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
            <input type="number" id="cfg-price" class="config-input" value="${_esc(price)}" step="0.01" min="0" style="width:80px">
            <span style="font-size:12px;color:var(--bento-text-secondary)">${currency}/kWh</span>
            <button class="btn btn-primary" id="cfg-price-save" style="padding:6px 14px;font-size:12px">${L ? 'Zapisz' : 'Save'}</button>
          </div>
        </div>

        <div class="config-section">
          <div class="config-section-title">\u{1F50C} ${L ? 'Urz\u0105dzenia w raportach' : 'Devices in Reports'} <span class="device-count">(${enabledCount}/${devices.length} ${L ? 'aktywnych' : 'active'})</span></div>
          <div style="margin-bottom:10px;display:flex;gap:8px">
            <button class="btn" id="cfg-select-all" style="font-size:11px;padding:4px 12px">${L ? 'Zaznacz wszystkie' : 'Select All'}</button>
            <button class="btn" id="cfg-deselect-all" style="font-size:11px;padding:4px 12px">${L ? 'Odznacz wszystkie' : 'Deselect All'}</button>
          </div>
          <div style="max-height:350px;overflow-y:auto;border:1px solid var(--bento-border);border-radius:var(--bento-radius-sm);padding:4px">
            ${devices.map(d => {
              const checked = !excluded.has(d.key);
              return `<div class="device-toggle">
                <div class="toggle-switch">
                  <input type="checkbox" id="dev-${d.key}" data-key="${d.key}" ${checked ? 'checked' : ''}>
                  <span class="toggle-slider"></span>
                </div>
                <label for="dev-${d.key}">${d.name}</label>
                <div class="dt-val">${d.value.toFixed(1)} kWh</div>
              </div>`;
            }).join('')}
            ${devices.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--bento-text-secondary);font-size:13px">${L ? 'Brak wykrytych urz\u0105dze\u0144' : 'No devices detected'}</div>` : ''}
          </div>
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
        if (!isNaN(val) && val > 0) {
          this._config.energy_price = val;
          this._saveToHelper('price', String(val));
          this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Stawka zapisana' : 'Price saved'));
          this._render();
        }
      });
      // Device toggles
      root.querySelectorAll('.device-toggle input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
          const key = cb.dataset.key;
          if (cb.checked) {
            this._excludedDevices.delete(key);
          } else {
            this._excludedDevices.add(key);
          }
          this._saveExcludedDevices();
          // Update count
          const countEl = root.querySelector('.device-count');
          if (countEl) {
            const total = root.querySelectorAll('.device-toggle input').length;
            const active = root.querySelectorAll('.device-toggle input:checked').length;
            const L = this._lang === 'pl';
            countEl.textContent = `(${active}/${total} ${L ? 'aktywnych' : 'active'})`;
          }
        });
      });
      // Select/Deselect all
      const selectAll = root.getElementById('cfg-select-all');
      const deselectAll = root.getElementById('cfg-deselect-all');
      if (selectAll) selectAll.addEventListener('click', () => {
        this._excludedDevices.clear();
        this._saveExcludedDevices();
        this._renderTab();
      });
      if (deselectAll) deselectAll.addEventListener('click', () => {
        root.querySelectorAll('.device-toggle input[type="checkbox"]').forEach(cb => {
          this._excludedDevices.add(cb.dataset.key);
        });
        this._saveExcludedDevices();
        this._renderTab();
      });
    }

    _saveExcludedDevices() {
      const list = [...this._excludedDevices].join(',');
      this._saveToHelper('excluded', list);
    }

    _attachScheduleEvents() {
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
      if (!cadence) return;
      this._legacySchedules = this._legacySchedules || {};
      this._legacySchedules[cadence] = { kind: 'energy_report', cadence, time: this._defaultScheduleTime(cadence), recipients: [], enabled: false };
      this._saveLegacySchedules();
      this._showToast('\u2705 ' + (this._lang === 'pl' ? 'Harmonogram lokalny wyczyszczony' : 'Local schedule cleared'));
      this._render();
    }

    // --- Automation creation ---

    async _createAutomation(type, update = false) {
      if (!this._hass) return;
      const recipient = this._getRecipient();
      if (!this._hasHaToolsEmail()) { this._showToast('\u274C ' + (this._lang === 'pl' ? 'ha_tools_email nie zainstalowany' : 'ha_tools_email not installed')); return; }
      if (!recipient) { this._showToast('\u274C ' + (this._lang === 'pl' ? 'Najpierw ustaw adres email' : 'Set email address first')); return; }
      const sd = this._scheduleDefaults;
      const L = this._lang === 'pl';
      const [dailyH, dailyM] = sd.daily.split(':').map(Number);
      const [weeklyH, weeklyM] = sd.weekly_time.split(':').map(Number);
      const [monthlyH, monthlyM] = sd.monthly_time.split(':').map(Number);
      const dayMap = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
      const configs = {
        daily: {
          alias: 'Send Daily Energy Report',
          id: 'send_daily_energy_report',
          trigger: [{ platform: 'time', at: `${String(dailyH).padStart(2,'0')}:${String(dailyM).padStart(2,'0')}:00` }],
          description: 'Auto-created by HA Energy Email card'
        },
        weekly: {
          alias: 'Send Weekly Energy Report',
          id: 'send_weekly_energy_report',
          trigger: [{ platform: 'time', at: `${String(weeklyH).padStart(2,'0')}:${String(weeklyM).padStart(2,'0')}:00` }],
          condition: [{ condition: 'time', weekday: [['sun','mon','tue','wed','thu','fri','sat'][dayMap[sd.weekly_day] || 1]] }],
          description: 'Auto-created by HA Energy Email card'
        },
        monthly: {
          alias: 'Send Monthly Energy Report',
          id: 'send_monthly_energy_report',
          trigger: [{ platform: 'time', at: `${String(monthlyH).padStart(2,'0')}:${String(monthlyM).padStart(2,'0')}:00` }],
          condition: [{ condition: 'template', value_template: '{{ now().day == 1 }}' }],
          description: 'Auto-created by HA Energy Email card'
        }
      };
      const cfg = configs[type];
      if (!cfg) return;
      // Build email with actual sensor data via Jinja templates
      const price = this._getAvgRate();
      const currency = this._config.currency || 'PLN';
      const typeName = type.charAt(0).toUpperCase() + type.slice(1);
      const periodMap = { daily: 'day', weekly: 'week', monthly: 'month' };
      const periodKey = periodMap[type] || 'day';
      // Get sensor list: prefer period-specific sensors, fallback to total
      let sensorList = [];
      const periodData = this._getAutoDataForPeriod(periodKey);
      if (periodData && periodData.length > 0) {
        sensorList = periodData.map(d => ({ name: d.name, entity: d.entity_id }));
      } else {
        const autoDevs = this._discoveredDevices || [];
        const manualDevs = this._devices();
        if (manualDevs.length > 0) {
          const sensorKey = type === 'daily' ? 'energy_day' : type === 'weekly' ? 'energy_week' : 'energy_month';
          sensorList = manualDevs.map(d => ({ name: d.name, entity: d[sensorKey] || d.energy_week || d.energy_month })).filter(d => d.entity);
        } else {
          sensorList = autoDevs.map(d => ({ name: d.name, entity: d.entity_id }));
        }
      }
      // Build Jinja template for the email body
      const sensorLines = sensorList.map(s =>
        `{{ '${s.name}' }}: {{ states('${s.entity}') | float(0) | round(2) }} kWh = {{ (states('${s.entity}') | float(0) * ${price}) | round(2) }} ${currency}`
      ).join('\\n');
      const totalExpr = sensorList.map(s => `states('${s.entity}') | float(0)`).join(' + ');
      const totalCostExpr = `(${totalExpr}) * ${price}`;
      const periodLabel = type === 'daily' ? (L ? 'Wczoraj / ostatnie 24h' : 'Yesterday / Last 24h')
        : type === 'weekly' ? (L ? 'Ostatnie 7 dni' : 'Last 7 days')
        : (L ? 'Ostatni miesi\u0105c' : 'Last month');
      const emailMsg = [
        `\u26A1 Energy ${typeName} Report`,
        `{{ now().strftime('%Y-%m-%d %H:%M') }}`,
        `${L ? 'Okres' : 'Period'}: ${periodLabel}`,
        `${L ? 'Urz\u0105dze\u0144' : 'Devices'}: ${sensorList.length}`,
        ``,
        `${L ? '\u0141\u0105cznie' : 'Total'}: {{ (${totalExpr}) | round(2) }} kWh = {{ (${totalCostExpr}) | round(2) }} ${currency}`,
        ``,
        `${L ? 'Szczeg\u00F3\u0142y' : 'Details'}:`,
        sensorLines,
        ``,
        `---`,
        `Generated by HA Energy Email card | ${this._getTariffLabel()}`
      ].join('\\n');
      const action = [{
        service: 'ha_tools_email.send',
        data: {
          subject: `\u26A1 Energy ${typeName} Report \u2013 {{ now().strftime('%Y-%m-%d') }}`,
          body: emailMsg,
          to: recipient
        }
      }];
      try {
        if (update) {
          // Delete old automation first, then create new
          try { await this._hass.callService('automation', 'turn_off', { entity_id: `automation.${cfg.id}` }); } catch(e) { console.debug('[ha-energy-email] caught:', e); }
        }
        await this._hass.callWS({
          type: 'config/automation/config',
          automation_id: cfg.id,
          ...cfg,
          action: action,
          mode: 'single'
        });
        this._showToast(`\u2705 ${update ? (L ? 'Automatyzacja zaktualizowana' : 'Automation updated') : (L ? 'Automatyzacja utworzona' : 'Automation created')}!`);
        // Wait for HA to register the automation, then refresh
        setTimeout(() => this._renderTab(), 2000);
      } catch (e) {
        this._showToast('\u274C Error: ' + (e.message || 'Failed to create automation'));
      }
    }

    // --- HA service calls ---

    async _toggleAuto(entity_id, enable) {
      if (!this._hass) return;
      try {
        await this._hass.callService('automation', enable ? 'turn_on' : 'turn_off', { entity_id });
        this._showToast(`\u2705 Automation ${enable ? 'enabled' : 'disabled'}`);
        setTimeout(() => this._renderTab(), 800);
      } catch (e) { this._showToast('\u274C Error: ' + (e.message || 'Unknown error')); }
    }

    async _sendReportViaBackend(cadence) {
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
      const currency = this._config.currency || 'PLN';
      const dateStr = new Date().toISOString().split('T')[0];
      const nowStr = new Date().toLocaleString((this._lang === 'pl' ? 'pl-PL' : 'en-US'), { hour12: false });
      try {
        if (!this._hasHaToolsEmail()) throw new Error(L ? 'ha_tools_email nie zainstalowany. Skonfiguruj SMTP w Ustawienia \u2192 Email/SMTP.' : 'ha_tools_email not installed. Configure SMTP in Settings \u2192 Email/SMTP.');
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
        let devices = [];
        const cached = this[`_periodCache_${periodKey}`];
        if (cached && cached.length > 0) {
          devices = this._filterExcluded(cached).sort((a, b) => b.month - a.month);
        } else {
          // Fallback to total data
          const auto = this._discoveredDevices || [];
          const manual = this._devices();
          if (manual.length > 0) {
            devices = manual.map(d => ({ name: d.name, month: this._float(this._state(d.energy_month || d.energy_week, '0')), cost: this._float(this._state(d.cost_month || d.cost_week, '0')) }));
          } else {
            devices = this._filterExcluded(auto.map(d => ({ name: d.name, month: d.value_kwh, cost: d.value_kwh * price }))).sort((a, b) => b.month - a.month);
          }
        }
        if (devices.length === 0) throw new Error(L ? 'Brak danych o energii' : 'No energy data available');
        const totalKwh = devices.reduce((s, d) => s + (d.month || 0), 0);
        const totalCost = devices.reduce((s, d) => s + (d.cost || d.month * price), 0);
        const topDevice = devices[0];
        // Build HTML email
        const typeName = { daily: L ? 'Dzienny' : 'Daily', weekly: L ? 'Tygodniowy' : 'Weekly', monthly: L ? 'Miesi\u0119czny' : 'Monthly', quick: L ? 'Podsumowanie' : 'Summary' }[type] || type;
        const deviceRows = devices.map((d, i) => {
          const kwh = (d.month || 0).toFixed(2);
          const cost = (d.cost || d.month * price).toFixed(2);
          const pct = totalKwh > 0 ? ((d.month / totalKwh) * 100).toFixed(0) : 0;
          const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
          return `<tr style="background:${bg}"><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:14px">${d.name}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${kwh}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right">${cost}</td><td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;text-align:right;color:#64748b">${pct}%</td></tr>`;
        }).join('');
        const html = `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
          <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:24px 28px;color:#fff">
            <h1 style="margin:0;font-size:22px;font-weight:700">\u26A1 ${L ? 'Raport energii' : 'Energy Report'} \u2014 ${typeName}</h1>
            <p style="margin:6px 0 0;opacity:.85;font-size:14px">${dateStr} \u2022 ${periodLabels[type]} \u2022 ${devices.length} ${L ? 'urz.' : 'dev.'}</p>
          </div>
          <div style="padding:20px 28px">
            <div style="display:flex;gap:16px;margin-bottom:20px">
              <div style="flex:1;background:#fef3c7;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;color:#d97706">${totalKwh.toFixed(1)}</div>
                <div style="font-size:12px;color:#92400e;margin-top:2px">kWh</div>
              </div>
              <div style="flex:1;background:#dbeafe;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:28px;font-weight:700;color:#1d4ed8">${totalCost.toFixed(2)}</div>
                <div style="font-size:12px;color:#1e40af;margin-top:2px">${currency}</div>
              </div>
              <div style="flex:1;background:#d1fae5;border-radius:10px;padding:16px;text-align:center">
                <div style="font-size:16px;font-weight:700;color:#047857">${topDevice ? topDevice.name.split(' ').slice(0,2).join(' ') : '-'}</div>
                <div style="font-size:12px;color:#065f46;margin-top:2px">${L ? 'Top' : 'Top'}: ${topDevice ? topDevice.month.toFixed(1) : 0} kWh</div>
              </div>
            </div>
            <table style="width:100%;border-collapse:collapse;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0">
              <thead><tr style="background:#f1f5f9">
                <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${L ? 'Urz\u0105dzenie' : 'Device'}</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">kWh</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">${currency}</th>
                <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:#64748b;letter-spacing:.5px">%</th>
              </tr></thead>
              <tbody>${deviceRows}
              <tr style="background:#f1f5f9;font-weight:700">
                <td style="padding:12px 14px;font-size:14px">${L ? '\u0141\u0105cznie' : 'Total'}</td>
                <td style="padding:12px 14px;text-align:right">${totalKwh.toFixed(2)}</td>
                <td style="padding:12px 14px;text-align:right">${totalCost.toFixed(2)}</td>
                <td style="padding:12px 14px;text-align:right">100%</td>
              </tr></tbody>
            </table>
            <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center">${this._getTariffLabel()} \u2022 HA Energy Email Card</p>
          </div>
        </div>`;
        const title = `\u26A1 ${typeName} ${L ? 'raport energii' : 'Energy Report'} \u2013 ${dateStr}`;
        const plainText = `${typeName} ${L ? 'raport energii' : 'Energy Report'} - ${dateStr}\n${L ? '\u0141\u0105cznie' : 'Total'}: ${totalKwh.toFixed(2)} kWh / ${totalCost.toFixed(2)} ${currency}\n${devices.map(d => `${d.name}: ${(d.month||0).toFixed(2)} kWh`).join('\n')}`;
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
            <div class="smtp-detail">${L ? 'Backend jest dost\u0119pny, ale smtp_configured=false. Has\u0142o nie jest zwracane przez API.' : 'Backend is available, but smtp_configured=false. Password is never returned by the API.'}</div>
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
          <div class="smtp-detail">${L ? 'Otw\u00F3rz' : 'Open'} <b>HA Tools \u2192 ${L ? 'Ustawienia' : 'Settings'} \u2192 Email/SMTP</b></div>
        </div></div>
      </div>`;
    }

    async _testSmtp() {
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
      setTimeout(() => toast.classList.remove('show'), 3500);
    }

    disconnectedCallback() {
      // Cleanup any active event listeners or timers
    }

    setActiveTab(tabId) {
      this._activeTab = tabId;
      this._render();
    }
  }

  if (!customElements.get('ha-energy-email')) customElements.define('ha-energy-email', HAEnergyEmail);
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
                <input type="text" id="cf_currency" value="${_esc(this._config?.currency || 'PLN')}"
                  style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
              </div>
              <div style="margin-bottom:12px;">
                <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Energy price</label>
                <input type="text" id="cf_energy_price" value="${_esc(this._config?.energy_price || '0.65')}"
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
  window.customCards.push({ type: 'ha-energy-email', name: 'Energy Email Reports', description: 'Send energy reports via email. Auto-discovers energy sensors.', preview: true });
})();
