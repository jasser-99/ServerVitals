# Security

ServerVitals 0.1.0-alpha.1 is a testing build without a completed manual stability checklist. It is not guaranteed safe or officially approved. Discord internal changes can break functionality.

Do not publish tokens, credentials, message contents or private server information in an issue. For non-sensitive functional bugs use this repository's GitHub Issues. For a security issue, use GitHub private vulnerability reporting **if the maintainer has enabled it**; otherwise privately contact the repository owner through their published GitHub contact method. Do not assume a private channel has been configured. No security response time is promised.

Scope includes unintended data access/transmission, export injection, account-cache isolation and lifecycle cleanup. The plugin should not request network access, use authentication tokens or touch message contents. See `docs/PRIVACY.md`.
