// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";
import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";

interface IPrivatePoolToken {
    function balanceOf(address) external view returns (uint256);
    function transfer(address,uint256) external returns (bool);
    function transferFrom(address,address,uint256) external returns (bool);
}

/// @notice EXPERIMENTAL, UNAUDITED. Open-policy SPP 2-in/2-out pool without GVK.
/// Uses policy_tx_2_2 (seven public inputs), NOT the legacy GVK verifier.
/// No bridge credit, administrator decryption key, liquidity subsidy or verifier setter.
/// Deposits and withdrawals remain public; this contract makes no anonymity guarantee.
contract PrivateUsdcPool is MerkleTreeWithHistory {
    uint256 public constant FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    IPrivatePoolToken public immutable token;
    IGroth16Verifier public immutable verifier;
    mapping(uint256 => bool) public isSpent;
    bool private entered;
    struct ExtData { address recipient; int256 extAmount; bytes encryptedOutput0; bytes encryptedOutput1; }
    struct Proof { uint256[8] proof; uint256 root; uint256 publicAmount; bytes32 extDataHash; uint256[2] inputNullifiers; uint256[2] outputCommitments; }
    error InvalidConfiguration(); error InvalidAmount(); error InvalidProof(); error UnknownRoot();
    error InvalidField(); error AlreadySpent(); error WrongExternalData(); error TokenTransferFailed(); error ReentrantCall();
    event NewCommitment(uint256 indexed commitment,uint32 index,bytes encryptedOutput);
    event NewNullifier(uint256 indexed nullifier);
    constructor(address token_,address verifier_) MerkleTreeWithHistory(20) {
        if(token_.code.length==0 || verifier_.code.length==0) revert InvalidConfiguration();
        token=IPrivatePoolToken(token_); verifier=IGroth16Verifier(verifier_);
    }
    function getRoot() external view returns(uint256) { return _getLastRoot(); }
    function isKnownRoot(uint256 root) external view returns(bool) { return _isKnownRoot(root); }
    function hashExtData(ExtData calldata ext) public view returns(bytes32) {
        return bytes32(uint256(keccak256(abi.encode("zkross.private-pool.v1",block.chainid,address(this),address(token),ext.recipient,ext.extAmount,ext.encryptedOutput0,ext.encryptedOutput1)))%FIELD_SIZE);
    }
    function _canonical(uint256 value) private pure { if(value>=FIELD_SIZE) revert InvalidField(); }
    function _transfer(bytes memory callData) private {
        (bool ok,bytes memory result)=address(token).call(callData);
        if(!ok || (result.length!=0 && (result.length!=32 || !abi.decode(result,(bool))))) revert TokenTransferFailed();
    }
    function transact(Proof calldata p,ExtData calldata ext) external {
        if(entered) revert ReentrantCall(); entered=true;
        if(ext.extAmount<=-(int256(1)<<127) || ext.extAmount>=(int256(1)<<127)) revert InvalidAmount();
        uint256 magnitude=uint256(ext.extAmount<0 ? -ext.extAmount : ext.extAmount);
        uint256 publicAmount=ext.extAmount<0 ? FIELD_SIZE-magnitude : magnitude;
        if(ext.extAmount<0 && (ext.recipient==address(0) || ext.recipient==address(this))) revert InvalidAmount();
        _canonical(p.root); _canonical(p.publicAmount); _canonical(uint256(p.extDataHash));
        for(uint256 i=0;i<2;i++) { _canonical(p.inputNullifiers[i]); _canonical(p.outputCommitments[i]); }
        if(p.inputNullifiers[0]==p.inputNullifiers[1]) revert AlreadySpent();
        if(isSpent[p.inputNullifiers[0]] || isSpent[p.inputNullifiers[1]]) revert AlreadySpent();
        if(!_isKnownRoot(p.root)) revert UnknownRoot();
        if(hashExtData(ext)!=p.extDataHash) revert WrongExternalData();
        if(p.publicAmount!=publicAmount) revert InvalidAmount();
        uint256[] memory inputs=new uint256[](7);
        inputs[0]=p.root; inputs[1]=p.publicAmount; inputs[2]=uint256(p.extDataHash);
        inputs[3]=p.inputNullifiers[0]; inputs[4]=p.inputNullifiers[1];
        inputs[5]=p.outputCommitments[0]; inputs[6]=p.outputCommitments[1];
        bool valid;
        try verifier.verify(p.proof,inputs) returns(bool accepted) { valid=accepted; } catch { revert InvalidProof(); }
        if(!valid) revert InvalidProof();
        isSpent[p.inputNullifiers[0]]=true; isSpent[p.inputNullifiers[1]]=true;
        (uint32 a,uint32 b)=_insertTwoLeaves(p.outputCommitments[0],p.outputCommitments[1]);
        if(ext.extAmount>0) {
            uint256 beforeBalance=token.balanceOf(address(this));
            _transfer(abi.encodeCall(IPrivatePoolToken.transferFrom,(msg.sender,address(this),magnitude)));
            if(token.balanceOf(address(this))!=beforeBalance+magnitude) revert TokenTransferFailed();
        } else if(ext.extAmount<0) {
            uint256 beforePool=token.balanceOf(address(this)); uint256 beforeRecipient=token.balanceOf(ext.recipient);
            _transfer(abi.encodeCall(IPrivatePoolToken.transfer,(ext.recipient,magnitude)));
            if(token.balanceOf(address(this))+magnitude!=beforePool || token.balanceOf(ext.recipient)!=beforeRecipient+magnitude) revert TokenTransferFailed();
        }
        emit NewNullifier(p.inputNullifiers[0]); emit NewNullifier(p.inputNullifiers[1]);
        emit NewCommitment(p.outputCommitments[0],a,ext.encryptedOutput0);
        emit NewCommitment(p.outputCommitments[1],b,ext.encryptedOutput1);
        entered=false;
    }
}
