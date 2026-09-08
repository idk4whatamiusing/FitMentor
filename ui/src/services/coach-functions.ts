import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { chatCompletion, type ChatMessage } from "./ai-gateway.server";
import { resolveSessionFromToken } from "@/utils/session";
import { getEnv } from "@/utils/env";

const Input = z.object({
  session_id: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(40),
  profile: z
    .object({
      name: z.string().optional(),
      age: z.number().optional(),
      gender: z.string().optional(),
      heightCm: z.number().optional(),
      weightKg: z.number().optional(),
      goal: z.string().optional(),
      place: z.string().optional(),
      experience: z.string().optional(),
      diet: z.string().optional(),
      daysPerWeek: z.number().optional(),
      budgetPerDay: z.number().optional(),
      healthConditions: z.array(z.string()).optional(),
      calories: z.number().optional(),
      protein: z.number().optional(),
    })
    .optional(),
  user_sub: z.string().optional(),
  user_email: z.string().optional(),
});

const apiUrl = () => getEnv("API_URL");

export const askCoach = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const p = data.profile;
    const healthStr = p?.healthConditions?.length
      ? `- Health conditions: ${p.healthConditions.join(", ")}`
      : "";
    const profileBlock = p
      ? `User profile:
- Name: ${p.name ?? "Friend"}
- Age: ${p.age}, Gender: ${p.gender}
- Height: ${p.heightCm} cm, Weight: ${p.weightKg} kg
- Goal: ${p.goal}, Experience: ${p.experience}
- Trains: ${p.place} (${p.daysPerWeek} days/week)
- Diet: ${p.diet}, Food budget: ₹${p.budgetPerDay}/day
${healthStr}
- Daily targets: ${p.calories} kcal, ${p.protein} g protein`
      : "User has not completed onboarding yet.";

    const system = `You are FitMentor, a warm, no-nonsense AI fitness coach for Indian gym beginners and students.
Rules:
- Be concise. Use short paragraphs and bullet points. Never write essays.
- Use simple words. No fitness jargon unless you explain it.
- Suggest affordable Indian foods (dal, eggs, paneer, soya, milk, chicken, rice, roti).
- Default currency: INR. Default units: kg, cm, ml.
- Never recommend extreme diets or unsafe lifts. Suggest seeing a doctor for medical issues.
- Don't push supplements. Whey is optional, not required.
- Always end with one clear next step the user can do today.

${profileBlock}`;

    // Resolve session server-side (cookie-based) as primary source.
    // Frontend useAuth() may be null on first render due to useEffect race.
    let sub = data.user_sub || null;
    let email = data.user_email || null;
    if (!sub) {
      try {
        const raw = getCookie("fitmentor_session");
        if (raw) {
          const sess = await resolveSessionFromToken(raw);
          if (sess) { sub = sess.sub; email = sess.email; }
        }
      } catch {}
    }
    let tier = "free";

    if (sub) {
      try {
        const apiKey = getEnv("API_SHARED_SECRET");
        const subRes = await fetch(`${apiUrl()}/v1/user/subscription`, {
          headers: {
            "X-Api-Key": apiKey ?? "",
            "X-User-Id": sub,
          },
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          const srv = subData?.data?.subscription;
          if (srv?.tier) tier = srv.tier;
        }
      } catch {}
    }

    const messages: ChatMessage[] = [{ role: "system", content: system }, ...data.messages];
    const reply = await chatCompletion({ messages, userId: sub ?? undefined, tier });

    if (sub) {
      const apiKey = getEnv("API_SHARED_SECRET");
      const lastUserMsg = [...data.messages].reverse().find((m) => m.role === "user");
      try {
        const res = await fetch(`${apiUrl()}/v1/coach/log`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": apiKey ?? "",
            "X-User-Id": sub,
            "X-User-Email": email ?? "",
          },
          body: JSON.stringify({
            messages: data.messages,
            user_message: lastUserMsg?.content ?? "",
            reply,
            container_tag: sub,
            session_id: data.session_id || null,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "?");
          console.error("coach log fail:", res.status, text);
        }
      } catch (e: unknown) {
        console.error("coach log error:", e instanceof Error ? e.message : String(e));
      }
    }

    return { reply };
  });

export const generateChatTitle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({ userMessage: z.string().min(1).max(500) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const prompt = data.userMessage.slice(0, 200);
      const raw = await chatCompletion({
        messages: [
          {
            role: "system",
            content:
              "Summarize the user's fitness question in 3-5 words. No punctuation, no quotes, no emojis. Example: 'Protein for muscle gain'",
          },
          { role: "user", content: prompt },
        ],
        tier: "free",
      });
      let title = raw
        .split("\n")[0]
        .replace(/["'.,!?]/g, "")
        .trim()
        .slice(0, 40);
      if (!title) title = prompt.slice(0, 40);
      // Capitalize words
      title = title
        .split(/\s+/)
        .slice(0, 5)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
      return { title };
    } catch {
      const fb = data.userMessage.slice(0, 40).trim();
      return { title: fb || "New Chat" };
    }
  });
