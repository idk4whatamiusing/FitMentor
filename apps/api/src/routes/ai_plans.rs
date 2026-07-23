use axum::extract::{State, Json as AxumJson};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use chrono::Utc;
use serde::Deserialize;
use serde_json::Value;
use sqlx::FromRow;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct UpsertPlan {
    pub plan: Value,
}

#[derive(Debug, FromRow)]
struct PlanRow {
    plan: Value,
}

pub async fn get_meal_plan(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let today = Utc::now().date_naive();
    let row = sqlx::query_as::<_, PlanRow>(
        r#"SELECT plan FROM meal_plans WHERE user_id = $1 AND date = $2"#,
    )
    .bind(&auth.user_id)
    .bind(today)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => {
            let resp = serde_json::json!({ "data": { "plan": r.plan } });
            Ok((StatusCode::OK, AxumJson(resp)).into_response())
        }
        None => Err(AppError::NotFound),
    }
}

pub async fn upsert_meal_plan(
    auth: AuthUser,
    State(state): State<AppState>,
    AxumJson(payload): AxumJson<UpsertPlan>,
) -> Result<Response, AppError> {
    let today = Utc::now().date_naive();

    sqlx::query(
        r#"INSERT INTO meal_plans (user_id, date, plan)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, date) DO UPDATE SET
               plan = $3,
               updated_at = now()"#,
    )
    .bind(&auth.user_id)
    .bind(today)
    .bind(&payload.plan)
    .execute(&state.pool)
    .await?;

    let resp = serde_json::json!({ "data": { "ok": true } });
    Ok((StatusCode::OK, AxumJson(resp)).into_response())
}

pub async fn get_workout_plan(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let today = Utc::now().date_naive();
    let row = sqlx::query_as::<_, PlanRow>(
        r#"SELECT plan FROM workout_plans WHERE user_id = $1 AND date = $2"#,
    )
    .bind(&auth.user_id)
    .bind(today)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(r) => {
            let resp = serde_json::json!({ "data": { "plan": r.plan } });
            Ok((StatusCode::OK, AxumJson(resp)).into_response())
        }
        None => Err(AppError::NotFound),
    }
}

pub async fn upsert_workout_plan(
    auth: AuthUser,
    State(state): State<AppState>,
    AxumJson(payload): AxumJson<UpsertPlan>,
) -> Result<Response, AppError> {
    let today = Utc::now().date_naive();

    sqlx::query(
        r#"INSERT INTO workout_plans (user_id, date, plan)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, date) DO UPDATE SET
               plan = $3,
               updated_at = now()"#,
    )
    .bind(&auth.user_id)
    .bind(today)
    .bind(&payload.plan)
    .execute(&state.pool)
    .await?;

    let resp = serde_json::json!({ "data": { "ok": true } });
    Ok((StatusCode::OK, AxumJson(resp)).into_response())
}
