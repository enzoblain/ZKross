# HackMeridian 2026 — ZKross friction log

## Evidence and scope

This log is based on the repository on `main`, its commit history, and the available project conversations. The time costs below are **retrospective estimates**, not stopwatch measurements. They are approximate and sometimes overlap because several parts were debugged together during the hackathon.

ZKross is a testnet-only, unaudited prototype. We did **not** count ideas that were only planned or abandoned as completed integrations: the final path does not use Noir/UltraHonk or Circle CCTP; permissionless LP shares and fees are roadmap work; and there is no evidence that Raven MCP or any other Stellar MCP was used. No secrets or private keys are included here.

## What we built

ZKross is a private, auditable USDC bridge between Stellar testnet and Ethereum Sepolia. Each chain has a shielded pool. A user's browser creates Groth16 proofs for private notes, bridge-out messages, bridge-in claims, and withdrawals. A relayer submits the proved operations, a root-poster copies outbox roots between chains, and a refund attester handles expired transfers. A Global View Key lets a designated auditor decrypt private notes while the public sees only commitments, nullifiers, ciphertexts, and the public token movements into or out of a pool.

On Stellar, we extended the Soroban pool from Stellar Private Payments (SPP) with bridge, outbox, refund, and liquidity functions. On Ethereum, we built a compatible Solidity pool that uses the same Circom circuits, proving keys, note format, and Poseidon2-based tree. Both pools were deployed to testnets and exercised in both directions with real proofs and Circle testnet USDC.

## Stellar tools actually used

| Tool | How we used it |
| --- | --- |
| **Soroban smart contracts (Rust)** | Extended SPP's `pool-gvk` contract with `bridge_out`, `bridge_in`, remote-root posting, finalization/refunds, an outbox Merkle tree, and operator-seeded liquidity. We also deployed separate Groth16 verifier contracts. |
| **Stellar CLI 28.1.0** | Built and optimized Wasm, generated/funded testnet accounts, created USDC trustlines, deployed contracts, invoked and simulated contract calls, inspected Wasm hashes, and ran deployment/dry-run scripts. |
| **`@stellar/stellar-sdk` 17.4.0** | Used in the frontend and bridge services for Soroban RPC calls, XDR/value encoding, simulations, transaction building/submission, contract event reads, and Stellar address handling. |
| **Freighter and `@stellar/freighter-api` 6.0.1** | Connected the Stellar wallet, detected the active account and network, signed the identity message used to derive the private note key, and signed public Stellar deposits when needed. |
| **Stellar Private Payments (SPP)** | Vendored a pinned SPP commit and reused its shielded-pool contracts, Circom building blocks, Groth16 verifier, Poseidon2 conventions, Rust SDK/prover, traceable Global View Key model, and tests. We added ZKross-specific bridge circuits and contract functions rather than presenting SPP as our own work. |
| **Stellar testnet services** | Used Friendbot to fund throwaway accounts, Horizon for account/trustline and latest-ledger checks, public Soroban RPC for simulation/events/submission, and Circle's Stellar testnet USDC through its Stellar Asset Contract. |

## Main friction points

### 1. Matching SPP proofs and state formats across Soroban, the browser, and Solidity

- **What happened:** The implementation needed exact agreement on 30-element public-input order, field endianness, G2 coordinate order, Global View Key ciphertext layout, Soroban XDR map ordering for the external-data hash, Poseidon2 domains, and Merkle zero values. The information existed in SPP, but the complete mapping was spread across circuits, contracts, SDK code, and tests rather than shown in one cross-chain example. A format mismatch would produce a generic proof rejection or, worse, incompatible pool state.
- **Estimated cost:** **about 3 hours**. This is inferred from the implementation cluster that documented the encodings, verified a real SPP proof in Solidity, ported Poseidon2 and the Merkle tree, added circuits/tests, and reached the first Stellar deployment; it overlaps with contract work.
- **Workaround:** Pinned one SPP commit, wrote `docs/spp-encoding-notes.md` and `SPEC.md`, added shared test vectors, verified a real SPP proof with both `snarkjs` and the Solidity verifier, and tested Poseidon2 against 75 vectors plus the zero-hash table.
- **Additional Soroban issue:** The straightforward Groth16 verifier approach put `bridge_out` over Soroban's 100 million instruction limit. We replaced one scalar multiplication per public input with a single `g1_msm`, reducing verification cost enough to fit.

### 2. Reproducible proof and Wasm tooling across WSL, Linux, and macOS

