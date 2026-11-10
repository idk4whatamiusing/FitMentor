//! Coach sessions + coach log.

use chrono::Utc;
use uuid::Uuid;
use worker::*;

use crate::auth;
use crate::db;
use crate::handlers::{bad_request, internal, not_found, unauthorized};
use crate::models::SessionRow;

fn json_resp(v: serde_json::Value) -> Response {
    Response::from_json(&v).unwrap_or_else(|_| Response::empty().unwrap())
}

pub async fn list(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let d = db::db(env)?;
    let rows = db::all::<SessionRow>(
        &d,
        "SELECT id, user_id, title, messages, created_at, updated_at
         FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC",
        &[db::js(&auth_user.user_id)],
    )
    .await?;
    let items: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let count = serde_json::from_str::<Vec<serde_json::Value>>(&r.messages)
                .map(|v| v.len())
                .unwrap_or(0);
            serde_json::json!({
                "id": r.id,
                "title": r.title,
                "message_count": count,
                "created_at": r.created_at,
            })
        })
        .collect();
    Ok(json_resp(serde_json::Value::Array(items)))
}

pub async fn create(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| serde_json::json!({}));
    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("New Chat")
        .to_string();
    let d = db::db(env)?;
    let id = Uuid::new_v4().to_string();
    if let Err(e) = db::run(
        &d,
        "INSERT INTO chat_sessions (id, user_id, title) VALUES (?, ?, ?)",
        &[db::js(&id), db::js(&auth_user.user_id), db::js(&title)],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }
    Ok(json_resp(serde_json::json!({ "id": id })))
}

pub async fn get(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let id = ctx.param("id").cloned().unwrap_or_default();
    let d = db::db(env)?;
    let row = db::first::<SessionRow>(
        &d,
        "SELECT id, user_id, title, messages, created_at, updated_at
         FROM chat_sessions WHERE id = ? AND user_id = ?",
        &[db::js(&id), db::js(&auth_user.user_id)],
    )
    .await?;
    match row {
        Some(r) => Ok(json_resp(serde_json::json!({
            "id": r.id,
            "user_id": r.user_id,
            "title": r.title,
            "messages": serde_json::from_str::<serde_json::Value>(&r.messages).unwrap_or(serde_json::json!([])),
            "created_at": r.created_at,
            "updated_at": r.updated_at,
        }))),
        None => Ok(not_found()),
    }
}

pub async fn delete(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let id = ctx.param("id").cloned().unwrap_or_default();
    let d = db::db(env)?;
    let changed = db::run(
        &d,
        "DELETE FROM chat_sessions WHERE id = ? AND user_id = ?",
        &[db::js(&id), db::js(&auth_user.user_id)],
    )
    .await?;
    if changed == 0 {
        return Ok(not_found());
    }
    Ok(json_resp(serde_json::json!({ "ok": true })))
}

/// PATCH /v1/coach/sessions/:id — replaces the GraphQL `updateCoachSessionTitle`.
pub async fn rename(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let title = body
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();
    let clean: String = title.chars().take(40).collect();
    if clean.is_empty() {
        return Ok(bad_request("Title cannot be empty"));
    }
    let id = ctx.param("id").cloned().unwrap_or_default();
    let d = db::db(env)?;
    let changed = db::run(
        &d,
        "UPDATE chat_sessions SET title = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?",
        &[db::js(&clean), db::js(&id), db::js(&auth_user.user_id)],
    )
    .await?;
    if changed == 0 {
        return Ok(not_found());
    }
    let row = db::first::<SessionRow>(
        &d,
        "SELECT id, user_id, title, messages, created_at, updated_at FROM chat_sessions WHERE id = ?",
        &[db::js(&id)],
    )
    .await?
    .ok_or_else(|| Error::RustError("not found".into()))?;
    Ok(json_resp(serde_json::json!({
        "id": row.id,
        "user_id": row.user_id,
        "title": row.title,
        "messages": serde_json::from_str::<serde_json::Value>(&row.messages).unwrap_or(serde_json::json!([])),
    })))
}

/// POST /v1/coach/log — stores the container tag and appends the assistant reply.
pub async fn log(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let d = db::db(env)?;
    let container_tag = body
        .get("container_tag")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let reply = body.get("reply").and_then(|v| v.as_str()).unwrap_or("");
    let session_id = body
        .get("session_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if container_tag.is_empty() {
        return Ok(bad_request("missing container_tag"));
    }
    let row_id = Uuid::new_v4().to_string();
    let _ = db::run(
        &d,
        "INSERT INTO coach_logs (id, user_id, container_tag) VALUES (?, ?, ?)
         ON CONFLICT (user_id, container_tag) DO NOTHING",
        &[
            db::js(&row_id),
            db::js(&auth_user.user_id),
            db::js(container_tag),
        ],
    )
    .await;

    if !session_id.is_empty() {
        let mut msgs: Vec<serde_json::Value> = body
            .get("messages")
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default();
        msgs.push(serde_json::json!({ "role": "assistant", "content": reply }));
        let encoded = serde_json::to_string(&msgs).unwrap_or_else(|_| "[]".into());
        let _ = db::run(
            &d,
            "UPDATE chat_sessions SET messages = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            &[
                db::js(&encoded),
                db::js(&Utc::now().format("%Y-%m-%d %H:%M:%S").to_string()),
                db::js(&session_id),
                db::js(&auth_user.user_id),
            ],
        )
        .await;
    }

    Ok(json_resp(serde_json::json!({ "ok": true })))
}
