//! Workout completions.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::error::{ApiError, ApiResult};

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

async fn user_id_for(pool: &PgPool, cf_sub: &str) -> ApiResult<String> {
    sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE cf_access_sub = $1")
        .bind(cf_sub)
        .fetch_optional(pool)
        .await?
        .ok_or(ApiError::Unauthorized)
}

pub async fn complete(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let day_index = body.get("day_index").and_then(Value::as_i64).unwrap_or(-1);
    if day_index < 0 {
        return Err(ApiError::BadRequest("missing day_index".into()));
    }
    let title = body.get("title").and_then(Value::as_str).unwrap_or("");

    let uid = user_id_for(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;
    let id = Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO workout_completions (id, user_id, date, day_index, title) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, date, day_index) DO NOTHING",
    )
    .bind(&id)
    .bind(&uid)
    .bind(today())
    .bind(day_index)
    .bind(title)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize, sqlx::FromRow)]
struct CompletionRow {
    day_index: i64,
    title: String,
}

pub async fn completions(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let uid = user_id_for(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;

    let rows = sqlx::query_as::<_, CompletionRow>(
        "SELECT day_index, title FROM workout_completions WHERE user_id = $1 AND date = $2",
    )
    .bind(&uid)
    .bind(today())
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({
        "data": { "completions": rows.iter().map(|r| json!({"day_index": r.day_index, "title": r.title})).collect::<Vec<_>>() }
    })))
}
