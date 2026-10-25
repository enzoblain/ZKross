//! ZKross private bridge on Stellar (SPEC.md Part B).
//!
//! `bridge_out`, `bridge_in`, `post_remote_root`, `finalize`, `refund` and
//! `add_liquidity`, the same functions as the Ethereum pool's
//! (`contracts/ethereum/src/ShieldedPool.sol`). SPP's `transact` is unchanged.
//! A child module of `pool_gvk` so it reuses the pool's own validation and
//! storage helpers.
#![allow(clippy::too_many_arguments)]

use super::{
    DataKey, Error, NewCommitmentEvent, NewNullifierEvent, PoolGvkContract, PoolGvkContractArgs, PoolGvkContractClient,
};
use crate::gvk::{BabyJubJubPoint, GvkCiphertext};
use contract_types::Groth16Proof;
use pool_core::{CircomGroth16VerifierClient, amounts, merkle_with_history::TreeState};
use soroban_sdk::{
    Address, Bytes, BytesN, Env, Symbol, U256, Vec, contractevent, contractimpl, contracttype,
    crypto::bn254::Bn254Fr, token::TokenClient, xdr::ToXdr,
};
use soroban_utils::{constants::bn256_modulus, extend_persistent, poseidon2_compress, zero_hash};

/// Stellar notes are in stroops, 10 per bridge unit (B1).
pub const SCALE: u32 = 10;
/// Outbox tree depth (B6).
pub const OUTBOX_LEVELS: u32 = 20;
/// `bridge_out` deadlines must be 2 to 48 hours ahead (B5).
pub const MIN_DEADLINE_HOURS: u64 = 2;
pub const MAX_DEADLINE_HOURS: u64 = 48;
/// Seconds after the deadline before `finalize`/`refund` (B5).
pub const REFUND_GRACE: u64 = 3600;
/// Pending message states.
pub const STATUS_PENDING: u32 = 1;
pub const STATUS_FINALIZED: u32 = 2;
pub const STATUS_REFUNDED: u32 = 3;
/// Attestation statuses (B12).
pub const ATTEST_UNCLAIMED: u8 = 0x01;
pub const ATTEST_CLAIMED: u8 = 0x02;
/// Half the secp256k1 group order, big-endian (low-s bound, B12).
const SECP256K1_HALF_N: [u8; 32] = [
    0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0x5d, 0x57, 0x6e, 0x73, 0x57, 0xa4, 0x50, 0x1d, 0xdf, 0xe9, 0x2f, 0x46, 0x68, 0x1b, 0x20, 0xa0,
];
/// Same size as the root history of SPP's tree.
const ROOT_HISTORY_SIZE: u32 = 90;

/// Bridge configuration, fixed at construction.
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BridgeConfig {
    /// Posts the paired chain's outbox roots.
    pub root_poster: Address,
    /// Ethereum address of the secp256k1 refund attester key (B12).
    pub attester: BytesN<20>,
    /// `chain_id` of the paired chain (B2).
    pub remote_chain_id: U256,
    /// `asset_id` of this pool's token (B2; USDC = 1).
    pub asset_id: U256,
    /// SPP verifier contract built with the `bridge_out` key.
    pub bridge_out_verifier: Address,
    /// SPP verifier contract built with the `bridge_in` key.
    pub bridge_in_verifier: Address,
}

/// `bridge_out` public values (B8). `ciphertexts`: in0, in1, out0, out1,
/// refund note, C.
#[contracttype]
pub struct BridgeOutProof {
    pub proof: Groth16Proof,
    pub root: U256,
    pub input_nullifiers: Vec<U256>,
    pub change_commitment0: U256,
    pub change_commitment1: U256,
    pub bridge_message: U256,
    pub refund_commitment: U256,
    pub deadline_bucket: u64,
    pub ext_data_hash: BytesN<32>,
    pub ciphertexts: Vec<GvkCiphertext>,
}

#[contracttype]
#[derive(Clone)]
pub struct BridgeOutExtData {
    pub encrypted_output0: Bytes,
    pub encrypted_output1: Bytes,
    pub encrypted_refund: Bytes,
    /// B10 payload for the recipient.
    pub encrypted_bridge_message: Bytes,
}

