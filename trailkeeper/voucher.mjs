// TrailBadgesV2 voucher CLI — the agent-side and claimant-side halves of the
// claim flow, runnable anywhere the keys live.
//
//   PRIVATE_KEY=0x… node voucher.mjs issue 0xRECIPIENT ["Badge Name"]
//     Signs and prints a voucher JSON (PRIVATE_KEY must be the contract's
//     voucherSigner — the agent's operational key).
//
//   PRIVATE_KEY=0x… node voucher.mjs claim '<voucher json>'
//     Submits claim() with the given key as relayer/claimant. The badge
//     always lands at the voucher's `to`, whoever sends the transaction.
//
// CHAIN_ID selects the network (84532 default, 8453 for mainnet).
import { createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { BADGES_V2_ADDRESS, badgesV2Abi, makeVoucher, serializeVoucher, signVoucher } from "./voucherlib.js";

const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 84532;
const CHAINS = {
  84532: { chain: baseSepolia, rpc: "https://sepolia.base.org" },
  8453: { chain: base, rpc: "https://mainnet.base.org" },
};
const CFG = CHAINS[CHAIN_ID];
const CONTRACT = BADGES_V2_ADDRESS[CHAIN_ID];
if (!CFG || !CONTRACT) throw new Error(`TrailBadgesV2 not deployed for CHAIN_ID ${CHAIN_ID}`);

const [mode, arg1, arg2] = process.argv.slice(2);
const account = privateKeyToAccount(process.env.PRIVATE_KEY);

if (mode === "issue") {
  if (!/^0x[0-9a-fA-F]{40}$/.test(arg1 ?? "")) throw new Error("usage: issue 0xRECIPIENT [name]");
  const voucher = makeVoucher({ to: arg1, name: arg2 ?? "Voucher Claim" });
  const signature = await signVoucher(account, CHAIN_ID, CONTRACT, voucher);
  console.log(
    JSON.stringify(
      { chainId: CHAIN_ID, contract: CONTRACT, signer: account.address, voucher: serializeVoucher(voucher), signature },
      null,
      2,
    ),
  );
} else if (mode === "claim") {
  const { chainId, contract, voucher, signature } = JSON.parse(arg1 ?? "");
  if (chainId !== CHAIN_ID) throw new Error(`voucher is for chain ${chainId}, CHAIN_ID is ${CHAIN_ID}`);
  const publicClient = createPublicClient({ chain: CFG.chain, transport: http(CFG.rpc) });
  const walletClient = createWalletClient({ account, chain: CFG.chain, transport: http(CFG.rpc) });

  const hash = await walletClient.writeContract({
    address: contract,
    abi: badgesV2Abi,
    functionName: "claim",
    args: [voucher.to, voucher.name, BigInt(voucher.nonce), BigInt(voucher.deadline), signature],
  });
  console.log(`claim tx: ${hash} (sender ${account.address})`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("claim reverted");
  const [claimed] = parseEventLogs({ abi: badgesV2Abi, eventName: "BadgeClaimed", logs: receipt.logs });
  console.log(`badge #${claimed.args.tokenId} "${claimed.args.name}" -> ${claimed.args.to} (gas ${receipt.gasUsed})`);
} else {
  console.error("usage: node voucher.mjs issue 0xRECIPIENT [name] | claim '<json>'");
  process.exit(1);
}
