import { useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { isNative, platformName } from "@/utils/platform";
import { ensureSession } from "@/services/native/oauth";

/**
 * Native-only shell behaviour. Mounted once at the root; renders nothing.
 *
 * - Android back moves through router history instead of closing the app
 * - Status bar icon colour follows the light/dark theme
 * - The WebView draws edge to edge, so CSS pads the status bar inset
 */
export function NativeApp() {
  useEffect(() => {
    document.documentElement.dataset.platform = platformName();
    if (!isNative()) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    void (async () => {
      const [{ StatusBar, Style }, { App }] = await Promise.all([
        import("@capacitor/status-bar"),
        import("@capacitor/app"),
      ]);
      if (disposed) return;

      await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);

      const applyTheme = () => {
        const dark = document.documentElement.classList.contains("dark");
        void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(
          () => undefined,
        );
      };
      applyTheme();

      const observer = new MutationObserver(applyTheme);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      cleanups.push(() => observer.disconnect());

      const back = await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) window.history.back();
        else void App.minimizeApp();
      });
      cleanups.push(() => void back.remove());
    })();

    return () => {
      disposed = true;
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return null;
}

const PUBLIC_PATHS = new Set(["/", "/signin", "/signup"]);

/**
 * Keeps private routes from mounting until the stored token is verified.
 *
 * This has to wrap <Outlet />: a guard inside a page shell lets that page's
 * own effects run first, which sent signed-out users to onboarding instead of
 * sign-in.
 */
export function NativeAuthGate({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const guarded = isNative() && !PUBLIC_PATHS.has(pathname);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!guarded) return;
    let alive = true;
    ensureSession().then((ok) => {
      if (!alive) return;
      if (ok) setVerified(true);
      else navigate({ to: "/signin", replace: true });
    });
    return () => {
      alive = false;
    };
  }, [guarded, navigate]);

  if (guarded && !verified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
