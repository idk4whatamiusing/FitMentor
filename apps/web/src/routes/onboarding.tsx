import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveProfile,
  type Profile,
  type Goal,
  type Place,
  type Diet,
  type Experience,
  type Gender,
} from "@/utils/profile";
import { syncProfile } from "@/services/sync";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/utils/cn";
import logoImg from "@/assets/logo-v2.png";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Welcome to FitMentor AI" }] }),
  component: Onboarding,
});

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const HEALTH_OPTIONS = [
  { v: "none", l: "None (I'm healthy)", e: "✅" },
  { v: "diabetes", l: "Diabetes", e: "🩸" },
  { v: "heart_disease", l: "Heart Disease", e: "❤️" },
  { v: "bp", l: "High / Low BP", e: "🩺" },
  { v: "thyroid", l: "Thyroid", e: "🔬" },
  { v: "asthma", l: "Asthma", e: "🫁" },
  { v: "joint", l: "Joint / Back Pain", e: "🦴" },
  { v: "other", l: "Other", e: "📋" },
];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
  const sync = useServerFn(syncProfile);
  const [draft, setDraft] = useState<Partial<Profile>>({
    daysPerWeek: 4,
    budgetPerDay: 150,
    diet: "veg",
    place: "gym",
    experience: "beginner",
    gender: "male",
    goal: "muscle_gain",
    healthConditions: [],
  });

  const next = () => setStep((s) => (s + 1) as Step);
  const back = () => setStep((s) => Math.max(0, s - 1) as Step);

  const toggleHealth = (v: string) => {
    const current = draft.healthConditions ?? [];
    if (v === "none") {
      setDraft({ ...draft, healthConditions: current.includes("none") ? [] : ["none"] });
      return;
    }
    const filtered = current.filter((c) => c !== "none");
    if (filtered.includes(v)) {
      setDraft({ ...draft, healthConditions: filtered.filter((c) => c !== v) });
    } else {
      setDraft({ ...draft, healthConditions: [...filtered, v] });
    }
  };

  const finish = () => {
    const p: Profile = {
      name: draft.name ?? "Friend",
      age: Number(draft.age ?? 22),
      gender: (draft.gender as Gender) ?? "male",
      heightCm: Number(draft.heightCm ?? 170),
      weightKg: Number(draft.weightKg ?? 65),
      goal: (draft.goal as Goal) ?? "muscle_gain",
      place: (draft.place as Place) ?? "gym",
      experience: (draft.experience as Experience) ?? "beginner",
      diet: (draft.diet as Diet) ?? "veg",
      daysPerWeek: Number(draft.daysPerWeek ?? 4),
      budgetPerDay: Number(draft.budgetPerDay ?? 150),
      healthConditions: draft.healthConditions ?? [],
      createdAt: new Date().toISOString(),
    };
    saveProfile(p);
    sync({ data: p }).catch(() => {});
    navigate({ to: "/" });
  };

  const totalSteps = 9;

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background px-6 pt-14 pb-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 [background:var(--gradient-glow)]" />
      <div className="relative flex items-center gap-3">
        {step > 0 ? (
          <button
            onClick={back}
            className="rounded-full p-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : (
          <div className="h-9 w-9" />
        )}
        <div className="flex flex-1 gap-1.5">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn("h-1 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")}
            />
          ))}
        </div>
      </div>

      <div className="relative mt-10 flex-1">
        {step === 0 && <Welcome onNext={next} />}
        {step === 1 && (
          <Field title="What should we call you?" sub="Just a first name works.">
            <Input
              autoFocus
              placeholder="Your name"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="h-14 text-lg"
            />
          </Field>
        )}
        {step === 2 && (
          <Field title="Tell us about you" sub="We'll calculate your needs.">
            <div className="grid grid-cols-2 gap-3">
              <NumInput
                label="Age"
                value={draft.age}
                onChange={(v) => setDraft({ ...draft, age: v })}
                suffix="yrs"
              />
              <Select
                label="Gender"
                value={draft.gender ?? "male"}
                options={[
                  { v: "male", l: "Male" },
                  { v: "female", l: "Female" },
                  { v: "other", l: "Other" },
                ]}
                onChange={(v) => setDraft({ ...draft, gender: v as Gender })}
              />
              <NumInput
                label="Height"
                value={draft.heightCm}
                onChange={(v) => setDraft({ ...draft, heightCm: v })}
                suffix="cm"
              />
              <NumInput
                label="Weight"
                value={draft.weightKg}
                onChange={(v) => setDraft({ ...draft, weightKg: v })}
                suffix="kg"
              />
            </div>
          </Field>
        )}
        {step === 3 && (
          <Field title="What's your goal?" sub="Pick the one that matters most right now.">
            <Choices
              value={draft.goal}
              onChange={(v) => setDraft({ ...draft, goal: v as Goal })}
              options={[
                { v: "muscle_gain", l: "Build Muscle", e: "💪" },
                { v: "fat_loss", l: "Lose Fat", e: "🔥" },
                { v: "strength", l: "Get Stronger", e: "🏋️" },
                { v: "recomp", l: "Body Recomp", e: "⚖️" },
                { v: "general", l: "Stay Fit", e: "✨" },
              ]}
            />
          </Field>
        )}
        {step === 4 && (
          <Field title="Where will you train?" sub="We'll generate the right plan.">
            <Choices
              value={draft.place}
              onChange={(v) => setDraft({ ...draft, place: v as Place })}
              options={[
                { v: "gym", l: "Gym", e: "🏟️" },
                { v: "home", l: "Home (no equipment)", e: "🏠" },
              ]}
            />
          </Field>
        )}
        {step === 5 && (
          <Field title="How experienced are you?" sub="Be honest — we adjust everything.">
            <Choices
              value={draft.experience}
              onChange={(v) => setDraft({ ...draft, experience: v as Experience })}
              options={[
                { v: "beginner", l: "Beginner (< 6 months)", e: "🌱" },
                { v: "intermediate", l: "Intermediate (6m – 2y)", e: "🔥" },
                { v: "advanced", l: "Advanced (2y+)", e: "🚀" },
              ]}
            />
          </Field>
        )}
        {step === 6 && (
          <Field title="How many days per week?" sub={`${draft.daysPerWeek} days/week`}>
            <input
              type="range"
              min={2}
              max={6}
              value={draft.daysPerWeek}
              onChange={(e) => setDraft({ ...draft, daysPerWeek: Number(e.target.value) })}
              className="w-full accent-[var(--primary)]"
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
              <span>6</span>
            </div>
          </Field>
        )}
        {step === 7 && (
          <Field
            title="Any health conditions?"
            sub="We'll keep your workouts safe. Select all that apply."
          >
            <div className="space-y-2">
              {HEALTH_OPTIONS.map((o) => {
                const selected = draft.healthConditions?.includes(o.v) ?? false;
                return (
                  <button
                    key={o.v}
                    onClick={() => toggleHealth(o.v)}
                    className={cn(
                      "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition",
                      selected
                        ? "border-primary bg-primary/10 shadow-glow"
                        : "border-border/60 bg-card hover:border-primary/40",
                    )}
                  >
                    <span className="text-2xl">{o.e}</span>
                    <span className="font-semibold">{o.l}</span>
                    {selected && <span className="ml-auto text-primary">✓</span>}
                  </button>
                );
              })}
            </div>
          </Field>
        )}
        {step === 8 && (
          <Field title="Food & budget" sub="We'll suggest meals you can actually afford.">
            <Choices
              value={draft.diet}
              onChange={(v) => setDraft({ ...draft, diet: v as Diet })}
              options={[
                { v: "veg", l: "Vegetarian", e: "🥗" },
                { v: "nonveg", l: "Non-vegetarian", e: "🍗" },
                { v: "egg", l: "Eggetarian", e: "🥚" },
              ]}
            />
            <div className="mt-4">
              <label className="mb-2 block text-sm text-muted-foreground">
                Food budget: ₹{draft.budgetPerDay}/day
              </label>
              <input
                type="range"
                min={80}
                max={400}
                step={10}
                value={draft.budgetPerDay}
                onChange={(e) => setDraft({ ...draft, budgetPerDay: Number(e.target.value) })}
                className="w-full accent-[var(--primary)]"
              />
            </div>
          </Field>
        )}
      </div>

      <div className="relative mt-6">
        {step === 0 ? null : step < 8 ? (
          <Button size="lg" className="h-14 w-full text-base font-semibold" onClick={next}>
            Continue
          </Button>
        ) : (
          <Button
            size="lg"
            className="h-14 w-full bg-gradient-hero text-base font-semibold text-primary-foreground shadow-glow"
            onClick={finish}
          >
            Start my journey
          </Button>
        )}
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-hero shadow-glow p-1">
        <img src={logoImg} alt="FitMentor AI logo" className="h-full w-full object-contain" />
      </div>
      <h1 className="mt-8 text-4xl font-bold leading-tight">
        Welcome to <span className="text-gradient">FitMentor AI</span>
      </h1>
      <p className="mt-3 max-w-xs text-base text-muted-foreground">
        Your pocket fitness coach. Personalized workouts, Indian meal plans, and a smart AI trainer
        — all for free.
      </p>
      <Button
        size="lg"
        className="mt-10 h-14 w-full bg-gradient-hero font-semibold text-primary-foreground shadow-glow"
        onClick={onNext}
      >
        Let's go
      </Button>
      <p className="mt-4 text-xs text-muted-foreground">Takes less than 60 seconds</p>
    </div>
  );
}

function Field({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold leading-tight">{title}</h2>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );
}

function NumInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: unknown;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="mt-1 flex items-end gap-1">
        <input
          inputMode="numeric"
          value={(value as string | number) ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent text-2xl font-bold outline-none"
        />
        {suffix && <span className="pb-1 text-xs text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { v: string; l: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-transparent text-lg font-semibold outline-none"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} className="bg-card text-foreground">
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}

function Choices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { v: T; l: string; e: string }[];
}) {
  return (
    <div className="space-y-3">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            "flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition",
            value === o.v
              ? "border-primary bg-primary/10 shadow-glow"
              : "border-border/60 bg-card hover:border-primary/40",
          )}
        >
          <span className="text-2xl">{o.e}</span>
          <span className="font-semibold">{o.l}</span>
        </button>
      ))}
    </div>
  );
}
