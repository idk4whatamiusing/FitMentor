//! One-off backfill: copies community posts, likes, notifications, reports,
//! and blocks from CockroachDB into Aurora DSQL.
//!
//! Usage:
//!   set -a && . ./.env && set +a
//!   cargo run --example backfill_community
//!
//! Safe to re-run: existing ids are skipped and reply/reshare links are only
//! filled in when still null.

use fitmentor_api::{app::AppState, handlers::community};

#[tokio::main]
async fn main() -> Result<(), String> {
    let state = AppState::from_env().await?;
    if state.config.dsql_url.trim().is_empty() {
        return Err("DSQL_URL is empty; community data is still on CockroachDB".into());
    }

    let result = community::backfill(&state.pool, &state.community_pool).await?;
    println!("{result}");
    Ok(())
}
