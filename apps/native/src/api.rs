//! Minimal FitMentor API client for the Slint spike.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

const DEFAULT_API_URL: &str =
    "https://vfvwjpw567ghnqwknc2m74thx40jmpiw.lambda-url.ap-south-1.on.aws";

static TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static STORAGE_DIR: OnceLock<PathBuf> = OnceLock::new();

fn token_cell() -> &'static Mutex<Option<String>> {
    TOKEN.get_or_init(|| Mutex::new(None))
}

pub fn set_storage_dir(dir: PathBuf) {
    let _ = STORAGE_DIR.set(dir);
}

fn storage_dir() -> Option<PathBuf> {
    if let Some(dir) = STORAGE_DIR.get() {
        return Some(dir.clone());
    }
    #[cfg(not(target_os = "android"))]
    {
        env::var("HOME")
            .ok()
            .map(|home| PathBuf::from(home).join(".fitmentor"))
    }
    #[cfg(target_os = "android")]
    {
        None
    }
}

fn token_path() -> Option<PathBuf> {
    storage_dir().map(|dir| dir.join("token"))
}

pub fn set_token(token: Option<String>) {
    if let Ok(mut slot) = token_cell().lock() {
        *slot = token.clone();
    }
    let Some(path) = token_path() else {
        return;
    };
    match token {
        Some(token) => {
            if let Some(parent) = path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::write(&path, token).is_ok() {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
                }
            }
        }
        None => {
            let _ = fs::remove_file(path);
        }
    }
}

pub fn load_token() -> Option<String> {
    let path = token_path()?;
    fs::read_to_string(path)
        .ok()
        .map(|token| token.trim().to_string())
        .filter(|token| !token.is_empty())
}

fn theme_path() -> Option<PathBuf> {
    storage_dir().map(|dir| dir.join("theme"))
}

pub fn load_theme_dark() -> Option<bool> {
    let path = theme_path()?;
    match fs::read_to_string(path).ok()?.trim() {
        "dark" => Some(true),
        "light" => Some(false),
        _ => None,
    }
}

pub fn save_theme_dark(dark: bool) {
    let Some(path) = theme_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, if dark { "dark" } else { "light" });
}

fn token() -> Option<String> {
    token_cell().lock().ok().and_then(|slot| slot.clone())
}

