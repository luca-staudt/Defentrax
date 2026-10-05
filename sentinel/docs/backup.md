# Backup and restore

PostgreSQL is the **system of record**. Redis is cache/ephemeral. Backup Postgres first; treat Redis as optional.

## What to back up

| Asset | Required | Notes |
|-------|----------|-------|
| PostgreSQL data | **Yes** | All durable state |
| `.env` / K8s Secrets / Helm secrets | **Yes** (offline, encrypted) | Needed to decrypt TOTP / notification secrets and validate sessions |
| Agent credential files on hosts | Recommended | `/var/lib/sentinel/agent/credentials.json` (default) — or re-enroll |
| Redis | Optional | Sessions/windows only |
| Rule/plugin customizations | If modified outside git | Custom YAML / plugin dirs |

## Docker Compose

Postgres uses the named volume `sentinel-postgres-data` (see [deployment.md](deployment.md)).

### Logical backup (recommended)

```bash
# while compose stack is up
docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > sentinel-$(date -u +%Y%m%dT%H%M%SZ).dump
```

Store the dump encrypted off-box. Rotate backup credentials separately from runtime DB passwords when possible.

### Volume snapshot

Stop or quiesce writers if your volume snapshot tool requires consistency, then snapshot the Docker volume / underlying disk. Prefer `pg_dump` unless you have tested filesystem-level restore.

### Restore (outline)

1. Deploy a fresh stack (or stop API/migrate writers).
2. Restore into an empty database with `pg_restore` (or `psql` for plain SQL).
3. Confirm migrations match the dump’s schema epoch (`goose` version table).
4. Restore secrets into `.env` / Secret objects **before** starting the API.
5. Start API/frontend; verify `/readyz` and login.
6. Re-enroll agents only if credential files were lost.

## Kubernetes / Helm

- PVC `postgres` (chart/manifests default size documented in deploy READMEs).
- Use Velero, CSI snapshots, or CronJob `pg_dump` to object storage.
- Back up the Secret that holds `SESSION_SECRET`, encryption keys, and `POSTGRES_PASSWORD`.
- Migration Job/Hook must not race a restore — restore first, then start API.

## Encryption keys

Losing `TOTP_ENCRYPTION_KEY` / `SECRETS_ENCRYPTION_KEY` while keeping the DB makes stored TOTP secrets and notification channel secrets **unreadable**. Back these keys up with the same care as the database.

`SESSION_SECRET` rotation invalidates existing sessions (users re-login) but does not corrupt data.

## Verification

At least once before go-live:

1. Take a backup.
2. Restore into an isolated environment.
3. Log in, list servers/alerts, confirm an agent can heartbeat (or re-enroll).

## Related

- [retention.md](retention.md) — delete only after backup
- [installation.md](installation.md) · [deployment.md](deployment.md)
- [privacy.md](privacy.md)
