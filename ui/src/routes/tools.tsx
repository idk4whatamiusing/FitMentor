import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { MobileShell } from "@/components/MobileShell";
import { loadProfile, useProfile, calcTargets, type Profile } from "@/utils/profile";
import { useAuth } from "@/utils/auth";
import { loadLogs, saveLog, todayKey, last7, type DailyLog } from "@/utils/habits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import { proxyToolAdvice } from "@/services/api-proxy";
import {
  Scale,
  Moon,
  Footprints,
  HeartPulse,
  Pill,
  CalendarDays,
  Users,
  TrendingUp,
  TrendingDown,
  Shapes,
  Sparkles,
  Loader,
  Dumbbell,
  Bell,
  Search,
  Heart,
  MessageCircle,
  Repeat2,
  MoreHorizontal,
  Send,
  Trash2,
  Flag,
  Ban,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tools")({
  head: () => ({ meta: [{ title: "AI Tools — FitMentor" }] }),
  component: ToolsPage,
});

type ToolTab = "bmi" | "sleep" | "steps" | "injury" | "supplements" | "calories" | "community" | "form";

const TOOLS: { id: ToolTab; label: string; icon: typeof Scale }[] = [
  { id: "bmi", label: "BMI", icon: Scale },
  { id: "sleep", label: "Sleep", icon: Moon },
  { id: "steps", label: "Steps", icon: Footprints },
  { id: "injury", label: "Injury", icon: HeartPulse },
  { id: "supplements", label: "Supplements", icon: Pill },
  { id: "calories", label: "Calories", icon: CalendarDays },
  { id: "community", label: "Community", icon: Users },
  { id: "form", label: "Form", icon: Shapes },
];

