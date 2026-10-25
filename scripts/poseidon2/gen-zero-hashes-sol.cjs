// Generates contracts/ethereum/src/MerkleZeroHashes.sol from the zero hash
// table in the SPP Poseidon2 vector file (SPP's soroban_utils::get_zeroes).
//
// Usage: node gen-zero-hashes-sol.cjs <poseidon2_vectors.json> <out.sol>
const fs = require("fs");

const [vectorsPath, outPath] = process.argv.slice(2);
const z = JSON.parse(fs.readFileSync(vectorsPath, "utf8")).zero_hashes;
if (z.length !== 33) throw new Error(`expected 33 zero hashes, got ${z.length}`);

const branches = z.map((h, i) => `        if (level == ${i}) return ${h};`).join("\n");

const out = `// SPDX-License-Identifier: Apache-2.0
// GENERATED FILE, DO NOT EDIT. Regenerate with scripts/poseidon2/gen-zero-hashes-sol.cjs.
pragma solidity ^0.8.24;

/// @title SPP's Merkle zero hashes.
/// @notice Port of \`soroban_utils::poseidon2::ZERO_HASHES\`: level 0 is the
/// empty leaf, Poseidon2 (t = 4) of "XLM" = (88, 76, 77) with domain 0, and
/// each level above is \`Poseidon2.compress\` of the level below with itself.
/// Level 32 is the root of an empty 32-level tree.
library MerkleZeroHashes {
    /// Number of levels the table covers (SPP's \`ZERO_HASH_LEVELS\`).
    uint256 internal constant LEVELS = 33;

    error ZeroHashLevelOutOfRange();

    function zeroHash(uint256 level) internal pure returns (uint256) {
${branches}
        revert ZeroHashLevelOutOfRange();
    }
}
`;
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath}`);
