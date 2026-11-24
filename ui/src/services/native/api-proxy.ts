// Native replacement for `@/services/api-proxy`.
import { request, requestOrNull } from "./http";

export type CoachSessionRow = {
  id: string;
  title: string;
  message_count: number;
};

export async function proxyWorkoutPlan(): Promise<unknown> {
  const body = await requestOrNull<Record<string, unknown>>("/v1/workout/today");
  return body ?? { error: "workout plan not found" };
}

export async function proxyToolAdvice(opts: {
  data: { path: string };
}): Promise<{ tips: unknown[] }> {
  const body = await requestOrNull<{ data?: { plan?: unknown[] } }>(opts.data.path);
  const plan = body?.data?.plan ?? [];
  return { tips: Array.isArray(plan) ? plan : [] };
}

export async function proxyMe(): Promise<{ user: unknown; profile: unknown }> {
  const body = await requestOrNull<{ data?: { user: unknown; profile: unknown } }>(
    "/v1/user/me",
  );
  return body?.data ?? { user: null, profile: null };
}

export async function proxyUpdateProfile(opts: {
  data: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const body = await request<{ data?: Record<string, unknown> }>("/v1/user/profile", {
    method: "PUT",
    body: JSON.stringify(opts.data),
  });
  return body?.data ?? {};
}

export async function proxyCoachSessions(): Promise<CoachSessionRow[]> {
  const body = await requestOrNull<CoachSessionRow[]>("/v1/coach/sessions");
  return Array.isArray(body) ? body : [];
}

export async function proxyCoachSession(opts: { data: { id: string } }) {
  return requestOrNull<Record<string, unknown>>(
    `/v1/coach/sessions/${encodeURIComponent(opts.data.id)}`,
  );
}

export async function proxyDeleteCoachSession(opts: {
  data: { id: string };
}): Promise<boolean> {
  try {
    await request(`/v1/coach/sessions/${encodeURIComponent(opts.data.id)}`, {
      method: "DELETE",
    });
    return true;
  } catch {
    return false;
  }
}

export async function proxyRenameCoachSession(opts: {
  data: { id: string; title: string };
}) {
  return requestOrNull<Record<string, unknown>>(
    `/v1/coach/sessions/${encodeURIComponent(opts.data.id)}`,
    { method: "PATCH", body: JSON.stringify({ title: opts.data.title }) },
  );
}

export async function proxyCreateCoachSession(opts?: {
  data?: { title?: string };
}) {
  return requestOrNull<{ id: string }>("/v1/coach/sessions", {
    method: "POST",
    body: JSON.stringify({ title: opts?.data?.title }),
  });
}

export async function proxyCheckout(opts: { data: { tier: string } }) {
  const tier = opts.data.tier;
  if (tier !== "premium" && tier !== "pro") return { error: "Invalid tier" };
  try {
    const body = await request<Record<string, unknown>>(
      "/v1/subscriptions/checkout",
      { method: "POST", body: JSON.stringify({ tier }) },
    );
    return body;
  } catch {
    return { error: "payment_service_error" };
  }
}

export async function proxyMealPlan(): Promise<unknown> {
  const body = await requestOrNull<Record<string, unknown>>("/v1/meal/today");
  return body ?? { error: "meal plan not found" };
}
