# Poseidon2 for Solidity

`contracts/ethereum/src/Poseidon2.sol` is generated, not hand-written. Both steps run inside WSL against an SPP checkout at the pinned commit (see `VERSIONS.md`).

1. `spp-poseidon2-vectors/` reads SPP's Poseidon2 round constants out of `soroban_utils::constants` and computes test vectors with SPP's on-chain code (`soroban_utils::poseidon2_compress` / `poseidon2_hash2`, run through the Soroban host). It asserts every vector against SPP's off-chain implementation (`taceo_poseidon2`) and writes `poseidon2_vectors.json`. Copy SPP's `Cargo.lock` next to it first, so dependency versions match SPP's.
2. `gen-poseidon2-sol.cjs` turns the round constants in that file into the unrolled Solidity library.

```bash
cp -r scripts/poseidon2/spp-poseidon2-vectors ~/zkross-scratch/        # next to the SPP checkout
cp ~/zkross-scratch/stellar-private-payments/Cargo.lock ~/zkross-scratch/spp-poseidon2-vectors/
(cd ~/zkross-scratch/spp-poseidon2-vectors && cargo run --release -- ~/zkross-scratch/poseidon2_vectors.json)
cp ~/zkross-scratch/poseidon2_vectors.json contracts/ethereum/test/fixtures/spp/
node scripts/poseidon2/gen-poseidon2-sol.cjs contracts/ethereum/test/fixtures/spp/poseidon2_vectors.json contracts/ethereum/src/Poseidon2.sol
```

`contracts/ethereum/test/Poseidon2.t.sol` checks the library against the vector file.
