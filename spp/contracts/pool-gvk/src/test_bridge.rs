//! ZKross bridge functions on Stellar (SPEC.md Part B), the same cases as the
//! Ethereum suite (contracts/ethereum/test/ShieldedPoolBridge.t.sol).
//!
//! `StrictVerifier` accepts a proof only with the exact public inputs a test
//! registered, built here independently of the pool. The cost test instead
//! uses SPP's `TestVerifier` with a toy Groth16 circuit of the real input
//! count, so verification costs what it costs on-chain.
extern crate alloc;
extern crate std;

use crate::{
    BridgeConfig, BridgeInExtData, BridgeInProof, BridgeOutExtData, BridgeOutProof, Error, ExtData,
    PoolGvkContract, PoolGvkContractClient, Proof,
    gvk::{BabyJubJubPoint, GvkCiphertext, TRACEABLE},
    pool_gvk::DataKey,
    test::{KDF_DOMAIN, TestVerifier, groth16_fixture_for, mk_mock_groth16_proof, mk_point, setup_test_contracts, test_env, wasm_hash},
};
use ark_bn254::Fr as ArkFr;
use ark_ff::PrimeField;
use contract_types::{Groth16Error, Groth16Proof};
use k256::ecdsa::SigningKey;
use soroban_sdk::{
    Address, Bytes, BytesN, Env, I256, String, U256, Vec, contract, contractimpl, contracttype,
    crypto::bn254::Bn254Fr,
    testutils::{Address as _, Ledger as _, storage::Persistent as _},
    token::{Client as TokenClient, StellarAssetClient},
    xdr::ToXdr,
};
use soroban_utils::constants::bn256_modulus;

// ========== Strict mock verifier ==========

#[contracttype]
enum StrictKey {
    Accepted(BytesN<32>),
}

#[contract]
pub struct StrictVerifier;

fn strict_key(env: &Env, proof: &Groth16Proof, inputs: &Vec<Bn254Fr>) -> BytesN<32> {
    let mut b = proof.clone().to_xdr(env);
    b.append(&inputs.clone().to_xdr(env));
    env.crypto().keccak256(&b).into()
}

#[contractimpl]
impl StrictVerifier {
    pub fn expect(env: Env, proof: Groth16Proof, inputs: Vec<Bn254Fr>) {
        env.storage().instance().set(&StrictKey::Accepted(strict_key(&env, &proof, &inputs)), &true);
    }

    pub fn verify(env: Env, proof: Groth16Proof, public_inputs: Vec<Bn254Fr>) -> Result<bool, Groth16Error> {
        Ok(env.storage().instance().has(&StrictKey::Accepted(strict_key(&env, &proof, &public_inputs))))
    }
}

// ========== Fixture ==========

const SEPOLIA: u32 = 11_155_111;
/// SPEC.md B2: chain_id of Stellar testnet.
const STELLAR_TESTNET: u128 = 33_353_711_811_639_397_682;
const TESTNET_PASSPHRASE: &[u8] = b"Test SDF Network ; September 2015";
const NOW: u64 = 1_760_000_000;

struct Ctx {
    env: Env,
    pool: PoolGvkContractClient<'static>,
    token: Address,
    admin: Address,
    poster: Address,
    transact_v: Address,
    out_v: Address,
    in_v: Address,
    attester: SigningKey,
}

fn eth_address(env: &Env, sk: &SigningKey) -> BytesN<20> {
    let point = sk.verifying_key().to_encoded_point(false);
    let hashed = env.crypto().keccak256(&Bytes::from_slice(env, &point.as_bytes()[1..])).to_array();
    let mut a = [0u8; 20];
    a.copy_from_slice(&hashed[12..]);
    BytesN::from_array(env, &a)
}

fn attester_key(seed: u8) -> SigningKey {
    SigningKey::from_bytes(&[seed; 32].into()).expect("valid test key")
}

fn deploy_pool(env: &Env) -> (PoolGvkContractClient<'static>, Address, Address, Address) {
    let mut setup = setup_test_contracts(env);
    setup.token = env.register_stellar_asset_contract_v2(setup.admin.clone()).address();
    let transact_v = env.register(StrictVerifier, ());
    let pool_id = env.register(
        PoolGvkContract,
        (
            setup.admin.clone(),
            setup.token.clone(),
            transact_v.clone(),
            setup.asp_membership_address.clone(),
            setup.asp_non_membership_address.clone(),
            wasm_hash(&setup.asp_membership_address),
            wasm_hash(&setup.asp_non_membership_address),
            U256::from_u128(env, 1_000_000_000),
            10u32,
            0u32,
            String::from_str(env, KDF_DOMAIN),
            mk_point(env, 1, 2),
            TRACEABLE,
        ),
    );
    (PoolGvkContractClient::new(env, &pool_id), setup.token, setup.admin, transact_v)
}

fn config(env: &Env, poster: &Address, attester: &SigningKey, out_v: &Address, in_v: &Address) -> BridgeConfig {
    BridgeConfig {
        root_poster: poster.clone(),
        attester: eth_address(env, attester),
        remote_chain_id: U256::from_u32(env, SEPOLIA),
        asset_id: U256::from_u32(env, 1),
        bridge_out_verifier: out_v.clone(),
        bridge_in_verifier: in_v.clone(),
    }
}

fn ctx() -> Ctx {
    let env = test_env();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    let net = env.crypto().sha256(&Bytes::from_slice(&env, TESTNET_PASSPHRASE)).to_array();
    env.ledger().set_network_id(net);
    let (pool, token, admin, transact_v) = deploy_pool(&env);
    let out_v = env.register(StrictVerifier, ());
    let in_v = env.register(StrictVerifier, ());
    let poster = Address::generate(&env);
    let attester = attester_key(7);
    pool.init_bridge(&config(&env, &poster, &attester, &out_v, &in_v));
    Ctx { env, pool, token, admin, poster, transact_v, out_v, in_v, attester }
}

fn u(env: &Env, v: u64) -> U256 {
    U256::from_u128(env, u128::from(v))
}

