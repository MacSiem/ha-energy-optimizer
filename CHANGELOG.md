# Changelog — Energy Optimizer

## 4.0.0 (Unreleased)

- Show the grid-import cost already recorded by HA Energy in analysis, Compact and HTML/text/CSV reports when no tariff book is configured. Keep current prices explicitly current-only, partial coverage distinct, and cost components and fixed fees unknown; preserve tariff-book calculations and source permissions.

- Default new picker cards to Compact while preserving existing full cards. Keep native tariff tiles readable in narrow Sections columns, with a complete next-cheap clock, accessible product names and full calendar details. Compact summaries retain measured energy, usage cost and neutral unconfirmed intervals.
- Use one schema-2 analysis service for calendar periods, historical tariff versions, measured group comparisons and reports read inside HA without SMTP. Keep roomless and unmeasured energy separate, household fixed fees separate from group usage, and existing legacy compatibility explicit.
- Add reviewed dashboard placement with preview, explicit confirmation and guarded Undo through native Home Assistant dialogs. Preserve the dialog across Lovelace remounts and refuse to overwrite later dashboard changes.
- Expose administrator-controlled feature access and opt-in native cost statistics with explicit consent, late-hour recovery and seven-day backfill. Reading a card does not publish statistics, send mail or grant access.

- Clear recovered pricing warnings after a successful retry while retaining warnings for other queries that still fail.

- Refresh native light/dark phone screenshots, compact visual-editor examples and the actual Polish weekly mail preview, with capture hashes and explicit measurement windows.

- Switch manual and schedule mail previews between Phone/Computer widths and Light/Dark themes locally, retaining the cached server report and focus without another request or send. Older mail templates remain light-only with an explanation.

- Support Left / Right and Home / End across visible tabs in all three cards, retaining focus after redraw and revealing the active tab horizontally.

- Keep Patterns source explanations folded and point summaries readable, with exact measurements and UTC intervals available in details and Data.

- Align compact hourly chart axes to the user display zone at three-hour clock marks; retain every measurement, full tooltip date and Data value.

- Refresh confirmed prices after a shared tariff changes while preserving unsaved drafts and their revision conflict protection.
- Keep the measurement time zone in source details while chart labels follow the user’s display settings.
- Register Energy Insights once when its script loads again, preserving other custom cards.
- Use HA Tools Email 2.4.0+ as the sole price engine for shared and card-owned tariffs, historical charts and compact summaries. Keep measurements available when pricing is unavailable; preserve unknowns, zero, negative costs and tariff currency. Existing legacy rates are ephemeral backend read inputs without settings writes.
- Add visual title/default-tab/visible-tabs/compact/help/support/hourly-range options to all three cards, with narrow named navigation, Sections sizing, persistent help gestures and unchanged measurement/calendar semantics.
- Show primary compact cost today, tariff classification and the next strictly future cheap period from the same backend snapshot as five Energy entities. Clear stale context, fence late replies, coalesce slow-wire updates and refresh mounted views.
- Use tonal KPI surfaces, accessible action text and labels of at least 12px. Keep live measured power in the summary grid, source details collapsed, friendly hourly axes and full date/offset detail without changing data or pricing.

## 3.7.1 (2026-10-17)

- Respect the system date format in full chart point labels, tooltips and Data when it differs from the Home Assistant interface language. Keep measured point identities and costs unchanged.
- Add advisory frontend review hints to CI without creating a release gate.

## 3.7.0 (2026-10-17)

- Color Dashboard bars by the confirmed tariff's actual interval zones, with a persistent legend and matching Data column. Preserve midnight start, midday valleys, unavailable rates and explicitly mixed zones; reprice without reloading measurements.
- Replace the absent live-power tile with a compact sensor setup guide. Distinguish an unavailable configured sensor from no selection; preserve measured zero and reject empty sensor states.
- Label the measured maximum as Highest consumption, independently of tariff peak hours.
- Use friendly chart dates and times in the user’s system time zone by default, respecting Home Assistant profile local/server and 12/24-hour preferences. Distinguish repeated DST hours and preserve measured bucket identities, periods and tariff costs. Apply live power updates even when the same event changes display preferences, without refetching cached measurements.
- Share local period, coverage and number formatting across Optimizer, Insights and Energy Email. Keep exact UTC bounds and full source details expandable, preserve rolling/source-hour semantics and visible partial warnings, and recognize regional Polish locales.
- Keep Insights and Smart Reports as separate views, explain their shared grid-import source and link to the related tool.

## 3.6.2 (2026-10-16)

- Finish an interrupted initial measurement read in the current online context across all three cards, even when Home Assistant sends no further update. Coalesce Email discovery, wait for old raw reads to settle, and preserve later-refresh and privacy fences.
- Distinguish available measured sources from configured sources and explain unsupported energy metadata alongside retained readings.

- Reject unsupported Recorder units in all three cards, including names inherited from JavaScript objects. Such sources cannot produce NaN measurements or a falsely complete Email overview.
- Document migration from archived standalone Energy Insights 1.0.2, including its history-read false-zero limitation, resource load order and measured-source/coverage checks. The archived release itself is unchanged.
- Retain available measured rows in the Energy Email overview when another configured grid source has missing or unsupported Recorder data. Show recorded subtotals and measured source-hour coverage while leaving incomplete full-period totals and costs unavailable.
- Replace an older complete ranking with the new partial result, and hide stale rankings after failed reads. Exclude conflicting duplicate hourly buckets; preserve complete measured zero without inventing a tariff price.
- Clarify the difference between the local rolling overview and the shared mail composer. HA Tools Email 2.3.1+ preserves partial measurements in actual HTML and plain-text reports for both mail consumers.

