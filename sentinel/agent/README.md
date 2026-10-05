# Sentinel Agent

Go binary deployed on monitored hosts. Collects security-relevant logs and metrics, buffers locally, and uploads events to the control-plane API over TLS.

**Status:** Phase 5 — runnable agent with enrollment, heartbeat, auth log collector, and event upload.

See [Agent operator guide](../docs/agent.md) for install, enrollment, and host permissions.

**Will not:** evaluate detection rules, store alerts, or perform user authentication.