function ToolsPage() {
  const [tab, setTab] = useState<ToolTab>("bmi");
  useProfile();

  return (
    <MobileShell>
      <div className="px-4 pt-14 pb-4">
        <h1 className="text-2xl font-bold">AI Tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Smart tools to level up your fitness journey
        </p>
      </div>
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-xl">
        <div className="flex gap-1 overflow-x-auto px-4 pb-2 scrollbar-none">
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                  tab === t.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="px-4 pb-8">
        {tab === "bmi" && <BMIAnalyzer />}
        {tab === "sleep" && <SleepTracker />}
        {tab === "steps" && <StepsTracker />}
        {tab === "injury" && <InjuryAssessment />}
        {tab === "supplements" && <SupplementGuide />}
        {tab === "calories" && <CalorieTimeline />}
        {tab === "community" && <CommunityFeed />}
        {tab === "form" && <FormAnalyzer />}
      </div>
    </MobileShell>
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
  const color =
    bmi < 18.5
      ? "text-blue-400"
      : bmi < 25
        ? "text-green-400"
        : bmi < 30
          ? "text-orange-400"
          : "text-red-400";

  const getAiRecommendations = async () => {
    setLoading(true);
    try {
      const data = await proxyToolAdvice({ data: { path: "/v1/tools/bmi-advice" } });
      const tips = data.tips;
      setAiTips(tips && tips.length > 0 ? tips.join("\n") : "No advice available yet. Generate a plan first.");
    } catch {
      setAiTips("Failed to get AI recommendations. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Scale className="h-5 w-5 text-primary" /> BMI Calculator
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Weight (kg)</p>
            <input
              id="bmi-weight"
              type="number"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 70"
              className="mt-1 w-full rounded-xl border border-border/60 bg-background p-3 text-lg font-bold outline-none"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Height (cm)</p>
            <input
              id="bmi-height"
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="e.g. 175"
              className="mt-1 w-full rounded-xl border border-border/60 bg-background p-3 text-lg font-bold outline-none"
            />
          </div>
        </div>
        {showResult && (
          <div className="mt-4 rounded-xl bg-background p-4 text-center">
            <p className="text-xs text-muted-foreground">Your BMI</p>
            <p className={cn("text-4xl font-black", color)}>{bmi.toFixed(1)}</p>
            <p className={cn("mt-1 text-sm font-semibold", color)}>{category}</p>
          </div>
        )}
        {showResult && (
        <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
          {bmi < 18.5 && (
            <p>
              • You're in the underweight range. Consider a calorie surplus with strength training.
            </p>
          )}
          {bmi >= 18.5 && bmi < 25 && (
            <p>
              • You're in the healthy range. Great work! Focus on body recomposition or maintenance.
            </p>
          )}
          {bmi >= 25 && bmi < 30 && (
            <p>
              • You're in the overweight range. A moderate calorie deficit + regular training can
              help.
            </p>
          )}
          {bmi >= 30 && (
            <p>
              • You're in the obese range. Consult a doctor before starting any intense program.
            </p>
          )}
          <p>
            • BMI doesn't account for muscle mass. Athletes may show higher BMI while being healthy.
          </p>
        </div>
        )}
        {showResult && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 w-full"
            onClick={getAiRecommendations}
            disabled={loading}
          >
            {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Thinking..." : "AI Recommendations"}
          </Button>
        )}
        {aiTips && (
          <div className="mt-3 rounded-xl bg-background p-4 text-sm whitespace-pre-wrap">
            {aiTips}
          </div>
        )}
      </div>
    </div>
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
    const log = { ...today, sleep: sleepVal };
    saveLog(log);
    toast.success("Sleep logged!");
  };

  const avgSleep =
    logs.reduce((s, l) => s + (l.sleep || 0), 0) / logs.filter((l) => l.sleep).length || 0;
  const score = Math.min(100, Math.round((avgSleep / 8) * 100));
  const status =
    avgSleep < 6 ? "Poor" : avgSleep < 7.5 ? "Fair" : avgSleep < 9 ? "Good" : "Excellent";
  const statusColor =
    avgSleep < 6
      ? "text-red-400"
      : avgSleep < 7.5
        ? "text-orange-400"
        : avgSleep < 9
          ? "text-green-400"
          : "text-blue-400";

  const getSleepTips = async () => {
    setLoading(true);
    try {
      const data = await proxyToolAdvice({ data: { path: "/v1/tools/sleep-advice" } });
      const tips = data.tips;
      setAiTips(tips && tips.length > 0 ? tips.join("\n") : "No advice available yet. Generate a plan first.");
    } catch {
      setAiTips("Failed to get AI advice. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Moon className="h-5 w-5 text-primary" /> Sleep Tracker
        </h2>
        <div className="mt-4 rounded-xl bg-background p-4 text-center">
          <p className="text-xs text-muted-foreground">7-Day Recovery Score</p>
          <p className={cn("text-4xl font-black", statusColor)}>{isNaN(score) ? 0 : score}%</p>
          <p className={cn("mt-1 text-sm font-semibold", statusColor)}>{status}</p>
        </div>
        <div className="mt-4">
          <p className="text-sm text-muted-foreground">
            Log tonight's sleep: <strong>{sleepVal}h</strong>
          </p>
          <input
            id="sleep-hours"
            type="range"
            min={0}
            max={12}
            value={sleepVal}
            onChange={(e) => setSleepVal(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
          />
          <Button size="sm" className="mt-2 w-full" onClick={logSleep}>
            Log Sleep
          </Button>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-sm font-semibold">Last 7 days</p>
          <div className="flex items-end gap-1.5">
            {logs.map((l) => {
              const h = l.sleep || 0;
              const pct = Math.min(100, (h / 10) * 100);
              return (
                <div key={l.date} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-lg bg-primary/60 transition-all"
                    style={{ height: `${pct}%`, minHeight: pct > 0 ? 16 : 4 }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(l.date).toLocaleDateString("en-IN", { weekday: "short" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-4 w-full"
          onClick={getSleepTips}
          disabled={loading}
        >
          {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Analyzing..." : "AI Sleep Tips"}
        </Button>
        {aiTips && (
          <div className="mt-3 rounded-xl bg-background p-4 text-sm whitespace-pre-wrap">
            {aiTips}
          </div>
        )}
      </div>
    </div>
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
    if (log.steps >= 10000) toast.success("10k steps milestone! 🎉");
  };

  const goal = 10000;
  const pct = Math.min(100, (stepsVal / goal) * 100);

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Footprints className="h-5 w-5 text-primary" /> Steps Tracker
        </h2>
        <div className="mt-4 rounded-xl bg-background p-4 text-center">
          <p className="text-xs text-muted-foreground">Today's Steps</p>
          <p className="text-4xl font-black">{stepsVal.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground">Goal: {goal.toLocaleString()}</p>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => addSteps(500)}>
            +500
          </Button>
          <Button variant="outline" onClick={() => addSteps(1000)}>
            +1,000
          </Button>
          <Button variant="outline" onClick={() => addSteps(2000)}>
            +2,000
          </Button>
          <Button variant="outline" onClick={() => addSteps(5000)}>
            +5,000
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          💡 Aim for 8,000–10,000 steps daily. Walking after meals helps digestion too.
        </p>
      </div>
    </div>
  );
}

function InjuryAssessment() {
  const { profile } = useProfile();
  const [painArea, setPainArea] = useState("");
  const [description, setDescription] = useState("");
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const areas = [
    { id: "knee", label: "Knee", icon: "🦵" },
    { id: "lower_back", label: "Lower Back", icon: "🔙" },
    { id: "shoulder", label: "Shoulder", icon: "💪" },
    { id: "wrist", label: "Wrist", icon: "✋" },
    { id: "ankle", label: "Ankle", icon: "🦶" },
    { id: "elbow", label: "Elbow", icon: "💪" },
  ];

  const getAIAdvice = async () => {
    if (!painArea) return;
    setLoading(true);
    try {
      const data = await proxyToolAdvice({ data: { path: "/v1/tools/injury-advice" } });
      const tips = data.tips;
      setAdvice(tips && tips.length > 0 ? tips.join("\n") : "No advice available yet. Generate a plan first.");
    } catch {
      setAdvice("Failed to get AI advice. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <HeartPulse className="h-5 w-5 text-primary" /> AI Injury Assessment
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select your pain area, describe how it feels, get personalized advice
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => { setPainArea(a.id); setAdvice(null); }}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition",
                painArea === a.id
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-background hover:border-primary/40",
              )}
            >
              <span className="text-2xl">{a.icon}</span>
              <span className="text-xs font-medium">{a.label}</span>
            </button>
          ))}
        </div>
        {painArea && (
          <>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your pain — when does it hurt? Any swelling? How long?"
              className="mt-4 w-full rounded-xl border border-border/60 bg-background p-3 text-sm outline-none resize-none"
              rows={3}
            />
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={getAIAdvice}
              disabled={loading}
            >
              {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Analyzing..." : "Get AI Advice"}
            </Button>
          </>
        )}
        {advice && (
          <div className="mt-4 rounded-xl bg-background p-4 text-sm whitespace-pre-wrap">
            {advice}
          </div>
        )}
      </div>
    </div>
  );
}

const SUPPLEMENTS = [
  {
    name: "Whey Protein",
    when: "Post-workout / anytime",
    why: "Convenient protein source",
    inr: "₹1,500–2,500/kg",
    natural: "Milk, paneer, curd",
  },
  {
    name: "Creatine",
    when: "Daily (3–5g)",
    why: "Strength & power output",
    inr: "₹600–1,200/500g",
    natural: "Red meat (small amounts)",
  },
  {
    name: "Vitamin D",
    when: "Morning (with food)",
    why: "Bone health, immunity",
    inr: "₹200–500/bottle",
    natural: "Sunlight 15min, eggs",
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
    natural: "Balanced diet",
  },
  {
    name: "Magnesium",
    when: "Before bed",
    why: "Sleep, muscle recovery",
    inr: "₹400–900/bottle",
    natural: "Nuts, seeds, green veggies",
  },
];

function SupplementGuide() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Pill className="h-5 w-5 text-primary" /> Supplement Guide
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Supplements are optional. Food comes first. Here's what actually helps.
        </p>
        <div className="mt-4 space-y-2">
          {SUPPLEMENTS.map((s) => (
            <div key={s.name}>
              <button
                onClick={() => setExpanded(expanded === s.name ? null : s.name)}
                className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background p-3.5 text-left transition hover:border-primary/40"
              >
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.inr}</p>
                </div>
                <span className="text-muted-foreground">{expanded === s.name ? "−" : "+"}</span>
              </button>
              {expanded === s.name && (
                <div className="mt-1 rounded-xl border border-border/30 bg-muted/50 p-3.5 text-sm space-y-2">
                  <p>
                    <span className="font-medium">When:</span> {s.when}
                  </p>
                  <p>
                    <span className="font-medium">Why:</span> {s.why}
                  </p>
                  <p>
                    <span className="font-medium">Natural sources:</span> {s.natural}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    💰 {s.inr} — Always check expiry before buying.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-xl bg-background p-3 text-xs text-muted-foreground">
          💡 Most supplements are unnecessary if your diet is solid. Spend on good food first.
        </p>
      </div>
    </div>
  );
}

function CalorieTimeline() {
  const profile = loadProfile();
  const targets = profile ? calcTargets(profile) : null;
  const [weeks, setWeeks] = useState(12);
  const [dailyDeficit, setDailyDeficit] = useState(400);

  if (!targets) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-5 pt-4 text-center">
        <p className="text-muted-foreground">Complete onboarding to see your calorie timeline.</p>
      </div>
    );
  }

  const weeklyDeficit = dailyDeficit * 7;
  const weeklySurplus = weeklyDeficit;
  const kgPerWeekFat = weeklyDeficit / 7700;
  const kgPerWeekMuscle = weeklySurplus / 5500;
  const totalLoss = (kgPerWeekFat * weeks).toFixed(1);
  const totalGain = (kgPerWeekMuscle * weeks).toFixed(1);
  const projectedWeightLoss = profile ? (profile.weightKg - Number(totalLoss)).toFixed(1) : "—";
  const projectedWeightGain = profile ? (profile.weightKg + Number(totalGain)).toFixed(1) : "—";

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <CalendarDays className="h-5 w-5 text-primary" /> Calorie Timeline
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Project your weight at 4/8/12 weeks</p>
        <div className="mt-4 rounded-xl bg-background p-4">
          <p className="mb-1 text-xs text-muted-foreground">Daily deficit / surplus</p>
          <input
            id="daily-deficit"
            type="range"
            min={100}
            max={800}
            step={50}
            value={dailyDeficit}
            onChange={(e) => setDailyDeficit(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>100</span>
            <span className="font-bold text-foreground">{dailyDeficit} kcal</span>
            <span>800</span>
          </div>
        </div>
        <div className="mt-3 rounded-xl bg-background p-4">
          <p className="mb-1 text-xs text-muted-foreground">Timeline (weeks)</p>
          <input
            id="timeline-weeks"
            type="range"
            min={4}
            max={12}
            step={4}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>4w</span>
            <span className="font-bold text-foreground">{weeks} weeks</span>
            <span>12w</span>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border/60 bg-background p-3.5">
            <div className="flex items-center gap-1.5 text-sm text-red-400">
              <TrendingDown className="h-4 w-4" /> Fat Loss
            </div>
            <p className="mt-1 text-lg font-bold">{totalLoss} kg</p>
            <p className="text-xs text-muted-foreground">Projected: {projectedWeightLoss} kg</p>
          </div>
          <div className="rounded-xl border border-border/60 bg-background p-3.5">
            <div className="flex items-center gap-1.5 text-sm text-green-400">
              <TrendingUp className="h-4 w-4" /> Muscle Gain
            </div>
            <p className="mt-1 text-lg font-bold">{totalGain} kg</p>
            <p className="text-xs text-muted-foreground">Projected: {projectedWeightGain} kg</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          💡 Based on 7,700 kcal ≈ 1 kg fat and 5,500 kcal ≈ 1 kg muscle. Actual results vary.
        </p>
      </div>
    </div>
  );
}

const EXERCISE_LIST = [
  "Squat", "Deadlift", "Bench Press", "Overhead Press", "Barbell Row",
  "Pull-up", "Push-up", "Lunge", "Plank", "Hip Thrust",
  "Bicep Curl", "Tricep Extension", "Lat Pulldown", "Leg Press", "Dumbbell Fly",
];

function FormAnalyzer() {
  const { profile } = useProfile();
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
      setAnalysis(tips && tips.length > 0 ? tips.join("\n") : "No analysis available yet. Generate a plan first.");
    } catch {
      setAnalysis("Failed to analyze. Try again.");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Shapes className="h-5 w-5 text-primary" /> Form Analyzer
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe how you perform an exercise and get AI form tips
        </p>
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-1">Select exercise</p>
          <div className="flex flex-wrap gap-1.5">
            {EXERCISE_LIST.map((e) => (
              <button
                key={e}
                onClick={() => { setExercise(e); setAnalysis(null); }}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium border transition",
                  exercise === e
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/60 text-muted-foreground hover:text-foreground",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
        {exercise && (
          <>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Describe how you do ${exercise} — stance, grip, depth, any pain or discomfort...`}
              className="mt-4 w-full rounded-xl border border-border/60 bg-background p-3 text-sm outline-none resize-none"
              rows={3}
            />
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={analyze}
              disabled={loading}
            >
              {loading ? <Loader className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "Analyzing..." : "Analyze Form"}
            </Button>
          </>
        )}
        {analysis && (
          <div className="mt-4 rounded-xl bg-background p-4 text-sm whitespace-pre-wrap">
            {analysis}
          </div>
        )}
      </div>
    </div>
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
  return {
    id: p.id,
    author: p.author_name || "User",
    userId: p.user_id,
    text: p.body?.text ?? "",
    timestamp: new Date(String(p.created_at ?? "").replace(" ", "T")).getTime(),
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
      toast.success("Posted!");
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
            ? {
                ...p,
                likedByMe: result.toggleLike.liked,
                likes: result.toggleLike.count,
              }
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
        prev.map((p) =>
          p.id === postId ? { ...p, replyCount: p.replyCount + 1 } : p,
        ),
      );
      setReplyText("");
      setReplyTo(null);
      toast.success("Replied!");
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
      toast.success("Reshared!");
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
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Users className="h-5 w-5 text-primary" /> Community
          </h2>
          <button
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) loadNotifications();
            }}
            className="relative rounded-full p-1.5 hover:bg-muted"
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
        </div>

        {showNotifications && (
          <div className="mt-3 rounded-xl border border-border/60 bg-background p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground">
                Notifications
              </p>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 && (
              <p className="py-2 text-center text-xs text-muted-foreground">
                No notifications yet
              </p>
            )}
            {notifications.slice(0, 10).map((n: any) => (
              <div
                key={n.id}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs",
                  !n.read && "bg-primary/5",
                )}
              >
                <span className="text-muted-foreground">
                  {n.type === "like"
                    ? "❤️"
                    : n.type === "reply"
                      ? "💬"
                      : "🔁"}
                </span>
                <span>
                  <span className="font-semibold">
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
        )}

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            placeholder="Search community..."
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
            className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none"
          />
          <Button size="icon" variant="outline" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3">
          <textarea
            placeholder="Share something with the community..."
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            className="w-full resize-none rounded-xl border border-border/60 bg-background p-3 text-sm outline-none"
            rows={2}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={addPost}
              disabled={posting || !newPost.trim()}
            >
              {posting ? (
                <Loader className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {isSearching && (
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Search results for "{searchQuery}"</span>
            <button
              onClick={() => {
                setSearchQuery("");
                setSearchResults([]);
                setIsSearching(false);
              }}
              className="text-primary hover:underline"
            >
              Clear
            </button>
          </div>
        )}

        <div className="mt-5 space-y-3">
          {loading && (
            <div className="py-8 text-center">
              <Loader className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && displayPosts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {isSearching
                ? "No results found"
                : "No posts yet. Be the first to share!"}
            </p>
          )}
          {displayPosts.map((post) => (
            <div
              key={post.id}
              className="rounded-xl border border-border/60 bg-background p-3.5"
            >
              {post.reshareId && (
                <div className="mb-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Repeat2 className="h-3 w-3" />
                  <span>Reshared</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {(post.author[0] ?? "U").toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-semibold">{post.author}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {new Date(post.timestamp).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                </div>
                <div className="relative">
                  <button
                    onClick={() =>
                      setMenuOpen(menuOpen === post.id ? null : post.id)
                    }
                    className="rounded p-1 hover:bg-muted"
                  >
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {menuOpen === post.id && (
                    <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border border-border/60 bg-card p-1 shadow-lg">
                      {post.userId === userId ? (
                        <button
                          onClick={() => deletePost(post.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-red-500 hover:bg-muted"
                        >
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => reportPost(post.id)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted"
                          >
                            <Flag className="h-3 w-3" /> Report
                          </button>
                          <button
                            onClick={() => blockUser(post.userId)}
                            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-muted"
                          >
                            <Ban className="h-3 w-3" /> Block user
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-2 text-sm whitespace-pre-wrap">{post.text}</p>
              <div className="mt-3 flex items-center gap-4">
                <button
                  onClick={() => toggleLike(post.id)}
                  className={cn(
                    "flex items-center gap-1 text-xs transition-colors",
                    post.likedByMe
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Heart
                    className={cn(
                      "h-3.5 w-3.5",
                      post.likedByMe && "fill-primary",
                    )}
                  />
                  {post.likes}
                </button>
                <button
                  onClick={() =>
                    setReplyTo(replyTo === post.id ? null : post.id)
                  }
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {post.replyCount}
                </button>
                <button
                  onClick={() => reshare(post.id)}
                  disabled={resharing === post.id}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  {resharing === post.id ? (
                    <Loader className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Repeat2 className="h-3.5 w-3.5" />
                  )}
                  {post.reshareCount}
                </button>
              </div>
              {replyTo === post.id && (
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Write a reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addReply(post.id);
                    }}
                  />
                  <Button
                    size="sm"
                    onClick={() => addReply(post.id)}
                    disabled={!replyText.trim()}
                  >
                    Reply
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
