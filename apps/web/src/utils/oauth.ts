import { createServerFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";

interface DiscordUser {
  id: string;
  username: string;
  email?: string;
  avatar?: string;
}

export interface SessionUser {
  sub: string;
  email: string;
  name: string;
  provider: string;
}

const SESSION_COOKIE = "fitmentor_session";
const REMEMBER_COOKIE = "fitmentor_remember";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30;

function signSession(data: SessionUser): string {
  const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
  const payload = btoa(JSON.stringify({ ...data, iat: Math.floor(Date.now() / 1000) }));
  const sig = Array.from(new TextEncoder().encode(secret + payload))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${payload}.${sig}`;
}

function verifySession(token: string): SessionUser | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const secret = process.env.SESSION_SECRET || "dev-secret-change-me";
    const expectedSig = Array.from(new TextEncoder().encode(secret + payload))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (sig !== expectedSig) return null;
    const data = JSON.parse(atob(payload)) as SessionUser & { iat: number };
    if (data.iat && Date.now() / 1000 - data.iat > SESSION_MAX_AGE) return null;
    return { sub: data.sub, email: data.email, name: data.name, provider: data.provider };
  } catch {
    return null;
  }
}

export function getSessionUser(): SessionUser | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  if (!m) return null;
  return verifySession(decodeURIComponent(m[1]));
}

export const checkSession = createServerFn({ method: "GET" }).handler(async () => {
  const raw = getCookie(SESSION_COOKIE);
  return { ok: !!raw && verifySession(raw) !== null } as const;
});

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

export const renewSession = createServerFn({ method: "POST" }).handler(async () => {
  const raw = getCookie(REMEMBER_COOKIE);
  if (!raw) return { ok: false } as const;
  let sub = "", email = "";
  try {
    const data = JSON.parse(atob(raw));
    sub = data.sub || "";
    email = data.email || sub;
  } catch {
    return { ok: false } as const;
  }
  if (!sub) return { ok: false } as const;
  const apiUrl = process.env.API_URL || "https://16-112-225-113.sslip.io";
  const apiKey = process.env.API_SHARED_SECRET;
  if (!apiKey) return { ok: false } as const;
  const res = await fetch(`${apiUrl}/v1/user/me`, {
    headers: { "X-Api-Key": apiKey, "X-User-Id": sub, "X-User-Email": email },
  });
  if (!res.ok) return { ok: false } as const;
  const json: unknown = await res.json();
  const resData = (json as Record<string, unknown>).data as Record<string, unknown> | undefined;
  const user = resData?.user as Record<string, unknown> | undefined;
  if (!user?.id) return { ok: false } as const;
  const session = signSession({
    sub,
    email,
    name: (user.name as string) || "",
    provider: "discord",
  });
  setResponseHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
  );
  return { ok: true } as const;
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
    const apiUrl = process.env.API_URL || "https://16-112-225-113.sslip.io";
    const apiKey = process.env.API_SHARED_SECRET || "";

    // If coming from signup, check if user already exists
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

    const session = signSession({
      sub,
      email,
      name: discordUser.username,
      provider: "discord",
    });

    setResponseHeader(
      "Set-Cookie",
      `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
    );

    // Sync user to backend DB
    if (apiKey) {
      fetch(`${apiUrl}/v1/user/me`, {
        headers: {
          "X-Api-Key": apiKey,
          "X-User-Id": sub,
          "X-User-Email": email,
        },
      }).catch((err) => console.error("Failed to sync user to backend:", err));
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
  setResponseHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  return { ok: true } as const;
});

export function forgetDevice() {
  clearSession().then(() => {
    document.cookie = `${REMEMBER_COOKIE}=; Path=/; Max-Age=0`;
    window.location.href = "/";
  });
}
