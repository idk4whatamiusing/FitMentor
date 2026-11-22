import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight, Dumbbell } from "lucide-react";
import { loadProfile, saveProfile, calcTargets, type Profile } from "@/utils/profile";
import { ensureToday, computeStreak, type DailyLog } from "@/utils/habits";
import { generateWorkoutPlan } from "@/utils/workouts";
import { useServerFn } from "@tanstack/react-start";
import { proxyMe } from "@/services/api-proxy";
import { MobileShell } from "@/components/MobileShell";
import { DailyHabits } from "@/components/dashboard/DailyHabits";
import { CoachChat } from "@/components/dashboard/CoachChat";
import { ProfileSummary } from "@/components/dashboard/ProfileSummary";
import { Pill, ProgressBar, SectionLabel, StatBlock } from "@/components/editorial";
import sessionImg from "@/assets/photos/train-ropes.jpg";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Today — FitMentor" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [streak, setStreak] = useState(0);
  const meFn = useServerFn(proxyMe);

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
            window.location.href = "/onboarding";
            return;
          }
        } catch {
          window.location.href = "/onboarding";
          return;
        }
      }
      setProfile(p);
      setLog(ensureToday());
      setStreak(computeStreak());
    };
    init();
    const onChange = () => {
      setProfile(loadProfile());
      setLog(ensureToday());
      setStreak(computeStreak());
    };
    window.addEventListener("fitmentor:logs", onChange);
    window.addEventListener("fitmentor:profile", onChange);
    return () => {
      window.removeEventListener("fitmentor:logs", onChange);
      window.removeEventListener("fitmentor:profile", onChange);
    };
  }, []);

  if (!profile || !log) {
    return (
      <MobileShell>
        <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
          Loading your day…
        </div>
      </MobileShell>
    );
  }

  const t = calcTargets(profile);
  const plan = generateWorkoutPlan(profile);
  const todayIdx = new Date().getDay() % plan.length;
  const todays = plan[todayIdx];
  const firstName = profile.name.trim().split(/\s+/)[0];
  const waterPct = Math.min(100, Math.round((log.water / 8) * 100));
  const proteinPct = Math.min(100, Math.round((log.proteinG / t.protein) * 100));

  return (
    <MobileShell wide>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <SectionLabel index={String(new Date().getDate()).padStart(2, "0")}>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </SectionLabel>
            <h1 className="mt-3 text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-6xl">
              Hey, <span className="text-orange">{firstName}.</span>
            </h1>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              One session, one plate, one glass at a time. Here's where today stands.
            </p>
          </div>
          <Pill className="self-start">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" />
            {streak} day streak
          </Pill>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-3">
          <Link to="/workouts" className="group lg:col-span-2">
            <div className="relative min-h-[300px] overflow-hidden rounded-[2rem] bg-ink text-cream">
              <img
                src={sessionImg}
                alt=""
                className="absolute inset-0 h-full w-full object-cover opacity-45 transition-transform duration-700 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-ink/20" />
              <div className="relative flex h-full min-h-[300px] flex-col justify-between p-7 lg:p-10">
                <div>
                  <Pill tone="orange">Today's session</Pill>
                  <h2 className="mt-5 max-w-md text-3xl font-semibold leading-[0.95] tracking-[-0.03em] lg:text-5xl">
                    {todays.title}
                  </h2>
                  <p className="mt-3 text-sm text-cream/60">
                    {todays.focus} · {todays.exercises.length} moves · ~45 min
                  </p>
                </div>
                <div className="mt-8 flex items-center gap-4">
                  <span className="inline-flex items-center gap-3 rounded-full bg-cream py-2 pl-5 pr-2 text-sm font-semibold text-ink">
                    Start session
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange text-ink">
                      <ArrowUpRight className="h-4 w-4 transition-transform group-hover:rotate-45" />
                    </span>
                  </span>
                  <span className="hidden items-center gap-2 text-xs text-cream/55 sm:flex">
                    <Dumbbell className="h-3.5 w-3.5" />
                    {todays.exercises.length} exercises planned
                  </span>
                </div>
              </div>
            </div>
          </Link>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <StatBlock
              label="Streak"
              value={streak}
              unit="days"
              invert
              hint="Keep the chain alive"
            />
            <StatBlock
              label="Protein"
              value={log.proteinG}
              unit={`/ ${t.protein} g`}
              hint={<ProgressBar value={proteinPct} className="mt-1" />}
            />
            <StatBlock
              label="Calories"
              value={t.calories}
              unit="kcal target"
              hint={`${t.carbs} g carbs · ${t.fat} g fat`}
            />
            <StatBlock
              label="Water"
              value={log.water}
              unit="/ 8 glasses"
              hint={<ProgressBar value={waterPct} tone="ink" className="mt-1" />}
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-1">
            <DailyHabits
              log={log}
              proteinTarget={t.protein}
              onLogChange={() => {
                setLog(ensureToday());
                setStreak(computeStreak());
              }}
            />
            <ProfileSummary profile={profile} />
          </div>
          <div className="lg:col-span-2">
            <CoachChat />
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
