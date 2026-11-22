import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MobileShell } from "@/components/MobileShell";
import { useProfile } from "@/utils/profile";
import { EXERCISE_LIBRARY, type WorkoutDay } from "@/utils/workouts";
import { saveLog, ensureToday } from "@/utils/habits";
import { syncWorkoutDone } from "@/services/sync";
import { Check, ChevronDown, Clock, Play } from "lucide-react";
import { toast } from "sonner";
import { proxyWorkoutPlan } from "@/services/api-proxy";
import { PageHeader, Pill } from "@/components/editorial";
import { cn } from "@/utils/cn";

export const Route = createFileRoute("/workouts")({
  head: () => ({ meta: [{ title: "Train — FitMentor" }] }),
  component: Workouts,
});

function Workouts() {
  const [tab, setTab] = useState<"plan" | "library">("plan");
  const [plan, setPlan] = useState<WorkoutDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const [workoutDone, setWorkoutDone] = useState(() => ensureToday().workoutDone);
  const { profile } = useProfile();
  const sync = useServerFn(syncWorkoutDone);

  useEffect(() => {
    setFetchError(false);
    if (!profile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    proxyWorkoutPlan()
      .then((data) => {
        const body = data as { data?: { plan?: WorkoutDay[] }; plan?: WorkoutDay[] };
        const plan = body?.data?.plan ?? body?.plan;
        setPlan(Array.isArray(plan) ? plan : []);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [profile]);

  return (
    <MobileShell>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <PageHeader
          label="Train"
          title={
            <>
              The <span className="text-orange">week.</span>
            </>
          }
          description="Built around your equipment, experience, and the days you can actually show up."
          action={
            <Pill>
              <span className="h-1.5 w-1.5 rounded-full bg-orange" />
              {plan.length || "—"} day split
            </Pill>
          }
        />

        <div className="mt-8 inline-flex rounded-full border border-border bg-card p-1">
          {(
            [
              ["plan", "This week"],
              ["library", "Exercise library"],
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

        {tab === "plan" ? (
          <div className="mt-6 space-y-3 pb-4">
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-[1.75rem] border border-border bg-card p-6">
                    <div className="h-3 w-16 rounded bg-muted" />
                    <div className="mt-4 h-6 w-48 rounded bg-muted" />
                    <div className="mt-2 h-3 w-32 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : null}

            {!loading && plan.length === 0 ? (
              <div className="rounded-[1.75rem] border border-border bg-card p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {fetchError
                    ? "Couldn't load your plan. Pull to retry in a moment."
                    : "Your plan will appear here once your profile is saved."}
                </p>
              </div>
            ) : null}

            {!loading &&
              plan.map((day, i) => {
                const open = openIdx === i;
                return (
                  <div
                    key={i}
                    className={cn(
                      "overflow-hidden rounded-[1.75rem] border transition-colors",
                      open ? "border-foreground/25 bg-card" : "border-border bg-card",
                    )}
                  >
                    <button
                      onClick={() => setOpenIdx(open ? null : i)}
                      className="flex w-full items-center gap-5 p-5 text-left sm:p-6"
                    >
                      <span
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-wordmark text-xs",
                          open ? "bg-orange text-ink" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="label-micro text-muted-foreground">Day {i + 1}</p>
                        <p className="mt-1 truncate text-lg font-semibold">{day.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{day.focus}</p>
                      </div>
                      <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                        <Clock className="h-3.5 w-3.5" /> {day.exercises.length} moves
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                          open && "rotate-180",
                        )}
                      />
                    </button>

                    {open ? (
                      <div className="border-t border-border px-5 pb-5 sm:px-6">
                        <div className="divide-y divide-border">
                          {day.exercises.map((ex, j) => (
                            <div key={j} className="flex gap-4 py-4">
                              <span className="label-micro mt-1 w-6 shrink-0 text-orange">
                                {String(j + 1).padStart(2, "0")}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                                  <p className="text-sm font-semibold">{ex.name}</p>
                                  <p className="font-wordmark text-[11px] text-foreground">
                                    {ex.sets} × {ex.reps}
                                  </p>
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {ex.muscles.join(" · ")} · rest {ex.rest}
                                </p>
                                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                                  {ex.tips}
                                </p>
                                {ex.alt ? (
                                  <p className="mt-1 text-xs text-muted-foreground/70">
                                    Swap: {ex.alt}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>

                        {workoutDone ? (
                          <div className="mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-border bg-secondary py-3 text-sm font-semibold text-muted-foreground">
                            <Check className="h-4 w-4 text-orange" /> Session complete
                          </div>
                        ) : (
                          <button
                            className="group mt-2 flex w-full items-center justify-between rounded-full bg-foreground py-2 pl-6 pr-2 text-sm font-semibold text-background"
                            onClick={() => {
                              const log = ensureToday();
                              saveLog({ ...log, workoutDone: true });
                              setWorkoutDone(true);
                              sync({ data: { workoutDone: true } });
                              toast.success("Workout logged");
                            }}
                          >
                            Mark session complete
                            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange text-ink">
                              <Check className="h-4 w-4" />
                            </span>
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 lg:grid-cols-4">
            {EXERCISE_LIBRARY.map((ex, i) => (
              <Link
                key={ex.name}
                to="/exercise/$name"
                params={{ name: ex.name }}
                className="group flex flex-col justify-between rounded-[1.5rem] border border-border bg-card p-5 transition-colors hover:border-foreground/30"
              >
                <div className="flex items-start justify-between">
                  <span className="label-micro text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors group-hover:bg-orange group-hover:text-ink">
                    <Play className="h-3 w-3" />
                  </span>
                </div>
                <div className="mt-8">
                  <p className="text-sm font-semibold leading-tight">{ex.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ex.muscles.slice(0, 2).join(", ")}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </MobileShell>
  );
}
