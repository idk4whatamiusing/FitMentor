use axum::extract::{State, Json as AxumJson};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

use crate::auth::middleware::AuthUser;
use crate::error::AppError;
use crate::models::profile::{Profile, ProteinTarget, UpdateProfile};
use crate::models::user::User;
use crate::AppState;

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
    let cache_key = format!("cache:user:{}", auth.user_id);
    if let Some(cached) = state.cache.get(&cache_key).await {
        if let Ok(body) = serde_json::from_str::<serde_json::Value>(&cached) {
            return Ok((StatusCode::OK, AxumJson(body)).into_response());
        }
    }

    let user = upsert_user(&state.pool, &auth.user_id, &auth.email).await?;

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
            "profile": profile
        }
    });

    state.cache.set(&cache_key, &response.to_string(), 300).await;

    Ok((StatusCode::OK, AxumJson(response)).into_response())
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
    .bind(input.height_cm)
    .bind(input.weight_kg)
    .bind(&input.goal)
    .bind(&input.place)
    .bind(&input.experience)
    .bind(&input.diet)
    .bind(input.days_per_week)
    .bind(input.budget_per_day)
    .bind(input.health_conditions.as_deref())
    .fetch_one(&state.pool)
    .await?;

    state.cache.invalidate_user(user.id).await;

    let response = serde_json::json!({
        "data": { "profile": profile }
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

    state.cache.invalidate_user(user.id).await;

    let response = serde_json::json!({
        "data": { "customProteinG": input.protein_g }
    });

    Ok((StatusCode::OK, AxumJson(response)).into_response())
}
