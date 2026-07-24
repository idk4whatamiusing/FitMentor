import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { chatCompletion } from "./ai-gateway.server";
import type { MealPlan } from "@fitmentor/shared";

const Input = z.object({
  diet: z.string().optional(),
  budgetPerDay: z.number().optional(),
  calories: z.number().optional(),
  protein: z.number().optional(),
  healthConditions: z.array(z.string()).optional(),
});

export const generateMealPlan = createServerFn({ method: "POST" })
  .validator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const healthStr = data.healthConditions?.length
      ? `- Health conditions: ${data.healthConditions.join(", ")}`
      : "- No health conditions";

    const system = `You generate JSON meal plans for Indian beginners. Return ONLY valid JSON, no markdown, no explanation.

User profile:
- Diet: ${data.diet ?? "mixed"}
- Budget: ₹${data.budgetPerDay ?? 150}/day
- Target: ${data.calories ?? 2000} kcal, ${data.protein ?? 60}g protein
${healthStr}

Rules:
1. Generate exactly 1 meal plan with 4 meals (Breakfast, Lunch, Snack, Dinner).
2. All meals must use affordable Indian ingredients available at local kirana stores.
3. Total kcal must be close to ${data.calories ?? 2000}. Total protein close to ${data.protein ?? 60}g.
4. If diet is veg, no eggs or meat. If nonveg, include eggs/chicken/fish where appropriate.
5. Keep total cost under ₹${data.budgetPerDay ?? 150}.
6. Adapt for health conditions (e.g. low salt for BP, avoid sugar for diabetes).
7. Return a single JSON object matching this type (NOT an array):

{
  "id": string,
  "title": string,         // e.g. "Veg Plan • ₹150/day"
  "budgetPerDay": number,
  "diet": "veg" | "nonveg",
  "meals": [
    {
      "name": string,      // e.g. "Breakfast"
      "items": string,     // e.g. "Oats 60g + milk + banana"
      "kcal": number,
      "protein": number
    }
  ]
}

Return ONLY the JSON object, nothing else.`;

    const reply = await Promise.race([
      chatCompletion({
        messages: [
          { role: "system", content: system },
          { role: "user", content: "Generate my meal plan." },
        ],
      }),
      new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("AI timed out after 25s")), 25000),
      ),
    ]);

    const cleaned = reply.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const plans = Array.isArray(parsed) ? parsed : [parsed];
    return plans as MealPlan[];
  });
