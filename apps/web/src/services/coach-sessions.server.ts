import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { getSession as getKvSession } from "@/utils/session";

const SESSION_COOKIE = "fitmentor_session";
const API_URL = process.env.API_URL || "https://16-112-132-239.sslip.io";

async function headers(): Promise<Record<string, string>> {
  const sid = getCookie(SESSION_COOKIE);
  const session = sid ? await getKvSession(sid) : null;
  if (!session?.sub) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    "X-Api-Key": process.env.API_SHARED_SECRET ?? "",
    "X-User-Id": session.sub,
    "X-User-Email": session.email,
  };
}

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

export const listSessions = createServerFn({ method: "POST" }).handler(async () => {
  const h = await headers();
  const res = await fetch(`${API_URL}/v1/coach/sessions`, { headers: h });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<SessionListItem[]>;
});

export const createSession = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { title?: string })
  .handler(async ({ data }) => {
    const h = await headers();
    const res = await fetch(`${API_URL}/v1/coach/sessions`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ title: data.title }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ id: string }>;
  });

export const loadSession = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const h = await headers();
    const res = await fetch(`${API_URL}/v1/coach/sessions/${data.id}`, { headers: h });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<FullSession>;
  });

export const deleteSession = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const h = await headers();
    const res = await fetch(`${API_URL}/v1/coach/sessions/${data.id}`, {
      method: "DELETE",
      headers: h,
    });
    if (!res.ok) throw new Error(await res.text());
  });
