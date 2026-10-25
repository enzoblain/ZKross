//! Phase 0 (ZKross): Poseidon2 test vectors from SPP's own code.
//!
//! Every value comes from SPP's on-chain implementation
//! (`soroban_utils::poseidon2_*`, run through the real Soroban host in test
//! mode) and is cross-checked against SPP's off-chain implementation
//! (`taceo_poseidon2`, which the SDK and circuits tests use). The round
//! constants are read out of `soroban_utils::constants`, so the Solidity
//! library can be generated from them without copying by hand.
//!
//! Usage: spp-poseidon2-vectors <out.json>
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use num_bigint::BigUint;
use serde_json::{Value, json};
use pool_core::merkle_with_history::MerkleTreeWithHistory;
use soroban_sdk::{Bytes, Env, U256, contract, contractimpl};
use soroban_utils::{
    constants::{get_round_constants_t2, get_round_constants_t3},
    poseidon2::{get_zeroes, poseidon2_compress, poseidon2_hash2},
};
use taceo_poseidon2::bn254::{t2, t3, t4};

fn u256_to_big(u: &U256) -> BigUint {
    let b = u.to_be_bytes();
    let mut buf = [0u8; 32];
    b.copy_into_slice(&mut buf);
    BigUint::from_bytes_be(&buf)
}

fn big_to_u256(env: &Env, v: &BigUint) -> U256 {
    let mut buf = [0u8; 32];
    let be = v.to_bytes_be();
    buf[32 - be.len()..].copy_from_slice(&be);
    U256::from_be_bytes(env, &Bytes::from_array(env, &buf))
}

fn fr(v: &BigUint) -> Fr {
    Fr::from_be_bytes_mod_order(&v.to_bytes_be())
}

fn fr_big(f: &Fr) -> BigUint {
    BigUint::from_bytes_be(&f.into_bigint().to_bytes_be())
}

fn hex(v: &BigUint) -> String {
    format!("0x{:064x}", v)
}

/// Deterministic pseudo-random field elements (splitmix64 limbs, reduced).
fn sample(seed: u64, r: &BigUint) -> BigUint {
    let mut s = seed;
    let mut next = || {
        s = s.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = s;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    };
    let mut v = BigUint::from(0u8);
    for _ in 0..4 {
        v = (v << 64u32) + BigUint::from(next());
    }
    v % r
}

/// Contract frame for running SPP's Merkle tree, which needs contract storage.
#[contract]
struct TreeHost;

#[contractimpl]
impl TreeHost {
    pub fn noop() {}
}

/// Inserts `pairs` leaf pairs into a fresh SPP tree of `levels` and returns
/// the leaves and the root after each insertion.
fn merkle_case(env: &Env, levels: u32, pairs: u64, seed: u64, r: &BigUint) -> Value {
    let id = env.register(TreeHost, ());
    env.as_contract(&id, || {
        MerkleTreeWithHistory::init(env, levels).unwrap();
        let empty = u256_to_big(&MerkleTreeWithHistory::get_last_root(env).unwrap());
        let mut leaves = Vec::new();
        let mut roots = Vec::new();
        for i in 0..pairs {
            let a = sample(seed + 2 * i, r);
            let b = sample(seed + 2 * i + 1, r);
            let (ia, ib) =
                MerkleTreeWithHistory::insert_two_leaves(env, big_to_u256(env, &a), big_to_u256(env, &b))
                    .unwrap();
            assert_eq!((u64::from(ia), u64::from(ib)), (2 * i, 2 * i + 1));
            leaves.push(hex(&a));
            leaves.push(hex(&b));
            roots.push(hex(&u256_to_big(&MerkleTreeWithHistory::get_last_root(env).unwrap())));
        }
        json!({ "levels": levels, "empty_root": hex(&empty), "leaves": leaves, "roots": roots })
    })
}

