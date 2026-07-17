import { erc20Abi, type Address, type PublicClient } from "viem";
import { priceableSymbol, usdValue, type UsdPrice } from "./prices";
import type { TokenEntry } from "./registry";

// Only the reads we use — keeps callers free to pass any viem client shape
// (the UI's wagmi client, a test fork client) without Chain-generic friction.
type ReadClient = Pick<PublicClient, "multicall">;

export type BalanceFinding = { token: TokenEntry; balance: bigint };

// One multicall of balanceOf over the token list; zero balances and failed
// reads (a non-token address slipping through) are dropped.
export async function scanBalances(
  client: ReadClient,
  owner: Address,
  tokens: TokenEntry[],
): Promise<BalanceFinding[]> {
  if (tokens.length === 0) return [];
  const results = await client.multicall({
    contracts: tokens.map((t) => ({
      abi: erc20Abi,
      address: t.address,
      functionName: "balanceOf" as const,
      args: [owner] as const,
    })),
  });
  return tokens
    .map((token, i) => ({
      token,
      balance: results[i].status === "success" ? (results[i].result as bigint) : 0n,
    }))
    .filter((f) => f.balance > 0n);
}

// Attach a USD value where a trustworthy feed exists (curated address match —
// see priceableSymbol); tokens without one keep usd undefined, which callers
// must treat as "unknown", never as zero.
export function withUsd(
  chainId: number,
  findings: BalanceFinding[],
  prices: Map<string, UsdPrice>,
): (BalanceFinding & { usd?: number })[] {
  return findings.map((f) => {
    const symbol = priceableSymbol(chainId, f.token);
    const price = symbol ? prices.get(symbol) : undefined;
    return price ? { ...f, usd: usdValue(f.balance, f.token.decimals, price) } : f;
  });
}
