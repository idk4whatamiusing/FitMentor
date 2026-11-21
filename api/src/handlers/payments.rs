//! Polar.sh payments: checkout sessions, subscription lookup, webhooks.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::PgPool;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::config::Config;
use crate::error::{ApiError, ApiResult};

type HmacSha256 = Hmac<Sha256>;

fn tier_for(config: &Config, product_id: &str, price_id: &str) -> &'static str {
    let premium = (!config.polar_premium_product_id.is_empty()
        && product_id == config.polar_premium_product_id)
        || (!config.polar_premium_price_id.is_empty() && price_id == config.polar_premium_price_id);
    if premium {
        return "premium";
    }
    let pro = (!config.polar_pro_product_id.is_empty()
        && product_id == config.polar_pro_product_id)
        || (!config.polar_pro_price_id.is_empty() && price_id == config.polar_pro_price_id);
    if pro {
        return "pro";
    }
    "free"
}

/// POST /v1/subscriptions/checkout
pub async fn checkout(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let body: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;

    let tier = body.get("tier").and_then(Value::as_str).unwrap_or("");
    let product_id = match tier {
        "premium" => state.config.polar_premium_product_id.as_str(),
        "pro" => state.config.polar_pro_product_id.as_str(),
        _ => {
            return Err(ApiError::BadRequest(
                "Invalid tier. Must be 'premium' or 'pro'.".into(),
            ))
        }
    };

    if state.config.polar_access_token.is_empty() || product_id.is_empty() {
        return Err(ApiError::BadRequest(
            "Polar is not configured. Set POLAR_ACCESS_TOKEN and product IDs.".into(),
        ));
    }

    let success_url = format!(
        "{}/profile?checkout=success",
        state.config.app_url.trim_end_matches('/')
    );
    let mut payload = json!({
        "products": [product_id],
        "success_url": success_url,
        "metadata": {
            "user_id": auth_user.user_id,
            "tier": tier,
        },
    });
    if !auth_user.email.is_empty() {
        payload["customer_email"] = json!(auth_user.email);
    }

    let url = format!(
        "{}/v1/checkouts/",
        state.config.polar_api_base.trim_end_matches('/')
    );
    let response = state
        .http
        .post(url)
        .bearer_auth(&state.config.polar_access_token)
        .json(&payload)
        .send()
        .await
        .map_err(|error| ApiError::Internal(format!("Polar request failed: {error}")))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        tracing::error!(%status, body = %text, "Polar checkout failed");
        return Err(ApiError::BadRequest(format!(
            "Polar checkout failed: {text}"
        )));
    }

    let data: Value = serde_json::from_str(&text)
        .map_err(|_| ApiError::Internal("Failed to parse Polar response".into()))?;
    let checkout_url = data
        .get("url")
        .and_then(Value::as_str)
        .or_else(|| data.get("checkout_url").and_then(Value::as_str))
        .ok_or_else(|| ApiError::Internal("No checkout URL in Polar response".into()))?;

    Ok(Json(json!({ "checkout_url": checkout_url })))
}

#[derive(sqlx::FromRow)]
struct SubscriptionRow {
    tier: String,
    status: String,
    current_period_start: Option<String>,
    current_period_end: Option<String>,
    cancel_at_period_end: i64,
}

/// GET /v1/user/subscription
pub async fn get_subscription(State(state): State<AppState>, headers: HeaderMap) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let row = sqlx::query_as::<_, SubscriptionRow>(
        "SELECT s.tier, s.status, s.current_period_start, s.current_period_end,
                s.cancel_at_period_end
         FROM subscriptions s
         JOIN users u ON u.id = s.user_id
         WHERE u.cf_access_sub = $1
         ORDER BY s.updated_at DESC
         LIMIT 1",
    )
    .bind(&auth_user.user_id)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some(row) => Ok(Json(json!({
            "data": {
                "subscription": {
                    "tier": row.tier,
                    "status": row.status,
                    "currentPeriodStart": row.current_period_start,
                    "currentPeriodEnd": row.current_period_end,
                    "cancelAtPeriodEnd": row.cancel_at_period_end != 0,
                }
            }
        }))),
        None => Ok(Json(json!({ "data": { "subscription": null } }))),
    }
}

