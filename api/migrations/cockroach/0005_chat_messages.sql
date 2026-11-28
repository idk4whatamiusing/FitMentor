-- Coach messages as rows, with an embedding for cross-session recall.
--
-- Replaces the JSON blob in chat_sessions.messages as the read/write source.
-- The blob is still dual-written for now so older web clients keep working;
-- it can be dropped once every client reads chat_messages.
--
-- Embeddings are 1024-dimensional (Workers AI `@cf/baai/bge-m3`) and are
-- unit-normalised, so the L2 index ranks like cosine similarity.

CREATE TABLE IF NOT EXISTS chat_messages (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    embedding   VECTOR(1024),
    seq         INT8 NOT NULL DEFAULT unique_rowid(),
    created_at  TEXT NOT NULL DEFAULT (now()::text)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session
    ON chat_messages (session_id, seq);

CREATE INDEX IF NOT EXISTS idx_chat_messages_user
    ON chat_messages (user_id, seq DESC);

CREATE VECTOR INDEX IF NOT EXISTS idx_chat_messages_embedding
    ON chat_messages (embedding vector_l2_ops);

-- Legacy Supermemory marker table: nothing reads it any more.
DROP TABLE IF EXISTS coach_logs;
