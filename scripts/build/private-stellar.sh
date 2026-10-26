#!/usr/bin/env bash
# Build the non-GVK Stellar deployment artifacts; no signing or broadcasting.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
: "${ZKROSS_BUILD:?Set an absolute writable build directory}"
export VERIFIER_VK_JSON="$REPO/spp/deployments/testnet/circuit_keys/policy_tx_2_2_vk.json"
export CARGO_TARGET_DIR="$ZKROSS_BUILD/stellar-target"
OUT="$REPO/apps/frontend/public/zk/stellar"
mkdir -p "$OUT"
for package in pool batch-inbox asp-membership asp-non-membership circom-groth16-verifier; do
 "${STELLAR:-stellar}" contract build --manifest-path "$REPO/spp/Cargo.toml" --package "$package" --out-dir "$OUT" --locked
done
export REPO
python3 - <<'PYHASH'
from pathlib import Path
import os,json,hashlib
r=Path(os.environ['REPO'])
manifest={name:hashlib.sha256((r/f'apps/frontend/public/zk/stellar/{name}.wasm').read_bytes()).hexdigest() for name in ['pool','asp_membership','asp_non_membership','circom_groth16_verifier','batch_inbox']}
(r/'apps/frontend/src/lib/stellar-artifacts.json').write_text(json.dumps(manifest,indent=2)+'\n')
PYHASH