/// `bridge_in` public values (B8). `ciphertexts`: out0, out1.
#[contracttype]
pub struct BridgeInProof {
    pub proof: Groth16Proof,
    pub remote_root: U256,
    pub claim_nullifier: U256,
    pub output_commitment0: U256,
    pub output_commitment1: U256,
    pub deadline_bucket: u64,
    pub ext_data_hash: BytesN<32>,
    pub ciphertexts: Vec<GvkCiphertext>,
}

#[contracttype]
#[derive(Clone)]
pub struct BridgeInExtData {
    pub encrypted_output0: Bytes,
    pub encrypted_output1: Bytes,
}

/// A bridge message sent from this pool (B6, B7).
#[contracttype]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingMessage {
    pub status: u32,
    pub deadline_bucket: u64,
    pub outbox_index: u32,
    pub refund_commitment: U256,
}

/// Bridge storage. `Config` lives in the instance; everything else is
/// persistent and renewed with SPP's `extend_persistent` on every write.
#[contracttype]
#[derive(Clone)]
pub enum BridgeKey {
    Config,
    OutboxState,
    Pending(U256),
    ClaimNullifier(U256),
    RemoteRoot(U256),
}

// SPEC.md B11: the Stellar bridge ext-data hashes, SPP's scheme (keccak256 of
// the XDR of a sorted ScMap, reduced mod r), bound to this pool and token.
#[contracttype]
struct BridgeOutExtDataDomain {
    encrypted_bridge_message: Bytes,
    encrypted_output0: Bytes,
    encrypted_output1: Bytes,
    encrypted_refund: Bytes,
    kind: Symbol,
    pool: Address,
    token: Address,
}

#[contracttype]
struct BridgeInExtDataDomain {
    encrypted_output0: Bytes,
    encrypted_output1: Bytes,
    kind: Symbol,
    pool: Address,
    token: Address,
}

// ========== Events ==========

#[contractevent]
#[derive(Clone)]
pub struct BridgeOutEvent {
    #[topic]
    pub bridge_message: U256,
    pub outbox_index: u32,
    pub deadline_bucket: u64,
    pub refund_commitment: U256,
    pub refund_ciphertext: GvkCiphertext,
    pub bridge_ciphertext: GvkCiphertext,
    pub encrypted_refund: Bytes,
    pub encrypted_bridge_message: Bytes,
}

#[contractevent]
#[derive(Clone)]
pub struct BridgeInEvent {
    #[topic]
    pub claim_nullifier: U256,
    pub remote_root: U256,
}

#[contractevent]
#[derive(Clone)]
pub struct RemoteRootPostedEvent {
    #[topic]
    pub root: U256,
}

#[contractevent]
#[derive(Clone)]
pub struct BridgeFinalizedEvent {
    #[topic]
    pub bridge_message: U256,
}

#[contractevent]
#[derive(Clone)]
pub struct BridgeRefundedEvent {
    #[topic]
    pub bridge_message: U256,
    pub refund_commitment: U256,
    pub index: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct LiquidityAddedEvent {
    #[topic]
    pub from: Address,
    pub amount: i128,
}

// ========== Outbox tree ==========

/// The outbox: SPP's `merkle_with_history` algorithm (two leaves per insert,
/// `compress` nodes, the "XLM" empty leaf, 90 roots) under its own storage
/// key, so it can sit next to the note tree. Checked against SPP's own tree
/// via the SPEC.md vectors.
pub(crate) struct Outbox;

impl Outbox {
    pub(crate) fn init(env: &Env) -> Result<(), Error> {
        let storage = env.storage().persistent();
        if storage.has(&BridgeKey::OutboxState) {
            return Err(Error::AlreadyInitialized);
        }
        let mut filled_subtrees = Vec::new(env);
        for i in 1..OUTBOX_LEVELS {
            filled_subtrees.push_back(zero_hash(env, i).ok_or(Error::NotInitialized)?);
        }
        let root_0 = zero_hash(env, OUTBOX_LEVELS).ok_or(Error::NotInitialized)?;
        let mut roots = Vec::new(env);
        for _ in 0..ROOT_HISTORY_SIZE {
            roots.push_back(root_0.clone());
        }
        storage.set(&BridgeKey::OutboxState, &TreeState { next_index: 0, filled_subtrees, roots });
        extend_persistent(env, &BridgeKey::OutboxState);
        Ok(())
    }

