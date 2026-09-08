import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { exchangeGoogleCode } from "@/utils/oauth";

export const Route = createFileRoute("/auth/google/callback")({
  head: () => ({ meta: [{ title: "Signing in — FitMentor" }] }),
  component: GoogleCallback,
});

function GoogleCallback() {
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get("error");
    if (errorParam) {
      setError(
        errorParam === "consent_required"
          ? "Please authorize the app by signing in with the button below"
          : "Google authorization was cancelled or denied",
      );
      return;
    }
    const code = params.get("code");
    if (!code) {
      setError("No authorization code received from Google");
      return;
    }
    const state = params.get("state") || "";
    exchangeGoogleCode({ data: { code, state } }).then((result) => {
      if (result.ok) {
        // New user → go to onboarding; existing user → go to dashboard
        if (result.userExists === false) {
          window.location.replace("/onboarding");
        } else {
          window.location.replace("/dashboard");
        }
      } else if (result.error === "user_exists") {
        setError("An account already exists with this Google account. Please sign in instead.");
      } else if (result.error === "user_not_found") {
        setError("No account found with this Google account. Please sign up first.");
      } else {
        setError(result.error || "Authentication failed");
      }
    });
  }, []);

  if (error) {
    const isUserNotFound = error.includes("No account found");
    const ctaHref = isUserNotFound ? "/signup" : "/signin";
    const ctaLabel = isUserNotFound ? "Sign up" : "Sign in";

    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-foreground">Sign in failed</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">
            Please{" "}
            <a href={ctaHref} className="underline font-medium hover:text-foreground">
              {ctaLabel}
            </a>{" "}
            instead.
          </p>
          <a
            href={ctaHref}
            className="mt-4 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {ctaLabel} with Google
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
        Signing you in…
      </div>
    </div>
  );
}