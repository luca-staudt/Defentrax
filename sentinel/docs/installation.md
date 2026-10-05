# Installation (Docker Compose)

Schnellster Weg für lokale Entwicklung und kleine Self-Host-Setups.

## Voraussetzungen

- Docker Engine 24+ mit Compose Plugin (`docker compose version`)
- Ausreichend RAM (≥ 2 GB empfohlen für den Stack)
- Offene Host-Ports (Standard: `3000` UI, `8080` API)

## 1. Repository und `.env`

```bash
git clone https://github.com/luca-staudt/Sentinel.git
cd Sentinel
cp .env.example .env
```

Pflichtwerte in `.env` setzen (keine Secrets committen):

```bash
# PostgreSQL
openssl rand -base64 24   # → POSTGRES_PASSWORD=

# API-Sessions / Crypto (jeweils 32 Byte, base64)
openssl rand -base64 32   # → SESSION_SECRET=
openssl rand -base64 32   # → TOTP_ENCRYPTION_KEY=
# optional, sonst Fallback auf TOTP_ENCRYPTION_KEY:
openssl rand -base64 32   # → SECRETS_ENCRYPTION_KEY=
```

Für den ersten Admin (einmalig, wenn die `users`-Tabelle leer ist):

```bash
# in .env
SENTINEL_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
SENTINEL_BOOTSTRAP_ADMIN_PASSWORD='choose-a-long-password'
```

Lokales HTTP: `COOKIE_SECURE=false` und `CORS_ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000` (bereits in `.env.example`).

## 2. Stack starten

```bash
docker compose up -d --build
```

Services: `postgres`, `redis`, `migrate` (einmalig), `sentinel-api`, `sentinel-frontend`.

UI: [http://localhost:3000](http://localhost:3000)  
API Health: `curl -s http://localhost:8080/healthz` · Ready: `curl -s http://localhost:8080/readyz`

## 3. Development-Overlay (optional)

Postgres/Redis auf dem Host exponieren und Rules bind-mounten:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

## 4. Optionale Profile

```bash
# Agent (benötigt SENTINEL_ENROLLMENT_TOKEN in .env)
docker compose --profile agent up -d --build

# Caddy Reverse-Proxy auf Port 80
docker compose --profile proxy up -d --build
```

Mit Proxy: UI unter `http://localhost`, API unter `http://localhost/api/…`.  
`NEXT_PUBLIC_WS_URL` dann z. B. auf `ws://localhost` setzen und Frontend-Image neu bauen.

## 5. Stoppen / Daten

```bash
docker compose down          # Container weg, Volumes behalten
docker compose down -v       # inkl. Postgres-/Redis-Volumes (Datenverlust)
```

Postgres-Daten liegen im named Volume `sentinel-postgres-data` (siehe [deployment.md](deployment.md)).

## Ohne Docker

Go 1.22+, Node 20+, lokales PostgreSQL — siehe Root-[`README.md`](../../README.md) und [`frontend/README.md`](../frontend/README.md).
