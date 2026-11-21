//! Community feed, posts, likes, replies, reshares, notifications, reports,
//! and blocks.
//!
//! The front end sends lightweight "GraphQL" requests
//! (`{ query: "query feed(...)", variables: {...} }`). The old service only
//! dispatched on the operation name, so this module does the same and returns
//! `{ "data": ... }` / `{ "errors": [...] }`.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::Json;
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::PgPool;
use uuid::Uuid;

use crate::app::AppState;
use crate::auth;
use crate::error::{ApiError, ApiResult};

#[derive(Deserialize)]
struct GraphqlRequest {
    query: String,
    variables: Option<Value>,
}

fn operation_name(query: &str) -> String {
    let trimmed = query.trim_start();
    let rest = trimmed
        .strip_prefix("query")
        .or_else(|| trimmed.strip_prefix("mutation"))
        .unwrap_or("");
    rest.trim_start()
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || *c == '_')
        .collect()
}

fn var_str(variables: &Value, key: &str) -> String {
    variables
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string()
}

fn var_i64(variables: &Value, key: &str, default: i64) -> i64 {
    variables
        .get(key)
        .and_then(Value::as_i64)
        .unwrap_or(default)
}

fn limit_for(variables: &Value, default: i64) -> i64 {
    var_i64(variables, "limit", default).clamp(1, 50)
}

fn media_for(variables: &Value) -> Value {
    variables.get("media").cloned().unwrap_or_else(|| json!([]))
}

fn ok(data: Value) -> Value {
    json!({ "data": data })
}

fn gql_err(message: impl Into<String>) -> Value {
    json!({ "errors": [{ "message": message.into() }] })
}

#[derive(sqlx::FromRow)]
struct PostRow {
    id: String,
    user_id: String,
    body: String,
    parent_id: Option<String>,
    reshare_id: Option<String>,
    hidden: i64,
    created_at: String,
    like_count: i64,
    liked_by_me: i64,
    reply_count: i64,
    reshare_count: i64,
    author_name: String,
}

impl PostRow {
    fn to_json(&self) -> Value {
        let body = serde_json::from_str::<Value>(&self.body)
            .unwrap_or_else(|_| json!({ "text": "", "media": [] }));
        json!({
            "id": self.id,
            "user_id": self.user_id,
            "body": body,
            "parent_id": self.parent_id,
            "reshare_id": self.reshare_id,
            "hidden": self.hidden != 0,
            "created_at": self.created_at,
            "like_count": self.like_count,
            "liked_by_me": self.liked_by_me != 0,
            "reply_count": self.reply_count,
            "reshare_count": self.reshare_count,
            "author_name": self.author_name,
        })
    }
}

#[derive(sqlx::FromRow)]
struct NotificationRow {
    id: String,
    actor_id: String,
    post_id: Option<String>,
    #[sqlx(rename = "type")]
    type_: String,
    read: i64,
    created_at: String,
}

impl NotificationRow {
    fn to_json(&self) -> Value {
        json!({
            "id": self.id,
            "actor_id": self.actor_id,
            "post_id": self.post_id,
            "type": self.type_,
            "read": self.read != 0,
            "created_at": self.created_at,
        })
    }
}

const POST_SELECT: &str = "
SELECT p.id, p.user_id, p.body, p.parent_id, p.reshare_id, p.hidden, p.created_at,
       (SELECT COUNT(*) FROM community_likes l WHERE l.post_id = p.id) AS like_count,
       (SELECT COUNT(*) FROM community_likes l WHERE l.post_id = p.id AND l.user_id = $1) AS liked_by_me,
       (SELECT COUNT(*) FROM community_posts r WHERE r.parent_id = p.id) AS reply_count,
       (SELECT COUNT(*) FROM community_posts r WHERE r.reshare_id = p.id) AS reshare_count,
       COALESCE((SELECT u.name FROM users u WHERE u.cf_access_sub = p.user_id), 'User') AS author_name
FROM community_posts p
";

const FEED_FILTER: &str = "
WHERE p.parent_id IS NULL AND p.hidden = 0
  AND NOT EXISTS (
      SELECT 1 FROM community_blocks b
      WHERE (b.blocker_id = $1 AND b.blocked_id = p.user_id)
         OR (b.blocker_id = p.user_id AND b.blocked_id = $1)
  )
