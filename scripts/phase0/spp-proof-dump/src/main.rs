//! Phase 0 smoke test helper (ZKross). Proves one real SPP deposit on the
//! `policy_tx_2_2_gvk_T` circuit with SPP's committed testnet proving key,
//! through SPP's own SDK prover, and writes it in snarkjs JSON format.
//!
//! Usage: spp-proof-dump <spp_repo> <r1cs_path> <out_dir>
use anyhow::{Context, Result, bail};
use num_bigint::BigUint;
use serde_json::json;
use std::{fs, path::PathBuf};
use stellar_private_payments::{
    prover::ProverEngine,
    types::{
        BabyJubJubPoint, EncryptionPublicKey, ExtAmount, Field, GvkMode, NoteAmount,
        NotePrivateKey, PolicyFlags,
    },
    zk::flows::{TransactOutput, TransactParams},
};

const STEM: &str = "policy_tx_2_2_gvk_T";

fn field_u64(v: u64) -> Field {
    let mut le = [0u8; 32];
    le[..8].copy_from_slice(&v.to_le_bytes());
    Field::from_le_bytes_mod_order(le)
}

fn dec_be(b: &[u8]) -> String {
    BigUint::from_bytes_be(b).to_str_radix(10)
}

fn dec_field(f: &Field) -> String {
    dec_be(&f.to_be_bytes())
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() != 4 {
        bail!("usage: spp-proof-dump <spp_repo> <r1cs_path> <out_dir>");
    }
    let repo = PathBuf::from(&args[1]);
    let keys = repo.join("deployments/testnet/circuit_keys");
    let pk = fs::read(keys.join(format!("{STEM}_proving_key.bin"))).context("proving key")?;
    let graph = fs::read(keys.join(format!("{STEM}.graph.bin"))).context("graph")?;
    let r1cs = fs::read(&args[2]).context("r1cs")?;
    let out = PathBuf::from(&args[3]);
    fs::create_dir_all(&out)?;

    // Throwaway test values only (no real keys): the admin view key is
    // 0x5EED * BASE8, the scalar SPP's own circuit tests use.
    let admin_view_key = BabyJubJubPoint::from_priv_scalar(&field_u64(0x5EED))
        .context("admin view key")?;
    let pool = stellar_strkey::Contract([0x11; 32]).to_string().as_str().to_owned();
    let token = stellar_strkey::Contract([0x22; 32]).to_string().as_str().to_owned();
    let mut priv_key = [0u8; 32];
    priv_key[0] = 0x2a;

    let params = TransactParams {
        priv_key: NotePrivateKey(priv_key),
        encryption_pubkey: EncryptionPublicKey([0x33; 32]),
        // Empty pool: dummy inputs are not checked against the root.
        pool_root: field_u64(0),
        pool_address: pool.clone(),
        token_address: token.clone(),
        ext_recipient: pool.clone(),
        ext_amount: ExtAmount::from(100i128),
        inputs: Vec::new(),
        outputs: vec![
            TransactOutput {
                amount: NoteAmount::from(60u128),
                blinding: field_u64(33),
                recipient_note_pubkey: None,
                recipient_encryption_pubkey: None,
            },
            TransactOutput {
                amount: NoteAmount::from(40u128),
                blinding: field_u64(44),
                recipient_note_pubkey: None,
                recipient_encryption_pubkey: None,
            },
        ],
        membership_proof: None,
        non_membership_proof: None,
        tree_depth: 20,
        asp_depth: 20,
        smt_depth: 20,
        policy_flags: PolicyFlags::from_bits(0)?,
        gvk_mode: GvkMode::Traceable,
        admin_view_key: Some(admin_view_key.clone()),
    };

    let engine = ProverEngine::new(&pk, &graph, &r1cs)?;
    // prove_transact also verifies the proof with SPP's arkworks verifier.
    let tx = engine.prove_transact(params)?;
    let p = &tx.proof_uncompressed;
    if p.len() != 256 {
        bail!("unexpected proof length {}", p.len());
    }

    // SPP layout: A = x||y, B = x.c1||x.c0||y.c1||y.c0, C = x||y (all BE).
    // snarkjs stores Fq2 as [c0, c1].
    let proof_json = json!({
        "protocol": "groth16",
        "curve": "bn128",
        "pi_a": [dec_be(&p[0..32]), dec_be(&p[32..64]), "1"],
        "pi_b": [
            [dec_be(&p[96..128]), dec_be(&p[64..96])],
            [dec_be(&p[160..192]), dec_be(&p[128..160])],
            ["1", "0"]
        ],
        "pi_c": [dec_be(&p[192..224]), dec_be(&p[224..256]), "1"],
    });

    // Public inputs in the order pool-gvk's verify_proof builds them.
    let pr = &tx.prepared;
    let out_cts = pr.output_gvk_ciphertexts.clone().context("output cts")?;
    let in_cts = pr.input_gvk_ciphertexts.clone().context("input cts")?;
    let cts: Vec<_> = in_cts.iter().chain(out_cts.iter()).cloned().collect();
    let mut publics: Vec<String> = Vec::new();
    for ct in &cts {
        publics.push(dec_field(&ct.r.x));
        publics.push(dec_field(&ct.r.y));
    }
    for ct in &cts {
        publics.push(dec_field(&ct.c1));
    }
    for ct in &cts {
        publics.push(dec_field(&ct.c2));
    }
    for ct in &cts {
        publics.push(dec_field(&ct.c3));
    }
    let ext_hash = dec_be(&pr.ext_data_hash_be);
    publics.push(dec_field(&admin_view_key.x));
    publics.push(dec_field(&admin_view_key.y));
    publics.push(ext_hash.clone()); // nonce = ext_data_hash
    publics.push(dec_field(&pr.pool_root));
    publics.push(dec_field(&pr.public_amount));
    publics.push(ext_hash);
    for n in &pr.input_nullifiers {
        publics.push(dec_field(n));
    }
    for c in &pr.output_commitments {
        publics.push(dec_field(c));
    }

    fs::write(out.join("proof.json"), serde_json::to_string_pretty(&proof_json)?)?;
    fs::write(out.join("public.json"), serde_json::to_string_pretty(&publics)?)?;
    fs::write(
        out.join("meta.json"),
        serde_json::to_string_pretty(&json!({
            "circuit": STEM,
            "pool_address": pool,
            "token_address": token,
            "ext_amount": 100,
            "admin_view_key_scalar": "0x5EED (test only)",
            "proof_uncompressed_hex": p.iter().map(|b| format!("{b:02x}")).collect::<String>(),
            "num_public_inputs": publics.len(),
        }))?,
    )?;
    println!("wrote {} public inputs to {}", publics.len(), out.display());
    Ok(())
}
