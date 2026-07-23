import { getLocalResponse } from "./local-coach";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function getAI(): any | null {
  try {
    const key = Symbol.for("tanstack-start:event-storage");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.h3Event;
    return event?.req?.runtime?.cloudflare?.env?.AI ?? null;
  } catch {
    return null;
  }
}

export async function chatCompletion(opts: {
  model?: string;
  messages: ChatMessage[];
}): Promise<string> {
  const ai = getAI();

  if (!ai) {
    const systemMsg = opts.messages.find((m) => m.role === "system");
    const profile = systemMsg?.content ?? "";
    return getLocalResponse(opts.messages, profile);
  }

  try {
    const response = await ai.run(
      opts.model ?? "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: opts.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
      {
        gateway: {
          id: "fitmentor-ai-gateway",
          skipCache: false,
        },
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
