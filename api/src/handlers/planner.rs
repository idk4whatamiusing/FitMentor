//! Daily planner.
//!
//! Runs on an EventBridge schedule (00:30 UTC) over all users, or on demand for
//! one user via `POST /v1/planner/generate` (x-api-key).
//!
//! AI calls go to the Cloudflare Pages worker (`/api/ai/complete`), which holds
//! the Workers AI binding.

use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::app::AppState;

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

pub async fn call_ai(
    state: &AppState,
    system: &str,
    prompt: &str,
    max_tokens: i64,
) -> Option<String> {
    let url = state.config.ai_worker_url.trim();
    if url.is_empty() {
        return None;
    }

    let response = state
        .http
        .post(url)
        .header("x-api-key", &state.config.api_shared_secret)
        .json(&json!({
            "system": system,
            "prompt": prompt,
            "max_tokens": max_tokens,
        }))
        .send()
        .await
        .ok()?;

    let value: Value = response.json().await.ok()?;
    value
        .get("result")
        .and_then(Value::as_str)
        .map(str::to_string)
}

async fn call_ai_json(state: &AppState, system: &str, prompt: &str, max_tokens: i64) -> Value {
    for _ in 0..3 {
        if let Some(raw) = call_ai(state, system, prompt, max_tokens).await {
            if let Ok(value) = serde_json::from_str::<Value>(raw.trim()) {
                return value;
            }
        }
    }
    Value::Null
}

async fn save_plan(
    state: &AppState,
    table: &str,
    user_id: &str,
    plan: &Value,
) -> Result<(), sqlx::Error> {
    let id = Uuid::new_v4().to_string();
    let sql = format!(
        "INSERT INTO {table} (id, user_id, date, plan) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, date) DO UPDATE SET plan = excluded.plan, updated_at = now()::text"
    );
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(&id)
        .bind(user_id)
        .bind(today())
        .bind(plan.to_string())
        .execute(&state.pool)
        .await?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct Profile {
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

async fn profile_for(state: &AppState, cf_sub: &str) -> Option<Profile> {
    sqlx::query_as::<_, Profile>(
        "SELECT p.diet, p.budget_per_day, p.goal, p.place, p.experience,
                p.days_per_week, p.health_conditions, p.weight_kg, p.height_cm
         FROM profiles p JOIN users u ON u.id = p.user_id
         WHERE u.cf_access_sub = $1",
    )
    .bind(cf_sub)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
}

/// Generate all six plans for one user.
pub async fn run_for_user(state: &AppState, cf_sub: &str) {
    let Some(profile) = profile_for(state, cf_sub).await else {
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
        state,
        "You are a meal planner for Indian beginners. Return a JSON object with a \"meals\" array (4 items: Breakfast, Lunch, Snack, Dinner). Each meal has name (string), items (string), kcal (number), protein (number). Return ONLY the JSON object, no markdown.",
        &format!("Diet: {diet}, budget: INR {budget}/day, health: {health}"),
        2048,
    )
    .await;
    let meal_plan = json!([{
        "id": format!("plan-{}", today()),
        "title": "Today's Plan",
        "budgetPerDay": budget,
        "diet": diet,
        "meals": meals.get("meals").cloned().unwrap_or(json!([])),
    }]);
    let _ = save_plan(state, "meal_plans", cf_sub, &meal_plan).await;

    // 2. workout
    let workout = call_ai_json(
        state,
        &format!("You are a fitness coach for Indian beginners. Generate a JSON workout plan ({days} days). Each day has title, focus, exercises[]. Each exercise has name (string), sets (number), reps (string), rest (string), muscles (string[]), tips (string), alt (string). Return ONLY the JSON array. Be very concise."),
        &format!("Goal: {goal}, place: {place}, experience: {exp}, health: {health}"),
        4096,
    )
    .await;
    let workout_plan = if workout.is_array() {
        workout
    } else {
        json!([])
    };
    let _ = save_plan(state, "workout_plans", cf_sub, &workout_plan).await;

    // 3. BMI advice
    let bmi = match (profile.weight_kg, profile.height_cm) {
        (Some(w), Some(h)) if h > 0 => {
            let m = h as f64 / 100.0;
            (w as f64 / (m * m) * 10.0).round() / 10.0
        }
        _ => 21.0,
    };
    let bmi_advice = call_ai_json(
        state,
        "You are a fitness and nutrition coach. Give 3-4 specific tips. Return ONLY a JSON array of strings.",
        &format!("BMI: {bmi}, Goal: {goal}, Diet: {diet}, Place: {place}"),
        1024,
    )
    .await;
    let _ = save_plan(state, "bmi_advice", cf_sub, &as_array(bmi_advice)).await;

    // 4. Sleep advice
    let sleep_advice = call_ai_json(
        state,
        "You are a sleep coach. Give 3 specific tips. Return ONLY a JSON array of strings.",
        &format!("Goal: {goal}, experience: {exp}. Give general sleep advice for recovery."),
        1024,
    )
    .await;
    let _ = save_plan(state, "sleep_advice", cf_sub, &as_array(sleep_advice)).await;

    // 5. Injury prevention
    let injury = call_ai_json(
        state,
        "You are a physio therapist. Give general injury prevention advice. Return ONLY a JSON array of strings.",
        &format!("Experience: {exp}, Place: {place}, Goal: {goal}. Give 3 tips."),
        1024,
    )
    .await;
    let _ = save_plan(state, "injury_advice", cf_sub, &as_array(injury)).await;

    // 6. Form tips
    let form = call_ai_json(
        state,
        "You are a strength coach. Give general exercise form advice. Return ONLY a JSON array of strings.",
        &format!("Experience: {exp}, Place: {place}, Goal: {goal}. Give 3 tips."),
        1024,
    )
    .await;
    let _ = save_plan(state, "form_advice", cf_sub, &as_array(form)).await;
}

fn as_array(value: Value) -> Value {
    if value.is_array() {
        value
    } else {
        json!([])
    }
}

/// Cron: iterate every user.
pub async fn run_batch(state: &AppState) {
    let rows = match sqlx::query_scalar::<_, String>("SELECT cf_access_sub FROM users")
        .fetch_all(&state.pool)
        .await
    {
        Ok(rows) => rows,
        Err(error) => {
            tracing::error!(%error, "planner: failed to list users");
            return;
        }
    };

    for cf_sub in rows {
        run_for_user(state, &cf_sub).await;
    }
}