";

/// POST /v1/community/graphql
pub async fn graphql(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> ApiResult {
    let auth_user = auth::require_user(&headers, &state.config)?;
    let request: GraphqlRequest =
        serde_json::from_slice(&body).map_err(|_| ApiError::BadRequest("invalid json".into()))?;
    let variables = request.variables.unwrap_or_else(|| json!({}));
    let operation = operation_name(&request.query);
    let user_id = auth_user.user_id.as_str();

    let result: Result<Value, String> = match operation.as_str() {
        "feed" => feed(&state.pool, user_id, &variables).await,
        "post" => post(&state.pool, user_id, &variables).await,
        "myPosts" => my_posts(&state.pool, user_id, &variables).await,
        "search" => search(&state.pool, user_id, &variables).await,
        "notifications" => notifications(&state.pool, user_id, &variables).await,
        "unreadNotificationCount" => unread_count(&state.pool, user_id).await,
        "markNotificationsRead" => mark_read(&state.pool, user_id, "markNotificationsRead").await,
        "markAllNotificationsRead" => {
            mark_read(&state.pool, user_id, "markAllNotificationsRead").await
        }
        "createPost" => create_post(&state.pool, user_id, &variables).await,
        "deletePost" => delete_post(&state.pool, user_id, &variables).await,
        "toggleLike" => toggle_like(&state.pool, user_id, &variables).await,
        "replyToPost" => reply_to_post(&state.pool, user_id, &variables).await,
        "resharePost" => reshare_post(&state.pool, user_id, &variables).await,
        "reportPost" => report_post(&state.pool, user_id, &variables).await,
        "blockUser" => block_user(&state.pool, user_id, &variables).await,
        "unblockUser" => unblock_user(&state.pool, user_id, &variables).await,
        "requestUploadUrl" => Err("media_uploads_not_configured".into()),
        _ => Err(format!("unknown_operation: {operation}")),
    };

    Ok(Json(match result {
        Ok(data) => ok(data),
        Err(message) => gql_err(message),
    }))
}

async fn feed(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let limit = limit_for(variables, 20);
    let sql = format!("{POST_SELECT}{FEED_FILTER} ORDER BY p.created_at DESC LIMIT $2");
    let rows = sqlx::query_as::<_, PostRow>(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "feed": rows.iter().map(PostRow::to_json).collect::<Vec<_>>() }))
}

async fn post(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let post_id = var_str(variables, "id");
    if post_id.is_empty() {
        return Err("post_not_found".into());
    }
    let sql = format!("{POST_SELECT} WHERE p.id = $2 AND p.hidden = 0");
    let row = sqlx::query_as::<_, PostRow>(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(&post_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;
    let Some(row) = row else {
        return Err("post_not_found".into());
    };

    let replies_sql = format!(
        "{POST_SELECT} WHERE p.parent_id = $2 AND p.hidden = 0 ORDER BY p.created_at ASC LIMIT 50"
    );
    let replies = sqlx::query_as::<_, PostRow>(sqlx::AssertSqlSafe(replies_sql))
        .bind(user_id)
        .bind(&post_id)
        .fetch_all(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;

    Ok(json!({
        "post": row.to_json(),
        "replies": replies.iter().map(PostRow::to_json).collect::<Vec<_>>(),
    }))
}

async fn my_posts(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let limit = limit_for(variables, 20);
    let sql = format!(
        "{POST_SELECT} WHERE p.user_id = $1 AND p.parent_id IS NULL ORDER BY p.created_at DESC LIMIT $2"
    );
    let rows = sqlx::query_as::<_, PostRow>(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "myPosts": rows.iter().map(PostRow::to_json).collect::<Vec<_>>() }))
}

async fn search(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let query = var_str(variables, "query");
    if query.trim().is_empty() {
        return Ok(json!({ "search": [] }));
    }
    let limit = limit_for(variables, 20);
    let sql = format!(
        "{POST_SELECT}{FEED_FILTER} AND (p.body::jsonb)->>'text' ILIKE '%' || $2 || '%' \
         ORDER BY p.created_at DESC LIMIT $3"
    );
    let rows = sqlx::query_as::<_, PostRow>(sqlx::AssertSqlSafe(sql))
        .bind(user_id)
        .bind(query.trim())
        .bind(limit)
        .fetch_all(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "search": rows.iter().map(PostRow::to_json).collect::<Vec<_>>() }))
}

