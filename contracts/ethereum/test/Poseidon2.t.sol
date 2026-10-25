// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Poseidon2} from "../src/Poseidon2.sol";

/// External wrapper so reverts can be checked with vm.expectRevert.
contract Poseidon2Harness {
    function compress(uint256 l, uint256 r) external pure returns (uint256) {
        return Poseidon2.compress(l, r);
    }

    function hash2(uint256 a, uint256 b, uint256 sep) external pure returns (uint256) {
        return Poseidon2.hash2(a, b, sep);
    }
}

/// Phase 0: the Solidity Poseidon2 gives SPP's outputs.
///
/// `poseidon2_vectors.json` comes from SPP's on-chain `soroban_utils` code run
/// through the Soroban host, cross-checked against SPP's off-chain
/// `taceo_poseidon2` (scripts/poseidon2/spp-poseidon2-vectors).
contract Poseidon2Test is Test {
    string json;
    Poseidon2Harness h;

    function setUp() public {
        json = vm.readFile("test/fixtures/spp/poseidon2_vectors.json");
        h = new Poseidon2Harness();
    }

    function _at(string memory arr, uint256 i, string memory field) internal view returns (uint256) {
        return vm.parseJsonUint(json, string.concat(".", arr, "[", vm.toString(i), "].", field));
    }

    function test_compressMatchesSpp() public view {
        uint256 n = _len(".compress");
        assertEq(n, 15);
        for (uint256 i = 0; i < n; i++) {
            assertEq(
                Poseidon2.compress(_at("compress", i, "left"), _at("compress", i, "right")),
                _at("compress", i, "out"),
                vm.toString(i)
            );
        }
    }

    function test_hash2MatchesSpp() public view {
        uint256 n = _len(".hash2");
        assertEq(n, 60);
        for (uint256 i = 0; i < n; i++) {
            assertEq(
                Poseidon2.hash2(_at("hash2", i, "a"), _at("hash2", i, "b"), _at("hash2", i, "sep")),
                _at("hash2", i, "out"),
                vm.toString(i)
            );
        }
    }

    /// SPP's zero hash table: each level is the level below compressed with itself.
    function test_zeroHashChainMatchesSpp() public view {
        uint256[] memory z = vm.parseJsonUintArray(json, ".zero_hashes");
        assertEq(z.length, 33);
        for (uint256 i = 1; i < z.length; i++) {
            assertEq(Poseidon2.compress(z[i - 1], z[i - 1]), z[i], vm.toString(i));
        }
    }

    function test_compressRejectsNonCanonicalInputs() public {
        uint256 r = Poseidon2.R;
        vm.expectRevert(Poseidon2.Poseidon2InputNotInField.selector);
        h.compress(r, 0);
        vm.expectRevert(Poseidon2.Poseidon2InputNotInField.selector);
        h.compress(0, r);
        vm.expectRevert(Poseidon2.Poseidon2InputNotInField.selector);
        h.compress(type(uint256).max, 1);
    }

    function test_hash2RejectsNonCanonicalInputs() public {
        uint256 r = Poseidon2.R;
        vm.expectRevert(Poseidon2.Poseidon2InputNotInField.selector);
        h.hash2(r, 0, 0);
        vm.expectRevert(Poseidon2.Poseidon2InputNotInField.selector);
        h.hash2(0, r, 0);
        vm.expectRevert(Poseidon2.Poseidon2InputNotInField.selector);
        h.hash2(0, 0, r);
    }

    function testFuzz_compressAcceptsCanonicalInputs(uint256 l, uint256 r) public view {
        l = bound(l, 0, Poseidon2.R - 1);
        r = bound(r, 0, Poseidon2.R - 1);
        assertLt(h.compress(l, r), Poseidon2.R);
    }

    function test_gas_compress() public {
        uint256 g = gasleft();
        Poseidon2.compress(1, 2);
        emit log_named_uint("compress gas", g - gasleft());
    }

    function test_gas_hash2() public {
        uint256 g = gasleft();
        Poseidon2.hash2(1, 2, 3);
        emit log_named_uint("hash2 gas", g - gasleft());
    }

    function _len(string memory key) internal view returns (uint256 n) {
        while (vm.keyExistsJson(json, string.concat(key, "[", vm.toString(n), "]"))) n++;
    }
}
