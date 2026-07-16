import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // e2e/ holds Playwright specs (own runner); keep them out of vitest.
    exclude: ["e2e/**", "node_modules/**", ".next/**"],
  },
});
