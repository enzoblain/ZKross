//! ZKross bridge circuits (`bridge_out`, `bridge_in`; SPEC.md B8).
//!
//! Each valid case proves with the committed Groth16 keys and checks the
//! public signal order. Each negative case changes exactly one thing in an
//! otherwise valid case and must be rejected: either witness generation fails
//! (a `===` assertion) or the witness does not satisfy the R1CS.
//!
//! `ZKROSS_ARTIFACTS=<dir>` makes the tests load `<dir>/<stem>.wasm` and
//! `<dir>/<stem>.r1cs` instead of the built artifacts; the mutation script
//! (`scripts/circuits/mutate.sh`) uses it to run a test against a circuit with
//! one constraint removed.
#[cfg(test)]
mod tests {
    use crate::test::utils::{
        circom_tester::{CircuitKeys, Inputs, build_circuit, load_keys, prove_and_verify_with_keys, r1cs_satisfied},
        general::{load_artifacts, poseidon2_hash2, poseidon2_hash3, scalar_to_bigint},
        global_view_key::{Note, admin_public_key, decrypt_note, encrypt_note, Ciphertext},
        keypair::derive_public_key,
        merkle_tree::PrefixTree,
        transaction::{commitment, prepopulated_prefix},
        transaction_case::{InputNote, OutputNote, TxCase, prepare_transaction_witness},
    };
    use anyhow::{Context, Result};
    use ark_bn254::{Bn254, Fr as Scalar};
    use ark_circom::CircomReduction;
    use ark_groth16::Groth16;
    use ark_snark::SNARK;
    use num_bigint::BigInt;
    use std::path::PathBuf;

    const LEVELS: usize = 20;
    const TAG_BRIDGE: u64 = 0x07;
    const TAG_CLAIM: u64 = 0x08;
    /// SPEC.md B2: Stellar testnet chain ID.
    const STELLAR_TESTNET: u128 = 33_353_711_811_639_397_682;
    const SEPOLIA: u64 = 11_155_111;

    fn artifacts(stem: &str) -> Result<(PathBuf, PathBuf)> {
        match std::env::var("ZKROSS_ARTIFACTS") {
            Ok(dir) => {
                let dir = PathBuf::from(dir);
                Ok((dir.join(format!("{stem}.wasm")), dir.join(format!("{stem}.r1cs"))))
            }
            Err(_) => load_artifacts(stem),
        }
    }

    fn committed_keys(stem: &str) -> Result<CircuitKeys> {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../testdata")
            .join(format!("{stem}_proving_key.bin"));
        load_keys(&path).with_context(|| format!("load {}", path.display()))
    }

    fn s(v: u64) -> Scalar {
        Scalar::from(v)
    }

    fn big(v: Scalar) -> BigInt {
        scalar_to_bigint(v)
    }

    fn admin() -> (Scalar, (Scalar, Scalar)) {
        let d_priv = s(0x5EED);
        (d_priv, admin_public_key(d_priv))
    }

    /// SPEC.md B3.
    fn bridge_message(amount: Scalar, asset: Scalar, src: Scalar, dst: Scalar, pk: Scalar, secret: Scalar, deadline: Scalar) -> Scalar {
        let tag = Some(s(TAG_BRIDGE));
        let h1 = poseidon2_hash3(amount, asset, src, tag);
        let h2 = poseidon2_hash3(h1, dst, pk, tag);
        poseidon2_hash3(h2, secret, deadline, tag)
    }

    /// SPEC.md B4.
    fn claim_nullifier(secret: Scalar) -> Scalar {
        poseidon2_hash2(secret, s(0), Some(s(TAG_CLAIM)))
    }

    /// Accepted means: witness generation succeeds and the R1CS is satisfied.
    fn accepted(stem: &str, inputs: &Inputs) -> Result<bool> {
        let (wasm, r1cs) = artifacts(stem)?;
        match build_circuit(&wasm, &r1cs, inputs) {
            Ok(circuit) => r1cs_satisfied(circuit),
            Err(_) => Ok(false),
        }
    }

