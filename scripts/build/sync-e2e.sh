#!/usr/bin/env bash
# Mirrors scripts/e2e into the WSL build directory and installs its packages
# there, so node_modules never lands in the Windows/OneDrive checkout.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="${ZKROSS_BUILD:-$HOME/zkross-build}"
mkdir -p "$BUILD/e2e"
rsync -a --delete --exclude node_modules "$REPO/scripts/e2e/" "$BUILD/e2e/"
cd "$BUILD/e2e"
if [ -f "$REPO/scripts/e2e/package-lock.json" ]; then npm ci --silent; else npm install --silent; cp package-lock.json "$REPO/scripts/e2e/"; fi
echo "$BUILD/e2e"
