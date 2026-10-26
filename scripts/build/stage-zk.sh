#!/usr/bin/env bash
# Stages the browser prover and the circuit files in this checkout's
# apps/frontend/public/zk (git-ignored), for running the site straight from
# the repo (npm start) on Linux or macOS. sync-frontend.sh does the same for
# the WSL build mirror.
#   1. builds prover/wasm with wasm-bindgen (prover-wasm.sh)
#   2. compiles the circuits' .r1cs with SPP's circuit compiler in the build
#      mirror, reusing the committed keys (first run only, a few minutes)
#   3. copies the proving keys, witness graphs and .r1cs next to the prover
# Needs the wasm32-unknown-unknown target and wasm-bindgen-cli 0.2.128:
#   rustup target add wasm32-unknown-unknown
#   cargo install wasm-bindgen-cli --version 0.2.128 --locked
# and on macOS: rustup component add llvm-tools (or brew install llvm).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="${ZKROSS_BUILD:-$HOME/zkross-build}"
ZK="$REPO/apps/frontend/public/zk"
STEMS=(policy_tx_2_2_gvk_T bridge_out bridge_in)

command -v wasm-bindgen >/dev/null || { echo "wasm-bindgen is missing: cargo install wasm-bindgen-cli --version 0.2.128 --locked" >&2; exit 1; }
mkdir -p "$ZK"

echo "→ Building the browser prover…"
bash "$REPO/scripts/build/prover-wasm.sh" "$ZK" >/dev/null

ART="$BUILD/spp/target/circuits-artifacts/out"
missing=0
for stem in "${STEMS[@]}"; do [ -f "$ART/$stem.r1cs" ] || missing=1; done
if [ "$missing" = 1 ]; then
  echo "→ Compiling the circuits (first run only, a few minutes)…"
  M="$(bash "$REPO/scripts/build/sync-spp.sh")"
  (cd "$M" && cargo run --release --locked -p circuit-compiler --bin circuit-compiler -- compile >/dev/null)
fi

echo "→ Copying the circuit files…"
bash "$REPO/scripts/build/collect-circuits.sh" >/dev/null
for stem in "${STEMS[@]}"; do
  cp "$BUILD/circuits/${stem}_proving_key.bin" "$BUILD/circuits/$stem.graph.bin" "$BUILD/circuits/$stem.r1cs" "$ZK/"
done
echo "✓ $ZK is ready."
