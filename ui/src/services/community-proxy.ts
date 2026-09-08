import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { resolveSessionFromToken } from "@/utils/session";
import { getEnv } from "@/utils/env";

const SESSION_COOKIE = "fitmentor_session";
const wsUrl = () => getEnv("WS_URL") || "https://40-192-40-60.sslip.io";

function getClientIp(): string {
  try {
    const key = Symbol.for("tanstack-start:event-storage");
    const store = (globalThis as any)[key]?.getStore?.();
    const event: any = store?.h3Event;
    const headers = event?.req?.headers;
    if (!headers) return "";
    return (
      headers["cf-connecting-ip"] ||
      (headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      headers["x-real-ip"] ||
      ""
    );
  } catch {
    return "";
  }
}

async function resolveSession(): Promise<{ sub: string; email: string } | null> {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  const ip = getClientIp();
  return resolveSessionFromToken(raw, ip);
}

export const proxyCommunityGraphQL = createServerFn({ method: "POST" })
  .validator(
    (d: unknown) =>
      d as { query: string; variables?: Record<string, unknown> },
  )
  .handler(async ({ data }) => {
    const session = await resolveSession();
    if (!session) return { errors: [{ message: "Unauthorized" }] };

    const res = await fetch(`${wsUrl()}/v1/community/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": getEnv("API_SHARED_SECRET"),
        "X-User-Id": session.sub,
      },
      body: JSON.stringify(data),
    });
    return await res.json();
  });
