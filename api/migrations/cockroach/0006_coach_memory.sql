-- Long-term coach memory: durable facts and rolling session summaries.
--
-- Facts are injected on every turn, so they never depend on retrieval luck.
-- Summaries are embedded and retrieved across sessions, and also cover the
-- older turns of the current session once the recent-token window ends.

CREATE TABLE IF NOT EXISTS coach_facts (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL,
    fact            TEXT NOT NULL,
    embedding       VECTOR(1024),
    source_session  TEXT,
    active          BOOL NOT NULL DEFAULT true,
    created_at      TEXT NOT NULL DEFAULT (now()::text),
    updated_at      TEXT NOT NULL DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS idx_coach_facts_user
    ON coach_facts (user_id, active, updated_at DESC);

CREATE VECTOR INDEX IF NOT EXISTS idx_coach_facts_embedding
    ON coach_facts (embedding vector_l2_ops);

CREATE TABLE IF NOT EXISTS coach_summaries (
    session_id        TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL,
    summary           TEXT NOT NULL,
    embedding         VECTOR(1024),
    covered_until_seq INT8 NOT NULL DEFAULT 0,
    updated_at        TEXT NOT NULL DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS idx_coach_summaries_user
    ON coach_summaries (user_id, updated_at DESC);

CREATE VECTOR INDEX IF NOT EXISTS idx_coach_summaries_embedding
    ON coach_summaries (embedding vector_l2_ops);
