//! Authentication:
//! - Web (Pages server-to-server): `x-api-key` + `x-user-id`.
//! - Mobile: `Authorization: Bearer <HS256 JWT>` issued by `/v1/auth/google`.

use base64::Engine as _;
use chrono::Utc;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::config::Config;
use crate::error::ApiError;
use axum::http::HeaderMap;

type HmacSha256 = Hmac<Sha256>;

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::URL_SAFE_NO_PAD;

pub struct AuthUser {
    pub user_id: String,
    pub email: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub iat: i64,
    pub exp: i64,
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
    if let Some(value) = header(headers, "authorization") {
        if let Some(token) = value.strip_prefix("Bearer ") {
            return verify_token(config, token).ok_or(ApiError::Unauthorized);
        }
    }

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

pub fn issue_token(config: &Config, sub: &str, email: &str) -> Result<String, ApiError> {
    if config.jwt_secret.is_empty() {
        return Err(ApiError::Internal("JWT_SECRET is not configured".into()));
    }
    let header = B64.encode(br#"{"alg":"HS256","typ":"JWT"}"#);
    let now = Utc::now().timestamp();
    let claims = Claims {
        sub: sub.to_string(),
        email: email.to_string(),
        iat: now,
        exp: now + config.jwt_ttl_days * 86_400,
    };
    let payload = B64.encode(
        serde_json::to_vec(&claims)
            .map_err(|error| ApiError::Internal(format!("JWT payload: {error}")))?,
    );
    let signing_input = format!("{header}.{payload}");
    let signature = sign(&config.jwt_secret, signing_input.as_bytes())?;
    Ok(format!("{signing_input}.{signature}"))
}

fn verify_token(config: &Config, token: &str) -> Option<AuthUser> {
    if config.jwt_secret.is_empty() {
        return None;
    }
    let mut parts = token.split('.');
    let header = parts.next()?;
    let payload = parts.next()?;
    let signature = parts.next()?;
    if parts.next().is_some() {
        return None;
    }

    let header_json: serde_json::Value = serde_json::from_slice(&B64.decode(header).ok()?).ok()?;
    if header_json.get("alg")?.as_str()? != "HS256" {
        return None;
    }

    let expected = sign(&config.jwt_secret, format!("{header}.{payload}").as_bytes()).ok()?;
    if !constant_time_eq(expected.as_bytes(), signature.as_bytes()) {
        return None;
    }

    let claims: Claims = serde_json::from_slice(&B64.decode(payload).ok()?).ok()?;
    if claims.sub.is_empty() || claims.exp <= Utc::now().timestamp() {
        return None;
    }

    Some(AuthUser {
        user_id: claims.sub,
        email: claims.email,
    })
}

fn sign(secret: &str, data: &[u8]) -> Result<String, ApiError> {
    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|error| ApiError::Internal(format!("JWT signing key: {error}")))?;
    mac.update(data);
    Ok(B64.encode(mac.finalize().into_bytes()))
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
