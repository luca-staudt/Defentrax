# Helm charts for Sentinel

| Chart | Path | Status |
|-------|------|--------|
| **sentinel** | [`sentinel/`](sentinel/) | Phase 17 — full chart |

```bash
make helm-lint
helm upgrade --install sentinel ./sentinel \
  --namespace sentinel --create-namespace \
  -f /path/to/local-secrets.yaml   # do not commit
```

See [`sentinel/README.md`](sentinel/README.md) for values, hooks, and external DB notes.
