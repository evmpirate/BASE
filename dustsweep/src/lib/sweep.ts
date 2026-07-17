import { encodeFunctionData, erc20Abi, type Address } from "viem";
import { withAttribution } from "./attribution";
import { SWAP_ROUTER_02 } from "./quote";
import type { TokenEntry } from "./registry";

// SwapRouter02's exactInputSingle — unlike the V1 router there is no deadline
// field in the struct (deadline handling moved to the optional multicall
// wrapper, which single swaps don't need).
export const swapRouter02Abi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

// Balances below this many dollars count as dust in the sweep panel.
export const DUST_THRESHOLD_USD = 5;

// 1% default slippage: dust pools are shallow and the amounts are cents —
// better to sweep with margin than to strand a revert on a moved price.
export const DEFAULT_SLIPPAGE_BPS = 100;

export function minOutFor(quoted: bigint, slippageBps = DEFAULT_SLIPPAGE_BPS): bigint {
  if (slippageBps < 0 || slippageBps > 10_000) throw new Error(`slippageBps out of range: ${slippageBps}`);
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

export type SweepPlan = {
  token: TokenEntry;
  amountIn: bigint;
  // Winning fee tier and its quoted output, from bestQuote().
  fee: number;
  quotedOut: bigint;
};

// Two calls per token — approve(router, exact amount) then the swap — ready
// for EIP-5792 sendCalls (which is why the builder-code suffix is appended
// here, same as buildRevokeCalls). Approving the exact swept amount means no
// allowance survives the sweep; DustSweep of all things must not create
// lingering approvals.
export function buildSweepCalls(
  chainId: number,
  owner: Address,
  tokenOut: Address,
  plans: SweepPlan[],
  slippageBps = DEFAULT_SLIPPAGE_BPS,
) {
  const router = SWAP_ROUTER_02[chainId];
  if (!router) throw new Error(`no SwapRouter02 registered for chain ${chainId}`);
  return plans.flatMap((p) => [
    {
      to: p.token.address,
      data: withAttribution(
        encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [router, p.amountIn],
        }),
      ),
    },
    {
      to: router,
      data: withAttribution(
        encodeFunctionData({
          abi: swapRouter02Abi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: p.token.address,
              tokenOut,
              fee: p.fee,
              recipient: owner,
              amountIn: p.amountIn,
              amountOutMinimum: minOutFor(p.quotedOut, slippageBps),
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
      ),
    },
  ]);
}