async fn notifications(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let limit = limit_for(variables, 20);
    let rows = sqlx::query_as::<_, NotificationRow>(
        "SELECT id, actor_id, post_id, type, read, created_at
         FROM community_notifications
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2",
    )
    .bind(user_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({
        "notifications": rows.iter().map(NotificationRow::to_json).collect::<Vec<_>>()
    }))
}

async fn unread_count(pool: &PgPool, user_id: &str) -> Result<Value, String> {
    let count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM community_notifications WHERE user_id = $1 AND read = 0",
    )
    .bind(user_id)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "unreadNotificationCount": count }))
}

async fn mark_read(pool: &PgPool, user_id: &str, key: &str) -> Result<Value, String> {
    sqlx::query("UPDATE community_notifications SET read = 1 WHERE user_id = $1")
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;
    let mut response = serde_json::Map::new();
    response.insert(key.to_string(), Value::Bool(true));
    Ok(Value::Object(response))
}

async fn author_name(pool: &PgPool, user_id: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT name FROM users WHERE cf_access_sub = $1")
        .bind(user_id)
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .unwrap_or_else(|| "User".to_string())
}

fn post_body(variables: &Value) -> Result<String, String> {
    let text = var_str(variables, "text").trim().to_string();
    let media = media_for(variables);
    let media_empty = media
        .as_array()
        .map(|items| items.is_empty())
        .unwrap_or(true);
    if text.is_empty() && media_empty {
        return Err("empty_post".into());
    }
    if text.chars().count() > 2000 {
        return Err("post_too_long".into());
    }
    Ok(json!({ "text": text, "media": media }).to_string())
}

#[allow(clippy::too_many_arguments)]
fn build_row(
    id: String,
    user_id: &str,
    body: String,
    parent_id: Option<String>,
    reshare_id: Option<String>,
    created_at: String,
    author_name: String,
    reply_count: i64,
    reshare_count: i64,
) -> PostRow {
    PostRow {
        id,
        user_id: user_id.to_string(),
        body,
        parent_id,
        reshare_id,
        hidden: 0,
        created_at,
        like_count: 0,
        liked_by_me: 0,
        reply_count,
        reshare_count,
        author_name,
    }
}

async fn notify(
    pool: &PgPool,
    user_id: &str,
    actor_id: &str,
    post_id: &str,
    notification_type: &str,
) -> Result<(), String> {
    if user_id == actor_id {
        return Ok(());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO community_notifications (id, user_id, actor_id, post_id, type)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(id)
    .bind(user_id)
    .bind(actor_id)
    .bind(post_id)
    .bind(notification_type)
    .execute(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;
    Ok(())
}

async fn create_post(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let body = post_body(variables)?;
    let id = Uuid::new_v4().to_string();
    let created_at = sqlx::query_scalar::<_, String>(
        "INSERT INTO community_posts (id, user_id, body) VALUES ($1, $2, $3) RETURNING created_at",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&body)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;

    let row = build_row(
        id,
        user_id,
        body,
        None,
        None,
        created_at,
        author_name(pool, user_id).await,
        0,
        0,
    );
    Ok(json!({ "createPost": row.to_json() }))
}

async fn delete_post(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let post_id = var_str(variables, "id");
    let result = sqlx::query("DELETE FROM community_posts WHERE id = $1 AND user_id = $2")
        .bind(post_id)
        .bind(user_id)
        .execute(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "deletePost": result.rows_affected() > 0 }))
}

