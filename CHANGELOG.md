# Changelog

## 0.1.0-alpha.4 — 2026-10-07

Independent alpha; live typing verification and manual stability checklist pending.

- Isolate dashboard text-entry keystrokes from surrounding client keybind handlers while preserving browser editing defaults, Tab and Escape. Listeners only apply to ServerVitals fields and are removed on unmount.
- Add character-by-character typing, Backspace and focus-retention regression coverage with a host handler that steals input focus. The previous alpha fails this regression; the patch passes.

## 0.1.0-alpha.3 — 2026-10-07

Independent alpha; manual stability checklist pending.

- Keep the enlarged BetterDiscord dashboard inside the host focus boundary so search and text inputs work. Restore modal dimensions on close.
- Replace native sorting dropdown with an in-dashboard menu; remove freshness filters while retaining badges.
- Add multi-selection and individual Leave controls with named confirmation, Keep/ownership protection, sequential actions, and stop-on-error behavior. No actual memberships are changed by automated tests.
- Explain manual scanning, bounded current/previous snapshots, cache bytes and clearing in the README.

## 0.1.0-alpha.2 — 2026-10-07

Independent alpha testing build; manual stability checklist pending.

- BetterDiscord opens a nearly full-window scrollable dashboard.
- Scans run only through Check Now. Opening/enabling restores cached results; automatic refresh has been removed, including legacy saved intervals.
- Settings shows cache size in UTF-8 bytes and clears activity snapshots without rescanning, preserving Keep.
- Channel navigation dismisses the dashboard and underlying Discord/BetterDiscord modals, with a Discord router fallback.
- Regression coverage for manual scanning, bounded snapshots, cache clearing and cached reopening.

## 0.1.0-alpha.1 — 2026-10-07

Initial AI-generated independent testing build. Not stable; manual client checklist pending.

- Shared Snowflake scanner, permission checks, deterministic coverage/confidence, monotonic account-scoped cache and two-scan comparison.
- BetterDiscord single-file implementation and Vencord custom userplugin source.
- Dashboard, statistics, search, combined filters, sorting, size labels, Keep, diagnostics, local exports and conservative refresh settings.
- Architecture/privacy/install/testing documentation, manual release gate and CI.

Known limitations: loaded-only thread coverage, Discord internal API fragility, no live client stability claim. See README and release checklist.
