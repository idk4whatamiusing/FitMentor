// Native replacement for `@/services/coach-functions`.
//
// The API owns the system prompt, quota, profile lookup and message
// persistence in `/v1/coach/chat`, so the client sends one message and gets
// one reply. The web's alternate gateway path stays server-side.
import { ApiError, request } from "./http";

type ChatInput = {
  session_id?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
};

let dashboardSessionId: string | null = null;

async function createSession(title?: string): Promise<string> {
  const created = await request<{ id: string }>("/v1/coach/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return created.id;
}

async function ensureSession(sessionId?: string): Promise<string> {
  if (sessionId) return sessionId;
  if (dashboardSessionId) return dashboardSessionId;
  dashboardSessionId = await createSession();
  return dashboardSessionId;
}

export async function askCoach(opts: { data: ChatInput }): Promise<{ reply: string }> {
  const lastUser = [...opts.data.messages]
    .reverse()
    .find((message) => message.role === "user");
  const message = lastUser?.content?.trim() ?? "";
  if (!message) return { reply: "Ask me anything about your plan." };

  let sessionId = await ensureSession(opts.data.session_id);

  const send = (id: string) =>
    request<{ reply: string }>("/v1/coach/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: id, message }),
    });

  try {
    const result = await send(sessionId);
    return { reply: result.reply };
  } catch (error) {
    // A cached dashboard session can belong to a signed-out user.
    if (error instanceof ApiError && error.status === 404 && !opts.data.session_id) {
      dashboardSessionId = null;
      sessionId = await ensureSession();
      const result = await send(sessionId);
      return { reply: result.reply };
    }
    throw error;
  }
}

/** Titles are derived locally: no AI call, no added latency. */
export async function generateChatTitle(opts: {
  data: { userMessage: string };
}): Promise<{ title: string }> {
  const fallback = opts.data.userMessage.slice(0, 40).trim() || "New Chat";
  const words = opts.data.userMessage
    .replace(/[\n"'.,!?]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  if (words.length === 0) return { title: "New Chat" };
  const title = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
    .slice(0, 40);
  return { title: title || fallback };
}
