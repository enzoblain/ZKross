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
use soroban_sdk::{Bytes, Env, U256};
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
    });
    std::fs::write(&out, serde_json::to_string_pretty(&doc).unwrap()).unwrap();
    println!("ok: {} compress, {} hash2, {} hash3, {} zero hashes -> {out}",
        doc["compress"].as_array().unwrap().len(), doc["hash2"].as_array().unwrap().len(),
        doc["hash3_offchain_t4"].as_array().unwrap().len(), doc["zero_hashes"].as_array().unwrap().len());
}
