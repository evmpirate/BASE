import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";

// TrailKeeper — a minimal ERC-8004 agent service.
// Reports live OnchainTrail Badges progress from Base (CHAIN_ID=8453) or
// Base Sepolia (CHAIN_ID=84532, default). The badges contract has the same
// address on both networks.

const PORT = process.env.PORT ?? 4021;
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 84532;

const CHAINS = {
  84532: { chain: baseSepolia, rpc: "https://sepolia.base.org", registry: "0x8004A818BFB912233c491871b3d84c89A494BD9e", label: "base-sepolia" },
  8453: { chain: base, rpc: "https://mainnet.base.org", registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", label: "base" },
};
const CFG = CHAINS[CHAIN_ID];
if (!CFG) throw new Error(`unsupported CHAIN_ID ${CHAIN_ID}`);

const BADGES_ADDRESS = "0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab";
const IDENTITY_REGISTRY = CFG.registry;
const AGENT_ID = process.env.AGENT_ID ? Number(process.env.AGENT_ID) : null;
const OWNER = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D"; // dupcia.base.eth

const badgesAbi = [
  { type: "function", name: "nextTokenId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "badgeName", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
];

// batch:true folds parallel reads into a single JSON-RPC batch request —
// public Base RPCs rate-limit bursts of individual calls.
const client = createPublicClient({ chain: CFG.chain, transport: http(CFG.rpc, { batch: true }) });

// x402: /report is a paid endpoint. Payments stay on Base Sepolia testnet USDC
// regardless of CHAIN_ID (the x402.org facilitator is testnet-only; mainnet
// settlement would need the CDP facilitator + API keys). Payments go to the
// agent's operational wallet; the free /progress stays free.
const PAY_TO = process.env.PAY_TO ?? "0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC";
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  "eip155:84532",
  new ExactEvmScheme(),
);

const app = express();

// Chain state changes rarely (badge mints); a short cache keeps us clear of
// public-RPC rate limits even under bursts of traffic.
const CACHE_TTL_MS = 30_000;
const cache = new Map();
async function cached(key, compute) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const value = await compute();
  cache.set(key, { at: Date.now(), value });
  return value;
}

app.use(
  paymentMiddleware(
    {
      "GET /report": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.001",
            network: "eip155:84532", // Base Sepolia
            payTo: PAY_TO,
          },
        ],
        description: "Premium OnchainTrail report: badges with full on-chain metadata",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.get("/", (_req, res) => {
  res.json({
    agent: "TrailKeeper",
    purpose: "Reports OnchainTrail Badges progress for dupcia.base.eth's Base builder journey",
    endpoints: ["/.well-known/agent-card.json", "/progress", "/report (paid, x402, $0.001 USDC)"],
  });
});

// ERC-8004 registration file / agent card.
app.get("/.well-known/agent-card.json", (_req, res) => {
  res.json({
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "TrailKeeper",
    description:
      `Guardian of the OnchainTrail. Reports live achievement-badge progress for a Base builder journey by reading the OnchainTrailBadges (TRAIL) ERC-721 contract on ${CHAIN_ID === 8453 ? "Base" : "Base Sepolia"}.`,
    image: "https://sepolia.basescan.org/token/images/default.png",
    services: [
      { name: "web", url: PUBLIC_URL, endpoint: PUBLIC_URL },
      { name: "progress-api", url: `${PUBLIC_URL}/progress`, endpoint: `${PUBLIC_URL}/progress` },
      { name: "ens", value: "dupcia.base.eth", endpoint: "https://www.base.org/name/dupcia" },
    ],
    registrations: AGENT_ID
      ? [{ agentId: AGENT_ID, agentRegistry: `eip155:${CHAIN_ID}:${IDENTITY_REGISTRY}` }]
      : [],
    supportedTrust: ["reputation"],
    owner: OWNER,
    trailContract: `eip155:${CHAIN_ID}:${BADGES_ADDRESS}`,
  });
});

// Live progress read from the OnchainTrailBadges contract.
app.get("/progress", async (_req, res) => {
  try {
    const payload = await cached("progress", async () => {
    const nextId = await client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "nextTokenId" });
    const total = Number(nextId) - 1;
    // Multicall3: all reads in one eth_call — public RPCs rate-limit bursts.
    const calls = [];
    for (let id = 1; id <= total; id++) {
      calls.push(
        { address: BADGES_ADDRESS, abi: badgesAbi, functionName: "badgeName", args: [BigInt(id)] },
        { address: BADGES_ADDRESS, abi: badgesAbi, functionName: "ownerOf", args: [BigInt(id)] },
      );
    }
    const results = await client.multicall({ contracts: calls, allowFailure: false });
    const badges = [];
    for (let id = 1; id <= total; id++) {
      badges.push({ tokenId: id, name: results[(id - 1) * 2], owner: results[(id - 1) * 2 + 1] });
    }
    const milestones = ["First Deploy", "First Dapp", "First Agent", "First Mainnet Deploy", "First x402 Payment"];
    return {
      collection: "OnchainTrail Badges (TRAIL)",
      contract: BADGES_ADDRESS,
      chain: CFG.label,
      badgesMinted: total,
      badges,
      journey: milestones.map((m) => ({ milestone: m, earned: badges.some((b) => b.name === m) })),
    };
    });
    res.json(payload);
  } catch (err) {
    let c = err, chain = [];
    while (c) { chain.push(`${c.name ?? ""}: ${(c.details ?? c.message ?? "").split("\n")[0]}`); c = c.cause; }
    console.error("progress error:", chain.join(" <- "));
    res.status(502).json({ error: "chain read failed", detail: String(err) });
  }
});

// Premium report: everything /progress has, plus full on-chain metadata
// (tokenURI) for each badge. Reachable only through an x402 payment.
app.get("/report", async (_req, res) => {
  try {
    const payload = await cached("report", async () => {
    const uriAbi = [
      { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
    ];
    const nextId = await client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "nextTokenId" });
    const total = Number(nextId) - 1;
    const calls = [];
    for (let id = 1; id <= total; id++) {
      calls.push(
        { address: BADGES_ADDRESS, abi: badgesAbi, functionName: "badgeName", args: [BigInt(id)] },
        { address: BADGES_ADDRESS, abi: badgesAbi, functionName: "ownerOf", args: [BigInt(id)] },
        { address: BADGES_ADDRESS, abi: uriAbi, functionName: "tokenURI", args: [BigInt(id)] },
      );
    }
    const results = await client.multicall({ contracts: calls, allowFailure: false });
    const badges = [];
    for (let id = 1; id <= total; id++) {
      const [name, owner, uri] = results.slice((id - 1) * 3, id * 3);
      const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
      badges.push({ tokenId: id, name, owner, metadata });
    }
    return {
      report: "OnchainTrail premium report",
      generatedAt: new Date().toISOString(),
      agentId: AGENT_ID,
      collection: "OnchainTrail Badges (TRAIL)",
      contract: BADGES_ADDRESS,
      chain: CFG.label,
      badgesMinted: total,
      badges,
    };
    });
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: "chain read failed", detail: String(err) });
  }
});

export default app;
