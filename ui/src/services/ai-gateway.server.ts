export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

import { getEnv } from "@/utils/env";

function getCloudflareEnv(): Record<string, unknown> | null {
  try {
    const key = Symbol.for("tanstack-start:event-storage");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.h3Event;
    if (event?.context?.cloudflare?.env) return event.context.cloudflare.env;
    if (event?.context?.env) return event.context.env;
    if (event?.req?.runtime?.cloudflare?.env) return event.req.runtime.cloudflare.env;
  } catch {}
  try {
    const fromGlobal = (globalThis as any).__cf_env;
    if (fromGlobal) return fromGlobal;
  } catch {}
  try {
    const key = Symbol.for("nitro:event-context");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.event;
    if (event?.context?.cloudflare?.env) return event.context.cloudflare.env;
  } catch {}
  return null;
}

function getAI(): any | null {
  const env = getCloudflareEnv();
  return (env as any)?.AI ?? null;
}

export async function chatCompletion(opts: {
  model?: string;
  messages: ChatMessage[];
  userId?: string;
  tier?: string;
}): Promise<string> {
  if (opts.userId) {
    const apiUrl = getEnv("API_URL");
    const apiKey = getEnv("API_SHARED_SECRET");
    const res = await fetch(`${apiUrl}/v1/internal/quota/check-and-consume`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey ?? "",
        "X-User-Id": opts.userId,
      },
      body: JSON.stringify({ tier: opts.tier ?? "free" }),
    });
    if (!res.ok) {
      throw new Error("Quota service unavailable — please try again.");
    }
    const result = await res.json();
    if (!result.allowed) {
      throw new Error(
        `AI daily limit reached (${result.used}/${result.limit} tokens).`,
      );
    }
  }

  const ai = getAI();
  if (!ai) throw new Error("AI unavailable — deploy to Cloudflare Workers.");

  try {
    const response = await ai.run(
      opts.model ?? "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
    );

    return response?.choices?.[0]?.message?.content ?? response?.response ?? "";
  } catch (err: any) {
    const msg = err?.message ?? "";
    if (msg.includes("429") || msg.includes("rate")) {
      throw new Error("AI is busy right now — please try again in a moment.");
    }
    throw new Error(`AI request failed: ${msg.slice(0, 200)}`);
  }
}
