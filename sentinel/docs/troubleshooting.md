# Troubleshooting

Short operator runbook. Cross-check [configuration.md](configuration.md) and [security.md](security.md) when env-related.

## Stack will not start (Compose)

| Symptom | Checks |
|---------|--------|
| `migrate` exits non-zero / `service migrate didn't complete successfully` | `docker compose logs migrate`; `POSTGRES_PASSWORD` vs existing volume; Postgres healthy |
| `pull access denied for sentinel-*` / `defentrax-*` | Images are **local builds only** — use `docker compose up -d --build` (Compose sets `pull_policy: build`) |
| API unhealthy | `docker compose logs sentinel-api`; `SESSION_SECRET` set; DB reachable |
| `/readyz` fails | Postgres not ready or migrations incomplete |
| Frontend blank / API errors | `CORS_ALLOWED_ORIGINS`; `NEXT_PUBLIC_WS_URL`; rebuild UI after env change |
| Login Internal Server Error / `ECONNREFUSED` | Frontend image built with wrong `API_PROXY_TARGET` (must be `http://sentinel-api:8080` for Compose, not `127.0.0.1`). Rebuild: `docker compose build --no-cache sentinel-frontend && docker compose up -d sentinel-frontend` |

```bash
docker compose ps
docker compose logs migrate
curl -sS http://localhost:8080/healthz
curl -sS http://localhost:8080/readyz
docker compose logs --tail=200 sentinel-api
```

## Cannot log in / bootstrap admin

- Bootstrap only works when the **users table is empty**.
- Password must meet minimum length (bootstrap: ≥ 12 characters).
- After setting or uncommenting `SENTINEL_BOOTSTRAP_ADMIN_*` in `.env`, recreate the API: `docker compose up -d --force-recreate --no-deps sentinel-api` (restart alone may not reload env from compose).
- After first admin exists, unset bootstrap env vars and recreate the API again.
- Rate limited? Wait for `LOGIN_RATE_LIMIT_*` window or check Redis.
- Production with `COOKIE_SECURE=true` over plain HTTP will not keep the session — use HTTPS or local `COOKIE_SECURE=false` only in dev.

## Agent will not enroll

- Token must be unused and unexpired (`senr_…`).
- `SENTINEL_API_URL` must be reachable **from the agent host** (not only from your laptop).
- TLS errors: fix certificates; do not use `SENTINEL_TLS_INSECURE` in production.
- Enroll rate limit (`ENROLL_RATE_LIMIT_*`) — unified error text intentionally avoids oracle messages.

## No events / no alerts

1. Agent heartbeats succeeding? Server detail in UI should show agent status.
2. Collector permissions: `adm` / `systemd-journal` for auth logs; `docker` group for Docker monitoring.
3. Rules enabled? `GET /api/v1/rules` or UI.
4. Detection needs API restart after **new YAML files** are added.
5. Thresholds may not be met yet — check raw events in UI.
6. Dedup cooldown may suppress re-open (`ALERT_DEDUP_COOLDOWN_SEC`).

## WebSocket / live alerts quiet

- Browser must reach `NEXT_PUBLIC_WS_URL`.
- Reverse proxy must upgrade WebSockets.
- Session still valid; CSRF/CORS misconfig can block cookie auth on some setups.

## Notifications not firing

- Channel enabled; secrets set at creation time (API never returns plaintext secrets later).
- `SECRETS_ENCRYPTION_KEY` / TOTP key unchanged since secret was stored.
- Notification rules match severity/status triggers.
- Check API logs for retry/backoff (`NOTIFY_*`); webhook URLs are not logged.

## Disk growing fast

- No automatic event purge yet — see [retention.md](retention.md).
- Backup before deletes — [backup.md](backup.md).
- Tune agent collect interval and rule noise.

## Kubernetes / Helm

- Secrets still `REPLACE_ME`? API will fail.
- Migration Job/Hook completed?
- Image pull / tag mismatch (`SENTINEL_IMAGE_TAG` / values).
- NetworkPolicies blocking API→Postgres/Redis?
- Ingress TLS vs `COOKIE_SECURE`.

See deploy READMEs under `sentinel/deployments/`.

## CI failures

Map Make targets in [ci.md](ci.md). Local: `make fmt-check`, `make test`, `make openapi-validate`.

## Getting help

- Docs index: [README.md](README.md)
- Security reports: [SECURITY.md](../../SECURITY.md)
- Bug reports: GitHub issue templates (redact secrets)
