import { defineConfig } from "vitest/config";

// Fork runs (RUN_FORK=1) share ONE anvil instance whose upstream fetches are
// effectively serialized — parallel test files just queue behind each other
// and blow per-test budgets as the suite grows (bit us in CI when the new
// sweep tests pushed the OLD scan/lockdown tests over 30s). So under
// RUN_FORK: files run serially and budgets assume a cold anvil cache.
const FORK = Boolean(process.env.RUN_FORK);

export default defineConfig({
  test: {
    // e2e/ holds Playwright specs (own runner); keep them out of vitest.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
    fileParallelism: !FORK,
    // Fork tests read through anvil, which lazily fetches mainnet state from
    // the upstream RPC — cold-cache reads in CI are far slower than the 5s
    // default. Unit tests finish in milliseconds regardless.
    testTimeout: FORK ? 120_000 : 30_000,
    hookTimeout: FORK ? 120_000 : 30_000,
  },
});
