//! Daily planner — Rust port of microservices/daily-planner.
//!
//! Runs on a Cron Trigger (00:30 UTC) over all users, or on demand for one
//! user via `POST /v1/planner/generate` (x-api-key).
//!
//! AI calls go to the Pages worker (`/api/ai/complete`), which holds the
//! Workers AI binding — same path the Python planner used.

use chrono::Utc;
use uuid::Uuid;
use worker::*;

use crate::db;
use wasm_bindgen::JsValue;

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

fn json_resp(v: serde_json::Value) -> Response {
    Response::from_json(&v).unwrap_or_else(|_| Response::empty().unwrap())
}

async fn call_ai(env: &Env, system: &str, prompt: &str, max_tokens: i64) -> Option<String> {
    let url = env
        .var("AI_WORKER_URL")
        .map(|v| v.to_string())
        .ok()
        .filter(|s| !s.is_empty())?;
    let secret = env
        .secret("API_SHARED_SECRET")
        .map(|s| s.to_string())
        .or_else(|_| env.var("API_SHARED_SECRET").map(|v| v.to_string()))
        .unwrap_or_default();

    let payload = serde_json::json!({
        "system": system, "prompt": prompt, "max_tokens": max_tokens
    });
    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_body(Some(JsValue::from_str(&payload.to_string())));
    let mut req = Request::new_with_init(&url, &init).ok()?;
    if let Ok(h) = req.headers_mut() {
        let _ = h.set("x-api-key", &secret);
    }
    if let Ok(h) = req.headers_mut() {
        let _ = h.set("content-type", "application/json");
    }
    match Fetch::Request(req).send().await {
        Ok(mut resp) => {
            let text = resp.text().await.ok()?;
            let v: serde_json::Value = serde_json::from_str(&text).ok()?;
            v.get("result")
                .and_then(|r| r.as_str())
                .map(|s| s.to_string())
        }
        Err(_) => None,
    }
}

async fn call_ai_json(env: &Env, system: &str, prompt: &str, max_tokens: i64) -> serde_json::Value {
    for _ in 0..3 {
        if let Some(raw) = call_ai(env, system, prompt, max_tokens).await {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(raw.trim()) {
                return v;
            }
        }
    }
    serde_json::Value::Null
}

async fn save_plan(env: &Env, table: &str, user_id: &str, plan: &serde_json::Value) -> Result<()> {
    let d = db::db(env)?;
    let id = Uuid::new_v4().to_string();
    let sql = format!(
        "INSERT INTO {table} (id, user_id, date, plan) VALUES (?, ?, ?, ?)
         ON CONFLICT (user_id, date) DO UPDATE SET plan = excluded.plan, updated_at = datetime('now')"
    );
    db::run(
        &d,
        &sql,
        &[
            db::js(&id),
            db::js(user_id),
            db::js(&today()),
            db::js(&plan.to_string()),
        ],
    )
    .await?;
    Ok(())
}

#[derive(serde::Deserialize)]
struct Profile {
    user_id: String,
    diet: Option<String>,
    budget_per_day: Option<i64>,
    goal: Option<String>,
    place: Option<String>,
    experience: Option<String>,
    days_per_week: Option<i64>,
    health_conditions: Option<String>,
    weight_kg: Option<i64>,
    height_cm: Option<i64>,
}

async fn profile_for(env: &Env, cf_sub: &str) -> Option<Profile> {
    let d = db::db(env).ok()?;
    db::first::<Profile>(
        &d,
        "SELECT p.user_id, p.diet, p.budget_per_day, p.goal, p.place, p.experience,
                p.days_per_week, p.health_conditions, p.weight_kg, p.height_cm
         FROM profiles p JOIN users u ON u.id = p.user_id
         WHERE u.cf_access_sub = ?",
        &[db::js(cf_sub)],
    )
    .await
    .ok()
    .flatten()
}

