import { describe, expect, it } from "vitest";
import { isAddress } from "viem";
import { EXPLORERS, SPENDERS, TOKENS } from "./registry";

// The registry is hand-curated — these tests catch the realistic mistakes:
// a typo'd/checksum-broken address, a duplicate entry, a chain missing pieces.

describe("registry", () => {
  it("covers the same chains across tokens, spenders and explorers", () => {
    expect(Object.keys(SPENDERS).sort()).toEqual(Object.keys(TOKENS).sort());
    expect(Object.keys(EXPLORERS).sort()).toEqual(Object.keys(TOKENS).sort());
  });

  it("has only checksummed addresses", () => {
    for (const list of Object.values(TOKENS))
      for (const t of list) expect(isAddress(t.address, { strict: true }), t.symbol).toBe(true);
    for (const list of Object.values(SPENDERS))
      for (const s of list) expect(isAddress(s.address, { strict: true }), s.name).toBe(true);
  });

  it("has no duplicate tokens or spenders within a chain", () => {
    for (const list of Object.values(TOKENS)) {
      const addrs = list.map((t) => t.address.toLowerCase());
      expect(new Set(addrs).size).toBe(addrs.length);
    }
    for (const list of Object.values(SPENDERS)) {
      const addrs = list.map((s) => s.address.toLowerCase());
      expect(new Set(addrs).size).toBe(addrs.length);
    }
  });

  it("uses sane decimals", () => {
    for (const list of Object.values(TOKENS))
      for (const t of list) {
        expect(t.decimals).toBeGreaterThanOrEqual(0);
        expect(t.decimals).toBeLessThanOrEqual(24);
      }
  });
});
