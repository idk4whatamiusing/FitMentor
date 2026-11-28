//! Long-term coach memory.
//!
//! Three layers, each covering what the others miss:
//!
//! 1. `coach_facts` — durable, self-contained facts (injuries, diet, schedule).
//!    Always injected, so they never depend on retrieval luck.
//! 2. `coach_summaries` — one rolling summary per session, embedded. Retrieved
//!    across sessions so "what did we discuss?" works, and injected for the
//!    current session to cover turns older than the recent-token window.
//! 3. Hybrid recall over `chat_messages` — vector similarity plus keyword
//!    matches, so numbers and names survive even when embeddings miss them.
//!
//! A single maintenance call runs every [`MAINTENANCE_EVERY`] messages and
//! returns both the updated summary and any new facts.

use serde_json::Value;

use crate::app::AppState;
use crate::embeddings;
use crate::handlers::planner;

const FACT_LIMIT: i64 = 50;
const FACT_MAX_CHARS: usize = 240;
/// Unit vectors: distance 0.45 ≈ cosine similarity 0.9.
const FACT_DEDUPE_DISTANCE: f64 = 0.45;
const SUMMARY_LIMIT: i64 = 3;
/// Unit vectors: distance 1.0 ≈ cosine similarity 0.5.
const SUMMARY_DISTANCE: f64 = 1.0;
const SUMMARY_MAX_CHARS: usize = 500;
const VECTOR_LINES: i64 = 8;
const KEYWORD_LINES: i64 = 4;
const KEYWORD_LIMIT: usize = 6;
const LINE_MAX_CHARS: usize = 400;
const MERGED_LINES_LIMIT: usize = 12;

/// Recent turns are bounded by tokens, not by a fixed message count.
const RECENT_TOKEN_BUDGET: usize = 6_000;
/// Deliberately conservative: overestimates tokens so the prompt stays small.
const CHARS_PER_TOKEN: usize = 3;
const MESSAGE_MAX_CHARS: usize = 4_000;

const MAINTENANCE_EVERY: i64 = 8;
const MAINTENANCE_MAX_MESSAGES: i64 = 60;
const MAINTENANCE_MAX_CHARS: usize = 24_000;
const MAINTENANCE_MESSAGE_CHARS: usize = 800;

#[derive(Default)]
pub struct Memory {
    pub facts: Vec<String>,
    pub current_summary: Option<String>,
    pub summaries: Vec<String>,
    pub lines: Vec<(String, String)>,
}

fn trim(value: &str, max_chars: usize) -> String {
    let mut out: String = value.trim().chars().take(max_chars).collect();
    if value.trim().chars().count() > max_chars {
        out.push('…');
    }
    out
}

async fn load_facts(state: &AppState, user_id: &str) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT fact FROM coach_facts
         WHERE user_id = $1 AND active
         ORDER BY updated_at DESC
         LIMIT $2",
    )
    .bind(user_id)
    .bind(FACT_LIMIT)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default()
}

async fn load_current_summary(state: &AppState, user_id: &str, session_id: &str) -> Option<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT summary FROM coach_summaries WHERE session_id = $1 AND user_id = $2",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten()
}

async fn load_other_summaries(
    state: &AppState,
    user_id: &str,
    session_id: &str,
    embedding: &[f32],
) -> Vec<String> {
    let literal = embeddings::vector_literal(embedding);
    let rows = sqlx::query_as::<_, (String, f64)>(
        "SELECT summary, embedding <-> $3::vector AS distance
         FROM coach_summaries
         WHERE user_id = $1 AND session_id <> $2 AND embedding IS NOT NULL
         ORDER BY embedding <-> $3::vector
         LIMIT $4",
    )
    .bind(user_id)
    .bind(session_id)
    .bind(&literal)
    .bind(SUMMARY_LIMIT)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    rows.into_iter()
        .filter(|(_, distance)| *distance <= SUMMARY_DISTANCE)
        .map(|(summary, _)| trim(&summary, SUMMARY_MAX_CHARS))
        .collect()
}

async fn load_vector_lines(
    state: &AppState,
    user_id: &str,
    session_id: &str,
    embedding: &[f32],
) -> Vec<(String, String)> {
    let literal = embeddings::vector_literal(embedding);
    sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM chat_messages
         WHERE user_id = $1 AND session_id <> $2 AND embedding IS NOT NULL
         ORDER BY embedding <-> $3::vector
         LIMIT $4",
    )
    .bind(user_id)
    .bind(session_id)
    .bind(&literal)
    .bind(VECTOR_LINES)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default()
}

