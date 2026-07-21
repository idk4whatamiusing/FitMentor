import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { INDIAN_MEAL_PLANS, COMMON_FOODS } from "@/utils/meals";
import { loadProfile, calcTargets } from "@/utils/profile";
import { saveLog, ensureToday } from "@/utils/habits";
import { loadCustomProteinTarget, saveCustomProteinTarget } from "@/utils/proteinTarget";
import { Plus, Apple, Target, Pencil, Check } from "lucide-react";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";

export const Route = createFileRoute("/nutrition")({
  head: () => ({ meta: [{ title: "Nutrition — FitMentor" }] }),
  component: Nutrition,
});

function Nutrition() {
  const [tab, setTab] = useState<"plans" | "log">("plans");
  const [profile, setProfile] = useState(() => loadProfile());
  const [today, setToday] = useState(() => ensureToday());
  const [customProtein, setCustomProtein] = useState(() => loadCustomProteinTarget());
  const [editingProtein, setEditingProtein] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setToday(ensureToday());
    setCustomProtein(loadCustomProteinTarget());

    const onStorage = () => {
      setCustomProtein(loadCustomProteinTarget());
      setToday(ensureToday());
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("fitmentor:protein-target", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("fitmentor:protein-target", onStorage);
    };
  }, []);

  const targets = profile ? calcTargets(profile) : null;
  const effectiveProtein = customProtein ?? targets?.protein ?? 0;

  const plans = INDIAN_MEAL_PLANS.filter((p) =>
    profile?.diet === "veg" ? p.diet === "veg" : true,
  );

  return (
    <MobileShell>
      <div className="px-5 pt-14">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Fuel</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Nutrition</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Affordable Indian meals built for your goal.</p>
      </div>

      {targets && (
        <div className="relative mx-5 mt-5 overflow-hidden rounded-3xl border border-white/10 p-5 shadow-card">
          <div className="absolute inset-0 bg-gradient-hero opacity-10" />
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/20 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">Your daily target</p>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              <Macro label="kcal" value={targets.calories} />
              <Macro label="P" value={effectiveProtein} highlight editable onEdit={() => setEditingProtein(true)} />
              <Macro label="C" value={targets.carbs} />
              <Macro label="F" value={targets.fat} />
            </div>

            {editingProtein && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-secondary/40 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Protein target</span>
                  <span className="font-mono text-sm text-primary">{effectiveProtein}g</span>
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
                  className="mt-3"
                />
                <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>50g</span>
                  <span>300g</span>
                </div>
                <button
                  onClick={() => setEditingProtein(false)}
                  className="mt-3 w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition active:scale-[0.98]"
                >
                  Done
                </button>
              </div>
            )}

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Protein logged today</span>
                <span className="font-mono">{today.proteinG}g / {effectiveProtein}g</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary/60">
                <div
                  className="h-full rounded-full bg-gradient-hero transition-all"
                  style={{ width: `${Math.min(100, effectiveProtein > 0 ? (today.proteinG / effectiveProtein) * 100 : 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-5 mt-5 flex rounded-2xl border border-white/10 bg-secondary/40 p-1 backdrop-blur-xl">
        <TabBtn active={tab === "plans"} onClick={() => setTab("plans")}>Meal plans</TabBtn>
        <TabBtn active={tab === "log"} onClick={() => setTab("log")}>Quick log</TabBtn>
      </div>

      {tab === "plans" && (
        <div className="space-y-3 px-5 py-4">
          {plans.map((plan) => {
            const totals = plan.meals.reduce(
              (acc, m) => ({ k: acc.k + m.kcal, p: acc.p + m.protein }),
              { k: 0, p: 0 },
            );
            return (
              <div key={plan.id} className="overflow-hidden rounded-2xl border border-white/10 bg-card/70 backdrop-blur-xl">
                <div className="relative overflow-hidden p-4">
                  <div className="absolute inset-0 bg-gradient-hero opacity-10" />
                  <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
                  <div className="relative flex items-center justify-between">
                    <p className="font-bold">{plan.title}</p>
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-mono text-primary backdrop-blur">
                      {totals.k} kcal • {totals.p}g P
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-white/5">
                  {plan.meals.map((m, i) => (
                    <div key={i} className="flex items-start gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.items}</p>
                      </div>
                      <div className="text-right shrink-0 font-mono text-xs text-muted-foreground">
                        <p>{m.kcal} kcal</p>
                        <p className="text-primary">{m.protein}g P</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === "log" && (
        <div className="space-y-2 px-5 py-4">
          <p className="text-xs text-muted-foreground">Tap a food to log it for today.</p>
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
              className="group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-card/70 p-3 backdrop-blur-xl transition hover:border-primary/30"
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl transition group-hover:bg-primary/20" />
              <div className="relative flex-1 text-left">
                <p className="text-sm font-semibold">{f.name}</p>
                <p className="text-xs text-muted-foreground">{f.kcal} kcal • {f.protein}g protein</p>
              </div>
              <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary transition active:scale-90">
                <Plus className="h-4 w-4" />
              </div>
            </button>
          ))}
        </div>
      )}
    </MobileShell>
  );
}

function Macro({ label, value, highlight, editable, onEdit }: { label: string; value: number; highlight?: boolean; editable?: boolean; onEdit?: () => void }) {
  return (
    <div className="relative">
      <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center justify-center gap-0.5">
        {label}
        {editable && onEdit && (
          <button onClick={onEdit} className="ml-0.5 inline-flex items-center rounded p-0.5 transition hover:bg-white/10">
            <Pencil className="h-2.5 w-2.5" />
          </button>
        )}
      </p>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${active ? "bg-card text-foreground shadow-card border border-white/10" : "text-muted-foreground"}`}>{children}</button>
  );
}
