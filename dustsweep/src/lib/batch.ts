import { encodeFunctionData, erc20Abi } from "viem";
import { withAttribution } from "./attribution";
import type { SpenderEntry, TokenEntry } from "./registry";

export type RevokeTarget = { token: TokenEntry; spender: SpenderEntry };

export function pairKey(t: RevokeTarget) {
  return `${t.token.address}-${t.spender.address}`;
}

// One approve(spender, 0) call per selected pair, ready for EIP-5792 sendCalls.
// sendCalls has no dataSuffix option, so the builder-code suffix is appended here.
export function buildRevokeCalls(targets: RevokeTarget[]) {
  return targets.map((t) => ({
    to: t.token.address,
    data: withAttribution(
      encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [t.spender.address, 0n],
      }),
    ),
  }));
}
