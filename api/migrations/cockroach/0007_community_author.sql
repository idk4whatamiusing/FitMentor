-- Denormalise the post author's display name.
--
-- Community data moves to Aurora DSQL, where the `users` table does not exist.
-- Resolving the name at write time keeps the feed a single-store query and
-- lets the Cockroach fallback and DSQL share the same SQL.

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS author_name TEXT NOT NULL DEFAULT 'User';

UPDATE community_posts p
SET author_name = COALESCE(
    (SELECT u.name FROM users u WHERE u.cf_access_sub = p.user_id),
    'User'
)
WHERE p.author_name = 'User';

INSERT INTO schema_migrations (version) VALUES ('0007_community_author')
ON CONFLICT (version) DO NOTHING;
