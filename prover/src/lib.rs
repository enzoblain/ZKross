//! zkross-prover: circuit inputs and Groth16 proofs for ZKross.
//!
//! Every hash here is SPP's Poseidon2 (taceo_poseidon2, as SPP's SDK and
//! circuits use) in SPP's style, and every format follows SPEC.md. Proofs come
//! from SPP's own witness calculator and Groth16 prover. Field elements are
//! read as `0x` hex or decimal and written as 32-byte big-endian `0x` hex.
//!
//! The library takes JSON strings and bytes and does no I/O, so the same code
//! runs in the CLI (`src/main.rs`) and in the browser (`wasm/`).
use anyhow::{Context, Result, bail, ensure};
use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use circuits::core::merkle::PrefixTree;
use num_bigint::BigUint;
use serde::Deserialize;
use serde_json::{Map, Value, json};
use stellar_private_payments::{
    types::{BabyJubJubPoint, Field, GlobalViewKeyCiphertext},
    zk::{prover::Prover, witness::WitnessCalculator},
};
use taceo_poseidon2::bn254::{t3, t4};

// ========== Field helpers ==========

fn fe(s: &str) -> Result<Fr> {
    let v = if let Some(h) = s.strip_prefix("0x") {
        BigUint::parse_bytes(h.as_bytes(), 16).context("bad hex")?
    } else {
        BigUint::parse_bytes(s.as_bytes(), 10).context("bad decimal")?
    };
    let r = BigUint::from_bytes_be(&Fr::MODULUS.to_bytes_be());
    ensure!(v < r, "value {s} is not below the field size");
    Ok(Fr::from_be_bytes_mod_order(&v.to_bytes_be()))
}

fn hex(f: &Fr) -> String {
    let b = f.into_bigint().to_bytes_be();
    format!("0x{}", b.iter().map(|x| format!("{x:02x}")).collect::<String>())
}

fn dec(f: &Fr) -> String {
    BigUint::from_bytes_be(&f.into_bigint().to_bytes_be()).to_str_radix(10)
}

fn p2(a: Fr, b: Fr, tag: u64) -> Fr {
    t3::permutation(&[a, b, Fr::from(tag)])[0]
}

fn p3(a: Fr, b: Fr, c: Fr, tag: u64) -> Fr {
    t4::permutation(&[a, b, c, Fr::from(tag)])[0]
}

/// SPP: pk = P2(sk, 0; 0x03).
fn pubkey(sk: Fr) -> Fr {
    p2(sk, Fr::from(0u64), 0x03)
}

/// SPP: commitment = P3(amount, pk, blinding; 0x01).
fn commitment(amount: Fr, pk: Fr, blinding: Fr) -> Fr {
    p3(amount, pk, blinding, 0x01)
}

/// SPP: nullifier = P3(cm, pathIndices, P3(sk, cm, pathIndices; 0x04); 0x02).
fn nullifier(sk: Fr, cm: Fr, path_indices: Fr) -> Fr {
    let sig = p3(sk, cm, path_indices, 0x04);
    p3(cm, path_indices, sig, 0x02)
}

/// SPEC.md B3.
fn bridge_message(amount: Fr, asset: Fr, src: Fr, dst: Fr, pk: Fr, secret: Fr, deadline: Fr) -> Fr {
    let h1 = p3(amount, asset, src, 0x07);
    let h2 = p3(h1, dst, pk, 0x07);
    p3(h2, secret, deadline, 0x07)
}

/// SPEC.md B4.
fn claim_nullifier(secret: Fr) -> Fr {
    p2(secret, Fr::from(0u64), 0x08)
}

// ========== Requests ==========

#[derive(Deserialize)]
struct InNote {
    /// Leaf index in the pool tree; `null` for a zero-amount dummy input.
    leaf_index: Option<usize>,
    sk: String,
    amount: String,
    blinding: String,
}

#[derive(Deserialize)]
struct OutNote {
    pk: String,
    amount: String,
    blinding: String,
}

#[derive(Deserialize)]
struct SpendCommon {
    levels: usize,
    /// The pool tree's leaves in insertion order.
    leaves: Vec<String>,
    d: [String; 2],
    ext_data_hash: String,
    inputs: [InNote; 2],
    outputs: [OutNote; 2],
    in_salts: [String; 2],
    out_salts: [String; 2],
}

#[derive(Deserialize)]
struct TransactReq {
    #[serde(flatten)]
    common: SpendCommon,
    public_amount: String,
}

