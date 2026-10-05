.PHONY: build test lint api-build api-test api-lint

API_DIR := sentinel/api

build: api-build

test: api-test

lint: api-lint

api-build:
	cd $(API_DIR) && go build ./...

api-test:
	cd $(API_DIR) && go test ./...

api-lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; see https://golangci-lint.run/welcome/install/"; exit 1; }
	cd $(API_DIR) && golangci-lint run ./...

run-api:
	cd $(API_DIR) && go run ./cmd/api
