# Sentinel API (control plane)

Go HTTP service for Sentinel’s control plane: REST under `/api/v1`, future WebSockets, authentication, ingestion, and audit (phased delivery).

**Phase 3 scope:** Phase 2 foundation plus PostgreSQL readiness checks when `DATABASE_URL` is set.

## Run locally

From the repository root:

```bash
make run-api
```

Or from this directory:

```bash
go run ./cmd/api
```

Environment variables are documented in the repository root `.env.example`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Readiness — pings PostgreSQL when `DATABASE_URL` is configured |
| GET | `/api/v1` | API version metadata |

## Secure defaults

- No default admin credentials or API keys are created by this module.
- Do not commit `.env` or put secrets in logs.