#[derive(Deserialize)]
struct BridgeOutReq {
    #[serde(flatten)]
    common: SpendCommon,
    amount: String,
    scale: String,
    asset_id: String,
    src_chain: String,
    dst_chain: String,
    deadline_bucket: String,
    recipient_pk: String,
    claim_secret: String,
    refund_pk: String,
    refund_blinding: String,
    refund_salt: String,
    bridge_salt: String,
}

#[derive(Deserialize)]
struct BridgeInOut {
    amount: String,
    blinding: String,
}

#[derive(Deserialize)]
struct BridgeInReq {
    levels: usize,
    /// The remote outbox tree's leaves (pairs (C, 0)) in insertion order.
    outbox_leaves: Vec<String>,
    index: usize,
    d: [String; 2],
    ext_data_hash: String,
    amount: String,
    scale: String,
    asset_id: String,
    src_chain: String,
    dst_chain: String,
    deadline_bucket: String,
    recipient_sk: String,
    claim_secret: String,
    outputs: [BridgeInOut; 2],
    out_salts: [String; 2],
}

fn parse<T: for<'de> Deserialize<'de>>(json: &str) -> Result<T> {
    serde_json::from_str(json).context("parse request")
}

fn fes(v: &[String]) -> Result<Vec<Fr>> {
    v.iter().map(|s| fe(s)).collect()
}

fn decs(v: &[Fr]) -> Value {
    Value::from(v.iter().map(dec).collect::<Vec<_>>())
}

fn hexes(v: &[Fr]) -> Value {
    Value::from(v.iter().map(hex).collect::<Vec<_>>())
}

/// Spent inputs and change outputs shared by transact and bridge_out.
struct Spend {
    root: Fr,
    nullifiers: Vec<Fr>,
    commitments: Vec<Fr>,
    inputs: Map<String, Value>,
}

fn build_spend(c: &SpendCommon) -> Result<Spend> {
    let leaves = fes(&c.leaves)?;
    let tree = PrefixTree::new(&leaves, c.levels);
    let root = tree.root();
    let mut nullifiers = Vec::new();
    let (mut amounts, mut sks, mut blindings, mut path_idx, mut path_el) = (vec![], vec![], vec![], vec![], vec![]);
    for n in &c.inputs {
        let (sk, amount, blinding) = (fe(&n.sk)?, fe(&n.amount)?, fe(&n.blinding)?);
        let cm = commitment(amount, pubkey(sk), blinding);
        let (siblings, idx) = match n.leaf_index {
            Some(i) => {
                ensure!(leaves.get(i) == Some(&cm), "input note is not at leaf {i}");
                tree.proof(i)
            }
            None => {
                ensure!(amount == Fr::from(0u64), "an input without a leaf index must have amount 0");
                (vec![Fr::from(0u64); c.levels], 0)
            }
        };
        let idx = Fr::from(idx);
        nullifiers.push(nullifier(sk, cm, idx));
        amounts.push(amount);
        sks.push(sk);
        blindings.push(blinding);
        path_idx.push(idx);
        path_el.extend(siblings);
    }
    let mut commitments = Vec::new();
    let (mut oa, mut op, mut ob) = (vec![], vec![], vec![]);
    for o in &c.outputs {
        let (pk, amount, blinding) = (fe(&o.pk)?, fe(&o.amount)?, fe(&o.blinding)?);
        commitments.push(commitment(amount, pk, blinding));
        oa.push(amount);
        op.push(pk);
        ob.push(blinding);
    }
    let ext = fe(&c.ext_data_hash)?;
    let mut m = Map::new();
    m.insert("D".into(), decs(&fes(&c.d)?));
    m.insert("nonce".into(), dec(&ext).into());
    m.insert("root".into(), dec(&root).into());
    m.insert("extDataHash".into(), dec(&ext).into());
    m.insert("inputNullifier".into(), decs(&nullifiers));
    m.insert("inAmount".into(), decs(&amounts));
    m.insert("inPrivateKey".into(), decs(&sks));
    m.insert("inBlinding".into(), decs(&blindings));
    m.insert("inPathIndices".into(), decs(&path_idx));
    m.insert("inPathElements".into(), decs(&path_el));
    m.insert("outAmount".into(), decs(&oa));
    m.insert("outPubkey".into(), decs(&op));
    m.insert("outBlinding".into(), decs(&ob));
    m.insert("inSalt".into(), decs(&fes(&c.in_salts)?));
    m.insert("outSalt".into(), decs(&fes(&c.out_salts)?));
    Ok(Spend { root, nullifiers, commitments, inputs: m })
}

