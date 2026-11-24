// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// The native shell ships the app as static assets, so the mobile build skips
// Nitro entirely and emits a client-only SPA into dist-mobile.
const mobile = process.env.FITMENTOR_TARGET === "mobile";

// Server functions cannot run inside the app bundle. The mobile build swaps the
// six modules that call them for Capacitor implementations with the same
// exports, so every screen stays untouched.
const NATIVE_MODULES: Record<string, string> = {
  "@/utils/oauth": "oauth.ts",
  "@/services/api-proxy": "api-proxy.ts",
  "@/services/sync": "sync.ts",
  "@/services/coach-functions": "coach-functions.ts",
  "@/services/community-proxy": "community-proxy.ts",
  "@/services/coach-sessions.server": "coach-sessions.ts",
};

function nativeServices(): Plugin {
  const replacements = new Map(
    Object.entries(NATIVE_MODULES).map(([specifier, file]) => [
      specifier,
      new URL(`./src/services/native/${file}`, import.meta.url).pathname,
    ]),
  );

  // `resolve.alias` from the shared config maps `@` first, so a resolveId
  // hook never sees these specifiers. Rewriting the quoted specifiers in the
  // source before resolution is the reliable way to swap them.
  return {
    name: "fitmentor-native-services",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/") || id.includes("/services/native/")) return null;
      let out = code;
      for (const [specifier, target] of replacements) {
        if (!out.includes(specifier)) continue;
        out = out
          .replaceAll(`"${specifier}"`, `"${target}"`)
          .replaceAll(`'${specifier}'`, `'${target}'`);
      }
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  nitro: mobile ? false : { preset: "cloudflare-pages" },
  tanstackStart: mobile
    ? { spa: { enabled: true } }
    : {
        // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
        // nitro/vite builds from this
        server: { entry: "server" },
      },
  vite: {
    server: { allowedHosts: true },
    ...(mobile
      ? {
          plugins: [nativeServices()],
          build: { outDir: "dist-mobile", emptyOutDir: true },
        }
      : {}),
  },
});
