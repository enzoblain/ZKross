#!/usr/bin/env bash
# Regenerate using the repository's pinned SPP verification key and snarkjs 0.7.6.
# Install snarkjs in an isolated directory; pass its absolute package path.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
: "${SNARKJS_DIR:?Set SNARKJS_DIR to the snarkjs package directory (version 0.7.6)}"
node "$REPO/scripts/phase0/render-verifier.cjs" "$SNARKJS_DIR" \
 "$REPO/spp/deployments/testnet/circuit_keys/policy_tx_2_2_vk.json" \
 "$REPO/contracts/ethereum/src/verifiers/PolicyTx22Verifier.sol"
python3 - "$REPO/contracts/ethereum/src/verifiers/PolicyTx22Verifier.sol" <<'PYSCRIPT'
from pathlib import Path
import sys
p=Path(sys.argv[1]);p.write_text(p.read_text().replace('contract Groth16Verifier','contract PolicyTx22Verifier'))
PYSCRIPT
