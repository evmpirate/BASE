# E2E tests (Playwright + anvil fork)

Full UI flow driven by a mock wallet against a local Base-mainnet fork — no
browser extension, no real funds. The mock account is a real owner with a live
Permit2 grant, so the scan surfaces genuine on-chain state.

```bash
# 1) fork Base mainnet at the pinned block (from repo root)
FORK_BLOCK=48705000 ./scripts/anvil-fork.sh

# 2) browsers + system libs (once)
npx playwright install --with-deps chromium

# 3) run — Playwright boots `next dev` in E2E mode itself
npm run e2e
```

`NEXT_PUBLIC_E2E=1` swaps the injected connector for wagmi's `mock` connector
(pre-set account) and points Base's transport at the fork RPC (`src/lib/wagmi.ts`).
