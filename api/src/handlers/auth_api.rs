//! Google ID token exchange for the native mobile app.

use axum::body::Bytes;
use axum::extract::State;
use axum::Json;
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::error::{ApiError, ApiResult};
use crate::models::UserRow;

#[derive(Deserialize)]
struct GoogleLoginRequest {
    id_token: String,
}

#[derive(Deserialize)]
struct GoogleClaims {
    sub: String,
    email: Option<String>,
    name: Option<String>,
    aud: Option<String>,
    iss: Option<String>,
    exp: Option<Value>,
}

/// POST /v1/auth/google
pub async fn google(State(state): State<AppState>, body: Bytes) -> ApiResult {
    let request: GoogleLoginRequest =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    if request.id_token.is_empty() {
        return Err(ApiError::BadRequest("missing id_token".into()));
    }
    if state.config.google_client_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "Google auth is not configured. Set GOOGLE_CLIENT_IDS.".into(),
        ));
    }

    let response = state
        .http
        .get(&state.config.google_tokeninfo_url)
        .query(&[("id_token", request.id_token.as_str())])
        .send()
        .await
        .map_err(|error| ApiError::Internal(format!("Google tokeninfo failed: {error}")))?;

    if !response.status().is_success() {
        return Err(ApiError::Unauthorized);
    }

    let claims: GoogleClaims = response.json().await.map_err(|_| ApiError::Unauthorized)?;

    let issuer = claims.iss.as_deref().unwrap_or("");
    if issuer != "accounts.google.com" && issuer != "https://accounts.google.com" {
        return Err(ApiError::Unauthorized);
    }
    let audience = claims.aud.unwrap_or_default();
    if !state
        .config
        .google_client_ids
        .iter()
        .any(|client_id| client_id == &audience)
    {
        return Err(ApiError::Unauthorized);
    }
    let expires: i64 = claims
        .exp
        .as_ref()
        .and_then(|value| {
            value
                .as_i64()
                .or_else(|| value.as_str().and_then(|text| text.parse().ok()))
        })
        .unwrap_or(0);
    if expires <= Utc::now().timestamp() || claims.sub.is_empty() {
        return Err(ApiError::Unauthorized);
    }

    let email = claims
        .email
        .unwrap_or_else(|| format!("{}@google", claims.sub));
    let name = claims.name.unwrap_or_else(|| email.clone());
    let cf_sub = format!("google:{}", claims.sub);

    let new_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO users (id, cf_access_sub, email, name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (cf_access_sub) DO UPDATE SET email = excluded.email,
         name = CASE WHEN excluded.name = '' THEN users.name ELSE excluded.name END,
         updated_at = now()::text",
    )
    .bind(&new_id)
    .bind(&cf_sub)
    .bind(&email)
    .bind(&name)
    .execute(&state.pool)
    .await?;

    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, cf_access_sub, email, name, created_at FROM users WHERE cf_access_sub = $1",
    )
    .bind(&cf_sub)
    .fetch_one(&state.pool)
    .await?;

    let token = auth::issue_token(&state.config, &cf_sub, &email)?;

    Ok(Json(json!({
        "token": token,
        "user": {
            "id": user.id,
            "sub": cf_sub,
            "email": email,
            "name": name,
        }
    })))
}

/// POST /v1/auth/me — validates a mobile token and returns its user.
pub async fn me(State(state): State<AppState>, headers: axum::http::HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, cf_access_sub, email, name, created_at FROM users WHERE cf_access_sub = $1",
    )
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    match user {
        Some(user) => Ok(Json(json!({
            "user": {
                "id": user.id,
                "sub": user.cf_access_sub,
                "email": user.email,
                "name": user.name,
            }
        }))),
        None => Err(ApiError::Unauthorized),
    }
}
