# Changelog — Energy Optimizer

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
