# ZKross: context for Claude Code

This file gives Claude Code the context from our planning discussion. The full build plan is in `docs/PLAN.md`; read it before making design decisions.

## The project

ZKross is a testnet demo of a **private bridge between Stellar and Ethereum (Sepolia)** using zero-knowledge proofs written in **Noir**, inspired by **ProofBridge**.

- The public sees only commitments, nullifiers and ciphertexts. Amounts, owners and the link between a deposit on one chain and a withdrawal on the other stay hidden.
- An **admin** can decrypt everything: every circuit *forces* a correct encryption of the note data to the admin's public key.
- Everything runs on **testnet only** (Stellar testnet + Ethereum Sepolia), with our own test token **tUSDC**.

What we take from ProofBridge: a Poseidon2 log of bridge messages on each chain, proofs verified on both chains, nothing minted (liquidity is pre-funded). What we add: a shielded pool on each chain, hidden amounts, enforced admin visibility. Note: ProofBridge itself is **not** private (amounts and recipients are public); it only uses ZK for succinct verification.

## Team split

| Person | Role | Owns |
| --- | --- | --- |
| Person 1 | ZK & cryptography | `SPEC.md`, Noir circuits, Groth16 keys, a small TypeScript crypto library (notes, encryption, proving) |
| **Emin (Person 2)** | **Smart contracts & bridge** | Soroban contracts, Solidity contracts, vaults, bridge messages, root poster, relayer, indexer, refunds/deadlines |
| Person 3 | Frontend, admin & integration | React app, wallets, Deposit/Bridge/Claim/Withdraw screens, admin dashboard, demo |

Phase 0 (a hello-world proof verified on both chains) is a joint task for Person 1 and Emin, on day one.

## Emin's scope (this branch)

1. **Soroban pool contract**: deposit, withdraw, bridge_out, bridge_in, post_remote_root, finalize, refund. Incremental Merkle tree (depth 20, last 30 roots kept), nullifier and claim-nullifier sets, outbox tree of bridge messages `C`.
2. **Solidity pool contract** (`ShieldedPool.sol`) mirroring the Soroban one function for function, plus `MockUSDC` (tUSDC, 6 decimals).
3. **Liquidity vault** on each chain (Mode A). In Mode B, liquidity sits inside the pool instead.
4. **Groth16 verifier contracts** on both chains (one per circuit).
5. **Off-chain services** in TypeScript: indexer (events → SQLite → Merkle paths API), root poster, relayer, refund attester.
6. **Deliverable:** an end-to-end testnet transfer, Stellar → Ethereum and back, with pre-funded liquidity on both chains.

Until Person 1's real verification keys exist, use a mock verifier that accepts everything, so contract work isn't blocked. Replace it before any integration test.

## Key decisions (do not change without the team)

- **Proof system: Noir circuits proved with Groth16, on both chains.** Use the Noir-Groth16 backend (github.com/jamesbachini/Noir-Groth16) to turn Noir circuits into Groth16 artifacts, `snarkjs` to prove, a Soroban Groth16 verifier built on the BN254 host functions, and a `snarkjs`-exported Solidity verifier on Sepolia. Same keys and same proof format on both chains.
- **Hash: Poseidon2 everywhere**, with identical parameters in Noir, Soroban and Solidity. Every hash takes a domain tag as its first input.
- **Tree:** fixed-depth incremental Merkle tree, depth 20.
- **Amounts:** Mode A (fixed denominations 10 / 100 / 1,000 tUSDC) first, then Mode B (hidden amounts, 2-in-2-out join-split `transact` circuit). Contracts keep a `mode` setting.
- **Trust assumptions accepted for testnet:** an admin-run root poster, a single admin key, one relayer, admin-signed refund attestations.
- **Bridge messages:** `C = H(TAG_BRIDGE, amount, asset_id, src_chain, dst_chain, recipient_owner_pk, claim_secret, deadline)`. The claim nullifier is `H(TAG_CLAIM, claim_secret)`, never a hash of `C`, so claims can't be linked across chains. Every `C` has a deadline; unclaimed messages are refunded.

## Critical gotchas (corrections we found)

- **Never use the UltraHonk verifiers on Stellar** (`NethermindEth/rs-soroban-ultrahonk`, `indextree/ultrahonk_soroban_contract`). As of October 2026 they accept only **non-zero-knowledge** proofs, which give no witness-hiding guarantee: private inputs (amounts, spent notes, spending keys) could leak from the proof. Stellar's own privacy guide says to use Groth16 for hidden inputs. Their Tornado demos are explicitly "demo only" for this reason.
- **Do not use `bb` (Barretenberg) verifiers or `bb gates`.** They are for UltraHonk; we use Groth16.
- **Stellar's Poseidon host functions are permutations, not full hashes.** Use `stellar/rs-soroban-poseidon` (enable `soroban-sdk` feature `hazmat-crypto`) so the Soroban hash matches Noir's Poseidon2. Check against the shared test vectors in `SPEC.md`.
- **Soroban storage expires.** Extend the TTL of nullifiers and roots on every write, and test archival behaviour.
- **Simulate every Soroban call** and check CPU, memory and size against network limits.
- **Stellar recipients** need an existing account with a tUSDC trustline; for the demo, pre-create recipient accounts or have the relayer sponsor them.
- **Soroban RPC keeps only recent events**: the indexer must run continuously, with a backfill script.
- **Mode B range checks:** every amount must be below 2^64 and the two input nullifiers in one transaction must differ. A missing check lets someone create money from nothing.
- **Encoding:** convert Stellar and Ethereum addresses, chain IDs and deadline buckets to field elements exactly as `SPEC.md` says, identically on both chains. Mismatches here are the most likely cross-chain bug.
- The Noir-Groth16 backend is a young one-person project. Pin the Noir (`nargo`) version it supports, record everything in `VERSIONS.md`, and never upgrade mid-project.

## Repository layout

```
circuits/            Noir circuits (Person 1)
contracts/stellar/   Soroban contracts (Emin)
contracts/evm/       Foundry project (Emin)
services/            indexer, root poster, relayer, refund attester (Emin)
app/                 React app and admin dashboard (Person 3)
scripts/             deployment and end-to-end scripts
SPEC.md              shared crypto spec: tags, field order, encodings, test vectors
VERSIONS.md          pinned tool versions
deployments.json     deployed addresses, read by services and app
docs/PLAN.md         full build plan
```

## Useful references

- Stellar privacy and ZK guide: https://github.com/stellar/ecosystem-resources/tree/main/privacy-zk
- Stellar Private Payments (Nethermind, Circom + Groth16 shielded pool on Soroban; reference for contract structure and its Groth16 verifier): https://github.com/NethermindEth/stellar-private-payments
- rs-soroban-poseidon: https://github.com/stellar/rs-soroban-poseidon
- Noir-Groth16 backend: https://github.com/jamesbachini/Noir-Groth16
- ProofBridge docs: https://docs.pfbridge.xyz
- Shared build plan doc: https://claude.ai/artifact/HbJsqp5BKsfY5ZDXPQtBMT