fn ct(env: &Env, base: u32) -> GvkCiphertext {
    GvkCiphertext {
        r: BabyJubJubPoint { x: U256::from_u32(env, base), y: U256::from_u32(env, base + 1) },
        c1: U256::from_u32(env, base + 2),
        c2: U256::from_u32(env, base + 3),
        c3: U256::from_u32(env, base + 4),
    }
}

fn cts(env: &Env, n: u32, base: u32) -> Vec<GvkCiphertext> {
    let mut v = Vec::new(env);
    for i in 0..n {
        v.push_back(ct(env, base + 10 * i));
    }
    v
}

fn hour(env: &Env) -> u64 {
    env.ledger().timestamp() / 3600
}

fn out_ext(env: &Env) -> BridgeOutExtData {
    BridgeOutExtData {
        encrypted_output0: Bytes::from_slice(env, &[0xc0]),
        encrypted_output1: Bytes::from_slice(env, &[0xc1]),
        encrypted_refund: Bytes::from_slice(env, &[0xf0]),
        encrypted_bridge_message: Bytes::from_slice(env, &[0xb0, 0xb0]),
    }
}

fn in_ext(env: &Env) -> BridgeInExtData {
    BridgeInExtData { encrypted_output0: Bytes::from_slice(env, &[0xd0]), encrypted_output1: Bytes::from_slice(env, &[0xd1]) }
}

fn mk_out(c: &Ctx, n0: u32, n1: u32, msg: &U256) -> (BridgeOutProof, BridgeOutExtData) {
    let env = &c.env;
    let ext = out_ext(env);
    let p = BridgeOutProof {
        proof: mk_mock_groth16_proof(env),
        root: c.pool.get_root(),
        input_nullifiers: soroban_sdk::vec![env, U256::from_u32(env, n0), U256::from_u32(env, n1)],
        change_commitment0: U256::from_u32(env, 0x11),
        change_commitment1: U256::from_u32(env, 0x12),
        bridge_message: msg.clone(),
        refund_commitment: U256::from_u32(env, 0x13),
        deadline_bucket: hour(env) + 24,
        ext_data_hash: c.pool.hash_bridge_out_ext_data(&ext),
        ciphertexts: cts(env, 6, 100),
    };
    (p, ext)
}

fn mk_in(c: &Ctx, claim: u32, root: &U256) -> (BridgeInProof, BridgeInExtData) {
    let env = &c.env;
    let ext = in_ext(env);
    let p = BridgeInProof {
        proof: mk_mock_groth16_proof(env),
        remote_root: root.clone(),
        claim_nullifier: U256::from_u32(env, claim),
        output_commitment0: U256::from_u32(env, 0x21),
        output_commitment1: U256::from_u32(env, 0x22),
        deadline_bucket: hour(env) + 24,
        ext_data_hash: c.pool.hash_bridge_in_ext_data(&ext),
        ciphertexts: cts(env, 2, 200),
    };
    (p, ext)
}

#[derive(Clone)]
struct Pub {
    d: (u32, u32),
    scale: u32,
    asset: u32,
    src: U256,
    dst: U256,
}

fn out_pub(env: &Env) -> Pub {
    Pub { d: (1, 2), scale: 10, asset: 1, src: U256::from_u128(env, STELLAR_TESTNET), dst: U256::from_u32(env, SEPOLIA) }
}

fn in_pub(env: &Env) -> Pub {
    Pub { d: (1, 2), scale: 10, asset: 1, src: U256::from_u32(env, SEPOLIA), dst: U256::from_u128(env, STELLAR_TESTNET) }
}

fn f(env: &Env, v: &U256) -> Bn254Fr {
    let mut b = [0u8; 32];
    v.to_be_bytes().copy_into_slice(&mut b);
    Bn254Fr::from_bytes(BytesN::from_array(env, &b))
}

fn field_major(env: &Env, out: &mut Vec<Bn254Fr>, cts: &Vec<GvkCiphertext>) {
    for c in cts.iter() {
        out.push_back(f(env, &c.r.x));
        out.push_back(f(env, &c.r.y));
    }
    for c in cts.iter() {
        out.push_back(f(env, &c.c1));
    }
    for c in cts.iter() {
        out.push_back(f(env, &c.c2));
    }
    for c in cts.iter() {
        out.push_back(f(env, &c.c3));
    }
}

fn bytes_u256(env: &Env, b: &BytesN<32>) -> U256 {
    U256::from_be_bytes(env, &Bytes::from(b.clone()))
}

/// SPEC.md B8 `bridge_out` public signals, built independently.
fn out_inputs(env: &Env, p: &BridgeOutProof, q: &Pub) -> Vec<Bn254Fr> {
    let mut v = Vec::new(env);
    field_major(env, &mut v, &p.ciphertexts);
    let ext = bytes_u256(env, &p.ext_data_hash);
    for x in [U256::from_u32(env, q.d.0), U256::from_u32(env, q.d.1), ext.clone(), p.root.clone(), ext] {
        v.push_back(f(env, &x));
    }
    for n in p.input_nullifiers.iter() {
        v.push_back(f(env, &n));
    }
    for x in [
        p.change_commitment0.clone(),
        p.change_commitment1.clone(),
        p.bridge_message.clone(),
        p.refund_commitment.clone(),
        U256::from_u32(env, q.scale),
        U256::from_u32(env, q.asset),
        q.src.clone(),
        q.dst.clone(),
        u(env, p.deadline_bucket),
    ] {
        v.push_back(f(env, &x));
    }
    assert_eq!(v.len(), 46);
    v
}

/// SPEC.md B8 `bridge_in` public signals, built independently.
fn in_inputs(env: &Env, p: &BridgeInProof, q: &Pub) -> Vec<Bn254Fr> {
    let mut v = Vec::new(env);
    field_major(env, &mut v, &p.ciphertexts);
    let ext = bytes_u256(env, &p.ext_data_hash);
    for x in [
        U256::from_u32(env, q.d.0),
        U256::from_u32(env, q.d.1),
        ext.clone(),
        p.remote_root.clone(),
        ext,
        p.claim_nullifier.clone(),
        p.output_commitment0.clone(),
        p.output_commitment1.clone(),
        U256::from_u32(env, q.scale),
        U256::from_u32(env, q.asset),
        q.src.clone(),
        q.dst.clone(),
        u(env, p.deadline_bucket),
    ] {
        v.push_back(f(env, &x));
    }
    assert_eq!(v.len(), 23);
    v
}

