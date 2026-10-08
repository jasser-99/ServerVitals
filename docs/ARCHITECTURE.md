# ServerVitals architecture

Version: **0.1.0-alpha.4**. Documentation and source researched on 2026-10-07.

## Research and decisions

Primary references:

- [BetterDiscord plugin structure](https://docs.betterdiscord.app/plugins/introduction/structure), [Webpack API](https://docs.betterdiscord.app/api/Webpack), [Data API](https://docs.betterdiscord.app/api/Data), [UI API](https://docs.betterdiscord.app/api/UI), [settings](https://docs.betterdiscord.app/plugins/tutorials/settings), [guidelines](https://docs.betterdiscord.app/plugins/publishing/guidelines), [installation](https://docs.betterdiscord.app/users/guides/installing-addons).
- [Vencord custom plugins](https://docs.vencord.dev/installing/custom-plugins/), [development](https://docs.vencord.dev/plugins/), [plugin API](https://docs.vencord.dev/plugins/common/), [Webpack](https://docs.vencord.dev/discord-code/modules/), [patches](https://docs.vencord.dev/plugins/patches/), [source build](https://docs.vencord.dev/installing/), [contribution policies](https://github.com/Vendicated/Vencord/blob/main/CONTRIBUTING.md).
- Vencord source inspected at commit `718c867256a9d181edc7a534afb296b9bb41ab58`: `src/api/Settings.ts`, `src/api/DataStore/index.ts`, `src/webpack/common/{stores,utils,modals}.ts`, and `packages/discord-types`.

BetterDiscord prohibits automatically generated official addon submissions. Vencord currently requires disclosure, human understanding and review of AI-assisted contributions; its policy is not a blanket ban on all AI assistance. This entirely AI-generated initial implementation is independently distributed and will not be submitted to either project. These upstream policies may change.

Use a small TypeScript repository, not package workspaces. `packages/core` contains pure models and algorithms. `packages/discord` contains the read-only scanner, lifecycle controller and guarded user-confirmed membership actions. `packages/ui` is a React factory supplied with each host's React, so React is not bundled into either plugin. Platform entry points adapt storage, discovery, settings access and navigation. Development dependencies are not runtime helper libraries.

## Scanner first and validation boundary

The minimal scanner was implemented and tested with synthetic store fixtures before the dashboard. Those tests prove algorithms and expected store shapes, **not live BetterDiscord or Vencord compatibility**. Live discovery, count plausibility and coverage must be checked on both clients before any stability claim. There is no fabricated live scan output or performance claim.

## Store discovery

BetterDiscord discovers named stores through `BdApi.Webpack.getStore` once per enable. Missing optional stores are recorded; required stores fail gracefully. Navigation functions are found once using `BdApi.Webpack.getModule` with export searching and source signatures matching the currently inspected Vencord router wrappers. This navigation discovery is optional and more fragile than scanning; no DOM selector injection is used. `getSettingsPanel` returns a React settings entry with **Open ServerVitals**. The dashboard renders inside BetterDiscord’s settings modal focus boundary. A scoped, reversible style change on the containing `.bd-modal-root` expands it to 96vw by 90vh; styles are restored on close/unmount. This avoids the focus lock blocking inputs rendered in a separate body portal. `BdApi.Data.load/save` persist local account-scoped data. There are no patches.

Vencord imports stores and React from `@webpack/common`. These bindings use Vencord's discovery mechanisms, not direct module-cache access. `definePlugin` provides start/stop; `definePluginSettings` exposes debug settings; `@api/DataStore` stores cache and dashboard preferences locally. `Modal`, `openModal` and `closeModal` from `@webpack/common` provide the dashboard, avoiding the now-deprecated legacy modal utilities. `NavigationRouter.transitionToGuild` and `ChannelRouter.transitionToChannel` provide existing navigation. No patches are needed.

Store dependencies:

| Store                    | Purpose                                                                      | Required |
| ------------------------ | ---------------------------------------------------------------------------- | -------- |
| GuildStore               | `getGuilds()` membership enumeration                                         | Yes      |
| ChannelStore             | `getMutableGuildChannelsForGuild()`, `getChannel()`                          | Yes      |
| PermissionStore          | `can(VIEW_CHANNEL, channel)` and `can(READ_MESSAGE_HISTORY, channel)`        | Yes      |
| UserStore                | Current account ID for separate local namespaces and account-change clearing | Yes      |
| ReadStateStore           | `lastMessageId(channelId)`; never acknowledgement IDs                        | No       |
| GuildMemberCountStore    | `getMemberCount(guildId)`                                                    | No       |
| ActiveJoinedThreadsStore | Loaded joined and, if available, unjoined thread maps                        | No       |

UserStore is used only for the current account identifier and its change listener. No authentication store, token getter, email, profile, member-list enumeration or MessageStore is used. Store objects are retained in memory until disable. Discovery is retried only on enable, never in a render or loop.

## Last Visible Activity

Enumerate currently loaded guild channels and loaded thread channels, deduplicate by channel ID, check guild ownership and current view/history permissions before reading IDs. Exclude DMs and categories. Supported Discord channel type numbers are text (0), voice text (2), announcements (5), threads (10/11/12), stage text (13), forum (15) and media (16). Unknown visible types count as missing coverage. Voice/stage counts measure text messages only, not calls or presence.

For message-bearing channels, select the largest valid ID from `lastMessageId`, `last_message_id`, and `ReadStateStore.lastMessageId`. Decode using `BigInt`: `(id >> 22n) + 1420070400000n`. Only then convert the timestamp to Number. Reject nonstrings, empty strings, signs, whitespace, scientific notation, zero, IDs over unsigned 64-bit range and future timestamps. Choose the largest message Snowflake across permitted sources. Dates are UTC epoch milliseconds internally; display uses the user's locale.

Forum/media parent last IDs may identify a thread/post rather than its newest message; parent IDs therefore do not contribute activity. Loaded forum post/thread channels do contribute their own message metadata. Missing/archived/unloaded threads are never fetched. Thread creation times and acknowledgement IDs are not substituted for last messages.

No message content property is accessed, no messages are fetched, and normal scanning creates **zero network/API requests**. Server icon rendering may separately load images from Discord's CDN. Explicit navigation uses Discord's existing router and may cause normal Discord loading. No external ServerVitals service exists.

## Size and accuracy

Prefer explicit guild `memberCount`/`member_count`, labeled exact as reported by that loaded field; this is not a live API guarantee. Then use explicit `approximateMemberCount`/`approximate_member_count`. Finally use `GuildMemberCountStore.getMemberCount`, conservatively labeled approximate because the inspected store interface exposes no accuracy flag. Never count cached member objects or use `maxMembers` as membership. Invalid, negative, noninteger or unsafe values are unavailable. Zero is valid.

Approximate values use a `~` prefix and compact formatting, not fake precision. Exact values display their integer. When current size is unavailable, prior size may be retained; the tooltip explains counts may be cached. Size is contextual and never affects activity or Keep recommendations. No count fetch is issued.

## Observation, freshness and confidence

`lastScanned` records the time of inspecting each guild, independently of the newest message time `lastVisibleActivity`. A failed overall scan retains the last successful full snapshot. A per-guild metadata failure records the inspection time and coverage issue while preserving trustworthy prior activity if possible. `Last Full Scan` changes only after a completed scan; duration measures actual work, including cooperative yields.

Freshness rules (evaluated in order):

1. No current or retained trustworthy timestamp: UNKNOWN.
2. Previous activity is newer than current activity, or current activity is missing: retain previous activity, CACHED.
3. Current timestamp with missing sources, discovery/inspection issues, or incomplete thread coverage: PARTIAL.
4. Current timestamp with complete supported coverage: LIVE.

LIVE means local metadata inspected now, not a server-confirmed fresh response. This alpha cannot prove all archived thread coverage, so real scans conservatively use `loaded-only` and normally produce **PARTIAL rather than LIVE**. The generic core supports complete evidence for future adapters. A fully scanned old timestamp can have high confidence in the core; recency is not used in confidence scoring.

Confidence is a separate deterministic heuristic, not a statistical probability:

- Unknown timestamp: UNKNOWN, score 0.
- Current observation: `round(100 × inspected / expected)`, minus 20 for loaded-only thread coverage, minus 20 if any inspection issues; clamp to 0–100. Zero expected gives zero base score.
- HIGH: score >= 90. MEDIUM: 60–89. LOW: < 60.
- Retained observation: MEDIUM, score 60, if its original observed confidence was HIGH or MEDIUM; otherwise LOW, score 25. Retain that original confidence separately to avoid repeated artificial degradation.

An inspected source means it supplied a valid message ID, not merely that a channel object existed. A separate scanned count records supported sources where metadata was attempted, including missing/empty IDs; diagnostic scanned totals use this count. Empty channels conservatively count as missing because metadata cannot prove they are empty. Hidden channels do not enter the denominator. Unknown permission failures become issues. Archived thread completeness cannot be measured, hence the fixed coverage penalty. Tooltip exposes score, ratio and issues. CACHED/MEDIUM is possible; freshness and confidence are not aliases.

## Cache and snapshots

Schema version 1, separate per platform and current account ID. Settings and cache are whitelisted/sanitized on load. Cache holds current/previous full snapshots and Keep IDs. Message bodies and user data beyond the namespace ID are absent. IDs are strings, timestamps numbers; no BigInts are serialized.

Monotonic merging preserves the latest trustworthy activity when current metadata is missing or older; retained message/source IDs remain tied to that observation. Cache reset is an explicit UI action and can legitimately produce Unknown. Removed guilds disappear from current results; their prior names survive one comparison. Keep IDs are pruned for removed guilds. Full snapshots replace history rather than accumulating indefinitely.

Restored UI results are CACHED until scanned, while the historical full-scan baseline preserves original freshness/confidence for comparison. This prevents restart alone from creating false freshness-change events. A UserStore listener clears visible in-memory results on account change/logout and stops scanning; re-enable loads that account's separate namespace. Stored namespaces for other accounts remain local. Clear plugin data through the host to remove all namespaces.

Persistence writes are serialized so older saves cannot overwrite newer Keep/settings changes. Disable cancels pending scan work, clears intervals and the account listener, empties in-memory data, and removes UI subscriptions. Vencord closes its modal. Already queued local saves may finish; no network work or patches survive disable.

## Comparison and statistics

Compare latest successful full scan to the previous successful full scan by guild ID. First scan has no changes. Events: added/removed membership, activity advanced, known/unavailable transitions, category changes, crossing fixed inactivity boundaries (7/30/90/180/365 days), freshness changes and confidence rank changes. No event for Last Scanned alone, duration, icon/name edits or Keep toggles. Categories are evaluated at each snapshot's timestamp using the same current threshold configuration, preventing setting changes from manufacturing category events.

Size events require noncached observations, the same accuracy type and an absolute delta >= max(10 members, 5% for exact or 10% for approximate). Event labels are grouped into clickable result filters. Removed guilds are listed in the comparison text and cannot navigate. Monotonic retained data means “known became unavailable” typically appears as CACHED/coverage deterioration, not destructive loss to Unknown. Unknown transitions are still supported by the pure comparison logic, such as after an explicit history reset/import in future versions.

Default categories: Active <7 days, Quiet 7–<30, Inactive 30–<180, Very Inactive 180–365 inclusive, Dormant >365. Unknown is excluded from age comparisons and always sorts after known values for oldest/newest. Size-unavailable rows likewise sort last in either size ordering. Ties use name then guild ID. Search is local and case-insensitive; filters combine with AND. Default sort is oldest. Keep does not change underlying observations.

Statistics use the entire current guild list, independent of search/Keep hiding. Age bands overlap intentionally; Today is rolling <24h, Week <7d, six months =180d, year=365d. Unknown does not count as inactive. Average/median use known observations only, including cached values. UI recategorizes on state changes and refresh, not by continuous polling. Custom category thresholds do not rename or change fixed statistics bands.

Exports include all current servers, explicit accuracy/freshness/confidence, ISO timestamps, age and Keep. CSV quotes all cells and neutralizes leading spreadsheet formula characters. JSON is structured local text. Both use a local Blob download; no upload.

## Performance and fragility

One channel enumeration per guild; thread deduplication and newest selection are linear in loaded sources. Yield every 20 guilds to avoid a single long task. Scan only through the manual Check Now control. Enable/open restores cached results without scanning; legacy automatic-refresh preferences are ignored. Clearing the cache does not scan. Never scan during render. React memoizes derived views; rows are paged in groups of 50. At most two snapshots and 20 session duration samples remain in memory.

No dispatcher message subscription is used: manual scans keep the evidence model simpler and avoid touching message payloads. UserStore's account-change listener is the only store subscription outside the UI controller. No patches or toolbar injection. BetterDiscord sizing uses the containing host-owned .bd-modal-root class; if that class changes, resizing may fail while the dashboard remains inside the focus boundary. Settings access is the reliable entry point.

Discord store names, method shapes, permissions, channel fields, thread maps, router signatures and modal internals may change without notice. A Vencord source build validates imports/types, not runtime module discovery. Synthetic tests cannot prove loaded metadata completeness or long-term client stability. Errors retain existing observations and show a restrained message, without logging exceptions or sensitive objects.

## Explicit membership actions

Both adapters discover the existing Discord module exposing `leaveGuild`. BetterDiscord uses Webpack export discovery; Vencord uses `findByPropsLazy`. No direct REST calls, tokens, or message bodies are used. The dashboard confirms the selected guild names before invoking Controller.leaveSelected. It validates account/generation, current guild membership, Keep and known ownership, deduplicates selections, invokes actions sequentially with 1.5 seconds between actions, saves successful removals, and stops at the first failure without retry. Disable/account changes prevent subsequent actions. Only scans are network-free; leaving causes Discord’s ordinary membership requests.

## Text entry isolation

While a dashboard is mounted, scoped window capture listeners stop propagation of keydown/keyup events originating in its text inputs, without preventDefault. Browser typing and editing shortcuts remain native; Tab/Escape and events outside ServerVitals pass through. Click/mousedown propagation is isolated on text fields. Unmount removes both listeners. This protects plain HTML inputs from surrounding client keybind handlers; synthetic tests reproduce a document handler redirecting focus and verify continuous character input and Backspace. These tests do not identify every live Discord focus interaction. No key values are logged or stored.
