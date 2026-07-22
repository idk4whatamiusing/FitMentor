use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use super::jwt::Claims;
use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
    pub email: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // API key auth for trusted server-to-server calls (e.g. from Cloudflare Pages)
        if !state.api_shared_secret.is_empty() {
            if let Some(api_key) = parts.headers.get("x-api-key").and_then(|v| v.to_str().ok()) {
                if api_key == state.api_shared_secret {
                    let user_id = parts
                        .headers
                        .get("x-user-id")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    let email = parts
                        .headers
                        .get("x-user-email")
                        .and_then(|v| v.to_str().ok())
                        .unwrap_or("")
                        .to_string();
                    return Ok(AuthUser { user_id, email });
                }
            }
        }

        let token = parts
            .headers
            .get("cf-access-jwt-assertion")
            .or_else(|| parts.headers.get("authorization"))
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer ").or(Some(s)))
            .ok_or(AppError::Unauthorized)?;

        let claims: Claims = state
            .jwt_validator
            .validate(token)
            .await
            .map_err(|_| AppError::Unauthorized)?;

        Ok(AuthUser {
            user_id: claims.sub,
            email: claims.email,
        })
    }
}
