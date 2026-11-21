//! Google ID token exchange for the native mobile app.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
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
struct DevicePollRequest {
    device_code: String,
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

struct GoogleIdentity {
    sub: String,
    email: String,
    name: String,
}

async fn verify_google_id_token(
    state: &AppState,
    id_token: &str,
) -> Result<GoogleIdentity, ApiError> {
    let response = state
        .http
        .get(&state.config.google_tokeninfo_url)
        .query(&[("id_token", id_token)])
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
    Ok(GoogleIdentity {
        sub: claims.sub,
        email,
        name,
    })
}

async fn issue_for_identity(
    state: &AppState,
    identity: &GoogleIdentity,
) -> Result<(String, UserRow), ApiError> {
    let cf_sub = format!("google:{}", identity.sub);
    let new_id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO users (id, cf_access_sub, email, name) VALUES ($1, $2, $3, $4)
         ON CONFLICT (cf_access_sub) DO UPDATE SET email = excluded.email,
         name = CASE WHEN excluded.name = '' THEN users.name ELSE excluded.name END,
         updated_at = now()::text",
    )
    .bind(&new_id)
    .bind(&cf_sub)
    .bind(&identity.email)
    .bind(&identity.name)
    .execute(&state.pool)
    .await?;

    let user = sqlx::query_as::<_, UserRow>(
        "SELECT id, cf_access_sub, email, name, created_at FROM users WHERE cf_access_sub = $1",
    )
    .bind(&cf_sub)
    .fetch_one(&state.pool)
    .await?;

    let token = auth::issue_token(&state.config, &cf_sub, &identity.email)?;
    Ok((token, user))
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

    let identity = verify_google_id_token(&state, &request.id_token).await?;
    let (token, user) = issue_for_identity(&state, &identity).await?;

    Ok(Json(json!({
        "token": token,
        "user": {
            "id": user.id,
            "sub": format!("google:{}", identity.sub),
            "email": identity.email,
            "name": identity.name,
        }
    })))
}

/// POST /v1/auth/google/device
///
/// The device flow needs the OAuth client secret on the token poll, so the
/// app sends the device code here instead of calling Google directly.
pub async fn google_device(State(state): State<AppState>, body: Bytes) -> ApiResult {
    let request: DevicePollRequest =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    if request.device_code.is_empty() {
        return Err(ApiError::BadRequest("missing device_code".into()));
    }

    let Some(client_id) = state.config.google_client_ids.first() else {
        return Err(ApiError::BadRequest(
            "Google auth is not configured. Set GOOGLE_CLIENT_IDS.".into(),
        ));
    };
    if state.config.google_client_secret.is_empty() {
        return Err(ApiError::BadRequest(
            "Google auth is not configured. Set GOOGLE_CLIENT_SECRET.".into(),
        ));
    }

    let response = state
        .http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", client_id.as_str()),
            ("client_secret", state.config.google_client_secret.as_str()),
            ("device_code", request.device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
        .map_err(|error| ApiError::Internal(format!("Google device poll failed: {error}")))?;

    let status = response.status();
    let value: Value = response.json().await.unwrap_or_else(|_| json!({}));

    if status.is_success() {
        let id_token = value
            .get("id_token")
            .and_then(Value::as_str)
            .ok_or(ApiError::Unauthorized)?;
        let identity = verify_google_id_token(&state, id_token).await?;
        let (token, user) = issue_for_identity(&state, &identity).await?;
        return Ok(Json(json!({
            "status": "ok",
            "token": token,
            "user": {
                "id": user.id,
                "sub": format!("google:{}", identity.sub),
                "email": identity.email,
                "name": identity.name,
            }
        })));
    }

    let error = value.get("error").and_then(Value::as_str).unwrap_or("");
    if error == "authorization_pending" || error == "slow_down" {
        return Ok(Json(json!({ "status": "pending" })));
    }

    Err(ApiError::Unauthorized)
}

/// POST /v1/auth/me — validates a mobile token and returns its user.
pub async fn me(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
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
