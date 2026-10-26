#!/usr/bin/env bash
# Runs the whole testnet stack from one terminal: the bridge service (root
# poster + relayer, services/bridge) and the site (Vite dev server). Their
# output is prefixed [service] / [site]; Ctrl+C stops both, and if one of
# them stops, the other is stopped too.
#   bash scripts/dev.sh                 both
#   bash scripts/dev.sh --site-only     the site only (the relayer runs elsewhere)
#   bash scripts/dev.sh --service-only  the service only
# Before starting, it checks what each needs (.env keys, the Ethereum ABIs,
# the browser prover files, free ports) and says what is missing. A relayer
# already answering on its port is reused instead of failing with EADDRINUSE.
set -euo pipefail
set -m # each background job gets its own process group, so stopping it stops its children

REPO="$(cd "$(dirname "$0")/.." && pwd)"
RELAYER_PORT="${ZKROSS_RELAYER_PORT:-8788}"
SITE_PORT="${ZKROSS_SITE_PORT:-5173}"
SITE=1
SERVICE=1
case "${1:-}" in
  --site-only) SERVICE=0 ;;
  --service-only) SITE=0 ;;
  "") ;;
  *) echo "usage: bash scripts/dev.sh [--site-only | --service-only]" >&2; exit 2 ;;
esac

fail() { echo "✗ $*" >&2; exit 1; }
warn() { echo "! $*" >&2; }
port_owner() { lsof -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null | tail -n +2; }

# ---------- checks ----------
command -v node >/dev/null || fail "Node.js is not installed."
[ -d "$REPO/node_modules" ] || fail "Dependencies are missing: run npm install at the repo root."

if [ "$SERVICE" = 1 ]; then
  if [ -n "$(port_owner "$RELAYER_PORT")" ]; then
    if curl -sf -m 3 "http://127.0.0.1:$RELAYER_PORT/health" >/dev/null; then
      warn "A relayer already answers on port $RELAYER_PORT: reusing it, not starting a second service."
      SERVICE=0
    else
      echo "Port $RELAYER_PORT is taken by:" >&2
      port_owner "$RELAYER_PORT" >&2
      fail "Stop that program, or pick another port: ZKROSS_RELAYER_PORT=8789 bash scripts/dev.sh"
    fi
  fi
fi
if [ "$SERVICE" = 1 ]; then
  [ -f "$REPO/.env" ] || fail "No .env at the repo root: the relayer and root poster need its testnet keys (scripts/testnet/create-accounts.sh, or ask Emin)."
  ABI="$REPO/contracts/ethereum/out/ShieldedPool.sol/ShieldedPool.json"
  if [ ! -f "$ABI" ]; then
    command -v forge >/dev/null || fail "The Ethereum ABIs are missing ($ABI) and Foundry is not installed: install it (https://getfoundry.sh), then rerun."
    echo "→ Building the Ethereum contracts for their ABIs (forge build)…"
    (cd "$REPO/contracts/ethereum" && forge build >/dev/null) || fail "forge build failed."
  fi
  [ -x "$REPO/node_modules/.bin/tsx" ] || fail "tsx is missing: run npm install at the repo root."
fi

if [ "$SITE" = 1 ]; then
  [ -d "$REPO/apps/frontend/public/zk" ] || warn "apps/frontend/public/zk is missing: the site runs, but proofs fail until the browser prover is staged (scripts/build/sync-frontend.sh)."
  [ -z "$(port_owner "$SITE_PORT")" ] || warn "Port $SITE_PORT is taken: Vite will pick the next free one (see the [site] line with its URL)."
fi

[ "$SITE" = 1 ] || [ "$SERVICE" = 1 ] || { echo "Nothing to start."; exit 0; }

# ---------- run ----------
PIDS=()
prefix() { awk -v p="$1" '{ print p " " $0; fflush() }'; }

stop() {
  trap - INT TERM EXIT
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap stop INT TERM EXIT

if [ "$SERVICE" = 1 ]; then
  (cd "$REPO/services/bridge" && ZKROSS_REPO="$REPO" ZKROSS_RELAYER_PORT="$RELAYER_PORT" exec npm run --silent service) > >(prefix "[service]") 2>&1 &
  PIDS+=($!)
fi
if [ "$SITE" = 1 ]; then
  (cd "$REPO/apps/frontend" && VITE_RELAYER_URL="${VITE_RELAYER_URL:-http://127.0.0.1:$RELAYER_PORT}" exec npm run --silent dev -- --host 127.0.0.1 --port "$SITE_PORT") > >(prefix "[site]") 2>&1 &
  PIDS+=($!)
fi
echo "→ Running (Ctrl+C stops everything). Site: http://127.0.0.1:$SITE_PORT · relayer: http://127.0.0.1:$RELAYER_PORT"

# Stop everything as soon as one of them exits (bash 3.2 has no `wait -n`).
while :; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "→ A process stopped; stopping the rest." >&2
      exit 1
    fi
  done
  sleep 1
done
