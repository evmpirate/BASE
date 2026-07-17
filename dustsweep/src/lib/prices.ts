import type { Address, PublicClient } from "viem";
import { base } from "wagmi/chains";
import { TOKENS, type TokenEntry } from "./registry";

// Only the reads we use — keeps callers free to pass any viem client shape
// (the UI's wagmi client, a test fork client) without Chain-generic friction.
type ReadClient = Pick<PublicClient, "multicall">;

export const aggregatorV3Abi = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" },
    ],
  },
] as const;

// Chainlink AggregatorV3 proxies on Base mainnet. All are */USD feeds with
// 8-decimal answers; each address was verified on-chain (description() plus a
// fresh latestRoundData()) on 2026-07-17. No feeds are registered for Base
// Sepolia — USD values simply don't render there.
export const FEEDS: Record<number, Partial<Record<string, Address>>> = {
  [base.id]: {
    ETH: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70",
    USDC: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B",
    DAI: "0x591e79239a7d679378eC8c847e5038150364C78F",
    cbETH: "0xd7818272B9e248357d13057AAb0B417aF31E817d",
    cbBTC: "0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D",
    AERO: "0x4EC5970fC728C5f65ba413992CD5fF6FD70fcfF0",
    DEGEN: "0xE62BcE5D7CB9d16AB8b4D622538bc0A50A5799c2",
  },
};

export const FEED_DECIMALS = 8;

// Tokens whose USD price is another feed's market: WETH wraps ETH 1:1 and
// USDbC is bridged USDC — Chainlink quotes the underlying, not the wrapper.
const ALIASES: Record<string, string> = { WETH: "ETH", USDbC: "USDC" };

export function feedFor(chainId: number, symbol: string): Address | undefined {
  return FEEDS[chainId]?.[ALIASES[symbol] ?? symbol];
}

// Feeds are looked up by symbol, but symbols are spoofable — a user-added
// token can call itself "USDC". Only price a token when its ADDRESS matches
// the curated registry entry; everything else gets no USD value.
export function priceableSymbol(chainId: number, token: TokenEntry): string | undefined {
  const entry = TOKENS[chainId]?.find(
    (t) => t.address.toLowerCase() === token.address.toLowerCase(),
  );
  return entry && feedFor(chainId, entry.symbol) ? entry.symbol : undefined;
}

export type UsdPrice = {
  // 8-decimal USD price, straight from the aggregator.
  answer: bigint;
  // Unix seconds of the round's last update.
  updatedAt: number;
};

// The slowest heartbeat among the registered feeds is 24h (DAI/USD); anything
// older than that plus margin means the feed is broken — hide the value
// rather than price against a dead round.
export const MAX_PRICE_AGE_SEC = 25 * 60 * 60;

export function isFresh(price: UsdPrice, now = Math.floor(Date.now() / 1000)) {
  return now - price.updatedAt <= MAX_PRICE_AGE_SEC;
}

// One multicall over the (deduped) feeds behind `symbols`. Returns a
// symbol -> price map; symbols without a feed, failed reads, non-positive
// answers, and stale rounds are simply absent.
export async function fetchUsdPrices(
  client: ReadClient,
  chainId: number,
  symbols: string[],
  now = Math.floor(Date.now() / 1000),
): Promise<Map<string, UsdPrice>> {
  const bySymbol = new Map<string, Address>();
  for (const s of symbols) {
    const feed = feedFor(chainId, s);
    if (feed) bySymbol.set(s, feed);
  }
  const feeds = [...new Set(bySymbol.values())];
  if (feeds.length === 0) return new Map();

  const results = await client.multicall({
    contracts: feeds.map((address) => ({
      abi: aggregatorV3Abi,
      address,
      functionName: "latestRoundData" as const,
    })),
  });

  const byFeed = new Map<Address, UsdPrice>();
  feeds.forEach((address, i) => {
    const r = results[i];
    if (r.status !== "success") return;
    const [, answer, , updatedAt] = r.result as readonly [bigint, bigint, bigint, bigint, bigint];
    const price = { answer, updatedAt: Number(updatedAt) };
    if (answer > 0n && isFresh(price, now)) byFeed.set(address, price);
  });

  const out = new Map<string, UsdPrice>();
  for (const [symbol, feed] of bySymbol) {
    const price = byFeed.get(feed);
    if (price) out.set(symbol, price);
  }
  return out;
}

// Token amount -> USD as a JS number. Display-only precision: the product is
// computed in bigint and only the final scale-down goes through floating point.
export function usdValue(amount: bigint, tokenDecimals: number, price: UsdPrice): number {
  return Number(amount * price.answer) / 10 ** (tokenDecimals + FEED_DECIMALS);
}

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
