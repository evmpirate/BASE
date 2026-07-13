# DustSweep — Progress Log

First real dapp: scan and revoke ERC-20 approvals on Base / Base Sepolia.

## Stack

- Next.js 16.2.10 (App Router, TS, Tailwind) + wagmi + viem + @tanstack/react-query
- Wallet connection: wagmi `injected()` connector (no WalletConnect project ID needed);
  RainbowKit/ConnectKit can be added later with a WC Cloud project ID
- Chains: Base Sepolia (default) + Base mainnet

## Status

- [x] Scaffolded (`create-next-app`), wagmi/viem wired via `Providers` in `layout.tsx`
- [x] Curated registry (`src/lib/registry.ts`): 8 tokens x 8 spenders on Base mainnet,
      2 tokens x 2 spenders on Base Sepolia — **all addresses verified on-chain on 2026-07-14**
      (tokens: `symbol()`/`decimals()` match; spenders: bytecode present)
- [x] Approval scan via `useReadContracts` (wagmi batches into multicall) — 64 pairs on mainnet
- [x] Revoke = `approve(spender, 0)` via `useWriteContract`, waits for receipt, auto-rescans
- [x] Mainnet safety: Revoke buttons disabled until an explicit "this costs real ETH" checkbox
- [x] `npm run build` passes (TS target bumped ES2017 -> ES2020 for bigint literals)
- [x] Test data seeded on Base Sepolia from `0x6D48...639D`:
      - USDC -> Permit2, unlimited (tx `0xe311950871cc3d9e9365ef244c8c0e1d087058befb23b2d561f1bc2835786d15`)
      - WETH -> OnchainTrailBadges demo spender, 1.5 WETH (tx `0xe39a1714203fc9272764faaf723f08366b5672f33524146140f607b95101cbf9`)
- [x] Manual walkthrough in browser — user connected, revoked both test approvals;
      allowances confirmed 0 on-chain (user nonce 50 -> 52 on Base Sepolia)
- [x] Bugfix: SSR hydration mismatch (wallet state gated behind client mount)
- [x] Bugfix: `writeContract` was not pinned to the selected chain, so revokes went to
      whatever network the wallet was on (no-op txs to codeless addresses looked
      "successful"). Fixed by passing `chainId` to `writeContract` + a wallet/app
      network-mismatch warning banner with a Switch wallet button.
- [ ] Stretch (not done): batch revoke via multicall / EIP-5792 `sendCalls`

- [x] Mainnet E2E (user-requested, real ETH): seeded USDC->Permit2 (unlimited,
      tx `0xcd5245266352875e2a43e37759f289014ca7300b44ed83fac6ac394c625041dc`) and
      WETH->Aerodrome (0.01, tx `0x9133b409043b193b32fa097587a42f2b7ccdaa94b4bf0a494ec0067030034754`);
      user revoked both via the dapp with the mainnet-armed checkbox; allowances
      confirmed 0 on-chain. Total cost (2 approves + 2 revokes) ~0.0000013 ETH.

**PHASE 2 COMPLETE — verified on Base Sepolia and Base mainnet.**

## Notes

- Production note (also in the UI): brute-forcing a hardcoded token x spender matrix is fine
  for a curated demo; a real product would use an indexer or approvals API (Etherscan,
  Alchemy, Revoke.cash-style) to discover every approval ever granted.
- Read-only mainnet scanning is safe; revokes on mainnet cost real ETH and are gated in the UI.

## Builder Code attribution (ERC-8021, Base mainnet, 2026-07-14)

- Registered builder code `bc_9a7f6zpz` for the wallet via base.dev API (off-chain, free).
- `attributed-revoke.mjs`: viem wallet client with `dataSuffix` from `ox/erc8021`
  (`Attribution.toDataSuffix({ codes: ["bc_9a7f6zpz"] })` = 29-byte ERC-8021 suffix).
- Sent one attributed tx on Base mainnet — DustSweep's core action `approve(Permit2, 0)` on USDC.
  tx `0x8d5004ef2e3f7a47ce76baa4f80c3354b4a3cee32b6dd1987f913f5cc51bc008`, status success,
  verified the suffix rides in calldata (`tx.input` ends with the suffix). Cost ~fraction of a cent.
- Any future DustSweep revoke can carry this suffix by adding `dataSuffix` to its wagmi config.
