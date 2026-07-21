import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { MobileShell } from "@/components/MobileShell";
import { loadProfile, calcTargets, type Profile } from "@/utils/profile";
import { loadLogs, saveLog, todayKey, last7, type DailyLog } from "@/utils/habits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";
import {
  Scale,
  Moon,
  Footprints,
  HeartPulse,
  Pill,
  CalendarDays,
  Users,
  Plus,
  Send,
  Heart,
  MessageCircle,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/tools")({
  head: () => ({ meta: [{ title: "AI Tools — FitMentor" }] }),
  component: ToolsPage,
});

type ToolTab = "bmi" | "sleep" | "steps" | "injury" | "supplements" | "calories" | "community";

const TOOLS: { id: ToolTab; label: string; icon: typeof Scale }[] = [
  { id: "bmi", label: "BMI", icon: Scale },
  { id: "sleep", label: "Sleep", icon: Moon },
  { id: "steps", label: "Steps", icon: Footprints },
  { id: "injury", label: "Injury", icon: HeartPulse },
  { id: "supplements", label: "Supplements", icon: Pill },
  { id: "calories", label: "Calories", icon: CalendarDays },
  { id: "community", label: "Community", icon: Users },
];

function ToolsPage() {
  const [tab, setTab] = useState<ToolTab>("bmi");

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
      </div>
    </MobileShell>
  );
}

