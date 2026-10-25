# Pinned versions

Do not upgrade any of these mid-project without the team.

## Stellar Private Payments (SPP)

| Item | Value |
| --- | --- |
| Repository | https://github.com/NethermindEth/stellar-private-payments |
| Commit | `9bc3a78b90c84b144e86af04c9c331a684f528dd` (2026-10-23, "Add pool and global view keys labels in CLI (#754)") |
| Where it lives | Not in this repo yet (team decision). Phase 0 used a scratch clone in WSL: `~/zkross-scratch/stellar-private-payments` |

## Toolchain

All builds run inside WSL2 (Ubuntu 26.04.1 LTS).

| Tool | Version | Notes |
| --- | --- | --- |
| Rust | 1.97.1 | Set by SPP's `rust-toolchain.toml`, targets `wasm32v1-none`, `wasm32-unknown-unknown` |
| Stellar CLI | 28.1.0 (`c0f4d0da`) | Prebuilt binary from stellar-cli's `install.sh` |
| Node.js | 20.20.2 (npm 10.8.2) | Installed with nvm |
| snarkjs | 0.7.6 | `npm install -g snarkjs` |
| Foundry (forge, anvil) | 1.8.6 (`6bad0a66`) | Installed with `foundryup` |
| solc | 0.8.37 | Pinned in `contracts/ethereum/foundry.toml` |
| Circom | 2.2.3 (`ad44e915`) | `cargo install --git https://github.com/iden3/circom --tag v2.2.3`; SPP's `circom.lock` pins it. Needed for witness graphs (`--graphs`) and the constraint-removal check |

## Local changes to SPP (vendored under `spp/`)

| Where | Change |
| --- | --- |
| `contracts/pool-gvk/src/pool_gvk/bridge.rs`, error codes 22–30 | The ZKross bridge (SPEC.md Part B) |
| `contracts/circom-groth16-verifier/src/lib.rs` | One `g1_msm` instead of a `g1_mul` per public input: same result, about a third of the cost; keeps `bridge_out` under Soroban's 100M-instruction limit |
| `circuits/src/bridge_*.circom`, `circuits/src/zkross/` | The bridge circuits |
| `tools/circuit-compiler/src/{lib,witness}.rs` | `bridge_out`/`bridge_in` added to the key and witness-graph lists |
| `deployments/zkross/circuit_keys/` | Our circuits' Groth16 keys and witness graphs (single-party testnet setup) |
| tests | `circuits/src/test/prove_bridge.rs`, `contracts/pool-gvk/src/test_bridge.rs`; some `pool-gvk` test helpers made `pub(crate)`; `k256` dev-dependency |
