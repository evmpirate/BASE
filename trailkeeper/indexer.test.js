import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIndexer, fileStorage, memoryStorage } from "./indexer.js";

const ADDR = "0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab";

// Fake chain: mutable head, mint logs at fixed blocks, timestamps derived
// from block numbers. Records every getLogs range for resume assertions.
function fakeChain({ head, mints }) {
  const ranges = [];
  return {
    head,
    ranges,
    async getBlockNumber() {
      return this.head;
    },
    async getLogs({ fromBlock, toBlock }) {
      ranges.push([fromBlock, toBlock]);
      return mints
        .filter((m) => m.block >= fromBlock && m.block <= toBlock)
        .map((m) => ({
          blockNumber: m.block,
          transactionHash: m.tx,
          args: { from: "0x0000000000000000000000000000000000000000", to: m.to, tokenId: BigInt(m.id) },
        }));
    },
    async getBlock({ blockNumber }) {
      return { timestamp: blockNumber * 2n };
    },
  };
}

const MINTS = [
  { block: 5n, id: 1, to: "0xaaa0000000000000000000000000000000000001", tx: "0x01" },
  { block: 17n, id: 2, to: "0xaaa0000000000000000000000000000000000002", tx: "0x02" },
  { block: 42n, id: 3, to: "0xaaa0000000000000000000000000000000000003", tx: "0x03" },
];

test("backfill walks history in chunks and stamps timestamps", async () => {
  const chain = fakeChain({ head: 60n, mints: MINTS });
  const idx = createIndexer({ client: chain, address: ADDR, fromBlock: 1n, confirmations: 10n, chunkSize: 10n });

  await idx.sync();

  assert.equal(idx.cursor(), 50n); // head - confirmations
  assert.deepEqual(
    idx.events().map((e) => [e.tokenId, e.blockNumber, e.timestamp]),
    [
      [1, 5, 10],
      [2, 17, 34],
      [3, 42, 84],
    ],
  );
  // 1..50 in chunks of 10
  assert.equal(chain.ranges.length, 5);
});

test("events inside the confirmation window wait until the head advances", async () => {
  const chain = fakeChain({ head: 45n, mints: MINTS });
  const idx = createIndexer({ client: chain, address: ADDR, fromBlock: 1n, confirmations: 10n, chunkSize: 100n });

  await idx.sync();
  assert.deepEqual(idx.events().map((e) => e.tokenId), [1, 2]); // block 42 too close to head 45

  chain.head = 60n;
  await idx.sync();
  assert.deepEqual(idx.events().map((e) => e.tokenId), [1, 2, 3]);
});

test("sync is idempotent and only scans past the cursor", async () => {
  const chain = fakeChain({ head: 60n, mints: MINTS });
  const idx = createIndexer({ client: chain, address: ADDR, fromBlock: 1n, confirmations: 10n, chunkSize: 100n });

  await idx.sync();
  const scans = chain.ranges.length;
  await idx.sync(); // head unchanged: nothing to scan
  assert.equal(chain.ranges.length, scans);
  assert.equal(idx.events().length, 3);

  chain.head = 70n;
  await idx.sync();
  assert.deepEqual(chain.ranges.at(-1), [51n, 60n]); // resumes after the cursor
  assert.equal(idx.events().length, 3); // no duplicates
});

test("file storage persists cursor and events across restarts", async () => {
  const path = join(mkdtempSync(join(tmpdir(), "idx-")), "index.json");
  const chain = fakeChain({ head: 60n, mints: MINTS });

  const first = createIndexer({ client: chain, address: ADDR, fromBlock: 1n, confirmations: 10n, chunkSize: 100n, storage: fileStorage(path) });
  await first.sync();

  // "Restart": a new indexer over the same file resumes, re-scanning nothing.
  const scansBefore = chain.ranges.length;
  const second = createIndexer({ client: chain, address: ADDR, fromBlock: 1n, confirmations: 10n, chunkSize: 100n, storage: fileStorage(path) });
  await second.sync();
  assert.equal(chain.ranges.length, scansBefore);
  assert.equal(second.cursor(), 50n);
  assert.equal(second.events().length, 3);
});

test("memory storage starts fresh each time", async () => {
  const storage = memoryStorage();
  assert.equal(storage.load(), null);
  storage.save({ cursor: "5", events: [] });
  assert.deepEqual(storage.load(), { cursor: "5", events: [] });
});
