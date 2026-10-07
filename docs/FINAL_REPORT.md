# Initial development report

**ServerVitals 0.1.0-alpha.1 — independent alpha testing build.** Initial implementation 100% AI generated with OpenAI Codex. Manual live-client testing has not been completed. This report does not mark any release stable.

## Delivered integrations

| Platform      | Implemented                                                                                                                                                                   | Validation achieved                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| BetterDiscord | Normal single-file plugin; settings → Open ServerVitals; named store discovery; BdApi Data persistence; shared dashboard/scanner; guarded Discord navigation; cleanup on stop | Bundle build and execution/start/stop/settings smoke test against mocked BdApi                                |
| Vencord       | TypeScript/TSX custom userplugin; definePlugin lifecycle; Vencord settings, React/common stores, DataStore and current modal/router APIs; cleanup on stop                     | Full upstream TypeScript check and desktop build with generated userplugin installed in a validation checkout |

Both include statistics, search, seven sort orders, combined filters, size column/labels, Keep, configurable categories, manual/conservative automatic refresh, diagnostics, previous-scan changes and local CSV/JSON export. Neither live integration can be called verified from these automated results alone.

## Measurements and reliability

- **Activity:** permission-check loaded guild channels and threads, select the newest valid last-message Snowflake, decode with BigInt and Discord epoch 1420070400000. No acknowledgement IDs, thread-creation substitutions or message-body fetches.
- **Size:** explicit loaded guild member fields first, explicit approximate fields second, GuildMemberCountStore fallback third. The fallback is conservatively approximate; invalid data is unavailable. Exact means the field reports an explicit count, not a fresh server query. Retained sizes are labeled cached and excluded from meaningful size-change comparisons.
- **Last Scanned:** per-guild inspection timestamp, separate from Last Visible Activity. Last Full Scan updates only after completion. Overall failures retain the last successful snapshot.
- **Freshness:** UNKNOWN without a trustworthy observation; CACHED when an earlier newer observation is retained; PARTIAL when current metadata has gaps; LIVE only with complete supported evidence. Real alpha scans use loaded-only thread coverage and normally show PARTIAL.
- **Confidence:** current valid-source coverage percentage, minus 20 for incomplete thread coverage and 20 for inspection issues, clamped 0–100. HIGH >=90, MEDIUM >=60, LOW below60; UNKNOWN without activity. Cached results are at most MEDIUM based on original observation quality. Recency does not determine confidence.
- **Statistics:** full current list, including Keep; overlapping fixed day bands; Unknown excluded from age counts; known values only for average/median. Today is rolling 24 hours, six months=180 days. Categories can be configured separately.
- **Changes:** compare only two full snapshots by guild ID. Detect membership, activity advancement, categories, day-threshold crossings, freshness, confidence and meaningful reliable size deltas. Ignore Last Scanned/Keep/name-only changes. Group labels link to current rows; removed names remain listed for one comparison.
- **Cache:** account-scoped, host-local schema with current/previous snapshots and Keep; no message contents. Missing/older current metadata cannot overwrite newer trustworthy activity. Restored UI is cached; historical baseline avoids false restart events. Account changes stop scanning and clear visible data.

## Dependencies and privacy

GuildStore, ChannelStore, PermissionStore and UserStore are required. ReadStateStore, GuildMemberCountStore and ActiveJoinedThreadsStore are optional sources. BetterDiscord uses supported Webpack discovery; Vencord uses `@webpack/common` bindings. UserStore supplies only the current account ID for storage isolation and a change listener. No AuthenticationStore or MessageStore is used.

Normal scanning issues **0 network/API requests**. Normal activity scanning never reads message contents. No authentication tokens, emails, DMs, telemetry or backend are accessed. Icon rendering can load Discord CDN images; explicit navigation can trigger Discord's ordinary loading. No automatic messages, joining, leaving or deletion is implemented.

## Validation results

- Formatting, ESLint, strict shared/BetterDiscord TypeScript: passed.
- 85 Node unit/integration tests: passed, including 200-guild/5,000-source synthetic coverage.
- Actual browser UI fixture checks: passed; zero page errors or external requests in that synthetic preview. Checked rendering, search, size sorting, Keep, filters, statistics, change drill-down, CSV download, diagnostics, settings and narrow layout.
- BetterDiscord artifact build and mocked host smoke test: passed.
- Vencord userplugin source-bundle validation, ZIP layout and SHA-256 verification: passed.
- Full Vencord TypeScript and desktop build: passed against commit `718c867256a9d181edc7a534afb296b9bb41ab58`.
- Dependency audit at implementation time: no reported vulnerabilities.
- Live BetterDiscord/Vencord installation, real store discovery, actual guild counts, runtime CPU/memory and long-term stability: **not tested**.

The synthetic screenshot is labeled and is not a live-client screenshot. Synthetic timing output is not a real Discord performance claim. The validation checkout is ignored by Git and is not distributed.

## Artifacts

- `dist/betterdiscord/ServerVitals.plugin.js`
- `dist/vencord/serverVitals/` (entry point `index.tsx`, shared source and license included)
- `dist/ServerVitals-Vencord.zip` (top-level `serverVitals/` folder only)
- `dist/SHA256SUMS.txt`
- `docs/screenshots/dashboard-demo.png` (synthetic browser capture)

## Repository and publication status

Git initialized on local branch `main` in this workspace. No GitHub CLI executable was available; no remote repository or GitHub release was created. No Git author identity was configured, so no author identity was invented and no initial commit was made. Source remains available locally for review and publication. Nothing was submitted to BetterDiscord or Vencord.

To publish later, configure your own Git identity, commit the reviewed files, then use an authenticated GitHub CLI:

```sh
git add .
git commit -m "Initial ServerVitals alpha"
gh repo create ServerVitals --public --source . --remote origin --push --description "Find inactive Discord servers by viewing, sorting, and analyzing their last visible activity. Supports BetterDiscord and Vencord."
```

Use the suggested topics from the project brief. Any release made before manual testing must be explicitly marked **prerelease** and include the Testing Build warning. CI does not publish releases. Do not distribute the validation checkout's Vencord build.

## Manual next step and limitations

Complete [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) in both clients. Start with load/disable/re-enable, guild/channel/size plausibility, independent Last Scanned and Last Visible Activity, badges/confidence, cache restart/monotonicity and unknown handling. Then validate all dashboard controls, comparison/export, network behavior and CPU/memory.

Accuracy is limited to permitted loaded metadata; private channels and unloaded/archived threads are not represented. Empty and uninitialized sources can be indistinguishable. Forum parents do not prove newest reply activity. Local member counts can be stale. Discord internal stores, field names, permission methods and navigation/modal signatures may change, even when source compilation passes.

There are no known failing automated checks preventing an explicitly labeled source alpha. **Live client validation remains outstanding and prevents a verified compatibility/stability claim. GitHub publication remains undone because CLI/author setup was unavailable.**
