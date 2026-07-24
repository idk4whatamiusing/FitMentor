use axum::{extract::State, Json};
use serde::Deserialize;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::AppState;

#[derive(Deserialize)]
pub struct CoachLogRequest {
    pub user_message: String,
    pub reply: String,
    pub container_tag: String,
}

/// POST /v1/coach/log — store container_tag in Postgres, forward conversation to Python ingest.
pub async fn log(
    State(state): State<AppState>,
    AuthUser { user_id, .. }: AuthUser,
    Json(req): Json<CoachLogRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Store only user_id + container_tag in Postgres
    sqlx::query(
        "INSERT INTO coach_logs (user_id, container_tag, messages)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING",
    )
    .bind(&user_id)
    .bind(&req.container_tag)
    .bind(&serde_json::json!([]))
    .execute(&state.pool)
    .await?;

    // Forward to Python ingest service for Supermemory
    let ingest_url = std::env::var("INGEST_URL").unwrap_or_else(|_| "http://ingest:8001".into());
    let content = format!("User: {}\nCoach: {}", req.user_message, req.reply);
    let container_tag = req.container_tag.clone();
    tokio::spawn(async move {
        let _ = reqwest::Client::new()
            .post(format!("{}/v1/ingest", ingest_url))
            .json(&serde_json::json!({
                "container_tag": container_tag,
                "content": content,
            }))
            .send()
            .await;
    });

    Ok(Json(serde_json::json!({"ok": true})))
}
