pub mod ai_plans;
pub mod auth;
pub mod coach_sessions;
pub mod health;
pub mod logs;
pub mod payments;
pub mod user;

use axum::Router;

use crate::AppState;

pub fn routes(state: AppState) -> Router {
    Router::new()
        // Health
        .route("/v1/health", axum::routing::get(health::health))
        // Auth
        .route("/v1/auth/discord", axum::routing::get(auth::discord_login))
        .route("/v1/auth/callback", axum::routing::get(auth::discord_callback))
        // User & Profile
        .route("/v1/user/me", axum::routing::get(user::get_me))
        .route("/v1/user/exists", axum::routing::get(user::check_user_exists))
        .route("/v1/user/profile", axum::routing::put(user::update_profile))
        .route(
            "/v1/user/profile/protein-target",
            axum::routing::put(user::update_protein_target),
        )
        // Daily Logs
        .route("/v1/logs/today", axum::routing::get(logs::get_today))
        .route("/v1/logs/today", axum::routing::put(logs::upsert_today))
        .route("/v1/logs", axum::routing::get(logs::get_range))
        .route("/v1/logs/streak", axum::routing::get(logs::get_streak))
        // Coach Sessions
        .route(
            "/v1/coach/sessions",
            axum::routing::get(coach_sessions::list).post(coach_sessions::create),
        )
        .route(
            "/v1/coach/sessions/{id}",
            axum::routing::get(coach_sessions::get).delete(coach_sessions::delete),
        )
        // AI Plans (daily cached)
        .route("/v1/meal/today", axum::routing::get(ai_plans::get_meal_plan).put(ai_plans::upsert_meal_plan))
        .route("/v1/workout/today", axum::routing::get(ai_plans::get_workout_plan).put(ai_plans::upsert_workout_plan))
        // AI Tools advice (daily cached)
        .route("/v1/tools/bmi-advice", axum::routing::get(ai_plans::get_bmi_advice).put(ai_plans::upsert_bmi_advice))
        .route("/v1/tools/sleep-advice", axum::routing::get(ai_plans::get_sleep_advice).put(ai_plans::upsert_sleep_advice))
        .route("/v1/tools/injury-advice", axum::routing::get(ai_plans::get_injury_advice).put(ai_plans::upsert_injury_advice))
        .route("/v1/tools/form-advice", axum::routing::get(ai_plans::get_form_advice).put(ai_plans::upsert_form_advice))
        // Payments (Epic 7)
        .route(
            "/v1/subscriptions/checkout",
            axum::routing::post(payments::checkout),
        )
        .route(
            "/v1/webhooks/polar",
            axum::routing::post(payments::webhook_handler),
        )
        .with_state(state)
}