fn accept_out(c: &Ctx, p: &BridgeOutProof) {
    StrictVerifierClient::new(&c.env, &c.out_v).expect(&p.proof, &out_inputs(&c.env, p, &out_pub(&c.env)));
}

fn accept_in(c: &Ctx, p: &BridgeInProof) {
    StrictVerifierClient::new(&c.env, &c.in_v).expect(&p.proof, &in_inputs(&c.env, p, &in_pub(&c.env)));
}

fn do_out(c: &Ctx, n0: u32, n1: u32, msg: &U256) -> BridgeOutProof {
    let (p, ext) = mk_out(c, n0, n1, msg);
    accept_out(c, &p);
    c.pool.bridge_out(&p, &ext, &Address::generate(&c.env));
    p
}

fn remote_root(env: &Env) -> U256 {
    U256::from_u32(env, 0xAAAA)
}

fn post(c: &Ctx, root: &U256) {
    c.pool.post_remote_root(root);
}

fn sign(c: &Ctx, sk: &SigningKey, pool: &PoolGvkContractClient, msg: &U256, status: u32) -> BytesN<65> {
    let digest = pool.attestation_digest(msg, &status).to_array();
    let (sig, recid) = sk.sign_prehash_recoverable(&digest).expect("sign");
    let (sig, recid) = match sig.normalize_s() {
        Some(low) => (low, recid.to_byte() ^ 1),
        None => (sig, recid.to_byte()),
    };
    let mut out = [0u8; 65];
    out[..64].copy_from_slice(&sig.to_bytes());
    out[64] = 27 + recid;
    BytesN::from_array(&c.env, &out)
}

fn to_settle_time(c: &Ctx, bucket: u64) {
    c.env.ledger().set_timestamp(bucket * 3600 + 3600);
}

fn err<T>(r: Result<Result<T, soroban_sdk::ConversionError>, Result<Error, soroban_sdk::InvokeError>>) -> Error {
    match r {
        Err(Ok(e)) => e,
        Err(Err(e)) => panic!("expected a pool error, got {e:?}"),
        Ok(_) => panic!("expected an error, call succeeded"),
    }
}

// ========== Configuration ==========

#[test]
fn init_bridge_stores_the_config_and_the_chain_id_matches_spec() {
    let c = ctx();
    let cfg = c.pool.get_bridge_config();
    assert_eq!(cfg.root_poster, c.poster);
    assert_eq!(cfg.attester, eth_address(&c.env, &c.attester));
    assert_eq!(cfg.remote_chain_id, U256::from_u32(&c.env, SEPOLIA));
    assert_eq!(cfg.bridge_out_verifier, c.out_v);
    assert_eq!(cfg.bridge_in_verifier, c.in_v);
    // SPEC.md B2, from the ledger's network ID.
    assert_eq!(c.pool.chain_id(), U256::from_u128(&c.env, STELLAR_TESTNET));
    assert_eq!(c.pool.outbox_next_index(), 0);
}

#[test]
fn init_bridge_runs_only_once() {
    let c = ctx();
    let again = config(&c.env, &Address::generate(&c.env), &attester_key(9), &c.in_v, &c.out_v);
    assert_eq!(err(c.pool.try_init_bridge(&again)), Error::AlreadyInitialized);
    assert_eq!(c.pool.get_bridge_config().bridge_out_verifier, c.out_v, "the verifiers can't be replaced");
}

#[test]
fn init_bridge_requires_the_admin() {
    let env = test_env();
    env.mock_all_auths();
    let (pool, ..) = deploy_pool(&env);
    let v = env.register(StrictVerifier, ());
    let cfg = config(&env, &Address::generate(&env), &attester_key(7), &v, &v);
    env.mock_auths(&[]);
    assert!(pool.try_init_bridge(&cfg).is_err());
}

#[test]
fn init_bridge_rejects_an_invalid_config() {
    let env = test_env();
    env.mock_all_auths();
    let (pool, ..) = deploy_pool(&env);
    let v = env.register(StrictVerifier, ());
    let base = config(&env, &Address::generate(&env), &attester_key(7), &v, &v);
    let r = bn256_modulus(&env);
    let zero = U256::from_u32(&env, 0);
    let cases = [
        BridgeConfig { remote_chain_id: zero.clone(), ..base.clone() },
        BridgeConfig { remote_chain_id: r.clone(), ..base.clone() },
        BridgeConfig { remote_chain_id: pool.chain_id(), ..base.clone() },
        BridgeConfig { asset_id: zero, ..base.clone() },
        BridgeConfig { asset_id: r, ..base.clone() },
    ];
    for cfg in cases {
        assert_eq!(err(pool.try_init_bridge(&cfg)), Error::InvalidBridgeConfig);
    }
}

#[test]
fn bridge_functions_refuse_before_init_bridge() {
    let env = test_env();
    env.mock_all_auths();
    let (pool, ..) = deploy_pool(&env);
    assert_eq!(err(pool.try_post_remote_root(&U256::from_u32(&env, 1))), Error::NotInitialized);
    assert_eq!(err(pool.try_get_outbox_root()), Error::NotInitialized);
}

// ========== post_remote_root and add_liquidity ==========

#[test]
fn post_remote_root_records_the_root() {
    let c = ctx();
    let root = remote_root(&c.env);
    assert!(!c.pool.is_known_remote_root(&root));
    post(&c, &root);
    // The root poster authorized it.
    assert_eq!(c.env.auths()[0].0, c.poster);
    assert!(c.pool.is_known_remote_root(&root));
}

#[test]
fn post_remote_root_requires_the_root_poster() {
    let c = ctx();
    c.env.mock_auths(&[]);
    assert!(c.pool.try_post_remote_root(&remote_root(&c.env)).is_err());
}

#[test]
fn post_remote_root_refuses_zero_and_non_canonical_roots() {
    let c = ctx();
    assert_eq!(err(c.pool.try_post_remote_root(&U256::from_u32(&c.env, 0))), Error::UnknownRemoteRoot);
    assert_eq!(err(c.pool.try_post_remote_root(&bn256_modulus(&c.env))), Error::NonCanonicalPublicInput);
}

