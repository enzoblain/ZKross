# ZKross: context for Claude Code

This file gives Claude Code the context from our planning discussion. The full build plan is in `PLAN.md` at the repo root; read it before making design decisions. A PDF and an online version of the same plan exist; `PLAN.md` is the source of truth in the repo.

## The project

ZKross is a testnet demo of a **private bridge between Stellar and Ethereum (Sepolia)**, inspired by **ProofBridge** and built on **Stellar Private Payments (SPP)**, Nethermind's open-source shielded pool for Stellar (https://github.com/NethermindEth/stellar-private-payments).

- The public sees only commitments, nullifiers and ciphertexts. Amounts, owners and the link between a deposit on one chain and a withdrawal on the other stay hidden (except deposit and withdrawal amounts, which are public because tokens move in or out).
- An **admin** can decrypt everything, using SPP's **Global View Key** in traceable mode: every circuit encrypts every note to the admin's Baby JubJub key, inside the circuit.
- Everything runs on **testnet only** (Stellar testnet + Ethereum Sepolia), with our own test token **tUSDC**.

**Noir is not used.** We switched from a Noir plan to SPP: its Circom circuits and Groth16 proofs already provide hidden amounts, enforced admin visibility, browser proving, an indexer and an admin page. If you see Noir, UltraHonk, `nargo` or `bb` anywhere in the repo or old notes, it's from the abandoned plan.

## What we reuse and what we build

| Part | Reused from SPP | We build |
| --- | --- | --- |
| Pool circuit | `policy_tx_2_2_gvk_T` (2-in-2-out, hidden amounts, traceable Global View Key) | — |
| Bridge circuits | SPP's templates: transaction core, Merkle proof, Global View Key encryption, Poseidon2 | `bridge_out`, `bridge_in` (Circom) |
| Stellar contracts | `pool-gvk`, `pool-core`, `circom-groth16-verifier`, `public-key-registry` | Bridge functions, outbox tree, liquidity accounting |
| Ethereum contracts | — | Solidity port of `pool-gvk` + bridge functions, matching Poseidon2 and Merkle tree, snarkjs-exported verifiers |
| SDK, prover, indexer | Rust and web SDKs, prover worker, indexer, bootnode | Ethereum support, bridge flows |
| Admin view | Admin page, Global View tab | Ethereum notes, linking bridge-out to bridge-in |

## Team split

| Person | Role | Owns |
| --- | --- | --- |
| Person 1 | ZK & cryptography | `SPEC.md`, the `bridge_out` and `bridge_in` Circom circuits, their Groth16 keys, the Solidity Poseidon2 check |
| **Emin (Person 2)** | **Smart contracts & bridge** | Bridge functions in SPP's Soroban pool, the Solidity port of the pool, verifiers, root poster, relayer, refund attester, Ethereum indexer |
| Person 3 | Frontend, admin & integration | Web app on SPP's SDK, Ethereum wallet, bridge and claim screens, admin view for both chains, demo |

## Emin's scope

1. **Stellar:** extend SPP's `pool-gvk` with `bridge_out`, `bridge_in`, `post_remote_root`, `finalize`, `refund`, `add_liquidity`; an outbox Merkle tree (reuse SPP's Merkle tree with root history), pending `C` records with deadline bucket and refund commitment, a claim-nullifier set, known remote roots. SPP's `transact` stays unchanged.
2. **Ethereum:** `ShieldedPool.sol`, a function-for-function port of SPP's pool logic (root history, nullifiers, external-data hash, public amount, Global View Key and nonce checks, events with ciphertexts), plus the same bridge functions; `MockUSDC`; Groth16 verifiers exported with snarkjs from the same keys used on Stellar.
3. **Services** (TypeScript): Ethereum indexer with outbox trees and a Merkle path API, root poster, relayer, refund attester. On Stellar, reuse SPP's indexer and bootnode.
4. **Deliverable:** an end-to-end testnet transfer, Stellar → Ethereum and back, with liquidity seeded on both chains.

