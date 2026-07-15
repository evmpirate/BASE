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

## 2026-07-15 — First DEX swap (first-time mechanism)

- 0.0002 ETH -> USDC via Uniswap V3 `SwapRouter02` `0x2626664c2603336E57B271c5C0b26F421741e481`,
  `exactInputSingle` (tokenIn=WETH predeploy, tokenOut=USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`,
  fee tier 500 = 0.05%, ETH sent directly via `msg.value` — router wraps it internally).
- Min-out sanity-checked against the Chainlink ETH/USD feed `0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70`
  (price read $1921.19/ETH at call time) with a ~2% slippage buffer; simulated via `cast call` first.
- Received exactly the simulated amount: 0.383909 USDC. tx
  `0x866c96fc43f92223a3e2ecbc95a5ede318a240ef7be02096afcbdd6b3db85c4c`

## 2026-07-15 — EIP-2612 permit on native USDC (first-time mechanism)

- Base's native USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) supports EIP-2612
  (`name="USD Coin"`, `version="2"`, has `nonces`/`DOMAIN_SEPARATOR`) alongside its EIP-3009 rails.
- Wallet 0x6 signed a `Permit(owner,spender,value,nonce,deadline)` typed-data message **offline**
  (`cast wallet sign --data`, no tx, no gas) approving the TrailKeeper agent burner
  `0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC` for 0.1 USDC.
- The burner — not the owner — submitted `permit(...)` on-chain (owner never sent a transaction):
  tx `0x2afd5fbca12e185d9aa45b2397c661f74308205ed5e994c647f4c13503b07d5d`. Approval event confirmed
  owner=0x6, spender=burner, value=0.1 USDC.
- Burner then pulled 0.05 USDC via `transferFrom` to close the lifecycle: tx
  `0xd1967d0b07bd43b8a984961cea114c3f407e407adbbff5e3eec20aa82481e02b`. Remaining allowance 0.05 USDC,
  owner's permit nonce incremented 5 -> 6.

## 2026-07-15 — Native L1->L2 deposit (first-time mechanism)

- `scripts/l1l2-deposit.mjs` (viem `op-stack` extension, `buildDepositTransaction` +
  `depositTransaction` against the OptimismPortal — no manual contract address needed).
- Wallet 0x6 had 0.0137 ETH sitting on Ethereum L1 (pre-existing, not part of the Base journey so far).
  Deposited 0.001 ETH: L1 tx `0x8ba641bb25e2a82ceb73abe537497d7a3f3f6914dfe41bbfc16dfae01f6e9dbb`,
  derived L2 tx `0x0ed67e3e288c8b1a12810d39d0a794d8bc0b00bbe23444fb704df61c074eb79c` (sequencer replay,
  ~2 minutes). Both legs reported `success`.
- **Stale-read lesson (again)**: the script's own immediate post-receipt L2 balance read showed the
  pre-deposit amount unchanged; a fresh `cast balance` call ~3s later showed the correct +0.001 ETH.
  Public Base RPC nodes are load-balanced and briefly lag right after a receipt lands — always re-read
  before trusting a "nothing changed" result.

## 2026-07-15 — Native L2->L1 withdrawal initiated (first-time mechanism, in progress)

- `scripts/l2l1-withdraw.mjs` (status/prove/finalize driver, viem `op-stack`, fault-proof era).
- Initiated via a plain `L2StandardBridge.withdraw(l2Token=0xDead...dEAd0000 [native-ETH placeholder],
  amount, minGasLimit=0, extraData=0x)` call on `0x4200...0010`, 0.001 ETH:
  L2 tx `0xaf0e5785a5c572c762ebfd89b06df9c71fb8d81906f202354b2ca16c5e5904d3`
- Status right after: `waiting-to-prove`. Same three-act lifecycle as amberforge's withdrawal
  (prove once a dispute game includes it, then a 7-day challenge window, then finalize).
- **RESUME POINT**: `cd ~/BASE/scripts && node l2l1-withdraw.mjs status 0xaf0e5785a5c572c762ebfd89b06df9c71fb8d81906f202354b2ca16c5e5904d3`
  — when `ready-to-prove`: `PRIVATE_KEY=$(...) node l2l1-withdraw.mjs prove <hash>`; ~7 days after
  proving, when `ready-to-finalize`: same with `finalize`. Wallet 0x6 has plenty of L1 ETH (~0.0127
  after the deposit above) to cover L1 gas for both steps.

## 2026-07-15 — EIP-7702 delegation + sponsored tx (first-time mechanism)

- Target: the TrailKeeper agent burner `0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC` (previously a
  plain EOA, no code). Implementation `Simple7702Account` `0xe6cae83bde06e4c305530e199d7217f42808555b`
  (same one amberforge used — recovered/reused, verified as real deployed code on Base mainnet).
- Burner signed its own EIP-7702 authorization offline (`cast wallet sign-auth`, authorization nonce
  = burner's current nonce since the *sponsor*, not the burner, broadcasts the outer tx).
- Wallet 0x6 sent the type-4 delegation tx (`to`=burner, empty calldata, `--auth <signed auth>`),
  **paying the gas so the burner never needed ETH for its own delegation**:
  tx `0x90981a20d36108f44596cbbaaeaf146d16827a1db06df8364e030bc00830dab4`.
  Burner's code is now `0xef0100` + implementation address (the EIP-7702 delegation designator).
- Burner then self-broadcast `execute(address,uint256,bytes)` on its own new smart-account code,
  moving 0.000001 ETH out to wallet 0x6 — a real self-authorized call through the delegated logic
  (confirmed by exact balance math: burner's balance dropped by transferred-amount + gas, not just
  gas, since `cast call` simulation alone returned ambiguous empty `0x` for both success and no-op):
  tx `0x4575fe8167f993e7bf8f86a3ffc84112d121a64483dd086dd6fd0d5a85973be8`.

## 2026-07-15 — Gas paid entirely in USDC (first-time mechanism)

- `scripts/erc20-gas-v07-mainnet.mjs` — EntryPoint v0.7 `SimpleAccount` (via `permissionless`
  + Pimlico's ERC-20 paymaster experimental helper), owner key = TrailKeeper burner.
- Counterfactual account address `0x379258a271A2d95A1CBB55E1BeefDF2F0cf50De9`, funded with 0.3 USDC
  from wallet 0x6 (tx `0x942f99be7450a5e707c82d14509b2e771ab5633e03c98c4f475d67655f3bd53b`) and
  **zero ETH, ever**.
- UserOp: `approve(Permit2, 0.1 USDC)` on the account's own USDC — gas paid via Pimlico's ERC-20
  paymaster entirely out of the account's USDC balance: tx
  `0xcbede249961fa00f1f05d4d48ad651b5bdd3eb899ea536b17e5d39294d760147`.
  USDC balance 0.3 -> 0.294884 (cost ~0.005116 USDC, no ETH touched at any point). Allowance to
  Permit2 confirmed set to 0.1 USDC.
- Reused the same Pimlico API key amberforge already set up (account-level, not per-project).

## 2026-07-15 — TrailKeeper agent Builder Code (first-time mechanism for this agent)

- Registered via `POST api.base.dev/v1/agents/builder-codes` for the agent's own operational
  wallet `0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC` (distinct from DustSweep's app-level code
  `bc_9a7f6zpz`): builder code **`bc_z2oi30bi`**, stored in `trailkeeper/builderCode.mjs`.
- Wrote `trailkeeper/sentinel.mjs`: reads live badge-progress state, attests it via EAS (reusing
  the schema wallet 0x6 registered earlier) with the attribution suffix attached. First real run
  doubled as the attribution proof: tx `0x33f3d75c195761f937f8799284b734906a4306365ffcf445e94d77e369bcb233`,
  calldata confirmed to end with the ERC-8021 suffix.
- `trailkeeper/AGENT_README.md` documents the permanent attribution rule for this codebase.

## 2026-07-16 — Sentinel loop on cron (first-time mechanism, user-confirmed)

- `trailkeeper/cron-run.sh`: same organic-cadence pattern as amberforge's AmberMind loop —
  random 0-45min jitter, 40% random stand-down, hard cap of 2 actions/UTC-day, on top of
  `sentinel.mjs`'s own real observation (nothing fires if there's nothing new to attest,
  though currently every run attests the latest snapshot regardless of change — matches
  amberforge's own design, could be tightened to only-on-change later).
- **Confirmed with the user before installing** (installing a crontab that autonomously signs
  mainnet transactions indefinitely is a different authorization class than a single bounded
  action, even under the "up to $4, execute yourself" rule) — user said yes.
- Crontab: `41 */4 * * * /home/kajko/BASE/trailkeeper/cron-run.sh` (runs only while this
  machine/WSL instance is up). Burner key read from `trailkeeper/.env` (gitignored).
  Log: `trailkeeper/logs/cron.log` (gitignored).
