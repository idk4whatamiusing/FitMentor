//! AWS Lambda entry point (Function URL / API Gateway HTTP API).

use fitmentor_api::app::{router, AppState};
use lambda_http::Error;

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    let state = AppState::from_env()
        .await
        .map_err(|error| -> Error { error.into() })?;

    lambda_http::run(router(state)).await
}
