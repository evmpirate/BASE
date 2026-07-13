import express from "express";
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

const app = express();

app.get("/", (_req, res) => {
  res.json({
    agent: "TrailKeeper",
    purpose: "Reports OnchainTrail Badges progress for dupcia.base.eth's Base builder journey",
    endpoints: ["/.well-known/agent-card.json", "/progress"],
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

app.listen(PORT, () => {
  console.log(`TrailKeeper listening on :${PORT} (public: ${PUBLIC_URL})`);
});
