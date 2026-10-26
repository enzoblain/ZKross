# Test plan

## Automated locally

npm test runs Vitest: amounts, testnet configuration, proof mappings, CCTP progress, exact Stellar forwarding encoding, decimal rejection, Iris response validation, reverse-domain response support, malformed/truncated/wrong-route messages, duplicate and zero nonces, HTTP failures, interruptions, simulation final accounting, repeated/concurrent execution, duplicate withdrawal, testnet/demo isolation and encrypted backup recovery/tampering. Circle HTTP responses are mocked: no real burn or mint is claimed.

npm run build:frontend compiles all TypeScript and produces Vite output. npm run lint --workspace=apps/frontend checks source; vendored generated declarations have existing warnings.

npm run test:ethereum runs preserved Foundry suites: Poseidon2/spec vectors, Merkle roots/history, proof input tampering, canonical fields, spent nullifiers, replay rejection, custody/accounting and administrator controls. Most pool-flow tests use strict mock verifiers; the SPP verifier fixture suite uses a real pre-existing proof. These do not test CCTP integration.

npm run test:stellar tests the legacy Stellar implementation. It requires Rust and locked external dependencies. Browser WASM integration remains a separate dependency; skipped WASM tests are not passing proof tests.

## Browser acceptance

Open Bridge → simulate 1 USDC → seven simulated events → destination simulated balance increases once → Activity labels every event simulation. Reload: history/balance persist. Select Testnet: no simulation fallback and disabled execution with explicit blockers. Check wallet connection errors without signing real transfers. Check both themes and narrow viewports. Compliance must say design-only.

## Required before live release

Wallet integration/disconnect/account changes; actual Sepolia approval/burn and Stellar forwarder mint; reverse settlement; fee accounting; full canonical message binding; signature/nonce replay verification; real USDC pool deposits/withdrawals; invalid/replayed ZK proofs; ASP policy proofs; authorized disclosure and revocation; RBAC denial; durable duplicate-event handling; restart after ambiguous submission; mint-before-deposit recovery; encrypted note recovery and duplicate spending across tabs/devices. No automated target end-to-end on-chain test exists yet.
