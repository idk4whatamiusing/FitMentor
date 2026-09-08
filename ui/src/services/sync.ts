import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { Profile } from "@fitmentor/shared";
import { resolveSessionFromToken } from "@/utils/session";
import { getEnv } from "@/utils/env";

const SESSION_COOKIE = "fitmentor_session";

async function resolveSession() {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  return resolveSessionFromToken(raw);
}

export const fetchProfile = createServerFn({ method: "GET" }).handler(async () => {
  const session = await resolveSession();
  if (!session) return null;
  const apiUrl = getEnv("API_URL");
  const apiKey = getEnv("API_SHARED_SECRET");
  if (!apiKey) return null;
  const res = await fetch(`${apiUrl}/v1/user/me`, {
    headers: {
      "X-Api-Key": apiKey,
      "X-User-Id": session.sub,
      "X-User-Email": session.email,
    },
  });
  if (!res.ok) return null;
  const json: unknown = await res.json();
  const data = (json as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const profile = data?.profile as Record<string, unknown> | undefined;
  if (!profile?.name) return null;

  return profile as unknown as Profile;
});

export const syncProfile = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as Profile)
  .handler(async ({ data: profile }) => {
    const session = await resolveSession();
    if (!session) return { ok: false, error: "no_session" } as const;

    const apiUrl = getEnv("API_URL");
    const apiKey = getEnv("API_SHARED_SECRET");
    if (!apiKey) return { ok: false, error: "api_key_not_configured" } as const;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
      "X-User-Id": session.sub,
      "X-User-Email": session.email,
    };

    await fetch(`${apiUrl}/v1/user/me`, { headers }).catch(() => {});

    const body = {
      name: profile.name,
      age: profile.age,
      gender: profile.gender,
      heightCm: profile.heightCm,
      weightKg: profile.weightKg,
      goal: profile.goal,
      place: profile.place,
      experience: profile.experience,
      diet: profile.diet,
      daysPerWeek: profile.daysPerWeek,
      budgetPerDay: profile.budgetPerDay,
      healthConditions: profile.healthConditions,
    };

    const res = await fetch(`${apiUrl}/v1/user/profile`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `backend_error: ${res.status} ${text.slice(0, 200)}` } as const;
    }

    return { ok: true } as const;
  });

export const syncWorkoutDone = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { workoutDone: boolean })
  .handler(async ({ data: { workoutDone } }) => {
    const session = await resolveSession();
    if (!session) return { ok: false };
    const apiUrl = getEnv("API_URL");
    const apiKey = getEnv("API_SHARED_SECRET");
    if (!apiKey) return { ok: false };
    const res = await fetch(`${apiUrl}/v1/logs/today`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-User-Id": session.sub,
        "X-User-Email": session.email,
      },
      body: JSON.stringify({ workout_done: workoutDone }),
    });
    return { ok: res.ok };
  });

export const fetchSubscription = createServerFn({ method: "POST" }).handler(async () => {
    const session = await resolveSession();
    if (!session) return { data: { subscription: null } };
    const apiKey = getEnv("API_SHARED_SECRET");
    if (!apiKey) return { data: { subscription: null } };
    const res = await fetch(`${getEnv("API_URL")}/v1/user/subscription`, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
        "X-User-Id": session.sub,
      },
    });
    if (!res.ok) return { data: { subscription: null } };
    return res.json();
  });