#[test]
fn add_liquidity_moves_tokens_into_the_pool() {
    let c = ctx();
    StellarAssetClient::new(&c.env, &c.token).mint(&c.admin, &50_000_000);
    c.pool.add_liquidity(&50_000_000);
    let t = TokenClient::new(&c.env, &c.token);
    assert_eq!(t.balance(&c.pool.address), 50_000_000);
    assert_eq!(t.balance(&c.admin), 0);
    assert_eq!(err(c.pool.try_add_liquidity(&0)), Error::WrongExtAmount);
}

#[test]
fn add_liquidity_requires_the_admin() {
    let c = ctx();
    c.env.mock_auths(&[]);
    assert!(c.pool.try_add_liquidity(&1).is_err());
}

// ========== bridge_out ==========

/// The SPEC.md vector C (0x02c0...): the outbox root after inserting (C, 0)
/// must be the vector's, which SPP's own tree and the Solidity tree give.
#[test]
fn bridge_out_spends_and_appends_to_the_outbox_like_spp_and_ethereum() {
    let c = ctx();
    let msg = U256::from_be_bytes(
        &c.env,
        &Bytes::from_array(&c.env, &hex32("02c044ae68d5b5f49a84c83a1d6fac77d69929054971f6fd8415c80f99cf98e7")),
    );
    let p = do_out(&c, 0xA1, 0xA2, &msg);
    assert!(c.pool.is_spent(&U256::from_u32(&c.env, 0xA1)));
    assert!(c.pool.is_spent(&U256::from_u32(&c.env, 0xA2)));
    assert_eq!(c.pool.outbox_next_index(), 2);
    let expected_root = U256::from_be_bytes(
        &c.env,
        &Bytes::from_array(&c.env, &hex32("127e678fec81caf0c995ec3dae1efb6bc30c3292b69b6dd972ac23a591ef3bd6")),
    );
    assert_eq!(c.pool.get_outbox_root(), expected_root);
    let m = c.pool.get_pending_message(&msg).expect("pending");
    assert_eq!((m.status, m.deadline_bucket, m.outbox_index), (1, p.deadline_bucket, 0));
    assert_eq!(m.refund_commitment, U256::from_u32(&c.env, 0x13));
}

fn hex32(s: &str) -> [u8; 32] {
    let mut b = [0u8; 32];
    for (i, byte) in b.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&s[2 * i..2 * i + 2], 16).expect("hex");
    }
    b
}

/// D, scale (10 on Stellar), asset and both chain IDs come from the contract.
#[test]
fn bridge_out_supplies_d_scale_asset_and_chain_ids() {
    let c = ctx();
    let env = &c.env;
    for i in 0..6u32 {
        let (p, ext) = mk_out(&c, 0xB0 + 2 * i, 0xB1 + 2 * i, &U256::from_u32(env, 0xC0 + i));
        let mut q = out_pub(env);
        match i {
            0 => q.d = (99, 100),
            1 => q.scale = 1,
            2 => q.asset = 2,
            3 => q.src = U256::from_u32(env, SEPOLIA),
            4 => q.dst = U256::from_u128(env, STELLAR_TESTNET),
            _ => core::mem::swap(&mut q.src, &mut q.dst),
        }
        StrictVerifierClient::new(env, &c.out_v).expect(&p.proof, &out_inputs(env, &p, &q));
        assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(env))), Error::InvalidProof);
    }
}

#[test]
fn bridge_out_rejects_an_unknown_root() {
    let c = ctx();
    let (mut p, ext) = mk_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
    p.root = U256::from_u32(&c.env, 0xBAD);
    accept_out(&c, &p);
    assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::UnknownRoot);
}

/// Spending a note twice, in either slot (Phase 7).
#[test]
fn bridge_out_rejects_a_spent_nullifier() {
    let c = ctx();
    c.env.as_contract(&c.pool.address, || {
        c.env.storage().persistent().set(&DataKey::Nullifier(U256::from_u32(&c.env, 0x77)), &());
    });
    for (n0, n1) in [(0x77, 0x78), (0x79, 0x77)] {
        let (p, ext) = mk_out(&c, n0, n1, &U256::from_u32(&c.env, n0 + n1));
        accept_out(&c, &p);
        assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::AlreadySpentNullifier);
    }
}

#[test]
fn bridge_out_rejects_a_replay() {
    let c = ctx();
    let (p, ext) = mk_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
    accept_out(&c, &p);
    c.pool.bridge_out(&p, &ext, &Address::generate(&c.env));
    assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::AlreadySpentNullifier);
}

/// Changing a delivered payload (a relayer redirecting the recipient's data).
#[test]
fn bridge_out_rejects_changed_ext_data() {
    let c = ctx();
    for i in 0..4 {
        let (p, mut ext) = mk_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
        accept_out(&c, &p);
        let other = Bytes::from_slice(&c.env, &[0xff]);
        match i {
            0 => ext.encrypted_output0 = other,
            1 => ext.encrypted_output1 = other,
            2 => ext.encrypted_refund = other,
            _ => ext.encrypted_bridge_message = other,
        }
        assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::WrongExtHash);
    }
}

#[test]
fn bridge_ext_hashes_differ_from_each_other_and_from_transact() {
    let c = ctx();
    let e = Bytes::new(&c.env);
    let a = c.pool.hash_bridge_in_ext_data(&BridgeInExtData { encrypted_output0: e.clone(), encrypted_output1: e.clone() });
    let b = c.pool.hash_bridge_out_ext_data(&BridgeOutExtData {
        encrypted_output0: e.clone(),
        encrypted_output1: e.clone(),
        encrypted_refund: e.clone(),
        encrypted_bridge_message: e.clone(),
    });
    let t = c.pool.hash_ext_data(&ExtData {
        recipient: c.pool.address.clone(),
        ext_amount: I256::from_i32(&c.env, 0),
        encrypted_output0: e.clone(),
        encrypted_output1: e,
    });
    assert_ne!(a, b);
    assert_ne!(a, t);
    assert_ne!(b, t);
}

