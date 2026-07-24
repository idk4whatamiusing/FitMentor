use async_graphql::Schema;

use super::mutations::MutationRoot;
use super::queries::QueryRoot;
use super::subscriptions::SubscriptionRoot;

pub type AppSchema = Schema<QueryRoot, MutationRoot, SubscriptionRoot>;

pub fn create_schema() -> AppSchema {
    Schema::build(QueryRoot, MutationRoot, SubscriptionRoot)
        .finish()
}
