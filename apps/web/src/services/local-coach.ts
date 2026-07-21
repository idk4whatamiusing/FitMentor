import type { ChatMessage } from "./ai-gateway.server";

const RESPONSES: { pattern: RegExp; reply: (msg: string) => string }[] = [
  {
    pattern: /protein/i,
    reply: () =>
      `Here's how to hit your protein target on an Indian budget:

**Top affordable sources:**
• **Dal (1 katori)** → 9g protein, ~₹10
• **Eggs (2 whole)** → 12g protein, ~₹8
• **Paneer (100g)** → 18g protein, ~₹30
• **Soya chunks (50g dry)** → 26g protein, ~₹10
• **Chicken breast (100g)** → 31g protein, ~₹40
• **Milk (250ml)** → 8g protein, ~₹10
• **Curd (200g)** → 8g protein, ~₹15
• **Peanut butter (1 tbsp)** → 4g protein, ~₹8

**Sample ₹150/day veg meal:**
- Breakfast: Oats + milk + 2 eggs (₹25)
- Lunch: Dal + 3 rotis + curd (₹40)
- Snack: Roasted chana + banana (₹20)
- Dinner: Paneer bhurji + 2 rotis (₹45)

**Next step:** Add one extra egg or glass of milk to every meal today.`,
  },
  {
    pattern: /missed|skip|break|gap|rest.*day|off.*day/i,
    reply: (msg: string) =>
      `Consistency > perfection. One missed session won't undo your progress.

**What to do:**
• Don't double up tomorrow — just resume your normal routine
• If you missed 3+ days, restart with lighter weights for one session
• Your muscles don't forget that fast — strength comes back in 1-2 sessions
• Sleep well and hydrate today

**Next step:** Show up tomorrow and complete your workout. That's it.`,
  },
  {
    pattern: /weight.*(not|no|stop|gain|plateau|increase)/i,
    reply: (msg: string) =>
      `Not gaining weight? Here's why and how to fix it:

**Most common reasons:**
• You're not eating enough — track calories for 3 days honestly
• Not enough protein — aim for 1.6-2g per kg of bodyweight
• Not sleeping enough — 7-8h is when muscle actually grows
• Training intensity is low — progressive overload is key

**Action plan:**
1. Add 1 extra roti + 1 glass milk to each meal (+~300 kcal)
2. Sleep 30min earlier tonight
3. Increase your main lift weight by 2.5kg next session

**Next step:** Eat one extra meal today. Rice + dal + egg is cheap and effective.`,
  },
  {
    pattern: /whey|supplement|protein.*powder|creatine/i,
    reply: () =>
      `**Supplements: need-to-know**

**Whey protein** (₹1,500-2,500/kg)
• Convenient, not essential
• You can get enough protein from dal, eggs, paneer, chicken
• Only useful if you struggle to hit protein through food

**Creatine** (₹600-1,200/500g)
• Most researched supplement — safe and effective
• Take 3-5g daily, any time
• Helps strength and power output

**Must-know:**
• Food comes first — supplements fill gaps, not replace meals
• No supplement builds muscle — only training + food + sleep does
• Save money: spend ₹2,000 extra on eggs/paneer instead of whey

**Next step:** Review your current diet before buying any supplement.`,
  },
  {
    pattern: /workout.*plan|routine|good|okay|enough|split|ppl/i,
    reply: (msg: string) =>
      `Your current plan works — consistency is what determines results.

**Quick checklist:**
• Are you training each muscle 2x/week? ✅ Good.
• Are you 1-2 reps from failure on most sets? ✅ Good.
• Are you adding weight or reps over time? ✅ Good.
• Are you eating enough to match your goal? ✅ Good.

If all four are YES — your plan is perfect. Keep going.

**If NO:** The issue isn't the plan — it's execution. Focus on:
1. Log your lifts to ensure progression
2. Eat to match your goal (surplus to build, deficit to lose)
3. Sleep 7-8 hours

**Next step:** Do today's scheduled workout with 100% focus. No phone, no distractions.`,
  },
  {
    pattern: /help|advice|tip|suggest|recommend/i,
    reply: () =>
      `Here are 3 quick tips that work for every beginner:

**1. Show up, that's 80%**
• Don't wait for motivation — build discipline
• Even a 20-min workout beats skipping
• Make it a habit: same time, same place, every day

**2. Eat for your goal**
• Muscle gain → eat 300-500 kcal above maintenance
• Fat loss → eat 300-400 kcal below maintenance
• Protein is non-negotiable: 1.6-2g per kg bodyweight

**3. Sleep is when you grow**
• 7-8 hours minimum
• No phone 30 min before bed
• Black out your room

**Next step:** Pick ONE habit to fix this week. Start small.`,
  },
];

function generateFallback(msg: string, _profile: string): string {
  for (const r of RESPONSES) {
    if (r.pattern.test(msg)) return r.reply(msg);
  }
  return `I understand you're asking about "${msg.slice(0, 60)}..."

Here's what I can tell you as your fitness coach:

**General principles that always work:**
• **Consistency > intensity** — do something 5x/week rather than crushing it 2x
• **Progressive overload** — add 1 rep or 0.5kg every session
• **Protein first** — dal, eggs, paneer, chicken, soya — eat them daily
• **Sleep 7-8h** — that's when your body actually changes
• **Water 6-8 glasses/day** — most people are dehydrated

Want me to help with something specific? Try asking about:
• "How much protein do I need?"
• "I missed gym for 3 days"
• "My weight is not increasing"
• "Supplements guide"
• "Is my workout plan good?"

**Next step:** Complete today's scheduled workout. That's the most important thing. 🎯`;
}

export function getLocalResponse(messages: ChatMessage[], profile: string): string {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUserMsg)
    return `Hey! I'm your AI fitness coach. Ask me anything about workouts, nutrition, or progress. 💪`;
  return generateFallback(lastUserMsg.content, profile);
}
