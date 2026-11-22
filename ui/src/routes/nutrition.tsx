import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { COMMON_FOODS } from "@/utils/meals";
import { useProfile, calcTargets } from "@/utils/profile";
import { saveLog, ensureToday } from "@/utils/habits";
import { loadCustomProteinTarget, saveCustomProteinTarget } from "@/utils/proteinTarget";
import { Check, Pencil, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";
import type { MealPlan } from "@fitmentor/shared";
import { proxyMealPlan } from "@/services/api-proxy";
import { MediaCard, PageHeader, Pill, ProgressBar, SectionLabel } from "@/components/editorial";
import { cn } from "@/utils/cn";
import fuelImg from "@/assets/photos/fuel-thali.jpg";

export const Route = createFileRoute("/nutrition")({
  head: () => ({ meta: [{ title: "Fuel — FitMentor" }] }),
  component: Nutrition,
});

function Nutrition() {
  const [tab, setTab] = useState<"plans" | "log">("plans");
  const { profile } = useProfile();
  const [today, setToday] = useState(() => ensureToday());
  const [customProtein, setCustomProtein] = useState(() => loadCustomProteinTarget());
  const [editingProtein, setEditingProtein] = useState(false);
  const [aiPlans, setAiPlans] = useState<MealPlan[] | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [planAttempted, setPlanAttempted] = useState(false);

  useEffect(() => {
    setToday(ensureToday());
    setCustomProtein(loadCustomProteinTarget());

    const onStorage = () => {
      setCustomProtein(loadCustomProteinTarget());
      setToday(ensureToday());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("fitmentor:protein-target", onStorage);
    window.addEventListener("fitmentor:logs", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("fitmentor:protein-target", onStorage);
      window.removeEventListener("fitmentor:logs", onStorage);
    };
  }, []);

  const targets = profile ? calcTargets(profile) : null;
  const effectiveProtein = customProtein ?? targets?.protein ?? 0;

  const loadAI = useCallback(async () => {
    if (!profile || !targets) return;
    setPlanAttempted(true);
    setLoadingPlan(true);
    try {
      const data = (await proxyMealPlan()) as { data?: { plan?: unknown }; plan?: unknown };
      const raw = data?.data?.plan ?? data?.plan;
      const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (arr.length > 0) setAiPlans(arr as MealPlan[]);
    } catch (e) {
      console.error("AI meal plan failed:", e);
    }
    setLoadingPlan(false);
  }, [profile, targets]);

  useEffect(() => {
    if (profile && targets && !planAttempted && !loadingPlan) loadAI();
  }, [profile, targets, planAttempted, loadingPlan]);

  const plans = aiPlans ?? [];
  const proteinPct =
    effectiveProtein > 0 ? Math.min(100, (today.proteinG / effectiveProtein) * 100) : 0;

  return (
    <MobileShell>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <PageHeader
          label="Fuel"
          title={
            <>
              Eat for <span className="text-orange">the work.</span>
            </>
          }
          description="Indian food, your budget, and a protein target that actually fits the day."
          action={
            <Pill>
              <Sparkles className="h-3 w-3 text-orange" />
              AI meal plan
            </Pill>
          }
        />

        {targets ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <div className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
              <div className="flex items-center justify-between">
                <SectionLabel>Daily targets</SectionLabel>
                <button
                  onClick={() => setEditingProtein((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                >
                  <Pencil className="h-3 w-3" /> Protein
                </button>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {[
                  { label: "Calories", value: targets.calories, unit: "kcal" },
                  { label: "Protein", value: effectiveProtein, unit: "g", highlight: true },
                  { label: "Carbs", value: targets.carbs, unit: "g" },
                  { label: "Fat", value: targets.fat, unit: "g" },
                ].map((macro) => (
                  <div key={macro.label}>
                    <p className="label-micro text-muted-foreground">{macro.label}</p>
                    <p
                      className={cn(
                        "mt-2 text-4xl font-medium tabular-nums tracking-tight",
                        macro.highlight && "text-orange",
                      )}
                    >
                      {macro.value}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">
                        {macro.unit}
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              {editingProtein ? (
                <div className="mt-7 rounded-2xl border border-border bg-background p-5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">Custom protein target</span>
                    <span className="font-wordmark text-[11px] text-orange">
                      {effectiveProtein} g
                    </span>
                  </div>
                  <Slider
                    value={[effectiveProtein]}
                    min={50}
                    max={300}
                    step={5}
                    onValueChange={([v]) => {
                      setCustomProtein(v);
                      saveCustomProteinTarget(v);
                    }}
                    className="mt-4"
                  />
                  <div className="mt-3 flex justify-between text-[10px] text-muted-foreground">
                    <span>50 g</span>
                    <span>300 g</span>
                  </div>
                  <button
                    onClick={() => setEditingProtein(false)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
                  >
                    <Check className="h-3 w-3 text-orange" /> Done
                  </button>
                </div>
              ) : (
                <div className="mt-7 border-t border-border pt-5">
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>Protein logged today</span>
                    <span className="tabular-nums">
                      {today.proteinG} / {effectiveProtein} g
                    </span>
                  </div>
                  <ProgressBar value={proteinPct} className="mt-3" />
                </div>
              )}
            </div>

            <MediaCard src={fuelImg} alt="Indian meal spread" className="hidden min-h-[260px] lg:block">
              <Pill tone="orange">Today's plate</Pill>
              <p className="mt-3 text-xl font-semibold">Dal, paneer, roti.</p>
              <p className="mt-1 text-xs text-cream/70">Macros counted. No imports required.</p>
            </MediaCard>
          </div>
        ) : null}

        <div className="mt-8 inline-flex rounded-full border border-border bg-card p-1">
          {(
            [
              ["plans", "Meal plans"],
              ["log", "Quick log"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full px-5 py-2 text-xs font-semibold uppercase tracking-[0.1em] transition-colors",
                tab === key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "plans" ? (
          <div className="mt-6 space-y-4 pb-4">
            {loadingPlan ? (
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-3 text-xs font-semibold text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 animate-pulse text-orange" />
                Generating your plan…
              </div>
            ) : null}

            {!loadingPlan && plans.length === 0 ? (
              <div className="rounded-[1.75rem] border border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {planAttempted
                    ? "Couldn't load your meal plan. Try again in a moment."
                    : "Set up your profile to get a meal plan."}
                </p>
              </div>
            ) : null}

            {plans.map((plan, planIdx) => {
              const totals = plan.meals.reduce(
                (acc, m) => ({ k: acc.k + m.kcal, p: acc.p + m.protein }),
                { k: 0, p: 0 },
              );
              return (
                <div
                  key={plan.id}
                  className="overflow-hidden rounded-[1.75rem] border border-border bg-card"
                >
                  <div className="flex flex-col justify-between gap-3 border-b border-border p-5 sm:flex-row sm:items-center sm:p-6">
                    <div>
                      <SectionLabel index={String(planIdx + 1).padStart(2, "0")}>
                        Meal plan
                      </SectionLabel>
                      <p className="mt-2 text-xl font-semibold">{plan.title}</p>
                    </div>
                    <Pill>
                      {totals.k} kcal · {totals.p} g protein
                    </Pill>
                  </div>
                  <div className="divide-y divide-border">
                    {plan.meals.map((m, i) => (
                      <div key={i} className="flex gap-4 p-5 sm:p-6">
                        <span className="label-micro mt-1 w-6 shrink-0 text-muted-foreground">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{m.name}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {m.items}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs tabular-nums">
                          <p>{m.kcal} kcal</p>
                          <p className="mt-1 text-orange">{m.protein} g P</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 pb-4">
            <p className="text-sm text-muted-foreground">Tap a food to log it for today.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {COMMON_FOODS.map((f) => (
                <button
                  key={f.name}
                  onClick={() => {
                    const log = ensureToday();
                    const cap = effectiveProtein > 0 ? effectiveProtein : Infinity;
                    if (log.proteinG >= cap) {
                      toast.warning("Daily protein target reached", {
                        description: `You're already at ${log.proteinG}g / ${cap}g.`,
                      });
                      return;
                    }
                    const room = cap - log.proteinG;
                    const added = Math.min(f.protein, room);
                    const next = { ...log, proteinG: log.proteinG + added };
                    saveLog(next);
                    setToday(next);
                    if (added < f.protein) {
                      toast.success(`Logged ${added}g protein (capped at target)`);
                    } else {
                      toast.success(`+${added}g protein logged`);
                    }
                  }}
                  className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-foreground/25"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{f.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.kcal} kcal · {f.protein} g protein
                    </p>
                  </div>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:bg-orange group-hover:text-ink">
                    <Plus className="h-4 w-4" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
