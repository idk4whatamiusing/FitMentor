import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { reportLovableError } from "../utils/lovable-error-reporting";
import { Toaster } from "../components/ui/sonner";
import { loadTheme } from "../utils/theme";
import { NativeApp } from "../components/NativeApp";
import appCss from "../styles.css?url";

function initTheme() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", loadTheme() === "dark");
  }
}
initTheme();

// Clear legacy client-side remember cookie (replaced by KV-backed session)
if (typeof document !== "undefined") {
  document.cookie = "fitmentor_remember=; Path=/; Max-Age=0";
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center">
      <p className="label-micro text-orange">404</p>
      <h1 className="mt-5 text-6xl font-semibold leading-none tracking-[-0.05em] sm:text-8xl">
        Lost rep.
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        This page doesn't exist. Reset, breathe, and head back to the plan.
      </p>
      <Link
        to="/"
        className="mt-8 inline-flex items-center gap-3 rounded-full bg-foreground py-2 pl-6 pr-2 text-sm font-semibold text-background transition-transform hover:-translate-y-0.5"
      >
        Back home
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange text-ink">↗</span>
      </Link>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-5 text-center">
      <p className="label-micro text-orange">Error</p>
      <h1 className="mt-5 text-5xl font-semibold leading-[0.95] tracking-[-0.05em] sm:text-7xl">
        That set didn't load.
      </h1>
      <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
        Something went wrong on our end. Try again, or head back to the plan.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="inline-flex items-center rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background"
        >
          Try again
        </button>
        <a
          href="/"
          className="inline-flex items-center rounded-full border border-border px-6 py-3 text-sm font-semibold transition-colors hover:bg-secondary"
        >
          Go home
        </a>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#F7F3ED", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#0B0B0B", media: "(prefers-color-scheme: dark)" },
      { title: "FitMentor — Train like you mean it" },
      {
        name: "description",
        content:
          "AI fitness coaching for India. Personalized workouts, Indian meal plans, and a coach that knows your plan.",
      },
      { name: "author", content: "FitMentor" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "mobile-web-app-capable", content: "yes" },
      { property: "og:title", content: "FitMentor — Train like you mean it" },
      {
        property: "og:description",
        content: "Personalized workouts, Indian meal plans, and an AI coach in your pocket.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/icons/icon-32.png" },
      { rel: "icon", type: "image/png", sizes: "64x64", href: "/icons/icon-64.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <NativeApp />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <ClientOnlyToaster />
    </QueryClientProvider>
  );
}

function ClientOnlyToaster() {
  const [mounted, setMounted] = useState(false);
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    setMounted(true);
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  if (!mounted) return null;
  return <Toaster theme={isDark ? "dark" : "light"} position="top-center" />;
}
