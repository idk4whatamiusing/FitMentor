//! Local API server for testing (not deployed).
//!
//! Usage:
//!   set -a && . .env && set +a
//!   cargo run --example serve_api
//!
//! Binds http://127.0.0.1:3000.

use fitmentor_api::app::{router, AppState};

#[tokio::main]
async fn main() -> Result<(), String> {
    let state = AppState::from_env().await?;
    let app = router(state);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000")
        .await
        .map_err(|error| error.to_string())?;
    println!("listening on http://127.0.0.1:3000");
    axum::serve(listener, app)
        .await
        .map_err(|error| error.to_string())
}
