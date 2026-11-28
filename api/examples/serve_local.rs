//! Run the API router as a plain HTTP server for local testing.
//!
//! Usage:
//!   set -a && . ./.env && set +a
//!   cargo run --example serve_local
//!
//! Then call `http://127.0.0.1:8787` with a Bearer token from
//! `cargo run --bin mint_token -- <sub> <email>`.

use fitmentor_api::app::{router, AppState};

#[tokio::main]
async fn main() -> Result<(), String> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let state = AppState::from_env().await?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:8787")
        .await
        .map_err(|error| format!("bind failed: {error}"))?;
    println!("listening on http://127.0.0.1:8787");
    axum::serve(listener, router(state))
        .await
        .map_err(|error| format!("server failed: {error}"))
}
