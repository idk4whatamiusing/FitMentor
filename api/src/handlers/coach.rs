//! Coach sessions, messages, and chat.
//!
//! Messages live in `chat_messages` as rows with an embedding, which gives the
//! coach cross-session recall. `chat_sessions.messages` is still written as a
//! JSON mirror for older clients; reads prefer the rows and fall back to the
//! blob for sessions that predate the table.

use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::embeddings;
use crate::error::{ApiError, ApiResult};
use crate::handlers::{planner, quota};
use crate::memory;
use crate::models::SessionRow;

fn json_resp(value: Value) -> Json<Value> {
    Json(value)
}

/// Rows first, JSON blob as a fallback for sessions created before 0005.
async fn session_messages(state: &AppState, session_id: &str, user_id: &str) -> Vec<Value> {
    let rows = sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM chat_messages
         WHERE session_id = $1 AND user_id = $2 ORDER BY seq",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    if !rows.is_empty() {
        return rows
            .into_iter()
            .map(|(role, content)| json!({ "role": role, "content": content }))
            .collect();
    }

    let legacy: Option<String> =
        sqlx::query_scalar("SELECT messages FROM chat_sessions WHERE id = $1 AND user_id = $2")
            .bind(session_id)
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten();

    legacy
        .and_then(|raw| serde_json::from_str::<Vec<Value>>(&raw).ok())
        .unwrap_or_default()
}

