# Zkross frontend

Premium, responsive product prototype for an intended privacy-preserving
Ethereum Sepolia → Stellar Testnet bridge.

## Experience

- Public product site with an implementation-aware privacy and compliance narrative
- Focused bridge flow with injected MetaMask and Freighter wallet connections
- Liquidity-providing workspace with a balanced allocation intent and local positions draft
- Review dialog and explicitly simulated proof/bridge progress
- Privacy-first activity screen with loading, empty, table, mobile list, search, and detail states
- Unified compliance workspace for transactions, disclosure requests, role separation, and audit-log concepts
- Transaction-scoped field grants with separate compliance, custodian, auditor, and platform roles
- Dark and light themes, keyboard focus states, responsive layouts, and reduced-motion support

## Stack and UI sources

- React 19, TypeScript, Vite, and Tailwind CSS v4
- Geist and Geist Mono
- shadcn/ui-style components backed by Radix UI for buttons, dialog, and switch primitives
- Lucide icons
- Motion and one restrained Aceternity-inspired spotlight treatment
- MetaMask EIP-1193 provider and the pinned official Freighter API browser bundle

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

Implemented wallet boundary:

- MetaMask account request through the injected EIP-1193 provider
- Automatic request to switch or add Ethereum Sepolia
- Freighter extension detection, account authorization, and Stellar Testnet validation
- Shared wallet state across Bridge and Liquidity pages

Wallet signing and blockchain actions are not implemented.

Not connected or implemented:

- Ethereum or Stellar transaction submission
- Bridge contracts, relayers, quotes, balances, or settlement
- Liquidity pool contracts, approvals, deposits, withdrawals, LP shares, or yield
- ZK proof generation or verification
- Confidential transaction storage, owner authorization, or decryption
- Institutional authentication, MFA, server-side permissions, disclosure, or immutable audit logging

Wallet addresses are read from the user's approved browser extensions. Activity
rows, compliance records, liquidity data, fees, progress states, permissions,
and decrypted-field examples are local fixtures and are labeled as prototype or
demo data. No private key, seed phrase, secret, signature, transaction, proof,
decryption key, or asset is requested or created.

Privacy claims must remain aligned with implemented and independently audited
circuit behavior when production adapters are introduced. Zero-knowledge proofs
must not be represented as hiding data that is already public on either chain.