#[test]
fn bridge_out_enforces_the_deadline_window() {
    let c = ctx();
    let now = hour(&c.env);
    for (i, (bucket, ok)) in [(now + 1, false), (now + 49, false), (now + 2, true), (now + 48, true)].into_iter().enumerate() {
        let i = u32::try_from(i).expect("small");
        let (mut p, ext) = mk_out(&c, 10 + 2 * i, 11 + 2 * i, &U256::from_u32(&c.env, 20 + i));
        p.deadline_bucket = bucket;
        accept_out(&c, &p);
        let r = c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env));
        if ok {
            assert!(r.is_ok());
        } else {
            assert_eq!(err(r), Error::InvalidDeadline);
        }
    }
}

#[test]
fn bridge_out_rejects_a_duplicate_message() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    do_out(&c, 1, 2, &msg);
    let (p, ext) = mk_out(&c, 3, 4, &msg);
    accept_out(&c, &p);
    assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::BridgeMessageExists);
}

#[test]
fn bridge_out_rejects_non_canonical_values_and_wrong_counts() {
    let c = ctx();
    let r = bn256_modulus(&c.env);
    for i in 0..6 {
        let (mut p, ext) = mk_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
        match i {
            0 => p.input_nullifiers.set(1, r.clone()),
            1 => p.change_commitment0 = r.clone(),
            2 => p.change_commitment1 = r.clone(),
            3 => p.bridge_message = r.clone(),
            4 => p.refund_commitment = r.clone(),
            _ => {
                let mut bad = p.ciphertexts.get(5).expect("ct");
                bad.c2 = r.clone();
                p.ciphertexts.set(5, bad);
            }
        }
        assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::NonCanonicalPublicInput);
    }
    let (mut p, ext) = mk_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
    p.ciphertexts = cts(&c.env, 5, 100);
    assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::WrongGvkCiphertextCount);
}

#[test]
fn bridge_out_rejects_a_proof_the_verifier_refuses() {
    let c = ctx();
    let (mut p, ext) = mk_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
    accept_out(&c, &p);
    let mut bad = p.ciphertexts.get(4).expect("ct");
    bad.c1 = U256::from_u32(&c.env, 1).add(&bad.c1);
    p.ciphertexts.set(4, bad);
    assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::InvalidProof);
    // The transact verifier's registrations don't carry over.
    let (p, ext) = mk_out(&c, 4, 5, &U256::from_u32(&c.env, 6));
    StrictVerifierClient::new(&c.env, &c.transact_v).expect(&p.proof, &out_inputs(&c.env, &p, &out_pub(&c.env)));
    assert_eq!(err(c.pool.try_bridge_out(&p, &ext, &Address::generate(&c.env))), Error::InvalidProof);
}

/// New persistent entries get SPP's lifetime extension.
#[test]
fn bridge_storage_is_renewed_on_write() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    do_out(&c, 1, 2, &msg);
    post(&c, &remote_root(&c.env));
    let (p, ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
    accept_in(&c, &p);
    c.pool.bridge_in(&p, &ext, &Address::generate(&c.env));
    c.env.as_contract(&c.pool.address, || {
        let s = c.env.storage().persistent();
        let min = c.env.storage().max_ttl().min(soroban_utils::MAX_EXTENSION_LEDGERS);
        for key in [
            crate::BridgeKey::Pending(msg.clone()),
            crate::BridgeKey::OutboxState,
            crate::BridgeKey::RemoteRoot(remote_root(&c.env)),
            crate::BridgeKey::ClaimNullifier(U256::from_u32(&c.env, 0xCA)),
        ] {
            assert!(s.get_ttl(&key) >= min, "entry renewed");
        }
    });
}

// ========== bridge_in ==========

#[test]
fn bridge_in_claims_and_creates_notes() {
    let c = ctx();
    post(&c, &remote_root(&c.env));
    let (p, ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
    accept_in(&c, &p);
    c.pool.bridge_in(&p, &ext, &Address::generate(&c.env));
    assert!(c.pool.is_claimed(&U256::from_u32(&c.env, 0xCA)));
    assert!(c.pool.is_known_root(&c.pool.get_root()));
}

/// Claiming a message twice (Phase 7), even with different outputs.
#[test]
fn bridge_in_rejects_a_second_claim() {
    let c = ctx();
    post(&c, &remote_root(&c.env));
    let (mut p, ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
    accept_in(&c, &p);
    c.pool.bridge_in(&p, &ext, &Address::generate(&c.env));
    p.output_commitment0 = U256::from_u32(&c.env, 0x31);
    accept_in(&c, &p);
    assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(&c.env))), Error::AlreadyClaimed);
}

/// An unknown remote root, including this pool's own outbox root (Phase 7).
#[test]
fn bridge_in_rejects_an_unknown_remote_root() {
    let c = ctx();
    let (p, ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
    accept_in(&c, &p);
    assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(&c.env))), Error::UnknownRemoteRoot);
    do_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
    let (p, ext) = mk_in(&c, 0xCA, &c.pool.get_outbox_root());
    accept_in(&c, &p);
    assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(&c.env))), Error::UnknownRemoteRoot);
}

/// Claiming after the deadline (Phase 7); one second before is fine.
#[test]
fn bridge_in_rejects_a_claim_after_the_deadline() {
    let c = ctx();
    post(&c, &remote_root(&c.env));
    let (p, ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
    accept_in(&c, &p);
    c.env.ledger().set_timestamp(p.deadline_bucket * 3600);
    assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(&c.env))), Error::DeadlinePassed);
    c.env.ledger().set_timestamp(p.deadline_bucket * 3600 - 1);
    c.pool.bridge_in(&p, &ext, &Address::generate(&c.env));
}

#[test]
fn bridge_in_supplies_d_scale_asset_and_chain_ids() {
    let c = ctx();
    let env = &c.env;
    post(&c, &remote_root(env));
    for i in 0..6u32 {
        let (p, ext) = mk_in(&c, 0xD0 + i, &remote_root(env));
        let mut q = in_pub(env);
        match i {
            0 => q.d = (99, 100),
            1 => q.scale = 1,
            2 => q.asset = 2,
            3 => q.src = U256::from_u128(env, STELLAR_TESTNET),
            4 => q.dst = U256::from_u32(env, SEPOLIA),
            _ => core::mem::swap(&mut q.src, &mut q.dst),
        }
        StrictVerifierClient::new(env, &c.in_v).expect(&p.proof, &in_inputs(env, &p, &q));
        assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(env))), Error::InvalidProof);
    }
}

