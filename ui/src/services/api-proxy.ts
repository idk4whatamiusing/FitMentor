import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { resolveSessionFromToken } from "@/utils/session";
import { getEnv } from "@/utils/env";

const SESSION_COOKIE = "fitmentor_session";
const apiUrl = () => getEnv("API_URL");

function authHeaders(sub: string, email?: string): Record<string, string> {
  const apiKey = getEnv("API_SHARED_SECRET");
  const h: Record<string, string> = {
    "X-Api-Key": apiKey ?? "",
    "X-User-Id": sub,
    "Content-Type": "application/json",
  };
  if (email) h["X-User-Email"] = email;
  return h;
}

function getClientIp(): string {
  try {
    const key = Symbol.for("tanstack-start:event-storage");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.h3Event;
    const headers = event?.req?.headers;
    if (!headers) return "";
    return headers["cf-connecting-ip"]
      || (headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || headers["x-real-ip"]
      || "";
  } catch {
    return "";
  }
}

async function resolveSession(): Promise<{ sub: string; email: string } | null> {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  const ip = getClientIp();
  return resolveSessionFromToken(raw, ip);
}


export const proxyWorkoutPlan = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSession();
  if (!session) return { error: "not authenticated" };
  const res = await fetch(`${apiUrl()}/v1/workout/today`, { method: "GET", headers: authHeaders(session.sub) });
  if (!res.ok) return { error: "workout plan not found" };
  return await res.json();
});

export const proxyToolAdvice = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { path: string })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return { tips: [] };
    const res = await fetch(`${apiUrl()}${data.path}`, { method: "GET", headers: authHeaders(session.sub) });
    if (!res.ok) return { tips: [] };
    const json = await res.json();
    const plan = json?.data?.plan ?? [];
    return { tips: Array.isArray(plan) ? plan : [] };
  });

// ---------------------------------------------------------------------------
// REST proxies (GraphQL was removed when the backend moved to Workers + D1)
// ---------------------------------------------------------------------------

export const proxyMe = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSession();
  if (!session) return { error: "not authenticated" };
  const res = await fetch(`${apiUrl()}/v1/user/me`, {
    method: "GET",
    headers: authHeaders(session.sub, session.email),
  });
  if (!res.ok) return { error: "not found" };
  const body = await res.json();
  return body?.data ?? { user: null, profile: null };
});

export const proxyUpdateProfile = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as Record<string, unknown>)
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return { error: "not authenticated" };
    const res = await fetch(`${apiUrl()}/v1/user/profile`, {
      method: "PUT",
      headers: authHeaders(session.sub, session.email),
      body: JSON.stringify(data),
    });
    if (!res.ok) return { error: "update failed" };
    const body = await res.json();
    return body?.data ?? {};
  });

export const proxyCoachSessions = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSession();
  if (!session) return [];
  const res = await fetch(`${apiUrl()}/v1/coach/sessions`, {
    method: "GET",
    headers: authHeaders(session.sub, session.email),
  });
  if (!res.ok) return [];
  return (await res.json()) as Array<{ id: string; title: string; message_count: number }>;
});

export const proxyCoachSession = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return null;
    const res = await fetch(`${apiUrl()}/v1/coach/sessions/${encodeURIComponent(data.id)}`, {
      method: "GET",
      headers: authHeaders(session.sub, session.email),
    });
    if (!res.ok) return null;
    return await res.json();
  });

export const proxyDeleteCoachSession = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return false;
    const res = await fetch(`${apiUrl()}/v1/coach/sessions/${encodeURIComponent(data.id)}`, {
      method: "DELETE",
      headers: authHeaders(session.sub, session.email),
    });
    return res.ok;
  });

export const proxyRenameCoachSession = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { id: string; title: string })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return null;
    const res = await fetch(`${apiUrl()}/v1/coach/sessions/${encodeURIComponent(data.id)}`, {
      method: "PATCH",
      headers: authHeaders(session.sub, session.email),
      body: JSON.stringify({ title: data.title }),
    });
    if (!res.ok) return null;
    return await res.json();
  });

export const proxyCreateCoachSession = createServerFn({ method: "POST" })
  .validator((d: unknown) => (d ?? {}) as { title?: string })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return null;
    const res = await fetch(`${apiUrl()}/v1/coach/sessions`, {
      method: "POST",
      headers: authHeaders(session.sub, session.email),
      body: JSON.stringify({ title: data?.title }),
    });
    if (!res.ok) return null;
    return await res.json();
  });
export const proxyCheckout = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { tier: string })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return { error: "not authenticated" };

    const tier = data.tier;
    if (tier !== "premium" && tier !== "pro") return { error: "Invalid tier" };

    const res = await fetch(`${apiUrl()}/v1/subscriptions/checkout`, {
      method: "POST",
      headers: authHeaders(session.sub),
      body: JSON.stringify({ tier }),
    });
    const body = await res.json();
    if (!res.ok) return { error: "payment_service_error" };
    return body;
  });

export const proxyMealPlan = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSession();
  if (!session) return { error: "not authenticated" };
  const res = await fetch(`${apiUrl()}/v1/meal/today`, { method: "GET", headers: authHeaders(session.sub) });
  if (!res.ok) return { error: "meal plan not found" };
  return await res.json();
});

