import { describe, expect, it } from "vitest";
import { base } from "wagmi/chains";
import { scanBalances, withUsd, type BalanceFinding } from "./balances";
import { TOKENS } from "./registry";
import type { UsdPrice } from "./prices";

const NOW = 1_800_000_000;
const OWNER = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D" as const;

const USDC = TOKENS[base.id].find((t) => t.symbol === "USDC")!;
const WETH = TOKENS[base.id].find((t) => t.symbol === "WETH")!;
const DEGEN = TOKENS[base.id].find((t) => t.symbol === "DEGEN")!;

function fakeClient(balances: Record<string, bigint | "revert">) {
  return {
    multicall: async ({ contracts }: { contracts: { address: string }[] }) =>
      contracts.map(({ address }) => {
        const b = balances[address];
        if (b === undefined || b === "revert") return { status: "failure" as const, error: new Error("revert") };
        return { status: "success" as const, result: b };
      }),
  } as unknown as Parameters<typeof scanBalances>[0];
}

describe("scanBalances", () => {
  it("keeps positive balances, drops zeros and failed reads", async () => {
    const client = fakeClient({
      [USDC.address]: 3_190000n,
      [WETH.address]: 0n,
      [DEGEN.address]: "revert",
    });
    const findings = await scanBalances(client, OWNER, [USDC, WETH, DEGEN]);
    expect(findings).toEqual([{ token: USDC, balance: 3_190000n }]);
  });

  it("short-circuits on an empty token list without calling the client", async () => {
    const client = {
      multicall: async () => {
        throw new Error("must not be called");
      },
    } as unknown as Parameters<typeof scanBalances>[0];
    expect(await scanBalances(client, OWNER, [])).toEqual([]);
  });
});

describe("withUsd", () => {
  // Keyed by requested symbol, exactly as fetchUsdPrices returns it — the
  // WETH->ETH aliasing already happened inside the fetch.
  const prices = new Map<string, UsdPrice>([
    ["USDC", { answer: 100_000_000n, updatedAt: NOW }],
    ["WETH", { answer: 2000_00000000n, updatedAt: NOW }],
  ]);

  it("values priced tokens and leaves unpriced ones undefined, not zero", () => {
    const findings: BalanceFinding[] = [
      { token: USDC, balance: 3_190000n },
      { token: WETH, balance: 10n ** 15n },
      { token: DEGEN, balance: 10n ** 18n }, // no DEGEN entry in this price map
    ];
    const rows = withUsd(base.id, findings, prices);
    expect(rows[0].usd).toBeCloseTo(3.19, 6);
    expect(rows[1].usd).toBeCloseTo(2, 6);
    expect(rows[2].usd).toBeUndefined();
  });

  it("never prices a custom token spoofing a curated symbol", () => {
    const spoof = { ...USDC, address: "0x000000000000000000000000000000000000dEaD" } as const;
    const rows = withUsd(base.id, [{ token: spoof, balance: 10n ** 6n }], prices);
    expect(rows[0].usd).toBeUndefined();
  });
});
