//! Authentication, matching the old API's three tiers:
//! 1. `x-api-key: API_SHARED_SECRET` + `x-user-id` (server-to-server from Pages)
//! 2. JWT (`cf-access-jwt-assertion` / `authorization: Bearer`) — HS256 (JWT_SECRET)
//!    or Cloudflare Access RS256
//! 3. `fitmentor_session` cookie → KV lookup

use worker::*;

pub struct AuthUser {
    pub user_id: String,
    pub email: String,
}

fn header_str(req: &Request, name: &str) -> Option<String> {
    req.headers().get(name).ok().flatten()
}

/// API-key path only (no JWT yet) — enough for the Pages proxy, which always
/// sends `x-api-key` + `x-user-id`.
pub fn from_api_key(req: &Request, env: &Env) -> Option<AuthUser> {
    let secret = env.secret("API_SHARED_SECRET").ok()?.to_string();
    if secret.is_empty() {
        return None;
    }
    let key = header_str(req, "x-api-key")?;
    if key != secret {
        return None;
    }
    let user_id = header_str(req, "x-user-id").unwrap_or_default();
    if user_id.is_empty() {
        return None;
    }
    Some(AuthUser {
        user_id,
        email: header_str(req, "x-user-email").unwrap_or_default(),
    })
}

/// Session cookie → KV (`session:{sid}`).
pub async fn from_session_cookie(req: &Request, env: &Env) -> Option<AuthUser> {
    let cookie = header_str(req, "cookie")?;
    let sid = cookie
        .split(';')
        .filter_map(|p| p.trim().strip_prefix("fitmentor_session="))
        .next()?;
    let kv = env.kv("SESSIONS").ok()?;
    let raw = kv.get(sid).text().await.ok()??;
    let v: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let user_id = v
        .get("sub")
        .or_else(|| v.get("cf_sub"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    if user_id.is_empty() {
        return None;
    }
    Some(AuthUser {
        user_id,
        email: v
            .get("email")
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string(),
    })
}

/// Full auth chain. JWT verification lands with the port; API key + cookie now.
pub async fn require_user(req: &Request, env: &Env) -> Result<AuthUser> {
    if let Some(u) = from_api_key(req, env) {
        return Ok(u);
    }
    if let Some(u) = from_session_cookie(req, env).await {
        return Ok(u);
    }
    Err(Error::RustError("unauthorized".into()))
}
