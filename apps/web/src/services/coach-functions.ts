import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { chatCompletion, type ChatMessage } from "./ai-gateway.server";
import { getSession } from "@/utils/session";

const SESSION_COOKIE = "fitmentor_session";
const SM_API = "https://api.supermemory.ai";

const Input = z.object({
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
});

function smHeaders() {
  const key = process.env.SUPERMEMORY_API_KEY;
  if (!key) return null;
  return { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

async function smProfile(containerTag: string, q: string) {
  const headers = smHeaders();
  if (!headers) return null;
  const res = await fetch(`${SM_API}/v4/profile`, {
    method: "POST",
    headers,
    body: JSON.stringify({ containerTag, q }),
  });
  if (!res.ok) return null;
  return res.json();
}

async function smAdd(content: string, containerTag: string) {
  const headers = smHeaders();
  if (!headers) return;
  await fetch(`${SM_API}/v3/documents`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, containerTag }),
  });
}

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

    const sid = getCookie(SESSION_COOKIE);
    const session = sid ? await getSession(sid) : null;
    let memoryContext = "";
    if (session?.sub) {
      try {
        const lastMsg = [...data.messages].reverse().find((m) => m.role === "user");
        const result: any = await smProfile(session.sub, lastMsg?.content ?? "");
        if (result) {
          const facts = result.profile?.static?.length
            ? `\n\nWhat I know about you:\n${result.profile.static.join("\n")}`
            : "";
          const memories = result.searchResults?.results?.length
            ? `\n\nFrom your past conversations:\n${result.searchResults.results.slice(0, 4).map((r: any) => r.memory || r.chunk).join("\n")}`
            : "";
          memoryContext = facts + memories;
        }
      } catch {
        // Supermemory unavailable — continue without RAG
      }
    }

    const system = `You are FitMentor, a warm, no-nonsense AI fitness coach for Indian gym beginners and students.
Rules:
- Be concise. Use short paragraphs and bullet points. Never write essays.
- Use simple words. No fitness jargon unless you explain it.
- Suggest affordable Indian foods (dal, eggs, paneer, soya, milk, chicken, rice, roti).
- Default currency: INR. Default units: kg, cm, ml.
- Never recommend extreme diets or unsafe lifts. Suggest seeing a doctor for medical issues.
- Don't push supplements. Whey is optional, not required.
- Always end with one clear next step the user can do today.

${profileBlock}${memoryContext}`;

    const messages: ChatMessage[] = [{ role: "system", content: system }, ...data.messages];
    const reply = await chatCompletion({ messages });

    if (session?.sub) {
      try {
        const lastUserMsg = [...data.messages].reverse().find((m) => m.role === "user");
        await smAdd(`user: ${lastUserMsg?.content}\nassistant: ${reply}`, session.sub);
      } catch {
        // non-critical
      }
    }

    return { reply };
  });
