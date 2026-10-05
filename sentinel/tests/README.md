# Cross-module tests

Most tests live next to the code they exercise (`sentinel/api/...`, `sentinel/agent/...`, etc.).

**Phase 14:** See [`sentinel/docs/testing.md`](../docs/testing.md) for the full test matrix, required services, and CI entry points (`make test`, `make api-test-integration`, scripts under `sentinel/scripts/`).

Integration tests that span API + PostgreSQL use the Go build tag `integration` and shared helpers in `sentinel/api/internal/testutil`.