fn keywords(message: &str) -> Vec<String> {
    const STOP: &[&str] = &[
        "about", "after", "again", "also", "always", "and", "another", "anything", "are", "around",
        "back", "been", "before", "being", "best", "better", "between", "both", "but", "came",
        "can", "cannot", "could", "day", "days", "did", "does", "doing", "done", "dont", "down",
        "each", "even", "every", "feel", "from", "get", "gets", "give", "going", "good", "got",
        "had", "has", "have", "help", "her", "here", "him", "his", "how", "into", "its", "just",
        "keep", "know", "last", "less", "like", "long", "look", "made", "make", "many", "more",
        "most", "much", "must", "need", "never", "next", "not", "now", "off", "once", "one",
        "only", "other", "our", "out", "over", "please", "really", "right", "said", "same", "say",
        "see", "she", "should", "since", "some", "still", "such", "take", "tell", "than", "that",
        "the", "their", "them", "then", "there", "these", "they", "thing", "think", "this",
        "those", "through", "time", "today", "too", "under", "until", "use", "used", "very",
        "want", "was", "way", "well", "were", "what", "when", "where", "which", "while", "who",
        "why", "will", "with", "without", "work", "would", "your", "youre", "yours",
    ];

    let mut out: Vec<String> = Vec::new();
    for token in message.split(|c: char| !c.is_alphanumeric()) {
        let token = token.to_lowercase();
        let numeric = token.chars().all(|c| c.is_ascii_digit());
        if numeric {
            if token.len() < 2 {
                continue;
            }
        } else if token.len() < 4 || STOP.contains(&token.as_str()) {
            continue;
        }
        if token.len() > 30 || out.iter().any(|item| item == &token) {
            continue;
        }
        out.push(token);
        if out.len() >= KEYWORD_LIMIT {
            break;
        }
    }
    out
}

async fn load_keyword_lines(
    state: &AppState,
    user_id: &str,
    session_id: &str,
    message: &str,
) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for keyword in keywords(message) {
        let pattern = format!("%{keyword}%");
        let rows = sqlx::query_as::<_, (String, String)>(
            "SELECT role, content FROM chat_messages
             WHERE user_id = $1 AND session_id <> $2 AND content ILIKE $3
             ORDER BY seq DESC
             LIMIT $4",
        )
        .bind(user_id)
        .bind(session_id)
        .bind(&pattern)
        .bind(KEYWORD_LINES)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();

        for (role, content) in rows {
            if out
                .iter()
                .any(|(existing_role, existing)| existing_role == &role && existing == &content)
            {
                continue;
            }
            out.push((role, content));
        }
        if out.len() >= MERGED_LINES_LIMIT {
            break;
        }
    }
    out
}

fn merge_lines(
    vector_lines: Vec<(String, String)>,
    keyword_lines: Vec<(String, String)>,
) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for (role, content) in vector_lines.into_iter().chain(keyword_lines) {
        if out
            .iter()
            .any(|(existing_role, existing)| existing_role == &role && existing == &content)
        {
            continue;
        }
        out.push((role, trim(&content, LINE_MAX_CHARS)));
        if out.len() >= MERGED_LINES_LIMIT {
            break;
        }
    }
    out
}

/// Loads every memory layer for a turn. Embedding is optional: when the embed
/// worker is down, facts and keyword matches still work.
pub async fn load(
    state: &AppState,
    user_id: &str,
    session_id: &str,
    message: &str,
    embedding: Option<&[f32]>,
) -> Memory {
    let facts = load_facts(state, user_id);
    let current = load_current_summary(state, user_id, session_id);
    let other_summaries = async {
        match embedding {
            Some(vector) => load_other_summaries(state, user_id, session_id, vector).await,
            None => Vec::new(),
        }
    };
    let vector_lines = async {
        match embedding {
            Some(vector) => load_vector_lines(state, user_id, session_id, vector).await,
            None => Vec::new(),
        }
    };
    let keyword_lines = load_keyword_lines(state, user_id, session_id, message);

    let (facts, current_summary, summaries, vector_lines, keyword_lines) =
        tokio::join!(facts, current, other_summaries, vector_lines, keyword_lines);

    Memory {
        facts,
        current_summary,
        summaries,
        lines: merge_lines(vector_lines, keyword_lines),
    }
}

