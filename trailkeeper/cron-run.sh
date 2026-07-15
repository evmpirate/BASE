#!/usr/bin/env bash
# TrailKeeper sentinel loop — invoked by cron, keeps on-chain cadence organic:
#   * random jitter 0-45 min before doing anything
#   * 40% of runs stand down outright (intervals between actions vary widely)
#   * hard cap of MAX_ACTIONS_PER_DAY on-chain actions per UTC day
# Crontab: 41 */4 * * * /home/kajko/BASE/trailkeeper/cron-run.sh
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$(dirname "$(command -v node 2>/dev/null || echo /usr/bin/node)")"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$DIR/logs"
LOG="$LOG_DIR/cron.log"
mkdir -p "$LOG_DIR"

MAX_ACTIONS_PER_DAY=2
SKIP_PCT=40
MAX_JITTER_S=${MAX_JITTER_S:-2700}

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

JITTER=$((RANDOM % (MAX_JITTER_S + 1)))
log "run start (jitter ${JITTER}s)"
sleep "$JITTER"

if (( RANDOM % 100 < SKIP_PCT )); then
  log "stand down: random skip"
  exit 0
fi

TODAY=$(date -u +%F)
ACTIONS_TODAY=$(grep -c "^${TODAY}.*attestation tx" "$LOG" || true)
if (( ACTIONS_TODAY >= MAX_ACTIONS_PER_DAY )); then
  log "stand down: daily action budget spent (${ACTIONS_TODAY}/${MAX_ACTIONS_PER_DAY})"
  exit 0
fi

export PRIVATE_KEY
PRIVATE_KEY=$(grep '^PRIVATE_KEY=' "$DIR/.env" | cut -d= -f2)

OUT=$(cd "$DIR" && node sentinel.mjs 2>&1) || { log "agent error: $OUT"; exit 1; }
while IFS= read -r line; do log "$line"; done <<< "$OUT"
log "run end"
