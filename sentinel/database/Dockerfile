# Multi-stage build for goose migrations (one-shot compose service).
# Build context: repository root.
# syntax=docker/dockerfile:1

FROM golang:1.27-alpine AS builder
RUN apk add --no-cache ca-certificates git
WORKDIR /src

COPY sentinel/database/go.mod sentinel/database/go.sum ./sentinel/database/
WORKDIR /src/sentinel/database
RUN go mod download

WORKDIR /src
COPY sentinel/database/ ./sentinel/database/

WORKDIR /src/sentinel/database
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" -o /out/migrate ./cmd/migrate

FROM alpine:3.22 AS runtime
RUN apk add --no-cache ca-certificates \
    && addgroup -g 65532 -S sentinel \
    && adduser -u 65532 -S -G sentinel -H -s /sbin/nologin sentinel

COPY --from=builder /out/migrate /usr/local/bin/migrate
COPY sentinel/database/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh

USER 65532:65532
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["up"]