## 3.6.1 (2026-10-16)

- Show the settled first-read status in Energy Email even when Recorder data is partial, no grid-import source is configured, or the read fails. A quiet Home Assistant no longer needs another state update or a period click to replace the initial empty state. Keep the session guard and do not retry stale reads.

## 3.6.0 (2026-10-15)

- Let the next ordinary Home Assistant update recover a discarded Optimizer or Energy Email measurement read after session, tab or mount changes. A blocked read does not consume the refresh window; stale completion never retries or bypasses the occupied raw request.

- Give legacy local and backend schedule time/recipient fields, selects and enabled labels a 44px touch target while preserving their native checkbox, keyboard behavior and explicit-save semantics.

- Keep active units and cost subtitles readable in light and dark themes in Insights and Energy Email. Format partial device summaries for readability while retaining every recorded digit in expanded measurement details.
- Keep the Optimizer source, measurement window and timezone readable in both themes.

- Clear a settled first-read spinner after tab, mount or connection-context changes and let the next HA update read the current context without waiting five minutes. Discard stale responses and preserve the existing raw-read fence.

- Preview the actual server-composed Energy email for daily, weekly and monthly reports, with rolling or previous completed calendar periods. Requires stable HA Tools Email 2.3+ for actual HTML and explicit calendar sending.
- Share manual period selection between Preview and Send; show actual bounds with timezone and preserve missing measurements. Keep the legacy overview and supported older rolling send paths.
- Label the existing schedule-row manual send as rolling; provide a separate explicit previous-calendar-period send using that schedule's recipients and timezone. Neither action edits the saved schedule.
- Isolate email HTML in a sandbox with scripts, external resources and form actions blocked. Preserve pending raw-send locks across context changes and require an exact modern SMTP acceptance acknowledgement without claiming inbox delivery.


- Reconfirm the shared tariff when an existing card is reattached, without refetching settled Recorder measurements or clearing an unknown tariff write.

- Clear accepted measurements across all three cards when the HA connection, user, timezone or context changes, including in-place HA updates; retain measurements for language and theme changes and reject late old-session reads.

- Replace hypothetical load-shifting savings with measured import × configured tariff. Show energy, variable charges and fixed monthly fees separately, with explicit missing coverage and valid zero prices.
- Share an optional server-backed Custom tariff across Optimizer, Insights and Energy Email. Preserve currency, timezone or meter clock, zones, minute/overnight rules, weekdays, seasons and dated exceptions; require administrator saves and matching readback.
- Add matching Chart/Data views and keyboard point selection to Optimizer Dashboard/Patterns and Insights Daily/Weekly/Monthly. Keep repeated DST hours distinct, retain missing measurements, and show sources, units, timezones and coverage.
- Keep Today totals and costs unavailable when local midnight cuts an hourly Recorder bucket; show the measured subset and exact range without changing rolling email windows. Select the peak from one absolute interval rather than combining repeated DST hours.
- Read configured device statistics in Insights only on request; preserve parent/submeter relationships, search, pagination, zero and partial states without adding device usage to the grid total.
- Use the existing HA Tools Email 2.2+ server scheduler for daily/weekly/monthly calendars and timezone-aware previews. Keep legacy automation warnings and distinguish confirmed, failed and unknown results.
- Display the server's durable send-attempt history separately from local state; SMTP acceptance is not delivery confirmation.
- Keep tariff confirmation across navigation through bounded reads, preserve drafts and focus, and invalidate stale data on role, source, connection or offline changes.
- Apply touch-size controls, responsive tabs, narrow records, theme/localization and calendar-editor styles across the three cards.

## 3.5.4 (2026-10-08)

- Correct the release date for the published 3.5.3 entry and document the Home Assistant API compatibility boundary and optional email backend requirements.
- Preserve the existing card behavior and bundled Chart.js; this maintenance release only updates documentation and the bundle version header.

## 3.5.3 (2026-10-05)

- Keep existing helper or browser recipients when loading backend defaults, preserving explicit card-recipient priority after reload.

- Validate existing helper value lengths and report failed settings writes before changing the displayed tariff or recipient. Preserve previous values after failure and retain browser saves when helpers are absent.

- When an older email backend lacks the report-preview API, preserve validated Recorder previews and manual sends through the legacy service. Disable sending when the service is absent, and block new or updated server energy schedules until HA Tools Email 2.1.2+ is installed.

- Keep schedule time and recipient inputs inside their cards at narrow widths in backend and legacy modes.

- Localize active/disabled Energy Email schedule statuses and support link/dismissal labels in Polish, retaining English, administrator guards and dismissed-link persistence.

- Translate Energy Email Send buttons, manual/instant badges, sending and last-sent text into Polish, including live HA locale changes, while retaining English labels and send guards.
- Use the primary HA theme text color for manual badges and last-sent status, preserving readable small-text contrast in light and dark themes.

- When the email backend and legacy send service are missing, guide first run through HACS installation, adding the integration, then SMTP configuration. Keep transport or unavailable-backend errors distinct and preserve disabled sends and administrator-only actions.

- Translate Insights tariff status and Email inline tariff editor accessibility labels in Polish and English.
- Refresh Insights and Email headings and navigation when the HA language changes. Preserve unsaved Email fields and focus, and update existing Insights chart colors when the theme changes.

- Use Home Assistant theme colors for Optimizer chart labels and axes. Translate Optimizer views and Email navigation for Polish, and describe browser-only legacy settings accurately when HA helpers are unavailable.

- Guide Email first run to configure a missing grid-import source. Distinguish absent Recorder measurements, incomplete or unsupported statistics, and failed reads instead of showing raw status codes.

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
