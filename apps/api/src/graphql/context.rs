use crate::auth::middleware::AuthUser;
use crate::db::shard::ShardRouter;
use crate::services::cache::CacheService;
use sqlx::PgPool;
use std::sync::Arc;

pub struct GqlContext {
    pub shard_router: Arc<ShardRouter>,
    pub cache: CacheService,
    pub user: Option<AuthUser>,
}

impl GqlContext {
    pub fn new(shard_router: Arc<ShardRouter>, cache: CacheService, user: Option<AuthUser>) -> Self {
        Self {
            shard_router,
            cache,
            user,
        }
    }

    /// Get the connection pool for the current authenticated user.
    /// Falls back to primary shard if no user is set.
    pub fn pool_for_user(&self) -> &PgPool {
        match &self.user {
            Some(auth) => self.shard_router.get_pool_for_user(&auth.user_id),
            None => self.shard_router.primary_pool(),
        }
    }

    pub fn require_user(&self) -> Result<&AuthUser, async_graphql::Error> {
        self.user
            .as_ref()
            .ok_or_else(|| async_graphql::Error::new("Unauthorized"))
    }
}