/// POST /v1/webhooks/polar
pub async fn webhook(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let secret = &state.config.polar_webhook_secret;
    if secret.is_empty() {
        return Err(ApiError::Internal(
            "Polar webhook secret is not configured".into(),
        ));
    }
    if !verify_signature(&headers, &body, secret) {
        return Err(ApiError::Unauthorized);
    }

    let payload: Value =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    let event_type = payload
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let data = payload.get("data").cloned().unwrap_or(Value::Null);
    tracing::info!(event_type, "Polar webhook received");

    match event_type {
        "subscription.created" | "subscription.active" | "subscription.updated" => {
            process_subscription(&state, &data, "active").await?;
        }
        "subscription.uncanceled" | "subscription.resumed" | "subscription.cycled" => {
            process_subscription(&state, &data, "active").await?;
        }
        "subscription.canceled" => {
            process_subscription(&state, &data, "canceled").await?;
        }
        "subscription.revoked" => {
            process_subscription(&state, &data, "revoked").await?;
        }
        "subscription.past_due" => {
            process_subscription(&state, &data, "past_due").await?;
        }
        "subscription.paused" => {
            process_subscription(&state, &data, "paused").await?;
        }
        "order.paid" => {
            if let Some(subscription) = data.get("subscription") {
                process_subscription(&state, subscription, "active").await?;
            } else {
                tracing::info!("order.paid without embedded subscription; ignoring");
            }
        }
        _ => {}
    }

    Ok(Json(json!({ "received": true })))
}

async fn process_subscription(
    state: &AppState,
    data: &Value,
    fallback_status: &str,
) -> Result<(), ApiError> {
    let polar_sub_id = data
        .get("id")
        .and_then(Value::as_str)
        .or_else(|| data.get("subscription_id").and_then(Value::as_str))
        .unwrap_or("");
    if polar_sub_id.is_empty() {
        tracing::warn!("Polar subscription event without an id");
        return Ok(());
    }

    let status = data
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or(fallback_status);
    let product_id = data.get("product_id").and_then(Value::as_str).unwrap_or("");
    let price_id = data.get("price_id").and_then(Value::as_str).unwrap_or("");
    let period_start = data.get("current_period_start").and_then(Value::as_str);
    let period_end = data.get("current_period_end").and_then(Value::as_str);
    let cancel = data
        .get("cancel_at_period_end")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let Some(user_id) = resolve_user(&state.pool, data).await? else {
        tracing::warn!("Polar event could not resolve a FitMentor user");
        return Ok(());
    };

    let existing = sqlx::query_as::<_, ExistingSubscription>(
        "SELECT tier, polar_product_id, polar_price_id
         FROM subscriptions WHERE user_id = $1 OR polar_sub_id = $2 LIMIT 1",
    )
    .bind(&user_id)
    .bind(polar_sub_id)
    .fetch_optional(&state.pool)
    .await?;

    let product_id = if product_id.is_empty() {
        existing
            .as_ref()
            .map(|row| row.polar_product_id.as_str())
            .unwrap_or("")
    } else {
        product_id
    };
    let price_id = if price_id.is_empty() {
        existing
            .as_ref()
            .map(|row| row.polar_price_id.as_str())
            .unwrap_or("")
    } else {
        price_id
    };
    let mut tier = tier_for(&state.config, product_id, price_id).to_string();
    if tier == "free" {
        if let Some(existing) = &existing {
            if existing.tier != "free" {
                tier = existing.tier.clone();
            }
        }
    }

    upsert_subscription(
        &state.pool,
        &user_id,
        polar_sub_id,
        product_id,
        price_id,
        &tier,
        status,
        period_start,
        period_end,
        cancel,
    )
    .await?;

    Ok(())
}

#[derive(sqlx::FromRow)]
struct ExistingSubscription {
    tier: String,
    polar_product_id: String,
    polar_price_id: String,
}

