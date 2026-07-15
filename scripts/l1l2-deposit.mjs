// Ethereum L1 -> Base deposit driver (native OP-Stack bridge, OptimismPortal).
// A deposit is a single L1 transaction that the sequencer replays on L2 within
// a couple of minutes -- no prove/finalize step (that's only for withdrawals).
//
// Usage: PRIVATE_KEY=0x... node l1l2-deposit.mjs <amountEth>

import { createPublicClient, createWalletClient, http, formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { publicActionsL2, walletActionsL1, getL2TransactionHashes } from "viem/op-stack";

const amountEth = process.argv[2];
if (!amountEth) {
  console.error("usage: node l1l2-deposit.mjs <amountEth>");
  process.exit(1);
}

const L1_RPC = process.env.L1_RPC ?? "https://ethereum-rpc.publicnode.com";
const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const l1 = createPublicClient({ chain: mainnet, transport: http(L1_RPC) });
const l2 = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") }).extend(publicActionsL2());
const walletL1 = createWalletClient({ chain: mainnet, account, transport: http(L1_RPC) }).extend(walletActionsL1());

console.log("L1 balance before:", formatEther(await l1.getBalance({ address: account.address })), "ETH");
console.log("L2 balance before:", formatEther(await l2.getBalance({ address: account.address })), "ETH");

const request = await l2.buildDepositTransaction({
  account,
  mint: parseEther(amountEth),
  to: account.address,
});
const l1Hash = await walletL1.depositTransaction(request);
console.log("L1 deposit tx:", l1Hash);

const l1Receipt = await l1.waitForTransactionReceipt({ hash: l1Hash });
console.log("L1 status:", l1Receipt.status, "block:", l1Receipt.blockNumber);

const [l2Hash] = getL2TransactionHashes(l1Receipt);
console.log("derived L2 deposit tx:", l2Hash);
const l2Receipt = await l2.waitForTransactionReceipt({ hash: l2Hash, timeout: 600_000 });
console.log("L2 status:", l2Receipt.status, "block:", l2Receipt.blockNumber);
console.log("L2 balance after:", formatEther(await l2.getBalance({ address: account.address })), "ETH");
