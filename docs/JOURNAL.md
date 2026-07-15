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

## 2026-07-15 — Multicall3 aggregate3Value atomic batch (first-time mechanism)

- First attempt (mistake, kept for the lesson): `deposit()` 0.0003 ETH + `approve(Permit2, 0.0003)`
  in one `aggregate3Value` call, tx `0xfd97c8f9c8f37fb2e0d526cd1fb0f14280991e316f1b689613505723b56cfbe2`.
  **Caveat** (same one amberforge's docs flag): inside the batch, `msg.sender` seen by each target
  is the Multicall3 singleton (`0xcA11bde05977b3631167028862bE2a173976CA11`), not the EOA — so the
  WETH and the approval landed on Multicall3 itself, a contract shared by every dapp on Base. Its
  balance is not ours to keep; it nets out against unrelated third-party traffic within seconds
  (confirmed: balance was already back to 0 by the next read, across multiple independent RPCs —
  not a stale-read artifact, real shared-contract churn). The stray `Multicall3 -> Permit2` approval
  for 0.0003 WETH is harmless (Permit2 can't move funds without a signature only the real owner can
  produce) but pointless.
- Corrected batch: `deposit()` 0.0002 ETH + `transfer(0x6D48...639D, 0.0002 WETH)` atomically —
  routes the value back to the EOA within the same multicall, tx
  `0x860e22e712a7f8fd05c6e19a7b67cbc043804d06af4bcffffb05f082eb855372`.
  Verified: wallet 0x6 WETH balance = 0.0002 after, in a single atomic transaction.
- Lesson: any Multicall3 batch that should benefit the caller needs an explicit final leg
  (`transfer`/`safeTransferFrom`/etc.) routing results back to the EOA — sender-identity-sensitive
  calls do NOT see the EOA as `msg.sender` inside a batch.

## 2026-07-15 — Basename text records + subname (first-time mechanism)

- `dupcia.base.eth` node `0xae791437...55fc82c6`, registry `0xB94704422c2a1E396835A571837Aa5AE53285a95`,
  resolver `0xC6d566A56A1aFf6508b41f6c90ff131615583BCD` (owner confirmed = wallet 0x6).
- Text records set via resolver's own `multicall` (two `setText` in one tx):
  `com.github` -> `evmpirate`, `url` -> `https://trailkeeper-three.vercel.app`.
  tx `0xa8200f10f1560b2799177725ba8851a1ee4efe07d9cbd7af3f01384a6de92ea9`
- Subname `trailkeeper.dupcia.base.eth` minted via registry `setSubnodeRecord`
  (label = keccak256("trailkeeper"), owner = wallet 0x6, same resolver, ttl 0):
  tx `0x3d580971e8e9383e1fe0d3aefcf52484dbad5fc48743f628121777dc1282c319`
- Subname records (`addr` -> wallet 0x6, `url` -> trailkeeper URL), again via resolver multicall:
  tx `0x19b982da9859cf70a620afe37526c0c7b2df404569ad5091bcd0abfa9da894b8`
- Registry is standard ENS-shaped (Basenames) — subnames are free and owner-mintable, same pattern
  amberforge used for `ambermind.evmpirate.base.eth`.
