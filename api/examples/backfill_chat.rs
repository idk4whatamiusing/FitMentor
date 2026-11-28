//! One-off backfill: copies `chat_sessions.messages` JSON into `chat_messages`
//! rows and embeds each message.
//!
//! Usage:
//!   set -a && . .env && set +a
//!   cargo run --example backfill_chat
//!
//! Safe to re-run: sessions that already have rows are skipped.

use fitmentor_api::{app::AppState, embeddings};

#[tokio::main]
async fn main() -> Result<(), String> {
    let state = AppState::from_env().await?;
    if state.config.ai_embed_url.trim().is_empty() {
        return Err("AI_EMBED_URL is empty (set AI_WORKER_URL to .../api/ai/complete)".into());
    }

    let sessions = sqlx::query_as::<_, (String, String, String)>(
        "SELECT id, user_id, messages FROM chat_sessions WHERE messages <> '[]'",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|error| error.to_string())?;

    println!("sessions with messages: {}", sessions.len());
    let mut total_messages = 0usize;
    let mut total_embedded = 0usize;

    for (session_id, user_id, raw) in sessions {
        let existing: i64 =
            sqlx::query_scalar("SELECT count(*) FROM chat_messages WHERE session_id = $1")
                .bind(&session_id)
                .fetch_one(&state.pool)
                .await
                .map_err(|error| error.to_string())?;
        if existing > 0 {
            println!("skip {session_id}: {existing} rows already");
            continue;
        }

        let parsed: Vec<serde_json::Value> = serde_json::from_str(&raw).unwrap_or_default();
        let items: Vec<(String, String)> = parsed
            .iter()
            .filter_map(|message| {
                let role = message.get("role")?.as_str()?.to_string();
                let content = message.get("content")?.as_str()?.to_string();
                if content.trim().is_empty() {
                    return None;
                }
                Some((role, content))
            })
            .collect();

        if items.is_empty() {
            println!("skip {session_id}: no usable messages");
            continue;
        }

        let texts: Vec<String> = items.iter().map(|(_, content)| content.clone()).collect();
        let vectors = embeddings::embed_texts(&state, &texts).await;
        let embedded = vectors.iter().filter(|vector| vector.is_some()).count();

        let mut tx = state
            .pool
            .begin()
            .await
            .map_err(|error| error.to_string())?;
        for (index, (role, content)) in items.iter().enumerate() {
            let id = uuid::Uuid::new_v4().to_string();
            let literal = vectors
                .get(index)
                .and_then(|vector| vector.as_ref())
                .map(|vector| embeddings::vector_literal(vector));

            sqlx::query(
                "INSERT INTO chat_messages (id, session_id, user_id, role, content, embedding)
                 VALUES ($1, $2, $3, $4, $5, $6::vector)",
            )
            .bind(&id)
            .bind(&session_id)
            .bind(&user_id)
            .bind(role)
            .bind(content)
            .bind(literal)
            .execute(&mut *tx)
            .await
            .map_err(|error| error.to_string())?;
        }
        tx.commit().await.map_err(|error| error.to_string())?;

        println!(
            "{session_id}: {} messages, {embedded} embedded",
            items.len()
        );
        total_messages += items.len();
        total_embedded += embedded;
    }

    println!("done: {total_messages} messages, {total_embedded} embedded");
    Ok(())
}
