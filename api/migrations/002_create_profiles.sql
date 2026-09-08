CREATE TABLE profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name              TEXT NOT NULL DEFAULT 'Friend',
    age               SMALLINT NOT NULL DEFAULT 22,
    gender            TEXT NOT NULL DEFAULT 'male' CHECK (gender IN ('male', 'female', 'other')),
    height_cm         SMALLINT NOT NULL DEFAULT 170,
    weight_kg         SMALLINT NOT NULL DEFAULT 65,
    goal              TEXT NOT NULL DEFAULT 'muscle_gain' CHECK (goal IN ('fat_loss', 'muscle_gain', 'strength', 'recomp', 'general')),
    place             TEXT NOT NULL DEFAULT 'gym' CHECK (place IN ('gym', 'home')),
    experience        TEXT NOT NULL DEFAULT 'beginner' CHECK (experience IN ('beginner', 'intermediate', 'advanced')),
    diet              TEXT NOT NULL DEFAULT 'veg' CHECK (diet IN ('veg', 'nonveg', 'egg')),
    days_per_week     SMALLINT NOT NULL DEFAULT 4 CHECK (days_per_week BETWEEN 2 AND 6),
    budget_per_day    SMALLINT NOT NULL DEFAULT 150,
    health_conditions TEXT[] NOT NULL DEFAULT '{}',
    custom_protein_g  SMALLINT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
