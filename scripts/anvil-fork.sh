#!/bin/bash
# Local fork of Base mainnet for integration testing.
#
# The fork starts at a real recent block and lazily pulls state from the
# upstream RPC, so tests read REAL contract state (tokens, Permit2, live
# allowances of real addresses) while every write stays local and free.
# Cheatcodes available: anvil_impersonateAccount, anvil_setBalance, etc.
#
# Usage:
#   ./scripts/anvil-fork.sh            # foreground on :8545
#   FORK_BLOCK=48700000 ./scripts/anvil-fork.sh   # pin a block (reproducible tests)
set -euo pipefail

FORK_URL=${FORK_URL:-https://mainnet.base.org}
PORT=${PORT:-8545}

ARGS=(--fork-url "$FORK_URL" --port "$PORT" --chain-id 8453)
# Pinning a block makes runs reproducible AND lets anvil cache upstream state
# between runs (~/.foundry/cache/rpc); without it every run re-fetches.
if [ -n "${FORK_BLOCK:-}" ]; then
  ARGS+=(--fork-block-number "$FORK_BLOCK")
fi

exec anvil "${ARGS[@]}"
