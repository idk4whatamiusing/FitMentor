// Package db creates the pgx pool and runs the ensure-schema DDL
// ported from run_migrations in api/src/main.rs.
package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 10
	return pgxpool.NewWithConfig(ctx, cfg)
}

var schema = []string{
	// Base tables (union of api/migrations/*) so a fresh database boots
	// without an external migration runner. All IF NOT EXISTS.
	`CREATE TABLE IF NOT EXISTS users (
		id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		cf_access_sub   TEXT UNIQUE NOT NULL,
		email           TEXT UNIQUE NOT NULL,
		name            TEXT NOT NULL DEFAULT 'Friend',
		created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS profiles (
		id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		name              TEXT NOT NULL DEFAULT 'Friend',
		age               SMALLINT NOT NULL DEFAULT 22,
		gender            TEXT NOT NULL DEFAULT 'male',
		height_cm         SMALLINT NOT NULL DEFAULT 170,
		weight_kg         SMALLINT NOT NULL DEFAULT 65,
		goal              TEXT NOT NULL DEFAULT 'muscle_gain',
		place             TEXT NOT NULL DEFAULT 'gym',
		experience        TEXT NOT NULL DEFAULT 'beginner',
		diet              TEXT NOT NULL DEFAULT 'veg',
		days_per_week     SMALLINT NOT NULL DEFAULT 4,
		budget_per_day    SMALLINT NOT NULL DEFAULT 150,
		health_conditions TEXT[] NOT NULL DEFAULT '{}',
		custom_protein_g  SMALLINT,
		created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS subscriptions (
		id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		polar_sub_id          TEXT UNIQUE NOT NULL,
		polar_product_id      TEXT NOT NULL,
		polar_price_id        TEXT NOT NULL,
		tier                  TEXT NOT NULL DEFAULT 'free',
		status                TEXT NOT NULL DEFAULT 'active',
		current_period_start  TIMESTAMPTZ,
		current_period_end    TIMESTAMPTZ,
		cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
		created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS daily_logs (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		date          DATE NOT NULL,
		water         SMALLINT NOT NULL DEFAULT 0,
		sleep         SMALLINT NOT NULL DEFAULT 0,
		steps         INTEGER NOT NULL DEFAULT 0,
		protein_g     SMALLINT NOT NULL DEFAULT 0,
		workout_done  BOOLEAN NOT NULL DEFAULT FALSE,
		weight_kg     REAL,
		created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
		UNIQUE(user_id, date)
	)`,
	`CREATE TABLE IF NOT EXISTS coach_logs (
		id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id         TEXT NOT NULL,
		container_tag   TEXT NOT NULL,
		created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS workout_completions (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		date          DATE NOT NULL,
		day_index     SMALLINT NOT NULL,
		title         TEXT NOT NULL,
		completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
		UNIQUE(user_id, date, day_index)
	)`,
	`CREATE TABLE IF NOT EXISTS meal_plans (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		date       DATE NOT NULL,
		plan       JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS workout_plans (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		date       DATE NOT NULL,
		plan       JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_user_date ON meal_plans(user_id, date)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_plans_user_date ON workout_plans(user_id, date)`,
	`CREATE TABLE IF NOT EXISTS bmi_advice (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		date       DATE NOT NULL,
		plan       JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS sleep_advice (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		date       DATE NOT NULL,
		plan       JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS injury_advice (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		date       DATE NOT NULL,
		plan       JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS form_advice (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		date       DATE NOT NULL,
		plan       JSONB NOT NULL,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ not null default now()
	)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_bmi_advice_user_date ON bmi_advice(user_id, date)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_advice_user_date ON sleep_advice(user_id, date)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_injury_advice_user_date ON injury_advice(user_id, date)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_form_advice_user_date ON form_advice(user_id, date)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_logs_user_container ON coach_logs(user_id, container_tag)`,
	`CREATE TABLE IF NOT EXISTS chat_sessions (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		title      TEXT NOT NULL DEFAULT 'New Chat',
		messages   JSONB NOT NULL DEFAULT '[]',
		created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)`,
	`CREATE TABLE IF NOT EXISTS community_posts (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		body       JSONB NOT NULL DEFAULT '{}',
		parent_id  UUID REFERENCES community_posts(id) ON DELETE CASCADE,
		reshare_id UUID REFERENCES community_posts(id) ON DELETE SET NULL,
		hidden     BOOLEAN NOT NULL DEFAULT false,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS community_likes (
		post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL,
		PRIMARY KEY (post_id, user_id)
	)`,
	`CREATE TABLE IF NOT EXISTS community_notifications (
		id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		user_id    TEXT NOT NULL,
		actor_id   TEXT NOT NULL,
		post_id    UUID REFERENCES community_posts(id) ON DELETE CASCADE,
		type       TEXT NOT NULL,
		read       BOOLEAN NOT NULL DEFAULT false,
		created_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS community_reports (
		id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		reporter_id TEXT NOT NULL,
		post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
		reason      TEXT NOT NULL,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
	)`,
	`CREATE TABLE IF NOT EXISTS community_blocks (
		blocker_id  TEXT NOT NULL,
		blocked_id  TEXT NOT NULL,
		created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
		PRIMARY KEY (blocker_id, blocked_id)
	)`,
	`CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC NULLS LAST)`,
	`CREATE INDEX IF NOT EXISTS idx_community_posts_parent ON community_posts(parent_id)`,
	`CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id)`,
	`CREATE INDEX IF NOT EXISTS idx_community_likes_post ON community_likes(post_id)`,
	`CREATE INDEX IF NOT EXISTS idx_community_notifications_user ON community_notifications(user_id, created_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_community_notifications_unread ON community_notifications(user_id) WHERE NOT read`,
	`CREATE INDEX IF NOT EXISTS idx_community_reports_post ON community_reports(post_id)`,
	`CREATE EXTENSION IF NOT EXISTS pg_trgm`,
	`CREATE INDEX IF NOT EXISTS idx_community_posts_text_gin ON community_posts USING GIN (to_tsvector('english', body->>'text'))`,
}

func EnsureSchema(ctx context.Context, pool *pgxpool.Pool) error {
	for i, stmt := range schema {
		if _, err := pool.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("schema statement %d failed: %w", i, err)
		}
	}
	return nil
}
