# Contributing

ServerVitals is an independent project. Report ServerVitals issues here, not to BetterDiscord or Vencord maintainers. No submission to either official plugin repository is planned for this initial implementation.

The initial implementation is 100% AI generated using OpenAI Codex. Future human contributions are welcome; disclose material AI assistance and review/understand what you submit. Do not remove or obscure the initial-implementation disclosure. Do not claim AI-generated builds are manually tested or stable without evidence.

Keep scanners local and read-only. Never introduce tokens, message bodies, telemetry, external APIs, self-bot behavior, automated joining/leaving/messages/deletion or hidden-channel disclosure. Prefer shared pure logic and small adapters. Document internal dependencies and update privacy documentation before any behavior change.

Use `npm ci`, `npm run check`, and the Vencord validation instructions in `docs/TESTING.md`. Include meaningful regression tests for changes to confidence, cache, scanning and comparison. Run the relevant manual checklist in both hosts and describe what remains unverified. Keep synchronized semantic versions and record platform-specific fixes.

Contributions are licensed under GPL-3.0-or-later. Stable publication is a deliberate maintainer action after manual testing; CI must not publish stable automatically.
