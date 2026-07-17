import type { Address, PublicClient } from "viem";
import { base } from "wagmi/chains";

// Quoter calls are simulations (QuoterV2's functions are state-mutating by
// declaration, view by usage), so the client needs simulateContract.
type QuoteClient = Pick<PublicClient, "simulateContract">;

// Uniswap V3 periphery on Base mainnet. QuoterV2 verified live: quoting
// 0.001 WETH -> USDC over the 0.05% pool returns a sane amount; the router
// address is the same SwapRouter02 already curated as a spender.
export const QUOTER_V2: Record<number, Address> = {
  [base.id]: "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a",
};
export const SWAP_ROUTER_02: Record<number, Address> = {
  [base.id]: "0x2626664c2603336E57B271c5C0b26F421741e481",
};

export const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

// All V3 fee tiers deployed on Base: 0.01% (stable pairs), 0.05%, 0.3%, 1%.
export const FEE_TIERS = [100, 500, 3000, 10000] as const;

export type Quote = { fee: number; amountOut: bigint };

// Best single-hop quote for tokenIn -> tokenOut across the fee tiers.
// Tiers without a pool (or without liquidity) revert inside the simulation
// and just drop out; null means no pool anywhere — the token can't be swept.
export async function bestQuote(
  client: QuoteClient,
  chainId: number,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<Quote | null> {
  const quoter = QUOTER_V2[chainId];
  if (!quoter || amountIn <= 0n) return null;

  const attempts = await Promise.allSettled(
    FEE_TIERS.map((fee) =>
      client.simulateContract({
        abi: quoterV2Abi,
        address: quoter,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      }),
    ),
  );

  let best: Quote | null = null;
  attempts.forEach((attempt, i) => {
    if (attempt.status !== "fulfilled") return;
    const [amountOut] = attempt.value.result;
    if (amountOut > 0n && (!best || amountOut > best.amountOut)) {
      best = { fee: FEE_TIERS[i], amountOut };
    }
  });
  return best;
}