fn base_url() -> String {
    env::var("FITMENTOR_API_URL")
        .unwrap_or_else(|_| DEFAULT_API_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

#[derive(Debug, Default, Clone)]
pub struct TodayLog {
    pub water: i64,
    pub sleep: i64,
    pub steps: i64,
    pub protein_g: i64,
    pub workout_done: bool,
    pub weight_kg: Option<f64>,
}

#[derive(Debug, Clone)]
pub struct User {
    pub name: String,
    pub email: String,
}

#[derive(Deserialize)]
struct Envelope {
    data: Data,
}

#[derive(Deserialize)]
struct Data {
    log: Option<Log>,
}

#[derive(Deserialize, Default)]
struct Log {
    water: Option<i64>,
    sleep: Option<i64>,
    steps: Option<i64>,
    protein_g: Option<i64>,
    #[serde(rename = "workoutDone")]
    workout_done: Option<bool>,
    #[serde(rename = "weightKg")]
    weight_kg: Option<f64>,
}

#[derive(Deserialize)]
struct MeEnvelope {
    user: MeUser,
}

#[derive(Deserialize)]
struct MeUser {
    name: Option<String>,
    email: Option<String>,
}

fn authorized_request(
    method: &str,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<ureq::Response, String> {
    let url = format!("{}{}", base_url(), path);
    let request = match method {
        "GET" => ureq::get(&url),
        "PUT" => ureq::put(&url),
        "POST" => ureq::post(&url),
        _ => return Err(format!("Unsupported method: {method}")),
    };

    let request = if let Some(token) = token() {
        request.set("authorization", &format!("Bearer {token}"))
    } else {
        let key = env::var("FITMENTOR_API_KEY")
            .map_err(|_| "Sign in with a mobile token to load your data".to_string())?;
        let user_id = env::var("FITMENTOR_USER_ID")
            .map_err(|_| "Sign in with a mobile token to load your data".to_string())?;
        request.set("x-api-key", &key).set("x-user-id", &user_id)
    };

    match body {
        Some(body) => request.send_json(body),
        None => request.call(),
    }
    .map_err(|error| format!("API request failed: {error}"))
}

fn authorized_get(path: &str) -> Result<ureq::Response, String> {
    authorized_request("GET", path, None)
}

pub fn fetch_today() -> Result<TodayLog, String> {
    let response = authorized_get("/v1/logs/today")?;
    let envelope: Envelope = response
        .into_json()
        .map_err(|error| format!("Could not parse API response: {error}"))?;

    let log = envelope.data.log.unwrap_or_default();
    Ok(TodayLog {
        water: log.water.unwrap_or(0),
        sleep: log.sleep.unwrap_or(0),
        steps: log.steps.unwrap_or(0),
        protein_g: log.protein_g.unwrap_or(0),
        workout_done: log.workout_done.unwrap_or(false),
        weight_kg: log.weight_kg,
    })
}

pub fn fetch_me(token: &str) -> Result<User, String> {
    let url = format!("{}/v1/auth/me", base_url());
    let response = ureq::get(&url)
        .set("authorization", &format!("Bearer {token}"))
        .call()
        .map_err(|_| "Token was not accepted".to_string())?;
    let envelope: MeEnvelope = response
        .into_json()
        .map_err(|error| format!("Could not parse account: {error}"))?;
    Ok(User {
        name: envelope
            .user
            .name
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "Friend".to_string()),
        email: envelope.user.email.unwrap_or_default(),
    })
}

// ── Google browser sign-in ─────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct GoogleStart {
    pub state: String,
    pub auth_url: String,
}

#[derive(Debug, Clone)]
pub enum GooglePoll {
    Pending,
    Ok { token: String, name: String },
    Error(String),
    Expired,
}

pub fn start_google_login() -> Result<GoogleStart, String> {
    let state = uuid::Uuid::new_v4().simple().to_string();
    let response = ureq::post(&format!("{}/v1/auth/google/start", base_url()))
        .send_json(serde_json::json!({ "state": state }))
        .map_err(|error| format!("Could not start Google sign-in: {error}"))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse Google sign-in: {error}"))?;
    let state = value
        .get("state")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Google sign-in did not return a state".to_string())?;
    let auth_url = value
        .get("auth_url")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "Google sign-in did not return a URL".to_string())?;
    Ok(GoogleStart {
        state: state.to_string(),
        auth_url: auth_url.to_string(),
    })
}

pub fn poll_google_login(state: &str) -> Result<GooglePoll, String> {
    let response = ureq::post(&format!("{}/v1/auth/google/poll", base_url()))
        .send_json(serde_json::json!({ "state": state }))
        .map_err(|error| format!("Could not check Google sign-in: {error}"))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse Google sign-in: {error}"))?;
    match value
        .get("status")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("")
    {
        "pending" => Ok(GooglePoll::Pending),
        "ok" => {
            let token = value
                .get("token")
                .and_then(serde_json::Value::as_str)
                .ok_or_else(|| "Google sign-in did not return a token".to_string())?
                .to_string();
            let name = value
                .get("user")
                .and_then(|user| user.get("name"))
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Friend")
                .to_string();
            Ok(GooglePoll::Ok { token, name })
        }
        "error" => Ok(GooglePoll::Error(
            value
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Sign-in failed")
                .to_string(),
        )),
        "expired" => Ok(GooglePoll::Expired),
        other => Err(format!("Unexpected sign-in status: {other}")),
    }
}

// ── Profile / subscription ─────────────────────────────────────────

#[derive(Debug, Default, Clone)]
pub struct Profile {
    pub name: String,
    pub email: String,
    pub age: i64,
    pub gender: String,
    pub height_cm: i64,
    pub weight_kg: i64,
    pub goal: String,
    pub diet: String,
    pub place: String,
    pub experience: String,
    pub days_per_week: i64,
    pub budget_per_day: i64,
    pub tier: String,
}

