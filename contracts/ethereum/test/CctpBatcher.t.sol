// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {CctpBatcher} from "../src/CctpBatcher.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
contract BatchMessengerMock {
 MockUSDC public token;uint256 public calls;uint256 public lastAmount;bytes public lastHook;bool public fail;
 constructor(MockUSDC t){token=t;}function setFail(bool value)external{fail=value;}
 function depositForBurnWithHook(uint256 amount,uint32 domain,bytes32,address asset,bytes32,uint256 fee,uint32 finality,bytes calldata hook)external{require(!fail);require(domain==27&&asset==address(token)&&fee==0&&finality==2000);calls++;lastAmount=amount;lastHook=hook;token.transferFrom(msg.sender,address(this),amount);}
}
contract CctpBatcherTest is Test {
 MockUSDC token;BatchMessengerMock messenger;CctpBatcher batcher;address alice=address(0xa11ce);address bob=address(0xb0b);bytes recipient=bytes("CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM");
 function setUp()public{vm.chainId(11155111);token=new MockUSDC();messenger=new BatchMessengerMock(token);batcher=new CctpBatcher(address(token),address(messenger),bytes32(uint256(1)));token.mint(alice,100);token.mint(bob,100);vm.prank(alice);token.approve(address(batcher),100);vm.prank(bob);token.approve(address(batcher),100);}
 function make(uint256 n)internal returns(bytes32){CctpBatcher.Entry[] memory e=new CctpBatcher.Entry[](n);e[0]=CctpBatcher.Entry(alice,60,11,12);if(n==2)e[1]=CctpBatcher.Entry(bob,40,21,22);return batcher.createBatch(bytes32(uint256(1)),recipient,e,uint64(block.timestamp+600));}
 function testCollectiveOneBurnConservesSum()public{bytes32 id=make(2);vm.prank(alice);batcher.fund(id);vm.prank(bob);batcher.fund(id);batcher.burn(id);assertEq(messenger.calls(),1);assertEq(messenger.lastAmount(),100);assertEq(token.balanceOf(address(batcher)),0);assertEq(token.balanceOf(address(messenger)),100);assertEq(messenger.lastHook().length,152);vm.expectRevert(CctpBatcher.WrongPhase.selector);batcher.burn(id);}
 function testCannotBurnPartiallyFundedBatch()public{bytes32 id=make(2);vm.prank(alice);batcher.fund(id);vm.expectRevert(CctpBatcher.WrongPhase.selector);batcher.burn(id);}
 function testOwnerCanRefundBeforeBurn()public{bytes32 id=make(2);vm.prank(alice);batcher.fund(id);vm.prank(alice);batcher.refund(id);assertEq(token.balanceOf(alice),100);assertFalse(batcher.funded(id,alice));}
 function testCannotRefundOthers()public{bytes32 id=make(2);vm.prank(alice);batcher.fund(id);vm.prank(bob);vm.expectRevert(CctpBatcher.WrongPhase.selector);batcher.refund(id);}
 function testSoloRequiresOwnExplicitBurn()public{bytes32 id=make(1);vm.prank(alice);batcher.fund(id);vm.expectRevert(CctpBatcher.Unauthorized.selector);batcher.burn(id);assertEq(messenger.calls(),0);vm.prank(alice);batcher.burn(id);assertEq(messenger.calls(),1);}
 function testRevertedBurnPreservesRefundAndAllFunds()public{bytes32 id=make(1);vm.prank(alice);batcher.fund(id);messenger.setFail(true);vm.prank(alice);vm.expectRevert();batcher.burn(id);assertEq(token.balanceOf(address(batcher)),60);vm.prank(alice);batcher.refund(id);assertEq(token.balanceOf(alice),100);}
 function testExpiredBatchOnlyRefunds()public{bytes32 id=make(1);vm.prank(alice);batcher.fund(id);vm.warp(block.timestamp+601);vm.prank(alice);vm.expectRevert(CctpBatcher.WrongPhase.selector);batcher.burn(id);vm.prank(alice);batcher.refund(id);assertEq(token.balanceOf(alice),100);}
 function testCannotFundTwiceOrFromDifferentOwner()public{bytes32 id=make(1);vm.expectRevert(CctpBatcher.Unauthorized.selector);batcher.fund(id);vm.prank(alice);batcher.fund(id);vm.prank(alice);vm.expectRevert(CctpBatcher.WrongPhase.selector);batcher.fund(id);}
 function testCannotRefundAfterBurn()public{bytes32 id=make(1);vm.prank(alice);batcher.fund(id);vm.prank(alice);batcher.burn(id);vm.prank(alice);vm.expectRevert(CctpBatcher.WrongPhase.selector);batcher.refund(id);}
}
