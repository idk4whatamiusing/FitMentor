-- FitMentor schema for CockroachDB (Postgres wire compatible).
--
-- Differences from the D1/SQLite schema:
--   * timestamps stay TEXT (ISO-ish, UTC) so row models and API responses
--     keep their existing shape; defaults use now()::text
--   * INTEGER -> BIGINT so Rust i64 columns decode cleanly
--   * REAL -> DOUBLE PRECISION so Rust f64 columns decode cleanly
--   * JSON blobs stay TEXT (the API serializes/deserializes them itself)

CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (now()::text)
);

CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    cf_access_sub  TEXT UNIQUE NOT NULL,
    email          TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL DEFAULT 'Friend',
    created_at     TEXT NOT NULL DEFAULT (now()::text),
    updated_at     TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS idx_users_cf_access_sub ON users(cf_access_sub);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS profiles (
    id                TEXT PRIMARY KEY,
    user_id           TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL DEFAULT 'Friend',
    age               BIGINT NOT NULL DEFAULT 22,
    gender            TEXT NOT NULL DEFAULT 'male',
    height_cm         BIGINT NOT NULL DEFAULT 170,
    weight_kg         BIGINT NOT NULL DEFAULT 65,
    goal              TEXT NOT NULL DEFAULT 'muscle_gain',
    place             TEXT NOT NULL DEFAULT 'gym',
    experience        TEXT NOT NULL DEFAULT 'beginner',
    diet              TEXT NOT NULL DEFAULT 'veg',
    days_per_week     BIGINT NOT NULL DEFAULT 4,
    budget_per_day    BIGINT NOT NULL DEFAULT 150,
    health_conditions TEXT NOT NULL DEFAULT '[]',
    custom_protein_g  BIGINT,
    created_at        TEXT NOT NULL DEFAULT (now()::text),
    updated_at        TEXT NOT NULL DEFAULT (now()::text)
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
    cancel_at_period_end  BIGINT NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL DEFAULT (now()::text),
    updated_at            TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS daily_logs (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    water         BIGINT NOT NULL DEFAULT 0,
    sleep         BIGINT NOT NULL DEFAULT 0,
    steps         BIGINT NOT NULL DEFAULT 0,
    protein_g     BIGINT NOT NULL DEFAULT 0,
    workout_done  BIGINT NOT NULL DEFAULT 0,
    weight_kg     DOUBLE PRECISION,
    created_at    TEXT NOT NULL DEFAULT (now()::text),
    updated_at    TEXT NOT NULL DEFAULT (now()::text),
    UNIQUE(user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date DESC);

CREATE TABLE IF NOT EXISTS workout_completions (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    day_index     BIGINT NOT NULL,
    title         TEXT NOT NULL,
    completed_at  TEXT NOT NULL DEFAULT (now()::text),
    UNIQUE(user_id, date, day_index)
);
CREATE INDEX IF NOT EXISTS idx_workout_completions_user_date ON workout_completions(user_id, date DESC);

CREATE TABLE IF NOT EXISTS coach_logs (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL,
    container_tag  TEXT NOT NULL,
    created_at     TEXT NOT NULL DEFAULT (now()::text),
    UNIQUE(user_id, container_tag)
);
CREATE INDEX IF NOT EXISTS idx_coach_logs_user_id ON coach_logs(user_id);

CREATE TABLE IF NOT EXISTS chat_sessions (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    title       TEXT NOT NULL DEFAULT 'New Chat',
    messages    TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL DEFAULT (now()::text),
    updated_at  TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);

CREATE TABLE IF NOT EXISTS meal_plans (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (now()::text),
    updated_at TEXT NOT NULL DEFAULT (now()::text), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS workout_plans (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (now()::text),
    updated_at TEXT NOT NULL DEFAULT (now()::text), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS bmi_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (now()::text),
    updated_at TEXT NOT NULL DEFAULT (now()::text), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS sleep_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (now()::text),
    updated_at TEXT NOT NULL DEFAULT (now()::text), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS injury_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (now()::text),
    updated_at TEXT NOT NULL DEFAULT (now()::text), UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS form_advice (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT NOT NULL,
    plan TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (now()::text),
    updated_at TEXT NOT NULL DEFAULT (now()::text), UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS ai_quota (
    user_id TEXT NOT NULL,
    day     TEXT NOT NULL,
    used    BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS ai_quota_seen (
    user_id TEXT NOT NULL,
    day     TEXT NOT NULL,
    PRIMARY KEY (user_id, day)
);

INSERT INTO schema_migrations (version) VALUES ('0001_init')
ON CONFLICT (version) DO NOTHING;
