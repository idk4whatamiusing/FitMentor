-- Short-lived state for the browser-based Google OAuth redirect flow.
-- The app starts a state, opens Google in the system browser, and polls
-- until the callback stores the FitMentor JWT against that state.

CREATE TABLE IF NOT EXISTS google_auth_states (
    state       TEXT PRIMARY KEY,
    status      TEXT NOT NULL DEFAULT 'pending',
    token       TEXT,
    user_json   TEXT,
    error       TEXT,
    created_at  TEXT NOT NULL DEFAULT (now()::text),
    expires_at  BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_google_auth_states_expires
    ON google_auth_states(expires_at);

INSERT INTO schema_migrations (version) VALUES ('0004_google_auth_states')
ON CONFLICT (version) DO NOTHING;
