use async_graphql::{InputObject, Object};
use chrono::{NaiveDate, Utc};
use serde_json::Value;
use uuid::Uuid;

use super::context::GqlContext;
use super::types::*;

#[derive(InputObject)]
pub struct UpdateProfileInput {
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

#[derive(InputObject)]
pub struct UpdateDailyLogInput {
    pub water: Option<i16>,
    pub sleep: Option<i16>,
    pub steps: Option<i32>,
    pub protein_g: Option<i16>,
    pub workout_done: Option<bool>,
    pub weight_kg: Option<f32>,
}

pub struct MutationRoot;

#[Object]
impl MutationRoot {
    /// Update the current user's profile
    async fn update_profile(
        &self,
        ctx: &async_graphql::Context<'_>,
        input: UpdateProfileInput,
    ) -> async_graphql::Result<GqlProfile> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let auth = gql_ctx.require_user()?;
        let user = get_user_id(&gql_ctx.pool, &auth.user_id).await?;

        let profile = sqlx::query_as::<_, crate::models::profile::Profile>(
            r#"UPDATE profiles SET
                name = COALESCE($2, name),
                age = COALESCE($3, age),
                gender = COALESCE($4, gender),
                height_cm = COALESCE($5, height_cm),
                weight_kg = COALESCE($6, weight_kg),
                goal = COALESCE($7, goal),
                place = COALESCE($8, place),
                experience = COALESCE($9, experience),
                diet = COALESCE($10, diet),
                days_per_week = COALESCE($11, days_per_week),
                budget_per_day = COALESCE($12, budget_per_day),
                health_conditions = COALESCE($13, health_conditions),
                updated_at = now()
               WHERE user_id = $1
               RETURNING id, user_id, name, age, gender, height_cm, weight_kg, goal, place,
                         experience, diet, days_per_week, budget_per_day, health_conditions,
                         custom_protein_g, created_at, updated_at"#,
        )
        .bind(user.id)
        .bind(&input.name)
        .bind(input.age)
        .bind(&input.gender)
        .bind(input.height_cm)
        .bind(input.weight_kg)
        .bind(&input.goal)
        .bind(&input.place)
        .bind(&input.experience)
        .bind(&input.diet)
        .bind(input.days_per_week)
        .bind(input.budget_per_day)
        .bind(&input.health_conditions)
        .fetch_one(&gql_ctx.pool)
        .await?;

        gql_ctx.cache.invalidate_user(&user.id.to_string()).await;

        // Trigger daily-planner (fire-and-forget)
        let planner_url = std::env::var("PLANNER_URL").unwrap_or_else(|_| "http://planner:8002".into());
        let user_id = auth.user_id.clone();
        tokio::spawn(async move {
            let _ = reqwest::Client::new()
                .post(format!("{}/generate", planner_url))
                .json(&serde_json::json!({ "user_id": user_id }))
                .timeout(std::time::Duration::from_secs(120))
                .send()
                .await;
        });

        Ok(GqlProfile {
            id: profile.id,
            user_id: profile.user_id,
            name: profile.name,
            age: profile.age,
            gender: profile.gender,
            height_cm: profile.height_cm,
            weight_kg: profile.weight_kg,
            goal: profile.goal,
            place: profile.place,
            experience: profile.experience,
            diet: profile.diet,
            days_per_week: profile.days_per_week,
            budget_per_day: profile.budget_per_day,
            health_conditions: profile.health_conditions,
            custom_protein_g: profile.custom_protein_g,
            created_at: profile.created_at,
            updated_at: profile.updated_at,
        })
    }

    /// Update the current user's custom protein target
    async fn update_protein_target(
        &self,
        ctx: &async_graphql::Context<'_>,
        protein_g: Option<i16>,
    ) -> async_graphql::Result<GqlProfile> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let auth = gql_ctx.require_user()?;
        let user = get_user_id(&gql_ctx.pool, &auth.user_id).await?;

        sqlx::query(
            r#"UPDATE profiles SET custom_protein_g = $2, updated_at = now()
               WHERE user_id = $1"#,
        )
        .bind(user.id)
        .bind(protein_g)
        .execute(&gql_ctx.pool)
        .await?;

        gql_ctx.cache.invalidate_user(&user.id.to_string()).await;

        let profile = sqlx::query_as::<_, crate::models::profile::Profile>(
            r#"SELECT id, user_id, name, age, gender, height_cm, weight_kg, goal, place,
                      experience, diet, days_per_week, budget_per_day, health_conditions,
                      custom_protein_g, created_at, updated_at
               FROM profiles WHERE user_id = $1"#,
        )
        .bind(user.id)
        .fetch_one(&gql_ctx.pool)
        .await?;

