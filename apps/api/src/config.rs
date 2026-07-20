pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub cf_access_team_domain: String,
    pub cf_access_aud: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").expect("DATABASE_URL must be set"),
            redis_url: std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".into()),
            cf_access_team_domain: std::env::var("CF_ACCESS_TEAM_DOMAIN")
                .unwrap_or_else(|_| "your-team.cloudflareaccess.com".into()),
            cf_access_aud: std::env::var("CF_ACCESS_AUD")
                .unwrap_or_else(|_| "your-aud-tag".into()),
            port: std::env::var("PORT")
                .unwrap_or_else(|_| "3000".into())
                .parse()
                .unwrap_or(3000),
        }
    }
}
