import { createServerFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { getSession, createSession, deleteSession, renewSession, deleteRememberToken } from "@/utils/session";
import { useState, useEffect } from "react";

interface DiscordUser {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
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

export const checkSession = createServerFn({ method: "GET" }).handler(async () => {
  const sid = getCookie(SESSION_COOKIE);
  if (sid) {
    const session = await getSession(sid);
    if (session) return { ok: true } as const;

    // Session expired — try renewing via remember token in KV
    const newSid = await renewSession(sid);
    if (newSid) {
      setSessionCookie(newSid);
      return { ok: true } as const;
    }
  }

  return { ok: false } as const;
});

export const getCurrentUser = createServerFn({ method: "GET" }).handler(async () => {
  const sid = getCookie(SESSION_COOKIE);
  if (!sid) return null;
  const session = await getSession(sid);
  if (!session) return null;
  return { sub: session.sub, email: session.email };
});

export function useAuth() {
  const [user, setUser] = useState<{ sub: string; email: string } | null>(null);
  useEffect(() => {
    getCurrentUser().then((u) => setUser(u));
  }, []);
  return user;
}

export const getDiscordAuthUrl = createServerFn({ method: "GET" })
  .validator((d?: { mode?: string }) => d ?? {})
  .handler(async (ctx) => {
    const mode = ctx.data.mode;
    const clientId = process.env.DISCORD_CLIENT_ID || "";
    const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/auth/discord/callback`;
    const url = new URL("https://discord.com/api/oauth2/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "identify email");
    if (mode) url.searchParams.set("state", mode);
    return url.toString();
  });

const discordCodec = (d: { code: string; state?: string }) => d;

export const exchangeDiscordCode = createServerFn({ method: "POST" })
  .validator(discordCodec)
  .handler(async (ctx) => {
    const { code, state } = ctx.data;

    const clientId = process.env.DISCORD_CLIENT_ID || "";
    const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
    const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/auth/discord/callback`;

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
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

    if (!tokenRes.ok) return { ok: false, error: "token_exchange_failed" } as const;
    const tokenData = await tokenRes.json();

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) return { ok: false, error: "userinfo_failed" } as const;
    const discordUser: DiscordUser = await userRes.json();

    const sub = `discord:${discordUser.id}`;
    const email = discordUser.email || `${discordUser.username}@discord`;
    const apiUrl = process.env.API_URL || "https://16-112-132-239.sslip.io";
    const apiKey = process.env.API_SHARED_SECRET || "";

    if (state === "signup" && apiKey) {
      const existRes = await fetch(`${apiUrl}/v1/user/exists`, {
        headers: {
          "X-Api-Key": apiKey,
          "X-User-Id": sub,
          "X-User-Email": email,
        },
      });
      const existData = await existRes.json();
      if (existData.exists) {
        return { ok: false, error: "user_exists" } as const;
      }
    }

    const sid = await createSession({
      sub,
      email,
      name: discordUser.username,
      provider: "discord",
    });
    if (!sid) return { ok: false, error: "session_create_failed" } as const;

    setSessionCookie(sid);

    if (apiKey) {
      fetch(`${apiUrl}/v1/user/me`, {
        headers: {
          "X-Api-Key": apiKey,
          "X-User-Id": sub,
          "X-User-Email": email,
        },
      }).catch(() => {});
    }

    return {
      ok: true,
      user: { sub, email, name: discordUser.username, provider: "discord" },
    } as const;
  });

export function logout() {
  window.location.href = "/";
}

export const clearSession = createServerFn({ method: "POST" }).handler(async () => {
  const sid = getCookie(SESSION_COOKIE);
  if (sid) {
    const session = await getSession(sid);
    if (session?.rememberToken) await deleteRememberToken(session.rememberToken);
    await deleteSession(sid);
  }
  clearSessionCookie();
  return { ok: true } as const;
});

export const forgetDevice = createServerFn({ method: "POST" }).handler(async () => {
  const sid = getCookie(SESSION_COOKIE);
  if (sid) {
    const session = await getSession(sid);
    if (session?.rememberToken) await deleteRememberToken(session.rememberToken);
    await deleteSession(sid);
  }
  clearSessionCookie();
  return { ok: true } as const;
});
