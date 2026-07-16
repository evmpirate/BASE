import { erc20Abi, type Address, type PublicClient } from "viem";

// Only the reads we use — keeps callers free to pass any viem client shape
// (the UI's wagmi client, a test fork client) without Chain-generic friction.
type ReadClient = Pick<PublicClient, "multicall">;
import { PERMIT2_ADDRESS, permit2Abi, type Permit2Finding } from "./permit2";
import type { SpenderEntry, TokenEntry } from "./registry";

export type Pair = { token: TokenEntry; spender: SpenderEntry };
export type Erc20Finding = Pair & { allowance: bigint };

// Pure scan functions over a viem client — the same reads the UI does through
// wagmi hooks, callable from tests (fork integration) and scripts.

export async function scanErc20(
  client: ReadClient,
  owner: Address,
  pairs: Pair[],
): Promise<Erc20Finding[]> {
  const results = await client.multicall({
    contracts: pairs.map((p) => ({
      abi: erc20Abi,
      address: p.token.address,
      functionName: "allowance" as const,
      args: [owner, p.spender.address] as const,
    })),
  });
  return pairs
    .map((pair, i) => ({
      ...pair,
      allowance: results[i].status === "success" ? (results[i].result as bigint) : 0n,
    }))
    .filter((f) => f.allowance > 0n);
}

export async function scanPermit2(
  client: ReadClient,
  owner: Address,
  pairs: Pair[],
): Promise<Permit2Finding[]> {
  const results = await client.multicall({
    contracts: pairs.map((p) => ({
      abi: permit2Abi,
      address: PERMIT2_ADDRESS,
      functionName: "allowance" as const,
      args: [owner, p.token.address, p.spender.address] as const,
    })),
  });
  return pairs
    .map((pair, i) => {
      const r = results[i];
      if (r.status !== "success") return null;
      const [amount, expiration] = r.result as readonly [bigint, number, number];
      return { ...pair, amount, expiration: Number(expiration) };
    })
    .filter((f): f is Permit2Finding => f !== null && f.amount > 0n);
}
