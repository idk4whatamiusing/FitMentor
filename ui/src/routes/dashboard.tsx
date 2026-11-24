import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { loadProfile, saveProfile, calcTargets, type Profile } from "@/utils/profile";
import {
  ensureToday,
  computeStreak,
  last7,
  saveLog,
  type DailyLog,
} from "@/utils/habits";
import { generateWorkoutPlan } from "@/utils/workouts";
import { useServerFn } from "@tanstack/react-start";
import { proxyMe, proxyWorkoutPlan } from "@/services/api-proxy";
import { MobileShell } from "@/components/MobileShell";
import {
  CoachPromptCard,
  FuelCard,
  HomeHeader,
  LoadCard,
  ProgressLink,
  ReadinessCard,
  SleepCard,
  VerdictHero,
} from "@/components/home";
import { computeReadiness } from "@/utils/readiness";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Today — FitMentor" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [streak, setStreak] = useState(0);
  const [week, setWeek] = useState<DailyLog[]>([]);
  const [apiPlan, setApiPlan] = useState<ReturnType<typeof generateWorkoutPlan>>([]);
  const meFn = useServerFn(proxyMe);
  const workoutFn = useServerFn(proxyWorkoutPlan);

  useEffect(() => {
    workoutFn()
      .then((data) => {
        const body = data as {
          data?: { plan?: ReturnType<typeof generateWorkoutPlan> };
          plan?: ReturnType<typeof generateWorkoutPlan>;
        };
        const plan = body?.data?.plan ?? body?.plan;
        if (Array.isArray(plan) && plan.length > 0) setApiPlan(plan);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const init = async () => {
      let p = loadProfile();
      if (!p) {
        try {
          const data = (await meFn()) as { profile?: Profile | null };
          const profile = data?.profile;
          if (profile && profile.name) {
            saveProfile(profile);
            p = profile;
          } else {
            navigate({ to: "/onboarding", replace: true });
            return;
          }
        } catch {
          navigate({ to: "/onboarding", replace: true });
          return;
        }
      }
      setProfile(p);
      setLog(ensureToday());
      setStreak(computeStreak());
      setWeek(last7());
    };
    init();
    const onChange = () => {
      setProfile(loadProfile());
      setLog(ensureToday());
      setStreak(computeStreak());
      setWeek(last7());
    };
    window.addEventListener("fitmentor:logs", onChange);
    window.addEventListener("fitmentor:profile", onChange);
    return () => {
      window.removeEventListener("fitmentor:logs", onChange);
      window.removeEventListener("fitmentor:profile", onChange);
    };
  }, []);

  if (!profile || !log || week.length === 0) {
    return (
      <MobileShell>
        <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
          Loading your day…
        </div>
      </MobileShell>
    );
  }

  const t = calcTargets(profile);
  const plan = apiPlan.length > 0 ? apiPlan : generateWorkoutPlan(profile);
  const todayIdx = new Date().getDay() % plan.length;
  const todays = plan[todayIdx];
  const firstName = profile.name.trim().split(/\s+/)[0];
  const initial = firstName.charAt(0).toUpperCase();

  const yesterday = week[week.length - 2] ?? null;
  const hasYesterday =
    !!yesterday &&
    (yesterday.water > 0 ||
      yesterday.sleep > 0 ||
      yesterday.steps > 0 ||
      yesterday.proteinG > 0 ||
      yesterday.workoutDone);
  const readiness = computeReadiness(log, {
    proteinTarget: t.protein,
    trainedYesterday: hasYesterday && yesterday ? yesterday.workoutDone : null,
  });
  const readinessHistory = week.map((entry, index) => {
    const previous = index > 0 ? week[index - 1] : null;
    const hasPrevious =
      !!previous &&
      (previous.water > 0 ||
        previous.sleep > 0 ||
        previous.steps > 0 ||
        previous.proteinG > 0 ||
        previous.workoutDone);
    return computeReadiness(entry, {
      proteinTarget: t.protein,
      trainedYesterday: hasPrevious && previous ? previous.workoutDone : null,
    }).score;
  });
  const sessions = week.filter((entry) => entry.workoutDone).length;
  const workoutDays = week.map((entry) => entry.workoutDone);
  const sleepHistory = week.map((entry) => entry.sleep);
  const dayLabels = week.map((entry) =>
    new Date(`${entry.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "narrow" }),
  );

  const dateLabel = new Date()
    .toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })
    .toUpperCase();

  function updateLog(patch: Partial<DailyLog>) {
    saveLog({ ...ensureToday(), ...patch });
  }

  return (
    <MobileShell wide>
      <div className="px-5 pb-4 pt-5 lg:px-8 lg:pt-8">
        <div className="mx-auto grid min-w-0 max-w-md gap-3.5 lg:max-w-4xl lg:grid-cols-2 lg:gap-4">
          <div className="min-w-0 lg:col-span-2">
            <HomeHeader date={dateLabel} name={firstName} initial={initial} streak={streak} />
          </div>

          <div className="min-w-0 lg:col-span-2">
            <VerdictHero
              verdict={readiness.verdict}
              title={todays.title}
              focus={`${todays.focus} · ${todays.exercises.length} moves`}
              meta="~45 min"
              done={log.workoutDone}
              sleep={log.sleep}
              protein={log.proteinG}
              water={log.water}
            />
          </div>

          <div className="grid min-w-0 grid-cols-5 gap-3.5 lg:col-span-2">
            <div className="col-span-3 min-w-0">
              <ReadinessCard readiness={readiness} history={readinessHistory} />
            </div>
            <div className="col-span-2 min-w-0">
              <LoadCard
                sessions={sessions}
                target={profile.daysPerWeek}
                days={workoutDays}
              />
            </div>
          </div>

          <FuelCard
            protein={log.proteinG}
            proteinTarget={t.protein}
            water={log.water}
            calories={t.calories}
            onWater={() => updateLog({ water: log.water + 1 })}
            onProtein={() => updateLog({ proteinG: log.proteinG + 20 })}
          />

          <SleepCard hours={log.sleep} history={sleepHistory} labels={dayLabels} />

          <div className="min-w-0 lg:col-span-2">
            <CoachPromptCard />
          </div>

          <div className="min-w-0 lg:col-span-2">
            <ProgressLink />
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
