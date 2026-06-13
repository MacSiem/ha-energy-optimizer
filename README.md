# ⚡ Energy Optimizer

Energy usage analysis and optimization card for Home Assistant. Dual-tariff aware, with Chart.js visualizations and actionable recommendations.

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2024.1+-blue.svg?logo=homeassistant)](https://www.home-assistant.io/) [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Part of the [HA Tools](https://github.com/MacSiem/ha-tools-panel) collection for Home Assistant.

## Screenshot

![Screenshot](screenshot.png)

## Installation

### HACS

**Energy Optimizer is in the HACS default store** — no custom repository needed:

1. Open **HACS** in Home Assistant.
2. Search for **Energy Optimizer**.
3. Install and refresh your browser.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=MacSiem&repository=ha-energy-optimizer&category=plugin)

### Manual

1. Download `ha-energy-optimizer.js` from the [latest release](https://github.com/MacSiem/ha-energy-optimizer/releases).
2. Copy to `/config/www/community/ha-energy-optimizer/`.
3. Add as a Lovelace resource: `/local/community/ha-energy-optimizer/ha-energy-optimizer.js` (type: `module`).

## Usage

This repo bundles **three cards** (since v3.3.0) — install once, use any of them:

```yaml
type: custom:ha-energy-optimizer
# Optional settings:
title: My Energy Optimizer
energy_price: 0.65
currency: PLN
peak_rate: 0.85
off_peak_rate: 0.45
peak_hours:
  start: 6
  end: 22
```

```yaml
# Historical breakdowns (24h / 7d / 30d), top consumers, trends:
type: custom:ha-energy-insights
```

```yaml
# Energy e-mail reports — manual send works with the optional
# ha-tools-email-integration backend (SMTP). With HA Tools Email v2.0.0,
# schedules are stored server-side; without it the card keeps legacy local
# schedule/config behavior:
type: custom:ha-energy-email
```

## Privacy

- No telemetry, no analytics, no tracking.
- Chart.js is loaded from `cdn.jsdelivr.net` on first chart render (HACS-default-style dependency). Self-host if you prefer fully offline operation.
- All energy data is read from your Home Assistant entity history; nothing leaves your instance.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