fn main() {
    let out = std::env::args().nth(1).expect("usage: spp-poseidon2-vectors <out.json>");
    let env = Env::default();
    let r = fr_big(&(-Fr::from(1u64))) + 1u32;

    let consts = |rc: soroban_sdk::Vec<soroban_sdk::Vec<U256>>| -> Value {
        rc.iter()
            .map(|row| Value::from(row.iter().map(|c| hex(&u256_to_big(&c))).collect::<Vec<_>>()))
            .collect()
    };

    let rm1 = &r - 1u32;
    let zero_leaf = u256_to_big(&get_zeroes(&env).get(0).unwrap());
    let mut pairs: Vec<(BigUint, BigUint)> = vec![
        (0u32.into(), 0u32.into()),
        (1u32.into(), 2u32.into()),
        (2u32.into(), 1u32.into()),
        (rm1.clone(), rm1.clone()),
        (rm1.clone(), 0u32.into()),
        (0u32.into(), rm1.clone()),
        (zero_leaf.clone(), zero_leaf.clone()),
    ];
    for i in 0..8u64 {
        pairs.push((sample(2 * i + 1, &r), sample(2 * i + 2, &r)));
    }

    let mut compress = Vec::new();
    for (a, b) in &pairs {
        let onchain = u256_to_big(&poseidon2_compress(&env, big_to_u256(&env, a), big_to_u256(&env, b)));
        let offchain = fr_big(&(t2::permutation(&[fr(a), fr(b)])[0] + fr(a)));
        assert_eq!(onchain, offchain, "compress mismatch");
        compress.push(json!({ "left": hex(a), "right": hex(b), "out": hex(&onchain) }));
    }

    let mut hash2 = Vec::new();
    for (i, (a, b)) in pairs.iter().enumerate() {
        for sep in [0u32, 1, 3, u32::try_from(i).unwrap() + 7] {
            let sep_b = BigUint::from(sep);
            let onchain = u256_to_big(&poseidon2_hash2(
                &env,
                big_to_u256(&env, a),
                big_to_u256(&env, b),
                Some(big_to_u256(&env, &sep_b)),
            ));
            let offchain = fr_big(&t3::permutation(&[fr(a), fr(b), fr(&sep_b)])[0]);
            assert_eq!(onchain, offchain, "hash2 mismatch");
            hash2.push(json!({ "a": hex(a), "b": hex(b), "sep": sep, "out": hex(&onchain) }));
        }
    }

    // Off-chain only (no Soroban equivalent): t=4, used for commitments,
    // nullifiers and the zero leaf.
    let mut hash3 = Vec::new();
    let triples: Vec<(BigUint, BigUint, BigUint, u32)> = vec![
        (88u32.into(), 76u32.into(), 77u32.into(), 0), // "XLM": the zero leaf
        (100u32.into(), sample(100, &r), sample(101, &r), 1),
        (sample(102, &r), 5u32.into(), sample(103, &r), 2),
    ];
    for (a, b, c, sep) in &triples {
        let outv = fr_big(&t4::permutation(&[fr(a), fr(b), fr(c), Fr::from(u64::from(*sep))])[0]);
        hash3.push(json!({ "a": hex(a), "b": hex(b), "c": hex(c), "sep": sep, "out": hex(&outv) }));
    }
    assert_eq!(hash3[0]["out"], json!(hex(&zero_leaf)), "zero leaf != poseidon2(\"XLM\")");

    let zeroes: Vec<String> = get_zeroes(&env).iter().map(|z| hex(&u256_to_big(&z))).collect();
    for lvl in 1..zeroes.len() {
        let below = u256_to_big(&get_zeroes(&env).get(u32::try_from(lvl - 1).unwrap()).unwrap());
        let c = u256_to_big(&poseidon2_compress(&env, big_to_u256(&env, &below), big_to_u256(&env, &below)));
        assert_eq!(hex(&c), zeroes[lvl], "zero hash level {lvl}");
    }

    let doc = json!({
        "source": "SPP soroban_utils (Soroban host) cross-checked against taceo_poseidon2",
        "modulus": hex(&r),
        "t2": { "d": 5, "rounds_f": 8, "rounds_p": 56, "mat_diag_m_1": [1, 2],
                "round_constants": consts(get_round_constants_t2(&env)) },
        "t3": { "d": 5, "rounds_f": 8, "rounds_p": 56, "mat_diag_m_1": [1, 1, 2],
                "round_constants": consts(get_round_constants_t3(&env)) },
        "compress": compress,
        "hash2": hash2,
        "hash3_offchain_t4": hash3,
        "zero_hashes": zeroes,
        // SPP's pool-core Merkle tree, run in the Soroban host.
        "merkle": [
            merkle_case(&env, 3, 4, 1000, &r),
            merkle_case(&env, 20, 6, 2000, &r),
        ],
    });
    std::fs::write(&out, serde_json::to_string_pretty(&doc).unwrap()).unwrap();
    println!("ok: {} compress, {} hash2, {} hash3, {} zero hashes -> {out}",
        doc["compress"].as_array().unwrap().len(), doc["hash2"].as_array().unwrap().len(),
        doc["hash3_offchain_t4"].as_array().unwrap().len(), doc["zero_hashes"].as_array().unwrap().len());

    if let Some(spec_out) = std::env::args().nth(2) {
        let spec = spec_vectors(&env, &r);
        std::fs::write(&spec_out, serde_json::to_string_pretty(&spec).unwrap()).unwrap();
        println!("ok: SPEC.md vectors -> {spec_out}");
    }
}

