import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { Profile, DailyLog } from "@fitmentor/shared";
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
      body: JSON.stringify({ workoutDone }),
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


function logHeaders(session: { sub: string; email: string }, apiKey: string) {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
    "X-User-Id": session.sub,
    "X-User-Email": session.email,
  };
}

export const fetchLogRange = createServerFn({ method: "GET" })
  .validator((d: unknown) => d as { from: string; to: string })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    const apiKey = getEnv("API_SHARED_SECRET");
    if (!session || !apiKey) return [] as DailyLog[];
    const url = `${getEnv("API_URL")}/v1/logs?from=${encodeURIComponent(data.from)}&to=${encodeURIComponent(data.to)}`;
    const res = await fetch(url, { headers: logHeaders(session, apiKey) });
    if (!res.ok) return [] as DailyLog[];
    const json = (await res.json()) as { data?: { logs?: DailyLog[] } };
    return json?.data?.logs ?? [];
  });

function isEmptyLog(log: DailyLog) {
  return (
    !log.water &&
    !log.sleep &&
    !log.steps &&
    !log.proteinG &&
    !log.workoutDone &&
    !(log.weightKg && log.weightKg > 0)
  );
}

export const upsertTodayLog = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as DailyLog)
  .handler(async ({ data }) => {
    if (isEmptyLog(data)) return { ok: true };
    const session = await resolveSession();
    const apiKey = getEnv("API_SHARED_SECRET");
    if (!session || !apiKey) return { ok: false };
    const res = await fetch(`${getEnv("API_URL")}/v1/logs/today`, {
      method: "PUT",
      headers: logHeaders(session, apiKey),
      body: JSON.stringify({
        water: data.water,
        sleep: data.sleep,
        steps: data.steps,
        proteinG: data.proteinG,
        ...(data.workoutDone ? { workoutDone: true } : {}),
        weightKg: data.weightKg ?? null,
      }),
    });
    return { ok: res.ok };
  });

export const syncLocalLogs = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as { logs: DailyLog[] })
  .handler(async ({ data }) => {
    const session = await resolveSession();
    const apiKey = getEnv("API_SHARED_SECRET");
    if (!session || !apiKey || data.logs.length === 0) return { ok: false, inserted: 0 };
    const res = await fetch(`${getEnv("API_URL")}/v1/logs/sync`, {
      method: "POST",
      headers: logHeaders(session, apiKey),
      body: JSON.stringify({ logs: data.logs }),
    });
    if (!res.ok) return { ok: false, inserted: 0 };
    const json = (await res.json()) as { data?: { inserted?: number } };
    return { ok: true, inserted: json?.data?.inserted ?? 0 };
  });
