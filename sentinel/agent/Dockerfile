# Multi-stage build for the Defentrax host agent.
# Build context: repository root.
# syntax=docker/dockerfile:1

FROM golang:1.27-alpine AS builder
RUN apk add --no-cache ca-certificates git
WORKDIR /src

COPY sentinel/agent/go.mod sentinel/agent/go.sum ./sentinel/agent/
COPY sentinel/pkg/event/go.mod ./sentinel/pkg/event/
COPY sentinel/pkg/version/go.mod ./sentinel/pkg/version/

WORKDIR /src/sentinel/agent
RUN go mod download

WORKDIR /src
COPY VERSION ./VERSION
COPY sentinel/agent/ ./sentinel/agent/
COPY sentinel/pkg/ ./sentinel/pkg/

WORKDIR /src/sentinel/agent
ARG SENTINEL_VERSION=
RUN VER="${SENTINEL_VERSION:-$(tr -d '[:space:]' < /src/VERSION)}" && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath \
      -ldflags="-s -w -X github.com/luca-staudt/Defentrax/sentinel/pkg/version.buildVersion=${VER}" \
      -o /out/sentinel-agent ./cmd/sentinel-agent

FROM alpine:3.22 AS runtime
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g 65532 -S sentinel \
    && adduser -u 65532 -S -G sentinel -H -s /sbin/nologin sentinel \
    && mkdir -p /var/lib/sentinel \
    && chown sentinel:sentinel /var/lib/sentinel

COPY --from=builder /out/sentinel-agent /usr/local/bin/sentinel-agent

USER 65532:65532
ENV SENTINEL_AGENT_CREDENTIAL_PATH=/var/lib/sentinel/credentials.json
VOLUME ["/var/lib/sentinel"]

# Agent has no HTTP listener; process liveness only.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
    CMD pidof sentinel-agent >/dev/null || exit 1

ENTRYPOINT ["sentinel-agent"]
