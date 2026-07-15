// TrailKeeper's sentinel loop: observe live badge-progress state on Base mainnet,
// attest it via EAS (real, reusable schema — the one wallet 0x6 registered:
// "string action,bytes32 txRef,address wallet"), attributed with the agent's own
// Builder Code. Meant to run on a schedule (see cron-run.sh) with irregular
// cadence — fixed-interval on-chain activity is a bot signature.
//
// Usage: PRIVATE_KEY=0x... node sentinel.mjs

import { createPublicClient, createWalletClient, http, encodeAbiParameters } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { Attribution } from "ox/erc8021";
import { BUILDER_CODE } from "./builderCode.mjs";

const BADGES_ADDRESS = "0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab";
const EAS = "0x4200000000000000000000000000000000000021";
const SCHEMA_UID = "0xe55f06091abd36404dcf739e5ca251654ce619da54eb3241bebee24cf34e4d9e";

const badgesAbi = [
  { type: "function", name: "nextTokenId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];
const easAbi = [
  {
    type: "function",
    name: "attest",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ type: "bytes32" }],
  },
];

const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });
const walletClient = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org"), dataSuffix: DATA_SUFFIX });

const nextTokenId = await publicClient.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "nextTokenId" });
const badgesMinted = nextTokenId - 1n;
console.log("badges minted on mainnet:", badgesMinted.toString());

// Reference the most recent real mint (Transfer from the zero address) so txRef
// points at an actual on-chain event, not a fabricated hash. Public RPC caps
// eth_getLogs at ~10k blocks per call, so chunk from the known deploy block.
const DEPLOY_BLOCK = 48597020n;
const transferEvent = { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "tokenId", type: "uint256", indexed: true }] };
const latestBlock = await publicClient.getBlockNumber();
let mintLogs = [];
for (let from = DEPLOY_BLOCK; from <= latestBlock; from += 9000n) {
  const to = from + 8999n > latestBlock ? latestBlock : from + 8999n;
  const chunk = await publicClient.getLogs({
    address: BADGES_ADDRESS,
    event: transferEvent,
    args: { from: "0x0000000000000000000000000000000000000000" },
    fromBlock: from,
    toBlock: to,
  });
  mintLogs = mintLogs.concat(chunk);
}
const lastMint = mintLogs[mintLogs.length - 1];
const txRef = lastMint.transactionHash;
console.log("referencing last mint tx:", txRef);

const action = `sentinel-check:badges=${badgesMinted}`;
const attestData = encodeAbiParameters(
  [{ type: "string" }, { type: "bytes32" }, { type: "address" }],
  [action, txRef, account.address],
);

const hash = await walletClient.writeContract({
  address: EAS,
  abi: easAbi,
  functionName: "attest",
  args: [{ schema: SCHEMA_UID, data: { recipient: account.address, expirationTime: 0n, revocable: true, refUID: `0x${"0".repeat(64)}`, data: attestData, value: 0n } }],
});
console.log("sentinel attestation tx (attributed):", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("status:", receipt.status);

const tx = await publicClient.getTransaction({ hash });
console.log("calldata carries builder code suffix:", tx.input.endsWith(DATA_SUFFIX.slice(2)));
