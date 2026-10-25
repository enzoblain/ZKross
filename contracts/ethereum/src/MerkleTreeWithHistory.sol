// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {MerkleTreeLib} from "./MerkleTreeLib.sol";

/// @title The pool's note tree.
/// @notice SPP's `MerkleTreeWithHistory` API on top of `MerkleTreeLib`, so the
/// pool keeps SPP's function names for its main tree.
abstract contract MerkleTreeWithHistory {
    using MerkleTreeLib for MerkleTreeLib.Tree;

    uint256 public constant ROOT_HISTORY_SIZE = MerkleTreeLib.ROOT_HISTORY_SIZE;

    MerkleTreeLib.Tree internal noteTree;

    constructor(uint32 levels_) {
        noteTree.init(levels_);
    }

    /// Number of levels in the tree, fixed at construction.
    function levels() public view returns (uint32) {
        return noteTree.levels;
    }

    /// Next available leaf index.
    function nextIndex() public view returns (uint64) {
        return noteTree.nextIndex;
    }

    /// SPP's `current_root_index`.
    function currentRootIndex() public view returns (uint256) {
        return noteTree.currentRootIndex();
    }

    function _insertTwoLeaves(uint256 leaf1, uint256 leaf2) internal returns (uint32, uint32) {
        return noteTree.insertTwoLeaves(leaf1, leaf2);
    }

    function _isKnownRoot(uint256 root) internal view returns (bool) {
        return noteTree.isKnownRoot(root);
    }

    function _getLastRoot() internal view returns (uint256) {
        return noteTree.getLastRoot();
    }
}
