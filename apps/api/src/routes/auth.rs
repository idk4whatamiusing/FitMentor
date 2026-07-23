use axum::extract::{Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct DiscordCallback {
    pub code: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AuthQuery {
    pub redirect: Option<String>,
}

pub async fn discord_login(
    State(_state): State<AppState>,
    Query(query): Query<AuthQuery>,
) -> Result<Response, AppError> {
    let client_id = std::env::var("DISCORD_CLIENT_ID").unwrap_or_default();
    let redirect_uri = format!("{}/v1/auth/callback", 
        std::env::var("API_URL").unwrap_or_else(|_| "https://16-112-225-113.sslip.io".to_string())
    );
    
    let mut url = url::Url::parse("https://discord.com/api/oauth2/authorize").unwrap();
    url.query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", "identify email")
        .append_pair("prompt", "consent");
    
    if let Some(redirect) = query.redirect {
        url.query_pairs_mut().append_pair("state", &redirect);
    }
    
    Ok(Redirect::temporary(&url.to_string()).into_response())
}

pub async fn discord_callback(
    State(state): State<AppState>,
    Query(query): Query<DiscordCallback>,
) -> Result<Response, AppError> {
    if let Some(error) = query.error {
        return Ok(Redirect::temporary(&format!("/signin?error={}", error)).into_response());
    }
    
    let code = match query.code {
        Some(c) => c,
        None => return Ok(Redirect::temporary("/signin?error=no_code").into_response()),
    };
    
    let client_id = std::env::var("DISCORD_CLIENT_ID").unwrap_or_default();
    let client_secret = std::env::var("DISCORD_CLIENT_SECRET").unwrap_or_default();
    let app_url = std::env::var("APP_URL").unwrap_or_else(|_| "https://fitmentor-7lx.pages.dev".to_string());
    let redirect_uri = format!("{}/v1/auth/callback", 
        std::env::var("API_URL").unwrap_or_else(|_| "https://16-112-225-113.sslip.io".to_string())
    );
    
    let client = reqwest::Client::new();
    let token_res = match client.post("https://discord.com/api/oauth2/token")
        .form(&[
            ("client_id", &client_id),
            ("client_secret", &client_secret),
            ("grant_type", &"authorization_code".to_string()),
            ("code", &code),
            ("redirect_uri", &redirect_uri),
        ])
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Ok(Redirect::temporary("/signin?error=token_request_failed").into_response()),
    };
    
    if !token_res.status().is_success() {
        return Ok(Redirect::temporary("/signin?error=token_exchange_failed").into_response());
    }
    
    let token_data: serde_json::Value = match token_res.json().await {
        Ok(v) => v,
        Err(_) => return Ok(Redirect::temporary("/signin?error=token_parse_failed").into_response()),
    };
    let access_token = token_data["access_token"].as_str().unwrap_or("");
    
    let user_res = match client.get("https://discord.com/api/users/@me")
        .bearer_auth(access_token)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => return Ok(Redirect::temporary("/signin?error=userinfo_request_failed").into_response()),
    };
    
    if !user_res.status().is_success() {
        return Ok(Redirect::temporary("/signin?error=userinfo_failed").into_response());
    }
    
    let discord_user: serde_json::Value = match user_res.json().await {
        Ok(v) => v,
        Err(_) => return Ok(Redirect::temporary("/signin?error=userinfo_parse_failed").into_response()),
    };
    let discord_id = discord_user["id"].as_str().unwrap_or("");
    let username = discord_user["username"].as_str().unwrap_or("");
    let email = discord_user["email"].as_str()
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{}@discord", username));
    
    let cf_sub = format!("discord:{}", discord_id);
    
    let user = match sqlx::query_as::<_, crate::models::user::User>(
        "INSERT INTO users (cf_access_sub, email, name) VALUES ($1, $2, $3)
         ON CONFLICT (cf_access_sub) DO UPDATE SET email = EXCLUDED.email, name = COALESCE(EXCLUDED.name, users.name), updated_at = now()
         RETURNING id, cf_access_sub, email, name, created_at, updated_at"
    )
    .bind(&cf_sub)
    .bind(&email)
    .bind(username)
    .fetch_one(&state.pool)
    .await
    {
        Ok(u) => u,
        Err(_) => return Ok(Redirect::temporary("/signin?error=user_creation_failed").into_response()),
    };
    
    let session_id = Uuid::new_v4().to_string();
    let session_data = serde_json::json!({
        "user_id": user.id,
        "cf_sub": cf_sub,
        "email": email,
        "name": username,
        "iat": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis(),
    });
    
    state.cache.set(&format!("session:{}", session_id), &session_data.to_string(), 604800).await;
    
    let cookie = format!(
        "fitmentor_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800",
        session_id
    );
    
    let redirect_url = format!("{}/dashboard", app_url);
    let mut response = Redirect::temporary(&redirect_url).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        cookie.parse().unwrap(),
    );
    
    Ok(response)
}
