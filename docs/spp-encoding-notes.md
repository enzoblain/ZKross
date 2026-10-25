# How SPP encodes public inputs, the external-data hash and the tree

Notes from Phase 0, for porting SPP's pool to Ethereum and writing `SPEC.md`. Everything here is read from SPP at commit `9bc3a78b` (pinned in `VERSIONS.md`) and checked where noted. Links go to that commit.

Base: https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/

**Checked end to end:** a real deposit proved on `policy_tx_2_2_gvk_T` with SPP's committed testnet proving key verifies with `snarkjs groth16 verify` and with a snarkjs Solidity verifier on anvil, using the input order below (`contracts/ethereum/test/SppVerifier.t.sol`). The Solidity Poseidon2 matches SPP's on 75 vectors plus the zero-hash table (`contracts/ethereum/test/Poseidon2.t.sol`).

## 1. Public inputs of `policy_tx_2_2_gvk_T` (30 field elements)

The circuit is `PolicyTransactionOpenGvk(2, 2, 20, 1)`: 2 inputs, 2 outputs, tree depth 20, traceable mode (inputs encrypted too) ([`circuits/src/policy_tx_2_2_gvk_T.circom`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/circuits/src/policy_tx_2_2_gvk_T.circom)). Circom puts output signals before public inputs, so the ciphertexts come first. The order is pinned by SPP's test `run_policy_gvk_public_input_order` ([`circuits/src/test/prove_policy.rs#L2108-L2176`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/circuits/src/test/prove_policy.rs#L2108-L2176)) and built on-chain by `verify_proof` ([`contracts/pool-gvk/src/pool_gvk.rs#L767-L860`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-gvk/src/pool_gvk.rs#L767-L860)).

The four Global View Key (GVK) ciphertexts are ordered input 0, input 1, output 0, output 1, and laid out **field-major**: all `R` points first, then all `c1`, then all `c2`, then all `c3`.

| Index | Value | Source on-chain |
| --- | --- | --- |
| 0–7 | `R.x, R.y` of ciphertexts in0, in1, out0, out1 | `proof.input_gvk_ciphertexts` then `proof.output_gvk_ciphertexts` |
| 8–11 | `c1` of in0, in1, out0, out1 | same |
| 12–15 | `c2` of in0, in1, out0, out1 | same |
| 16–19 | `c3` of in0, in1, out0, out1 | same |
| 20, 21 | `D.x, D.y`, the admin's Baby JubJub view key | **contract storage, never the caller** |
| 22 | `nonce` | equals `ext_data_hash` (see §4) |
| 23 | `root` | `proof.root` |
| 24 | `publicAmount` | `proof.public_amount` (see §3) |
| 25 | `extDataHash` | `proof.ext_data_hash` (see §2) |
| 26, 27 | `inputNullifier[0], [1]` | `proof.input_nullifiers` |
| 28, 29 | `outputCommitment[0], [1]` | `proof.output_commitment0/1` |

The ASP variants (`_A_`, `_B_`, `_AB_`) append the membership and non-membership roots after these, one per input. We use the open policy, so none are appended.

