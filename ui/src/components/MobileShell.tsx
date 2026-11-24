import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Home, Dumbbell, Sparkles, Apple, User, Wrench } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { cn } from "@/utils/cn";
import { Wordmark } from "@/components/editorial";
import { ThemeToggle } from "@/components/ThemeToggle";
import { fetchLogRange, syncLocalLogs, upsertTodayLog } from "@/services/sync";
import { allLogs, ensureToday, mergeServerLogs, todayKey } from "@/utils/habits";

const TABS = [
  { to: "/dashboard", label: "Home", icon: Home },
  { to: "/workouts", label: "Train", icon: Dumbbell },
  { to: "/nutrition", label: "Food", icon: Apple },
  { to: "/coach", label: "Coach", icon: Sparkles, accent: true },
  { to: "/tools", label: "Tools", icon: Wrench },
  { to: "/profile", label: "You", icon: User },
] as const;

function isActive(pathname: string, to: string) {
  return to === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(to);
}

let logsHydrated = false;

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function MobileShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const { pathname } = useLocation();
  const fetchRange = useServerFn(fetchLogRange);
  const syncLogs = useServerFn(syncLocalLogs);
  const upsertLog = useServerFn(upsertTodayLog);

  useEffect(() => {
    if (logsHydrated) return;
    logsHydrated = true;
    const local = allLogs();
    syncLogs({ data: { logs: local } })
      .catch(() => null)
      .then(() => fetchRange({ data: { from: daysAgo(120), to: todayKey() } }))
      .then((remote) => mergeServerLogs(remote as Parameters<typeof mergeServerLogs>[0]))
      .catch(() => null);
  }, [syncLogs, fetchRange]);

  useEffect(() => {
    const syncToday = () => {
      const log = ensureToday();
      if (!log.water && !log.sleep && !log.steps && !log.proteinG && !log.workoutDone) return;
      upsertLog({ data: log }).catch(() => undefined);
    };
    window.addEventListener("fitmentor:logs", syncToday);
    return () => window.removeEventListener("fitmentor:logs", syncToday);
  }, [upsertLog]);

  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-5 lg:h-16 lg:px-8">
          <Wordmark href="/dashboard" />

          <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
            {TABS.map((tab) => {
              const active = isActive(pathname, tab.to);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "label-micro relative py-2 transition-colors",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tab.label}
                  {active ? (
                    <span className="absolute -bottom-0.5 left-0 h-0.5 w-full bg-orange" aria-hidden />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className={cn("mx-auto w-full", wide ? "max-w-7xl" : "max-w-6xl", "pb-28 md:pb-16")}>
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] md:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto flex max-w-md items-center justify-between rounded-[1.9rem] bg-card/95 px-1.5 py-2 shadow-dock ring-1 ring-black/[0.04] backdrop-blur-xl dark:ring-white/[0.06]">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(pathname, tab.to);
            const accent = "accent" in tab && tab.accent;
            return (
              <Link
                key={tab.to}
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className="flex flex-1 flex-col items-center gap-1 py-0.5"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                    active
                      ? accent
                        ? "bg-orange text-ink"
                        : "bg-foreground text-background"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </span>
                <span
                  className={cn(
                    "text-[9px] font-semibold uppercase tracking-[0.12em]",
                    active ? "text-foreground" : "text-muted-foreground/70",
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export const AppShell = MobileShell;
