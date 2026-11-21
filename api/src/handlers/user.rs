//! User + profile endpoints.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::error::{ApiError, ApiResult};
use crate::models::{ProfileRow, UserRow};

async fn upsert_user(pool: &PgPool, cf_sub: &str, email: &str) -> ApiResult<UserRow> {
    let new_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO users (id, cf_access_sub, email) VALUES ($1, $2, $3)
         ON CONFLICT (cf_access_sub) DO UPDATE SET email = excluded.email, updated_at = now()::text",
    )
    .bind(&new_id)
    .bind(cf_sub)
    .bind(email)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, UserRow>(
        "SELECT id, cf_access_sub, email, name, created_at FROM users WHERE cf_access_sub = $1",
    )
    .bind(cf_sub)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| ApiError::Internal("user not found after upsert".into()))
}

async fn fetch_user(pool: &PgPool, cf_sub: &str) -> ApiResult<UserRow> {
    sqlx::query_as::<_, UserRow>(
        "SELECT id, cf_access_sub, email, name, created_at FROM users WHERE cf_access_sub = $1",
    )
    .bind(cf_sub)
    .fetch_optional(pool)
    .await?
    .ok_or(ApiError::NotFound)
}

async fn fetch_profile(pool: &PgPool, user_id: &str) -> ApiResult<Option<ProfileRow>> {
    Ok(sqlx::query_as::<_, ProfileRow>(
        "SELECT id, user_id, name, age, gender, height_cm, weight_kg, goal, place, experience,
                diet, days_per_week, budget_per_day, health_conditions, custom_protein_g,
                created_at, updated_at
         FROM profiles WHERE user_id = $1",
    )
    .bind(user_id)
    .fetch_optional(pool)
    .await?)
}

async fn ensure_profile(pool: &PgPool, user_id: &str) -> ApiResult<()> {
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO profiles (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING",
    )
    .bind(&id)
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

fn user_profile_payload(user: &UserRow, profile: Option<&ProfileRow>) -> Value {
    json!({
        "data": {
            "user": user.to_json(),
            "profile": profile.map(|p| p.to_json()),
        }
    })
}

pub async fn get_me(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let user = upsert_user(&state.pool, &auth_user.user_id, &auth_user.email).await?;
    ensure_profile(&state.pool, &user.id).await?;
    let profile = fetch_profile(&state.pool, &user.id).await?;
    Ok(Json(user_profile_payload(&user, profile.as_ref())))
}

pub async fn exists(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let found = fetch_user(&state.pool, &auth_user.user_id).await;
    Ok(Json(json!({ "exists": found.is_ok() })))
}

pub async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let user = fetch_user(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;
    ensure_profile(&state.pool, &user.id).await?;

    let name = body.get("name").and_then(Value::as_str);
    if let Some(name) = name {
        let _ = sqlx::query("UPDATE users SET name = $1, updated_at = now()::text WHERE id = $2")
            .bind(name)
            .bind(&user.id)
            .execute(&state.pool)
            .await;
    }

    let text = |key: &str| body.get(key).and_then(Value::as_str);
    let number = |key: &str| body.get(key).and_then(Value::as_i64);
    let health = body
        .get("healthConditions")
        .map(serde_json::Value::to_string);

    sqlx::query(
        "UPDATE profiles SET
            name = COALESCE($1, name),
            age = COALESCE($2, age),
            gender = COALESCE($3, gender),
            height_cm = COALESCE($4, height_cm),
            weight_kg = COALESCE($5, weight_kg),
            goal = COALESCE($6, goal),
            place = COALESCE($7, place),
            experience = COALESCE($8, experience),
            diet = COALESCE($9, diet),
            days_per_week = COALESCE($10, days_per_week),
            budget_per_day = COALESCE($11, budget_per_day),
            health_conditions = COALESCE($12, health_conditions),
            updated_at = now()::text
         WHERE user_id = $13",
    )
    .bind(text("name"))
    .bind(number("age"))
    .bind(text("gender"))
    .bind(number("heightCm"))
    .bind(number("weightKg"))
    .bind(text("goal"))
    .bind(text("place"))
    .bind(text("experience"))
    .bind(text("diet"))
    .bind(number("daysPerWeek"))
    .bind(number("budgetPerDay"))
    .bind(health)
    .bind(&user.id)
    .execute(&state.pool)
    .await?;

    let profile = fetch_profile(&state.pool, &user.id).await.ok().flatten();
    let user = fetch_user(&state.pool, &auth_user.user_id)
        .await
        .unwrap_or(user);
    Ok(Json(user_profile_payload(&user, profile.as_ref())))
}

pub async fn update_protein_target(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    let user = fetch_user(&state.pool, &auth_user.user_id)
        .await
        .map_err(|_| ApiError::Internal("user not found".into()))?;

    let protein = body.get("proteinG").and_then(Value::as_i64);
    sqlx::query(
        "UPDATE profiles SET custom_protein_g = $1, updated_at = now()::text WHERE user_id = $2",
    )
    .bind(protein)
    .bind(&user.id)
    .execute(&state.pool)
    .await?;

    Ok(Json(json!({ "data": { "user": user.to_json() } })))
}

/// POST /v1/user/sync — server-to-server, own x-api-key check.
pub async fn sync(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    auth::require_api_key(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let cf_sub = body.get("cf_sub").and_then(Value::as_str).unwrap_or("");
    let email = body.get("email").and_then(Value::as_str).unwrap_or("");
    let name = body.get("name").and_then(Value::as_str).unwrap_or("");
    if cf_sub.is_empty() || email.is_empty() {
        return Err(ApiError::BadRequest("missing cf_sub or email".into()));
    }

    let new_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO users (id, cf_access_sub, email, name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (cf_access_sub) DO UPDATE SET email = excluded.email,
         name = CASE WHEN excluded.name = '' THEN users.name ELSE excluded.name END,
         updated_at = now()::text",
    )
    .bind(&new_id)
    .bind(cf_sub)
    .bind(email)
    .bind(name)
    .execute(&state.pool)
    .await?;

    let user = fetch_user(&state.pool, cf_sub).await?;
    // Sessions live in Cloudflare KV and are issued by the Pages server; this
    // id is returned only for response-shape compatibility.
    let session_id = Uuid::new_v4().to_string();

    Ok(Json(json!({
        "ok": true,
        "session_id": session_id,
        "user": { "id": user.id, "cf_sub": user.cf_access_sub, "email": user.email }
    })))
}
