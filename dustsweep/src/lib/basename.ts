import { namehash, type Address } from "viem";
import { base } from "wagmi/chains";

// Reverse resolution (address -> Basename) on Base. viem's getEnsName targets
// mainnet ENS and doesn't support Base, so we call the Basenames L2 Resolver
// directly. Per ENSIP-19, the reverse node for an address on a given chain is
// namehash("<addr-no-0x-lowercase>.<coinType-hex>.reverse"); Base's coinType
// is 0x80002105. Verified live: 0x6D48…639D -> "dupcia.base.eth".
const L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const BASE_REVERSE_SUFFIX = "80002105.reverse";

export const nameAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [{ type: "bytes32" }],
    outputs: [{ type: "string" }],
  },
] as const;

export function baseReverseNode(address: Address) {
  return namehash(`${address.slice(2).toLowerCase()}.${BASE_REVERSE_SUFFIX}`);
}

// One multicall contract entry to reverse-resolve `address` on Base.
export function reverseCall(address: Address) {
  return {
    address: L2_RESOLVER,
    abi: nameAbi,
    functionName: "name" as const,
    args: [baseReverseNode(address)] as const,
    chainId: base.id,
  };
}

// Basename reverse resolution only exists on Base mainnet in this app.
export function supportsBasenames(chainId: number) {
  return chainId === base.id;
}
