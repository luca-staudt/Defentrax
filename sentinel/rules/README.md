# Sentinel Detection Rules

Shipped YAML rule packs consumed by the detection engine.

## Layout

```
rules/
  ssh/
  linux/
  docker/
  nginx/
  apache/
  firewall/
```

Each `.yaml` file defines one rule. Titles and descriptions use possibility-oriented language (for example “Possible SSH brute-force…”) and avoid definitive attacker claims.

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
