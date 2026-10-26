// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {PrivateUsdcPool} from "../src/PrivateUsdcPool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {StrictMockVerifier} from "./mocks/StrictMockVerifier.sol";
contract PrivateUsdcPoolTest is Test {
    MockUSDC token; StrictMockVerifier verifier; PrivateUsdcPool pool;
    function setUp() public {
        token=new MockUSDC(); verifier=new StrictMockVerifier(); pool=new PrivateUsdcPool(address(token),address(verifier));
        token.mint(address(this),1000); token.approve(address(pool),1000);
    }
    function _prepare(int256 amount,uint256 id) internal view returns(PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext) {
        ext=PrivateUsdcPool.ExtData(address(0x1234),amount,hex"cafe",hex"babe");
        p.root=pool.getRoot(); p.publicAmount=amount<0 ? pool.FIELD_SIZE()-uint256(-amount):uint256(amount);
        p.extDataHash=pool.hashExtData(ext); p.inputNullifiers=[id,id+1]; p.outputCommitments=[id+2,id+3];
    }
    function _accept(PrivateUsdcPool.Proof memory p) internal {
        uint256[] memory inputs=new uint256[](7);
        inputs[0]=p.root;inputs[1]=p.publicAmount;inputs[2]=uint256(p.extDataHash);inputs[3]=p.inputNullifiers[0];inputs[4]=p.inputNullifiers[1];inputs[5]=p.outputCommitments[0];inputs[6]=p.outputCommitments[1];
        verifier.expect(p.proof,inputs);
    }
    function _deposit() internal { (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);_accept(p);pool.transact(p,ext); }
    function test_depositConservesTokensAndInsertsCommitments() public {
        _deposit();assertEq(token.balanceOf(address(pool)),100);assertEq(token.balanceOf(address(this)),900);assertEq(pool.nextIndex(),2);assertTrue(pool.isSpent(1));
    }
    function test_withdrawConservesTokens() public {
        _deposit();(PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(-40,10);_accept(p);pool.transact(p,ext);
        assertEq(token.balanceOf(address(pool)),60);assertEq(token.balanceOf(address(0x1234)),40);
    }
    function test_privateTransferDoesNotMovePublicTokens() public {
        _deposit();(PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(0,10);_accept(p);pool.transact(p,ext);assertEq(token.balanceOf(address(pool)),100);assertEq(pool.nextIndex(),4);
    }
    function test_replayRejected() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);_accept(p);pool.transact(p,ext);vm.expectRevert(PrivateUsdcPool.AlreadySpent.selector);pool.transact(p,ext);
    }
    function test_invalidProofMovesNoTokens() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);vm.expectRevert(PrivateUsdcPool.InvalidProof.selector);pool.transact(p,ext);assertEq(token.balanceOf(address(pool)),0);assertEq(pool.nextIndex(),0);assertFalse(pool.isSpent(1));
    }
    function test_recipientTamperingRejected() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);_accept(p);ext.recipient=address(0x4567);vm.expectRevert(PrivateUsdcPool.WrongExternalData.selector);pool.transact(p,ext);
    }
    function test_ciphertextTamperingRejected() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);_accept(p);ext.encryptedOutput0=hex"00";vm.expectRevert(PrivateUsdcPool.WrongExternalData.selector);pool.transact(p,ext);
    }
    function test_nonCanonicalNullifierRejected() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);p.inputNullifiers[0]=pool.FIELD_SIZE();vm.expectRevert(PrivateUsdcPool.InvalidField.selector);pool.transact(p,ext);
    }
    function test_duplicateNullifiersRejected() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);p.inputNullifiers[1]=1;vm.expectRevert(PrivateUsdcPool.AlreadySpent.selector);pool.transact(p,ext);
    }
    function test_wrongPublicAmountRejected() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);p.publicAmount=101;vm.expectRevert(PrivateUsdcPool.InvalidAmount.selector);pool.transact(p,ext);
    }
    function test_insufficientCustodyRollsBackNullifiers() public {
        (PrivateUsdcPool.Proof memory p,PrivateUsdcPool.ExtData memory ext)=_prepare(-100,1);_accept(p);vm.expectRevert(PrivateUsdcPool.TokenTransferFailed.selector);pool.transact(p,ext);assertFalse(pool.isSpent(1));assertEq(pool.nextIndex(),0);
    }
    function test_hashBoundToPoolAndChain() public {
        (,PrivateUsdcPool.ExtData memory ext)=_prepare(100,1);bytes32 hash=pool.hashExtData(ext);
        PrivateUsdcPool other=new PrivateUsdcPool(address(token),address(verifier));assertNotEq(hash,other.hashExtData(ext));vm.chainId(block.chainid+1);assertNotEq(hash,pool.hashExtData(ext));
    }
}
