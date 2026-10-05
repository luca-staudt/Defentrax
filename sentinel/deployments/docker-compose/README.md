# Docker Compose deployment

Compose manifests live at the **repository root** so a single command starts the stack:

```bash
cp .env.example .env   # set POSTGRES_PASSWORD, SESSION_SECRET, …
docker compose up -d --build
```

| File | Purpose |
|------|---------|
| [`/docker-compose.yml`](../../../docker-compose.yml) | API, frontend, Postgres, Redis, migrate; optional agent + Caddy |
| [`/docker-compose.dev.yml`](../../../docker-compose.dev.yml) | Dev overrides (expose DB/Redis, rule bind-mount) |
| [`Caddyfile`](Caddyfile) | Optional reverse proxy (`--profile proxy`) |

Operator docs: [installation.md](../../docs/installation.md), [deployment.md](../../docs/deployment.md).
