# Security hardening (Phase 19)

This document describes what Sentinel enforces today, how to deploy it safely, and which risks remain operator-owned.

## Threat model (short)

| Actor | Goal | Primary controls |
|-------|------|------------------|
| Unauthenticated internet client | Brute-force login / enroll / inject events | Rate limits, hashed credentials, TLS, no default admin password |
| Stolen session cookie | Impersonate operator | `HttpOnly` + `Secure` + `SameSite=Strict` (prod), short TTL, server-side session revoke |
| Cross-site attacker (browser) | CSRF state change | SameSite cookies, JSON bodies, CORS allowlist (no `*`), Origin guard on cookie-auth mutations |
| Compromised agent token | Inject false events | Agent scope limited to ingest/heartbeat; token hashed at rest; ingest rate limits |
| Malicious plugin artifact | Code exec in API process | Empty allowlist default, optional signature, documented process boundary limits |
| Repo / CI secret leak | Credential theft | `.gitignore`, gitleaks in CI, Trivy secret scanner, Dependabot |

Single-tenant self-host is assumed. Multi-tenant isolation is **not** in scope for v1.

## Secure defaults

- `APP_ENV=production` requires `COOKIE_SECURE=true` unless `ALLOW_INSECURE_COOKIES=true` (break-glass only).
- Session cookies: `HttpOnly`, `Path=/`, `SameSite=Strict` when secure (Lax only for local HTTP).
- CORS never treats `*` as an allowed credentialed origin — list explicit UI origins.
- Login, TOTP/recovery verify, agent enroll, and ingest are rate-limited (Redis when `REDIS_URL` is set).
- Containers (API, agent, frontend, migrate) run as UID `65532`; Kubernetes/Helm drop capabilities and set `runAsNonRoot`.
- Notification channel secrets are encrypted at rest; API responses expose `has_secrets` only, never plaintext webhooks.

## CSRF strategy

Sentinel is a JSON API. Classic HTML-form CSRF cannot set `Content-Type: application/json`. Additional controls:

1. **SameSite** session cookies (Strict behind HTTPS).
2. **CORS** credentials only for explicitly listed origins.
3. **OriginGuard** middleware: cookie-authenticated `POST|PUT|PATCH|DELETE` with an `Origin`/`Referer` that is not allowlisted → `403 origin_forbidden`. Requests without Origin (CLI / Bearer API keys) are allowed.

Recommended UI deployment: same-site reverse proxy (Compose/`next` rewrite or Ingress) so the browser talks to one origin.

## TLS guidance

| Layer | Recommendation |
|-------|----------------|
| Internet → UI/API | Terminate TLS at Ingress / reverse proxy; set `COOKIE_SECURE=true` |
| API process TLS | Optional: set both `API_TLS_CERT_FILE` and `API_TLS_KEY_FILE` (forces secure cookies) |
| Agent → API | HTTPS URL; do **not** set `SENTINEL_TLS_INSECURE` except local labs |
| Postgres | Prefer `sslmode=require` (or verify-full) outside Compose-dev networks |
| mTLS (agent↔API) | **Not implemented** in v1 — residual risk; tokens + TLS are the trust model |

Plain HTTP in production logs a warning at API startup.

## Secret handling

- Never commit `.env`. Use `.env.example` placeholders only.
- CI runs **gitleaks** (`.gitleaks.toml`) plus Trivy `secret` scanner.
- Request logs record method, path, status, duration, request_id — **not** query strings, cookies, or `Authorization`.
- Enrollment failures use a single message (`enrollment token invalid or expired`) to avoid token oracles.
- One-time secrets (API keys, enrollment tokens, agent tokens, TOTP secret/recovery codes) appear in responses **only at creation/enrollment time**.

## Rate limits (env)

| Limit | Env | Default |
|-------|-----|---------|
| Login | `LOGIN_RATE_LIMIT_*` | 10 / 60s (email+IP) |
| TOTP / recovery | same login limiter keys `totp\|IP`, `recovery\|IP` | shared budget |
| Enroll | `ENROLL_RATE_LIMIT_*` | 30 / 60s (IP) |
| Ingest | `INGEST_RATE_LIMIT_*` | 120 / 60s (agent) |

## Residual risks (honest)

1. **No agent mTLS** — bearer agent tokens remain the enrollment trust; protect host credential files (`0600`).
2. **In-memory rate limits** without Redis — not shared across replicas; set `REDIS_URL` for HA.
3. **Plugin code runs in-process** — allowlist + signatures reduce risk; they are not a sandbox.
4. **Trusted reverse-proxy IP** — API uses `RemoteAddr` only (no `X-Forwarded-For` trust yet); place rate-limit-aware proxies carefully.
5. **OpenAPI /docs unauthenticated** — intentional for operators; disable at the proxy if undesired.
6. **SBOM / image signing** — SBOM in CI (Phase 18); checksums + local SBOM scripts in Phase 21; cosign still optional/manual (not in CI).
7. **LICENSE unset** — legal distribution risk until maintainer chooses a license (no LICENSE file without that decision).
8. **Dependabot PRs** need human review — config is present; merging vulnerable deps is still an operator process.

## Checklist (operators)

- [ ] Strong unique `POSTGRES_PASSWORD`, `SESSION_SECRET`, encryption keys
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] Explicit `CORS_ALLOWED_ORIGINS`
- [ ] `REDIS_URL` for multi-instance
- [ ] Non-default image tags (no `:latest` in prod)
- [ ] NetworkPolicies / Ingress TLS as in K8s/Helm docs
- [ ] Agent credential path permissions; TLS to API
- [ ] Empty or tight `SENTINEL_PLUGIN_ALLOWLIST`

## Related

- [SECURITY.md](../../SECURITY.md) — vulnerability reporting
- [privacy.md](privacy.md) · [retention.md](retention.md) · [backup.md](backup.md)
- [configuration.md](configuration.md) · [troubleshooting.md](troubleshooting.md)
- [ci.md](ci.md) — scanners in GitHub Actions
- [deployment.md](deployment.md) — Compose / K8s / Helm defaults
- [plugins.md](plugins.md) — plugin trust boundaries
