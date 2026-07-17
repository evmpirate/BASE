// Mainnet finał for DustSweep's sweep feature: create real dust on wallet 0x6,
// then sweep it back into USDC using the exact call shapes the app emits
// (exact-amount approve + best-tier exactInputSingle, ERC-8021 attributed).
//
// Usage:
//   node sweep-demo.mjs status                  # read-only balances/allowance
//   PRIVATE_KEY=0x... node sweep-demo.mjs buy   # ~1 USDC -> DEGEN (makes dust)
//   PRIVATE_KEY=0x... node sweep-demo.mjs sweep # all DEGEN -> USDC (the finał)
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { Attribution } from "ox/erc8021";

const RPC = process.env.RPC_URL ?? "https://mainnet.base.org";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const DEGEN = "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed";
const QUOTER_V2 = "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a";
const SWAP_ROUTER_02 = "0x2626664c2603336E57B271c5C0b26F421741e481";
const FEE_TIERS = [100, 500, 3000, 10000];
const SLIPPAGE_BPS = 100n;
// DustSweep's registered builder code, same suffix the app appends.
const DATA_SUFFIX = Attribution.toDataSuffix({ codes: ["bc_9a7f6zpz"] });

const quoterV2Abi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
];

const swapRouter02Abi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        name: "params",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];

const publicClient = createPublicClient({ chain: base, transport: http(RPC) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function bestQuote(tokenIn, tokenOut, amountIn) {
  let best = null;
  for (const fee of FEE_TIERS) {
    try {
      const { result } = await publicClient.simulateContract({
        abi: quoterV2Abi,
        address: QUOTER_V2,
        functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      if (result[0] > 0n && (!best || result[0] > best.amountOut)) {
        best = { fee, amountOut: result[0] };
      }
    } catch {
      // no pool at this tier
    }
    await sleep(300); // public RPC dislikes bursts
  }
  return best;
}

function attributed(data) {
  return data + DATA_SUFFIX.slice(2);
}

async function balances(owner) {
  const [usdc, degen, allowance] = await publicClient.multicall({
    allowFailure: false,
    contracts: [
      { abi: erc20Abi, address: USDC, functionName: "balanceOf", args: [owner] },
      { abi: erc20Abi, address: DEGEN, functionName: "balanceOf", args: [owner] },
      { abi: erc20Abi, address: DEGEN, functionName: "allowance", args: [owner, SWAP_ROUTER_02] },
    ],
  });
  return { usdc, degen, allowance };
}

function report(label, b) {
  console.log(`${label}: USDC=${formatUnits(b.usdc, 6)} DEGEN=${formatUnits(b.degen, 18)} DEGEN->router allowance=${b.allowance}`);
}

async function readAllowance(owner, token) {
  return publicClient.readContract({
    abi: erc20Abi,
    address: token,
    functionName: "allowance",
    args: [owner, SWAP_ROUTER_02],
  });
}

async function sendLeg(walletClient, account, tokenIn, tokenOut, amountIn, label) {
  const quote = await bestQuote(tokenIn, tokenOut, amountIn);
  if (!quote) throw new Error(`no V3 route for ${label}`);
  const minOut = (quote.amountOut * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  console.log(`${label}: best tier ${quote.fee} quoted ${quote.amountOut} (floor ${minOut})`);

  // Skip the approve when a sufficient allowance is already on-chain (e.g.
  // a previous run's approve landed but its swap leg failed).
  let approveGas = 0n;
  if ((await readAllowance(account.address, tokenIn)) < amountIn) {
    const approve = await walletClient.sendTransaction({
      to: tokenIn,
      data: attributed(
        encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [SWAP_ROUTER_02, amountIn] }),
      ),
    });
    console.log(`  approve tx: ${approve}`);
    const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approve });
    if (approveReceipt.status !== "success") throw new Error("approve reverted");
    approveGas = approveReceipt.gasUsed;
  } else {
    console.log("  approve: sufficient allowance already on-chain, skipping");
  }

  // The public Base RPC is load-balanced across nodes with uneven lag; the
  // swap's eth_estimateGas can land on a node that has not seen the approve
  // yet and revert with STF. Wait until THIS client reads the allowance back,
  // then still retry the send a few times for the same reason.
  for (let i = 0; (await readAllowance(account.address, tokenIn)) < amountIn; i++) {
    if (i >= 20) throw new Error("approve not visible after 60s");
    await sleep(3000);
  }

  let swap;
  for (let attempt = 1; ; attempt++) {
    try {
      swap = await walletClient.sendTransaction({
        to: SWAP_ROUTER_02,
        data: attributed(
          encodeFunctionData({
            abi: swapRouter02Abi,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn,
                tokenOut,
                fee: quote.fee,
                recipient: account.address,
                amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0n,
              },
            ],
          }),
        ),
      });
      break;
    } catch (err) {
      if (attempt >= 4 || !String(err).includes("STF")) throw err;
      console.log(`  swap estimate hit a lagging node (STF), retry ${attempt}/3…`);
      await sleep(4000);
    }
  }
  console.log(`  swap tx:    ${swap}`);
  const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swap });
  if (swapReceipt.status !== "success") throw new Error("swap reverted");
  console.log(`  gas used: ${approveGas + swapReceipt.gasUsed}`);
}

const mode = process.argv[2];
if (!["status", "buy", "sweep"].includes(mode)) {
  console.error("usage: node sweep-demo.mjs status|buy|sweep");
  process.exit(1);
}

if (mode === "status") {
  // Read-only: default to wallet 0x6 without needing a key.
  const owner = process.env.OWNER ?? "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D";
  report("status", await balances(owner));
  process.exit(0);
}

const account = privateKeyToAccount(process.env.PRIVATE_KEY);
const walletClient = createWalletClient({ account, chain: base, transport: http(RPC) });
const before = await balances(account.address);
report("before", before);

if (mode === "buy") {
  const spend = 1_000000n; // 1 USDC of deliberate dust
  if (before.usdc < spend) throw new Error("not enough USDC");
  await sendLeg(walletClient, account, USDC, DEGEN, spend, "buy USDC->DEGEN");
} else {
  if (before.degen === 0n) throw new Error("no DEGEN dust to sweep");
  await sendLeg(walletClient, account, DEGEN, USDC, before.degen, "sweep DEGEN->USDC");
}

const after = await balances(account.address);
report("after", after);
if (mode === "sweep" && after.allowance !== 0n) {
  throw new Error("exact-amount approval not fully consumed?!");
}
console.log("done ✅");
