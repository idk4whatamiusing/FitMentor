//! User + profile endpoints (ported from routes/user.rs).

use uuid::Uuid;
use worker::*;

use crate::auth;
use crate::db;
use crate::handlers::{bad_request, internal, unauthorized};
use crate::models::{ProfileRow, UserRow};
use wasm_bindgen::JsValue;

fn json_resp(v: serde_json::Value) -> Response {
    Response::from_json(&v).unwrap_or_else(|_| Response::empty().unwrap())
}

async fn upsert_user(env: &Env, cf_sub: &str, email: &str) -> Result<UserRow> {
    let d = db::db(env)?;
    let new_id = Uuid::new_v4().to_string();
    db::run(
        &d,
        "INSERT INTO users (id, cf_access_sub, email) VALUES (?, ?, ?)
         ON CONFLICT (cf_access_sub) DO UPDATE SET email = excluded.email, updated_at = datetime('now')",
        &[db::js(&new_id), db::js(cf_sub), db::js(email)],
    )
    .await?;
    db::first::<UserRow>(
        &d,
        "SELECT id, cf_access_sub, email, name, created_at, updated_at FROM users WHERE cf_access_sub = ?",
        &[db::js(cf_sub)],
    )
    .await?
    .ok_or_else(|| Error::RustError("user not found after upsert".into()))
}

async fn fetch_user(env: &Env, cf_sub: &str) -> Result<UserRow> {
    let d = db::db(env)?;
    db::first::<UserRow>(
        &d,
        "SELECT id, cf_access_sub, email, name, created_at, updated_at FROM users WHERE cf_access_sub = ?",
        &[db::js(cf_sub)],
    )
    .await?
    .ok_or_else(|| Error::RustError("not found".into()))
}

async fn fetch_profile(env: &Env, user_id: &str) -> Result<Option<ProfileRow>> {
    let d = db::db(env)?;
    db::first::<ProfileRow>(
        &d,
        "SELECT id, user_id, name, age, gender, height_cm, weight_kg, goal, place, experience,
                diet, days_per_week, budget_per_day, health_conditions, custom_protein_g,
                created_at, updated_at
         FROM profiles WHERE user_id = ?",
        &[db::js(user_id)],
    )
    .await
}

async fn ensure_profile(env: &Env, user_id: &str) -> Result<()> {
    let d = db::db(env)?;
    let id = Uuid::new_v4().to_string();
    db::run(
        &d,
        "INSERT INTO profiles (id, user_id) VALUES (?, ?) ON CONFLICT (user_id) DO NOTHING",
        &[db::js(&id), db::js(user_id)],
    )
    .await?;
    Ok(())
}

fn user_profile_payload(user: &UserRow, profile: Option<&ProfileRow>) -> serde_json::Value {
    serde_json::json!({
        "data": {
            "user": user.to_json(),
            "profile": profile.map(|p| p.to_json()),
        }
    })
}

pub async fn get_me(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let user = match upsert_user(env, &auth_user.user_id, &auth_user.email).await {
        Ok(u) => u,
        Err(e) => return Ok(internal(&e.to_string())),
    };
    if let Err(e) = ensure_profile(env, &user.id).await {
        return Ok(internal(&e.to_string()));
    }
    let profile = match fetch_profile(env, &user.id).await {
        Ok(p) => p,
        Err(e) => return Ok(internal(&e.to_string())),
    };
    Ok(json_resp(user_profile_payload(&user, profile.as_ref())))
}

pub async fn exists(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let found = fetch_user(env, &auth_user.user_id).await;
    Ok(json_resp(serde_json::json!({ "exists": found.is_ok() })))
}

