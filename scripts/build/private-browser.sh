#!/usr/bin/env bash
# Compile/stage the pinned non-GVK circuit and real browser prover. No setup-key regeneration.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
: "${ZKROSS_BUILD:?Set ZKROSS_BUILD to an absolute writable build directory}"
export REPO
python3 - <<'PYSCRIPT'
import os,re,shutil
from pathlib import Path
r=Path(os.environ['REPO']);b=Path(os.environ['ZKROSS_BUILD'])/'private-circuit'
shutil.copytree(r/'spp/circuits',b/'circuits',dirs_exist_ok=True)
for p in (b/'circuits/src').glob('*.circom'):
    if p.name!='policy_tx_2_2.circom' and re.search(r'(?m)^\s*component\s+main\b',p.read_text()):p.unlink()
(b/'testdata').mkdir(exist_ok=True)
for p in (r/'spp/deployments/testnet/circuit_keys').glob('policy_tx_2_2_*'):shutil.copy2(p,b/'testdata'/p.name)
PYSCRIPT
"${CARGO:-cargo}" run --manifest-path "$REPO/spp/Cargo.toml" --locked -p circuit-compiler --bin circuit-compiler -- compile \
 --circuits "$ZKROSS_BUILD/private-circuit/circuits" --out "$ZKROSS_BUILD/private-circuit/artifacts"
OUT="$REPO/apps/frontend/public/zk"
bash "$REPO/scripts/build/prover-wasm.sh" "$OUT"
cp "$REPO/spp/deployments/testnet/circuit_keys/policy_tx_2_2_proving_key.bin" "$OUT/"
cp "$REPO/spp/deployments/testnet/circuit_keys/policy_tx_2_2.graph.bin" "$OUT/"
cp "$ZKROSS_BUILD/private-circuit/artifacts/policy_tx_2_2.r1cs" "$OUT/"
echo "Staged real non-GVK prover artifacts: $OUT"