/// Generate all six plans for one user.
pub async fn run_for_user(env: &Env, cf_sub: &str) {
    let Some(profile) = profile_for(env, cf_sub).await else {
        return;
    };

    let diet = profile.diet.clone().unwrap_or_else(|| "veg".into());
    let budget = profile.budget_per_day.unwrap_or(150);
    let goal = profile.goal.clone().unwrap_or_else(|| "muscle_gain".into());
    let place = profile.place.clone().unwrap_or_else(|| "gym".into());
    let exp = profile
        .experience
        .clone()
        .unwrap_or_else(|| "beginner".into());
    let days = profile.days_per_week.unwrap_or(4);
    let health = profile
        .health_conditions
        .clone()
        .unwrap_or_else(|| "[]".into());

    // 1. meals
    let meals = call_ai_json(
        env,
        "You are a meal planner for Indian beginners. Return a JSON object with a \"meals\" array (4 items: Breakfast, Lunch, Snack, Dinner). Each meal has name (string), items (string), kcal (number), protein (number). Return ONLY the JSON object, no markdown.",
        &format!("Diet: {diet}, budget: INR {budget}/day, health: {health}"),
        2048,
    )
    .await;
    let meal_plan = serde_json::json!([{
        "id": format!("plan-{}", today()),
        "title": "Today's Plan",
        "budgetPerDay": budget,
        "diet": diet,
        "meals": meals.get("meals").cloned().unwrap_or(serde_json::json!([])),
    }]);
    let _ = save_plan(env, "meal_plans", cf_sub, &meal_plan).await;

    // 2. workout
    let workout = call_ai_json(
        env,
        &format!("You are a fitness coach for Indian beginners. Generate a JSON workout plan ({days} days). Each day has title, focus, exercises[]. Each exercise has name (string), sets (number), reps (string), rest (string), muscles (string[]), tips (string), alt (string). Return ONLY the JSON array. Be very concise."),
        &format!("Goal: {goal}, place: {place}, experience: {exp}, health: {health}"),
        4096,
    )
    .await;
    let workout_plan = if workout.is_array() {
        workout
    } else {
        serde_json::json!([])
    };
    let _ = save_plan(env, "workout_plans", cf_sub, &workout_plan).await;

    // 3. BMI advice
    let bmi = match (profile.weight_kg, profile.height_cm) {
        (Some(w), Some(h)) if h > 0 => {
            let m = h as f64 / 100.0;
            (w as f64 / (m * m) * 10.0).round() / 10.0
        }
        _ => 21.0,
    };
    let bmi_advice = call_ai_json(
        env,
        "You are a fitness and nutrition coach. Give 3-4 specific tips. Return ONLY a JSON array of strings.",
        &format!("BMI: {bmi}, Goal: {goal}, Diet: {diet}, Place: {place}"),
        1024,
    )
    .await;
    let _ = save_plan(env, "bmi_advice", cf_sub, &as_array(bmi_advice)).await;

    // 4. Sleep advice
    let sleep_advice = call_ai_json(
        env,
        "You are a sleep coach. Give 3 specific tips. Return ONLY a JSON array of strings.",
        &format!("Goal: {goal}, experience: {exp}. Give general sleep advice for recovery."),
        1024,
    )
    .await;
    let _ = save_plan(env, "sleep_advice", cf_sub, &as_array(sleep_advice)).await;

    // 5. Injury prevention
    let injury = call_ai_json(
        env,
        "You are a physio therapist. Give general injury prevention advice. Return ONLY a JSON array of strings.",
        &format!("Experience: {exp}, Place: {place}, Goal: {goal}. Give 3 tips."),
        1024,
    )
    .await;
    let _ = save_plan(env, "injury_advice", cf_sub, &as_array(injury)).await;

    // 6. Form tips
    let form = call_ai_json(
        env,
        "You are a strength coach. Give general exercise form advice. Return ONLY a JSON array of strings.",
        &format!("Experience: {exp}, Place: {place}, Goal: {goal}. Give 3 tips."),
        1024,
    )
    .await;
    let _ = save_plan(env, "form_advice", cf_sub, &as_array(form)).await;

    let _ = profile.user_id;
}

fn as_array(v: serde_json::Value) -> serde_json::Value {
    if v.is_array() {
        v
    } else {
        serde_json::json!([])
    }
}

/// Cron: iterate every user.
pub async fn run_batch(env: &Env) {
    #[derive(serde::Deserialize)]
    struct SubRow {
        cf_access_sub: String,
    }
    let Ok(d) = db::db(env) else { return };
    let Ok(rows) = db::all::<SubRow>(&d, "SELECT cf_access_sub FROM users", &[]).await else {
        return;
    };
    for row in rows {
        run_for_user(env, &row.cf_access_sub).await;
    }
}

/// POST /v1/planner/generate — x-api-key protected, body `{ "user_id": "…" }`.
pub async fn handle_generate(mut req: Request, env: Env) -> Result<Response> {
    let secret = env
        .secret("API_SHARED_SECRET")
        .map(|s| s.to_string())
        .or_else(|_| env.var("API_SHARED_SECRET").map(|v| v.to_string()))
        .unwrap_or_default();
    let key = req
        .headers()
        .get("x-api-key")
        .ok()
        .flatten()
        .unwrap_or_default();
    if secret.is_empty() || key != secret {
        return Ok(crate::handlers::unauthorized());
    }
    let body: serde_json::Value = req.json().await.unwrap_or_else(|_| serde_json::json!({}));
    match body.get("user_id").and_then(|v| v.as_str()) {
        Some(uid) if !uid.is_empty() => {
            run_for_user(&env, uid).await;
            Ok(json_resp(serde_json::json!({ "ok": true, "user_id": uid })))
        }
        _ => {
            run_batch(&env).await;
            Ok(json_resp(
                serde_json::json!({ "ok": true, "mode": "batch" }),
            ))
        }
    }
}
