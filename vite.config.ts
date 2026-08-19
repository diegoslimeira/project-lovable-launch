// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// LovableViteTanstackOptions["nitro"] only types the narrow, stable knobs
// (preset/output/cloudflare) — see its doc comment. `plugins` isn't in that
// type, but the wrapper spreads whatever object you pass straight into the
// real `nitro()` Vite plugin (node_modules/@lovable.dev/vite-tanstack-config/
// dist/index.js), so it works at runtime. TypeScript's "weak type" detection
// still requires at least one *declared* property to overlap even for a
// variable (not just object literals), hence the explicit `preset` below —
// it's also the documented default, so this is a no-op change in behavior.
const nitroOptions = {
  preset: "cloudflare-module",
  // Fase C.1 — registers the Cloudflare Queues consumer for the prospecting
  // pipeline (see src/lib/nitro-plugins/prospecting-queue-consumer.ts).
  plugins: ["./src/lib/nitro-plugins/prospecting-queue-consumer.ts"],
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: nitroOptions,
});
