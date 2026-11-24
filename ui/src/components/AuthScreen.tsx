import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { checkSession, getGoogleAuthUrl } from "@/utils/oauth";
import { SectionLabel, Wordmark } from "@/components/editorial";
import { ThemeToggle } from "@/components/ThemeToggle";
import authImg from "@/assets/photos/auth-gym.jpg";

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
      />
    </svg>
  );
}

export function AuthScreen({ mode }: { mode: "signin" | "signup" }) {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const isSignup = mode === "signup";

  useEffect(() => {
    checkSession().then((s) => {
      if (s.ok) window.location.href = "/dashboard";
      else setChecking(false);
    });
  }, []);

  const continueWithGoogle = async () => {
    setLoading(true);
    try {
      const url = await getGoogleAuthUrl({ data: { mode: isSignup ? "signup" : "signin" } });
      window.location.href = url;
    } catch {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          Checking your session…
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <div className="relative flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center justify-between">
          <Wordmark href="/" />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              to={isSignup ? "/signin" : "/signup"}
              className="hidden text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              {isSignup ? "I have an account" : "Create account"}
            </Link>
          </div>
        </div>

        <div className="flex flex-1 items-center py-12">
          <div className="w-full max-w-md">
            <SectionLabel index={isSignup ? "01" : "02"}>
              {isSignup ? "Create account" : "Welcome back"}
            </SectionLabel>
            <h1 className="mt-5 text-5xl font-semibold leading-[0.92] tracking-[-0.045em] sm:text-6xl">
              {isSignup ? (
                <>
                  Start your{" "}
                  <br />
                  first <span className="text-orange">week.</span>
                </>
              ) : (
                <>
                  Back to{" "}
                  <br />
                  the <span className="text-orange">work.</span>
                </>
              )}
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {isSignup
                ? "One account for your workouts, meals, coach, and progress. Free to start, no card needed."
                : "Pick up your plan, your streak, and your coach exactly where you left them."}
            </p>

            <button
              onClick={continueWithGoogle}
              disabled={loading}
              className="group mt-9 flex w-full items-center justify-between rounded-full bg-foreground py-2 pl-5 pr-2 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-60"
            >
              <span className="flex items-center gap-3">
                {loading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-background/40 border-t-background" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white">
                    <GoogleIcon className="h-4 w-4" />
                  </span>
                )}
                {loading
                  ? "Opening Google…"
                  : isSignup
                    ? "Sign up with Google"
                    : "Continue with Google"}
              </span>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange text-ink transition-transform group-hover:rotate-45">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </button>

            <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground sm:text-left">
              By continuing you agree to the{" "}
              <Link to="/" className="underline underline-offset-2 hover:text-foreground">
                terms
              </Link>{" "}
              and{" "}
              <Link to="/" className="underline underline-offset-2 hover:text-foreground">
                privacy policy
              </Link>
              .
            </p>

            <div className="mt-10 flex items-center gap-4 border-t border-border pt-6">
              {["No card required", "Indian meal plans", "Coach included"].map((item) => (
                <span
                  key={item}
                  className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} FitMentor · Built in India
        </p>
      </div>

      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <img
          src={authImg}
          alt="Athlete training in a dark gym"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/30 to-transparent" />
        <div className="absolute inset-x-10 bottom-12">
          <p className="label-micro text-orange">FitMentor</p>
          <p className="mt-4 max-w-md text-3xl font-semibold leading-tight text-cream">
            Discipline looks boring from the outside. It feels like everything from the inside.
          </p>
          <div className="mt-8 flex items-center gap-6 border-t border-white/15 pt-5">
            <div>
              <p className="text-xl font-medium text-cream">35 min</p>
              <p className="label-micro mt-1 text-cream/40">Typical session</p>
            </div>
            <div>
              <p className="text-xl font-medium text-cream">Indian-first</p>
              <p className="label-micro mt-1 text-cream/40">Meal plans</p>
            </div>
            <div>
              <p className="text-xl font-medium text-cream">24/7</p>
              <p className="label-micro mt-1 text-cream/40">AI coach</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