    fn state(env: &Env) -> Result<TreeState, Error> {
        env.storage().persistent().get(&BridgeKey::OutboxState).ok_or(Error::NotInitialized)
    }

    fn root_index_for(next_index: u64) -> Result<u32, Error> {
        let slot = (next_index / 2).checked_rem(u64::from(ROOT_HISTORY_SIZE)).ok_or(Error::Overflow)?;
        u32::try_from(slot).map_err(|_| Error::Overflow)
    }

    /// Inserts (C, 0) and returns C's index.
    pub(crate) fn insert(env: &Env, leaf: U256) -> Result<u32, Error> {
        let mut state = Self::state(env)?;
        let next_index = state.next_index;
        if next_index.checked_add(2).ok_or(Error::Overflow)? > 1u64 << OUTBOX_LEVELS {
            return Err(Error::MerkleTreeFull);
        }
        let mut current_hash = poseidon2_compress(env, leaf, U256::from_u32(env, 0));
        let mut current_index = next_index >> 1;
        for lvl in 1..OUTBOX_LEVELS {
            let slot = lvl.checked_sub(1).ok_or(Error::Overflow)?;
            if current_index & 1 == 1 {
                let left = state.filled_subtrees.get(slot).ok_or(Error::NotInitialized)?;
                current_hash = poseidon2_compress(env, left, current_hash);
            } else {
                state.filled_subtrees.set(slot, current_hash.clone());
                current_hash = poseidon2_compress(env, current_hash, zero_hash(env, lvl).ok_or(Error::NotInitialized)?);
            }
            current_index >>= 1;
        }
        state.next_index = next_index.checked_add(2).ok_or(Error::Overflow)?;
        state.roots.set(Self::root_index_for(state.next_index)?, current_hash);
        env.storage().persistent().set(&BridgeKey::OutboxState, &state);
        extend_persistent(env, &BridgeKey::OutboxState);
        u32::try_from(next_index).map_err(|_| Error::MerkleTreeFull)
    }

    pub(crate) fn root(env: &Env) -> Result<U256, Error> {
        let state = Self::state(env)?;
        state.roots.get(Self::root_index_for(state.next_index)?).ok_or(Error::NotInitialized)
    }

