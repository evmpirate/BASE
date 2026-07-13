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
- [ ] Manual walkthrough in browser (connect wallet, revoke the two test approvals)
- [ ] Stretch: batch revoke via multicall / EIP-5792 `sendCalls`

## Notes

- Production note (also in the UI): brute-forcing a hardcoded token x spender matrix is fine
  for a curated demo; a real product would use an indexer or approvals API (Etherscan,
  Alchemy, Revoke.cash-style) to discover every approval ever granted.
- Read-only mainnet scanning is safe; revokes on mainnet cost real ETH and are gated in the UI.
