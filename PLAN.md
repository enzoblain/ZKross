# Private Stellar ↔ Ethereum ZK Bridge: Build Plan

Exported from the shared build plan doc on 25 October 2026: https://claude.ai/artifact/HbJsqp5BKsfY5ZDXPQtBMT (the architecture diagram is only in the doc).

## Overview

We will build a testnet demo where test USDC moves privately between Stellar testnet and Ethereum Sepolia: the public sees only commitments and nullifiers, while an admin key decrypts every transaction. It reuses ProofBridge's core ideas (a Poseidon2 log of bridge messages, Noir proofs verified on both chains, nothing minted) and adds a shielded pool on each chain.

The design below already includes the fixes from our discussion:

- **Shielded pool per chain.** Funds live as notes in a Merkle tree; spending reveals only a nullifier.
- **Two amount modes.** Mode A uses fixed denominations (10, 100, 1,000 tUSDC); Mode B hides arbitrary amounts. Build Mode A first; Mode B extends it (see Amount modes below).
- **Shared liquidity vault per chain** instead of per-trade Makers. Bridge-in pays from the destination vault, bridge-out adds to the source vault. No counterparty learns your amount or timing.
- **Deadline and refund path.** Every bridge message carries a deadline. If it isn't claimed in time (for example, the destination vault was empty), the sender gets refunded, so funds are never lost.
- **Enforced admin visibility.** Every circuit proves that a ciphertext of the note's contents was correctly encrypted to the admin's public key.
- **Trusted root poster.** An admin-run service copies each chain's outbox root to the other chain. This is an accepted trust assumption for testnet.
- **One relayer** submits transactions so fresh addresses don't need gas.

Architecture: the user's browser (wallets, notes, Noir prover) sends transactions to a shielded pool, verifiers and vault on each chain; a root poster copies outbox roots between the chains; a relayer submits on both chains; an indexer serves events and Merkle paths; the admin dashboard decrypts every note. Proofs are made in the browser and checked on-chain; the off-chain services can stall the system but cannot move funds.

**In scope:** deposit, withdraw, bridge in both directions, refunds, admin dashboard, web app, testnet deployment.

**Out of scope:** audits, mainnet, ZK light clients, private transfers inside a pool (stretch goal), multiple relayers, threshold admin key (stretch goal).

## Key design decisions

Lock these before writing code; changing them later means redoing circuits and contracts.

| Decision | Recommendation | Alternative |
| --- | --- | --- |
| Second chain | Ethereum Sepolia | Solana devnet (needs Sunspot and Groth16, more work) |
| Proof system | Noir circuits proved with Groth16 (Noir-Groth16 backend), on both chains | Fork Stellar Private Payments (Circom + Groth16) for Stellar; Noir + UltraHonk only once Stellar's verifier supports zero-knowledge proofs |
| Hash | Poseidon2, identical parameters in Noir, Soroban (via rs-soroban-poseidon) and Solidity | None; this must match everywhere |
| Tree | Fixed-depth incremental Merkle tree, depth 20 (~1M leaves) | Merkle Mountain Range like ProofBridge (more complex circuits) |
| Amounts | Both: Mode A (fixed denominations: 10, 100, 1,000 tUSDC) first, then Mode B (hidden amounts) | Mode B only (skips the simpler build that de-risks Soroban limits) |
| Token | Our own test token: a Stellar asset (SAC) and a mock ERC-20, both "tUSDC" | Circle's testnet USDC (faucet limits slow testing) |
| Liquidity | Shared vault per chain, seeded by us | Per-trade Makers like ProofBridge |
| Admin key | Single Grumpkin key for MVP | 2-of-3 threshold key (stretch) |
| Root trust | Admin-run root poster | Multisig of posters, ZK light client (out of scope) |
| Proving | In the browser (noir_js for the witness, snarkjs for the Groth16 proof) | Server-side prover for tests only (it would see secrets) |
| Refund proof | Admin-signed attestation after the deadline | Sparse Merkle tree non-membership proof (stretch) |

