import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { TOKENS } from "./registry";
import { FEED_DECIMALS, fetchUsdPrices, usdValue } from "./prices";

// Integration test against a LOCAL FORK of Base mainnet (same rig as
// scan.fork.test.ts):
//   FORK_BLOCK=48705000 ../scripts/anvil-fork.sh   (from the repo root)
//   RUN_FORK=1 npx vitest run src/lib/prices.fork.test.ts
// The fork serves the real Chainlink aggregators, so this exercises the
// actual proxy contracts and answer scaling — no mocks.
const ANVIL_RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";

const client = createPublicClient({ chain: base, transport: http(ANVIL_RPC) });

describe.runIf(process.env.RUN_FORK)("fork: real Chainlink feeds", () => {
  it("prices every registry token that has a feed, at sane magnitudes", async () => {
    // Freshness must be judged against the fork's frozen clock, not ours —
    // the pinned block only gets older in wall-clock terms.
    const { timestamp } = await client.getBlock();
    const symbols = TOKENS[base.id].map((t) => t.symbol);
    const prices = await fetchUsdPrices(client, base.id, symbols, Number(timestamp));

    // Every curated mainnet token except AERO-style gaps should resolve; at
    // minimum the majors must be present.
    for (const s of ["USDC", "WETH", "USDbC", "DAI", "cbETH", "cbBTC"]) {
      expect(prices.has(s), `missing price for ${s}`).toBe(true);
    }

    const dollars = (s: string) => usdValue(10n ** BigInt(FEED_DECIMALS), FEED_DECIMALS, prices.get(s)!);
    // Stablecoins hug $1; ETH-family and BTC-family sit in broad sanity bands.
    expect(dollars("USDC")).toBeGreaterThan(0.95);
    expect(dollars("USDC")).toBeLessThan(1.05);
    expect(dollars("DAI")).toBeGreaterThan(0.95);
    expect(dollars("DAI")).toBeLessThan(1.05);
    expect(dollars("WETH")).toBeGreaterThan(100);
    expect(dollars("WETH")).toBeLessThan(1_000_000);
    expect(dollars("cbBTC")).toBeGreaterThan(1_000);
    expect(dollars("cbBTC")).toBeLessThan(10_000_000);
    // cbETH stakes ETH, so it should never trade far below ETH itself.
    expect(dollars("cbETH")).toBeGreaterThan(dollars("WETH") * 0.8);
  });

  it("aliases read the underlying market: WETH and USDbC equal ETH and USDC", async () => {
    const { timestamp } = await client.getBlock();
    const prices = await fetchUsdPrices(client, base.id, ["ETH", "WETH", "USDC", "USDbC"], Number(timestamp));
    expect(prices.get("WETH")).toEqual(prices.get("ETH"));
    expect(prices.get("USDbC")).toEqual(prices.get("USDC"));
  });
});
