//! Daily logs + streak.

use axum::body::Bytes;
use axum::extract::{Query, State};
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
use crate::models::DailyLogRow;

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

const LOG_COLS: &str = "id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg, created_at, updated_at";

pub async fn get_today(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let uid = user_id_for(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;

    let row = sqlx::query_as::<_, DailyLogRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {LOG_COLS} FROM daily_logs WHERE user_id = $1 AND date = $2"
    )))
    .bind(&uid)
    .bind(today())
    .fetch_optional(&state.pool)
    .await?;

    Ok(Json(json!({ "data": { "log": row.map(|r| r.to_json()) } })))
}

pub async fn upsert_today(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    let uid = user_id_for(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;

    let id = Uuid::new_v4().to_string();
    // Partial update: a missing field keeps its stored value instead of resetting to 0.
    let water = body.get("water").and_then(Value::as_i64);
    let sleep = body
        .get("sleep")
        .and_then(Value::as_f64)
        .map(|value| value.round() as i64);
    let steps = body.get("steps").and_then(Value::as_i64);
    let protein = body
        .get("proteinG")
        .and_then(Value::as_f64)
        .map(|value| value.round() as i64);
    let done = body
        .get("workoutDone")
        .and_then(Value::as_bool)
        .map(|value| if value { 1_i64 } else { 0_i64 });
    let weight = body.get("weightKg").and_then(Value::as_f64);

    sqlx::query(
        "INSERT INTO daily_logs (id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg)
         VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, 0), COALESCE($6, 0), COALESCE($7, 0), COALESCE($8, 0), $9)
         ON CONFLICT (user_id, date) DO UPDATE SET
            water = COALESCE($4, daily_logs.water),
            sleep = COALESCE($5, daily_logs.sleep),
            steps = COALESCE($6, daily_logs.steps),
            protein_g = COALESCE($7, daily_logs.protein_g),
            workout_done = COALESCE($8, daily_logs.workout_done),
            weight_kg = COALESCE($9, daily_logs.weight_kg),
            updated_at = now()::text",
    )
    .bind(&id)
    .bind(&uid)
    .bind(today())
    .bind(water)
    .bind(sleep)
    .bind(steps)
    .bind(protein)
    .bind(done)
    .bind(weight)
    .execute(&state.pool)
    .await?;

    let row = sqlx::query_as::<_, DailyLogRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {LOG_COLS} FROM daily_logs WHERE user_id = $1 AND date = $2"
    )))
    .bind(&uid)
    .bind(today())
    .fetch_optional(&state.pool)
    .await?;

    Ok(Json(json!({ "data": { "log": row.map(|r| r.to_json()) } })))
}

#[derive(Deserialize)]
pub struct SyncRequest {
    logs: Vec<Value>,
}

pub async fn sync(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SyncRequest>,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let uid = user_id_for(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;

    let mut inserted = 0_i64;
    for item in body.logs.iter().take(400) {
        let Some(date) = item.get("date").and_then(Value::as_str) else {
            continue;
        };
        if chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").is_err() {
            continue;
        }
        let id = Uuid::new_v4().to_string();
        let water = item.get("water").and_then(Value::as_i64).unwrap_or(0);
        let sleep = item
            .get("sleep")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .round() as i64;
        let steps = item.get("steps").and_then(Value::as_i64).unwrap_or(0);
        let protein = item
            .get("proteinG")
            .and_then(Value::as_f64)
            .unwrap_or(0.0)
            .round() as i64;
        let workout = item
            .get("workoutDone")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let weight = item.get("weightKg").and_then(Value::as_f64);

        let result = sqlx::query(
            "INSERT INTO daily_logs (id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (user_id, date) DO UPDATE SET
                water = excluded.water,
                sleep = excluded.sleep,
                steps = excluded.steps,
                protein_g = excluded.protein_g,
                workout_done = excluded.workout_done,
                weight_kg = excluded.weight_kg,
                updated_at = now()::text
             WHERE daily_logs.water = 0
               AND daily_logs.sleep = 0
               AND daily_logs.steps = 0
               AND daily_logs.protein_g = 0
               AND daily_logs.workout_done = 0
               AND daily_logs.weight_kg IS NULL",
        )
        .bind(&id)
        .bind(&uid)
        .bind(date)
        .bind(water)
        .bind(sleep)
        .bind(steps)
        .bind(protein)
        .bind(if workout { 1_i64 } else { 0_i64 })
        .bind(weight)
        .execute(&state.pool)
        .await?;
        inserted += result.rows_affected() as i64;
    }

    Ok(Json(json!({ "data": { "inserted": inserted } })))
}

#[derive(Deserialize)]
pub struct RangeQuery {
    from: Option<String>,
    to: Option<String>,
}

pub async fn range(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<RangeQuery>,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let (from, to) = match (query.from, query.to) {
        (Some(from), Some(to)) if !from.is_empty() && !to.is_empty() => (from, to),
        _ => return Err(ApiError::BadRequest("missing from/to".into())),
    };
    let uid = user_id_for(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;

    let rows = sqlx::query_as::<_, DailyLogRow>(sqlx::AssertSqlSafe(format!(
        "SELECT {LOG_COLS} FROM daily_logs WHERE user_id = $1 AND date >= $2 AND date <= $3 ORDER BY date DESC"
    )))
    .bind(&uid)
    .bind(&from)
    .bind(&to)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(json!({
        "data": { "logs": rows.iter().map(|r| r.to_json()).collect::<Vec<_>>() }
    })))
}

pub async fn streak(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let uid = user_id_for(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;

    let rows = sqlx::query_as::<_, (String, i64, i64, i64)>(
        "SELECT date, water, protein_g, workout_done FROM daily_logs
         WHERE user_id = $1 ORDER BY date DESC LIMIT 400",
    )
    .bind(&uid)
    .fetch_all(&state.pool)
    .await?;

    let mut streak: i64 = 0;
    let mut expected = today();
    for (date, water, protein, workout_done) in &rows {
        if date != &expected {
            break;
        }
        if *workout_done != 0 || *water >= 6 || *protein > 0 {
            streak += 1;
            if let Ok(parsed) = chrono::NaiveDate::parse_from_str(&expected, "%Y-%m-%d") {
                expected = (parsed - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string();
            }
        } else {
            break;
        }
    }

    Ok(Json(json!({ "data": { "streak": streak } })))
}
