import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { Profile } from "@fitmentor/shared";
import { getSession } from "@/utils/session";

const SESSION_COOKIE = "fitmentor_session";

export const fetchProfile = createServerFn({ method: "GET" }).handler(async () => {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  const session = await getSession(raw);
  if (!session) return null;
  const apiUrl = process.env.API_URL || "https://16-112-132-239.sslip.io";
  const apiKey = process.env.API_SHARED_SECRET;
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

  // If profile is fresh from DB default insert (created_at === updated_at), user hasn't onboarded yet
  if (profile.createdAt && profile.updatedAt) {
    const diff = Math.abs(new Date(profile.updatedAt as string).getTime() - new Date(profile.createdAt as string).getTime());
    if (diff < 1000) return null;
  }

  return profile as Profile;
});

export const syncProfile = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as Profile)
  .handler(async ({ data: profile }) => {
    const raw = getCookie(SESSION_COOKIE);
    if (!raw) return { ok: false, error: "no_session" } as const;
    const session = await getSession(raw);
    if (!session) return { ok: false, error: "invalid_session" } as const;

    const apiUrl = process.env.API_URL || "https://16-112-132-239.sslip.io";
    const apiKey = process.env.API_SHARED_SECRET;
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
