import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run Node tests (tests/node/**/*_spec.ts) under Vitest
    include: ["tests/node/**/*_spec.ts"],
    // Node tests use node:assert/strict — Vitest's expect is optional
    globals: true,
    // Isolated tests for build scripts
    pool: "forks",
    // 30s timeout for build-script tests
    testTimeout: 30_000,
  },
  resolve: {
    // Allow .ts imports from .js test files
    extensions: [".ts", ".js", ".json"],
  },
});
