//! HTTP routing. REST only — GraphQL was dropped when the UI moved to REST.

use worker::*;

pub mod coach;
pub mod logs;
pub mod planner;
pub mod plans;
pub mod quota;
pub mod user;
pub mod workout;

pub fn error(status: u16, code: &str, message: &str) -> Response {
    let body = serde_json::json!({ "error": { "code": code, "message": message } });
    let mut res = Response::from_json(&body).unwrap_or_else(|_| Response::empty().unwrap());
    res = res.with_status(status);
    res
}

pub fn unauthorized() -> Response {
    error(401, "unauthorized", "unauthorized")
}

pub fn not_found() -> Response {
    error(404, "not_found", "not found")
}

pub fn bad_request(msg: &str) -> Response {
    error(400, "bad_request", msg)
}

pub fn internal(msg: &str) -> Response {
    error(500, "internal", msg)
}

pub async fn route(req: Request, env: Env) -> Result<Response> {
    let mut router = Router::new();

    router = router.get("/v1/health", |_, _| {
        Response::from_json(&serde_json::json!({"status": "ok", "version": "1.0.0"}))
    });

    // user
    router = router.get_async("/v1/user/me", |req, ctx| async move {
        user::get_me(req, ctx).await
    });
    router = router.get_async("/v1/user/exists", |req, ctx| async move {
        user::exists(req, ctx).await
    });
    router = router.put_async("/v1/user/profile", |req, ctx| async move {
        user::update_profile(req, ctx).await
    });
    router = router.put_async("/v1/user/profile/protein-target", |req, ctx| async move {
        user::update_protein_target(req, ctx).await
    });
    router = router.post_async("/v1/user/sync", |req, ctx| async move {
        user::sync(req, ctx).await
    });

    // logs
    router = router.get_async("/v1/logs/today", |req, ctx| async move {
        logs::get_today(req, ctx).await
    });
    router = router.put_async("/v1/logs/today", |req, ctx| async move {
        logs::upsert_today(req, ctx).await
    });
    router = router.get_async("/v1/logs/streak", |req, ctx| async move {
        logs::streak(req, ctx).await
    });
    router = router.get_async(
        "/v1/logs",
        |req, ctx| async move { logs::range(req, ctx).await },
    );

    // coach
    router = router.get_async("/v1/coach/sessions", |req, ctx| async move {
        coach::list(req, ctx).await
    });
    router = router.post_async("/v1/coach/sessions", |req, ctx| async move {
        coach::create(req, ctx).await
    });
    router = router.get_async("/v1/coach/sessions/:id", |req, ctx| async move {
        coach::get(req, ctx).await
    });
    router = router.delete_async("/v1/coach/sessions/:id", |req, ctx| async move {
        coach::delete(req, ctx).await
    });
    router = router.patch_async("/v1/coach/sessions/:id", |req, ctx| async move {
        coach::rename(req, ctx).await
    });
    router = router.post_async("/v1/coach/log", |req, ctx| async move {
        coach::log(req, ctx).await
    });

    // plans / advice
    router = router.get_async("/v1/meal/today", |req, ctx| async move {
        plans::get(req, ctx, "meal_plans").await
    });
    router = router.put_async("/v1/meal/today", |req, ctx| async move {
        plans::upsert(req, ctx, "meal_plans").await
    });
    router = router.get_async("/v1/workout/today", |req, ctx| async move {
        plans::get(req, ctx, "workout_plans").await
    });
    router = router.put_async("/v1/workout/today", |req, ctx| async move {
        plans::upsert(req, ctx, "workout_plans").await
    });
    for (path, table) in [
        ("/v1/tools/bmi-advice", "bmi_advice"),
        ("/v1/tools/sleep-advice", "sleep_advice"),
        ("/v1/tools/injury-advice", "injury_advice"),
        ("/v1/tools/form-advice", "form_advice"),
    ] {
        router = router.get_async(path, move |req, ctx| async move {
            plans::get(req, ctx, table).await
        });
        router = router.put_async(path, move |req, ctx| async move {
            plans::upsert(req, ctx, table).await
        });
    }

    // workouts
    router = router.post_async("/v1/workout/complete", |req, ctx| async move {
        workout::complete(req, ctx).await
    });
    router = router.get_async("/v1/workout/completions", |req, ctx| async move {
        workout::completions(req, ctx).await
    });

    // internal quota (called by Pages AI gateway)
    router = router.post_async(
        "/v1/internal/quota/check-and-consume",
        |req, ctx| async move { quota::check_and_consume(req, ctx).await },
    );

    router.run(req, env).await
}