// ========== SPEC.md Part B vectors ==========

fn p2(a: &BigUint, b: &BigUint, tag: u64) -> BigUint {
    fr_big(&t3::permutation(&[fr(a), fr(b), Fr::from(tag)])[0])
}

fn p3(a: &BigUint, b: &BigUint, c: &BigUint, tag: u64) -> BigUint {
    fr_big(&t4::permutation(&[fr(a), fr(b), fr(c), Fr::from(tag)])[0])
}

const TAG_COMMITMENT: u64 = 0x01;
const TAG_PUBKEY: u64 = 0x03;
const TAG_BRIDGE: u64 = 0x07;
const TAG_CLAIM: u64 = 0x08;

/// SPEC.md B2: 2^64 + the first 8 bytes of sha256(passphrase), big-endian.
fn stellar_chain_id(passphrase: &str) -> BigUint {
    use sha2::{Digest, Sha256};
    let h = Sha256::digest(passphrase.as_bytes());
    (BigUint::from(1u8) << 64u32) + BigUint::from_bytes_be(&h[..8])
}

fn keccak(data: &[u8]) -> [u8; 32] {
    use sha3::{Digest, Keccak256};
    Keccak256::digest(data).into()
}

fn be32(v: &BigUint) -> [u8; 32] {
    let mut out = [0u8; 32];
    let b = v.to_bytes_be();
    out[32 - b.len()..].copy_from_slice(&b);
    out
}

/// SPEC.md B12, signed with the throwaway test key 1.
fn attestation(src_chain: &BigUint, pool_id: [u8; 32], c: &BigUint, status: u8) -> Value {
    use k256::ecdsa::SigningKey;
    let mut msg = Vec::new();
    msg.extend_from_slice(b"ZKROSS-ATTEST-v1");
    msg.extend_from_slice(&be32(src_chain));
    msg.extend_from_slice(&pool_id);
    msg.extend_from_slice(&be32(c));
    msg.push(status);
    let digest = keccak(&msg);
    let mut sk_bytes = [0u8; 32];
    sk_bytes[31] = 1;
    let sk = SigningKey::from_bytes(&sk_bytes.into()).unwrap();
    let (sig, recid) = sk.sign_prehash_recoverable(&digest).unwrap();
    let sig = sig.normalize_s().map(|s| (s, true)).unwrap_or((sig, false));
    // normalize_s returns Some if it flipped s; flipping s flips the recovery bit.
    let (sig, flipped) = sig;
    let v = 27 + (recid.to_byte() ^ u8::from(flipped));
    let pubkey = sk.verifying_key().to_encoded_point(false);
    let addr = &keccak(&pubkey.as_bytes()[1..])[12..];
    let mut sig65 = sig.to_bytes().to_vec();
    sig65.push(v);
    json!({
        "status": status,
        "message": format!("0x{}", msg.iter().map(|b| format!("{b:02x}")).collect::<String>()),
        "digest": format!("0x{}", digest.iter().map(|b| format!("{b:02x}")).collect::<String>()),
        "signature": format!("0x{}", sig65.iter().map(|b| format!("{b:02x}")).collect::<String>()),
        "attester_address": format!("0x{}", addr.iter().map(|b| format!("{b:02x}")).collect::<String>()),
    })
}

