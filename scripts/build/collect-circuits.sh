#!/usr/bin/env bash
# Gathers what zkross-prover needs into $ZKROSS_BUILD/circuits:
# <stem>_proving_key.bin and <stem>.graph.bin (committed, SPP's and ours) and
# <stem>.r1cs (built by SPP's circuit compiler in the WSL build mirror).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
BUILD="${ZKROSS_BUILD:-$HOME/zkross-build}"
OUT="$BUILD/circuits"
mkdir -p "$OUT"
ART="$BUILD/spp/target/circuits-artifacts/out"
for stem in policy_tx_2_2 policy_tx_2_2_gvk_T bridge_out bridge_in; do
  case $stem in
    policy_tx_2_2|policy_tx_2_2_gvk_T) keys="$REPO/spp/deployments/testnet/circuit_keys" ;;
    *) keys="$REPO/spp/deployments/zkross/circuit_keys" ;;
  esac
  cp "$keys/${stem}_proving_key.bin" "$keys/${stem}.graph.bin" "$OUT/"
  cp "$ART/${stem}.r1cs" "$OUT/"
done
ls -la "$OUT"
