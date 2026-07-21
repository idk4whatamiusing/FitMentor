// Lovable AI Gateway helper. Server-only — never import from client code.
import { getLocalResponse } from "./local-coach";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function chatCompletion(opts: {
  model?: string;
  messages: ChatMessage[];
}): Promise<string> {
  const apiKey = process.env.LOVABLE_API_KEY;

  if (!apiKey) {
    const systemMsg = opts.messages.find((m) => m.role === "system");
    const profile = systemMsg?.content ?? "";
    return getLocalResponse(opts.messages, profile);
  }

  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: opts.model ?? "google/gemini-3-flash-preview",
      messages: opts.messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI is busy right now — please try again in a moment.");
    if (res.status === 402)
      throw new Error("AI credits exhausted. Please add credits to continue.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}
