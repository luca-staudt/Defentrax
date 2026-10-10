# Installation

Fastest path for local development and small self-hosted setups.

## Prerequisites

- Docker Engine 24+ with Compose plugin (`docker compose version`)
- ≥ 2 GB RAM recommended for the full stack
- Free host ports (defaults: `3000` UI, `8080` API)

## 1. Clone and `.env`

```bash
git clone https://github.com/luca-staudt/Defentrax.git
cd Defentrax
cp .env.example .env
```

Set required secrets in `.env` (never commit them):

```bash
# PostgreSQL
openssl rand -base64 24   # → POSTGRES_PASSWORD=

# API sessions / crypto (32 bytes, base64 each)
openssl rand -base64 32   # → SESSION_SECRET=
openssl rand -base64 32   # → TOTP_ENCRYPTION_KEY=
# optional; otherwise falls back to TOTP_ENCRYPTION_KEY:
openssl rand -base64 32   # → SECRETS_ENCRYPTION_KEY=
```

Optional one-time first admin (only when the `users` table is empty):

```bash
# in .env — uncomment and set both
SENTINEL_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
SENTINEL_BOOTSTRAP_ADMIN_PASSWORD='choose-a-long-password'
```

Bootstrap runs when the API process starts and `users` is empty. After uncommenting
or changing `SENTINEL_BOOTSTRAP_ADMIN_*`, **recreate the API container** so it
picks up the new env (a plain `restart` is not enough if compose already started
without those vars):

```bash
docker compose up -d --force-recreate --no-deps defentrax-api
```

Then remove or comment out the bootstrap vars and recreate again once login works.

Local HTTP: keep `COOKIE_SECURE=false` and
`CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` (already in `.env.example`).

Full variable reference: [configuration.md](configuration.md).

## 2. Start the stack

App images are built **locally** (tags `defentrax-*:${SENTINEL_IMAGE_TAG}`). Always use `--build` on first deploy or after pulls — Compose uses `pull_policy: build` so it does not try Docker Hub for those tags.

```bash
docker compose up -d --build
```

If `migrate` fails (`service migrate didn't complete successfully`), inspect:

```bash
docker compose logs migrate
```

Services: `postgres`, `redis`, `migrate` (one-shot), `defentrax-api`, `defentrax-frontend`.

The frontend image bakes Next.js `/api/v1/*` rewrites at **build** time from
`API_PROXY_TARGET` (Compose default: `http://defentrax-api:8080`). That must be
the API’s Docker DNS name — `http://127.0.0.1:8080` inside the frontend
container points at itself and causes login `ECONNREFUSED` / Internal Server
Error. Override via build arg / `.env` only if your service name differs, then
rebuild:

```bash
docker compose build --no-cache defentrax-frontend
docker compose up -d defentrax-frontend
```

| Endpoint | URL |
|----------|-----|
| UI | http://localhost:3000 |
| Health | `curl -s http://localhost:8080/healthz` |
| Ready | `curl -s http://localhost:8080/readyz` |
| OpenAPI | http://localhost:8080/api/v1/docs |

## 3. Development overlay (optional)

Expose Postgres/Redis on the host and bind-mount rules:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

## 4. Optional profiles

```bash
# Agent (requires SENTINEL_ENROLLMENT_TOKEN in .env)
docker compose --profile agent up -d --build

# Caddy reverse proxy on port 80
docker compose --profile proxy up -d --build
```

With proxy: UI at `http://localhost`, API under `http://localhost/api/…`.  
Set `NEXT_PUBLIC_WS_URL` (e.g. `ws://localhost`) and rebuild the frontend image.

Agent rollout details: [agent.md](agent.md).

## 5. Stop / data

```bash
docker compose down          # keep volumes
docker compose down -v       # delete Postgres/Redis volumes (data loss)
```

Postgres data lives in the named volume `sentinel-postgres-data` (legacy external name kept for existing installs; containers are `defentrax-*`) — see [deployment.md](deployment.md) and [backup.md](backup.md).

## Kubernetes (kind / minikube / cluster)

See [`../deployments/kubernetes/README.md`](../deployments/kubernetes/README.md).

1. Build images (`docker compose build`) and load them (`kind load` / `minikube image load`).
2. Replace all `REPLACE_ME` placeholders in `secret.yaml` **locally** — never commit real secrets.
3. `kubectl apply -k sentinel/deployments/kubernetes` (or stepwise per the K8s README).
4. Wait for the migration job; check `/healthz` and `/readyz`.

Client validation without mutating a cluster: `make k8s-dry-run`.

## Helm

Chart: [`../deployments/helm/sentinel/`](../deployments/helm/sentinel/).

1. Load images as for Kubernetes.
2. Pass secrets via `--set`, a local values file, or `secrets.existingSecret` (no default prod passwords in the chart).
3. `helm upgrade --install sentinel … --namespace sentinel --create-namespace`
4. Wait for the migration hook; adjust Ingress hosts.

Validation: `make helm-lint`.

## Without Docker

Go 1.22+, Node 20+, local PostgreSQL — see the root [`README.md`](../../README.md) and [`../frontend/README.md`](../frontend/README.md).

## After install

- [security.md](security.md) — hardening checklist  
- [backup.md](backup.md) · [retention.md](retention.md) · [privacy.md](privacy.md)  
- [troubleshooting.md](troubleshooting.md)
