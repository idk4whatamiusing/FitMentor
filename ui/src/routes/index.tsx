import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import Lenis from "lenis";
import { motion } from "framer-motion";
import { ArrowDown, ArrowRight, Check, Dumbbell, Flame, Sparkles } from "lucide-react";
import { checkSession } from "@/utils/oauth";
import {
  MediaCard,
  Pill,
  PrimaryLink,
  SectionLabel,
  StatBlock,
  Wordmark,
} from "@/components/editorial";
import { ThemeToggle } from "@/components/ThemeToggle";
import { cn } from "@/utils/cn";
import heroImg from "@/assets/photos/hero-athlete.jpg";
import trainImg from "@/assets/photos/train-ropes.jpg";
import fuelImg from "@/assets/photos/fuel-thali.jpg";
import coachImg from "@/assets/photos/coach-portrait.jpg";
import progressImg from "@/assets/photos/progress-track.jpg";
import runImg from "@/assets/photos/run-dusk.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FitMentor — Train like you mean it" },
      {
        name: "description",
        content:
          "AI-powered fitness coaching for India. Personalized workouts, Indian meal plans, and a coach that knows your plan.",
      },
    ],
  }),
  component: Landing,
});

const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as const },
};

const MARQUEE = ["Train", "Fuel", "Recover", "Repeat", "Show up", "Get strong"];

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    description: "Start today. No card, no trial timer.",
    features: ["Today dashboard", "Workout plan", "Meal targets", "Community feed"],
    cta: "Start free",
    tier: "free" as const,
  },
  {
    name: "Basic",
    price: "₹99",
    period: "month",
    description: "For the regulars who want the full coach.",
    features: ["Unlimited AI coach", "Custom meal plans", "Advanced analytics", "Priority support"],
    cta: "Choose Basic",
    tier: "pro" as const,
    accent: true,
  },
  {
    name: "Elite",
    price: "₹299",
    period: "month",
    description: "Everything, plus the deep feedback loop.",
    features: ["Everything in Basic", "Form analyzer", "Photo macros", "Progress reports"],
    cta: "Choose Elite",
    tier: "premium" as const,
  },
];

