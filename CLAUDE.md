# ZKross: context for Claude Code

This file gives Claude Code the context from our planning discussion. The full build plan is in `PLAN.md` at the repo root; read it before making design decisions. A PDF and an online version of the same plan exist; `PLAN.md` is the source of truth in the repo. Exact formats live in `SPEC.md`.

## The project

ZKross is a testnet demo of a **private bridge for USDC between Stellar and Ethereum (Sepolia)**, inspired by **ProofBridge** and built on **Stellar Private Payments (SPP)**, Nethermind's open-source shielded pool for Stellar (https://github.com/NethermindEth/stellar-private-payments).

- The public sees only commitments, nullifiers and ciphertexts. Amounts, owners and the link between a deposit on one chain and a withdrawal on the other stay hidden (except deposit and withdrawal amounts, which are public because tokens move in or out).
- An **admin** can decrypt everything, using SPP's **Global View Key** in traceable mode: every circuit encrypts every note to the admin's Baby JubJub key, inside the circuit.
- Everything runs on **testnet only** (Stellar testnet + Ethereum Sepolia), with **Circle's official testnet USDC** on both chains (see "Token" below).

**Noir is not used.** We switched from a Noir plan to SPP: its Circom circuits and Groth16 proofs already provide hidden amounts, enforced admin visibility, browser proving, an indexer and an admin page. If you see Noir, UltraHonk, `nargo` or `bb` anywhere in the repo or old notes, it's from the abandoned plan.

## What we reuse and what we build

| Part | Reused from SPP | We build |
| --- | --- | --- |
| Pool circuit | `policy_tx_2_2_gvk_T` (2-in-2-out, hidden amounts, traceable Global View Key) | — |
| Bridge circuits | SPP's templates: transaction core, Merkle proof, Global View Key encryption, Poseidon2 | `bridge_out`, `bridge_in` (Circom) |
| Stellar contracts | `pool-gvk`, `pool-core`, `circom-groth16-verifier` | Bridge functions, outbox tree, liquidity accounting |
| Ethereum contracts | — | Solidity port of `pool-gvk` + bridge functions, matching Poseidon2 and Merkle tree, snarkjs-exported verifiers |
| Prover, services | SPP's Rust SDK and prover | A Rust prover CLI for the bridge circuits, root poster, refund attester |
| Admin view | Admin page, Global View tab | Ethereum notes, linking bridge-out to bridge-in |

## Team

| Person | Owns |
| --- | --- |
| **Emin**, working with Claude Code | `SPEC.md`, the `bridge_out` and `bridge_in` circuits and their keys, all contracts on both chains, all services, the end-to-end scripts |
| Frontend developer | The web app only |

## Scope

1. **Stellar:** extend SPP's `pool-gvk` (in `spp/`) with `bridge_out`, `bridge_in`, `post_remote_root`, `finalize`, `refund`, `add_liquidity`; an outbox Merkle tree (SPP's Merkle tree with root history), pending `C` records with deadline bucket and refund commitment, a claim-nullifier set, known remote roots. SPP's `transact` stays unchanged.
2. **Ethereum:** `ShieldedPool.sol`, a function-for-function port of SPP's pool logic, plus the same bridge functions; Groth16 verifiers exported with snarkjs from the same keys used on Stellar. `MockUSDC` is for local tests only and is never deployed.
3. **Circuits:** `bridge_out` and `bridge_in` in Circom, built from SPP's templates, keys generated with SPP's tooling (single-party setup on testnet).
4. **Services** (TypeScript): root poster and refund attester. No ASP compliance lists, nothing not needed for the bridge.
5. **Deliverable:** an end-to-end testnet transfer of USDC, Stellar → Ethereum and back, with small liquidity seeded on both chains.

Contract tests use a strict mock verifier until real keys exist: it accepts only a (proof, public inputs) pair a test registered, so tests on tampered ciphertexts or changed recipients are meaningful.

## Token: Circle's testnet USDC

