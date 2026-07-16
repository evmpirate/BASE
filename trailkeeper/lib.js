// Pure helpers shared by app.js — split out so they can be unit-tested
// without spinning up express or touching the chain.

// Tiny TTL cache with stale-while-revalidate: chain state changes rarely
// (badge mints), and public Base RPCs rate-limit bursts AND intermittently
// fail, so every endpoint memoizes its payload briefly and keeps serving the
// last known payload through an RPC outage for up to maxStaleMs.
//
// Lifecycle of an entry, by age:
//   < ttlMs                 fresh — served as-is
//   < ttlMs + maxStaleMs    stale — served immediately, refreshed in the
//                           background (deduped; a failed refresh keeps the
//                           stale value in play until the hard limit)
//   beyond                  gone — caller waits for a fresh compute and sees
//                           its error if it fails
export function makeCache(ttlMs, { maxStaleMs = 0, now = Date.now } = {}) {
  const store = new Map();
  const inflight = new Map();

  function refresh(key, compute) {
    if (inflight.has(key)) return inflight.get(key);
    const p = compute()
      .then((value) => {
        store.set(key, { at: now(), value });
        return value;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  return async function cached(key, compute) {
    const hit = store.get(key);
    const age = hit ? now() - hit.at : Infinity;
    if (age < ttlMs) return hit.value;
    if (age < ttlMs + maxStaleMs) {
      // Background revalidate; on serverless this may be cut short after the
      // response is sent — acceptable, the next request just tries again.
      refresh(key, compute).catch(() => {});
      return hit.value;
    }
    return refresh(key, compute);
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

// Fixed-window rate limiter, per client IP. Best-effort by design: state is
// per process, so on serverless each instance counts separately — the goal
// is protecting the public-RPC quota behind the JSON endpoints from a single
// noisy client, not hard quota enforcement.
export function makeRateLimiter({ limit = 120, windowMs = 60_000, now = Date.now } = {}) {
  const hits = new Map(); // ip -> { count, resetAt }
  return function rateLimit(req, res, next) {
    if (hits.size > 10_000) {
      for (const [ip, slot] of hits) if (now() >= slot.resetAt) hits.delete(ip);
    }
    const ip = req.ip ?? "unknown";
    const slot = hits.get(ip);
    if (!slot || now() >= slot.resetAt) {
      hits.set(ip, { count: 1, resetAt: now() + windowMs });
      return next();
    }
    if (++slot.count > limit) {
      res.set("Retry-After", String(Math.ceil((slot.resetAt - now()) / 1000)));
      return res.status(429).json({ error: "rate limited", retryAfterSeconds: Math.ceil((slot.resetAt - now()) / 1000) });
    }
    next();
  };
}