async fn toggle_like(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let post_id = var_str(variables, "postId");
    if post_id.is_empty() {
        return Err("post_not_found".into());
    }
    let liked = sqlx::query_scalar::<_, i64>(
        "SELECT 1 FROM community_likes WHERE post_id = $1 AND user_id = $2",
    )
    .bind(&post_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?
    .is_some();

    if liked {
        sqlx::query("DELETE FROM community_likes WHERE post_id = $1 AND user_id = $2")
            .bind(&post_id)
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|error| format!("query_failed: {error}"))?;
    } else {
        sqlx::query("INSERT INTO community_likes (post_id, user_id) VALUES ($1, $2)")
            .bind(&post_id)
            .bind(user_id)
            .execute(pool)
            .await
            .map_err(|error| format!("query_failed: {error}"))?;

        if let Some(author) = sqlx::query_scalar::<_, String>(
            "SELECT user_id FROM community_posts WHERE id = $1 AND hidden = 0",
        )
        .bind(&post_id)
        .fetch_optional(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?
        {
            notify(pool, &author, user_id, &post_id, "like").await?;
        }
    }

    let count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM community_likes WHERE post_id = $1")
            .bind(&post_id)
            .fetch_one(pool)
            .await
            .map_err(|error| format!("query_failed: {error}"))?;

    Ok(json!({ "toggleLike": { "liked": !liked, "count": count } }))
}

async fn reply_to_post(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let parent_id = var_str(variables, "postId");
    if parent_id.is_empty() {
        return Err("post_not_found".into());
    }
    let parent_author = sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM community_posts WHERE id = $1 AND hidden = 0",
    )
    .bind(&parent_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;
    let Some(parent_author) = parent_author else {
        return Err("post_not_found".into());
    };

    let body = post_body(variables)?;
    let id = Uuid::new_v4().to_string();
    let created_at = sqlx::query_scalar::<_, String>(
        "INSERT INTO community_posts (id, user_id, body, parent_id)
         VALUES ($1, $2, $3, $4) RETURNING created_at",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&body)
    .bind(&parent_id)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;

    notify(pool, &parent_author, user_id, &parent_id, "reply").await?;

    let row = build_row(
        id,
        user_id,
        body,
        Some(parent_id),
        None,
        created_at,
        author_name(pool, user_id).await,
        0,
        0,
    );
    Ok(json!({ "replyToPost": row.to_json() }))
}

#[derive(sqlx::FromRow)]
struct OriginalPost {
    body: String,
    user_id: String,
}

async fn reshare_post(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let original_id = var_str(variables, "postId");
    if original_id.is_empty() {
        return Err("post_not_found".into());
    }
    let original = sqlx::query_as::<_, OriginalPost>(
        "SELECT body, user_id FROM community_posts WHERE id = $1 AND hidden = 0",
    )
    .bind(&original_id)
    .fetch_optional(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;
    let Some(original) = original else {
        return Err("post_not_found".into());
    };

    let id = Uuid::new_v4().to_string();
    let created_at = sqlx::query_scalar::<_, String>(
        "INSERT INTO community_posts (id, user_id, body, reshare_id)
         VALUES ($1, $2, $3, $4) RETURNING created_at",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&original.body)
    .bind(&original_id)
    .fetch_one(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;

    notify(pool, &original.user_id, user_id, &original_id, "reshare").await?;

    let row = build_row(
        id,
        user_id,
        original.body,
        None,
        Some(original_id),
        created_at,
        author_name(pool, user_id).await,
        0,
        0,
    );
    Ok(json!({ "resharePost": row.to_json() }))
}

async fn report_post(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let post_id = var_str(variables, "postId");
    let reason = var_str(variables, "reason");
    if post_id.is_empty() || reason.is_empty() {
        return Err("missing_post_or_reason".into());
    }
    let id = Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO community_reports (id, reporter_id, post_id, reason)
         VALUES ($1, $2, $3, $4)",
    )
    .bind(id)
    .bind(user_id)
    .bind(post_id)
    .bind(reason)
    .execute(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "reportPost": true }))
}

async fn block_user(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let blocked_id = var_str(variables, "userId");
    if blocked_id.is_empty() || blocked_id == user_id {
        return Err("invalid_user".into());
    }
    sqlx::query(
        "INSERT INTO community_blocks (blocker_id, blocked_id) VALUES ($1, $2)
         ON CONFLICT (blocker_id, blocked_id) DO NOTHING",
    )
    .bind(user_id)
    .bind(blocked_id)
    .execute(pool)
    .await
    .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "blockUser": true }))
}

async fn unblock_user(pool: &PgPool, user_id: &str, variables: &Value) -> Result<Value, String> {
    let blocked_id = var_str(variables, "userId");
    sqlx::query("DELETE FROM community_blocks WHERE blocker_id = $1 AND blocked_id = $2")
        .bind(user_id)
        .bind(blocked_id)
        .execute(pool)
        .await
        .map_err(|error| format!("query_failed: {error}"))?;
    Ok(json!({ "unblockUser": true }))
}
