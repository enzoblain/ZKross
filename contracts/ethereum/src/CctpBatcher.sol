// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
interface IBatchToken { function balanceOf(address) external view returns(uint256); function transferFrom(address,address,uint256) external returns(bool); function transfer(address,uint256) external returns(bool); function approve(address,uint256) external returns(bool); }
interface IBatchMessenger { function depositForBurnWithHook(uint256,uint32,bytes32,address,bytes32,uint256,uint32,bytes calldata) external; }
/// @notice EXPERIMENTAL TESTNET ONLY. Immutable allocations, no administrator,
/// no service key, no prefunded liquidity. Individual owners can refund before burn.
/// One batch performs exactly one CCTP standard burn; standard fee MUST be zero.
contract CctpBatcher {
 uint256 constant R=21888242871839275222246405745257275088548364400416034343698204186575808495617;
 IBatchToken public immutable token; IBatchMessenger public immutable messenger; bytes32 public immutable forwarder;
 uint256 private entered;
 struct Entry {address owner;uint64 amount;uint256 commitment0;uint256 commitment1;}
 struct Batch {uint64 deadline;bool burned;uint256 total;bytes recipient;bytes32 allocationHash;Entry[] entries;}
 mapping(bytes32=>Batch) private batches;
 mapping(bytes32=>mapping(address=>bool)) public funded;
 event BatchCreated(bytes32 indexed id,bytes32 allocationHash,bytes recipient,uint64 deadline,uint256 total,uint256 count);
 event Funded(bytes32 indexed id,address indexed owner,uint256 amount);
 event Refunded(bytes32 indexed id,address indexed owner,uint256 amount);
 event BatchBurned(bytes32 indexed id,uint256 amount,bytes hook);
 error InvalidBatch();error Unauthorized();error WrongPhase();error TokenFailure();error Reentrant();
 modifier guarded(){if(entered!=0)revert Reentrant();entered=1;_;entered=0;}
 constructor(address token_,address messenger_,bytes32 forwarder_){if(block.chainid!=11155111||token_.code.length==0||messenger_.code.length==0||forwarder_==0)revert InvalidBatch();token=IBatchToken(token_);messenger=IBatchMessenger(messenger_);forwarder=forwarder_;}
 function _call(bytes memory data) private {(bool ok,bytes memory out)=address(token).call(data);if(!ok||(out.length!=0&&(out.length!=32||!abi.decode(out,(bool)))))revert TokenFailure();}
 function allocationHash(Entry[] calldata entries) public pure returns(bytes32){return keccak256(abi.encode(entries));}
 function batchId(bytes32 salt,bytes calldata recipient,Entry[] calldata entries,uint64 deadline) public view returns(bytes32){return keccak256(abi.encode(block.chainid,address(this),salt,recipient,allocationHash(entries),deadline));}
 function createBatch(bytes32 salt,bytes calldata recipient,Entry[] calldata entries,uint64 deadline) external guarded returns(bytes32 id){
  if(entries.length==0||entries.length>8||recipient.length!=56||recipient[0]!=bytes1('C')||deadline<block.timestamp+60||deadline>block.timestamp+3600)revert InvalidBatch();
  id=batchId(salt,recipient,entries,deadline);Batch storage b=batches[id];if(b.deadline!=0)revert InvalidBatch();
  b.deadline=deadline;b.recipient=recipient;b.allocationHash=allocationHash(entries);
  for(uint256 i;i<entries.length;i++) {Entry calldata e=entries[i];if(e.owner==address(0)||e.amount==0||e.amount>100000000000||e.commitment0==0||e.commitment0>=R||e.commitment1>=R)revert InvalidBatch();for(uint256 j;j<i;j++){if(entries[j].owner==e.owner||entries[j].commitment0==e.commitment0)revert InvalidBatch();}b.entries.push(e);b.total+=e.amount;}
  emit BatchCreated(id,b.allocationHash,recipient,deadline,b.total,entries.length);
 }
 function getBatch(bytes32 id) external view returns(uint64 deadline,bool burned,uint256 total,bytes memory recipient,bytes32 manifest,Entry[] memory entries){Batch storage b=batches[id];return(b.deadline,b.burned,b.total,b.recipient,b.allocationHash,b.entries);}
 function _entry(Batch storage b,address owner) private view returns(uint64){for(uint256 i;i<b.entries.length;i++){if(b.entries[i].owner==owner)return b.entries[i].amount;}revert Unauthorized();}
 function fund(bytes32 id) external guarded {Batch storage b=batches[id];if(b.deadline==0||b.burned||block.timestamp>=b.deadline||funded[id][msg.sender])revert WrongPhase();uint256 amount=_entry(b,msg.sender);uint256 before_=token.balanceOf(address(this));funded[id][msg.sender]=true;_call(abi.encodeCall(IBatchToken.transferFrom,(msg.sender,address(this),amount)));if(token.balanceOf(address(this))!=before_+amount)revert TokenFailure();emit Funded(id,msg.sender,amount);}
 function refund(bytes32 id) external guarded {Batch storage b=batches[id];if(b.burned||!funded[id][msg.sender])revert WrongPhase();uint256 amount=_entry(b,msg.sender);funded[id][msg.sender]=false;uint256 before_=token.balanceOf(address(this));_call(abi.encodeCall(IBatchToken.transfer,(msg.sender,amount)));if(token.balanceOf(address(this))+amount!=before_)revert TokenFailure();emit Refunded(id,msg.sender,amount);}
 function burn(bytes32 id) external guarded {Batch storage b=batches[id];if(b.deadline==0||b.burned||block.timestamp>=b.deadline)revert WrongPhase();if(b.entries.length==1&&msg.sender!=b.entries[0].owner)revert Unauthorized();for(uint256 i;i<b.entries.length;i++){if(!funded[id][b.entries[i].owner])revert WrongPhase();}
  b.burned=true;bytes memory hook=abi.encodePacked(bytes24(0),uint32(0),uint32(56),b.recipient,id,b.allocationHash);uint256 before_=token.balanceOf(address(this));
  _call(abi.encodeCall(IBatchToken.approve,(address(messenger),b.total)));
  messenger.depositForBurnWithHook(b.total,27,forwarder,address(token),forwarder,0,2000,hook);
  if(token.balanceOf(address(this))+b.total!=before_)revert TokenFailure();
  _call(abi.encodeCall(IBatchToken.approve,(address(messenger),0)));emit BatchBurned(id,b.total,hook);
 }
}