**Why Groth16 and not UltraHonk.** Stellar's Noir (UltraHonk) verifier currently accepts only non-zero-knowledge proofs, which give no witness-hiding guarantee: private inputs such as amounts, spent notes and even spending keys could be recovered from a proof. Stellar's own privacy guide says not to use it for privacy-sensitive circuits until zero-knowledge verification ships, and to use Groth16 for hidden inputs. Groth16 is zero-knowledge, cheap to verify with Stellar's BN254 host functions, and the Noir-Groth16 backend lets us keep writing circuits in Noir. Using Groth16 on Ethereum too means one proving pipeline and identical proofs on both chains. Sources: [Stellar privacy and ZK guide](https://github.com/stellar/ecosystem-resources/tree/main/privacy-zk), [Nethermind UltraHonk verifier](https://github.com/NethermindEth/rs-soroban-ultrahonk), [Noir-Groth16 backend](https://github.com/jamesbachini/Noir-Groth16).

## Amount modes: fixed denominations vs hidden amounts

Build both, in order: Mode A gives a working bridge with the smallest circuits, and Mode B reuses its spec, contracts and services while replacing the spend circuits. Ship Mode A to testnet before starting Mode B.

| | Mode A: fixed denominations | Mode B: hidden amounts |
| --- | --- | --- |
| What users can move | Only 10, 100 or 1,000 tUSDC per note | Any amount |
| Amount visible to the public | Yes, but every note of a size looks the same | No, except at deposit and withdrawal |
| Spend circuit | 1 note in, 0 notes out | 2 notes in, 2 notes out (join-split) |
| Range checks | Not needed | Required on every amount |
| Liquidity | Separate vault pays out each denomination | Held inside the pool as unowned balance |
| Private transfers in the pool | Not needed | Built in (same circuit) |
| Circuit size and proving time | Smallest | About 2–3 times larger |
| Extra build time | — | About 3–5 days |

### How Mode B works

**One join-split circuit, `transact`.** It spends up to two notes and creates up to two new ones, with a signed public amount. A deposit has a positive public amount, a withdrawal a negative one, and a private transfer zero. The circuit enforces:

- Value balance: `sum(inputs) + public_in = sum(outputs) + public_out + fee`.
- Every amount is below 2^64. Without this, an attacker can use field wraparound (a "negative" note) to create money from nothing. This is the most important check in Mode B.
- Each real input is in the tree, owned by the prover, with a correct nullifier. Zero-value dummy inputs skip the Merkle check so you can spend one note at a time.
- Every output note and the public amount are encrypted to the admin key, as in Mode A.

**Hidden-amount bridging.** `bridge_out` becomes a join-split whose outputs are a change note plus the bridge message `C`, so the bridged amount stays inside `C` and never appears on-chain. `bridge_in` creates a note of that same hidden amount on the destination chain. No tokens move publicly during a bridge, so no amount leaks.

**Liquidity and solvency.** Because tokens don't move at bridge time, each pool must hold extra unowned tokens to back incoming notes. We seed both pools with liquidity through a public `add_liquidity` call. Bridged value builds up on the source chain and drains on the destination. On testnet, the admin reads totals from the dashboard and rebalances between chains by hand. The pool can never pay out more tokens than it holds, so a shortfall stalls withdrawals rather than losing funds.

**Refunds** work as in Mode A: after the deadline, the sender gets back a note with the same hidden amount.

**What still leaks in Mode B:** deposit and withdrawal amounts are public because tokens move in or out. Tell users to deposit round amounts, then split and merge inside the pool, and withdraw amounts that don't match any deposit. (Testnet option: since we issue tUSDC ourselves, the admin can mint it directly into the pool as shielded notes, so there is no public deposit amount at all; users who stay inside the pools keep every amount hidden.)

### How Mode A fits in

Mode A is a restricted version of the same design: one input note, fixed public amounts, and a vault that pays out exact denominations. The contracts keep a `mode` setting, so one deployment can run either. Mode A's circuits stay as a fallback if Mode B's circuits prove too slowly or hit backend limits.

## Phase 0: Environment and toolchain

Goal: prove a trivial Noir proof verifies on both chains before writing any real logic. This phase catches most toolchain problems early.

1. Create a monorepo:
   - `circuits/` (Noir), `contracts/stellar/` (Rust/Soroban), `contracts/evm/` (Foundry), `services/` (TypeScript), `app/` (React), `scripts/`.
