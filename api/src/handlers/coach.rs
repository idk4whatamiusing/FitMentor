//! Coach sessions + coach log.

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::error::{ApiError, ApiResult};
use crate::models::SessionRow;

fn json_resp(value: Value) -> Json<Value> {
    Json(value)
}

pub async fn list(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let rows = sqlx::query_as::<_, SessionRow>(
        "SELECT id, user_id, title, messages, created_at, updated_at
         FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC",
    )
    .bind(&auth_user.user_id)
    .fetch_all(&state.pool)
    .await?;

    let items: Vec<Value> = rows
        .iter()
        .map(|row| {
            let count = serde_json::from_str::<Vec<Value>>(&row.messages)
                .map(|messages| messages.len())
                .unwrap_or(0);
            json!({
                "id": row.id,
                "title": row.title,
                "message_count": count,
                "created_at": row.created_at,
            })
        })
        .collect();

    Ok(json_resp(Value::Array(items)))
}

pub async fn create(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value = serde_json::from_slice(&body).unwrap_or_else(|_| json!({}));
    let title = body
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("New Chat")
        .to_string();

    let id = Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO chat_sessions (id, user_id, title) VALUES ($1, $2, $3)")
        .bind(&id)
        .bind(&auth_user.user_id)
        .bind(&title)
        .execute(&state.pool)
        .await?;

    Ok(json_resp(json!({ "id": id })))
}

pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let row = sqlx::query_as::<_, SessionRow>(
        "SELECT id, user_id, title, messages, created_at, updated_at
         FROM chat_sessions WHERE id = $1 AND user_id = $2",
    )
    .bind(&id)
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(row) => Ok(json_resp(json!({
            "id": row.id,
            "user_id": row.user_id,
            "title": row.title,
            "messages": serde_json::from_str::<Value>(&row.messages).unwrap_or(json!([])),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }))),
        None => Err(ApiError::NotFound),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let result = sqlx::query("DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2")
        .bind(&id)
        .bind(&auth_user.user_id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }
    Ok(json_resp(json!({ "ok": true })))
}

/// PATCH /v1/coach/sessions/:id — replaces the GraphQL `updateCoachSessionTitle`.
pub async fn rename(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let title = body
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let clean: String = title.chars().take(40).collect();
    if clean.is_empty() {
        return Err(ApiError::BadRequest("Title cannot be empty".into()));
    }

    let result = sqlx::query(
        "UPDATE chat_sessions SET title = $1, updated_at = now()::text WHERE id = $2 AND user_id = $3",
    )
    .bind(&clean)
    .bind(&id)
    .bind(&auth_user.user_id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound);
    }

    let row = sqlx::query_as::<_, SessionRow>(
        "SELECT id, user_id, title, messages, created_at, updated_at FROM chat_sessions WHERE id = $1",
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;

    Ok(json_resp(json!({
        "id": row.id,
        "user_id": row.user_id,
        "title": row.title,
        "messages": serde_json::from_str::<Value>(&row.messages).unwrap_or(json!([])),
    })))
}

/// POST /v1/coach/log — stores the container tag and appends the assistant reply.
pub async fn log(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let container_tag = body
        .get("container_tag")
        .and_then(Value::as_str)
        .unwrap_or("");
    let reply = body.get("reply").and_then(Value::as_str).unwrap_or("");
    let session_id = body
        .get("session_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    if container_tag.is_empty() {
        return Err(ApiError::BadRequest("missing container_tag".into()));
    }

    let row_id = Uuid::new_v4().to_string();
    let _ = sqlx::query(
        "INSERT INTO coach_logs (id, user_id, container_tag) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, container_tag) DO NOTHING",
    )
    .bind(&row_id)
    .bind(&auth_user.user_id)
    .bind(container_tag)
    .execute(&state.pool)
    .await;

    if !session_id.is_empty() {
        let mut messages: Vec<Value> = body
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        messages.push(json!({ "role": "assistant", "content": reply }));
        let encoded = serde_json::to_string(&messages).unwrap_or_else(|_| "[]".into());
        let _ = sqlx::query(
            "UPDATE chat_sessions SET messages = $1, updated_at = now()::text WHERE id = $2 AND user_id = $3",
        )
        .bind(&encoded)
        .bind(&session_id)
        .bind(&auth_user.user_id)
        .execute(&state.pool)
        .await;
    }

    Ok(json_resp(json!({ "ok": true })))
}
