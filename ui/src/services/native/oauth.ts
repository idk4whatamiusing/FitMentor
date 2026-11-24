// Native replacement for `@/utils/oauth`.
//
// The web flow redirects the page through Google and sets an HttpOnly
// cookie. Google blocks embedded WebViews, so the native flow opens the
// system browser and polls the API until the token lands — no deep link
// and no extra OAuth client.
import { useEffect, useState } from "react";
import { decodeToken, getToken, request, setToken } from "./http";

type SessionUser = { sub: string; email: string };

type StartResponse = { state: string; auth_url: string };

type PollResponse = {
  status: "pending" | "ok" | "error" | "expired";
  token?: string;
  user?: { name?: string };
  message?: string;
};

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 3 * 60 * 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function currentUserFromToken(token: string | null): SessionUser | null {
  const claims = decodeToken(token);
  if (!claims?.sub) return null;
  if (claims.exp && claims.exp * 1000 < Date.now()) return null;
  return { sub: claims.sub, email: claims.email ?? "" };
}

/** True when a stored token is still accepted by the API. */
export async function checkSession(): Promise<{ ok: boolean }> {
  const token = await getToken();
  if (!currentUserFromToken(token)) return { ok: false };
  try {
    await request("/v1/auth/me");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = await getToken();
  const user = currentUserFromToken(token);
  if (!user) return null;
  try {
    await request("/v1/auth/me");
    return user;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    getCurrentUser().then(setUser).catch(() => setUser(null));
  }, []);
  return user;
}

async function pollForToken(state: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let res: PollResponse;
    try {
      res = await request<PollResponse>("/v1/auth/google/poll", {
        method: "POST",
        body: JSON.stringify({ state }),
      });
    } catch {
      continue; // transient network failure — keep polling
    }
    if (res.status === "ok" && res.token) return res.token;
    if (res.status === "error") throw new Error(res.message || "Sign-in failed");
    if (res.status === "expired") throw new Error("Sign-in link expired. Try again.");
  }
  throw new Error("Sign-in timed out. Try again.");
}

/**
 * Opens Google in the system browser and waits for the callback.
 *
 * Returns the path to navigate to, so `window.location.href = url` works
 * unchanged in the shared auth screen.
 */
export async function getGoogleAuthUrl(_opts?: {
  data?: { mode?: string };
}): Promise<string> {
  const start = await request<StartResponse>("/v1/auth/google/start", {
    method: "POST",
    body: JSON.stringify({}),
  });

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: start.auth_url, presentationStyle: "popover" });

  const token = await pollForToken(start.state);
  await setToken(token);
  return "/dashboard";
}

/** Unused on native: the start/poll flow replaces the code exchange. */
export async function exchangeGoogleCode(_data?: unknown): Promise<never> {
  throw new Error("Code exchange is not used in the native app");
}

export async function clearSession(): Promise<{ ok: true }> {
  await setToken(null);
  return { ok: true };
}

export async function forgetDevice(): Promise<{ ok: true }> {
  await setToken(null);
  return { ok: true };
}

export function logout() {
  try {
    localStorage.removeItem("fitmentor.habits.v1");
  } catch {
    // ignore
  }
  void setToken(null);
  window.location.href = "/signin";
}
