// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Poseidon2} from "../src/Poseidon2.sol";
import {MerkleTreeLib} from "../src/MerkleTreeLib.sol";

contract OutboxHarness {
    using MerkleTreeLib for MerkleTreeLib.Tree;

    MerkleTreeLib.Tree tree;

    constructor() {
        tree.init(20);
    }

    function insert(uint256 a, uint256 b) external {
        tree.insertTwoLeaves(a, b);
    }

    function root() external view returns (uint256) {
        return tree.getLastRoot();
    }
}

/// SPEC.md Part B vectors that the EVM can compute. `C` itself uses the
/// t = 4 permutation, which only the circuits need; the Circom tests check it.
contract SpecVectorsTest is Test {
    string json;

    function setUp() public {
        json = vm.readFile("test/fixtures/spec_vectors.json");
    }

    function _msg(uint256 i, string memory key) internal view returns (string memory) {
        return string.concat(".bridge_messages[", vm.toString(i), "].", key);
    }

    /// B4: claim_nullifier = P2(claim_secret, 0; 0x08).
    function test_claimNullifier() public view {
        for (uint256 i = 0; i < 2; i++) {
            uint256 secret = vm.parseJsonUint(json, _msg(i, "claim_secret"));
            assertEq(Poseidon2.hash2(secret, 0, 0x08), vm.parseJsonUint(json, _msg(i, "claim_nullifier")));
        }
    }

    /// B2: 2^64 + the first 8 bytes of sha256(passphrase).
    function test_stellarChainId() public view {
        uint256 id = (uint256(1) << 64) + uint64(bytes8(sha256("Test SDF Network ; September 2015")));
        assertEq(id, vm.parseUint(vm.parseJsonString(json, ".chain_ids.stellar_testnet")));
        assertEq(vm.parseUint(vm.parseJsonString(json, ".chain_ids.sepolia")), 11155111);
    }

    /// B6: inserting (C, 0) pairs gives the outbox roots SPP's tree gives.
    function test_outboxRoots() public {
        OutboxHarness t = new OutboxHarness();
        for (uint256 i = 0; i < 2; i++) {
            t.insert(vm.parseJsonUint(json, _msg(i, "C")), 0);
            assertEq(t.root(), vm.parseJsonUint(json, _msg(i, "outbox_root_after_insert")));
        }
    }

    /// B1: the decimal examples follow amount = floor(stroops / 10).
    function test_decimalExamples() public view {
        for (uint256 i = 0; i < 6; i++) {
            string memory k = string.concat(".decimal_conversion[", vm.toString(i), "].");
            uint256 stroops = vm.parseJsonUint(json, string.concat(k, "stellar_stroops"));
            uint256 amount = vm.parseJsonUint(json, string.concat(k, "bridge_amount"));
            assertEq(amount * 10 + vm.parseJsonUint(json, string.concat(k, "stellar_change")), stroops);
            assertLt(vm.parseJsonUint(json, string.concat(k, "stellar_change")), 10);
            assertEq(vm.parseJsonUint(json, string.concat(k, "ethereum_units")), amount);
            assertEq(vm.parseJsonUint(json, string.concat(k, "back_to_stellar_stroops")), amount * 10);
        }
    }

    /// B12: the attestation digest layout, and the signature recovers the
    /// attester (public test key 1).
    function test_attestations() public view {
        address attester = vm.parseJsonAddress(json, ".attestations.cases[0].attester_address");
        assertEq(attester, vm.addr(1));
        uint256 c = vm.parseJsonUint(json, _msg(0, "C"));
        bytes32[2] memory pools =
            [vm.parseJsonBytes32(json, ".attestations.stellar_source_pool_id"), vm.parseJsonBytes32(json, ".attestations.ethereum_source_pool_id")];
        uint256[2] memory chains = [
            vm.parseUint(vm.parseJsonString(json, ".chain_ids.stellar_testnet")),
            vm.parseUint(vm.parseJsonString(json, ".chain_ids.sepolia"))
        ];
        for (uint256 i = 0; i < 2; i++) {
            string memory k = string.concat(".attestations.cases[", vm.toString(i), "].");
            uint8 status = uint8(vm.parseJsonUint(json, string.concat(k, "status")));
            bytes memory message = abi.encodePacked("ZKROSS-ATTEST-v1", bytes32(chains[i]), pools[i], bytes32(c), status);
            assertEq(message, vm.parseJsonBytes(json, string.concat(k, "message")));
            bytes32 digest = keccak256(message);
            assertEq(digest, vm.parseJsonBytes32(json, string.concat(k, "digest")));
            bytes memory sig = vm.parseJsonBytes(json, string.concat(k, "signature"));
            (bytes32 r, bytes32 s, uint8 v) = (bytes32(_slice(sig, 0)), bytes32(_slice(sig, 32)), uint8(sig[64]));
            assertLe(uint256(s), 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0, "low s");
            assertEq(ecrecover(digest, v, r, s), attester);
        }
    }

    function _slice(bytes memory b, uint256 off) internal pure returns (uint256 w) {
        assembly {
            w := mload(add(add(b, 32), off))
        }
    }
}
