// Native replacement for `@/services/coach-sessions.server`.
import { request } from "./http";

export type SessionListItem = {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
};

export type SessionMessage = {
  role: "user" | "assistant";
  content: string;
};

export type FullSession = {
  id: string;
  user_id: string;
  title: string;
  messages: SessionMessage[];
  created_at: string;
  updated_at: string;
};

export async function listSessions(): Promise<SessionListItem[]> {
  const body = await request<SessionListItem[]>("/v1/coach/sessions");
  return Array.isArray(body) ? body : [];
}

export async function createSession(opts?: {
  data?: { title?: string };
}): Promise<{ id: string }> {
  return request<{ id: string }>("/v1/coach/sessions", {
    method: "POST",
    body: JSON.stringify({ title: opts?.data?.title }),
  });
}

export async function loadSession(opts: {
  data: { id: string };
}): Promise<FullSession> {
  return request<FullSession>(
    `/v1/coach/sessions/${encodeURIComponent(opts.data.id)}`,
  );
}

export async function deleteSession(opts: { data: { id: string } }): Promise<void> {
  await request(`/v1/coach/sessions/${encodeURIComponent(opts.data.id)}`, {
    method: "DELETE",
  });
}