function Landing() {
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    checkSession().then((s) => setLoggedIn(s.ok));
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  const startTo = loggedIn ? "/dashboard" : "/signup";
  const paidTo = loggedIn ? "/profile" : "/signup";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 lg:px-8">
          <Wordmark href="/" />
          <nav className="hidden items-center gap-8 md:flex" aria-label="Sections">
            {[
              ["#train", "Train"],
              ["#fuel", "Fuel"],
              ["#coach", "Coach"],
              ["#pricing", "Pricing"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="label-micro text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <PrimaryLink to={startTo} className="hidden sm:inline-flex">
              {loggedIn ? "Open app" : "Start free"}
            </PrimaryLink>
            <Link
              to={startTo}
              className="inline-flex h-9 items-center rounded-full bg-foreground px-4 text-xs font-semibold text-background sm:hidden"
            >
              {loggedIn ? "Open" : "Start"}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-16 pt-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8 lg:pb-24 lg:pt-20">
          <motion.div {...fadeUp}>
            <SectionLabel index="01">AI fitness coaching · India</SectionLabel>
            <h1 className="mt-6 text-[3.6rem] font-semibold leading-[0.86] tracking-[-0.055em] sm:text-[5.2rem] lg:text-[6.2rem]">
              Train like{" "}
              <br />
              you <span className="text-orange">mean it.</span>
            </h1>
            <p className="mt-7 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              Personalized workouts, real Indian meal plans, and a coach that actually
              remembers your plan. Built for beginners, students, and small-home gyms.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <PrimaryLink to={startTo}>{loggedIn ? "Open dashboard" : "Start free"}</PrimaryLink>
              <a
                href="#train"
                className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                See how it works <ArrowDown className="h-4 w-4" />
              </a>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-5 border-t border-border pt-6">
              {[
                ["Cost", "₹0 to start"],
                ["Food", "Indian-first"],
                ["Coach", "24/7"],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="label-micro text-muted-foreground">{label}</dt>
                  <dd className="mt-2 text-base font-medium">{value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <MediaCard
              src={heroImg}
              alt="Athlete lifting a barbell"
              className="aspect-[4/5] w-full lg:aspect-[5/6]"
            >
              <div className="flex items-end justify-between gap-4 pb-8">
                <div>
                  <Pill tone="orange">Today · Push</Pill>
                  <h2 className="mt-4 text-3xl font-semibold leading-none">Upper body strength</h2>
                  <p className="mt-2 text-sm text-cream/70">6 moves · 42 min · home or gym</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-cream text-ink">
                  <Dumbbell className="h-5 w-5" />
                </span>
              </div>
            </MediaCard>
            <div className="absolute -bottom-5 left-4 rounded-2xl border border-border bg-card p-4 shadow-card sm:left-6">
              <p className="label-micro text-muted-foreground">Protein target</p>
              <p className="mt-1 text-2xl font-medium tabular-nums">
                148<span className="ml-1 text-xs text-muted-foreground">g</span>
              </p>
            </div>
            <div className="absolute -right-2 top-6 rounded-full bg-orange px-4 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink sm:right-4">
              Day 01
            </div>
          </motion.div>
        </div>
      </section>

      {/* Marquee */}
      <div className="overflow-hidden border-y border-white/10 bg-ink py-4 text-cream">
        <div className="flex w-max animate-marquee items-center gap-10 whitespace-nowrap pr-10">
          {[...MARQUEE, ...MARQUEE, ...MARQUEE, ...MARQUEE].map((word, i) => (
            <span key={i} className="flex items-center gap-10">
              <span className="font-wordmark text-[11px] uppercase tracking-[0.24em] text-cream/80">
                {word}
              </span>
              <span className="h-1.5 w-1.5 rounded-full bg-orange" aria-hidden />
            </span>
          ))}
        </div>
      </div>

      {/* Train */}
      <section id="train" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16">
          <motion.div {...fadeUp}>
            <SectionLabel index="02">Train</SectionLabel>
            <h2 className="mt-5 max-w-lg text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              A plan that fits your room, not a magazine.
            </h2>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Tell us your equipment, schedule, and experience. FitMentor builds the week
              around what you actually have — and adapts when life gets in the way.
            </p>
            <ul className="mt-10 divide-y divide-border border-y border-border">
              {[
                ["01", "Home or gym", "Dumbbells, bands, or a full floor. No 6 a.m. commute required."],
                ["02", "Adapts to missed days", "Skip a session and the plan reshuffles instead of guilt-tripping."],
                ["03", "Form-first cues", "Every move includes a setup note, tempo, and a simpler swap."],
              ].map(([n, title, body]) => (
                <li key={n} className="flex gap-5 py-5">
                  <span className="label-micro pt-1 text-orange">{n}</span>
                  <div>
                    <p className="text-base font-semibold">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div {...fadeUp} className="lg:pt-16">
            <MediaCard src={trainImg} alt="Battle rope training" className="aspect-[4/3]">
              <Pill tone="cream">Week 01 · Base</Pill>
              <h3 className="mt-4 text-2xl font-semibold">Conditioning, without the chaos</h3>
              <p className="mt-1 text-sm text-cream/70">20 minutes. One rope. Zero guesswork.</p>
            </MediaCard>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <StatBlock label="Session length" value="35" unit="min" hint="Typical day" />
              <StatBlock label="Equipment" value="Minimal" hint="Dumbbells or bands" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Fuel */}
      <section id="fuel" className="scroll-mt-20 bg-cream text-ink dark:bg-graphite dark:text-cream">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16 lg:px-8 lg:py-28">
          <motion.div {...fadeUp} className="order-2 lg:order-1">
            <MediaCard src={fuelImg} alt="Indian meal spread" className="aspect-[4/3]">
              <Pill tone="orange">Today's plate</Pill>
              <h3 className="mt-4 text-2xl font-semibold">Dal, paneer, roti — macros included.</h3>
            </MediaCard>
          </motion.div>
          <motion.div {...fadeUp} className="order-1 lg:order-2">
            <SectionLabel index="03" className="text-ink/50 dark:text-cream/50">
              Fuel
            </SectionLabel>
            <h2 className="mt-5 text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Eat what's already in your kitchen.
            </h2>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-ink/65 dark:text-cream/65">
              No imported superfoods. Meals are built from Indian staples, your budget, and
              your protein target — with vegetarian and eggetarian options that still hit
              the number.
            </p>
            <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-5">
              {[
                ["148g", "Protein"],
                ["2,100", "kcal"],
                ["₹180", "per day"],
              ].map(([value, label]) => (
                <div key={label} className="border-t border-ink/15 pt-3 dark:border-cream/15">
                  <p className="text-2xl font-medium tabular-nums sm:text-3xl">{value}</p>
                  <p className="label-micro mt-2 text-ink/50 dark:text-cream/50">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-ink/45 dark:text-cream/45">
              Example targets for a 70 kg beginner. Your plan is calculated from your body
              and goal.
            </p>
            <div className="mt-8">
              <PrimaryLink to={startTo} arrow="right">
                Build my meal plan
              </PrimaryLink>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Coach */}
      <section id="coach" className="scroll-mt-20 bg-ink text-cream">
        <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-20 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-28">
          <motion.div {...fadeUp}>
            <SectionLabel index="04" className="text-cream/45">
              Coach
            </SectionLabel>
            <h2 className="mt-5 text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Answers that know your plan.
            </h2>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-cream/60">
              The coach sees your profile, targets, and training history. Ask about a missed
              week, a sore knee, or what to eat before a late shift.
            </p>
            <ul className="mt-9 space-y-3">
              {[
                "Injury-aware substitutions",
                "Budget meals and local ingredients",
                "Hindi or English, your call",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-cream/80">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange text-ink">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-9">
              <Link
                to="/coach"
                className="group inline-flex items-center gap-3 rounded-full bg-cream py-2 pl-6 pr-2 text-sm font-semibold text-ink"
              >
                Ask the coach
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange text-ink transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </div>
          </motion.div>

          <motion.div {...fadeUp} className="relative">
            <img
              src={coachImg}
              alt="Athlete training with free weights"
              className="h-56 w-full rounded-[2rem] object-cover object-[center_30%] sm:h-64"
            />
            <div className="-mt-10 ml-4 mr-4 rounded-3xl border border-white/12 bg-graphite p-5 shadow-2xl sm:ml-8 sm:mr-0">
              <p className="label-micro text-orange">FitMentor coach</p>
              <p className="mt-3 text-sm leading-relaxed text-cream/85">
                "I missed three days. Should I restart the week?"
              </p>
              <div className="my-4 h-px bg-white/10" />
              <p className="text-sm leading-relaxed text-cream/60">
                No. Keep the rotation and drop the missed sessions. Your next push day is
                today — start with the dumbbell press, leave two reps in reserve.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange" />
                <span className="text-[10px] uppercase tracking-[0.16em] text-cream/40">
                  Using your week 2 plan
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Progress */}
      <section id="progress" className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 lg:px-8 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <motion.div {...fadeUp} className="grid grid-cols-2 gap-3">
            <MediaCard
              src={progressImg}
              alt="Runners on a track"
              className="col-span-2 aspect-[16/9] sm:col-span-1 sm:row-span-2 sm:aspect-auto sm:h-full"
            >
              <Pill tone="orange">Progress</Pill>
              <p className="mt-3 text-xl font-semibold">Small wins, tracked.</p>
            </MediaCard>
            <StatBlock label="Streak" value="12" unit="days" hint="Habit, not motivation" />
            <div className="overflow-hidden rounded-3xl border border-border">
              <img src={runImg} alt="Runners at dusk" className="h-full w-full object-cover" />
            </div>
          </motion.div>
          <motion.div {...fadeUp}>
            <SectionLabel index="05">Progress</SectionLabel>
            <h2 className="mt-5 text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              See the line go up.
            </h2>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground">
              Water, steps, protein, workouts, streaks. One place, no spreadsheet. Export
              a clean report when you want to show your progress to a trainer.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Pill>
                <Flame className="h-3 w-3 text-orange" /> Streaks
              </Pill>
              <Pill>
                <Dumbbell className="h-3 w-3 text-orange" /> Completions
              </Pill>
              <Pill>
                <Sparkles className="h-3 w-3 text-orange" /> AI insights
              </Pill>
            </div>
            <div className="mt-9">
              <PrimaryLink to={startTo} arrow="right">
                Track my first week
              </PrimaryLink>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="scroll-mt-20 border-t border-border bg-background px-5 py-20 lg:px-8 lg:py-28"
      >
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <SectionLabel index="06">Plans</SectionLabel>
            <h2 className="mt-5 text-4xl font-semibold leading-[0.95] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Start free. Upgrade when it sticks.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted-foreground">
              No trial countdowns. The free plan is a real plan. Paid tiers unlock the full
              coach and deeper feedback.
            </p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={cn(
                  "relative flex flex-col rounded-[1.75rem] border p-7",
                  plan.accent
                    ? "border-ink bg-ink text-cream dark:border-cream/20"
                    : "border-border bg-card",
                )}
              >
                {plan.accent ? (
                  <span className="absolute -top-3 left-7 rounded-full bg-orange px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-ink">
                    Most popular
                  </span>
                ) : null}
                <div className="flex items-baseline justify-between">
                  <h3 className="font-wordmark text-sm uppercase tracking-[0.16em]">{plan.name}</h3>
                  {plan.accent ? <Sparkles className="h-4 w-4 text-orange" /> : null}
                </div>
                <div className="mt-6 flex items-baseline gap-1.5">
                  <span className="text-4xl font-medium tracking-tight">{plan.price}</span>
                  <span
                    className={cn(
                      "text-xs",
                      plan.accent ? "text-cream/50" : "text-muted-foreground",
                    )}
                  >
                    /{plan.period}
                  </span>
                </div>
                <p
                  className={cn(
                    "mt-3 text-sm leading-relaxed",
                    plan.accent ? "text-cream/60" : "text-muted-foreground",
                  )}
                >
                  {plan.description}
                </p>
                <ul className="mt-6 flex-1 space-y-3">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm">
                      <Check className={cn("h-4 w-4", plan.accent ? "text-orange" : "text-orange")} />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.tier === "free" ? startTo : paidTo}
                  className={cn(
                    "mt-8 inline-flex items-center justify-between rounded-full py-2 pl-5 pr-2 text-sm font-semibold transition-transform hover:-translate-y-0.5",
                    plan.accent
                      ? "bg-cream text-ink"
                      : "border border-border bg-background text-foreground",
                  )}
                >
                  {plan.cta}
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange text-ink">
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-ink px-5 py-14 text-cream lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-10 border-b border-white/10 pb-10 sm:flex-row">
            <div>
              <Wordmark className="text-cream" />
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-cream/50">
                Fitness coaching that fits Indian kitchens, small gyms, and busy weeks.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-10 sm:gap-16">
              <div>
                <p className="label-micro text-cream/35">Product</p>
                <ul className="mt-4 space-y-2 text-sm text-cream/70">
                  <li>
                    <a href="#train" className="hover:text-cream">
                      Training
                    </a>
                  </li>
                  <li>
                    <a href="#fuel" className="hover:text-cream">
                      Nutrition
                    </a>
                  </li>
                  <li>
                    <a href="#coach" className="hover:text-cream">
                      Coach
                    </a>
                  </li>
                  <li>
                    <a href="#pricing" className="hover:text-cream">
                      Pricing
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="label-micro text-cream/35">Account</p>
                <ul className="mt-4 space-y-2 text-sm text-cream/70">
                  <li>
                    <Link to={startTo} className="hover:text-cream">
                      {loggedIn ? "Dashboard" : "Create account"}
                    </Link>
                  </li>
                  <li>
                    <Link to="/signin" className="hover:text-cream">
                      Sign in
                    </Link>
                  </li>
                  <li>
                    <Link to="/profile" className="hover:text-cream">
                      Profile
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-3 pt-6 text-[11px] text-cream/35 sm:flex-row">
            <p>© {new Date().getFullYear()} FitMentor. Built in India.</p>
            <p>Train · Fuel · Recover · Repeat</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
