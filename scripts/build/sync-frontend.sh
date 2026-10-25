#!/usr/bin/env bash
# Mirrors the npm workspace (root package files, apps/, packages/, the
# services/prover and services/relayer scaffolds) and deployments.json into the
# WSL build directory, installs it there (node_modules never lands in the
# Windows/OneDrive checkout) and stages the browser prover and the circuit
# files in apps/frontend/public/zk. Prints the mirror's repo root.
#   --install <pkg...>   npm install those packages in the frontend and copy
#                        package.json and package-lock.json back to the repo
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="${ZKROSS_BUILD:-$HOME/zkross-build}"
M="$BUILD/front"
mkdir -p "$M/services"
rsync -a "$REPO/package.json" "$REPO/package-lock.json" "$REPO/deployments.json" "$M/"
for d in apps packages services/prover services/relayer; do
  mkdir -p "$M/$d"
  rsync -a --delete --exclude node_modules --exclude dist --exclude public/zk "$REPO/$d/" "$M/$d/"
done
cd "$M"
if [ "${1:-}" = "--install" ]; then
  shift
  npm install --silent --workspace=apps/frontend "$@" >&2
  cp package-lock.json "$REPO/"
  cp apps/frontend/package.json "$REPO/apps/frontend/"
else
  npm ci --silent >&2
fi
ZK="$M/apps/frontend/public/zk"
mkdir -p "$ZK"
bash "$REPO/scripts/build/prover-wasm.sh" "$ZK" >&2
[ -f "$BUILD/circuits/bridge_out.r1cs" ] || bash "$REPO/scripts/build/collect-circuits.sh" >&2
cp "$BUILD"/circuits/{policy_tx_2_2_gvk_T,bridge_out,bridge_in}{_proving_key.bin,.graph.bin,.r1cs} "$ZK/"
echo "$M"
