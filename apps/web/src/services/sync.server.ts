import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { getSession } from "@/utils/session";

const SESSION_COOKIE = "fitmentor_session";
const API_URL = process.env.API_URL || "https://16-112-132-239.sslip.io";

async function headers(): Promise<Record<string, string>> {
  const sid = getCookie(SESSION_COOKIE);
  const session = sid ? await getSession(sid) : null;
  if (!session?.sub) throw new Error("Not authenticated");
  return {
    "Content-Type": "application/json",
    "X-Api-Key": process.env.API_SHARED_SECRET ?? "",
    "X-User-Id": session.sub,
  };
}

export const syncDailyLog = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        water?: number;
        sleep?: number;
        steps?: number;
        protein_g?: number;
        workout_done?: boolean;
        weight_kg?: number | null;
      },
  )
  .handler(async ({ data }) => {
    const h = await headers();
    const res = await fetch(`${API_URL}/v1/logs/today`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "?");
      throw new Error(`sync daily log failed: ${res.status} ${text}`);
    }
    return res.json();
  });

export const syncSubscription = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        polar_sub_id?: string;
        polar_product_id?: string;
        polar_price_id?: string;
        tier: string;
        status: string;
      },
  )
  .handler(async ({ data }) => {
    const h = await headers();
    const res = await fetch(`${API_URL}/v1/user/subscription`, {
      method: "PUT",
      headers: h,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "?");
      throw new Error(`sync subscription failed: ${res.status} ${text}`);
    }
    return res.json();
  });

export const syncWorkoutComplete = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as {
        day_index: number;
        title: string;
      },
  )
  .handler(async ({ data }) => {
    const h = await headers();
    const res = await fetch(`${API_URL}/v1/workout/complete`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "?");
      throw new Error(`sync workout complete failed: ${res.status} ${text}`);
    }
    return res.json();
  });

export const fetchWorkoutCompletions = createServerFn({ method: "POST" }).handler(
  async () => {
    const h = await headers();
    const res = await fetch(`${API_URL}/v1/workout/completions`, {
      method: "GET",
      headers: h,
    });
    if (!res.ok) return { data: { completions: [] } };
    return res.json();
  },
);
