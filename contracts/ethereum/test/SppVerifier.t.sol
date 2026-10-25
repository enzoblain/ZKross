// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PolicyTx22GvkTVerifier} from "../src/verifiers/PolicyTx22GvkTVerifier.sol";

/// Phase 0 smoke test: a real SPP proof verifies on the EVM.
///
/// The fixture is one deposit proved on SPP's `policy_tx_2_2_gvk_T` circuit
/// with SPP's committed testnet proving key (SPP commit in VERSIONS.md), and
/// the verifier was rendered by snarkjs from the matching committed
/// `policy_tx_2_2_gvk_T_vk.json`. `public.json` lists the 30 public inputs in
/// the order SPP's `pool-gvk` `verify_proof` builds them.
contract SppVerifierTest is Test {
    string constant DIR = "test/fixtures/spp/policy_tx_2_2_gvk_T/";
    uint256 constant R = 21888242871839275222246405745257275088548364400416034343698204186575808495617;

    PolicyTx22GvkTVerifier verifier;

    uint256[2] pA;
    uint256[2][2] pB;
    uint256[2] pC;
    uint256[30] pub_;

    function setUp() public {
        verifier = new PolicyTx22GvkTVerifier();

        string memory proof = vm.readFile(string.concat(DIR, "proof.json"));
        // snarkjs JSON stores each Fq2 as [c0, c1]; the EVM pairing
        // precompile, and so the verifier, takes [c1, c0].
        pA = [_u(proof, ".pi_a[0]"), _u(proof, ".pi_a[1]")];
        pB = [
            [_u(proof, ".pi_b[0][1]"), _u(proof, ".pi_b[0][0]")],
            [_u(proof, ".pi_b[1][1]"), _u(proof, ".pi_b[1][0]")]
        ];
        pC = [_u(proof, ".pi_c[0]"), _u(proof, ".pi_c[1]")];

        string[] memory pubs = vm.parseJsonStringArray(vm.readFile(string.concat(DIR, "public.json")), "");
        assertEq(pubs.length, 30);
        for (uint256 i = 0; i < 30; i++) {
            pub_[i] = vm.parseUint(pubs[i]);
        }
    }

    function _u(string memory json, string memory key) internal pure returns (uint256) {
        return vm.parseUint(vm.parseJsonString(json, key));
    }

    function test_realSppProofVerifies() public view {
        assertTrue(verifier.verifyProof(pA, pB, pC, pub_));
    }

    /// Our G2 conversion matches the calldata snarkjs itself produces.
    function test_g2OrderMatchesSnarkjsCalldata() public view {
        string memory cd = vm.readFile(string.concat(DIR, "snarkjs_calldata.json"));
        assertEq(pA[0], vm.parseJsonUint(cd, ".a[0]"));
        assertEq(pA[1], vm.parseJsonUint(cd, ".a[1]"));
        for (uint256 i = 0; i < 2; i++) {
            for (uint256 j = 0; j < 2; j++) {
                assertEq(pB[i][j], vm.parseJsonUint(cd, string.concat(".b[", vm.toString(i), "][", vm.toString(j), "]")));
            }
        }
        assertEq(pC[0], vm.parseJsonUint(cd, ".c[0]"));
        assertEq(pC[1], vm.parseJsonUint(cd, ".c[1]"));
        uint256[] memory cdPub = vm.parseJsonUintArray(cd, ".pub");
        assertEq(cdPub.length, 30);
        for (uint256 i = 0; i < 30; i++) {
            assertEq(pub_[i], cdPub[i]);
        }
    }

    function test_unswappedG2IsRejected() public view {
        uint256[2][2] memory b = [[pB[0][1], pB[0][0]], [pB[1][1], pB[1][0]]];
        assertFalse(verifier.verifyProof(pA, b, pC, pub_));
    }

    function test_everyTamperedPublicInputIsRejected() public view {
        for (uint256 i = 0; i < 30; i++) {
            uint256[30] memory p = pub_;
            p[i] = addmod(p[i], 1, R);
            assertFalse(verifier.verifyProof(pA, pB, pC, p), vm.toString(i));
        }
    }

    /// A public input >= r must not alias its reduced value.
    function test_nonCanonicalPublicInputIsRejected() public view {
        uint256[30] memory p = pub_;
        // Index 26 is the first input nullifier.
        p[26] = p[26] + R;
        assertFalse(verifier.verifyProof(pA, pB, pC, p));
    }

    function test_swappedPublicInputOrderIsRejected() public view {
        uint256[30] memory p = pub_;
        // The two input nullifiers (26, 27) swapped.
        (p[26], p[27]) = (p[27], p[26]);
        assertFalse(verifier.verifyProof(pA, pB, pC, p));
    }
}