#[test]
fn bridge_in_rejects_changed_ext_data_and_bad_values() {
    let c = ctx();
    post(&c, &remote_root(&c.env));
    for i in 0..2 {
        let (p, mut ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
        accept_in(&c, &p);
        let other = Bytes::from_slice(&c.env, &[0xee]);
        if i == 0 {
            ext.encrypted_output0 = other;
        } else {
            ext.encrypted_output1 = other;
        }
        assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(&c.env))), Error::WrongExtHash);
    }
    let r = bn256_modulus(&c.env);
    for i in 0..3 {
        let (mut p, ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
        match i {
            0 => p.claim_nullifier = r.clone(),
            1 => p.output_commitment0 = r.clone(),
            _ => p.output_commitment1 = r.clone(),
        }
        assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(&c.env))), Error::NonCanonicalPublicInput);
    }
    let (mut p, ext) = mk_in(&c, 0xCA, &remote_root(&c.env));
    p.ciphertexts = cts(&c.env, 3, 200);
    assert_eq!(err(c.pool.try_bridge_in(&p, &ext, &Address::generate(&c.env))), Error::WrongGvkCiphertextCount);
}

// ========== finalize and refund ==========

#[test]
fn settling_before_the_grace_period_is_refused() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    let p = do_out(&c, 1, 2, &msg);
    c.env.ledger().set_timestamp(p.deadline_bucket * 3600 + 3599);
    let refund = sign(&c, &c.attester, &c.pool, &msg, 1);
    let fin = sign(&c, &c.attester, &c.pool, &msg, 2);
    assert_eq!(err(c.pool.try_refund(&msg, &refund)), Error::TooEarly);
    assert_eq!(err(c.pool.try_finalize(&msg, &fin)), Error::TooEarly);
    c.env.ledger().set_timestamp(p.deadline_bucket * 3600 + 3600);
    c.pool.refund(&msg, &refund);
}

/// The refund note is inserted and is then spendable with a normal transact.
#[test]
fn refund_inserts_the_refund_note() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    let p = do_out(&c, 1, 2, &msg);
    to_settle_time(&c, p.deadline_bucket);
    let before = c.pool.get_root();
    c.pool.refund(&msg, &sign(&c, &c.attester, &c.pool, &msg, 1));
    assert_eq!(c.pool.get_pending_message(&msg).expect("pending").status, 3);
    let after = c.pool.get_root();
    assert_ne!(before, after);

    // A transact against the new root (the strict transact verifier accepts
    // SPP's input order, rebuilt here).
    let env = &c.env;
    let ext = ExtData {
        recipient: Address::generate(env),
        ext_amount: I256::from_i32(env, 0),
        encrypted_output0: Bytes::new(env),
        encrypted_output1: Bytes::new(env),
    };
    let proof = Proof {
        proof: mk_mock_groth16_proof(env),
        root: after,
        input_nullifiers: soroban_sdk::vec![env, U256::from_u32(env, 0x99), U256::from_u32(env, 0x9A)],
        output_commitment0: U256::from_u32(env, 0x31),
        output_commitment1: U256::from_u32(env, 0x32),
        public_amount: U256::from_u32(env, 0),
        ext_data_hash: c.pool.hash_ext_data(&ext),
        asp_membership_root: U256::from_u32(env, 0),
        asp_non_membership_root: U256::from_u32(env, 0),
        output_gvk_ciphertexts: cts(env, 2, 300),
        input_gvk_ciphertexts: cts(env, 2, 400),
    };
    let mut inputs = Vec::new(env);
    let mut all = proof.input_gvk_ciphertexts.clone();
    all.append(&proof.output_gvk_ciphertexts);
    field_major(env, &mut inputs, &all);
    let eh = bytes_u256(env, &proof.ext_data_hash);
    for x in [U256::from_u32(env, 1), U256::from_u32(env, 2), eh.clone(), proof.root.clone(), proof.public_amount.clone(), eh] {
        inputs.push_back(f(env, &x));
    }
    for n in proof.input_nullifiers.iter() {
        inputs.push_back(f(env, &n));
    }
    inputs.push_back(f(env, &proof.output_commitment0));
    inputs.push_back(f(env, &proof.output_commitment1));
    StrictVerifierClient::new(env, &c.transact_v).expect(&proof.proof, &inputs);
    c.pool.transact(&proof, &ext, &Address::generate(env));
}

#[test]
fn finalize_settles_a_claimed_message() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    let p = do_out(&c, 1, 2, &msg);
    to_settle_time(&c, p.deadline_bucket);
    let root = c.pool.get_root();
    c.pool.finalize(&msg, &sign(&c, &c.attester, &c.pool, &msg, 2));
    assert_eq!(c.pool.get_pending_message(&msg).expect("pending").status, 2);
    assert_eq!(c.pool.get_root(), root, "finalize inserts nothing");
}

/// Refunding a message that was already claimed (Phase 7): the attester
/// signs "claimed", which refund refuses; and the reverse for finalize.
#[test]
fn refund_refuses_a_claimed_attestation_and_vice_versa() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    let p = do_out(&c, 1, 2, &msg);
    to_settle_time(&c, p.deadline_bucket);
    assert_eq!(err(c.pool.try_refund(&msg, &sign(&c, &c.attester, &c.pool, &msg, 2))), Error::InvalidAttestation);
    assert_eq!(err(c.pool.try_finalize(&msg, &sign(&c, &c.attester, &c.pool, &msg, 1))), Error::InvalidAttestation);
}

#[test]
fn settling_twice_or_an_unknown_message_is_refused() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    let p = do_out(&c, 1, 2, &msg);
    to_settle_time(&c, p.deadline_bucket);
    c.pool.finalize(&msg, &sign(&c, &c.attester, &c.pool, &msg, 2));
    assert_eq!(err(c.pool.try_refund(&msg, &sign(&c, &c.attester, &c.pool, &msg, 1))), Error::NotPending);
    assert_eq!(err(c.pool.try_finalize(&msg, &sign(&c, &c.attester, &c.pool, &msg, 2))), Error::NotPending);
    let unknown = U256::from_u32(&c.env, 0xDEAD);
    assert_eq!(err(c.pool.try_refund(&unknown, &sign(&c, &c.attester, &c.pool, &unknown, 1))), Error::NotPending);
}