pub fn build_transact(req: &str) -> Result<Value> {
    let req: TransactReq = parse(req)?;
    let mut s = build_spend(&req.common)?;
    s.inputs.insert("publicAmount".into(), dec(&fe(&req.public_amount)?).into());
    s.inputs.insert("outputCommitment".into(), decs(&s.commitments));
    Ok(json!({
        "circuit": "policy_tx_2_2_gvk_T",
        "inputs": s.inputs,
        "root": hex(&s.root),
        "nullifiers": hexes(&s.nullifiers),
        "commitments": hexes(&s.commitments),
    }))
}

/// Non-GVK SPP input builder. Reuses the reviewed note/Merkle encoding and
/// explicitly drops every GVK-only witness input. No bridge liquidity circuit.
pub fn build_private_transact(req: &str) -> Result<Value> {
    let mut request: Value = parse(req)?;
    let object = request.as_object_mut().context("request must be an object")?;
    object.insert("d".into(), json!(["0", "0"]));
    object.insert("in_salts".into(), json!(["0", "0"]));
    object.insert("out_salts".into(), json!(["0", "0"]));
    let mut built = build_transact(&request.to_string())?;
    if let Some(root) = request.get("deposit_root") {
        // A deposit has only dummy (zero-valued) inputs, so no membership path
        // is consumed. Bind it to the current chain root without an indexer.
        let inputs = request["inputs"].as_array().context("inputs must be an array")?;
        for input in inputs {
            ensure!(fe(input["amount"].as_str().context("input amount")?)? == Fr::from(0u64), "deposit_root cannot override a spending path");
        }
        let root = fe(root.as_str().context("deposit root")?)?;
        built["inputs"]["root"] = json!(dec(&root));
        built["root"] = json!(hex(&root));
    }
    built["circuit"] = json!("policy_tx_2_2");
    let inputs = built["inputs"].as_object_mut().context("missing witness inputs")?;
    for name in ["D", "nonce", "inSalt", "outSalt"] { inputs.remove(name); }
    Ok(built)
}

pub fn build_bridge_out(req: &str) -> Result<Value> {
    let r: BridgeOutReq = parse(req)?;
    let mut s = build_spend(&r.common)?;
    let (amount, scale) = (fe(&r.amount)?, fe(&r.scale)?);
    let (asset, src, dst, deadline) = (fe(&r.asset_id)?, fe(&r.src_chain)?, fe(&r.dst_chain)?, fe(&r.deadline_bucket)?);
    let (recipient_pk, secret) = (fe(&r.recipient_pk)?, fe(&r.claim_secret)?);
    let (refund_pk, refund_blinding) = (fe(&r.refund_pk)?, fe(&r.refund_blinding)?);
    let c = bridge_message(amount, asset, src, dst, recipient_pk, secret, deadline);
    let refund = commitment(amount * scale, refund_pk, refund_blinding);
    let m = &mut s.inputs;
    m.insert("changeCommitment".into(), decs(&s.commitments));
    m.insert("bridgeMessage".into(), dec(&c).into());
    m.insert("refundCommitment".into(), dec(&refund).into());
    for (k, v) in [("scale", scale), ("assetId", asset), ("srcChain", src), ("dstChain", dst), ("deadlineBucket", deadline)] {
        m.insert(k.into(), dec(&v).into());
    }
    for (k, v) in [
        ("amount", amount),
        ("recipientPk", recipient_pk),
        ("claimSecret", secret),
        ("refundPk", refund_pk),
        ("refundBlinding", refund_blinding),
        ("refundSalt", fe(&r.refund_salt)?),
        ("bridgeSalt", fe(&r.bridge_salt)?),
    ] {
        m.insert(k.into(), dec(&v).into());
    }
    Ok(json!({
        "circuit": "bridge_out",
        "inputs": s.inputs,
        "root": hex(&s.root),
        "nullifiers": hexes(&s.nullifiers),
        "change_commitments": hexes(&s.commitments),
        "bridge_message": hex(&c),
        "refund_commitment": hex(&refund),
        "claim_nullifier": hex(&claim_nullifier(secret)),
    }))
}

