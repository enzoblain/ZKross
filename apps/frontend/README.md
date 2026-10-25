# Zkross frontend

Responsive React application for the Zkross private USDC bridge between Stellar Testnet and Ethereum Sepolia.

## Implemented integration

- Injected MetaMask and Freighter connections with strict Sepolia/Testnet checks
- Self-bridge flow requiring the source and destination wallets controlled by the user
- Exact 6-decimal bridge amounts with lossless Stellar 7-decimal conversion
- Browser note-key derivation, Poseidon2 commitments, Circom/Groth16 proving worker, and contract proof arguments
- Deposit → bridge out → remote root → bridge in → withdrawal flow with resume support
- Live pool balances, administrators, liquidity events, USDC wallet balances, and explorer links
- Administrator-only `addLiquidity`, including ERC-20 approval on Ethereum
- Browser-local notes and transfer records with JSON backup export
- Privacy and compliance documentation aligned with SPP’s traceable Global View Key model

The UI disables a transfer when either pool is missing from `deployments.json`. At the time of writing, the Stellar pool is deployed and the Sepolia pool is not, so a real end-to-end browser transfer cannot complete yet.

## Stack

- React 19, TypeScript, Vite, and Tailwind CSS v4
- Geist and Geist Mono
- Radix-backed shadcn/ui-style primitives
- Viem, Stellar SDK, and Freighter API
- Lucide icons, Motion, and one restrained Aceternity-inspired spotlight

## Run locally

From the repository root:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5173/` or the URL printed by Vite.

Quality checks:

```bash
npm run build:frontend
npm run lint --workspace=apps/frontend
npm run test:frontend
```

The browser prover also needs generated WASM and circuit artifacts under `apps/frontend/public/zk`. On Emin’s WSL environment, `scripts/build/sync-frontend.sh` builds and stages them in the mirrored checkout before Vite starts.

## Privacy boundary

Public observers can see:

- source deposits and destination withdrawals, including public addresses and amounts;
- pool balances, commitments, nullifiers, roots, deadlines, timestamps, and contract events;
- the destination wallet paying claim and withdrawal fees until the relayer is used.

The implemented SPP-derived circuits protect:

- private note amounts and owners while value remains inside a pool;
- the direct public link between a bridge message and its claim nullifier;
- the recipient note key and claim secret inside the bridge message.

The configured traceable Global View Key administrator can decrypt every note and reconstruct the bridge path. There is no threshold key, field-scoped disclosure, ASP allowlist, or on-chain auditor role in the current MVP. The private Global View Key is never included in this frontend.

Timing, distinctive amounts, reused withdrawal addresses, and the current destination fee payer can still create correlations. The protocol is unaudited and testnet-only.

## Local record warning

Encrypted note delivery from `SPEC.md` B10 is not complete. Note blindings and claim secrets are currently stored in browser local storage without the spending key. Clearing site data can make unspent notes unavailable to the user, so the Activity page provides an explicit backup export.

Brand assets are local SVG files sourced from the official Ethereum and Stellar properties. Zkross is independent software and is not affiliated with, sponsored by, or endorsed by the Stellar Development Foundation.
