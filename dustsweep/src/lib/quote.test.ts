import { describe, expect, it } from "vitest";
import { base, baseSepolia } from "wagmi/chains";
import { FEE_TIERS, bestQuote } from "./quote";

const WETH = "0x4200000000000000000000000000000000000006" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

// Fake client: per-fee-tier canned amountOut, or a revert (no pool).
function fakeClient(byFee: Record<number, bigint | "revert">) {
  return {
    simulateContract: async ({ args }: { args: readonly [{ fee: number }] }) => {
      const out = byFee[args[0].fee];
      if (out === undefined || out === "revert") throw new Error("Unexpected error");
      return { result: [out, 0n, 0, 0n] as const };
    },
  } as unknown as Parameters<typeof bestQuote>[0];
}

describe("bestQuote", () => {
  it("picks the tier with the highest output among live pools", async () => {
    const client = fakeClient({ 100: "revert", 500: 1_884_681n, 3000: 1_880_000n, 10000: "revert" });
    expect(await bestQuote(client, base.id, WETH, USDC, 10n ** 15n)).toEqual({
      fee: 500,
      amountOut: 1_884_681n,
    });
  });

  it("returns null when every tier reverts (token has no pool)", async () => {
    const client = fakeClient({});
    expect(await bestQuote(client, base.id, WETH, USDC, 10n ** 15n)).toBeNull();
  });

  it("ignores zero-output quotes from dust-empty pools", async () => {
    const client = fakeClient({ 100: 0n, 500: 0n, 3000: 0n, 10000: 0n });
    expect(await bestQuote(client, base.id, WETH, USDC, 1n)).toBeNull();
  });

  it("declines chains without a quoter and non-positive inputs", async () => {
    const client = {
      simulateContract: async () => {
        throw new Error("must not be called");
      },
    } as unknown as Parameters<typeof bestQuote>[0];
    expect(await bestQuote(client, baseSepolia.id, WETH, USDC, 10n ** 15n)).toBeNull();
    expect(await bestQuote(client, base.id, WETH, USDC, 0n)).toBeNull();
  });

  it("tries every deployed fee tier exactly once", async () => {
    const seen: number[] = [];
    const client = {
      simulateContract: async ({ args }: { args: readonly [{ fee: number }] }) => {
        seen.push(args[0].fee);
        return { result: [1n, 0n, 0, 0n] as const };
      },
    } as unknown as Parameters<typeof bestQuote>[0];
    await bestQuote(client, base.id, WETH, USDC, 1n);
    expect(seen.sort((a, b) => a - b)).toEqual([...FEE_TIERS]);
  });
});
