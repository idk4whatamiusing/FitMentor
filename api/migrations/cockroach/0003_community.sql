-- Community feature tables (ported from the old D1/Gleam implementation).

CREATE TABLE IF NOT EXISTS community_posts (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '{}',
    parent_id   TEXT REFERENCES community_posts(id) ON DELETE CASCADE,
    reshare_id  TEXT REFERENCES community_posts(id) ON DELETE SET NULL,
    hidden      BIGINT NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS idx_community_posts_created ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_parent ON community_posts(parent_id);

CREATE TABLE IF NOT EXISTS community_likes (
    post_id    TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (now()::text),
    PRIMARY KEY (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_likes_post ON community_likes(post_id);

CREATE TABLE IF NOT EXISTS community_notifications (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL,
    actor_id   TEXT NOT NULL,
    post_id    TEXT REFERENCES community_posts(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    read       BIGINT NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now()::text)
);
CREATE INDEX IF NOT EXISTS idx_community_notifications_user
    ON community_notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_reports (
    id          TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL,
    post_id     TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (now()::text)
);

CREATE TABLE IF NOT EXISTS community_blocks (
    blocker_id TEXT NOT NULL,
    blocked_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (now()::text),
    PRIMARY KEY (blocker_id, blocked_id)
);

INSERT INTO schema_migrations (version) VALUES ('0003_community')
ON CONFLICT (version) DO NOTHING;
