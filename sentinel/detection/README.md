# Defentrax Detection Engine

Go package for loading YAML detection rules, matching normalized events, and proposing alerts with possibility-oriented wording.

## Package layout

| File | Role |
|------|------|
| `rule.go` | YAML rule schema (`id`, `name`, `description`, `severity`, `version`, `condition`, `threshold`, `group_by`, `action`) |
| `loader.go` | Load rules from `sentinel/rules/{ssh,linux,docker,nginx,apache,firewall}/` |
| `match.go` | Field / source / `event_type` matching |
| `window.go` | Sliding/fixed window counters (Redis preferred, in-memory fallback) |
| `engine.go` | Evaluate events against enabled rules |

## Integration

The API process loads rules at startup (`SENTINEL_RULES_PATH` or repo `sentinel/rules`), syncs them into the `rules` table, and runs an async worker (`api/internal/detectionrun`) after each successful event insert. Enable/disable is exposed via `/api/v1/rules` (RBAC).

Reload of enable flags happens when a rule is patched. Full YAML reload requires API restart (documented hot-reload of files is not required in Phase 7).

## Tests

```bash
cd sentinel/detection && go test ./...
```
