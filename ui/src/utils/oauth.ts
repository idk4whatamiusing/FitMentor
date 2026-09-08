import { createServerFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { getSession, createSession, deleteSession, renewSession, deleteRememberToken, extractSessionId, resolveSessionFromToken } from "@/utils/session";
import { getEnv } from "@/utils/env";
import { useState, useEffect } from "react";

type Provider = "google";

interface ProviderUser {
  id: string;
  name: string;
  email?: string;
}

interface ProviderConfig {
  clientIdEnv: string;
  clientSecretEnv: string;
  scope: string;
  callbackPath: string;
  authUrl: string;
  tokenUrl: string;
  subPrefix: string;
  emailFallback: string;
  exchangeToken: (code: string, redirectUri: string, clientId: string, clientSecret: string) => Promise<{ accessToken: string; user: ProviderUser }>;
  fetchUser: (accessToken: string) => Promise<ProviderUser>;
}

const SESSION_COOKIE = "fitmentor_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const COOKIE_FLAGS = `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}`;

function setSessionCookie(sid: string) {
  setResponseHeader("Set-Cookie", `${SESSION_COOKIE}=${sid}; ${COOKIE_FLAGS}`);
}

function clearSessionCookie() {
  setResponseHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
}

function getAppUrl(): string {
  return getEnv("APP_URL") || "https://fitmentor-ey9.pages.dev";
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const bin = atob(base64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2) return {};
  try {
    return JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const providers: Record<Provider, ProviderConfig> = {
  google: {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    scope: "openid email profile",
    callbackPath: "/auth/google/callback",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    subPrefix: "google",
    emailFallback: "google",
    exchangeToken: async (code, redirectUri, clientId, clientSecret) => {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      });
      if (!res.ok) throw new Error(`token_exchange_failed:${res.status}:${await res.text()}`);
      const data = (await res.json()) as { access_token?: string; id_token?: string };
      if (!data.id_token) throw new Error("id_token_missing");
      const claims = decodeJwtPayload(data.id_token);
      return {
        accessToken: data.access_token || "",
        user: {
          id: String(claims.sub || ""),
          name: String(claims.name || claims.given_name || ""),
          email: claims.email ? String(claims.email) : undefined,
        },
      } as { accessToken: string; user: ProviderUser };
    },
    fetchUser: async () => {
      return { id: "", name: "" };
    },
  },
};

function buildAuthUrl(provider: Provider, mode?: string): string {
  const cfg = providers[provider];
  const clientId = getEnv(cfg.clientIdEnv);
  const appUrl = getAppUrl();
  const redirectUri = `${appUrl.replace(/\/+$/, "")}${cfg.callbackPath}`;
  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scope);
  if (provider === "google") {
    url.searchParams.set("prompt", "select_account");
  }
  if (mode) {
    url.searchParams.set("state", mode);
  }
  return url.toString();
}

const codec = (d: { code: string; state?: string }) => d;

