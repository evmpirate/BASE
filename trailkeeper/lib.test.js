import test from "node:test";
import assert from "node:assert/strict";
import { decodeTokenUri, journeyStatus, makeCache } from "./lib.js";

test("makeCache returns fresh value once and caches within TTL", async () => {
  let t = 0;
  let computes = 0;
  const cached = makeCache(1000, { now: () => t });
  const compute = async () => ++computes;

  assert.equal(await cached("k", compute), 1);
  t = 500;
  assert.equal(await cached("k", compute), 1); // still cached
  t = 1500;
  assert.equal(await cached("k", compute), 2); // expired -> recomputed
  assert.equal(computes, 2);
});

test("makeCache keys are independent", async () => {
  const cached = makeCache(1000, { now: () => 0 });
  assert.equal(await cached("a", async () => "A"), "A");
  assert.equal(await cached("b", async () => "B"), "B");
});

test("stale window serves the old value and revalidates in the background", async () => {
  let t = 0;
  let computes = 0;
  const cached = makeCache(1000, { maxStaleMs: 5000, now: () => t });
  const compute = async () => ++computes;

  assert.equal(await cached("k", compute), 1);
  t = 2000; // expired, but within ttl+maxStale
  assert.equal(await cached("k", compute), 1); // stale served immediately
  await Promise.resolve(); // let the background refresh settle
  await Promise.resolve();
  assert.equal(computes, 2);
  assert.equal(await cached("k", compute), 2); // refreshed value now fresh
});

test("concurrent stale hits dedupe to a single background refresh", async () => {
  let t = 0;
  let computes = 0;
  let release;
  const gate = new Promise((r) => (release = r));
  const cached = makeCache(1000, { maxStaleMs: 5000, now: () => t });
  const compute = () => { computes++; return gate; };

  cached("k", async () => "seed");
  await Promise.resolve();
  t = 2000;
  assert.equal(await cached("k", compute), "seed");
  assert.equal(await cached("k", compute), "seed");
  release("next");
  await gate;
  assert.equal(computes, 1);
});

test("a failed refresh keeps serving stale until the hard limit, then throws", async () => {
  let t = 0;
  const cached = makeCache(1000, { maxStaleMs: 5000, now: () => t });
  const boom = async () => { throw new Error("rpc down"); };

  assert.equal(await cached("k", async () => "ok"), "ok");
  t = 3000; // stale window: failure is swallowed, stale served
  assert.equal(await cached("k", boom), "ok");
  await Promise.resolve();
  await Promise.resolve();
  t = 7000; // beyond ttl+maxStale: caller sees the error
  await assert.rejects(() => cached("k", boom), /rpc down/);
});

test("concurrent cold misses share one compute", async () => {
  let computes = 0;
  const cached = makeCache(1000, { now: () => 0 });
  const compute = async () => { computes++; return "v"; };
  const [a, b] = await Promise.all([cached("k", compute), cached("k", compute)]);
  assert.equal(a, "v");
  assert.equal(b, "v");
  assert.equal(computes, 1);
});

test("decodeTokenUri decodes base64 JSON metadata", () => {
  const meta = { name: "First Deploy", image: "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=" };
  const uri = "data:application/json;base64," + Buffer.from(JSON.stringify(meta)).toString("base64");
  assert.deepEqual(decodeTokenUri(uri), meta);
});

test("decodeTokenUri rejects non-data URIs", () => {
  assert.throws(() => decodeTokenUri("https://example.com/1.json"));
  assert.throws(() => decodeTokenUri("data:application/json;utf8,{}"));
});

test("journeyStatus marks earned milestones by badge name", () => {
  const milestones = ["First Deploy", "First Dapp", "First Agent"];
  const badges = [{ name: "First Deploy" }, { name: "First Agent" }];
  assert.deepEqual(journeyStatus(milestones, badges), [
    { milestone: "First Deploy", earned: true },
    { milestone: "First Dapp", earned: false },
    { milestone: "First Agent", earned: true },
  ]);
});
