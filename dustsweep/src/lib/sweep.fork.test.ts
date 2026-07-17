import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createTestClient, createWalletClient, erc20Abi, http, parseEther } from "viem";
import { base } from "viem/chains";
import { bestQuote, SWAP_ROUTER_02 } from "./quote";
import { buildSweepCalls, minOutFor, type SweepPlan } from "./sweep";
import { TOKENS } from "./registry";

// End-to-end sweep against a LOCAL FORK (see scan.fork.test.ts for setup):
//   FORK_BLOCK=48705000 ../scripts/anvil-fork.sh
//   RUN_FORK=1 npx vitest run src/lib/sweep.fork.test.ts
//
// Deterministic fixture, no external holder needed: an impersonated fresh
// address wraps ETH into WETH (deposit() is permissionless), then runs the
// exact calls buildSweepCalls produces through the REAL SwapRouter02 and the
// REAL WETH/USDC pool, asserting the quoted USDC actually arrives.
const ANVIL_RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
// Fresh throwaway address — nothing at it on mainnet, exists only on the fork.
const SWEEPER = "0x1000000000000000000000000000000000000001" as const;

const transport = http(ANVIL_RPC);
const publicClient = createPublicClient({ chain: base, transport });
const testClient = createTestClient({ chain: base, mode: "anvil", transport });
const walletClient = createWalletClient({ chain: base, transport });

const WETH = TOKENS[base.id].find((t) => t.symbol === "WETH")!;
const USDC = TOKENS[base.id].find((t) => t.symbol === "USDC")!;

const wethDepositAbi = [
  { type: "function", name: "deposit", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

describe.runIf(process.env.RUN_FORK)("fork: sweep WETH dust into USDC", () => {
  let snapshot: `0x${string}`;
  beforeAll(async () => {
    snapshot = await testClient.snapshot();
    await testClient.impersonateAccount({ address: SWEEPER });
    await testClient.setBalance({ address: SWEEPER, value: parseEther("1") });
  });
  afterAll(async () => {
    await testClient.stopImpersonatingAccount({ address: SWEEPER });
    await testClient.revert({ id: snapshot });
  });

  it("executes the built calls and receives at least the slippage floor", async () => {
    const dust = parseEther("0.001");
    const deposit = await walletClient.writeContract({
      account: SWEEPER,
      address: WETH.address,
      abi: wethDepositAbi,
      functionName: "deposit",
      value: dust,
    });
    await publicClient.waitForTransactionReceipt({ hash: deposit });

    const quote = await bestQuote(publicClient, base.id, WETH.address, USDC.address, dust);
    expect(quote).not.toBeNull();
    // Which tier wins depends on live liquidity (at this pin the 0.01% pool
    // beats the "deep" 0.05% one for dust-sized input) — assert sanity of the
    // output, not a particular tier. 0.001 ETH ≈ $1-2 of USDC.
    expect(quote!.amountOut).toBeGreaterThan(500_000n); // > $0.50
    expect(quote!.amountOut).toBeLessThan(100_000_000n); // < $100

    const plan: SweepPlan = { token: WETH, amountIn: dust, fee: quote!.fee, quotedOut: quote!.amountOut };
    const before = await publicClient.readContract({
      address: USDC.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [SWEEPER],
    });

    // Send the exact call sequence the UI would hand to sendCalls.
    for (const call of buildSweepCalls(base.id, SWEEPER, USDC.address, [plan])) {
      const hash = await walletClient.sendTransaction({ account: SWEEPER, to: call.to, data: call.data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      expect(receipt.status).toBe("success");
    }

    const received =
      (await publicClient.readContract({
        address: USDC.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [SWEEPER],
      })) - before;
    expect(received).toBeGreaterThanOrEqual(minOutFor(quote!.amountOut));

    // The exact-amount approval must be fully consumed — nothing lingering.
    const allowance = await publicClient.readContract({
      address: WETH.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [SWEEPER, SWAP_ROUTER_02[base.id]],
    });
    expect(allowance).toBe(0n);

    // And the WETH dust is gone.
    const wethLeft = await publicClient.readContract({
      address: WETH.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [SWEEPER],
    });
    expect(wethLeft).toBe(0n);
  });
});
