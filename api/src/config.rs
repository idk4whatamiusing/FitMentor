//! Runtime configuration from Lambda environment variables.

use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub api_shared_secret: String,
    pub ai_worker_url: String,
    pub polar_access_token: String,
    pub polar_webhook_secret: String,
    pub polar_premium_product_id: String,
    pub polar_premium_price_id: String,
    pub polar_pro_product_id: String,
    pub polar_pro_price_id: String,
    pub polar_api_base: String,
    pub app_url: String,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        let database_url =
            env::var("DATABASE_URL").map_err(|_| "DATABASE_URL is not set".to_string())?;
        Ok(Self {
            database_url,
            api_shared_secret: env::var("API_SHARED_SECRET").unwrap_or_default(),
            ai_worker_url: env::var("AI_WORKER_URL").unwrap_or_default(),
            polar_access_token: env::var("POLAR_ACCESS_TOKEN").unwrap_or_default(),
            polar_webhook_secret: env::var("POLAR_WEBHOOK_SECRET").unwrap_or_default(),
            polar_premium_product_id: env::var("POLAR_PREMIUM_PRODUCT_ID").unwrap_or_default(),
            polar_premium_price_id: env::var("POLAR_PREMIUM_PRICE_ID").unwrap_or_default(),
            polar_pro_product_id: env::var("POLAR_PRO_PRODUCT_ID").unwrap_or_default(),
            polar_pro_price_id: env::var("POLAR_PRO_PRICE_ID").unwrap_or_default(),
            polar_api_base: env::var("POLAR_API_BASE")
                .unwrap_or_else(|_| "https://api.polar.sh".to_string()),
            app_url: env::var("APP_URL")
                .unwrap_or_else(|_| "https://fitmentor-ey9.pages.dev".to_string()),
        })
    }
}
