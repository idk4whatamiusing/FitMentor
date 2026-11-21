//! Shared application state and the Axum router.

use std::sync::Arc;

use axum::extract::State;
use axum::http::HeaderMap;
use axum::routing::{delete, get, patch, post, put};
use axum::{Json, Router};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::handlers::{coach, community, logs, payments, planner, plans, quota, user, workout};

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub http: reqwest::Client,
}

impl AppState {
    pub async fn from_env() -> Result<Self, String> {
        let config = Config::from_env()?;
        let pool = crate::db::connect(&config.database_url)
            .await
            .map_err(|error| format!("database connect failed: {error}"))?;
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|error| format!("http client failed: {error}"))?;
        Ok(Self {
            pool,
            config: Arc::new(config),
            http,
        })
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok", "version": "1.0.0" }))
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", get(health))
        // user
        .route("/v1/user/me", get(user::get_me))
        .route("/v1/user/exists", get(user::exists))
        .route("/v1/user/profile", put(user::update_profile))
        .route(
            "/v1/user/profile/protein-target",
            put(user::update_protein_target),
        )
        .route("/v1/user/sync", post(user::sync))
        // payments
        .route("/v1/subscriptions/checkout", post(payments::checkout))
        .route("/v1/user/subscription", get(payments::get_subscription))
        .route("/v1/webhooks/polar", post(payments::webhook))
        // logs
        .route("/v1/logs/today", get(logs::get_today))
        .route("/v1/logs/today", put(logs::upsert_today))
        .route("/v1/logs/streak", get(logs::streak))
        .route("/v1/logs", get(logs::range))
        // coach
        .route("/v1/coach/sessions", get(coach::list))
        .route("/v1/coach/sessions", post(coach::create))
        .route("/v1/coach/sessions/{id}", get(coach::get))
        .route("/v1/coach/sessions/{id}", delete(coach::delete))
        .route("/v1/coach/sessions/{id}", patch(coach::rename))
        .route("/v1/coach/log", post(coach::log))
        // community
        .route("/v1/community/graphql", post(community::graphql))
        // plans / advice
        .route("/v1/meal/today", get(meal_get))
        .route("/v1/meal/today", put(meal_upsert))
        .route("/v1/workout/today", get(workout_plan_get))
        .route("/v1/workout/today", put(workout_plan_upsert))
        .route("/v1/tools/bmi-advice", get(bmi_get))
        .route("/v1/tools/bmi-advice", put(bmi_upsert))
        .route("/v1/tools/sleep-advice", get(sleep_get))
        .route("/v1/tools/sleep-advice", put(sleep_upsert))
        .route("/v1/tools/injury-advice", get(injury_get))
        .route("/v1/tools/injury-advice", put(injury_upsert))
        .route("/v1/tools/form-advice", get(form_get))
        .route("/v1/tools/form-advice", put(form_upsert))
        // workouts
        .route("/v1/workout/complete", post(workout::complete))
        .route("/v1/workout/completions", get(workout::completions))
        // internal quota
        .route(
            "/v1/internal/quota/check-and-consume",
            post(quota::check_and_consume),
        )
        // manual planner trigger (key protected)
        .route("/v1/planner/generate", post(generate_plans))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
}

async fn generate_plans(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> crate::error::ApiResult {
    crate::auth::require_api_key(&headers, &state.config)?;
    let parsed: Value = serde_json::from_slice(&body).unwrap_or_else(|_| json!({}));
    match parsed.get("user_id").and_then(Value::as_str) {
        Some(user_id) if !user_id.is_empty() => {
            planner::run_for_user(&state, user_id).await;
            Ok(Json(json!({ "ok": true, "user_id": user_id })))
        }
        _ => {
            planner::run_batch(&state).await;
            Ok(Json(json!({ "ok": true, "mode": "batch" })))
        }
    }
}

// ---------------------------------------------------------------------------
// Thin wrappers for endpoints that share a handler with a fixed table name.
// ---------------------------------------------------------------------------

macro_rules! plan_routes {
    ($get_fn:ident, $put_fn:ident, $table:literal) => {
        async fn $get_fn(
            State(state): State<AppState>,
            headers: HeaderMap,
        ) -> crate::error::ApiResult {
            plans::get(&state, &headers, $table).await
        }

        async fn $put_fn(
            State(state): State<AppState>,
            headers: HeaderMap,
            body: axum::body::Bytes,
        ) -> crate::error::ApiResult {
            plans::upsert(&state, &headers, $table, &body).await
        }
    };
}

plan_routes!(meal_get, meal_upsert, "meal_plans");
plan_routes!(workout_plan_get, workout_plan_upsert, "workout_plans");
plan_routes!(bmi_get, bmi_upsert, "bmi_advice");
plan_routes!(sleep_get, sleep_upsert, "sleep_advice");
plan_routes!(injury_get, injury_upsert, "injury_advice");
plan_routes!(form_get, form_upsert, "form_advice");