pub fn build_bridge_in(req: &str) -> Result<Value> {
    let r: BridgeInReq = parse(req)?;
    let (amount, scale) = (fe(&r.amount)?, fe(&r.scale)?);
    let (asset, src, dst, deadline) = (fe(&r.asset_id)?, fe(&r.src_chain)?, fe(&r.dst_chain)?, fe(&r.deadline_bucket)?);
    let recipient_pk = pubkey(fe(&r.recipient_sk)?);
    let secret = fe(&r.claim_secret)?;
    let c = bridge_message(amount, asset, src, dst, recipient_pk, secret, deadline);
    let leaves = fes(&r.outbox_leaves)?;
    ensure!(leaves.get(r.index) == Some(&c), "the bridge message is not at outbox leaf {}", r.index);
    let tree = PrefixTree::new(&leaves, r.levels);
    let (siblings, idx) = tree.proof(r.index);
    let ext = fe(&r.ext_data_hash)?;
    let mut amounts = Vec::new();
    let mut blindings = Vec::new();
    let mut commitments = Vec::new();
    for o in &r.outputs {
        let (a, b) = (fe(&o.amount)?, fe(&o.blinding)?);
        commitments.push(commitment(a, recipient_pk, b));
        amounts.push(a);
        blindings.push(b);
    }
    let cn = claim_nullifier(secret);
    let mut m = Map::new();
    m.insert("D".into(), decs(&fes(&r.d)?));
    m.insert("nonce".into(), dec(&ext).into());
    m.insert("remoteRoot".into(), dec(&tree.root()).into());
    m.insert("extDataHash".into(), dec(&ext).into());
    m.insert("claimNullifier".into(), dec(&cn).into());
    m.insert("outputCommitment".into(), decs(&commitments));
    for (k, v) in [
        ("scale", scale),
        ("assetId", asset),
        ("srcChain", src),
        ("dstChain", dst),
        ("deadlineBucket", deadline),
        ("amount", amount),
        ("recipientPk", recipient_pk),
        ("claimSecret", secret),
        ("pathIndices", Fr::from(idx)),
    ] {
        m.insert(k.into(), dec(&v).into());
    }
    m.insert("pathElements".into(), decs(&siblings));
    m.insert("outAmount".into(), decs(&amounts));
    m.insert("outBlinding".into(), decs(&blindings));
    m.insert("outSalt".into(), decs(&fes(&r.out_salts)?));
    Ok(json!({
        "circuit": "bridge_in",
        "inputs": m,
        "remote_root": hex(&tree.root()),
        "bridge_message": hex(&c),
        "claim_nullifier": hex(&cn),
        "commitments": hexes(&commitments),
        "recipient_pk": hex(&recipient_pk),
    }))
}

/// Proves `inputs` and returns SPP's 256-byte proof (the same bytes are the
/// EVM verifier's calldata words, SPEC.md A) and the public signals.
/// `req` is a `build-*` result (its `inputs` are proved) or bare inputs.
pub fn prove(req: &str, pk: &[u8], graph: &[u8], r1cs: &[u8]) -> Result<Value> {
    let req: Value = serde_json::from_str(req).context("parse inputs")?;
    let inputs = req.get("inputs").unwrap_or(&req);
    let calc = WitnessCalculator::from_graph(graph)?;
    let witness = calc.compute_witness(&inputs.to_string())?;
    let prover = Prover::new(pk, r1cs)?;
    let compressed = prover.prove_bytes(&witness)?;
    let publics = prover.extract_public_inputs(&witness)?;
    if !prover.verify(&compressed, &publics)? {
        bail!("the proof does not verify (the witness does not satisfy the circuit)");
    }
    let proof = prover.proof_bytes_to_uncompressed(&compressed)?;
    let signals: Vec<String> = publics
        .chunks(32)
        .map(|c| hex(&Fr::from_le_bytes_mod_order(c)))
        .collect();
    let words: Vec<String> = proof.chunks(32).map(|w| format!("0x{}", w.iter().map(|b| format!("{b:02x}")).collect::<String>())).collect();
    Ok(json!({
        "proof": format!("0x{}", proof.iter().map(|b| format!("{b:02x}")).collect::<String>()),
        "words": words,
        "public_signals": signals,
    }))
}

fn to_field(f: &Fr) -> Field {
    let mut le = [0u8; 32];
    le.copy_from_slice(&f.into_bigint().to_bytes_le());
    Field::from_le_bytes_mod_order(le)
}

fn from_field(f: &Field) -> Fr {
    Fr::from_le_bytes_mod_order(&f.to_le_bytes())
}

/// The admin's Global View Key `D = d * BASE8` (SPP's SDK).
fn admin_key(d_priv: Fr) -> Result<(Fr, Fr)> {
    let p = BabyJubJubPoint::from_priv_scalar(&to_field(&d_priv)).context("bad admin scalar")?;
    Ok((from_field(&p.x), from_field(&p.y)))
}

