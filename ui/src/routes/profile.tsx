import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MobileShell } from "@/components/MobileShell";
import { useProfile, calcTargets, GOAL_LABEL } from "@/utils/profile";
import { logout, forgetDevice } from "@/utils/oauth";
import {
  loadSubscription,
  saveSubscription,
  isPremium,
  getPlanName,
  clearSubscription,
  type PlanTier,
} from "@/utils/subscription";
import { fetchSubscription } from "@/services/sync";
import { proxyCheckout } from "@/services/api-proxy";
import { openExternal } from "@/utils/platform";
import { isPlayBuild } from "@/utils/distribution";
import { Button } from "@/components/ui/button";
import { Crown, LogOut, Sparkles, ShieldCheck, X, Check, Loader, ArrowUpRight } from "lucide-react";
import { cn } from "@/utils/cn";
import { toast } from "sonner";
import { PageHeader, SectionLabel } from "@/components/editorial";
import { ThemeToggle } from "@/components/ThemeToggle";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "You — FitMentor" }] }),
  component: ProfilePage,
});

const PLANS: {
  tier: PlanTier;
  name: string;
  price: number;
  period: string;
  features: string[];
  accent?: boolean;
}[] = [
  {
    tier: "pro",
    name: "Basic",
    price: 99,
    period: "month",
    features: ["Unlimited AI coach", "Custom meal plans", "Advanced analytics"],
    accent: false,
  },
  {
    tier: "premium",
    name: "Elite",
    price: 299,
    period: "month",
    features: ["Everything in Basic", "Form analyzer", "Photo macros", "Progress reports"],
    accent: true,
  },
];

