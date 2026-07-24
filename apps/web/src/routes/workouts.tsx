import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { useProfile } from "@/utils/profile";
import { EXERCISE_LIBRARY, type WorkoutDay } from "@/utils/workouts";
import { saveLog, ensureToday } from "@/utils/habits";
import { Button } from "@/components/ui/button";
import { Check, ChevronRight, Clock, Dumbbell, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/workouts")({
  head: () => ({ meta: [{ title: "Workouts — FitMentor" }] }),
  component: Workouts,
});

function Workouts() {
  const [tab, setTab] = useState<"plan" | "library">("plan");
  const [plan, setPlan] = useState<WorkoutDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const { profile } = useProfile();

  useEffect(() => {
    setFetchError(false);
    if (!profile) { setLoading(false); return; }
    setLoading(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    fetch("/api/workout-plan", {
      method: "POST",
      body: JSON.stringify(profile),
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => setPlan(Array.isArray(json) ? json : json?.data?.plan ?? []))
      .catch(() => setFetchError(true))
      .finally(() => { clearTimeout(timeout); setLoading(false); });
    return () => { controller.abort(); clearTimeout(timeout); };
  }, [profile]);

  return (
    <MobileShell>
      <div className="px-5 pt-14">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Training</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">Your Plan</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Built around your goals.</p>
      </div>

      <div className="mx-5 mt-5 flex rounded-2xl border border-white/10 bg-secondary/40 p-1 backdrop-blur-xl">
        <TabBtn active={tab === "plan"} onClick={() => setTab("plan")}>This week</TabBtn>
        <TabBtn active={tab === "library"} onClick={() => setTab("library")}>Library</TabBtn>
      </div>

      {tab === "plan" && (
        <div className="px-5 py-4 space-y-3">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-card/70 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-primary/20" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-16 rounded bg-primary/10" />
                      <div className="h-4 w-32 rounded bg-primary/10" />
                      <div className="h-3 w-24 rounded bg-primary/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && plan.length === 0 && fetchError && (
            <p className="py-8 text-center text-sm text-muted-foreground">Failed to generate workout plan.</p>
          )}
          {!loading && plan.map((day, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-card/70 backdrop-blur-xl transition hover:border-primary/30">
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-hero text-primary-foreground shadow-glow">
                  <Dumbbell className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Day {i + 1}</p>
                  <p className="font-bold truncate">{day.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{day.focus}</p>
                </div>
                <ChevronRight className={`h-5 w-5 text-muted-foreground transition ${openIdx === i ? "rotate-90" : ""}`} />
              </button>
              {openIdx === i && (
                <div className="border-t border-white/5 p-4 space-y-3">
                  {day.exercises.map((ex, j) => (
                    <div key={j} className="rounded-xl border border-white/5 bg-secondary/40 p-3 backdrop-blur">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{ex.name}</p>
                          <p className="text-xs text-muted-foreground">{ex.muscles.join(" • ")}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono text-sm font-bold text-primary">{ex.sets} × {ex.reps}</p>
                          <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" /> {ex.rest}
                          </p>
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">💡 {ex.tips}</p>
                      {ex.alt && <p className="mt-1 text-xs text-muted-foreground">↔ Alt: {ex.alt}</p>}
                    </div>
                  ))}
                  <Button
                    className="mt-2 w-full bg-gradient-hero text-primary-foreground shadow-glow h-12 text-base font-semibold"
                    onClick={() => {
                      const log = ensureToday();
                      saveLog({ ...log, workoutDone: true });
                      toast.success("Workout logged!");
                    }}
                  >
                    <Check className="mr-2 h-4 w-4" /> Mark complete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "library" && (
        <div className="grid grid-cols-2 gap-3 px-5 py-4">
          {EXERCISE_LIBRARY.map((ex) => (
            <Link
              key={ex.name}
              to="/exercise/$name"
              params={{ name: ex.name }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-card/70 p-3 backdrop-blur-xl transition hover:border-primary/30"
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl transition group-hover:bg-primary/20" />
              <div className="relative">
                <div className="text-3xl">{ex.emoji}</div>
                <p className="mt-2 text-sm font-semibold leading-tight">{ex.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{ex.muscles.slice(0, 2).join(", ")}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </MobileShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${active ? "bg-card text-foreground shadow-card border border-white/10" : "text-muted-foreground"}`}
    >
      {children}
    </button>
  );
}
