import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { makeApp } from "./app.js";
import { createIndexer } from "./indexer.js";

const OWNER = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D";

// Minimal stand-in for the viem PublicClient: just the methods the routes
// under test use, with call counters so tests can assert the server cache
// really prevented a second chain read.
function fakeClient({ badges = [{ name: "First Deploy", owner: OWNER }], blockNumber = 100n, blockTimestamp = 0n, blockError = null } = {}) {
  const calls = { readContract: 0, multicall: 0, getBlock: 0 };
  return {
    calls,
    async readContract() {
      calls.readContract++;
      return BigInt(badges.length + 1); // nextTokenId
    },
    async multicall() {
      calls.multicall++;
      return badges.flatMap((b) => [b.name, b.owner]); // badgeName/ownerOf pairs
    },
    async getBlock() {
      calls.getBlock++;
      if (blockError) throw blockError;
      return { number: blockNumber, timestamp: blockTimestamp };
    },
  };
}

async function withServer(opts, fn) {
  const server = makeApp(opts).listen(0);
  await once(server, "listening");
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

test("/progress serves chain data with ETag and Cache-Control", async () => {
  const client = fakeClient();
  await withServer({ client }, async (base) => {
    const res = await fetch(`${base}/progress`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=30");
    assert.ok(res.headers.get("etag"), "ETag header missing");
    const body = await res.json();
    assert.equal(body.badgesMinted, 1);
    assert.equal(body.badges[0].name, "First Deploy");
    assert.equal(body.journey.find((m) => m.milestone === "First Deploy").earned, true);
  });
});

test("conditional GET gets a 304 without re-reading the chain", async () => {
  const client = fakeClient();
  await withServer({ client }, async (base) => {
    const first = await fetch(`${base}/progress`);
    const etag = first.headers.get("etag");
    await first.arrayBuffer(); // drain

    // Node's fetch (undici) sends "cache-control: no-cache" by default, which
    // makes the fresh() check on the server treat the request as a forced
    // reload and skip the 304 — override it to behave like a normal browser.
    const second = await fetch(`${base}/progress`, {
      headers: { "If-None-Match": etag, "Cache-Control": "max-age=0" },
    });
    assert.equal(second.status, 304);
    assert.equal((await second.arrayBuffer()).byteLength, 0);
    // One nextTokenId read total: the 304 was served from the TTL cache.
    assert.equal(client.calls.readContract, 1);
  });
});

test("/healthz reports ok while the RPC head is fresh", async () => {
  const client = fakeClient({ blockNumber: 123n, blockTimestamp: 5_000n });
  await withServer({ client, now: () => 5_010 * 1000 }, async (base) => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.latestBlock, 123);
    assert.equal(body.blockLagSeconds, 10);
  });
});

test("/healthz clamps negative lag from clock skew to zero", async () => {
  const client = fakeClient({ blockTimestamp: 5_000n });
  await withServer({ client, now: () => 4_998 * 1000 }, async (base) => {
    const body = await (await fetch(`${base}/healthz`)).json();
    assert.equal(body.status, "ok");
    assert.equal(body.blockLagSeconds, 0);
  });
});

test("/healthz reports degraded with 503 when the RPC head lags", async () => {
  const client = fakeClient({ blockTimestamp: 5_000n });
  await withServer({ client, now: () => 5_300 * 1000 }, async (base) => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, "degraded");
    assert.equal(body.blockLagSeconds, 300);
  });
});

test("every response carries baseline security headers", async () => {
  await withServer({ client: fakeClient() }, async (base) => {
    for (const path of ["/", "/badges"]) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("x-frame-options"), "DENY");
      assert.equal(res.headers.get("referrer-policy"), "no-referrer");
      assert.match(res.headers.get("content-security-policy"), /default-src 'none'/);
      await res.arrayBuffer();
    }
  });
});

test("requests beyond the rate limit get 429 with Retry-After", async () => {
  await withServer({ client: fakeClient(), rateLimit: { limit: 2, windowMs: 60_000 } }, async (base) => {
    assert.equal((await fetch(`${base}/`)).status, 200);
    assert.equal((await fetch(`${base}/`)).status, 200);
    const limited = await fetch(`${base}/`);
    assert.equal(limited.status, 429);
    assert.ok(Number(limited.headers.get("retry-after")) > 0);
  });
});

test("/activity serves mints from the incremental index", async () => {
  const chainClient = {
    async getBlockNumber() {
      return 100n;
    },
    async getLogs({ fromBlock, toBlock }) {
      const mint = {
        blockNumber: 50n,
        transactionHash: "0xabc",
        args: { from: "0x0000000000000000000000000000000000000000", to: OWNER, tokenId: 1n },
      };
      return 50n >= fromBlock && 50n <= toBlock ? [mint] : [];
    },
    async getBlock() {
      return { timestamp: 1700000000n };
    },
  };
  const index = createIndexer({ client: chainClient, address: "0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab", fromBlock: 1n });
  await withServer({ client: chainClient, index }, async (base) => {
    const res = await fetch(`${base}/activity`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=30");
    const body = await res.json();
    assert.equal(body.events.length, 1);
    const e = body.events[0];
    assert.equal(e.type, "mint");
    assert.equal(e.tokenId, 1);
    assert.equal(e.timestamp, 1700000000);
    assert.match(e.explorerUrl, /\/tx\/0xabc$/);
  });
});

test("chain endpoints ride out an RPC outage by serving stale data", async () => {
  let t = 0;
  let healthy = true;
  const flaky = {
    async readContract() {
      if (!healthy) throw new Error("rpc down");
      return 2n;
    },
    async multicall() {
      if (!healthy) throw new Error("rpc down");
      return ["First Deploy", OWNER];
    },
  };
  await withServer({ client: flaky, now: () => t }, async (base) => {
    const fresh = await (await fetch(`${base}/progress`)).json();
    assert.equal(fresh.badgesMinted, 1);

    healthy = false;
    t = 60_000; // past the 30s TTL, inside the 10min stale window
    const stale = await fetch(`${base}/progress`);
    assert.equal(stale.status, 200);
    assert.deepEqual(await stale.json(), fresh);

    t = 11 * 60_000; // beyond ttl+maxStale — outage becomes visible
    const dead = await fetch(`${base}/progress`);
    assert.equal(dead.status, 502);
  });
});

test("/healthz reports unreachable with 503 when the RPC errors", async () => {
  const client = fakeClient({ blockError: new Error("connect ETIMEDOUT") });
  await withServer({ client }, async (base) => {
    const res = await fetch(`${base}/healthz`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, "unreachable");
    assert.match(body.error, /ETIMEDOUT/);
  });
});
