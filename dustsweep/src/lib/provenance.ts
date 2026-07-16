import { parseAbiItem, type AbiEvent, type Address } from "viem";
import { PERMIT2_ADDRESS } from "./permit2";

// Only the reads we need, structurally typed to avoid viem's Chain-generic
// friction (getBlock's return type varies by chain: OP-stack deposit txns).
type ScanClient = {
  getBlockNumber: () => Promise<bigint>;
  getLogs: (args: {
    address: Address;
    event: AbiEvent;
    args: Record<string, Address>;
    fromBlock: bigint;
    toBlock: bigint;
  }) => Promise<ReadonlyArray<{ blockNumber: bigint | null; transactionHash: `0x${string}` | null }>>;
  getBlock: (args: { blockNumber: bigint }) => Promise<{ timestamp: bigint }>;
};

// Where did an approval come from? Both ERC-20 and Permit2 emit an `Approval`
// event with the owner (and spender) as *indexed* topics, so we can ask the
// node for exactly the logs that match — no scanning unrelated transfers.
export const erc20ApprovalEvent = parseAbiItem(
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
);
export const permit2ApprovalEvent = parseAbiItem(
  "event Approval(address indexed owner, address indexed token, address indexed spender, uint160 amount, uint48 expiration)",
);

export type ApprovalOrigin = {
  blockNumber: bigint;
  timestamp: number;
  txHash: `0x${string}`;
};

// Public Base RPCs cap a single eth_getLogs at 10k blocks (error -32614), so
// we walk backwards in chunks from the head. Because we start at the tip, the
// first chunk that contains a match holds the most recent grant.
const CHUNK = 9000n;

type ScanArgs = {
  client: ScanClient;
  address: Address; // contract that emits the event (token or Permit2)
  event: typeof erc20ApprovalEvent | typeof permit2ApprovalEvent;
  args: Record<string, Address>; // indexed filter (owner, spender, [token])
  maxChunks?: number; // how far back to look before giving up
};

async function findLatestApproval({
  client,
  address,
  event,
  args,
  maxChunks = 25,
}: ScanArgs): Promise<ApprovalOrigin | null> {
  const latest = await client.getBlockNumber();
  let to = latest;
  for (let i = 0; i < maxChunks && to > 0n; i++) {
    const from = to > CHUNK ? to - CHUNK : 0n;
    const logs = await client.getLogs({ address, event, args, fromBlock: from, toBlock: to });
    if (logs.length > 0) {
      const newest = logs.reduce((a, b) => (b.blockNumber! > a.blockNumber! ? b : a));
      const block = await client.getBlock({ blockNumber: newest.blockNumber! });
      return {
        blockNumber: newest.blockNumber!,
        timestamp: Number(block.timestamp),
        txHash: newest.transactionHash!,
      };
    }
    if (from === 0n) break;
    to = from - 1n;
  }
  return null;
}

export function traceErc20Approval(
  client: ScanArgs["client"],
  token: Address,
  owner: Address,
  spender: Address,
  maxChunks?: number,
) {
  return findLatestApproval({
    client,
    address: token,
    event: erc20ApprovalEvent,
    args: { owner, spender },
    maxChunks,
  });
}

export function tracePermit2Approval(
  client: ScanArgs["client"],
  owner: Address,
  token: Address,
  spender: Address,
  maxChunks?: number,
) {
  return findLatestApproval({
    client,
    address: PERMIT2_ADDRESS,
    event: permit2ApprovalEvent,
    args: { owner, token, spender },
    maxChunks,
  });
}
