use async_graphql::Subscription;
use futures::stream::Stream;
use std::pin::Pin;

use super::types::*;

pub struct SubscriptionRoot;

#[Subscription]
impl SubscriptionRoot {
    /// Subscribe to daily log updates
    async fn log_updated(
        &self,
    ) -> Pin<Box<dyn Stream<Item = GqlDailyLog> + Send>> {
        // Placeholder - will be wired up with broadcast channel
        let _ = tokio::sync::broadcast::channel::<()>(16);
        Box::pin(futures::stream::empty())
    }

    /// Subscribe to AI plan updates
    async fn plan_updated(
        &self,
        table: String,
    ) -> Pin<Box<dyn Stream<Item = GqlAiPlan> + Send>> {
        let _ = table;
        Box::pin(futures::stream::empty())
    }
}
