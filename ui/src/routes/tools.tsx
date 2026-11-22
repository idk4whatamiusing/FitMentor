import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { MobileShell } from "@/components/MobileShell";
import { loadProfile, useProfile, calcTargets } from "@/utils/profile";
import { useAuth } from "@/utils/auth";
import { loadLogs, saveLog, todayKey, last7, type DailyLog } from "@/utils/habits";
import { cn } from "@/utils/cn";
import { proxyToolAdvice } from "@/services/api-proxy";
import {
  Ban,
  Bell,
  CalendarDays,
  Flag,
  Footprints,
  Heart,
  HeartPulse,
  Loader,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Pill,
  Repeat2,
  Scale,
  Search,
  Send,
  Shapes,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Pill as EditorialPill, ProgressBar, SectionLabel } from "@/components/editorial";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/tools")({
  head: () => ({ meta: [{ title: "Tools — FitMentor" }] }),
  component: ToolsPage,
});

type ToolTab =
  | "bmi"
  | "sleep"
  | "steps"
  | "injury"
  | "supplements"
  | "calories"
  | "community"
  | "form";

const TOOLS: { id: ToolTab; label: string; icon: typeof Scale }[] = [
  { id: "bmi", label: "BMI", icon: Scale },
  { id: "sleep", label: "Sleep", icon: Moon },
  { id: "steps", label: "Steps", icon: Footprints },
  { id: "injury", label: "Injury", icon: HeartPulse },
  { id: "supplements", label: "Supplements", icon: Pill },
  { id: "calories", label: "Calories", icon: CalendarDays },
  { id: "form", label: "Form", icon: Shapes },
  { id: "community", label: "Community", icon: Users },
];

