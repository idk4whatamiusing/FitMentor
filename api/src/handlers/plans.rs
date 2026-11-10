//! Daily AI plans/advice: one row per (user, date).

use chrono::Utc;
use uuid::Uuid;
use worker::*;

use crate::auth;
use crate::db;
use crate::handlers::{bad_request, internal, not_found, unauthorized};

fn json_resp(v: serde_json::Value) -> Response {
    Response::from_json(&v).unwrap_or_else(|_| Response::empty().unwrap())
}

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

#[derive(serde::Deserialize)]
struct PlanRow {
    plan: String,
}

pub async fn get(req: Request, ctx: RouteContext<()>, table: &str) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let d = db::db(env)?;
    let sql = format!("SELECT plan FROM {table} WHERE user_id = ? AND date = ?");
    let row =
        db::first::<PlanRow>(&d, &sql, &[db::js(&auth_user.user_id), db::js(&today())]).await?;
    match row {
        Some(r) => {
            let plan: serde_json::Value =
                serde_json::from_str(&r.plan).unwrap_or(serde_json::Value::Null);
            Ok(json_resp(serde_json::json!({ "data": { "plan": plan } })))
        }
        None => Ok(not_found()),
    }
}

pub async fn upsert(mut req: Request, ctx: RouteContext<()>, table: &str) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let plan = match body.get("plan") {
        Some(p) => p.to_string(),
        None => return Ok(bad_request("missing plan")),
    };
    let d = db::db(env)?;
    let id = Uuid::new_v4().to_string();
    let sql = format!(
        "INSERT INTO {table} (id, user_id, date, plan) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, date) DO UPDATE SET plan = excluded.plan, updated_at = datetime('now')"
    );
    if let Err(e) = db::run(
        &d,
        &sql,
        &[
            db::js(&id),
            db::js(&auth_user.user_id),
            db::js(&today()),
            db::js(&plan),
        ],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }
    let plan_value: serde_json::Value =
        serde_json::from_str(&plan).unwrap_or(serde_json::Value::Null);
    Ok(json_resp(
        serde_json::json!({ "data": { "plan": plan_value } }),
    ))
}
