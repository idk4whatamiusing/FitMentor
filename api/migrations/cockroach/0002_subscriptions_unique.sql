-- One subscription row per user, so Polar webhooks can upsert with
-- ON CONFLICT (user_id).
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_unique ON subscriptions(user_id);

INSERT INTO schema_migrations (version) VALUES ('0002_subscriptions_unique')
ON CONFLICT (version) DO NOTHING;
