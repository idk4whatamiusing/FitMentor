//! Text embeddings via the Cloudflare Pages worker.
//!
//! The worker calls Workers AI (`@cf/baai/bge-m3`), which returns 1024
//! dimensions and handles English + Hinglish. Vectors are unit-normalised so
//! Cockroach's L2 index ranks the same way as cosine similarity.

use serde_json::{json, Value};

use crate::app::AppState;

pub const EMBEDDING_DIM: usize = 1024;

/// pgvector-style literal: `[0.1,0.2,...]`, cast to VECTOR at the call site.
pub fn vector_literal(values: &[f32]) -> String {
    let mut out = String::with_capacity(values.len() * 10 + 2);
    out.push('[');
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        out.push_str(&format!("{value:.7}"));
    }
    out.push(']');
    out
}

fn normalise(values: &mut [f32]) {
    let norm = values.iter().map(|value| value * value).sum::<f32>().sqrt();
    if norm > 0.0 {
        for value in values.iter_mut() {
            *value /= norm;
        }
    }
}

/// Embeds a batch. Failures degrade to `None` per item: chat still works, the
/// message just isn't searchable until a later backfill.
pub async fn embed_texts(state: &AppState, texts: &[String]) -> Vec<Option<Vec<f32>>> {
    let url = state.config.ai_embed_url.trim();
    if url.is_empty() {
        return vec![None; texts.len()];
    }

    let mut out = Vec::with_capacity(texts.len());
    for chunk in texts.chunks(16) {
        let response = state
            .http
            .post(url)
            .header("x-api-key", &state.config.api_shared_secret)
            .json(&json!({ "texts": chunk }))
            .send()
            .await;

        let value: Option<Value> = match response {
            Ok(response) if response.status().is_success() => response.json().await.ok(),
            _ => None,
        };

        let rows = value
            .as_ref()
            .and_then(|body| body.get("embeddings"))
            .and_then(Value::as_array);

        for index in 0..chunk.len() {
            let vector = rows
                .and_then(|rows| rows.get(index))
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_f64().map(|value| value as f32))
                        .collect::<Vec<f32>>()
                })
                .filter(|vector| vector.len() == EMBEDDING_DIM)
                .map(|mut vector| {
                    normalise(&mut vector);
                    vector
                });
            out.push(vector);
        }
    }
    out
}

pub async fn embed_one(state: &AppState, text: &str) -> Option<Vec<f32>> {
    if text.trim().is_empty() {
        return None;
    }
    embed_texts(state, &[text.to_string()])
        .await
        .pop()
        .flatten()
}
