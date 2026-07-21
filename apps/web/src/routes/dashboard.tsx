import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Dumbbell, Apple, TrendingUp, Sparkles, ChevronRight } from "lucide-react";
import { loadProfile, calcTargets, GOAL_LABEL, type Profile } from "@/utils/profile";
import { ensureToday, computeStreak, type DailyLog } from "@/utils/habits";
import { generateWorkoutPlan } from "@/utils/workouts";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DailyHabits } from "@/components/dashboard/DailyHabits";
import { CoachChat } from "@/components/dashboard/CoachChat";
import { ProfileSummary } from "@/components/dashboard/ProfileSummary";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — FitMentor" }] }),
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [log, setLog] = useState<DailyLog | null>(null);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    const p = loadProfile();
    if (!p) {
      navigate({ to: "/onboarding" });
      return;
    }
    setProfile(p);
    setLog(ensureToday());
    setStreak(computeStreak());
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
  }, [navigate]);

  if (!profile || !log) {
    return (
      <DashboardLayout>
        <div className="flex h-[60vh] items-center justify-center text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  const t = calcTargets(profile);
  const plan = generateWorkoutPlan(profile);
  const todayIdx = new Date().getDay() % plan.length;
  const todays = plan[todayIdx];

  return (
    <DashboardLayout profile={profile}>
      {/* Today's session card */}
      <Link to="/workouts" className="mx-5 mt-4 block">
        <div className="relative overflow-hidden rounded-3xl border border-white/10 p-6 shadow-card">
          <div className="absolute inset-0 bg-gradient-hero opacity-95" />
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="flex h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-foreground/80">
                Today's Session
              </p>
            </div>
            <h3 className="mt-2 text-2xl font-bold leading-tight text-primary-foreground">
              {todays.title}
            </h3>
            <p className="mt-1 text-sm text-primary-foreground/80">{todays.focus}</p>
            <div className="mt-5 flex items-center gap-4 text-xs text-primary-foreground/90">
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                <Dumbbell className="h-3.5 w-3.5" /> {todays.exercises.length} moves
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                ⏱ ~45 min
              </span>
              <span className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/20 backdrop-blur">
                <ChevronRight className="h-4 w-4 text-primary-foreground" />
              </span>
            </div>
          </div>
        </div>
      </Link>

      {/* Quick stats */}
      <div className="mx-5 mt-4 grid grid-cols-3 gap-2.5">
        <div className="col-span-1 flex flex-col justify-between rounded-2xl border border-accent/30 bg-card/70 p-3 backdrop-blur-xl">
          <Flame className="h-5 w-5 text-accent" />
          <div>
            <p className="text-2xl font-bold leading-none">{streak}</p>
            <p className="text-[10px] text-muted-foreground">day streak</p>
          </div>
        </div>
        <StatCard label="kcal" value={t.calories} />
        <StatCard label="protein g" value={t.protein} highlight />
      </div>

      {/* Quick actions */}
      <div className="mx-5 mt-6 grid grid-cols-2 gap-3">
        <QuickAction to="/workouts" icon={<Dumbbell className="h-5 w-5" />} label="Workouts" sub="Your plan" />
        <QuickAction to="/nutrition" icon={<Apple className="h-5 w-5" />} label="Nutrition" sub="Meal plans" />
        <QuickAction to="/coach" icon={<Sparkles className="h-5 w-5" />} label="AI Coach" sub="Ask anything" />
        <QuickAction to="/progress" icon={<TrendingUp className="h-5 w-5" />} label="Progress" sub="Your stats" />
      </div>

      {/* Main dashboard grid */}
      <div className="mx-5 mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <DailyHabits
            log={log}
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
    </DashboardLayout>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`flex flex-col justify-between rounded-2xl border p-3 backdrop-blur-xl ${
        highlight ? "border-primary/40 bg-primary/15" : "border-white/10 bg-card/70"
      }`}
    >
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold leading-none ${highlight ? "text-primary" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function QuickAction({ to, icon, label, sub }: { to: string; icon: React.ReactNode; label: string; sub: string }) {
  return (
    <Link
      to={to}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-card/70 p-4 backdrop-blur-xl transition hover:border-primary/40"
    >
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/15 blur-2xl transition group-hover:bg-primary/30" />
      <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-hero text-primary-foreground shadow-glow">
        {icon}
      </div>
      <p className="relative mt-3 text-sm font-semibold">{label}</p>
      <p className="relative text-xs text-muted-foreground">{sub}</p>
    </Link>
  );
}
