//! zkross-prover CLI (JSON request file in, JSON on stdout):
//!   build-transact   <req.json>   inputs for policy_tx_2_2_gvk_T
//!   build-bridge-out <req.json>   inputs for bridge_out (SPEC.md B8)
//!   build-bridge-in  <req.json>   inputs for bridge_in (SPEC.md B8)
//!   prove <inputs.json> --pk <file> --graph <file> --r1cs <file>
//!   pubkey <sk>                   SPP note public key
//!   commitment <amount> <pk> <blinding>   SPP note commitment
//!   bridge-message <req.json>     C and its claim nullifier (SPEC.md B3, B4)
//!   admin-key <d_priv>            the admin's Global View Key D
//!   decrypt <req.json>            admin decryption of GVK ciphertexts
//!   tree-root <req.json>          root of {levels, leaves}
use anyhow::{Context, Result, bail};
use std::fs;
use zkross_prover::*;

fn read(path: &str) -> Result<String> {
    fs::read_to_string(path).with_context(|| format!("read {path}"))
}

fn bytes(path: &str) -> Result<Vec<u8>> {
    fs::read(path).with_context(|| format!("read {path}"))
}

fn arg_after(args: &[String], flag: &str) -> Result<String> {
    let i = args.iter().position(|a| a == flag).with_context(|| format!("missing {flag}"))?;
    args.get(i + 1).cloned().with_context(|| format!("missing value for {flag}"))
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("");
    let first = || args.get(2).cloned().context("missing argument");
    let out = match cmd {
        "build-private-transact" => build_private_transact(&read(&first()?)?)?,
        "build-transact" => build_transact(&read(&first()?)?)?,
        "build-bridge-out" => build_bridge_out(&read(&first()?)?)?,
        "build-bridge-in" => build_bridge_in(&read(&first()?)?)?,
        "prove" => prove(
            &read(&first()?)?,
            &bytes(&arg_after(&args, "--pk")?)?,
            &bytes(&arg_after(&args, "--graph")?)?,
            &bytes(&arg_after(&args, "--r1cs")?)?,
        )?,
        "pubkey" => pubkey_of(&first()?)?,
        "commitment" => {
            let get = |i: usize| args.get(i).context("usage: commitment <amount> <pk> <blinding>");
            commitment_of(get(2)?, get(3)?, get(4)?)?
        }
        "bridge-message" => bridge_message_of(&read(&first()?)?)?,
        "admin-key" => admin_key_of(&first()?)?,
        "decrypt" => decrypt(&read(&first()?)?)?,
        "tree-root" => tree_root(&read(&first()?)?)?,
        _ => bail!("usage: zkross-prover <build-transact|build-bridge-out|build-bridge-in|prove|pubkey|tree-root> ..."),
    };
    println!("{out}");
    Ok(())
}
