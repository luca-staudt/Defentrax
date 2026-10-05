# Multi-stage build for the Next.js operator UI (standalone output).
# Build context: sentinel/frontend/
# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
# Browser-facing WebSocket URL (baked into the client bundle).
ARG NEXT_PUBLIC_WS_URL=ws://localhost:8080
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
# Next.js rewrites bake API_PROXY_TARGET at build time. Default to the Compose
# service DNS name — 127.0.0.1 inside this container is the frontend itself.
ARG API_PROXY_TARGET=http://sentinel-api:8080
ENV API_PROXY_TARGET=$API_PROXY_TARGET
# Prefer classic Next production build inside images (smaller/more portable than turbopack).
RUN npx next build

FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -g 65532 -S sentinel \
    && adduser -u 65532 -S -G sentinel sentinel
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder --chown=65532:65532 /app/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/.next/static ./.next/static

USER 65532:65532
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok||r.status===307||r.status===308?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
