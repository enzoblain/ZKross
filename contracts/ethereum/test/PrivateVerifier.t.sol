// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {PolicyTx22Verifier} from "../src/verifiers/PolicyTx22Verifier.sol";
import {SnarkjsVerifierAdapter} from "../src/verifiers/SnarkjsVerifierAdapter.sol";
contract PrivateVerifierTest is Test {
    function test_realVerificationKeyRejectsZeroProof() public {
        PolicyTx22Verifier target=new PolicyTx22Verifier();
        SnarkjsVerifierAdapter adapter=new SnarkjsVerifierAdapter(address(target),7);
        uint256[8] memory proof;uint256[] memory inputs=new uint256[](7);
        assertFalse(adapter.verify(proof,inputs));
    }
    function test_adapterRejectsWrongSignalCount() public {
        PolicyTx22Verifier target=new PolicyTx22Verifier();
        SnarkjsVerifierAdapter adapter=new SnarkjsVerifierAdapter(address(target),7);
        uint256[8] memory proof;uint256[] memory inputs=new uint256[](30);
        vm.expectRevert(SnarkjsVerifierAdapter.WrongPublicInputCount.selector);adapter.verify(proof,inputs);
    }
    function test_nonCanonicalSignalsRejected() public {
        PolicyTx22Verifier target=new PolicyTx22Verifier();
        SnarkjsVerifierAdapter adapter=new SnarkjsVerifierAdapter(address(target),7);
        uint256[8] memory proof;uint256[] memory inputs=new uint256[](7);
        inputs[0]=21888242871839275222246405745257275088548364400416034343698204186575808495617;
        assertFalse(adapter.verify(proof,inputs));
    }
    function _fixture() internal view returns(uint256[8] memory proof,uint256[] memory inputs) {
        string memory fixture=vm.readFile("test/fixtures/spp/policy_tx_2_2/proof.json");
        string[] memory words=vm.parseJsonStringArray(fixture,".words");
        string[] memory signals=vm.parseJsonStringArray(fixture,".public_signals");
        require(words.length==8 && signals.length==7);
        inputs=new uint256[](7);
        for(uint256 i=0;i<8;i++) proof[i]=uint256(vm.parseBytes32(words[i]));
        for(uint256 i=0;i<7;i++) inputs[i]=uint256(vm.parseBytes32(signals[i]));
    }
    function test_realNonGvkSppProofVerifiesOnEvm() public {
        PolicyTx22Verifier target=new PolicyTx22Verifier();
        SnarkjsVerifierAdapter adapter=new SnarkjsVerifierAdapter(address(target),7);
        (uint256[8] memory proof,uint256[] memory inputs)=_fixture();
        assertTrue(adapter.verify(proof,inputs));
    }
    function test_everyTamperedNonGvkPublicSignalRejected() public {
        PolicyTx22Verifier target=new PolicyTx22Verifier();
        SnarkjsVerifierAdapter adapter=new SnarkjsVerifierAdapter(address(target),7);
        (uint256[8] memory proof,uint256[] memory inputs)=_fixture();
        for(uint256 i=0;i<7;i++) { uint256 original=inputs[i];inputs[i]=original+1;assertFalse(adapter.verify(proof,inputs));inputs[i]=original; }
    }
}