#[test]
fn attestations_must_come_from_the_attester_for_this_message_pool_and_chain() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    let p = do_out(&c, 1, 2, &msg);
    to_settle_time(&c, p.deadline_bucket);
    // Wrong signer.
    assert_eq!(err(c.pool.try_refund(&msg, &sign(&c, &attester_key(9), &c.pool, &msg, 1))), Error::InvalidAttestation);
    // Signed for another message.
    let other = U256::from_u32(&c.env, 0xD);
    assert_eq!(err(c.pool.try_refund(&msg, &sign(&c, &c.attester, &c.pool, &other, 1))), Error::InvalidAttestation);
    // Signed for another pool.
    let (pool2, ..) = deploy_pool(&c.env);
    pool2.init_bridge(&config(&c.env, &c.poster, &c.attester, &c.out_v, &c.in_v));
    assert_eq!(err(c.pool.try_refund(&msg, &sign(&c, &c.attester, &pool2, &msg, 1))), Error::InvalidAttestation);
    // Signed for another chain (network).
    let net = c.env.ledger().network_id().to_array();
    c.env.ledger().set_network_id([9u8; 32]);
    let other_chain = sign(&c, &c.attester, &c.pool, &msg, 1);
    c.env.ledger().set_network_id(net);
    assert_eq!(err(c.pool.try_refund(&msg, &other_chain)), Error::InvalidAttestation);
    // The right one works.
    c.pool.refund(&msg, &sign(&c, &c.attester, &c.pool, &msg, 1));
}

/// A malleated (high-s) signature and a bad v are refused.
#[test]
fn attestations_must_be_canonical() {
    let c = ctx();
    let msg = U256::from_u32(&c.env, 0xC);
    let p = do_out(&c, 1, 2, &msg);
    to_settle_time(&c, p.deadline_bucket);
    let good = sign(&c, &c.attester, &c.pool, &msg, 1).to_array();
    // s -> n - s, v flipped: recovers the same key but is not low-s.
    use k256::elliptic_curve::ff::PrimeField as _;
    let n = Option::<k256::Scalar>::from(k256::Scalar::from_repr(*k256::FieldBytes::from_slice(&good[32..64]))).expect("scalar");
    let high = (-n).to_bytes();
    let mut bad = good;
    bad[32..64].copy_from_slice(&high);
    bad[64] = if good[64] == 27 { 28 } else { 27 };
    assert_eq!(err(c.pool.try_refund(&msg, &BytesN::from_array(&c.env, &bad))), Error::InvalidAttestation);
    let mut bad_v = good;
    bad_v[64] = good[64] - 27;
    assert_eq!(err(c.pool.try_refund(&msg, &BytesN::from_array(&c.env, &bad_v))), Error::InvalidAttestation);
    c.pool.refund(&msg, &BytesN::from_array(&c.env, &good));
}

/// SPEC.md B12 layout: "ZKROSS-ATTEST-v1" ‖ chain ‖ contract ID ‖ C ‖ status.
#[test]
fn attestation_digest_layout() {
    let c = ctx();
    let env = &c.env;
    let msg = U256::from_u32(env, 0xC);
    let mut m = Bytes::from_slice(env, b"ZKROSS-ATTEST-v1");
    let mut chain = [0u8; 32];
    U256::from_u128(env, STELLAR_TESTNET).to_be_bytes().copy_into_slice(&mut chain);
    m.append(&Bytes::from_array(env, &chain));
    let addr_xdr = c.pool.address.clone().to_xdr(env);
    m.append(&addr_xdr.slice(addr_xdr.len() - 32..));
    let mut cb = [0u8; 32];
    msg.to_be_bytes().copy_into_slice(&mut cb);
    m.append(&Bytes::from_array(env, &cb));
    m.push_back(1);
    let expected: BytesN<32> = env.crypto().keccak256(&m).into();
    assert_eq!(c.pool.attestation_digest(&msg, &1), expected);
}

// ========== Decimal conversion (SPEC.md B1) ==========

/// Ethereum -> Stellar: 2 000 000 bridge units (2 USDC) become 20 000 000
/// stroops. The contract supplies scale = 10 (strict mock), and the claimed
/// notes then withdraw exactly 2 USDC in stroops.
#[test]
fn ethereum_to_stellar_amounts_withdraw_exactly_in_stroops() {
    let c = ctx();
    let env = &c.env;
    StellarAssetClient::new(env, &c.token).mint(&c.admin, &30_000_000);
    c.pool.add_liquidity(&30_000_000);
    post(&c, &remote_root(env));
    let (p, ext) = mk_in(&c, 0xCA, &remote_root(env));
    accept_in(&c, &p); // registered with scale = 10
    c.pool.bridge_in(&p, &ext, &Address::generate(env));

    // Withdraw amount x 10 stroops.
    let recipient = Address::generate(env);
    let amount: i32 = 2_000_000 * 10;
    let ext = ExtData {
        recipient: recipient.clone(),
        ext_amount: I256::from_i32(env, -amount),
        encrypted_output0: Bytes::new(env),
        encrypted_output1: Bytes::new(env),
    };
    let public_amount = bn256_modulus(env).sub(&U256::from_u32(env, u32::try_from(amount).expect("positive")));
    let proof = Proof {
        proof: mk_mock_groth16_proof(env),
        root: c.pool.get_root(),
        input_nullifiers: soroban_sdk::vec![env, U256::from_u32(env, 0x5E), U256::from_u32(env, 0x5F)],
        output_commitment0: U256::from_u32(env, 0x41),
        output_commitment1: U256::from_u32(env, 0x42),
        public_amount: public_amount.clone(),
        ext_data_hash: c.pool.hash_ext_data(&ext),
        asp_membership_root: U256::from_u32(env, 0),
        asp_non_membership_root: U256::from_u32(env, 0),
        output_gvk_ciphertexts: cts(env, 2, 300),
        input_gvk_ciphertexts: cts(env, 2, 400),
    };
    let mut inputs = Vec::new(env);
    let mut all = proof.input_gvk_ciphertexts.clone();
    all.append(&proof.output_gvk_ciphertexts);
    field_major(env, &mut inputs, &all);
    let eh = bytes_u256(env, &proof.ext_data_hash);
    for x in [U256::from_u32(env, 1), U256::from_u32(env, 2), eh.clone(), proof.root.clone(), public_amount, eh] {
        inputs.push_back(f(env, &x));
    }
    for n in proof.input_nullifiers.iter() {
        inputs.push_back(f(env, &n));
    }
    inputs.push_back(f(env, &proof.output_commitment0));
    inputs.push_back(f(env, &proof.output_commitment1));
    StrictVerifierClient::new(env, &c.transact_v).expect(&proof.proof, &inputs);
    c.pool.transact(&proof, &ext, &Address::generate(env));
    let t = TokenClient::new(env, &c.token);
    assert_eq!(t.balance(&recipient), 20_000_000, "2 USDC in stroops");
    assert_eq!(t.balance(&c.pool.address), 10_000_000);
}

