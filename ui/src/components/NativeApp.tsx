import { useEffect } from "react";
import { isNative } from "@/utils/platform";

/**
 * Native-only shell behaviour. Mounted once at the root; renders nothing.
 *
 * - Android back moves through router history instead of closing the app
 * - Status bar icon colour follows the light/dark theme
 * - The WebView draws edge to edge, so CSS pads the status bar inset
 */
export function NativeApp() {
  useEffect(() => {
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
