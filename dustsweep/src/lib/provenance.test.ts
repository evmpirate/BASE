import { describe, expect, it, vi } from "vitest";
import { traceErc20Approval } from "./provenance";

const TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const OWNER = "0x00000000000000000000000000000000000000A1" as const;
const SPENDER = "0x00000000000000000000000000000000000000B2" as const;

// A fake client that only has the log matching in one specific block range,
// so we can assert the backward chunk walk finds it and picks the newest.
function fakeClient(matchAt: bigint, head = 100_000n) {
  const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
    if (matchAt >= fromBlock && matchAt <= toBlock) {
      return [
        { blockNumber: matchAt - 1n, transactionHash: ("0x" + "1".repeat(64)) as `0x${string}` },
        { blockNumber: matchAt, transactionHash: ("0x" + "2".repeat(64)) as `0x${string}` },
      ];
    }
    return [];
  });
  return {
    getBlockNumber: async () => head,
    getLogs,
    getBlock: async ({ blockNumber }: { blockNumber: bigint }) => ({ timestamp: blockNumber * 2n }),
  };
}

describe("traceErc20Approval chunking", () => {
  it("walks backward and returns the newest matching log", async () => {
    const client = fakeClient(95_000n); // within the first chunk from head 100k
    const origin = await traceErc20Approval(client, TOKEN, OWNER, SPENDER);
    expect(origin).not.toBeNull();
    expect(origin!.blockNumber).toBe(95_000n); // newest of the two, not 94_999
    expect(origin!.timestamp).toBe(190_000);
    expect(client.getLogs).toHaveBeenCalledTimes(1); // found in the first chunk
  });

  it("keeps chunking backward until it finds an older grant", async () => {
    const client = fakeClient(50_000n, 100_000n);
    const origin = await traceErc20Approval(client, TOKEN, OWNER, SPENDER);
    expect(origin!.blockNumber).toBe(50_000n);
    // 100k head, 9k chunks -> ~6 chunks to reach 50k.
    expect(client.getLogs.mock.calls.length).toBeGreaterThan(1);
  });

  it("gives up after maxChunks and returns null", async () => {
    const client = fakeClient(1n, 100_000n); // match only at block 1
    const origin = await traceErc20Approval(client, TOKEN, OWNER, SPENDER, 2);
    expect(origin).toBeNull();
    expect(client.getLogs).toHaveBeenCalledTimes(2);
  });
});
