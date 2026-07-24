mod auth;
mod config;
mod db;
mod error;
mod graphql;
mod models;
mod routes;
mod services;

use auth::jwt::JwtValidator;
use axum::http::header;
use axum::http::Method;
use axum::Router;
use config::Config;
use db::shard::ShardRouter;
use graphql::schema::create_schema;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

use crate::services::cache::CacheService;

async fn graphiql() -> impl axum::response::IntoResponse {
    axum::response::Html(async_graphql::http::GraphiQLSource::build()
        .endpoint("/graphql")
        .finish())
}

async fn graphql_handler(
    state: axum::extract::State<AppState>,
    headers: axum::http::HeaderMap,
    req: async_graphql_axum::GraphQLRequest,
) -> async_graphql_axum::GraphQLResponse {
    let schema = create_schema();

    // Extract auth user from headers
    let user = extract_auth_user(&state, &headers).await;

    let gql_ctx = graphql::context::GqlContext::new(
        state.shard_router.clone(),
        state.cache.clone(),
        user,
    );
    schema.execute(req.into_inner().data(gql_ctx)).await.into()
}

async fn extract_auth_user(
    state: &AppState,
    headers: &axum::http::HeaderMap,
) -> Option<auth::middleware::AuthUser> {
    // Try API key auth first
    if !state.api_shared_secret.is_empty() {
        if let Some(api_key) = headers.get("x-api-key").and_then(|v| v.to_str().ok()) {
            if api_key == state.api_shared_secret {
                let user_id = headers
                    .get("x-user-id")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                let email = headers
                    .get("x-user-email")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("")
                    .to_string();
                return Some(auth::middleware::AuthUser { user_id, email });
            }
        }
    }

    // Try JWT auth
    let token = headers
        .get("cf-access-jwt-assertion")
        .or_else(|| headers.get("authorization"))
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.strip_prefix("Bearer ").or(Some(s)))?;

    let claims: auth::jwt::Claims = state.jwt_validator.validate(token).await.ok()?;

    Some(auth::middleware::AuthUser {
        user_id: claims.sub,
        email: claims.email,
    })
}

#[derive(Clone)]
pub struct AppState {
    pub shard_router: Arc<ShardRouter>,
    pub cache: CacheService,
    pub jwt_validator: Arc<JwtValidator>,
    pub polar_access_token: String,
    pub polar_webhook_secret: String,
    pub polar_premium_product_id: String,
    pub polar_premium_price_id: String,
    pub polar_pro_product_id: String,
    pub polar_pro_price_id: String,
    pub api_shared_secret: String,
    pub planner_url: String,
}

async fn run_migrations(pool: &sqlx::PgPool) {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS meal_plans (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    TEXT NOT NULL,
            date       DATE NOT NULL,
            plan       JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("failed to create meal_plans table");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS workout_plans (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    TEXT NOT NULL,
            date       DATE NOT NULL,
            plan       JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("failed to create workout_plans table");

    // Ensure unique indexes exist (idempotent)
    sqlx::query(
        r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_meal_plans_user_date ON meal_plans(user_id, date)"#,
    )
    .execute(pool)
    .await
    .expect("failed to create meal_plans index");

    sqlx::query(
        r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_plans_user_date ON workout_plans(user_id, date)"#,
    )
    .execute(pool)
    .await
    .expect("failed to create workout_plans index");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS bmi_advice (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    TEXT NOT NULL,
            date       DATE NOT NULL,
            plan       JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("failed to create bmi_advice table");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS sleep_advice (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    TEXT NOT NULL,
            date       DATE NOT NULL,
            plan       JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("failed to create sleep_advice table");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS injury_advice (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    TEXT NOT NULL,
            date       DATE NOT NULL,
            plan       JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("failed to create injury_advice table");

    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS form_advice (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id    TEXT NOT NULL,
            date       DATE NOT NULL,
            plan       JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ not null default now()
        );
        "#,
    )
    .execute(pool)
    .await
    .expect("failed to create form_advice table");

    sqlx::query(r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_bmi_advice_user_date ON bmi_advice(user_id, date)"#)
        .execute(pool).await.expect("failed to create bmi_advice index");
    sqlx::query(r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_sleep_advice_user_date ON sleep_advice(user_id, date)"#)
        .execute(pool).await.expect("failed to create sleep_advice index");
    sqlx::query(r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_injury_advice_user_date ON injury_advice(user_id, date)"#)
        .execute(pool).await.expect("failed to create injury_advice index");
    sqlx::query(r#"CREATE UNIQUE INDEX IF NOT EXISTS idx_form_advice_user_date ON form_advice(user_id, date)"#)
        .execute(pool).await.expect("failed to create form_advice index");

    tracing::info!("migrations complete");
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let config = Config::from_env();

    // Initialize shard router: use DATABASE_SHARD_URLS if set, otherwise fall back to DATABASE_URL
    let shard_urls = if config.database_shard_urls.is_empty() {
        vec![config.database_url.clone()]
    } else {
        config.database_shard_urls.clone()
    };

    let shard_router = db::create_shard_router(&shard_urls)
        .await
        .expect("failed to create shard router");

    // Run migrations on primary shard
    run_migrations(shard_router.primary_pool()).await;

    let cache = services::cache::CacheService::new(&config.redis_url).await;

    let jwt_validator = Arc::new(JwtValidator::new(
        config.cf_access_team_domain,
        config.cf_access_aud,
    ));

    let state = AppState {
        shard_router: Arc::new(shard_router),
        cache,
        jwt_validator,
        polar_access_token: config.polar_access_token,
        polar_webhook_secret: config.polar_webhook_secret,
        polar_premium_product_id: config.polar_premium_product_id,
        polar_premium_price_id: config.polar_premium_price_id,
        polar_pro_product_id: config.polar_pro_product_id,
        polar_pro_price_id: config.polar_pro_price_id,
        api_shared_secret: config.api_shared_secret,
        planner_url: config.planner_url,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            header::AUTHORIZATION,
            header::CONTENT_TYPE,
            header::ACCEPT,
            "cf-access-jwt-assertion".parse().unwrap(),
            "x-api-key".parse().unwrap(),
            "x-user-id".parse().unwrap(),
            "x-user-email".parse().unwrap(),
        ]);

    let graphql_routes = Router::new()
        .route(
            "/graphql",
            axum::routing::get(graphiql).post(graphql_handler),
        );

    let app = routes::routes()
        .merge(graphql_routes)
        .layer(cors)
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");

    tracing::info!("listening on {addr}");
    axum::serve(listener, app).await.expect("server error");
}
