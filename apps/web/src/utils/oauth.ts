import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";

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
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

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

export const getDiscordAuthUrl = createServerFn({ method: "GET" }).handler(async () => {
  const clientId = process.env.DISCORD_CLIENT_ID || "";
  const redirectUri = `${process.env.APP_URL || "http://localhost:3000"}/auth/discord/callback`;
  const url = new URL("https://discord.com/api/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify email");
  url.searchParams.set("prompt", "consent");
  return url.toString();
});

const discordCodec = (d: { code: string }) => d;

export const exchangeDiscordCode = createServerFn({ method: "POST" })
  .validator(discordCodec)
  .handler(async (ctx) => {
    const { code } = ctx.data;

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
    const apiUrl = process.env.API_URL || "https://16-112-225-113.sslip.io";
    const apiKey = process.env.API_SHARED_SECRET || "";
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
  document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0`;
  window.location.href = "/";
}
