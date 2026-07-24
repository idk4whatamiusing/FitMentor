use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct DailyLog {
    pub id: Uuid,
    pub user_id: Uuid,
    pub date: NaiveDate,
    pub water: i16,
    pub sleep: i16,
    pub steps: i32,
    pub protein_g: i16,
    pub workout_done: bool,
    pub weight_kg: Option<f32>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDailyLog {
    #[serde(alias = "water")]
    pub water: Option<i16>,
    #[serde(alias = "sleep")]
    pub sleep: Option<i16>,
    #[serde(alias = "steps")]
    pub steps: Option<i32>,
    #[serde(alias = "protein_g")]
    pub protein_g: Option<i16>,
    #[serde(alias = "workout_done")]
    pub workout_done: Option<bool>,
    #[serde(alias = "weight_kg")]
    pub weight_kg: Option<f32>,
}
