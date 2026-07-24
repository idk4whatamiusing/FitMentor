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
    pub session_id: Option<String>,
}

/// POST /v1/coach/log — append messages to chat_session, forward to Python ingest.
pub async fn log(
    State(state): State<AppState>,
    AuthUser { user_id, .. }: AuthUser,
    Json(req): Json<CoachLogRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Append messages to chat_sessions if session_id provided
    if let Some(sid) = &req.session_id {
        if let Ok(uuid) = sid.parse::<uuid::Uuid>() {
            sqlx::query(
                "UPDATE chat_sessions
                 SET messages = COALESCE(messages, '[]'::jsonb) || $1::jsonb,
                     updated_at = now()
                 WHERE id = $2 AND user_id = $3",
            )
            .bind(&serde_json::json!([
                {"role": "user", "content": &req.user_message},
                {"role": "assistant", "content": &req.reply}
            ]))
            .bind(uuid)
            .bind(&user_id)
            .execute(&state.pool)
            .await?;
        }
    }

    // Store reference in coach_logs
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

    // Forward to Python ingest for Supermemory
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
