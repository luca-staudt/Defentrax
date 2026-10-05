# Deployment (Docker & Kubernetes)

## Compose-Layout

| Artefakt | Pfad |
|----------|------|
| Compose (prod-orientiert) | [`docker-compose.yml`](../../docker-compose.yml) (Repo-Root) |
| Dev-Overrides | [`docker-compose.dev.yml`](../../docker-compose.dev.yml) |
| API-Image | [`sentinel/api/Dockerfile`](../api/Dockerfile) |
| Frontend-Image | [`sentinel/frontend/Dockerfile`](../frontend/Dockerfile) |
| Migrate-Image | [`sentinel/database/Dockerfile`](../database/Dockerfile) |
| Agent-Image | [`sentinel/agent/Dockerfile`](../agent/Dockerfile) |
| Optional Proxy | [`deployments/docker-compose/Caddyfile`](../deployments/docker-compose/Caddyfile) |

Alle App-Images: **multi-stage**, **non-root** (`uid 65532`), **HEALTHCHECK**.

## Secure Defaults

- Secrets nur über `.env` / Orchestrator — nie in Images oder Git.
- Kein Default-Admin-Passwort; Bootstrap nur über `SENTINEL_BOOTSTRAP_*` solange keine User existieren.
- `SENTINEL_SEED_DEV` niemals in Production.
- Postgres-Passwort und `SESSION_SECRET` sind für `docker compose up` Pflicht (`:?`-Checks).
- Plugin-Allowlist leer = keine Plugins geladen.

## Volumes

| Volume | Inhalt |
|--------|--------|
| `sentinel-postgres-data` | PostgreSQL-Datenverzeichnis (`/var/lib/postgresql/data`) |
| `sentinel-redis-data` | Redis AOF (`/data`) |
| `sentinel-agent-data` | Agent-Credentials (Profil `agent`) |

Backup (Beispiel):

```bash
docker compose exec -T postgres pg_dump -U sentinel sentinel > sentinel-$(date +%F).sql
```

## Healthchecks

| Service | Check |
|---------|--------|
| postgres | `pg_isready` |
| redis | `redis-cli ping` |
| sentinel-api | `GET /readyz` (Compose) / Image: `GET /healthz` |
| sentinel-frontend | HTTP `/login` |
| sentinel-agent | Prozess `pidof` |

`migrate` ist ein One-Shot (`restart: "no"`); API startet erst nach erfolgreichem `migrate up`.

## Image-Tags (immutable)

- Compose setzt `image: sentinel-*:${SENTINEL_IMAGE_TAG:-0.1.0}`.
- Basisimages sind versioniert (`postgres:16.6-alpine`, `redis:7.4.2-alpine`, `caddy:2.9.1-alpine`, `golang:1.22-alpine`, `node:20-alpine`, `alpine:3.20`).
- **Production:** konkrete SemVer-Tags oder Digests pinnen; `:latest` vermeiden; nach Rebuild Registry-Tag nicht überschreiben, sondern neuen Tag pushen.

Beispiel Registry-Push:

```bash
export SENTINEL_IMAGE_TAG=0.1.0
docker compose build
docker tag sentinel-api:0.1.0 registry.example.com/sentinel-api:0.1.0
docker tag sentinel-frontend:0.1.0 registry.example.com/sentinel-frontend:0.1.0
docker push registry.example.com/sentinel-api:0.1.0
docker push registry.example.com/sentinel-frontend:0.1.0
```

## Netzwerk / Cookies

- Browser → Frontend `:3000` (REST via Next-Rewrite an `sentinel-api`).
- WebSocket direkt an API: `NEXT_PUBLIC_WS_URL` (Build-Arg + Runtime; bei Änderung Frontend neu bauen).
- Lokales HTTP: `COOKIE_SECURE=false`. Hinter TLS Proxy: `COOKIE_SECURE=true` und passende `CORS_ALLOWED_ORIGINS`.

## Kubernetes

Raw-Manifeste (Phase 16): [`../deployments/kubernetes/`](../deployments/kubernetes/) — siehe dortige [README](../deployments/kubernetes/README.md).

Kurzüberblick:

| Ressource | Zweck |
|-----------|--------|
| Deployments | `api`, `frontend`, `postgres`, `redis` |
| Services | ClusterIP für alle Workloads |
| ConfigMap / Secret | Nicht-geheim vs. Template (`REPLACE_ME`, keine echten Secrets in Git) |
| Job | `sentinel-migrate` (goose `up`) |
| PVCs | `postgres-data` (10Gi), `redis-data` (2Gi) |
| Ingress | Host-Beispiel `sentinel.example.com` |
| NetworkPolicies | Default-deny + explizite Allows |

Probes: API `GET /healthz` (liveness) und `GET /readyz` (readiness).

```bash
make k8s-dry-run
# oder:
kubectl apply -k sentinel/deployments/kubernetes --dry-run=client
```

**Secrets:** Klartext-Secrets nicht committen; Sealed Secrets / External Secrets / Cloud Secret Manager nutzen. Externe PostgreSQL: `postgres.yaml` weglassen und `DATABASE_URL` setzen (README).

## Backup / retention

- Logical Postgres backups and restore outline: [backup.md](backup.md)
- Retention policy (no automated purge yet): [retention.md](retention.md)
- Privacy notes: [privacy.md](privacy.md)

## Helm

Chart (Phase 17): [`../deployments/helm/sentinel/`](../deployments/helm/sentinel/) — siehe [Chart-README](../deployments/helm/sentinel/README.md).

```bash
make helm-lint
helm upgrade --install sentinel sentinel/deployments/helm/sentinel \
  --namespace sentinel --create-namespace \
  --set secrets.postgresPassword=… \
  --set secrets.sessionSecret=… \
  --set secrets.totpEncryptionKey=… \
  --set secrets.secretsEncryptionKey=…
```

Keine Default-Prod-Passwörter im Chart; Secrets per `--set`, lokaler Values-Datei oder `secrets.existingSecret`. Migrationen laufen als Helm-Hooks (`post-install` / `pre-upgrade`).
