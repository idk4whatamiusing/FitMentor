//! Daily AI plans/advice: one row per (user, date).
//!
//! `table` is always a compile-time constant from `app.rs` (never user input).

use axum::body::Bytes;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::error::{ApiError, ApiResult};

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

pub async fn get(state: &AppState, headers: &HeaderMap, table: &str) -> ApiResult {
    let auth_user = auth::require_user(headers, &state.config)?;
    let sql = format!("SELECT plan FROM {table} WHERE user_id = $1 AND date = $2");
    let plan = sqlx::query_scalar::<_, String>(sqlx::AssertSqlSafe(sql))
        .bind(&auth_user.user_id)
        .bind(today())
        .fetch_optional(&state.pool)
        .await?;

    match plan {
        Some(plan) => {
            let plan: Value = serde_json::from_str(&plan).unwrap_or(Value::Null);
            Ok(Json(json!({ "data": { "plan": plan } })))
        }
        None => Err(ApiError::NotFound),
    }
}

pub async fn upsert(state: &AppState, headers: &HeaderMap, table: &str, body: &Bytes) -> ApiResult {
    let auth_user = auth::require_user(headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    let plan = match body.get("plan") {
        Some(plan) => plan.to_string(),
        None => return Err(ApiError::BadRequest("missing plan".into())),
    };

    let id = Uuid::new_v4().to_string();
    let sql = format!(
        "INSERT INTO {table} (id, user_id, date, plan) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date) DO UPDATE SET plan = excluded.plan, updated_at = now()::text"
    );
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(&id)
        .bind(&auth_user.user_id)
        .bind(today())
        .bind(&plan)
        .execute(&state.pool)
        .await?;

    let plan_value: Value = serde_json::from_str(&plan).unwrap_or(Value::Null);
    Ok(Json(json!({ "data": { "plan": plan_value } })))
}
