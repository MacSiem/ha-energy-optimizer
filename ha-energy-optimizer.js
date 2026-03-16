class HaEnergyOptimizer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._currentTab = 'dashboard';
    this._energyData = [];
    this._weeklyData = [];
    this._recommendations = [];
    this._comparisonData = null;
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
    this._config = config;
    this._generateDemoData();
    this._generateRecommendations();
    this._generateComparisonData();
  }

  set hass(hass) {
    this._hass = hass;
    this._updateEnergyData();
    this._render();
  }

  _generateDemoData() {
    // Generate 24-hour energy data
    this._energyData = [];
    const baseUsage = 0.5;
    for (let hour = 0; hour < 24; hour++) {
      let usage = baseUsage;
      if (hour >= 6 && hour <= 9) usage += 1.2; // Morning peak
      if (hour >= 18 && hour <= 21) usage += 1.8; // Evening peak
      if (hour >= 23 || hour <= 5) usage -= 0.3; // Night low
      usage += Math.random() * 0.3 - 0.15; // Random variation
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
        usage += Math.random() * 0.3 - 0.15;
        dayData.push(Math.max(0.1, usage));
      }
      this._weeklyData.push(dayData);
    }
  }

  _updateEnergyData() {
    if (!this._hass || !this._config.entities) return;
    // Try to read actual sensor data if available
    const sensor = this._hass.states[this._config.entities[0]];
    if (sensor && sensor.state) {
      // Sensor found - could integrate real data here
      // For now, we use the demo data as fallback
    }
  }

  _generateRecommendations() {
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
        icon: '📱',
        title: 'Reduce standby power consumption',
        description: 'Use smart power strips to eliminate phantom loads from devices in standby mode.',
        savings: 4.5,
        difficulty: 'easy',
        impact: 'low'
      }
    ];
  }

  _generateComparisonData() {
    const weeklyTotal = this._energyData.reduce((a, b) => a + b, 0);
    const lastWeekData = this._weeklyData.map(day => day.reduce((a, b) => a + b, 0));
    const thisWeekTotal = lastWeekData[lastWeekData.length - 1] || weeklyTotal;
    const lastWeekTotal = lastWeekData.slice(0, 6).reduce((a, b) => a + b, 0) || weeklyTotal * 0.95;

    this._comparisonData = {
      thisWeek: thisWeekTotal,
      lastWeek: lastWeekTotal,
      thisMonth: weeklyTotal * 4.3,
      lastMonth: weeklyTotal * 4.1,
      dailyBreakdown: lastWeekData,
      costCurrency: this._config.currency || 'PLN',
      costPerKwh: 0.45
    };
  }

  _render() {
    this.shadowRoot.innerHTML = this._getStyles() + this._getTemplate();
    this._setupEventListeners();
    this._renderCurrentTab();
  }

  _getStyles() {
    return `
      <style>
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
      
/* === Modern Bento Light Mode === */

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:host {
  --bento-bg: #F8FAFC;
  --bento-card: #FFFFFF;
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-text: #1E293B;
  --bento-text-secondary: #64748B;
  --bento-border: #E2E8F0;
  --bento-success: #10B981;
  --bento-warning: #F59E0B;
  --bento-error: #EF4444;
  --bento-radius: 16px;
  --bento-radius-sm: 10px;
  --bento-radius-xs: 6px;
  --bento-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.06);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: block;
  color-scheme: light !important;
}
* { box-sizing: border-box; }

.card, .card-container, .reports-card, .export-card {
  background: var(--bento-card); border-radius: var(--bento-radius); box-shadow: var(--bento-shadow);
  padding: 28px; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: var(--bento-text); border: 1px solid var(--bento-border); animation: fadeSlideIn 0.4s ease-out;
}
.card-header { font-size: 20px; font-weight: 700; margin-bottom: 20px; color: var(--bento-text); letter-spacing: -0.01em; display: flex; justify-content: space-between; align-items: center; }
.card-header h2 { font-size: 20px; font-weight: 700; color: var(--bento-text); margin: 0; letter-spacing: -0.01em; }
.card-title, .title, .header-title, .pan-title { font-size: 20px; font-weight: 700; color: var(--bento-text); letter-spacing: -0.01em; }
.header, .topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.tabs { display: flex; gap: 4px; border-bottom: 2px solid var(--bento-border); margin-bottom: 24px; overflow-x: auto; padding-bottom: 0; }
.tab, .tab-btn, .tab-button { padding: 10px 20px; border: none; background: transparent; color: var(--bento-text-secondary); cursor: pointer; font-size: 14px; font-weight: 500; border-bottom: 2px solid transparent; transition: var(--bento-transition); white-space: nowrap; margin-bottom: -2px; border-radius: 8px 8px 0 0; font-family: 'Inter', sans-serif; }
.tab.active, .tab-btn.active, .tab-button.active { color: var(--bento-primary); border-bottom-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab:hover, .tab-btn:hover, .tab-button:hover { color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.tab-icon { margin-right: 6px; }
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeSlideIn 0.3s ease-out; }

button, .btn, .btn-s { padding: 9px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
button:hover, .btn:hover, .btn-s:hover { background: var(--bento-bg); border-color: var(--bento-primary); color: var(--bento-primary); }
button.active, .btn.active, .btn-act { background: var(--bento-primary); color: white; border-color: var(--bento-primary); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary { padding: 9px 16px; background: var(--bento-primary); color: white; border: 1.5px solid var(--bento-primary); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 600; font-family: 'Inter', sans-serif; transition: var(--bento-transition); box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25); }
.btn-primary:hover { background: var(--bento-primary-hover); border-color: var(--bento-primary-hover); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35); transform: translateY(-1px); }
.btn-secondary { padding: 9px 16px; background: var(--bento-card); color: var(--bento-text); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-secondary:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.btn-danger { padding: 9px 16px; background: var(--bento-card); color: var(--bento-error); border: 1.5px solid var(--bento-error); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-danger:hover { background: var(--bento-error); color: white; }
.btn-small { padding: 5px 12px; font-size: 12px; border: 1px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text-secondary); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.btn-small:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }

input[type="text"], input[type="number"], input[type="date"], input[type="time"], input[type="email"], input[type="search"], select, textarea, .search-input, .sinput, .sinput-sm, .alert-search-box, .period-select { padding: 9px 14px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); font-size: 13px; background: var(--bento-card); color: var(--bento-text); font-family: 'Inter', sans-serif; transition: var(--bento-transition); outline: none; }
input[type="text"]:focus, input[type="number"]:focus, input[type="date"]:focus, input[type="time"]:focus, select:focus, textarea:focus, .search-input:focus, .sinput:focus, .sinput-sm:focus, .alert-search-box:focus, .period-select:focus { border-color: var(--bento-primary); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
input::placeholder, .search-input::placeholder, .sinput::placeholder, .sinput-sm::placeholder { color: var(--bento-text-secondary); opacity: 0.7; }
.form-group { margin-bottom: 16px; }
.form-group.full { grid-column: 1 / -1; }
.form-row { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
label, .cg label, .clbl { display: block; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.03em; }
.add-form { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; margin-bottom: 20px; }
textarea { min-height: 80px; resize: vertical; }

.stats, .stats-grid, .stats-container, .summary-grid, .network-stats, .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 20px; }
.stat, .stat-card, .summary-card, .network-stat, .metric-card, .kpi-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); text-align: center; }
.stat:hover, .stat-card:hover, .summary-card:hover, .network-stat:hover, .metric-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); transform: translateY(-1px); }
.stat-card.online { border-left: 3px solid var(--bento-success); }
.stat-card.offline { border-left: 3px solid var(--bento-error); }
.sv, .stat-value, .summary-value, .network-stat-value, .metric-value { font-size: 24px; font-weight: 700; color: var(--bento-primary); line-height: 1.2; }
.stat.ok .sv { color: var(--bento-success); }
.stat.err .sv { color: var(--bento-error); }
.sl, .stat-label, .summary-label, .network-stat-label, .metric-label { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.03em; }
.stat-trend { font-size: 12px; font-weight: 600; margin-top: 4px; }
.stat-trend.positive, .trend-up { color: var(--bento-success); }
.stat-trend.negative, .trend-down { color: var(--bento-error); }

.device-table, .entity-table, .table, .alert-table, .data-table, .backup-table, .history-table, .log-table { width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 16px; }
.device-table th, .entity-table th, .table th, .alert-table th, .data-table th, .backup-table th, table th { text-align: left; padding: 12px 16px; border-bottom: 2px solid var(--bento-border); font-weight: 600; color: var(--bento-text-secondary); background: var(--bento-bg); cursor: pointer; user-select: none; white-space: nowrap; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.device-table th:first-child, .entity-table th:first-child, .table th:first-child, table th:first-child { border-radius: var(--bento-radius-xs) 0 0 0; }
.device-table th:last-child, .entity-table th:last-child, .table th:last-child, table th:last-child { border-radius: 0 var(--bento-radius-xs) 0 0; }
.device-table th:hover, .entity-table th:hover, .table th:hover, table th:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.device-table th.sorted, .entity-table th.sorted, .table th.sorted, table th.sorted { background: rgba(59, 130, 246, 0.08); color: var(--bento-primary); }
.device-table td, .entity-table td, .table td, .alert-table td, .data-table td, .backup-table td, table td { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); color: var(--bento-text); font-size: 13px; font-family: 'Inter', sans-serif; }
.device-table tr:hover, .entity-table tr:hover, .table tbody tr:hover, .alert-table tr:hover, table tr:hover { background: rgba(59, 130, 246, 0.03); }
.table-container { overflow-x: auto; border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); }
.sort-indicator { font-size: 10px; margin-left: 4px; color: var(--bento-primary); }

.status-badge, .severity-badge { display: inline-flex; align-items: center; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; text-transform: uppercase; }
.status-online, .status-home, .status-active, .status-ok, .status-healthy, .status-running, .status-complete, .status-completed, .status-success, .badge-success { background: rgba(16, 185, 129, 0.1); color: #059669; }
.status-offline, .status-error, .status-failed, .status-critical, .severity-critical, .badge-error, .badge-danger { background: rgba(239, 68, 68, 0.1); color: #DC2626; }
.status-away, .status-warning, .severity-warning, .badge-warning { background: rgba(245, 158, 11, 0.1); color: #B45309; }
.status-unavailable, .status-unknown, .status-idle, .status-inactive, .status-stopped, .badge-neutral { background: rgba(100, 116, 139, 0.1); color: var(--bento-text-secondary); }
.status-zone, .severity-info, .badge-info { background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.alert-item { padding: 14px 18px; border-left: 4px solid var(--bento-border); border-radius: 0 var(--bento-radius-sm) var(--bento-radius-sm) 0; margin-bottom: 10px; background: var(--bento-bg); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.alert-item:hover { box-shadow: var(--bento-shadow); }
.alert-critical { border-color: var(--bento-error); background: rgba(239, 68, 68, 0.04); }
.alert-warning { border-color: var(--bento-warning); background: rgba(245, 158, 11, 0.04); }
.alert-info { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.alert-text { flex: 1; }
.alert-type { font-weight: 600; font-size: 13px; margin-bottom: 4px; color: var(--bento-text); }
.alert-time { font-size: 12px; color: var(--bento-text-secondary); }
.alert-actions { display: flex; gap: 8px; }
.alert-dismiss { padding: 6px 12px; font-size: 12px; background: var(--bento-card); color: var(--bento-text-secondary); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); cursor: pointer; font-weight: 500; transition: var(--bento-transition); }
.alert-dismiss:hover { background: var(--bento-error); color: white; border-color: var(--bento-error); }

.section { margin-bottom: 24px; }
.section h3, .section-title, .pan-head { font-size: 16px; font-weight: 600; color: var(--bento-text); margin-bottom: 12px; letter-spacing: -0.01em; }

.battery-grid, .grid, .items-grid, .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.battery-card, .item-card, .chore-card, .entry-card, .backup-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); transition: var(--bento-transition); }
.battery-card:hover, .item-card:hover, .chore-card:hover, .entry-card:hover, .backup-card:hover { box-shadow: var(--bento-shadow-md); border-color: var(--bento-primary); transform: translateY(-1px); }
.chore-card.priority-high { border-left: 3px solid var(--bento-error); }
.chore-card.priority-medium { border-left: 3px solid var(--bento-warning); }
.chore-card.priority-low { border-left: 3px solid var(--bento-success); }
.chore-title, .entry-title, .item-title { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 6px; }
.chore-meta, .entry-meta, .item-meta { font-size: 12px; color: var(--bento-text-secondary); }
.chore-assignee { font-size: 12px; color: var(--bento-primary); font-weight: 500; }
.chore-actions, .item-actions, .entry-actions { display: flex; gap: 6px; margin-top: 10px; }

.battery-bar, .progress-bar, .bandwidth-bar-bg { width: 100%; height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.battery-fill, .progress-fill, .bandwidth-bar-fill { height: 100%; border-radius: 4px; transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-success); }
.battery-fill.battery_critical { background: var(--bento-error) !important; }
.battery-fill.battery_warning { background: var(--bento-warning) !important; }
.battery-label, .bandwidth-label { font-size: 13px; color: var(--bento-text); font-weight: 500; display: flex; justify-content: space-between; align-items: center; }

.pagination, .pag { display: flex; justify-content: center; align-items: center; gap: 8px; margin-top: 20px; padding: 16px 0; border-top: 1px solid var(--bento-border); }
.pagination-btn, .pag-btn { padding: 8px 14px; border: 1.5px solid var(--bento-border); background: var(--bento-card); color: var(--bento-text); border-radius: var(--bento-radius-xs); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); }
.pagination-btn:hover:not(:disabled), .pag-btn:hover:not(:disabled) { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.pagination-btn:disabled, .pag-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.pagination-info, .pag-info { font-size: 13px; color: var(--bento-text-secondary); font-weight: 500; padding: 0 8px; }
.page-size-selector, .pag-size { padding: 6px 10px; border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-xs); background: var(--bento-card); color: var(--bento-text); font-size: 13px; cursor: pointer; font-family: 'Inter', sans-serif; }

.col-main { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: var(--bento-text); }
.topbar-r { display: flex; gap: 8px; align-items: center; }
.panels { display: flex; gap: 12px; }
.pan-left, .pan-center, .pan-right { background: var(--bento-card); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.cbar { display: flex; gap: 8px; align-items: center; padding: 12px; background: var(--bento-bg); border-bottom: 1px solid var(--bento-border); }
.cg { display: flex; gap: 8px; align-items: center; }
.cg-r { margin-left: auto; }

.dd { position: relative; }
.dd-menu { position: absolute; top: 100%; left: 0; background: var(--bento-card); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); box-shadow: var(--bento-shadow-md); min-width: 180px; z-index: 100; display: none; overflow: hidden; }
.dd.open .dd-menu { display: block; }
.dd-i { padding: 10px 16px; cursor: pointer; font-size: 13px; color: var(--bento-text); transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.dd-i:hover { background: rgba(59, 130, 246, 0.06); color: var(--bento-primary); }
.dd-div { border-top: 1px solid var(--bento-border); margin: 4px 0; }

.auto-item, .tr-item, .list-item, .automation-item { padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--bento-border); display: flex; align-items: center; gap: 10px; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.auto-item:hover, .tr-item:hover, .list-item:hover, .automation-item:hover { background: rgba(59, 130, 246, 0.04); }
.auto-item.sel, .tr-item.sel, .list-item.selected, .automation-item.selected { background: rgba(59, 130, 246, 0.08); border-left: 3px solid var(--bento-primary); }
.auto-item.error-item, .automation-item.error-item { border-left: 3px solid var(--bento-error); }
.auto-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.auto-meta { font-size: 12px; color: var(--bento-text-secondary); }
.auto-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--bento-text-secondary); }
.auto-dot.s-running { background: var(--bento-success); }
.auto-dot.s-stopped { background: var(--bento-text-secondary); }
.auto-dot.s-error { background: var(--bento-error); }
.auto-count { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; }

.tgroup { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-xs); margin-bottom: 8px; overflow: hidden; }
.tgroup-h { padding: 10px 14px; background: var(--bento-bg); display: flex; align-items: center; gap: 8px; cursor: pointer; transition: var(--bento-transition); font-family: 'Inter', sans-serif; }
.tgroup-h:hover { background: rgba(59, 130, 246, 0.06); }
.tg-tog { transition: transform 0.2s; font-size: 12px; color: var(--bento-text-secondary); }
.tgroup.collapsed .tg-tog { transform: rotate(-90deg); }
.tgroup.collapsed .tgroup-items { display: none; }
.tg-name { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.tg-cnt { font-size: 11px; color: var(--bento-text-secondary); margin-left: auto; background: var(--bento-border); padding: 2px 8px; border-radius: 10px; }

.device-detail, .detail-panel, .details { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); }
.detail-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--bento-border); font-size: 13px; }
.detail-row:last-child { border-bottom: none; }
.detail-label { color: var(--bento-text-secondary); font-weight: 500; }
.detail-value { color: var(--bento-text); font-weight: 600; }

.board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; }
.column { min-width: 260px; background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 12px; border: 1px solid var(--bento-border); }
.column-header { font-weight: 600; font-size: 14px; color: var(--bento-text); margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center; }
.column-count { background: var(--bento-border); color: var(--bento-text-secondary); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }

.schedule, .calendar { margin-top: 16px; }
.week-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; margin-top: 16px; }
.week-header { padding: 8px; text-align: center; font-size: 12px; font-weight: 600; color: var(--bento-text-secondary); text-transform: uppercase; letter-spacing: 0.03em; border-radius: var(--bento-radius-xs); }
.week-cell { padding: 8px; text-align: center; font-size: 12px; background: var(--bento-bg); border: 1px solid var(--bento-border); cursor: pointer; transition: var(--bento-transition); border-radius: var(--bento-radius-xs); }
.week-cell:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.chore-item { padding: 8px 12px; border-bottom: 1px solid var(--bento-border); font-size: 13px; }

.leaderboard { background: var(--bento-bg); border-radius: var(--bento-radius-sm); border: 1px solid var(--bento-border); overflow: hidden; }
.leaderboard-row { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--bento-border); gap: 12px; font-size: 13px; transition: var(--bento-transition); }
.leaderboard-row:last-child { border-bottom: none; }
.leaderboard-row:hover { background: rgba(59, 130, 246, 0.04); }
.rank { font-weight: 700; color: var(--bento-primary); font-size: 14px; min-width: 28px; }
.name { font-weight: 500; color: var(--bento-text); flex: 1; }
.streak { color: var(--bento-warning); font-weight: 600; }
.completion { color: var(--bento-success); font-weight: 600; }

.baby-selector { display: flex; gap: 8px; margin-bottom: 16px; }
.quick-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.quick-btn, .action-btn { padding: 10px 16px; border: 1.5px solid var(--bento-border); background: var(--bento-card); border-radius: var(--bento-radius-sm); cursor: pointer; font-size: 13px; font-weight: 500; font-family: 'Inter', sans-serif; transition: var(--bento-transition); display: flex; align-items: center; gap: 6px; color: var(--bento-text); }
.quick-btn:hover, .action-btn:hover { border-color: var(--bento-primary); color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.quick-btn.active, .action-btn.active { background: var(--bento-primary); color: white; border-color: var(--bento-primary); }
.timeline { position: relative; padding-left: 24px; }
.timeline-item { padding: 12px 0; border-bottom: 1px solid var(--bento-border); position: relative; }
.timeline-time { font-size: 12px; color: var(--bento-text-secondary); font-weight: 500; }
.timeline-content { font-size: 13px; color: var(--bento-text); margin-top: 4px; }

canvas, .canvas-container canvas { width: 100%; height: 200px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); margin-bottom: 16px; }
.canvas-container { position: relative; margin-bottom: 16px; }
.chart-container { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 16px; }

.empty, .empty-state { text-align: center; padding: 48px 24px; color: var(--bento-text-secondary); font-size: 14px; font-family: 'Inter', sans-serif; }
.empty-ico, .empty-icon { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--bento-border); border-top: 3px solid var(--bento-primary); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 24px auto; }

.search-box, .search-bar, .controls, .ctrls, .filter-bar { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; align-items: center; }
.control-group { display: flex; gap: 8px; align-items: center; }

.domain-group-header { margin-top: 20px; padding: 10px 16px; background: var(--bento-bg); border-radius: var(--bento-radius-xs); font-weight: 600; font-size: 14px; color: var(--bento-text); border: 1px solid var(--bento-border); }
.domain-group-header:first-child { margin-top: 0; }
.domain-group-count { font-weight: 500; color: var(--bento-text-secondary); font-size: 12px; margin-left: 8px; }

.automation-list, .list, .item-list { border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); overflow: hidden; }
.automation-name, .entity-name { font-weight: 500; font-size: 13px; color: var(--bento-text); }
.automation-id, .entity-id { font-size: 11px; color: var(--bento-text-secondary); }
.error-badge, .count-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }
.tab .error-badge { background: var(--bento-error); color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 10px; margin-left: 6px; }

.health-score, .score { font-size: 48px; font-weight: 700; color: var(--bento-primary); text-align: center; margin: 16px 0; }
.emoji { font-size: 20px; line-height: 1; }
.device-icon { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: rgba(59, 130, 246, 0.08); border-radius: var(--bento-radius-xs); font-size: 16px; }

.recommendation-card, .tip-card, .suggestion-card { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 16px; border: 1px solid var(--bento-border); margin-bottom: 12px; transition: var(--bento-transition); }
.recommendation-card:hover, .tip-card:hover, .suggestion-card:hover { border-color: var(--bento-primary); box-shadow: var(--bento-shadow-md); }

.export-options, .options-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; }
.export-option, .option-card { background: var(--bento-bg); border: 1.5px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; cursor: pointer; transition: var(--bento-transition); text-align: center; }
.export-option:hover, .option-card:hover { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.04); }
.export-option.selected, .option-card.selected { border-color: var(--bento-primary); background: rgba(59, 130, 246, 0.08); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }

.storage-bar, .usage-bar { width: 100%; height: 24px; background: var(--bento-border); border-radius: var(--bento-radius-xs); overflow: hidden; margin-bottom: 12px; }
.storage-fill, .usage-fill { height: 100%; border-radius: var(--bento-radius-xs); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); background: var(--bento-primary); }

.check-item, .security-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.check-item:hover, .security-item:hover { background: rgba(59, 130, 246, 0.03); }
.check-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; font-size: 16px; }
.check-icon.pass { background: rgba(16, 185, 129, 0.1); }
.check-icon.fail { background: rgba(239, 68, 68, 0.1); }
.check-icon.warn { background: rgba(245, 158, 11, 0.1); }
.check-text, .security-text { flex: 1; }
.check-title { font-weight: 600; font-size: 13px; color: var(--bento-text); }
.check-desc { font-size: 12px; color: var(--bento-text-secondary); margin-top: 2px; }

.waveform { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 16px; margin-bottom: 16px; }
.analysis-result, .result-card { background: var(--bento-bg); border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm); padding: 20px; text-align: center; margin-bottom: 16px; }
.confidence-bar { height: 8px; background: var(--bento-border); border-radius: 4px; overflow: hidden; margin-top: 8px; }
.confidence-fill { height: 100%; border-radius: 4px; background: var(--bento-primary); transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1); }

.sentence-item, .intent-item { padding: 12px 16px; border-bottom: 1px solid var(--bento-border); display: flex; justify-content: space-between; align-items: center; transition: var(--bento-transition); }
.sentence-item:hover, .intent-item:hover { background: rgba(59, 130, 246, 0.03); }
.sentence-text { font-size: 13px; color: var(--bento-text); font-family: 'Inter', sans-serif; }
.intent-badge { display: inline-flex; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; background: rgba(59, 130, 246, 0.1); color: var(--bento-primary); }

.backup-item, .backup-entry { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; border-bottom: 1px solid var(--bento-border); transition: var(--bento-transition); }
.backup-item:hover, .backup-entry:hover { background: rgba(59, 130, 246, 0.03); }
.backup-name { font-weight: 500; font-size: 14px; color: var(--bento-text); }
.backup-date, .backup-size { font-size: 12px; color: var(--bento-text-secondary); }

.report-section { background: var(--bento-bg); border-radius: var(--bento-radius-sm); padding: 20px; border: 1px solid var(--bento-border); margin-bottom: 16px; }
.insight-card { padding: 14px; border-left: 3px solid var(--bento-primary); background: rgba(59, 130, 246, 0.04); border-radius: 0 var(--bento-radius-xs) var(--bento-radius-xs) 0; margin-bottom: 10px; }

@keyframes fadeSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-secondary); }

@media (max-width: 768px) {
  .card, .card-container, .reports-card, .export-card { padding: 16px; }
  .stats, .stats-grid, .summary-grid { grid-template-columns: repeat(2, 1fr); }
  .panels { flex-direction: column; }
  .board { flex-direction: column; }
  .column { min-width: unset; }
}

</style>
    `;
  }

  _getTemplate() {
    return `
      <div class="card-container">
        <h2 class="card-title">${this._config.title || 'Energy Optimizer'}</h2>

        <div class="tabs">
          <button class="tab-button active" data-tab="dashboard">Dashboard</button>
          <button class="tab-button" data-tab="patterns">Patterns</button>
          <button class="tab-button" data-tab="recommendations">Recommendations</button>
          <button class="tab-button" data-tab="compare">Compare</button>
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
              <span class="summary-label">${this._config.currency || 'PLN'}</span>
            </div>
            <div class="summary-card warn">
              <span class="summary-label">Peak Hour</span>
              <div class="summary-value">${this._getPeakHour()}:00</div>
              <span class="summary-label">Highest consumption</span>
            </div>
            <div class="summary-card">
              <span class="summary-label">Efficiency Score</span>
              <div class="summary-value">${this._calculateEfficiencyScore()}</div>
              <span class="summary-label">/ 100</span>
            </div>
          </div>

          <div class="power-draw">
            <div class="power-draw-unit">Current Power Draw</div>
            <div class="power-draw-value">${(Math.random() * 3 + 0.5).toFixed(2)}</div>
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
              <div class="stat-value">${(this._energyData.reduce((a, b) => Math.max(a, b))).toFixed(2)} kWh</div>
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

  _showTab(tabName) {
    const tabs = this.shadowRoot.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    this.shadowRoot.getElementById(tabName).classList.add('active');

    // Draw charts after showing tab (needed for canvas sizing)
    setTimeout(() => {
      if (tabName === 'dashboard') {
        this._drawDashboardChart();
      } else if (tabName === 'patterns') {
        this._drawHeatmap();
        this._drawTrendChart();
        this._drawWeekdayChart();
      } else if (tabName === 'recommendations') {
        this._renderRecommendations();
      } else if (tabName === 'compare') {
        this._drawComparisonChart();
      }
    }, 100);
  }

  _renderCurrentTab() {
    setTimeout(() => this._showTab('dashboard'), 100);
  }

  _drawDashboardChart() {
    const canvas = this.shadowRoot.getElementById('dashboard-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 200 * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxUsage = Math.max(...this._energyData) * 1.1;
    const barWidth = chartWidth / 24;

    // Background grid
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw bars
    this._energyData.forEach((value, hour) => {
      const x = padding.left + hour * barWidth;
      const barHeight = (value / maxUsage) * chartHeight;
      const y = padding.top + chartHeight - barHeight;

      const isPeakHour = hour >= (this._config.peak_hours?.start || 6) && hour < (this._config.peak_hours?.end || 22);
      const color = isPeakHour ? 'rgba(244, 67, 54, 0.7)' : 'rgba(52, 152, 219, 0.7)';

      ctx.fillStyle = color;
      ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
    });

    // Y-axis labels
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const label = (maxUsage / 4 * i).toFixed(1);
      const y = padding.top + chartHeight - (chartHeight / 4) * i;
      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    for (let hour = 0; hour < 24; hour += 3) {
      const x = padding.left + hour * barWidth + barWidth / 2;
      const y = padding.top + chartHeight + 20;
      ctx.fillText(`${hour}h`, x, y);
    }
  }

  _drawHeatmap() {
    const canvas = this.shadowRoot.getElementById('heatmap-canvas');
    if (!canvas) return;

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
    const allValues = this._weeklyData.flat();
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);

    const getColor = (value) => {
      const normalized = (value - minVal) / (maxVal - minVal);
      if (normalized < 0.25) return '#1e3a8a';
      if (normalized < 0.5) return '#3b82f6';
      if (normalized < 0.75) return '#fbbf24';
      return '#dc2626';
    };

    // Draw heatmap
    this._weeklyData.forEach((dayData, dayIndex) => {
      dayData.forEach((value, hourIndex) => {
        const x = padding + hourIndex * cellWidth;
        const y = padding + dayIndex * cellHeight;

        ctx.fillStyle = getColor(value);
        ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);
      });
    });

    // Y-axis labels (days)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'right';
    days.forEach((day, i) => {
      ctx.fillText(day, padding - 8, padding + i * cellHeight + cellHeight / 2 + 4);
    });

    // X-axis labels (hours)
    ctx.textAlign = 'center';
    ctx.font = '11px sans-serif';
    for (let hour = 0; hour < 24; hour += 3) {
      ctx.fillText(`${hour}h`, padding + hour * cellWidth + cellWidth / 2, height - 8);
    }
  }

  _drawTrendChart() {
    const canvas = this.shadowRoot.getElementById('trend-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 150 * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 150;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const dailyTotals = this._weeklyData.map(day => day.reduce((a, b) => a + b, 0));
    const maxUsage = Math.max(...dailyTotals) * 1.1;
    const pointSpacing = chartWidth / (dailyTotals.length - 1);

    // Background grid
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padding.top + (chartHeight / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw line
    ctx.strokeStyle = 'rgba(52, 152, 219, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    dailyTotals.forEach((value, index) => {
      const x = padding.left + index * pointSpacing;
      const y = padding.top + chartHeight - (value / maxUsage) * chartHeight;
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();

    // Draw points
    ctx.fillStyle = 'rgba(52, 152, 219, 1)';
    dailyTotals.forEach((value, index) => {
      const x = padding.left + index * pointSpacing;
      const y = padding.top + chartHeight - (value / maxUsage) * chartHeight;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    });

    // Y-axis labels
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const label = (maxUsage / 3 * i).toFixed(0);
      const y = padding.top + chartHeight - (chartHeight / 3) * i;
      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dayLabels.forEach((label, index) => {
      const x = padding.left + index * pointSpacing;
      const y = padding.top + chartHeight + 20;
      ctx.fillText(label, x, y);
    });
  }

  _drawWeekdayChart() {
    const canvas = this.shadowRoot.getElementById('weekday-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 150 * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 150;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const dailyTotals = this._weeklyData.map(day => day.reduce((a, b) => a + b, 0));
    const maxUsage = Math.max(...dailyTotals) * 1.1;
    const barWidth = chartWidth / 7;

    // Draw bars
    dailyTotals.forEach((value, index) => {
      const x = padding.left + index * barWidth;
      const barHeight = (value / maxUsage) * chartHeight;
      const y = padding.top + chartHeight - barHeight;

      const isWeekend = index >= 5;
      const color = isWeekend ? 'rgba(76, 175, 80, 0.7)' : 'rgba(52, 152, 219, 0.7)';

      ctx.fillStyle = color;
      ctx.fillRect(x + 4, y, barWidth - 8, barHeight);
    });

    // Y-axis labels
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const label = (maxUsage / 3 * i).toFixed(0);
      const y = padding.top + chartHeight - (chartHeight / 3) * i;
      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dayLabels.forEach((label, index) => {
      const x = padding.left + index * barWidth + barWidth / 2;
      const y = padding.top + chartHeight + 20;
      ctx.fillText(label, x, y);
    });
  }

  _drawComparisonChart() {
    const canvas = this.shadowRoot.getElementById('comparison-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = 180 * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = 180;
    const padding = { top: 20, right: 20, bottom: 30, left: 40 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const dailyTotals = this._weeklyData.map(day => day.reduce((a, b) => a + b, 0));
    const maxUsage = Math.max(...dailyTotals) * 1.1;
    const barWidth = chartWidth / 14;

    // Generate "last week" data (slightly different)
    const lastWeekData = dailyTotals.map(v => v * (0.95 + Math.random() * 0.1));

    const drawBars = (data, offset, color) => {
      data.forEach((value, index) => {
        const x = padding.left + (index * 2 + offset) * barWidth;
        const barHeight = (value / maxUsage) * chartHeight;
        const y = padding.top + chartHeight - barHeight;

        ctx.fillStyle = color;
        ctx.fillRect(x, y, barWidth - 2, barHeight);
      });
    };

    drawBars(dailyTotals, 0, 'rgba(52, 152, 219, 0.8)');
    drawBars(lastWeekData, 1, 'rgba(100, 100, 100, 0.5)');

    // Y-axis labels
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const label = (maxUsage / 3 * i).toFixed(0);
      const y = padding.top + chartHeight - (chartHeight / 3) * i;
      ctx.fillText(label, padding.left - 8, y + 4);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dayLabels.forEach((label, index) => {
      const x = padding.left + (index * 2 + 0.5) * barWidth;
      const y = padding.top + chartHeight + 20;
      ctx.fillText(label, x, y);
    });

    // Legend
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(52, 152, 219, 0.8)';
    ctx.fillRect(padding.left, padding.top - 20, 12, 12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText('This week', padding.left + 16, padding.top - 10);

    ctx.fillStyle = 'rgba(100, 100, 100, 0.5)';
    ctx.fillRect(padding.left + 120, padding.top - 20, 12, 12);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillText('Last week', padding.left + 136, padding.top - 10);
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
            <div class="savings-badge">Save ~${rec.savings}${this._config.currency || 'PLN'}/mo</div>
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
    const usage = this._calculateTodayUsage();
    const costPerKwh = 0.45;
    return usage * costPerKwh;
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
}

customElements.define('ha-energy-optimizer', HaEnergyOptimizer);