    pub(crate) fn next_index(env: &Env) -> Result<u64, Error> {
        Ok(Self::state(env)?.next_index)
    }
}

// ========== Helpers ==========

fn config(env: &Env) -> Result<BridgeConfig, Error> {
    env.storage().instance().get(&BridgeKey::Config).ok_or(Error::NotInitialized)
}

/// SPEC.md B2: 2^64 + the first 8 bytes of the network ID (sha256 of the
/// network passphrase), big-endian.
pub fn local_chain_id(env: &Env) -> U256 {
    let id = env.ledger().network_id().to_array();
    let mut hi = [0u8; 8];
    hi.copy_from_slice(&id[..8]);
    U256::from_parts(env, 0, 0, 1, u64::from_be_bytes(hi))
}

/// This contract's 32-byte contract ID (the XDR of a contract `ScAddress`
/// value ends with it).
fn contract_id_bytes(env: &Env) -> Bytes {
    let xdr = env.current_contract_address().to_xdr(env);
    xdr.slice(xdr.len() - 32..)
}

fn fr(env: &Env, v: &U256) -> Bn254Fr {
    Bn254Fr::from_bytes(amounts::u256_to_bytes(env, v))
}

fn reduce(env: &Env, payload: Bytes) -> BytesN<32> {
    let digest: BytesN<32> = env.crypto().keccak256(&payload).into();
    let reduced = U256::from_be_bytes(env, &Bytes::from(digest)).rem_euclid(&bn256_modulus(env));
    amounts::u256_to_bytes(env, &reduced)
}

/// Field-major ciphertext signals (every R pair, then c1, c2, c3).
fn push_field_major(env: &Env, inputs: &mut Vec<Bn254Fr>, cts: &Vec<GvkCiphertext>) {
    for ct in cts.iter() {
        inputs.push_back(fr(env, &ct.r.x));
        inputs.push_back(fr(env, &ct.r.y));
    }
    for ct in cts.iter() {
        inputs.push_back(fr(env, &ct.c1));
    }
    for ct in cts.iter() {
        inputs.push_back(fr(env, &ct.c2));
    }
    for ct in cts.iter() {
        inputs.push_back(fr(env, &ct.c3));
    }
}

fn verify(env: &Env, verifier: &Address, proof: Groth16Proof, inputs: Vec<Bn254Fr>) -> Result<(), Error> {
    soroban_utils::extend_contract(env, verifier);
    match CircomGroth16VerifierClient::new(env, verifier).try_verify(&proof, &inputs) {
        Ok(Ok(true)) => Ok(()),
        _ => Err(Error::InvalidProof),
    }
}

fn set_flag(env: &Env, key: &BridgeKey) {
    env.storage().persistent().set(key, &());
    extend_persistent(env, key);
}

fn zero_ciphertext(env: &Env) -> GvkCiphertext {
    let z = U256::from_u32(env, 0);
    GvkCiphertext { r: BabyJubJubPoint { x: z.clone(), y: z.clone() }, c1: z.clone(), c2: z.clone(), c3: z }
}

impl PoolGvkContract {
    fn check_bridge_config(env: &Env, cfg: &BridgeConfig) -> Result<(), Error> {
        let modulus = bn256_modulus(env);
        let zero = U256::from_u32(env, 0);
        if cfg.remote_chain_id == zero
            || cfg.remote_chain_id >= modulus
            || cfg.remote_chain_id == local_chain_id(env)
            || cfg.asset_id == zero
            || cfg.asset_id >= modulus
        {
            return Err(Error::InvalidBridgeConfig);
        }
        Ok(())
    }

    fn hash_bridge_out_ext(env: &Env, ext: &BridgeOutExtData) -> Result<BytesN<32>, Error> {
        let domain = BridgeOutExtDataDomain {
            encrypted_bridge_message: ext.encrypted_bridge_message.clone(),
            encrypted_output0: ext.encrypted_output0.clone(),
            encrypted_output1: ext.encrypted_output1.clone(),
            encrypted_refund: ext.encrypted_refund.clone(),
            kind: Symbol::new(env, "bridge_out"),
            pool: env.current_contract_address(),
            token: Self::get_token(env)?,
        };
        Ok(reduce(env, domain.to_xdr(env)))
    }

    fn hash_bridge_in_ext(env: &Env, ext: &BridgeInExtData) -> Result<BytesN<32>, Error> {
        let domain = BridgeInExtDataDomain {
            encrypted_output0: ext.encrypted_output0.clone(),
            encrypted_output1: ext.encrypted_output1.clone(),
            kind: Symbol::new(env, "bridge_in"),
            pool: env.current_contract_address(),
            token: Self::get_token(env)?,
        };
        Ok(reduce(env, domain.to_xdr(env)))
    }

    fn check_cts(cts: &Vec<GvkCiphertext>, n: u32, modulus: &U256) -> Result<(), Error> {
        if cts.len() != n {
            return Err(Error::WrongGvkCiphertextCount);
        }
        for ct in cts.iter() {
            Self::validate_gvk_ciphertext(&ct, modulus)?;
        }
        Ok(())
    }

    fn now_hour(env: &Env) -> u64 {
        env.ledger().timestamp() / 3600
    }

    fn settle(env: &Env, bridge_message: &U256, status: u8, attestation: &BytesN<65>) -> Result<PendingMessage, Error> {
        let key = BridgeKey::Pending(bridge_message.clone());
        let m: PendingMessage = env.storage().persistent().get(&key).ok_or(Error::NotPending)?;
        if m.status != STATUS_PENDING {
            return Err(Error::NotPending);
        }
        let open_at = m.deadline_bucket.checked_mul(3600).and_then(|t| t.checked_add(REFUND_GRACE)).ok_or(Error::Overflow)?;
        if env.ledger().timestamp() < open_at {
            return Err(Error::TooEarly);
        }
        if !Self::is_valid_attestation(env, bridge_message, status, attestation)? {
            return Err(Error::InvalidAttestation);
        }
        Ok(m)
    }