Every one of these must be `< r` (the BN254 scalar field size). SPP checks each one before verifying (`validate_bn256_public_inputs`, [`pool_gvk.rs#L706-L733`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-gvk/src/pool_gvk.rs#L706-L733)); the snarkjs Solidity verifier also rejects values `≥ r`.

**Ciphertext counts.** Exactly 2 output ciphertexts always; exactly one per input nullifier in traceable mode, none in view-only mode ([`pool_gvk.rs#L739-L752`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-gvk/src/pool_gvk.rs#L739-L752)). In the circuit, input notes are encrypted at `idx = k` and outputs at `idx = nIns + k`.

## 2. External-data hash

`ExtData` is `{ recipient: Address, ext_amount: I256, encrypted_output0: Bytes, encrypted_output1: Bytes }`. On-chain it is hashed together with the pool's own address and token, which come from contract state, never from the caller ([`contracts/pool-core/src/ext_data.rs#L60-L76`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-core/src/ext_data.rs#L60-L76)):

```
ext_data_hash = keccak256( XDR( ScVal::Map {
    encrypted_output0: Bytes, encrypted_output1: Bytes, ext_amount: I256,
    pool: Address, recipient: Address, token: Address } ) ) mod r      // 32 bytes, big-endian
```

Soroban serializes a struct as an XDR map **sorted alphabetically by field name**, which is the order above. SPP's off-chain copy builds the same map by hand ([`sdk/native/src/chain/ext_data_hash.rs`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/sdk/native/src/chain/ext_data_hash.rs)). The pool recomputes it and rejects a mismatch with `WrongExtHash` before verifying.

- The circuit treats `extDataHash` as an opaque field element. Each chain can therefore hash its own `ExtData` its own way, as long as the contract and the client agree.
- **For Ethereum we need our own definition.** Reproducing Soroban XDR in Solidity would be pointless. Proposal (to confirm in `SPEC.md`): `uint256(keccak256(abi.encode(pool, token, recipient, extAmount, keccak256(encOut0), keccak256(encOut1)))) % r`, where `pool` and `token` come from contract state.
- SPP's `ExtData` has **no relayer or fee field**. The circuit comment says `publicAmount = extAmount - fee`, but no fee exists anywhere. A relayer that gets paid needs a format change on both chains.

## 3. Public amount

From `ext_amount` (signed), [`contracts/pool-core/src/amounts.rs#L28-L46`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-core/src/amounts.rs#L28-L46):

- `-2^248 < ext_amount < 2^248`, otherwise `WrongExtAmount`.
- `publicAmount = ext_amount` if `ext_amount ≥ 0`, else `r − |ext_amount|`.
- Deposit (`ext_amount > 0`): refused while deposits are paused, must be `≤ maximum_deposit_amount`, must fit in `i128`; tokens are pulled from `sender`.
- Withdrawal (`ext_amount < 0`): `|ext_amount|` must fit in `i128`; tokens go to `ext_data.recipient`.
- Transfer: `ext_amount = 0`.

The circuit checks `sumIns + publicAmount == sumOuts` and range-checks **each output amount to 248 bits** ([`circuits/src/transaction.circom#L116-L137`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/circuits/src/transaction.circom#L116-L137)). It also rejects two equal input nullifiers, and skips the Merkle root check for zero-amount (dummy) inputs (`ForceEqualIfEnabled` with `enabled = inAmount`). The contracts therefore don't need their own duplicate-nullifier check; SPP has a test that relies on this.

## 4. Global View Key and nonce

- `D` is stored once at construction and has no setter. The constructor rejects `x ≥ r`, `y ≥ r` and `x = 0`. Full curve and subgroup checks run in the circuit ([`pool_gvk.rs#L311-L320`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-gvk/src/pool_gvk.rs#L311-L320)).
- **The nonce is not unique in SPP.** The pool feeds `ext_data_hash` into the `nonce` input, so two transactions with identical `ExtData` on one pool share a nonce. SPP argues this is safe: the ephemeral scalar is `H(pk, amount, blinding, salt, D, nonce, idx)` with a fresh salt and blinding per note ([`pool_gvk.rs#L939-L951`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-gvk/src/pool_gvk.rs#L939-L951), [`circuits/src/globalViewKey.circom#L60-L90`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/circuits/src/globalViewKey.circom#L60-L90)). **Our `CLAUDE.md` says every function must check that the nonce is unique. This needs a team decision.**

## 5. Order of checks in `transact`

[`pool_gvk.rs#L906-L1073`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-gvk/src/pool_gvk.rs#L906-L1073). Tokens move only after every check and the state update.

1. Deposit checks: paused, cap, `i128`.
2. Root is in the recent history.
3. No input nullifier spent.
4. `ext_data_hash` recomputed and equal.
5. `public_amount` matches `ext_amount`; withdrawal fits `i128`.
6. ASP roots (skipped for the open policy).
7. Ciphertext counts, all inputs `< r`, Groth16 verify.
8. Mark nullifiers spent.
9. Insert both output commitments.
10. Token transfer in or out.
11. Events: one `NewNullifierEvent { nullifier, gvk_ciphertext: Option }` per input, then one `NewCommitmentEvent { commitment, index, encrypted_output, gvk_ciphertext }` per output.

## 6. Merkle tree with history

[`contracts/pool-core/src/merkle_with_history.rs`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/pool-core/src/merkle_with_history.rs):

- **Depth:** chosen at construction (1–32). It must be **20** to match the circuit.
- **Insertion:** always two leaves at once, at an even index. The pair is hashed into level 1, then the path is recomputed with `filled_subtrees` and the zero hashes.
- **Root history:** `ROOT_HISTORY_SIZE = 90` (not 30). The current root is in slot `(next_index / 2) % 90`, and all slots start as the empty-tree root. `is_known_root(0)` is always false.
- **Node hash:** `Poseidon2_compress(left, right)`.
- **Zero leaf:** `Poseidon2_t4(88, 76, 77, 0)`, i.e. "XLM". Level `i + 1` is `compress(z_i, z_i)`. The 33-level table is in `contracts/ethereum/test/fixtures/spp/poseidon2_vectors.json`.

## 7. Poseidon2 constructions

All hashes use BN254 Poseidon2 with d = 5, 8 full rounds and 56 partial rounds, with SPP's round constants. The Stellar contracts use the Soroban host permutation; off-chain and in tests SPP uses `taceo_poseidon2`. Both give the same results.

**The domain tag is the last state element, and a hash is one permutation keeping `out[0]`, not a sponge.** Hashes with more than 3 inputs are built by chaining `Poseidon2(3)` calls (see the GVK `r` derivation).

| Name | Definition | Tag | Where |
| --- | --- | --- | --- |
| compress (Merkle node) | `perm_t2(l, r)[0] + l` | none | [`soroban-utils/src/poseidon2.rs#L25-L58`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/soroban-utils/src/poseidon2.rs#L25-L58) |
| hash2 | `perm_t3(a, b, tag)[0]` | given | [`poseidon2.rs#L79-L111`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/contracts/soroban-utils/src/poseidon2.rs#L79-L111) |
| commitment | `perm_t4(amount, pk, blinding, 0x01)[0]` | 0x01 | [`sdk/native/src/zk/crypto.rs#L83-L91`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/sdk/native/src/zk/crypto.rs#L83-L91) |
| nullifier | `perm_t4(commitment, pathIndices, signature, 0x02)[0]` | 0x02 | [`crypto.rs#L110-L122`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/sdk/native/src/zk/crypto.rs#L110-L122) |
| note public key | `perm_t3(sk, 0, 0x03)[0]` | 0x03 | [`crypto.rs#L150-L152`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/sdk/native/src/zk/crypto.rs#L150-L152) |
| signature | `perm_t4(sk, commitment, merklePath, 0x04)[0]` | 0x04 | [`crypto.rs#L94-L105`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/sdk/native/src/zk/crypto.rs#L94-L105) |
| GVK ephemeral scalar | chained `Poseidon2(3)` over `pk, amount, blinding, salt, D, nonce, idx` | 0x05 | [`globalViewKey.circom#L60-L90`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/circuits/src/globalViewKey.circom#L60-L90) |
| GVK keystream | KDF | 0x06 | `globalViewKey.circom#L166` |

Only `compress` runs on-chain in the pool. `contracts/ethereum/src/Poseidon2.sol` implements `compress` and `hash2`, and costs about 13k gas per `compress`.

## 8. Proof encoding

SPP's on-chain `Groth16Proof` is 256 bytes, `A (64) ‖ B (128) ‖ C (64)`, big-endian. G2 coordinates are ordered `x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0` (imaginary first) ([`sdk/native/src/zk/prover.rs#L469-L473`](https://github.com/NethermindEth/stellar-private-payments/blob/9bc3a78b90c84b144e86af04c9c331a684f528dd/sdk/native/src/zk/prover.rs#L469-L473)). This is the same order the EVM pairing precompile and the snarkjs Solidity verifier expect. snarkjs JSON files (`proof.json`, `vk.json`) store each Fq2 the other way round, as `[c0, c1]`.

The same 256 bytes can therefore go to both chains: split them into `uint256[2] a, uint256[2][2] b, uint256[2] c` with no reordering.

## 9. Open points for `SPEC.md` and the team

1. **Nonce uniqueness:** follow SPP (`nonce = ext_data_hash`, no uniqueness check) or add a used-nonce set on both chains (§4).
2. **Ethereum `ExtData` hash** format (§2), and whether `ExtData` gets a relayer fee field.
3. **Bridge message `C`:** `Poseidon2(TAG_BRIDGE, …)` with 8 inputs doesn't fit SPP's construction. SPP puts the tag last and chains `Poseidon2(3)` for long inputs, so `SPEC.md` should fix the exact chaining. New tags start at 0x07.
4. **Field encodings:** SPP never turns an address into a field element. Addresses only enter the proof through the external-data hash. The bridge needs explicit encodings for chain IDs, deadline buckets and (if used) the Stellar and Ethereum addresses.
5. **Licenses:** the snarkjs-generated Solidity verifiers are GPL-3.0.
