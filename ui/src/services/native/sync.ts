// Native replacement for `@/services/sync`.
import type { DailyLog, Profile } from "@fitmentor/shared";
import { isEmptyLog, request, requestOrNull } from "./http";

type MeEnvelope = {
  data?: {
    profile?: Record<string, unknown> | null;
  };
};

function logBody(data: DailyLog) {
  return JSON.stringify({
    water: data.water,
    sleep: data.sleep,
    steps: data.steps,
    proteinG: data.proteinG,
    ...(data.workoutDone ? { workoutDone: true } : {}),
    weightKg: data.weightKg ?? null,
  });
}

export async function fetchProfile(): Promise<Profile | null> {
  const body = await requestOrNull<MeEnvelope>("/v1/user/me");
  const profile = body?.data?.profile;
  if (!profile || !profile.name) return null;
  return profile as unknown as Profile;
}

export async function syncProfile(profile: Profile): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await request("/v1/user/profile", {
      method: "PUT",
      body: JSON.stringify({
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
      }),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function syncWorkoutDone(_opts: {
  data: { workoutDone: boolean };
}): Promise<{ ok: boolean }> {
  try {
    await request("/v1/logs/today", {
      method: "PUT",
      body: JSON.stringify({ workoutDone: _opts.data.workoutDone }),
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function fetchSubscription(): Promise<{
  data: { subscription: { tier?: string; status?: string } | null };
}> {
  const body = await requestOrNull<{
    data?: { subscription?: { tier?: string; status?: string } | null };
  }>("/v1/user/subscription");
  return { data: { subscription: body?.data?.subscription ?? null } };
}

export async function fetchLogRange(opts: {
  data: { from: string; to: string };
}): Promise<DailyLog[]> {
  const { from, to } = opts.data;
  const body = await requestOrNull<{ data?: { logs?: DailyLog[] } }>(
    `/v1/logs?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  return body?.data?.logs ?? [];
}

export async function upsertTodayLog(opts: {
  data: DailyLog;
}): Promise<{ ok: boolean }> {
  if (isEmptyLog(opts.data)) return { ok: true };
  try {
    await request("/v1/logs/today", { method: "PUT", body: logBody(opts.data) });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function syncLocalLogs(opts: {
  data: { logs: DailyLog[] };
}): Promise<{ ok: boolean; inserted: number }> {
  if (opts.data.logs.length === 0) return { ok: false, inserted: 0 };
  try {
    const body = await request<{ data?: { inserted?: number } }>("/v1/logs/sync", {
      method: "POST",
      body: JSON.stringify({ logs: opts.data.logs }),
    });
    return { ok: true, inserted: body?.data?.inserted ?? 0 };
  } catch {
    return { ok: false, inserted: 0 };
  }
}