    fn is_valid_attestation(env: &Env, bridge_message: &U256, status: u8, sig: &BytesN<65>) -> Result<bool, Error> {
        let sig = sig.to_array();
        let mut s = [0u8; 32];
        s.copy_from_slice(&sig[32..64]);
        let v = sig[64];
        if s > SECP256K1_HALF_N || (v != 27 && v != 28) {
            return Ok(false);
        }
        let mut rs = [0u8; 64];
        rs.copy_from_slice(&sig[..64]);
        let digest = env.crypto().keccak256(&Self::attestation_message(env, bridge_message, status));
        let pubkey = env.crypto().secp256k1_recover(&digest, &BytesN::from_array(env, &rs), u32::from(v - 27));
        let pubkey = Bytes::from(pubkey);
        let hashed = env.crypto().keccak256(&pubkey.slice(1..65)).to_array();
        let mut addr = [0u8; 20];
        addr.copy_from_slice(&hashed[12..]);
        Ok(BytesN::from_array(env, &addr) == config(env)?.attester)
    }

    /// B12 message: "ZKROSS-ATTEST-v1" ‖ src_chain ‖ pool ID ‖ C ‖ status.
    fn attestation_message(env: &Env, bridge_message: &U256, status: u8) -> Bytes {
        let mut msg = Bytes::from_slice(env, b"ZKROSS-ATTEST-v1");
        msg.append(&Bytes::from(amounts::u256_to_bytes(env, &local_chain_id(env))));
        msg.append(&contract_id_bytes(env));
        msg.append(&Bytes::from(amounts::u256_to_bytes(env, bridge_message)));
        msg.push_back(status);
        msg
    }
}

#[contractimpl]
impl PoolGvkContract {
    /// Sets the bridge configuration, once, by the admin (SPP's constructor
    /// already takes the most arguments a Soroban constructor call can carry).
    /// After this nothing can change the verifiers, the root poster or the
    /// attester. Until it runs, every bridge function answers NotInitialized.
    pub fn init_bridge(env: &Env, config: BridgeConfig) -> Result<(), Error> {
        soroban_utils::get_admin(env, &DataKey::Admin)?.require_auth();
        if env.storage().instance().has(&BridgeKey::Config) {
            return Err(Error::AlreadyInitialized);
        }
        Self::check_bridge_config(env, &config)?;
        env.storage().instance().set(&BridgeKey::Config, &config);
        Outbox::init(env)
    }

    /// Records a root of the paired chain's outbox (B6). Roots are kept
    /// forever, so a message stays claimable until its deadline.
    pub fn post_remote_root(env: &Env, root: U256) -> Result<(), Error> {
        config(env)?.root_poster.require_auth();
        if root == U256::from_u32(env, 0) {
            return Err(Error::UnknownRemoteRoot);
        }
        Self::validate_bn256_public_input(&root, &bn256_modulus(env))?;
        set_flag(env, &BridgeKey::RemoteRoot(root.clone()));
        RemoteRootPostedEvent { root }.publish(env);
        Ok(())
    }

    /// Adds unowned balance that backs incoming bridge notes (B13).
    pub fn add_liquidity(env: &Env, amount: i128) -> Result<(), Error> {
        let admin = soroban_utils::get_admin(env, &DataKey::Admin)?;
        admin.require_auth();
        if amount <= 0 {
            return Err(Error::WrongExtAmount);
        }
        TokenClient::new(env, &Self::get_token(env)?).transfer(&admin, &env.current_contract_address(), &amount);
        LiquidityAddedEvent { from: admin, amount }.publish(env);
        Ok(())
    }

