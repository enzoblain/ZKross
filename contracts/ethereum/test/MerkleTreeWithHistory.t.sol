// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";
import {MerkleTreeLib} from "../src/MerkleTreeLib.sol";
import {MerkleZeroHashes} from "../src/MerkleZeroHashes.sol";
import {Poseidon2} from "../src/Poseidon2.sol";

contract MerkleHarness is MerkleTreeWithHistory {
    constructor(uint32 levels_) MerkleTreeWithHistory(levels_) {}

    function insert(uint256 a, uint256 b) external returns (uint32, uint32) {
        return _insertTwoLeaves(a, b);
    }

    function lastRoot() external view returns (uint256) {
        return _getLastRoot();
    }

    function known(uint256 root) external view returns (bool) {
        return _isKnownRoot(root);
    }
}

/// The Merkle tree port against SPP's `pool-core::merkle_with_history`.
contract MerkleTreeWithHistoryTest is Test {
    string json;

    function setUp() public {
        json = vm.readFile("test/fixtures/spp/poseidon2_vectors.json");
    }

    /// Roots after each insertion equal the roots SPP's own tree produced in
    /// the Soroban host (scripts/poseidon2/spp-poseidon2-vectors).
    function test_rootsMatchSpp() public {
        for (uint256 c = 0; c < 2; c++) {
            string memory k = string.concat(".merkle[", vm.toString(c), "]");
            uint32 levels = uint32(vm.parseJsonUint(json, string.concat(k, ".levels")));
            uint256[] memory leaves = vm.parseJsonUintArray(json, string.concat(k, ".leaves"));
            uint256[] memory roots = vm.parseJsonUintArray(json, string.concat(k, ".roots"));
            assertGt(roots.length, 0);

            MerkleHarness t = new MerkleHarness(levels);
            assertEq(t.lastRoot(), vm.parseJsonUint(json, string.concat(k, ".empty_root")));
            for (uint256 i = 0; i < roots.length; i++) {
                (uint32 i0, uint32 i1) = t.insert(leaves[2 * i], leaves[2 * i + 1]);
                assertEq(i0, 2 * i);
                assertEq(i1, 2 * i + 1);
                assertEq(t.lastRoot(), roots[i], string.concat("levels ", vm.toString(levels), " pair ", vm.toString(i)));
            }
        }
    }

    /// The incremental root equals a naive full-tree computation.
    function testFuzz_rootMatchesFullTree(uint256 seed, uint8 pairs) public {
        uint32 levels = 4;
        pairs = uint8(bound(pairs, 1, 8));
        MerkleHarness t = new MerkleHarness(levels);
        uint256[] memory nodes = new uint256[](16);
        for (uint256 i = 0; i < 16; i++) {
            nodes[i] = MerkleZeroHashes.zeroHash(0);
        }
        for (uint256 i = 0; i < pairs; i++) {
            uint256 a = uint256(keccak256(abi.encode(seed, 2 * i))) % Poseidon2.R;
            uint256 b = uint256(keccak256(abi.encode(seed, 2 * i + 1))) % Poseidon2.R;
            nodes[2 * i] = a;
            nodes[2 * i + 1] = b;
            t.insert(a, b);
        }
        for (uint256 width = 16; width > 1; width /= 2) {
            for (uint256 i = 0; i < width / 2; i++) {
                nodes[i] = Poseidon2.compress(nodes[2 * i], nodes[2 * i + 1]);
            }
        }
        assertEq(t.lastRoot(), nodes[0]);
    }

    function test_constructorRejectsWrongLevels() public {
        vm.expectRevert(MerkleTreeLib.WrongLevels.selector);
        new MerkleHarness(0);
        vm.expectRevert(MerkleTreeLib.WrongLevels.selector);
        new MerkleHarness(33);
    }

    function test_constructorAcceptsLevelsOneAndThirtyTwo() public {
        assertEq(new MerkleHarness(1).lastRoot(), MerkleZeroHashes.zeroHash(1));
        assertEq(new MerkleHarness(32).lastRoot(), MerkleZeroHashes.zeroHash(32));
    }

    function test_fullTreeRefusesTheNextInsertion() public {
        MerkleHarness t = new MerkleHarness(1);
        t.insert(1, 2);
        vm.expectRevert(MerkleTreeLib.MerkleTreeFull.selector);
        t.insert(3, 4);

        MerkleHarness t3 = new MerkleHarness(3);
        for (uint256 i = 0; i < 4; i++) {
            t3.insert(i, i);
        }
        vm.expectRevert(MerkleTreeLib.MerkleTreeFull.selector);
        t3.insert(9, 9);
    }

    function test_zeroRootIsNeverKnown() public {
        MerkleHarness t = new MerkleHarness(3);
        assertFalse(t.known(0));
    }

    function test_currentRootIndexIsHalfTheCounterModHistory() public {
        MerkleHarness t = new MerkleHarness(10);
        assertEq(t.currentRootIndex(), 0);
        for (uint256 i = 1; i <= 95; i++) {
            t.insert(i, i);
            assertEq(t.currentRootIndex(), i % 90);
        }
    }

    /// As in SPP: the empty root stays known until the ninetieth insertion,
    /// and every root stays known for ninety insertions.
    function test_rootHistoryKeepsNinetyRoots() public {
        MerkleHarness t = new MerkleHarness(10);
        uint256 empty = t.lastRoot();
        t.insert(1, 1);
        uint256 first = t.lastRoot();
        for (uint256 i = 2; i <= 89; i++) {
            t.insert(i, i);
        }
        assertTrue(t.known(empty), "empty root known through 89 insertions");
        t.insert(90, 90);
        assertFalse(t.known(empty), "empty root evicted at the 90th insertion");
        assertTrue(t.known(first), "first root still known after 90 insertions");
        t.insert(91, 91);
        assertFalse(t.known(first), "first root evicted at the 91st insertion");
        assertTrue(t.known(t.lastRoot()));
    }

    function test_zeroHashLibraryMatchesSpp() public view {
        uint256[] memory z = vm.parseJsonUintArray(json, ".zero_hashes");
        assertEq(z.length, MerkleZeroHashes.LEVELS);
        for (uint256 i = 0; i < z.length; i++) {
            assertEq(MerkleZeroHashes.zeroHash(i), z[i]);
        }
    }
}