2. Install and pin versions in a `VERSIONS.md`:
   - Rust with the Soroban wasm target, `stellar` CLI, `soroban-sdk`.
   - `nargo` (via `noirup`) at the exact version the Noir-Groth16 backend supports, the backend itself, and `snarkjs`. Check the backend's README first; this is the most likely source of breakage.
   - Foundry (`forge`, `anvil`), Node 20+, `@noir-lang/noir_js`, `snarkjs`, `@stellar/stellar-sdk`, `viem`.
3. Create testnet accounts:
   - Stellar: `stellar keys generate` for deployer, root poster, relayer; fund each with Friendbot.
   - Sepolia: three EOAs funded from a faucet.
4. Smoke test (hard gate before Phase 1):
   - Hello-world Noir circuit → Groth16 artifacts with the Noir-Groth16 backend (a single-party trusted setup is fine on testnet) → proof with `snarkjs`.
   - Verify it in the backend's Soroban Groth16 verifier, built on the BN254 host functions (unit test, then a real testnet invoke).
   - Export a Solidity Groth16 verifier from the same artifacts with `snarkjs`, verify the same proof on `anvil`, then on Sepolia.
   - Simulate the Soroban verify call and record CPU instructions, memory and fee against the network limits.

- [ ] Monorepo and pinned versions
- [ ] Funded testnet accounts on both chains
- [ ] Hello-world proof verified on Stellar testnet
- [ ] Hello-world proof verified on Sepolia
- [ ] Soroban resource numbers recorded, and a check that a secret circuit input can't be recovered from the proof or public inputs

## Phase 1: Shared crypto primitives

Goal: one spec for hashes, notes and encryption that Noir, Soroban, Solidity and TypeScript all implement identically. Write it as `SPEC.md` before coding circuits.

**Poseidon2 everywhere.** Noir's Poseidon2, a Solidity Poseidon2 library, and Stellar's Poseidon2 must produce identical outputs. Stellar's host functions are permutations, not complete hash functions, so on Stellar use the rs-soroban-poseidon library, which builds the hash on top of them. Create shared test vectors (hash of `[1, 2]`, a note commitment, the root of a 4-leaf tree) and check them in all four languages. Every hash takes a domain tag as its first input so values from different purposes can never collide.

**Keys.** Each user has a spending key `sk`, a public owner key `owner_pk = H(TAG_OWNER, sk)`, and a Grumpkin viewing key pair for receiving encrypted notes. The app can derive `sk` deterministically from a wallet signature so users don't manage extra secrets.

**Note.** `commitment = H(TAG_NOTE, amount, asset_id, owner_pk, blinding)`. Its nullifier is `H(TAG_NULL, sk, commitment)`, which only the owner can compute.

**Bridge message.** `C = H(TAG_BRIDGE, amount, asset_id, src_chain, dst_chain, recipient_owner_pk, claim_secret, deadline)`. The claim nullifier is `H(TAG_CLAIM, claim_secret)`, not a hash of `C`, so nobody can link a claim on one chain to its `C` on the other.

**Admin encryption (enforced in every circuit).**

