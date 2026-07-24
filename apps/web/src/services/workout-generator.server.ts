import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { chatCompletion } from "./ai-gateway.server";
import type { WorkoutDay } from "@fitmentor/shared";

const Input = z.object({
  name: z.string().optional(),
  age: z.number().optional(),
  gender: z.string().optional(),
  weightKg: z.number().optional(),
  goal: z.string().optional(),
  place: z.string().optional(),
  experience: z.string().optional(),
  daysPerWeek: z.number().optional(),
  healthConditions: z.array(z.string()).optional(),
});

export const generateWorkoutPlan = createServerFn({ method: "POST" })
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const healthStr = data.healthConditions?.length
      ? `- Health conditions: ${data.healthConditions.join(", ")}`
      : "- No health conditions";

    const system = `You generate JSON workout plans for Indian beginners. Return ONLY valid JSON, no markdown, no explanation.

The user profile:
- Name: ${data.name ?? "User"}, Age: ${data.age ?? "?"}, Gender: ${data.gender ?? "?"}
- Weight: ${data.weightKg ?? "?"} kg
- Goal: ${data.goal ?? "general fitness"}
- Trains at: ${data.place ?? "home"}, ${data.daysPerWeek ?? 3} days/week
- Experience: ${data.experience ?? "beginner"}
${healthStr}

Rules:
1. Generate exactly ${data.daysPerWeek ?? 3} workout days.
2. Each day has 4-6 exercises appropriate for ${data.place === "gym" ? "gym equipment (dumbbells, barbell, cables, machines)" : "home (bodyweight only — push-ups, squats, lunges, planks, etc.)"}
3. Exercises must be safe for beginners — no advanced lifts for inexperienced users.
4. Adapt exercises if the user has health conditions (e.g. no squats for bad knees, use alternatives).
5. Format must be valid JSON array matching this exact TypeScript type:

{
  "title": string,         // e.g. "Push Day" or "Full Body A"
  "focus": string,         // e.g. "Chest • Shoulders • Triceps"
  "exercises": [
    {
      "name": string,      // exercise name
      "sets": number,      // 3-4
      "reps": string,      // e.g. "8-12" or "15"
      "rest": string,      // e.g. "60s" or "90s"
      "muscles": string[], // targeted muscles
      "tips": string,      // one-line form tip
      "alt": string        // optional alternative exercise name
    }
  ]
}

Return ONLY the JSON array, nothing else.`;

    const reply = await chatCompletion({
      messages: [
        { role: "system", content: system },
        { role: "user", content: "Generate my workout plan." },
      ],
    });

    const cleaned = reply.replace(/```json\s*/gi, "").replace(/```\s*$/gm, "").trim();
    const parsed = JSON.parse(cleaned);
    return parsed as WorkoutDay[];
  });