pub fn fetch_profile() -> Result<Profile, String> {
    let response = authorized_get("/v1/user/me")?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse profile: {error}"))?;
    let data = value.get("data").cloned().unwrap_or_default();
    let user = data.get("user").cloned().unwrap_or_default();
    let profile = data.get("profile").cloned().unwrap_or_default();

    let tier = match authorized_get("/v1/user/subscription")
        .ok()
        .and_then(|response| response.into_json::<serde_json::Value>().ok())
    {
        Some(value) => value
            .get("data")
            .and_then(|data| data.get("subscription"))
            .and_then(|subscription| subscription.get("tier"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("free")
            .to_string(),
        None => "free".to_string(),
    };

    Ok(Profile {
        name: user
            .get("name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Friend")
            .to_string(),
        email: user
            .get("email")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        age: profile
            .get("age")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        gender: profile
            .get("gender")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("male")
            .to_string(),
        height_cm: profile
            .get("heightCm")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        weight_kg: profile
            .get("weightKg")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        goal: profile
            .get("goal")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        diet: profile
            .get("diet")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        place: profile
            .get("place")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        experience: profile
            .get("experience")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        days_per_week: profile
            .get("daysPerWeek")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        budget_per_day: profile
            .get("budgetPerDay")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        tier,
    })
}

#[derive(Debug, Clone)]
pub struct ProfileInput {
    pub name: String,
    pub age: i64,
    pub gender: String,
    pub height_cm: i64,
    pub weight_kg: i64,
    pub goal: String,
    pub place: String,
    pub experience: String,
    pub diet: String,
    pub days_per_week: i64,
    pub budget_per_day: i64,
    pub health_conditions: Vec<String>,
}

pub fn save_profile(input: &ProfileInput) -> Result<Profile, String> {
    let body = serde_json::json!({
        "name": input.name,
        "age": input.age,
        "gender": input.gender,
        "heightCm": input.height_cm,
        "weightKg": input.weight_kg,
        "goal": input.goal,
        "place": input.place,
        "experience": input.experience,
        "diet": input.diet,
        "daysPerWeek": input.days_per_week,
        "budgetPerDay": input.budget_per_day,
        "healthConditions": input.health_conditions,
    });
    let response = authorized_request("PUT", "/v1/user/profile", Some(body))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse saved profile: {error}"))?;
    Ok(profile_from_value(value, fetch_tier()))
}

fn fetch_tier() -> String {
    match authorized_get("/v1/user/subscription")
        .ok()
        .and_then(|response| response.into_json::<serde_json::Value>().ok())
    {
        Some(value) => value
            .get("data")
            .and_then(|data| data.get("subscription"))
            .and_then(|subscription| subscription.get("tier"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("free")
            .to_string(),
        None => "free".to_string(),
    }
}

fn profile_from_value(value: serde_json::Value, tier: String) -> Profile {
    let data = value.get("data").cloned().unwrap_or_default();
    let user = data.get("user").cloned().unwrap_or_default();
    let profile = data.get("profile").cloned().unwrap_or_default();

    Profile {
        name: user
            .get("name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Friend")
            .to_string(),
        email: user
            .get("email")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        age: profile
            .get("age")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        gender: profile
            .get("gender")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("male")
            .to_string(),
        height_cm: profile
            .get("heightCm")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        weight_kg: profile
            .get("weightKg")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        goal: profile
            .get("goal")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        diet: profile
            .get("diet")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        place: profile
            .get("place")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        experience: profile
            .get("experience")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        days_per_week: profile
            .get("daysPerWeek")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        budget_per_day: profile
            .get("budgetPerDay")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        tier,
    }
}

// ── Nutrition ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Meal {
    pub name: String,
    pub items: String,
    pub kcal: i64,
    pub protein: i64,
}

#[derive(Debug, Default, Clone)]
pub struct MealPlan {
    pub title: String,
    pub meals: Vec<Meal>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Targets {
    pub calories: i64,
    pub protein: i64,
    pub carbs: i64,
    pub fat: i64,
}

pub fn calc_targets(profile: &Profile) -> Targets {
    let base = 10 * profile.weight_kg + 625 * profile.height_cm / 100 - 5 * profile.age;
    let bmr = if profile.gender == "male" {
        base + 5
    } else {
        base - 161
    };
    let factor = 1.35 + profile.days_per_week.min(6) as f64 * 0.045;
    let tdee = (bmr as f64 * factor).round() as i64;
    let calories = match profile.goal.as_str() {
        "fat_loss" => tdee - 400,
        "muscle_gain" => tdee + 300,
        "recomp" => tdee - 150,
        _ => tdee,
    };
    let protein_per_kg = match profile.goal.as_str() {
        "muscle_gain" | "strength" => 1.8,
        "fat_loss" => 2.0,
        _ => 1.6,
    };
    let protein = (profile.weight_kg as f64 * protein_per_kg).round() as i64;
    let fat = (calories as f64 * 0.25 / 9.0).round() as i64;
    let carbs = ((calories - protein * 4 - fat * 9) as f64 / 4.0).round() as i64;
    Targets {
        calories,
        protein,
        carbs: carbs.max(0),
        fat,
    }
}

pub fn fetch_meal_plan() -> Result<MealPlan, String> {
    match authorized_request("GET", "/v1/meal/today", None) {
        Ok(response) => {
            let value: serde_json::Value = response
                .into_json()
                .map_err(|error| format!("Could not parse meal plan: {error}"))?;
            let plan = value
                .get("data")
                .and_then(|data| data.get("plan"))
                .cloned()
                .unwrap_or_default();
            let plan = if plan.is_array() {
                plan.as_array()
                    .and_then(|items| items.first())
                    .cloned()
                    .unwrap_or_default()
            } else {
                plan
            };
            let title = plan
                .get("title")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Today's plan")
                .to_string();
            let meals = plan
                .get("meals")
                .and_then(serde_json::Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .map(|meal| Meal {
                            name: meal
                                .get("name")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("Meal")
                                .to_string(),
                            items: meal
                                .get("items")
                                .and_then(serde_json::Value::as_str)
                                .unwrap_or("")
                                .to_string(),
                            kcal: meal
                                .get("kcal")
                                .and_then(serde_json::Value::as_i64)
                                .unwrap_or(0),
                            protein: meal
                                .get("protein")
                                .and_then(serde_json::Value::as_i64)
                                .unwrap_or(0),
                        })
                        .collect()
                })
                .unwrap_or_default();
            Ok(MealPlan { title, meals })
        }
        Err(error) if error.contains("404") => Ok(MealPlan::default()),
        Err(error) => Err(error),
    }
}

// ── Workouts ───────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct WorkoutDayView {
    pub day_index: i64,
    pub title: String,
    pub focus: String,
    pub summary: String,
    pub completed: bool,
    pub exercises: Vec<ExerciseView>,
}

#[derive(Debug, Clone, Default)]
pub struct ExerciseView {
    pub index: i64,
    pub name: String,
    pub sets: i64,
    pub reps: String,
    pub rest: String,
    pub muscles: String,
    pub tips: String,
    pub alt: String,
}

#[derive(Debug, Default)]
struct PlanDay {
    title: String,
    focus: String,
    summary: String,
    exercises: Vec<ExerciseView>,
}

pub fn fetch_workout() -> Result<Vec<WorkoutDayView>, String> {
    let plan = fetch_workout_plan()?;
    let completed = fetch_workout_completions()?;
    Ok(plan
        .into_iter()
        .enumerate()
        .map(|(index, day)| WorkoutDayView {
            day_index: index as i64,
            title: day.title,
            focus: day.focus,
            summary: format!("{} moves · ~45 min", day.exercises.len()),
            completed: completed.contains(&(index as i64)),
            exercises: day.exercises,
        })
        .collect())
}

fn fetch_workout_plan() -> Result<Vec<PlanDay>, String> {
    match authorized_request("GET", "/v1/workout/today", None) {
        Ok(response) => {
            let value: serde_json::Value = response
                .into_json()
                .map_err(|error| format!("Could not parse workout: {error}"))?;
            let plan = value
                .get("data")
                .and_then(|data| data.get("plan"))
                .cloned()
                .unwrap_or_default();
            let days = if plan.is_array() {
                plan.as_array().cloned().unwrap_or_default()
            } else if plan.is_null() {
                Vec::new()
            } else {
                vec![plan]
            };
            Ok(days
                .iter()
                .map(|day| {
                    let exercises = day
                        .get("exercises")
                        .and_then(serde_json::Value::as_array)
                        .cloned()
                        .unwrap_or_default();
                    let exercise_views = exercises
                        .iter()
                        .enumerate()
                        .map(|(index, exercise)| {
                            let muscles = exercise
                                .get("muscles")
                                .and_then(serde_json::Value::as_array)
                                .map(|values| {
                                    values
                                        .iter()
                                        .filter_map(serde_json::Value::as_str)
                                        .collect::<Vec<_>>()
                                        .join(" · ")
                                })
                                .unwrap_or_default();
                            ExerciseView {
                                index: index as i64,
                                name: exercise
                                    .get("name")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or("Exercise")
                                    .to_string(),
                                sets: exercise
                                    .get("sets")
                                    .and_then(serde_json::Value::as_i64)
                                    .unwrap_or(0),
                                reps: exercise
                                    .get("reps")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or("")
                                    .to_string(),
                                rest: exercise
                                    .get("rest")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or("")
                                    .to_string(),
                                muscles,
                                tips: exercise
                                    .get("tips")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or("")
                                    .to_string(),
                                alt: exercise
                                    .get("alt")
                                    .and_then(serde_json::Value::as_str)
                                    .unwrap_or("")
                                    .to_string(),
                            }
                        })
                        .collect::<Vec<_>>();
                    PlanDay {
                        title: day
                            .get("title")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("Training day")
                            .to_string(),
                        focus: day
                            .get("focus")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("")
                            .to_string(),
                        summary: format!("{} moves · ~45 min", exercise_views.len()),
                        exercises: exercise_views,
                    }
                })
                .collect())
        }
        Err(error) if error.contains("404") => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}

fn fetch_workout_completions() -> Result<std::collections::HashSet<i64>, String> {
    match authorized_request("GET", "/v1/workout/completions", None) {
        Ok(response) => {
            let value: serde_json::Value = response
                .into_json()
                .map_err(|error| format!("Could not parse completions: {error}"))?;
            let items = value
                .get("data")
                .and_then(|data| data.get("completions"))
                .and_then(serde_json::Value::as_array)
                .cloned()
                .unwrap_or_default();
            Ok(items
                .iter()
                .filter_map(|item| item.get("day_index").and_then(serde_json::Value::as_i64))
                .collect())
        }
        Err(error) if error.contains("404") => Ok(std::collections::HashSet::new()),
        Err(error) => Err(error),
    }
}

pub fn complete_workout(day_index: i64, title: &str) -> Result<(), String> {
    let body = serde_json::json!({ "day_index": day_index, "title": title });
    authorized_request("POST", "/v1/workout/complete", Some(body)).map(|_| ())
}

// ── Coach chat ─────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CoachMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct CoachSession {
    pub id: String,
    pub messages: Vec<CoachMessage>,
}

#[derive(Debug, Clone)]
pub struct CoachSessionSummaryView {
    pub id: String,
    pub title: String,
    pub message_count: i64,
}

pub fn fetch_coach_sessions() -> Result<Vec<CoachSessionSummaryView>, String> {
    let response = authorized_get("/v1/coach/sessions")?;
    let list: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse chat sessions: {error}"))?;
    Ok(list
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|session| CoachSessionSummaryView {
            id: session
                .get("id")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("")
                .to_string(),
            title: session
                .get("title")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Chat")
                .to_string(),
            message_count: session
                .get("message_count")
                .and_then(serde_json::Value::as_i64)
                .unwrap_or(0),
        })
        .collect())
}

pub fn fetch_coach_session() -> Result<CoachSession, String> {
    let sessions = fetch_coach_sessions()?;
    let id = if let Some(existing) = sessions.first() {
        existing.id.clone()
    } else {
        create_coach_session()?
    };
    fetch_coach_messages(&id)
}

pub fn create_coach_session() -> Result<String, String> {
    let body = serde_json::json!({ "title": "New Chat" });
    let response = authorized_request("POST", "/v1/coach/sessions", Some(body))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse new chat: {error}"))?;
    value
        .get("id")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "New chat did not return an id".to_string())
}

