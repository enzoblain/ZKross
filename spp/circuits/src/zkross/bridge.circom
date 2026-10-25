pragma circom 2.2.2;
// ZKross bridge circuits (SPEC.md B3, B4, B7, B8), built from SPP's templates.

include "../policyTransaction.circom";
include "../globalViewKey.circom";
include "../merkleProof.circom";
include "../poseidon2/poseidon2_hash.circom";
include "../circomlib/circuits/bitify.circom";

// SPEC.md B3: C = P3(P3(P3(amount, asset_id, src_chain; 0x07), dst_chain,
// recipient_pk; 0x07), claim_secret, deadline_bucket; 0x07).
template BridgeMessage() {
    signal input amount;
    signal input assetId;
    signal input srcChain;
    signal input dstChain;
    signal input recipientPk;
    signal input claimSecret;
    signal input deadlineBucket;
    signal output out;

    component h1 = Poseidon2(3);
    h1.inputs[0] <== amount;
    h1.inputs[1] <== assetId;
    h1.inputs[2] <== srcChain;
    h1.domainSeparation <== 0x07;

    component h2 = Poseidon2(3);
    h2.inputs[0] <== h1.out;
    h2.inputs[1] <== dstChain;
    h2.inputs[2] <== recipientPk;
    h2.domainSeparation <== 0x07;

    component h3 = Poseidon2(3);
    h3.inputs[0] <== h2.out;
    h3.inputs[1] <== claimSecret;
    h3.inputs[2] <== deadlineBucket;
    h3.domainSeparation <== 0x07;

    out <== h3.out;
}

// SPEC.md B1: the bridged amount fits 64 bits and the scale is 1 or 10.
template BridgeAmount() {
    signal input amount;
    signal input scale;
    signal output value; // amount * scale, in the chain's base unit

    component amountBits = Num2Bits(64);
    amountBits.in <== amount;
    (scale - 1) * (scale - 10) === 0;
    value <== amount * scale;
}

// Spends 2 notes into 2 change notes, a refund note and a bridge message C.
// The value balance comes from SPP's transaction core with
// publicAmount = -(amount * scale): in0 + in1 = out0 + out1 + amount * scale.
template BridgeOut(nIns, nOuts, levels) {
    /** PUBLIC INPUTS, in the order of SPEC.md B8 **/
    signal input D[2];
    signal input nonce;
    signal input root;
    signal input extDataHash;
    signal input inputNullifier[nIns];
    signal input changeCommitment[nOuts];
    signal input bridgeMessage;
    signal input refundCommitment;
    signal input scale;
    signal input assetId;
    signal input srcChain;
    signal input dstChain;
    signal input deadlineBucket;

    /** PRIVATE INPUTS **/
    signal input inAmount[nIns];
    signal input inPrivateKey[nIns];
    signal input inBlinding[nIns];
    signal input inPathIndices[nIns];
    signal input inPathElements[nIns][levels];
    signal input outAmount[nOuts];
    signal input outPubkey[nOuts];
    signal input outBlinding[nOuts];
    signal input amount;
    signal input recipientPk;
    signal input claimSecret;
    signal input refundPk;
    signal input refundBlinding;
    signal input inSalt[nIns];
    signal input outSalt[nOuts];
    signal input refundSalt;
    signal input bridgeSalt;

    /** OUTPUTS: GVK ciphertexts of in0, in1, out0, out1, refund note, C **/
    var nEnc = nIns + nOuts + 2;
    signal output R[nEnc][2];
    signal output c1[nEnc];
    signal output c2[nEnc];
    signal output c3[nEnc];

    // Bridged amount and its value on this chain.
    component bridged = BridgeAmount();
    bridged.amount <== amount;
    bridged.scale <== scale;

    // SPP's transaction core: ownership, nullifiers, Merkle proofs, 248-bit
    // range checks on the change notes, distinct nullifiers, value balance.
    component core = PolicyTransaction(nIns, nOuts, levels);
    core.root <== root;
    core.publicAmount <== 0 - bridged.value;
    core.extDataHash <== extDataHash;
    for (var tx = 0; tx < nIns; tx++) {
        core.inputNullifier[tx] <== inputNullifier[tx];
        core.inAmount[tx] <== inAmount[tx];
        core.inPrivateKey[tx] <== inPrivateKey[tx];
        core.inBlinding[tx] <== inBlinding[tx];
        core.inPathIndices[tx] <== inPathIndices[tx];
        for (var level = 0; level < levels; level++) {
            core.inPathElements[tx][level] <== inPathElements[tx][level];
        }
    }
    for (var tx = 0; tx < nOuts; tx++) {
        core.outputCommitment[tx] <== changeCommitment[tx];
        core.outAmount[tx] <== outAmount[tx];
        core.outPubkey[tx] <== outPubkey[tx];
        core.outBlinding[tx] <== outBlinding[tx];
    }

    // The bridge message C (B3).
    component msg = BridgeMessage();
    msg.amount <== amount;
    msg.assetId <== assetId;
    msg.srcChain <== srcChain;
    msg.dstChain <== dstChain;
    msg.recipientPk <== recipientPk;
    msg.claimSecret <== claimSecret;
    msg.deadlineBucket <== deadlineBucket;
    msg.out === bridgeMessage;

    // The refund note: an SPP note worth exactly the bridged value (B7).
    component refund = Poseidon2(3);
    refund.inputs[0] <== bridged.value;
    refund.inputs[1] <== refundPk;
    refund.inputs[2] <== refundBlinding;
    refund.domainSeparation <== 0x01;
    refund.out === refundCommitment;

    // GVK encryption: inputs (idx 0, 1), change (2, 3), refund (4), and C's
    // secrets as the note (recipientPk, amount, claimSecret) (5).
    component gvk = GvkNotes(nIns, nOuts + 2, 1);
    gvk.D[0] <== D[0];
    gvk.D[1] <== D[1];
    gvk.nonce <== nonce;
    for (var k = 0; k < nIns; k++) {
        gvk.inPubkey[k] <== core.inPublicKey[k];
        gvk.inAmount[k] <== inAmount[k];
        gvk.inBlinding[k] <== inBlinding[k];
        gvk.inSalt[k] <== inSalt[k];
    }
    for (var k = 0; k < nOuts; k++) {
        gvk.outPubkey[k] <== outPubkey[k];
        gvk.outAmount[k] <== outAmount[k];
        gvk.outBlinding[k] <== outBlinding[k];
        gvk.outSalt[k] <== outSalt[k];
    }
    gvk.outPubkey[nOuts] <== refundPk;
    gvk.outAmount[nOuts] <== bridged.value;
    gvk.outBlinding[nOuts] <== refundBlinding;
    gvk.outSalt[nOuts] <== refundSalt;
    gvk.outPubkey[nOuts + 1] <== recipientPk;
    gvk.outAmount[nOuts + 1] <== amount;
    gvk.outBlinding[nOuts + 1] <== claimSecret;
    gvk.outSalt[nOuts + 1] <== bridgeSalt;
    for (var e = 0; e < nEnc; e++) {
        R[e][0] <== gvk.R[e][0];
        R[e][1] <== gvk.R[e][1];
        c1[e] <== gvk.c1[e];
        c2[e] <== gvk.c2[e];
        c3[e] <== gvk.c3[e];
    }
}

