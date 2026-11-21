//! Minimal FitMentor API client for the Slint spike.

use serde::Deserialize;
use std::env;
use std::sync::{Mutex, OnceLock};

const DEFAULT_API_URL: &str =
    "https://vfvwjpw567ghnqwknc2m74thx40jmpiw.lambda-url.ap-south-1.on.aws";

static TOKEN: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn token_cell() -> &'static Mutex<Option<String>> {
    TOKEN.get_or_init(|| Mutex::new(None))
}

pub fn set_token(token: Option<String>) {
    if let Ok(mut slot) = token_cell().lock() {
        *slot = token;
    }
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

fn authorized_get(path: &str) -> Result<ureq::Response, String> {
    let url = format!("{}{}", base_url(), path);
    if let Some(token) = token() {
        return ureq::get(&url)
            .set("authorization", &format!("Bearer {token}"))
            .call()
            .map_err(|error| format!("API request failed: {error}"));
    }

    let key = env::var("FITMENTOR_API_KEY")
        .map_err(|_| "Sign in with a mobile token to load your data".to_string())?;
    let user_id = env::var("FITMENTOR_USER_ID")
        .map_err(|_| "Sign in with a mobile token to load your data".to_string())?;
    ureq::get(&url)
        .set("x-api-key", &key)
        .set("x-user-id", &user_id)
        .call()
        .map_err(|error| format!("API request failed: {error}"))
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