    /// Spends two notes into two change notes plus a bridge message C, which
    /// is appended to the outbox as the pair (C, 0) (B6, B8). The bridged
    /// value stays in this pool as liquidity.
    pub fn bridge_out(env: &Env, proof: BridgeOutProof, ext_data: BridgeOutExtData, sender: Address) -> Result<(), Error> {
        sender.require_auth();
        soroban_utils::extend_instance(env);
        let cfg = config(env)?;
        let modulus = bn256_modulus(env);

        // Same order as transact: root, nullifiers, ext hash, then the bridge
        // checks, then the proof.
        if !Self::is_known_root(env, &proof.root)? {
            return Err(Error::UnknownRoot);
        }
        if proof.input_nullifiers.len() != 2 {
            return Err(Error::InvalidProof);
        }
        for n in proof.input_nullifiers.iter() {
            if Self::is_spent(env, &n)? {
                return Err(Error::AlreadySpentNullifier);
            }
        }
        if Self::hash_bridge_out_ext(env, &ext_data)? != proof.ext_data_hash {
            return Err(Error::WrongExtHash);
        }
        let now = Self::now_hour(env);
        if proof.deadline_bucket < now.saturating_add(MIN_DEADLINE_HOURS) || proof.deadline_bucket > now.saturating_add(MAX_DEADLINE_HOURS) {
            return Err(Error::InvalidDeadline);
        }
        if env.storage().persistent().has(&BridgeKey::Pending(proof.bridge_message.clone())) {
            return Err(Error::BridgeMessageExists);
        }
        for v in [&proof.root, &proof.change_commitment0, &proof.change_commitment1, &proof.bridge_message, &proof.refund_commitment] {
            Self::validate_bn256_public_input(v, &modulus)?;
        }
        for n in proof.input_nullifiers.iter() {
            Self::validate_bn256_public_input(&n, &modulus)?;
        }
        Self::check_cts(&proof.ciphertexts, 6, &modulus)?;

        // B8 public signals: 6 ciphertexts, D, nonce, root, extDataHash,
        // nullifiers, change commitments, C, refund, scale, asset, src (this
        // chain), dst, deadline. D comes from storage, never from the caller.
        let d = Self::get_admin_view_key(env)?;
        let ext_hash = U256::from_be_bytes(env, &Bytes::from(proof.ext_data_hash.clone()));
        let mut inputs: Vec<Bn254Fr> = Vec::new(env);
        push_field_major(env, &mut inputs, &proof.ciphertexts);
        for v in [&d.x, &d.y, &ext_hash, &proof.root, &ext_hash] {
            inputs.push_back(fr(env, v));
        }
        for n in proof.input_nullifiers.iter() {
            inputs.push_back(fr(env, &n));
        }
        let scale = U256::from_u32(env, SCALE);
        let deadline = U256::from_u128(env, u128::from(proof.deadline_bucket));
        for v in [
            &proof.change_commitment0,
            &proof.change_commitment1,
            &proof.bridge_message,
            &proof.refund_commitment,
            &scale,
            &cfg.asset_id,
            &local_chain_id(env),
            &cfg.remote_chain_id,
            &deadline,
        ] {
            inputs.push_back(fr(env, v));
        }
        verify(env, &cfg.bridge_out_verifier, proof.proof, inputs)?;

        for n in proof.input_nullifiers.iter() {
            Self::mark_spent(env, &n)?;
        }
        let (idx0, idx1) = pool_core::merkle_with_history::MerkleTreeWithHistory::insert_two_leaves(
            env,
            proof.change_commitment0.clone(),
            proof.change_commitment1.clone(),
        )?;
        let outbox_index = Outbox::insert(env, proof.bridge_message.clone())?;
        let key = BridgeKey::Pending(proof.bridge_message.clone());
        env.storage().persistent().set(
            &key,
            &PendingMessage {
                status: STATUS_PENDING,
                deadline_bucket: proof.deadline_bucket,
                outbox_index,
                refund_commitment: proof.refund_commitment.clone(),
            },
        );
        extend_persistent(env, &key);

        let ct = |i: u32| proof.ciphertexts.get(i).expect("ciphertext count checked above");
        for (i, n) in proof.input_nullifiers.iter().enumerate() {
            NewNullifierEvent { nullifier: n, gvk_ciphertext: Some(ct(u32::try_from(i).expect("2 inputs"))) }.publish(env);
        }
        NewCommitmentEvent { commitment: proof.change_commitment0, index: idx0, encrypted_output: ext_data.encrypted_output0, gvk_ciphertext: ct(2) }.publish(env);
        NewCommitmentEvent { commitment: proof.change_commitment1, index: idx1, encrypted_output: ext_data.encrypted_output1, gvk_ciphertext: ct(3) }.publish(env);
        BridgeOutEvent {
            bridge_message: proof.bridge_message,
            outbox_index,
            deadline_bucket: proof.deadline_bucket,
            refund_commitment: proof.refund_commitment,
            refund_ciphertext: ct(4),
            bridge_ciphertext: ct(5),
            encrypted_refund: ext_data.encrypted_refund,
            encrypted_bridge_message: ext_data.encrypted_bridge_message,
        }
        .publish(env);
        Ok(())
    }

