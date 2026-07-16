import test from "node:test";
import assert from "node:assert/strict";
import { decodeTokenUri, journeyStatus, makeCache } from "./lib.js";

test("makeCache returns fresh value once and caches within TTL", async () => {
  let t = 0;
  let computes = 0;
  const cached = makeCache(1000, () => t);
  const compute = async () => ++computes;

  assert.equal(await cached("k", compute), 1);
  t = 500;
  assert.equal(await cached("k", compute), 1); // still cached
  t = 1500;
  assert.equal(await cached("k", compute), 2); // expired -> recomputed
  assert.equal(computes, 2);
});

test("makeCache keys are independent", async () => {
  const cached = makeCache(1000, () => 0);
  assert.equal(await cached("a", async () => "A"), "A");
  assert.equal(await cached("b", async () => "B"), "B");
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