/// Appends the memory block to the coach's system prompt.
pub fn render(memory: &Memory) -> String {
    let mut out = String::new();

    if let Some(summary) = &memory.current_summary {
        out.push_str("\nSummary of this conversation so far:\n");
        out.push_str(summary);
        out.push('\n');
    }

    if !memory.summaries.is_empty() {
        out.push_str("\nEarlier conversations with this user (background only):\n");
        for summary in &memory.summaries {
            out.push_str(&format!("- {summary}\n"));
        }
    }

    if !memory.lines.is_empty() {
        out.push_str(
            "\nRelevant lines from earlier conversations (most relevant first). \
             Use them only if helpful; never say you looked them up:\n",
        );
        for (role, content) in &memory.lines {
            out.push_str(&format!("- {role}: {content}\n"));
        }
    }

    // Facts come last and win every conflict: summaries and old lines can be
    // stale after a user changes their goal, schedule or preferences.
    if !memory.facts.is_empty() {
        out.push_str(
            "\nCurrent durable facts about this user (authoritative). If anything above \
             conflicts with these, ignore the conflicting text above:\n",
        );
        for fact in &memory.facts {
            out.push_str(&format!("- {fact}\n"));
        }
    }

    out
}

/// Newest turns that fit the token budget, oldest first. A single oversized
/// newest message is still included whole; older ones are capped.
pub fn recent_messages(messages: &[Value]) -> Vec<Value> {
    let budget = RECENT_TOKEN_BUDGET * CHARS_PER_TOKEN;
    let mut used = 0usize;
    let mut out: Vec<Value> = Vec::new();

    for message in messages.iter().rev() {
        let content = message.get("content").and_then(Value::as_str).unwrap_or("");
        let length = content.chars().count().min(MESSAGE_MAX_CHARS);
        if !out.is_empty() && used + length > budget {
            break;
        }
        used += length;
        out.push(message.clone());
        if used >= budget {
            break;
        }
    }

    out.reverse();
    out
}

fn parse_json(raw: &str) -> Option<Value> {
    let trimmed = raw.trim();
    let trimmed = trimmed.strip_prefix("```json").unwrap_or(trimmed);
    let trimmed = trimmed.strip_prefix("```").unwrap_or(trimmed);
    let trimmed = trimmed.strip_suffix("```").unwrap_or(trimmed).trim();

    if let Ok(value) = serde_json::from_str::<Value>(trimmed) {
        return Some(value);
    }

    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    serde_json::from_str::<Value>(&trimmed[start..=end]).ok()
}

/// Runs maintenance when the session crosses another block of messages.
pub async fn maybe_maintain(state: &AppState, user_id: &str, session_id: &str) {
    let total: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM chat_messages WHERE session_id = $1 AND user_id = $2",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_one(&state.pool)
    .await
    .unwrap_or(0);

    // Turns add two messages, but a failed half-turn can leave an odd count.
    // Treat the first message past a block boundary as the trigger too.
    if total < MAINTENANCE_EVERY || total % MAINTENANCE_EVERY >= 2 {
        return;
    }
    maintain(state, user_id, session_id).await;
}

