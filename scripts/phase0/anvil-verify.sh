#!/usr/bin/env bash
# Deploys the SPP policy_tx_2_2_gvk_T verifier to a fresh local anvil and
# checks the committed SPP proof fixture against it. Local only: the key is
# anvil's built-in, publicly known test account #0.
set -euo pipefail
cd "$(dirname "$0")/../../contracts/ethereum"

KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
RPC=http://127.0.0.1:8545
FIX=test/fixtures/spp/policy_tx_2_2_gvk_T/snarkjs_calldata.json
SIG="verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[30])(bool)"

anvil --silent --port 8545 & APID=$!
trap 'kill $APID' EXIT
for _ in $(seq 1 50); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 0.2; done

ADDR=$(forge create src/verifiers/PolicyTx22GvkTVerifier.sol:PolicyTx22GvkTVerifier \
  --rpc-url $RPC --private-key $KEY --broadcast | grep "Deployed to" | awk '{print $3}')
echo "verifier at $ADDR (chain $(cast chain-id --rpc-url $RPC))"

arg() { jq -c "$1" $FIX | tr -d '"'; }
echo "real proof:     $(cast call "$ADDR" "$SIG" "$(arg .a)" "$(arg .b)" "$(arg .c)" "$(arg .pub)" --rpc-url $RPC)"
echo "tampered input: $(cast call "$ADDR" "$SIG" "$(arg .a)" "$(arg .b)" "$(arg .c)" "$(arg '.pub | .[26] = .[27]')" --rpc-url $RPC)"
