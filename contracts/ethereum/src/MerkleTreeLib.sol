// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Poseidon2} from "./Poseidon2.sol";
import {MerkleZeroHashes} from "./MerkleZeroHashes.sol";

/// @title Fixed-depth Merkle tree with root history, as a storage library.
/// @notice Port of SPP's `pool-core::merkle_with_history` (pinned SPP commit in
/// VERSIONS.md): leaves are inserted two at a time, nodes are
/// `Poseidon2.compress(left, right)`, and the last `ROOT_HISTORY_SIZE` roots
/// stay valid. A library over a storage struct so one contract can hold
/// several trees (the note tree and the bridge outbox).
///
/// Differences from SPP, none observable through these functions:
/// - SPP keeps the whole tree in one Soroban storage entry of fixed size, for
///   Soroban's simulated storage footprint. Here it is ordinary storage.
/// - SPP fills all 90 history slots with the empty root at init and scans the
///   ring in `is_known_root`. Here only slot 0 holds the empty root, and a
///   per-root counter answers `isKnownRoot` in one read. The empty root is
///   evicted at the ninetieth insertion either way, as SPP notes.
library MerkleTreeLib {
    /// Number of roots kept in history (SPP's `ROOT_HISTORY_SIZE`).
    uint256 internal constant ROOT_HISTORY_SIZE = 90;

    struct Tree {
        /// Number of levels, fixed at init (1 to 32).
        uint32 levels;
        /// Next available leaf index.
        uint64 nextIndex;
        /// Left-sibling hashes along the insertion path; element `i` holds
        /// the hash at level `i + 1`.
        uint256[32] filledSubtrees;
        /// Root history ring.
        uint256[ROOT_HISTORY_SIZE] roots;
        /// How many history slots hold each root.
        mapping(uint256 => uint256) rootSlots;
    }

    error WrongLevels();
    error MerkleTreeFull();
    error NextIndexNotEven();
    error AlreadyInitialized();

    /// SPP's `MerkleTreeWithHistory::init`.
    function init(Tree storage t, uint32 levels_) internal {
        if (t.levels != 0) revert AlreadyInitialized();
        if (levels_ == 0 || levels_ > 32) revert WrongLevels();
        t.levels = levels_;
        // Only levels 1 to levels - 1 are ever read back: the leaf level is
        // hashed from the two leaves and the top level is the root itself.
        for (uint256 i = 1; i < levels_; i++) {
            t.filledSubtrees[i - 1] = MerkleZeroHashes.zeroHash(i);
        }
        uint256 root0 = MerkleZeroHashes.zeroHash(levels_);
        t.roots[0] = root0;
        t.rootSlots[root0] = 1;
    }

    /// SPP's `root_index_for`: the history slot holding the root produced by
    /// the insertion that set the leaf counter to `nextIndex_`.
    function rootIndexFor(uint64 nextIndex_) internal pure returns (uint256) {
        return (uint256(nextIndex_) / 2) % ROOT_HISTORY_SIZE;
    }

    /// SPP's `insert_two_leaves`. Returns the indexes of the two leaves.
    function insertTwoLeaves(Tree storage t, uint256 leaf1, uint256 leaf2) internal returns (uint32, uint32) {
        uint64 index = t.nextIndex;
        uint32 levels_ = t.levels;
        if (index % 2 != 0) revert NextIndexNotEven();
        if (uint256(index) + 2 > (uint256(1) << levels_)) revert MerkleTreeFull();

        uint256 currentHash = Poseidon2.compress(leaf1, leaf2);
        uint256 currentIndex = uint256(index) >> 1;
        for (uint256 lvl = 1; lvl < levels_; lvl++) {
            if (currentIndex & 1 == 1) {
                currentHash = Poseidon2.compress(t.filledSubtrees[lvl - 1], currentHash);
            } else {
                t.filledSubtrees[lvl - 1] = currentHash;
                currentHash = Poseidon2.compress(currentHash, MerkleZeroHashes.zeroHash(lvl));
            }
            currentIndex >>= 1;
        }

        uint64 newNext = index + 2;
        t.nextIndex = newNext;
        uint256 slot = rootIndexFor(newNext);
        uint256 evicted = t.roots[slot];
        if (evicted != 0) t.rootSlots[evicted] -= 1;
        t.roots[slot] = currentHash;
        t.rootSlots[currentHash] += 1;

        // index + 2 <= 2^levels <= 2^32, so both indexes fit in uint32.
        return (uint32(index), uint32(index + 1));
    }

    /// SPP's `current_root_index`.
    function currentRootIndex(Tree storage t) internal view returns (uint256) {
        return rootIndexFor(t.nextIndex);
    }

    /// SPP's `is_known_root`. The zero root is never known.
    function isKnownRoot(Tree storage t, uint256 root) internal view returns (bool) {
        if (root == 0) return false;
        return t.rootSlots[root] != 0;
    }

    /// SPP's `get_last_root`.
    function getLastRoot(Tree storage t) internal view returns (uint256) {
        return t.roots[rootIndexFor(t.nextIndex)];
    }
}
