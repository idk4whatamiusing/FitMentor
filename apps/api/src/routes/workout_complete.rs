use axum::{extract::State, Json};
use chrono::Utc;
use serde::Deserialize;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::AppState;

#[derive(Deserialize)]
pub struct WorkoutCompleteRequest {
    pub day_index: i16,
    pub title: String,
}

/// POST /v1/workout/complete — mark a workout day as completed.
pub async fn complete(
    State(state): State<AppState>,
    AuthUser { user_id, .. }: AuthUser,
    Json(req): Json<WorkoutCompleteRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    let today = Utc::now().date_naive();

    sqlx::query(
        "INSERT INTO workout_completions (user_id, date, day_index, title)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date, day_index) DO NOTHING",
    )
    .bind(&user_id)
    .bind(today)
    .bind(req.day_index)
    .bind(&req.title)
    .execute(&state.pool)
    .await?;

    Ok(Json(serde_json::json!({"ok": true})))
}
