# Manual release checklist

Version: **0.1.0-alpha.6**. All boxes below are intentionally unchecked. Automated checks do not satisfy this gate.

Record tester, date, OS, Discord build, BetterDiscord version, Vencord commit, result/evidence and any exceptions. Test each shared behavior in **both** integrations. Use normal permitted test guilds, empty/unknown sources, loaded forum posts and inaccessible channels. Never include tokens or message contents in evidence.

## Installation and lifecycle

- [ ] BetterDiscord loads the normal single-file plugin.
- [ ] BetterDiscord disables cleanly and removes active UI/subscriptions/intervals.
- [ ] BetterDiscord re-enables cleanly.
- [ ] Vencord builds with the complete custom userplugin folder.
- [ ] Vencord loads and Open ServerVitals works.
- [ ] Vencord disables cleanly, including its dashboard modal.
- [ ] Vencord re-enables cleanly.
- [ ] Account switch/logout clears the previous account's visible cache.

## Scanner and reliability (both clients)

- [ ] Guild count matches the current account; no fixed guild limit.
- [ ] Server sizes look plausible; exact/approximate/unavailable labels are correct.
- [ ] Approximate sizes show `~` and do not imply exact precision.
- [ ] Permitted channel enumeration works; inaccessible channels/DMs are excluded.
- [ ] Loaded joined/unjoined thread and forum replies contribute when available.
- [ ] Last Visible Activity dates look plausible across recent and old guilds.
- [ ] Last Scanned changes on inspection, independently of Last Visible Activity.
- [ ] LIVE/CACHED/PARTIAL/UNKNOWN rules behave as documented; loaded-only alpha scans should normally be PARTIAL.
- [ ] Confidence reflects coverage rather than timestamp age.
- [ ] Missing stores fail gracefully; no fabricated Dormant result.
- [ ] Unknown states remain Unknown, not old activity.
- [ ] Cache survives restart and is shown as cached before fresh inspection.
- [ ] Older/missing metadata cannot overwrite newer trustworthy activity.
- [ ] Cache reset preserves Keep and permits a legitimate reset to Unknown.
- [ ] Refresh works; last successful full scan remains on overall failure.

## Dashboard (both clients)

- [ ] Oldest/newest sorting works with Unknown last.
- [ ] Name and server-size sorting works with unavailable sizes last.
- [ ] Lowest-confidence sorting works.
- [ ] Immediate search, combined filters and clear filters work.
- [ ] Keep persists and does not change activity/category; hiding Keep affects only the view.
- [ ] Statistics totals match underlying records, with overlapping age bands.
- [ ] What Changed compares full scans correctly, including membership, category, threshold, activity, freshness and confidence.
- [ ] Unchanged servers create no false changes; restart alone creates no false freshness event.
- [ ] Size-change thresholds avoid trivial/accuracy-type noise.
- [ ] Clickable change groups select the expected current guilds; removed names remain readable.
- [ ] Server/channel navigation respects permissions and closes ServerVitals and the underlying settings dialogs.
- [ ] CSV/JSON export downloads locally; CSV escaping/formula neutralization works.
- [ ] Category thresholds validate; fixed statistics retain their documented day bands.
- [ ] No automatic refresh controls/timers remain; enabling/opening restores cache without scanning.
- [ ] Check Now updates Last Full Scan; Settings shows cache bytes, and clearing preserves Keep without rescanning.
- [ ] Debug toggle works.
- [ ] Keyboard focus, readability, scrolling and row pagination work with a large guild list.

## Privacy, performance and stability

- [ ] No message contents are read, logged or stored.
- [ ] No Discord authentication tokens are accessed.
- [ ] No unexpected external network requests occur; scans make none, icons/navigation may use Discord normally.
- [ ] No unsolicited membership changes, messages, joins or deletes occur.
- [ ] Leave selection lists names, cancellation sends no action, Keep/owned servers are protected, successful leaves disappear, and batches stop on failure without retry.
- [ ] Typing/search and sort-menu clicks work inside the real BetterDiscord focus boundary.
- [ ] CPU and memory usage remain reasonable during repeated large scans.
- [ ] Debug logging stays aggregate and console error spam is absent.
- [ ] Discord remains stable during scan, disable, restart and account changes.
- [ ] Automated formatting/lint/types/tests/build checks pass for the candidate commit.
- [ ] Full Vencord source typecheck/build results and exact upstream commit are recorded.
- [ ] AI disclosure, unofficial/privacy/support disclaimers and limitations remain visible.
- [ ] Security audit, dependency/license review and distributable contents are reviewed.

## Publication gate

Before manual completion, use **Alpha/Beta/Prerelease** and the warning:

> Testing Build — This release has not completed the maintainer's manual stability checklist.

Never automatically publish a stable release. After the maintainer completes the checklist, they may state:

> This build has completed the maintainer's ServerVitals manual test checklist on the maintainer's own test installation.

Do not claim guaranteed safety, official approval or official affiliation. Manual testing does not establish official approval. Do not submit this initial implementation to either official plugin repository.