function ToolsPage() {
  const [tab, setTab] = useState<ToolTab>("bmi");
  useProfile();

  return (
    <MobileShell wide>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <PageHeader
          label="Tools"
          title={
            <>
              Check the <span className="text-orange">numbers.</span>
            </>
          }
          description="Fast calculators, recovery checks, and the community — all in one place."
          action={<EditorialPill>{TOOLS.length} tools</EditorialPill>}
        />

        <div className="mt-8 flex gap-2 overflow-x-auto pb-2 lg:hidden">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors",
                  tab === t.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 grid gap-6 pb-6 lg:grid-cols-[0.3fr_0.7fr]">
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-1 rounded-[1.75rem] border border-border bg-card p-3">
              {TOOLS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition-colors",
                      tab === t.id
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4", tab === t.id ? "text-orange" : "")} />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0">
            {tab === "bmi" && <BMIAnalyzer />}
            {tab === "sleep" && <SleepTracker />}
            {tab === "steps" && <StepsTracker />}
            {tab === "injury" && <InjuryAssessment />}
            {tab === "supplements" && <SupplementGuide />}
            {tab === "calories" && <CalorieTimeline />}
            {tab === "community" && <CommunityFeed />}
            {tab === "form" && <FormAnalyzer />}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}

function ToolShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
      <SectionLabel index={eyebrow}>{title}</SectionLabel>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{title}</h2>
      {description ? (
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      <div className="mt-7">{children}</div>
    </section>
  );
}

function AdviceBox({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="mt-4 whitespace-pre-wrap rounded-2xl border border-border bg-background p-5 text-sm leading-relaxed">
      {text}
    </div>
  );
}

function AIButton({
  loading,
  onClick,
  children,
}: {
  loading: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button variant="outline" className="mt-4" onClick={onClick} disabled={loading}>
      {loading ? <Loader className="animate-spin" /> : <Sparkles className="text-orange" />}
      {loading ? "Thinking…" : children}
    </Button>
  );
}

function BigNumber({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="border-t border-border pt-4">
      <p className="label-micro text-muted-foreground">{label}</p>
      <p className="mt-2 text-4xl font-medium tabular-nums tracking-tight">
        {value}
        {unit ? <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </p>
    </div>
  );
}

function BMIAnalyzer() {
  const { profile } = useProfile();
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [aiTips, setAiTips] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) {
      setWeight(String(profile.weightKg));
      setHeight(String(profile.heightCm));
    }
  }, [profile]);

  const hM = Number(height) / 100;
  const bmi = Number(weight) / (hM * hM);
  const showResult = weight && height && Number(weight) > 0 && Number(height) > 0;
  const category =
    bmi < 18.5 ? "Underweight" : bmi < 25 ? "Normal" : bmi < 30 ? "Overweight" : "Obese";

  const getAiRecommendations = async () => {
    setLoading(true);
    try {
      const data = await proxyToolAdvice({ data: { path: "/v1/tools/bmi-advice" } });
      const tips = data.tips;
      setAiTips(
        tips && tips.length > 0 ? tips.join("\n") : "No advice available yet. Generate a plan first.",
      );
    } catch {
      setAiTips("Failed to get AI recommendations. Try again.");
    }
    setLoading(false);
  };

  return (
    <ToolShell
      eyebrow="01"
      title="BMI analyzer"
      description="Body mass index is a rough screen, not a verdict. Use it with the mirror and the bar."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block">
          <span className="label-micro text-muted-foreground">Weight</span>
          <span className="mt-2 flex items-end gap-2 border-b-2 border-border pb-2 focus-within:border-orange">
            <input
              id="bmi-weight"
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="70"
              className="w-full bg-transparent text-3xl font-medium tabular-nums outline-none"
            />
            <span className="pb-1 text-xs text-muted-foreground">kg</span>
          </span>
        </label>
        <label className="block">
          <span className="label-micro text-muted-foreground">Height</span>
          <span className="mt-2 flex items-end gap-2 border-b-2 border-border pb-2 focus-within:border-orange">
            <input
              id="bmi-height"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="175"
              className="w-full bg-transparent text-3xl font-medium tabular-nums outline-none"
            />
            <span className="pb-1 text-xs text-muted-foreground">cm</span>
          </span>
        </label>
      </div>

      {showResult ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-[0.5fr_0.5fr]">
          <BigNumber label="Your BMI" value={bmi.toFixed(1)} />
          <div className="border-t border-border pt-4">
            <p className="label-micro text-muted-foreground">Category</p>
            <p className="mt-2 text-2xl font-medium text-orange">{category}</p>
          </div>
          <div className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">
            {bmi < 18.5
              ? "Underweight range. A calorie surplus with strength training is the usual path."
              : bmi < 25
                ? "Healthy range. Focus on recomposition or maintenance."
                : bmi < 30
                  ? "Overweight range. A moderate deficit plus regular training helps."
                  : "Obese range. Talk to a doctor before starting an intense program."}
            <span className="mt-2 block text-xs">
              BMI doesn't account for muscle mass. Athletes can read high and still be healthy.
            </span>
          </div>
        </div>
      ) : null}

      {showResult ? (
        <AIButton loading={loading} onClick={getAiRecommendations}>
          AI recommendations
        </AIButton>
      ) : null}
      <AdviceBox text={aiTips} />
    </ToolShell>
  );
}

