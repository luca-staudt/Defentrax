# Privacy

Sentinel is **self-hosted**. The project maintainers do not operate a hosted cloud for your events. What data exists, where it lives, and who can see it are under **your** operational control.

## What Sentinel stores

Typical categories in PostgreSQL (see migrations under `sentinel/database/migrations/`):

| Category | Examples |
|----------|----------|
| Account | User emails, password hashes, roles, sessions, API key hashes |
| 2FA | Encrypted TOTP secrets, hashed recovery codes |
| Inventory | Servers, agents, enrollment token hashes |
| Telemetry | Security events (messages, fields, host/source metadata) |
| Detections | Rules metadata, alerts, alert timelines |
| Notifications | Channel configs; **secrets encrypted at rest** |
| Audit | `audit_logs` rows for sensitive actions |
| Plugins | Plugin registry / config rows |

Redis may hold session/rate-limit/window state — treat it as sensitive but **not** the system of record.

## What we do not do (project defaults)

- No third-party analytics SDKs in the core UI for product telemetry
- No shipping of your events to the Sentinel GitHub org
- No default “phone home”

Optional future enrichments (e.g. GeoIP) are expected to stay **off by default** when added.

## Operator responsibilities

1. **Lawful basis / notices** — You are the data controller for your deployment. Configure retention and access to match your policies (see [retention.md](retention.md)).
2. **Access control** — Use least-privilege RBAC; prefer SSO/OIDC when available post-v1; rotate API keys and agent tokens.
3. **Encryption in transit** — Terminate TLS for UI/API; agents must use HTTPS (no `SENTINEL_TLS_INSECURE` in production).
4. **Encryption at rest** — Rely on disk/volume encryption for Postgres/Redis; application keys encrypt TOTP and notification secrets.
5. **Logs** — Application logs omit query strings, cookies, and `Authorization`. Still avoid pasting production logs into public issues.

## Agents on hosts

Agents read local logs (and optionally Docker events). They upload normalized events to **your** API. Restrict agent OS users to read-only log/socket access; protect credential files (`0600`).

## Frontend

The browser holds a session cookie (`HttpOnly`). Do not expose the API with credentialed CORS `*`. See [security.md](security.md).

## Related

- [retention.md](retention.md) — how long data is kept
- [backup.md](backup.md) — copies and restore
- [SECURITY.md](../../SECURITY.md) — vulnerability reporting
