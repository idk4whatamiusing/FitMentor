import "./utils/error-capture";

import { consumeLastCapturedError } from "./utils/error-capture";
import { renderErrorPage } from "./utils/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function getCloudflareEnv(request: Request) {
  return (request as any).runtime?.cloudflare?.env ?? null;
}

function aiText(r: any): string {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (r?.choices?.[0]?.message?.content) return r.choices[0].message.content;
  if (r?.response) return typeof r.response === "string" ? r.response : JSON.stringify(r.response);
  return JSON.stringify(r);
}

function parseCookie(cookie: string | null, name: string): string | null {
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=") || null;
  }
  return null;
}

async function getUserSub(request: Request, env: any): Promise<string | null> {
  const raw = parseCookie(request.headers.get("cookie"), "fitmentor_session");
  if (!raw) return null;
  try {
    const kv = env?.fitmentor_sessions;
    if (!kv) return null;
    const data = await kv.get(raw);
    if (!data) return null;
    return JSON.parse(data).sub ?? null;
  } catch {
    return null;
  }
}

const API_URL = process.env.API_URL || "https://16-112-132-239.sslip.io";

async function callApi(sub: string, path: string, method: string, body?: unknown): Promise<Response | null> {
  const apiKey = process.env.API_SHARED_SECRET;
  if (!apiKey) return null;
  const headers: Record<string, string> = {
    "X-Api-Key": apiKey,
    "X-User-Id": sub,
    "Content-Type": "application/json",
  };
  return fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Strip AI generation handlers, proxy to Rust API

async function handleMealPlan(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    if (!sub) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: { "content-type": "application/json" } });

    const apiUrl = process.env.API_URL || "https://16-112-132-239.sslip.io";
    const apiKey = process.env.API_SHARED_SECRET;
    const headers: Record<string, string> = {
      "X-Api-Key": apiKey ?? "",
      "X-User-Id": sub,
      "Content-Type": "application/json",
    };
    const res = await fetch(`${apiUrl}/v1/meal/today`, { method: "GET", headers });
    if (!res.ok) return new Response(JSON.stringify({ error: "meal plan not found" }), { status: 404, headers: { "content-type": "application/json" } });
    const json = await res.json();
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
}

async function handleWorkoutPlan(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    if (!sub) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: { "content-type": "application/json" } });

    const apiUrl = process.env.API_URL || "https://16-112-132-239.sslip.io";
    const apiKey = process.env.API_SHARED_SECRET;
    const headers: Record<string, string> = {
      "X-Api-Key": apiKey ?? "",
      "X-User-Id": sub,
      "Content-Type": "application/json",
    };
    const res = await fetch(`${apiUrl}/v1/workout/today`, { method: "GET", headers });
    if (!res.ok) return new Response(JSON.stringify({ error: "workout plan not found" }), { status: 404, headers: { "content-type": "application/json" } });
    const json = await res.json();
    return new Response(JSON.stringify(json), { headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
}

async function proxyGetAdvice(request: Request, apiPath: string): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);
    if (!sub) return new Response(JSON.stringify({ error: "not authenticated" }), { status: 401, headers: { "content-type": "application/json" } });

    const apiUrl = process.env.API_URL || "https://16-112-132-239.sslip.io";
    const apiKey = process.env.API_SHARED_SECRET;
    const headers: Record<string, string> = {
      "X-Api-Key": apiKey ?? "",
      "X-User-Id": sub,
      "Content-Type": "application/json",
    };
    const res = await fetch(`${apiUrl}${apiPath}`, { method: "GET", headers });
    if (!res.ok) return new Response(JSON.stringify({ tips: [] }), { headers: { "content-type": "application/json" } });
    const json = await res.json();
    const plan = json?.data?.plan ?? [];
    return new Response(JSON.stringify({ tips: Array.isArray(plan) ? plan : [] }), { headers: { "content-type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ tips: [] }), { headers: { "content-type": "application/json" } });
  }
}

async function handleBMIGet(request: Request): Promise<Response> {
  return proxyGetAdvice(request, "/v1/tools/bmi-advice");
}

async function handleSleepGet(request: Request): Promise<Response> {
  return proxyGetAdvice(request, "/v1/tools/sleep-advice");
}

async function handleInjuryGet(request: Request): Promise<Response> {
  return proxyGetAdvice(request, "/v1/tools/injury-advice");
}

async function handleFormGet(request: Request): Promise<Response> {
  return proxyGetAdvice(request, "/v1/tools/form-advice");
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/api/meal-plan" && request.method === "POST") {
        return await handleMealPlan(request);
      }
      if (url.pathname === "/api/workout-plan" && request.method === "POST") {
        return await handleWorkoutPlan(request);
      }
      if (url.pathname === "/api/tools/injury" && request.method === "GET") {
        return await handleInjuryGet(request);
      }
      if (url.pathname === "/api/tools/bmi-advice" && request.method === "GET") {
        return await handleBMIGet(request);
      }
      if (url.pathname === "/api/tools/sleep-advice" && request.method === "GET") {
        return await handleSleepGet(request);
      }
      if (url.pathname === "/api/tools/form-analyze" && request.method === "GET") {
        return await handleFormGet(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};