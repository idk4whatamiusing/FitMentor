//! Google ID token exchange for the native mobile app.

use axum::body::Bytes;
use axum::extract::{Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::Html;
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

// ── Browser redirect + poll flow ───────────────────────────────────

#[derive(Deserialize)]
struct StartRequest {
    state: Option<String>,
}

#[derive(Deserialize)]
struct PollRequest {
    state: String,
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

#[derive(sqlx::FromRow)]
struct AuthStateRow {
    status: String,
    token: Option<String>,
    user_json: Option<String>,
    error: Option<String>,
    expires_at: i64,
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

fn auth_page(title: &str, message: &str, success: bool) -> Html<String> {
    let accent = if success { "#34d399" } else { "#f87171" };
    let title = html_escape(title);
    let message = html_escape(message);
    Html(format!(
        r#"<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
  body {{ margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; background:#070b10; color:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }}
  main {{ max-width:420px; padding:32px; text-align:center; }}
  h1 {{ font-size:24px; margin:0 0 12px; color:{accent}; }}
  p {{ color:#94a3b8; line-height:1.6; margin:0; }}
</style>
</head>
<body><main><h1>{title}</h1><p>{message}</p></main></body>
</html>"#
    ))
}

/// POST /v1/auth/google/start — app starts a browser login.
pub async fn google_start(State(state): State<AppState>, body: Bytes) -> ApiResult {
    let request: StartRequest =
        serde_json::from_slice(&body).unwrap_or(StartRequest { state: None });
    let state_id = request
        .state
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| Uuid::new_v4().simple().to_string());
    if state_id.len() > 160 {
        return Err(ApiError::BadRequest("state is too long".into()));
    }
    if state.config.google_web_client_id.is_empty()
        || state.config.google_web_client_secret.is_empty()
    {
        return Err(ApiError::BadRequest(
            "Google web auth is not configured. Set GOOGLE_WEB_CLIENT_ID and GOOGLE_WEB_CLIENT_SECRET."
                .into(),
        ));
    }

    let expires_at = Utc::now().timestamp() + 600;
    let _ = sqlx::query("DELETE FROM google_auth_states WHERE expires_at < $1")
        .bind(Utc::now().timestamp())
        .execute(&state.pool)
        .await;

    sqlx::query(
        "INSERT INTO google_auth_states (state, status, expires_at)
         VALUES ($1, 'pending', $2)
         ON CONFLICT (state) DO UPDATE SET
            status = 'pending', token = NULL, user_json = NULL, error = NULL,
            created_at = now()::text, expires_at = excluded.expires_at",
    )
    .bind(&state_id)
    .bind(expires_at)
    .execute(&state.pool)
    .await?;

    let mut auth_url = reqwest::Url::parse("https://accounts.google.com/o/oauth2/v2/auth")
        .map_err(|error| ApiError::Internal(error.to_string()))?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &state.config.google_web_client_id)
        .append_pair("redirect_uri", &state.config.google_web_redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "openid email profile")
        .append_pair("state", &state_id)
        .append_pair("access_type", "online")
        .append_pair("prompt", "select_account");

    Ok(Json(json!({
        "state": state_id,
        "auth_url": auth_url.to_string(),
    })))
}

/// GET /v1/auth/google/callback — browser returns here with the code.
pub async fn google_callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
) -> (StatusCode, Html<String>) {
    let Some(state_id) = query.state.filter(|value| !value.is_empty()) else {
        return (
            StatusCode::BAD_REQUEST,
            auth_page("Sign-in failed", "Missing OAuth state.", false),
        );
    };

    if let Some(error) = query.error {
        let _ = sqlx::query(
            "UPDATE google_auth_states SET status = 'error', error = $2 WHERE state = $1",
        )
        .bind(&state_id)
        .bind(&error)
        .execute(&state.pool)
        .await;
        return (
            StatusCode::OK,
            auth_page(
                "Sign-in cancelled",
                "You can close this tab and return to FitMentor.",
                false,
            ),
        );
    }

    let Some(code) = query.code.filter(|value| !value.is_empty()) else {
        return (
            StatusCode::BAD_REQUEST,
            auth_page("Sign-in failed", "Missing authorization code.", false),
        );
    };

    let row = sqlx::query_as::<_, AuthStateRow>(
        "SELECT status, token, user_json, error, expires_at
         FROM google_auth_states WHERE state = $1",
    )
    .bind(&state_id)
    .fetch_optional(&state.pool)
    .await;

    let Ok(Some(row)) = row else {
        return (
            StatusCode::BAD_REQUEST,
            auth_page(
                "Sign-in expired",
                "This sign-in link is no longer valid. Return to FitMentor and try again.",
                false,
            ),
        );
    };
    if row.expires_at < Utc::now().timestamp() {
        let _ = sqlx::query("DELETE FROM google_auth_states WHERE state = $1")
            .bind(&state_id)
            .execute(&state.pool)
            .await;
        return (
            StatusCode::BAD_REQUEST,
            auth_page(
                "Sign-in expired",
                "This sign-in link expired. Return to FitMentor and try again.",
                false,
            ),
        );
    }

    let response = state
        .http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", state.config.google_web_client_id.as_str()),
            (
                "client_secret",
                state.config.google_web_client_secret.as_str(),
            ),
            (
                "redirect_uri",
                state.config.google_web_redirect_uri.as_str(),
            ),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await;

    let value: Value = match response {
        Ok(response) => {
            let status = response.status();
            let value: Value = response.json().await.unwrap_or_else(|_| json!({}));
            if !status.is_success() {
                let message = value
                    .get("error_description")
                    .or_else(|| value.get("error"))
                    .and_then(Value::as_str)
                    .unwrap_or("Google rejected the authorization code.");
                let _ = sqlx::query(
                    "UPDATE google_auth_states SET status = 'error', error = $2 WHERE state = $1",
                )
                .bind(&state_id)
                .bind(message)
                .execute(&state.pool)
                .await;
                return (
                    StatusCode::BAD_REQUEST,
                    auth_page("Sign-in failed", message, false),
                );
            }
            value
        }
        Err(error) => {
            let message = format!("Could not reach Google: {error}");
            let _ = sqlx::query(
                "UPDATE google_auth_states SET status = 'error', error = $2 WHERE state = $1",
            )
            .bind(&state_id)
            .bind(&message)
            .execute(&state.pool)
            .await;
            return (
                StatusCode::BAD_REQUEST,
                auth_page("Sign-in failed", &message, false),
            );
        }
    };

    let Some(id_token) = value.get("id_token").and_then(Value::as_str) else {
        return (
            StatusCode::UNAUTHORIZED,
            auth_page(
                "Sign-in failed",
                "Google did not return an ID token.",
                false,
            ),
        );
    };

    let identity = match verify_google_id_token(&state, id_token).await {
        Ok(identity) => identity,
        Err(_) => {
            return (
                StatusCode::UNAUTHORIZED,
                auth_page("Sign-in failed", "Google token verification failed.", false),
            )
        }
    };
    let (token, user) = match issue_for_identity(&state, &identity).await {
        Ok(result) => result,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                auth_page(
                    "Sign-in failed",
                    "Could not create your FitMentor session.",
                    false,
                ),
            )
        }
    };
    let user_json = json!({
        "id": user.id,
        "sub": format!("google:{}", identity.sub),
        "email": identity.email,
        "name": identity.name,
    });

    let _ = sqlx::query(
        "UPDATE google_auth_states SET status = 'ok', token = $2, user_json = $3, error = NULL
         WHERE state = $1",
    )
    .bind(&state_id)
    .bind(&token)
    .bind(user_json.to_string())
    .execute(&state.pool)
    .await;

    (
        StatusCode::OK,
        auth_page(
            "You're signed in",
            "You can close this tab and return to FitMentor.",
            true,
        ),
    )
}

/// POST /v1/auth/google/poll — app checks whether the browser finished.
pub async fn google_poll(State(state): State<AppState>, body: Bytes) -> ApiResult {
    let request: PollRequest =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let row = sqlx::query_as::<_, AuthStateRow>(
        "SELECT status, token, user_json, error, expires_at
         FROM google_auth_states WHERE state = $1",
    )
    .bind(&request.state)
    .fetch_optional(&state.pool)
    .await?;

    let Some(row) = row else {
        return Ok(Json(json!({ "status": "expired" })));
    };
    if row.expires_at < Utc::now().timestamp() {
        let _ = sqlx::query("DELETE FROM google_auth_states WHERE state = $1")
            .bind(&request.state)
            .execute(&state.pool)
            .await;
        return Ok(Json(json!({ "status": "expired" })));
    }

    match row.status.as_str() {
        "ok" => {
            let user: Value = row
                .user_json
                .as_deref()
                .and_then(|raw| serde_json::from_str(raw).ok())
                .unwrap_or_else(|| json!({}));
            let token = row.token.unwrap_or_default();
            let _ = sqlx::query("DELETE FROM google_auth_states WHERE state = $1")
                .bind(&request.state)
                .execute(&state.pool)
                .await;
            Ok(Json(json!({
                "status": "ok",
                "token": token,
                "user": user,
            })))
        }
        "error" => Ok(Json(json!({
            "status": "error",
            "message": row.error.unwrap_or_else(|| "Sign-in failed".to_string()),
        }))),
        _ => Ok(Json(json!({ "status": "pending" }))),
    }
}