fn spec_vectors(env: &Env, r: &BigUint) -> Value {
    let zero = BigUint::from(0u8);
    let stellar = stellar_chain_id("Test SDF Network ; September 2015");
    let sepolia = BigUint::from(11_155_111u64);
    let asset = BigUint::from(1u8);

    // (amount in bridge units, src, scale_src, dst, scale_dst, seed)
    let cases = [
        (1_234_567u64, &stellar, 10u64, &sepolia, 1u64, 3000u64),
        (2_000_000u64, &sepolia, 1u64, &stellar, 10u64, 4000u64),
    ];
    let mut messages = Vec::new();
    let id = env.register(TreeHost, ());
    env.as_contract(&id, || MerkleTreeWithHistory::init(env, 20).unwrap());
    for (amount, src, scale_src, dst, scale_dst, seed) in cases {
        let amount_b = BigUint::from(amount);
        let recipient_sk = sample(seed, r);
        let recipient_pk = p2(&recipient_sk, &zero, TAG_PUBKEY);
        let claim_secret = sample(seed + 1, r);
        let deadline_bucket = BigUint::from(490_000u64 + seed);
        let h1 = p3(&amount_b, &asset, src, TAG_BRIDGE);
        let h2 = p3(&h1, dst, &recipient_pk, TAG_BRIDGE);
        let c = p3(&h2, &claim_secret, &deadline_bucket, TAG_BRIDGE);
        let claim_nullifier = p2(&claim_secret, &zero, TAG_CLAIM);
        let refund_pk = p2(&sample(seed + 2, r), &zero, TAG_PUBKEY);
        let refund_blinding = sample(seed + 3, r);
        let refund_value = BigUint::from(amount * scale_src);
        let refund_commitment = p3(&refund_value, &refund_pk, &refund_blinding, TAG_COMMITMENT);
        let outbox_root = env.as_contract(&id, || {
            MerkleTreeWithHistory::insert_two_leaves(env, big_to_u256(env, &c), big_to_u256(env, &zero)).unwrap();
            u256_to_big(&MerkleTreeWithHistory::get_last_root(env).unwrap())
        });
        messages.push(json!({
            "amount": amount, "asset_id": 1, "src_chain": src.to_str_radix(10), "dst_chain": dst.to_str_radix(10),
            "scale_src": scale_src, "scale_dst": scale_dst,
            "recipient_sk": hex(&recipient_sk), "recipient_pk": hex(&recipient_pk),
            "claim_secret": hex(&claim_secret), "deadline_bucket": deadline_bucket.to_str_radix(10),
            "h1": hex(&h1), "h2": hex(&h2), "C": hex(&c),
            "claim_nullifier": hex(&claim_nullifier),
            "refund_pk": hex(&refund_pk), "refund_blinding": hex(&refund_blinding),
            "refund_value": amount * scale_src, "refund_commitment": hex(&refund_commitment),
            "dst_value": amount * scale_dst,
            "outbox_root_after_insert": hex(&outbox_root),
        }));
    }

    let decimals: Vec<Value> = [12_345_678u64, 10, 9, 0, 70_000_001, 20_000_000]
        .iter()
        .map(|&stroops| json!({
            "stellar_stroops": stroops, "bridge_amount": stroops / 10, "stellar_change": stroops % 10,
            "ethereum_units": stroops / 10, "back_to_stellar_stroops": (stroops / 10) * 10,
        }))
        .collect();

    let c0 = BigUint::parse_bytes(messages[0]["C"].as_str().unwrap()[2..].as_bytes(), 16).unwrap();
    let mut eth_pool = [0u8; 32];
    eth_pool[12..].copy_from_slice(&[0x11; 20]);
    let attestations = vec![
        attestation(&stellar, [0x22; 32], &c0, 0x01),
        attestation(&sepolia, eth_pool, &c0, 0x02),
    ];

    json!({
        "source": "SPEC.md Part B, computed with SPP's taceo_poseidon2 and SPP's pool-core tree in the Soroban host",
        "tags": { "bridge": TAG_BRIDGE, "claim": TAG_CLAIM },
        "chain_ids": { "stellar_testnet": stellar.to_str_radix(10), "sepolia": sepolia.to_str_radix(10) },
        "asset_id_usdc": 1,
        "bridge_messages": messages,
        "decimal_conversion": decimals,
        "attestations": {
            "attester_private_key": "0x0000000000000000000000000000000000000000000000000000000000000001 (public test key, never fund)",
            "stellar_source_pool_id": format!("0x{}", "22".repeat(32)),
            "ethereum_source_pool_id": format!("0x{}", hex_bytes(&eth_pool)),
            "cases": attestations,
        },
    })
}

fn hex_bytes(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}
