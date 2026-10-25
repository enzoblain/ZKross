#!/usr/bin/env bash
# Creates the throwaway TESTNET accounts and keys for ZKross, idempotently.
# Never mainnet: Stellar testnet (Friendbot) and Sepolia only. Secrets go to
# the repo's .env (git-ignored, mode 600) and are never printed.
#
#   Stellar: deployer (pool admin), poster (root poster), relayer, attester
#            (submits refund/finalize), alice, bob, fresh; USDC trustlines for
#            the accounts that receive USDC (deployer, alice, fresh).
#   Sepolia: deployer, poster, user (new random keys; fund them yourself).
#   Shared:  the refund attester's secp256k1 key and the Global View Key
#            admin scalar.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ENV="$REPO/.env"
NET=testnet
USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
HORIZON=https://horizon-testnet.stellar.org

git -C "$REPO" check-ignore -q .env || { echo ".env is not git-ignored; refusing to write keys" >&2; exit 1; }
touch "$ENV"
chmod 600 "$ENV"

# `cast wallet new --json` puts the wallet under .data (array or object).
WALLET='.data | if type == "array" then .[0] else . end |'
has() { grep -q "^$1=." "$ENV"; }
put() {
  [ -n "$2" ] || { echo "empty value for $1" >&2; exit 1; }
  has "$1" || echo "$1=$2" >> "$ENV"
}

# ---------- Stellar ----------
for role in deployer poster relayer attester alice bob fresh; do
  id="zkross-$role"
  if ! stellar keys address "$id" >/dev/null 2>&1; then
    stellar keys generate "$id" --network "$NET" --fund >/dev/null
  fi
  addr=$(stellar keys address "$id")
  # Friendbot again if the account does not exist yet (e.g. a failed fund).
  if ! curl -sf "$HORIZON/accounts/$addr" >/dev/null; then
    curl -sf "https://friendbot.stellar.org/?addr=$addr" >/dev/null
  fi
  ROLE=$(echo "$role" | tr a-z A-Z)
  put "STELLAR_${ROLE}_ADDRESS" "$addr"
  put "STELLAR_${ROLE}_SECRET" "$(stellar keys show "$id")"
done

for role in deployer alice fresh; do
  id="zkross-$role"
  addr=$(stellar keys address "$id")
  if ! curl -sf "$HORIZON/accounts/$addr" | grep -q "\"asset_issuer\": \"$USDC_ISSUER\""; then
    stellar tx new change-trust --source "$id" --line "USDC:$USDC_ISSUER" --network "$NET" >/dev/null
  fi
done

# ---------- Sepolia (new random keys) ----------
for role in DEPLOYER POSTER USER; do
  if ! has "SEPOLIA_${role}_KEY"; then
    json=$(cast wallet new --json)
    put "SEPOLIA_${role}_KEY" "$(echo "$json" | jq -r "$WALLET.private_key")"
    put "SEPOLIA_${role}_ADDRESS" "$(echo "$json" | jq -r "$WALLET.address")"
  fi
done

# ---------- Shared keys ----------
if ! has ZKROSS_ATTESTER_KEY; then
  json=$(cast wallet new --json)
  put ZKROSS_ATTESTER_KEY "$(echo "$json" | jq -r "$WALLET.private_key")"
  put ZKROSS_ATTESTER_ADDRESS "$(echo "$json" | jq -r "$WALLET.address")"
fi
# Global View Key admin scalar: 31 random bytes (below Baby JubJub's subgroup order).
put ZKROSS_GVK_PRIV "0x$(openssl rand -hex 31)"

echo "Accounts (addresses only; secrets are in .env):"
grep -E "_ADDRESS=" "$ENV" | sed 's/^/  /'
