CREATE TABLE coach_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         TEXT NOT NULL,
    container_tag   TEXT NOT NULL,
    messages        JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_logs_user_id ON coach_logs(user_id);
CREATE INDEX idx_coach_logs_container_tag ON coach_logs(container_tag);
