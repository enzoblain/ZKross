#!/usr/bin/env bash
# Builds the site and uploads it to Cloudflare Pages (free plan: static
# hosting, unlimited bandwidth, 25 MiB per file; our largest is ~14 MB).
# The site is built here, not by Cloudflare: it needs the browser prover and
# the circuit files (scripts/build/stage-zk.sh), which Cloudflare's build
# machines cannot produce.
#   VITE_RELAYER_URL=https://<relayer host> bash scripts/deploy/site.sh [project]
# The first run asks you to log in to Cloudflare (npx wrangler login) and
# creates the Pages project (default name: zkross, site https://zkross.pages.dev
# or a variant Cloudflare picks if the name is taken).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PROJECT="${1:-zkross}"
FRONT="$REPO/apps/frontend"
WRANGLER="npx --yes wrangler@4"

fail() { echo "✗ $*" >&2; exit 1; }

case "${VITE_RELAYER_URL:-}" in
  https://*) ;;
  "") fail "Set VITE_RELAYER_URL to the relayer's public HTTPS address (see scripts/deploy/server-setup.sh)." ;;
  *) fail "VITE_RELAYER_URL must start with https:// (an https site cannot call an http relayer)." ;;
esac

[ -f "$FRONT/public/zk/bridge_out.r1cs" ] || bash "$REPO/scripts/build/stage-zk.sh"

echo "→ Building the site (relayer: $VITE_RELAYER_URL)…"
(cd "$FRONT" && VITE_RELAYER_URL="$VITE_RELAYER_URL" npm run build >/dev/null)

big="$(find "$FRONT/dist" -type f -size +25M)"
[ -z "$big" ] || fail "Cloudflare Pages refuses files over 25 MiB: $big"

$WRANGLER whoami >/dev/null 2>&1 || $WRANGLER login
$WRANGLER pages project list 2>/dev/null | grep -q "\b$PROJECT\b" ||
  $WRANGLER pages project create "$PROJECT" --production-branch main
$WRANGLER pages deploy "$FRONT/dist" --project-name "$PROJECT" --branch main --commit-dirty=true

echo
echo "✓ Deployed. Allow the site's address on the relayer (ZKROSS_RELAYER_ORIGINS"
echo "  in the server's .env, then: sudo systemctl restart zkross-bridge)."