function getClientIp(): string {
  try {
    const key = Symbol.for("tanstack-start:event-storage");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.h3Event;
    const headers = event?.req?.headers;
    if (!headers) return "";
    return headers["cf-connecting-ip"]
      || (headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || headers["x-real-ip"]
      || "";
  } catch {
    return "";
  }
}

function getApiKey(): string {
  return getEnv("API_SHARED_SECRET");
}

async function checkUserExists(sub: string): Promise<boolean> {
  const apiUrl = getEnv("API_URL");
  const apiKey = getApiKey();
  if (!apiKey) return false;
  try {
    const res = await fetch(`${apiUrl}/v1/user/exists`, {
      headers: {
        "X-Api-Key": apiKey,
        "X-User-Id": sub,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.exists === true;
  } catch {
    return false;
  }
}

async function syncUser(sub: string, email: string, name: string): Promise<boolean> {
  const apiUrl = getEnv("API_URL");
  const apiKey = getApiKey();
  if (!apiKey) return false;
  try {
    const res = await fetch(`${apiUrl}/v1/user/sync`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cf_sub: sub, email, name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function exchangeProviderCode(provider: Provider, code: string, state?: string) {
  const cfg = providers[provider];
  const clientId = getEnv(cfg.clientIdEnv);
  const clientSecret = getEnv(cfg.clientSecretEnv);
  const appUrl = getAppUrl();
  const redirectUri = `${appUrl.replace(/\/+$/, "")}${cfg.callbackPath}`;

  let exchange: { accessToken: string; user: ProviderUser };
  try {
    exchange = await cfg.exchangeToken(code, redirectUri, clientId, clientSecret);
    const user = await cfg.fetchUser(exchange.accessToken);
    if (user.id && !exchange.user.id) exchange.user = user;
    if (user.email && !exchange.user.email) exchange.user.email = user.email;
    if (user.name && !exchange.user.name) exchange.user.name = user.name;
  } catch (e: any) {
    return { ok: false, error: e?.message || "token_exchange_failed" } as const;
  }

  const { user } = exchange;
  if (!user.id) return { ok: false, error: "userinfo_failed" } as const;

  const sub = `${cfg.subPrefix}:${user.id}`;
  const email = user.email || `${user.id}@${cfg.emailFallback}`;
  const name = user.name || email;

  const userExists = await checkUserExists(sub);
  const mode = state || "signin";

  if (userExists && mode === "signup") {
    return { ok: false, error: "user_exists" } as const;
  }
  if (!userExists && mode === "signin") {
    return { ok: false, error: "user_not_found" } as const;
  }

  if (mode === "signup" && !userExists) {
    await syncUser(sub, email, name);
  }

  const ip = getClientIp();
  const sid = await createSession({
    sub,
    email,
    name,
    provider,
    ip,
  });
  if (!sid) return { ok: false, error: "session_create_failed" } as const;

  setSessionCookie(sid);

  return {
    ok: true,
    user: { sub, email, name, provider },
    userExists,
  } as const;
}

export const checkSession = createServerFn({ method: "GET" }).handler(async () => {
  const raw = getCookie(SESSION_COOKIE);
  if (raw) {
    const ip = getClientIp();
    const session = await resolveSessionFromToken(raw, ip);
    if (session) return { ok: true } as const;
    const sid = await extractSessionId(raw);
    if (sid) {
      const kvSession = await getSession(sid);
      if (kvSession) return { ok: true } as const;
      const newSid = await renewSession(sid);
      if (newSid) {
        setSessionCookie(newSid);
        return { ok: true } as const;
      }
    }
  }

  return { ok: false } as const;
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  const ip = getClientIp();
  const session = await resolveSessionFromToken(raw, ip);
  if (session) return session;
  const sid = await extractSessionId(raw);
  if (!sid) return null;
  const kvSession = await getSession(sid);
  if (!kvSession) return null;
  return { sub: kvSession.sub, email: kvSession.email };
});

export function useAuth() {
  const [user, setUser] = useState<{ sub: string; email: string } | null>(null);
  useEffect(() => {
    getCurrentUser().then((u) => setUser(u));
  }, []);
  return user;
}

export const getGoogleAuthUrl = createServerFn({ method: "GET" })
  .validator((d?: { mode?: string }) => d ?? {})
  .handler(async (ctx) => buildAuthUrl("google", ctx.data.mode));

export const exchangeGoogleCode = createServerFn({ method: "POST" })
  .validator(codec)
  .handler(async (ctx) => exchangeProviderCode("google", ctx.data.code, ctx.data.state));

export function logout() {
  window.location.href = "/";
}

export const clearSession = createServerFn({ method: "POST" }).handler(async () => {
  clearSessionCookie();
  return { ok: true } as const;
});

export const forgetDevice = createServerFn({ method: "POST" }).handler(async () => {
  const raw = getCookie(SESSION_COOKIE);
  if (raw) {
    const sid = await extractSessionId(raw);
    if (sid) {
      const session = await getSession(sid);
      if (session?.rememberToken) await deleteRememberToken(session.rememberToken);
      await deleteSession(sid);
    }
  }
  clearSessionCookie();
  return { ok: true } as const;
});
