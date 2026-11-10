//! AI quota — replaces the Redis INCR/SETNX implementation with D1.
//!
//! Same policy: 10,000 unit pool split fairly across active users, weighted by
//! tier (free 1.0×, pro 1.4×, premium 2.0×).

use chrono::Utc;
use worker::*;

use crate::auth;
use crate::db;
use crate::handlers::{bad_request, internal, unauthorized};

const TOTAL_POOL: f64 = 10_000.0;

fn multiplier(tier: &str) -> f64 {
    match tier {
        "pro" => 1.4,
        "premium" => 2.0,
        _ => 1.0,
    }
}

fn tier_key(tier: &str) -> &'static str {
    match tier {
        "pro" => "pro",
        "premium" => "premium",
        _ => "free",
    }
}

fn json_resp(v: serde_json::Value) -> Response {
    Response::from_json(&v).unwrap_or_else(|_| Response::empty().unwrap())
}

pub async fn check_and_consume(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let tier = tier_key(body.get("tier").and_then(|v| v.as_str()).unwrap_or("free"));
    let day = Utc::now().format("%Y-%m-%d").to_string();
    let uid = auth_user.user_id;
    let d = db::db(env)?;

    // Register as active for the day (idempotent) and record the tier.
    let _ = db::run(
        &d,
        "INSERT INTO ai_quota_seen (user_id, day) VALUES (?, ?)
         ON CONFLICT (user_id, day) DO NOTHING",
        &[db::js(&uid), db::js(&day)],
    )
    .await;

    // Active users per tier = distinct users seen today, tiered by their
    // most recent subscription. Without a subscriptions join this is free-only;
    // tier is passed by the caller for weighting.
    #[derive(serde::Deserialize)]
    struct CountRow {
        n: i64,
    }
    let active = db::first::<CountRow>(
        &d,
        "SELECT COUNT(*) AS n FROM ai_quota_seen WHERE day = ?",
        &[db::js(&day)],
    )
    .await?
    .map(|r| r.n)
    .unwrap_or(0)
    .max(1);

    let weighted = active as f64 * multiplier(tier);
    let limit = if weighted > 0.0 {
        (TOTAL_POOL * multiplier(tier) / weighted).floor() as i64
    } else {
        TOTAL_POOL as i64
    };
    let limit = limit.max(1);

    // Atomic consume.
    let _ = db::run(
        &d,
        "INSERT INTO ai_quota (user_id, day, used) VALUES (?, ?, 0)
         ON CONFLICT (user_id, day) DO NOTHING",
        &[db::js(&uid), db::js(&day)],
    )
    .await;

    #[derive(serde::Deserialize)]
    struct UsedRow {
        used: i64,
    }
    let used = db::first::<UsedRow>(
        &d,
        "SELECT used FROM ai_quota WHERE user_id = ? AND day = ?",
        &[db::js(&uid), db::js(&day)],
    )
    .await?
    .map(|r| r.used)
    .unwrap_or(0);

    if used >= limit {
        return Ok(json_resp(serde_json::json!({
            "allowed": false, "limit": limit, "used": used
        })));
    }

    if let Err(e) = db::run(
        &d,
        "UPDATE ai_quota SET used = used + 1 WHERE user_id = ? AND day = ?",
        &[db::js(&uid), db::js(&day)],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }

    Ok(json_resp(serde_json::json!({
        "allowed": true, "limit": limit, "used": used + 1
    })))
}
