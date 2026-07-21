import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { last7, ensureToday, saveLog, computeStreak, type DailyLog } from "@/utils/habits";
import { loadProfile, calcTargets, GOAL_LABEL } from "@/utils/profile";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Flame, TrendingUp, Weight, Crosshair, FileText } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "Progress — FitMentor" }] }),
  component: ProgressPage,
});

function exportPDF(logs: DailyLog[], streak: number, profile: ReturnType<typeof loadProfile>) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210;
  let y = 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("FitMentor AI — Progress Report", pageW / 2, y, { align: "center" });
  y += 10;

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    `Generated: ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}`,
    pageW / 2,
    y,
    { align: "center" },
  );
  y += 10;

  if (profile) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Profile Summary", 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Name: ${profile.name}`, 20, y);
    y += 5;
    doc.text(
      `Age: ${profile.age}  |  Height: ${profile.heightCm} cm  |  Weight: ${profile.weightKg} kg`,
      20,
      y,
    );
    y += 5;
    doc.text(
      `Goal: ${GOAL_LABEL[profile.goal]}  |  Diet: ${profile.diet}  |  Days/Week: ${profile.daysPerWeek}`,
      20,
      y,
    );
    y += 8;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("7-Day Summary", 20, y);
  y += 6;

  const headers = ["Date", "Water", "Sleep", "Steps", "Protein", "Workout"];
  const colW = [28, 20, 20, 22, 22, 22];

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  let x = 20;
  headers.forEach((h, i) => {
    doc.text(h, x, y);
    x += colW[i];
  });
  y += 4;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  logs.forEach((l) => {
    x = 20;
    const vals = [
      new Date(l.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      `${l.water} glasses`,
      `${l.sleep}h`,
      l.steps.toString(),
      `${l.proteinG}g`,
      l.workoutDone ? "Yes" : "No",
    ];
    vals.forEach((v, i) => {
      doc.text(v, x, y);
      x += colW[i];
    });
    y += 4;
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
  });

  y += 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `Streak: ${streak} days  |  Workouts this week: ${logs.filter((l) => l.workoutDone).length}`,
    20,
    y,
  );
  y += 8;

  if (profile) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Health Report", 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Current Weight: ${profile.weightKg} kg`, 20, y);
    y += 5;
    const avgProtein =
      logs.filter((l) => l.proteinG).reduce((s, l) => s + l.proteinG, 0) /
      Math.max(1, logs.filter((l) => l.proteinG).length);
    doc.text(`Avg Daily Protein: ${avgProtein.toFixed(0)}g`, 20, y);
    y += 5;
    const avgSleep =
      logs.filter((l) => l.sleep).reduce((s, l) => s + l.sleep, 0) /
      Math.max(1, logs.filter((l) => l.sleep).length);
    doc.text(`Avg Sleep: ${avgSleep.toFixed(1)}h`, 20, y);
    y += 5;
    const totalWater = logs.reduce((s, l) => s + l.water, 0);
    doc.text(`Total Water (7d): ${totalWater} glasses`, 20, y);
    y += 8;
    doc.text("Stay consistent! Every small step counts. 💪", pageW / 2, y, { align: "center" });
  }

  doc.save("FitMentor_Progress_Report.pdf");
  toast.success("PDF downloaded!");
}

function ProgressPage() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [streak, setStreak] = useState(0);
  const [weight, setWeight] = useState("");
  const profile = loadProfile();

  useEffect(() => {
    setLogs(last7());
    setStreak(computeStreak());
  }, []);

  const targets = profile ? calcTargets(profile) : null;
  const weightSeries = logs.map((l) => ({ d: l.date.slice(5), w: l.weightKg ?? null }));
  const proteinSeries = logs.map((l) => ({ d: l.date.slice(5), p: l.proteinG }));

  const logToday = () => {
    const log = ensureToday();
    saveLog({ ...log, weightKg: Number(weight) });
    setLogs(last7());
    setWeight("");
  };

  return (
    <MobileShell>
      <div className="px-5 pt-14">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Tracking
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Progress</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Last 7 days at a glance.</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportPDF(logs, streak, profile)}
            className="flex items-center gap-1.5"
          >
            <FileText className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <div className="mx-5 mt-5 grid grid-cols-2 gap-3">
        <div className="relative overflow-hidden rounded-2xl border border-accent/30 bg-card/70 p-4 backdrop-blur-xl">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent/10 blur-2xl" />
          <Flame className="relative h-5 w-5 text-accent" />
          <p className="relative mt-2 text-2xl font-bold leading-none">{streak}</p>
          <p className="relative mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Day streak
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-card/70 p-4 backdrop-blur-xl">
          <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/10 blur-2xl" />
          <TrendingUp className="relative h-5 w-5 text-primary" />
          <p className="relative mt-2 text-2xl font-bold leading-none">
            {logs.filter((l) => l.workoutDone).length}
          </p>
          <p className="relative mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
            Workouts this week
          </p>
        </div>
      </div>

      <div className="relative mx-5 mt-5 overflow-hidden rounded-2xl border border-white/10 bg-card/70 p-4 backdrop-blur-xl">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex items-center gap-2">
          <Weight className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">Weight</p>
        </div>
        <p className="relative mt-0.5 text-xs text-muted-foreground">Log it daily, same time.</p>
        <div className="relative mt-3 flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            placeholder={profile ? `${profile.weightKg} kg` : "kg"}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="bg-secondary/40 border-white/10"
          />
          <Button
            onClick={logToday}
            disabled={!weight}
            className="bg-gradient-hero text-primary-foreground shadow-glow px-6"
          >
            Log
          </Button>
        </div>
        <div className="relative mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weightSeries}>
              <XAxis dataKey="d" fontSize={10} stroke="oklch(0.7 0.02 250)" />
              <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="w"
                stroke="oklch(0.86 0.22 135)"
                strokeWidth={2}
                dot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="relative mx-5 mt-4 overflow-hidden rounded-2xl border border-white/10 bg-card/70 p-4 backdrop-blur-xl">
        <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-accent" />
          <p className="text-sm font-semibold">Protein intake</p>
        </div>
        {targets && (
          <p className="relative mt-0.5 text-xs text-muted-foreground">
            Target: {targets.protein}g/day
          </p>
        )}
        <div className="relative mt-3 h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={proteinSeries}>
              <XAxis dataKey="d" fontSize={10} stroke="oklch(0.7 0.02 250)" />
              <YAxis hide />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="p" fill="oklch(0.62 0.22 275)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </MobileShell>
  );
}