    /// Builds the honest witness, adds 1 to the wire at `wire`, and reports
    /// whether the R1CS still holds.
    fn accepted_with_tampered_wire(stem: &str, inputs: &Inputs, wire: usize) -> Result<bool> {
        let (wasm, r1cs) = artifacts(stem)?;
        let mut circuit = build_circuit(&wasm, &r1cs, inputs)?;
        let w = circuit.witness.as_mut().context("no witness")?;
        w[wire] += s(1);
        r1cs_satisfied(circuit)
    }

    fn field_major(cts: &[Ciphertext]) -> Vec<Scalar> {
        let mut v = Vec::new();
        for ct in cts {
            v.push(ct.r.0);
            v.push(ct.r.1);
        }
        v.extend(cts.iter().map(|c| c.c1));
        v.extend(cts.iter().map(|c| c.c2));
        v.extend(cts.iter().map(|c| c.c3));
        v
    }

    // ========== bridge_out ==========

    /// All values of one bridge_out case; `inputs()` turns them into circuit
    /// inputs, so a test can change one value and keep the rest consistent.
    #[derive(Clone)]
    struct OutCase {
        d: (Scalar, Scalar),
        nonce: Scalar,
        in_notes: Vec<InputNote>,
        change: Vec<OutputNote>,
        amount: Scalar,
        scale: Scalar,
        asset: Scalar,
        src: Scalar,
        dst: Scalar,
        deadline: Scalar,
        recipient_pk: Scalar,
        claim_secret: Scalar,
        refund_pk: Scalar,
        refund_blinding: Scalar,
        /// Overrides for public values, to break exactly one equality.
        bridge_message_override: Option<Scalar>,
        refund_commitment_override: Option<Scalar>,
        change_commitment0_override: Option<Scalar>,
        path_element_tamper: bool,
        private_key_tamper: bool,
        duplicate_input: bool,
    }

    const IN_SALTS: [u64; 2] = [0xDEAD_BEEF, 0xDEAD_BEF0];
    const OUT_SALTS: [u64; 2] = [0xC0FFE, 0xC0FFF];
    const REFUND_SALT: u64 = 0x5EF0;
    const BRIDGE_SALT: u64 = 0xB5A1;

    /// Stellar -> Ethereum by default: 12 345 678 + 1 000 stroops in, 1 234 567
    /// bridge units out (12 345 670 stroops), 1 000 + 8 stroops change.
    fn out_case() -> OutCase {
        OutCase {
            d: admin().1,
            nonce: s(0xFEED_FACE),
            in_notes: vec![
                InputNote { leaf_index: 3, priv_key: s(111), blinding: s(11), amount: s(12_345_678) },
                InputNote { leaf_index: 8, priv_key: s(222), blinding: s(22), amount: s(1_000) },
            ],
            change: vec![
                OutputNote { pub_key: derive_public_key(s(333)), blinding: s(33), amount: s(1_000) },
                OutputNote { pub_key: derive_public_key(s(444)), blinding: s(44), amount: s(8) },
            ],
            amount: s(1_234_567),
            scale: s(10),
            asset: s(1),
            src: Scalar::from(STELLAR_TESTNET),
            dst: s(SEPOLIA),
            deadline: s(490_000),
            recipient_pk: derive_public_key(s(555)),
            claim_secret: s(0xC1A1_5EC7),
            refund_pk: derive_public_key(s(666)),
            refund_blinding: s(66),
            bridge_message_override: None,
            refund_commitment_override: None,
            change_commitment0_override: None,
            path_element_tamper: false,
            private_key_tamper: false,
            duplicate_input: false,
        }
    }

    impl OutCase {
        fn value(&self) -> Scalar {
            self.amount * self.scale
        }

        fn bridge_message(&self) -> Scalar {
            self.bridge_message_override.unwrap_or_else(|| {
                bridge_message(self.amount, self.asset, self.src, self.dst, self.recipient_pk, self.claim_secret, self.deadline)
            })
        }

        fn refund_commitment(&self) -> Scalar {
            self.refund_commitment_override
                .unwrap_or_else(|| commitment(self.value(), self.refund_pk, self.refund_blinding))
        }

        fn change_commitments(&self) -> Vec<Scalar> {
            let mut v: Vec<Scalar> = self.change.iter().map(|o| commitment(o.amount, o.pub_key, o.blinding)).collect();
            if let Some(c) = self.change_commitment0_override {
                v[0] = c;
            }
            v
        }

