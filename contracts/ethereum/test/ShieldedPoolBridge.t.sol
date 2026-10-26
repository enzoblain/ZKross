// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {IGroth16Verifier} from "../src/interfaces/IGroth16Verifier.sol";
import {PoolTestBase} from "./ShieldedPool.t.sol";
import {OutboxHarness} from "./SpecVectors.t.sol";

/// The bridge functions against SPEC.md Part B, with the strict mock
/// verifiers: a proof is accepted only with the exact public inputs built
/// here, independently of the pool. What the circuits enforce (balance,
/// range checks, C's preimage, decimal exactness in-circuit) is tested in
/// the circuit tests.
contract ShieldedPoolBridgeTest is PoolTestBase {
    ShieldedPool pool;
    uint64 hourNow;

    function setUp() public override {
        super.setUp();
        vm.warp(1_760_000_000); // some time in 2025
        hourNow = uint64(block.timestamp / 3600);
        pool = _deploy(10_000_000, 10, _pt(1, 2), TRACEABLE);
    }

    // ========== Helpers ==========

    function _cts(uint256 n, uint256 base) internal pure returns (ShieldedPool.GvkCiphertext[] memory v) {
        v = new ShieldedPool.GvkCiphertext[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 b = base + 10 * i;
            v[i] = _ct(b, b + 1, b + 2, b + 3, b + 4);
        }
    }

    function _outExt() internal pure returns (ShieldedPool.BridgeOutExtData memory) {
        return ShieldedPool.BridgeOutExtData(hex"c0", hex"c1", hex"f0", hex"b0b0");
    }

    function _inExt() internal pure returns (ShieldedPool.BridgeInExtData memory) {
        return ShieldedPool.BridgeInExtData(hex"d0", hex"d1");
    }

    function _mkOut(ShieldedPool p_, uint256 n0, uint256 n1, uint256 c)
        internal
        view
        returns (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext)
    {
        ext = _outExt();
        p = ShieldedPool.BridgeOutProof({
            proof: _mockProofWords(),
            root: p_.getRoot(),
            inputNullifiers: [n0, n1],
            changeCommitment0: 0x11,
            changeCommitment1: 0x12,
            bridgeMessage: c,
            refundCommitment: 0x13,
            deadlineBucket: hourNow + 24,
            extDataHash: p_.hashBridgeOutExtData(ext),
            ciphertexts: _cts(6, 100)
        });
    }

    struct Ctx {
        ShieldedPool.BabyJubJubPoint d;
        uint256 scale;
        uint256 asset;
        uint256 src;
        uint256 dst;
    }

    function _ctxOut() internal view returns (Ctx memory) {
        return Ctx(_pt(1, 2), 1, 1, block.chainid, STELLAR_TESTNET);
    }

    function _ctxIn() internal view returns (Ctx memory) {
        return Ctx(_pt(1, 2), 1, 1, STELLAR_TESTNET, block.chainid);
    }

    function _fieldMajor(uint256[] memory out, ShieldedPool.GvkCiphertext[] memory cts) internal pure returns (uint256 k) {
        for (uint256 i = 0; i < cts.length; i++) {
            out[k++] = cts[i].r.x;
            out[k++] = cts[i].r.y;
        }
        for (uint256 i = 0; i < cts.length; i++) out[k++] = cts[i].c1;
        for (uint256 i = 0; i < cts.length; i++) out[k++] = cts[i].c2;
        for (uint256 i = 0; i < cts.length; i++) out[k++] = cts[i].c3;
    }

    /// SPEC.md B8 `bridge_out` public signals, built independently.
    function _outInputs(ShieldedPool.BridgeOutProof memory p, Ctx memory c) internal pure returns (uint256[] memory v) {
        v = new uint256[](46);
        uint256 k = _fieldMajor(v, p.ciphertexts);
        v[k++] = c.d.x;
        v[k++] = c.d.y;
        v[k++] = uint256(p.extDataHash);
        v[k++] = p.root;
        v[k++] = uint256(p.extDataHash);
        v[k++] = p.inputNullifiers[0];
        v[k++] = p.inputNullifiers[1];
        v[k++] = p.changeCommitment0;
        v[k++] = p.changeCommitment1;
        v[k++] = p.bridgeMessage;
        v[k++] = p.refundCommitment;
        v[k++] = c.scale;
        v[k++] = c.asset;
        v[k++] = c.src;
        v[k++] = c.dst;
        v[k++] = p.deadlineBucket;
        assert(k == 46);
    }

    /// SPEC.md B8 `bridge_in` public signals, built independently.
    function _inInputs(ShieldedPool.BridgeInProof memory p, Ctx memory c) internal pure returns (uint256[] memory v) {
        v = new uint256[](23);
        uint256 k = _fieldMajor(v, p.ciphertexts);
        v[k++] = c.d.x;
        v[k++] = c.d.y;
        v[k++] = uint256(p.extDataHash);
        v[k++] = p.remoteRoot;
        v[k++] = uint256(p.extDataHash);
        v[k++] = p.claimNullifier;
        v[k++] = p.outputCommitment0;
        v[k++] = p.outputCommitment1;
        v[k++] = c.scale;
        v[k++] = c.asset;
        v[k++] = c.src;
        v[k++] = c.dst;
        v[k++] = p.deadlineBucket;
        assert(k == 23);
    }

    function _acceptOut(ShieldedPool.BridgeOutProof memory p) internal {
        bridgeOutVerifier.expect(p.proof, _outInputs(p, _ctxOut()));
    }

    function _acceptIn(ShieldedPool.BridgeInProof memory p) internal {
        bridgeInVerifier.expect(p.proof, _inInputs(p, _ctxIn()));
    }

    uint256 constant REMOTE_ROOT = 0xAAAA;

    function _postRemote(ShieldedPool p_, uint256 root) internal {
        vm.prank(rootPoster);
        p_.postRemoteRoot(root);
    }

    function _mkIn(ShieldedPool p_, uint256 claimNullifier)
        internal
        view
        returns (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext)
    {
        ext = _inExt();
        p = ShieldedPool.BridgeInProof({
            proof: _mockProofWords(),
            remoteRoot: REMOTE_ROOT,
            claimNullifier: claimNullifier,
            outputCommitment0: 0x21,
            outputCommitment1: 0x22,
            deadlineBucket: hourNow + 24,
            extDataHash: p_.hashBridgeInExtData(ext),
            ciphertexts: _cts(2, 200)
        });
    }

    function _doBridgeOut(uint256 n0, uint256 n1, uint256 c) internal returns (ShieldedPool.BridgeOutProof memory p) {
        ShieldedPool.BridgeOutExtData memory ext;
        (p, ext) = _mkOut(pool, n0, n1, c);
        _acceptOut(p);
        pool.bridgeOut(p, ext);
    }

    function _sign(ShieldedPool p_, uint256 c, uint8 status) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_KEY, p_.attestationDigest(c, status));
        return abi.encodePacked(r, s, v);
    }

    function _toSettleTime(uint64 bucket) internal {
        vm.warp(uint256(bucket) * 3600 + 3600);
    }

    // ========== Configuration ==========

    function test_constructorStoresTheBridgeConfig() public view {
        assertEq(pool.rootPoster(), rootPoster);
        assertEq(pool.attester(), vm.addr(ATTESTER_KEY));
        assertEq(pool.remoteChainId(), STELLAR_TESTNET);
        assertEq(pool.assetId(), 1);
        assertEq(address(pool.bridgeOutVerifier()), address(bridgeOutVerifier));
        assertEq(address(pool.bridgeInVerifier()), address(bridgeInVerifier));
        assertEq(pool.SCALE(), 1);
        assertEq(pool.outboxNextIndex(), 0);
    }

    function test_constructorRejectsAnInvalidBridgeConfig() public {
        for (uint256 i = 0; i < 9; i++) {
            ShieldedPool.BridgeConfig memory cfg = _bridgeConfig();
            if (i == 0) cfg.rootPoster = address(0);
            else if (i == 1) cfg.attester = address(0);
            else if (i == 2) cfg.remoteChainId = 0;
            else if (i == 3) cfg.remoteChainId = block.chainid;
            else if (i == 4) cfg.remoteChainId = R;
            else if (i == 5) cfg.assetId = 0;
            else if (i == 6) cfg.assetId = R;
            else if (i == 7) cfg.bridgeOutVerifier = IGroth16Verifier(address(0));
            else cfg.bridgeInVerifier = IGroth16Verifier(address(0));
            vm.expectRevert(ShieldedPool.InvalidBridgeConfig.selector);
            new ShieldedPool(admin, address(token), address(verifier), 1, 3, KDF_DOMAIN, _pt(1, 2), TRACEABLE, cfg);
        }
    }

    // ========== postRemoteRoot ==========

    function test_postRemoteRootRecordsAndEmits() public {
        assertFalse(pool.isKnownRemoteRoot(REMOTE_ROOT));
        vm.expectEmit(address(pool));
        emit ShieldedPool.RemoteRootPosted(REMOTE_ROOT);
        _postRemote(pool, REMOTE_ROOT);
        assertTrue(pool.isKnownRemoteRoot(REMOTE_ROOT));
    }

    function test_postRemoteRootRequiresTheRootPoster() public {
        vm.prank(admin);
        vm.expectRevert(ShieldedPool.NotRootPoster.selector);
        pool.postRemoteRoot(REMOTE_ROOT);
    }

    function test_postRemoteRootRefusesZeroAndNonCanonicalRoots() public {
        vm.startPrank(rootPoster);
        vm.expectRevert(ShieldedPool.UnknownRemoteRoot.selector);
        pool.postRemoteRoot(0);
        vm.expectRevert(ShieldedPool.NonCanonicalPublicInput.selector);
        pool.postRemoteRoot(R);
        vm.stopPrank();
    }

    // ========== addLiquidity ==========

    function test_addLiquidityMovesTokensIntoThePool() public {
        _fund(admin, 5_000_000, pool);
        vm.expectEmit(address(pool));
        emit ShieldedPool.LiquidityAdded(admin, 5_000_000);
        vm.prank(admin);
        pool.addLiquidity(5_000_000);
        assertEq(token.balanceOf(address(pool)), 5_000_000);
        assertEq(token.balanceOf(admin), 0);
    }

    function test_addLiquidityRequiresAdmin() public {
        address other = makeAddr("other");
        _fund(other, 1, pool);
        vm.prank(other);
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.addLiquidity(1);
    }

    // ========== bridgeOut ==========

    function test_bridgeOutSpendsNotesAndAppendsTheMessage() public {
        uint256 c = 0xC0FFEE;
        (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 0xA1, 0xA2, c);
        _acceptOut(p);

        vm.expectEmit(address(pool));
        emit ShieldedPool.NewNullifier(0xA1, true, p.ciphertexts[0]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewNullifier(0xA2, true, p.ciphertexts[1]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x11, 0, hex"c0", p.ciphertexts[2]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x12, 1, hex"c1", p.ciphertexts[3]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.BridgeOut(c, 0, p.deadlineBucket, 0x13, p.ciphertexts[4], p.ciphertexts[5], hex"f0", hex"b0b0");
        pool.bridgeOut(p, ext);

        assertTrue(pool.isSpent(0xA1));
        assertTrue(pool.isSpent(0xA2));
        assertEq(pool.nextIndex(), 2);
        assertEq(pool.outboxNextIndex(), 2);
        ShieldedPool.PendingMessage memory m = pool.getPendingMessage(c);
        assertEq(uint8(m.status), uint8(ShieldedPool.BridgeStatus.Pending));
        assertEq(m.deadlineBucket, p.deadlineBucket);
        assertEq(m.outboxIndex, 0);
        assertEq(m.refundCommitment, 0x13);

        // The outbox holds the pair (C, 0), exactly as SPP's tree would (B6).
        OutboxHarness ref = new OutboxHarness();
        ref.insert(c, 0);
        assertEq(pool.getOutboxRoot(), ref.root());
        assertTrue(pool.isKnownOutboxRoot(ref.root()));
    }

    /// The contract, not the caller, supplies D, scale, assetId and both chain
    /// IDs: a proof bound to any other value is refused.
    function test_bridgeOutSuppliesDScaleAssetAndChainIds() public {
        for (uint256 i = 0; i < 6; i++) {
            (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) =
                _mkOut(pool, 0xB0 + 2 * i, 0xB1 + 2 * i, 0xC0 + i);
            Ctx memory c = _ctxOut();
            if (i == 0) c.d = _pt(99, 100); // a ciphertext under a different admin key
            else if (i == 1) c.scale = 10;
            else if (i == 2) c.asset = 2;
            else if (i == 3) c.src = STELLAR_TESTNET;
            else if (i == 4) c.dst = block.chainid;
            else (c.src, c.dst) = (c.dst, c.src);
            bridgeOutVerifier.expect(p.proof, _outInputs(p, c));
            vm.expectRevert(ShieldedPool.InvalidProof.selector);
            pool.bridgeOut(p, ext);
        }
    }

    function test_bridgeOutRejectsAnUnknownRoot() public {
        (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 1, 2, 3);
        p.root = 0xBAD;
        _acceptOut(p);
        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.bridgeOut(p, ext);
    }

    /// A stale root (evicted after 90 insertions) is refused (Phase 7).
    function test_bridgeOutRejectsAStaleRoot() public {
        uint256 old = pool.getRoot();
        for (uint256 i = 0; i < 90; i++) {
            _doBridgeOut(1000 + 2 * i, 1001 + 2 * i, 5000 + i);
        }
        assertFalse(pool.isKnownRoot(old));
        (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 1, 2, 3);
        p.root = old;
        _acceptOut(p);
        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.bridgeOut(p, ext);
    }

    /// Spending a note twice: once by transact, once by bridgeOut, in either
    /// nullifier slot (Phase 7).
    function test_bridgeOutRejectsASpentNullifier() public {
        (ShieldedPool.Proof memory t, ShieldedPool.ExtData memory te) = _mkProof(pool, 0x77, TRACEABLE);
        _accept(t, _pt(1, 2));
        pool.transact(t, te);
        for (uint256 slot = 0; slot < 2; slot++) {
            (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) =
                _mkOut(pool, slot == 0 ? 0x77 : 0x78, slot == 0 ? 0x79 : 0x77, 0xCC + slot);
            _acceptOut(p);
            vm.expectRevert(ShieldedPool.AlreadySpentNullifier.selector);
            pool.bridgeOut(p, ext);
        }
    }

    /// Replaying the same bridgeOut is refused (Phase 7: replayed transaction).
    function test_bridgeOutRejectsAReplay() public {
        (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 1, 2, 3);
        _acceptOut(p);
        pool.bridgeOut(p, ext);
        vm.expectRevert(ShieldedPool.AlreadySpentNullifier.selector);
        pool.bridgeOut(p, ext);
    }

    /// Changing any delivered payload (for example, a relayer redirecting the
    /// recipient's message) breaks the ext hash.
    function test_bridgeOutRejectsChangedExtData() public {
        for (uint256 i = 0; i < 4; i++) {
            (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 1, 2, 3);
            _acceptOut(p);
            if (i == 0) ext.encryptedOutput0 = hex"ff";
            else if (i == 1) ext.encryptedOutput1 = hex"ff";
            else if (i == 2) ext.encryptedRefund = hex"ff";
            else ext.encryptedBridgeMessage = hex"ff";
            vm.expectRevert(ShieldedPool.WrongExtHash.selector);
            pool.bridgeOut(p, ext);
        }
    }

    function test_bridgeOutExtHashDiffersFromTransactAndBridgeIn() public view {
        ShieldedPool.BridgeInExtData memory a = ShieldedPool.BridgeInExtData("", "");
        ShieldedPool.BridgeOutExtData memory b = ShieldedPool.BridgeOutExtData("", "", "", "");
        ShieldedPool.ExtData memory c = ShieldedPool.ExtData(address(0), 0, "", "");
        assertNotEq(pool.hashBridgeInExtData(a), pool.hashBridgeOutExtData(b));
        assertNotEq(pool.hashBridgeInExtData(a), pool.hashExtData(c));
        assertNotEq(pool.hashBridgeOutExtData(b), pool.hashExtData(c));
    }

    function test_bridgeOutEnforcesTheDeadlineWindow() public {
        uint64[4] memory buckets = [hourNow + 1, hourNow + 49, hourNow + 2, hourNow + 48];
        for (uint256 i = 0; i < 4; i++) {
            (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) =
                _mkOut(pool, 10 + 2 * i, 11 + 2 * i, 20 + i);
            p.deadlineBucket = buckets[i];
            _acceptOut(p);
            if (i < 2) vm.expectRevert(ShieldedPool.InvalidDeadline.selector);
            pool.bridgeOut(p, ext);
        }
    }

    function test_bridgeOutRejectsADuplicateMessage() public {
        _doBridgeOut(1, 2, 0xC);
        (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 3, 4, 0xC);
        _acceptOut(p);
        vm.expectRevert(ShieldedPool.BridgeMessageExists.selector);
        pool.bridgeOut(p, ext);
    }

    function test_bridgeOutRejectsNonCanonicalValues() public {
        for (uint256 i = 0; i < 6; i++) {
            (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 1, 2, 3);
            if (i == 0) p.inputNullifiers[1] = R;
            else if (i == 1) p.changeCommitment0 = R;
            else if (i == 2) p.changeCommitment1 = R;
            else if (i == 3) p.bridgeMessage = R;
            else if (i == 4) p.refundCommitment = R;
            else p.ciphertexts[5].c2 = R;
            vm.expectRevert(ShieldedPool.NonCanonicalPublicInput.selector);
            pool.bridgeOut(p, ext);
        }
    }

    function test_bridgeOutRejectsAWrongCiphertextCount() public {
        (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 1, 2, 3);
        p.ciphertexts = _cts(5, 100);
        vm.expectRevert(ShieldedPool.WrongGvkCiphertextCount.selector);
        pool.bridgeOut(p, ext);
    }

    function test_bridgeOutRejectsAProofTheVerifierRefuses() public {
        (ShieldedPool.BridgeOutProof memory p, ShieldedPool.BridgeOutExtData memory ext) = _mkOut(pool, 1, 2, 3);
        _acceptOut(p);
        p.ciphertexts[4].c1 += 1; // a tampered refund-note ciphertext
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.bridgeOut(p, ext);
        // The transact verifier's registrations don't carry over.
        (p, ext) = _mkOut(pool, 4, 5, 6);
        verifier.expect(p.proof, _outInputs(p, _ctxOut()));
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.bridgeOut(p, ext);
    }

    // ========== bridgeIn ==========

    function test_bridgeInClaimsAndCreatesNotes() public {
        _postRemote(pool, REMOTE_ROOT);
        (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
        _acceptIn(p);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x21, 0, hex"d0", p.ciphertexts[0]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x22, 1, hex"d1", p.ciphertexts[1]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.BridgeIn(0xCA, REMOTE_ROOT);
        pool.bridgeIn(p, ext);
        assertTrue(pool.isClaimed(0xCA));
        assertEq(pool.nextIndex(), 2);
    }

    /// Relayer: bridgeOut and bridgeIn work from any caller; msg.sender is not
    /// part of the proof, the ext hash or any transfer.
    function test_aRelayerCanSubmitBridgeOutAndBridgeIn() public {
        address relayer = makeAddr("relayer");
        uint256 poolBalance = token.balanceOf(address(pool));
        (ShieldedPool.BridgeOutProof memory o, ShieldedPool.BridgeOutExtData memory oext) = _mkOut(pool, 0xB1, 0xB2, 0xC1);
        _acceptOut(o);
        vm.prank(relayer);
        pool.bridgeOut(o, oext);
        assertEq(uint8(pool.getPendingMessage(0xC1).status), uint8(ShieldedPool.BridgeStatus.Pending));

        _postRemote(pool, REMOTE_ROOT);
        (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCB);
        _acceptIn(p);
        vm.prank(relayer);
        pool.bridgeIn(p, ext);
        assertTrue(pool.isClaimed(0xCB));
        assertEq(token.balanceOf(relayer), 0);
        assertEq(token.balanceOf(address(pool)), poolBalance);
    }

    /// Claiming a bridge message twice (Phase 7).
    function test_bridgeInRejectsASecondClaim() public {
        _postRemote(pool, REMOTE_ROOT);
        (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
        _acceptIn(p);
        pool.bridgeIn(p, ext);
        // The same claim nullifier with different outputs is still refused.
        p.outputCommitment0 = 0x31;
        _acceptIn(p);
        vm.expectRevert(ShieldedPool.AlreadyClaimed.selector);
        pool.bridgeIn(p, ext);
    }

    /// An unknown remote root, including this pool's own outbox root, is
    /// refused (Phase 7).
    function test_bridgeInRejectsAnUnknownRemoteRoot() public {
        (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
        _acceptIn(p);
        vm.expectRevert(ShieldedPool.UnknownRemoteRoot.selector);
        pool.bridgeIn(p, ext);
        _doBridgeOut(1, 2, 3);
        p.remoteRoot = pool.getOutboxRoot();
        _acceptIn(p);
        vm.expectRevert(ShieldedPool.UnknownRemoteRoot.selector);
        pool.bridgeIn(p, ext);
    }

    /// Claiming after the deadline (Phase 7); one second before is fine.
    function test_bridgeInRejectsAClaimAfterTheDeadline() public {
        _postRemote(pool, REMOTE_ROOT);
        (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
        _acceptIn(p);
        vm.warp(uint256(p.deadlineBucket) * 3600);
        vm.expectRevert(ShieldedPool.DeadlinePassed.selector);
        pool.bridgeIn(p, ext);
        vm.warp(uint256(p.deadlineBucket) * 3600 - 1);
        pool.bridgeIn(p, ext);
    }

    function test_bridgeInSuppliesDScaleAssetAndChainIds() public {
        _postRemote(pool, REMOTE_ROOT);
        for (uint256 i = 0; i < 6; i++) {
            (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xD0 + i);
            Ctx memory c = _ctxIn();
            if (i == 0) c.d = _pt(99, 100);
            else if (i == 1) c.scale = 10;
            else if (i == 2) c.asset = 2;
            else if (i == 3) c.src = block.chainid;
            else if (i == 4) c.dst = STELLAR_TESTNET;
            else (c.src, c.dst) = (c.dst, c.src);
            bridgeInVerifier.expect(p.proof, _inInputs(p, c));
            vm.expectRevert(ShieldedPool.InvalidProof.selector);
            pool.bridgeIn(p, ext);
        }
    }

    function test_bridgeInRejectsChangedExtData() public {
        _postRemote(pool, REMOTE_ROOT);
        for (uint256 i = 0; i < 2; i++) {
            (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
            _acceptIn(p);
            if (i == 0) ext.encryptedOutput0 = hex"ee";
            else ext.encryptedOutput1 = hex"ee";
            vm.expectRevert(ShieldedPool.WrongExtHash.selector);
            pool.bridgeIn(p, ext);
        }
    }

    function test_bridgeInRejectsNonCanonicalValuesAndWrongCounts() public {
        _postRemote(pool, REMOTE_ROOT);
        for (uint256 i = 0; i < 4; i++) {
            (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
            if (i == 0) p.claimNullifier = R;
            else if (i == 1) p.outputCommitment0 = R;
            else if (i == 2) p.outputCommitment1 = R;
            else p.ciphertexts[0].r.y = R;
            vm.expectRevert(ShieldedPool.NonCanonicalPublicInput.selector);
            pool.bridgeIn(p, ext);
        }
        (ShieldedPool.BridgeInProof memory q, ShieldedPool.BridgeInExtData memory qe) = _mkIn(pool, 0xCA);
        q.ciphertexts = _cts(3, 200);
        vm.expectRevert(ShieldedPool.WrongGvkCiphertextCount.selector);
        pool.bridgeIn(q, qe);
    }

    // ========== finalize and refund ==========

    function test_settlingBeforeTheGracePeriodIsRefused() public {
        ShieldedPool.BridgeOutProof memory p = _doBridgeOut(1, 2, 0xC);
        vm.warp(uint256(p.deadlineBucket) * 3600 + 3599);
        bytes memory refundSig = _sign(pool, 0xC, 0x01);
        bytes memory finalSig = _sign(pool, 0xC, 0x02);
        vm.expectRevert(ShieldedPool.TooEarly.selector);
        pool.refund(0xC, refundSig);
        vm.expectRevert(ShieldedPool.TooEarly.selector);
        pool.finalize(0xC, finalSig);
        vm.warp(uint256(p.deadlineBucket) * 3600 + 3600);
        pool.refund(0xC, refundSig);
    }

    function test_refundInsertsTheRefundNote() public {
        ShieldedPool.BridgeOutProof memory p = _doBridgeOut(1, 2, 0xC);
        _toSettleTime(p.deadlineBucket);
        ShieldedPool.GvkCiphertext memory none;
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x13, 2, "", none);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0, 3, "", none);
        vm.expectEmit(address(pool));
        emit ShieldedPool.BridgeRefunded(0xC, 0x13, 2);
        pool.refund(0xC, _sign(pool, 0xC, 0x01));
        assertEq(uint8(pool.getPendingMessage(0xC).status), uint8(ShieldedPool.BridgeStatus.Refunded));
        assertEq(pool.nextIndex(), 4);

        // The refund note is a normal note: a transact against the new root
        // can spend it.
        (ShieldedPool.Proof memory t, ShieldedPool.ExtData memory te) = _mkProof(pool, 0x99, TRACEABLE);
        _accept(t, _pt(1, 2));
        pool.transact(t, te);
    }

    function test_finalizeSettlesAClaimedMessage() public {
        ShieldedPool.BridgeOutProof memory p = _doBridgeOut(1, 2, 0xC);
        _toSettleTime(p.deadlineBucket);
        vm.expectEmit(address(pool));
        emit ShieldedPool.BridgeFinalized(0xC);
        pool.finalize(0xC, _sign(pool, 0xC, 0x02));
        assertEq(uint8(pool.getPendingMessage(0xC).status), uint8(ShieldedPool.BridgeStatus.Finalized));
        assertEq(pool.nextIndex(), 2, "finalize inserts nothing");
    }

    /// Refunding a message that was already claimed (Phase 7): the attester
    /// signs "claimed", which refund refuses; and the reverse for finalize.
    function test_refundRefusesAClaimedAttestationAndViceVersa() public {
        ShieldedPool.BridgeOutProof memory p = _doBridgeOut(1, 2, 0xC);
        _toSettleTime(p.deadlineBucket);
        bytes memory claimed = _sign(pool, 0xC, 0x02);
        bytes memory unclaimed = _sign(pool, 0xC, 0x01);
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, claimed);
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.finalize(0xC, unclaimed);
    }

    function test_settlingTwiceIsRefused() public {
        ShieldedPool.BridgeOutProof memory p = _doBridgeOut(1, 2, 0xC);
        _toSettleTime(p.deadlineBucket);
        pool.finalize(0xC, _sign(pool, 0xC, 0x02));
        bytes memory refundSig = _sign(pool, 0xC, 0x01);
        bytes memory finalSig = _sign(pool, 0xC, 0x02);
        vm.expectRevert(ShieldedPool.NotPending.selector);
        pool.refund(0xC, refundSig);
        vm.expectRevert(ShieldedPool.NotPending.selector);
        pool.finalize(0xC, finalSig);
    }

    function test_settlingAnUnknownMessageIsRefused() public {
        bytes memory sig = _sign(pool, 0xDEAD, 0x01);
        vm.expectRevert(ShieldedPool.NotPending.selector);
        pool.refund(0xDEAD, sig);
    }

    function test_attestationsMustComeFromTheAttesterForThisMessagePoolAndChain() public {
        ShieldedPool.BridgeOutProof memory p = _doBridgeOut(1, 2, 0xC);
        _toSettleTime(p.deadlineBucket);
        // Wrong signer.
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBEEF, pool.attestationDigest(0xC, 0x01));
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, abi.encodePacked(r, s, v));
        // Signed for another message.
        bytes memory otherMessage = _sign(pool, 0xD, 0x01);
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, otherMessage);
        // Signed for another pool.
        ShieldedPool other = _deploy(10_000_000, 10, _pt(1, 2), TRACEABLE);
        bytes memory otherPool = _sign(other, 0xC, 0x01);
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, otherPool);
        // Signed for another chain.
        uint256 chain = block.chainid;
        vm.chainId(chain + 1);
        bytes memory otherChain = _sign(pool, 0xC, 0x01);
        vm.chainId(chain);
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, otherChain);
        // The right one works.
        bytes memory good = _sign(pool, 0xC, 0x01);
        pool.refund(0xC, good);
    }

    /// A malleated (high-s) signature, a bad v and a bad length are refused.
    function test_attestationsMustBeCanonical() public {
        ShieldedPool.BridgeOutProof memory p = _doBridgeOut(1, 2, 0xC);
        _toSettleTime(p.deadlineBucket);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_KEY, pool.attestationDigest(0xC, 0x01));
        uint256 n = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
        bytes memory high = abi.encodePacked(r, bytes32(n - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        assertEq(ecrecover(pool.attestationDigest(0xC, 0x01), v == 27 ? 28 : 27, r, bytes32(n - uint256(s))), vm.addr(ATTESTER_KEY));
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, high);
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, abi.encodePacked(r, s, uint8(v - 27)));
        vm.expectRevert(ShieldedPool.InvalidAttestation.selector);
        pool.refund(0xC, abi.encodePacked(r, s));
    }

    /// The attestation digest is SPEC.md B12's layout.
    function test_attestationDigestLayout() public view {
        bytes32 expected = keccak256(
            abi.encodePacked(
                bytes16("ZKROSS-ATTEST-v1"), bytes32(block.chainid), bytes32(uint256(uint160(address(pool)))), bytes32(uint256(0xC)), uint8(1)
            )
        );
        assertEq(pool.attestationDigest(0xC, 0x01), expected);
    }

    // ========== Decimal conversion (SPEC.md B1) ==========

    /// Stellar -> Ethereum: 1.2345678 USDC (12 345 678 stroops) bridges as
    /// amount = 1 234 567. On Ethereum (scale 1) the claimed notes hold
    /// 1 234 567 units, which withdraw as 1.234567 USDC; the 8th stroop stayed
    /// in the sender's change on Stellar.
    function test_stellarToEthereumAmountsWithdrawExactly() public {
        string memory json = vm.readFile("test/fixtures/spec_vectors.json");
        uint256 amount = vm.parseJsonUint(json, ".bridge_messages[0].amount");
        assertEq(vm.parseJsonUint(json, ".bridge_messages[0].scale_src"), 10);
        assertEq(amount, uint256(12_345_678) / 10);
        assertEq(vm.parseJsonUint(json, ".bridge_messages[0].dst_value"), amount * pool.SCALE());

        _fund(admin, 2_000_000, pool);
        vm.prank(admin);
        pool.addLiquidity(2_000_000);

        // Claim, with the contract supplying scale = 1 (strict mock).
        _postRemote(pool, REMOTE_ROOT);
        (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
        _acceptIn(p);
        pool.bridgeIn(p, ext);

        // Withdraw the claimed value: amount x 1 base units.
        (ShieldedPool.Proof memory t,) = _mkProof(pool, 0x5E, TRACEABLE);
        ShieldedPool.ExtData memory te = _ext(makeAddr("fresh"), -int256(amount * pool.SCALE()));
        t.extDataHash = pool.hashExtData(te);
        t.publicAmount = _publicAmount(te.extAmount);
        _accept(t, _pt(1, 2));
        pool.transact(t, te);
        assertEq(token.balanceOf(makeAddr("fresh")), 1_234_567);
        assertEq(token.balanceOf(address(pool)), 2_000_000 - 1_234_567);
    }

    /// Ethereum -> Stellar: every Ethereum amount is already in bridge units
    /// (scale 1), and bridgeOut binds scale = 1, so Stellar can credit exactly
    /// amount x 10 stroops.
    function test_ethereumToStellarAmountsAreExactOnStellar() public view {
        string memory json = vm.readFile("test/fixtures/spec_vectors.json");
        uint256 amount = vm.parseJsonUint(json, ".bridge_messages[1].amount");
        assertEq(vm.parseJsonUint(json, ".bridge_messages[1].scale_src"), pool.SCALE());
        assertEq(vm.parseJsonUint(json, ".bridge_messages[1].refund_value"), amount * pool.SCALE());
        assertEq(vm.parseJsonUint(json, ".bridge_messages[1].dst_value"), amount * 10);
    }

    function testFuzz_roundTripKeepsEveryStroop(uint64 stroops) public pure {
        // B1: amount = floor(stroops / 10); change = stroops % 10.
        uint256 amount = uint256(stroops) / 10;
        uint256 change = uint256(stroops) % 10;
        assertEq(amount * 10 + change, stroops);
        // Back to Stellar: exact.
        assertEq((amount * 1) * 10, uint256(stroops) - change);
    }

    // ========== Liquidity and solvency ==========

    /// A claim the pool can't pay out fails at withdrawal and changes nothing
    /// (Phase 7: withdrawal larger than the pool's balance).
    function test_claimedNotesCannotWithdrawMoreThanTheLiquidity() public {
        _postRemote(pool, REMOTE_ROOT);
        (ShieldedPool.BridgeInProof memory p, ShieldedPool.BridgeInExtData memory ext) = _mkIn(pool, 0xCA);
        _acceptIn(p);
        pool.bridgeIn(p, ext);
        (ShieldedPool.Proof memory t,) = _mkProof(pool, 0x5E, TRACEABLE);
        ShieldedPool.ExtData memory te = _ext(makeAddr("fresh"), -1_000_000);
        t.extDataHash = pool.hashExtData(te);
        t.publicAmount = _publicAmount(te.extAmount);
        _accept(t, _pt(1, 2));
        vm.expectRevert(ShieldedPool.TokenTransferFailed.selector);
        pool.transact(t, te);
        assertFalse(pool.isSpent(0x5E));
    }
}
