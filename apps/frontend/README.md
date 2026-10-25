# Zkross frontend

Premium, responsive product prototype for an intended privacy-preserving
Ethereum Sepolia → Stellar Testnet bridge.

## Experience

- Public product site with an implementation-aware privacy and compliance narrative
- Focused bridge flow with MetaMask and Freighter demo connection states
- Review dialog and explicitly simulated proof/bridge progress
- Privacy-first activity screen with loading, empty, table, mobile list, search, and detail states
- Separate institutional interface demo for registry, disclosure, and audit-log concepts
- Dark and light themes, keyboard focus states, responsive layouts, and reduced-motion support

## Stack and UI sources

- React 19, TypeScript, Vite, and Tailwind CSS v4
- Geist and Geist Mono
- shadcn/ui-style components backed by Radix UI for buttons, dialog, and switch primitives
- Lucide icons
- Motion and one restrained Aceternity-inspired spotlight treatment

No paid template or runtime UI package was added. The layout and visual identity
are original to Zkross.

## Run locally

Node.js and npm must be installed. From the repository root:

~~~bash
npm install
npm run dev
~~~

Open http://127.0.0.1:5173/ (or the URL printed by Vite).

Quality checks:

~~~bash
npm run build:frontend
npm run lint --workspace=apps/frontend
~~~

## Integration status

The frontend uses src/lib/mock-bridge.ts.

Not connected or implemented:

- MetaMask, Freighter, wagmi, viem, or Stellar SDK wallet sessions
- Ethereum or Stellar transaction submission
- Bridge contracts, relayers, quotes, balances, or settlement
- ZK proof generation or verification
- Confidential transaction storage, owner authorization, or decryption
- Institutional authentication, MFA, server-side permissions, disclosure, or immutable audit logging

All addresses, activity rows, institutional records, fees, and progress states
are local fixtures and are labeled as prototype or demo data. No private key,
seed phrase, secret, signature, transaction, proof, or asset is requested or
created.

Privacy claims must remain aligned with implemented and independently audited
circuit behavior when production adapters are introduced. Zero-knowledge proofs
must not be represented as hiding data that is already public on either chain.
