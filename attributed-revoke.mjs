// Sends one Builder-Code-attributed transaction on Base mainnet.
// Wires the ERC-8021 data suffix (from bc_9a7f6zpz) onto a viem wallet client,
// so every tx it sends is attributed to this builder at base.dev.
// The tx itself is DustSweep's core action: approve(spender, 0) — a revoke.
// Usage: PRIVATE_KEY=0x... node attributed-revoke.mjs

import { createWalletClient, createPublicClient, http, erc20Abi } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { Attribution } from "ox/erc8021";

const BUILDER_CODE = "bc_9a7f6zpz";
const DATA_SUFFIX = Attribution.toDataSuffix({ codes: [BUILDER_CODE] });

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: base, transport: http("https://mainnet.base.org"), dataSuffix: DATA_SUFFIX });
const pub = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

console.log("Builder code:", BUILDER_CODE, "| suffix:", DATA_SUFFIX);
console.log("Sending attributed approve(Permit2, 0) on USDC from", account.address);

const hash = await wallet.writeContract({ address: USDC, abi: erc20Abi, functionName: "approve", args: [PERMIT2, 0n] });
console.log("tx:", hash);
const receipt = await pub.waitForTransactionReceipt({ hash });
console.log("status:", receipt.status);

// Confirm the suffix actually rode along in the calldata.
const tx = await pub.getTransaction({ hash });
console.log("calldata ends with suffix:", tx.input.endsWith(DATA_SUFFIX.slice(2)));
