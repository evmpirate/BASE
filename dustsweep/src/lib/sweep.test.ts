import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { base, baseSepolia } from "wagmi/chains";
import { DATA_SUFFIX } from "./attribution";
import { SWAP_ROUTER_02 } from "./quote";
import { buildSweepCalls, minOutFor, swapRouter02Abi, type SweepPlan } from "./sweep";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const OWNER = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D" as const;
const ROUTER = SWAP_ROUTER_02[base.id];

const plan: SweepPlan = {
  token: { symbol: "DEGEN", address: "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", decimals: 18 },
  amountIn: 1_000_000_000_000_000_000n,
  fee: 3000,
  quotedOut: 1_149n,
};

// Trailing builder-code suffix must be stripped before ABI-decoding.
function core(data: `0x${string}`) {
  expect(data.endsWith(DATA_SUFFIX.slice(2))).toBe(true);
  return data.slice(0, data.length - (DATA_SUFFIX.length - 2)) as `0x${string}`;
}

describe("minOutFor", () => {
  it("applies default 1% slippage with bigint floor", () => {
    expect(minOutFor(10_000n)).toBe(9_900n);
    expect(minOutFor(999n)).toBe(989n);
  });

  it("supports custom tolerances and rejects nonsense", () => {
    expect(minOutFor(10_000n, 0)).toBe(10_000n);
    expect(minOutFor(10_000n, 10_000)).toBe(0n);
    expect(() => minOutFor(10_000n, -1)).toThrow();
    expect(() => minOutFor(10_000n, 10_001)).toThrow();
  });
});

describe("buildSweepCalls", () => {
  it("emits an exact-amount approve then the swap, both attributed", () => {
    const calls = buildSweepCalls(base.id, OWNER, USDC, [plan]);
    expect(calls).toHaveLength(2);

    const approve = decodeFunctionData({ abi: erc20Abi, data: core(calls[0].data) });
    expect(calls[0].to).toBe(plan.token.address);
    expect(approve.functionName).toBe("approve");
    // Exact amount, not unlimited — the sweep must not leave an allowance behind.
    expect(approve.args).toEqual([ROUTER, plan.amountIn]);

    const swap = decodeFunctionData({ abi: swapRouter02Abi, data: core(calls[1].data) });
    expect(calls[1].to).toBe(ROUTER);
    expect(swap.functionName).toBe("exactInputSingle");
    expect(swap.args[0]).toEqual({
      tokenIn: plan.token.address,
      tokenOut: USDC,
      fee: plan.fee,
      recipient: OWNER,
      amountIn: plan.amountIn,
      amountOutMinimum: minOutFor(plan.quotedOut),
      sqrtPriceLimitX96: 0n,
    });
  });

  it("orders multiple plans as approve/swap pairs", () => {
    const second: SweepPlan = { ...plan, token: { symbol: "AERO", address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", decimals: 18 } };
    const calls = buildSweepCalls(base.id, OWNER, USDC, [plan, second]);
    expect(calls.map((c) => c.to)).toEqual([plan.token.address, ROUTER, second.token.address, ROUTER]);
  });

  it("honors a custom slippage tolerance", () => {
    const calls = buildSweepCalls(base.id, OWNER, USDC, [plan], 500);
    const swap = decodeFunctionData({ abi: swapRouter02Abi, data: core(calls[1].data) });
    expect(swap.args[0].amountOutMinimum).toBe(minOutFor(plan.quotedOut, 500));
  });

  it("refuses chains without a registered router", () => {
    expect(() => buildSweepCalls(baseSepolia.id, OWNER, USDC, [plan])).toThrow(/no SwapRouter02/);
  });
});
