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

export const proxyGraphQL = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { query: string; variables?: Record<string, unknown> })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return { errors: [{ message: "Unauthorized" }] };

    const res = await fetch(`${apiUrl()}/graphql`, {
      method: "POST",
      headers: authHeaders(session.sub, session.email),
      body: JSON.stringify(data),
    });
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
