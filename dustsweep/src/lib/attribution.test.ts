import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { DATA_SUFFIX, withAttribution } from "./attribution";
import { buildRevokeCalls } from "./batch";

describe("attribution", () => {
  it("suffix is hex and non-trivial", () => {
    expect(DATA_SUFFIX).toMatch(/^0x[0-9a-f]+$/i);
    expect(DATA_SUFFIX.length).toBeGreaterThan(4);
  });

  it("withAttribution appends exactly the suffix", () => {
    expect(withAttribution("0xdeadbeef")).toBe("0xdeadbeef" + DATA_SUFFIX.slice(2));
  });

  it("batch revoke calldata stays decodable with the suffix attached", () => {
    const [call] = buildRevokeCalls([
      {
        token: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
        spender: { name: "Permit2", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3" },
      },
    ]);
    expect(call.data.endsWith(DATA_SUFFIX.slice(2))).toBe(true);
    // ABI decoding must still see the approve(spender, 0) beneath the suffix.
    const core = call.data.slice(0, call.data.length - DATA_SUFFIX.slice(2).length) as `0x${string}`;
    const decoded = decodeFunctionData({ abi: erc20Abi, data: core });
    expect(decoded.functionName).toBe("approve");
  });
});