1. Pick a random scalar `r`; publish `R = r·G` on the Grumpkin curve (Noir's native embedded curve).
2. Shared secret `S = r·ADMIN_PK`.
3. Key stream `k_i = H(TAG_ENC, S.x, S.y, i)`; ciphertext `c_i = m_i + k_i` (field addition) for each note field.
4. The circuit proves `R` and every `c_i` were computed this way from the same fields used in the commitment.
5. The admin decrypts with `S = admin_sk·R`, then recomputes the commitment to confirm the plaintext is genuine.

The same scheme, without in-circuit enforcement, encrypts note data to the recipient's viewing key so they can find their notes.

- [ ] `SPEC.md` with every tag, field order and encoding
- [ ] Poseidon2 test vectors passing in Noir, Rust, Solidity and TypeScript
- [ ] Encryption round-trip test in TypeScript and Noir

## Phase 2: Noir circuits

Goal: four Mode A circuits, then three Mode B circuits, each with positive and negative tests. All share a `lib` package implementing `SPEC.md` (hashing, Merkle path check, admin encryption). The same circuits are used on both chains; only the chain IDs passed in differ.

| Circuit | Proves | Public inputs | Private inputs |
| --- | --- | --- | --- |
| `deposit` | Commitment is well formed; admin ciphertext encrypts its fields | commitment, amount, asset_id, `R`, ciphertext | owner_pk, blinding |
| `withdraw` | Note is in the tree, caller owns it, nullifier is correct | pool root, nullifier, amount, asset_id, recipient, relayer, fee, `R`, ciphertext | sk, blinding, leaf index, Merkle path |
| `bridge_out` | Note is in the tree and owned; `C` carries the same amount and asset to the right destination | pool root, nullifier, `C`, deadline bucket, dst_chain, relayer, `R`, ciphertext | sk, note fields, Merkle path, recipient_owner_pk, claim_secret |
| `bridge_in` | `C` is in the source chain's outbox tree; claim nullifier is correct; new note has the same amount and owner | remote outbox root, claim nullifier, new commitment, deadline bucket, src_chain, `R`, ciphertext | all fields of `C`, outbox Merkle path, new blinding |

Notes on the Mode A design:

- `recipient`, `relayer` and `fee` are bound into the `withdraw` proof, so a relayer cannot redirect funds. On testnet the fee is 0.
- The deadline is public but rounded to a bucket (for example, the hour) so it reveals little.
- `bridge_in` is proved by the recipient. The sender gives them `C`'s fields by encrypting them to the recipient's viewing key in the `bridge_out` event.
- A private `transfer` circuit (two notes in, two out) is a stretch goal; with fixed denominations, the demo works without it.

**Mode B circuits** (replace `deposit`, `withdraw` and the spend part of `bridge_out`):

| Circuit | Proves | Public inputs | Private inputs |
| --- | --- | --- | --- |
| `transact` | Up to 2 notes in, 2 out; value balances with the signed public amount; every amount below 2^64 | pool root, 2 nullifiers, 2 output commitments, public amount, recipient, relayer, fee, `R`, ciphertexts | sk, input notes and Merkle paths, output note fields |
| `bridge_out_b` | Same as `transact`, but one output is the bridge message `C` with a hidden amount | pool root, 2 nullifiers, change commitment, `C`, deadline bucket, dst_chain, `R`, ciphertexts | sk, input notes and paths, change note, all fields of `C` |
| `bridge_in_b` | Same as Mode A's `bridge_in`, with the amount kept private | remote outbox root, claim nullifier, new commitment, deadline bucket, src_chain, `R`, ciphertext | all fields of `C`, outbox path, new blinding |

The two nullifiers in one transaction must differ, or a user could spend the same note twice in one proof. Test this explicitly.

Tests per circuit with `nargo test`: a valid case, plus a wrong Merkle path, a wrong secret key, mismatched amounts, a tampered ciphertext and a wrong chain ID, all of which must fail. For Mode B, also an amount of 2^64 or more, a field-wraparound "negative" amount, unbalanced inputs and outputs, and two identical input nullifiers. Record each circuit's constraint count (reported by the Noir-Groth16 backend; proving time grows with it), and run a per-circuit Groth16 setup, committing the proving and verification keys. Do not use `bb gates` here: those are UltraHonk tools.

- [ ] Shared `lib` package
- [ ] `deposit`, `withdraw`, `bridge_out`, `bridge_in` with tests
- [ ] Verification keys generated and committed
- [ ] Constraint counts recorded

## Phase 3: Stellar (Soroban) contracts

Goal: a pool contract, a liquidity vault and four verifier contracts on Stellar testnet, all tested with `soroban-sdk` test utilities before deployment.

**Verifier contracts.** One per circuit, each holding that circuit's verification key. Use the Groth16 verifier contract from the Noir-Groth16 backend (built on Stellar's BN254 pairing host functions), with Stellar Private Payments' Groth16 verifier as a reference. Do not use the UltraHonk verifiers: they accept only non-zero-knowledge proofs.

**Pool contract state:**

- Incremental Merkle tree: the frontier and a ring buffer of the last 30 roots, hashed with rs-soroban-poseidon (Poseidon2 built on the host permutation).
- Nullifier set and claim-nullifier set in persistent storage.
- Outbox tree of `C` values, plus a record of each pending `C` with its amount and deadline bucket.
- Known remote (Ethereum) outbox roots, written only by the root poster.
- Admin public key, root poster address, token address (the tUSDC asset contract), allowed denominations.

**Pool contract functions:**

