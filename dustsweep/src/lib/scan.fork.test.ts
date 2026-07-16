import { describe, expect, it } from "vitest";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { scanErc20, scanPermit2, type Pair } from "./scan";
import { SPENDERS, TOKENS } from "./registry";
import { PERMIT2_ADDRESS } from "./permit2";

// Integration tests against a LOCAL FORK of Base mainnet:
//   FORK_BLOCK=48705000 ../scripts/anvil-fork.sh   (from the repo root)
//   RUN_FORK=1 npx vitest run src/lib/scan.fork.test.ts
// The fork serves real chain state, so the scans below hit the actual
// Permit2 book and real token contracts — no mocks, no cost.
const FORK_URL = process.env.FORK_URL ?? "http://127.0.0.1:8545";

// A real Base address observed granting Permit2 -> Universal Router an
// unlimited USDC allowance shortly before the pinned fork block. Nothing
// about it is ours; it is simply live mainnet state, read-only.
const REAL_OWNER = "0xfa2d07e06a6eb3488698fe13981a17c33f93c829" as const;
const FORK_BLOCK = 48705000;

const client = createPublicClient({ chain: base, transport: http(FORK_URL) });

const pairs: Pair[] = TOKENS[base.id].flatMap((token) =>
  SPENDERS[base.id]
    .filter((s) => s.address !== PERMIT2_ADDRESS)
    .map((spender) => ({ token, spender })),
);

describe.runIf(process.env.RUN_FORK)("fork: scan real mainnet state", () => {
  it("is connected to the pinned fork", async () => {
    expect(Number(await client.getBlockNumber())).toBe(FORK_BLOCK);
  });

  it("finds the real owner's live Permit2 grant (USDC -> Universal Router)", async () => {
    const findings = await scanPermit2(client, REAL_OWNER, pairs);
    const grant = findings.find(
      (f) => f.token.symbol === "USDC" && f.spender.name.includes("Universal Router"),
    );
    expect(grant).toBeDefined();
    expect(grant!.amount).toBe(2n ** 160n - 1n); // unlimited (max uint160)
    const forkTimestamp = Number((await client.getBlock()).timestamp);
    expect(grant!.expiration).toBeGreaterThan(forkTimestamp); // not expired at the pin
  });

  it("finds the matching ERC-20 approval to Permit2 itself", async () => {
    const permit2Pairs: Pair[] = TOKENS[base.id].map((token) => ({
      token,
      spender: { name: "Permit2", address: PERMIT2_ADDRESS },
    }));
    const findings = await scanErc20(client, REAL_OWNER, permit2Pairs);
    // Permit2 can't sub-delegate without the base ERC-20 approval; the dapp
    // that created the grant set this too.
    expect(findings.some((f) => f.token.symbol === "USDC")).toBe(true);
  });
});
