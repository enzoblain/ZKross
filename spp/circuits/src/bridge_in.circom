pragma circom 2.2.2;
// Entry point: ZKross bridge-in (SPEC.md B8). Claims C from a remote outbox
// tree of depth 20 into 2 notes; traceable GVK.
include "./zkross/bridge.circom";

component main {public [D, nonce, remoteRoot, extDataHash, claimNullifier, outputCommitment, scale, assetId, srcChain, dstChain, deadlineBucket]} = BridgeIn(2, 20);