pub fn fetch_coach_messages(session_id: &str) -> Result<CoachSession, String> {
    let response = authorized_get(&format!("/v1/coach/sessions/{session_id}"))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse chat: {error}"))?;
    let messages = value
        .get("messages")
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .map(|message| CoachMessage {
                    role: message
                        .get("role")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("user")
                        .to_string(),
                    content: message
                        .get("content")
                        .and_then(serde_json::Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(CoachSession {
        id: session_id.to_string(),
        messages,
    })
}

pub fn send_coach_message(session_id: &str, message: &str) -> Result<String, String> {
    let body = serde_json::json!({ "session_id": session_id, "message": message });
    let response = authorized_request("POST", "/v1/coach/chat", Some(body))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse coach reply: {error}"))?;
    value
        .get("reply")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "Coach did not return a reply".to_string())
}

// ── Payments ───────────────────────────────────────────────────────

pub fn create_checkout(tier: &str) -> Result<String, String> {
    let body = serde_json::json!({ "tier": tier });
    let response = authorized_request("POST", "/v1/subscriptions/checkout", Some(body))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse checkout: {error}"))?;
    value
        .get("checkout_url")
        .and_then(serde_json::Value::as_str)
        .map(ToOwned::to_owned)
        .ok_or_else(|| "Checkout did not return a URL".to_string())
}

// ── Community ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct CommunityPostView {
    pub id: String,
    pub author: String,
    pub text: String,
    pub likes: i64,
    pub liked_by_me: bool,
    pub reply_count: i64,
}

fn parse_community_post(post: &serde_json::Value) -> CommunityPostView {
    let body = post.get("body").cloned().unwrap_or_default();
    CommunityPostView {
        id: post
            .get("id")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        author: post
            .get("author_name")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("User")
            .to_string(),
        text: body
            .get("text")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("")
            .to_string(),
        likes: post
            .get("like_count")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        liked_by_me: post
            .get("liked_by_me")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        reply_count: post
            .get("reply_count")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
    }
}

fn community_graphql(body: serde_json::Value) -> Result<serde_json::Value, String> {
    let response = authorized_request("POST", "/v1/community/graphql", Some(body))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse community response: {error}"))?;
    if let Some(errors) = value.get("errors").and_then(serde_json::Value::as_array) {
        let message = errors
            .first()
            .and_then(|error| error.get("message"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("Community error");
        return Err(message.to_string());
    }
    Ok(value)
}

pub fn fetch_community_feed(limit: i64) -> Result<Vec<CommunityPostView>, String> {
    let value = community_graphql(serde_json::json!({
        "query": "query feed($cursor: String, $limit: Int)",
        "variables": { "limit": limit }
    }))?;
    Ok(value
        .get("data")
        .and_then(|data| data.get("feed"))
        .and_then(serde_json::Value::as_array)
        .map(|items| items.iter().map(parse_community_post).collect())
        .unwrap_or_default())
}

pub fn search_community(query: &str) -> Result<Vec<CommunityPostView>, String> {
    let value = community_graphql(serde_json::json!({
        "query": "query search($query: String, $limit: Int)",
        "variables": { "query": query, "limit": 20 },
    }))?;
    let items = value
        .get("data")
        .and_then(|data| data.get("search"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(items.iter().map(parse_community_post).collect())
}

pub fn create_community_post(text: &str) -> Result<CommunityPostView, String> {
    let value = community_graphql(serde_json::json!({
        "query": "mutation createPost($text: String, $media: JSON)",
        "variables": { "text": text, "media": [] }
    }))?;
    let post = value
        .get("data")
        .and_then(|data| data.get("createPost"))
        .ok_or_else(|| "Could not create post".to_string())?;
    Ok(parse_community_post(post))
}

pub fn toggle_community_like(post_id: &str) -> Result<(bool, i64), String> {
    let value = community_graphql(serde_json::json!({
        "query": "mutation toggleLike($postId: String)",
        "variables": { "postId": post_id }
    }))?;
    let like = value
        .get("data")
        .and_then(|data| data.get("toggleLike"))
        .ok_or_else(|| "Could not like post".to_string())?;
    Ok((
        like.get("liked")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        like.get("count")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
    ))
}

pub fn fetch_community_post(
    post_id: &str,
) -> Result<(CommunityPostView, Vec<CommunityPostView>), String> {
    let value = community_graphql(serde_json::json!({
        "query": "query post($id: String)",
        "variables": { "id": post_id }
    }))?;
    let data = value
        .get("data")
        .ok_or_else(|| "Post not found".to_string())?;
    let post = data
        .get("post")
        .ok_or_else(|| "Post not found".to_string())?;
    let replies = data
        .get("replies")
        .and_then(serde_json::Value::as_array)
        .map(|items| items.iter().map(parse_community_post).collect())
        .unwrap_or_default();
    Ok((parse_community_post(post), replies))
}

pub fn reply_community_post(post_id: &str, text: &str) -> Result<CommunityPostView, String> {
    let value = community_graphql(serde_json::json!({
        "query": "mutation replyToPost($postId: String, $text: String, $media: JSON)",
        "variables": { "postId": post_id, "text": text, "media": [] }
    }))?;
    let reply = value
        .get("data")
        .and_then(|data| data.get("replyToPost"))
        .ok_or_else(|| "Could not reply".to_string())?;
    Ok(parse_community_post(reply))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LogRecord {
    #[serde(default)]
    pub water: i64,
    #[serde(default)]
    pub sleep: i64,
    #[serde(default)]
    pub steps: i64,
    #[serde(default)]
    pub protein: i64,
    #[serde(default)]
    pub workout: bool,
    #[serde(default)]
    pub weight: i64,
}

fn logs_path() -> Option<PathBuf> {
    storage_dir().map(|dir| dir.join("logs.json"))
}

pub fn today_key() -> String {
    chrono::Utc::now().format("%Y-%m-%d").to_string()
}

fn log_from_value(value: &serde_json::Value) -> LogRecord {
    LogRecord {
        water: value
            .get("water")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        sleep: value
            .get("sleep")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        steps: value
            .get("steps")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        protein: value
            .get("proteinG")
            .and_then(serde_json::Value::as_i64)
            .unwrap_or(0),
        workout: value
            .get("workoutDone")
            .and_then(serde_json::Value::as_bool)
            .unwrap_or(false),
        weight: value
            .get("weightKg")
            .and_then(serde_json::Value::as_f64)
            .map(|weight| weight.round() as i64)
            .unwrap_or(0),
    }
}

fn log_json(date: &str, log: &LogRecord) -> serde_json::Value {
    serde_json::json!({
        "date": date,
        "water": log.water,
        "sleep": log.sleep,
        "steps": log.steps,
        "proteinG": log.protein,
        "workoutDone": if log.workout { serde_json::Value::Bool(true) } else { serde_json::Value::Null },
        "weightKg": if log.weight > 0 { serde_json::Value::from(log.weight) } else { serde_json::Value::Null },
    })
}

pub fn upsert_today_log(log: &LogRecord) -> Result<(), String> {
    let body = log_json(&today_key(), log);
    authorized_request("PUT", "/v1/logs/today", Some(body))
        .map(|_| ())
        .map_err(|error| error.to_string())
}

pub fn sync_logs(logs: &HashMap<String, LogRecord>) -> Result<(), String> {
    if logs.is_empty() {
        return Ok(());
    }
    let entries = logs
        .iter()
        .map(|(date, log)| log_json(date, log))
        .collect::<Vec<_>>();
    authorized_request(
        "POST",
        "/v1/logs/sync",
        Some(serde_json::json!({ "logs": entries })),
    )
    .map(|_| ())
    .map_err(|error| error.to_string())
}

pub fn fetch_logs_range(from: &str, to: &str) -> Result<Vec<(String, LogRecord)>, String> {
    let path = format!("/v1/logs?from={}&to={}", urlencoding(from), urlencoding(to));
    let response = authorized_get(&path)?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse logs: {error}"))?;
    let rows = value
        .get("data")
        .and_then(|data| data.get("logs"))
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    Ok(rows
        .iter()
        .filter_map(|row| {
            let date = row.get("date").and_then(serde_json::Value::as_str)?;
            Some((date.to_string(), log_from_value(row)))
        })
        .collect())
}

pub fn merge_logs(remote: Vec<(String, LogRecord)>) {
    if remote.is_empty() {
        return;
    }
    let mut logs = load_logs();
    for (date, log) in remote {
        logs.insert(date, log);
    }
    store_logs(&logs);
}

fn urlencoding(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

pub fn load_logs() -> HashMap<String, LogRecord> {
    let Some(path) = logs_path() else {
        return HashMap::new();
    };
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn store_logs(logs: &HashMap<String, LogRecord>) {
    let Some(path) = logs_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(raw) = serde_json::to_string(logs) {
        let _ = fs::write(path, raw);
    }
}

pub fn clear_logs() {
    if let Some(path) = logs_path() {
        let _ = fs::remove_file(path);
    }
}

pub fn save_day(date: &str, record: &LogRecord) {
    let mut logs = load_logs();
    logs.insert(date.to_string(), record.clone());
    store_logs(&logs);
}

pub fn patch_today(
    water: Option<i64>,
    sleep: Option<i64>,
    steps: Option<i64>,
    protein: Option<i64>,
    workout: Option<bool>,
    weight: Option<i64>,
) {
    let key = today_key();
    let mut logs = load_logs();
    let mut entry = logs.get(&key).cloned().unwrap_or_default();
    if let Some(value) = water {
        entry.water = value;
    }
    if let Some(value) = sleep {
        entry.sleep = value;
    }
    if let Some(value) = steps {
        entry.steps = value;
    }
    if let Some(value) = protein {
        entry.protein = value;
    }
    if let Some(value) = workout {
        entry.workout = value;
    }
    if let Some(value) = weight {
        entry.weight = value;
    }
    logs.insert(key, entry);
    store_logs(&logs);
}

pub fn last7() -> Vec<(String, LogRecord)> {
    let logs = load_logs();
    let mut out = Vec::with_capacity(7);
    for offset in (0..7).rev() {
        let date = chrono::Utc::now() - chrono::Duration::days(offset);
        let key = date.format("%Y-%m-%d").to_string();
        out.push((key.clone(), logs.get(&key).cloned().unwrap_or_default()));
    }
    out
}

pub fn compute_streak() -> i64 {
    let logs = load_logs();
    let mut streak = 0;
    for offset in 0..365 {
        let date = chrono::Utc::now() - chrono::Duration::days(offset);
        let key = date.format("%Y-%m-%d").to_string();
        let Some(entry) = logs.get(&key) else {
            break;
        };
        if entry.workout || entry.water >= 6 || entry.protein > 0 {
            streak += 1;
        } else {
            break;
        }
    }
    streak
}

pub fn fetch_tool_advice(path: &str) -> Result<Vec<String>, String> {
    let response = authorized_get(path)?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse advice: {error}"))?;
    let plan = value
        .get("data")
        .and_then(|data| data.get("plan"))
        .and_then(|plan| plan.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(plan
        .into_iter()
        .filter_map(|item| item.as_str().map(ToString::to_string))
        .collect())
}