/// One AI call that refreshes the session summary and extracts new facts.
pub async fn maintain(state: &AppState, user_id: &str, session_id: &str) {
    let existing = sqlx::query_as::<_, (String, i64)>(
        "SELECT summary, covered_until_seq FROM coach_summaries
         WHERE session_id = $1 AND user_id = $2",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await
    .ok()
    .flatten();

    let (previous, covered) = existing.unwrap_or_default();

    let known_facts: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, fact FROM coach_facts
         WHERE user_id = $1 AND active
         ORDER BY updated_at DESC LIMIT $2",
    )
    .bind(user_id)
    .bind(FACT_LIMIT)
    .fetch_all(&state.pool)
    .await
    .unwrap_or_default();

    let rows: Vec<(i64, String, String)> = if previous.is_empty() {
        // First pass: summarise the latest block, which is the most useful.
        let mut rows = sqlx::query_as::<_, (i64, String, String)>(
            "SELECT seq, role, content FROM chat_messages
             WHERE session_id = $1 AND user_id = $2
             ORDER BY seq DESC LIMIT $3",
        )
        .bind(session_id)
        .bind(user_id)
        .bind(MAINTENANCE_MAX_MESSAGES)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default();
        rows.reverse();
        rows
    } else {
        // Later passes: only what the summary has not seen yet.
        sqlx::query_as::<_, (i64, String, String)>(
            "SELECT seq, role, content FROM chat_messages
             WHERE session_id = $1 AND user_id = $2 AND seq > $3
             ORDER BY seq ASC LIMIT $4",
        )
        .bind(session_id)
        .bind(user_id)
        .bind(covered)
        .bind(MAINTENANCE_MAX_MESSAGES)
        .fetch_all(&state.pool)
        .await
        .unwrap_or_default()
    };

    if rows.is_empty() {
        return;
    }

    let mut transcript = String::new();
    let mut used = 0usize;
    let mut last_seq = covered;
    for (seq, role, content) in &rows {
        let line = format!("{role}: {}\n", trim(content, MAINTENANCE_MESSAGE_CHARS));
        if used + line.chars().count() > MAINTENANCE_MAX_CHARS {
            break;
        }
        used += line.chars().count();
        transcript.push_str(&line);
        last_seq = *seq;
    }

    let system = "You maintain long-term memory for a fitness coach.\n\
        Read the conversation excerpt and reply with JSON only — no prose, no code fences.\n\
        Shape: {\"summary\": \"...\", \"facts\": [\"...\"], \"retire\": [\"f1\"]}\n\
        \n\
        summary: a compact running summary of the whole conversation, at most 120 words. \
        Keep earlier details that still matter; drop small talk and repeated advice. \
        Describe what was discussed and advised; do not restate user attributes that \
        belong in facts (goal, weight, schedule, injuries, preferences).\n\
        \n\
        facts: durable, self-contained facts about the user worth remembering forever. \
        Include only stable things: injuries, medical conditions, food likes and dislikes, \
        schedule, equipment, constraints, preferences. Do NOT repeat profile fields — goal, \
        weight, height, diet style, budget, experience and training days are stored \
        separately and always available. Before adding a fact, check the existing facts \
        list and skip anything already covered, even if worded differently. Only include \
        facts that would change future coaching advice; skip generic statements. Never \
        include one-off questions, daily numbers, or anything you are unsure about. Write \
        each fact as a short third-person sentence (\"Has a left knee injury that flares on \
        deep squats\"). Return at most 5. If there is nothing new, return an empty array.\n\
        \n\
        retire: ids of existing facts that the excerpt clearly contradicts or makes \
        outdated (for example a food they now avoid). When you retire a fact, also put the \
        corrected fact in facts. Only use ids from the existing facts list. Return an empty \
        array otherwise.";

    let known_block = if known_facts.is_empty() {
        "(none)".to_string()
    } else {
        known_facts
            .iter()
            .enumerate()
            .map(|(index, (_, fact))| format!("[f{}] {fact}", index + 1))
            .collect::<Vec<String>>()
            .join("\n")
    };

    let prompt = format!(
        "Existing summary:\n{}\n\nExisting facts:\n{}\n\nConversation excerpt:\n{}",
        if previous.is_empty() {
            "(none)"
        } else {
            previous.as_str()
        },
        known_block,
        transcript
    );

    let Some(raw) = planner::call_ai(state, system, &prompt, 700).await else {
        return;
    };
    let Some(value) = parse_json(&raw) else {
        tracing::warn!(
            bytes = raw.len(),
            "memory: could not parse maintenance JSON"
        );
        return;
    };
    let fact_count = value
        .get("facts")
        .and_then(|item| item.as_array())
        .map(|items| items.len())
        .unwrap_or(0);
    let retire_count = value
        .get("retire")
        .and_then(|item| item.as_array())
        .map(|items| items.len())
        .unwrap_or(0);
    tracing::info!(
        facts = fact_count,
        retired = retire_count,
        "memory: maintenance result"
    );

    let summary = value
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();

    if !summary.is_empty() {
        let vector = embeddings::embed_one(state, &summary).await;
        let literal = vector
            .as_ref()
            .map(|vector| embeddings::vector_literal(vector));
        let _ = sqlx::query(
            "INSERT INTO coach_summaries
                (session_id, user_id, summary, embedding, covered_until_seq, updated_at)
             VALUES ($1, $2, $3, $4::vector, $5, now()::text)
             ON CONFLICT (session_id) DO UPDATE SET
                summary = excluded.summary,
                embedding = excluded.embedding,
                covered_until_seq = excluded.covered_until_seq,
                updated_at = excluded.updated_at",
        )
        .bind(session_id)
        .bind(user_id)
        .bind(&summary)
        .bind(literal)
        .bind(last_seq)
        .execute(&state.pool)
        .await;
    }

    let retire: Vec<usize> = value
        .get("retire")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .filter_map(|id| {
                    id.trim()
                        .strip_prefix('f')
                        .and_then(|number| number.parse::<usize>().ok())
                })
                .collect()
        })
        .unwrap_or_default();

    for index in retire {
        if let Some((id, _)) = known_facts.get(index.saturating_sub(1)) {
            let _ =
                sqlx::query("UPDATE coach_facts SET active = false WHERE id = $1 AND user_id = $2")
                    .bind(id)
                    .bind(user_id)
                    .execute(&state.pool)
                    .await;
        }
    }

    let new_facts: Vec<String> = value
        .get("facts")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|fact| trim(fact, FACT_MAX_CHARS))
                .filter(|fact| fact.chars().count() >= 8)
                .take(6)
                .collect()
        })
        .unwrap_or_default();

    if new_facts.is_empty() {
        return;
    }

    let vectors = embeddings::embed_texts(state, &new_facts).await;
    for (fact, vector) in new_facts.iter().zip(vectors) {
        let literal = vector
            .as_ref()
            .map(|vector| embeddings::vector_literal(vector));

        let nearest: Option<(String, f64)> = match literal.as_ref() {
            Some(literal) => sqlx::query_as(
                "SELECT id, embedding <-> $2::vector AS distance FROM coach_facts
                 WHERE user_id = $1 AND active AND embedding IS NOT NULL
                 ORDER BY embedding <-> $2::vector
                 LIMIT 1",
            )
            .bind(user_id)
            .bind(literal)
            .fetch_optional(&state.pool)
            .await
            .ok()
            .flatten(),
            None => None,
        };

        if let Some((id, distance)) = nearest {
            if distance < FACT_DEDUPE_DISTANCE {
                // Same fact restated: keep the original wording, refresh recency.
                let _ =
                    sqlx::query("UPDATE coach_facts SET updated_at = now()::text WHERE id = $1")
                        .bind(&id)
                        .execute(&state.pool)
                        .await;
                continue;
            }
        }

        let id = uuid::Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO coach_facts (id, user_id, fact, embedding, source_session)
             VALUES ($1, $2, $3, $4::vector, $5)",
        )
        .bind(&id)
        .bind(user_id)
        .bind(fact)
        .bind(literal)
        .bind(session_id)
        .execute(&state.pool)
        .await;
    }

    let active: i64 =
        sqlx::query_scalar("SELECT count(*) FROM coach_facts WHERE user_id = $1 AND active")
            .bind(user_id)
            .fetch_one(&state.pool)
            .await
            .unwrap_or(0);

    if active > FACT_LIMIT {
        let excess = active - FACT_LIMIT;
        let _ = sqlx::query(
            "UPDATE coach_facts SET active = false WHERE id IN (
                SELECT id FROM coach_facts
                WHERE user_id = $1 AND active
                ORDER BY updated_at ASC
                LIMIT $2
            )",
        )
        .bind(user_id)
        .bind(excess)
        .execute(&state.pool)
        .await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn keywords_keep_names_and_numbers() {
        let found = keywords("My knee hurts on deep squats. I ate 112g of paneer?");
        assert!(found.contains(&"knee".to_string()));
        assert!(found.contains(&"squats".to_string()));
        assert!(found.contains(&"112g".to_string()));
        assert!(found.contains(&"paneer".to_string()));
        assert!(!found.contains(&"my".to_string()));
        assert!(!found.contains(&"the".to_string()));
    }

    #[test]
    fn recent_messages_respect_the_token_budget() {
        let messages: Vec<Value> = (0..100)
            .map(|index| {
                json!({
                    "role": if index % 2 == 0 { "user" } else { "assistant" },
                    "content": "x".repeat(1_000),
                })
            })
            .collect();

        let kept = recent_messages(&messages);
        assert!(kept.len() < messages.len());
        assert_eq!(kept.last().unwrap(), messages.last().unwrap());

        let chars: usize = kept
            .iter()
            .map(|message| message["content"].as_str().unwrap().len())
            .sum();
        assert!(chars <= RECENT_TOKEN_BUDGET * CHARS_PER_TOKEN + MESSAGE_MAX_CHARS);
    }

    #[test]
    fn parse_json_handles_code_fences() {
        let value = parse_json("```json\n{\"summary\":\"ok\",\"facts\":[]}\n```").unwrap();
        assert_eq!(value["summary"], "ok");
    }

    #[test]
    fn render_puts_facts_last() {
        let memory = Memory {
            facts: vec!["Trains at 6 am".to_string()],
            current_summary: Some("Trains in the evening".to_string()),
            summaries: Vec::new(),
            lines: Vec::new(),
        };
        let rendered = render(&memory);
        assert!(
            rendered.find("Trains in the evening").unwrap()
                < rendered.find("Trains at 6 am").unwrap()
        );
        assert!(rendered.contains("authoritative"));
    }
}
