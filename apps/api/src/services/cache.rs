#[derive(Clone)]
pub struct CacheService {
    conn: redis::aio::ConnectionManager,
}

impl CacheService {
    pub async fn new(redis_url: &str) -> Self {
        let client = redis::Client::open(redis_url).expect("failed to create Redis client");
        let conn = redis::aio::ConnectionManager::new(client)
            .await
            .expect("failed to connect to Redis");
        Self { conn }
    }

    pub async fn get(&self, key: &str) -> Option<String> {
        let mut conn = self.conn.clone();
        let result: Result<Option<String>, _> = redis::cmd("GET").arg(key).query_async(&mut conn).await;
        result.ok().flatten()
    }

    pub async fn set(&self, key: &str, value: &str, ttl_secs: u64) {
        let mut conn = self.conn.clone();
        let _ = redis::cmd("SETEX")
            .arg(key)
            .arg(ttl_secs)
            .arg(value)
            .query_async::<()>(&mut conn)
            .await;
    }

    pub async fn delete(&self, key: &str) {
        let mut conn = self.conn.clone();
        let _ = redis::cmd("DEL").arg(key).query_async::<()>(&mut conn).await;
    }

    pub async fn invalidate_user(&self, user_id: uuid::Uuid) {
        self.delete(&format!("cache:user:{user_id}")).await;
        self.delete(&format!("cache:profile:{user_id}")).await;
    }

    pub async fn invalidate_today(&self, user_id: uuid::Uuid) {
        self.delete(&format!("cache:today:{user_id}")).await;
    }
}
