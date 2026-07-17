# OnchainTrail Badges

Achievement badges (ERC-721, symbol `TRAIL`) for milestones on a Base builder
journey. Metadata and SVG art are generated fully on-chain — `tokenURI` returns
a base64 `data:` URI, no external hosting involved.

Deployed at the **same address on Base mainnet and Base Sepolia** (same
deployer nonce): [`0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab`](https://basescan.org/address/0x7Db9fC55B64C1d17199069A7f3db73C16C0F20Ab#code),
verified on both explorers. See `PROGRESS.md` for the full deployment record
and [`/badges`](https://base-ten-mauve.vercel.app/badges) for a live gallery
rendered from chain data.

## Contracts

- `src/OnchainTrailBadges.sol` — ERC721 + Ownable; owner-only `mint(to, name)`,
  on-chain JSON + SVG metadata.
- `src/TrailAnchor.sol` — constants-only pointer contract, deployed via the
  deterministic CREATE2 factory.
- `src/TrailBadgesV2.sol` — soulbound (ERC-5192) badges claimed by the earner
  via an agent-signed EIP-712 voucher `{to, name, nonce, deadline}`: anyone may
  relay the claim, the badge always lands at the voucher's `to`; nonce replay
  and expiry are enforced on-chain, the signer key is owner-rotatable, and
  wallet-to-wallet transfers revert. Deployed + verified:
  Base `0x6D85942b2bE0428B24C51E042d24BEF891FBDB58`,
  Base Sepolia `0x68827fb4338bB3dba6C4F9084c25d98295A9d512`.

## Testing

```shell
forge test
```

Three layers:

- **Unit tests** (`test/*.t.sol`) — mint, access control, tokenURI content
  (decoded from base64 in Solidity), revert paths.
- **Fuzz tests** (`testFuzz_*`) — mint round-trips for arbitrary recipients and
  name strings; sequential id allocation.
- **Invariant tests** (`test/OnchainTrailBadges.invariant.t.sol`) — the fuzzer
  drives a handler contract (mint / unauthorized mint / transfer / ownership
  rotation) and after every call sequence checks that contract state matches
  the handler's ghost bookkeeping: ids stay sequential, badges are conserved,
  `tokenURI` stays a well-formed `data:` URI, `Ownable` state only moves
  through tracked rotations. `fail_on_revert = true`, so any unexpected revert
  fails the campaign.

## Gas regression gate

`.gas-snapshot` is a committed baseline of unit-test gas. CI runs

```shell
forge snapshot --check --no-match-test "testFuzz|invariant"
```

and fails if gas drifts from the baseline. Fuzz/invariant tests are excluded
because their reported gas varies run to run. After an intentional gas change,
regenerate with the same command minus `--check` and commit the diff. The
Foundry toolchain is pinned in CI (v1.7.1) because forge's reported gas can
drift between versions.
