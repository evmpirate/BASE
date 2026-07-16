// Pure helpers shared by app.js — split out so they can be unit-tested
// without spinning up express or touching the chain.

// Tiny TTL cache: chain state changes rarely (badge mints), and public Base
// RPCs rate-limit bursts, so every endpoint memoizes its payload briefly.
export function makeCache(ttlMs, now = Date.now) {
  const store = new Map();
  return async function cached(key, compute) {
    const hit = store.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = await compute();
    store.set(key, { at: now(), value });
    return value;
  };
}

// tokenURI comes back as "data:application/json;base64,<payload>".
export function decodeTokenUri(uri) {
  const [prefix, payload] = uri.split(",");
  if (!prefix?.startsWith("data:") || !prefix.includes("base64") || payload === undefined) {
    throw new Error(`not a base64 data: URI: ${uri.slice(0, 40)}`);
  }
  return JSON.parse(Buffer.from(payload, "base64").toString());
}

// Journey milestones vs actually-minted badge names.
export function journeyStatus(milestones, badges) {
  return milestones.map((m) => ({ milestone: m, earned: badges.some((b) => b.name === m) }));
}
