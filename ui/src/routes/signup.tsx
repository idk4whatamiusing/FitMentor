import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Dumbbell } from "lucide-react";
import logoImg from "@/assets/logo-v2.png";
import { getGoogleAuthUrl, checkSession } from "@/utils/oauth";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Sign Up — FitMentor" }] }),
  component: SignUpPage,
});

function SignUpPage() {
  const [loading, setLoading] = useState<"" | "google">("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkSession().then((s) => {
      if (s.ok) {
        window.location.href = "/dashboard";
      } else {
        setChecking(false);
      }
    });
  }, []);

  const signUpGoogle = async () => {
    setLoading("google");
    const url = await getGoogleAuthUrl({ data: { mode: "signup" } });
    window.location.href = url;
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
          Signing you in…
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-gradient-mesh" />

      <nav className="relative flex items-center justify-between px-5 pt-6 pb-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logoImg} alt="FitMentor" className="h-9 w-9 object-contain" />
          <span className="text-lg font-bold tracking-tight">FitMentor AI</span>
        </Link>
      </nav>

      <div className="relative flex flex-1 items-center justify-center px-5">
        <div className="w-full max-w-sm">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-hero shadow-glow">
              <Dumbbell className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="mt-6 text-2xl font-bold tracking-tight">Create your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              AI-powered workouts, Indian meal plans, and your personal coach
            </p>
          </div>

          <div className="mt-8 space-y-3">
            <button
              onClick={signUpGoogle}
              disabled={!!loading}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-card/70 px-6 py-3.5 text-sm font-semibold transition hover:bg-accent/30 active:scale-[0.98] disabled:opacity-60"
            >
              {loading === "google" ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
                  <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z" />
                </svg>
              )}
              Sign up with Google
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-muted-foreground">
              By continuing, you agree to our{" "}
              <Link to="/" className="underline hover:text-foreground">Terms</Link>
              {" "}and{" "}
              <Link to="/" className="underline hover:text-foreground">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
