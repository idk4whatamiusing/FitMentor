//! Row types as D1 returns them (SQLite: TEXT ids, INTEGER ints, REAL floats).

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct UserRow {
    pub id: String,
    pub cf_access_sub: String,
    pub email: String,
    pub name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProfileRow {
    pub id: String,
    pub user_id: String,
    pub name: Option<String>,
    pub age: Option<i64>,
    pub gender: Option<String>,
    pub height_cm: Option<i64>,
    pub weight_kg: Option<i64>,
    pub goal: Option<String>,
    pub place: Option<String>,
    pub experience: Option<String>,
    pub diet: Option<String>,
    pub days_per_week: Option<i64>,
    pub budget_per_day: Option<i64>,
    pub health_conditions: Option<String>,
    pub custom_protein_g: Option<i64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DailyLogRow {
    pub id: String,
    pub user_id: String,
    pub date: String,
    pub water: i64,
    pub sleep: i64,
    pub steps: i64,
    pub protein_g: i64,
    pub workout_done: i64,
    pub weight_kg: Option<f64>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionRow {
    pub id: String,
    pub user_id: String,
    pub title: String,
    pub messages: String,
    pub created_at: String,
    pub updated_at: String,
}

impl ProfileRow {
    /// health_conditions is stored as a JSON array in TEXT.
    pub fn health_conditions_vec(&self) -> Vec<String> {
        self.health_conditions
            .as_deref()
            .and_then(|s| serde_json::from_str::<Vec<String>>(s).ok())
            .unwrap_or_default()
    }

    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "userId": self.user_id,
            "name": self.name,
            "age": self.age,
            "gender": self.gender,
            "heightCm": self.height_cm,
            "weightKg": self.weight_kg,
            "goal": self.goal,
            "place": self.place,
            "experience": self.experience,
            "diet": self.diet,
            "daysPerWeek": self.days_per_week,
            "budgetPerDay": self.budget_per_day,
            "healthConditions": self.health_conditions_vec(),
            "customProteinG": self.custom_protein_g,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        })
    }
}

impl UserRow {
    /// Matches the existing API response shape (snake_case `created_at`).
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "created_at": self.created_at,
        })
    }
}

impl DailyLogRow {
    pub fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "userId": self.user_id,
            "date": self.date,
            "water": self.water,
            "sleep": self.sleep,
            "steps": self.steps,
            "proteinG": self.protein_g,
            "workoutDone": self.workout_done != 0,
            "weightKg": self.weight_kg,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        })
    }
}
