#[derive(Clone)]
pub struct CacheService {
    conn: Option<redis::aio::ConnectionManager>,
}

impl CacheService {
    pub async fn new(redis_url: &str) -> Self {
        match redis::Client::open(redis_url) {
            Ok(client) => match redis::aio::ConnectionManager::new(client).await {
                Ok(conn) => Self { conn: Some(conn) },
                Err(e) => {
                    tracing::warn!("Redis connection failed, cache disabled: {}", e);
                    Self { conn: None }
                }
            },
            Err(e) => {
                tracing::warn!("Redis client creation failed, cache disabled: {}", e);
                Self { conn: None }
            }
        }
    }

    fn get_conn(&self) -> Option<redis::aio::ConnectionManager> {
        self.conn.clone()
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        let mut conn = self.get_conn()?;
        redis::cmd("GET").arg(key).query_async(&mut conn).await.ok().flatten()
    }

    pub async fn set(&self, key: &str, value: &str, ttl_secs: u64) {
        let Some(mut conn) = self.get_conn() else { return };
        let _: Result<(), _> = redis::cmd("SETEX")
            .arg(key)
            .arg(ttl_secs)
            .arg(value)
            .query_async(&mut conn)
            .await;
    }

    pub async fn delete(&self, key: &str) {
        let Some(mut conn) = self.get_conn() else { return };
        let _: Result<(), _> = redis::cmd("DEL").arg(key).query_async(&mut conn).await;
    }

    pub async fn invalidate_user(&self, user_id: &str) {
        self.delete(&format!("cache:user:{user_id}")).await;
        self.delete(&format!("cache:profile:{user_id}")).await;
    }

    pub async fn invalidate_today(&self, user_id: &str) {
        self.delete(&format!("cache:today:{user_id}")).await;
    }
}
