// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Poseidon2} from "./Poseidon2.sol";
import {MerkleZeroHashes} from "./MerkleZeroHashes.sol";

/// @title Fixed-depth Merkle tree with root history.
/// @notice Port of SPP's `pool-core::merkle_with_history` (pinned SPP commit in
/// VERSIONS.md): leaves are inserted two at a time, nodes are
/// `Poseidon2.compress(left, right)`, and the last `ROOT_HISTORY_SIZE` roots
/// stay valid for proofs.
///
/// Differences from SPP, none observable through this contract's functions:
/// - SPP keeps the whole tree in one Soroban storage entry of fixed size, for
///   Soroban's simulated storage footprint. Here it is ordinary storage.
/// - SPP fills all 90 history slots with the empty root at init and scans the
///   ring in `is_known_root`. Here only slot 0 holds the empty root, and a
///   per-root counter answers `isKnownRoot` in one read. The empty root is
///   evicted at the ninetieth insertion either way, as SPP notes.
abstract contract MerkleTreeWithHistory {
    /// Number of roots kept in history (SPP's `ROOT_HISTORY_SIZE`).
    uint256 public constant ROOT_HISTORY_SIZE = 90;

    /// Number of levels in the tree, fixed at construction.
    uint32 public immutable levels;

    /// Next available leaf index.
    uint64 public nextIndex;
    /// Left-sibling hashes along the insertion path; element `i` holds the
    /// hash at level `i + 1`.
    uint256[32] internal filledSubtrees;
    /// Root history ring.
    uint256[ROOT_HISTORY_SIZE] internal roots;
    /// How many history slots hold each root.
    mapping(uint256 => uint256) private rootSlots;

    error WrongLevels();
    error MerkleTreeFull();
    error NextIndexNotEven();

    /// SPP's `MerkleTreeWithHistory::init`.
    constructor(uint32 levels_) {
        if (levels_ == 0 || levels_ > 32) revert WrongLevels();
        levels = levels_;
        // Only levels 1 to levels - 1 are ever read back: the leaf level is
        // hashed from the two leaves and the top level is the root itself.
        for (uint256 i = 1; i < levels_; i++) {
            filledSubtrees[i - 1] = MerkleZeroHashes.zeroHash(i);
        }
        uint256 root0 = MerkleZeroHashes.zeroHash(levels_);
        roots[0] = root0;
        rootSlots[root0] = 1;
    }

    /// SPP's `root_index_for`: the history slot holding the root produced by
    /// the insertion that set the leaf counter to `nextIndex_`.
    function _rootIndexFor(uint64 nextIndex_) internal pure returns (uint256) {
        return (uint256(nextIndex_) / 2) % ROOT_HISTORY_SIZE;
    }

    /// SPP's `insert_two_leaves`. Returns the indexes of the two leaves.
    function _insertTwoLeaves(uint256 leaf1, uint256 leaf2) internal returns (uint32, uint32) {
        uint64 index = nextIndex;
        uint32 levels_ = levels;
        if (index % 2 != 0) revert NextIndexNotEven();
        if (uint256(index) + 2 > (uint256(1) << levels_)) revert MerkleTreeFull();

        uint256 currentHash = Poseidon2.compress(leaf1, leaf2);
        uint256 currentIndex = uint256(index) >> 1;
        for (uint256 lvl = 1; lvl < levels_; lvl++) {
            if (currentIndex & 1 == 1) {
                currentHash = Poseidon2.compress(filledSubtrees[lvl - 1], currentHash);
            } else {
                filledSubtrees[lvl - 1] = currentHash;
                currentHash = Poseidon2.compress(currentHash, MerkleZeroHashes.zeroHash(lvl));
            }
            currentIndex >>= 1;
        }

        uint64 newNext = index + 2;
        nextIndex = newNext;
        uint256 slot = _rootIndexFor(newNext);
        uint256 evicted = roots[slot];
        if (evicted != 0) rootSlots[evicted] -= 1;
        roots[slot] = currentHash;
        rootSlots[currentHash] += 1;

        // index + 2 <= 2^levels <= 2^32, so both indexes fit in uint32.
        return (uint32(index), uint32(index + 1));
    }

    /// SPP's `current_root_index`.
    function currentRootIndex() public view returns (uint256) {
        return _rootIndexFor(nextIndex);
    }

    /// SPP's `is_known_root`. The zero root is never known.
    function _isKnownRoot(uint256 root) internal view returns (bool) {
        if (root == 0) return false;
        return rootSlots[root] != 0;
    }

    /// SPP's `get_last_root`.
    function _getLastRoot() internal view returns (uint256) {
        return roots[_rootIndexFor(nextIndex)];
    }
}
