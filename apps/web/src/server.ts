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

const API_URL = process.env.API_URL || "https://16-112-225-113.sslip.io";

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

async function handleMealPlan(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    // Try reading from DB first
    if (sub) {
      const res = await callApi(sub, "/v1/meal/today", "GET");
      if (res?.ok) {
        const json = await res.json() as any;
        const plan = json?.data?.plan;
        if (plan) return new Response(JSON.stringify(plan), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    // Fallback: generate with AI
    if (!env?.AI) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { "content-type": "application/json" } });

    const { diet, budgetPerDay, calories, protein, healthConditions } = await request.json();
    const healthStr = healthConditions?.length ? healthConditions.join(", ") : "none";
    const system = `You are a meal planner for Indian beginners. Return a JSON object with a "meals" array (4 items: Breakfast, Lunch, Snack, Dinner). Each meal has name (string), items (string), kcal (number), protein (number). Example: {"meals":[{"name":"Poha","items":"poha, peanuts, onion","kcal":400,"protein":12}]}. Return ONLY the JSON object, no markdown.`;
    const prompt = `Diet: ${diet ?? "mixed"}, budget: ₹${budgetPerDay ?? 150}, target: ${calories ?? 2000} kcal, ${protein ?? 60}g protein, health: ${healthStr}`;

    const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 2048,
    });

    const cleaned = aiText(result).replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const meals = Array.isArray(parsed?.meals) ? parsed.meals : Array.isArray(parsed) ? parsed : [];
    const id = "ai-" + Date.now();
    const plans = [{ id, title: "Today's Plan", budgetPerDay: budgetPerDay ?? 150, diet: diet ?? "mixed", meals }];

    // Save to DB for future visits
    if (sub) {
      callApi(sub, "/v1/meal/today", "PUT", { plan: plans }).catch(() => {});
    }

    return new Response(JSON.stringify(plans), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

async function handleWorkoutPlan(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    // Try reading from DB first
    if (sub) {
      const res = await callApi(sub, "/v1/workout/today", "GET");
      if (res?.ok) {
        const json = await res.json() as any;
        const plan = json?.data?.plan;
        if (plan) return new Response(JSON.stringify(plan), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    // Fallback: generate with AI
    if (!env?.AI) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { "content-type": "application/json" } });

    const { name, age, gender, weightKg, goal, place, experience, daysPerWeek, healthConditions } = await request.json();
    const healthStr = healthConditions?.length ? healthConditions.join(", ") : "none";
    const system = `You are a fitness coach for Indian beginners. Generate a JSON workout plan (${daysPerWeek ?? 3} days). Each day has title, focus, exercises[]. Each exercise has name (string), sets (number), reps (string), rest (string), muscles (string[]), tips (string), alt (string). Return ONLY the JSON array. Be very concise.`;
    const prompt = `Profile: ${name ?? "User"}, age ${age ?? "?"}, ${gender ?? "?"}, ${weightKg ?? "?"}kg, goal: ${goal ?? "fitness"}, ${place ?? "home"}, ${experience ?? "beginner"}, health: ${healthStr}`;

    const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 4096,
    });

    const cleaned = aiText(result).replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    // Save to DB for future visits
    if (sub) {
      callApi(sub, "/v1/workout/today", "PUT", { plan: parsed }).catch(() => {});
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

async function handleInjuryAssessment(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    if (sub) {
      const res = await callApi(sub, "/v1/tools/injury-advice", "GET");
      if (res?.ok) {
        const json = await res.json() as any;
        const plan = json?.data?.plan;
        if (plan) return new Response(JSON.stringify({ advice: typeof plan === "string" ? plan : JSON.stringify(plan) }), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (!env?.AI) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { "content-type": "application/json" } });
    const { area, description, profile } = await request.json();
    const system = `You are a fitness physio assistant. Give personalized injury advice. Be concise, practical, and include exercise alternatives when relevant. Always include a disclaimer to see a doctor for serious injuries.`;
    const prompt = `Pain area: ${area}\nDescription: ${description ?? "N/A"}\nProfile: ${JSON.stringify(profile ?? {})}\n\nProvide: 1) Likely cause 2) Home care tips 3) Exercise swaps 4) When to see a doctor`;
    const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 1024,
    });
    const advice = aiText(result);
    if (sub) callApi(sub, "/v1/tools/injury-advice", "PUT", { plan: advice }).catch(() => {});
    return new Response(JSON.stringify({ advice }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

async function handleBMITips(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    if (sub) {
      const res = await callApi(sub, "/v1/tools/bmi-advice", "GET");
      if (res?.ok) {
        const json = await res.json() as any;
        const plan = json?.data?.plan;
        if (plan) return new Response(JSON.stringify({ tips: typeof plan === "string" ? plan : JSON.stringify(plan) }), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (!env?.AI) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { "content-type": "application/json" } });
    const { bmi, category, profile } = await request.json();
    const system = `You are a fitness and nutrition coach. Give personalized advice based on BMI and the user's goals. Be encouraging, specific, and actionable. Mention both nutrition and training tips.`;
    const prompt = `BMI: ${bmi} (${category})\nGoal: ${profile?.goal ?? "fitness"}\nDiet: ${profile?.diet ?? "mixed"}\nPlace: ${profile?.place ?? "home"}\n\nGive 3-4 specific tips. Use plain text with short paragraphs, one tip per paragraph. No JSON, no markdown.`;
    const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 1024,
    });
    const tips = aiText(result);
    if (sub) callApi(sub, "/v1/tools/bmi-advice", "PUT", { plan: tips }).catch(() => {});
    return new Response(JSON.stringify({ tips }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

async function handleSleepAdvice(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    if (sub) {
      const res = await callApi(sub, "/v1/tools/sleep-advice", "GET");
      if (res?.ok) {
        const json = await res.json() as any;
        const plan = json?.data?.plan;
        if (plan) return new Response(JSON.stringify({ tips: typeof plan === "string" ? plan : JSON.stringify(plan) }), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (!env?.AI) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { "content-type": "application/json" } });
    const { avgSleep, logs } = await request.json();
    const system = `You are a sleep coach. Analyze sleep patterns and give personalized tips to improve sleep quality.`;
    const prompt = `Average sleep: ${avgSleep}h\nLast 7 days: ${JSON.stringify(logs)}\n\nGive 3 specific tips. Plain text with short paragraphs, one tip per paragraph. No JSON, no markdown.`;
    const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 1024,
    });
    const tips = aiText(result);
    if (sub) callApi(sub, "/v1/tools/sleep-advice", "PUT", { plan: tips }).catch(() => {});
    return new Response(JSON.stringify({ tips }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
}

async function handleFormAnalyze(request: Request): Promise<Response> {
  try {
    const env = getCloudflareEnv(request);
    const sub = await getUserSub(request, env);

    if (sub) {
      const res = await callApi(sub, "/v1/tools/form-advice", "GET");
      if (res?.ok) {
        const json = await res.json() as any;
        const plan = json?.data?.plan;
        if (plan) return new Response(JSON.stringify({ analysis: typeof plan === "string" ? plan : JSON.stringify(plan) }), {
          headers: { "content-type": "application/json" },
        });
      }
    }

    if (!env?.AI) return new Response(JSON.stringify({ error: "AI unavailable" }), { status: 500, headers: { "content-type": "application/json" } });
    const { exercise, description, profile } = await request.json();
    const system = `You are an expert strength and conditioning coach. Analyze exercise form descriptions and give specific, actionable corrections. Focus on safety first, then effectiveness.`;
    const prompt = `Exercise: ${exercise}\nHow the user describes their form: ${description ?? "N/A"}\nExperience: ${profile?.experience ?? "beginner"}\n\nProvide: 1) Common mistakes for this exercise 2) Specific form cues 3) Setup tips 4) Warning signs of bad form. Return as JSON with keys: mistakes (array), cues (array), setup (string), warnings (array).`;
    const result = await env.AI.run("@cf/meta/llama-4-scout-17b-16e-instruct", {
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: 1024,
    });
    const analysis = aiText(result);
    if (sub) callApi(sub, "/v1/tools/form-advice", "PUT", { plan: analysis }).catch(() => {});
    return new Response(JSON.stringify({ analysis }), {
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }
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
      if (url.pathname === "/api/tools/injury" && request.method === "POST") {
        return await handleInjuryAssessment(request);
      }
      if (url.pathname === "/api/tools/bmi-advice" && request.method === "POST") {
        return await handleBMITips(request);
      }
      if (url.pathname === "/api/tools/sleep-advice" && request.method === "POST") {
        return await handleSleepAdvice(request);
      }
      if (url.pathname === "/api/tools/form-analyze" && request.method === "POST") {
        return await handleFormAnalyze(request);
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
