#!/usr/bin/env bash
# Mirrors spp/ into a WSL-native build directory (fast builds, no build output
# in the Windows/OneDrive checkout) and seeds testdata/ with the committed keys:
# SPP's testnet keys and our bridge keys, so the circuit compiler never
# regenerates a key that already exists.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="${ZKROSS_BUILD:-$HOME/zkross-build}"
mkdir -p "$BUILD/spp/testdata"
rsync -a --delete --exclude target --exclude testdata --exclude circuits/src/circomlib "$REPO/spp/" "$BUILD/spp/"
cp -n "$BUILD/spp/deployments/testnet/circuit_keys/"*.{bin,json} "$BUILD/spp/testdata/" 2>/dev/null || true
if [ -d "$REPO/spp/deployments/zkross/circuit_keys" ]; then
  cp -n "$REPO/spp/deployments/zkross/circuit_keys/"* "$BUILD/spp/testdata/" 2>/dev/null || true
fi
echo "$BUILD/spp"
