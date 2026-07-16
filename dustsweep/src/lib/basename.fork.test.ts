import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { reverseCall } from "./basename";

// Fork test (see scan.fork.test.ts for setup). Reverse resolution reads live
// resolver state; the pinned fork has the record set well before its block.
const ANVIL_RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const client = createPublicClient({ chain: base, transport: http(ANVIL_RPC) });

describe.runIf(process.env.RUN_FORK)("fork: Basename reverse resolution", () => {
  it("resolves the owner wallet to its Basename", async () => {
    const owner = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D" as const;
    const [result] = await client.multicall({ contracts: [reverseCall(owner)], allowFailure: false });
    expect(result).toBe("dupcia.base.eth");
  });

  it("returns empty for an address with no reverse record", async () => {
    // Permit2 itself has no Basename.
    const [result] = await client.multicall({
      contracts: [reverseCall("0x000000000022D473030F116dDEE9F6B43aC78BA3")],
      allowFailure: false,
    });
    expect(result).toBe("");
  });
});
