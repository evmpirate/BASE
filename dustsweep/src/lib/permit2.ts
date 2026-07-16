import type { SpenderEntry, TokenEntry } from "./registry";

// Permit2 keeps its OWN allowance book, separate from ERC-20 allowances:
// approving Permit2 on the token is step one, but dapps then get spend rights
// via permit2.allowance(owner, token, spender). Revoking the ERC-20 approval
// alone leaves those grants in place until they expire — so a real approval
// hygiene tool must scan and revoke both layers.
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

export const permit2Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
      { name: "nonce", type: "uint48" },
    ],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "lockdown",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "approvals",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "spender", type: "address" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

export type Permit2Finding = {
  token: TokenEntry;
  spender: SpenderEntry;
  amount: bigint;
  expiration: number; // unix seconds
};

export function isExpired(f: Permit2Finding, nowSec = Math.floor(Date.now() / 1000)) {
  return f.expiration <= nowSec;
}

// lockdown() zeroes every listed (token, spender) grant in ONE transaction —
// Permit2's native batch revoke, no EIP-5792 needed.
export function toLockdownArgs(findings: Permit2Finding[]) {
  return [findings.map((f) => ({ token: f.token.address, spender: f.spender.address }))] as const;
}
