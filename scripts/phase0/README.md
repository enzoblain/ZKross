# Phase 0 helpers

These rebuild the SPP fixtures used by `contracts/ethereum/test/SppVerifier.t.sol`. Run them inside WSL, with the toolchain in `VERSIONS.md` and an SPP checkout at the pinned commit.

| File | What it does |
| --- | --- |
| `spp-proof-dump/` | Proves one deposit on SPP's `policy_tx_2_2_gvk_T` circuit with SPP's committed testnet proving key, using SPP's own SDK prover, and writes `proof.json` / `public.json` in snarkjs format. It is a standalone crate and changes nothing in SPP. |
| `render-verifier.cjs` | Renders snarkjs's own Groth16 Solidity template from a snarkjs `vk.json`. This is what `snarkjs zkey export solidityverifier` does after reading the key out of a `.zkey`; SPP only ships the `vk.json`. |
| `anvil-verify.sh` | Deploys the verifier to a fresh local anvil and checks the fixture proof (true) and a tampered one (false). |

## Rebuilding the fixture

```bash
SPP=~/zkross-scratch/stellar-private-payments   # pinned commit, see VERSIONS.md
cd $SPP && mkdir -p testdata && cp deployments/testnet/circuit_keys/*.{bin,json} testdata/ && make circuits
cp -r scripts/phase0/spp-proof-dump ~/zkross-scratch/   # must sit next to the SPP checkout
cd ~/zkross-scratch/spp-proof-dump && cargo run --release -- $SPP \
  $SPP/target/circuits-artifacts/out/policy_tx_2_2_gvk_T.r1cs ~/zkross-scratch/phase0-proof
cd ~/zkross-scratch/phase0-proof
cp $SPP/deployments/testnet/circuit_keys/policy_tx_2_2_gvk_T_vk.json vk.json
snarkjs groth16 verify vk.json public.json proof.json            # must print OK
node render-verifier.cjs "$(npm root -g)/snarkjs" vk.json Groth16Verifier.sol
snarkjs zkey export soliditycalldata public.json proof.json > calldata.txt
```

Each run gives a different proof (Groth16 proofs are randomized), but it verifies against the same key.

## Licenses

The rendered verifier comes from snarkjs's template and is GPL-3.0, as its header says. The proof fixture is produced from SPP's Apache-2.0 SDK and its LGPL-3.0 compiled circuits.