function SleepTracker() {
  const logs = last7();
  const today = (loadLogs()[todayKey()] ?? {
    date: todayKey(),
    water: 0,
    sleep: 0,
    steps: 0,
    proteinG: 0,
    workoutDone: false,
  }) as DailyLog;
  const [sleepVal, setSleepVal] = useState(today.sleep || 7);
  const [aiTips, setAiTips] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const logSleep = () => {
    saveLog({ ...today, sleep: sleepVal });
    toast.success("Sleep logged");
  };

  const avgSleep =
    logs.reduce((s, l) => s + (l.sleep || 0), 0) / logs.filter((l) => l.sleep).length || 0;
  const score = Math.min(100, Math.round((avgSleep / 8) * 100));
  const status = avgSleep < 6 ? "Poor" : avgSleep < 7.5 ? "Fair" : avgSleep < 9 ? "Good" : "Excellent";

  const getSleepTips = async () => {
    setLoading(true);
    try {
      const data = await proxyToolAdvice({ data: { path: "/v1/tools/sleep-advice" } });
      const tips = data.tips;
      setAiTips(
        tips && tips.length > 0 ? tips.join("\n") : "No advice available yet. Generate a plan first.",
      );
    } catch {
      setAiTips("Failed to get AI advice. Try again.");
    }
    setLoading(false);
  };

  return (
    <ToolShell
      eyebrow="02"
      title="Sleep tracker"
      description="Recovery is training. Seven nights tell you more than one good one."
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <BigNumber label="Recovery score" value={`${isNaN(score) ? 0 : score}%`} />
        <BigNumber label="Average" value={avgSleep.toFixed(1)} unit="h" />
        <div className="border-t border-border pt-4">
          <p className="label-micro text-muted-foreground">Status</p>
          <p className="mt-2 text-2xl font-medium text-orange">{status}</p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-background p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Tonight's sleep</p>
          <p className="text-2xl font-medium tabular-nums">
            {sleepVal}
            <span className="ml-1 text-xs text-muted-foreground">h</span>
          </p>
        </div>
        <input
          id="sleep-hours"
          type="range"
          min={0}
          max={12}
          value={sleepVal}
          onChange={(e) => setSleepVal(Number(e.target.value))}
          className="mt-4 w-full accent-orange"
        />
        <button
          onClick={logSleep}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-xs font-semibold text-background"
        >
          Log sleep
        </button>
      </div>

      <div className="mt-8">
        <p className="label-micro text-muted-foreground">Last 7 days</p>
        <div className="mt-4 flex h-32 items-end gap-2">
          {logs.map((l) => {
            const h = l.sleep || 0;
            const pct = Math.min(100, (h / 10) * 100);
            return (
              <div key={l.date} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-md bg-orange/80"
                  style={{ height: `${pct}%`, minHeight: pct > 0 ? 8 : 2 }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {new Date(l.date).toLocaleDateString("en-IN", { weekday: "short" })}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <AIButton loading={loading} onClick={getSleepTips}>
        AI sleep tips
      </AIButton>
      <AdviceBox text={aiTips} />
    </ToolShell>
  );
}

function StepsTracker() {
  const today = (loadLogs()[todayKey()] ?? {
    date: todayKey(),
    water: 0,
    sleep: 0,
    steps: 0,
    proteinG: 0,
    workoutDone: false,
  }) as DailyLog;
  const [stepsVal, setStepsVal] = useState(today.steps || 0);

  const addSteps = (amount: number) => {
    const log = { ...today, steps: Math.min(50000, today.steps + amount) };
    saveLog(log);
    setStepsVal(log.steps);
    if (log.steps >= 10000) toast.success("10k steps milestone");
  };

  const goal = 10000;
  const pct = Math.min(100, (stepsVal / goal) * 100);

  return (
    <ToolShell
      eyebrow="03"
      title="Steps"
      description="Walking is the cheapest conditioning you have. Ten thousand is a target, not a law."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <BigNumber label="Today" value={stepsVal.toLocaleString()} unit="steps" />
        <div className="border-t border-border pt-4">
          <div className="flex items-baseline justify-between">
            <p className="label-micro text-muted-foreground">Goal</p>
            <p className="text-xs tabular-nums text-muted-foreground">10,000</p>
          </div>
          <ProgressBar value={pct} className="mt-3" />
        </div>
      </div>
      <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[500, 1000, 2000, 5000].map((n) => (
          <button
            key={n}
            onClick={() => addSteps(n)}
            className="rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:border-foreground/30"
          >
            +{n.toLocaleString()}
          </button>
        ))}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Walk after meals when you can. It helps digestion and stacks up faster than one long walk.
      </p>
    </ToolShell>
  );
}

const INJURY_AREAS = [
  { id: "knee", label: "Knee" },
  { id: "lower_back", label: "Lower back" },
  { id: "shoulder", label: "Shoulder" },
  { id: "wrist", label: "Wrist" },
  { id: "ankle", label: "Ankle" },
  { id: "elbow", label: "Elbow" },
];

function InjuryAssessment() {
  useProfile();
  const [painArea, setPainArea] = useState("");
  const [description, setDescription] = useState("");
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const getAIAdvice = async () => {
    if (!painArea) return;
    setLoading(true);
    try {
      const data = await proxyToolAdvice({ data: { path: "/v1/tools/injury-advice" } });
      const tips = data.tips;
      setAdvice(
        tips && tips.length > 0 ? tips.join("\n") : "No advice available yet. Generate a plan first.",
      );
    } catch {
      setAdvice("Failed to get AI advice. Try again.");
    }
    setLoading(false);
  };

  return (
    <ToolShell
      eyebrow="04"
      title="Injury check"
      description="This is guidance, not a diagnosis. Sharp pain, swelling, or numbness means a doctor."
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {INJURY_AREAS.map((a) => (
          <button
            key={a.id}
            onClick={() => {
              setPainArea(a.id);
              setAdvice(null);
            }}
            className={cn(
              "rounded-2xl border p-4 text-left text-sm font-medium transition-colors",
              painArea === a.id
                ? "border-orange bg-orange/10"
                : "border-border hover:border-foreground/25",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {painArea ? (
        <>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When does it hurt? Any swelling? How long has it been like this?"
            className="mt-4 w-full resize-none rounded-2xl border border-border bg-background p-4 text-sm outline-none focus:border-orange"
            rows={3}
          />
          <AIButton loading={loading} onClick={getAIAdvice}>
            Get AI advice
          </AIButton>
        </>
      ) : null}
      <AdviceBox text={advice} />
    </ToolShell>
  );
}

const SUPPLEMENTS = [
  {
    name: "Whey protein",
    when: "Post-workout / anytime",
    why: "Convenient protein source",
    inr: "₹1,500–2,500/kg",
    natural: "Milk, paneer, curd",
  },
  {
    name: "Creatine",
    when: "Daily (3–5 g)",
    why: "Strength and power output",
    inr: "₹600–1,200/500g",
    natural: "Red meat (small amounts)",
  },
  {
    name: "Vitamin D",
    when: "Morning, with food",
    why: "Bone health, immunity",
    inr: "₹200–500/bottle",
    natural: "Sunlight, eggs",
  },
  {
    name: "Omega-3",
    when: "With meals",
    why: "Joint health, inflammation",
    inr: "₹500–1,200/bottle",
    natural: "Fish, flax seeds, walnuts",
  },
  {
    name: "Multivitamin",
    when: "After breakfast",
    why: "General health coverage",
    inr: "₹300–800/bottle",
    natural: "A balanced diet",
  },
  {
    name: "Magnesium",
    when: "Before bed",
    why: "Sleep, muscle recovery",
    inr: "₹400–900/bottle",
    natural: "Nuts, seeds, greens",
  },
];

function SupplementGuide() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <ToolShell
      eyebrow="05"
      title="Supplements"
      description="Optional, not required. Food first, always. Here's what actually has evidence."
    >
      <div className="divide-y divide-border border-y border-border">
        {SUPPLEMENTS.map((s, i) => {
          const open = expanded === s.name;
          return (
            <div key={s.name}>
              <button
                onClick={() => setExpanded(open ? null : s.name)}
                className="flex w-full items-center gap-4 py-4 text-left"
              >
                <span className="label-micro w-6 shrink-0 text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.inr}</p>
                </div>
                <span className="text-xl font-light text-muted-foreground">{open ? "−" : "+"}</span>
              </button>
              {open ? (
                <div className="space-y-2 pb-5 pl-10 text-sm leading-relaxed text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">When:</span> {s.when}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Why:</span> {s.why}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Natural sources:</span>{" "}
                    {s.natural}
                  </p>
                  <p className="text-xs">Check the expiry before buying. Skip anything unsealed.</p>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Most supplements are unnecessary when the diet is solid. Spend on good food first.
      </p>
    </ToolShell>
  );
}

function CalorieTimeline() {
  const profile = loadProfile();
  const targets = profile ? calcTargets(profile) : null;
  const [weeks, setWeeks] = useState(12);
  const [dailyDeficit, setDailyDeficit] = useState(400);

  if (!targets || !profile) {
    return (
      <ToolShell eyebrow="06" title="Calorie timeline">
        <p className="text-sm text-muted-foreground">
          Complete onboarding to see your calorie timeline.
        </p>
      </ToolShell>
    );
  }

  const weeklyDeficit = dailyDeficit * 7;
  const kgPerWeekFat = weeklyDeficit / 7700;
  const kgPerWeekMuscle = weeklyDeficit / 5500;
  const totalLoss = (kgPerWeekFat * weeks).toFixed(1);
  const totalGain = (kgPerWeekMuscle * weeks).toFixed(1);
  const projectedWeightLoss = (profile.weightKg - Number(totalLoss)).toFixed(1);
  const projectedWeightGain = (profile.weightKg + Number(totalGain)).toFixed(1);

  return (
    <ToolShell
      eyebrow="06"
      title="Calorie timeline"
      description="A projection, not a promise. Sleep, steps, and consistency move these lines."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Daily deficit / surplus</p>
            <p className="text-lg font-medium tabular-nums text-orange">{dailyDeficit}</p>
          </div>
          <input
            id="daily-deficit"
            type="range"
            min={100}
            max={800}
            step={50}
            value={dailyDeficit}
            onChange={(e) => setDailyDeficit(Number(e.target.value))}
            className="mt-4 w-full accent-orange"
          />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>100</span>
            <span>800 kcal</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-background p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Timeline</p>
            <p className="text-lg font-medium tabular-nums text-orange">{weeks} wk</p>
          </div>
          <input
            id="timeline-weeks"
            type="range"
            min={4}
            max={12}
            step={4}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="mt-4 w-full accent-orange"
          />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>4 weeks</span>
            <span>12 weeks</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl bg-ink p-5 text-cream">
          <TrendingDown className="h-4 w-4 text-orange" />
          <p className="mt-4 text-3xl font-medium tabular-nums">{totalLoss} kg</p>
          <p className="mt-1 text-xs text-cream/60">Fat loss projection</p>
          <p className="mt-4 text-xs text-cream/45">Weight: {projectedWeightLoss} kg</p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-5">
          <TrendingUp className="h-4 w-4 text-orange" />
          <p className="mt-4 text-3xl font-medium tabular-nums">{totalGain} kg</p>
          <p className="mt-1 text-xs text-muted-foreground">Muscle gain projection</p>
          <p className="mt-4 text-xs text-muted-foreground">Weight: {projectedWeightGain} kg</p>
        </div>
      </div>
      <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
        Based on 7,700 kcal ≈ 1 kg fat and 5,500 kcal ≈ 1 kg muscle. Actual results vary.
      </p>
    </ToolShell>
  );
}

const EXERCISE_LIST = [
  "Squat",
  "Deadlift",
  "Bench Press",
  "Overhead Press",
  "Barbell Row",
  "Pull-up",
  "Push-up",
  "Lunge",
  "Plank",
  "Hip Thrust",
  "Bicep Curl",
  "Tricep Extension",
  "Lat Pulldown",
  "Leg Press",
  "Dumbbell Fly",
];

function FormAnalyzer() {
  useProfile();
  const [exercise, setExercise] = useState("");
  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!exercise) return;
    setLoading(true);
    try {
      const data = await proxyToolAdvice({ data: { path: "/v1/tools/form-advice" } });
      const tips = data.tips;
      setAnalysis(
        tips && tips.length > 0 ? tips.join("\n") : "No analysis available yet. Generate a plan first.",
      );
    } catch {
      setAnalysis("Failed to analyze. Try again.");
    }
    setLoading(false);
  };

  return (
    <ToolShell
      eyebrow="07"
      title="Form check"
      description="Describe the lift the way you'd explain it to a friend. Specifics get better answers."
    >
      <p className="label-micro text-muted-foreground">Exercise</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXERCISE_LIST.map((e) => (
          <button
            key={e}
            onClick={() => {
              setExercise(e);
              setAnalysis(null);
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
              exercise === e
                ? "border-orange bg-orange/10 text-orange"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {e}
          </button>
        ))}
      </div>

      {exercise ? (
        <>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={`How do you perform the ${exercise.toLowerCase()}? Stance, grip, depth, pain…`}
            className="mt-5 w-full resize-none rounded-2xl border border-border bg-background p-4 text-sm outline-none focus:border-orange"
            rows={3}
          />
          <AIButton loading={loading} onClick={analyze}>
            Analyze form
          </AIButton>
        </>
      ) : null}
      <AdviceBox text={analysis} />
    </ToolShell>
  );
}

type CommunityPostView = {
  id: string;
  author: string;
  userId: string;
  text: string;
  timestamp: number;
  likedByMe: boolean;
  likes: number;
  replyCount: number;
  reshareCount: number;
  reshareId: string | null;
  parentId: string | null;
};

function toCommunityView(p: any): CommunityPostView {
  const raw = String(p.created_at ?? "");
  const normalized = raw.replace(" ", "T").replace(/\+00$/, "+00:00");
  const parsed = new Date(normalized).getTime();
  return {
    id: p.id,
    author: p.author_name || "User",
    userId: p.user_id,
    text: p.body?.text ?? "",
    timestamp: Number.isNaN(parsed) ? Date.now() : parsed,
    likedByMe: !!p.liked_by_me,
    likes: p.like_count ?? 0,
    replyCount: p.reply_count ?? 0,
    reshareCount: p.reshare_count ?? 0,
    reshareId: p.reshare_id ?? null,
    parentId: p.parent_id ?? null,
  };
}

function CommunityFeed() {
  const { user } = useAuth();
  const userId = user?.sub ?? "";
  const [posts, setPosts] = useState<CommunityPostView[]>([]);
  const [newPost, setNewPost] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CommunityPostView[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [resharing, setResharing] = useState<string | null>(null);

  const loadFeed = useCallback(async () => {
    try {
      setLoading(true);
      const { community } = await import("@/utils/community");
      const data = await community.feed(undefined, 30);
      setPosts(data.feed.map(toCommunityView));
    } catch {
      // Silently keep the previous feed on transient errors.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  const loadNotifications = async () => {
    try {
      const { community } = await import("@/utils/community");
      const [notifData, countData] = await Promise.all([
        community.notifications(20),
        community.unreadNotificationCount(),
      ]);
      setNotifications(notifData.notifications);
      setUnreadCount(countData.unreadNotificationCount);
    } catch {
      // ignore
    }
  };

  const addPost = async () => {
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      const { community } = await import("@/utils/community");
      const result = await community.createPost(newPost.trim(), []);
      setPosts((prev) => [toCommunityView(result.createPost), ...prev]);
      setNewPost("");
      toast.success("Posted");
    } catch {
      toast.error("Failed to post");
    }
    setPosting(false);
  };

  const toggleLike = async (postId: string) => {
    try {
      const { community } = await import("@/utils/community");
      const result = await community.toggleLike(postId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, likedByMe: result.toggleLike.liked, likes: result.toggleLike.count }
            : p,
        ),
      );
    } catch {
      // ignore
    }
  };

  const addReply = async (postId: string) => {
    if (!replyText.trim()) return;
    try {
      const { community } = await import("@/utils/community");
      await community.replyToPost(postId, replyText.trim(), []);
      setPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p)),
      );
      setReplyText("");
      setReplyTo(null);
      toast.success("Replied");
    } catch {
      toast.error("Failed to reply");
    }
  };

  const reshare = async (postId: string) => {
    setResharing(postId);
    try {
      const { community } = await import("@/utils/community");
      const result = await community.resharePost(postId);
      setPosts((prev) => [toCommunityView(result.resharePost), ...prev]);
      toast.success("Reshared");
    } catch {
      toast.error("Failed to reshare");
    }
    setResharing(null);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const { community } = await import("@/utils/community");
      const data = await community.search(searchQuery.trim());
      setSearchResults(data.search.map(toCommunityView));
    } catch {
      setSearchResults([]);
    }
  };

  const deletePost = async (postId: string) => {
    try {
      const { community } = await import("@/utils/community");
      await community.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      toast.success("Deleted");
    } catch {
      toast.error("Failed to delete");
    }
    setMenuOpen(null);
  };

  const reportPost = async (postId: string) => {
    try {
      const { community } = await import("@/utils/community");
      await community.reportPost(postId, "Reported by user");
      toast.success("Reported");
    } catch {
      toast.error("Failed to report");
    }
    setMenuOpen(null);
  };

  const blockUser = async (blockedId: string) => {
    try {
      const { community } = await import("@/utils/community");
      await community.blockUser(blockedId);
      setPosts((prev) => prev.filter((p) => p.userId !== blockedId));
      toast.success("User blocked");
    } catch {
      toast.error("Failed to block");
    }
    setMenuOpen(null);
  };

  const markAllRead = async () => {
    try {
      const { community } = await import("@/utils/community");
      await community.markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // ignore
    }
  };

  const displayPosts = isSearching ? searchResults : posts;

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <SectionLabel index="08">Community</SectionLabel>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
              The floor.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Wins, questions, and the days nobody feels like training.
            </p>
          </div>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) loadNotifications();
            }}
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange px-1 text-[9px] font-bold text-ink">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : null}
          </button>
        </div>

        {showNotifications ? (
          <div className="mt-5 rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between">
              <p className="label-micro text-muted-foreground">Notifications</p>
              {unreadCount > 0 ? (
                <button onClick={markAllRead} className="text-[10px] text-orange hover:underline">
                  Mark all read
                </button>
              ) : null}
            </div>
            {notifications.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">Nothing yet.</p>
            ) : null}
            <div className="mt-2 space-y-1">
              {notifications.slice(0, 10).map((n: any) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
                    !n.read && "bg-orange/5",
                  )}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary">
                    {n.type === "like" ? (
                      <Heart className="h-3 w-3 text-orange" />
                    ) : n.type === "reply" ? (
                      <MessageCircle className="h-3 w-3 text-orange" />
                    ) : (
                      <Repeat2 className="h-3 w-3 text-orange" />
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {String(n.actor_id ?? "").split(":").pop()}
                    </span>{" "}
                    {n.type === "like"
                      ? "liked your post"
                      : n.type === "reply"
                        ? "replied to your post"
                        : "reshared your post"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-full border border-border bg-background px-4">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search the community…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setSearchResults([]);
                  setIsSearching(false);
                }
              }}
              className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <button
            onClick={handleSearch}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background"
            aria-label="Search"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-border bg-background p-4">
          <p className="label-micro text-muted-foreground">New post</p>
          <textarea
            placeholder="What happened today?"
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            className="mt-2 w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            rows={3}
          />
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-[10px] text-muted-foreground">Keep it useful or keep it kind.</span>
            <button
              onClick={addPost}
              disabled={posting || !newPost.trim()}
              className="inline-flex items-center gap-2 rounded-full bg-foreground py-1.5 pl-4 pr-2 text-xs font-semibold text-background disabled:opacity-40"
            >
              {posting ? <Loader className="h-3.5 w-3.5 animate-spin" /> : "Post"}
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange text-ink">
                <Send className="h-3 w-3" />
              </span>
            </button>
          </div>
        </div>

        {isSearching ? (
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Results for "{searchQuery}"</span>
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setIsSearching(false);
              }}
              className="text-orange hover:underline"
            >
              Clear
            </button>
          </div>
        ) : null}

        <div className="mt-5 space-y-3">
          {loading ? (
            <div className="py-10 text-center">
              <Loader className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : null}
          {!loading && displayPosts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {isSearching ? "No results." : "No posts yet. Be the first."}
            </p>
          ) : null}

          {displayPosts.map((post) => (
            <article key={post.id} className="rounded-2xl border border-border bg-background p-5">
              {post.reshareId ? (
                <div className="mb-3 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <Repeat2 className="h-3 w-3" /> Reshared
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange font-wordmark text-[10px] text-ink">
                    {(post.author[0] ?? "U").toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{post.author}</p>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {new Date(post.timestamp).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                </div>
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen(menuOpen === post.id ? null : post.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
                    aria-label="Post menu"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {menuOpen === post.id ? (
                    <div className="absolute right-0 top-9 z-20 w-40 rounded-2xl border border-border bg-card p-1 shadow-card">
                      {post.userId === userId ? (
                        <button
                          onClick={() => deletePost(post.id)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-destructive hover:bg-secondary"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => reportPost(post.id)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs hover:bg-secondary"
                          >
                            <Flag className="h-3 w-3" /> Report
                          </button>
                          <button
                            onClick={() => blockUser(post.userId)}
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs hover:bg-secondary"
                          >
                            <Ban className="h-3 w-3" /> Block user
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed">{post.text}</p>

              <div className="mt-5 flex items-center gap-5 border-t border-border pt-4">
                <button
                  onClick={() => toggleLike(post.id)}
                  className={cn(
                    "flex items-center gap-1.5 text-xs transition-colors",
                    post.likedByMe
                      ? "text-orange"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Heart className={cn("h-4 w-4", post.likedByMe && "fill-orange")} />
                  {post.likes}
                </button>
                <button
                  onClick={() => setReplyTo(replyTo === post.id ? null : post.id)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-4 w-4" />
                  {post.replyCount}
                </button>
                <button
                  onClick={() => reshare(post.id)}
                  disabled={resharing === post.id}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  {resharing === post.id ? (
                    <Loader className="h-4 w-4 animate-spin" />
                  ) : (
                    <Repeat2 className="h-4 w-4" />
                  )}
                  {post.reshareCount}
                </button>
              </div>

              {replyTo === post.id ? (
                <div className="mt-3 flex gap-2">
                  <input
                    placeholder="Write a reply…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-xs outline-none focus:border-orange"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addReply(post.id);
                    }}
                  />
                  <button
                    onClick={() => addReply(post.id)}
                    disabled={!replyText.trim()}
                    className="rounded-full bg-foreground px-4 text-xs font-semibold text-background disabled:opacity-40"
                  >
                    Reply
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
