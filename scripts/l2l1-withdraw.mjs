// Base -> Ethereum L1 withdrawal driver (native OP-Stack bridge, fault-proof era).
// Three-act structure: initiate on L2 (a plain L2StandardBridge.withdraw call, done
// via cast), prove on L1 once a dispute game includes the withdrawal, finalize on L1
// after the 7-day challenge window.
//
// Usage:
//   node l2l1-withdraw.mjs status   <l2TxHash>
//   PRIVATE_KEY=0x... node l2l1-withdraw.mjs prove    <l2TxHash>
//   PRIVATE_KEY=0x... node l2l1-withdraw.mjs finalize <l2TxHash>

import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";
import { publicActionsL1, publicActionsL2, walletActionsL1, getWithdrawals } from "viem/op-stack";

const [cmd, hash] = process.argv.slice(2);
if (!cmd || !hash) {
  console.error("usage: node l2l1-withdraw.mjs <status|prove|finalize> <l2TxHash>");
  process.exit(1);
}

const L1_RPC = process.env.L1_RPC ?? "https://ethereum-rpc.publicnode.com";
const l2 = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") }).extend(publicActionsL2());
const l1 = createPublicClient({ chain: mainnet, transport: http(L1_RPC) }).extend(publicActionsL1());

const receipt = await l2.getTransactionReceipt({ hash });
const [withdrawal] = getWithdrawals(receipt);
console.log("withdrawal nonce:", withdrawal.nonce.toString());
console.log("amount:", formatEther(withdrawal.value), "ETH ->", withdrawal.target);

const status = await l1.getWithdrawalStatus({ receipt, targetChain: base });
console.log("status:", status);

if (cmd === "status") process.exit(0);

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const walletL1 = createWalletClient({ chain: mainnet, account, transport: http(L1_RPC) }).extend(walletActionsL1());

if (cmd === "prove") {
  if (status !== "ready-to-prove") {
    console.log("not ready to prove yet — run again later");
    process.exit(2);
  }
  const { output, withdrawal: w } = await l1.waitToProve({ receipt, targetChain: base });
  const args = await l2.buildProveWithdrawal({ output, withdrawal: w });
  const tx = await walletL1.proveWithdrawal(args);
  console.log("prove tx (L1):", tx);
  await l1.waitForTransactionReceipt({ hash: tx });
  console.log("proved. finalize after the 7-day challenge window.");
} else if (cmd === "finalize") {
  if (status !== "ready-to-finalize") {
    console.log("not ready to finalize yet — run again later");
    process.exit(2);
  }
  const tx = await walletL1.finalizeWithdrawal({ targetChain: base, withdrawal });
  console.log("finalize tx (L1):", tx);
  await l1.waitForTransactionReceipt({ hash: tx });
  console.log("finalized — ETH delivered on L1.");
}
