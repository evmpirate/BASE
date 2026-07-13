import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

// TrailKeeper — a minimal ERC-8004 agent service.
// Reports live OnchainTrail Badges progress straight from Base Sepolia.

const PORT = process.env.PORT ?? 4021;
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;

const BADGES_ADDRESS = "0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab";
const IDENTITY_REGISTRY = "0x8004A818BFB912233c491871b3d84c89A494BD9e"; // ERC-8004, Base Sepolia
const AGENT_ID = process.env.AGENT_ID ? Number(process.env.AGENT_ID) : null;
const OWNER = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D"; // dupcia.base.eth

const badgesAbi = [
  { type: "function", name: "nextTokenId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "badgeName", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
];

const client = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });

// x402: /report is a paid endpoint. Payments (testnet USDC on Base Sepolia)
// go to the agent's operational wallet; the free /progress stays free.
const PAY_TO = process.env.PAY_TO ?? "0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC";
const facilitatorClient = new HTTPFacilitatorClient({ url: "https://x402.org/facilitator" });
const resourceServer = new x402ResourceServer(facilitatorClient).register(
  "eip155:84532",
  new ExactEvmScheme(),
);

const app = express();

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
      "Guardian of the OnchainTrail. Reports live achievement-badge progress for a Base builder journey by reading the OnchainTrailBadges (TRAIL) ERC-721 contract on Base Sepolia.",
    image: "https://sepolia.basescan.org/token/images/default.png",
    services: [
      { name: "web", url: PUBLIC_URL },
      { name: "progress-api", url: `${PUBLIC_URL}/progress` },
      { name: "ens", value: "dupcia.base.eth" },
    ],
    registrations: AGENT_ID
      ? [{ agentId: AGENT_ID, agentRegistry: `eip155:84532:${IDENTITY_REGISTRY}` }]
      : [],
    supportedTrust: ["reputation"],
    owner: OWNER,
    trailContract: `eip155:84532:${BADGES_ADDRESS}`,
  });
});

// Live progress read from the OnchainTrailBadges contract.
app.get("/progress", async (_req, res) => {
  try {
    const nextId = await client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "nextTokenId" });
    const total = Number(nextId) - 1;
    const badges = [];
    for (let id = 1; id <= total; id++) {
      const [name, owner] = await Promise.all([
        client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "badgeName", args: [BigInt(id)] }),
        client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "ownerOf", args: [BigInt(id)] }),
      ]);
      badges.push({ tokenId: id, name, owner });
    }
    const milestones = ["First Deploy", "First Dapp", "First Agent"];
    res.json({
      collection: "OnchainTrail Badges (TRAIL)",
      contract: BADGES_ADDRESS,
      chain: "base-sepolia",
      badgesMinted: total,
      badges,
      journey: milestones.map((m) => ({ milestone: m, earned: badges.some((b) => b.name === m) })),
    });
  } catch (err) {
    res.status(502).json({ error: "chain read failed", detail: String(err) });
  }
});

// Premium report: everything /progress has, plus full on-chain metadata
// (tokenURI) for each badge. Reachable only through an x402 payment.
app.get("/report", async (_req, res) => {
  try {
    const uriAbi = [
      { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }] },
    ];
    const nextId = await client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "nextTokenId" });
    const total = Number(nextId) - 1;
    const badges = [];
    for (let id = 1; id <= total; id++) {
      const [name, owner, uri] = await Promise.all([
        client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "badgeName", args: [BigInt(id)] }),
        client.readContract({ address: BADGES_ADDRESS, abi: badgesAbi, functionName: "ownerOf", args: [BigInt(id)] }),
        client.readContract({ address: BADGES_ADDRESS, abi: uriAbi, functionName: "tokenURI", args: [BigInt(id)] }),
      ]);
      const metadata = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
      badges.push({ tokenId: id, name, owner, metadata });
    }
    res.json({
      report: "OnchainTrail premium report",
      generatedAt: new Date().toISOString(),
      agentId: AGENT_ID,
      collection: "OnchainTrail Badges (TRAIL)",
      contract: BADGES_ADDRESS,
      chain: "base-sepolia",
      badgesMinted: total,
      badges,
    });
  } catch (err) {
    res.status(502).json({ error: "chain read failed", detail: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`TrailKeeper listening on :${PORT} (public: ${PUBLIC_URL})`);
});
