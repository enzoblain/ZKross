//! zkross-prover's library for the browser: the same input builders, hashes
//! and SPP witness calculator and Groth16 prover as the CLI. Requests and
//! results are the CLI's JSON, as strings. adminKey and decrypt serve the
//! Admin page, which holds the pasted view key in memory only.
use wasm_bindgen::prelude::*;

fn js(r: anyhow::Result<serde_json::Value>) -> Result<String, JsError> {
    r.map(|v| v.to_string()).map_err(|e| JsError::new(&format!("{e:#}")))
}

#[wasm_bindgen(js_name = buildTransact)]
pub fn build_transact(req: &str) -> Result<String, JsError> {
    js(zkross_prover::build_transact(req))
}

#[wasm_bindgen(js_name = buildPrivateTransact)]
pub fn build_private_transact(req: &str) -> Result<String, JsError> {
    js(zkross_prover::build_private_transact(req))
}

#[wasm_bindgen(js_name = buildBridgeOut)]
pub fn build_bridge_out(req: &str) -> Result<String, JsError> {
    js(zkross_prover::build_bridge_out(req))
}

#[wasm_bindgen(js_name = buildBridgeIn)]
pub fn build_bridge_in(req: &str) -> Result<String, JsError> {
    js(zkross_prover::build_bridge_in(req))
}

/// Proves a `build*` result with the circuit's proving key, witness graph and R1CS.
#[wasm_bindgen]
pub fn prove(req: &str, pk: &[u8], graph: &[u8], r1cs: &[u8]) -> Result<String, JsError> {
    js(zkross_prover::prove(req, pk, graph, r1cs))
}

#[wasm_bindgen]
pub fn pubkey(sk: &str) -> Result<String, JsError> {
    js(zkross_prover::pubkey_of(sk))
}

#[wasm_bindgen]
pub fn commitment(amount: &str, pk: &str, blinding: &str) -> Result<String, JsError> {
    js(zkross_prover::commitment_of(amount, pk, blinding))
}

#[wasm_bindgen(js_name = bridgeMessage)]
pub fn bridge_message(req: &str) -> Result<String, JsError> {
    js(zkross_prover::bridge_message_of(req))
}

#[wasm_bindgen(js_name = treeRoot)]
pub fn tree_root(req: &str) -> Result<String, JsError> {
    js(zkross_prover::tree_root(req))
}

/// The admin's Global View Key `D` for a pasted private scalar (Admin page
/// only; the page keeps the scalar in memory and never sends or stores it).
#[wasm_bindgen(js_name = encryptionKey)]
pub fn encryption_key(signature: &str) -> Result<String, JsError> {
    js(zkross_prover::encryption_key_of(signature))
}

#[wasm_bindgen(js_name = encryptTo)]
pub fn encrypt_to(pk: &str, plaintext: &str) -> Result<String, JsError> {
    js(zkross_prover::encrypt_to(pk, plaintext))
}

#[wasm_bindgen(js_name = decryptFrom)]
pub fn decrypt_from(sk: &str, data: &str) -> Result<String, JsError> {
    js(zkross_prover::decrypt_from(sk, data))
}

#[wasm_bindgen]
pub fn nullifier(sk: &str, commitment: &str, leaf_index: &str) -> Result<String, JsError> {
    let index = leaf_index.parse::<u64>().map_err(|_| JsError::new("leaf_index must be a number"))?;
    js(zkross_prover::nullifier_of(sk, commitment, index))
}

#[wasm_bindgen(js_name = adminKey)]
pub fn admin_key(d_priv: &str) -> Result<String, JsError> {
    js(zkross_prover::admin_key_of(d_priv))
}

/// Admin decryption of GVK ciphertexts, as the CLI's `decrypt`.
#[wasm_bindgen]
pub fn decrypt(req: &str) -> Result<String, JsError> {
    js(zkross_prover::decrypt(req))
}
