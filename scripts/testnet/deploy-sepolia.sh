#!/usr/bin/env bash
# Deploys ZKross on SEPOLIA (Circle's USDC, traceable GVK, paired with
# Stellar testnet) with the throwaway keys in .env, and records the
# addresses in deployments.json. Refuses any chain but Sepolia.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
set -a; . "$REPO/.env"; set +a
RPC="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
[ "$(cast chain-id --rpc-url "$RPC")" = 11155111 ] || { echo "RPC is not Sepolia" >&2; exit 1; }

D=$("$HOME/zkross-build/prover-target/release/zkross-prover" admin-key "$ZKROSS_GVK_PRIV")
export ZKROSS_GVK_X=$(echo "$D" | jq -r .x) ZKROSS_GVK_Y=$(echo "$D" | jq -r .y)
export ZKROSS_TOKEN=$(jq -r .sepolia.usdc.address "$REPO/deployments.json")
export ZKROSS_ROOT_POSTER=$SEPOLIA_POSTER_ADDRESS ZKROSS_ATTESTER=$ZKROSS_ATTESTER_ADDRESS ZKROSS_ADMIN=$SEPOLIA_DEPLOYER_ADDRESS
export ZKROSS_REMOTE_CHAIN_ID=$(jq -r .stellarTestnet.chainId "$REPO/deployments.json")
export ZKROSS_MAX_DEPOSIT=10000000

cd "$REPO/contracts/ethereum"
forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --private-key "$SEPOLIA_DEPLOYER_KEY" --broadcast --slow
node -e '
const fs = require("fs");
const d = JSON.parse(fs.readFileSync(process.argv[1]));
const s = JSON.parse(fs.readFileSync(process.argv[2]));
d.sepolia.zkross = { pool: s.pool, token: s.token, deployBlock: s.deployBlock, transactVerifier: s.transactVerifier,
                     bridgeOutVerifier: s.bridgeOutVerifier, bridgeInVerifier: s.bridgeInVerifier };
fs.writeFileSync(process.argv[1], JSON.stringify(d, null, 2) + "\n");
console.log(JSON.stringify(d.sepolia, null, 2));
' "$REPO/deployments.json" deploy-out/11155111.json
