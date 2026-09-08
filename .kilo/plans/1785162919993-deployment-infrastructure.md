# FitMentor Deployment Infrastructure Plan

## Status (2026-08-15): ACTIVE — deployed

| Service | Tech | Deployment Target | URL |
|---|---|---|---|
| Frontend (web) | TanStack Start + React, TypeScript | Cloudflare Pages via wrangler | https://fitmentor-ey9.pages.dev |
| Backend API | Rust (Axum), PostgreSQL/Redis | AWS EC2 ap-south-2 (i-05ad79b24a9d8c331, t3.micro, EIP 40.192.40.60) via Docker Compose | https://40-192-40-60.sslip.io |
| WS/Gleam community | Gleam (mist) | Same EC2 instance (Docker) | /v1/community/* (same host) |
| Daily Planner | Python (FastAPI) | Same EC2 instance (Docker) | internal :8002 |
| TLS reverse proxy | Caddy | Same EC2 instance (Docker), Let's Encrypt for *.sslip.io | :443 |
| Session store | Cloudflare KV | fitmentor_sessions (id c365fd20f0a9408899b3a01024529941) | — |

## Architecture

- Frontend served as static assets on Cloudflare Pages, built via `vite build` with nitro/cloudflare-pages preset.
- Frontend server functions (TanStack Start) run on Cloudflare Workers at build time; browser-side code is static JS.
- Frontend server functions proxy API requests to the backend via `API_URL` (uses a fixed IP via sslip.io for security — hides the actual EC2 endpoint).
- Backend API is a Rust/Axum server on AWS EC2 ap-south-2, connecting to RDS PostgreSQL and ElastiCache Redis.
- Daily planner runs on the same EC2 instance, using Cloudflare AI for meal/workout plan generation with quota tracking in Redis.
- Ingest service runs on the same EC2 instance, ingesting content into Supermemory API with storage quotas in Redis.

## Deployment Workflow

### Frontend (Cloudflare Pages)

1. Build: `npm run build` in `ui/` (runs vite build + nitro prerender)
2. Deploy: `wrangler pages deploy dist --project-name fitmentor`
3. Credentials and state: `~/.wrangler/` contains KV namespace metadata, cache, and workflow state.
4. KV bindings: `fitmentor_sessions` (ID: `c365fd20f0a9408899b3a01024529941`) for session storage.
5. Wrangler config: `ui/wrangler.toml` defines KV namespace and AI binding.
6. Environment variables set in Cloudflare Pages (via API/wrangler, not in repo): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret), `SESSION_SECRET` (secret), `APP_URL`, `API_SHARED_SECRET` (secret), `API_URL`, `WS_URL`.
7. The `API_URL` env var points to the EC2 instance's sslip.io address (Caddy TLS termination).

### Backend (AWS EC2 ap-south-2)

1. Build: `docker compose -f docker-compose.prod.yml build` on the instance.
2. Deploy: docker compose `up -d`; Caddy terminates HTTPS with Let's Encrypt certs for `<ip>.sslip.io`.
3. Credentials: `~/.ssh/fitmentor-ec2.pem` (SSH port 22 is network-blocked from dev; use SSM Session Manager/Run Command on i-05ad79b24a9d8c331).
4. Infrastructure: Postgres 16 + Redis 7 run as containers on the box (not RDS/ElastiCache).
5. Environment variables (from `docker-compose.prod.yml`): `DATABASE_URL` (postgres container), `REDIS_URL` (redis container), `CF_ACCOUNT_ID`, `CF_API_TOKEN`, `API_SHARED_SECRET`, `SESSION_SECRET`, `APP_URL`, `API_URL`, `CORS_ORIGIN`, `SUPERMEMORY_API_KEY`.
6. OAuth: Google (web handles OAuth; API validates via shared secret + X-User-Id headers).

### Daily Planner & Ingest Services

Both run on the same EC2 instance as the backend API.

1. Daily Planner: `microservices/daily-planner/` — Python FastAPI, runs in `batch` mode (scheduled) or `http` mode (on demand). Uses Cloudflare AI for generation, Redis for quota tracking, PostgreSQL for plan storage.
2. Ingest Service: `apps/ingest-python/` — Python FastAPI, ingests content into Supermemory API, tracks storage quotas in Redis.
3. Both are built from their respective Dockerfiles and deployed alongside the backend API.

## Key Files

- `ui/wrangler.toml` — Cloudflare Pages config, KV/AI bindings
- `ui/.wrangler/state/v3/` — Local wrangler state (KV, cache, workflows)
- `ui/dist/` — Built frontend assets
- `api/` — Go server source (rewritten from Rust Axum)
- `realtime/` — Gleam WebSocket service (not currently deployed via Fly.io)
- `microservices/daily-planner/` — Python daily planner
- `apps/ingest-python/` — Python ingest service
- `docker-compose.yml` — Dev Docker Compose (local Redis, API, WS, ingest, planner, TigerBeetle)
- `docker-compose.prod.yml` — Production Docker Compose (RDS, Cloudflare env vars)

## Credential Locations

- `~/.wrangler/` — Cloudflare wrangler state (KV, cache data, session metadata, workflows)
- `~/.aws/` — AWS credentials for EC2 SSH access (RDS, ElastiCache, EC2)

## Open Issues / Risks

1. **t3.micro (1GB RAM)**: Rust Docker build is slow (~1.5 min cached) and needs the 4GB swapfile on the box to avoid OOM. Consider t3.medium for headroom.
2. **sslip.io TLS**: Caddy auto-renews Let's Encrypt certs for `40-192-40-60.sslip.io`. If the EIP changes, the cert + URL must be updated.
3. **No CI/CD**: Deployment is manual (build on box + wrangler deploy).
4. **Google OAuth redirect**: Google Console OAuth client must allow `https://fitmentor-ey9.pages.dev/auth/google/callback`.
5. **WS auth quirk**: Gleam WS community endpoint requires an `Authorization` header present (even for the shared-secret path); web `community-proxy.ts` sends only `X-Api-Key` + `X-User-Id`, so community calls would 401. Community page is currently "coming soon".
6. **R2 community media**: `R2_HOST`/`R2_BUCKET` configured for `fitmentor-media`, but that bucket may not exist yet in R2.
7. **Missing tables fix**: `run_migrations` in `main.rs` doesn't apply `migrations/*.sql`; the missing tables (users, profiles, subscriptions, daily_logs, workout_completions, coach_logs) were applied manually to the fresh Postgres.
8. **Stale coach_logs DELETE removed**: `main.rs` previously crashed on fresh DBs (`DELETE FROM coach_logs WHERE messages...` references a column dropped by migration 007); removed.