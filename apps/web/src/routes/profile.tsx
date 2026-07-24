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
import { fetchSubscription } from "@/services/sync.server";
import { Button } from "@/components/ui/button";
import {
  Crown,
  LogOut,
  Sparkles,
  ShieldCheck,
  CreditCard,
  Wallet,
  Building,
  X,
  Check,
  Loader,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "You — FitMentor" }] }),
  component: ProfilePage,
});

type PaymentMethod = "upi" | "card" | "netbanking";
type PaymentStep = "select" | "pay" | "processing" | "success";

const PLANS: {
  tier: PlanTier;
  name: string;
  price: number;
  period: string;
  features: string[];
  accent?: boolean;
}[] = [
  {
    tier: "premium",
    name: "Premium",
    price: 99,
    period: "month",
    features: ["Unlimited AI Coach", "Custom meal plans", "Advanced analytics"],
    accent: false,
  },
  {
    tier: "pro",
    name: "Pro",
    price: 299,
    period: "month",
    features: ["Everything in Premium", "Form analyzer", "Photo macros", "Progress reports"],
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

    // Check if returning from Polar checkout
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      // Fetch subscription from API
      getSub()
        .then((json: any) => {
          const srv = json?.data?.subscription;
          if (srv && srv.tier !== "free") {
            const now = new Date();
            const expiry = new Date(srv.currentPeriodEnd || now);
            saveSubscription({
              tier: srv.tier as PlanTier,
              startDate: now.toISOString(),
              expiryDate: expiry.toISOString(),
              paymentMethod: "polar",
            });
            setSub(loadSubscription());
            toast.success(`${getPlanName(srv.tier)} plan activated!`);
          }
        })
        .catch(() => {});
      // Clean up URL
      window.history.replaceState({}, "", "/profile");
    }

    return () => window.removeEventListener("fitmentor:subscription", handler);
  }, []);

  if (!p) {
    return (
      <MobileShell>
        <div className="p-8 text-center">
          <Button onClick={() => nav({ to: "/onboarding" })}>Set up profile</Button>
        </div>
      </MobileShell>
    );
  }

  const t = calcTargets(p);
  const active = isPremium();

  return (
    <MobileShell>
      <div className="px-5 pt-12">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-hero text-2xl font-bold text-primary-foreground shadow-glow">
            {p.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{p.name}</h1>
            <p className="text-sm text-muted-foreground">
              {GOAL_LABEL[p.goal]} • {p.experience}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-5 mt-6">
        {active ? (
          <div className="rounded-2xl border border-accent/40 bg-gradient-card p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-accent" />
                <p className="font-bold">{getPlanName(sub?.tier ?? "free")} Active</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={clearSubscription}
              >
                Cancel
              </Button>
            </div>
            {sub && (
              <p className="mt-1 text-xs text-muted-foreground">
                Expires: {new Date(sub.expiryDate).toLocaleDateString("en-IN")}
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-accent/40 bg-gradient-card p-5 shadow-card">
            <div className="flex items-center gap-2">
              <Crown className="h-5 w-5 text-accent" />
              <p className="font-bold">Go Premium</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Unlock unlimited AI coach, advanced meal plans, and form analyzer.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {PLANS.map((plan) => (
                <button
                  key={plan.tier}
                  onClick={() => {
                    setSelectedTier(plan.tier);
                    setShowPayment(true);
                  }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition hover:scale-[1.02]",
                    plan.accent ? "border-accent bg-accent/10" : "border-border/60 bg-card/60",
                  )}
                >
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">
                    {plan.name}
                  </p>
                  <p className="mt-1">
                    <span className="text-2xl font-bold">₹{plan.price}</span>
                    <span className="text-xs text-muted-foreground">/{plan.period}</span>
                  </p>
                  <ul className="mt-2 space-y-1">
                    {plan.features.map((f) => (
                      <li key={f} className="text-[11px] text-muted-foreground">
                        • {f}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-5 mt-6 rounded-2xl border border-border/60 bg-card p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Your targets</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Stat label="Calories" value={`${t.calories} kcal`} />
          <Stat label="Protein" value={`${t.protein} g`} />
          <Stat label="Carbs" value={`${t.carbs} g`} />
          <Stat label="Fat" value={`${t.fat} g`} />
        </div>
      </div>

      <div className="mx-5 mt-4 rounded-2xl border border-border/60 bg-card p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Stats</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <Stat label="Age" value={`${p.age} yrs`} />
          <Stat label="Height" value={`${p.heightCm} cm`} />
          <Stat label="Weight" value={`${p.weightKg} kg`} />
          <Stat label="Train" value={`${p.daysPerWeek}x ${p.place}`} />
          <Stat label="Diet" value={p.diet} />
          <Stat label="Budget" value={`₹${p.budgetPerDay}/day`} />
        </div>
      </div>

      <div className="mx-5 mt-6 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={() => nav({ to: "/onboarding" })}>
          <Sparkles className="mr-2 h-4 w-4" /> Edit profile
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground"
          onClick={logout}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <div className="mx-5 mt-3 text-center">
        <button
          onClick={() => {
            if (confirm("This will clear your saved session. You'll need to sign in with Discord again."))
              forgetDevice().then(() => { window.location.href = "/"; });
          }}
          className="text-xs text-muted-foreground/50 underline hover:text-muted-foreground"
        >
          Forget this device
        </button>
      </div>

      {showPayment && selectedTier && (
        <PolarCheckout
          tier={selectedTier}
          onClose={() => {
            setShowPayment(false);
            setSelectedTier(null);
          }}
        />
      )}
    </MobileShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-secondary/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold capitalize">{value}</p>
    </div>
  );
}

const PAYMENT_OPTIONS: { id: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { id: "upi", label: "UPI", icon: Wallet },
  { id: "card", label: "Card", icon: CreditCard },
  { id: "netbanking", label: "Net Banking", icon: Building },
];

function PolarCheckout({
  tier,
  onClose,
}: {
  tier: PlanTier;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const plan = PLANS.find((p) => p.tier === tier);

  useEffect(() => {
    fetch("/api/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
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
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-6 pb-20 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Subscribe to {plan?.name}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="mt-10 flex flex-col items-center gap-4 py-8">
            <Loader className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Redirecting to checkout...</p>
          </div>
        )}

        {error && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-red-400">{error}</p>
            <Button variant="outline" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
