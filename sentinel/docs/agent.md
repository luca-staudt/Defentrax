# Defentrax Agent

The Defentrax agent runs on monitored Linux hosts, enrolls with the control plane, sends heartbeats, and uploads normalized security events (auth/SSH by default; optional Docker Engine events).

## Requirements

- Linux for live auth log collection (`/var/log/auth.log` or journald)
- Network egress to the Defentrax API over **HTTPS** (TLS 1.2+)
- Read access to auth logs (typically membership in `adm` or `systemd-journal` — no root required)
- **Optional Docker monitoring:** read access to the Docker Engine API socket (see [Docker monitoring](docker-monitoring.md))

## Install / run

Build from the repo:

```bash
cd sentinel/agent
go build -o sentinel-agent ./cmd/sentinel-agent
```

## Configuration (environment)

| Variable | Required | Description |
|----------|----------|-------------|
| `SENTINEL_API_URL` | yes | Base URL, e.g. `https://defentrax.example.com` |
| `SENTINEL_ENROLLMENT_TOKEN` | first run only | One-time `senr_…` token from the panel (do **not** keep in compose `.env`) |
| `SENTINEL_ENROLL_ONLY` | no | `true` to exit after saving credentials (one-shot compose enroll) |
| `SENTINEL_AGENT_CREDENTIAL_PATH` | no | Default `/var/lib/sentinel/agent/credentials.json` (mode `0600`) |
| `SENTINEL_AGENT_NAME` | no | Display name / host label |
| `SENTINEL_AGENT_VERSION` | no | Reported version (default `0.5.0-dev`) |
| `SENTINEL_TLS_INSECURE` | no | **`true` only for local dev** — skips TLS certificate verification |
| `SENTINEL_AUTH_LOG_PATH` | no | Default `/var/log/auth.log` |
| `SENTINEL_USE_JOURNALD` | no | `true` to read via `journalctl` instead of a file |
| `SENTINEL_DOCKER_ENABLED` | no | `true` to enable observe-only Docker event collection (default off) |
| `SENTINEL_DOCKER_SOCKET` | no | Docker Engine socket path (default `/var/run/docker.sock`) |
| `SENTINEL_HEARTBEAT_INTERVAL` | no | Default `30s` |
| `SENTINEL_COLLECT_INTERVAL` | no | Default `60s` |
| `SENTINEL_INTERVENTION_DRY_RUN` | no | Optional override only. Prefer panel **Interventions → Dry-run** (`intervention.dry_run` on heartbeat). |

Secrets are **never** written to logs; the agent redacts `senr_`, `sagt_`, and `sent_` prefixes.

## Enrollment workflow (panel-first)

### Docker Compose (recommended)

1. In the operator panel, open the server → **Connect stack agent** → **Enrollment for Compose agent**.
2. Copy the one-shot command (token is embedded once; not stored in `.env`):

   ```bash
   docker compose --profile agent run --rm \
     -e SENTINEL_ENROLLMENT_TOKEN=senr_… \
     -e SENTINEL_AGENT_NAME=compose-agent \
     -e SENTINEL_ENROLL_ONLY=1 \
     sentinel-agent

   docker compose --profile agent up -d
   ```

3. Credentials persist in the `agent_data` volume (`/var/lib/sentinel/credentials.json`). Ongoing runs only need `SENTINEL_API_URL`.

If the agent starts before enroll, it waits for the credentials file instead of crash-looping.

### Bare-metal / API

1. **Admin** (RBAC `servers:write`): create a server and enrollment token.

   ```bash
   # After user login / session cookie or API key
   curl -sS -X POST "$API/api/v1/servers" -H "Cookie: …" -d '{"name":"prod-web","hostname":"prod-web.example"}'
   curl -sS -X POST "$API/api/v1/servers/$SERVER_ID/enrollment-tokens" -H "Cookie: …" -d '{"label":"prod-web-agent","ttl_minutes":60}'
   ```

   Response includes `token` (`senr_…`) **once**. Only the hash is stored server-side.

2. **Agent** (first start): set `SENTINEL_ENROLLMENT_TOKEN` and `SENTINEL_API_URL`, then start the binary. It calls `POST /api/v1/agent/enroll`, receives `sagt_…`, and saves credentials with file mode `0600`.

3. **Ongoing**: heartbeats (`POST /api/v1/agent/heartbeat`) and event upload (`POST /api/v1/agent/events`) use `Authorization: Bearer sagt_…`. Intervention dry-run is panel-controlled (`dry_run` on the heartbeat `intervention` object).

## Permissions on the host

- **File mode:** `/var/log/auth.log` is often `640 root:adm` — add the agent user to group `adm`.
- **Journald:** grant `systemd-journal` group or ACLs so `journalctl -u ssh/sshd` works without root.
- **Docker (optional):** add the agent user to group `docker` so it can read `/var/run/docker.sock` (mode `660`). Do **not** run the agent as root only for Docker. Full least-privilege guidance: [docker-monitoring.md](docker-monitoring.md).

## Collectors

| Collector | Default | Output `source` |
|-----------|---------|-----------------|
| Auth / SSH log | on | `authlog` |
| Docker Engine events | off (`SENTINEL_DOCKER_ENABLED`) | `docker` |

Docker collection is **observe-only** (events + inspect). The agent does not isolate, kill, or delete containers.

## API endpoints (agent-scoped)

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/agent/enroll` | enrollment token in JSON body |
| POST | `/api/v1/agent/heartbeat` | agent bearer |
| POST | `/api/v1/agent/events` | agent bearer |

Agent tokens may **only** enroll (once), heartbeat, and ingest events — not user administration or rule changes.
