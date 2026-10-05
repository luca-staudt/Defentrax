.PHONY: build test lint api-build api-test api-lint db-migrate-up db-migrate-down db-migrate-status db-seed-dev db-test test-migrations run-api

API_DIR := sentinel/api
DB_DIR := sentinel/database

build: api-build

test: api-test db-test

lint: api-lint

api-build:
	cd $(API_DIR) && go build ./...

api-test:
	cd $(API_DIR) && go test ./...

api-lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; see https://golangci-lint.run/welcome/install/"; exit 1; }
	cd $(API_DIR) && golangci-lint run ./...

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
