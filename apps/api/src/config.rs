#[allow(dead_code)]
pub struct Config {
    pub database_url: String,
    pub redis_url: String,
    pub cf_access_team_domain: String,
    pub cf_access_aud: String,
    pub port: u16,
    // Epic 6: AI Coach
    pub mongodb_url: String,
    pub mongodb_db: String,
    pub supermemory_api_key: String,
    pub llm_api_key: String,
    pub llm_model: String,
    // Epic 7: Payments
    pub polar_access_token: String,
    pub polar_webhook_secret: String,
    // Messaging: RabbitMQ (jobs/notifications) + Kafka (event stream)
    pub rabbitmq_url: String,
    pub kafka_brokers: String,
    // Shared secret for trusted server-to-server calls from frontend
    pub api_shared_secret: String,
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
            mongodb_url: std::env::var("MONGODB_URL")
                .unwrap_or_else(|_| "mongodb://localhost:27017".into()),
            mongodb_db: std::env::var("MONGODB_DB")
                .unwrap_or_else(|_| "fitmentor".into()),
            supermemory_api_key: std::env::var("SUPERMEMORY_API_KEY")
                .unwrap_or_default(),
            llm_api_key: std::env::var("LLM_API_KEY")
                .unwrap_or_default(),
            llm_model: std::env::var("LLM_MODEL")
                .unwrap_or_else(|_| "gemini-2.0-flash".into()),
            polar_access_token: std::env::var("POLAR_ACCESS_TOKEN")
                .unwrap_or_default(),
            polar_webhook_secret: std::env::var("POLAR_WEBHOOK_SECRET")
                .unwrap_or_default(),
            rabbitmq_url: std::env::var("RABBITMQ_URL")
                .unwrap_or_else(|_| "amqp://guest:guest@localhost:5672".into()),
            kafka_brokers: std::env::var("KAFKA_BROKERS")
                .unwrap_or_else(|_| "localhost:9092".into()),
            api_shared_secret: std::env::var("API_SHARED_SECRET")
                .unwrap_or_default(),
        }
    }
}
