> **Checkpoint du 26 octobre 2026 : intégration collective en cours, bridge public non activé.** Voir [le récapitulatif et les étapes restantes](docs/checkpoint-2026-10-26.md).

# ZKross / ProofBridge

Experimental USDC bridge migration: Ethereum Sepolia ↔ Stellar Testnet.

The current application provides a labeled CCTP lifecycle simulation. **Real CCTP execution and private settlement are blocked.** Existing contracts implement a different, prefunded liquidity bridge with administrator Global View Key access; they are preserved for review and tests, not represented as the target architecture.

## Run locally

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

## Current implementation

- Explicit simulation/testnet separation; no fabricated transaction hashes.
- Forwarder encoding and sandbox attestation retrieval helpers, unit tested against the documented wire format; not connected to a live execution path.
- Demo note accounting, concurrent retry guard, duplicate note and withdrawal prevention.
- Encrypted recovery vault UI (create/lock/export/restore), tested with real local encryption; live deposits are not yet integrated.
- Experimental non-GVK Ethereum pool and real SPP verifier/proof fixtures; not deployed.
- Real browser prover artifacts staged locally; rebuild with scripts/build/private-browser.sh in a clean checkout.
- React Bits SpotlightCard integrated with its license retained.

See [architecture](docs/architecture.md), [testnet setup and deployment](docs/testnet-setup.md), [privacy and disclosure model](docs/privacy-threat-model.md), [test plan](docs/test-plan.md), and [implementation report/checklist](docs/implementation-report.md).

`PLAN.md`, `SPEC.md`, and `CLAUDE.md` document the preserved legacy architecture. They are not evidence that the CCTP migration is implemented. No end-to-end anonymity, production security, or user-scoped disclosure is claimed.
