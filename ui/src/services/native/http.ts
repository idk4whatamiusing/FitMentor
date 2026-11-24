// Shared HTTP + token core for the Capacitor build.
//
// Every request authenticates with the Bearer JWT issued by the
// `/v1/auth/google` start/poll flow. The API accepts that token on every
// data route (api/src/auth.rs::require_user), so the native client never
// needs the web's shared API key.
import type { DailyLog } from "@fitmentor/shared";

const DEFAULT_API_URL =
  "https://vfvwjpw567ghnqwknc2m74thx40jmpiw.lambda-url.ap-south-1.on.aws";

export const API_URL = (
  import.meta.env.VITE_API_URL || DEFAULT_API_URL
).replace(/\/+$/, "");

const TOKEN_KEY = "fitmentor.token.v1";

let cached: string | null | undefined;

// Capacitor plugins are proxies: awaiting one directly calls `.then()` on the
// proxy and throws. Wrap it so the promise resolves to an object instead.
async function secureStorage() {
  const mod = await import("@aparajita/capacitor-secure-storage");
  return { store: mod.SecureStorage };
}

export async function getToken(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const { store } = await secureStorage();
    const value = await store.get(TOKEN_KEY);
    cached = typeof value === "string" && value.length > 0 ? value : null;
  } catch {
    cached = null;
  }
  return cached;
}

export async function setToken(token: string | null): Promise<void> {
  cached = token;
  try {
    const { store } = await secureStorage();
    if (token) await store.set(TOKEN_KEY, token);
    else await store.remove(TOKEN_KEY);
  } catch {
    // Storage failures must not break a live session.
  }
}

export type JwtClaims = { sub?: string; email?: string; exp?: number };

function base64UrlDecode(value: string): string {
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function decodeToken(token: string | null): JwtClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const claims = JSON.parse(base64UrlDecode(parts[1])) as JwtClaims;
    return claims?.sub ? claims : null;
  } catch {
    return null;
  }
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestInitLite = {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

/** Performs an authenticated request and returns the parsed JSON body. */
export async function request<T>(
  path: string,
  init: RequestInitLite = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...init.headers,
  };

  const res = await fetch(`${API_URL}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: init.body } : {}),
  });

  if (res.status === 401) {
    // The token expired or was revoked — drop it so the UI can sign in again.
    await setToken(null);
    throw new ApiError(401, "Session expired. Please sign in again.");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(
      res.status,
      `API ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Like `request`, but returns null instead of throwing on any failure. */
export async function requestOrNull<T>(
  path: string,
  init: RequestInitLite = {},
): Promise<T | null> {
  try {
    return await request<T>(path, init);
  } catch {
    return null;
  }
}

/** Same emptiness rule the web uses before writing a log row. */
export function isEmptyLog(log: DailyLog): boolean {
  return (
    !log.water &&
    !log.sleep &&
    !log.steps &&
    !log.proteinG &&
    !log.workoutDone &&
    !(log.weightKg && log.weightKg > 0)
  );
}
