.PHONY: build test test-all test-ci fmt-check lint frontend-lint frontend-build api-build api-test api-lint api-test-integration agent-build agent-test detection-test plugins-test pkg-test version-test db-migrate-up db-migrate-down db-migrate-status db-seed-dev db-test test-migrations run-api bootstrap-admin openapi-validate compose-up compose-down compose-config k8s-dry-run helm-lint security-gitleaks security-gosec release-check release-sbom-local

API_DIR := sentinel/api
AGENT_DIR := sentinel/agent
DETECTION_DIR := sentinel/detection
PLUGINS_DIR := sentinel/plugins
DB_DIR := sentinel/database
PKG_DIR := sentinel/pkg/event
VERSION_DIR := sentinel/pkg/version
FRONTEND_DIR := sentinel/frontend
VERSION_FILE := VERSION
VERSION := $(shell tr -d '[:space:]' < $(VERSION_FILE) 2>/dev/null)
VERSION_LDFLAGS := -X github.com/luca-staudt/Defentrax/sentinel/pkg/version.buildVersion=$(VERSION)

build: api-build agent-build

test: api-test agent-test detection-test plugins-test pkg-test version-test db-test

test-all: test api-test-integration

test-ci: test openapi-validate release-check

version-test:
	cd $(VERSION_DIR) && go test ./...

release-check:
	./sentinel/scripts/release-check.sh

release-sbom-local:
	./sentinel/scripts/release-sbom-local.sh ./dist/sbom


# Fail if any Go file differs from gofmt (CI Formatting job).
fmt-check:
	@unformatted=$$(find sentinel -name '*.go' -not -path '*/vendor/*' -print0 | xargs -0 gofmt -l); \
	if [ -n "$$unformatted" ]; then \
	  echo "gofmt needed on:"; echo "$$unformatted"; exit 1; \
	fi
	@echo "fmt-check: OK"

lint: api-lint

frontend-lint:
	cd $(FRONTEND_DIR) && npm run lint

frontend-build:
	cd $(FRONTEND_DIR) && npx next build

api-build:
	cd $(API_DIR) && go build -ldflags="$(VERSION_LDFLAGS)" ./...

api-test:
	cd $(API_DIR) && go test ./...

api-test-integration:
	cd $(API_DIR) && go test -p 1 -tags=integration ./internal/integration/... ./internal/handlers/...

agent-build:
	cd $(AGENT_DIR) && go build -ldflags="$(VERSION_LDFLAGS)" ./...

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

compose-config:
	docker compose config -q

compose-up:
	docker compose up -d --build

compose-down:
	docker compose down

K8S_DIR := sentinel/deployments/kubernetes
HELM_CHART := sentinel/deployments/helm/sentinel
HELM_LINT_VALUES := $(HELM_CHART)/ci/lint-values.yaml

k8s-dry-run:
	@command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required for k8s-dry-run"; exit 1; }
	@if command -v kubeconform >/dev/null 2>&1; then \
	  kubectl kustomize $(K8S_DIR) | kubeconform -strict -summary; \
	else \
	  kubectl kustomize $(K8S_DIR) >/dev/null; \
	  echo "k8s-dry-run: kubectl kustomize OK (install kubeconform for schema checks)"; \
	fi
	@if kubectl cluster-info >/dev/null 2>&1; then \
	  kubectl apply -k $(K8S_DIR) --dry-run=client; \
	else \
	  echo "k8s-dry-run: no kube-apiserver — skip kubectl apply --dry-run=client"; \
	  echo "(connect a cluster to also run: kubectl apply -k $(K8S_DIR) --dry-run=client)"; \
	fi

helm-lint:
	@command -v helm >/dev/null 2>&1 || { echo "helm is required for helm-lint"; exit 1; }
	helm lint $(HELM_CHART) -f $(HELM_LINT_VALUES)
	helm template sentinel $(HELM_CHART) -f $(HELM_LINT_VALUES) >/dev/null
	@echo "helm-lint: OK (lint + template)"

security-gitleaks:
	@command -v gitleaks >/dev/null 2>&1 || { echo "gitleaks is required: https://github.com/gitleaks/gitleaks"; exit 1; }
	gitleaks detect --source . --config .gitleaks.toml --verbose --redact

security-gosec:
	@command -v gosec >/dev/null 2>&1 || { echo "gosec is required: go install github.com/securego/gosec/v2/cmd/gosec@latest"; exit 1; }
	@for mod in api agent database detection plugins; do \
	  echo "==> gosec -severity=medium sentinel/$$mod"; \
	  (cd sentinel/$$mod && gosec -quiet -severity=medium ./...) || exit $$?; \
	done
	@echo "security-gosec: OK"
