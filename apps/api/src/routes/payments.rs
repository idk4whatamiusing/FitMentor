use axum::{extract::State, http::HeaderMap, Json};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::AppState;

type HmacSha256 = Hmac<Sha256>;

#[derive(Deserialize)]
pub struct CheckoutRequest {
    pub tier: String, // "premium" or "pro"
}

#[derive(Serialize)]
pub struct CheckoutResponse {
    pub checkout_url: String,
}

/// POST /v1/subscriptions/checkout — Create Polar.sh checkout session.
pub async fn checkout(
    State(state): State<AppState>,
    AuthUser { user_id, .. }: AuthUser,
    Json(req): Json<CheckoutRequest>,
) -> Result<Json<CheckoutResponse>, AppError> {
    if req.tier != "premium" && req.tier != "pro" {
        return Err(crate::error::AppError::BadRequest(
            "Invalid tier. Must be 'premium' or 'pro'.".into(),
        ));
    }

    let price_id = match req.tier.as_str() {
        "premium" => &state.polar_premium_price_id,
        "pro" => &state.polar_pro_price_id,
        _ => unreachable!(),
    };

    if state.polar_access_token.is_empty() || price_id.is_empty() {
        return Err(crate::error::AppError::BadRequest(
            "Polar.sh not configured. Set POLAR_ACCESS_TOKEN and product IDs.".into(),
        ));
    }

    // Call Polar API to create checkout session
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.polar.sh/v1/checkouts")
        .bearer_auth(&state.polar_access_token)
        .json(&serde_json::json!({
            "products": [],
            "price_id": price_id,
            "success_url": "https://fitmentor-7lx.pages.dev/profile?checkout=success",
            "metadata": {
                "user_id": user_id,
                "tier": req.tier,
            }
        }))
        .send()
        .await
        .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("Polar API error: {e}")))?;

    if !resp.status().is_success() {
        let body = resp.text().await.unwrap_or_default();
        tracing::error!("Polar checkout failed: {body}");
        return Err(crate::error::AppError::BadRequest(
            format!("Polar checkout failed: {body}"),
        ));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| crate::error::AppError::Internal(anyhow::anyhow!("Failed to parse Polar response: {e}")))?;

    let checkout_url = data["url"]
        .as_str()
        .or_else(|| data["checkout_url"].as_str())
        .ok_or_else(|| crate::error::AppError::Internal(anyhow::anyhow!("No checkout URL in Polar response")))?;

    Ok(Json(CheckoutResponse {
        checkout_url: checkout_url.to_string(),
    }))
}

// --- Webhook ---

#[derive(Debug, Deserialize)]
pub struct PolarWebhook {
    pub r#type: String,
    pub data: serde_json::Value,
}

/// POST /v1/webhooks/polar — Handle Polar.sh webhook events.
pub async fn webhook_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Result<Json<serde_json::Value>, AppError> {
    let secret = &state.polar_webhook_secret;
    if !secret.is_empty() {
        let signature = headers
            .get("polar-signature")
            .and_then(|v| v.to_str().ok())
            .ok_or(crate::error::AppError::Unauthorized)?;

        let mut mac =
            HmacSha256::new_from_slice(secret.as_bytes())
                .map_err(|e| crate::error::AppError::Internal(e.into()))?;
        mac.update(&body);
        let expected = hex::encode(mac.finalize().into_bytes());

        let provided = signature.trim_start_matches("sha256=");
        if !constant_time_eq(provided, &expected) {
            return Err(crate::error::AppError::Unauthorized);
        }
    }

    let payload: serde_json::Value = serde_json::from_slice(&body)
        .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;

    let event_type = payload
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    tracing::info!("Polar webhook received: {event_type}");

    match event_type {
        "subscription.created" | "subscription.active" | "order.paid" => {
            process_subscription_event(&state, &payload).await?;
        }
        "subscription.canceled" => {
            update_subscription_status(&state, &payload, "canceled").await?;
        }
        "subscription.revoked" => {
            update_subscription_status(&state, &payload, "revoked").await?;
        }
        "subscription.updated" => {
            update_subscription_period(&state, &payload).await?;
        }
        _ => {
            tracing::info!("Unhandled Polar event: {event_type}");
        }
    }

    Ok(Json(serde_json::json!({ "received": true })))
}

