//! Scheduled planner Lambda (EventBridge Scheduler -> here).

use fitmentor_api::app::AppState;
use fitmentor_api::handlers::planner;
use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde_json::{json, Value};

async fn handler(state: AppState, _event: LambdaEvent<Value>) -> Result<Value, Error> {
    planner::run_batch(&state).await;
    Ok(json!({ "ok": true }))
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .json()
        .init();

    let state = AppState::from_env()
        .await
        .map_err(|error| -> Error { error.into() })?;

    lambda_runtime::run(service_fn(move |event| {
        let state = state.clone();
        async move { handler(state, event).await }
    }))
    .await
}