    /// Claims a bridge message from the paired chain and creates two notes for
    /// its recipient, backed by this pool's liquidity (B8).
    pub fn bridge_in(env: &Env, proof: BridgeInProof, ext_data: BridgeInExtData, sender: Address) -> Result<(), Error> {
        sender.require_auth();
        soroban_utils::extend_instance(env);
        let cfg = config(env)?;
        let modulus = bn256_modulus(env);

        if !env.storage().persistent().has(&BridgeKey::RemoteRoot(proof.remote_root.clone())) {
            return Err(Error::UnknownRemoteRoot);
        }
        let claim_key = BridgeKey::ClaimNullifier(proof.claim_nullifier.clone());
        if env.storage().persistent().has(&claim_key) {
            return Err(Error::AlreadyClaimed);
        }
        if Self::hash_bridge_in_ext(env, &ext_data)? != proof.ext_data_hash {
            return Err(Error::WrongExtHash);
        }
        let deadline_at = proof.deadline_bucket.checked_mul(3600).ok_or(Error::Overflow)?;
        if env.ledger().timestamp() >= deadline_at {
            return Err(Error::DeadlinePassed);
        }
        for v in [&proof.claim_nullifier, &proof.output_commitment0, &proof.output_commitment1] {
            Self::validate_bn256_public_input(v, &modulus)?;
        }
        Self::check_cts(&proof.ciphertexts, 2, &modulus)?;

        // B8 public signals: 2 ciphertexts, D, nonce, remoteRoot, extDataHash,
        // claim nullifier, commitments, scale, asset, src (the paired chain),
        // dst (this chain), deadline.
        let d = Self::get_admin_view_key(env)?;
        let ext_hash = U256::from_be_bytes(env, &Bytes::from(proof.ext_data_hash.clone()));
        let scale = U256::from_u32(env, SCALE);
        let deadline = U256::from_u128(env, u128::from(proof.deadline_bucket));
        let mut inputs: Vec<Bn254Fr> = Vec::new(env);
        push_field_major(env, &mut inputs, &proof.ciphertexts);
        for v in [
            &d.x,
            &d.y,
            &ext_hash,
            &proof.remote_root,
            &ext_hash,
            &proof.claim_nullifier,
            &proof.output_commitment0,
            &proof.output_commitment1,
            &scale,
            &cfg.asset_id,
            &cfg.remote_chain_id,
            &local_chain_id(env),
            &deadline,
        ] {
            inputs.push_back(fr(env, v));
        }
        verify(env, &cfg.bridge_in_verifier, proof.proof, inputs)?;

        set_flag(env, &claim_key);
        let (idx0, idx1) = pool_core::merkle_with_history::MerkleTreeWithHistory::insert_two_leaves(
            env,
            proof.output_commitment0.clone(),
            proof.output_commitment1.clone(),
        )?;
        let ct = |i: u32| proof.ciphertexts.get(i).expect("ciphertext count checked above");
        NewCommitmentEvent { commitment: proof.output_commitment0, index: idx0, encrypted_output: ext_data.encrypted_output0, gvk_ciphertext: ct(0) }.publish(env);
        NewCommitmentEvent { commitment: proof.output_commitment1, index: idx1, encrypted_output: ext_data.encrypted_output1, gvk_ciphertext: ct(1) }.publish(env);
        BridgeInEvent { claim_nullifier: proof.claim_nullifier, remote_root: proof.remote_root }.publish(env);
        Ok(())
    }

