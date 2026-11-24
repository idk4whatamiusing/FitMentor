import { Capacitor } from "@capacitor/core";

/** True when running inside the Capacitor shell on Android or iOS. */
export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** "android" | "ios" | "web" */
export function platformName(): string {
  return Capacitor.getPlatform();
}

/**
 * Opens a URL outside the app. On native this uses the system browser so
 * checkout pages, OAuth consent screens and terms links are not trapped in
 * the WebView.
 */
export async function openExternal(url: string): Promise<void> {
  if (isNative()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.location.href = url;
}