async fn insert_messages(
    state: &AppState,
    session_id: &str,
    user_id: &str,
    items: &[(String, String)],
    vectors: &[Option<Vec<f32>>],
) -> Result<(), sqlx::Error> {
    if items.is_empty() {
        return Ok(());
    }

    let mut tx = state.pool.begin().await?;
    for (index, (role, content)) in items.iter().enumerate() {
        let id = Uuid::new_v4().to_string();
        let literal = vectors
            .get(index)
            .and_then(|vector| vector.as_ref())
            .map(|vector| embeddings::vector_literal(vector));

        sqlx::query(
            "INSERT INTO chat_messages (id, session_id, user_id, role, content, embedding)
             VALUES ($1, $2, $3, $4, $5, $6::vector)",
        )
        .bind(&id)
        .bind(session_id)
        .bind(user_id)
        .bind(role)
        .bind(content)
        .bind(literal)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
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

    let mut items = Vec::with_capacity(rows.len());
    for row in &rows {
        let stored: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM chat_messages WHERE session_id = $1 AND user_id = $2",
        )
        .bind(&row.id)
        .bind(&row.user_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or(0);

        let count = if stored > 0 {
            stored as usize
        } else {
            serde_json::from_str::<Vec<Value>>(&row.messages)
                .map(|messages| messages.len())
                .unwrap_or(0)
        };

        items.push(json!({
            "id": row.id,
            "title": row.title,
            "message_count": count,
            "created_at": row.created_at,
        }));
    }

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
        Some(row) => {
            let messages = session_messages(&state, &row.id, &row.user_id).await;
            Ok(json_resp(json!({
                "id": row.id,
                "user_id": row.user_id,
                "title": row.title,
                "messages": messages,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            })))
        }
        None => Err(ApiError::NotFound),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;

    let mut tx = state.pool.begin().await?;
    sqlx::query("DELETE FROM chat_messages WHERE session_id = $1 AND user_id = $2")
        .bind(&id)
        .bind(&auth_user.user_id)
        .execute(&mut *tx)
        .await?;
    let result = sqlx::query("DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2")
        .bind(&id)
        .bind(&auth_user.user_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

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

    let messages = session_messages(&state, &row.id, &row.user_id).await;
    Ok(json_resp(json!({
        "id": row.id,
        "user_id": row.user_id,
        "title": row.title,
        "messages": messages,
    })))
}

/// POST /v1/coach/context — memory block for the web path, which builds its
/// own prompt in the Pages worker.
pub async fn context(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    let session_id = body.get("session_id").and_then(Value::as_str).unwrap_or("");
    let message = body
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();

    if message.is_empty() {
        return Ok(json_resp(json!({ "context": "" })));
    }

    let embedding = embeddings::embed_one(&state, message).await;
    let recall = memory::load(
        &state,
        &auth_user.user_id,
        session_id,
        message,
        embedding.as_deref(),
    )
    .await;

    Ok(json_resp(json!({ "context": memory::render(&recall) })))
}

/// POST /v1/coach/log — web path: the reply was generated by the Pages worker.
pub async fn log(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let reply = body.get("reply").and_then(Value::as_str).unwrap_or("");
    let user_message = body
        .get("user_message")
        .and_then(Value::as_str)
        .unwrap_or("");
    let session_id = body
        .get("session_id")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    if session_id.is_empty() {
        return Ok(json_resp(json!({ "ok": true })));
    }

    let owned: Option<String> =
        sqlx::query_scalar("SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2")
            .bind(&session_id)
            .bind(&auth_user.user_id)
            .fetch_optional(&state.pool)
            .await?;
    if owned.is_none() {
        return Err(ApiError::NotFound);
    }

    let last = sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM chat_messages
         WHERE session_id = $1 AND user_id = $2 ORDER BY seq DESC LIMIT 1",
    )
    .bind(&session_id)
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    // Retries resend the same pair; don't duplicate either half.
    let already_stored = last
        .as_ref()
        .map(|(role, content)| role == "assistant" && content == reply)
        .unwrap_or(false);
    let user_already_stored = last
        .as_ref()
        .map(|(role, content)| role == "user" && content == user_message)
        .unwrap_or(false);

    if !already_stored {
        let mut items: Vec<(String, String)> = Vec::new();
        if !user_message.is_empty() && !user_already_stored {
            items.push(("user".to_string(), user_message.to_string()));
        }
        if !reply.is_empty() {
            items.push(("assistant".to_string(), reply.to_string()));
        }

        if !items.is_empty() {
            let texts: Vec<String> = items.iter().map(|(_, content)| content.clone()).collect();
            let vectors = embeddings::embed_texts(&state, &texts).await;
            insert_messages(&state, &session_id, &auth_user.user_id, &items, &vectors).await?;
        }

        let mut messages: Vec<Value> = body
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        if !reply.is_empty() {
            messages.push(json!({ "role": "assistant", "content": reply }));
        }
        let encoded = serde_json::to_string(&messages).unwrap_or_else(|_| "[]".into());
        let _ = sqlx::query(
            "UPDATE chat_sessions SET messages = $1, updated_at = now()::text
             WHERE id = $2 AND user_id = $3",
        )
        .bind(&encoded)
        .bind(&session_id)
        .bind(&auth_user.user_id)
        .execute(&state.pool)
        .await;

        memory::maybe_maintain(&state, &auth_user.user_id, &session_id).await;
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

/// `messages` is already token-budgeted by [`memory::recent_messages`].
fn chat_prompt(messages: &[Value], message: &str) -> String {
    let mut prompt = String::from("Conversation so far:\n");
    for item in messages {
        let role = item.get("role").and_then(Value::as_str).unwrap_or("user");
        let content = item.get("content").and_then(Value::as_str).unwrap_or("");
        prompt.push_str(&format!("{role}: {content}\n"));
    }
    prompt.push_str(&format!("user: {message}\nassistant:"));
    prompt
}

/// POST /v1/coach/chat — mobile chat turn (quota + Workers AI + long-term memory).
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

    let messages = session_messages(&state, &row.id, &row.user_id).await;

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

    // Embedding drives both memory lookup and the stored vector.
    let user_embedding = embeddings::embed_one(&state, message).await;
    let recall = memory::load(
        &state,
        &auth_user.user_id,
        session_id,
        message,
        user_embedding.as_deref(),
    )
    .await;

    let system = format!(
        "{}{}",
        chat_system_prompt(profile.as_ref()),
        memory::render(&recall)
    );
    let recent = memory::recent_messages(&messages);
    let prompt = chat_prompt(&recent, message);
    let Some(reply) = planner::call_ai(&state, &system, &prompt, 1024).await else {
        return Err(ApiError::Internal(
            "AI is unavailable right now. Please try again.".into(),
        ));
    };

    let reply_embedding = embeddings::embed_one(&state, &reply).await;
    let items = vec![
        ("user".to_string(), message.to_string()),
        ("assistant".to_string(), reply.clone()),
    ];
    let vectors = vec![user_embedding, reply_embedding];
    insert_messages(&state, session_id, &auth_user.user_id, &items, &vectors).await?;

    // JSON mirror for clients that still read chat_sessions.messages.
    let mut mirrored = messages;
    mirrored.push(json!({ "role": "user", "content": message }));
    mirrored.push(json!({ "role": "assistant", "content": reply }));
    let encoded = serde_json::to_string(&mirrored)
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

    // Refresh the rolling summary and durable facts every few turns.
    memory::maybe_maintain(&state, &auth_user.user_id, session_id).await;

    Ok(Json(json!({
        "reply": reply,
        "used": quota.used,
        "limit": quota.limit,
    })))
}