1. `deposit(from, amount, commitment, R, ciphertext, recipient_ct, proof)`: requires `from`'s authorization, pulls tokens, verifies, inserts the leaf, emits an event.
2. `withdraw(proof, root, nullifier, recipient, relayer, fee, amount, R, ciphertext)`: checks the root is recent and the nullifier unused, verifies, marks the nullifier, pays out.
3. `bridge_out(proof, root, nullifier, C, deadline_bucket, R, ciphertext, recipient_ct)`: verifies, marks the nullifier, moves the amount into bridge escrow, appends `C` to the outbox tree.
4. `bridge_in(proof, remote_root, claim_nullifier, new_commitment, deadline_bucket, R, ciphertext)`: checks the remote root is known and the deadline not passed, verifies, takes the amount from the vault, inserts the new note.
5. `post_remote_root(root)`: root poster only.
6. `finalize(C)` and `refund(C, attestation)`: after the deadline, the admin attests whether `C` was claimed on Ethereum; escrow then goes to the vault, or back to the sender as a new note.

**Liquidity vault:** public `add_liquidity` and `remove_liquidity` for us as the seeding party; only the pool can draw from it.

**Stellar-specific gotchas:**

- Persistent storage entries expire unless their TTL is extended. Extend the TTL of nullifiers and roots on every write, and test what happens when an entry is archived.
- Watch per-transaction CPU, memory and size limits; simulate every call.
- Recipients of a public withdrawal need an existing account with a tUSDC trustline. For the demo, pre-create recipient accounts or have the relayer sponsor them.

**Mode B changes (Stellar):**

- Add a `transact(proof, root, nullifiers[2], commitments[2], public_amount, recipient, relayer, fee, R, ciphertexts)` function. A positive public amount pulls tokens in; a negative one pays out.
- Replace `bridge_out` and `bridge_in` with the Mode B versions; the contract never sees bridged amounts.
- Drop the vault: liquidity sits in the pool, added through a public `add_liquidity` (admin only on testnet). Withdrawals fail cleanly if the pool's token balance is too low.
- Insert two leaves per transaction, and check both nullifiers are unused and different.

- [ ] Verifiers deployed and passing tests
- [ ] Pool contract with unit tests for every function and failure case
- [ ] Vault contract
- [ ] Deployed to testnet with addresses recorded

## Phase 4: Ethereum (Solidity) contracts

Goal: the same pool, vault and verifiers on Sepolia, mirroring the Stellar contracts function for function, so both sides behave identically.

1. Export one Solidity Groth16 verifier per circuit with snarkjs, from the same keys used on Stellar. Do not use `bb` for this: its verifier is for UltraHonk proofs, and one proof format on both chains keeps things simple.
2. Write `MockUSDC` (an ERC-20 called tUSDC, 6 decimals to match).
3. Write `ShieldedPool.sol` with the same state and functions as the Soroban pool: `deposit`, `withdraw`, `bridgeOut`, `bridgeIn`, `postRemoteRoot`, `finalize`, `refund`. Use a Solidity Poseidon2 library that passes the Phase 1 test vectors for the incremental tree.
4. Write `LiquidityVault.sol`.
5. Test with Foundry: every function and failure case, plus a gas report. On-chain Poseidon2 hashing is the main gas cost; Groth16 verification itself is cheap. Neither matters on Sepolia.
6. Deploy with a Foundry script and record addresses in a shared `deployments.json` that the services and app read.

A mismatch between the two pools is the most likely source of cross-chain bugs. Keep one shared list of field orders and encodings (addresses, chain IDs, deadline buckets) in `SPEC.md`, and convert Stellar addresses and Ethereum addresses to field elements the same way on both sides.

For Mode B, make the same changes as on Stellar: add `transact`, swap in the Mode B bridge functions and verifiers, and hold liquidity inside the pool instead of a vault.

- [ ] Verifiers generated and tested on `anvil`
- [ ] Pool and vault contracts with full Foundry tests
- [ ] Deployed to Sepolia; `deployments.json` updated

## Phase 5: Off-chain services

Goal: four small TypeScript services that keep the system moving. None of them can steal funds; at worst they stall it.

