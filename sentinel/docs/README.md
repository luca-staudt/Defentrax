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

## Agent

- [agent.md](agent.md) — install, enrollment, permissions
- [docker-monitoring.md](docker-monitoring.md) — optional Docker Engine monitoring (Phase 11)
