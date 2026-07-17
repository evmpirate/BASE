import { describe, expect, it } from "vitest";
import { base, baseSepolia } from "wagmi/chains";
import {
  FEEDS,
  MAX_PRICE_AGE_SEC,
  feedFor,
  fetchUsdPrices,
  formatUsd,
  isFresh,
  priceableSymbol,
  usdValue,
  type UsdPrice,
} from "./prices";

const NOW = 1_800_000_000;

// A fake viem client: multicall returns one canned latestRoundData tuple per
// requested feed, so tests control prices, staleness, and failures exactly.
function fakeClient(answers: Record<string, { answer: bigint; updatedAt?: number; fail?: boolean }>) {
  return {
    multicall: async ({ contracts }: { contracts: { address: string }[] }) =>
      contracts.map(({ address }) => {
        const a = answers[address];
        if (!a || a.fail) return { status: "failure" as const, error: new Error("revert") };
        return {
          status: "success" as const,
          result: [1n, a.answer, 0n, BigInt(a.updatedAt ?? NOW), 1n] as const,
        };
      }),
    // Structural stand-in for Pick<PublicClient, "multicall">.
  } as unknown as Parameters<typeof fetchUsdPrices>[0];
}

const ETH_FEED = FEEDS[base.id].ETH!;
const USDC_FEED = FEEDS[base.id].USDC!;

describe("feedFor", () => {
  it("resolves direct symbols and wrapper aliases to the same feeds", () => {
    expect(feedFor(base.id, "ETH")).toBe(ETH_FEED);
    expect(feedFor(base.id, "WETH")).toBe(ETH_FEED);
    expect(feedFor(base.id, "USDbC")).toBe(USDC_FEED);
  });

  it("knows nothing about unlisted symbols or chains without feeds", () => {
    expect(feedFor(base.id, "SHIBAINU2")).toBeUndefined();
    expect(feedFor(baseSepolia.id, "ETH")).toBeUndefined();
  });
});

describe("fetchUsdPrices", () => {
  it("dedupes aliased symbols into one feed read and maps both back", async () => {
    let calls = 0;
    const client = {
      multicall: async ({ contracts }: { contracts: { address: string }[] }) => {
        calls += 1;
        expect(contracts).toHaveLength(1); // WETH + ETH -> single ETH/USD read
        return [{ status: "success" as const, result: [1n, 2000_00000000n, 0n, BigInt(NOW), 1n] as const }];
      },
    } as unknown as Parameters<typeof fetchUsdPrices>[0];
    const prices = await fetchUsdPrices(client, base.id, ["WETH", "ETH"], NOW);
    expect(calls).toBe(1);
    expect(prices.get("WETH")?.answer).toBe(2000_00000000n);
    expect(prices.get("ETH")?.answer).toBe(2000_00000000n);
  });

  it("omits failed reads, non-positive answers, and stale rounds", async () => {
    const client = fakeClient({
      [ETH_FEED]: { answer: 2000_00000000n, updatedAt: NOW - MAX_PRICE_AGE_SEC - 1 },
      [USDC_FEED]: { answer: 0n },
      [FEEDS[base.id].DAI!]: { answer: 1_00000000n, fail: true },
      [FEEDS[base.id].AERO!]: { answer: 48203950n },
    });
    const prices = await fetchUsdPrices(client, base.id, ["ETH", "USDC", "DAI", "AERO"], NOW);
    expect(prices.has("ETH")).toBe(false);
    expect(prices.has("USDC")).toBe(false);
    expect(prices.has("DAI")).toBe(false);
    expect(prices.get("AERO")?.answer).toBe(48203950n);
  });

  it("short-circuits to an empty map when no symbol has a feed", async () => {
    const client = {
      multicall: async () => {
        throw new Error("must not be called");
      },
    } as unknown as Parameters<typeof fetchUsdPrices>[0];
    expect(await fetchUsdPrices(client, baseSepolia.id, ["ETH", "USDC"], NOW)).toEqual(new Map());
  });
});

describe("priceableSymbol", () => {
  it("prices curated tokens by address, not by whatever symbol they claim", () => {
    const realUsdc = { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 } as const;
    const spoof = { ...realUsdc, address: "0x000000000000000000000000000000000000dEaD" } as const;
    expect(priceableSymbol(base.id, realUsdc)).toBe("USDC");
    // Case-insensitive address match — checksummed vs lowercased input.
    expect(priceableSymbol(base.id, { ...realUsdc, address: realUsdc.address.toLowerCase() as `0x${string}` })).toBe("USDC");
    expect(priceableSymbol(base.id, spoof)).toBeUndefined();
    expect(priceableSymbol(baseSepolia.id, realUsdc)).toBeUndefined();
  });
});

describe("isFresh", () => {
  it("accepts anything up to the max age and rejects older rounds", () => {
    const price: UsdPrice = { answer: 1n, updatedAt: NOW - MAX_PRICE_AGE_SEC };
    expect(isFresh(price, NOW)).toBe(true);
    expect(isFresh({ ...price, updatedAt: NOW - MAX_PRICE_AGE_SEC - 1 }, NOW)).toBe(false);
  });
});

describe("usdValue", () => {
  const eth2000: UsdPrice = { answer: 2000_00000000n, updatedAt: NOW };

  it("scales token decimals and feed decimals together", () => {
    // 0.5 WETH at $2000 = $1000 (float-close: the divisor 1e26 is not exact)
    expect(usdValue(5n * 10n ** 17n, 18, eth2000)).toBeCloseTo(1000, 9);
    // 3.19 USDC at $0.9999 ≈ $3.1897
    const usdc: UsdPrice = { answer: 99986235n, updatedAt: NOW };
    expect(usdValue(3_190000n, 6, usdc)).toBeCloseTo(3.1896, 3);
  });

  it("keeps precision for dust-sized amounts", () => {
    // 100 wei of an 18-dec token — far below a cent but not zero
    expect(usdValue(100n, 18, eth2000)).toBeCloseTo(2e-13, 20);
  });
});

describe("formatUsd", () => {
  it("renders cents, thousands separators, and a sub-cent floor", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.004)).toBe("<$0.01");
    expect(formatUsd(3.19)).toBe("$3.19");
    expect(formatUsd(63044.81)).toBe("$63,044.81");
  });
});