function ProfilePage() {
  const { profile: p } = useProfile();
  const [sub, setSub] = useState(loadSubscription());
  const [showPayment, setShowPayment] = useState(false);
  const [selectedTier, setSelectedTier] = useState<PlanTier | null>(null);
  const nav = useNavigate();
  const getSub = useServerFn(fetchSubscription);

  useEffect(() => {
    setSub(loadSubscription());
    const handler = () => setSub(loadSubscription());
    window.addEventListener("fitmentor:subscription", handler);

    const applyServerSubscription = (json: any) => {
      const srv = json?.data?.subscription;
      if (!srv || !srv.tier || srv.tier === "free") return false;
      const now = new Date();
      const expiry = new Date(srv.currentPeriodEnd || now);
      saveSubscription({
        tier: srv.tier as PlanTier,
        startDate: now.toISOString(),
        expiryDate: expiry.toISOString(),
        paymentMethod: "polar",
      });
      setSub(loadSubscription());
      return true;
    };

    getSub()
      .then(applyServerSubscription)
      .catch(() => undefined);

    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      window.history.replaceState({}, "", "/profile");
      let attempts = 6;
      const poll = () => {
        getSub()
          .then((json: any) => {
            if (applyServerSubscription(json)) {
              toast.success(`${getPlanName(json?.data?.subscription?.tier)} plan activated`);
            } else if (attempts > 0) {
              attempts -= 1;
              setTimeout(poll, 2000);
            } else {
              toast.message("Payment received — refresh in a moment if your plan hasn't updated.");
            }
          })
          .catch(() => {
            if (attempts > 0) {
              attempts -= 1;
              setTimeout(poll, 2000);
            }
          });
      };
      poll();
    }

    return () => window.removeEventListener("fitmentor:subscription", handler);
  }, []);

  if (!p) {
    return (
      <MobileShell>
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
          <p className="text-sm text-muted-foreground">Finish setup to see your profile.</p>
          <Button onClick={() => nav({ to: "/onboarding" })}>Set up profile</Button>
        </div>
      </MobileShell>
    );
  }

  const t = calcTargets(p);
  const active = isPremium();
  const initials = p.name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <MobileShell wide>
      <div className="px-5 pt-8 lg:px-8 lg:pt-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.5rem] bg-orange font-wordmark text-2xl text-ink">
              {initials}
            </div>
            <div>
              <SectionLabel index="You">Profile</SectionLabel>
              <h1 className="mt-2 text-4xl font-semibold leading-none tracking-[-0.04em] sm:text-5xl">
                {p.name}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {GOAL_LABEL[p.goal]} · {p.experience} · {p.place}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => nav({ to: "/onboarding" })}
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5 text-orange" /> Edit profile
            </button>
          </div>
        </div>

        <div className="mt-8 grid gap-4 pb-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            {/* Plan */}
            {active ? (
              <div className="relative overflow-hidden rounded-[2rem] bg-ink p-6 text-cream lg:p-8">
                <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-orange/20 blur-3xl" />
                <div className="relative flex items-start justify-between gap-4">
                  <div>
                    <p className="label-micro text-orange">Active plan</p>
                    <h2 className="mt-3 flex items-center gap-2 text-3xl font-semibold">
                      <ShieldCheck className="h-6 w-6 text-orange" />
                      {getPlanName(sub?.tier ?? "free")}
                    </h2>
                    {sub ? (
                      <p className="mt-2 text-sm text-cream/55">
                        Renews {new Date(sub.expiryDate).toLocaleDateString("en-IN")}
                      </p>
                    ) : null}
                  </div>
                  <button
                    onClick={clearSubscription}
                    className="rounded-full border border-white/15 px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-cream/60 transition-colors hover:text-cream"
                  >
                    Cancel
                  </button>
                </div>
                <div className="relative mt-8 grid grid-cols-3 gap-4 border-t border-white/10 pt-5">
                  <div>
                    <p className="label-micro text-cream/40">Calories</p>
                    <p className="mt-2 text-xl font-medium">{t.calories}</p>
                  </div>
                  <div>
                    <p className="label-micro text-cream/40">Protein</p>
                    <p className="mt-2 text-xl font-medium text-orange">{t.protein} g</p>
                  </div>
                  <div>
                    <p className="label-micro text-cream/40">Training</p>
                    <p className="mt-2 text-xl font-medium">{p.daysPerWeek}× / wk</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label-micro text-muted-foreground">Membership</p>
                    <h2 className="mt-3 flex items-center gap-2 text-2xl font-semibold">
                      <Crown className="h-5 w-5 text-orange" />{" "}
                      {isPlayBuild ? "FitMentor Pro" : "Go premium"}
                    </h2>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
                      {isPlayBuild
                        ? "Pro plans arrive on Google Play soon. Training, logging and your daily coach stay free."
                        : "Unlock the full coach, custom meal plans, and form feedback. Cancel any time."}
                    </p>
                  </div>
                  {isPlayBuild ? null : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange text-ink">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  )}
                </div>

                {isPlayBuild ? null : (

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  {PLANS.map((plan) => (
                    <button
                      key={plan.tier}
                      onClick={() => {
                        setSelectedTier(plan.tier);
                        setShowPayment(true);
                      }}
                      className={cn(
                        "rounded-2xl border p-5 text-left transition-colors",
                        plan.accent
                          ? "border-orange bg-orange/5"
                          : "border-border hover:border-foreground/25",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-wordmark text-[11px] uppercase tracking-[0.14em]">
                          {plan.name}
                        </p>
                        {plan.accent ? (
                          <span className="rounded-full bg-orange px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-ink">
                            Best
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-4 text-3xl font-medium tabular-nums">
                        ₹{plan.price}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          /{plan.period}
                        </span>
                      </p>
                      <ul className="mt-4 space-y-1.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-orange" /> {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
                )}
              </div>
            )}

            {/* Targets */}
            <div className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
              <SectionLabel index="01">Daily targets</SectionLabel>
              <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
                {[
                  ["Calories", t.calories, "kcal"],
                  ["Protein", t.protein, "g"],
                  ["Carbs", t.carbs, "g"],
                  ["Fat", t.fat, "g"],
                ].map(([label, value, unit]) => (
                  <div key={label}>
                    <p className="label-micro text-muted-foreground">{label}</p>
                    <p className="mt-2 text-3xl font-medium tabular-nums">{value}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{unit}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="rounded-[2rem] border border-border bg-card p-6 lg:p-8">
              <SectionLabel index="02">The basics</SectionLabel>
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                {[
                  ["Age", `${p.age} yrs`],
                  ["Height", `${p.heightCm} cm`],
                  ["Weight", `${p.weightKg} kg`],
                  ["Training", `${p.daysPerWeek}× ${p.place}`],
                  ["Diet", p.diet],
                  ["Food budget", `₹${p.budgetPerDay}/day`],
                ].map(([label, value]) => (
                  <div className="border-t border-border pt-3" key={label}>
                    <p className="label-micro text-muted-foreground">{label}</p>
                    <p className="mt-2 text-sm font-medium capitalize">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="space-y-4">
            <div className="rounded-[2rem] border border-border bg-card p-6">
              <SectionLabel index="03">Settings</SectionLabel>
              <div className="mt-4 divide-y divide-border">
                <div className="flex items-center justify-between py-4">
                  <div>
                    <p className="text-sm font-medium">Theme</p>
                    <p className="text-xs text-muted-foreground">Light or dark</p>
                  </div>
                  <ThemeToggle />
                </div>
                <button
                  onClick={() => nav({ to: "/onboarding" })}
                  className="flex w-full items-center justify-between py-4 text-left"
                >
                  <div>
                    <p className="text-sm font-medium">Edit profile</p>
                    <p className="text-xs text-muted-foreground">Goal, body, food budget</p>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  onClick={logout}
                  className="flex w-full items-center justify-between py-4 text-left"
                >
                  <div>
                    <p className="text-sm font-medium">Sign out</p>
                    <p className="text-xs text-muted-foreground">Clear your session</p>
                  </div>
                  <LogOut className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <button
                onClick={() => {
                  if (confirm("This clears your saved session. You'll need to sign in again."))
                    forgetDevice().then(() => {
                      window.location.href = "/";
                    });
                }}
                className="mt-4 text-[11px] text-muted-foreground/60 underline underline-offset-2 hover:text-muted-foreground"
              >
                Forget this device
              </button>
            </div>

            <div className="rounded-[2rem] bg-orange p-6 text-ink">
              <p className="label-micro opacity-60">The standard</p>
              <p className="mt-3 text-xl font-semibold leading-snug">
                "You don't need more motivation. You need a smaller first step."
              </p>
              <p className="mt-4 text-xs opacity-60">FitMentor coach</p>
            </div>
          </div>
        </div>
      </div>

      {showPayment && selectedTier ? (
        <PolarCheckout
          tier={selectedTier}
          onClose={() => {
            setShowPayment(false);
            setSelectedTier(null);
          }}
        />
      ) : null}
    </MobileShell>
  );
}

function PolarCheckout({ tier, onClose }: { tier: PlanTier; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const plan = PLANS.find((p) => p.tier === tier);
  const checkout = useServerFn(proxyCheckout);

  useEffect(() => {
    checkout({ data: { tier } })
      .then((data) => {
        if (data.checkout_url) {
          void openExternal(data.checkout_url);
        } else {
          setError(data.error || "Failed to create checkout session");
          setLoading(false);
        }
      })
      .catch(() => {
        setError("Failed to connect to payment server");
        setLoading(false);
      });
  }, [tier]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-[2rem] border border-border bg-card p-6 pb-10 shadow-2xl sm:rounded-[2rem] sm:pb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="label-micro text-muted-foreground">Checkout</p>
            <h2 className="mt-2 text-xl font-semibold">
              {plan?.name} · ₹{plan?.price}/mo
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="mt-10 flex flex-col items-center gap-4 py-8">
            <Loader className="h-8 w-8 animate-spin text-orange" />
            <p className="text-sm text-muted-foreground">Taking you to Polar checkout…</p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-6 space-y-3">
            <p className="rounded-2xl border border-border bg-background p-4 text-sm text-destructive">
              {error}
            </p>
            <Button variant="outline" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
