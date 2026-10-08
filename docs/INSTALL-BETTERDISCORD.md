# Install for BetterDiscord

**Testing build: 0.1.0-alpha.5.** The maintainer's manual stability checklist has not been completed. Initial implementation: 100% AI generated using OpenAI Codex. This is an independent, unofficial plugin.

1. Install BetterDiscord using its [official instructions](https://docs.betterdiscord.app/users/getting-started/installation).
2. Download `dist/betterdiscord/ServerVitals.plugin.js` from this repository, or the identically named alpha release asset if available. Download the raw file, not the GitHub HTML page.
3. In Discord, open User Settings → BetterDiscord → Plugins → **Open Plugins Folder**. This is the recommended way to find the actual folder for your installation.
4. Copy `ServerVitals.plugin.js` into that folder, enable it, and open its settings.
5. Click **Open ServerVitals**, then **Check Now** if needed.

Typical plugin paths documented by BetterDiscord:

| Platform | Folder                                                |
| -------- | ----------------------------------------------------- |
| Windows  | `%appdata%/BetterDiscord/plugins`                     |
| macOS    | `~/Library/Application Support/BetterDiscord/plugins` |
| Linux    | `~/.config/BetterDiscord/plugins`                     |

Paths may differ with packaging/configuration. Use Open Plugins Folder as the authority. References: [BetterDiscord Installing Addons](https://docs.betterdiscord.app/users/guides/installing-addons) and [Quick Start plugin folder paths](https://docs.betterdiscord.app/plugins/introduction/quick-start), checked 2026-10-07.

No helper library is required. To update, disable the plugin, replace its file and enable again. To uninstall, disable it and remove the file; remove its local plugin data through BetterDiscord if you also want to erase caches/settings.

Report ServerVitals-specific issues to this repository's GitHub Issues. Do not ask BetterDiscord or Vencord maintainers to troubleshoot problems caused specifically by ServerVitals.

Client modifications may conflict with Discord's Terms or policies. Installation is at your own discretion. Nothing here claims official approval or guarantees account outcomes.
