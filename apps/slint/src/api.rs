//! Minimal FitMentor API client for the Slint spike.

use serde::Deserialize;
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

// ── Google device sign-in ───────────────────────────────────────────

const DEVICE_CODE_URL: &str = "https://oauth2.googleapis.com/device/code";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";

#[derive(Debug, Deserialize)]
pub struct DeviceAuth {
    pub device_code: String,
    pub user_code: String,
    #[serde(alias = "verification_uri")]
    pub verification_url: String,
    pub expires_in: i64,
    pub interval: i64,
}

pub fn google_client_id() -> String {
    let runtime = env::var("FITMENTOR_GOOGLE_CLIENT_ID").unwrap_or_default();
    if !runtime.trim().is_empty() {
        return runtime.trim().to_string();
    }
    option_env!("FITMENTOR_GOOGLE_CLIENT_ID")
        .unwrap_or("")
        .trim()
        .to_string()
}

pub fn device_start(client_id: &str) -> Result<DeviceAuth, String> {
    let response = ureq::post(DEVICE_CODE_URL)
        .send_form(&[("client_id", client_id), ("scope", "openid email profile")])
        .map_err(|error| format!("Could not start Google sign-in: {error}"))?;
    response
        .into_json()
        .map_err(|error| format!("Could not parse Google device code: {error}"))
}

pub fn device_poll(client_id: &str, device_code: &str) -> Result<Option<String>, String> {
    match ureq::post(TOKEN_URL).send_form(&[
        ("client_id", client_id),
        ("device_code", device_code),
        ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
    ]) {
        Ok(response) => {
            let value: serde_json::Value = response
                .into_json()
                .map_err(|error| format!("Could not parse Google token: {error}"))?;
            Ok(value
                .get("id_token")
                .and_then(serde_json::Value::as_str)
                .map(ToOwned::to_owned))
        }
        Err(ureq::Error::Status(_, response)) => {
            let value: serde_json::Value = response.into_json().unwrap_or_default();
            let error = value
                .get("error")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("oauth_error");
            if error == "authorization_pending" || error == "slow_down" {
                Ok(None)
            } else {
                Err(format!("Google sign-in failed: {error}"))
            }
        }
        Err(error) => Err(format!("Google sign-in failed: {error}")),
    }
}

pub fn exchange_google(id_token: &str) -> Result<(String, User), String> {
    let url = format!("{}/v1/auth/google", base_url());
    let response = ureq::post(&url)
        .send_json(serde_json::json!({ "id_token": id_token }))
        .map_err(|error| format!("FitMentor sign-in failed: {error}"))?;
    let value: serde_json::Value = response
        .into_json()
        .map_err(|error| format!("Could not parse FitMentor token: {error}"))?;
    let token = value
        .get("token")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "FitMentor did not return a token".to_string())?
        .to_string();
    let user = value.get("user").cloned().unwrap_or_default();
    Ok((
        token,
        User {
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
        },
    ))
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
        "healthConditions": [],
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
