import { defineConfig, devices } from "@playwright/test";

// E2E against a local anvil fork of Base mainnet. Start the fork first
// (FORK_BLOCK=48705000 ../scripts/anvil-fork.sh), then `npm run e2e`.
// Playwright boots the Next dev server in E2E mode (mock wallet + fork RPC).
//
// Browser system libs: `npx playwright install --with-deps chromium` (CI does
// this). Bare WSL/containers may lack libnspr4/libnss3 and need that step.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "NEXT_PUBLIC_E2E=1 npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { NEXT_PUBLIC_E2E: "1" },
  },
});
