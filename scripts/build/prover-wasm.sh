#!/usr/bin/env bash
# Builds zkross-prover for the browser (prover/wasm) and writes the
# wasm-bindgen output to $1 (default: $ZKROSS_BUILD/prover-wasm). Needs the
# wasm32-unknown-unknown target and wasm-bindgen-cli 0.2.128 (SPP's pin).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="${ZKROSS_BUILD:-$HOME/zkross-build}"
OUT="${1:-$BUILD/prover-wasm}"
export CARGO_TARGET_DIR="$BUILD/prover-wasm-target"
cd "$REPO/prover/wasm"
# Apple's system ar can emit an empty archive for WebAssembly C objects.
# Prefer a matching LLVM toolchain when it is installed.
if [ "$(uname -s)" = Darwin ] && [ -x /opt/homebrew/opt/llvm/bin/llvm-ar ]; then
  export AR_wasm32_unknown_unknown="${AR_wasm32_unknown_unknown:-/opt/homebrew/opt/llvm/bin/llvm-ar}"
  export CC_wasm32_unknown_unknown="${CC_wasm32_unknown_unknown:-/opt/homebrew/opt/llvm/bin/clang}"
fi
"${CARGO:-cargo}" build --locked --release --target wasm32-unknown-unknown
mkdir -p "$OUT"
"${WASM_BINDGEN:-wasm-bindgen}" --target web --out-dir "$OUT" "$CARGO_TARGET_DIR/wasm32-unknown-unknown/release/zkross_prover_wasm.wasm"
echo "$OUT"
