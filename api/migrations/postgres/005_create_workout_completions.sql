CREATE TABLE workout_completions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date          DATE NOT NULL,
    day_index     SMALLINT NOT NULL,
    title         TEXT NOT NULL,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE(user_id, date, day_index)
);

CREATE INDEX idx_workout_completions_user_date ON workout_completions(user_id, date DESC);
