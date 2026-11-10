//! Daily logs + streak.

use chrono::Utc;
use uuid::Uuid;
use worker::*;

use crate::auth;
use crate::db;
use crate::handlers::{bad_request, internal, unauthorized};
use crate::models::DailyLogRow;

fn json_resp(v: serde_json::Value) -> Response {
    Response::from_json(&v).unwrap_or_else(|_| Response::empty().unwrap())
}

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

async fn user_id_for(env: &Env, cf_sub: &str) -> Result<String> {
    let d = db::db(env)?;
    #[derive(serde::Deserialize)]
    struct IdRow {
        id: String,
    }
    db::first::<IdRow>(
        &d,
        "SELECT id FROM users WHERE cf_access_sub = ?",
        &[db::js(cf_sub)],
    )
    .await?
    .map(|r| r.id)
    .ok_or_else(|| Error::RustError("unauthorized".into()))
}

const LOG_COLS: &str = "id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg, created_at, updated_at";

pub async fn get_today(req: Request, ctx: RouteContext<()>) -> Result<Response> {
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
    let row = db::first::<DailyLogRow>(
        &d,
        &format!("SELECT {LOG_COLS} FROM daily_logs WHERE user_id = ? AND date = ?"),
        &[db::js(&uid), db::js(&today())],
    )
    .await?;
    Ok(json_resp(serde_json::json!({
        "data": { "log": row.map(|r| r.to_json()) }
    })))
}

pub async fn upsert_today(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let uid = match user_id_for(env, &auth_user.user_id).await {
        Ok(v) => v,
        Err(_) => return Ok(internal("user not found")),
    };
    let d = db::db(env)?;
    let id = Uuid::new_v4().to_string();
    let num = |k: &str, def: i64| db::js_num(body.get(k).and_then(|v| v.as_i64()).unwrap_or(def));
    let sleep = body.get("sleep").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let protein = body.get("proteinG").and_then(|v| v.as_f64()).unwrap_or(0.0);
    let done = body
        .get("workoutDone")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let weight = db::js_opt_f64(body.get("weightKg").and_then(|v| v.as_f64()));

    if let Err(e) = db::run(
        &d,
        "INSERT INTO daily_logs (id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, date) DO UPDATE SET
            water = excluded.water,
            sleep = excluded.sleep,
            steps = excluded.steps,
            protein_g = excluded.protein_g,
            workout_done = excluded.workout_done,
            weight_kg = COALESCE(excluded.weight_kg, daily_logs.weight_kg),
            updated_at = datetime('now')",
        &[
            db::js(&id),
            db::js(&uid),
            db::js(&today()),
            num("water", 0),
            db::js_num(sleep.round() as i64),
            num("steps", 0),
            db::js_num(protein.round() as i64),
            db::js_bool(done),
            weight,
        ],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }

    let row = db::first::<DailyLogRow>(
        &d,
        &format!("SELECT {LOG_COLS} FROM daily_logs WHERE user_id = ? AND date = ?"),
        &[db::js(&uid), db::js(&today())],
    )
    .await?;
    Ok(json_resp(serde_json::json!({
        "data": { "log": row.map(|r| r.to_json()) }
    })))
}

pub async fn range(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let url = req.url()?;
    let mut from = String::new();
    let mut to = String::new();
    for (k, v) in url.query_pairs() {
        match k.as_ref() {
            "from" => from = v.to_string(),
            "to" => to = v.to_string(),
            _ => {}
        }
    }
    if from.is_empty() || to.is_empty() {
        return Ok(bad_request("missing from/to"));
    }
    let uid = match user_id_for(env, &auth_user.user_id).await {
        Ok(v) => v,
        Err(_) => return Ok(internal("user not found")),
    };
    let d = db::db(env)?;
    let rows = db::all::<DailyLogRow>(
        &d,
        &format!(
            "SELECT {LOG_COLS} FROM daily_logs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date DESC"
        ),
        &[db::js(&uid), db::js(&from), db::js(&to)],
    )
    .await?;
    Ok(json_resp(serde_json::json!({
        "data": { "logs": rows.iter().map(|r| r.to_json()).collect::<Vec<_>>() }
    })))
}

pub async fn streak(req: Request, ctx: RouteContext<()>) -> Result<Response> {
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
    struct DateRow {
        date: String,
    }
    let rows = db::all::<DateRow>(
        &d,
        "SELECT date FROM daily_logs WHERE user_id = ? AND workout_done = 1 ORDER BY date DESC LIMIT 100",
        &[db::js(&uid)],
    )
    .await?;

    let mut streak: i64 = 0;
    let mut expected = today();
    for row in &rows {
        if row.date == expected {
            streak += 1;
            if let Ok(dt) = chrono::NaiveDate::parse_from_str(&expected, "%Y-%m-%d") {
                expected = (dt - chrono::Duration::days(1))
                    .format("%Y-%m-%d")
                    .to_string();
            }
        } else {
            break;
        }
    }
    Ok(json_resp(
        serde_json::json!({ "data": { "streak": streak } }),
    ))
}
