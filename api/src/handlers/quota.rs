//! AI quota — 10,000 unit pool split fairly across active users, weighted by
//! tier (free 1.0x, pro 1.4x, premium 2.0x).

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use chrono::Utc;
use serde_json::{json, Value};

use crate::app::AppState;
use crate::auth;
use crate::error::{ApiError, ApiResult};

const TOTAL_POOL: f64 = 10_000.0;

fn multiplier(tier: &str) -> f64 {
    match tier {
        "pro" => 1.4,
        "premium" => 2.0,
        _ => 1.0,
    }
}

fn tier_key(tier: &str) -> &'static str {
    match tier {
        "pro" => "pro",
        "premium" => "premium",
        _ => "free",
    }
}

pub async fn check_and_consume(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let tier = tier_key(body.get("tier").and_then(Value::as_str).unwrap_or("free"));
    let day = Utc::now().format("%Y-%m-%d").to_string();
    let uid = auth_user.user_id;

    let _ = sqlx::query(
        "INSERT INTO ai_quota_seen (user_id, day) VALUES ($1, $2)
         ON CONFLICT (user_id, day) DO NOTHING",
    )
    .bind(&uid)
    .bind(&day)
    .execute(&state.pool)
    .await;

    let active = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM ai_quota_seen WHERE day = $1")
        .bind(&day)
        .fetch_one(&state.pool)
        .await?
        .max(1);

    let weighted = active as f64 * multiplier(tier);
    let limit = if weighted > 0.0 {
        (TOTAL_POOL * multiplier(tier) / weighted).floor() as i64
    } else {
        TOTAL_POOL as i64
    }
    .max(1);

    let _ = sqlx::query(
        "INSERT INTO ai_quota (user_id, day, used) VALUES ($1, $2, 0)
         ON CONFLICT (user_id, day) DO NOTHING",
    )
    .bind(&uid)
    .bind(&day)
    .execute(&state.pool)
    .await;

    let used =
        sqlx::query_scalar::<_, i64>("SELECT used FROM ai_quota WHERE user_id = $1 AND day = $2")
            .bind(&uid)
            .bind(&day)
            .fetch_optional(&state.pool)
            .await?
            .unwrap_or(0);

    if used >= limit {
        return Ok(Json(json!({
            "allowed": false, "limit": limit, "used": used
        })));
    }

    sqlx::query("UPDATE ai_quota SET used = used + 1 WHERE user_id = $1 AND day = $2")
        .bind(&uid)
        .bind(&day)
        .execute(&state.pool)
        .await?;

    Ok(Json(json!({
        "allowed": true, "limit": limit, "used": used + 1
    })))
}