/// Stellar -> Ethereum: bridge_out binds scale = 10, so the circuit spends
/// exactly amount x 10 stroops and keeps the remainder in change (the
/// circuit tests check the remainder; SPEC.md vector: 12 345 678 stroops ->
/// 1 234 567 units + 8 stroops change).
#[test]
fn stellar_to_ethereum_bridge_out_binds_scale_ten() {
    let c = ctx();
    let (p, ext) = mk_out(&c, 1, 2, &U256::from_u32(&c.env, 3));
    let mut q = out_pub(&c.env);
    q.scale = 10;
    StrictVerifierClient::new(&c.env, &c.out_v).expect(&p.proof, &out_inputs(&c.env, &p, &q));
    c.pool.bridge_out(&p, &ext, &Address::generate(&c.env));
    assert_eq!(12_345_678u64 / 10, 1_234_567);
    assert_eq!(12_345_678u64 % 10, 8);
}

// ========== Resource cost ==========

fn ark(v: &U256) -> ArkFr {
    let mut b = [0u8; 32];
    v.to_be_bytes().copy_into_slice(&mut b);
    ArkFr::from_be_bytes_mod_order(&b)
}

fn to_ark(env: &Env, inputs: &Vec<Bn254Fr>) -> alloc::vec::Vec<ArkFr> {
    inputs.iter().map(|x| ark(&U256::from_be_bytes(env, &Bytes::from(x.to_bytes())))).collect()
}

/// bridge_out and bridge_in with a real BN254 Groth16 verification of the real
/// input count (SPP's toy-circuit TestVerifier), measured against Soroban's
/// per-transaction limits (100 M instructions, 40 MB memory at the time of
/// writing; simulate on the network before relying on this).
#[test]
fn bridge_calls_fit_soroban_limits_with_a_real_pairing_check() {
    let env = test_env();
    env.mock_all_auths();
    env.ledger().set_timestamp(NOW);
    env.ledger().set_network_id(env.crypto().sha256(&Bytes::from_slice(&env, TESTNET_PASSPHRASE)).to_array());
    env.cost_estimate().budget().reset_unlimited();
    let (pool, ..) = deploy_pool(&env);
    let attester = attester_key(7);
    let poster = Address::generate(&env);

    // Build the proofs' public values first (they need the pool for the ext
    // hashes), then the verifiers for exactly those inputs, then init.
    let ext_o = out_ext(&env);
    let mut po = BridgeOutProof {
        proof: mk_mock_groth16_proof(&env),
        root: pool.get_root(),
        input_nullifiers: soroban_sdk::vec![&env, U256::from_u32(&env, 1), U256::from_u32(&env, 2)],
        change_commitment0: U256::from_u32(&env, 0x11),
        change_commitment1: U256::from_u32(&env, 0x12),
        bridge_message: U256::from_u32(&env, 0xC),
        refund_commitment: U256::from_u32(&env, 0x13),
        deadline_bucket: hour(&env) + 24,
        ext_data_hash: pool.hash_bridge_out_ext_data(&ext_o),
        ciphertexts: cts(&env, 6, 100),
    };
    let (vk_o, proof_o) = groth16_fixture_for(&env, &to_ark(&env, &out_inputs(&env, &po, &out_pub(&env))));
    po.proof = proof_o;
    let ext_i = in_ext(&env);
    let mut pi = BridgeInProof {
        proof: mk_mock_groth16_proof(&env),
        remote_root: remote_root(&env),
        claim_nullifier: U256::from_u32(&env, 0xCA),
        output_commitment0: U256::from_u32(&env, 0x21),
        output_commitment1: U256::from_u32(&env, 0x22),
        deadline_bucket: hour(&env) + 24,
        ext_data_hash: pool.hash_bridge_in_ext_data(&ext_i),
        ciphertexts: cts(&env, 2, 200),
    };
    let (vk_i, proof_i) = groth16_fixture_for(&env, &to_ark(&env, &in_inputs(&env, &pi, &in_pub(&env))));
    pi.proof = proof_i;
    let out_v = env.register(TestVerifier, (vk_o,));
    let in_v = env.register(TestVerifier, (vk_i,));
    pool.init_bridge(&config(&env, &poster, &attester, &out_v, &in_v));
    pool.post_remote_root(&remote_root(&env));

    env.cost_estimate().budget().reset_unlimited();
    pool.bridge_out(&po, &ext_o, &Address::generate(&env));
    let out_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let out_mem = env.cost_estimate().budget().memory_bytes_cost();

    env.cost_estimate().budget().reset_unlimited();
    pool.bridge_in(&pi, &ext_i, &Address::generate(&env));
    let in_cpu = env.cost_estimate().budget().cpu_instruction_cost();
    let in_mem = env.cost_estimate().budget().memory_bytes_cost();

    std::println!("bridge_out: {out_cpu} cpu instructions, {out_mem} bytes; bridge_in: {in_cpu} cpu, {in_mem} bytes");
    assert!(out_cpu < 100_000_000 && in_cpu < 100_000_000, "within the 100M instruction limit");
    assert!(out_mem < 41_943_040 && in_mem < 41_943_040, "within the 40 MB memory limit");
}
