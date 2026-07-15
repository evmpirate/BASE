# TrailKeeper — Agent Transaction Rules

## Builder Code (ERC-8021)

TrailKeeper's operational wallet `0x2C7BDedfC428E8eFe4197325A47f91B82dC33abC` (the same
burner set as `setAgentWallet` on both ERC-8004 registries) is registered as an agent
with Base (`POST api.base.dev/v1/agents/builder-codes`). Its builder code is
**`bc_z2oi30bi`**, stored in `builderCode.mjs`. This is distinct from DustSweep's app
code (`bc_9a7f6zpz`) — agent activity and app activity are attributed separately.

Do **not** re-register: that would mint a new code and orphan this one.

## How attribution is attached

Every transaction the agent sends goes through viem's `writeContract`/`sendTransaction`
with `dataSuffix: Attribution.toDataSuffix({ codes: [BUILDER_CODE] })` (`ox/erc8021`).
See `sentinel.mjs` for the reference implementation. Proof tx:
`0x33f3d75c195761f937f8799284b734906a4306365ffcf445e94d77e369bcb233`
(calldata ends with the attribution suffix — verified programmatically in the script).

## Permanent rule

**Every transaction this agent sends MUST include the builder code attribution via the
ERC-8021 data suffix.** Missing attribution produces no error — the activity is just
silently invisible to Base. Any new transaction path added to this codebase must carry
the suffix. (The x402 `/report` payments are exempt: they are gasless EIP-3009
signatures settled by the facilitator, not agent-sent transactions.)

## Identity

- ERC-8004: Base Mainnet agentId **58971** (registry `0x8004A169...a432`),
  Base Sepolia agentId **8073** (registry `0x8004A818...BD9e`)
- Agent card: https://trailkeeper-three.vercel.app/.well-known/agent-card.json

## Sentinel loop (cron)

`sentinel.mjs` reads live badge-progress state (`nextTokenId` on the TRAIL badges
contract) and attests it via EAS (schema `0xe55f0609...4e9e`, the same one wallet 0x6
registered), attributed with the builder code above. `cron-run.sh` runs it on a
schedule with a deliberately irregular cadence — random jitter, a random stand-down
chance, and a hard cap on actions per day — since fixed-interval on-chain activity is a
bot signature. See `crontab` for the actual schedule.
