//! Workout completions.

use chrono::Utc;
use uuid::Uuid;
use worker::*;

use crate::auth;
use crate::db;
use crate::handlers::{bad_request, internal, unauthorized};

fn json_resp(v: serde_json::Value) -> Response {
    Response::from_json(&v).unwrap_or_else(|_| Response::empty().unwrap())
}

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

async fn user_id_for(env: &Env, cf_sub: &str) -> Result<String> {
    #[derive(serde::Deserialize)]
    struct IdRow {
        id: String,
    }
    let d = db::db(env)?;
    db::first::<IdRow>(
        &d,
        "SELECT id FROM users WHERE cf_access_sub = ?",
        &[db::js(cf_sub)],
    )
    .await?
    .map(|r| r.id)
    .ok_or_else(|| Error::RustError("unauthorized".into()))
}

pub async fn complete(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let day_index = body.get("day_index").and_then(|v| v.as_i64()).unwrap_or(-1);
    if day_index < 0 {
        return Ok(bad_request("missing day_index"));
    }
    let title = body.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let uid = match user_id_for(env, &auth_user.user_id).await {
        Ok(v) => v,
        Err(_) => return Ok(internal("user not found")),
    };
    let d = db::db(env)?;
    let id = Uuid::new_v4().to_string();
    if let Err(e) = db::run(
        &d,
        "INSERT INTO workout_completions (id, user_id, date, day_index, title) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (user_id, date, day_index) DO NOTHING",
        &[
            db::js(&id),
            db::js(&uid),
            db::js(&today()),
            db::js_num(day_index),
            db::js(title),
        ],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }
    Ok(json_resp(serde_json::json!({ "ok": true })))
}

pub async fn completions(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let uid = match user_id_for(env, &auth_user.user_id).await {
        Ok(v) => v,
        Err(_) => return Ok(internal("user not found")),
    };
    let d = db::db(env)?;
    #[derive(serde::Deserialize)]
    struct Row {
        day_index: i64,
        title: String,
    }
    let rows = db::all::<Row>(
        &d,
        "SELECT day_index, title FROM workout_completions WHERE user_id = ? AND date = ?",
        &[db::js(&uid), db::js(&today())],
    )
    .await?;
    Ok(json_resp(serde_json::json!({
        "data": { "completions": rows.iter().map(|r| serde_json::json!({"day_index": r.day_index, "title": r.title})).collect::<Vec<_>>() }
    })))
}
