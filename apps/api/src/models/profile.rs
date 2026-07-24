use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: Option<String>,
    pub age: Option<i32>,
    pub gender: Option<String>,
    pub height_cm: Option<f32>,
    pub weight_kg: Option<f32>,
    pub goal: Option<String>,
    pub place: Option<String>,
    pub experience: Option<String>,
    pub diet: Option<String>,
    pub days_per_week: Option<i32>,
    pub budget_per_day: Option<f32>,
    pub health_conditions: Option<String>,
    pub custom_protein_g: Option<f32>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfile {
    pub name: Option<String>,
    pub age: Option<i32>,
    pub gender: Option<String>,
    pub height_cm: Option<f32>,
    pub weight_kg: Option<f32>,
    pub goal: Option<String>,
    pub place: Option<String>,
    pub experience: Option<String>,
    pub diet: Option<String>,
    pub days_per_week: Option<i32>,
    pub budget_per_day: Option<f32>,
    pub health_conditions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProteinTarget {
    pub protein_g: Option<f32>,
}
