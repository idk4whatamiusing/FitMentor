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

macro_rules! make_handlers {
    ($table:ident, $get_fn:ident, $upsert_fn:ident) => {
        pub async fn $get_fn(
            auth: AuthUser,
            State(state): State<AppState>,
        ) -> Result<Response, AppError> {
            let today = Utc::now().date_naive();
            let table = stringify!($table);
            let row = sqlx::query_as::<_, PlanRow>(
                &format!("SELECT plan FROM {table} WHERE user_id = $1 AND date = $2"),
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

        pub async fn $upsert_fn(
            auth: AuthUser,
            State(state): State<AppState>,
            AxumJson(payload): AxumJson<UpsertPlan>,
        ) -> Result<Response, AppError> {
            let today = Utc::now().date_naive();
            let table = stringify!($table);

            sqlx::query(
                &format!(
                    "INSERT INTO {table} (user_id, date, plan) VALUES ($1, $2, $3) ON CONFLICT (user_id, date) DO UPDATE SET plan = $3, updated_at = now()"
                ),
            )
            .bind(&auth.user_id)
            .bind(today)
            .bind(&payload.plan)
            .execute(&state.pool)
            .await?;

            let resp = serde_json::json!({ "data": { "ok": true } });
            Ok((StatusCode::OK, AxumJson(resp)).into_response())
        }
    };
}

make_handlers!(meal_plans, get_meal_plan, upsert_meal_plan);
make_handlers!(workout_plans, get_workout_plan, upsert_workout_plan);
make_handlers!(bmi_advice, get_bmi_advice, upsert_bmi_advice);
make_handlers!(sleep_advice, get_sleep_advice, upsert_sleep_advice);
make_handlers!(injury_advice, get_injury_advice, upsert_injury_advice);
make_handlers!(form_advice, get_form_advice, upsert_form_advice);
