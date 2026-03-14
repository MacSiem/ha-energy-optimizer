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
