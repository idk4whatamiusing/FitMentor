import type { DailyLog, Profile } from "@fitmentor/shared";

const API_URL = import.meta.env.VITE_API_URL ?? "https://ham-apollo-situations-consolidated.trycloudflare.com";

function authHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
    headers["cf-access-jwt-assertion"] = token;
  }
  return headers;
}

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(token), ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status} ${res.statusText} on ${path}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

// DailyLog is camelCase (shared types); the API accepts snake_case on write.
type LogInput = Partial<{
  water: number;
  sleep: number;
  steps: number;
  proteinG: number;
  workoutDone: boolean;
  weightKg: number | null;
}>;

function toSnake(input: LogInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.water !== undefined) out.water = input.water;
  if (input.sleep !== undefined) out.sleep = input.sleep;
  if (input.steps !== undefined) out.steps = input.steps;
  if (input.proteinG !== undefined) out.protein_g = input.proteinG;
  if (input.workoutDone !== undefined) out.workout_done = input.workoutDone;
  if (input.weightKg !== undefined) out.weight_kg = input.weightKg;
  return out;
}

export const api = {
  getProfile(token?: string): Promise<Profile> {
    return request<{ profile: Profile }>("/v1/user/me", token).then((d) => d.profile);
  },
  getLogs(from: string, to: string, token?: string): Promise<DailyLog[]> {
    return request<{ logs: DailyLog[] }>(
      `/v1/logs?from=${from}&to=${to}`,
      token,
    ).then((d) => d.logs);
  },
  createLog(input: LogInput, token?: string): Promise<DailyLog> {
    return request<{ log: DailyLog }>("/v1/logs/today", token, {
      method: "PUT",
      body: JSON.stringify(toSnake(input)),
    }).then((d) => d.log);
  },
};

export type { LogInput };