        /// The six GVK ciphertexts the circuit must output (B8).
        fn ciphertexts(&self) -> Vec<Ciphertext> {
            let mut notes = Vec::new();
            for (k, n) in self.in_notes.iter().enumerate() {
                notes.push(Note { pk: derive_public_key(n.priv_key), amount: n.amount, blinding: n.blinding, salt: s(IN_SALTS[k]) });
            }
            for (k, o) in self.change.iter().enumerate() {
                notes.push(Note { pk: o.pub_key, amount: o.amount, blinding: o.blinding, salt: s(OUT_SALTS[k]) });
            }
            notes.push(Note { pk: self.refund_pk, amount: self.value(), blinding: self.refund_blinding, salt: s(REFUND_SALT) });
            notes.push(Note { pk: self.recipient_pk, amount: self.amount, blinding: self.claim_secret, salt: s(BRIDGE_SALT) });
            notes
                .iter()
                .enumerate()
                .map(|(i, n)| encrypt_note(n, self.d, self.nonce, s(i as u64)))
                .collect()
        }

        fn inputs(&self) -> Result<Inputs> {
            let mut notes = self.in_notes.clone();
            if self.duplicate_input {
                notes[1] = notes[0].clone();
            }
            let case = TxCase::new(notes.clone(), self.change.clone());
            let exclude: Vec<usize> = notes.iter().map(|n| n.leaf_index).collect();
            let leaves = prepopulated_prefix(0xABCD, &exclude, 64);
            let witness = prepare_transaction_witness(&case, leaves, LEVELS)?;

            let mut inputs = Inputs::new();
            inputs.set("D", vec![self.d.0, self.d.1]);
            inputs.set("nonce", self.nonce);
            inputs.set("root", witness.root);
            inputs.set("extDataHash", self.nonce);
            inputs.set("inputNullifier", witness.nullifiers.clone());
            inputs.set("changeCommitment", self.change_commitments());
            inputs.set("bridgeMessage", self.bridge_message());
            inputs.set("refundCommitment", self.refund_commitment());
            inputs.set("scale", self.scale);
            inputs.set("assetId", self.asset);
            inputs.set("srcChain", self.src);
            inputs.set("dstChain", self.dst);
            inputs.set("deadlineBucket", self.deadline);

            inputs.set("inAmount", notes.iter().map(|n| n.amount).collect::<Vec<_>>());
            let mut keys: Vec<Scalar> = notes.iter().map(|n| n.priv_key).collect();
            if self.private_key_tamper {
                keys[0] += s(1);
            }
            inputs.set("inPrivateKey", keys);
            inputs.set("inBlinding", notes.iter().map(|n| n.blinding).collect::<Vec<_>>());
            inputs.set("inPathIndices", witness.path_indices.clone());
            let mut path = witness.path_elements_flat.clone();
            if self.path_element_tamper {
                path[0] += BigInt::from(1);
            }
            inputs.set("inPathElements", path);
            inputs.set("outAmount", self.change.iter().map(|o| o.amount).collect::<Vec<_>>());
            inputs.set("outPubkey", self.change.iter().map(|o| o.pub_key).collect::<Vec<_>>());
            inputs.set("outBlinding", self.change.iter().map(|o| o.blinding).collect::<Vec<_>>());
            inputs.set("amount", self.amount);
            inputs.set("recipientPk", self.recipient_pk);
            inputs.set("claimSecret", self.claim_secret);
            inputs.set("refundPk", self.refund_pk);
            inputs.set("refundBlinding", self.refund_blinding);
            inputs.set("inSalt", IN_SALTS.iter().map(|&v| s(v)).collect::<Vec<_>>());
            inputs.set("outSalt", OUT_SALTS.iter().map(|&v| s(v)).collect::<Vec<_>>());
            inputs.set("refundSalt", s(REFUND_SALT));
            inputs.set("bridgeSalt", s(BRIDGE_SALT));
            Ok(inputs)
        }

