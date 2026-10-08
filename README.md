# ServerVitals

**Find the servers that have gone quiet.**

A local dashboard for sorting your Discord servers by **Last Visible Activity**. See which communities have gone quiet, inspect how reliable the results are, and decide which servers to keep.

[Download 0.1.6](https://github.com/jasser-99/ServerVitals/releases/tag/v0.1.6) · [User guide](docs/USER_GUIDE.md) · [Report an issue](https://github.com/jasser-99/ServerVitals/issues)

> **Testing prerelease:** BetterDiscord has received maintainer testing and feedback. **Vencord has not been tested in a live client.** Neither version has completed the full manual stability checklist.

## AI Development Disclosure

**The initial ServerVitals codebase is 100% AI generated using OpenAI Codex.** This describes the initial implementation; future human contributions may change the codebase. The maintainer manually installs, tests and evaluates releases before marking them stable.

ServerVitals is independent and unofficial. It is distributed through this repository, not submitted to the official BetterDiscord addon directory or Vencord repository. Manual testing does not imply official approval.

## How to install

### BetterDiscord

1. Download [ServerVitals.plugin.js](https://github.com/jasser-99/ServerVitals/releases/download/v0.1.6/ServerVitals.plugin.js).
2. Drag it into your BetterDiscord **plugins folder**, replacing any older ServerVitals file.
3. Enable ServerVitals, open its settings, and click **Open ServerVitals** → **Check Now**.

Use BetterDiscord's **Open Plugins Folder** button to find the folder. [Detailed instructions](docs/INSTALL-BETTERDISCORD.md).

### Vencord — untested in a live client

Download [ServerVitals-Vencord.zip](https://github.com/jasser-99/ServerVitals/releases/download/v0.1.6/ServerVitals-Vencord.zip), extract `serverVitals` into `src/userplugins/` in your Vencord source checkout, then rebuild and enable it. This is custom plugin source, not an installer. [Detailed instructions](docs/INSTALL-VENCORD.md).

## Preview

![BetterDiscord dashboard sorted by oldest visible activity](docs/screenshots/betterdiscord-oldest-activity.png)

**Oldest Activity First:** server size, activity, inspection time, freshness and confidence in one view. Screenshots show the maintainer's BetterDiscord installation.

<details>
<summary>Unknown activity example</summary>

| ServerVitals                                                                                                   | Discord                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Unknown activity results with sensitive names redacted](docs/screenshots/betterdiscord-unknown-redacted.png) | ![RP Server showing No text channels](docs/screenshots/discord-rp-server-no-text-channels.png) |

RP Server remains listed, but Discord shows **No text channels**. It may have none, or the account may lack access. **Unknown does not prove a server was deleted, that you were banned, or that it is inactive.**

</details>

## Features

- Sort by oldest/newest activity, name, server size or confidence.
- Filter by inactivity, confidence and Keep; view overall statistics and changes since the previous scan.
- Mark servers **★ Keep**, or select servers to leave with explicit confirmation. ServerVitals never automatically leaves servers.
- Export CSV/JSON locally, inspect diagnostics, and view or clear cache size in Settings.
- **Check Now** scans manually. Opening the dashboard uses saved results; only current and previous scan snapshots are retained.

## What the results mean

**Last Visible Activity** comes from message IDs already available to your Discord client. **Last Scanned** is when ServerVitals inspected that metadata. Freshness shows whether evidence is current, cached, partial or unknown; confidence describes its coverage, not how recent the activity is.

Private channels, unloaded threads and stale metadata limit accuracy. Unknown is missing evidence, never Dormant. Member counts are labeled approximate or unavailable where appropriate. Search is temporarily removed because of BetterDiscord typing issues, and Discord updates may break internal integrations. [Full explanations and troubleshooting](docs/USER_GUIDE.md).

## Privacy and support

Activity scanning is local and makes **zero API requests**. No authentication tokens, message contents, telemetry, analytics or ServerVitals backend. Navigation and explicitly confirmed leaving use Discord's normal client actions. [Privacy details](docs/PRIVACY.md).

Report ServerVitals-specific problems through [GitHub Issues](https://github.com/jasser-99/ServerVitals/issues), rather than asking BetterDiscord or Vencord maintainers to troubleshoot this plugin.

## Development

Run `npm ci` and `npm run check`. See [testing](docs/TESTING.md), the [manual release checklist](docs/RELEASE_CHECKLIST.md), [architecture](docs/ARCHITECTURE.md), [contributing](CONTRIBUTING.md), and [changelog](CHANGELOG.md).

Licensed under [GPL-3.0-or-later](LICENSE).

ServerVitals is not affiliated with, endorsed by, sponsored by, or officially supported by Discord Inc., BetterDiscord or Vencord. Client modifications may conflict with Discord's Terms or policies; users install them at their own discretion.
