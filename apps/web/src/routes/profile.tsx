import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    setSub(loadSubscription());
    const handler = () => setSub(loadSubscription());
    window.addEventListener("fitmentor:subscription", handler);
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
              forgetDevice();
          }}
          className="text-xs text-muted-foreground/50 underline hover:text-muted-foreground"
        >
          Forget this device
        </button>
      </div>

      {showPayment && selectedTier && (
        <PaymentModal
          tier={selectedTier}
          onClose={() => {
            setShowPayment(false);
            setSelectedTier(null);
          }}
          onSuccess={() => {
            setShowPayment(false);
            setSelectedTier(null);
            setSub(loadSubscription());
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

function PaymentModal({
  tier,
  onClose,
  onSuccess,
}: {
  tier: PlanTier;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<PaymentStep>("select");
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [upiId, setUpiId] = useState("");
  const plan = PLANS.find((p) => p.tier === tier);

  const handlePay = () => {
    if (!method) return;
    setStep("processing");
    setTimeout(() => {
      const now = new Date();
      const expiry = new Date(now);
      expiry.setMonth(expiry.getMonth() + 1);
      saveSubscription({
        tier,
        startDate: now.toISOString(),
        expiryDate: expiry.toISOString(),
        paymentMethod: method,
      });
      setStep("success");
      toast.success(`${plan?.name} plan activated!`);
      setTimeout(onSuccess, 2000);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-3xl bg-card p-6 pb-20 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            {step === "success" ? "Payment Successful" : `Pay ₹${plan?.price}`}
          </h2>
          {step !== "processing" && (
            <button
              onClick={onClose}
              className="rounded-full p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {step === "select" && (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-muted-foreground">
              {plan?.name} — <span className="font-bold text-foreground">₹{plan?.price}</span>/
              {plan?.period}
            </p>
            <p className="text-xs text-muted-foreground">Choose payment method:</p>
            {PAYMENT_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => setMethod(opt.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition",
                    method === opt.id
                      ? "border-primary bg-primary/10"
                      : "border-border/60 bg-background hover:border-primary/40",
                  )}
                >
                  <Icon className="h-5 w-5 text-primary" />
                  <span className="font-medium">{opt.label}</span>
                  {method === opt.id && <Check className="ml-auto h-4 w-4 text-primary" />}
                </button>
              );
            })}
            {method === "upi" && (
              <div className="rounded-xl border border-border/60 bg-background p-3">
                <p className="text-xs text-muted-foreground">Enter UPI ID</p>
                <input
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  placeholder="example@paytm"
                  className="mt-1 w-full bg-transparent text-sm font-medium outline-none"
                />
              </div>
            )}
            {method === "card" && (
              <div className="space-y-2 rounded-xl border border-border/60 bg-background p-3">
                <input
                  placeholder="Card number"
                  className="w-full bg-transparent text-sm outline-none"
                />
                <div className="flex gap-2">
                  <input
                    placeholder="MM/YY"
                    className="flex-1 bg-transparent text-sm outline-none"
                  />
                  <input placeholder="CVV" className="flex-1 bg-transparent text-sm outline-none" />
                </div>
              </div>
            )}
            {method === "netbanking" && (
              <div className="rounded-xl border border-border/60 bg-background p-3">
                <select className="w-full bg-transparent text-sm outline-none">
                  <option>Select your bank</option>
                  <option>SBI</option>
                  <option>HDFC</option>
                  <option>ICICI</option>
                  <option>Axis</option>
                  <option>Kotak</option>
                  <option>Yes Bank</option>
                </select>
              </div>
            )}
            <Button
              className="mt-2 h-12 w-full text-base font-semibold"
              onClick={handlePay}
              disabled={!method}
            >
              Pay ₹{plan?.price}
            </Button>
            <p className="text-center text-[10px] text-muted-foreground">
              🔒 Secured via simulated payment gateway
            </p>
          </div>
        )}

        {step === "processing" && (
          <div className="mt-10 flex flex-col items-center gap-4 py-8">
            <Loader className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Processing payment...</p>
            <p className="text-xs text-muted-foreground">
              Please wait while we verify your payment
            </p>
          </div>
        )}

        {step === "success" && (
          <div className="mt-10 flex flex-col items-center gap-4 py-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
              <Check className="h-8 w-8 text-green-500" />
            </div>
            <p className="text-lg font-bold">{plan?.name} Activated! 🎉</p>
            <p className="text-center text-sm text-muted-foreground">
              You now have access to all {plan?.name} features. Enjoy your journey!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
