import { describe, expect, it } from "vitest";
import { encodeFunctionData, decodeFunctionData } from "viem";
import { isExpired, permit2Abi, toLockdownArgs, type Permit2Finding } from "./permit2";

const finding: Permit2Finding = {
  token: { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
  spender: { name: "Uniswap Universal Router", address: "0x6fF5693b99212Da76ad316178A184AB56D299b43" },
  amount: 1000n,
  expiration: 1_800_000_000,
};

describe("isExpired", () => {
  it("compares against the provided clock", () => {
    expect(isExpired(finding, finding.expiration - 1)).toBe(false);
    expect(isExpired(finding, finding.expiration)).toBe(true);
    expect(isExpired(finding, finding.expiration + 1)).toBe(true);
  });
});

describe("toLockdownArgs", () => {
  it("produces valid lockdown() calldata that round-trips through the ABI", () => {
    const args = toLockdownArgs([finding, { ...finding, spender: { name: "x", address: "0x2626664c2603336E57B271c5C0b26F421741e481" } }]);
    const data = encodeFunctionData({ abi: permit2Abi, functionName: "lockdown", args });
    const decoded = decodeFunctionData({ abi: permit2Abi, data });
    expect(decoded.functionName).toBe("lockdown");
    expect(decoded.args[0]).toHaveLength(2);
    expect(decoded.args[0][0]).toEqual({
      token: finding.token.address,
      spender: finding.spender.address,
    });
  });

  it("handles the empty case", () => {
    expect(toLockdownArgs([])[0]).toEqual([]);
  });
});
