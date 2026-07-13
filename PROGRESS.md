# OnchainTrail Badges — Progress Log

Practice project: first real NFT collection deploy on Base Sepolia.

- **Owner wallet (badge recipient):** `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D` (dupcia.base.eth)
- **Deployer (testnet burner):** `0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC`
- **Network:** Base Sepolia (chain ID 84532, RPC https://sepolia.base.org, explorer https://sepolia.basescan.org)

## Status

- [x] Foundry project scaffolded (`forge init`), OpenZeppelin v5.6.1 installed
- [x] `OnchainTrailBadges.sol` — ERC721 + Ownable, owner-only `mint(to, name)`, fully on-chain SVG metadata (base64 data URIs)
- [x] Tests: 5/5 passing (mint, access control, tokenURI content via base64 decode, nonexistent-token revert)
- [x] Burner funded with 0.02 ETH from main wallet (tx `0xacc892b4794a5c1073896d1ce8b7dce82427112bac8164bd29d27a50c0e9d947`)
- [x] Deployed to Base Sepolia
- [x] Minted badge #1 "First Deploy" to `0x6D48...639D`, on-chain tokenURI JSON confirmed via `cast call` + base64 decode
- [x] Source verified on sepolia.basescan.org (Etherscan v2 API, solc 0.8.30, optimizer 200 runs) — https://sepolia.basescan.org/address/0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab#code

**PHASE 1 COMPLETE.**

## Deployment record

| Item | Value |
|------|-------|
| Contract address | `0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab` |
| Explorer | https://sepolia.basescan.org/address/0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab |
| Deploy tx | `0xa37dd6c48e6374fe4c24eee56bb7271126977aab25e90c0d5e1601f3ae97f52d` |
| Mint #1 tx | `0x94d7eab0b31e8b95dc2a89e864850f4d156198c04e7d9910e4797e2d13a1bfde` |
| Badge #1 | "First Deploy" → owned by `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D` |
| Contract owner | burner `0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC` |

## Mainnet deployment (2026-07-14, user-confirmed)

| Item | Value |
|------|-------|
| Contract address | `0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab` — **same as Sepolia** (same deployer nonce) |
| Explorer | https://basescan.org/address/0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab#code (verified) |
| Badge #1 "First Deploy" | tx `0x9e7f67194825b50eb9950c3f831c73a295939f60d7c0cfcfddf0547c3a41347b` (from burner) |
| Badge #2 "First Dapp" | tx `0xfc344e870dc5a02c4760228687e5d8b70c4b1fac6f755d8e193e446b966e322e` (from main wallet) |
| Badge #3 "First Agent" | tx `0xbd0489f42ffb45e4c17f825b31890d68ceb407c9934dbf9e2438d4e725a59536` (from main wallet) |
| Ownership | transferred to main wallet `0x6D48...639D`, tx `0xe59fcd2551a0e1189fc16798fa1d9badf94ae9532e45cf84ff3c292cc9318778` |

Note: mints #2/#3 initially failed from the burner (flaky public RPC returned a stale nonce)
and were re-sent from the main wallet after `transferOwnership` had landed. Total mainnet cost
(funding + deploy + verify + 3 mints + ownership transfer) was well under 0.0001 ETH.

## Notes

- Metadata is 100% on-chain: `tokenURI` returns `data:application/json;base64,...` with an embedded SVG — no IPFS or server dependency.
- Private key lives only in `.env` (gitignored). Burner is testnet-only.
