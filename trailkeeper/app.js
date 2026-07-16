import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { createPublicClient, http } from "viem";
import { base, baseSepolia } from "viem/chains";
import { decodeTokenUri, journeyStatus, makeCache } from "./lib.js";

// TrailKeeper — a minimal ERC-8004 agent service.
// Reports live OnchainTrail Badges progress from Base (CHAIN_ID=8453) or
// Base Sepolia (CHAIN_ID=84532, default). The badges contract has the same
// address on both networks.

const PORT = process.env.PORT ?? 4021;
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 84532;

const CHAINS = {
  84532: { chain: baseSepolia, rpc: "https://sepolia.base.org", registry: "0x8004A818BFB912233c491871b3d84c89A494BD9e", label: "base-sepolia", deployBlock: 44105184n, explorer: "https://sepolia.basescan.org" },
  8453: { chain: base, rpc: "https://mainnet.base.org", registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432", label: "base", deployBlock: 48597020n, explorer: "https://basescan.org" },
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
const cached = makeCache(30_000);

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
    endpoints: ["/.well-known/agent-card.json", "/progress", "/activity", "/badges", "/dashboard", "/report (paid, x402, $0.001 USDC)"],
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
      journey: journeyStatus(milestones, badges),
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
      const metadata = decodeTokenUri(uri);
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

// Recent on-chain activity: badge mints (Transfer from the zero address), read via
// chunked eth_getLogs — public Base RPCs cap a single call at ~10k blocks.
const transferEvent = { type: "event", name: "Transfer", inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "tokenId", type: "uint256", indexed: true }] };
async function getMintLogs() {
  const latest = await client.getBlockNumber();
  let logs = [];
  for (let from = CFG.deployBlock; from <= latest; from += 9000n) {
    const to = from + 8999n > latest ? latest : from + 8999n;
    const chunk = await client.getLogs({
      address: BADGES_ADDRESS,
      event: transferEvent,
      args: { from: "0x0000000000000000000000000000000000000000" },
      fromBlock: from,
      toBlock: to,
    });
    logs = logs.concat(chunk);
  }
  return logs;
}

app.get("/activity", async (_req, res) => {
  try {
    const payload = await cached("activity", async () => {
      const logs = await getMintLogs();
      const withTime = await Promise.all(
        logs.map(async (l) => {
          const block = await client.getBlock({ blockNumber: l.blockNumber });
          return {
            type: "mint",
            tokenId: Number(l.args.tokenId),
            to: l.args.to,
            txHash: l.transactionHash,
            blockNumber: Number(l.blockNumber),
            timestamp: Number(block.timestamp),
            explorerUrl: `${CFG.explorer}/tx/${l.transactionHash}`,
          };
        }),
      );
      return { chain: CFG.label, events: withTime.reverse() };
    });
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: "chain read failed", detail: String(err) });
  }
});

// Badge gallery data: tokenId/name/owner plus the on-chain SVG image extracted
// from tokenURI (the contract stores full metadata as a base64 data: URI).
// Unlike /report this stays free — it exposes the images, not the full metadata.
app.get("/badges.json", async (_req, res) => {
  try {
    const payload = await cached("badges.json", async () => {
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
        const metadata = decodeTokenUri(uri);
        badges.push({ tokenId: id, name, owner, image: metadata.image });
      }
      return { chain: CFG.label, contract: BADGES_ADDRESS, explorer: CFG.explorer, badges };
    });
    res.json(payload);
  } catch (err) {
    res.status(502).json({ error: "chain read failed", detail: String(err) });
  }
});

// Badge gallery — renders each badge's fully on-chain SVG. No build step,
// same pattern as /dashboard.
app.get("/badges", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>TrailKeeper — badge gallery</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;max-width:960px;margin:2rem auto;padding:0 1rem}
h1{font-size:1.3rem} .sub{color:#888;font-size:.85rem}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;margin-top:1.5rem}
.card{background:#151515;border:1px solid #2a2a2a;border-radius:8px;padding:1rem;text-align:center}
.card img{width:100%;height:auto;border-radius:6px;background:#000}
.card .name{margin:.6rem 0 .2rem;font-weight:600}
.card .owner{font-family:ui-monospace,monospace;font-size:.75rem;color:#888}
a{color:#7eb6ff}
</style></head><body>
<h1>TrailKeeper — badge gallery</h1>
<p class="sub">Every image below is stored fully on-chain (base64 SVG inside <code>tokenURI</code>).</p>
<div class="grid" id="grid">loading…</div>
<script>
fetch("/badges.json").then(r=>r.json()).then(d=>{
  document.getElementById("grid").innerHTML = d.badges.map(b =>
    '<div class="card"><img src="' + b.image + '" alt="' + b.name + '">' +
    '<div class="name">#' + b.tokenId + ' ' + b.name + '</div>' +
    '<div class="owner">' + b.owner.slice(0,10) + '…' + b.owner.slice(-6) + '</div>' +
    '<a href="' + d.explorer + '/nft/' + d.contract + '/' + b.tokenId + '" target="_blank">explorer</a></div>'
  ).join("") || "no badges yet";
}).catch(e=>{document.getElementById("grid").textContent = "failed to load: " + e;});
</script>
</body></html>`);
});

// Minimal no-build activity panel — fetches /progress and /activity client-side.
app.get("/dashboard", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><meta charset="utf-8"><title>TrailKeeper — onchain footprint</title>
<style>
body{font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;max-width:720px;margin:2rem auto;padding:0 1rem}
h1{font-size:1.3rem} .card{background:#151515;border:1px solid #2a2a2a;border-radius:8px;padding:1rem;margin:1rem 0}
.badge{display:inline-block;padding:.2rem .6rem;border-radius:999px;background:#1e3a24;color:#7ee08a;font-size:.8rem;margin:.2rem}
.badge.pending{background:#3a1e1e;color:#e08a8a}
a{color:#7eb6ff} .row{display:flex;justify-content:space-between;border-top:1px solid #222;padding:.4rem 0;font-size:.85rem}
</style></head><body>
<h1>TrailKeeper — onchain footprint</h1>
<p><a href="/badges">badge gallery →</a></p>
<div class="card"><div id="journey">loading…</div></div>
<div class="card"><h2 style="font-size:1rem">Recent activity</h2><div id="activity">loading…</div></div>
<script>
fetch("/progress").then(r=>r.json()).then(p=>{
  document.getElementById("journey").innerHTML =
    "<b>" + p.badgesMinted + "/" + p.journey.length + "</b> milestones earned on " + p.chain +
    "<br>" + p.journey.map(m => '<span class="badge' + (m.earned ? '' : ' pending') + '">' + m.milestone + '</span>').join("");
});
fetch("/activity").then(r=>r.json()).then(a=>{
  document.getElementById("activity").innerHTML = a.events.map(e =>
    '<div class="row"><span>Badge #' + e.tokenId + ' -> ' + e.to.slice(0,10) + '…</span>' +
    '<a href="' + e.explorerUrl + '" target="_blank">' + e.txHash.slice(0,10) + '…</a></div>'
  ).join("") || "no activity yet";
});
</script>
</body></html>`);
});

export default app;
