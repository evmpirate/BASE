import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ holds Playwright specs (own runner); keep them out of vitest.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    // Fork tests read through anvil, which lazily fetches mainnet state from
    // the upstream RPC — cold-cache reads in CI are far slower than the 5s
    // default. Unit tests finish in milliseconds regardless.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
