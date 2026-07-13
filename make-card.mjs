// Builds the ERC-8004 registration file (agent card) and prints it as a
// data:application/json;base64 URI, ready to be stored fully on-chain.
// Usage: node make-card.mjs [agentId] [chainId]
//   chainId 84532 (default) = Base Sepolia, 8453 = Base mainnet.
// The badges contract has the same address on both networks (same deployer nonce).

const REGISTRIES = {
  84532: "0x8004A818BFB912233c491871b3d84c89A494BD9e", // Base Sepolia
  8453: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", // Base mainnet
};
const BADGES_ADDRESS = "0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab";
const OWNER = "0x6D4843155412832dC3Fa9C59e593cdAfdf52639D";

const agentId = process.argv[2] ? Number(process.argv[2]) : null;
const chainId = process.argv[3] ? Number(process.argv[3]) : 84532;
const IDENTITY_REGISTRY = REGISTRIES[chainId];
if (!IDENTITY_REGISTRY) throw new Error(`unsupported chainId ${chainId}`);

const card = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "TrailKeeper",
  description:
    `Guardian of the OnchainTrail. Reports live achievement-badge progress for a Base builder journey by reading the OnchainTrailBadges (TRAIL) ERC-721 contract on ${chainId === 8453 ? "Base" : "Base Sepolia"}. Ships with a self-hostable progress API (trailkeeper/server.js); the canonical trail state lives in the contract itself.`,
  services: [
    { name: "ens", value: "dupcia.base.eth" },
    { name: "trail-contract", value: `eip155:${chainId}:${BADGES_ADDRESS}` },
  ],
  registrations: agentId ? [{ agentId, agentRegistry: `eip155:${chainId}:${IDENTITY_REGISTRY}` }] : [],
  supportedTrust: ["reputation"],
  owner: OWNER,
};

const json = JSON.stringify(card);
process.stdout.write(`data:application/json;base64,${Buffer.from(json).toString("base64")}`);
