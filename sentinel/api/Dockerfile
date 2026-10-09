# Multi-stage build for the Defentrax control-plane API.
# Build context: repository root (see docker-compose.yml).
# syntax=docker/dockerfile:1

FROM golang:1.27-alpine AS builder
RUN apk add --no-cache ca-certificates git
WORKDIR /src

COPY sentinel/api/go.mod sentinel/api/go.sum ./sentinel/api/
COPY sentinel/pkg/event/go.mod ./sentinel/pkg/event/
COPY sentinel/pkg/version/go.mod ./sentinel/pkg/version/
COPY sentinel/detection/go.mod sentinel/detection/go.sum ./sentinel/detection/
COPY sentinel/plugins/go.mod ./sentinel/plugins/

WORKDIR /src/sentinel/api
RUN go mod download

WORKDIR /src
COPY VERSION ./VERSION
COPY sentinel/api/ ./sentinel/api/
COPY sentinel/pkg/ ./sentinel/pkg/
COPY sentinel/detection/ ./sentinel/detection/
COPY sentinel/plugins/ ./sentinel/plugins/
COPY sentinel/rules/ ./sentinel/rules/

WORKDIR /src/sentinel/api
ARG SENTINEL_VERSION=
RUN VER="${SENTINEL_VERSION:-$(tr -d '[:space:]' < /src/VERSION)}" && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath \
      -ldflags="-s -w -X github.com/luca-staudt/Defentrax/sentinel/pkg/version.buildVersion=${VER}" \
      -o /out/sentinel-api ./cmd/api

FROM alpine:3.22 AS runtime
RUN apk add --no-cache ca-certificates tzdata wget \
    && addgroup -g 65532 -S sentinel \
    && adduser -u 65532 -S -G sentinel -H -s /sbin/nologin sentinel \
    && mkdir -p /opt/sentinel/rules /opt/sentinel/plugins/examples \
    && chown -R sentinel:sentinel /opt/sentinel

COPY --from=builder /out/sentinel-api /usr/local/bin/sentinel-api
COPY --from=builder --chown=sentinel:sentinel /src/sentinel/rules /opt/sentinel/rules
COPY --from=builder --chown=sentinel:sentinel /src/sentinel/plugins/examples /opt/sentinel/plugins/examples

USER 65532:65532
EXPOSE 8080
ENV APP_ENV=production \
    API_PORT=8080 \
    SENTINEL_RULES_PATH=/opt/sentinel/rules \
    SENTINEL_PLUGIN_DIR=/opt/sentinel/plugins/examples

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

ENTRYPOINT ["sentinel-api"]
