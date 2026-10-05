# Sentinel Plugins

Stable v1 plugin SDK, load policy, and example extensions.

| Path | Role |
|------|------|
| `sdk/` | Interfaces (`EventParser`, `NotificationProvider`, `DetectionRuleProvider`, `DataSource`), Host, registry, manifest |
| `loader/` | Discover `plugin.json`, allowlist/checksum/signature policy, instantiate registered factories |
| `examples/echo-parser/` | Example event parser demonstrating the controlled load path |

**Docs:** [../docs/plugins.md](../docs/plugins.md)

## Security (short)

Plugins are **in-process Go factories** gated by allowlist + checksum (+ optional Ed25519). This is **not** an OS sandbox. See the docs for what is and is not claimed.

## Tests

```bash
make plugins-test
```
