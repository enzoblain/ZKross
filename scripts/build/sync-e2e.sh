#!/usr/bin/env bash
# Mirrors scripts/e2e and services/bridge into the WSL build directory (same
# relative layout) and installs their packages there, so node_modules never
# lands in the Windows/OneDrive checkout. Prints the mirror's repo root.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="${ZKROSS_BUILD:-$HOME/zkross-build}"
M="$BUILD/repo"
for d in scripts/e2e services/bridge; do
  mkdir -p "$M/$d"
  rsync -a --delete --exclude node_modules "$REPO/$d/" "$M/$d/"
  (cd "$M/$d" && if [ -f "$REPO/$d/package-lock.json" ]; then npm ci --silent; else npm install --silent && cp package-lock.json "$REPO/$d/"; fi)
done
echo "$M"