        /// SPEC.md B8 public signal order.
        fn expected_publics(&self) -> Result<Vec<Scalar>> {
            let case = TxCase::new(self.in_notes.clone(), self.change.clone());
            let exclude: Vec<usize> = self.in_notes.iter().map(|n| n.leaf_index).collect();
            let witness = prepare_transaction_witness(&case, prepopulated_prefix(0xABCD, &exclude, 64), LEVELS)?;
            let mut v = field_major(&self.ciphertexts());
            v.extend([self.d.0, self.d.1, self.nonce, witness.root, self.nonce]);
            v.extend(witness.nullifiers.iter().copied());
            v.extend(self.change_commitments());
            v.extend([self.bridge_message(), self.refund_commitment(), self.scale, self.asset, self.src, self.dst, self.deadline]);
            Ok(v)
        }
    }

    fn out_accepted(c: &OutCase) -> Result<bool> {
        accepted("bridge_out", &c.inputs()?)
    }

    #[test]
    fn bridge_out_valid_case_proves_with_committed_keys_in_spec_order() -> Result<()> {
        let c = out_case();
        let (wasm, r1cs) = artifacts("bridge_out")?;
        let res = prove_and_verify_with_keys(&wasm, &r1cs, &c.inputs()?, &committed_keys("bridge_out")?)?;
        assert!(res.verified, "valid bridge_out proof must verify");
        assert_eq!(res.public_inputs.len(), 46);
        assert_eq!(res.public_inputs, c.expected_publics()?, "public signals must follow SPEC.md B8");
        Ok(())
    }

    /// The admin decrypts C's secrets and the refund note, and from the claim
    /// secret computes the claim nullifier bridge_in will reveal (B8).
    #[test]
    fn bridge_out_admin_recovers_c_and_the_refund_note() -> Result<()> {
        let c = out_case();
        let (d_priv, _) = admin();
        let cts = c.ciphertexts();
        let refund = decrypt_note(&cts[4], d_priv);
        assert_eq!((refund.pk, refund.amount, refund.blinding), (c.refund_pk, c.value(), c.refund_blinding));
        let msg = decrypt_note(&cts[5], d_priv);
        assert_eq!((msg.pk, msg.amount, msg.blinding), (c.recipient_pk, c.amount, c.claim_secret));
        assert_eq!(claim_nullifier(msg.blinding), claim_nullifier(c.claim_secret));
        assert!(out_accepted(&c)?);
        Ok(())
    }

    /// SPEC.md B1: Ethereum side (scale 1) is valid too.
    #[test]
    fn bridge_out_valid_on_ethereum_with_scale_one() -> Result<()> {
        let mut c = out_case();
        c.scale = s(1);
        c.src = s(SEPOLIA);
        c.dst = Scalar::from(STELLAR_TESTNET);
        c.in_notes[0].amount = s(2_000_000);
        c.in_notes[1].amount = s(500);
        c.amount = s(1_999_000);
        c.change[0].amount = s(1_000);
        c.change[1].amount = s(500);
        assert!(out_accepted(&c)?);
        Ok(())
    }

