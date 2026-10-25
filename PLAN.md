# Private Stellar ↔ Ethereum ZK Bridge: Build Plan

Exported from the shared build plan doc on 25 October 2026: https://claude.ai/artifact/HbJsqp5BKsfY5ZDXPQtBMT (the architecture diagram is only in the doc and PDF).

## Overview

We will build a testnet demo where test USDC moves privately between Stellar testnet and Ethereum Sepolia: the public sees only commitments, nullifiers and ciphertexts, while an admin key decrypts every transaction. We build on **Stellar Private Payments (SPP)**, Nethermind's open-source shielded pool for Stellar (Circom circuits, Groth16 proofs, Soroban contracts), and add what it doesn't have: an Ethereum pool and a private bridge between the two chains, inspired by ProofBridge.

What SPP already gives us, and what we add:

- **Shielded pool with hidden amounts (from SPP).** Funds live as notes in a Merkle tree, and a 2-in-2-out transaction circuit hides amounts, senders and receivers. Deposits and withdrawals stay public.
- **Enforced admin visibility (from SPP's Global View Key).** Every transaction proves inside the circuit that each note is encrypted to the admin's key. In traceable mode, spent notes are encrypted too, so the admin can follow funds across hops. SPP's admin page already decrypts and exports them.
- **Ethereum pool (we add).** The same circuits and proving keys, a Solidity port of SPP's pool, and a Groth16 verifier exported with snarkjs.
- **Private bridge (we add).** Two new circuits, bridge-out and bridge-in, move a note's hidden value from one chain's pool to the other's, using a Poseidon2 log of bridge messages like ProofBridge, but private. Nothing is minted: each pool holds liquidity we seed.
- **Deadline and refund path (we add).** Bridge messages not claimed before their deadline are refunded, so funds are never lost.
- **Trusted root poster and one relayer (we add).** An admin-run service copies each chain's bridge-outbox root to the other chain, and a relayer submits transactions so fresh addresses don't need gas. Both are accepted trust assumptions for testnet.

Architecture: the user's browser (wallets, notes, Groth16 prover) sends transactions to a shielded pool with its verifiers and liquidity on each chain; a root poster copies outbox roots between the chains; a relayer submits on both chains; an indexer serves events and Merkle paths; the admin dashboard decrypts every note. Proofs are made in the browser and checked on-chain; the off-chain services can stall the system but cannot move funds.

**In scope:** deposit, private transfer and withdraw on both chains, bridge in both directions, refunds, admin view on both chains, web app, testnet deployment.

**Out of scope:** audits, mainnet, ZK light clients, ASP allowlists and blocklists (SPP supports them; we run its open policy), multiple relayers, threshold admin key (stretch goal).

## Key design decisions

Lock these before writing code; changing them later means redoing circuits and contracts.

| Decision | Recommendation | Alternative |
| --- | --- | --- |
| Base | Fork Stellar Private Payments (SPP, Apache 2.0) | Write our own pool in Noir (about twice the work) |
| Second chain | Ethereum Sepolia | Solana devnet (more work) |
| Circuits and proofs | SPP's Circom circuits with Groth16 on BN254; the same circuits and keys on both chains | Noir with the Noir-Groth16 backend |
| Pool policy | Open policy with a traceable Global View Key (SPP's `policy_tx_2_2_gvk_T` circuit) | Add ASP allowlists or blocklists later (SPP supports them) |
| Hash | SPP's Poseidon2, plus a Solidity Poseidon2 that matches it exactly | None; this must match everywhere |
| Tree | SPP's Merkle tree with root history | — |
| Amounts | Hidden, using SPP's 2-in-2-out join-split | Fixed denominations (not needed with SPP) |
| Token | **Circle's testnet USDC on both chains** (Sepolia ERC-20 `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`, 6 decimals; Stellar `USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` through its Stellar Asset Contract, 7 decimals). Amounts convert between 7 and 6 decimals as `SPEC.md` defines. The faucet gives 20 USDC per 2 hours per address and chain, so liquidity and demo amounts stay at single-digit USDC. | Our own test token (decided against) |
| Liquidity | Extra unowned balance in each pool, seeded by us | Per-trade makers like ProofBridge |
| Admin key | One Baby JubJub Global View Key per pool (the same key can serve both chains) | 2-of-3 threshold key (stretch) |
| Root trust | Admin-run root poster | Multisig of posters, ZK light client (out of scope) |
| Proving | In the browser with SPP's web SDK and prover worker | Server-side prover for tests only (it would see secrets) |
| Refund proof | Admin-signed attestation after the deadline | Sparse Merkle tree non-membership proof (stretch) |

**Why SPP.** Noir isn't required, and SPP already solves the hardest parts: hidden amounts, admin encryption enforced inside the circuit (its Global View Key), browser proving, an indexer and an admin page, all running on Stellar testnet with zero-knowledge Groth16 proofs. Building on it is about half the work of writing our own pool in Noir, and it avoids the Noir risks on Stellar today: Stellar's UltraHonk verifier doesn't hide private inputs, and the Noir-to-Groth16 path is a young one-person project. Our original work is the Ethereum pool and the private bridge. SPP is an unaudited work-in-progress reference implementation, which is fine for a testnet demo. We credit it and keep its licenses: Apache 2.0 for most code, GPLv3 for its circuit compiler tool, and LGPLv3 for compiled circuits, so the published app must include those license notices. Sources: [SPP repository](https://github.com/NethermindEth/stellar-private-payments), [SPP Global View Key docs](https://github.com/NethermindEth/stellar-private-payments/blob/main/docs/src/global_view_key.md), [Stellar privacy and ZK guide](https://github.com/stellar/ecosystem-resources/tree/main/privacy-zk).

## What we reuse from SPP and what we build

We reuse SPP's pool, circuits and tooling unchanged where possible, and spend our effort on the Ethereum side and the bridge.

| Part | Reused from SPP | We build |
| --- | --- | --- |
| Pool circuit | `policy_tx_2_2_gvk_T`: 2 notes in, 2 out, hidden amounts, traceable Global View Key | — |
| Bridge circuits | Its templates: transaction core, Merkle proof, Global View Key encryption, Poseidon2 | `bridge_out` and `bridge_in` |
| Stellar contracts | `pool-gvk`, `pool-core`, the Circom Groth16 verifier, the public key registry | Bridge functions, an outbox tree, liquidity accounting |
| Ethereum contracts | — | A Solidity port of `pool-gvk` plus the bridge functions, a matching Poseidon2 and Merkle tree, verifiers exported with snarkjs |
| SDK, prover, indexer | Rust and web SDKs, prover worker, indexer, bootnode (Stellar event history) | Ethereum support and the bridge flows |
| Admin view | Admin page with a Global View tab that decrypts and exports notes (Stellar) | The same view for Ethereum, and linking each bridge-out to its bridge-in |
| App | Demo app: deposit, transfer, withdraw, Freighter, encrypted local storage | Bridge and claim screens, Ethereum wallet |

### How the bridge works on top of SPP

- **Bridge-out.** A new circuit, built from SPP's transaction template, spends up to two notes in the source pool with the same checks as SPP (ownership, nullifiers, Merkle proofs, amount range checks). Its outputs are a change note plus a bridge message `C = Poseidon2(tag, amount, asset, src_chain, dst_chain, recipient_pk, claim_secret, deadline)`, and it encrypts `C`'s contents to the Global View Key. The bridged amount stays hidden inside `C`.
- **Outbox.** The source pool appends `C` to a separate outbox Merkle tree. The bridged value stays in the source pool and becomes liquidity there.
- **Root posting.** The root poster copies the source outbox root to the destination chain.
- **Bridge-in.** A second new circuit proves `C` is under that posted root, reveals a claim nullifier `H(tag, claim_secret)` that can't be linked to `C`, and creates a new note with the same hidden amount for the recipient, encrypted to the Global View Key. The destination pool backs it with its seeded liquidity.
- **Deadline and refund.** If `C` isn't claimed before its deadline, the sender gets a refund note on the source chain, using an admin-signed attestation that it was never claimed.
- **Solvency.** A pool can never pay out more tokens than it holds, so a shortfall stalls withdrawals rather than losing funds. On testnet, the admin reads the totals in the admin view and rebalances liquidity between chains by hand.

**What still leaks:** deposit and withdrawal amounts and addresses (tokens move in or out publicly), timing between a bridge-out and its bridge-in, the relayer seeing users' IP addresses, and the small number of users on a testnet pool. Users should deposit round amounts, split and merge inside the pool, and wait before withdrawing.

## Phase 0: Environment and toolchain

Goal: run SPP unchanged on Stellar testnet, and verify one of its real proofs on Ethereum, before changing anything. This phase catches most toolchain problems early.

1. Bring SPP into the repo:
   - Fork it, or add it as a git subtree (for example under `spp/`), keeping its LICENSE and NOTICE files. Record the exact SPP commit in `VERSIONS.md` and don't update it mid-project.
2. Install and pin versions in `VERSIONS.md`:
   - Rust (SPP's `rust-toolchain.toml` sets the version), the `stellar` CLI, Node 20+.
   - Circom and snarkjs (SPP's `Makefile` and its circuit compiler tool build the circuits and keys).
   - Foundry (`forge`, `anvil`) for Ethereum.
   - SPP's tooling expects Linux or macOS; on Windows use WSL.
3. Create testnet accounts:
   - Stellar: `stellar keys generate` for deployer, root poster, relayer; fund each with Friendbot.
   - Sepolia: three accounts funded from a faucet.
4. Smoke test on Stellar (hard gate before Phase 1):
   - Build SPP and deploy one open-policy pool in traceable Global View Key mode to testnet, following its `DEPLOY.md`.
   - Run its demo app: deposit, transfer and withdraw USDC.
   - Open its admin page, Global View tab, and decrypt the notes with the admin key.
5. Smoke test on Ethereum:
   - Export a Solidity Groth16 verifier with snarkjs from the same verification key, and verify a real SPP proof on `anvil`, then on Sepolia.
   - Write down exactly how SPP encodes its public inputs (including its external-data hash), since the Solidity pool must match it.
6. Poseidon2 check: find or write a Solidity Poseidon2 that gives exactly the same outputs as SPP's on a few test values. This is the riskiest part of the Ethereum port, so do it now.

- [ ] SPP in the repo, versions pinned
- [ ] Funded testnet accounts on both chains
- [ ] SPP pool (traceable Global View Key) working on Stellar testnet, admin decryption checked
- [ ] A real SPP proof verified on Sepolia
- [ ] Solidity Poseidon2 matching SPP's test values

## Phase 1: Spec for the new parts

Goal: a `SPEC.md` that documents SPP's existing formats and defines only the new bridge formats, so the circuits, the Soroban contracts and the Solidity contracts all agree.

**Reuse SPP's formats as they are.** Keys, note commitments, nullifiers, the Global View Key ciphertext layout and the domain tags `0x01`–`0x06` all come from SPP. `SPEC.md` links to the exact files and lists the field order, so nobody has to dig through SPP's code.

**New formats (new domain tags from `0x07`):**

- **Bridge message:** `C = Poseidon2(TAG_BRIDGE, amount, asset_id, src_chain, dst_chain, recipient_pk, claim_secret, deadline_bucket)`.
- **Claim nullifier:** `Poseidon2(TAG_CLAIM, claim_secret)`, never a hash of `C`, so a claim can't be linked to its `C` on the other chain.
- **Refund note:** the commitment the sender gets back if `C` expires, fixed at bridge-out time and stored with `C`.
- **Deadline bucket:** the deadline rounded (for example, to the hour) so it reveals little.
- **Encodings:** how chain IDs, Stellar addresses and Ethereum addresses become field elements, identically on both chains.
- **Ethereum external-data hash:** how the Solidity pool hashes recipient, relayer, fee and ciphertexts into the proof's public input, mirroring what SPP does on Stellar.
- **Attester key:** the key that signs refund attestations (for example, one secp256k1 key, checkable on both chains).

**Shared test vectors** for Poseidon2, a note commitment, a bridge message and an outbox root, checked in Circom tests, Rust and Solidity.

- [ ] `SPEC.md` with SPP's formats and the new bridge formats
- [ ] Test vectors passing in Circom, Rust and Solidity

## Phase 2: Circuits (Circom)

Goal: two new circuits built from SPP's templates. SPP's pool circuit (`policy_tx_2_2_gvk_T`) is reused unchanged on both chains.

| Circuit | Proves | Public inputs | Private inputs |
| --- | --- | --- | --- |
| `bridge_out` | Up to 2 input notes are in the source pool's tree, owned by the prover, with correct, distinct nullifiers; value balances: inputs = change note + bridged amount; every amount passes SPP's range check; `C` and the refund note are well formed; every note and `C`'s contents are encrypted to the Global View Key | pool root, 2 nullifiers, change commitment, `C`, refund commitment, deadline bucket, dst_chain, Global View Key `D`, nonce, ciphertexts, external-data hash | spending key, input notes and Merkle paths, change note, all fields of `C` |
| `bridge_in` | `C` is under the source chain's outbox root; the claim nullifier comes from `C`'s claim secret; the new note has `C`'s amount, asset and recipient; the new note is encrypted to the Global View Key | remote outbox root, claim nullifier, new commitment, deadline bucket, src_chain, `D`, nonce, ciphertext, external-data hash | all fields of `C`, outbox Merkle path, new blinding |

Notes on the design:

- Reuse SPP's templates (transaction core, Merkle proof, Global View Key encryption, Poseidon2) rather than rewriting them, so the bridge inherits SPP's security fixes, such as the low-order key guard in the encryption.
- `bridge_in` is proved by the recipient. The sender gives them `C`'s fields by encrypting them to the recipient's key in the bridge-out event, the same way SPP delivers notes.
- The contracts must check that `D` equals the pool's stored admin key (the contract supplies `D` from storage). The nonce follows SPP: it is the external-data hash, with no used-nonce set.

Tests, in SPP's circuit test setup: a valid case, plus a wrong Merkle path, a wrong spending key, unbalanced amounts, an amount over SPP's range limit, two identical input nullifiers, a tampered ciphertext and a wrong chain ID, all of which must fail. Generate the Groth16 keys for each new circuit with SPP's tooling; a single-party setup is fine on testnet.

- [ ] `bridge_out` and `bridge_in` with tests
- [ ] Groth16 proving and verification keys generated and committed
- [ ] Admin decryption of bridge notes and `C` checked with SPP's audit code

## Phase 3: Stellar (Soroban) contracts

Goal: extend SPP's `pool-gvk` contract with the bridge, tested with `soroban-sdk` test utilities before deployment. SPP's `transact` (deposit, transfer, withdraw) stays as it is.

**Verifier contracts.** SPP's Circom Groth16 verifier contract, one per circuit, with the verification key built in: SPP's pool circuit plus our `bridge_out` and `bridge_in`.

**New pool state:**

- An outbox Merkle tree of `C` values, reusing SPP's Merkle tree with root history.
- A record of each pending `C` with its deadline bucket and refund commitment.
- A claim-nullifier set.
- Known remote (Ethereum) outbox roots, written only by the root poster.
- Root poster and attester addresses.

**New pool functions:**

1. `bridge_out(proof, …)`: checks the root and nullifiers like `transact`, supplies the stored Global View Key and the external-data hash as nonce, verifies, marks the nullifiers, inserts the change note, appends `C` to the outbox tree, emits an event with the ciphertexts.
2. `bridge_in(proof, …)`: checks the remote root is known, the deadline hasn't passed and the claim nullifier is unused, supplies the stored Global View Key and the external-data hash as nonce, verifies, inserts the new note.
3. `post_remote_root(root)`: root poster only.
4. `finalize(C)` and `refund(C, attestation)`: after the deadline, with the attester's signature saying whether `C` was claimed; a refund inserts the stored refund commitment.
5. `add_liquidity(amount)`: admin only on testnet; adds unowned balance that backs incoming bridge notes.

**Stellar-specific gotchas** (SPP already handles some):

- Persistent storage expires unless its time-to-live is extended; SPP has a helper for this, so use it for every new entry.
- RPC nodes keep events for only about 7 days; SPP's bootnode keeps the history.
- Watch per-transaction CPU, memory and size limits; simulate every call.
- Every Stellar account that receives USDC needs a trustline to Circle's issuer; deployment and end-to-end scripts create them.

- [ ] Verifiers for the bridge circuits deployed and tested
- [ ] Bridge functions with unit tests for every function and failure case
- [ ] Deployed to testnet with addresses recorded

## Phase 4: Ethereum (Solidity) contracts

Goal: a Solidity port of SPP's `pool-gvk` plus the same bridge functions as on Stellar, so both pools behave identically. This is the biggest piece of new work.

1. Export Solidity Groth16 verifiers with snarkjs for SPP's pool circuit and for `bridge_out` and `bridge_in`, from the same keys used on Stellar. These verifiers already reject public inputs that are too large.
2. Write `MockUSDC` (a 6-decimal ERC-20) for local tests only. Deployments use Circle's Sepolia USDC.
3. Write `ShieldedPool.sol`, porting SPP's pool logic function for function: Merkle tree with root history, nullifier set, external-data hash, public amount handling, Global View Key and nonce checks, and events carrying the ciphertexts. Then add `bridgeOut`, `bridgeIn`, `postRemoteRoot`, `finalize`, `refund` and `addLiquidity`.
4. Use the Solidity Poseidon2 validated in Phase 0 for the Merkle trees.
5. Test with Foundry: every function and failure case, plus a gas report. On-chain Poseidon2 hashing is the main gas cost; it doesn't matter on Sepolia.
6. Deploy with a Foundry script and record addresses in a shared `deployments.json`.

A mismatch between the two pools is the most likely source of cross-chain bugs. Read SPP's `pool-core` code side by side while porting, and keep every field order and encoding in `SPEC.md`.

- [ ] Verifiers generated and tested on `anvil`
- [ ] `ShieldedPool.sol` with full Foundry tests, including SPP's own test cases ported
- [ ] Deployed to Sepolia; `deployments.json` updated

## Phase 5: Off-chain services

Goal: reuse SPP's indexing for Stellar and add the small services the bridge needs. None of them can steal funds; at worst they stall the system.

**Indexer.** On Stellar, SPP's SDK indexer and bootnode already sync pool events and keep history beyond the RPC's 7-day window. Add an Ethereum indexer (`viem` event watchers) with the same data model, plus both chains' outbox trees, so clients can fetch Merkle paths for bridge messages.

**Root poster.** Every few minutes, reads each chain's latest outbox root and calls `post_remote_root` / `postRemoteRoot` on the other chain. Wait for Sepolia finality before posting an Ethereum root. It holds its own key, separate from the deployer key.

**Relayer.** An HTTP endpoint that accepts a proof and its public inputs, simulates the call, and submits it from its own funded account on Stellar or Sepolia. This lets withdrawals and claims go to fresh addresses with no funds.

**Refund attester.** After each deadline bucket, checks whether each pending `C` was claimed on the other chain and signs the attestation that `finalize` or `refund` needs.

**Admin view.** SPP's admin page already decrypts every Stellar note in its Global View tab, with CSV export. Extend it, or build a small dashboard on SPP's audit code, to also decrypt Ethereum notes and bridge messages, and to link each bridge-out to its bridge-in, showing the full path: deposit → bridge-out → bridge-in → withdraw.

- [ ] Ethereum indexer and outbox trees, with a Merkle path API
- [ ] Root poster running against both testnets
- [ ] Relayer for both chains
- [ ] Refund attester
- [ ] Admin view covering both chains and bridge links

## Phase 6: Frontend and wallets

Goal: a web app where a user can deposit, transfer, bridge, claim and withdraw, with all proofs generated in their browser so secrets never leave the device.

1. Start from SPP's web SDK (the `stellar-private-payments` npm package): it already handles Freighter, key derivation from a wallet signature, encrypted local storage, background sync and in-browser proving in a worker. Either extend SPP's demo app or use the SDK inside our own React app in `apps/frontend`.
2. Add Ethereum: MetaMask via wagmi/RainbowKit, and the Ethereum pool through the same note format and prover.
3. Screens:
   - **Deposit, transfer, withdraw:** SPP's existing flows, on either chain.
   - **Bridge:** pick an amount and a destination; status tracker showing burned → root posted → claimed (or refunded).
   - **Claim:** detects incoming bridge messages with the user's key and builds the `bridge_in` proof.
   - **Balance:** shielded balance per chain.
4. Show a short "privacy tips" panel: deposit round amounts, wait before withdrawing, and use a fresh address.

- [ ] SPP's SDK running in our app on Stellar testnet
- [ ] Ethereum wallet and pool support
- [ ] Bridge, claim and balance screens working against testnet

## Phase 7: Testing and testnet deployment

Goal: every layer tested in isolation, then the full flow run end to end on both testnets by a script.

**Test layers, bottom up:**

1. Circuit tests for `bridge_out` and `bridge_in`, in SPP's circuit test setup.
2. Cross-language test vectors (Poseidon2, commitments, bridge messages).
3. Contract unit tests: SPP's existing tests still passing, plus our bridge tests (Soroban test utilities, Foundry).
4. Local end-to-end: Soroban tests and `anvil`, with the root poster mocked.
5. Testnet end-to-end script: deposit → bridge-out → root posted → bridge-in → withdraw, in both directions.

**Must-fail cases:** spending a note twice, claiming a bridge message twice, an amount over the range limit, outputs worth more than inputs, a ciphertext under a different admin key, a replayed transaction (same proof and external data), an unknown or stale root, claiming after the deadline, refunding a message that was already claimed, a relayer changing the recipient, and a withdrawal larger than the pool's token balance. Also run a test that bridges many random amounts back and forth and checks that the admin's decrypted totals match each pool's token balance.

**Deployment order:**

1. No token deployment: Circle's USDC already exists on both chains. Look up its Stellar Asset Contract address and record both token addresses in `deployments.json`; create USDC trustlines for every Stellar account that will receive USDC.
2. Verifiers (SPP's pool circuit, `bridge_out`, `bridge_in`) on both chains.
3. Pools in traceable Global View Key mode, with the admin's public key, root poster, attester, relayer and remote chain IDs.
4. Seed both pools with a small amount of USDC liquidity (a few USDC each, within the faucet limit).
5. Start SPP's bootnode, the Ethereum indexer, the root poster, the relayer and the refund attester.
6. Deploy the web app.
7. Run a script that makes ~50 dummy transactions so the demo has a visible crowd to hide in.

- [ ] All test layers passing in CI
- [ ] End-to-end script passing in both directions on testnet
- [ ] Dummy transactions seeded

## Phase 8: Demo and presentation

Goal: show in about five minutes that outsiders can't follow the money while the admin can.

**Demo script:**

1. Open the Stellar testnet explorer and Sepolia Etherscan side by side.
2. Deposit 5 USDC on Stellar. On the explorer, the deposit amount is visible, but the new note appears only as a commitment and a ciphertext.
3. Bridge it to Ethereum. The explorer shows a nullifier and a `C`, with no amount or recipient.
4. Claim on Ethereum. Show there's nothing linking this claim to the Stellar transaction.
5. Withdraw to a fresh Ethereum address through the relayer.
6. Open the admin dashboard: it reconstructs the whole path, from depositor to final address.

**Slides to include:**

- Architecture diagram and what each proof checks.
- What's hidden from the public vs what the admin sees.
- Known leaks and how mainnet would handle them: public entry and exit, timing, deposit and withdrawal amounts, the relayer seeing IPs, the small anonymity set, the trusted root poster, the single admin key.
- What we took from SPP and ProofBridge, and what we added (the Ethereum pool and the private bridge).

## Risks, open questions and timeline

The biggest risk is porting SPP's pool to Solidity exactly, especially Poseidon2 and the public-input encoding; Phase 0 checks both on day one.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Solidity Poseidon2 doesn't match SPP's | Ethereum roots disagree; proofs fail | Find or port a matching implementation in Phase 0; shared test vectors in CI |
| Solidity pool behaves differently from SPP's | Cross-chain bugs, lost or stuck notes | Port function for function, port SPP's tests, keep encodings in `SPEC.md` |
| SPP changes upstream mid-project | Our fork breaks | Pin one SPP commit; never update mid-project |
| SPP is unaudited work in progress | Hidden bugs | Testnet only; say so in the pitch |
| A bridge function doesn't check the admin key | Notes the admin can't decrypt | Supply `D` from storage in every contract function; test with a wrong key |
| Circle's faucet limit (20 USDC / 2 h / address / chain) | Not enough liquidity to test | Small liquidity and single-digit USDC transfers |
| 7 vs 6 decimals between the chains | Value lost or created when bridging | Exact conversion rule in `SPEC.md`, enforced in-circuit, tested on both chains |
| Circom and Rust learning curve | Slower start | Start from SPP's own tests and templates |
| Soroban storage expiry | Nullifiers or roots become unavailable | Use SPP's time-to-live helper on every new entry; test archival |
| Root poster down | Bridges stall (funds stay safe) | Restart alerts; refunds after the deadline |
| License obligations | Publishing the app without the required notices | Keep SPP's LICENSE and NOTICE files and ship them with the app |

**Open questions for the team:**

- Is Ethereum acceptable as the second chain, or is Solana required?
- Who holds the admin key, and is a threshold key expected?
- Do we want an ASP allowlist or blocklist (SPP supports both), or the open policy?

**Estimated timeline** (with Claude Code writing most of the code, and the frontend built in parallel):

1. Phase 0, SPP running on Stellar testnet and a proof verified on Sepolia: 1–2 days.
2. Phases 1–2, spec and bridge circuits: 2–3 days.
3. Phases 3–4, Stellar bridge functions and the Solidity port: 3–4 days, in parallel with Phases 1–2.
4. Phases 5–6, services and frontend: 2–3 days, partly in parallel.
5. Phases 7–8, testnet end-to-end and demo: 1–2 days.

Total: about 1–1.5 weeks of calendar time. These are estimates; Phase 0 will show how smoothly SPP builds and ports.

## Team split

| Person | Owns |
| --- | --- |
| Emin, working with Claude Code | `SPEC.md`, the `bridge_out` and `bridge_in` circuits and their keys, all contracts on both chains, all services, deployment and end-to-end scripts |
| Frontend developer | The web app only |

Order of work: Phase 0 → spec → Ethereum bridge functions (mock verifier) → circuits → Stellar bridge functions → testnet deployment and end-to-end script, while the frontend is built in parallel.
