# Changelog — Energy Optimizer

## 3.5.3 (unreleased)

- Describe report rows as grid-import sources, label chart dates accurately and show the required HA Tools Email version in schedule/send instructions.

- Refresh open email report windows every five minutes without replacing a settings form while it is being edited.

- Validate every configured import source against the complete requested hourly window. Reject duplicate and missing buckets; retain unavailable history and future hours as gaps instead of partial totals or zeros.
- Share grid-source selection and unit/timestamp normalization across cards, including legacy grid flows, Wh/kWh/MWh and current Recorder millisecond timestamps.
- Default Energy Email to its 24-hour Recorder view; remove the mixed lifetime “All” sum and report controls for unrelated device counters.
- Opening the email card no longer creates helpers. Existing settings remain readable; explicit saves retain the helper/browser fallback. Limit sends, schedules and configuration to administrators.
- Use actual date labels and nullable chart values, and consumption-weighted tariff costs for chart tooltips. Show exact windows and the Home Assistant timezone.
- Legacy automation creation now directs users to the Recorder-backed email scheduler instead of generating templates from lifetime states.

## 3.5.2 (2026-09-30)

- Keep the accessible selected Optimizer tab in sync with the visible panel immediately after navigation.

- Bound responsive Optimizer chart plots so full Recorder data cannot repeatedly enlarge the card while resizing.

- Optimizer and Insights reject an interior gap in today's hourly Recorder buckets instead of presenting a complete daily model or peak-hour advice. Absolute UTC coverage preserves valid 23-hour and 25-hour daylight-saving days.

- Period overview preserves measured zero and keeps missing daily/weekly/monthly data unavailable instead of using lifetime or another period. Recorder windows are explicit.
- Time-dependent tariff costs weight actual hourly consumption in the Home Assistant timezone; aggregate usage alone has no estimated time-tariff cost.

- Energy Email previews no longer substitute lifetime counters for daily, weekly or monthly energy, or missing measurements with zero.
- With HA Tools Email 2.1.2+, preview reads the server composer model used by manual sends and schedules, including exact Recorder windows and configured grid sources. Unavailable server previews stay unavailable.
- Keep measured zero and escape source names in the preview. Tariff absence remains explicit.
- Without the new backend, period previews and manual sends also use configured grid sources, complete hourly Recorder coverage and exact windows; incomplete data stops the send.

## 3.5.1 (2026-09-29)

- Use measured grid-import statistics with explicit empty/partial states, including missing and daylight-saving hours; never invent a rate or currency for Energy Email.
- Bundle pinned Chart.js locally and keep Energy Insights honest when recent Recorder statistics are absent.
- Let all three cards grow naturally in Sections and use compact administrator-only support links.

## 3.5.0 (2026-09-24)

- Energy Email: Energy Optimizer is now the single maintained source of `custom:ha-energy-email`. HA Tools Email & Reports 4.5.0 no longer ships its own copy; it keeps a thin wrapper that renders this card, so existing dashboards keep working in either load order.
- Energy Email: new always-free alias `ha-energy-optimizer-email` that the Email & Reports wrapper delegates to.
- Energy Email: SMTP hints now link to **Settings → Devices & services → HA Tools Email → Configure** (HA Tools Email 2.1.0) instead of the retired HA Tools panel, and the "not configured" state says what to set.
- Energy Email: the card-picker entry is registered once.

## 3.4.9 (2026-08-28)

- Isolation: persistence is now card-local per bundled IIFE, removing `window._haToolsPersistence` load-order coupling while retaining existing localStorage keys.
- Security: normalize values before inherited escaping and harden card, persisted schedule, device, preview and email HTML sinks against arrays/objects.
- Lifecycle: cancel deferred renders, chart work and toasts when bundled cards disconnect.
- Isolation: all three maintained cards render their own support footer inside their own shadow root instead of relying on the retired panel injector.
- Isolation: Energy Insights and Energy Email use component-local Bento CSS and ignore any pre-existing `window.HAToolsBentoCSS` value.
- Test: seed the legacy global helper and exercise all three bundled cards with hostile non-string configuration.

## 3.4.8 (2026-07-18)

- Fix: the visual card editor no longer opens blank. The card advertised an editor element (ha-energy-optimizer-editor) that was never registered; Home Assistant now falls back to its built-in editor.

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
