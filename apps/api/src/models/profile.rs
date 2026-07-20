use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Profile {
    pub id: Uuid,
    pub user_id: Uuid,
    pub name: String,
    pub age: i16,
    pub gender: String,
    pub height_cm: i16,
    pub weight_kg: i16,
    pub goal: String,
    pub place: String,
    pub experience: String,
    pub diet: String,
    pub days_per_week: i16,
    pub budget_per_day: i16,
    pub health_conditions: Vec<String>,
    pub custom_protein_g: Option<i16>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateProfile {
    pub name: Option<String>,
    pub age: Option<i16>,
    pub gender: Option<String>,
    pub height_cm: Option<i16>,
    pub weight_kg: Option<i16>,
    pub goal: Option<String>,
    pub place: Option<String>,
    pub experience: Option<String>,
    pub diet: Option<String>,
    pub days_per_week: Option<i16>,
    pub budget_per_day: Option<i16>,
    pub health_conditions: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ProteinTarget {
    pub protein_g: Option<i16>,
}
