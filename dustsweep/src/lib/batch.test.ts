import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { buildRevokeCalls, pairKey, type RevokeTarget } from "./batch";

const usdc: RevokeTarget = {
  token: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  spender: { name: "Permit2 (Uniswap)", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
};
const weth: RevokeTarget = {
  token: { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  spender: { name: "Uniswap SwapRouter02", address: "0x2626664c2603336E57B271c5C0b26F421741e481" },
};

describe("pairKey", () => {
  it("is unique per token/spender pair", () => {
    expect(pairKey(usdc)).not.toBe(pairKey(weth));
    expect(pairKey(usdc)).toBe(pairKey({ ...usdc }));
  });
});

describe("buildRevokeCalls", () => {
  it("produces one approve(spender, 0) call per target, aimed at the token", () => {
    const calls = buildRevokeCalls([usdc, weth]);
    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe(usdc.token.address);
    expect(calls[1].to).toBe(weth.token.address);
    for (const [i, target] of [usdc, weth].entries()) {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: calls[i].data });
      expect(decoded.functionName).toBe("approve");
      expect(decoded.args).toEqual([target.spender.address, 0n]);
    }
  });

  it("returns an empty batch for no targets", () => {
    expect(buildRevokeCalls([])).toEqual([]);
  });
});
