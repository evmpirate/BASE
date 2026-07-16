// Incremental indexer for badge mints (ERC-721 Transfer from the zero
// address). /activity used to re-walk every 9k-block chunk from the deploy
// block on each cold cache — the indexer walks history once, persists a
// cursor, and each sync() only scans blocks the cursor hasn't covered.
//
// Reorg strategy: only blocks at least `confirmations` behind the head are
// indexed. Base reorgs deeper than a handful of blocks are not expected, so
// staying N blocks back makes indexed data effectively final — no rollback
// bookkeeping needed. The cost: a fresh mint appears in /activity ~N*2s late.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ZERO = "0x0000000000000000000000000000000000000000";
export const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
  ],
};

export function memoryStorage() {
  let state = null;
  return {
    load: () => state,
    save: (s) => {
      state = s;
    },
  };
}

// JSON file persistence with write-to-temp + rename, so a crash mid-save
// leaves the previous state intact instead of a truncated file.
export function fileStorage(path) {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(path, "utf8"));
      } catch {
        return null;
      }
    },
    save(state) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, path);
    },
  };
}

export function createIndexer({ client, address, fromBlock, storage = memoryStorage(), confirmations = 10n, chunkSize = 9000n }) {
  // cursor = last block whose logs are fully indexed (stored as string —
  // JSON has no BigInt).
  const state = storage.load() ?? { cursor: (fromBlock - 1n).toString(), events: [] };

  return {
    /** Advance the cursor to head-confirmations; safe to call repeatedly. */
    async sync() {
      const head = await client.getBlockNumber();
      const target = head - confirmations;
      let from = BigInt(state.cursor) + 1n;
      const stamps = new Map();
      while (from <= target) {
        const to = from + chunkSize - 1n > target ? target : from + chunkSize - 1n;
        const logs = await client.getLogs({
          address,
          event: transferEvent,
          args: { from: ZERO },
          fromBlock: from,
          toBlock: to,
        });
        for (const log of logs) {
          if (!stamps.has(log.blockNumber)) {
            stamps.set(log.blockNumber, (await client.getBlock({ blockNumber: log.blockNumber })).timestamp);
          }
          state.events.push({
            tokenId: Number(log.args.tokenId),
            to: log.args.to,
            txHash: log.transactionHash,
            blockNumber: Number(log.blockNumber),
            timestamp: Number(stamps.get(log.blockNumber)),
          });
        }
        // Persist after every chunk: a crash resumes from the last chunk
        // boundary instead of the deploy block.
        state.cursor = to.toString();
        storage.save(state);
        from = to + 1n;
      }
      return state.events.length;
    },
    events: () => state.events,
    cursor: () => BigInt(state.cursor),
  };
}
