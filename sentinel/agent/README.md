# Defentrax Agent

Go binary deployed on monitored hosts. Collects security-relevant logs and metrics, buffers locally, and uploads events to the control-plane API over TLS.

**Status:** Phase 11 — enrollment, heartbeat, auth log collector, optional Docker Engine monitoring (observe-only), and event upload.

See:

- [Agent operator guide](../docs/agent.md) — install, enrollment, host permissions
- [Docker monitoring](../docs/docker-monitoring.md) — optional socket-based collection and least-privilege notes

**Will not:** evaluate detection rules, store alerts, perform user authentication, or mutate/isolate containers.
