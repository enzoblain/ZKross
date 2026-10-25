# Zkross frontend

Premium, responsive product prototype for an intended privacy-preserving
Ethereum Sepolia → Stellar Testnet bridge.

## Experience

- Public product site with an implementation-aware privacy and compliance narrative
- Focused bridge flow with injected MetaMask and Freighter wallet connections
- Two independent single-sided USDC vault workspaces for Ethereum and Stellar
- Chain-specific provide and withdrawal drafts, including destination-capacity checks for cross-chain exits
- Illustrative fee-share and vault-balancing models with safety buffers and pending payout capacity
- Review dialog and explicitly simulated proof/bridge progress
- Privacy explainer separating public settlement from the protected note, link, and business context
- Activity ledger with a searchable transfer index and persistent route inspector
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
- Local SVG brand files sourced from the official Ethereum asset page and Stellar developer site

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
- Bidirectional bridge UI requiring only the source-chain wallet
- Optional destination wallet connection to prefill the public recipient address
- Shared wallet state across Bridge and Liquidity pages

Liquidity provision is single-sided: the user selects either the Ethereum vault or the
Stellar vault and connects only that chain's owner wallet. A same-chain withdrawal exits
the selected vault. A cross-chain withdrawal is modeled as a bridge operation and remains
subject to available capacity in the destination vault. It can be repriced, queued, or
paused before the destination safety buffer is consumed.

The earnings panel is an illustration based on mocked chain-specific outflow, route fees,
and the provider's modeled share of one vault. It is not a live quote, APY, or guarantee.

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

Target privacy boundary:

- Public: source deposit, destination payout, amounts, addresses, vault state,
  commitments, nullifiers, timestamps, and contract events
- Protected by the planned protocol: secret note contents, the direct protocol-level
  deposit-to-payout link, and encrypted business/compliance context
- Not part of the current MVP: large anonymity sets, delayed/grouped exits,
  standardized amounts, batching, temporary destinations, fee-paying relayers, and
  a finalized minimal-event policy

Privacy claims must remain aligned with implemented and independently audited circuit
behavior when production adapters are introduced. Zero-knowledge proofs must not be
represented as hiding data that is already public on either chain, and timing or amount
correlation must not be described as solved before the later hardening layers exist.

Brand asset sources: https://ethereum.org/assets/ and
https://developers.stellar.org/icon.svg. This is independent software and is not
affiliated with, sponsored, or endorsed by the Stellar Development Foundation.
“Stellar” is a trademark of the Stellar Development Foundation. All rights reserved.
