# OnchainTrail Badges — Progress Log

Practice project: first real NFT collection deploy on Base Sepolia.

- **Owner wallet (badge recipient):** `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D` (dupcia.base.eth)
- **Deployer (testnet burner):** `0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC`
- **Network:** Base Sepolia (chain ID 84532, RPC https://sepolia.base.org, explorer https://sepolia.basescan.org)

## Status

- [x] Foundry project scaffolded (`forge init`), OpenZeppelin v5.6.1 installed
- [x] `OnchainTrailBadges.sol` — ERC721 + Ownable, owner-only `mint(to, name)`, fully on-chain SVG metadata (base64 data URIs)
- [x] Tests: 5/5 passing (mint, access control, tokenURI content via base64 decode, nonexistent-token revert)
- [ ] Deploy to Base Sepolia — waiting on burner funding
- [ ] Verify source on sepolia.basescan.org — waiting on BaseScan API key
- [ ] Mint badge #1 "First Deploy" to owner wallet

## Deployment record

| Item | Value |
|------|-------|
| Contract address | _(pending)_ |
| Deploy tx | _(pending)_ |
| Mint #1 tx | _(pending)_ |

## Notes

- Metadata is 100% on-chain: `tokenURI` returns `data:application/json;base64,...` with an embedded SVG — no IPFS or server dependency.
- Private key lives only in `.env` (gitignored). Burner is testnet-only.
