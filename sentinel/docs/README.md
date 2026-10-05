# Sentinel documentation (in-repo)

Operator and developer documentation living alongside the codebase.

## Phase 2

- **License:** No `LICENSE` file in the repository yet. For an OSS release, choose **Apache-2.0** (patent grant, enterprise-friendly) or **MIT** (minimal). Record the decision before adding a license file.

## Secure defaults (summary)

- No default admin password or bootstrap API keys in application code or charts.
- Secrets belong in environment variables or a secret manager — never in git, logs, or API responses.
- Development-only database seeds (when added) are gated on `APP_ENV=development`.
- Containers should run as non-root (enforced in deployment phases).

Further architecture and phase planning will be added here as phases land (see repository root `README.md`).

## Install & deploy

- [installation.md](installation.md) — Compose (Phase 15), Kubernetes (Phase 16), Helm (Phase 17)
- [deployment.md](deployment.md) — images, volumes, healthchecks, immutable tags, K8s, Helm
- [../deployments/kubernetes/README.md](../deployments/kubernetes/README.md) — apply order, secrets, kind/minikube
- [../deployments/helm/sentinel/README.md](../deployments/helm/sentinel/README.md) — chart values, hooks, lint

## Agent

- [agent.md](agent.md) — install, enrollment, permissions
- [docker-monitoring.md](docker-monitoring.md) — optional Docker Engine monitoring (Phase 11)

## Plugins

- [plugins.md](plugins.md) — v1 plugin SDK, load policy, example plugin, API/RBAC (Phase 12)

## API

- [api.md](api.md) — REST overview, auth schemes, OpenAPI / Swagger UI (Phase 13)
- Spec: [`../api/openapi/openapi.yaml`](../api/openapi/openapi.yaml) — also `GET /api/v1/openapi.yaml` and `GET /api/v1/docs`

## Testing

- [testing.md](testing.md) — unit/integration matrix (Phase 14)
