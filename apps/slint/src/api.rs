//! Minimal FitMentor API client for the Slint spike.

use serde::Deserialize;
use std::env;

#[derive(Debug, Default, Clone)]
pub struct TodayLog {
    pub water: i64,
    pub sleep: i64,
    pub steps: i64,
    pub protein_g: i64,
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

pub fn fetch_today() -> Result<TodayLog, String> {
    let base = env::var("FITMENTOR_API_URL")
        .map_err(|_| "Set FITMENTOR_API_URL to load live data".to_string())?;
    let key = env::var("FITMENTOR_API_KEY")
        .map_err(|_| "Set FITMENTOR_API_KEY to load live data".to_string())?;
    let user_id = env::var("FITMENTOR_USER_ID")
        .map_err(|_| "Set FITMENTOR_USER_ID to load live data".to_string())?;

    let url = format!("{}/v1/logs/today", base.trim_end_matches('/'));
    let response = ureq::get(&url)
        .set("x-api-key", &key)
        .set("x-user-id", &user_id)
        .call()
        .map_err(|error| format!("API request failed: {error}"))?;

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
