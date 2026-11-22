import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  saveProfile,
  type Profile,
  type Goal,
  type Place,
  type Diet,
  type Experience,
  type Gender,
} from "@/utils/profile";
import { proxyUpdateProfile } from "@/services/api-proxy";
import { ArrowLeft, ArrowUpRight, Check } from "lucide-react";
import { cn } from "@/utils/cn";
import { PrimaryButton, SectionLabel, Wordmark } from "@/components/editorial";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Set up — FitMentor" }] }),
  component: Onboarding,
});

type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const STEP_LABELS = [
  "Welcome",
  "Name",
  "Body",
  "Goal",
  "Place",
  "Level",
  "Days",
  "Health",
  "Food",
];

const HEALTH_OPTIONS = [
  { v: "none", l: "None — I'm healthy" },
  { v: "diabetes", l: "Diabetes" },
  { v: "heart_disease", l: "Heart disease" },
  { v: "bp", l: "High or low BP" },
  { v: "thyroid", l: "Thyroid" },
  { v: "asthma", l: "Asthma" },
  { v: "joint", l: "Joint or back pain" },
  { v: "other", l: "Something else" },
];

function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(0);
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

  const finish = async () => {
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
    try {
      await proxyUpdateProfile({
        data: {
          name: p.name,
          age: p.age,
          gender: p.gender,
          heightCm: p.heightCm,
          weightKg: p.weightKg,
          goal: p.goal,
          place: p.place,
          experience: p.experience,
          diet: p.diet,
          daysPerWeek: p.daysPerWeek,
          budgetPerDay: p.budgetPerDay,
          healthConditions: p.healthConditions,
        },
      });
    } catch (e) {
      console.error("syncProfile failed:", e);
    }
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 lg:px-8">
        <Wordmark href="/" />
        <div className="flex items-center gap-4">
          <span className="label-micro text-muted-foreground">
            {String(step + 1).padStart(2, "0")} / 09
          </span>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-16 lg:grid-cols-[0.32fr_0.68fr] lg:gap-16 lg:px-8">
        <aside className="hidden pt-8 lg:block">
          <SectionLabel index="Setup">Your plan</SectionLabel>
          <p className="mt-6 max-w-xs text-2xl font-medium leading-snug tracking-[-0.02em]">
            A few answers, then your first week is ready.
          </p>
          <ol className="mt-10 space-y-1">
            {STEP_LABELS.map((label, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-4 rounded-full py-2 text-sm transition-colors",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums",
                      active
                        ? "bg-orange text-ink"
                        : done
                          ? "bg-ink text-cream dark:bg-cream dark:text-ink"
                          : "border border-border",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : String(i + 1).padStart(2, "0")}
                  </span>
                  {label}
                </li>
              );
            })}
          </ol>
        </aside>

        <main className="pt-2 lg:pt-8">
          <div className="flex gap-1.5 lg:hidden">
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1 flex-1 rounded-full",
                  i <= step ? "bg-orange" : "bg-muted",
                )}
              />
            ))}
          </div>

          <div className="mt-8 min-h-[440px] lg:mt-0">
            {step === 0 && <Welcome onNext={next} />}
            {step === 1 && (
              <Field
                index="02"
                title="What should we call you?"
                sub="Just a first name. The coach will use it."
              >
                <BigInput
                  autoFocus
                  label="First name"
                  placeholder="Your name"
                  value={draft.name ?? ""}
                  onChange={(v) => setDraft({ ...draft, name: v })}
                />
              </Field>
            )}
            {step === 2 && (
              <Field index="03" title="Tell us about your body." sub="We use this for calories and targets.">
                <div className="grid grid-cols-2 gap-x-8 gap-y-9">
                  <NumInput
                    label="Age"
                    value={draft.age}
                    onChange={(v) => setDraft({ ...draft, age: v })}
                    suffix="years"
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
              <Field index="04" title="What matters most right now?" sub="Pick one. You can change it later.">
                <Choices
                  value={draft.goal}
                  onChange={(v) => setDraft({ ...draft, goal: v as Goal })}
                  options={[
                    { v: "muscle_gain", l: "Build muscle" },
                    { v: "fat_loss", l: "Lose fat" },
                    { v: "strength", l: "Get stronger" },
                    { v: "recomp", l: "Body recomposition" },
                    { v: "general", l: "Stay fit" },
                  ]}
                />
              </Field>
            )}
            {step === 4 && (
              <Field index="05" title="Where will you train?" sub="The plan matches your equipment.">
                <Choices
                  value={draft.place}
                  onChange={(v) => setDraft({ ...draft, place: v as Place })}
                  options={[
                    { v: "gym", l: "Gym — full equipment" },
                    { v: "home", l: "Home — minimal equipment" },
                  ]}
                />
              </Field>
            )}
            {step === 5 && (
              <Field index="06" title="How long have you been training?" sub="Honesty makes the plan better.">
                <Choices
                  value={draft.experience}
                  onChange={(v) => setDraft({ ...draft, experience: v as Experience })}
                  options={[
                    { v: "beginner", l: "Beginner — under 6 months" },
                    { v: "intermediate", l: "Intermediate — 6 months to 2 years" },
                    { v: "advanced", l: "Advanced — 2 years or more" },
                  ]}
                />
              </Field>
            )}
            {step === 6 && (
              <Field
                index="07"
                title="How many days a week?"
                sub="Two consistent days beat five imaginary ones."
              >
                <div className="rounded-[1.75rem] border border-border bg-card p-6">
                  <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-medium tabular-nums">{draft.daysPerWeek}</span>
                    <span className="text-sm text-muted-foreground">days / week</span>
                  </div>
                  <input
                    id="days-per-week"
                    type="range"
                    min={2}
                    max={6}
                    value={draft.daysPerWeek}
                    onChange={(e) => setDraft({ ...draft, daysPerWeek: Number(e.target.value) })}
                    className="mt-8 w-full accent-orange"
                  />
                  <div className="mt-3 flex justify-between text-xs tabular-nums text-muted-foreground">
                    {[2, 3, 4, 5, 6].map((n) => (
                      <span key={n} className={n === draft.daysPerWeek ? "text-orange" : ""}>
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              </Field>
            )}
            {step === 7 && (
              <Field
                index="08"
                title="Anything we should work around?"
                sub="Select all that apply. This keeps the plan safe."
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {HEALTH_OPTIONS.map((o) => {
                    const selected = draft.healthConditions?.includes(o.v) ?? false;
                    return (
                      <button
                        key={o.v}
                        onClick={() => toggleHealth(o.v)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl border p-4 text-left text-sm transition-colors",
                          selected
                            ? "border-orange bg-orange/10"
                            : "border-border bg-card hover:border-foreground/25",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border",
                            selected ? "border-orange bg-orange text-ink" : "border-border",
                          )}
                        >
                          {selected ? <Check className="h-3 w-3" /> : null}
                        </span>
                        {o.l}
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            {step === 8 && (
              <Field index="09" title="Food and budget." sub="Meals you can actually afford and cook.">
                <Choices
                  value={draft.diet}
                  onChange={(v) => setDraft({ ...draft, diet: v as Diet })}
                  options={[
                    { v: "veg", l: "Vegetarian" },
                    { v: "nonveg", l: "Non-vegetarian" },
                    { v: "egg", l: "Eggetarian" },
                  ]}
                />
                <div className="mt-7 rounded-[1.75rem] border border-border bg-card p-6">
                  <div className="flex items-baseline justify-between">
                    <p className="label-micro text-muted-foreground">Food budget</p>
                    <p className="text-2xl font-medium tabular-nums">
                      ₹{draft.budgetPerDay}
                      <span className="ml-1 text-xs text-muted-foreground">/ day</span>
                    </p>
                  </div>
                  <input
                    id="budget-per-day"
                    type="range"
                    min={80}
                    max={400}
                    step={10}
                    value={draft.budgetPerDay}
                    onChange={(e) => setDraft({ ...draft, budgetPerDay: Number(e.target.value) })}
                    className="mt-6 w-full accent-orange"
                  />
                </div>
              </Field>
            )}
          </div>

          <div className="mt-8 flex items-center justify-between gap-4 border-t border-border pt-6">
            <button
              onClick={back}
              disabled={step === 0}
              className={cn(
                "inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                step === 0 && "invisible",
              )}
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>

            {step === 0 ? (
              <span className="text-xs text-muted-foreground">Takes under a minute</span>
            ) : step < 8 ? (
              <PrimaryButton onClick={next}>Continue</PrimaryButton>
            ) : (
              <PrimaryButton onClick={finish}>Start my first week</PrimaryButton>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <div>
      <SectionLabel index="01">Welcome</SectionLabel>
      <h1 className="mt-5 text-5xl font-semibold leading-[0.9] tracking-[-0.05em] sm:text-7xl">
        Let's build{" "}
        <br />
        your first <span className="text-orange">week.</span>
      </h1>
      <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
        Nine quick questions. We'll turn them into a training split, daily targets, and a
        meal plan built around Indian food and your budget.
      </p>
      <div className="mt-10">
        <PrimaryButton onClick={onNext}>Let's go</PrimaryButton>
      </div>
      <div className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6">
        {[
          ["09", "questions"],
          ["60s", "to finish"],
          ["₹0", "to start"],
        ].map(([value, label]) => (
          <div key={label}>
            <p className="text-2xl font-medium">{value}</p>
            <p className="label-micro mt-1 text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Field({
  index,
  title,
  sub,
  children,
}: {
  index: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <SectionLabel index={index}>Setup</SectionLabel>
      <h2 className="mt-4 text-3xl font-semibold leading-[0.95] tracking-[-0.035em] sm:text-4xl">
        {title}
      </h2>
      {sub ? <p className="mt-3 text-sm text-muted-foreground">{sub}</p> : null}
      <div className="mt-9">{children}</div>
    </div>
  );
}

function BigInput({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="block max-w-md">
      <span className="label-micro text-muted-foreground">{label}</span>
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-3 w-full border-b-2 border-border bg-transparent pb-3 text-4xl font-medium outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-orange"
      />
    </label>
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
    <label className="block">
      <span className="label-micro text-muted-foreground">{label}</span>
      <span className="mt-3 flex items-end gap-2 border-b-2 border-border pb-2 transition-colors focus-within:border-orange">
        <input
          id={label.toLowerCase().replace(/\s+/g, "-")}
          inputMode="numeric"
          value={(value as string | number) ?? ""}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent text-4xl font-medium tabular-nums outline-none"
        />
        {suffix ? <span className="pb-1.5 text-xs text-muted-foreground">{suffix}</span> : null}
      </span>
    </label>
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
    <label className="block">
      <span className="label-micro text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-3 w-full appearance-none border-b-2 border-border bg-transparent pb-3 text-2xl font-medium outline-none transition-colors focus:border-orange"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v} className="bg-card text-foreground">
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Choices<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { v: T; l: string }[];
}) {
  return (
    <div className="space-y-2.5">
      {options.map((o, i) => {
        const selected = value === o.v;
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className={cn(
              "group flex w-full items-center gap-5 rounded-2xl border p-4 text-left transition-colors sm:p-5",
              selected
                ? "border-orange bg-orange/10"
                : "border-border bg-card hover:border-foreground/25",
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-wordmark text-[10px]",
                selected ? "bg-orange text-ink" : "bg-secondary text-muted-foreground",
              )}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 text-base font-medium">{o.l}</span>
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                selected ? "bg-ink text-cream dark:bg-cream dark:text-ink" : "text-border",
              )}
            >
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