**Indexer.** Watches events on both chains (Soroban RPC `getEvents`, `viem` event watchers), stores commitments, ciphertexts, `C` values and roots in SQLite, and rebuilds each Merkle tree locally so clients can fetch Merkle paths. Run it continuously: Soroban RPC only keeps recent events, so a stopped indexer can miss history.

**Root poster.** Every few minutes, reads each chain's latest outbox root and calls `post_remote_root` / `postRemoteRoot` on the other chain. Wait for Sepolia finality before posting an Ethereum root. It holds its own key, separate from the deployer key.

**Relayer.** An HTTP endpoint that accepts a proof and its public inputs, simulates the call, and submits it from its own funded account on Stellar or Sepolia. This is what lets withdrawals go to fresh addresses with no funds.

**Refund attester.** After each deadline bucket, checks whether each pending `C` was claimed on the other chain and signs the attestation that `finalize` or `refund` needs.

**Admin dashboard.** A local web page that loads the admin secret key (never uploaded), pulls every ciphertext from the indexer, decrypts it, recomputes each commitment to confirm the plaintext, and shows the full path of each fund flow: deposit → bridge-out → bridge-in → withdraw, with amounts and owners. Flag any ciphertext that fails to decrypt or doesn't match its commitment; that would mean a circuit bug.

- [ ] Indexer with Merkle path API
- [ ] Root poster running against both testnets
- [ ] Relayer for both chains
- [ ] Refund attester
- [ ] Admin dashboard

## Phase 6: Frontend and wallets

Goal: a React app where a user can deposit, bridge, claim and withdraw, with all proofs generated in their browser so secrets never leave the device.

1. Set up React + Vite. Connect Stellar wallets with Stellar Wallets Kit (Freighter) and Ethereum wallets with wagmi/RainbowKit (MetaMask).
2. Shielded account: derive `sk` from a wallet signature over a fixed message, plus a Grumpkin viewing key pair. Store notes in IndexedDB and rescan the indexer on load.
3. Proving: compute the witness with `noir_js`, then generate the Groth16 proof with `snarkjs`, both in a Web Worker. Show a progress indicator; expect seconds to tens of seconds per proof.
4. Screens:
   - **Deposit:** pick a chain and denomination, approve the token, deposit.
   - **Balance:** shielded notes per chain.
   - **Bridge:** pick a note and a destination; status tracker showing burned → root posted → claimed (or refunded).
   - **Claim:** detects incoming bridge messages via the viewing key and builds the `bridge_in` proof.
   - **Withdraw:** enter a fresh address; submitted through the relayer.
5. Show a short "privacy tips" panel: wait before withdrawing, and use a fresh address.

**Mode B frontend changes:** a free amount field instead of denomination buttons; automatic note selection (pick up to two notes, return change); a "merge notes" action for wallets with many small notes; and a warning when a withdrawal amount exactly matches one of the user's own deposits.

- [ ] Wallet connections on both chains
- [ ] Shielded key derivation and local note store
- [ ] In-browser proving in a Web Worker
- [ ] All five screens working against testnet

## Phase 7: Testing and testnet deployment

Goal: every layer tested in isolation, then the full flow run end to end on both testnets by a script.

**Test layers, bottom up:**

1. Circuit tests (`nargo test`).
2. Cross-language test vectors (Poseidon2, commitments, encryption).
3. Contract unit tests (Soroban test utilities, Foundry).
4. Local end-to-end: Soroban tests and `anvil`, with the root poster mocked.
5. Testnet end-to-end script: deposit → bridge-out → root posted → bridge-in → withdraw, in both directions.

**Must-fail cases:** spending a note twice, claiming a bridge message twice, a tampered admin ciphertext, an unknown or stale root, claiming after the deadline, refunding a message that was already claimed, a relayer changing the recipient.

**Mode B must-fail cases:** an amount of 2^64 or more, a wraparound "negative" output, outputs worth more than inputs, two identical nullifiers in one transaction, and a withdrawal larger than the pool's token balance. Also run a test that bridges many random amounts back and forth and checks that the admin's decrypted totals match each pool's token balance.

**Deployment order:**

1. tUSDC on both chains.
2. Verifiers.
3. Vaults and pools; set the admin public key, root poster, relayer and remote chain IDs.
4. Seed both vaults with liquidity.
5. Start the indexer, root poster, relayer and refund attester.
6. Deploy the frontend.
7. Run a script that makes ~50 dummy deposits so the demo has a visible crowd to hide in.

