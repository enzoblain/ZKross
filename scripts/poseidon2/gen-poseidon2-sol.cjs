// Generates contracts/ethereum/src/Poseidon2.sol from the round constants in
// the SPP Poseidon2 vector file (read out of SPP's soroban_utils::constants by
// scripts/poseidon2/spp-poseidon2-vectors), so no constant is copied by hand.
//
// Usage: node gen-poseidon2-sol.cjs <poseidon2_vectors.json> <out.sol>
const fs = require("fs");

const [vectorsPath, outPath] = process.argv.slice(2);
const v = JSON.parse(fs.readFileSync(vectorsPath, "utf8"));
const P = v.modulus;

function checkParams(t, width, diag) {
  const p = v[t];
  if (p.d !== 5 || p.rounds_f !== 8 || p.rounds_p !== 56) throw new Error(`${t}: unexpected round counts`);
  if (JSON.stringify(p.mat_diag_m_1) !== JSON.stringify(diag)) throw new Error(`${t}: unexpected diagonal`);
  if (p.round_constants.length !== 64) throw new Error(`${t}: expected 64 rows`);
  p.round_constants.forEach((row, i) => {
    const full = i < 4 || i >= 60;
    if (full && row.length !== width) throw new Error(`${t}: full row ${i} has width ${row.length}`);
    if (!full && row.slice(1).some((c) => BigInt(c) !== 0n)) throw new Error(`${t}: partial row ${i} not [c, 0..]`);
  });
  return p.round_constants;
}

// One permutation, unrolled, over Yul variables `vars`.
function permutation(rc, vars, diag) {
  const L = [];
  const sum = `s := ${vars.slice(1).reduce((acc, x) => `addmod(${acc}, ${x}, ${P})`, vars[0])}`;
  // External matrix circ(2, 1, ..., 1) for t = 2 and t = 3: x_i += sum.
  const external = () => {
    L.push(sum);
    L.push(vars.map((x) => `${x} := addmod(${x}, s, ${P})`).join(" "));
  };
  // Internal matrix: x_i = sum + diag_m_1[i] * x_i.
  const internal = () => {
    L.push(sum);
    L.push(
      vars
        .map((x, i) => {
          if (diag[i] === 1) return `${x} := addmod(s, ${x}, ${P})`;
          if (diag[i] === 2) return `${x} := addmod(s, addmod(${x}, ${x}, ${P}), ${P})`;
          throw new Error("unsupported diagonal entry");
        })
        .join(" ")
    );
  };
  L.push("// initial external linear layer");
  external();
  rc.forEach((row, i) => {
    const full = i < 4 || i >= 60;
    if (full) {
      L.push(`// full round ${i}`);
      L.push(vars.map((x, j) => `${x} := sbox(addmod(${x}, ${row[j]}, ${P}))`).join(" "));
      external();
    } else {
      L.push(`// partial round ${i}`);
      L.push(`${vars[0]} := sbox(addmod(${vars[0]}, ${row[0]}, ${P}))`);
      internal();
    }
  });
  return L;
}

const indent = (lines, n) => lines.map((l) => " ".repeat(n) + l).join("\n");

const t2 = permutation(checkParams("t2", 2, [1, 2]), ["a", "b"], [1, 2]);
const t3 = permutation(checkParams("t3", 3, [1, 1, 2]), ["a", "b", "c"], [1, 1, 2]);

const sbox = `function sbox(x) -> y {
    let x2 := mulmod(x, x, ${P})
    y := mulmod(mulmod(x2, x2, ${P}), x, ${P})
}`;

const out = `// SPDX-License-Identifier: Apache-2.0
// GENERATED FILE, DO NOT EDIT. Regenerate with scripts/poseidon2/gen-poseidon2-sol.cjs.
pragma solidity ^0.8.24;

/// @title Poseidon2 over BN254, matching Stellar Private Payments (SPP).
/// @notice A port of SPP's \`soroban_utils::poseidon2\` (pinned SPP commit in
/// VERSIONS.md): the Poseidon2 permutation with d = 5, 8 full rounds and 56
/// partial rounds, and SPP's round constants for t = 2 and t = 3. Checked
/// against vectors taken from SPP's Soroban code and its off-chain
/// \`taceo_poseidon2\` (test/Poseidon2.t.sol). The hash functions are
/// \`external\`: the library is deployed once and linked, which keeps the
/// unrolled code out of every contract that hashes.
library Poseidon2 {
    /// BN254 scalar field modulus.
    uint256 internal constant R = ${BigInt(P).toString()};

    /// An input is not a canonical field element. SPP's Soroban code panics here.
    error Poseidon2InputNotInField();

    /// SPP's \`poseidon2_compress\`: the t = 2 permutation of [left, right],
    /// with the first output plus \`left\` (feed-forward). Used for every
    /// internal node of SPP's Merkle trees.
    function compress(uint256 left, uint256 right) external pure returns (uint256 out) {
        if (left >= R || right >= R) revert Poseidon2InputNotInField();
        assembly ("memory-safe") {
${indent(sbox.split("\n"), 12)}
            let a := left
            let b := right
            let s := 0
${indent(t2, 12)}
            out := addmod(a, left, ${P})
        }
    }

    /// SPP's \`poseidon2_hash2\`: the t = 3 permutation of [a, b, sep], first
    /// output. Note the domain separator \`sep\` is the last state element.
    function hash2(uint256 a_, uint256 b_, uint256 sep) external pure returns (uint256 out) {
        if (a_ >= R || b_ >= R || sep >= R) revert Poseidon2InputNotInField();
        assembly ("memory-safe") {
${indent(sbox.split("\n"), 12)}
            let a := a_
            let b := b_
            let c := sep
            let s := 0
${indent(t3, 12)}
            out := a
        }
    }
}
`;
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath}`);
