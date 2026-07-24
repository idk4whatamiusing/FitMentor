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

macro_rules! make_get_handlers {
    ($table:ident, $get_fn:ident) => {
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
    };
}

make_get_handlers!(meal_plans, get_meal_plan);
make_get_handlers!(workout_plans, get_workout_plan);
make_get_handlers!(bmi_advice, get_bmi_advice);
make_get_handlers!(sleep_advice, get_sleep_advice);
make_get_handlers!(injury_advice, get_injury_advice);
make_get_handlers!(form_advice, get_form_advice);

macro_rules! make_upsert_handlers {
    ($table:ident, $upsert_fn:ident) => {
        pub async fn $upsert_fn(
            auth: AuthUser,
            State(state): State<AppState>,
            AxumJson(input): AxumJson<UpsertPlan>,
        ) -> Result<Response, AppError> {
            let today = Utc::now().date_naive();
            let table = stringify!($table);
            let user_id = auth.user_id.clone();

            sqlx::query(&format!(
                "INSERT INTO {table} (user_id, date, plan) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, date) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()"
            ))
            .bind(&user_id)
            .bind(today)
            .bind(&input.plan)
            .execute(&state.pool)
            .await?;

            let resp = serde_json::json!({ "data": { "plan": input.plan } });
            Ok((StatusCode::OK, AxumJson(resp)).into_response())
        }
    };
}

make_upsert_handlers!(meal_plans, upsert_meal_plan);
make_upsert_handlers!(workout_plans, upsert_workout_plan);
make_upsert_handlers!(bmi_advice, upsert_bmi_advice);
make_upsert_handlers!(sleep_advice, upsert_sleep_advice);
make_upsert_handlers!(injury_advice, upsert_injury_advice);
make_upsert_handlers!(form_advice, upsert_form_advice);
