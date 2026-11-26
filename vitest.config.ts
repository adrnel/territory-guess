import { defineConfig } from "vitest/config";

// Unit tests cover the pure game and room rules; they don't need the Worker runtime.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
