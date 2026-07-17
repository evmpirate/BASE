# 🧹 DustSweep

Approval hygiene for Base: scan a wallet's ERC-20 approvals **and Permit2 sub-allowances**, then revoke them — one at a time or all at once.

**Live: https://dustsweep-eight.vercel.app**

## Features

- **Two-layer scan** — classic `allowance(owner, spender)` on a curated token/spender matrix, plus Permit2's own allowance book (`allowance(owner, token, spender)` → amount/expiry). Revoking the ERC-20 approval alone does not clear Permit2 grants; this shows both.
- **Batch revoke (EIP-5792)** — select rows and clear them in a single wallet confirmation via `wallet_sendCalls`; wallets without batching get a sequential fallback automatically.
- **Permit2 lockdown** — zero every Permit2 grant in one transaction using Permit2's native `lockdown()`.
- **Scan any token** — paste an address; symbol/decimals are resolved on-chain and the token joins both scan layers.
- **Risk-first ordering** — unlimited approvals surface at the top.
- **USD exposure (Chainlink)** — finite allowances show their dollar value from on-chain Chainlink feeds (Base mainnet). Only curated tokens are priced — a pasted token spoofing a known symbol gets no value — and rounds older than the slowest feed heartbeat are dropped rather than displayed.
- **Wrong-network guard** — writes are pinned to the selected chain; a mismatch banner offers a one-click switch.
- **Mainnet safety** — Base mainnet revokes stay disabled behind an explicit arm checkbox.
- **ERC-8021 attribution** — every revoke carries the registered builder code `bc_9a7f6zpz` as a calldata suffix.

## Chains

Base (8453) and Base Sepolia (84532). The registry in `src/lib/registry.ts` is hand-curated and verified on-chain.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest suite for src/lib
npm run typecheck
```

## Deployment

Deployed on Vercel (project `dustsweep`, Root Directory `dustsweep/`), auto-deploys on every push to `master`.

Part of the [BASE monorepo](https://github.com/evmpirate/BASE).