    /// Settles a claimed message after its deadline (attestation status 0x02).
    /// Its value stays here as liquidity.
    pub fn finalize(env: &Env, bridge_message: U256, attestation: BytesN<65>) -> Result<(), Error> {
        let mut m = Self::settle(env, &bridge_message, ATTEST_CLAIMED, &attestation)?;
        m.status = STATUS_FINALIZED;
        let key = BridgeKey::Pending(bridge_message.clone());
        env.storage().persistent().set(&key, &m);
        extend_persistent(env, &key);
        BridgeFinalizedEvent { bridge_message }.publish(env);
        Ok(())
    }

    /// Refunds an unclaimed message after its deadline (attestation status
    /// 0x01): inserts the stored refund note as the pair (refund, 0).
    pub fn refund(env: &Env, bridge_message: U256, attestation: BytesN<65>) -> Result<(), Error> {
        let mut m = Self::settle(env, &bridge_message, ATTEST_UNCLAIMED, &attestation)?;
        m.status = STATUS_REFUNDED;
        let key = BridgeKey::Pending(bridge_message.clone());
        env.storage().persistent().set(&key, &m);
        extend_persistent(env, &key);
        let zero = U256::from_u32(env, 0);
        let (idx0, idx1) =
            pool_core::merkle_with_history::MerkleTreeWithHistory::insert_two_leaves(env, m.refund_commitment.clone(), zero.clone())?;
        // The refund note's GVK ciphertext and delivery payload were published
        // in BridgeOutEvent; these events keep the note tree reconstructible.
        NewCommitmentEvent { commitment: m.refund_commitment.clone(), index: idx0, encrypted_output: Bytes::new(env), gvk_ciphertext: zero_ciphertext(env) }.publish(env);
        NewCommitmentEvent { commitment: zero, index: idx1, encrypted_output: Bytes::new(env), gvk_ciphertext: zero_ciphertext(env) }.publish(env);
        BridgeRefundedEvent { bridge_message, refund_commitment: m.refund_commitment, index: idx0 }.publish(env);
        Ok(())
    }

    // ========== Bridge getters ==========

    pub fn get_bridge_config(env: &Env) -> Result<BridgeConfig, Error> {
        config(env)
    }

    pub fn chain_id(env: &Env) -> U256 {
        local_chain_id(env)
    }

    pub fn get_outbox_root(env: &Env) -> Result<U256, Error> {
        Outbox::root(env)
    }

    pub fn outbox_next_index(env: &Env) -> Result<u64, Error> {
        Outbox::next_index(env)
    }

    pub fn is_known_remote_root(env: &Env, root: U256) -> bool {
        env.storage().persistent().has(&BridgeKey::RemoteRoot(root))
    }

    pub fn is_claimed(env: &Env, claim_nullifier: U256) -> bool {
        env.storage().persistent().has(&BridgeKey::ClaimNullifier(claim_nullifier))
    }

    pub fn get_pending_message(env: &Env, bridge_message: U256) -> Option<PendingMessage> {
        env.storage().persistent().get(&BridgeKey::Pending(bridge_message))
    }

    /// The digest the attester signs (B12).
    pub fn attestation_digest(env: &Env, bridge_message: U256, status: u32) -> Result<BytesN<32>, Error> {
        let status = u8::try_from(status).map_err(|_| Error::InvalidAttestation)?;
        Ok(env.crypto().keccak256(&Self::attestation_message(env, &bridge_message, status)).into())
    }

    /// SPP's transact ext-data hash for this pool (a read-only helper for
    /// clients; the same function `transact` checks).
    pub fn hash_ext_data(env: &Env, ext_data: super::ExtData) -> Result<BytesN<32>, Error> {
        Ok(super::hash_ext_data(env, &ext_data, &Self::get_token(env)?))
    }

    pub fn hash_bridge_out_ext_data(env: &Env, ext_data: BridgeOutExtData) -> Result<BytesN<32>, Error> {
        Self::hash_bridge_out_ext(env, &ext_data)
    }

    pub fn hash_bridge_in_ext_data(env: &Env, ext_data: BridgeInExtData) -> Result<BytesN<32>, Error> {
        Self::hash_bridge_in_ext(env, &ext_data)
    }
}