function BMIAnalyzer() {
  const profile = loadProfile();
  const [weight, setWeight] = useState(profile?.weightKg ?? 65);
  const [height, setHeight] = useState(profile?.heightCm ?? 170);

  const hM = height / 100;
  const bmi = weight / (hM * hM);
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
              type="number"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-border/60 bg-background p-3 text-lg font-bold outline-none"
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Height (cm)</p>
            <input
              type="number"
              value={height}
              onChange={(e) => setHeight(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-border/60 bg-background p-3 text-lg font-bold outline-none"
            />
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-background p-4 text-center">
          <p className="text-xs text-muted-foreground">Your BMI</p>
          <p className={cn("text-4xl font-black", color)}>{bmi.toFixed(1)}</p>
          <p className={cn("mt-1 text-sm font-semibold", color)}>{category}</p>
        </div>
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
  const [painArea, setPainArea] = useState("");
  const [advice, setAdvice] = useState<string | null>(null);

  const areas: { id: string; label: string; icon: string; tips: string; swaps: string }[] = [
    {
      id: "knee",
      label: "Knee",
      icon: "🦵",
      tips: "Rest, ice 15min every 2h, avoid deep squats.",
      swaps: "Replace squats with leg press or wall sits. Reduce knee travel.",
    },
    {
      id: "lower_back",
      label: "Lower Back",
      icon: "🔙",
      tips: "Avoid deadlifts. Stretch hamstrings daily. Sleep with a pillow under knees.",
      swaps: "Replace deadlifts with hyperextensions. Use a belt for support.",
    },
    {
      id: "shoulder",
      label: "Shoulder",
      icon: "💪",
      tips: "Avoid overhead pressing. Do external rotations and band pull-aparts.",
      swaps: "Replace OHP with dumbbell incline press. Lateral raises with lighter weight.",
    },
    {
      id: "wrist",
      label: "Wrist",
      icon: "✋",
      tips: "Use straps for pulling. Avoid push-ups on fists. Stretch flexors.",
      swaps: "Use dumbbells instead of barbell. Push-ups on knuckles or stands.",
    },
    {
      id: "ankle",
      label: "Ankle",
      icon: "🦶",
      tips: "RICE protocol. Balance exercises. Avoid running until pain-free.",
      swaps: "Replace lunges with stationary cycling. Use ankle brace.",
    },
    {
      id: "elbow",
      label: "Elbow",
      icon: "💪",
      tips: "Rest from gripping. Stretch forearms. Ice after training.",
      swaps: "Replace chin-ups with lat pulldowns (neutral grip). Use straps.",
    },
  ];

  const selected = areas.find((a) => a.id === painArea);

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <HeartPulse className="h-5 w-5 text-primary" /> Injury Assessment
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Select your pain area for home care + exercise swaps
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {areas.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                setPainArea(a.id);
                setAdvice(null);
              }}
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
        {selected && (
          <div className="mt-4 space-y-3 rounded-xl bg-background p-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Home Care
              </p>
              <p className="mt-1 text-sm">{selected.tips}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Exercise Swaps
              </p>
              <p className="mt-1 text-sm">{selected.swaps}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ If pain persists more than 2 weeks, see a physiotherapist.
            </p>
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

interface Post {
  id: string;
  author: string;
  text: string;
  likes: number;
  replies: { author: string; text: string }[];
  timestamp: number;
  likedBy: string[];
}

const POSTS_KEY = "fitmentor.community.v1";

function loadPosts(): Post[] {
  try {
    return JSON.parse(localStorage.getItem(POSTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function savePosts(posts: Post[]) {
  localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
}

function CommunityFeed() {
  const profile = loadProfile();
  const [posts, setPosts] = useState<Post[]>(loadPosts);
  const [newPost, setNewPost] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const addPost = () => {
    if (!newPost.trim()) return;
    const p: Post = {
      id: Date.now().toString(),
      author: profile?.name ?? "Anonymous",
      text: newPost.trim(),
      likes: 0,
      replies: [],
      timestamp: Date.now(),
      likedBy: [],
    };
    const updated = [p, ...posts];
    setPosts(updated);
    savePosts(updated);
    setNewPost("");
    toast.success("Posted in community!");
  };

  const toggleLike = (postId: string) => {
    const updated = posts.map((p) => {
      if (p.id !== postId) return p;
      const liked = p.likedBy.includes(profile?.name ?? "Anonymous");
      return {
        ...p,
        likes: liked ? p.likes - 1 : p.likes + 1,
        likedBy: liked
          ? p.likedBy.filter((n) => n !== (profile?.name ?? "Anonymous"))
          : [...p.likedBy, profile?.name ?? "Anonymous"],
      };
    });
    setPosts(updated);
    savePosts(updated);
  };

  const addReply = (postId: string) => {
    if (!replyText.trim()) return;
    const updated = posts.map((p) => {
      if (p.id !== postId) return p;
      return {
        ...p,
        replies: [...p.replies, { author: profile?.name ?? "Anonymous", text: replyText.trim() }],
      };
    });
    setPosts(updated);
    savePosts(updated);
    setReplyText("");
    setReplyTo(null);
  };

  return (
    <div className="space-y-5 pt-4">
      <div className="rounded-2xl border border-border/60 bg-card p-5">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users className="h-5 w-5 text-primary" /> Community Feed
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Share your progress, ask questions, motivate others
        </p>
        <div className="mt-4 flex gap-2">
          <Input
            placeholder="Share something with the community..."
            value={newPost}
            onChange={(e) => setNewPost(e.target.value)}
            className="flex-1"
          />
          <Button size="icon" onClick={addPost} disabled={!newPost.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="mt-5 space-y-3">
          {posts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No posts yet. Be the first to share!
            </p>
          )}
          {posts.map((post) => (
            <div key={post.id} className="rounded-xl border border-border/60 bg-background p-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
                    {post.author[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-semibold">{post.author}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(post.timestamp).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm">{post.text}</p>
              <div className="mt-3 flex items-center gap-3">
                <button
                  onClick={() => toggleLike(post.id)}
                  className={cn(
                    "flex items-center gap-1 text-xs transition-colors",
                    post.likedBy.includes(profile?.name ?? "Anonymous")
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Heart
                    className={cn(
                      "h-3.5 w-3.5",
                      post.likedBy.includes(profile?.name ?? "Anonymous") && "fill-primary",
                    )}
                  />
                  {post.likes}
                </button>
                <button
                  onClick={() => setReplyTo(replyTo === post.id ? null : post.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  {post.replies.length}
                </button>
              </div>
              {post.replies.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-border/30 pt-2">
                  {post.replies.map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="mt-0.5 font-semibold">{r.author}:</span>
                      <span className="text-muted-foreground">{r.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {replyTo === post.id && (
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Write a reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && addReply(post.id)}
                  />
                  <Button size="sm" onClick={() => addReply(post.id)} disabled={!replyText.trim()}>
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
