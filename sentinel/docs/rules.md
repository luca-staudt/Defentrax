# Detection rules

Bundled YAML packs under `sentinel/rules/` are loaded by the [detection engine](detection-engine.md).

## Layout

```
rules/
  ssh/         # authlog / SSH patterns
  linux/       # sudo / failed login style events
  docker/      # privileged / socket / sensitive mounts, etc.
  nginx/
  apache/
  firewall/
```

Each `.yaml` file defines **one** rule. Prefer small, testable rules over large catch-alls.

## Schema

```yaml
id: category.short-name
name: Human title
description: Operator-facing explanation
severity: info|low|medium|high|critical
version: 1
condition:
  source: authlog          # optional
  category: auth           # optional
  event_type: sudo         # matches fields.event_type or fields.type
  message_contains: text   # optional substring
  fields:
    result: failed
threshold:                 # optional aggregation
  count: 5
  window_seconds: 300
group_by:
  - src_ip
action:
  title: Possible …
  description: …
```

Templates in `action` may use `{{field}}` placeholders from event fields plus `host` and `source`.

## Example (shipped)

See [`../rules/ssh/possible-brute-force.yaml`](../rules/ssh/possible-brute-force.yaml): five failed SSH authentications from the same `src_ip` within five minutes → high severity “Possible SSH brute-force…”.

## Authoring checklist

- [ ] Possibility language in `name`, `action.title`, and `action.description`
- [ ] Stable unique `id` (`category.kebab-name`)
- [ ] Sensible `severity` and threshold to limit noise
- [ ] `group_by` fields that exist on matching events
- [ ] Document host/collector requirements if non-default (e.g. Docker rules need Docker collection)

## Enable / disable

Operators toggle rules via the UI or `PATCH /api/v1/rules/{id}` — YAML on disk is the template; runtime enablement is in PostgreSQL.

After adding new YAML files, **restart the API** so the loader picks them up.

## Related

- [detection-engine.md](detection-engine.md)
- [troubleshooting.md](troubleshooting.md) — noisy alerts / no matches
- Pack README: [`../rules/README.md`](../rules/README.md)
