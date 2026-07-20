use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDailyLog {
    pub water: Option<i16>,
    pub sleep: Option<i16>,
    pub steps: Option<i32>,
    pub protein_g: Option<i16>,
    pub workout_done: Option<bool>,
    pub weight_kg: Option<f32>,
}