- [ ] All test layers passing in CI
- [ ] End-to-end script passing in both directions on testnet
- [ ] Dummy deposits seeded

## Phase 8: Demo and presentation

Goal: show in about five minutes that outsiders can't follow the money while the admin can.

**Demo script:**

1. Open the Stellar testnet explorer and Sepolia Etherscan side by side.
2. Deposit 100 tUSDC on Stellar. On the explorer, only a commitment and a ciphertext appear.
3. Bridge it to Ethereum. The explorer shows a nullifier and a `C`, with no amount or recipient.
4. Claim on Ethereum. Show there's nothing linking this claim to the Stellar transaction.
5. Withdraw to a fresh Ethereum address through the relayer.
6. Open the admin dashboard: it reconstructs the whole path, from depositor to final address.

**Slides to include:**

- Architecture diagram and what each proof checks.
- What's hidden from the public vs what the admin sees.
- Known leaks and how mainnet would handle them: public entry and exit, timing, amounts (handled by denominations), the relayer seeing IPs, the small anonymity set, the trusted root poster, the single admin key.
- What we took from ProofBridge and what we added.

## Risks, open questions and timeline

The biggest risk is the Noir-Groth16 backend, a young one-person project; Phase 0 tests it end to end on both chains on day one.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Noir-Groth16 backend can't compile a circuit or has a bug | That circuit can't be proved | Keep circuits simple; test the backend in Phase 0; port that circuit to Circom, using Stellar Private Payments' circuits as a model |
| Noir / Groth16 backend / snarkjs version mismatch | Proofs fail to verify | Pin versions in Phase 0 and never upgrade mid-project |
| Poseidon2 mismatch across languages | Roots and commitments disagree between chains | Shared test vectors in CI |
| Admin encryption bug | Admin can't decrypt some transactions | Dashboard recomputes every commitment and flags mismatches |
| Soroban storage expiry | Nullifiers or roots become unavailable | Extend TTLs on write; test archival |
| Indexer misses events | Users can't build Merkle paths | Run continuously; add a backfill script |
| Root poster down | Bridges stall (funds stay safe) | Restart alerts; refunds after the deadline |

Mode B adds one serious risk: a missing or wrong range check lets someone create money from nothing. Mitigate it with the must-fail tests above, a second person reviewing every amount constraint, and the dashboard's check that decrypted totals match on-chain balances. Mode B's larger circuits also mean slower proving in the browser and more strain on the young backend; Mode A stays as the fallback.

**Open questions for the team:**

- Does the assignment require Solana, or is Ethereum acceptable?
- Who holds the admin key, and is a threshold key expected?
- Is Mode A enough for the assignment, or is Mode B (hidden amounts) required for the demo?

**Estimated timeline:**

1. Phase 0, toolchain and smoke tests: 1–2 days.
2. Phases 1–2, spec and circuits: 2–3 days.
3. Phases 3–4, contracts on both chains: 2–3 days.
4. Phases 5–6, services and frontend: 2–3 days.
5. Phases 7–8, testnet end-to-end and demo: 2–3 days.

Total: about 1.5–2.5 weeks of calendar time for Mode A, plus about 3–5 days to add Mode B (circuits, contract changes, frontend and extra tests). These are estimates; Phase 0's results with the Groth16 backend will make them firmer.

## Team split

| Person | Role | Owns |
| --- | --- | --- |
| Person 1 | ZK & cryptography | `SPEC.md`, the four Mode A circuits (then Mode B), Groth16 keys, a TypeScript crypto library (create notes, encrypt/decrypt, generate proofs), the "known leaks" slide |
| Person 2 (Emin) | Smart contracts & bridge | Soroban and Solidity pools, vaults, verifiers, bridge messages, deadlines and refunds, root poster, relayer, indexer |
| Person 3 | Frontend, admin & integration | React app, wallets, Deposit / Bridge / Claim / Withdraw screens, admin dashboard (using Person 1's library), presentation and demo |

Order of work: Phase 0 and `SPEC.md` (everyone, Persons 1 and 2 leading) → circuits and contracts in parallel (contracts start with a mock verifier, the app with a mock library) → integration days → Mode B if time allows → demo.
