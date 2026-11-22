import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/MobileShell";
import { last7, ensureToday, saveLog, computeStreak, type DailyLog } from "@/utils/habits";
import { loadProfile, useProfile, calcTargets, GOAL_LABEL } from "@/utils/profile";
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
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { PageHeader, PrimaryButton, SectionLabel, StatBlock } from "@/components/editorial";

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
  doc.text("FitMentor — Progress Report", pageW / 2, y, { align: "center" });
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
    doc.text("Profile summary", 20, y);
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
  doc.text("7-day summary", 20, y);
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
    doc.text("Health report", 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Current weight: ${profile.weightKg} kg`, 20, y);
    y += 5;
    const avgProtein =
      logs.filter((l) => l.proteinG).reduce((s, l) => s + l.proteinG, 0) /
      Math.max(1, logs.filter((l) => l.proteinG).length);
    doc.text(`Average daily protein: ${avgProtein.toFixed(0)}g`, 20, y);
    y += 5;
    const avgSleep =
      logs.filter((l) => l.sleep).reduce((s, l) => s + l.sleep, 0) /
      Math.max(1, logs.filter((l) => l.sleep).length);
    doc.text(`Average sleep: ${avgSleep.toFixed(1)}h`, 20, y);
    y += 5;
    const totalWater = logs.reduce((s, l) => s + l.water, 0);
    doc.text(`Total water (7d): ${totalWater} glasses`, 20, y);
    y += 8;
    doc.text("Stay consistent. Every small step counts.", pageW / 2, y, { align: "center" });
  }

  doc.save("FitMentor_Progress_Report.pdf");
  toast.success("PDF downloaded");
}

function ProgressPage() {
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [streak, setStreak] = useState(0);
  const [weight, setWeight] = useState("");
  const { profile } = useProfile();

  useEffect(() => {
    setLogs(last7());
    setStreak(computeStreak());
  }, []);

  const targets = profile ? calcTargets(profile) : null;
  const weightSeries = logs.map((l) => ({ d: l.date.slice(5), w: l.weightKg ?? null }));
  const proteinSeries = logs.map((l) => ({ d: l.date.slice(5), p: l.proteinG }));
  const workouts = logs.filter((l) => l.workoutDone).length;
  const avgProtein = Math.round(
    logs.reduce((s, l) => s + l.proteinG, 0) / Math.max(1, logs.filter((l) => l.proteinG).length) ||
      0,
  );
  const avgSleep = (
    logs.reduce((s, l) => s + l.sleep, 0) / Math.max(1, logs.filter((l) => l.sleep).length) || 0
  ).toFixed(1);

  const logToday = () => {
    const log = ensureToday();
    saveLog({ ...log, weightKg: Number(weight) });
    setLogs(last7());
    setWeight("");
    toast.success("Weight logged");
  };

  return (
    <MobileShell wide>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <PageHeader
          label="Progress"
          title={
            <>
              See the <span className="text-orange">line.</span>
            </>
          }
          description="Seven days at a glance. Log the same things at the same time and the trend does the talking."
          action={
            <button
              onClick={() => exportPDF(logs, streak, profile)}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <FileText className="h-3.5 w-3.5" /> Export PDF
            </button>
          }
        />

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatBlock label="Streak" value={streak} unit="days" invert />
          <StatBlock label="Workouts" value={workouts} unit="this week" />
          <StatBlock label="Avg protein" value={avgProtein} unit="g / day" />
          <StatBlock label="Avg sleep" value={avgSleep} unit="h / night" />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <SectionLabel index="01">Weight</SectionLabel>
                <p className="mt-2 text-sm text-muted-foreground">
                  Log it daily, same time, same conditions.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder={profile ? `${profile.weightKg}` : "kg"}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  className="h-10 w-24 rounded-full border border-border bg-background px-4 text-sm tabular-nums outline-none focus:border-orange"
                />
                <button
                  onClick={logToday}
                  disabled={!weight}
                  className="rounded-full bg-foreground px-5 text-xs font-semibold text-background disabled:opacity-40"
                >
                  Log
                </button>
              </div>
            </div>
            <div className="mt-6 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightSeries}>
                  <XAxis
                    dataKey="d"
                    fontSize={10}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis hide domain={["dataMin - 1", "dataMax + 1"]} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="w"
                    stroke="oklch(0.704 0.199 45.2)"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "oklch(0.704 0.199 45.2)" }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <SectionLabel index="02">Protein</SectionLabel>
                <p className="mt-2 text-sm text-muted-foreground">
                  {targets ? `Target: ${targets.protein} g per day` : "Complete onboarding for a target."}
                </p>
              </div>
              <span className="label-micro text-orange">{avgProtein} g avg</span>
            </div>
            <div className="mt-6 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={proteinSeries}>
                  <XAxis
                    dataKey="d"
                    fontSize={10}
                    stroke="var(--muted-foreground)"
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="p" fill="oklch(0.704 0.199 45.2)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        <div className="mt-4 rounded-[2rem] border border-border bg-card p-6 lg:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <SectionLabel index="03">The week</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">
                Consistency compounds. One missed day is data, not failure.
              </p>
            </div>
            <PrimaryButton
              arrow="right"
              onClick={() => exportPDF(logs, streak, profile)}
              className="self-start"
            >
              Download report
            </PrimaryButton>
          </div>
          <div className="mt-6 grid grid-cols-7 gap-2">
            {logs.map((l) => {
              const score =
                (l.workoutDone ? 1 : 0) +
                (l.proteinG > 0 ? 1 : 0) +
                (l.water >= 8 ? 1 : 0) +
                (l.sleep >= 7 ? 1 : 0) +
                (l.steps >= 8000 ? 1 : 0);
              return (
                <div key={l.date} className="text-center">
                  <div className="flex h-24 items-end justify-center">
                    <div
                      className="w-full rounded-t-md bg-orange/70"
                      style={{ height: `${Math.max(8, (score / 5) * 100)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {new Date(l.date).toLocaleDateString("en-IN", { weekday: "narrow" })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </MobileShell>
  );
}
