import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import type { Profile } from "@fitmentor/shared";

const SESSION_COOKIE = "fitmentor_session";

function verifySession(token: string): { sub: string; email: string } | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
    const expectedSig = Array.from(new TextEncoder().encode(secret + payload))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (sig !== expectedSig) return null;
    const data = JSON.parse(atob(payload)) as { sub: string; email: string; iat: number };
    if (data.iat && Date.now() / 1000 - data.iat > 60 * 60 * 24 * 7) return null;
    return { sub: data.sub, email: data.email };
  } catch {
    return null;
  }
}

export const fetchProfile = createServerFn({ method: "GET" }).handler(async () => {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  const session = verifySession(raw);
  if (!session) return null;
  const apiUrl = process.env.API_URL || "https://16-112-225-113.sslip.io";
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
  return profile as Profile;
});

export const syncProfile = createServerFn({ method: "POST" })
  .validator((d: unknown) => d as Profile)
  .handler(async ({ data: profile }) => {
    const raw = getCookie(SESSION_COOKIE);
    if (!raw) return { ok: false, error: "no_session" } as const;

    const session = verifySession(raw);
    if (!session) return { ok: false, error: "invalid_session" } as const;

    const apiUrl = process.env.API_URL || "https://16-112-225-113.sslip.io";
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
