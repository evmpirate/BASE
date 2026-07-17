import { test, expect } from "@playwright/test";
import { createPublicClient, createTestClient, createWalletClient, http, parseEther } from "viem";
import { base } from "viem/chains";

// Sweep panel against the local Base-mainnet fork (same rig as
// revoke-flow.spec.ts). The mock account gets real WETH dust minted on the
// fork first — deposit() is permissionless — so the panel surfaces a genuine
// balance, prices it via the real Chainlink feed, and quotes the real V3
// pools. Additive state only (a deposit), so ordering against the revoke
// spec doesn't matter.
const ANVIL_RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const MOCK_ACCOUNT = (process.env.NEXT_PUBLIC_E2E_ACCOUNT ??
  "0xfa2d07e06a6eb3488698fe13981a17c33f93c829") as `0x${string}`;
const WETH = "0x4200000000000000000000000000000000000006" as const;

const transport = http(ANVIL_RPC);
const publicClient = createPublicClient({ chain: base, transport });
const testClient = createTestClient({ chain: base, mode: "anvil", transport });
const walletClient = createWalletClient({ chain: base, transport });

test.beforeAll(async () => {
  await testClient.impersonateAccount({ address: MOCK_ACCOUNT });
  await testClient.setBalance({ address: MOCK_ACCOUNT, value: parseEther("1") });
  const hash = await walletClient.writeContract({
    account: MOCK_ACCOUNT,
    address: WETH,
    abi: [{ type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] }] as const,
    functionName: "deposit",
    value: parseEther("0.0005"), // ≈ $1 — squarely under the $5 dust threshold
  });
  await publicClient.waitForTransactionReceipt({ hash });
  await testClient.stopImpersonatingAccount({ address: MOCK_ACCOUNT });
});

test("sweep panel lists the dust, quotes a route, and builds a selection", async ({ page }) => {
  await page.goto("/?e2e=1");
  await page.getByRole("button", { name: /Connect Mock Connector/i }).click();
  await expect(page.getByRole("button", { name: /Disconnect/i })).toBeVisible();
  await page.getByRole("combobox").selectOption(String(8453));

  const heading = page.getByRole("heading", { name: /Sweep dust/i });
  await expect(heading).toBeVisible({ timeout: 30_000 });

  // The WETH dust row is found by the balance scan. NOTE: no USD estimate and
  // no auto-pre-selection here — the fork is pinned >25h in the past, so the
  // Chainlink rounds it serves are (correctly) rejected as stale by the app.
  // The USD pipeline is covered by prices.fork.test.ts against the fork's
  // frozen clock instead.
  const sweepTable = page.locator("table", { has: page.getByRole("cell", { name: "WETH", exact: true }) });

  // A real quote from the fork's V3 pools, tier included.
  await expect(sweepTable.getByText(/USDC/).first()).toBeVisible({ timeout: 60_000 });
  await expect(sweepTable.getByText(/via 0\.\d+% pool/).first()).toBeVisible();

  // Quote in hand, the row is manually selectable and the batch button counts
  // it…
  await page.getByRole("checkbox", { name: "Sweep WETH" }).check();
  await expect(page.getByRole("button", { name: /Sweep selected \([1-9]\d*\) → USDC/ })).toBeVisible();
  // …but mainnet writes stay disarmed behind the arm checkbox.
  await expect(page.getByRole("button", { name: /Sweep selected/ })).toBeDisabled();
});
