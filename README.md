# ⚡ Energy Optimizer

![Preview](banner.png)

Energy usage analysis for Home Assistant based on grid import configured in the Energy Dashboard. The card displays measured usage, local Chart.js charts and a tariff scenario when you provide prices. It needs Energy Dashboard grid import statistics to show numbers.

[![Version](https://img.shields.io/github/v/release/MacSiem/ha-energy-optimizer)](https://github.com/MacSiem/ha-energy-optimizer/releases) [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Part of the [HA Tools](https://github.com/MacSiem/ha-tools-panel) collection for Home Assistant.

## How it works

1. The Dashboard and Insights cards read the **grid import statistics selected in your Energy Dashboard** using `energy/get_prefs`. They validate Recorder metadata and use the hourly `change` series. Solar production, grid export, power sensors in watts, and unrelated statistics are excluded.
2. Usage appears when valid measured buckets are available. Missing or invalid data produces an explicit empty or error state. No demo numbers are shown.
3. Costs appear only when a tariff is configured. They are estimates based on measured import and your rate, not a bill or a measured appliance saving. The currency comes from Home Assistant unless set in the card.
4. Live power is shown only if you set `power_entity`; the card does not sum overlapping power sensors.
5. Chart.js is bundled in the single HACS JavaScript file. There is no CDN request or extra Lovelace resource.

### One repo, three cards

Since v3.3.0 this single file/repo bundles three custom elements — install
once, use any of them:

| Card type | What it adds |
|---|---|
| `custom:ha-energy-optimizer` | Dashboard, patterns (heat map/trend), recommendations and week-over-week compare — described above. |
| `custom:ha-energy-insights` | A separate 30-day breakdown across Overview / Daily / Weekly / Monthly / Tips tabs, also driven by `recorder/list_statistic_ids` + `recorder/statistics_during_period`. |
| `custom:ha-energy-email` | Sends the usage report by e-mail. Manual "Send now" always works via `ha_tools_email.send`; scheduled sends are server-side if the optional **HA Tools Email v2.0.0** integration is installed, otherwise schedule config falls back to browser `localStorage`. SMTP is set in **Settings → Devices & services → HA Tools Email → Configure**. This is the only maintained copy of the card; HA Tools Email & Reports 4.5.0+ just forwards to it. |

### What is automatic vs. manual

| Automatic | Manual |
|---|---|
| Grid import discovery from Energy Dashboard | Configure a grid import source in Energy Dashboard |
| Measured hourly charts when Recorder data is available | Set `energy_price` or peak/off-peak rates for cost estimates |
| Home Assistant theme and currency | Set `power_entity` for live power; add Insights or Email cards if wanted |
| Bundled charts | Configure the optional HA Tools Email integration and SMTP before sending mail |

## Screenshots

| Light | Dark |
|---|---|
| ![Dashboard tab, light theme](docs/screenshots/card-dashboard-light.png) | ![Dashboard tab, dark theme](docs/screenshots/card-dashboard-dark.png) |

*The Dashboard tab (the default view): today's usage, cost estimate,
efficiency score, current power draw and the 24-hour usage chart. Dark mode
follows your Home Assistant theme automatically.*

## Installation

**Energy Optimizer is in the HACS default store** — no custom repository needed:

1. Open **HACS** in Home Assistant.
2. Search for **Energy Optimizer**.
3. Install and refresh your browser.

[![Open in HACS](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=MacSiem&repository=ha-energy-optimizer&category=plugin)

Requires Home Assistant **2024.1.0** or newer.

### Manual / custom repository

1. HACS → the **⋮** menu → **Custom repositories** → add
   `https://github.com/MacSiem/ha-energy-optimizer` as category **Dashboard**
   (Lovelace plugin) — or download `ha-energy-optimizer.js` from the
   [latest release](https://github.com/MacSiem/ha-energy-optimizer/releases).
2. Copy to `/config/www/community/ha-energy-optimizer/`.
3. Add as a Lovelace resource:
   `/local/community/ha-energy-optimizer/ha-energy-optimizer.js` (type: `module`).

## Quick start

```yaml
type: custom:ha-energy-optimizer
# Optional settings — the card works with none of these set:
title: Energy Optimizer
currency: USD
peak_rate: 0.32
off_peak_rate: 0.14
peak_hours:
  start: 6
  end: 22
```

```yaml
# 30-day breakdown, top consumers, trends:
type: custom:ha-energy-insights
```

```yaml
# Energy e-mail reports:
type: custom:ha-energy-email
```

## FAQ

**Do I have to configure anything?**
The usage cards need at least one grid import source configured in Home Assistant's Energy Dashboard, with valid Recorder sum statistics. A tariff is optional; costs show N/A until one is configured.

**Why are usage values unavailable?**
Check the Energy Dashboard grid import source and its Recorder statistics. The card does not replace missing data with sample values.

**Does it support day/night or weekday/weekend tariffs?**
Yes. Configure the relevant rates and hours. Savings are displayed as scenarios, not promises.

**Does this send data anywhere?**
No telemetry or analytics. All energy figures come from your own Home
Assistant recorder/statistics — nothing leaves your instance. Chart.js is included in the card file; charts make no external library request. If you use `ha-energy-email` with the optional HA Tools Email
integration, mail is sent through the SMTP server *you* configure — not
through any MacSiem-operated service.

**What happened to the `entities:` option?**
Older stub configs mention an `entities` list. The Dashboard and Insights cards use Energy Dashboard grid import sources instead, so remove that list.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## Support

- [Buy Me a Coffee](https://buymeacoffee.com/macsiem)
- [PayPal](https://www.paypal.com/donate/?hosted_button_id=Y967H4PLRBN8W)

The optional support link in Energy Optimizer, Insights and Email is shown only to administrators. Dismiss it in each card or set `show_support: false` in its configuration.

## License

MIT — see [LICENSE](LICENSE).