async fn resolve_user(pool: &PgPool, data: &Value) -> Result<Option<String>, ApiError> {
    let cf_sub = data
        .get("metadata")
        .and_then(|metadata| metadata.get("user_id"))
        .and_then(Value::as_str)
        .unwrap_or("");
    if !cf_sub.is_empty() {
        if let Some(id) =
            sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE cf_access_sub = $1")
                .bind(cf_sub)
                .fetch_optional(pool)
                .await?
        {
            return Ok(Some(id));
        }
    }

    let email = data
        .get("customer")
        .and_then(|customer| customer.get("email"))
        .and_then(Value::as_str)
        .or_else(|| data.get("user_email").and_then(Value::as_str))
        .or_else(|| data.get("customer_email").and_then(Value::as_str))
        .unwrap_or("");
    if !email.is_empty() {
        if let Some(id) = sqlx::query_scalar::<_, String>("SELECT id FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(pool)
            .await?
        {
            return Ok(Some(id));
        }
    }

    Ok(None)
}

#[allow(clippy::too_many_arguments)]
async fn upsert_subscription(
    pool: &PgPool,
    user_id: &str,
    polar_sub_id: &str,
    product_id: &str,
    price_id: &str,
    tier: &str,
    status: &str,
    period_start: Option<&str>,
    period_end: Option<&str>,
    cancel: bool,
) -> Result<(), ApiError> {
    let existing_id = sqlx::query_scalar::<_, String>(
        "SELECT id FROM subscriptions WHERE user_id = $1 OR polar_sub_id = $2 LIMIT 1",
    )
    .bind(user_id)
    .bind(polar_sub_id)
    .fetch_optional(pool)
    .await?;

    if let Some(id) = existing_id {
        sqlx::query(
            "UPDATE subscriptions SET
                user_id = $2, polar_sub_id = $3, polar_product_id = $4,
                polar_price_id = $5, tier = $6, status = $7,
                current_period_start = $8, current_period_end = $9,
                cancel_at_period_end = $10, updated_at = now()::text
             WHERE id = $1",
        )
        .bind(&id)
        .bind(user_id)
        .bind(polar_sub_id)
        .bind(product_id)
        .bind(price_id)
        .bind(tier)
        .bind(status)
        .bind(period_start)
        .bind(period_end)
        .bind(if cancel { 1_i64 } else { 0_i64 })
        .execute(pool)
        .await?;
    } else {
        let id = Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO subscriptions
                (id, user_id, polar_sub_id, polar_product_id, polar_price_id,
                 tier, status, current_period_start, current_period_end,
                 cancel_at_period_end)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        )
        .bind(&id)
        .bind(user_id)
        .bind(polar_sub_id)
        .bind(product_id)
        .bind(price_id)
        .bind(tier)
        .bind(status)
        .bind(period_start)
        .bind(period_end)
        .bind(if cancel { 1_i64 } else { 0_i64 })
        .execute(pool)
        .await?;
    }

    Ok(())
}

fn verify_signature(headers: &HeaderMap, body: &[u8], secret: &str) -> bool {
    // Legacy Polar signature: `polar-signature: <hex hmac>`.
    if let Some(signature) = headers
        .get("polar-signature")
        .and_then(|value| value.to_str().ok())
    {
        let provided = signature.trim_start_matches("sha256=");
        if let Ok(provided) = hex::decode(provided) {
            if verify_hmac(secret.as_bytes(), body, &provided) {
                return true;
            }
        }
        return false;
    }

    // Standard Webhooks signature: `webhook-id`, `webhook-timestamp`,
    // `webhook-signature: v1,<base64>`.
    let (Some(id), Some(timestamp), Some(signature)) = (
        headers
            .get("webhook-id")
            .and_then(|value| value.to_str().ok()),
        headers
            .get("webhook-timestamp")
            .and_then(|value| value.to_str().ok()),
        headers
            .get("webhook-signature")
            .and_then(|value| value.to_str().ok()),
    ) else {
        return false;
    };

    let key = secret.strip_prefix("whsec_").unwrap_or(secret);
    let Ok(key) = base64::engine::general_purpose::STANDARD.decode(key) else {
        return false;
    };

    let signed = format!("{id}.{timestamp}.{}", String::from_utf8_lossy(body));
    for part in signature.split(' ') {
        if let Some(expected) = part.strip_prefix("v1,") {
            if let Ok(expected) = base64::engine::general_purpose::STANDARD.decode(expected) {
                if verify_hmac(&key, signed.as_bytes(), &expected) {
                    return true;
                }
            }
        }
    }

    false
}

fn verify_hmac(key: &[u8], data: &[u8], expected: &[u8]) -> bool {
    let Ok(mut mac) = HmacSha256::new_from_slice(key) else {
        return false;
    };
    mac.update(data);
    let actual = mac.finalize().into_bytes();
    constant_time_eq(actual.as_slice(), expected)
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