| Chain | Asset | Decimals |
| --- | --- | --- |
| Ethereum Sepolia | ERC-20 `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` | 6 |
| Stellar testnet | `USDC` issued by `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, used through its Stellar Asset Contract (address in `deployments.json`) | 7 |

- Bridged amounts convert between 7 and 6 decimals as `SPEC.md` defines; no value may be rounded away.
- Every Stellar account that receives USDC needs a trustline to that issuer (pool contracts don't). Deployment and end-to-end scripts create them.
- Circle's faucet gives 20 USDC every 2 hours per address and per chain: keep pool liquidity and demo amounts small (single-digit USDC per transfer).

## Key decisions

- **Base:** SPP, pinned to one commit recorded in `VERSIONS.md`, vendored under `spp/`; never update it mid-project. Keep SPP's LICENSE and NOTICE files (Apache 2.0; its circuit compiler tool is GPLv3; compiled circuits are LGPLv3).
- **Proofs:** Circom + Groth16 on BN254, the same circuits and keys on both chains.
- **Pool policy:** open policy (no ASP lists) with a **traceable** Global View Key.
- **Hash:** SPP's Poseidon2 everywhere, in SPP's style: domain tag last, longer inputs by chaining 3-input Poseidon2. New tags from `0x07`. The Solidity Poseidon2 matches SPP's exactly (test vectors).
- **Nonce:** match SPP: the circuit's `nonce` input is the external-data hash, with no used-nonce set.
- **Bridge message `C`, claim nullifier, refund note, deadline bucket, encodings, decimal conversion:** exactly as in `SPEC.md`. The claim nullifier is never a hash of `C`.
- **Liquidity:** unowned balance inside each pool, seeded by us; the admin rebalances by hand on testnet.
- **Accepted testnet trust:** an admin-run root poster, admin-signed refund attestations, a single admin key.

## Critical gotchas

- **Every contract function must check that the Global View Key public input equals the pool's stored admin key.** The circuit can't enforce it; without the check a user can produce notes the admin can't decrypt. The contract supplies `D` from storage, never from the caller.
- **Reject public inputs ≥ the BN254 scalar field size r** on both chains. Accepting them allows double spends.
- **Verification keys must not be replaceable by anyone**: set once at construction.
- **Stellar storage expires**: use SPP's time-to-live helper (`extend_persistent`) on every new persistent entry.
- **Stellar RPC keeps events for only about 7 days**: SPP's bootnode keeps history; Ethereum services need a backfill path.
- **Simulate every Soroban call** and check CPU, memory and size limits.
- **Field encodings** (addresses, chain IDs, deadline buckets, external-data hash, decimals) must be identical on both chains and written down in `SPEC.md`. Mismatches are the most likely cross-chain bug.
- **SPP's tooling expects Linux or macOS.** This machine runs Windows with WSL2 (Ubuntu): run SPP's build, Circom, snarkjs, Foundry and Rust builds inside WSL. `sudo` commands go to Emin.
- **Never use mainnet configuration or real-fund keys.** Keys go in `.env` files excluded by `.gitignore`.

## Repository layout

```
spp/                  SPP at the pinned commit (git subtree); our changes are listed in VERSIONS.md
  circuits/src/bridge_*.circom, circuits/src/zkross/   the bridge circuits
  contracts/pool-gvk/src/pool_gvk/bridge.rs            the Stellar bridge functions
  deployments/zkross/circuit_keys/                     bridge Groth16 keys and witness graphs
contracts/ethereum/   Foundry project (ShieldedPool, verifiers, Poseidon2, Merkle tree)
contracts/stellar/    placeholder from the initial scaffold (Stellar work lives in spp/)
prover/               zkross-prover: circuit inputs and proofs (Rust, on SPP's SDK)
services/             root poster, refund attester (relayer and prover scaffolds exist)
scripts/              Phase 0 helpers, Poseidon2 generators, deployment and end-to-end scripts
apps/frontend/        web app (frontend developer)
PLAN.md               full build plan
SPEC.md               formats and test vectors
VERSIONS.md           pinned versions, including the SPP commit
deployments.json      deployed addresses
```

## References

- SPP: https://github.com/NethermindEth/stellar-private-payments (see `docs/src/global_view_key.md`, `docs/src/operator/`, `DEPLOY.md`, `contracts/pool-gvk`, `contracts/pool-core`, `circuits/src`)
- Notes on SPP's encodings: `docs/spp-encoding-notes.md`
- Stellar privacy and ZK guide: https://github.com/stellar/ecosystem-resources/tree/main/privacy-zk
- ProofBridge docs: https://docs.pfbridge.xyz
- Shared build plan: https://claude.ai/artifact/HbJsqp5BKsfY5ZDXPQtBMT
