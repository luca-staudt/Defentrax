# Scripts

Development and release helper scripts. Repository-wide build/test/lint entry points live in the root `Makefile`:

```bash
make build   # go build ./... in sentinel/api
make test    # go test ./... in sentinel/api
make lint    # golangci-lint in sentinel/api
```
