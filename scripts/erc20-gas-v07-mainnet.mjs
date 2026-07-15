// Pay-gas-in-USDC on Base MAINNET — EntryPoint v0.7 SimpleAccount owned by the
// TrailKeeper burner EOA. Same pattern amberforge proved out.
//
// Usage: PIMLICO_API_KEY=... OWNER_PRIVATE_KEY=0x... node erc20-gas-v07-mainnet.mjs [--address-only]

import { createPublicClient, http, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient } from "permissionless";
import { toSimpleSmartAccount } from "permissionless/accounts";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { prepareUserOperationForErc20Paymaster } from "permissionless/experimental/pimlico";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const owner = privateKeyToAccount(process.env.OWNER_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http("https://mainnet.base.org") });

const account = await toSimpleSmartAccount({
  client: publicClient,
  owner,
  entryPoint: { address: entryPoint07Address, version: "0.7" },
});
console.log("SimpleAccount (v0.7, mainnet):", account.address);
if (process.argv.includes("--address-only")) process.exit(0);

const usdcBal = (a) => publicClient.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [a] });
console.log("account USDC:", (await usdcBal(account.address)).toString());
console.log("account ETH:", (await publicClient.getBalance({ address: account.address })).toString());

const pimlicoUrl = `https://api.pimlico.io/v2/base/rpc?apikey=${process.env.PIMLICO_API_KEY}`;
const pimlicoClient = createPimlicoClient({
  transport: http(pimlicoUrl),
  entryPoint: { address: entryPoint07Address, version: "0.7" },
});

const smartAccountClient = createSmartAccountClient({
  account,
  chain: base,
  bundlerTransport: http(pimlicoUrl),
  paymaster: pimlicoClient,
  paymasterContext: { token: USDC },
  userOperation: {
    prepareUserOperation: prepareUserOperationForErc20Paymaster(pimlicoClient),
    estimateFeesPerGas: async () => (await pimlicoClient.getUserOperationGasPrice()).fast,
  },
});

// Real state change funded entirely from the account's own USDC, no ETH needed at all:
// approve a small amount of USDC to Permit2 (the same spender DustSweep already knows about).
const approveData =
  "0x095ea7b3" +
  PERMIT2.slice(2).padStart(64, "0") +
  (100000).toString(16).padStart(64, "0"); // 0.1 USDC

const hash = await smartAccountClient.sendTransaction({
  calls: [{ to: USDC, data: approveData }],
});
console.log("approve tx (gas in USDC, v0.7, mainnet):", hash);
await publicClient.waitForTransactionReceipt({ hash });
console.log("account USDC after:", (await usdcBal(account.address)).toString());
