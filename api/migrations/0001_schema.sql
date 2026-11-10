-- FitMentor D1 schema (SQLite).
-- Ported from api/migrations/postgres/*. SQLite has no UUID/JSONB/array types,
-- so: ids → TEXT (generated in Rust), json → TEXT, timestamps → TEXT ISO-8601.

CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    cf_access_sub  TEXT UNIQUE NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL DEFAULT 'Friend',
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_cf_access_sub ON users(cf_access_sub);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS profiles (
    id                TEXT PRIMARY KEY,
    user_id           TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL DEFAULT 'Friend',
    age               INTEGER NOT NULL DEFAULT 22,
    gender            TEXT NOT NULL DEFAULT 'male',
    height_cm         INTEGER NOT NULL DEFAULT 170,
    weight_kg         INTEGER NOT NULL DEFAULT 65,
    goal              TEXT NOT NULL DEFAULT 'muscle_gain',
    place             TEXT NOT NULL DEFAULT 'gym',
    experience        TEXT NOT NULL DEFAULT 'beginner',
    diet              TEXT NOT NULL DEFAULT 'veg',
    days_per_week     INTEGER NOT NULL DEFAULT 4,
    budget_per_day    INTEGER NOT NULL DEFAULT 150,
    health_conditions TEXT NOT NULL DEFAULT '[]',   -- JSON array
    custom_protein_g  INTEGER,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

CREATE TABLE IF NOT EXISTS subscriptions (
    id                    TEXT PRIMARY KEY,
    user_id               TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    polar_sub_id          TEXT UNIQUE NOT NULL,
    polar_product_id      TEXT NOT NULL,
    polar_price_id        TEXT NOT NULL,
    tier                  TEXT NOT NULL DEFAULT 'free',
    status                TEXT NOT NULL DEFAULT 'active',
    current_period_start  TEXT,
    current_period_end    TEXT,
    cancel_at_period_end  INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS daily_logs (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,                    -- YYYY-MM-DD
    water         INTEGER NOT NULL DEFAULT 0,
    sleep         INTEGER NOT NULL DEFAULT 0,
    steps         INTEGER NOT NULL DEFAULT 0,
    protein_g     INTEGER NOT NULL DEFAULT 0,
    workout_done  INTEGER NOT NULL DEFAULT 0,
    weight_kg     REAL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date DESC);

CREATE TABLE IF NOT EXISTS workout_completions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    day_index     INTEGER NOT NULL,
    title         TEXT NOT NULL,
    completed_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, date, day_index)
);
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_date ON workout_completions(user_id, date DESC);

CREATE TABLE IF NOT EXISTS coach_logs (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    container_tag  TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, container_tag)
);
CREATE INDEX IF NOT EXISTS idx_coach_logs_user_id ON coach_logs(user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    messages    TEXT NOT NULL DEFAULT '[]',          -- JSON array
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

-- Daily AI plans/advice: one row per (user, date)
CREATE TABLE IF NOT EXISTS meal_plans (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS workout_plans (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS bmi_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS sleep_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS injury_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS form_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(user_id, date)
);

-- AI quota (replaces Redis INCR/SETNX). Atomic upsert + RETURNING.
CREATE TABLE IF NOT EXISTS ai_quota (
    user_id TEXT NOT NULL,
    day     TEXT NOT NULL,
    used    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS ai_quota_seen (
    user_id TEXT NOT NULL,
    day     TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
);

-- Community (tables only — endpoints not built yet)
CREATE TABLE IF NOT EXISTS community_posts (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '{}',
    parent_id  TEXT REFERENCES community_posts(id) ON DELETE CASCADE,
    reshare_id TEXT REFERENCES community_posts(id) ON DELETE SET NULL,
    hidden     INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS community_likes (
    post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    PRIMARY KEY (post_id, user_id)
);
CREATE TABLE IF NOT EXISTS community_notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    actor_id   TEXT NOT NULL,
    post_id    TEXT REFERENCES community_posts(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS community_reports (
    id          TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    post_id     TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS community_blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (blocker_id, blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_likes_post ON community_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_community_notifications_user ON community_notifications(user_id, created_at DESC);
