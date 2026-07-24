use async_graphql::SimpleObject;
use chrono::{DateTime, NaiveDate, Utc};
use serde_json::Value;
use uuid::Uuid;

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlUser {
    pub id: Uuid,
    pub cf_access_sub: String,
    pub email: String,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlProfile {
    pub id: Uuid,
    pub user_id: Uuid,
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
    pub custom_protein_g: Option<i16>,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlDailyLog {
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

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlAiPlan {
    pub id: Uuid,
    pub user_id: String,
    pub date: NaiveDate,
    pub plan: Value,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlChatSession {
    pub id: Uuid,
    pub user_id: String,
    pub title: String,
    pub messages: Value,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlSessionListItem {
    pub id: Uuid,
    pub title: String,
    pub message_count: i32,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlStreak {
    pub current: i32,
    pub longest: i32,
}

#[derive(SimpleObject, Debug, Clone)]
pub struct GqlUserWithProfile {
    pub user: GqlUser,
    pub profile: Option<GqlProfile>,
}
