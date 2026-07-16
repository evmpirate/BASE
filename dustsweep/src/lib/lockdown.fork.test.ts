import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createTestClient, createWalletClient, http } from "viem";
import { base } from "viem/chains";
import { scanPermit2, type Pair } from "./scan";
import { PERMIT2_ADDRESS, permit2Abi, toLockdownArgs } from "./permit2";
import { SPENDERS, TOKENS } from "./registry";

// Impersonation test against a LOCAL FORK (see scan.fork.test.ts for setup):
//   FORK_BLOCK=48705000 ../scripts/anvil-fork.sh
//   RUN_FORK=1 npx vitest run src/lib/lockdown.fork.test.ts
//
// We become a REAL owner with a live Permit2 grant (no key needed — anvil's
// anvil_impersonateAccount lets us send as any address on the fork), run
// DustSweep's lockdown() path, and assert the grant is actually zeroed.
const ANVIL_RPC = process.env.ANVIL_RPC ?? "http://127.0.0.1:8545";
const REAL_OWNER = "0xfa2d07e06a6eb3488698fe13981a17c33f93c829" as const;

const transport = http(ANVIL_RPC);
const publicClient = createPublicClient({ chain: base, transport });
const testClient = createTestClient({ chain: base, mode: "anvil", transport });
const walletClient = createWalletClient({ chain: base, transport });

const pairs: Pair[] = TOKENS[base.id].flatMap((token) =>
  SPENDERS[base.id]
    .filter((s) => s.address !== PERMIT2_ADDRESS)
    .map((spender) => ({ token, spender })),
);

describe.runIf(process.env.RUN_FORK)("fork: Permit2 lockdown via impersonation", () => {
  // This test mutates fork state (zeroes real grants). Snapshot before and
  // revert after so it can't leak into other fork tests regardless of order.
  let snapshot: `0x${string}`;
  beforeAll(async () => {
    snapshot = await testClient.snapshot();
  });
  afterAll(async () => {
    await testClient.revert({ id: snapshot });
  });

  it("zeroes every live grant in one lockdown() transaction", async () => {
    const before = await scanPermit2(publicClient, REAL_OWNER, pairs);
    expect(before.length).toBeGreaterThan(0); // fixture sanity: owner has grants

    // Impersonate + fund for gas, then send lockdown() as the owner.
    await testClient.impersonateAccount({ address: REAL_OWNER });
    await testClient.setBalance({ address: REAL_OWNER, value: 10n ** 18n });

    const hash = await walletClient.writeContract({
      account: REAL_OWNER,
      address: PERMIT2_ADDRESS,
      abi: permit2Abi,
      functionName: "lockdown",
      args: toLockdownArgs(before),
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    expect(receipt.status).toBe("success");

    await testClient.stopImpersonatingAccount({ address: REAL_OWNER });

    // Re-scan: the previously-live grants must now be gone.
    const after = await scanPermit2(publicClient, REAL_OWNER, pairs);
    const stillLive = after.filter((a) =>
      before.some((b) => b.token.address === a.token.address && b.spender.address === a.spender.address),
    );
    expect(stillLive).toHaveLength(0);
  });
});
