# Sentinel Frontend

Next.js (App Router) operator UI — login, dashboard, alerts, events, servers, and rules.

## Prerequisites

- Node.js 20+
- Sentinel API running locally (default `http://127.0.0.1:8080`)
- PostgreSQL migrated and bootstrap admin configured on the API

## Configuration

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Purpose |
|----------|---------|
| `API_PROXY_TARGET` | Backend URL for Next.js rewrites (REST via same origin) |
| `NEXT_PUBLIC_WS_URL` | WebSocket base URL (direct to API, e.g. `ws://127.0.0.1:8080`) |

No secrets belong in the frontend bundle. Session cookies are HttpOnly and set by the API.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with your bootstrap admin credentials.

REST calls use `/api/v1/*` on the Next dev server and are proxied to the API. WebSockets connect to `NEXT_PUBLIC_WS_URL` with the session cookie (set `COOKIE_SECURE=false` on the API in local dev).

## Production build

```bash
npm run build
npm run start
```

## RBAC

Navigation and actions are hidden when the signed-in user lacks permissions. All enforcement remains on the API.
