// Local indexer runs with persistent state (.index-<chainId>.json next to
// this file): backfill once, then optionally follow the chain.
//
//   CHAIN_ID=8453 node indexer-cli.mjs            one sync, then exit
//   CHAIN_ID=8453 node indexer-cli.mjs --follow   keep syncing every 30s
import { fileURLToPath } from "node:url";
import { createPublicClient, fallback, http } from "viem";
import { BADGES_ADDRESS, CHAINS } from "./app.js";
import { createIndexer, fileStorage } from "./indexer.js";

const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 84532;
const CFG = CHAINS[CHAIN_ID];
if (!CFG) throw new Error(`unsupported CHAIN_ID ${CHAIN_ID}`);

const transports = [CFG.rpc, ...CFG.fallbackRpcs].map((url) => http(url, { batch: true, retryCount: 1 }));
const client = createPublicClient({ chain: CFG.chain, transport: fallback(transports, { rank: false }) });

const statePath = fileURLToPath(new URL(`./.index-${CHAIN_ID}.json`, import.meta.url));
const index = createIndexer({ client, address: BADGES_ADDRESS, fromBlock: CFG.deployBlock, storage: fileStorage(statePath) });

let known = index.events().length;
async function tick() {
  const total = await index.sync();
  for (const e of index.events().slice(known)) {
    console.log(`mint #${e.tokenId} -> ${e.to} @ ${e.blockNumber} (${new Date(e.timestamp * 1000).toISOString()}) ${e.txHash}`);
  }
  known = total;
  console.log(`[${CFG.label}] cursor=${index.cursor()} events=${total}`);
}

await tick();
if (process.argv.includes("--follow")) {
  setInterval(() => tick().catch((err) => console.error("sync failed:", String(err).split("\n")[0])), 30_000);
}