/// Admin decryption of GVK ciphertexts (SPP's SDK).
pub fn decrypt(req: &str) -> Result<Value> {
    #[derive(Deserialize)]
    struct Ct {
        rx: String,
        ry: String,
        c1: String,
        c2: String,
        c3: String,
    }
    #[derive(Deserialize)]
    struct R {
        d_priv: String,
        ciphertexts: Vec<Ct>,
    }
    let r: R = parse(req)?;
    let d = to_field(&fe(&r.d_priv)?);
    let mut notes = Vec::new();
    for c in &r.ciphertexts {
        let ct = GlobalViewKeyCiphertext {
            r: BabyJubJubPoint { x: to_field(&fe(&c.rx)?), y: to_field(&fe(&c.ry)?) },
            c1: to_field(&fe(&c.c1)?),
            c2: to_field(&fe(&c.c2)?),
            c3: to_field(&fe(&c.c3)?),
        };
        let n = ct.decrypt(&d)?;
        let (pk, amount, blinding) = (from_field(&n.pk), from_field(&n.amount), from_field(&n.blinding));
        notes.push(json!({ "pk": hex(&pk), "amount": dec(&amount), "blinding": hex(&blinding),
                           "commitment": hex(&commitment(amount, pk, blinding)) }));
    }
    Ok(json!({ "notes": notes }))
}

// ========== Small commands ==========

pub fn pubkey_of(sk: &str) -> Result<Value> {
    Ok(json!({ "pk": hex(&pubkey(fe(sk)?)) }))
}

pub fn commitment_of(amount: &str, pk: &str, blinding: &str) -> Result<Value> {
    Ok(json!({ "commitment": hex(&commitment(fe(amount)?, fe(pk)?, fe(blinding)?)) }))
}

/// `C` and its claim nullifier (SPEC.md B3, B4).
pub fn bridge_message_of(req: &str) -> Result<Value> {
    #[derive(Deserialize)]
    struct M {
        amount: String,
        asset_id: String,
        src_chain: String,
        dst_chain: String,
        recipient_pk: String,
        claim_secret: String,
        deadline_bucket: String,
    }
    let m: M = parse(req)?;
    let secret = fe(&m.claim_secret)?;
    let c = bridge_message(
        fe(&m.amount)?,
        fe(&m.asset_id)?,
        fe(&m.src_chain)?,
        fe(&m.dst_chain)?,
        fe(&m.recipient_pk)?,
        secret,
        fe(&m.deadline_bucket)?,
    );
    Ok(json!({ "bridge_message": hex(&c), "claim_nullifier": hex(&claim_nullifier(secret)) }))
}

pub fn admin_key_of(d_priv: &str) -> Result<Value> {
    let d = admin_key(fe(d_priv)?)?;
    Ok(json!({ "x": hex(&d.0), "y": hex(&d.1) }))
}

/// Root of `{levels, leaves}`.
pub fn tree_root(req: &str) -> Result<Value> {
    #[derive(Deserialize)]
    struct R {
        levels: usize,
        leaves: Vec<String>,
    }
    let r: R = parse(req)?;
    Ok(json!({ "root": hex(&PrefixTree::new(&fes(&r.leaves)?, r.levels).root()) }))
}

#[cfg(test)]
mod private_pool_tests {
    use super::*;
    fn request() -> Value {
        json!({"levels":20,"leaves":[],"ext_data_hash":"1","public_amount":"100",
            "inputs":[{"leaf_index":null,"sk":"2","amount":"0","blinding":"3"},{"leaf_index":null,"sk":"4","amount":"0","blinding":"5"}],
            "outputs":[{"pk":"6","amount":"60","blinding":"7"},{"pk":"8","amount":"40","blinding":"9"}]})
    }
    #[test]
    fn private_builder_has_no_global_view_inputs() {
        let built=build_private_transact(&request().to_string()).unwrap();
        assert_eq!(built["circuit"],"policy_tx_2_2");
        let inputs=built["inputs"].as_object().unwrap();
        for name in ["D","nonce","inSalt","outSalt"] {assert!(!inputs.contains_key(name));}
        assert_eq!(inputs["publicAmount"],"100");
        assert_eq!(built["commitments"].as_array().unwrap().len(),2);
    }
    #[test]
    fn deposit_root_override_requires_dummy_inputs() {
        let mut req=request(); req["deposit_root"]=json!("123");
        let built=build_private_transact(&req.to_string()).unwrap();
        assert_eq!(built["inputs"]["root"],"123");
        req["inputs"][0]["amount"]=json!("1");
        assert!(build_private_transact(&req.to_string()).is_err());
    }
    #[test]
    fn private_builder_refuses_noncanonical_external_hash() {
        let mut req=request(); req["ext_data_hash"]=json!("21888242871839275222246405745257275088548364400416034343698204186575808495617");
        assert!(build_private_transact(&req.to_string()).is_err());
    }
}
