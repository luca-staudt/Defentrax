# Detection engine

The detection engine lives in `sentinel/detection` and runs **inside the API process** as an async worker after successful event inserts.

## Responsibilities

- Load YAML rules from `sentinel/rules/{ssh,linux,docker,nginx,apache,firewall}/` (or `SENTINEL_RULES_PATH`)
- Sync rule metadata into the `rules` table
- Match normalized events against **enabled** rules
- Apply optional thresholds / `group_by` windows (Redis preferred, in-memory fallback)
- Propose alerts with **possibility-oriented** titles and descriptions

It does **not** own durable storage or the HTTP API — the API store layer creates alerts and enforces RBAC.

## Package map

| File | Role |
|------|------|
| `rule.go` | Schema: `id`, `name`, `description`, `severity`, `version`, `condition`, `threshold`, `group_by`, `action` |
| `loader.go` | Directory load |
| `match.go` | Field / source / event_type matching |
| `window.go` | Sliding counters |
| `engine.go` | Evaluate events |
| `dedup.go` | Alert deduplication helpers (cooldown also configured via API env) |

## Runtime behavior

1. API starts → load YAML → upsert into `rules`.
2. Operator enables/disables via `PATCH /api/v1/rules/{id}` (RBAC).
3. After ingest, `api/internal/detectionrun` evaluates the batch.
4. Matches create or refresh alerts; notification rules may fire.

**File hot-reload:** changing YAML on disk requires an API restart. Enable flags reload when patched via API.

## Wording policy

Alerts must describe **possibility**, not certainty:

- Good: “Possible SSH brute-force from {{src_ip}}”
- Bad: “Attacker detected” / “Confirmed compromise”

## Configuration

| Knob | Where |
|------|-------|
| Rule pack path | `SENTINEL_RULES_PATH` |
| Dedup cooldown | `ALERT_DEDUP_COOLDOWN_SEC` (default `900`) |
| Window store | Redis via `REDIS_URL` when set |

## Writing rules

See [rules.md](rules.md) and shipped examples under [`../rules/`](../rules/).

## Tests

```bash
cd sentinel/detection && go test ./...
```

Integration coverage for detection paths is described in [testing.md](testing.md).

## Related

- [architecture.md](architecture.md)
- [api.md](api.md) — `/api/v1/rules`, `/api/v1/alerts`
- Module README: [`../detection/README.md`](../detection/README.md)
