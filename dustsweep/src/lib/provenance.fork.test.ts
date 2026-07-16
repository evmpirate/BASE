import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { tracePermit2Approval, traceErc20Approval } from "./provenance";

// Fork test (see scan.fork.test.ts for setup). The pinned owner granted both
// a Permit2 sub-allowance and the backing ERC-20 approval shortly before the
// fork block, so a short backward log scan finds them.
const ANVIL_RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const client = createPublicClient({ chain: base, transport: http(ANVIL_RPC) });

const OWNER = "0xfa2d07e06a6eb3488698fe13981a17c33f93c829" as const;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const UNIVERSAL_ROUTER = "0x6fF5693b99212Da76ad316178A184AB56D299b43" as const;
const FORK_BLOCK = 48705000;

describe.runIf(process.env.RUN_FORK)("fork: approval provenance from logs", () => {
  it("finds the Permit2 grant's origin (block + tx + timestamp)", async () => {
    const origin = await tracePermit2Approval(client, OWNER, USDC, UNIVERSAL_ROUTER);
    expect(origin).not.toBeNull();
    expect(origin!.blockNumber).toBeLessThanOrEqual(BigInt(FORK_BLOCK));
    expect(origin!.txHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(origin!.timestamp).toBeGreaterThan(0);
  });

  it("finds the backing ERC-20 approval to Permit2", async () => {
    const origin = await traceErc20Approval(client, USDC, OWNER, "0x000000000022D473030F116dDEE9F6B43aC78BA3");
    expect(origin).not.toBeNull();
    expect(origin!.blockNumber).toBeLessThanOrEqual(BigInt(FORK_BLOCK));
  });

  it("returns null when no such approval exists in range", async () => {
    // Owner never approved this random spender for USDC.
    const origin = await traceErc20Approval(
      client,
      USDC,
      OWNER,
      "0x00000000000000000000000000000000DeaDBeef",
      2, // small window: don't scan the whole chain for a negative
    );
    expect(origin).toBeNull();
  });
});
