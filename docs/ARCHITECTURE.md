# FitMentor — Complete Backend Architecture

> Single source of truth. Every decision, every schema, every endpoint.
> Learning project — full Discord-style multi-service architecture.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Topology](#2-service-topology)
3. [Database Schemas](#3-database-schemas)
4. [Redis Data Structures](#4-redis-data-structures)
5. [Authentication Flow](#5-authentication-flow)
6. [REST API Specification](#6-rest-api-specification)
7. [WebSocket Protocol](#7-websocket-protocol)
8. [Payment Flow (Polar.sh)](#8-payment-flow-polarsh)
9. [AI Coach Flow (Supermemory)](#9-ai-coach-flow-supermemory)
10. [Service Communication](#10-service-communication)
11. [Deployment Architecture](#11-deployment-architecture)
12. [Environment Variables](#12-environment-variables)
13. [Error Handling](#13-error-handling)
14. [Migration Plan](#14-migration-plan)
15. [Directory Structure](#15-directory-structure)
16. [Tech Stack Reference](#16-tech-stack-reference)

---

## 1. System Overview

FitMentor is a fitness app with a Discord-style multi-database architecture. Each database handles what it's best at. Frontend stays on TanStack Start (Cloudflare Pages). Backend is Rust (Axum) for business logic + Gleam (Mist) for realtime WebSockets.

### Design Principles

- **Right tool for the job** — each database handles what it's best at
- **Gradual migration** — TanStack Start proxies to Rust API during transition
- **Type safety end-to-end** — Rust types ↔ JSON schema ↔ TypeScript types
- **Learn by building** — every service teaches a real-world pattern

---

## 2. Service Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Cloudflare                                                             │
│  ├── Pages: Frontend (TanStack Start static build)                      │
│  ├── Access: Zero Trust Auth (OIDC) → JWT in Cf-Access-Jwt-Assertion  │
│  ├── D1: User auth data, sessions, rate limit counters                  │
│  ├── KV: Cache (meal plans, workout templates), feature flags           │
│  └── R2: User-uploaded images (progress photos, if added later)         │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
              ┌────────────┼────────────────┐
              ▼            ▼                ▼
    ┌──────────────┐ ┌──────────┐   ┌──────────────┐
    │  Rust (Axum) │ │  Gleam   │   │ TigerBeetle  │
    │  REST API    │◄►│  (Mist)  │   │ (Ledger)     │
    │  :3000       │ │  :8080   │   │ :3001        │
    └──────┬───────┘ └────┬─────┘   └──────┬───────┘
           │              │                │
    ┌──────┴──────┬───────┴───────┐        │
    ▼             ▼               ▼        ▼
┌────────┐ ┌──────────┐  ┌──────────┐  ┌────────────┐
│ Redis  │ │PostgreSQL│  │ MongoDB  │  │ Polar.sh   │
│ :6379  │ │ :5432    │  │ :27017   │  │ (external) │
└────────┘ └──────────┘  └──────────┘  └────────────┘
                                  │
                           ┌──────┴──────┐
                           ▼             ▼
                     ┌──────────┐  ┌───────────┐
                     │Supermemory│  │ LLM API   │
                     │ (RAG)     │  │ (OpenAI)  │
                     └──────────┘  └───────────┘
```

### Service Responsibilities

| Service | Language | Port | Role |
|---------|----------|------|------|
| **Rust API** | Rust (Axum) | 3000 | REST endpoints, business logic, Polar.sh webhooks, auth validation, DB writes, Redis caching, LLM streaming |
| **Gleam WS** | Gleam (Mist) | 8080 | WebSocket gateway, realtime broadcast, Redis Pub/Sub consumer, client connection management |
| **TigerBeetle** | — | 3001 | Payment ledger (double-entry accounting for Polar.sh events) |
| **Redis** | — | 6379 | Cache, Pub/Sub (Rust ↔ Gleam), session store, rate limits |
| **PostgreSQL** | — | 5432 | Relational data: users, profiles, subscriptions, daily_logs, workout_completions |
| **MongoDB** | — | 27017 | Document data: community_posts, coach_conversations, analytics_events |
| **Cloudflare D1** | — | — | Auth tokens, session validation, rate limit counters |
| **Cloudflare KV** | — | — | Feature flags, cached static data (meal plans, workout templates) |
| **Supermemory** | — | — | RAG index for AI coach (user context, conversation history) |
| **Polar.sh** | — | — | Checkout, subscriptions, billing, webhooks |

---

## 3. Database Schemas

### 3.1 PostgreSQL — Relational Data

#### `users` table

```sql
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cf_access_sub   TEXT UNIQUE NOT NULL,      -- Cloudflare Access "sub" claim
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL DEFAULT 'Friend',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_cf_access_sub ON users(cf_access_sub);
CREATE INDEX idx_users_email ON users(email);
```

#### `profiles` table

```sql
CREATE TABLE profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL DEFAULT 'Friend',
    age               SMALLINT NOT NULL DEFAULT 22,
    gender            TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female', 'other')),
    height_cm         SMALLINT NOT NULL DEFAULT 170,
    weight_kg         SMALLINT NOT NULL DEFAULT 65,
    goal              TEXT NOT NULL DEFAULT 'muscle_gain' CHECK (goal IN ('fat_loss', 'muscle_gain', 'strength', 'recomp', 'general')),
    place             TEXT NOT NULL DEFAULT 'gym' CHECK (place IN ('gym', 'home')),
    experience        TEXT NOT NULL DEFAULT 'beginner' CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
    diet              TEXT NOT NULL DEFAULT 'veg' CHECK (diet IN ('veg', 'nonveg', 'egg')),
    days_per_week     SMALLINT NOT NULL DEFAULT 4 CHECK (days_per_week BETWEEN 2 AND 6),
    budget_per_day    SMALLINT NOT NULL DEFAULT 150,  -- INR
    health_conditions TEXT[] NOT NULL DEFAULT '{}',
    custom_protein_g  SMALLINT,                        -- override protein target (NULL = auto)
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
```

#### `subscriptions` table

```sql
CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    polar_sub_id          TEXT UNIQUE NOT NULL,           -- Polar.sh subscription ID
    polar_product_id      TEXT NOT NULL,                  -- Polar.sh product ID
    polar_price_id        TEXT NOT NULL,                  -- Polar.sh price ID
    tier                  TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium', 'pro')),
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'revoked')),
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_polar_sub_id ON subscriptions(polar_sub_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

#### `daily_logs` table

```sql
CREATE TABLE daily_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE NOT NULL,                     -- YYYY-MM-DD, unique per user
    water         SMALLINT NOT NULL DEFAULT 0,       -- glasses
    sleep         SMALLINT NOT NULL DEFAULT 0,       -- hours (integer, e.g. 7 = 7h)
    steps         INTEGER NOT NULL DEFAULT 0,
    protein_g     SMALLINT NOT NULL DEFAULT 0,
    workout_done  BOOLEAN NOT NULL DEFAULT FALSE,
    weight_kg     REAL,                              -- optional daily weight
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, date)
);

CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, date DESC);
CREATE INDEX idx_daily_logs_user_recent ON daily_logs(user_id, date DESC)
    INCLUDE (water, sleep, steps, protein_g, workout_done, weight_kg);
```

#### `workout_completions` table

```sql
CREATE TABLE workout_completions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    day_index     SMALLINT NOT NULL,                   -- which day in the plan (0-based)
    title         TEXT NOT NULL,                       -- "Push Day", "Full Body A"
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, date, day_index)
);

CREATE INDEX idx_workout_completions_user_date ON workout_completions(user_id, date DESC);
```

### 3.2 MongoDB — Document Data

#### `community_posts` collection

```json
{
  "_id": "ObjectId",
  "id": "uuid-string",
  "user_id": "uuid-string",
  "author_name": "string",
  "text": "string",
  "likes": 0,
  "liked_by": ["user_id_1", "user_id_2"],
  "replies": [
    {
      "id": "uuid-string",
      "user_id": "uuid-string",
      "author_name": "string",
      "text": "string",
      "created_at": "2026-07-20T10:30:00Z"
    }
  ],
  "created_at": "2026-07-20T10:30:00Z",
  "updated_at": "2026-07-20T10:30:00Z"
}
```

**Indexes:**
```javascript
db.community_posts.createIndex({ "created_at": -1 })
db.community_posts.createIndex({ "user_id": 1, "created_at": -1 })
```

#### `coach_conversations` collection

```json
{
  "_id": "ObjectId",
  "id": "uuid-string",
  "user_id": "uuid-string",
  "session_id": "uuid-string",
  "messages": [
    {
      "role": "user",
      "content": "string",
      "timestamp": "2026-07-20T10:30:00Z"
    },
    {
      "role": "assistant",
      "content": "string",
      "timestamp": "2026-07-20T10:30:05Z"
    }
  ],
  "created_at": "2026-07-20T10:30:00Z",
  "updated_at": "2026-07-20T10:35:00Z"
}
```

**Indexes:**
```javascript
db.coach_conversations.createIndex({ "user_id": 1, "created_at": -1 })
db.coach_conversations.createIndex({ "session_id": 1 }, { unique: true })
```

#### `analytics_events` collection

```json
{
  "_id": "ObjectId",
  "user_id": "uuid-string",
  "event": "string",
  "properties": {},
  "created_at": "2026-07-20T10:30:00Z"
}
```

**Indexes:**
```javascript
db.analytics_events.createIndex({ "user_id": 1, "created_at": -1 })
db.analytics_events.createIndex({ "event": 1, "created_at": -1 })
```

### 3.3 Cloudflare D1 — Auth & Sessions

```sql
CREATE TABLE sessions (
    user_id       TEXT PRIMARY KEY,                  -- Cloudflare Access "sub"
    email         TEXT NOT NULL,
    cf_access_jwt TEXT NOT NULL,                     -- cached JWT for validation
    last_seen_at  TEXT NOT NULL,                     -- ISO timestamp
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE rate_limits (
    key           TEXT PRIMARY KEY,                  -- "ip:1.2.3.4" or "user:uuid"
    count         INTEGER NOT NULL DEFAULT 1,
    window_start  TEXT NOT NULL                      -- ISO timestamp of window start
);
```

### 3.4 TigerBeetle — Payment Ledger

#### Account Codes (u16)

| Code | Name | Description |
|------|------|-------------|
| 1000 | UserWallet | User's wallet balance (credits) |
| 2000 | RevenueAccount | Revenue from subscriptions |
| 2001 | PolarSettlement | Polar.sh settlement account |
| 3000 | TaxLiability | Tax collected (VAT/GST) |
| 4000 | RefundLiability | Refund reserves |

#### Ledger IDs (u32)

| Ledger | Currency | Description |
|--------|----------|-------------|
| 1 | INR | Indian Rupee transactions |
| 2 | USD | US Dollar transactions (Polar.sh base) |

#### Account Structure

Each Polar.sh customer gets:
- **1 debit account** (code 1000, ledger matches currency)
- Linked via `user_data_128` = hash of user_id for querying

#### Transfer Codes (u16)

| Code | Name | Trigger |
|------|------|---------|
| 1 | SubscriptionPayment | `order.paid` webhook |
| 2 | SubscriptionRenewal | `order.paid` with `billing_reason=subscription_cycle` |
| 3 | Refund | `refund.created` webhook |
| 4 | SubscriptionActivation | `subscription.active` webhook |
| 5 | SubscriptionCancellation | `subscription.canceled` webhook |

#### Transfer Pattern

```rust
// When Polar.sh order.paid fires:
let transfer = Transfer {
    id: tb_rs::id(),
    debit_account_id: polar_settlement_account,   // Polar pays
    credit_account_id: user_wallet_account,        // User receives
    amount: order.amount,                          // in cents
    ledger: 1,                                     // INR
    code: 1,                                       // SubscriptionPayment
    user_data_128: user_hash,                      // for querying
    user_data_64: order.timestamp,                 // for time-range queries
    ..Default::default()
};
client.create_transfers(&[transfer]).await?;
```

### 3.5 Cloudflare KV — Cache & Config

| Key Pattern | Value | TTL | Purpose |
|-------------|-------|-----|---------|
| `cache:meal_plans:{diet}` | JSON array | 24h | Cached meal plan data |
| `cache:workout_templates:{place}` | JSON array | 24h | Cached workout templates |
| `cache:exercise_library` | JSON array | 7d | Cached exercise library |
| `flags:{feature_name}` | `"true"` or `"false"` | 5m | Feature flags |
| `config:app` | JSON config | 1h | App-wide configuration |

---

## 4. Redis Data Structures

### 4.1 Cache Keys

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `cache:user:{user_id}` | String (JSON) | 5min | User profile + targets cache |
| `cache:profile:{user_id}` | String (JSON) | 5min | Profile data cache |
| `cache:streak:{user_id}` | String (int) | 1min | Current streak count |
| `cache:today:{user_id}` | String (JSON) | 30s | Today's daily log |

### 4.2 Rate Limiting

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `ratelimit:api:{ip}` | String (counter) | 60s | API rate limit per IP |
| `ratelimit:coach:{user_id}` | String (counter) | 60s | AI coach rate limit per user |
| `ratelimit:payment:{user_id}` | String (counter) | 300s | Payment action rate limit |

### 4.3 Pub/Sub Channels

| Channel | Publisher | Subscriber | Message Format |
|---------|-----------|------------|----------------|
| `ws:broadcast:{user_id}` | Rust | Gleam | `{"type": "habit_sync", "data": {...}}` |
| `ws:community` | Rust | Gleam | `{"type": "new_post", "data": {...}}` |
| `ws:presence` | Gleam | Gleam | `{"user_id": "...", "online": true}` |
| `ws:coach:{user_id}` | Rust | Gleam | `{"type": "coach_chunk", "content": "..."}` |

### 4.4 Session Store

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `session:{cf_sub}` | String (JSON) | 24h | Active session data |
| `session:{cf_sub}:last_active` | String (timestamp) | 24h | Last activity for idle detection |

### 4.5 Presence (Gleam-managed)

| Key | Type | TTL | Purpose |
|-----|------|-----|---------|
| `presence:ws:{user_id}` | String (Gleam instance ID) | 60s (heartbeat) | WebSocket connection presence |
| `presence:online` | Set | — | Set of currently online user IDs |

---

## 5. Authentication Flow

### 5.1 Cloudflare Access Auth

```
User → Cloudflare Access → IdP (Google/GitHub) → Cloudflare issues JWT
    ↓
Frontend receives JWT in Cf-Access-Jwt-Assertion header
    ↓
Frontend sends JWT as Authorization: Bearer <jwt> to Rust API
    ↓
Rust validates JWT:
  1. Fetch JWKS from https://<team>.cloudflareaccess.com/cdn-cgi/access/certs
  2. Cache JWKS (refresh every 6 hours)
  3. Match kid header to JWKS key
  4. Verify RS256 signature
  5. Validate iss, aud, exp claims
    ↓
Rust extracts: sub (user ID), email, groups
    ↓
Upsert user in PostgreSQL (users table)
    ↓
Create/update session in Redis
    ↓
Return response with user data
```

### 5.2 Auth Middleware (Axum)

```rust
struct AuthUser {
    pub user_id: String,   // Cloudflare Access "sub"
    pub email: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AuthError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts.headers
            .get("cf-access-jwt-assertion")
            .or_else(|| parts.headers.get("authorization"))
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer ").or(Some(s)))
            .ok_or(AuthError::MissingToken)?;

        let claims = state.jwt_validator.validate(token).await?;
        Ok(AuthUser {
            user_id: claims.sub,
            email: claims.email,
        })
    }
}
```

### 5.3 User Auto-Provisioning

When a new user authenticates for the first time:
1. Check if `users.cf_access_sub` exists
2. If not, INSERT into `users` with cf_access_sub, email
3. Create empty `profiles` row with defaults
4. Return user + profile to frontend

---

## 6. REST API Specification

**Base URL:** `https://api.fitmentor.app/v1`

### 6.1 Health

```
GET /v1/health
→ 200 { "status": "ok", "version": "1.0.0" }
```

### 6.2 User & Profile

```
GET /v1/user/me
→ 200 { user: { id, email, name, created_at }, profile: { ... } }

PUT /v1/user/profile
Body: { name, age, gender, heightCm, weightKg, goal, place, experience, diet, daysPerWeek, budgetPerDay, healthConditions }
→ 200 { profile: { ... } }

PUT /v1/user/profile/protein-target
Body: { proteinG: number | null }
→ 200 { customProteinG: number | null }
```

### 6.3 Daily Logs (Habits)

```
GET /v1/logs/today
→ 200 { log: { date, water, sleep, steps, proteinG, workoutDone, weightKg } }

PUT /v1/logs/today
Body: { water?, sleep?, steps?, proteinG?, workoutDone?, weightKg? }
→ 200 { log: { ... } }

GET /v1/logs?from=2026-07-13&to=2026-07-20
→ 200 { logs: [{ date, water, sleep, steps, proteinG, workoutDone, weightKg }] }

GET /v1/logs/streak
→ 200 { streak: number }
```

### 6.4 Workouts

```
GET /v1/workouts/plan
→ 200 { plan: [{ title, focus, exercises: [{ name, sets, reps, rest, muscles, tips, alt }] }] }

GET /v1/workouts/library
→ 200 { exercises: [{ name, emoji, muscles, tips, mistakes }] }

GET /v1/workouts/library/:name
→ 200 { exercise: { name, emoji, muscles, tips, mistakes } }
```

### 6.5 Nutrition

```
GET /v1/nutrition/plans
→ 200 { plans: [{ id, title, budgetPerDay, diet, meals: [{ name, items, kcal, protein }] }] }

GET /v1/nutrition/foods
→ 200 { foods: [{ name, kcal, protein }] }

GET /v1/nutrition/targets
→ 200 { calories, protein, carbs, fat, tdee, effectiveProtein }
```

### 6.6 AI Coach

```
POST /v1/coach/chat
Body: { messages: [{ role: "user"|"assistant", content: string }], sessionId?: string }
→ 200 { reply: string, sessionId: string }
(Also streams via WebSocket — see Section 7)
```

### 6.7 Progress

```
GET /v1/progress/summary
→ 200 { streak, workoutsThisWeek, last7Logs: [...] }

GET /v1/progress/charts
→ 200 { weightSeries: [{ d, w }], proteinSeries: [{ d, p }] }
```

### 6.8 Community

```
GET /v1/community/posts?limit=20&cursor=<last_post_id>
→ 200 { posts: [...], nextCursor: string | null }

POST /v1/community/posts
Body: { text: string }
→ 201 { post: { id, authorName, text, likes, replies, createdAt } }

POST /v1/community/posts/:id/like
→ 200 { likes: number, liked: boolean }

POST /v1/community/posts/:id/reply
Body: { text: string }
→ 201 { reply: { id, authorName, text, createdAt } }
```

### 6.9 Subscription & Payment

```
POST /v1/subscriptions/checkout
Body: { tier: "premium" | "pro" }
→ 200 { checkoutUrl: string }

GET /v1/subscriptions/current
→ 200 { subscription: { tier, status, currentPeriodEnd, cancelAtPeriodEnd } | null }

DELETE /v1/subscriptions
→ 200 { message: "Subscription canceled" }

GET /v1/subscriptions/portal
→ 200 { portalUrl: string }
```

### 6.10 Polar.sh Webhook

```
POST /v1/webhooks/polar
Headers: webhook-id, webhook-timestamp, webhook-signature
Body: Polar.sh event payload
→ 200 "ok"

Handled events:
  - order.paid          → Create TigerBeetle transfer, update subscription
  - subscription.active → Update subscription status
  - subscription.canceled → Schedule cancellation
  - subscription.revoked  → Revoke subscription
  - subscription.past_due → Mark subscription past due
  - checkout.updated    → Track checkout progress
```

### 6.11 Tools

```
GET /v1/tools/bmi?weight=65&height=170
→ 200 { bmi: 22.5, category: "Normal", advice: "..." }

GET /v1/tools/calorie-timeline?deficit=400&weeks=12
→ 200 { projectedWeightLoss: "...", projectedWeightGain: "...", ... }
```

### 6.12 API Response Envelope

All successful responses:
```json
{ "data": { ... } }
```

All error responses:
```json
{ "error": { "code": "not_found", "message": "Resource not found" } }
```

---

## 7. WebSocket Protocol

**Gleam WS Server:** `wss://ws.fitmentor.app`
**Connection:** Upgrade from HTTP with `Authorization: Bearer <cf_access_jwt>`

### 7.1 Connection Flow

```
Client → WS Upgrade to wss://ws.fitmentor.app
  Headers: Authorization: Bearer <jwt>
  Query: ?channel=habits&channel=community&channel=coach
    ↓
Gleam validates JWT (fetches JWKS, caches)
    ↓
Gleam registers client in presence set (Redis)
    ↓
Gleam subscribes to Redis Pub/Sub channels
    ↓
Connection established → { "type": "connected", "userId": "..." }
```

### 7.2 Client → Server Messages

```json
{ "type": "subscribe", "channels": ["habits", "community"] }
{ "type": "unsubscribe", "channels": ["community"] }
{ "type": "ping" }
{ "type": "presence", "status": "online" }
```

### 7.3 Server → Client Messages

```json
{ "type": "connected", "userId": "user_uuid", "serverTime": "2026-07-20T10:30:00Z" }
{ "type": "pong" }

{ "type": "habit_sync", "data": { "date": "2026-07-20", "water": 5, "proteinG": 80, "workoutDone": true } }

{ "type": "coach_chunk", "sessionId": "...", "content": "Here's your plan...", "done": false }
{ "type": "coach_done", "sessionId": "...", "fullContent": "complete response" }

{ "type": "community_post", "data": { "id": "...", "authorName": "Alice", "text": "PR!", "likes": 0, "createdAt": "..." } }
{ "type": "community_like", "data": { "postId": "...", "likes": 15, "liked": true } }
{ "type": "community_reply", "data": { "postId": "...", "reply": { "id": "...", "authorName": "Bob", "text": "Nice!", "createdAt": "..." } } }

{ "type": "subscription_update", "data": { "tier": "premium", "status": "active", "expiresAt": "..." } }
{ "type": "presence_update", "data": { "online": ["user1", "user2"] } }
```

### 7.4 Error Messages

```json
{ "type": "error", "code": "auth_failed", "message": "Invalid token" }
{ "type": "error", "code": "rate_limited", "message": "Too many connections" }
{ "type": "error", "code": "invalid_message", "message": "Unknown message type" }
```

---

## 8. Payment Flow (Polar.sh)

### 8.1 Product Setup (Polar Dashboard)

| Product | Tier | Price | Benefits |
|---------|------|-------|----------|
| FitMentor Premium | Premium | ₹99/mo | Unlimited AI Coach, Custom meal plans, Advanced analytics |
| FitMentor Pro | Pro | ₹299/mo | Everything in Premium + Form analyzer, Photo macros, Progress reports |

### 8.2 Checkout Flow

```
1. Frontend: POST /v1/subscriptions/checkout { tier: "premium" }
2. Rust: Create Polar.sh checkout session
   - product_id: Polar product ID
   - success_url: "https://fitmentor.app/profile?checkout=success"
   - metadata: { user_id: "uuid", tier: "premium" }
3. Rust: Return { checkoutUrl: "https://buy.polar.sh/polar_c_..." }
4. Frontend: Redirect to Polar.sh hosted checkout
5. User completes payment
6. Polar.sh redirects to success_url
7. Polar.sh fires webhook → POST /v1/webhooks/polar
```

### 8.3 Webhook Processing

```
Polar.sh → POST /v1/webhooks/polar
  ↓
Rust validates signature (Standard Webhooks HMAC-SHA256)
  ↓
Event dispatch:

  order.paid:
    1. Extract: customer_id, amount, currency, subscription_id
    2. Find user by Polar customer_id
    3. Create TigerBeetle transfer (PolarSettlement → UserWallet)
    4. Upsert subscription in PostgreSQL
    5. Publish Redis: ws:broadcast:{user_id} → subscription_update
    6. Ingest to Supermemory: "User subscribed to {tier}"

  subscription.active:
    1. Update subscription status → "active"
    2. Publish subscription_update via WebSocket

  subscription.canceled:
    1. Set cancel_at_period_end = true
    2. Publish subscription_update

  subscription.revoked:
    1. Set status = "revoked"
    2. Clear Redis cache
    3. Publish subscription_update

  subscription.past_due:
    1. Set status = "past_due"
    2. Publish subscription_update

  refund.created:
    1. Create TigerBeetle transfer (UserWallet → RefundLiability)
    2. Update subscription if needed
```

### 8.4 Polar.sh ↔ Rust Integration

```rust
use polar_api::Polar;

let polar = Polar::new(std::env::var("POLAR_ACCESS_TOKEN")?);

// Create checkout
let checkout = polar.checkouts().create(&CheckoutSessionParams {
    products: vec![product_id],
    success_url: Some("https://fitmentor.app/profile?checkout=success".into()),
    metadata: Some(serde_json::json!({"user_id": user_id, "tier": tier})),
    ..Default::default()
}).await?;

// Webhook verification
use polar_api::webhooks;
webhooks::verify(&raw_body, &headers, &secret)?;
```

---

## 9. AI Coach Flow (Supermemory)

### 9.1 Architecture

```
User sends message → Rust API → Supermemory (get context) → LLM API → Stream response
                          ↓                                          ↓
                    MongoDB (save conversation)              Gleam WS (stream to client)
                          ↓
                    Supermemory (ingest new context)
```

### 9.2 Request Flow

```
POST /v1/coach/chat
Body: {
  messages: [{ role: "user", content: "How much protein do I need?" }],
  sessionId: "optional-existing-session"
}
```

```
1. Auth: Validate JWT, get user_id
2. Rate limit: Check Redis ratelimit:coach:{user_id} < 30/min
3. Load profile from PostgreSQL (or Redis cache)
4. Supermemory: GET profile + search
   client.profile({
     containerTag: user_id,
     q: "What should I know about this user for coaching?"
   })
   → profile.static (permanent facts)
   → profile.dynamic (recent activity)
   → searchResults (relevant memories)
5. Build system prompt:
   - FitMentor coach persona
   - User profile (from PostgreSQL)
   - Static facts (from Supermemory)
   - Dynamic facts (from Supermemory)
   - Relevant memories (from Supermemory search)
6. Call LLM API with streaming
7. Stream chunks via Redis PUBLISH → Gleam WS → Client
8. On completion:
   a. Save conversation to MongoDB
   b. Ingest summary to Supermemory
   c. Log analytics event to MongoDB
```

### 9.3 Supermemory Integration

```rust
let client = reqwest::Client::new();

// Get user profile + relevant memories
let profile_resp = client.post("https://api.supermemory.ai/v4/profile")
    .bearer_auth(&supermemory_api_key)
    .json(&serde_json::json!({
        "containerTag": user_id,
        "q": "What should I know about this user for today's coaching session?"
    }))
    .send().await?;

// Ingest new conversation context
client.post("https://api.supermemory.ai/v3/documents")
    .bearer_auth(&supermemory_api_key)
    .json(&serde_json::json!({
        "content": conversation_summary,
        "containerTag": user_id,
        "entityContext": "Coaching conversation",
        "metadata": { "source": "coach_chat", "date": today }
    }))
    .send().await?;
```

### 9.4 Conversation Storage (MongoDB)

```rust
mongo.collection("coach_conversations").update_one(
    doc! { "session_id": &session_id },
    doc! {
        "$setOnInsert": {
            "id": Uuid::new_v4().to_string(),
            "user_id": &user_id,
            "session_id": &session_id,
            "created_at": chrono::Utc::now().to_rfc3339(),
        },
        "$push": {
            "messages": {
                "$each": [
                    doc! { "role": "user", "content": user_msg, "timestamp": now },
                    doc! { "role": "assistant", "content": assistant_msg, "timestamp": now },
                ]
            }
        },
        "$set": { "updated_at": chrono::Utc::now().to_rfc3339() }
    },
    UpdateOptions::builder().upsert(true).build(),
).await?;
```

---

## 10. Service Communication

### 10.1 Rust ↔ Gleam (Redis Pub/Sub)

```
Rust (writes data) → Redis PUBLISH → Gleam (receives) → WebSocket clients
```

**Rust side:**
```rust
redis::cmd("PUBLISH")
    .arg(format!("ws:broadcast:{}", user_id))
    .arg(serde_json::json!({
        "type": "habit_sync",
        "data": { "date": "2026-07-20", "water": 5, "proteinG": 80 }
    }).to_string())
    .query_async::<_, ()>(&mut redis_conn)
    .await?;
```

**Gleam side:**
```gleam
valkyrie.subscribe(conn, "ws:broadcast:" <> user_id)

fn handle_ws_message(state, message, conn) {
  case message {
    mist.Custom(RedisMessage(payload)) -> {
      let _ = mist.send_text_frame(conn, payload)
      mist.continue(state)
    }
    mist.Closed | mist.Shutdown -> mist.stop()
  }
}
```

### 10.2 Rust ↔ TigerBeetle

Direct TCP connection (same machine or private network):

```rust
use tb_rs::Client;

let mut tb_client = Client::builder()
    .cluster(0)
    .addresses("127.0.0.1:3001")?
    .connect_timeout(Duration::from_secs(5))
    .build()
    .await?;

let transfer = Transfer {
    id: tb_rs::id(),
    debit_account_id: polar_account,
    credit_account_id: user_wallet,
    amount: order.amount,
    ledger: 1,
    code: 1,
    user_data_128: user_hash,
    ..Default::default()
};
tb_client.create_transfers(&[transfer]).await?;
```

### 10.3 Rust ↔ PostgreSQL (SQLx)

```rust
use sqlx::postgres::{PgPool, PgPoolOptions};

let pool = PgPoolOptions::new()
    .max_connections(10)
    .connect(&database_url)
    .await?;

let user = sqlx::query_as!(
    User,
    "SELECT id, cf_access_sub, email, name, created_at, updated_at FROM users WHERE cf_access_sub = $1",
    cf_sub
)
.fetch_optional(&pool)
.await?;
```

### 10.4 Rust ↔ MongoDB

```rust
use mongodb::{Client, Collection};

let mongo_client = Client::with_uri_str(&mongo_url).await?;
let posts: Collection<Document> = mongo_client
    .database("fitmentor")
    .collection("community_posts");

posts.insert_one(doc! {
    "id": post_id,
    "user_id": user_id,
    "author_name": name,
    "text": text,
    "likes": 0,
    "liked_by": [],
    "replies": [],
    "created_at": now,
    "updated_at": now,
}).await?;
```

### 10.5 Rust ↔ Redis

```rust
use redis::aio::ConnectionManager;

let redis_client = redis::Client::open("redis://localhost:6379/")?;
let mut redis_conn = ConnectionManager::new(redis_client).await?;

// Cache read
let cached: Option<String> = redis::cmd("GET")
    .arg(format!("cache:user:{}", user_id))
    .query_async(&mut redis_conn)
    .await?;

// Cache write
redis::cmd("SETEX")
    .arg(format!("cache:user:{}", user_id))
    .arg(300)
    .arg(serde_json::to_string(&profile)?)
    .query_async::<_, ()>(&mut redis_conn)
    .await?;

// Pub/Sub publish
redis::cmd("PUBLISH")
    .arg("ws:broadcast:user123")
    .arg(message_json)
    .query_async::<_, ()>(&mut redis_conn)
    .await?;
```

---

## 11. Deployment Architecture

### 11.1 Infrastructure Layout

```
Cloudflare
├── Pages: Frontend
├── Access: Zero Trust Auth
├── D1: Auth data, sessions
├── KV: Cache, feature flags
└── R2: User uploads (future)

Fly.io
├── fitmentor-api (Rust/Axum) — 2 instances
├── fitmentor-ws (Gleam/Mist) — 2 instances
└── fitmentor-tigerbeetle — 1 instance

Managed Services
├── PostgreSQL: Neon (serverless)
├── MongoDB: Atlas (M0 → M10)
├── Redis: Upstash (serverless)
├── Polar.sh: Payments
├── Supermemory: RAG
└── OpenAI/Anthropic: LLM
```

### 11.2 Docker Compose (Local Development)

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes: ["redis_data:/data"]

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: fitmentor
      POSTGRES_USER: fitmentor
      POSTGRES_PASSWORD: fitmentor_dev
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  mongo:
    image: mongo:7
    ports: ["27017:27017"]
    volumes: ["mongodata:/data/db"]

  tigerbeetle:
    image: ghcr.io/tigerbeetle/tigerbeetle:latest
    command: ["start", "--addresses=0.0.0.0:3001", "/data/0_0.tigerbeetle"]
    ports: ["3001:3001"]
    volumes: ["tbdata:/data"]
    security_opt:
      - seccomp:unconfined

  api:
    build: ./rust-api
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgres://fitmentor:fitmentor_dev@postgres:5432/fitmentor
      MONGO_URL: mongodb://mongo:27017/fitmentor
      REDIS_URL: redis://redis:6379
      TB_ADDRESS: tigerbeetle:3001
      POLAR_ACCESS_TOKEN: ${POLAR_ACCESS_TOKEN}
      POLAR_WEBHOOK_SECRET: ${POLAR_WEBHOOK_SECRET}
      SUPERMEMORY_API_KEY: ${SUPERMEMORY_API_KEY}
      LLM_API_KEY: ${LLM_API_KEY}
      CF_ACCESS_TEAM_DOMAIN: ${CF_ACCESS_TEAM_DOMAIN}
      CF_ACCESS_AUD: ${CF_ACCESS_AUD}
    depends_on: [redis, postgres, mongo, tigerbeetle]

  ws:
    build: ./gleam-ws
    ports: ["8080:8080"]
    environment:
      REDIS_URL: redis://redis:6379
      CF_ACCESS_TEAM_DOMAIN: ${CF_ACCESS_TEAM_DOMAIN}
      CF_ACCESS_AUD: ${CF_ACCESS_AUD}
    depends_on: [redis]

volumes:
  redis_data:
  pgdata:
  mongodata:
  tbdata:
```

### 11.3 Production Deployment

**Rust API (fly.toml):**
```toml
app = 'fitmentor-api'
primary_region = 'sin'

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = '1gb'
  cpu_kind = 'shared'
  cpus = 2
```

**Gleam WS (fly.toml):**
```toml
app = 'fitmentor-ws'
primary_region = 'sin'

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = 'stop'
  auto_start_machines = true
  min_machines_running = 1

[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1
```

### 11.4 CI/CD

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-rust:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.toml
        working-directory: rust-api
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-gleam:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.toml
        working-directory: gleam-ws
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: pages deploy dist --project-name=fitmentor
```

---

## 12. Environment Variables

### Rust API (.env)

```bash
# Database
DATABASE_URL=postgres://user:pass@host:5432/fitmentor
MONGO_URL=mongodb://user:pass@host:27017/fitmentor?authSource=admin
REDIS_URL=redis://localhost:6379

# TigerBeetle
TB_CLUSTER_ID=0
TB_ADDRESS=127.0.0.1:3001

# Cloudflare Access
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-aud-tag

# Polar.sh
POLAR_ACCESS_TOKEN=polar_oat_...
POLAR_WEBHOOK_SECRET=whsec_...
POLAR_ENVIRONMENT=sandbox

# Supermemory
SUPERMEMORY_API_KEY=sm_...

# LLM
LLM_PROVIDER=openai
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o

# App
RUST_LOG=info
PORT=3000
```

### Gleam WS (.env)

```bash
REDIS_URL=redis://localhost:6379
CF_ACCESS_TEAM_DOMAIN=your-team.cloudflareaccess.com
CF_ACCESS_AUD=your-aud-tag
RUST_LOG=info
PORT=8080
```

---

## 13. Error Handling

### 13.1 Rust Error Types

```rust
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("not found")]
    NotFound,

    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("rate limited")]
    RateLimited,

    #[error("payment required")]
    PaymentRequired,

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code) = match &self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "not_found"),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::Forbidden => (StatusCode::FORBIDDEN, "forbidden"),
            AppError::BadRequest(_) => (StatusCode::BAD_REQUEST, "bad_request"),
            AppError::Conflict(_) => (StatusCode::CONFLICT, "conflict"),
            AppError::RateLimited => (StatusCode::TOO_MANY_REQUESTS, "rate_limited"),
            AppError::PaymentRequired => (StatusCode::PAYMENT_REQUIRED, "payment_required"),
            AppError::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "internal"),
        };

        let message = self.to_string();
        (status, Json(json!({ "error": { "code": code, "message": message } }))).into_response()
    }
}
```

### 13.2 HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET/PUT |
| 201 | Created | Successful POST |
| 400 | Bad Request | Invalid input |
| 401 | Unauthorized | Missing/invalid JWT |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource |
| 429 | Too Many Requests | Rate limit exceeded |
| 402 | Payment Required | Requires premium |
| 500 | Internal Server Error | Unexpected error |

---

## 14. Migration Plan

### Phase 1: Rust Foundation (Weeks 1-2)
- [ ] Rust project setup with Axum
- [ ] PostgreSQL schema + SQLx migrations
- [ ] MongoDB connection
- [ ] Redis connection
- [ ] TigerBeetle setup
- [ ] Cloudflare Access JWT validation
- [ ] Auth middleware + user auto-provisioning
- [ ] Health endpoint

### Phase 2: Core CRUD (Weeks 2-3)
- [ ] User & Profile endpoints
- [ ] Daily Logs endpoints
- [ ] Workout plan endpoint
- [ ] Nutrition endpoints
- [ ] Redis caching layer

### Phase 3: Community (Week 3)
- [ ] Community posts CRUD (MongoDB)
- [ ] Likes and replies
- [ ] Cursor-based pagination

### Phase 4: Gleam WebSocket (Weeks 4-5)
- [ ] Gleam project setup with Mist
- [ ] WebSocket connection + JWT validation
- [ ] Redis Pub/Sub integration
- [ ] Habit sync broadcast
- [ ] Community post broadcast
- [ ] Presence tracking

### Phase 5: AI Coach (Weeks 5-6)
- [ ] Coach chat endpoint (REST)
- [ ] Supermemory integration
- [ ] LLM API streaming
- [ ] WebSocket streaming (Rust → Redis → Gleam → Client)
- [ ] Conversation storage (MongoDB)

### Phase 6: Payments (Weeks 6-7)
- [ ] Polar.sh checkout flow
- [ ] Webhook handler + signature verification
- [ ] TigerBeetle ledger integration
- [ ] Subscription status sync
- [ ] Customer portal redirect

### Phase 7: Frontend Migration (Weeks 7-8)
- [ ] Replace localStorage → API calls
- [ ] Add WebSocket client
- [ ] Offline-first caching (localStorage as fallback)

### Phase 8: Deploy & Polish (Weeks 8-9)
- [ ] Docker Compose for local dev
- [ ] Fly.io deployment
- [ ] Neon + Atlas + Upstash setup
- [ ] CI/CD pipeline
- [ ] Monitoring + alerting

---

## 15. Directory Structure

```
FitMentor/
├── src/                          # Frontend (TanStack Start) — existing
│   ├── routes/
│   ├── components/
│   ├── lib/
│   └── ...
│
├── rust-api/                     # Rust backend (Axum)
│   ├── Cargo.toml
│   ├── Dockerfile
│   ├── fly.toml
│   ├── migrations/
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_profiles.sql
│   │   ├── 003_create_subscriptions.sql
│   │   ├── 004_create_daily_logs.sql
│   │   └── 005_create_workout_completions.sql
│   └── src/
│       ├── main.rs
│       ├── app.rs
│       ├── config.rs
│       ├── error.rs
│       ├── auth/
│       │   ├── mod.rs
│       │   ├── jwt.rs
│       │   └── middleware.rs
│       ├── db/
│       │   ├── mod.rs
│       │   ├── postgres.rs
│       │   ├── mongo.rs
│       │   └── redis.rs
│       ├── models/
│       │   ├── mod.rs
│       │   ├── user.rs
│       │   ├── profile.rs
│       │   ├── subscription.rs
│       │   ├── daily_log.rs
│       │   └── community.rs
│       ├── routes/
│       │   ├── mod.rs
│       │   ├── health.rs
│       │   ├── user.rs
│       │   ├── logs.rs
│       │   ├── workouts.rs
│       │   ├── nutrition.rs
│       │   ├── coach.rs
│       │   ├── progress.rs
│       │   ├── community.rs
│       │   ├── subscriptions.rs
│       │   ├── webhooks.rs
│       │   └── tools.rs
│       ├── services/
│       │   ├── mod.rs
│       │   ├── profile.rs
│       │   ├── habits.rs
│       │   ├── workouts.rs
│       │   ├── nutrition.rs
│       │   ├── coach.rs
│       │   ├── community.rs
│       │   ├── payment.rs
│       │   └── cache.rs
│       └── tigerbeetle/
│           ├── mod.rs
│           ├── accounts.rs
│           └── transfers.rs
│
├── gleam-ws/                     # Gleam WebSocket server (Mist)
│   ├── gleam.toml
│   ├── manifest.toml
│   ├── Dockerfile
│   ├── fly.toml
│   └── src/
│       ├── fitmentor_ws.gleam
│       ├── config.gleam
│       ├── auth.gleam
│       ├── websocket.gleam
│       ├── redis.gleam
│       ├── pubsub.gleam
│       ├── presence.gleam
│       └── channels.gleam
│
├── docker-compose.yml
├── .env.example
└── docs/
    └── ARCHITECTURE.md
```

---

## 16. Tech Stack Reference

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Frontend | TanStack Start | latest | React SSR framework |
| Frontend | TanStack Router | latest | Client-side routing |
| Frontend | Tailwind CSS | v4 | Styling |
| Frontend | Radix UI | latest | Component primitives |
| Frontend | Capacitor | v8 | Android APK builds |
| Auth | Cloudflare Access | — | Zero Trust authentication |
| API | Rust + Axum | 0.8.x | REST API server |
| Realtime | Gleam + Mist | 1.x + 6.x | WebSocket server |
| Relational DB | PostgreSQL | 16 | Users, profiles, subscriptions, logs |
| Document DB | MongoDB | 7 | Community, conversations, analytics |
| Cache | Redis | 7 | Cache, Pub/Sub, sessions, rate limits |
| Ledger | TigerBeetle | 0.17.x | Payment double-entry accounting |
| Edge DB | Cloudflare D1 | — | Auth sessions, rate limit counters |
| Edge Cache | Cloudflare KV | — | Meal plans, workout templates, feature flags |
| Payments | Polar.sh | — | Checkout, subscriptions, billing |
| RAG | Supermemory | — | AI coach context + memory |
| LLM | OpenAI / Anthropic | — | AI coach responses |
| Hosting (FE) | Cloudflare Pages | — | Frontend deployment |
| Hosting (BE) | Fly.io | — | Rust + Gleam deployment |
| Hosting (DB) | Neon / Supabase | — | Managed PostgreSQL |
| Hosting (Mongo) | MongoDB Atlas | — | Managed MongoDB |
| Hosting (Redis) | Upstash | — | Serverless Redis |
| CI/CD | GitHub Actions | — | Automated deployment |

---

*Last updated: 2026-07-20*
