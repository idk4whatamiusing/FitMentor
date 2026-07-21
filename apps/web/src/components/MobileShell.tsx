import { Link, useLocation } from "@tanstack/react-router";
import { Home, Dumbbell, Sparkles, Apple, User, Wrench, Moon, Sun } from "lucide-react";
import { type ReactNode, useState, useEffect } from "react";
import { cn } from "@/utils/cn";
import { saveTheme, loadTheme } from "@/utils/theme";

const TABS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/workouts", label: "Train", icon: Dumbbell },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/coach", label: "Coach", icon: Sparkles, accent: true },
  { to: "/nutrition", label: "Food", icon: Apple },
  { to: "/profile", label: "You", icon: User },
] as const;

export function MobileShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    saveTheme(next ? "dark" : "light");
    setIsDark(next);
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-gradient-mesh" />
      <button
        onClick={toggleTheme}
        className="fixed right-4 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-card/80 text-muted-foreground shadow-card backdrop-blur-xl transition-colors hover:text-foreground"
        style={{ top: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
      <main className="relative flex-1 pb-28 pt-safe">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-4 pb-4">
        <div className="relative flex items-center justify-around rounded-3xl border border-border/60 bg-card/70 px-1 py-2 shadow-card backdrop-blur-2xl">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = t.to === "/" ? pathname === "/" : pathname.startsWith(t.to);
            const accent = "accent" in t && t.accent;
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10px] font-medium transition-all duration-300",
                  active && !accent
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {accent ? (
                  <span
                    className={cn(
                      "-mt-7 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-hero text-primary-foreground shadow-glow ring-4 ring-background transition-transform duration-300 hover:scale-105",
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <>
                    {active && (
                      <span className="absolute -top-1 h-1 w-8 rounded-full bg-gradient-hero shadow-glow" />
                    )}
                    <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
                  </>
                )}
                <span className={accent ? "mt-1" : ""}>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
