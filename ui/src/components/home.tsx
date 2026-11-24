import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronRight,
  Droplet,
  Flame,
  Moon,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import type { Readiness, ReadinessBand } from "@/utils/readiness";
import { readinessBandLabel, WATER_TARGET } from "@/utils/readiness";

export function DotValue({
  value,
  unit,
  className,
  unitClassName,
}: {
  value: ReactNode;
  unit?: ReactNode;
  className?: string;
  unitClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1 font-dot leading-[0.8]", className)}>
      <span>{value}</span>
      {unit ? (
        <span className={cn("font-sans text-xs font-semibold text-current/60", unitClassName)}>
          {unit}
        </span>
      ) : null}
    </span>
  );
}

export function BentoCard({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return (
    <Tag
      className={cn(
        "min-w-0 rounded-[1.75rem] bg-card p-5 text-card-foreground shadow-card ring-1 ring-black/[0.02] dark:ring-white/[0.04]",
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function HomeHeader({
  date,
  name,
  initial,
  streak,
}: {
  date: string;
  name: string;
  initial: string;
  streak: number;
}) {
  return (
    <header className="flex min-w-0 items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="label-micro text-burnt dark:text-orange">{date}</p>
        <h1 className="mt-2 text-[2.65rem] font-semibold leading-[0.9] tracking-[-0.055em]">
          Today<span className="text-orange">.</span>
        </h1>
        <p className="mt-2 truncate text-sm text-muted-foreground">Good morning, {name}.</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2 pt-1">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink font-wordmark text-[11px] text-cream dark:bg-cream dark:text-ink">
          {initial}
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] shadow-card">
          <Flame className="h-3 w-3 text-orange" />
          {streak} day{streak === 1 ? "" : "s"}
        </span>
      </div>
    </header>
  );
}

export function VerdictHero({
  verdict,
  title,
  focus,
  meta,
  done,
  sleep,
  protein,
  water,
}: {
  verdict: Readiness["verdict"];
  title: string;
  focus: string;
  meta: string;
  done: boolean;
  sleep: number;
  protein: number;
  water: number;
}) {
  const copy = done
    ? "Session complete. Let the adaptation begin."
    : verdict === "Push"
      ? "Go hard — the plan is built for today."
      : verdict === "Recover"
        ? "Keep it easy. Recovery is the session."
        : "Steady work. Hit the plan, not the wall.";

  return (
    <section className="relative min-w-0 overflow-hidden rounded-[2.125rem] p-6 text-white shadow-card">
      <div
        className="absolute inset-0"
        style={{ background: "var(--gradient-verdict)" }}
        aria-hidden
      />
      <div
        className="absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/15 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-black/20 blur-3xl"
        aria-hidden
      />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
            <Zap className="h-3 w-3" />
            {done ? "Done" : verdict}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
            {meta}
          </span>
        </div>

        <h2 className="mt-5 text-[3.4rem] font-semibold leading-[0.85] tracking-[-0.06em]">
          {done ? "Done" : verdict}
          <span className="text-white/40">.</span>
        </h2>
        <p className="mt-2 max-w-[17rem] text-sm leading-snug text-white/80">{copy}</p>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Sleep", value: `${sleep > 0 ? sleep : "—"}h` },
            { label: "Protein", value: `${protein}g` },
            { label: "Water", value: `${water}/8` },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl bg-white/12 px-2.5 py-2 backdrop-blur-sm">
              <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/50">
                {stat.label}
              </p>
              <p className="mt-0.5 text-xs font-semibold">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/95 p-3 text-ink shadow-sm">
          <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange/10 text-orange min-[360px]:flex">
            <Zap className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-semibold min-[380px]:text-sm">{title}</p>
            <p className="line-clamp-2 text-[10px] leading-snug text-ink/50 min-[380px]:text-xs">
              {focus}
            </p>
          </div>
          <Link
            to="/workouts"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-lime py-2 pl-4 pr-3 text-[11px] font-semibold text-lime-ink min-[380px]:pr-2 min-[380px]:text-xs"
          >
            {done ? "View" : "Start"}
            <span className="hidden h-6 w-6 items-center justify-center rounded-full bg-lime-ink text-lime min-[380px]:flex">
              <ArrowUpRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

const bandTone: Record<ReadinessBand, string> = {
  prime: "bg-white/15 text-white/85",
  steady: "bg-white/15 text-white/85",
  recover: "bg-white/15 text-white/85",
};

export function ReadinessCard({
  readiness,
  history,
}: {
  readiness: Readiness;
  history: Array<number | null>;
}) {
  const max = 100;
  const score = readiness.score;

  return (
    <BentoCard className="relative min-w-0 overflow-hidden p-0 text-white shadow-card">
      <div
        className="absolute inset-0"
        style={{ background: "var(--gradient-recovery)" }}
        aria-hidden
      />
      <div
        className="absolute -right-8 -top-10 h-36 w-36 rounded-full bg-white/20 blur-3xl"
        aria-hidden
      />
      <div className="relative flex h-full min-h-[190px] flex-col justify-between p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
            Readiness
          </p>
          <span
            className={cn(
              "rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em]",
              bandTone[readiness.band],
            )}
          >
            {readinessBandLabel(readiness.band)}
          </span>
        </div>

        <div className="mt-3">
          <DotValue
            value={score === null ? "—" : score}
            unit={score === null ? undefined : "%"}
            className="text-[4.25rem]"
            unitClassName="text-white/60"
          />
          <p className="mt-1 text-[11px] leading-snug text-white/55">
            {score === null ? "Log sleep, water or protein to see it." : "From today's logs"}
          </p>
        </div>

        <div className="mt-4 flex h-8 items-end gap-1">
          {history.map((value, index) => (
            <span
              key={index}
              className={cn(
                "flex-1 rounded-full",
                index === history.length - 1 ? "bg-white" : "bg-white/30",
              )}
              style={{ height: `${Math.max(10, ((value ?? 0) / max) * 100)}%` }}
            />
          ))}
        </div>
      </div>
    </BentoCard>
  );
}

export function LoadCard({
  sessions,
  target,
  days,
}: {
  sessions: number;
  target: number;
  days: boolean[];
}) {
  return (
    <BentoCard className="flex min-h-[190px] min-w-0 flex-col justify-between">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Load
        </p>
        <Flame className="h-4 w-4 text-orange" />
      </div>

      <div className="mt-3">
        <DotValue
          value={sessions}
          unit={`/ ${Math.max(1, target)}`}
          className="text-[3.6rem]"
          unitClassName="text-muted-foreground"
        />
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">Sessions this week</p>
      </div>

      <div className="mt-4 flex items-center gap-1.5">
        {days.map((done, index) => (
          <span
            key={index}
            className={cn(
              "h-2 flex-1 rounded-full",
              done ? "bg-ink dark:bg-cream" : "bg-muted",
            )}
          />
        ))}
      </div>
    </BentoCard>
  );
}

export function MacroBar({
  label,
  value,
  target,
  tone = "orange",
}: {
  label: string;
  value: number;
  target: number;
  tone?: "orange" | "green" | "lilac" | "ink";
}) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  const tones = {
    orange: "bg-orange",
    green: "bg-green",
    lilac: "bg-lilac-deep",
    ink: "bg-ink dark:bg-cream",
  } as const;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {value}
          <span className="text-muted-foreground/60"> / {target}</span>
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tones[tone])} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function FuelCard({
  protein,
  proteinTarget,
  water,
  calories,
  onWater,
  onProtein,
}: {
  protein: number;
  proteinTarget: number;
  water: number;
  calories: number;
  onWater: () => void;
  onProtein: () => void;
}) {
  return (
    <BentoCard>
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Fuel
          </p>
          <p className="mt-1 text-sm font-medium">Today's targets</p>
        </div>
        <span className="rounded-full bg-orange/10 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-burnt dark:text-orange">
          {calories.toLocaleString()} kcal
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-orange" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Protein</span>
          </div>
          <DotValue
            value={protein}
            unit={`/ ${proteinTarget}g`}
            className="mt-2 text-[2.9rem]"
            unitClassName="text-muted-foreground"
          />
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Droplet className="h-3.5 w-3.5 text-lilac-deep" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">Water</span>
          </div>
          <DotValue
            value={water}
            unit={`/ ${WATER_TARGET}`}
            className="mt-2 text-[2.9rem]"
            unitClassName="text-muted-foreground"
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <MacroBar label="Protein" value={protein} target={proteinTarget} tone="orange" />
        <MacroBar label="Water" value={water} target={WATER_TARGET} tone="lilac" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onWater}
          className="inline-flex items-center gap-1.5 rounded-full bg-lime px-3.5 py-2 text-[11px] font-semibold text-lime-ink transition-transform active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" /> Glass
        </button>
        <button
          type="button"
          onClick={onProtein}
          className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3.5 py-2 text-[11px] font-semibold text-secondary-foreground transition-transform active:scale-[0.97]"
        >
          <Plus className="h-3.5 w-3.5" /> 20 g protein
        </button>
        <Link
          to="/nutrition"
          className="ml-auto inline-flex items-center gap-1 px-1 py-2 text-[11px] font-semibold text-muted-foreground"
        >
          Food <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </BentoCard>
  );
}

export function SleepCard({
  hours,
  history,
  labels,
}: {
  hours: number;
  history: number[];
  labels: string[];
}) {
  const max = Math.max(9, ...history.map((value) => value || 0));

  return (
    <BentoCard>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Sleep
          </p>
          <p className="mt-1 text-sm font-medium">Last night</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-lilac/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-lilac-deep dark:bg-lilac/15">
          <Moon className="h-3 w-3" /> Aim 8 h
        </span>
      </div>

      <div className="mt-4 flex items-end gap-1.5">
        <DotValue
          value={hours > 0 ? hours : "—"}
          unit={hours > 0 ? "h" : undefined}
          className="text-[3.4rem]"
          unitClassName="text-muted-foreground"
        />
        <span className="mb-1.5 ml-auto text-[11px] text-muted-foreground">7-night rhythm</span>
      </div>

      <div className="mt-4 flex h-14 items-end gap-1.5">
        {history.map((value, index) => (
          <div key={index} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span
              className={cn(
                "w-2.5 rounded-full",
                index === history.length - 1 ? "bg-lilac-deep" : "bg-lilac/60 dark:bg-lilac/30",
              )}
              style={{ height: `${Math.max(8, ((value || 0) / max) * 100)}%` }}
            />
            <span className="text-[8px] font-medium uppercase text-muted-foreground/60">
              {labels[index] ?? ""}
            </span>
          </div>
        ))}
      </div>
    </BentoCard>
  );
}

export function CoachPromptCard() {
  return (
    <BentoCard className="relative min-w-0 overflow-hidden">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-lilac/50 text-lilac-deep dark:bg-lilac/15">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Coach
          </p>
          <p className="mt-1 text-sm font-semibold">Ask about your plan</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Training, food, recovery, or the week you just missed.
          </p>
        </div>
        <Link
          to="/coach"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-cream dark:bg-cream dark:text-ink"
          aria-label="Open coach"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["How much protein?", "I missed 3 days", "Review my plan"].map((prompt) => (
          <Link
            key={prompt}
            to="/coach"
            className="rounded-full bg-secondary px-3 py-1.5 text-[11px] font-medium text-secondary-foreground"
          >
            {prompt}
          </Link>
        ))}
      </div>
    </BentoCard>
  );
}

export function ProgressLink() {
  return (
    <Link
      to="/progress"
      className="flex items-center justify-between rounded-[1.5rem] bg-card px-5 py-4 shadow-card ring-1 ring-black/[0.02] transition-colors hover:bg-secondary dark:ring-white/[0.04]"
    >
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Progress
        </p>
        <p className="mt-1 text-sm font-medium">Last 7 days</p>
      </div>
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <ArrowUpRight className="h-4 w-4" />
      </span>
    </Link>
  );
}