    /// SPEC.md B1: taking the leftover stroops too (1 234 568 units = 12 345 680
    /// stroops > the 12 345 678 + 1 000 - 1 000 available after change) breaks
    /// the balance; the extra digit must stay in change.
    #[test]
    fn bridge_out_cannot_round_up_the_extra_digit() -> Result<()> {
        let mut c = out_case();
        c.amount = s(1_234_568);
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_out_rejects_a_wrong_merkle_path() -> Result<()> {
        let mut c = out_case();
        c.path_element_tamper = true;
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_out_rejects_a_wrong_spending_key() -> Result<()> {
        let mut c = out_case();
        c.private_key_tamper = true;
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    /// Outputs worth more than inputs: one more unit bridged, with C and the
    /// refund note recomputed so only the balance breaks.
    #[test]
    fn bridge_out_rejects_unbalanced_amounts() -> Result<()> {
        let mut c = out_case();
        c.change[1].amount = s(9);
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    /// A "negative" change note (p - 1) balanced by a larger one: only the
    /// 248-bit range check catches it.
    #[test]
    fn bridge_out_rejects_a_change_amount_over_the_range_limit() -> Result<()> {
        let mut c = out_case();
        c.change[0].amount = -s(1);
        c.change[1].amount = s(1_009);
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_out_rejects_two_identical_input_nullifiers() -> Result<()> {
        let mut c = out_case();
        c.duplicate_input = true;
        // in0 + in0 = 24 691 356 = 12 345 670 + change
        c.change[0].amount = s(12_345_678);
        c.change[1].amount = s(8);
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    /// amount = 2^64 with everything else consistent: only the 64-bit check.
    #[test]
    fn bridge_out_rejects_an_amount_of_two_to_the_64() -> Result<()> {
        let mut c = out_case();
        c.scale = s(1);
        c.amount = Scalar::from(1u128 << 64);
        c.in_notes[0].amount = Scalar::from((1u128 << 64) + 1_000);
        c.change[0].amount = s(1_000);
        c.change[1].amount = s(1_000);
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_out_rejects_a_scale_other_than_1_or_10() -> Result<()> {
        let mut c = out_case();
        c.scale = s(2);
        c.amount = s(6_172_839); // 12 345 678 = 2 * 6 172 839
        c.change[0].amount = s(1_000);
        c.change[1].amount = s(0);
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_out_rejects_a_wrong_bridge_message() -> Result<()> {
        let mut c = out_case();
        c.bridge_message_override = Some(c.bridge_message() + s(1));
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    /// A public chain ID that differs from the one inside C (PLAN.md: wrong
    /// chain ID).
    #[test]
    fn bridge_out_rejects_a_wrong_chain_id() -> Result<()> {
        let mut c = out_case();
        let real = c.bridge_message();
        c.dst = s(1);
        c.bridge_message_override = Some(real);
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    /// A refund note worth one stroop less than the bridged value.
    #[test]
    fn bridge_out_rejects_a_refund_note_worth_less() -> Result<()> {
        let mut c = out_case();
        c.refund_commitment_override = Some(commitment(c.value() - s(1), c.refund_pk, c.refund_blinding));
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_out_rejects_a_wrong_change_commitment() -> Result<()> {
        let mut c = out_case();
        c.change_commitment0_override = Some(c.change_commitments()[0] + s(1));
        assert!(!out_accepted(&c)?);
        Ok(())
    }

    /// Every GVK ciphertext output wire is constrained (PLAN.md: tampered
    /// ciphertext). Wire 0 is the constant 1; wires 1..=30 are the outputs.
    #[test]
    fn bridge_out_rejects_any_tampered_ciphertext_wire() -> Result<()> {
        let inputs = out_case().inputs()?;
        for wire in 1..=30 {
            assert!(!accepted_with_tampered_wire("bridge_out", &inputs, wire)?, "output wire {wire}");
        }
        Ok(())
    }

    /// A proof made with another admin key fails against the pool's key (the
    /// contract supplies D; PLAN.md: ciphertext under a different admin key).
    #[test]
    fn bridge_out_proof_under_another_admin_key_fails_verification() -> Result<()> {
        let mut c = out_case();
        c.d = admin_public_key(s(0xBAD));
        let (wasm, r1cs) = artifacts("bridge_out")?;
        let keys = committed_keys("bridge_out")?;
        let res = prove_and_verify_with_keys(&wasm, &r1cs, &c.inputs()?, &keys)?;
        assert!(res.verified, "the proof is valid for the key it was made with");
        let mut publics = res.public_inputs.clone();
        let pool_d = admin().1;
        publics[30] = pool_d.0;
        publics[31] = pool_d.1;
        let ok = Groth16::<Bn254, CircomReduction>::verify_with_processed_vk(&keys.pvk, &publics, &res.proof)?;
        assert!(!ok);
        Ok(())
    }

    // ========== bridge_in ==========

    #[derive(Clone)]
    struct InCase {
        d: (Scalar, Scalar),
        nonce: Scalar,
        amount: Scalar,
        scale: Scalar,
        asset: Scalar,
        src: Scalar,
        dst: Scalar,
        deadline: Scalar,
        recipient_pk: Scalar,
        claim_secret: Scalar,
        out_amounts: [Scalar; 2],
        out_blindings: [Scalar; 2],
        root_override: Option<Scalar>,
        claim_nullifier_override: Option<Scalar>,
        commitment0_override: Option<Scalar>,
        path_element_tamper: bool,
        /// Values the outbox leaf was built with, if different from the case
        /// (to change one field of C after the fact).
        leaf_fields: Option<(Scalar, Scalar, Scalar, Scalar, Scalar)>,
    }

    const IN_OUT_SALTS: [u64; 2] = [0x0A11, 0x0A12];
    const OUTBOX_INDEX: usize = 6;

    /// Stellar -> Ethereum claim on Ethereum: 1 234 567 bridge units become
    /// 1 234 567 units (scale 1), split 1 000 000 + 234 567.
    fn in_case() -> InCase {
        InCase {
            d: admin().1,
            nonce: s(0xFEED_BEEF),
            amount: s(1_234_567),
            scale: s(1),
            asset: s(1),
            src: Scalar::from(STELLAR_TESTNET),
            dst: s(SEPOLIA),
            deadline: s(490_000),
            recipient_pk: derive_public_key(s(555)),
            claim_secret: s(0xC1A1_5EC7),
            out_amounts: [s(1_000_000), s(234_567)],
            out_blindings: [s(77), s(88)],
            root_override: None,
            claim_nullifier_override: None,
            commitment0_override: None,
            path_element_tamper: false,
            leaf_fields: None,
        }
    }

    impl InCase {
        fn leaf(&self) -> Scalar {
            let (amount, asset, src, dst, deadline) =
                self.leaf_fields.unwrap_or((self.amount, self.asset, self.src, self.dst, self.deadline));
            bridge_message(amount, asset, src, dst, self.recipient_pk, self.claim_secret, deadline)
        }

        /// The outbox as the contracts build it (B6): pairs (C, 0), with our
        /// message at an even index among other messages.
        fn tree(&self) -> PrefixTree {
            let mut leaves = Vec::new();
            for i in 0..8u64 {
                leaves.push(if i as usize == OUTBOX_INDEX { self.leaf() } else { s(0x1000 + i) });
                leaves.push(s(0));
            }
            // leaf index of C = 2 * OUTBOX_INDEX
            let mut tree_leaves = Vec::new();
            for pair in leaves.chunks(2) {
                tree_leaves.extend_from_slice(pair);
            }
            PrefixTree::new(&tree_leaves, LEVELS)
        }

        fn commitments(&self) -> [Scalar; 2] {
            let mut v = [0, 1].map(|k| commitment(self.out_amounts[k], self.recipient_pk, self.out_blindings[k]));
            if let Some(c) = self.commitment0_override {
                v[0] = c;
            }
            v
        }

        fn ciphertexts(&self) -> Vec<Ciphertext> {
            (0..2)
                .map(|k| {
                    let note = Note { pk: self.recipient_pk, amount: self.out_amounts[k], blinding: self.out_blindings[k], salt: s(IN_OUT_SALTS[k]) };
                    encrypt_note(&note, self.d, self.nonce, s(k as u64))
                })
                .collect()
        }

        fn inputs(&self) -> Inputs {
            let tree = self.tree();
            let (siblings, path_idx) = tree.proof(2 * OUTBOX_INDEX);
            let mut path: Vec<BigInt> = siblings.into_iter().map(big).collect();
            if self.path_element_tamper {
                path[1] += BigInt::from(1);
            }
            let mut inputs = Inputs::new();
            inputs.set("D", vec![self.d.0, self.d.1]);
            inputs.set("nonce", self.nonce);
            inputs.set("remoteRoot", self.root_override.unwrap_or(tree.root()));
            inputs.set("extDataHash", self.nonce);
            inputs.set("claimNullifier", self.claim_nullifier_override.unwrap_or(claim_nullifier(self.claim_secret)));
            inputs.set("outputCommitment", self.commitments().to_vec());
            inputs.set("scale", self.scale);
            inputs.set("assetId", self.asset);
            inputs.set("srcChain", self.src);
            inputs.set("dstChain", self.dst);
            inputs.set("deadlineBucket", self.deadline);
            inputs.set("amount", self.amount);
            inputs.set("recipientPk", self.recipient_pk);
            inputs.set("claimSecret", self.claim_secret);
            inputs.set("pathIndices", s(path_idx));
            inputs.set("pathElements", path);
            inputs.set("outAmount", self.out_amounts.to_vec());
            inputs.set("outBlinding", self.out_blindings.to_vec());
            inputs.set("outSalt", IN_OUT_SALTS.iter().map(|&v| s(v)).collect::<Vec<_>>());
            inputs
        }

        fn expected_publics(&self) -> Vec<Scalar> {
            let mut v = field_major(&self.ciphertexts());
            v.extend([self.d.0, self.d.1, self.nonce, self.tree().root(), self.nonce, claim_nullifier(self.claim_secret)]);
            v.extend(self.commitments());
            v.extend([self.scale, self.asset, self.src, self.dst, self.deadline]);
            v
        }
    }

    fn in_accepted(c: &InCase) -> Result<bool> {
        accepted("bridge_in", &c.inputs())
    }

    #[test]
    fn bridge_in_valid_case_proves_with_committed_keys_in_spec_order() -> Result<()> {
        let c = in_case();
        let (wasm, r1cs) = artifacts("bridge_in")?;
        let res = prove_and_verify_with_keys(&wasm, &r1cs, &c.inputs(), &committed_keys("bridge_in")?)?;
        assert!(res.verified);
        assert_eq!(res.public_inputs.len(), 23);
        assert_eq!(res.public_inputs, c.expected_publics());
        Ok(())
    }

    /// bridge_out's C, claimed by bridge_in: same C, and the claim nullifier
    /// the admin derives from bridge_out's ciphertext.
    #[test]
    fn bridge_in_claims_the_message_bridge_out_made() -> Result<()> {
        let out = out_case();
        let c = in_case();
        assert_eq!(out.bridge_message(), c.leaf());
        let msg = decrypt_note(&out.ciphertexts()[5], admin().0);
        assert_eq!(claim_nullifier(msg.blinding), claim_nullifier(c.claim_secret));
        assert!(in_accepted(&c)?);
        Ok(())
    }

    /// SPEC.md B1: Ethereum -> Stellar claim on Stellar with scale 10.
    #[test]
    fn bridge_in_valid_on_stellar_with_scale_ten() -> Result<()> {
        let mut c = in_case();
        c.src = s(SEPOLIA);
        c.dst = Scalar::from(STELLAR_TESTNET);
        c.scale = s(10);
        c.amount = s(2_000_000);
        c.out_amounts = [s(20_000_000), s(0)];
        assert!(in_accepted(&c)?);
        // ...and claiming one stroop more than amount * 10 is refused.
        c.out_amounts = [s(20_000_001), s(0)];
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_an_unknown_root() -> Result<()> {
        let mut c = in_case();
        c.root_override = Some(c.tree().root() + s(1));
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_a_wrong_merkle_path() -> Result<()> {
        let mut c = in_case();
        c.path_element_tamper = true;
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_a_wrong_claim_nullifier() -> Result<()> {
        let mut c = in_case();
        c.claim_nullifier_override = Some(claim_nullifier(c.claim_secret) + s(1));
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    /// Minting: outputs worth one unit more than C carries.
    #[test]
    fn bridge_in_rejects_outputs_worth_more_than_the_message() -> Result<()> {
        let mut c = in_case();
        c.out_amounts[1] += s(1);
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_an_output_amount_over_the_range_limit() -> Result<()> {
        let mut c = in_case();
        c.out_amounts = [-s(1), s(1_234_568)];
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_a_wrong_output_commitment() -> Result<()> {
        let mut c = in_case();
        // A note for someone else than the recipient.
        c.commitment0_override = Some(commitment(c.out_amounts[0], derive_public_key(s(999)), c.out_blindings[0]));
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_an_amount_of_two_to_the_64() -> Result<()> {
        let mut c = in_case();
        c.amount = Scalar::from(1u128 << 64);
        c.out_amounts = [Scalar::from(1u128 << 64), s(0)];
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_a_scale_other_than_1_or_10() -> Result<()> {
        let mut c = in_case();
        c.scale = s(2);
        c.out_amounts = [s(2_469_134), s(0)];
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    /// The leaf was built for another destination chain (PLAN.md: wrong chain
    /// ID); the root and path are for that leaf.
    #[test]
    fn bridge_in_rejects_a_message_for_another_chain() -> Result<()> {
        let mut c = in_case();
        c.leaf_fields = Some((c.amount, c.asset, c.src, s(1), c.deadline));
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    /// A public deadline other than the one inside C (so a claim can't move
    /// its own deadline).
    #[test]
    fn bridge_in_rejects_a_different_deadline() -> Result<()> {
        let mut c = in_case();
        c.leaf_fields = Some((c.amount, c.asset, c.src, c.dst, c.deadline));
        c.deadline += s(1);
        assert!(!in_accepted(&c)?);
        Ok(())
    }

    #[test]
    fn bridge_in_rejects_any_tampered_ciphertext_wire() -> Result<()> {
        let inputs = in_case().inputs();
        for wire in 1..=10 {
            assert!(!accepted_with_tampered_wire("bridge_in", &inputs, wire)?, "output wire {wire}");
        }
        Ok(())
    }

    fn hex(v: &str) -> Scalar {
        use ark_ff::PrimeField;
        let bytes = (0..64).step_by(2).map(|i| u8::from_str_radix(&v[2 + i..4 + i], 16).expect("hex")).collect::<Vec<u8>>();
        Scalar::from_be_bytes_mod_order(&bytes)
    }

    /// SPEC.md vectors (contracts/ethereum/test/fixtures/spec_vectors.json):
    /// C, the claim nullifier and the refund commitment as these tests (and so
    /// the circuits) compute them.
    #[test]
    fn spec_vectors_match() {
        let cases = [
            (1_234_567u64, Scalar::from(STELLAR_TESTNET), s(SEPOLIA),
             "0x06a49f2251f94f6a938df4a314e2edc65e9248374a3ffcab8bf5db79be65ede5",
             "0x16662d8bb77f55d75e6c926ed1f442af3da6b33b67712f593d15c439e793ca26", 493_000u64,
             "0x02c044ae68d5b5f49a84c83a1d6fac77d69929054971f6fd8415c80f99cf98e7",
             "0x0ee9fbd40a110c62fbef35ac20370dca69b5f6aed5e8f6d18b3cb5d256ee4f53", 12_345_670u64,
             "0x1e1acb38c9a7381f619b9cdfb7c93b613ba78cb2b9c033d961a232152b5edfe6",
             "0x119a4c4d78ef24ac6ba2815a0685b43e38e94339126d00175c344ddc3be93e58",
             "0x12ff142fbab872cf42419e33e3d4af38725dad8890d3a64a136810a3acd2ca54"),
            (2_000_000u64, s(SEPOLIA), Scalar::from(STELLAR_TESTNET),
             "0x2a1740d6a459e41e33e2a01ffb57db12c238f6444f9d7fe327b14c310774cbf8",
             "0x121d96a67ff34b4424a240400d329d241c47e6d3eeb44d0fe6bfb145a6a1cc53", 494_000u64,
             "0x198926851845855259094c0c0ca0043e33062140c9ce82a3265b4d90af65dc55",
             "0x28450f3d1ca1fde1b4bd66df1b19b89266fca679dcf328c36f0a63e12839239e", 2_000_000u64,
             "0x2d9553606bd68c60487faaeac16f70ea3b4451abaed7e904963e3bddcf3924e1",
             "0x0682e112e8f199c12030998e1311a56537b850f0674cb1e642d3aa990220a5a4",
             "0x0e95e66bfe232e444375cef7521ab4c60de171e232e2473cd7c59e2aa7eb8685"),
        ];
        for (amount, src, dst, pk, secret, deadline, c, claim, refund_value, refund_pk, refund_blinding, refund) in cases {
            assert_eq!(bridge_message(s(amount), s(1), src, dst, hex(pk), hex(secret), s(deadline)), hex(c));
            assert_eq!(claim_nullifier(hex(secret)), hex(claim));
            assert_eq!(commitment(s(refund_value), hex(refund_pk), hex(refund_blinding)), hex(refund));
        }
    }

    /// The admin decrypts both new notes.
    #[test]
    fn bridge_in_admin_recovers_the_new_notes() -> Result<()> {
        let c = in_case();
        for (k, ct) in c.ciphertexts().iter().enumerate() {
            let n = decrypt_note(ct, admin().0);
            assert_eq!((n.pk, n.amount, n.blinding), (c.recipient_pk, c.out_amounts[k], c.out_blindings[k]));
        }
        Ok(())
    }
}