Until Person 1's bridge circuits and keys exist, use a mock verifier. Make it strict enough that tests can check the contract passes the right public inputs (for example, a test registers the exact public inputs it should accept), so tests on tampered ciphertexts or changed recipients are meaningful.

## Key decisions (do not change without the team)

- **Base:** SPP, pinned to one commit recorded in `VERSIONS.md`; never update it mid-project. Keep SPP's LICENSE and NOTICE files (Apache 2.0; its circuit compiler tool is GPLv3; compiled circuits are LGPLv3).
- **Proofs:** Circom + Groth16 on BN254, the same circuits and keys on both chains.
- **Pool policy:** open policy (no ASP lists) with a **traceable** Global View Key.
- **Hash:** SPP's Poseidon2 everywhere. The Solidity Poseidon2 must match SPP's exactly (test vectors).
- **Bridge message:** `C = Poseidon2(TAG_BRIDGE, amount, asset_id, src_chain, dst_chain, recipient_pk, claim_secret, deadline_bucket)`, new domain tags from `0x07` (SPP uses `0x01`–`0x06`). Claim nullifier = `Poseidon2(TAG_CLAIM, claim_secret)`, never a hash of `C`. Exact formats live in `SPEC.md`.
- **Liquidity:** unowned balance inside each pool, seeded by us; the admin rebalances by hand on testnet.
- **Accepted testnet trust:** an admin-run root poster, one relayer, admin-signed refund attestations, a single admin key.

## Critical gotchas

- **Every contract function must check that the Global View Key public input equals the pool's stored admin key, and that the nonce is unique.** SPP's docs warn the circuit can't enforce either; without these checks a user can produce notes the admin can't decrypt.
- **Reject public inputs ≥ the BN254 scalar field size r** on both chains (snarkjs Solidity verifiers do this; check SPP's Soroban verifier and our own code). Accepting them allows double spends.
- **Verification keys must not be replaceable by anyone**: set once at construction.
- **Stellar storage expires**: use SPP's time-to-live helper (`extend_persistent`) on every new persistent entry.
- **Stellar RPC keeps events for only about 7 days**: SPP's bootnode keeps history; the Ethereum indexer needs a backfill script.
- **Simulate every Soroban call** and check CPU, memory and size limits.
- **Stellar recipients** of a public withdrawal need an account with a tUSDC trustline.
- **Field encodings** (addresses, chain IDs, deadline buckets, external-data hash) must be identical on both chains and written down in `SPEC.md`. Mismatches are the most likely cross-chain bug.
- **SPP's tooling expects Linux or macOS.** This machine runs Windows with WSL2 (Ubuntu): run SPP's build, Circom, snarkjs and Rust builds inside WSL.
- **Never use mainnet configuration or real-fund keys.** Keys go in `.env` files excluded by `.gitignore`.

## Repository layout (as it actually exists)

```
contracts/stellar/    Soroban contracts (Emin)
contracts/ethereum/   Foundry project, created by Enzo (Emin works here)
services/             relayer (exists), prover (leave alone), plus indexer, root poster, refund attester
apps/frontend/        web app (Person 3)
PLAN.md               full build plan
SPEC.md               shared formats and test vectors (Person 1)
VERSIONS.md           pinned versions, including the SPP commit
deployments.json      deployed addresses
```

Where SPP itself lives in the repo (a fork, or a git subtree such as `spp/`) is a team decision for Phase 0; ask before choosing.

## References

- SPP: https://github.com/NethermindEth/stellar-private-payments (see `docs/src/global_view_key.md`, `docs/src/operator/`, `DEPLOY.md`, `contracts/pool-gvk`, `contracts/pool-core`, `circuits/src`)
- Stellar privacy and ZK guide: https://github.com/stellar/ecosystem-resources/tree/main/privacy-zk
- ProofBridge docs: https://docs.pfbridge.xyz
- Shared build plan: https://claude.ai/artifact/HbJsqp5BKsfY5ZDXPQtBMT
