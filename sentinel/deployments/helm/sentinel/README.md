# Sentinel Helm chart (Phase 17)

Packaged install of the Phase 16 Kubernetes stack: API, frontend, PostgreSQL, Redis, migration Job (Helm hooks), Ingress, PVCs, and NetworkPolicies.

Chart path: `sentinel/deployments/helm/sentinel/`

## Prerequisites

- Kubernetes 1.27+
- Helm 3.12+
- Images available to the cluster: `sentinel-api`, `sentinel-frontend`, `sentinel-migrate` (see Phase 15 Compose / Phase 16 README)
- Optional: Ingress controller (e.g. ingress-nginx)

## Secure defaults

| Setting | Default | Notes |
|---------|---------|--------|
| Secret passwords | **empty** | Chart **fails** to render until you set them or `secrets.existingSecret` |
| `SENTINEL_PLUGIN_ALLOWLIST` | `""` | No plugins loaded |
| `COOKIE_SECURE` | `true` | Expect TLS Ingress |
| NetworkPolicies | enabled | Default-deny + explicit allows |
| In-cluster Postgres/Redis | enabled | Disable for managed services |

**Never commit real secrets.** Prefer Sealed Secrets, External Secrets Operator, or a cloud secret manager. Use a local `-f secrets.yaml` (gitignored) or `--set` for installs.

## Install

```bash
# from repo root
CHART=sentinel/deployments/helm/sentinel

# generate secrets locally
PGPASS=$(openssl rand -base64 24)
SESS=$(openssl rand -base64 32)
TOTP=$(openssl rand -base64 32)
SENC=$(openssl rand -base64 32)

helm upgrade --install sentinel "$CHART" \
  --namespace sentinel --create-namespace \
  --set secrets.postgresPassword="$PGPASS" \
  --set secrets.sessionSecret="$SESS" \
  --set secrets.totpEncryptionKey="$TOTP" \
  --set secrets.secretsEncryptionKey="$SENC" \
  --set image.tag=0.1.0
```

Using an existing Opaque Secret (keys must match Phase 16: `POSTGRES_PASSWORD`, `DATABASE_URL`, `SESSION_SECRET`, `TOTP_ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`):

```bash
helm upgrade --install sentinel "$CHART" \
  --namespace sentinel --create-namespace \
  --set secrets.create=false \
  --set secrets.existingSecret=sentinel-secrets
```

## Values overview

| Key | Purpose |
|-----|---------|
| `image.tag` / `api.image` / `frontend.image` / `migrate.image` | Image config |
| `api.replicaCount` / `frontend.replicaCount` | Replicas |
| `api.resources` / `frontend.resources` / … | Resources |
| `ingress.*` | Hosts, TLS, annotations, class |
| `postgres.persistence` / `redis.persistence` | PVC size / storageClass / existingClaim |
| `postgres.enabled` / `redis.enabled` | Toggle in-cluster data stores |
| `secrets.*` / `config.*` / `*.extraEnv` | Secrets and env |
| `migrate.hooks` | Helm hooks for schema migrations |
| `networkPolicy.enabled` | NetworkPolicy set |

Full defaults: [`values.yaml`](values.yaml).

## Migrations (Helm hooks)

The migrate Job uses annotations:

- `helm.sh/hook: post-install,pre-upgrade`
- `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded`

On first install the Job runs after core resources are created (Postgres may still be starting — Job retries). On upgrade it runs before rolling workloads.

```bash
kubectl wait --for=condition=complete job/sentinel-migrate -n sentinel --timeout=180s
```

Disable hooks with `migrate.hooks.enabled=false` (Job becomes a regular resource) or turn off migrations with `migrate.enabled=false`.

## External PostgreSQL / Redis

```yaml
postgres:
  enabled: false
redis:
  enabled: false
config:
  redisUrl: "rediss://your-redis:6379/0"
secrets:
  create: false
  existingSecret: sentinel-secrets
  # Secret must include DATABASE_URL pointing at your managed Postgres
```

## Lint / template (CI)

```bash
make helm-lint
# or:
helm lint sentinel/deployments/helm/sentinel -f sentinel/deployments/helm/sentinel/ci/lint-values.yaml
helm template sentinel sentinel/deployments/helm/sentinel -f sentinel/deployments/helm/sentinel/ci/lint-values.yaml >/dev/null
```

`ci/lint-values.yaml` contains **obviously fake** placeholders for offline lint/template only — not for production installs.

## Alignment with Phase 16

Conceptual parity with `deployments/kubernetes/`: same workloads, probes (`/healthz`, `/readyz`), ConfigMap keys, Secret keys, Ingress path layout, PVC sizes (10Gi / 2Gi), and NetworkPolicy intent. Helm adds release-scoped names, values-driven toggles, and migration hooks.

Raw manifests remain available for non-Helm workflows.
