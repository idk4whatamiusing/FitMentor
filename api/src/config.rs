//! Runtime configuration from Lambda environment variables.

use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub api_shared_secret: String,
    pub ai_worker_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url =
            env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is not set".to_string())?;
        let api_shared_secret = env::var("API_SHARED_SECRET").unwrap_or_default();
        let ai_worker_url = env::var("AI_WORKER_URL").unwrap_or_default();
        Ok(Self {
            database_url,
            api_shared_secret,
            ai_worker_url,
        })
    }
}
