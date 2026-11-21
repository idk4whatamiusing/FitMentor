//! Authentication: the Pages server calls this API server-to-server with
//! `x-api-key` (API_SHARED_SECRET) and `x-user-id` (the user's `cf_access_sub`).
//!
//! Sessions and OAuth stay on Cloudflare Pages; this API is not called from
//! the browser directly.

use crate::config::Config;
use crate::error::ApiError;
use axum::http::HeaderMap;

pub struct AuthUser {
    pub user_id: String,
    pub email: String,
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

pub fn require_api_key(headers: &HeaderMap, config: &Config) -> Result<(), ApiError> {
    let secret = &config.api_shared_secret;
    if secret.is_empty() {
        return Err(ApiError::Unauthorized);
    }
    let key = header(headers, "x-api-key").unwrap_or_default();
    if key != secret {
        return Err(ApiError::Unauthorized);
    }
    Ok(())
}

pub fn require_user(headers: &HeaderMap, config: &Config) -> Result<AuthUser, ApiError> {
    require_api_key(headers, config)?;
    let user_id = header(headers, "x-user-id").unwrap_or_default();
    if user_id.is_empty() {
        return Err(ApiError::Unauthorized);
    }
    Ok(AuthUser {
        user_id: user_id.to_string(),
        email: header(headers, "x-user-email")
            .unwrap_or_default()
            .to_string(),
    })
}
