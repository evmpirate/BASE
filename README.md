# BASE

[![CI](https://github.com/evmpirate/BASE/actions/workflows/ci.yml/badge.svg)](https://github.com/evmpirate/BASE/actions/workflows/ci.yml)

Monorepo for Base L2 learning projects, built end-to-end on Base Sepolia and Base mainnet:

- [`trailkeeper/`](./trailkeeper) — ERC-8004 onchain agent reporting badge progress: paid `x402` endpoint, activity feed, on-chain SVG badge gallery (`/badges`), live on Vercel
- [`dustsweep/`](./dustsweep) — ERC-20 approval scanner/revoker dapp (Next.js + wagmi); single-tx batch revoke via EIP-5792 `wallet_sendCalls` with sequential fallback for plain EOAs
- [`onchain-trail-badges/`](./onchain-trail-badges) — TRAIL badge NFT collection with fully onchain SVG metadata (Foundry)

## Live

| Item | Value |
|---|---|
| TrailKeeper (mainnet) | https://base-ten-mauve.vercel.app |
| Badges contract | [`0x7Db9...20Ab`](https://basescan.org/address/0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab#code) — same address on Base and Base Sepolia |
| TrailKeeper ERC-8004 agentId | `58971` (mainnet), `8073` (Sepolia) |
| Owner wallet | `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D` (dupcia.base.eth) |

Each subproject has its own `PROGRESS.md` with the full deployment/tx history.

## Development

Each folder is an independent app/package (own `package.json` or `foundry.toml`) — install and run from within it. See [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) for the exact build/test/lint commands per subproject.
