# Changelog — Energy Optimizer

All notable changes to **Energy Optimizer** are documented here.

## [3.4.0] - 2026-06-13

### Added
- `ha-energy-email` now progressively uses the HA Tools Email v2.0.0 websocket API for SMTP status, server-side `energy_report` schedules, and backend `send_now`.

### Changed
- Legacy service/manual send, input_text recipient discovery, and localStorage schedule fallback remain available when the websocket backend is unavailable.

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
