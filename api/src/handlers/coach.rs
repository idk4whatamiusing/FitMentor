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
use crate::handlers::{planner, quota};
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

#[derive(sqlx::FromRow)]
struct ChatProfile {
    name: Option<String>,
    age: Option<i64>,
    gender: Option<String>,
    height_cm: Option<i64>,
    weight_kg: Option<i64>,
    goal: Option<String>,
    place: Option<String>,
    experience: Option<String>,
    diet: Option<String>,
    days_per_week: Option<i64>,
    budget_per_day: Option<i64>,
    health_conditions: Option<String>,
}

fn chat_system_prompt(profile: Option<&ChatProfile>) -> String {
    let mut system = String::from(
        "You are FitMentor, a warm, no-nonsense AI fitness coach for Indian gym beginners and students.\n\
         Rules:\n\
         - Be concise. Use short paragraphs and bullet points. Never write essays.\n\
         - Use simple words. Explain jargon when you use it.\n\
         - Suggest affordable Indian foods (dal, eggs, paneer, soya, milk, chicken, rice, roti).\n\
         - Currency is INR; units are kg, cm, ml.\n\
         - Never recommend extreme diets or unsafe lifts. Suggest seeing a doctor for medical issues.\n\
         - Don't push supplements. Whey is optional.\n\
         - Always end with one clear next step the user can do today.\n",
    );
    if let Some(profile) = profile {
        system.push_str(&format!(
            "\nUser profile:\n- Name: {}\n- Age: {:?}, Gender: {:?}\n- Height: {:?} cm, Weight: {:?} kg\n- Goal: {:?}, Experience: {:?}\n- Trains: {:?} ({} days/week)\n- Diet: {:?}, Food budget: INR {:?}/day\n- Health conditions: {}\n",
            profile.name.as_deref().unwrap_or("Friend"),
            profile.age,
            profile.gender.as_deref().unwrap_or("unknown"),
            profile.height_cm,
            profile.weight_kg,
            profile.goal.as_deref().unwrap_or("general"),
            profile.experience.as_deref().unwrap_or("beginner"),
            profile.place.as_deref().unwrap_or("gym"),
            profile.days_per_week.unwrap_or(4),
            profile.diet.as_deref().unwrap_or("veg"),
            profile.budget_per_day.unwrap_or(150),
            profile.health_conditions.as_deref().unwrap_or("[]"),
        ));
    }
    system
}

fn chat_prompt(messages: &[Value], message: &str) -> String {
    let mut prompt = String::from("Conversation so far:\n");
    for item in messages.iter().rev().take(10).rev() {
        let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
        let content = item.get("content").and_then(Value::as_str).unwrap_or("");
        prompt.push_str(&format!("{role}: {content}\n"));
    }
    prompt.push_str(&format!("user: {message}\nassistant:"));
    prompt
}

/// POST /v1/coach/chat — mobile chat turn (quota + Workers AI + session log).
pub async fn chat(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    let session_id = body.get("session_id").and_then(Value::as_str).unwrap_or("");
    let message = body
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if session_id.is_empty() || message.is_empty() {
        return Err(ApiError::BadRequest("missing session_id or message".into()));
    }
    if message.chars().count() > 2000 {
        return Err(ApiError::BadRequest("message is too long".into()));
    }

    let row = sqlx::query_as::<_, SessionRow>(
        "SELECT id, user_id, title, messages, created_at, updated_at
         FROM chat_sessions WHERE id = $1 AND user_id = $2",
    )
    .bind(session_id)
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(ApiError::NotFound)?;

    let mut messages: Vec<Value> = serde_json::from_str(&row.messages).unwrap_or_default();

    let tier = sqlx::query_scalar::<_, String>(
        "SELECT s.tier FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE u.cf_access_sub = $1 AND s.status IN ('active', 'past_due')
         ORDER BY s.updated_at DESC LIMIT 1",
    )
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?
    .unwrap_or_else(|| "free".to_string());

    let quota = quota::check_and_consume_inner(&state.pool, &auth_user.user_id, &tier).await?;
    if !quota.allowed {
        return Err(ApiError::BadRequest(format!(
            "Daily AI limit reached ({} / {}).",
            quota.used, quota.limit
        )));
    }

    let profile = sqlx::query_as::<_, ChatProfile>(
        "SELECT p.name, p.age, p.gender, p.height_cm, p.weight_kg, p.goal, p.place,
                p.experience, p.diet, p.days_per_week, p.budget_per_day, p.health_conditions
         FROM profiles p JOIN users u ON u.id = p.user_id
         WHERE u.cf_access_sub = $1",
    )
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    let system = chat_system_prompt(profile.as_ref());
    let prompt = chat_prompt(&messages, message);
    let Some(reply) = planner::call_ai(&state, &system, &prompt, 1024).await else {
        return Err(ApiError::Internal(
            "AI is unavailable right now. Please try again.".into(),
        ));
    };

    messages.push(json!({ "role": "user", "content": message }));
    messages.push(json!({ "role": "assistant", "content": reply }));
    let encoded = serde_json::to_string(&messages)
        .map_err(|error| ApiError::Internal(format!("Could not save chat: {error}")))?;
    let title = if row.title == "New Chat" {
        message.chars().take(40).collect::<String>()
    } else {
        row.title.clone()
    };

    sqlx::query(
        "UPDATE chat_sessions SET messages = $1, title = $2, updated_at = now()::text
         WHERE id = $3 AND user_id = $4",
    )
    .bind(&encoded)
    .bind(&title)
    .bind(session_id)
    .bind(&auth_user.user_id)
    .execute(&state.pool)
    .await?;

    let log_id = Uuid::new_v4().to_string();
    let _ = sqlx::query(
        "INSERT INTO coach_logs (id, user_id, container_tag) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, container_tag) DO NOTHING",
    )
    .bind(log_id)
    .bind(&auth_user.user_id)
    .bind(&auth_user.user_id)
    .execute(&state.pool)
    .await;

    Ok(Json(json!({
        "reply": reply,
        "used": quota.used,
        "limit": quota.limit,
    })))
}
