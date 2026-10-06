# Docker Monitoring (Phase 11)

Optional **observe-only** Docker Engine event collection on hosts that run the Defentrax agent. The agent never starts, stops, isolates, or deletes containers or images.

## Enable

Off by default. Set:

```bash
export SENTINEL_DOCKER_ENABLED=true
# optional; default /var/run/docker.sock
export SENTINEL_DOCKER_SOCKET=/var/run/docker.sock
```

Restart the agent. Events appear with `source=docker` and are ingested through the same `POST /api/v1/agent/events` path as auth log events.

## What is collected

| Signal | `fields.event_type` | Notes |
|--------|---------------------|--------|
| Container create / start / stop / die / remove | `container_*` | Lifecycle |
| Image pull / delete / tag / untag | `image_*` | Lifecycle |
| Privileged mode | `privileged=true` | From inspect on create/start |
| Host network | `host_network=true` | `NetworkMode=host` |
| Docker socket bind | `docker_socket_mount=true` | e.g. `/var/run/docker.sock` |
| Sensitive host binds | `sensitive_mount=true` | `/`, `/etc`, `/proc`, `/sys`, `/root`, … |

Risk flags are derived from container inspect after create/start. If the container is already gone, the lifecycle event is still emitted without risk flags.

## Socket permissions (least privilege)

Access to the Docker Engine API socket is powerful (effectively root on many hosts). Prefer:

1. **Dedicated group** — ensure the socket is owned by `root:docker` with mode `660` (Docker’s default).
2. **Agent user in `docker` group** — add only the agent service account to group `docker`; do not run the agent as root solely for Docker monitoring.
3. **Socket path** — point `SENTINEL_DOCKER_SOCKET` at the Engine socket you intend to monitor (rootless Docker uses a user-scoped path).
4. **No write automation** — Defentrax only calls read APIs (`GET /events`, `GET /containers/{id}/json`). Do not grant broader host privileges “just in case.”
5. **Disable when unused** — leave `SENTINEL_DOCKER_ENABLED` unset/`false` on hosts without Docker or where container telemetry is out of scope.

If the socket is missing or permission is denied, the agent logs a warning and retries with backoff; auth log collection continues.

## Detection rules

Shipped under `sentinel/rules/docker/`:

- `docker.possible-privileged-container`
- `docker.possible-host-network`
- `docker.possible-docker-socket-mount`
- `docker.possible-sensitive-host-mount`

Titles use possibility-oriented language. Tune or disable per environment via the control plane.

## Security note

Mounting `docker.sock` into other containers (or granting the agent unrestricted socket access on shared multi-tenant hosts) expands blast radius. Treat Docker monitoring as an explicit trust decision, not a default.
