## 3.4.8 (2026-07-18)

- Fix: the visual card editor no longer opens blank. The card advertised an editor element (ha-energy-optimizer-editor) that was never registered; Home Assistant now falls back to its built-in editor.

# Changelog — Energy Optimizer

## [3.4.7] - 2026-07-12

- Fix: `_drawHeatmap` is now wrapped in try/catch (errors logged via `console.error`, matching the other chart routines) and guards against a null 2D canvas context, so a heatmap drawing error can no longer break the whole render pass.
- Docs: README now documents that cost estimates fall back to a built-in 0.65/kWh rate until `peak_rate`/`energy_price` is configured, and that "current power" sums all W-unit sensors without de-duplication (overlapping sensors are double-counted).
- Chore: aligned bundle version header (was stale at 3.4.3).

## [3.4.6] - 2026-06-28

- Privacy/offline: both chart loaders now prefer the locally-vendored Chart.js (`/local/community/ha-tools/vendor/chart.umd.min.js`) and fall back to the CDN only if the local copy is absent, instead of loading from the CDN unconditionally. Consistent with the rest of the HA Tools suite; no chart breakage if the local copy is missing.

## [3.4.5] - 2026-06-27

- Fix: in dark themes the card title and header text rendered dark-on-dark — the main card stylesheet had no `:host(.bento-dark)` token override (the dark overrides existed only in the bundled panel/insights styles). Added the dark token mapping to the main styles so `--bento-text` and related tokens follow the active HA theme.

## [3.4.4] - 2026-06-27

- Fix: dashboard summary tiles and the power-draw banner used an invalid CSS gradient (`var(--primary)cc`) that resolved to no background, so tiles rendered as white text on a transparent background and looked blank. Replaced with `color-mix()` so the cards render correctly (fixes #1 "Screenshot doesn't show card").
- Fix: the data-source badge was hardcoded in Polish; it now renders in English ("Demo data — no kWh sensors" / "Data from N kWh sensor(s)").
- Docs: refreshed README screenshot to show the fully rendered card (summary tiles + 24-hour usage chart).

## [3.4.3] - 2026-06-15

- Theme: dark/light now follows the active Home Assistant theme (luminance of --card-background-color) instead of OS prefers-color-scheme.


## [3.4.2] - 2026-06-15

- Theme: dark/light now follows the active Home Assistant theme (luminance of --card-background-color) instead of OS prefers-color-scheme.


## [3.4.1] - 2026-06-15

- Theme: dark/light now follows the active Home Assistant theme (luminance of --card-background-color) instead of OS prefers-color-scheme.


All notable changes to **Energy Optimizer** are documented here.

## [3.4.0] - 2026-06-13

### Added
- `ha-energy-email` now progressively uses the HA Tools Email v2.0.0 websocket API for SMTP status, server-side `energy_report` schedules, and backend `send_now`.

### Changed
- Legacy service/manual send, input_text recipient discovery, and localStorage schedule fallback remain available when the websocket backend is unavailable.

## [3.3.0] - 2026-06-12

### Added
- Bundled the **Energy Insights** and **Energy Email** cards into this repo (IIFE-scoped, panel-mode safe) — ships three custom elements from one repo.

## [3.2.2] - 2026-06-12

### Fixed
- Initialise data structures in the constructor + render-error panel — full panel/sidebar mode support.

## [3.2.1] - 2026-06-12

### Fixed
- Guard `reduce` on empty energy data (panel crashed before render with default config).

## [3.2.0] - 2026-06-12

### Added
- `getGridOptions()` + panel-mode config defaults (works without `setConfig`).

## [3.1.2] - 2026-05-12

### Fixed
- Added `_esc(...)` helper and wrapped user-controllable interpolations (card title, currency) in render templates.
- Added LICENSE file (MIT).
- `hacs.json` now declares minimum Home Assistant version (`2024.1.0`).
- README rewritten to point to `CHANGELOG.md`, dropped stale inline changelog block.

## [3.1.1] - 2026-05-12

### Changed
- Internal release readiness improvements (no user-visible changes).

## [3.1.0] - 2026-03-19

### Added
- Dual-tariff support (peak / off-peak rates with configurable hours).
- Chart.js-powered visualizations.
- Dark mode and theme integration.