pub async fn update_profile(mut req: Request, mut ctx: RouteContext<()>) -> Result<Response> {
    let env = ctx.env.clone();
    let auth_user = match auth::require_user(&req, &env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let user = match fetch_user(&env, &auth_user.user_id).await {
        Ok(u) => u,
        Err(_) => return Ok(internal("user not found")),
    };
    if let Err(e) = ensure_profile(&env, &user.id).await {
        return Ok(internal(&e.to_string()));
    }

    let name = body.get("name").and_then(|v| v.as_str());
    if let Some(n) = name {
        let d = match db::db(&env) {
            Ok(d) => d,
            Err(e) => return Ok(internal(&e.to_string())),
        };
        let _ = db::run(
            &d,
            "UPDATE users SET name = ?, updated_at = datetime('now') WHERE id = ?",
            &[db::js(n), db::js(&user.id)],
        )
        .await;
    }

    let d = match db::db(&env) {
        Ok(d) => d,
        Err(e) => return Ok(internal(&e.to_string())),
    };
    let str_or_null = |k: &str| db::js_opt(body.get(k).and_then(|v| v.as_str()));
    let num_or_null = |k: &str| db::js_opt_num(body.get(k).and_then(|v| v.as_i64()));
    let health = body
        .get("healthConditions")
        .map(|v| v.to_string())
        .map(|s| db::js(&s))
        .unwrap_or(JsValue::NULL);

    if let Err(e) = db::run(
        &d,
        "UPDATE profiles SET
            name = COALESCE(?, name),
            age = COALESCE(?, age),
            gender = COALESCE(?, gender),
            height_cm = COALESCE(?, height_cm),
            weight_kg = COALESCE(?, weight_kg),
            goal = COALESCE(?, goal),
            place = COALESCE(?, place),
            experience = COALESCE(?, experience),
            diet = COALESCE(?, diet),
            days_per_week = COALESCE(?, days_per_week),
            budget_per_day = COALESCE(?, budget_per_day),
            health_conditions = COALESCE(?, health_conditions),
            updated_at = datetime('now')
         WHERE user_id = ?",
        &[
            str_or_null("name"),
            num_or_null("age"),
            str_or_null("gender"),
            num_or_null("heightCm"),
            num_or_null("weightKg"),
            str_or_null("goal"),
            str_or_null("place"),
            str_or_null("experience"),
            str_or_null("diet"),
            num_or_null("daysPerWeek"),
            num_or_null("budgetPerDay"),
            health,
            db::js(&user.id),
        ],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }

    let profile = fetch_profile(&env, &user.id).await.ok().flatten();
    // Refresh user so a changed name is reflected.
    let user = fetch_user(&env, &auth_user.user_id).await.unwrap_or(user);
    ctx.data = ();
    Ok(json_resp(user_profile_payload(&user, profile.as_ref())))
}

pub async fn update_protein_target(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let auth_user = match auth::require_user(&req, env).await {
        Ok(u) => u,
        Err(_) => return Ok(unauthorized()),
    };
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let user = match fetch_user(env, &auth_user.user_id).await {
        Ok(u) => u,
        Err(_) => return Ok(internal("user not found")),
    };
    let d = match db::db(env) {
        Ok(d) => d,
        Err(e) => return Ok(internal(&e.to_string())),
    };
    let protein = db::js_opt_num(body.get("proteinG").and_then(|v| v.as_i64()));
    if let Err(e) = db::run(
        &d,
        "UPDATE profiles SET custom_protein_g = ?, updated_at = datetime('now') WHERE user_id = ?",
        &[protein, db::js(&user.id)],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }
    Ok(json_resp(
        serde_json::json!({ "data": { "user": user.to_json() } }),
    ))
}

/// POST /v1/user/sync — server-to-server, own x-api-key check.
pub async fn sync(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let env = &ctx.env;
    let secret = env
        .secret("API_SHARED_SECRET")
        .ok()
        .map(|s| s.to_string())
        .unwrap_or_default();
    let key = req
        .headers()
        .get("x-api-key")
        .ok()
        .flatten()
        .unwrap_or_default();
    if secret.is_empty() || key != secret {
        return Ok(unauthorized());
    }
    let body: serde_json::Value = match req.json().await {
        Ok(b) => b,
        Err(_) => return Ok(bad_request("invalid json")),
    };
    let cf_sub = body.get("cf_sub").and_then(|v| v.as_str()).unwrap_or("");
    let email = body.get("email").and_then(|v| v.as_str()).unwrap_or("");
    let name = body.get("name").and_then(|v| v.as_str()).unwrap_or("");
    if cf_sub.is_empty() || email.is_empty() {
        return Ok(bad_request("missing cf_sub or email"));
    }

    let new_id = Uuid::new_v4().to_string();
    let d = match db::db(env) {
        Ok(d) => d,
        Err(e) => return Ok(internal(&e.to_string())),
    };
    if let Err(e) = db::run(
        &d,
        "INSERT INTO users (id, cf_access_sub, email, name) VALUES (?, ?, ?, ?)
         ON CONFLICT (cf_access_sub) DO UPDATE SET email = excluded.email,
         name = CASE WHEN excluded.name = '' THEN users.name ELSE excluded.name END,
         updated_at = datetime('now')",
        &[db::js(&new_id), db::js(cf_sub), db::js(email), db::js(name)],
    )
    .await
    {
        return Ok(internal(&e.to_string()));
    }
    let user = match fetch_user(env, cf_sub).await {
        Ok(u) => u,
        Err(e) => return Ok(internal(&e.to_string())),
    };

    let session_id = Uuid::new_v4().to_string();
    let payload = serde_json::json!({
        "sub": cf_sub, "cf_sub": cf_sub, "email": email, "name": name,
        "iat": js_sys::Date::now() as i64,
    });
    if let Ok(kv) = env.kv("SESSIONS") {
        let _ = kv
            .put(&session_id, payload.to_string())?
            .expiration_ttl(604800)
            .execute()
            .await;
    }
    Ok(json_resp(serde_json::json!({
        "ok": true,
        "session_id": session_id,
        "user": { "id": user.id, "cf_sub": user.cf_access_sub, "email": user.email }
    })))
}
