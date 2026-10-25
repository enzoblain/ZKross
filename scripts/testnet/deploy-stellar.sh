#!/usr/bin/env bash
# Deploys ZKross on Stellar TESTNET: SPP's ASP trees (required by the
# constructor; open policy), three SPP verifier contracts (SPP's
# policy_tx_2_2_gvk_T key, our bridge_out and bridge_in keys), a traceable
# pool-gvk on Circle's USDC, then init_bridge paired with Sepolia.
# Writes deploy-out/stellar-testnet.json. Every call is simulated by the CLI
# before it is submitted.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$REPO/.env"; set +a
NET=testnet
SRC=zkross-deployer
USDC_SAC=$(jq -r .stellarTestnet.usdc.sac "$REPO/deployments.json")
OUT="$REPO/deploy-out"
mkdir -p "$OUT"
[ "$(stellar network ls | grep -c '^testnet$')" = 1 ] || { echo "no testnet network configured" >&2; exit 1; }

# ---------- Build ----------
SPP=$(bash "$REPO/scripts/build/sync-spp.sh")
cd "$SPP"
W="$SPP/target/stellar"
mkdir -p "$W"
for pkg in pool-gvk asp-membership asp-non-membership; do
  stellar contract build --manifest-path Cargo.toml --out-dir "$W" --optimize --package "$pkg" >/dev/null
done
for stem in policy_tx_2_2_gvk_T bridge_out bridge_in; do
  case $stem in policy_tx_2_2_gvk_T) d=deployments/testnet/circuit_keys ;; *) d=deployments/zkross/circuit_keys ;; esac
  VERIFIER_VK_JSON="$SPP/$d/${stem}_vk.json" stellar contract build --manifest-path Cargo.toml \
    --out-dir "$W/$stem" --optimize --package circom-groth16-verifier >/dev/null
done

deploy() { stellar contract deploy --wasm "$1" --source "$SRC" --network "$NET" "${@:2}" 2>/dev/null | tail -1; }

# ---------- Deploy ----------
ADMIN=$STELLAR_DEPLOYER_ADDRESS
ASP_M=$(deploy "$W/asp_membership.wasm" -- --admin "$ADMIN" --levels 10)
ASP_N=$(deploy "$W/asp_non_membership.wasm" -- --admin "$ADMIN")
V_T=$(deploy "$W/policy_tx_2_2_gvk_T/circom_groth16_verifier.wasm")
V_O=$(deploy "$W/bridge_out/circom_groth16_verifier.wasm")
V_I=$(deploy "$W/bridge_in/circom_groth16_verifier.wasm")
HASH_M=$(stellar contract info hash --id "$ASP_M" --network "$NET" 2>/dev/null | tail -1)
HASH_N=$(stellar contract info hash --id "$ASP_N" --network "$NET" 2>/dev/null | tail -1)

D=$("$HOME/zkross-build/prover-target/release/zkross-prover" admin-key "$ZKROSS_GVK_PRIV")
DX=$(node -e "console.log(BigInt(JSON.parse(process.argv[1]).x).toString())" "$D")
DY=$(node -e "console.log(BigInt(JSON.parse(process.argv[1]).y).toString())" "$D")

POOL=$(deploy "$W/pool_gvk.wasm" -- \
  --admin "$ADMIN" --token "$USDC_SAC" --verifier "$V_T" \
  --asp_membership "$ASP_M" --asp_non_membership "$ASP_N" \
  --asp_membership_wasm_hash "$HASH_M" --asp_non_membership_wasm_hash "$HASH_N" \
  --maximum_deposit_amount 100000000 --levels 20 --policy_flags 0 --kdf_domain zkross \
  --admin_view_key "{\"x\":\"$DX\",\"y\":\"$DY\"}" --gvk_mode 2)

ATTESTER_HEX=${ZKROSS_ATTESTER_ADDRESS#0x}
stellar contract invoke --id "$POOL" --source "$SRC" --network "$NET" -- init_bridge --config "{
  \"root_poster\": \"$STELLAR_POSTER_ADDRESS\",
  \"attester\": \"${ATTESTER_HEX,,}\",
  \"remote_chain_id\": \"11155111\",
  \"asset_id\": \"1\",
  \"bridge_out_verifier\": \"$V_O\",
  \"bridge_in_verifier\": \"$V_I\"
}" >/dev/null

LEDGER=$(curl -s https://horizon-testnet.stellar.org/ledgers?order=desc\&limit=1 | jq -r '._embedded.records[0].sequence')
CHAIN=$(stellar contract invoke --id "$POOL" --source "$SRC" --network "$NET" --send=no -- chain_id 2>/dev/null | tr -d '"')
jq -n --arg pool "$POOL" --arg aspM "$ASP_M" --arg aspN "$ASP_N" --arg vt "$V_T" --arg vo "$V_O" --arg vi "$V_I" \
  --arg token "$USDC_SAC" --arg chain "$CHAIN" --arg ledger "$LEDGER" \
  '{pool: $pool, token: $token, chainId: $chain, deployLedger: ($ledger|tonumber), aspMembership: $aspM, aspNonMembership: $aspN,
    transactVerifier: $vt, bridgeOutVerifier: $vo, bridgeInVerifier: $vi}' > "$OUT/stellar-testnet.json"
cat "$OUT/stellar-testnet.json"
