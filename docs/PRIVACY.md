# ServerVitals privacy

ServerVitals runs locally. It does not operate an external backend, collect analytics, send telemetry, or transmit server information to the developer. No external API or ServerVitals account is required.

ServerVitals does not access, extract, display, store or transmit Discord authentication tokens. It does not use a token manually or create a self bot. It does not automate messages, joining, leaving, deleting or other account actions.

Normal activity scanning uses only permitted, already loaded guild/channel metadata and message **IDs**. It does not need or read message contents. It does not inspect private messages, user emails or member profiles.

Local storage contains guild IDs/names, size and accuracy, latest observed message/channel IDs, activity/inspection timestamps, coverage counts, freshness/confidence, categories, Keep, settings, and two scan snapshots. The current account's ID is used solely to separate local caches. Exports contain server data, so choose where to save or share them yourself. ServerVitals never uploads exports.

Normal scanning makes zero network/API requests. Displaying guild icons may request images from Discord's CDN. Clicking navigation delegates to Discord, which may perform its usual channel loading. Those actions do not contact a ServerVitals backend.

Debug Mode is off by default. It logs aggregate counts, version and duration prefixed `[ServerVitals]`, never IDs, names, message contents, tokens, emails or private messages. Diagnostics are local; review anything you choose to include in a GitHub issue.

Keep is local metadata and does not change Discord. Reset activity cache clears observations while preserving Keep. Host plugin data removal clears stored data; other account namespaces remain until removed through the host. Disabling clears in-memory data and subscriptions but preserves local cache for restart.

If any of these behaviors change, this documentation **must be updated before release**. See [architecture](ARCHITECTURE.md) for the fields and data flow.
