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

function getCfEnv(request: Request, _env: unknown): Record<string, unknown> {
  const env =
    (request as any)?.runtime?.cloudflare?.env ??
    (_env as any)?.context?.cloudflare?.env ??
    (globalThis as any).__cf_env;
  return env ?? {};
}

async function handleAiComplete(
  request: Request,
  env: unknown,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }
  const key = request.headers.get("x-api-key");
  const cfEnv = getCfEnv(request, env);
  const shared =
    (cfEnv.API_SHARED_SECRET as string) ??
    (process.env.API_SHARED_SECRET as string) ??
    "";
  if (!key || key !== shared) {
    return new Response("unauthorized", { status: 401 });
  }
  try {
    const { system, prompt, max_tokens } = (await request.json()) as {
      system?: string;
      prompt?: string;
      max_tokens?: number;
    };
    if (!system || !prompt) {
      return new Response("missing system or prompt", { status: 400 });
    }
    const ai = cfEnv.AI;
    if (!ai) {
      return new Response("ai binding unavailable", { status: 500 });
    }
    const rawResponse = await (ai as any).run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: max_tokens ?? 2048,
      },
    );
    let resultText = "";
    const content =
      rawResponse?.choices?.[0]?.message?.content ??
      rawResponse?.response;
    if (typeof content === "string") {
      resultText = content;
    } else if (content !== undefined && content !== null) {
      resultText = typeof content === "object" ? JSON.stringify(content) : String(content);
    } else {
      resultText = "";
    }
    resultText = resultText.replace(/```json|```/g, "").trim();
    return new Response(JSON.stringify({ result: resultText }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      (globalThis as any).__cf_env =
        (request as any)?.runtime?.cloudflare?.env ?? env;
      const url = new URL(request.url);
      if (url.pathname === "/api/ai/complete") {
        return handleAiComplete(request, env);
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
