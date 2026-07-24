use axum::extract::{State, Query, Json as AxumJson};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::{NaiveDate, Utc};
use serde::Deserialize;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::daily_log::{DailyLog, UpdateDailyLog};
use crate::models::user::User;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct DateRangeQuery {
    pub from: NaiveDate,
    pub to: NaiveDate,
}

async fn get_user_id(pool: &sqlx::PgPool, cf_sub: &str) -> Result<User, AppError> {
    sqlx::query_as::<_, User>(
        r#"SELECT id, cf_access_sub, email, name, created_at, updated_at
           FROM users WHERE cf_access_sub = $1"#,
    )
    .bind(cf_sub)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub async fn get_today(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let user = get_user_id(&state.pool, &auth.user_id).await?;

    let cache_key = format!("cache:today:{}", user.id);
    if let Some(cached) = state.cache.get(&cache_key).await {
        if let Ok(body) = serde_json::from_str::<serde_json::Value>(&cached) {
            return Ok((StatusCode::OK, AxumJson(body)).into_response());
        }
    }

    let today = Utc::now().date_naive();

    let log = sqlx::query_as::<_, DailyLog>(
        r#"SELECT id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg,
                  created_at, updated_at
           FROM daily_logs WHERE user_id = $1 AND date = $2"#,
    )
    .bind(user.id)
    .bind(today)
    .fetch_optional(&state.pool)
    .await?;

    let response = serde_json::json!({ "data": { "log": log } });
    state.cache.set(&cache_key, &response.to_string(), 30).await;

    Ok((StatusCode::OK, AxumJson(response)).into_response())
}

pub async fn upsert_today(
    auth: AuthUser,
    State(state): State<AppState>,
    AxumJson(input): AxumJson<UpdateDailyLog>,
) -> Result<Response, AppError> {
    let user = get_user_id(&state.pool, &auth.user_id).await?;
    let today = Utc::now().date_naive();

    let log = sqlx::query_as::<_, DailyLog>(
        r#"INSERT INTO daily_logs (user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, date) DO UPDATE SET
               water = COALESCE($3, daily_logs.water),
               sleep = COALESCE($4, daily_logs.sleep),
               steps = COALESCE($5, daily_logs.steps),
               protein_g = COALESCE($6, daily_logs.protein_g),
               workout_done = COALESCE($7, daily_logs.workout_done),
               weight_kg = COALESCE($8, daily_logs.weight_kg),
               updated_at = now()
           RETURNING id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg,
                     created_at, updated_at"#,
    )
    .bind(user.id)
    .bind(today)
    .bind(input.water.unwrap_or(0))
    .bind(input.sleep.unwrap_or(0))
    .bind(input.steps.unwrap_or(0))
    .bind(input.protein_g.unwrap_or(0))
    .bind(input.workout_done.unwrap_or(false))
    .bind(input.weight_kg)
    .fetch_one(&state.pool)
    .await?;

    state.cache.invalidate_today(&user.id.to_string()).await;
    state.cache.delete(&format!("cache:today:{}", auth.user_id)).await;

    let response = serde_json::json!({ "data": { "log": log } });
    Ok((StatusCode::OK, AxumJson(response)).into_response())
}

pub async fn get_range(
    auth: AuthUser,
    State(state): State<AppState>,
    Query(query): Query<DateRangeQuery>,
) -> Result<Response, AppError> {
    let user = get_user_id(&state.pool, &auth.user_id).await?;

    let logs = sqlx::query_as::<_, DailyLog>(
        r#"SELECT id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg,
                  created_at, updated_at
           FROM daily_logs
           WHERE user_id = $1 AND date >= $2 AND date <= $3
           ORDER BY date DESC"#,
    )
    .bind(user.id)
    .bind(query.from)
    .bind(query.to)
    .fetch_all(&state.pool)
    .await?;

    let response = serde_json::json!({ "data": { "logs": logs } });
    Ok((StatusCode::OK, AxumJson(response)).into_response())
}

#[derive(Debug, sqlx::FromRow)]
struct DateRow {
    date: NaiveDate,
}

pub async fn get_streak(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let cache_key = format!("cache:streak:{}", auth.user_id);
    if let Some(cached) = state.cache.get(&cache_key).await {
        if let Ok(body) = serde_json::from_str::<serde_json::Value>(&cached) {
            return Ok((StatusCode::OK, AxumJson(body)).into_response());
        }
    }

    let user = get_user_id(&state.pool, &auth.user_id).await?;

    let rows = sqlx::query_as::<_, DateRow>(
        r#"SELECT date FROM daily_logs
           WHERE user_id = $1 AND workout_done = true
           ORDER BY date DESC
           LIMIT 100"#,
    )
    .bind(user.id)
    .fetch_all(&state.pool)
    .await?;

    let mut streak: i32 = 0;
    let mut expected = Utc::now().date_naive();
    for row in &rows {
        if row.date == expected {
            streak += 1;
            expected = expected - chrono::Duration::days(1);
        } else {
            break;
        }
    }

    let response = serde_json::json!({ "data": { "streak": streak } });
    state.cache.set(&cache_key, &response.to_string(), 60).await;

    Ok((StatusCode::OK, AxumJson(response)).into_response())
}
