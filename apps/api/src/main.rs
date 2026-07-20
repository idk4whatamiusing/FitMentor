mod auth;
mod config;
mod db;
mod error;
mod models;
mod routes;
mod services;

use auth::jwt::JwtValidator;
use axum::http::header;
use axum::http::Method;
use config::Config;
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

use crate::services::cache::CacheService;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub cache: CacheService,
    pub jwt_validator: Arc<JwtValidator>,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();

    let config = Config::from_env();

    let pool = db::create_pool(&config.database_url)
        .await
        .expect("failed to connect to database");

    let cache = services::cache::CacheService::new(&config.redis_url).await;

    let jwt_validator = Arc::new(JwtValidator::new(
        config.cf_access_team_domain,
        config.cf_access_aud,
    ));

    let state = AppState {
        pool,
        cache,
        jwt_validator,
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
        ]);

    let app = routes::routes(state).layer(cors);

    let addr = format!("0.0.0.0:{}", config.port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind");

    tracing::info!("listening on {addr}");
    axum::serve(listener, app).await.expect("server error");
}
