// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PolicyTx22GvkTVerifier} from "../src/verifiers/PolicyTx22GvkTVerifier.sol";
import {SnarkjsVerifierAdapter} from "../src/verifiers/SnarkjsVerifierAdapter.sol";

/// The pool-facing verifier path with real cryptography: SPP's raw 256-byte
/// proof, split into eight words with no reordering, verifies through the
/// adapter and the snarkjs verifier for the same key.
contract SnarkjsVerifierAdapterTest is Test {
    string constant DIR = "test/fixtures/spp/policy_tx_2_2_gvk_T/";

    PolicyTx22GvkTVerifier target;
    SnarkjsVerifierAdapter adapter;
    uint256[8] words;
    uint256[] inputs;

    function setUp() public {
        target = new PolicyTx22GvkTVerifier();
        adapter = new SnarkjsVerifierAdapter(address(target), 30);

        bytes memory raw = vm.parseBytes(vm.parseJsonString(vm.readFile(string.concat(DIR, "meta.json")), ".proof_uncompressed_hex"));
        assertEq(raw.length, 256);
        for (uint256 i = 0; i < 8; i++) {
            uint256 w;
            assembly {
                w := mload(add(add(raw, 32), mul(i, 32)))
            }
            words[i] = w;
        }
        string[] memory pubs = vm.parseJsonStringArray(vm.readFile(string.concat(DIR, "public.json")), "");
        for (uint256 i = 0; i < pubs.length; i++) {
            inputs.push(vm.parseUint(pubs[i]));
        }
    }

    function test_selectorIsTheVerifiersVerifyProof() public view {
        assertEq(adapter.selector(), PolicyTx22GvkTVerifier.verifyProof.selector);
        assertEq(adapter.target(), address(target));
        assertEq(adapter.nPublic(), 30);
    }

    function test_realSppProofBytesVerifyThroughTheAdapter() public view {
        assertTrue(adapter.verify(words, inputs));
    }

    function test_tamperedInputIsRejected() public {
        inputs[23] += 1; // the root
        assertFalse(adapter.verify(words, inputs));
    }

    function test_tamperedProofIsRejected() public {
        words[6] += 1; // C.x
        assertFalse(adapter.verify(words, inputs));
    }

    function test_wrongInputCountReverts() public {
        inputs.pop();
        vm.expectRevert(SnarkjsVerifierAdapter.WrongPublicInputCount.selector);
        adapter.verify(words, inputs);
    }

    function test_constructorRejectsANonContractTarget() public {
        vm.expectRevert(SnarkjsVerifierAdapter.NotAContract.selector);
        new SnarkjsVerifierAdapter(makeAddr("eoa"), 30);
    }
}