async fn process_subscription_event(
    state: &AppState,
    payload: &serde_json::Value,
) -> Result<(), AppError> {
    let data = &payload["data"];

    let polar_sub_id = data["id"].as_str().unwrap_or("");
    let status = data["status"].as_str().unwrap_or("active");
    let product_id = data["product_id"].as_str().unwrap_or("");
    let price_id = data["price_id"].as_str().unwrap_or("");
    let current_period_start = data["current_period_start"].as_str().unwrap_or("");
    let current_period_end = data["current_period_end"].as_str().unwrap_or("");
    let cancel_at_period_end = data["cancel_at_period_end"].as_bool().unwrap_or(false);

    // Determine tier from product ID
    let tier = if product_id == state.polar_premium_product_id || price_id == state.polar_premium_price_id {
        "premium"
    } else if product_id == state.polar_pro_product_id || price_id == state.polar_pro_price_id {
        "pro"
    } else {
        "free"
    };

    // Extract user_id from metadata
    let user_id_str = data["metadata"]["user_id"]
        .as_str()
        .unwrap_or("");

    if user_id_str.is_empty() {
        // Try to find user by email — search all shards
        let email = data["user_email"].as_str().unwrap_or("");
        if !email.is_empty() {
            for i in 0..state.shard_router.shard_count() {
                let pool = state.shard_router.primary_pool(); // Use shard router to get pool
                let user_uuid: Option<uuid::Uuid> = sqlx::query_scalar(
                    "SELECT id FROM users WHERE email = $1",
                )
                .bind(email)
                .fetch_optional(pool)
                .await?;
                if let Some(uuid) = user_uuid {
                    upsert_subscription(state, uuid, polar_sub_id, product_id, price_id, tier, status, current_period_start, current_period_end, cancel_at_period_end).await?;
                    return Ok(());
                }
            }
        }
    } else {
        // user_id is cf_access_sub format — use shard router to find correct shard
        let pool = state.shard_router.get_pool_for_user(user_id_str);
        let user_uuid: Option<uuid::Uuid> = sqlx::query_scalar(
            "SELECT id FROM users WHERE cf_access_sub = $1",
        )
        .bind(user_id_str)
        .fetch_optional(pool)
        .await?;
        if let Some(uuid) = user_uuid {
            upsert_subscription(state, uuid, polar_sub_id, product_id, price_id, tier, status, current_period_start, current_period_end, cancel_at_period_end).await?;
        }
    }

    Ok(())
}

async fn upsert_subscription(
    state: &AppState,
    user_id: uuid::Uuid,
    polar_sub_id: &str,
    product_id: &str,
    price_id: &str,
    tier: &str,
    status: &str,
    current_period_start: &str,
    current_period_end: &str,
    cancel_at_period_end: bool,
) -> Result<(), AppError> {
    // We need to find which shard has this user — use the user_id UUID as a proxy
    // Since we don't have cf_access_sub here, we'll search shards
    for i in 0..state.shard_router.shard_count() {
        let pool = state.shard_router.primary_pool();
        let existing = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id = $1)",
        )
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        if existing {
            sqlx::query(
                "UPDATE subscriptions SET
                    polar_sub_id = $2, polar_product_id = $3, polar_price_id = $4,
                    tier = $5, status = $6,
                    current_period_start = $7::timestamptz, current_period_end = $8::timestamptz,
                    cancel_at_period_end = $9, updated_at = now()
                 WHERE user_id = $1",
            )
            .bind(user_id)
            .bind(polar_sub_id)
            .bind(product_id)
            .bind(price_id)
            .bind(tier)
            .bind(status)
            .bind(current_period_start)
            .bind(current_period_end)
            .bind(cancel_at_period_end)
            .execute(pool)
            .await?;
            return Ok(());
        } else {
            sqlx::query(
                "INSERT INTO subscriptions
                    (user_id, polar_sub_id, polar_product_id, polar_price_id, tier, status,
                     current_period_start, current_period_end, cancel_at_period_end)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9)",
            )
            .bind(user_id)
            .bind(polar_sub_id)
            .bind(product_id)
            .bind(price_id)
            .bind(tier)
            .bind(status)
            .bind(current_period_start)
            .bind(current_period_end)
            .bind(cancel_at_period_end)
            .execute(pool)
            .await?;
            return Ok(());
        }
    }

    Ok(())
}

async fn update_subscription_status(
    state: &AppState,
    payload: &serde_json::Value,
    status: &str,
) -> Result<(), AppError> {
    let data = &payload["data"];
    let polar_sub_id = data["id"].as_str().unwrap_or("");

    if !polar_sub_id.is_empty() {
        // Search all shards for this subscription
        for i in 0..state.shard_router.shard_count() {
            let pool = state.shard_router.primary_pool();
            let result = sqlx::query(
                "UPDATE subscriptions SET status = $2, updated_at = now() WHERE polar_sub_id = $1",
            )
            .bind(polar_sub_id)
            .bind(status)
            .execute(pool)
            .await?;

            if result.rows_affected() > 0 {
                return Ok(());
            }
        }
    }

    Ok(())
}

async fn update_subscription_period(
    state: &AppState,
    payload: &serde_json::Value,
) -> Result<(), AppError> {
    let data = &payload["data"];
    let polar_sub_id = data["id"].as_str().unwrap_or("");
    let current_period_start = data["current_period_start"].as_str().unwrap_or("");
    let current_period_end = data["current_period_end"].as_str().unwrap_or("");
    let cancel_at_period_end = data["cancel_at_period_end"].as_bool().unwrap_or(false);

    if !polar_sub_id.is_empty() {
        // Search all shards for this subscription
        for i in 0..state.shard_router.shard_count() {
            let pool = state.shard_router.primary_pool();
            let result = sqlx::query(
                "UPDATE subscriptions SET
                    current_period_start = $2::timestamptz, current_period_end = $3::timestamptz,
                    cancel_at_period_end = $4, updated_at = now()
                 WHERE polar_sub_id = $1",
            )
            .bind(polar_sub_id)
            .bind(current_period_start)
            .bind(current_period_end)
            .bind(cancel_at_period_end)
            .execute(pool)
            .await?;

            if result.rows_affected() > 0 {
                return Ok(());
            }
        }
    }

    Ok(())
}

/// Constant-time string comparison to avoid timing attacks.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
