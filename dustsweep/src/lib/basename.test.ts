import { describe, expect, it } from "vitest";
import { baseReverseNode, reverseCall, supportsBasenames } from "./basename";
import { base, baseSepolia } from "wagmi/chains";

describe("baseReverseNode", () => {
  it("is deterministic and namehash-shaped", () => {
    const a = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D" as const;
    const node = baseReverseNode(a);
    expect(node).toMatch(/^0x[0-9a-f]{64}$/);
    // Case-insensitive: checksummed vs lowercase must hash to the same node.
    expect(baseReverseNode(a.toLowerCase() as `0x${string}`)).toBe(node);
  });
});

describe("reverseCall", () => {
  it("targets the L2 resolver's name() with the reverse node", () => {
    const call = reverseCall("0x6D4843155412832dC3Fa9C59e593cdAfdf52639D");
    expect(call.functionName).toBe("name");
    expect(call.chainId).toBe(base.id);
    expect(call.args[0]).toBe(baseReverseNode("0x6D4843155412832dC3Fa9C59e593cdAfdf52639D"));
  });
});

describe("supportsBasenames", () => {
  it("only on Base mainnet", () => {
    expect(supportsBasenames(base.id)).toBe(true);
    expect(supportsBasenames(baseSepolia.id)).toBe(false);
  });
});