- **What happened:** The working stack depended on a tightly matched set of Rust, Stellar CLI, Circom, `snarkjs`, Foundry, Wasm targets, and `wasm-bindgen` versions. The browser also used staged prover artifacts; when the staged Wasm/JavaScript pair became stale, the visible error was only `fn is not a function`. Windows line endings created additional deployment-script and pasted-secret problems.
- **Estimated cost:** **about 1–2 hours** across setup and integration.
- **Workaround:** Pinned the full toolchain in `VERSIONS.md`, kept SPP at a fixed commit, built in WSL2 for the main flow, added dedicated build/staging scripts, checked staged-prover compatibility and replaced the opaque error with a clear "staged prover is out of date" diagnosis, documented WSL2, and normalized line endings.

### 3. Freighter's active account versus the private-note identity

- **What happened:** A private balance must stay tied to one deterministic note key, but Freighter's active account can change independently of the account remembered by the app. Asking users to connect both source and destination wallets also made the bridge unnecessarily complex. A mismatched active signer could otherwise sign with a different account from the note owner or fee payer.
- **Estimated cost:** **about 45–90 minutes** to settle the identity model and harden the UI.
- **Workaround:** Switched to one identity wallet for both directions, derived the same note key from a signed identity message, removed the requirement to connect the destination wallet, added an active-account watcher, kept owner and signing-account state separate, and reject/explain mismatched Freighter signing instead of silently continuing.

### 4. Stellar RPC event pagination and limited history

- **What happened:** Recovery and the admin ledger depend on contract events. A short event page did not reliably mean there were no more pages, so the first reader could stop early. Separately, the public Stellar RPC used during the demo retained only roughly seven days of events, which prevents complete long-term note recovery from that endpoint alone.
- **Estimated cost:** **about 45–90 minutes** for the pagination/retry bug; the retention problem remains a production task.
- **Workaround:** Follow cursors until the server indicates completion instead of treating a short page as EOF, publish encrypted owner notes on-chain, support "Recover from chain" for the available window, and provide Activity backups. A permanent event indexer is still needed for full-history recovery.

### 5. Stellar testnet USDC setup and cross-chain decimal differences

- **What happened:** Stellar accounts that receive issued USDC need a trustline, test accounts need funding, the pool uses the USDC Stellar Asset Contract, and Circle's faucet limits test liquidity. Stellar USDC has 7 decimals while Sepolia USDC has 6, so a naïve bridge conversion could round away value.
- **Estimated cost:** **about 45–60 minutes** for account setup, deployment scripting, and amount rules.
- **Workaround:** Added an idempotent account script using Stellar CLI, Friendbot, and Horizon; created trustlines automatically; kept pool/demo amounts small; made bridge amounts use 6-decimal units; and returned any seventh-decimal remainder to the sender's private change note instead of rounding it away.

## What worked well

- SPP provided a substantial, testable Stellar privacy base: pool contracts, circuits, prover code, Global View Key support, and adversarial tests. Building on a pinned commit saved far more time than writing a privacy pool from scratch.
- Soroban simulation before submission was valuable for catching encoding, authorization, and resource-budget failures without wasting testnet transactions.
- Stellar testnet, Friendbot, Horizon, and Stellar CLI made it practical to create isolated roles, deploy multiple contracts, and repeat end-to-end runs quickly.
- Freighter and the JavaScript SDK covered the core browser-to-Soroban path once identity/account state was handled explicitly.
- Shared specifications and test vectors made one proof format work on Stellar and Ethereum, and the repository reached real two-way testnet transfers rather than a mocked bridge.
- Fast Stellar ledger finality made the Stellar-to-Ethereum side of the root-posting flow straightforward; most waiting in the reverse direction came from Sepolia finality.

## What would have made building on Stellar easier

- One official end-to-end example combining a Circom/Groth16 browser prover, a Soroban verifier contract, `@stellar/stellar-sdk`, Stellar CLI deployment, and Freighter signing.
- A single reference page for proof/public-input byte ordering, XDR hashing examples, BN254/Groth16 verifier inputs, and realistic Soroban resource costs.
- A documented event-pagination recipe that clearly separates "short page" from "end of results", plus a hosted testnet event/indexing option with longer retention.
- A supported version matrix for Rust targets, Stellar CLI, the JavaScript SDK, `wasm-bindgen`, and common OS/WSL setups, with clearer stale-Wasm diagnostics.
- A complete issued-asset example covering Friendbot, trustlines, Stellar Asset Contracts, Freighter, and decimal conversion against a 6-decimal chain.
- Better resource profiling for cryptographic contracts before deployment, including guidance for MSM-based Groth16 verification under Soroban limits.

## Bottom line

The Stellar pieces were strong enough to ship a real testnet prototype in a hackathon window. The largest cost was not basic contract deployment; it was making cryptography, encodings, wallet identity, and event recovery behave consistently across the browser, Soroban, and Ethereum. Better integrated examples and long-lived event infrastructure would have removed most of that friction.
