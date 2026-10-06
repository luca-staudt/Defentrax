# Defentrax plugins (v1)

Extension points for parsers, notifiers, detection rules, and data sources — without forking the core.

## What v1 actually does

| Kind | Interface | Runtime in v1 |
|------|-----------|---------------|
| `event_parser` | `sdk.EventParser` | **Loaded** when allowlisted, checksum-verified, factory-registered, and enabled in DB |
| `notification_provider` | `sdk.NotificationProvider` | Interface + load policy only (dispatcher wiring later) |
| `detection_rule_provider` | `sdk.DetectionRuleProvider` | Interface + load policy only (engine merge later) |
| `data_source` | `sdk.DataSource` | Interface + load policy only (poll/ingest later) |

The list endpoint includes a `support` matrix with the same honesty.

## Security boundaries (read carefully)

**v1 is not an OS sandbox.** Admitted plugins run **in-process** via Go factory registration compiled into the API (or agent) binary. They share the process address space.

What v1 *does* enforce:

1. **Path confinement** — manifests must live under `SENTINEL_PLUGIN_DIR` (default: `sentinel/plugins/examples`).
2. **Allowlist** — only slugs in `SENTINEL_PLUGIN_ALLOWLIST` may be admitted. **Empty allowlist = load nothing** (secure default).
3. **Checksum** — SHA-256 over declared `artifacts` must match `checksum_sha256` in `plugin.json`.
4. **Optional signature** — Ed25519 over the raw 32-byte digest when `SENTINEL_PLUGIN_REQUIRE_SIGNATURE=true` and `SENTINEL_PLUGIN_TRUSTED_PUBLIC_KEY` is set.
5. **Enable gate** — DB `plugins.enabled` (API + RBAC) must be true before `Init`.
6. **Host interface** — plugins receive only `Logger` + `Config` (from `plugin_configs`). No filesystem, dialer, or DB handle is passed.

What v1 does **not** claim:

- seccomp / gVisor / WASM isolation
- Loading arbitrary `.so` / `plugin` package binaries at runtime
- Protecting the process if a malicious factory is compiled into the binary

Process-isolated (subprocess / RPC) plugins are a later option if needed.

## Layout

```
sentinel/plugins/
  sdk/                 # stable interfaces + registry + manifest types
  loader/              # discover + policy verify + instantiate
  examples/
    echo-parser/       # example EventParser
      plugin.json
      plugin.go
      parse.go
```

Directory name under the plugin root **must** match `slug`.

## Manifest (`plugin.json`)

```json
{
  "slug": "echo-parser",
  "name": "Echo Event Parser",
  "version": "1.0.0",
  "description": "...",
  "kind": "event_parser",
  "api_version": 1,
  "artifacts": ["parse.go", "plugin.go"],
  "checksum_sha256": "<64 hex chars>",
  "signature": "<optional base64 ed25519>"
}
```

Checksum canonical form (see `loader.ChecksumArtifacts`): for each artifact path **sorted**, write `path + "\n" + file bytes + "\n"` into SHA-256.

## Developing a plugin

1. Implement the appropriate interface in `sdk`.
2. Register a factory in `init()` with `sdk.Register(slug, factory)`.
3. Add a blank import in the host binary (`api/cmd/api`) so the factory is linked.
4. Ship `plugin.json` + artifacts under the plugin directory.
5. Compute checksum; set allowlist; migrate DB; enable via API.

### Example: echo-parser

Parses lines like:

```text
ECHO level=warn msg=disk_almost_full host=web-1 path=/var
```

into canonical events with `source=echo`.

## Operator configuration

| Env | Meaning |
|-----|---------|
| `SENTINEL_PLUGIN_DIR` | Root containing one subdirectory per plugin |
| `SENTINEL_PLUGIN_ALLOWLIST` | Comma-separated slugs (required to admit anything) |
| `SENTINEL_PLUGIN_REQUIRE_SIGNATURE` | `true` to require Ed25519 signatures |
| `SENTINEL_PLUGIN_TRUSTED_PUBLIC_KEY` | Base64 32-byte Ed25519 public key |

Example (dev):

```bash
export SENTINEL_PLUGIN_DIR=sentinel/plugins/examples
export SENTINEL_PLUGIN_ALLOWLIST=echo-parser
```

## API (RBAC)

Permissions: `plugins:read`, `plugins:write`  
(ADMIN + OPERATOR write; SECURITY_ANALYST / VIEWER read)

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/v1/plugins` | List + support matrix |
| GET | `/api/v1/plugins/{id}` | Get one |
| PATCH | `/api/v1/plugins/{id}` | `{ "enabled": true\|false }` |
| GET | `/api/v1/plugins/{id}/configs` | List `plugin_configs` |
| PUT | `/api/v1/plugins/{id}/configs/{key}` | `{ "value": <json> }` |
| DELETE | `/api/v1/plugins/{id}/configs/{key}` | Remove key |

Enable/disable triggers a controlled reload of in-process instances.

## Later (not v1)

- Wire notification providers into the dispatcher
- Merge detection-rule providers into the engine
- Data-source poll loops / agent collectors
- Optional subprocess isolation
- Signed release bundles beyond per-plugin manifests
