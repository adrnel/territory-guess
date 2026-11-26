import { bindings, defineConfig, defineWorker, exports } from "cf/config";

// Everything here is available on the Cloudflare Workers Free plan.
export default defineConfig({
  worker: defineWorker({
    name: "territory-guess",
    // Custom entry: wraps the vinext (Next.js) handler and adds the
    // duel WebSocket route + the Room Durable Object export.
    entrypoint: "./worker/index.ts",
    compatibilityDate: "2026-11-13",
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    observability: { enabled: true },
    env: {
      ASSETS: bindings.assets(),
      // Leaderboard + solo game sessions. Created automatically on first deploy.
      DB: bindings.d1({ name: "territory-guess-db" }),
      // One Durable Object per duel room.
      ROOM: bindings.durableObject({ worker: "territory-guess", exportName: "Room" }),
      // Per-IP abuse controls.
      API_LIMITER: bindings.rateLimit({ namespace: "2001", simple: { limit: 150, period: 60 } }),
      CREATE_LIMITER: bindings.rateLimit({ namespace: "2002", simple: { limit: 12, period: 60 } }),
    },
    exports: {
      Room: exports.durableObject({ storage: "sqlite" }),
    },
  }),
});
