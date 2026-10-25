pragma circom 2.2.2;
// Entry point: ZKross bridge-out (SPEC.md B8). 2 inputs, 2 change notes,
// a refund note and C; pool tree depth 20; traceable GVK.
include "./zkross/bridge.circom";

component main {public [D, nonce, root, extDataHash, inputNullifier, changeCommitment, bridgeMessage, refundCommitment, scale, assetId, srcChain, dstChain, deadlineBucket]} = BridgeOut(2, 2, 20);
