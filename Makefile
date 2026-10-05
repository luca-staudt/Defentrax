.PHONY: build test test-all test-ci lint api-build api-test api-lint api-test-integration agent-build agent-test detection-test plugins-test pkg-test db-migrate-up db-migrate-down db-migrate-status db-seed-dev db-test test-migrations run-api bootstrap-admin openapi-validate

API_DIR := sentinel/api
AGENT_DIR := sentinel/agent
DETECTION_DIR := sentinel/detection
PLUGINS_DIR := sentinel/plugins
DB_DIR := sentinel/database
PKG_DIR := sentinel/pkg/event

build: api-build agent-build

test: api-test agent-test detection-test plugins-test pkg-test db-test

test-all: test api-test-integration

test-ci: test openapi-validate

lint: api-lint

api-build:
	cd $(API_DIR) && go build ./...

api-test:
	cd $(API_DIR) && go test ./...

api-test-integration:
	cd $(API_DIR) && go test -tags=integration ./internal/integration/... ./internal/handlers/...

agent-build:
	cd $(AGENT_DIR) && go build ./...

agent-test:
	cd $(AGENT_DIR) && go test ./...

detection-test:
	cd $(DETECTION_DIR) && go test ./...

plugins-test:
	cd $(PLUGINS_DIR) && go test ./...

pkg-test:
	cd $(PKG_DIR) && go test ./...

api-lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; see https://golangci-lint.run/welcome/install/"; exit 1; }
	cd $(API_DIR) && golangci-lint run ./...

# Validate OpenAPI 3 when a linter is available (CI-friendly; skips cleanly if npx missing).
openapi-validate:
	@spec="$(API_DIR)/openapi/openapi.yaml"; \
	if command -v npx >/dev/null 2>&1; then \
	  npx --yes @redocly/cli@1.25.15 lint "$$spec" --skip-rule=no-unused-components || exit $$?; \
	elif command -v docker >/dev/null 2>&1; then \
	  docker run --rm -v "$(CURDIR)/$(API_DIR)/openapi:/spec" redocly/cli:1.25.15 lint /spec/openapi.yaml --skip-rule=no-unused-components || exit $$?; \
	else \
	  echo "openapi-validate: no npx/docker; running Go coverage test only"; \
	fi
	cd $(API_DIR) && go test ./openapi/ -count=1

db-migrate-up:
	@test -n "$$DATABASE_URL" || (echo "DATABASE_URL is required"; exit 1)
	cd $(DB_DIR) && go run ./cmd/migrate up

db-migrate-down:
	@test -n "$$DATABASE_URL" || (echo "DATABASE_URL is required"; exit 1)
	cd $(DB_DIR) && go run ./cmd/migrate down

db-migrate-status:
	@test -n "$$DATABASE_URL" || (echo "DATABASE_URL is required"; exit 1)
	cd $(DB_DIR) && go run ./cmd/migrate status

db-seed-dev:
	@test -n "$$DATABASE_URL" || (echo "DATABASE_URL is required"; exit 1)
	cd $(DB_DIR) && go run ./cmd/seed

db-test:
	cd $(DB_DIR) && go test -p 1 ./...

test-migrations:
	./sentinel/scripts/test-migrations.sh

run-api:
	cd $(API_DIR) && go run ./cmd/api

bootstrap-admin:
	@test -n "$$DATABASE_URL" || (echo "DATABASE_URL is required"; exit 1)
	cd $(API_DIR) && go run ./cmd/bootstrap-admin
