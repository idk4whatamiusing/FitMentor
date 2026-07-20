pub mod health;
pub mod logs;
pub mod user;

use axum::Router;

use crate::AppState;

pub fn routes(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", axum::routing::get(health::health))
        .route("/v1/user/me", axum::routing::get(user::get_me))
        .route("/v1/user/profile", axum::routing::put(user::update_profile))
        .route(
            "/v1/user/profile/protein-target",
            axum::routing::put(user::update_protein_target),
        )
        .route("/v1/logs/today", axum::routing::get(logs::get_today))
        .route("/v1/logs/today", axum::routing::put(logs::upsert_today))
        .route("/v1/logs", axum::routing::get(logs::get_range))
        .route("/v1/logs/streak", axum::routing::get(logs::get_streak))
        .with_state(state)
}
