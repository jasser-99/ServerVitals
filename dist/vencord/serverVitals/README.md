# Install the Vencord custom userplugin

**Testing build: 0.1.6.** This release has not completed the maintainer's manual stability checklist. Initial implementation: 100% AI generated using OpenAI Codex. Independently distributed; not an official Vencord plugin.

Follow the current [Vencord source installation guide](https://docs.vencord.dev/installing/) and [custom plugin guide](https://docs.vencord.dev/installing/custom-plugins/), verified 2026-10-07. Custom plugins require your own source build. Standard installer builds cannot load this folder directly.

1. Obtain a Vencord source checkout and install its dependencies with `pnpm install --frozen-lockfile`.
2. Create `src/userplugins` in that checkout if absent.
3. Copy the complete `dist/vencord/serverVitals` folder from this project (or extract `ServerVitals-Vencord.zip`) to `src/userplugins/serverVitals`. Its entry point must be `src/userplugins/serverVitals/index.tsx`. Include the `shared` folder.
4. From the Vencord checkout run `pnpm build` for desktop, or `pnpm buildWeb` for browser.
5. For desktop follow Vencord's documented `pnpm inject` installation step for your own build, then restart Discord. Vesktop/browser installations use the platform-specific steps in the source guide.
6. Enable **ServerVitals** in Vencord Plugins. Open its settings and click **Open ServerVitals**.

Do not put this in `src/plugins`. Do not redistribute an entire modified Vencord build. The archive contains only the independently maintained userplugin and its shared source/license.

Debug is also exposed through Vencord settings. Dashboard preferences persist in Vencord DataStore. Scans run only when you click Check Now; there are no refresh timers or automatic scans on enable/open.

To update, disable ServerVitals, replace its userplugin folder, rebuild and restart. To uninstall, disable it, remove only its `src/userplugins/serverVitals` folder, rebuild and restart. DataStore cache remains local unless cleared; reset activity history from the dashboard before removing if desired.

Report ServerVitals issues to **this project's GitHub Issues**. Do not ask BetterDiscord or Vencord maintainers to troubleshoot problems caused specifically by ServerVitals. Client modifications may conflict with Discord's Terms or policies; install at your own discretion.
