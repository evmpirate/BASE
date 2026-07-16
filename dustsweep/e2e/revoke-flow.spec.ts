import { test, expect } from "@playwright/test";

// Full UI flow against a local Base-mainnet fork, driven by the mock wallet
// (NEXT_PUBLIC_E2E=1). The mock account is a real owner with a live Permit2
// grant, so the scan surfaces genuine on-chain state — no browser wallet.
//
// Prereq: anvil fork on :8545 at FORK_BLOCK=48705000.

test("connect, switch to Base, see the real Permit2 grant", async ({ page }) => {
  // ?e2e=1 forces the mock connector + fork RPC client-side (belt-and-braces
  // with NEXT_PUBLIC_E2E, which the dev server also sets).
  await page.goto("/?e2e=1");

  // Page loaded at all?
  await expect(page.getByRole("heading", { name: /DustSweep/i })).toBeVisible();

  // Connect the mock wallet.
  await page.getByRole("button", { name: /Connect Mock Connector/i }).click();

  // Disconnect button carries the truncated address once connected.
  await expect(page.getByRole("button", { name: /Disconnect/i })).toBeVisible();

  // Default chain is Base Sepolia; switch the app to Base (mainnet fork).
  await page.getByRole("combobox").selectOption(String(8453));

  // The Permit2 section only renders when a live grant is found — its presence
  // proves the end-to-end read path (mock wallet -> wagmi -> fork -> UI).
  await expect(page.getByRole("heading", { name: /Permit2 sub-allowances/i })).toBeVisible({
    timeout: 30_000,
  });

  // And the specific real grant shows up: USDC to the Universal Router.
  const permit2Table = page.locator("table").last();
  await expect(permit2Table.getByText("USDC").first()).toBeVisible();
  await expect(permit2Table.getByText(/Universal Router/i).first()).toBeVisible();

  // The one-tx lockdown control is present (we don't click it here — that path
  // is covered by the impersonation fork test).
  await expect(page.getByRole("button", { name: /Lockdown all/i })).toBeVisible();
});
