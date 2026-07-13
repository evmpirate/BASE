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

## Mainnet path (when/if desired — costs real ETH, requires explicit confirmation)

Same commands with `--rpc-url https://mainnet.base.org` (chain 8453, explorer basescan.org).
Estimated cost at current Base gas prices: well under $1 for deploy + mint.
Consider `transferOwnership(0x6D48...639D)` after deploy so the main wallet controls minting.

## Notes

- Metadata is 100% on-chain: `tokenURI` returns `data:application/json;base64,...` with an embedded SVG — no IPFS or server dependency.
- Private key lives only in `.env` (gitignored). Burner is testnet-only.
