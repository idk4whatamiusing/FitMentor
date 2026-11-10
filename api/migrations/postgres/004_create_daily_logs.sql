CREATE TABLE daily_logs (
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
);

CREATE INDEX idx_daily_logs_user_date ON daily_logs(user_id, date DESC);
CREATE INDEX idx_daily_logs_user_recent ON daily_logs(user_id, date DESC)
    INCLUDE (water, sleep, steps, protein_g, workout_done, weight_kg);
