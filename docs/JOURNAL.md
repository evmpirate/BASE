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

## 2026-07-15 — EAS schema + attestation (first-time mechanism)

- EAS is an OP-Stack predeploy: SchemaRegistry `0x4200...0020`, EAS `0x4200...0021`.
- Registered schema `string action,bytes32 txRef,address wallet` (resolver 0x0, revocable=true).
  UID `0xe55f06091abd36404dcf739e5ca251654ce619da54eb3241bebee24cf34e4d9e`
  tx `0xade70f6156fc1a4397c9cf9996ec37ff317df90201d5bad201f46febfdb647cf`
  (note: the plain amberforge schema string `"string action,bytes32 txRef"` with resolver 0x0/revocable
  true already existed globally — schema UID is a pure function of (schema, resolver, revocable), so
  re-registering it reverts `AlreadyExists`; added a `wallet` field for a distinct schema.)
- Attested a real record: action=`atomic-multicall-wrap-and-transfer`, txRef=the Multicall3 tx above,
  wallet=0x6. UID `0x968a41ce20e2646168dba379ebc3b5c718f594dea0248c50582ab5ffa65dfd45`
  tx `0x37b4cb0307dbc7d1e60752e4e2c5a512a0d5e75a41280be8d6892bfd095df818`
- **Skipped**: a throwaway "scratch" attestation purely to demo `revoke()` — that is exactly the kind
  of fabricated activity ruled out by house policy (don't spend real gas on a fake record just to
  probe a mechanism). The registered schema is revocable, so a genuine revoke can happen later against
  a real record if one is ever actually superseded — not manufactured on demand.
- Lesson (repeat of amberforge's): bash `UID` is a readonly builtin — never use it as a variable name.

## 2026-07-15 — ERC-6551 Token Bound Account for TRAIL Badge #1 (first-time mechanism)

- Canonical registry `0x000000006551c19487814612e58FE06813775758`, `createAccount(implementation=
  0x55266D75D1a14E4572138116Af39863Ed6596E7F, salt=0, chainId=8453, tokenContract=badges, tokenId=1)`
  -> TBA `0xFD70573a90628dEB84C389706ea14E6CE33A63C8`
  tx `0xaa23be72b61b0ac871ce690cd91d663e8160ee637cd2754e8846ab04b3405c23`
- **Gotcha**: the registry deploys a bare minimal-proxy that delegates to an *AccountProxy* which is
  itself uninitialized until `initialize(address implementation)` is called — before that, every call
  silently "succeeds" with empty return data (delegatecall to the zero address). No error, no revert,
  just no-ops; caught it because a `transfer` through `execute()` reported success but moved nothing.
  Fixed by calling `initialize(0x41C8f39463A868d3A88af00cd0fe7102F30E44eC)` (Tokenbound AccountV3 impl),
  tx `0xf9432bf20ae65e18635b5ab6e64d0a3df01d1346679fc91f3957846452410e8c` (emits ERC-1967 `Upgraded`).
  After that, `token()` correctly reports (8453, badges contract, tokenId 1) and `owner()` = wallet 0x6.
- Funded the TBA with 0.0001 WETH (tx `0xd7eecdfecd2af3d16a489095c13bb33ef5a97cc8a3e93a4c84915b6e8a940dca`),
  then `execute(WETH, 0, transfer(0x6,...), 0)` signed by the badge owner moved 0.00003 WETH back out
  — tx `0x0bb7a7ed8c3a3d521b9755a3aa4b2942dee036c3fbefc1447083c9c2b587e90d`. The NFT now has its own
  working wallet; sell the badge and its balance goes with it (same lesson amberforge learned with Cube #1).
