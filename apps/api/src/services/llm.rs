#![allow(dead_code)]

use futures::stream::{self, Stream, StreamExt};
use serde::Serialize;

/// LLM streaming client for Google Gemini (free tier API key).
/// Endpoint: https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}
pub struct LlmClient {
    api_key: String,
    model: String,
    http: reqwest::Client,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

#[derive(Debug, Serialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

#[derive(Debug, Serialize)]
struct GeminiPart {
    text: String,
}

pub type BoxStream = std::pin::Pin<Box<dyn Stream<Item = anyhow::Result<String>> + Send>>;

impl LlmClient {
    pub fn new(api_key: String, model: String) -> Self {
        Self {
            api_key,
            model,
            http: reqwest::Client::new(),
        }
    }

    pub fn build_system_prompt(user_context: &str) -> String {
        format!(
            "You are FitMentor, an AI fitness coach. \
             Be concise, actionable, and encouraging. \
             User context:\n{user_context}"
        )
    }

    fn to_gemini_contents(messages: Vec<ChatMessage>) -> Vec<GeminiContent> {
        messages
            .into_iter()
            .map(|m| GeminiContent {
                role: if m.role == "assistant" { "model" } else { "user" },
                parts: vec![GeminiPart { text: m.content }],
            })
            .collect()
    }

    pub async fn stream_chat(&self, messages: Vec<ChatMessage>) -> anyhow::Result<BoxStream> {
        if self.api_key.is_empty() {
            return Ok(Box::pin(stream::once(async {
                Ok("AI coach is not configured. Set LLM_API_KEY (Gemini) to enable.".to_string())
            })));
        }

        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:streamGenerateContent?alt=sse&key={}",
            self.model, self.api_key
        );

        let body = GeminiRequest {
            contents: Self::to_gemini_contents(messages),
        };

        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await?
            .error_for_status()?;

        let stream = resp.bytes_stream().filter_map(|chunk| async move {
            match chunk {
                Ok(bytes) => {
                    let text = String::from_utf8_lossy(&bytes);
                    let extracted = text
                        .lines()
                        .filter(|line| line.starts_with("data:"))
                        .filter_map(|line| {
                            let json = line.trim_start_matches("data:").trim();
                            extract_text(json)
                        })
                        .collect::<Vec<_>>()
                        .join("");
                    if extracted.is_empty() {
                        None
                    } else {
                        Some(Ok(extracted))
                    }
                }
                Err(e) => Some(Err(e.into())),
            }
        });

        Ok(Box::pin(stream))
    }
}

fn extract_text(json: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(json).ok()?;
    let text = parsed
        .get("candidates")?
        .get(0)?
        .get("content")?
        .get("parts")?
        .get(0)?
        .get("text")?
        .as_str()?;
    Some(text.to_string())
}
