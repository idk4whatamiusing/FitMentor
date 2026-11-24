// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// The native shell ships the app as static assets, so the mobile build skips
// Nitro entirely and emits a client-only SPA into dist-mobile.
const mobile = process.env.FITMENTOR_TARGET === "mobile";

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
    ...(mobile ? { build: { outDir: "dist-mobile", emptyOutDir: true } } : {}),
  },
});