        Ok(GqlProfile {
            id: profile.id,
            user_id: profile.user_id,
            name: profile.name,
            age: profile.age,
            gender: profile.gender,
            height_cm: profile.height_cm,
            weight_kg: profile.weight_kg,
            goal: profile.goal,
            place: profile.place,
            experience: profile.experience,
            diet: profile.diet,
            days_per_week: profile.days_per_week,
            budget_per_day: profile.budget_per_day,
            health_conditions: profile.health_conditions,
            custom_protein_g: profile.custom_protein_g,
            created_at: profile.created_at,
            updated_at: profile.updated_at,
        })
    }

    /// Create or update today's daily log
    async fn upsert_today_log(
        &self,
        ctx: &async_graphql::Context<'_>,
        input: UpdateDailyLogInput,
    ) -> async_graphql::Result<GqlDailyLog> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let auth = gql_ctx.require_user()?;
        let user = get_user_id(&gql_ctx.pool, &auth.user_id).await?;
        let today = Utc::now().date_naive();

        let log = sqlx::query_as::<_, crate::models::daily_log::DailyLog>(
            r#"INSERT INTO daily_logs (user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (user_id, date) DO UPDATE SET
                   water = COALESCE($3, daily_logs.water),
                   sleep = COALESCE($4, daily_logs.sleep),
                   steps = COALESCE($5, daily_logs.steps),
                   protein_g = COALESCE($6, daily_logs.protein_g),
                   workout_done = COALESCE($7, daily_logs.workout_done),
                   weight_kg = COALESCE($8, daily_logs.weight_kg),
                   updated_at = now()
               RETURNING id, user_id, date, water, sleep, steps, protein_g, workout_done, weight_kg,
                         created_at, updated_at"#,
        )
        .bind(user.id)
        .bind(today)
        .bind(input.water.unwrap_or(0))
        .bind(input.sleep.unwrap_or(0))
        .bind(input.steps.unwrap_or(0))
        .bind(input.protein_g.unwrap_or(0))
        .bind(input.workout_done.unwrap_or(false))
        .bind(input.weight_kg)
        .fetch_one(&gql_ctx.pool)
        .await?;

        gql_ctx.cache.invalidate_today(&user.id.to_string()).await;

        Ok(GqlDailyLog {
            id: log.id,
            user_id: log.user_id,
            date: log.date,
            water: log.water,
            sleep: log.sleep,
            steps: log.steps,
            protein_g: log.protein_g,
            workout_done: log.workout_done,
            weight_kg: log.weight_kg,
            created_at: log.created_at,
            updated_at: log.updated_at,
        })
    }

    /// Upsert an AI plan by table name
    async fn upsert_ai_plan(
        &self,
        ctx: &async_graphql::Context<'_>,
        table: String,
        plan: Value,
    ) -> async_graphql::Result<GqlAiPlan> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let auth = gql_ctx.require_user()?;
        let today = Utc::now().date_naive();

        let valid_tables = [
            "meal_plans", "workout_plans", "bmi_advice",
            "sleep_advice", "injury_advice", "form_advice",
        ];
        if !valid_tables.contains(&table.as_str()) {
            return Err(async_graphql::Error::new("Invalid table name"));
        }

        #[derive(sqlx::FromRow)]
        struct PlanRow {
            id: Uuid,
            user_id: String,
            date: NaiveDate,
            plan: Value,
        }

        sqlx::query(&format!(
            "INSERT INTO {table} (user_id, date, plan) VALUES ($1, $2, $3)
             ON CONFLICT (user_id, date) DO UPDATE SET plan = EXCLUDED.plan, updated_at = now()"
        ))
        .bind(&auth.user_id)
        .bind(today)
        .bind(&plan)
        .execute(&gql_ctx.pool)
        .await?;

        let row = sqlx::query_as::<_, PlanRow>(
            &format!("SELECT id, user_id, date, plan FROM {table} WHERE user_id = $1 AND date = $2"),
        )
        .bind(&auth.user_id)
        .bind(today)
        .fetch_one(&gql_ctx.pool)
        .await?;

        Ok(GqlAiPlan {
            id: row.id,
            user_id: row.user_id,
            date: row.date,
            plan: row.plan,
        })
    }

    /// Create a new coach chat session
    async fn create_coach_session(
        &self,
        ctx: &async_graphql::Context<'_>,
        title: Option<String>,
    ) -> async_graphql::Result<GqlChatSession> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let auth = gql_ctx.require_user()?;
        let title = title.unwrap_or_else(|| "New Chat".into());

        let id = sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id",
        )
        .bind(&auth.user_id)
        .bind(&title)
        .fetch_one(&gql_ctx.pool)
        .await?;

        Ok(GqlChatSession {
            id,
            user_id: auth.user_id.clone(),
            title,
            messages: Value::Array(vec![]),
        })
    }

    /// Delete a coach chat session
    async fn delete_coach_session(
        &self,
        ctx: &async_graphql::Context<'_>,
        id: Uuid,
    ) -> async_graphql::Result<bool> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let auth = gql_ctx.require_user()?;

        let result = sqlx::query("DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(&auth.user_id)
            .execute(&gql_ctx.pool)
            .await?;

        Ok(result.rows_affected() > 0)
    }
}

async fn get_user_id(pool: &sqlx::PgPool, cf_sub: &str) -> async_graphql::Result<crate::models::user::User> {
    sqlx::query_as::<_, crate::models::user::User>(
        r#"SELECT id, cf_access_sub, email, name, created_at, updated_at
           FROM users WHERE cf_access_sub = $1"#,
    )
    .bind(cf_sub)
    .fetch_one(pool)
    .await
    .map_err(|e| async_graphql::Error::new(e.to_string()))
}
