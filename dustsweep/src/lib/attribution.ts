import { Attribution } from "ox/erc8021";

// ERC-8021 Builder Code attribution. bc_9a7f6zpz is DustSweep's registered
// code at base.dev; every revoke this app sends carries it as a calldata
// suffix (ERC-20s ignore trailing calldata, indexers read it).
export const BUILDER_CODE = process.env.NEXT_PUBLIC_BUILDER_CODE ?? "bc_9a7f6zpz";

export const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] }) as `0x${string}`;

// For paths where the suffix can't be passed as an option (EIP-5792 calls).
export function withAttribution(data: `0x${string}`): `0x${string}` {
  return (data + DATA_SUFFIX.slice(2)) as `0x${string}`;
}
