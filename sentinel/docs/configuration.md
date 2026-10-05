# Configuration

Sentinel is configured primarily via **environment variables**. Compose and Helm map the same names into containers/Secrets.

Canonical reference for local/Compose: [`.env.example`](../../.env.example) at the repository root. **Never commit `.env`.**

## Application (`sentinel-api`)

| Variable | Default / notes |
|----------|-----------------|
| `APP_ENV` | `development` or `production` |
| `API_PORT` | `8080` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | Required for ready/migrate (Compose wires service DNS) |
| `REDIS_URL` | Recommended for multi-instance rate limits / windows |
| `SESSION_SECRET` | Required when DB is set — `openssl rand -base64 32` |
| `SESSION_COOKIE_NAME` | `sentinel_session` |
| `SESSION_TTL_HOURS` | `24` |
| `COOKIE_SECURE` | `false` for local HTTP; **must be `true` in production** (unless break-glass) |
| `ALLOW_INSECURE_COOKIES` | Production break-glass only |
| `TOTP_ENCRYPTION_KEY` | 32-byte base64 — encrypts TOTP secrets at rest |
| `SECRETS_ENCRYPTION_KEY` | Optional; falls back to TOTP key for notification secrets |
| `CORS_ALLOWED_ORIGINS` | Comma-separated UI origins (no `*`) |
| `API_TLS_CERT_FILE` / `API_TLS_KEY_FILE` | Optional process TLS (both required) |
| `SENTINEL_RULES_PATH` | Optional override for YAML rule packs directory |
| `LOGIN_RATE_LIMIT_*` | Login / TOTP / recovery budgets |
| `ENROLL_RATE_LIMIT_*` | Agent enrollment |
| `INGEST_RATE_LIMIT_*` | Agent event upload |
| `INGEST_MAX_BATCH_SIZE` | `100` |
| `INGEST_MAX_BODY_BYTES` | `4194304` |
| `ALERT_DEDUP_COOLDOWN_SEC` | `900` |
| `NOTIFY_MAX_ATTEMPTS` / `NOTIFY_BASE_BACKOFF_MS` / `NOTIFY_MAX_BACKOFF_MS` | Notification retries |
| `SENTINEL_PLUGIN_DIR` | Plugin discovery root (empty = off) |
| `SENTINEL_PLUGIN_ALLOWLIST` | Empty = admit nothing |
| `SENTINEL_PLUGIN_REQUIRE_SIGNATURE` | `false` by default |
| `SENTINEL_PLUGIN_TRUSTED_PUBLIC_KEY` | Base64 Ed25519 public key |

### Bootstrap / seed (operators)

| Variable | Purpose |
|----------|---------|
| `SENTINEL_BOOTSTRAP_ADMIN_EMAIL` / `SENTINEL_BOOTSTRAP_ADMIN_PASSWORD` | One-time first admin when `users` is empty (≥12 char password) |
| `SENTINEL_SEED_DEV` | Dev-only seed; requires `APP_ENV=development` |
| `SENTINEL_DEV_ADMIN_PASSWORD` / `SENTINEL_DEV_ADMIN_EMAIL` | Optional seeded admin (never for production) |

## Agent

See [agent.md](agent.md) and [docker-monitoring.md](docker-monitoring.md).

Key vars: `SENTINEL_API_URL`, `SENTINEL_ENROLLMENT_TOKEN` (first run), `SENTINEL_AGENT_CREDENTIAL_PATH`, `SENTINEL_DOCKER_ENABLED`, `SENTINEL_TLS_INSECURE` (**lab only**).

## Frontend

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_WS_URL` | Browser WebSocket URL to the API (must be reachable from the browser) |
| `API_PROXY_TARGET` / `API_INTERNAL_URL` | Next.js rewrite / server fetch target. **Baked into the frontend image at build** for rewrites; Compose default is `http://sentinel-api:8080`. Use `127.0.0.1` only for bare-metal Next. |

Compose sets UI→API networking inside the compose network; rebuild the frontend image after changing `NEXT_PUBLIC_*` or `API_PROXY_TARGET`.

## Docker Compose

| Variable | Purpose |
|----------|---------|
| `SENTINEL_IMAGE_TAG` | Image tag (prefer immutable SemVer; avoid `:latest` in prod) |
| `POSTGRES_*` | Database bootstrap |
| `API_HOST_PORT` / `FRONTEND_HOST_PORT` | Published ports |

## Kubernetes / Helm

Secret and ConfigMap keys mirror the API env names. Chart values: [`../deployments/helm/sentinel/README.md`](../deployments/helm/sentinel/README.md). Manifests: [`../deployments/kubernetes/README.md`](../deployments/kubernetes/README.md).

## Secure defaults checklist

- [ ] Unique strong `POSTGRES_PASSWORD`, `SESSION_SECRET`, encryption keys
- [ ] `COOKIE_SECURE=true` behind HTTPS
- [ ] Explicit `CORS_ALLOWED_ORIGINS`
- [ ] `REDIS_URL` set for HA
- [ ] Empty or tight plugin allowlist
- [ ] Bootstrap admin credentials removed after first login

More: [security.md](security.md).
