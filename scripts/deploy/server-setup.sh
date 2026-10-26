#!/usr/bin/env bash
# Sets up the bridge service (relayer + root poster) on a fresh Ubuntu VM
# (22.04 or 24.04, x86_64 or arm64): Oracle Cloud "Always Free", an AWS or
# Google Cloud free-tier instance, any VPS. Run it from a checkout of the repo,
# after copying the testnet .env to the repo root:
#   bash scripts/deploy/server-setup.sh https://<site origin> [relayer host]
# - The relayer is served over HTTPS by Caddy (automatic certificate). Its
#   host defaults to <public IP>.sslip.io, so no domain is needed; pass your
#   own domain as the second argument if it points to this VM.
# - The service runs under systemd (zkross-bridge), restarts on failure and
#   at boot. Logs: journalctl -u zkross-bridge -f
# - The refund attester also runs (zkross-refund-attester) when the .env
#   holds its keys (ZKROSS_ATTESTER_KEY, ZKROSS_GVK_PRIV).
# The VM's firewall must allow ports 80 and 443 (Oracle: VCN security list;
# AWS: security group; this script opens the VM's own iptables/ufw).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
ENV="$REPO/.env"
STELLAR_CLI_VERSION=28.1.0

fail() { echo "✗ $*" >&2; exit 1; }
step() { echo "→ $*"; }

SITE_ORIGIN="${1:-}"
[[ "$SITE_ORIGIN" =~ ^https?://[^/]+$ ]] || fail "usage: bash scripts/deploy/server-setup.sh https://<site origin, e.g. https://zkross.pages.dev> [relayer host]"
[ -f "$ENV" ] || fail "Copy the testnet .env to $ENV first (scp .env <vm>:$ENV)."
chmod 600 "$ENV"
has() { grep -q "^$1=." "$ENV"; }
val() { sed -n "s/^$1=//p" "$ENV" | head -1; }
for k in SEPOLIA_POSTER_KEY SEPOLIA_RELAYER_KEY STELLAR_RELAYER_SECRET STELLAR_POSTER_SECRET; do
  has "$k" || fail "$k is missing from .env."
done

step "System packages"
sudo apt-get update -qq
sudo apt-get install -y -qq curl git ca-certificates caddy >/dev/null

if ! node -v 2>/dev/null | grep -qE '^v(2[0-9]|[3-9][0-9])\.'; then
  step "Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi

if ! command -v stellar >/dev/null; then
  step "Stellar CLI $STELLAR_CLI_VERSION"
  arch="$(uname -m)"; [ "$arch" = arm64 ] && arch=aarch64
  url="https://github.com/stellar/stellar-cli/releases/download/v$STELLAR_CLI_VERSION/stellar-cli-$STELLAR_CLI_VERSION-$arch-unknown-linux-gnu.tar.gz"
  curl -fsSL "$url" | sudo tar -xz -C /usr/local/bin stellar ||
    fail "Could not download the Stellar CLI ($url). Install it with: cargo install --locked stellar-cli --version $STELLAR_CLI_VERSION"
fi

# Small free-tier VMs (1 GB) can run out of memory during npm ci.
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && ! swapon --show | grep -q .; then
  step "2 GB of swap (small VM)"
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

step "npm dependencies"
(cd "$REPO" && npm ci --silent)

step "Stellar identities from .env"
add_identity() { printf '%s\n' "$2" | stellar keys add "$1" --secret-key --overwrite >/dev/null 2>&1; }
add_identity zkross-poster "$(val STELLAR_POSTER_SECRET)"
add_identity zkross-relayer "$(val STELLAR_RELAYER_SECRET)"
has STELLAR_ATTESTER_SECRET && add_identity zkross-attester "$(val STELLAR_ATTESTER_SECRET)"
# The services read the pools by simulating as "zkross-deployer"; any funded
# account works, so the poster's key stands in and the pool admin's key
# (STELLAR_DEPLOYER_SECRET) never needs to be on the server.
add_identity zkross-deployer "$(val STELLAR_POSTER_SECRET)"

step "Relayer settings in .env"
set_env() { grep -v "^$1=" "$ENV" > "$ENV.tmp" || true; echo "$1=$2" >> "$ENV.tmp"; mv "$ENV.tmp" "$ENV"; chmod 600 "$ENV"; }
set_env ZKROSS_RELAYER_ORIGINS "$SITE_ORIGIN"
set_env ZKROSS_RELAYER_TRUST_PROXY 1

HOST="${2:-}"
if [ -z "$HOST" ]; then
  ip="$(curl -fsS4 https://api.ipify.org)" || fail "Could not find the public IP; pass the relayer host as the second argument."
  HOST="$ip.sslip.io"
fi

step "systemd services"
unit() {
  sudo tee "/etc/systemd/system/$1.service" >/dev/null <<EOF
[Unit]
Description=ZKross $2
After=network-online.target
Wants=network-online.target

[Service]
User=$USER
WorkingDirectory=$REPO/services/bridge
Environment=ZKROSS_REPO=$REPO
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/npm run --silent $3
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
}
unit zkross-bridge "bridge service (relayer + root poster)" service
sudo systemctl daemon-reload
sudo systemctl enable --now zkross-bridge >/dev/null
if has ZKROSS_ATTESTER_KEY && has ZKROSS_GVK_PRIV && has STELLAR_ATTESTER_SECRET; then
  unit zkross-refund-attester "refund attester" refund-attester
  sudo systemctl daemon-reload
  sudo systemctl enable --now zkross-refund-attester >/dev/null
else
  echo "! Refund attester not started: its keys are not in .env."
fi

step "HTTPS for the relayer ($HOST)"
sudo tee /etc/caddy/Caddyfile >/dev/null <<EOF
$HOST {
	reverse_proxy 127.0.0.1:${ZKROSS_RELAYER_PORT:-8788}
}
EOF
sudo systemctl reload caddy || sudo systemctl restart caddy

# The VM's own firewall (Oracle's Ubuntu images reject everything but SSH).
if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp >/dev/null && sudo ufw allow 443/tcp >/dev/null
elif sudo iptables -S INPUT 2>/dev/null | grep -q REJECT; then
  for p in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 5 -p tcp --dport "$p" -j ACCEPT
  done
  command -v netfilter-persistent >/dev/null && sudo netfilter-persistent save >/dev/null
fi

step "Checking the relayer"
for _ in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:${ZKROSS_RELAYER_PORT:-8788}/health" >/dev/null 2>&1 && break
  sleep 2
done
curl -fsS "http://127.0.0.1:${ZKROSS_RELAYER_PORT:-8788}/health" >/dev/null || fail "The relayer does not answer: journalctl -u zkross-bridge -n 50"

echo
echo "✓ The bridge service is running."
echo "  Relayer URL:  https://$HOST   (check: curl https://$HOST/health)"
echo "  Logs:         journalctl -u zkross-bridge -f"
echo "  Build the site with VITE_RELAYER_URL=https://$HOST (scripts/deploy/site.sh)."
echo "  If https://$HOST does not answer, open ports 80 and 443 in the cloud firewall."