// Claims C from the paired chain's outbox and creates 2 notes for its
// recipient worth amount * scale in total.
template BridgeIn(nOuts, levels) {
    /** PUBLIC INPUTS, in the order of SPEC.md B8 **/
    signal input D[2];
    signal input nonce;
    signal input remoteRoot;
    signal input extDataHash;
    signal input claimNullifier;
    signal input outputCommitment[nOuts];
    signal input scale;
    signal input assetId;
    signal input srcChain;
    signal input dstChain;
    signal input deadlineBucket;

    /** PRIVATE INPUTS **/
    signal input amount;
    signal input recipientPk;
    signal input claimSecret;
    signal input pathIndices;
    signal input pathElements[levels];
    signal input outAmount[nOuts];
    signal input outBlinding[nOuts];
    signal input outSalt[nOuts];

    /** OUTPUTS: GVK ciphertexts of out0, out1 **/
    signal output R[nOuts][2];
    signal output c1[nOuts];
    signal output c2[nOuts];
    signal output c3[nOuts];

    component bridged = BridgeAmount();
    bridged.amount <== amount;
    bridged.scale <== scale;

    // C, rebuilt from its fields (B3), is in the remote outbox.
    component msg = BridgeMessage();
    msg.amount <== amount;
    msg.assetId <== assetId;
    msg.srcChain <== srcChain;
    msg.dstChain <== dstChain;
    msg.recipientPk <== recipientPk;
    msg.claimSecret <== claimSecret;
    msg.deadlineBucket <== deadlineBucket;

    component tree = MerkleProof(levels);
    tree.leaf <== msg.out;
    tree.pathIndices <== pathIndices;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
    }
    tree.root === remoteRoot;

    // Claim nullifier from the claim secret only (B4).
    component claim = Poseidon2(2);
    claim.inputs[0] <== claimSecret;
    claim.inputs[1] <== 0;
    claim.domainSeparation <== 0x08;
    claim.out === claimNullifier;

    // New notes owned by the recipient, worth amount * scale in total.
    component outHasher[nOuts];
    component outBits[nOuts];
    var sumOuts = 0;
    for (var k = 0; k < nOuts; k++) {
        outHasher[k] = Poseidon2(3);
        outHasher[k].inputs[0] <== outAmount[k];
        outHasher[k].inputs[1] <== recipientPk;
        outHasher[k].inputs[2] <== outBlinding[k];
        outHasher[k].domainSeparation <== 0x01;
        outHasher[k].out === outputCommitment[k];
        outBits[k] = Num2Bits(248);
        outBits[k].in <== outAmount[k];
        sumOuts += outAmount[k];
    }
    sumOuts === bridged.value;

    // GVK encryption of both new notes (idx 0, 1).
    component gvk = GlobalViewKey(nOuts);
    gvk.D[0] <== D[0];
    gvk.D[1] <== D[1];
    gvk.nonce <== nonce;
    for (var k = 0; k < nOuts; k++) {
        gvk.pk[k] <== recipientPk;
        gvk.amount[k] <== outAmount[k];
        gvk.blinding[k] <== outBlinding[k];
        gvk.salt[k] <== outSalt[k];
    }
    for (var k = 0; k < nOuts; k++) {
        R[k][0] <== gvk.R[k][0];
        R[k][1] <== gvk.R[k][1];
        c1[k] <== gvk.c1[k];
        c2[k] <== gvk.c2[k];
        c3[k] <== gvk.c3[k];
    }

    // Same safety constraint as SPP's transaction: extDataHash can't be
    // changed without invalidating the proof.
    signal extDataSquare <== extDataHash * extDataHash;
}
