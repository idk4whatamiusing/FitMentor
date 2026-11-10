//! FitMentor API — Rust on Cloudflare Workers.
//!
//! Bindings:
//! - `DB`       → D1 (all application data)
//! - `SESSIONS` → KV (session lookup for cookie auth)
//!
//! AI generation goes through the Pages worker (`/api/ai/complete`), which
//! holds the Workers AI binding.

use worker::*;

mod auth;
mod db;
mod handlers;
mod models;

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();

    // Planner trigger lives outside the router because it can run long.
    let is_generate = req
        .url()
        .map(|u| u.path() == "/v1/planner/generate")
        .unwrap_or(false);
    if is_generate && req.method() == Method::Post {
        return handlers::planner::handle_generate(req, env).await;
    }

    handlers::route(req, env).await
}

/// Daily planner (00:30 UTC) — iterates every user and generates today's plans.
#[event(scheduled)]
async fn scheduled(_event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    console_error_panic_hook::set_once();
    handlers::planner::run_batch(&env).await;
}
