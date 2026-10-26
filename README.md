# ZKross

A private USDC bridge between Stellar testnet and Ethereum Sepolia, built on
[Stellar Private Payments](https://github.com/NethermindEth/stellar-private-payments):
shielded pools on both chains, liquidity prefunded in each pool, Circom +
Groth16 proofs (`bridge_out`, `bridge_in`), and a traceable Global View Key so
the admin can decrypt every note. Testnet only, with Circle's testnet USDC.

`CLAUDE.md`, `PLAN.md` and `SPEC.md` are the reference for the design and the
formats. Deployed addresses are in `deployments.json`.

## Lancer sur testnet (run on testnet)

Everything builds and runs inside WSL2 (Ubuntu) or Linux. Toolchain versions
are in `VERSIONS.md`: Node 20, Rust 1.97.1 with the `wasm32-unknown-unknown`
target and `wasm-bindgen-cli` 0.2.128, Foundry, the `stellar` CLI, Circom.
Throwaway testnet keys come from `scripts/testnet/create-accounts.sh` and live
in the git-ignored `.env`; never use mainnet or keys holding real funds.

### Everything at once

```sh
npm start                          # the bridge service and the site, in one terminal
npm start -- --site-only           # or only one of them
npm start -- --service-only
```

`scripts/dev.sh` checks what is missing first (`.env`, the Ethereum ABIs, the
browser prover files, a busy relayer port), reuses a relayer already running,
prefixes each output with `[service]` / `[site]`, and Ctrl+C stops both.
Sections 1 and 2 below run them separately.

### 1. The site

```sh
bash scripts/build/sync-frontend.sh   # installs in ~/zkross-build/front and stages
                                      # public/zk (browser prover + circuit files)
cd ~/zkross-build/front/apps/frontend
npm run dev -- --host 127.0.0.1       # development server
npm run build                         # static site in dist/ (about 55 MB with zk/)
npx vite preview --host 127.0.0.1     # serve the production build locally
```

- `dist/` is a plain static site: upload it to any static host. Serve `.wasm`
  as `application/wasm`; for a sub-path, build with `npm run build -- --base=/path/`.
- Public configuration only: `apps/frontend/.env.example`. Pool and token
  addresses are read from `deployments.json` at build time.
- Wallets: MetaMask on Sepolia and Freighter on Stellar testnet. One of them,
  chosen once, is your identity: it signs your private note key, the same on
  both chains and in both directions. The wallet on the source chain only
  deposits what your private balance does not cover. You type the destination
  address; the relayer claims and withdraws to it, or the note can be kept in
  the destination's private balance and bridged back later. Proofs are
  generated in the browser (about 10 to 30 s each).

### 2. The root poster and the relayer (one service, runs continuously)

```sh
M=$(bash scripts/build/sync-e2e.sh | tail -1)    # WSL mirror of services/bridge and scripts/e2e
cd "$M/services/bridge"
ZKROSS_REPO=<path to this repo> ZKROSS_POST_INTERVAL=30 npm run service
# only one of them: npm run service -- --only=relayer   (or --only=root-poster)
```

- **Root poster:** copies each pool's outbox root to the other chain; Sepolia
  roots are read at the finalized block, so Ethereum → Stellar waits about 15
  minutes. No claim can happen while it is stopped.
- **Relayer** (`http://127.0.0.1:8788`): `POST /relay` submits a withdrawal,
  private transfer, bridge out or claim from the relayer's own account, so the
  user's wallet does not appear on-chain for it; `GET /status/:hash` follows
  it. It only calls our two pools, never relays deposits, simulates first,
  caps gas / fees, limits requests per IP and answers only the site's origins
  (`ZKROSS_RELAYER_ORIGINS`). Fee: 0 on testnet. Its keys are
  `STELLAR_RELAYER_SECRET` and `SEPOLIA_RELAYER_KEY` in `.env`; the site
  points at it with `VITE_RELAYER_URL`. Settings: `ZKROSS_RELAYER_PORT`,
  `ZKROSS_RELAYER_HOST`, `ZKROSS_RELAYER_MAX_GAS`, `ZKROSS_RELAYER_MAX_FEE`,
  `ZKROSS_RELAYER_RATE`. Tests: `npm test`.
- The refund attester (`npm run refund-attester`) settles messages after their
  deadline plus one hour.

### 3. The end-to-end script

```sh
cd "$M/scripts/e2e"
ZKROSS_REPO=<path to this repo> npx tsx testnet.ts
```

It seeds 20 USDC of liquidity in each pool, then runs two transfers in each
direction (deposit, `bridge_out`, root posting, `bridge_in`, withdrawal to a
fresh address) and checks the admin's view: every note and bridge message on
both chains decrypted and each `bridge_out` linked to its `bridge_in`. It
prints every transaction link and resumes from `deploy-out/e2e-state.json`.
The root poster must be running. With `--relayer`, it moves 1 USDC each way
with bridge outs, claims and withdrawals (0.5 USDC to a fresh address) sent
through the relayer, and checks on-chain that the relayer, not a user, sent
them (state in `deploy-out/e2e-relayer-state.json`).

### Deploying the pools

`scripts/testnet/deploy-stellar.sh` and `scripts/testnet/deploy-sepolia.sh`
(both update `deployments.json`). Sepolia now charges far more for new code
than forge's local simulation, so the Sepolia script adds an 8x gas margin and
a low tip.

### Tests

```sh
cd contracts/ethereum && forge test                     # Ethereum pool and bridge
bash scripts/build/sync-spp.sh                          # then, in ~/zkross-build/spp:
cargo test -p pool-gvk                                  # Stellar pool and bridge
cargo test -p circuits --release prove_bridge           # bridge circuits, real proofs
cd ~/zkross-build/front/apps/frontend && npm test       # frontend
```

## Piste expérimentale CCTP (Enzo)

Enzo's CCTP track (simulated CCTP lifecycle, batching, encrypted note vault,
non-GVK private pool) is not part of this branch. It is kept as is on the
[`cctp-experimental`](https://github.com/enzoblain/ZKross/tree/cctp-experimental) branch.
