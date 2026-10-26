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
- Wallets: MetaMask on Sepolia and Freighter on Stellar testnet. A transfer
  needs both: the destination wallet claims and withdraws (until the relayer
  exists, those transactions come from your own wallet). Proofs are generated
  in the browser (about 10 to 30 s each).

### 2. The root poster (runs continuously)

```sh
M=$(bash scripts/build/sync-e2e.sh | tail -1)    # WSL mirror of services/bridge and scripts/e2e
cd "$M/services/bridge"
ZKROSS_REPO=<path to this repo> ZKROSS_POST_INTERVAL=30 npm run root-poster
```

It copies each pool's outbox root to the other chain; Sepolia roots are read
at the finalized block, so Ethereum → Stellar waits about 15 minutes. No claim
can happen while it is stopped. The refund attester (`npm run refund-attester`)
settles messages after their deadline plus one hour.

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
The root poster must be running.

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

Enzo's CCTP work below is an experimental track, kept as is. It is not the
main path: in the app its pages are hidden unless the experimental setting
(flask button in the header) is on.

> **Checkpoint du 26 octobre 2026 : intégration collective en cours, bridge public non activé.** Voir [le récapitulatif et les étapes restantes](docs/checkpoint-2026-10-26.md).

### ZKross / ProofBridge

Experimental USDC bridge migration: Ethereum Sepolia ↔ Stellar Testnet.

The current application provides a labeled CCTP lifecycle simulation. **Real CCTP execution and private settlement are blocked.** Existing contracts implement a different, prefunded liquidity bridge with administrator Global View Key access; they are preserved for review and tests, not represented as the target architecture.

### Run locally

```sh
cd /Users/enzoblain/Cours/Hackathon/ZKross
npm ci --ignore-scripts
cp .env.example apps/frontend/.env.local
npm run dev --workspace=apps/frontend -- --host 127.0.0.1
```

Open the URL printed by Vite. Connect wallets optionally for simulation; no signature or blockchain transaction is needed. Open Bridge, simulate 1 USDC, then inspect Private balance and Activity. Select Testnet to inspect blockers; no burn is enabled.

```sh
npm test
npm run build:frontend
npm run lint --workspace=apps/frontend
npm run test:ethereum
npm run test:stellar
```

### Current implementation

- Explicit simulation/testnet separation; no fabricated transaction hashes.
- Forwarder encoding and sandbox attestation retrieval helpers, unit tested against the documented wire format; not connected to a live execution path.
- Demo note accounting, concurrent retry guard, duplicate note and withdrawal prevention.
- Encrypted recovery vault UI (create/lock/export/restore), tested with real local encryption; live deposits are not yet integrated.
- Experimental non-GVK Ethereum pool and real SPP verifier/proof fixtures; not deployed.
- Real browser prover artifacts staged locally; rebuild with scripts/build/private-browser.sh in a clean checkout.
- React Bits SpotlightCard integrated with its license retained.

See [architecture](docs/architecture.md), [testnet setup and deployment](docs/testnet-setup.md), [privacy and disclosure model](docs/privacy-threat-model.md), [test plan](docs/test-plan.md), and [implementation report/checklist](docs/implementation-report.md).

`PLAN.md`, `SPEC.md`, and `CLAUDE.md` document the preserved legacy architecture. They are not evidence that the CCTP migration is implemented. No end-to-end anonymity, production security, or user-scoped disclosure is claimed.
