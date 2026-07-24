use axum::extract::{State, Json as AxumJson};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::profile::{Profile, ProteinTarget, UpdateProfile};
use crate::models::user::User;
use crate::AppState;

fn profile_to_value(p: Profile) -> serde_json::Value {
    serde_json::json!({
        "id": p.id,
        "userId": p.user_id,
        "name": p.name,
        "age": p.age,
        "gender": p.gender,
        "heightCm": p.height_cm,
        "weightKg": p.weight_kg,
        "goal": p.goal,
        "place": p.place,
        "experience": p.experience,
        "diet": p.diet,
        "daysPerWeek": p.days_per_week,
        "budgetPerDay": p.budget_per_day,
        "healthConditions": p.health_conditions,
        "customProteinG": p.custom_protein_g,
        "createdAt": p.created_at,
        "updatedAt": p.updated_at,
    })
}

async fn get_user_by_cf_sub(pool: &sqlx::PgPool, cf_sub: &str) -> Result<User, AppError> {
    sqlx::query_as::<_, User>(
        r#"SELECT id, cf_access_sub, email, name, created_at, updated_at
           FROM users WHERE cf_access_sub = $1"#,
    )
    .bind(cf_sub)
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::NotFound)
}

async fn upsert_user(pool: &sqlx::PgPool, cf_sub: &str, email: &str) -> Result<User, AppError> {
    sqlx::query_as::<_, User>(
        r#"INSERT INTO users (cf_access_sub, email)
           VALUES ($1, $2)
           ON CONFLICT (cf_access_sub) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
           RETURNING id, cf_access_sub, email, name, created_at, updated_at"#,
    )
    .bind(cf_sub)
    .bind(email)
    .fetch_one(pool)
    .await
    .map_err(Into::into)
}

pub async fn get_me(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let user = upsert_user(&state.pool, &auth.user_id, &auth.email).await?;

    let cache_key = format!("cache:user:{}", user.id);
    if let Some(cached) = state.cache.get(&cache_key).await {
        if let Ok(body) = serde_json::from_str::<serde_json::Value>(&cached) {
            return Ok((StatusCode::OK, AxumJson(body)).into_response());
        }
    }

    let _ = sqlx::query(
        r#"INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING"#,
    )
    .bind(user.id)
    .execute(&state.pool)
    .await;

    let profile = sqlx::query_as::<_, Profile>(
        r#"SELECT id, user_id, name, age, gender, height_cm, weight_kg, goal, place,
                  experience, diet, days_per_week, budget_per_day, health_conditions,
                  custom_protein_g, created_at, updated_at
           FROM profiles WHERE user_id = $1"#,
    )
    .bind(user.id)
    .fetch_optional(&state.pool)
    .await?;

    let response = serde_json::json!({
        "data": {
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "created_at": user.created_at
            },
            "profile": profile.map(profile_to_value)
        }
    });

    state.cache.set(&cache_key, &response.to_string(), 300).await;
    state.cache.delete(&format!("cache:user:{}", auth.user_id)).await;

    Ok((StatusCode::OK, AxumJson(response)).into_response())
}

pub async fn check_user_exists(
    auth: AuthUser,
    State(state): State<AppState>,
) -> Result<Response, AppError> {
    let exists = get_user_by_cf_sub(&state.pool, &auth.user_id).await.is_ok();
    Ok((StatusCode::OK, AxumJson(serde_json::json!({ "exists": exists }))).into_response())
}

pub async fn update_profile(
    auth: AuthUser,
    State(state): State<AppState>,
    AxumJson(input): AxumJson<UpdateProfile>,
) -> Result<Response, AppError> {
    let user = get_user_by_cf_sub(&state.pool, &auth.user_id).await?;

    let profile = sqlx::query_as::<_, Profile>(
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
    .bind(input.height_cm.map(|v| v as i16))
    .bind(input.weight_kg.map(|v| v as i16))
    .bind(&input.goal)
    .bind(&input.place)
    .bind(&input.experience)
    .bind(&input.diet)
    .bind(input.days_per_week)
    .bind(input.budget_per_day.map(|v| v as i16))
    .bind(&input.health_conditions)
    .fetch_one(&state.pool)
    .await?;

    state.cache.invalidate_user(&user.id.to_string()).await;
    state.cache.delete(&format!("cache:user:{}", auth.user_id)).await;

    // Trigger daily-planner to generate plans for this user (fire-and-forget)
    let planner_url = state.planner_url.clone();
    let user_id = auth.user_id.clone();
    tokio::spawn(async move {
        if let Err(e) = reqwest::Client::new()
            .post(format!("{}/generate", planner_url))
            .json(&serde_json::json!({ "user_id": user_id }))
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
        {
            tracing::warn!("failed to trigger planner for user {user_id}: {e}");
        }
    });

    let response = serde_json::json!({
        "data": {
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "created_at": user.created_at
            },
            "profile": profile_to_value(profile)
        }
    });

    Ok((StatusCode::OK, AxumJson(response)).into_response())
}

pub async fn update_protein_target(
    auth: AuthUser,
    State(state): State<AppState>,
    AxumJson(input): AxumJson<ProteinTarget>,
) -> Result<Response, AppError> {
    let user = get_user_by_cf_sub(&state.pool, &auth.user_id).await?;

    sqlx::query(
        r#"UPDATE profiles SET custom_protein_g = $2, updated_at = now()
           WHERE user_id = $1"#,
    )
    .bind(user.id)
    .bind(input.protein_g)
    .execute(&state.pool)
    .await?;

    state.cache.invalidate_user(&user.id.to_string()).await;
    state.cache.delete(&format!("cache:user:{}", auth.user_id)).await;

    let response = serde_json::json!({
        "data": {
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "created_at": user.created_at
            }
        }
    });

    Ok((StatusCode::OK, AxumJson(response)).into_response())
}

#[derive(Deserialize)]
pub struct SubscriptionInput {
    pub tier: String,
    pub status: Option<String>,
}

pub async fn upsert_subscription(
    auth: AuthUser,
    State(state): State<AppState>,
    AxumJson(input): AxumJson<SubscriptionInput>,
) -> Result<Response, AppError> {
    let user = get_user_by_cf_sub(&state.pool, &auth.user_id).await?;
    let status = input.status.as_deref().unwrap_or("active");

    // Check if subscription exists
    let existing = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM subscriptions WHERE user_id = $1)",
    )
    .bind(user.id)
    .fetch_one(&state.pool)
    .await?;

    if existing {
        sqlx::query(
            "UPDATE subscriptions SET tier = $2, status = $3, current_period_start = now(), current_period_end = now() + interval '30 days', updated_at = now() WHERE user_id = $1",
        )
        .bind(user.id)
        .bind(&input.tier)
        .bind(status)
        .execute(&state.pool)
        .await?;
    } else {
        sqlx::query(
            "INSERT INTO subscriptions (user_id, tier, status, current_period_start, current_period_end) VALUES ($1, $2, $3, now(), now() + interval '30 days')",
        )
        .bind(user.id)
        .bind(&input.tier)
        .bind(status)
        .execute(&state.pool)
        .await?;
    }

    let response = serde_json::json!({ "ok": true });
    Ok((StatusCode::OK, AxumJson(response)).into_response())
}
