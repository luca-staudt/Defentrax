# Sentinel API (control plane)

Go HTTP service for Sentinel’s control plane: REST under `/api/v1`, future WebSockets, authentication, ingestion, and audit (phased delivery).

**Phase 2 scope:** configuration from environment variables, structured JSON logging, liveness/readiness probes, `/api/v1` version stub, graceful shutdown. No database, auth, or business routes yet.

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

## Endpoints (Phase 2)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/healthz` | Liveness |
| GET | `/readyz` | Readiness (database check stubbed until Phase 3) |
| GET | `/api/v1` | API version metadata |

## Secure defaults

- No default admin credentials or API keys are created by this module.
- Do not commit `.env` or put secrets in logs.
