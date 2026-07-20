CREATE TABLE subscriptions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    polar_sub_id          TEXT UNIQUE NOT NULL,
    polar_product_id      TEXT NOT NULL,
    polar_price_id        TEXT NOT NULL,
    tier                  TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium', 'pro')),
    status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'revoked')),
    current_period_start  TIMESTAMPTZ,
    current_period_end    TIMESTAMPTZ,
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_polar_sub_id ON subscriptions(polar_sub_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
