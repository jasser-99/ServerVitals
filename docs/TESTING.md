# Testing ServerVitals

Requires Node.js 22+ and npm. From the repository root:

```sh
npm ci
npm run check
```

This runs formatting, lint, strict shared/BetterDiscord TypeScript checks, Node tests through tsx, the BetterDiscord bundle and Vencord source-bundle validation. Vencord imports are validated against a real upstream checkout separately:

```sh
npm run validate:vencord
```

The script uses `.validation/Vencord` (ignored by Git). Clone Vencord there and install dependencies with its documented pnpm frozen-lockfile command first. It copies the generated userplugin into that validation checkout, runs upstream TypeScript checking and a desktop build. It does not inject Vencord into Discord or redistribute that build. CI performs the same validation at the documented pinned upstream commit.

Tests cover Snowflakes, malformed/future IDs, newest selection, dates/categories, size precision, freshness/confidence, sorting/search/filters, cache monotonicity, snapshots/change detection, exports, settings migration, statistics, permissions, forum/thread handling, lifecycle and storage failures. Synthetic scanner fixtures exercise 200 guilds without imposing a product guild limit. Timing output is synthetic and must not be represented as live client performance.

The dashboard preview uses clearly labeled synthetic data. Screenshots are not evidence of successful client installation. Follow [the manual release checklist](RELEASE_CHECKLIST.md) in both clients to prove real module discovery and behavior. No live-client checkbox may be marked complete solely because CI passed.

`npm run check` also smoke-tests the built BetterDiscord CommonJS artifact against a mocked BdApi, checks the Vencord ZIP folder layout and verifies SHA-256 checksums. For actual browser interactions and a regenerated synthetic screenshot, run `npm run test:ui`. On Windows it uses Chrome at the standard Program Files path; set `SERVERVITALS_BROWSER` to another Chromium executable if needed. On Linux, install Playwright's Chromium with `npx playwright install chromium` first. UI testing does not launch or modify Discord.

For an issue, report platform/mod/Discord versions, symptom, aggregate diagnostics and reproduction steps. Do not paste tokens, message contents, private guild lists or exported reports into public issues. Store shape breakage may require adapter updates after Discord releases.
