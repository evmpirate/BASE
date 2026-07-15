# BASE Journal

Log of onchain actions taken from the main wallet `0x6D4843155412832dC3Fa9C59e593cdAfdf52639D`
(dupcia.base.eth), continuing the Base builder journey now that trailkeeper/dustsweep/
onchain-trail-badges live in this monorepo. Mirrors the mechanism roadmap identified by
comparing against the amberforge program (`~/BASE2/amberforge`, wallet 0x23dd...).

## 2026-07-15 — Repo consolidation + CI

- Merged trailkeeper, dustsweep, onchain-trail-badges into this monorepo via `git subtree`
  (full history preserved), pushed to https://github.com/evmpirate/BASE (account evmpirate).
- Added `.github/workflows/ci.yml` (contracts/dustsweep/trailkeeper jobs), MIT `LICENSE`,
  expanded `README.md` with live links.

## 2026-07-15 — WETH wrap/unwrap (first-time mechanism)

- `deposit()` 0.0005 ETH -> WETH: tx `0x85291cb17ccc2284a4a9175ef24864eeca80d447a74f364bfd09b19f0e29ea59`
- `withdraw(500000000000000)` WETH -> ETH: tx `0x58815ba01b688738bb9e71d48881f77336315b6a97aac6554ff0c810ac442342`
- WETH predeploy `0x4200000000000000000000000000000000000006` (standard OP-stack address, same as amberforge used).
- Verified: WETH balance 0 -> 500000000000000 -> 0. Total gas cost ~0.00000045 ETH (both txs).

## 2026-07-15 — CREATE2 deterministic deploy (first-time mechanism)

- `onchain-trail-badges/src/TrailAnchor.sol` — on-chain pointer contract (repo/app URLs, agentIds),
  same pattern as amberforge's AmberAnchor.
- Deployed through the canonical CREATE2 factory `0x4e59b44847b379578588920cA78FbF26c0B4956C`
  with salt `keccak256("base-trail-anchor")` = `0x3fb17e40317aa6603ae0168248c0c305cf04f0efbcddcadd4632c9508b6fc145`.
- Address (pure function of factory+salt+initcode): `0x252e561e15715085c97bfD0f07cb94B6c95A7Bc8`
- Deploy tx: `0x8ca3bf4a0b1fca5800ad981bfd859038fd03c4a810271be2dddc36f522ef91df`
- Verified on BaseScan: https://basescan.org/address/0x252e561e15715085c97bfd0f07cb94b6c95a7bc8#code
- Reads confirmed: `REPO()` = github.com/evmpirate/BASE, `APP()` = trailkeeper-three.vercel.app.
