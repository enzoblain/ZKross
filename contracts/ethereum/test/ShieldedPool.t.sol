// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MerkleTreeWithHistory} from "../src/MerkleTreeWithHistory.sol";
import {MerkleTreeLib} from "../src/MerkleTreeLib.sol";
import {MerkleZeroHashes} from "../src/MerkleZeroHashes.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {StrictMockVerifier, RevertingVerifier} from "./mocks/StrictMockVerifier.sol";

/// Exposes the pool's pure amount helpers for SPP's `amounts.rs` tests.
contract ShieldedPoolHarness is ShieldedPool {
    constructor(address admin_, address token_, address verifier_, ShieldedPool.BridgeConfig memory cfg)
        ShieldedPool(admin_, token_, verifier_, 1000, 3, "tests", BabyJubJubPoint(1, 2), VIEW_ONLY, cfg)
    {}

    function calculatePublicAmount(int256 a) external pure returns (uint256) {
        return _calculatePublicAmount(a);
    }

    function toI128NonNeg(int256 v) external pure returns (uint256) {
        return _toI128NonNeg(v);
    }
}

/// Port of SPP's `contracts/pool-gvk/src/test.rs` (pinned SPP commit in
/// VERSIONS.md), test for test, minus the ASP tests (open policy only) and the
/// Soroban storage-layout and TTL tests, which have no EVM equivalent.
///
/// SPP's tests use a real verifier that always refuses (its compiled-in key
/// never fits a GVK input vector) for "reaches the verifier" cases, and a toy
/// Groth16 circuit tied to the exact expected public inputs for success cases.
/// `StrictMockVerifier` plays both roles: it refuses everything except an
/// (proof, public inputs) pair a test registered, with the inputs built here
/// independently of the pool.
abstract contract PoolTestBase is Test {
    uint256 constant R = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint32 constant VIEW_ONLY = 1;
    uint32 constant TRACEABLE = 2;
    string constant KDF_DOMAIN = "tests";

    /// SPEC.md B2: chain_id of Stellar testnet.
    uint256 constant STELLAR_TESTNET = 33353711811639397682;
    /// Throwaway attester key for tests (never funded).
    uint256 constant ATTESTER_KEY = 0xA77E57;

    address admin = makeAddr("admin");
    address rootPoster = makeAddr("rootPoster");
    MockUSDC token;
    StrictMockVerifier verifier;
    StrictMockVerifier bridgeOutVerifier;
    StrictMockVerifier bridgeInVerifier;

    function setUp() public virtual {
        token = new MockUSDC();
        verifier = new StrictMockVerifier();
        bridgeOutVerifier = new StrictMockVerifier();
        bridgeInVerifier = new StrictMockVerifier();
    }

    function _bridgeConfig() internal view returns (ShieldedPool.BridgeConfig memory) {
        return ShieldedPool.BridgeConfig({
            rootPoster: rootPoster,
            attester: vm.addr(ATTESTER_KEY),
            remoteChainId: STELLAR_TESTNET,
            assetId: 1,
            bridgeOutVerifier: bridgeOutVerifier,
            bridgeInVerifier: bridgeInVerifier
        });
    }

    // ========== Helpers (mirroring SPP's) ==========

    function _pt(uint256 x, uint256 y) internal pure returns (ShieldedPool.BabyJubJubPoint memory) {
        return ShieldedPool.BabyJubJubPoint(x, y);
    }

    function _deploy(uint256 maxDeposit, uint32 levels, ShieldedPool.BabyJubJubPoint memory d, uint32 mode)
        internal
        returns (ShieldedPool)
    {
        return new ShieldedPool(
            admin, address(token), address(verifier), maxDeposit, levels, KDF_DOMAIN, d, mode, _bridgeConfig()
        );
    }

    /// SPP's `register_open_pool_gvk`: view-only, cap 1000, depth 3.
    function _openPool() internal returns (ShieldedPool) {
        return _deploy(1000, 3, _pt(1, 2), VIEW_ONLY);
    }

    function _ct(uint256 x, uint256 y, uint256 c1, uint256 c2, uint256 c3)
        internal
        pure
        returns (ShieldedPool.GvkCiphertext memory)
    {
        return ShieldedPool.GvkCiphertext(_pt(x, y), c1, c2, c3);
    }

    function _outputCts() internal pure returns (ShieldedPool.GvkCiphertext[] memory v) {
        v = new ShieldedPool.GvkCiphertext[](2);
        v[0] = _ct(20, 21, 22, 23, 24);
        v[1] = _ct(30, 31, 32, 33, 34);
    }

    function _inputCts(uint256 n) internal pure returns (ShieldedPool.GvkCiphertext[] memory v) {
        v = new ShieldedPool.GvkCiphertext[](n);
        for (uint256 i = 0; i < n; i++) {
            v[i] = _ct(10 + 10 * i, 11 + 10 * i, 12 + 10 * i, 13 + 10 * i, 14 + 10 * i);
        }
    }

    /// SPP's `mk_mock_groth16_proof`: A = C = (1, 2), B = (1, 1, 1, 1).
    function _mockProofWords() internal pure returns (uint256[8] memory) {
        return [uint256(1), 2, 1, 1, 1, 1, 1, 2];
    }

    function _ext(address recipient, int256 extAmount) internal pure returns (ShieldedPool.ExtData memory) {
        return ShieldedPool.ExtData(recipient, extAmount, "", "");
    }

    /// The field encoding of `extAmount`, computed here, not by the pool.
    function _publicAmount(int256 extAmount) internal pure returns (uint256) {
        return extAmount >= 0 ? uint256(extAmount) : R - uint256(-extAmount);
    }

    /// SPP's `mk_transact_proof`: valid root, ext hash and public amount for a
    /// zero `extAmount`, one nullifier, and correctly shaped ciphertexts.
    function _mkProof(ShieldedPool pool, uint256 nullifier, uint32 mode)
        internal
        returns (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory ext)
    {
        ext = _ext(makeAddr("recipient"), 0);
        uint256[] memory nulls = new uint256[](1);
        nulls[0] = nullifier;
        p = ShieldedPool.Proof({
            proof: _mockProofWords(),
            root: pool.getRoot(),
            inputNullifiers: nulls,
            outputCommitment0: 0x01,
            outputCommitment1: 0x02,
            publicAmount: 0,
            extDataHash: pool.hashExtData(ext),
            outputGvkCiphertexts: _outputCts(),
            inputGvkCiphertexts: mode == TRACEABLE ? _inputCts(1) : new ShieldedPool.GvkCiphertext[](0)
        });
    }

    /// SPP's `mk_moving_transact_proof`: `_mkProof` moving `extAmount`.
    function _mkMovingProof(ShieldedPool pool, int256 extAmount, uint256 nullifier)
        internal
        returns (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory ext)
    {
        (p,) = _mkProof(pool, nullifier, pool.getGvkMode());
        ext = _ext(makeAddr("recipient"), extAmount);
        p.extDataHash = pool.hashExtData(ext);
        p.publicAmount = _publicAmount(extAmount);
    }

    /// SPP's `expected_ark_public_inputs`, written independently of the pool:
    /// ciphertexts (inputs then outputs) field-major, then D, nonce, root,
    /// publicAmount, extDataHash, nullifiers, commitments.
    function _expectedInputs(ShieldedPool.Proof memory p, ShieldedPool.BabyJubJubPoint memory d)
        internal
        pure
        returns (uint256[] memory out)
    {
        uint256 nIn = p.inputGvkCiphertexts.length;
        uint256 nCt = nIn + p.outputGvkCiphertexts.length;
        ShieldedPool.GvkCiphertext[] memory cts = new ShieldedPool.GvkCiphertext[](nCt);
        for (uint256 i = 0; i < nCt; i++) {
            cts[i] = i < nIn ? p.inputGvkCiphertexts[i] : p.outputGvkCiphertexts[i - nIn];
        }
        out = new uint256[](5 * nCt + 6 + p.inputNullifiers.length + 2);
        uint256 k;
        for (uint256 i = 0; i < nCt; i++) {
            out[k++] = cts[i].r.x;
            out[k++] = cts[i].r.y;
        }
        for (uint256 i = 0; i < nCt; i++) out[k++] = cts[i].c1;
        for (uint256 i = 0; i < nCt; i++) out[k++] = cts[i].c2;
        for (uint256 i = 0; i < nCt; i++) out[k++] = cts[i].c3;
        out[k++] = d.x;
        out[k++] = d.y;
        out[k++] = uint256(p.extDataHash); // nonce
        out[k++] = p.root;
        out[k++] = p.publicAmount;
        out[k++] = uint256(p.extDataHash);
        for (uint256 i = 0; i < p.inputNullifiers.length; i++) out[k++] = p.inputNullifiers[i];
        out[k++] = p.outputCommitment0;
        out[k++] = p.outputCommitment1;
    }

    /// Registers `p` with the verifier as a valid proof for pool key `d`.
    function _accept(ShieldedPool.Proof memory p, ShieldedPool.BabyJubJubPoint memory d) internal {
        verifier.expect(p.proof, _expectedInputs(p, d));
    }

    function _expectTransactRevert(ShieldedPool pool, ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e, bytes4 sel)
        internal
    {
        vm.expectRevert(sel);
        pool.transact(p, e);
    }

    function _fund(address who, uint256 amount, ShieldedPool pool) internal {
        token.mint(who, amount);
        vm.prank(who);
        token.approve(address(pool), type(uint256).max);
    }

    function _uint256Arr(uint256 a, uint256 b) internal pure returns (uint256[] memory v) {
        v = new uint256[](2);
        v[0] = a;
        v[1] = b;
    }

}

contract ShieldedPoolTest is PoolTestBase {
    // ========== Constructor and getters ==========

    function test_constructorSetsState() public {
        ShieldedPool pool = _deploy(100, 8, _pt(7, 11), TRACEABLE);
        assertEq(pool.getAdmin(), admin);
        assertEq(pool.maximumDepositAmount(), 100);
        assertEq(pool.currentRootIndex(), 0);
        assertEq(pool.getAdminViewKey().x, 7);
        assertEq(pool.getAdminViewKey().y, 11);
        assertEq(pool.getGvkMode(), TRACEABLE);
        assertEq(pool.getKdfDomain(), KDF_DOMAIN);
        assertEq(address(pool.token()), address(token));
        assertEq(address(pool.verifier()), address(verifier));
        assertEq(pool.levels(), 8);
        assertEq(pool.getRoot(), MerkleZeroHashes.zeroHash(8));
    }

    function test_constructorRejectsInvalidGvkMode() public {
        uint32[3] memory bad = [uint32(0), 3, type(uint32).max];
        for (uint256 i = 0; i < 3; i++) {
            vm.expectRevert(ShieldedPool.InvalidGvkMode.selector);
            _deploy(100, 8, _pt(1, 2), bad[i]);
        }
    }

    function test_constructorRejectsNonCanonicalAdminViewKeyX() public {
        vm.expectRevert(ShieldedPool.InvalidAdminViewKey.selector);
        _deploy(100, 8, _pt(R, 2), VIEW_ONLY);
    }

    function test_constructorRejectsNonCanonicalAdminViewKeyY() public {
        vm.expectRevert(ShieldedPool.InvalidAdminViewKey.selector);
        _deploy(100, 8, _pt(1, R), VIEW_ONLY);
    }

    /// The likely deployment mistake: an all-zero point.
    function test_constructorRejectsZeroAdminViewKey() public {
        vm.expectRevert(ShieldedPool.InvalidAdminViewKey.selector);
        _deploy(100, 8, _pt(0, 0), VIEW_ONLY);
    }

    /// `x == 0` also covers the low-order identity (0, 1).
    function test_constructorRejectsIdentityAdminViewKey() public {
        vm.expectRevert(ShieldedPool.InvalidAdminViewKey.selector);
        _deploy(100, 8, _pt(0, 1), VIEW_ONLY);
    }

    /// `r - 1` is canonical and must be accepted.
    function test_constructorAcceptsBoundaryCanonicalAdminViewKey() public {
        ShieldedPool pool = _deploy(100, 8, _pt(R - 1, R - 1), VIEW_ONLY);
        assertEq(pool.getAdminViewKey().x, R - 1);
    }

    function test_constructorRejectsWrongLevels() public {
        vm.expectRevert(MerkleTreeLib.WrongLevels.selector);
        _deploy(100, 0, _pt(1, 2), VIEW_ONLY);
        vm.expectRevert(MerkleTreeLib.WrongLevels.selector);
        _deploy(100, 33, _pt(1, 2), VIEW_ONLY);
    }

    function test_gettersRoundTrip() public {
        ShieldedPool pool = _deploy(1000, 3, _pt(3, 4), VIEW_ONLY);
        assertEq(pool.getAdminViewKey().x, 3);
        assertEq(pool.getAdminViewKey().y, 4);
        assertEq(pool.getGvkMode(), VIEW_ONLY);
        assertTrue(pool.isKnownRoot(pool.getRoot()));
        assertFalse(pool.isSpent(42));
    }

    // ========== Admin ==========

    function test_updateAdminTransfersControl() public {
        ShieldedPool pool = _openPool();
        address newAdmin = makeAddr("newAdmin");
        vm.expectEmit(address(pool));
        emit ShieldedPool.AdminTransferProposed(admin, newAdmin);
        vm.prank(admin);
        pool.updateAdmin(newAdmin);
        vm.expectEmit(address(pool));
        emit ShieldedPool.AdminTransferAccepted(admin, newAdmin);
        vm.prank(newAdmin);
        pool.acceptAdmin();
        assertEq(pool.getAdmin(), newAdmin);
        assertEq(pool.getPendingAdmin(), address(0));
    }

    function test_theOldAdminKeepsControlUntilAcceptance() public {
        ShieldedPool pool = _openPool();
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        pool.updateAdmin(newAdmin);
        assertEq(pool.getPendingAdmin(), newAdmin);
        vm.prank(admin);
        pool.pauseDeposits();
        assertTrue(pool.depositsPaused());
    }

    function test_theNewAdminHasNoControlBeforeAcceptance() public {
        ShieldedPool pool = _openPool();
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        pool.updateAdmin(newAdmin);
        vm.prank(newAdmin);
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.pauseDeposits();
    }

    function test_acceptAdminRequiresThePendingAdmin() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.updateAdmin(makeAddr("newAdmin"));
        vm.prank(admin);
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.acceptAdmin();
    }

    function test_acceptAdminWithoutAPendingAdminIsRefused() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        vm.expectRevert(ShieldedPool.NoPendingAdmin.selector);
        pool.acceptAdmin();
    }

    function test_cancelAdminTransferClearsThePendingAdmin() public {
        ShieldedPool pool = _openPool();
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        pool.updateAdmin(newAdmin);
        vm.expectEmit(address(pool));
        emit ShieldedPool.AdminTransferCancelled(admin, newAdmin);
        vm.prank(admin);
        pool.cancelAdminTransfer();
        assertEq(pool.getPendingAdmin(), address(0));
        assertEq(pool.getAdmin(), admin);
        vm.prank(newAdmin);
        vm.expectRevert(ShieldedPool.NoPendingAdmin.selector);
        pool.acceptAdmin();
    }

    function test_cancelAdminTransferRequiresTheAdmin() public {
        ShieldedPool pool = _openPool();
        address newAdmin = makeAddr("newAdmin");
        vm.prank(admin);
        pool.updateAdmin(newAdmin);
        vm.prank(newAdmin);
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.cancelAdminTransfer();
    }

    function test_cancelAdminTransferWithoutAPendingAdminIsRefused() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        vm.expectRevert(ShieldedPool.NoPendingAdmin.selector);
        pool.cancelAdminTransfer();
    }

    function test_updateAdminRequiresAdmin() public {
        ShieldedPool pool = _openPool();
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.updateAdmin(makeAddr("anyone"));
    }

    // ========== External data hash (pool-core ext_data.rs) ==========

    function test_hashExtDataIsDeterministicAndReduced() public {
        ShieldedPool pool = _openPool();
        ShieldedPool.ExtData memory e = ShieldedPool.ExtData(makeAddr("r"), 7, hex"010203", hex"0405");
        assertEq(pool.hashExtData(e), pool.hashExtData(e));
        assertLt(uint256(pool.hashExtData(e)), R);
    }

    function test_hashExtDataChangesWithPoolAddress() public {
        ShieldedPool a = _openPool();
        ShieldedPool b = _openPool();
        ShieldedPool.ExtData memory e = ShieldedPool.ExtData(makeAddr("r"), 7, hex"010203", hex"0405");
        assertNotEq(a.hashExtData(e), b.hashExtData(e));
    }

    function test_hashExtDataChangesWithTokenAddress() public {
        ShieldedPool a = _openPool();
        token = new MockUSDC();
        ShieldedPool b = _openPool();
        ShieldedPool.ExtData memory e = ShieldedPool.ExtData(makeAddr("r"), 7, hex"010203", hex"0405");
        assertNotEq(a.hashExtData(e), b.hashExtData(e));
    }

    /// Every ExtData field is bound into the hash (ours; SPP gets this from XDR).
    function test_hashExtDataChangesWithEveryField() public {
        ShieldedPool pool = _openPool();
        ShieldedPool.ExtData memory e = ShieldedPool.ExtData(makeAddr("r"), 7, hex"010203", hex"0405");
        bytes32 h = pool.hashExtData(e);
        ShieldedPool.ExtData memory f = ShieldedPool.ExtData(makeAddr("r2"), 7, hex"010203", hex"0405");
        assertNotEq(pool.hashExtData(f), h);
        f = ShieldedPool.ExtData(makeAddr("r"), -7, hex"010203", hex"0405");
        assertNotEq(pool.hashExtData(f), h);
        f = ShieldedPool.ExtData(makeAddr("r"), 7, hex"010204", hex"0405");
        assertNotEq(pool.hashExtData(f), h);
        f = ShieldedPool.ExtData(makeAddr("r"), 7, hex"010203", hex"040506");
        assertNotEq(pool.hashExtData(f), h);
        // Moving a byte from one ciphertext to the other changes the hash.
        f = ShieldedPool.ExtData(makeAddr("r"), 7, hex"01020304", hex"05");
        assertNotEq(pool.hashExtData(f), h);
    }

    // ========== Amounts (pool-core amounts.rs) ==========

    function test_calculatePublicAmountAcceptsValuesInsideTheBound() public {
        ShieldedPoolHarness h = new ShieldedPoolHarness(admin, address(token), address(verifier), _bridgeConfig());
        int256 largest = (int256(1) << 248) - 1;
        assertEq(h.calculatePublicAmount(largest), uint256(largest));
        assertEq(h.calculatePublicAmount(-largest), R - uint256(largest));
        assertEq(h.calculatePublicAmount(0), 0);
        assertEq(h.calculatePublicAmount(-1), R - 1);
    }

    function test_calculatePublicAmountRefusesTheBoundInEitherSign() public {
        ShieldedPoolHarness h = new ShieldedPoolHarness(admin, address(token), address(verifier), _bridgeConfig());
        int256[4] memory bad = [int256(1) << 248, -(int256(1) << 248), type(int256).max, type(int256).min];
        for (uint256 i = 0; i < bad.length; i++) {
            vm.expectRevert(ShieldedPool.WrongExtAmount.selector);
            h.calculatePublicAmount(bad[i]);
        }
    }

    function test_toI128NonNegRefusesNegativeAndOversizedValues() public {
        ShieldedPoolHarness h = new ShieldedPoolHarness(admin, address(token), address(verifier), _bridgeConfig());
        vm.expectRevert(ShieldedPool.WrongExtAmount.selector);
        h.toI128NonNeg(-1);
        vm.expectRevert(ShieldedPool.WrongExtAmount.selector);
        h.toI128NonNeg(int256(type(int128).max) + 1);
        assertEq(h.toI128NonNeg(type(int128).max), uint256(uint128(type(int128).max)));
    }

    // ========== Transact: refusals before the verifier ==========

    /// The ext hash is wrong too, so the test pins UnknownRoot, not any error.
    function test_transactRejectsUnknownRoot() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xAB, VIEW_ONLY);
        p.root = 0xFF;
        p.extDataHash = bytes32(uint256(0xEE));
        _expectTransactRevert(pool, p, e, ShieldedPool.UnknownRoot.selector);
    }

    function test_transactRejectsBadExtHash() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xCC, VIEW_ONLY);
        p.extDataHash = bytes32(uint256(0x99));
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtHash.selector);
    }

    function test_transactRejectsBadPublicAmount() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xDD, VIEW_ONLY);
        p.publicAmount = 1; // should be 0 for extAmount = 0
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtAmount.selector);
    }

    /// A withdrawal of 5 must carry r - 5, not the 5 a deposit carries.
    function test_transactRejectsAWithdrawalWithADepositSignedPublicAmount() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, -5, 0xA1);
        p.publicAmount = 5;
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtAmount.selector);
    }

    function test_transactBoundsWithdrawalsBelowTwoToThe248() public {
        ShieldedPool pool = _openPool();
        // -2^248: refused by the public amount bound.
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, -(int256(1) << 127), 0xA2);
        e.extAmount = -(int256(1) << 248);
        p.extDataHash = pool.hashExtData(e);
        p.publicAmount = R - (uint256(1) << 248);
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtAmount.selector);
        // -2^127 (i128::MIN): passes the field bound, refused by the i128 bound.
        (p, e) = _mkMovingProof(pool, -(int256(1) << 127), 0xA2);
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtAmount.selector);
        // -(2^127 - 1): passes both bounds and reaches the verifier.
        (p, e) = _mkMovingProof(pool, -int256(type(int128).max), 0xA2);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    /// The spent check keys on the raw value, so this is the only refusal of a
    /// spent n resent as n + r.
    function test_transactRejectsNonCanonicalNullifier() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, R, VIEW_ONLY);
        _expectTransactRevert(pool, p, e, ShieldedPool.NonCanonicalPublicInput.selector);
    }

    function test_transactRejectsNonCanonicalOutputCommitment() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xEE, VIEW_ONLY);
        p.outputCommitment0 = R;
        _expectTransactRevert(pool, p, e, ShieldedPool.NonCanonicalPublicInput.selector);
        (p, e) = _mkProof(pool, 0xEE, VIEW_ONLY);
        p.outputCommitment1 = R;
        _expectTransactRevert(pool, p, e, ShieldedPool.NonCanonicalPublicInput.selector);
    }

    /// r - 1 is canonical, so the call reaches the verifier.
    function test_transactDoesNotRejectBoundaryCanonicalPublicInput() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, R - 1, VIEW_ONLY);
        p.outputCommitment0 = R - 1;
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    function test_transactRejectsWrongOutputGvkCiphertextCount() public {
        uint32[2] memory modes = [VIEW_ONLY, TRACEABLE];
        for (uint256 m = 0; m < 2; m++) {
            ShieldedPool pool = _deploy(1000, 3, _pt(1, 2), modes[m]);
            (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xC1, modes[m]);
            p.outputGvkCiphertexts = new ShieldedPool.GvkCiphertext[](1);
            p.outputGvkCiphertexts[0] = _ct(1, 2, 3, 4, 5);
            _expectTransactRevert(pool, p, e, ShieldedPool.WrongGvkCiphertextCount.selector);
            p.outputGvkCiphertexts = _inputCts(3);
            _expectTransactRevert(pool, p, e, ShieldedPool.WrongGvkCiphertextCount.selector);
        }
    }

    function test_transactRejectsWrongInputGvkCiphertextCountWhenTraceable() public {
        ShieldedPool pool = _deploy(1000, 3, _pt(1, 2), TRACEABLE);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xC2, TRACEABLE);
        p.inputGvkCiphertexts = new ShieldedPool.GvkCiphertext[](0);
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongGvkCiphertextCount.selector);
        p.inputGvkCiphertexts = _inputCts(2); // one nullifier, two ciphertexts
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongGvkCiphertextCount.selector);
    }

    function test_transactRejectsInputGvkCiphertextsPresentWhenViewOnly() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xC3, VIEW_ONLY);
        p.inputGvkCiphertexts = _inputCts(1);
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongGvkCiphertextCount.selector);
    }

    /// Every ciphertext field, of output and (traceable) input notes.
    function test_transactRejectsNonCanonicalGvkCiphertextField() public {
        uint32[2] memory modes = [VIEW_ONLY, TRACEABLE];
        for (uint256 m = 0; m < 2; m++) {
            ShieldedPool pool = _deploy(1000, 3, _pt(1, 2), modes[m]);
            for (uint256 field = 0; field < 5; field++) {
                (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xC4, modes[m]);
                _setCtField(p.outputGvkCiphertexts[0], field, R);
                _expectTransactRevert(pool, p, e, ShieldedPool.NonCanonicalPublicInput.selector);
                if (modes[m] == TRACEABLE) {
                    (p, e) = _mkProof(pool, 0xC4, modes[m]);
                    _setCtField(p.inputGvkCiphertexts[0], field, R);
                    _expectTransactRevert(pool, p, e, ShieldedPool.NonCanonicalPublicInput.selector);
                }
            }
        }
    }

    function _setCtField(ShieldedPool.GvkCiphertext memory ct, uint256 field, uint256 v) internal pure {
        if (field == 0) ct.r.x = v;
        else if (field == 1) ct.r.y = v;
        else if (field == 2) ct.c1 = v;
        else if (field == 3) ct.c2 = v;
        else ct.c3 = v;
    }

    function test_transactDoesNotRejectBoundaryCanonicalGvkCiphertextField() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xC5, VIEW_ONLY);
        p.outputGvkCiphertexts[0].c1 = R - 1;
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    /// `D` always comes from the pool's own storage. A proof bound to another
    /// key (here, registered with the verifier under D_a) is refused by a pool
    /// holding D_b, and accepted by the pool holding D_a.
    function test_transactNeverAcceptsCallerSuppliedAdminViewKey() public {
        ShieldedPool poolA = _deploy(1000, 3, _pt(1, 2), VIEW_ONLY);
        ShieldedPool poolB = _deploy(1000, 3, _pt(99, 100), VIEW_ONLY);

        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(poolB, 0xC6, VIEW_ONLY);
        _accept(p, _pt(1, 2));
        _expectTransactRevert(poolB, p, e, ShieldedPool.InvalidProof.selector);

        (p, e) = _mkProof(poolA, 0xC6, VIEW_ONLY);
        _accept(p, _pt(1, 2));
        poolA.transact(p, e);
        assertTrue(poolA.isSpent(0xC6));
    }

    // ========== Transact: success paths and events ==========

    function test_transactAcceptsCorrectViewOnlyCiphertextsAndEmitsCommitmentEvents() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE1, VIEW_ONLY);
        _accept(p, _pt(1, 2));
        ShieldedPool.GvkCiphertext memory none;
        ShieldedPool.GvkCiphertext[] memory outs = _outputCts();

        vm.expectEmit(address(pool));
        emit ShieldedPool.NewNullifier(0xE1, false, none);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x01, 0, "", outs[0]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x02, 1, "", outs[1]);
        pool.transact(p, e);
    }

    function test_transactAcceptsCorrectTraceableCiphertextsAndEmitsAllEvents() public {
        ShieldedPool pool = _deploy(1000, 3, _pt(1, 2), TRACEABLE);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE2, TRACEABLE);
        e.encryptedOutput0 = hex"aa";
        e.encryptedOutput1 = hex"bbcc";
        p.extDataHash = pool.hashExtData(e);
        _accept(p, _pt(1, 2));
        ShieldedPool.GvkCiphertext[] memory outs = _outputCts();
        ShieldedPool.GvkCiphertext[] memory ins = _inputCts(1);

        vm.expectEmit(address(pool));
        emit ShieldedPool.NewNullifier(0xE2, true, ins[0]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x01, 0, hex"aa", outs[0]);
        vm.expectEmit(address(pool));
        emit ShieldedPool.NewCommitment(0x02, 1, hex"bbcc", outs[1]);
        pool.transact(p, e);
    }

    /// A traceable transaction with the circuit's real shape: two nullifiers
    /// and four ciphertexts, so 30 public inputs (ours).
    function test_transactAcceptsATwoInputTraceableTransaction() public {
        ShieldedPool pool = _deploy(1000, 20, _pt(1, 2), TRACEABLE);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE9, TRACEABLE);
        p.inputNullifiers = _uint256Arr(0xE9, 0xEA);
        p.inputGvkCiphertexts = _inputCts(2);
        assertEq(_expectedInputs(p, _pt(1, 2)).length, 30);
        _accept(p, _pt(1, 2));
        pool.transact(p, e);
        assertTrue(pool.isSpent(0xE9));
        assertTrue(pool.isSpent(0xEA));
        assertEq(pool.nextIndex(), 2);
    }

    function test_transactAcceptsPositiveExtAmountDeposit() public {
        ShieldedPool pool = _openPool();
        address sender = makeAddr("sender");
        _fund(sender, 1000, pool);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 50, 0xE3);
        _accept(p, _pt(1, 2));
        assertNotEq(sender, e.recipient);

        vm.prank(sender);
        pool.transact(p, e);
        assertEq(token.balanceOf(sender), 950);
        assertEq(token.balanceOf(address(pool)), 50);
        assertEq(token.balanceOf(e.recipient), 0);
        assertTrue(pool.isSpent(0xE3));
    }

    function test_transactAcceptsNegativeExtAmountWithdrawal() public {
        ShieldedPool pool = _openPool();
        address sender = makeAddr("sender");
        token.mint(address(pool), 1000);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, -50, 0xE4);
        _accept(p, _pt(1, 2));

        vm.prank(sender);
        pool.transact(p, e);
        assertEq(token.balanceOf(address(pool)), 950);
        assertEq(token.balanceOf(e.recipient), 50);
        assertEq(token.balanceOf(sender), 0);
        assertTrue(pool.isSpent(0xE4));
    }

    /// A withdrawal larger than the pool's balance fails and changes nothing
    /// (ours: the solvency must-fail case from PLAN.md).
    function test_transactRefusesAWithdrawalLargerThanThePoolBalance() public {
        ShieldedPool pool = _openPool();
        token.mint(address(pool), 10);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, -50, 0xEB);
        _accept(p, _pt(1, 2));
        vm.expectRevert(ShieldedPool.TokenTransferFailed.selector);
        pool.transact(p, e);
        assertFalse(pool.isSpent(0xEB));
        assertEq(token.balanceOf(address(pool)), 10);
    }

    function test_transactRejectsDepositOverMaximum() public {
        ShieldedPool pool = _deploy(100, 3, _pt(1, 2), VIEW_ONLY);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 101, 0xD1);
        _accept(p, _pt(1, 2));
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtAmount.selector);
    }

    function test_transactAcceptsDepositAtMaximumBound() public {
        ShieldedPool pool = _openPool();
        address sender = makeAddr("sender");
        _fund(sender, 10_000, pool);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 1000, 0xD2);
        _accept(p, _pt(1, 2));
        vm.prank(sender);
        pool.transact(p, e);
        assertEq(token.balanceOf(sender), 9_000);
        assertEq(token.balanceOf(address(pool)), 1000);
    }

    /// A 2^200 cap and a matching public amount pass 2^127, so only the i128
    /// conversion refuses it.
    function test_transactRejectsADepositPastI128UnderALargerCap() public {
        ShieldedPool pool = _deploy(uint256(1) << 200, 3, _pt(1, 2), VIEW_ONLY);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, int256(1) << 127, 0xD3);
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtAmount.selector);
    }

    /// A zero cap does not refuse a zero extAmount; only the verifier refuses.
    function test_transactAcceptsZeroExtAmountWithZeroMaximumDeposit() public {
        ShieldedPool pool = _deploy(0, 3, _pt(1, 2), VIEW_ONLY);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE4, VIEW_ONLY);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
        _accept(p, _pt(1, 2));
        pool.transact(p, e);
    }

    function test_transactRejectsReplayedNullifier() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE5, VIEW_ONLY);
        _accept(p, _pt(1, 2));
        pool.transact(p, e);
        _expectTransactRevert(pool, p, e, ShieldedPool.AlreadySpentNullifier.selector);
    }

    /// The spent nullifier comes second, so checking only the first would let
    /// the call reach the verifier.
    function test_transactRejectsABatchWithOneSpentNullifier() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xC2, VIEW_ONLY);
        _accept(p, _pt(1, 2));
        pool.transact(p, e);

        (p, e) = _mkProof(pool, 0xC3, VIEW_ONLY);
        p.inputNullifiers = _uint256Arr(0xC3, 0xC2);
        _accept(p, _pt(1, 2));
        _expectTransactRevert(pool, p, e, ShieldedPool.AlreadySpentNullifier.selector);
    }

    /// A nullifier repeated in one call reaches the verifier: the circuit
    /// refuses duplicates.
    function test_transactLeavesDuplicateNullifierDetectionToTheCircuit() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xDEAD, VIEW_ONLY);
        p.inputNullifiers = _uint256Arr(0xDEAD, 0xDEAD);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    function test_transactReportsVerifierRejectionAsInvalidProof() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE5, VIEW_ONLY);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    /// A verifier that reverts is reported as InvalidProof too (SPP's
    /// `try_verify` mapping of verifier errors).
    function test_transactReportsAVerifierRevertAsInvalidProof() public {
        ShieldedPool pool =
            new ShieldedPool(
            admin, address(token), address(new RevertingVerifier()), 1000, 3, KDF_DOMAIN, _pt(1, 2), VIEW_ONLY, _bridgeConfig()
        );
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE5, VIEW_ONLY);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    /// Zeroed proof points fail verification. (SPP's empty-points half of this
    /// test is a Soroban decoding case with no ABI equivalent.)
    function test_transactRefusesAProofWithZeroedPoints() public {
        ShieldedPool pool = _openPool();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0xE7, VIEW_ONLY);
        _accept(p, _pt(1, 2));
        uint256[8] memory zero;
        p.proof = zero;
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    /// Any change to a public value the verifier sees, with everything else
    /// valid, is refused (ours: tampered ciphertexts, commitments, root).
    function test_transactRefusesTamperingWithAnyVerifiedValue() public {
        ShieldedPool pool = _deploy(1000, 3, _pt(1, 2), TRACEABLE);
        for (uint256 i = 0; i < 4; i++) {
            (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0x51, TRACEABLE);
            _accept(p, _pt(1, 2));
            if (i == 0) p.outputGvkCiphertexts[1].c3 += 1;
            else if (i == 1) p.inputGvkCiphertexts[0].r.x += 1;
            else if (i == 2) p.outputCommitment1 += 1;
            else p.proof[3] += 1;
            _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
        }
    }

    /// A relayer changing the recipient breaks the ext hash (PLAN.md must-fail).
    function test_transactRefusesAChangedRecipient() public {
        ShieldedPool pool = _openPool();
        token.mint(address(pool), 1000);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, -50, 0x52);
        _accept(p, _pt(1, 2));
        e.recipient = makeAddr("relayer");
        _expectTransactRevert(pool, p, e, ShieldedPool.WrongExtHash.selector);
    }

    function test_transactRejectsDepositWithInvalidProofWithoutMovingFunds() public {
        ShieldedPool pool = _openPool();
        address sender = makeAddr("sender");
        _fund(sender, 10_000, pool);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 500, 0xE6);
        vm.prank(sender);
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.transact(p, e);
        assertEq(token.balanceOf(sender), 10_000);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    /// An unfunded sender's deposit with an invalid proof fails as
    /// InvalidProof: verification runs before the transfer.
    function test_transactDepositVerificationRunsBeforeTransferWhenSenderUnfunded() public {
        ShieldedPool pool = _openPool();
        address sender = makeAddr("sender");
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 500, 0xE6);
        vm.prank(sender);
        vm.expectRevert(ShieldedPool.InvalidProof.selector);
        pool.transact(p, e);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    function test_transactDepositValidationFailuresDoNotTransfer() public {
        ShieldedPool pool = _openPool();
        address sender = makeAddr("sender");
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 500, 0xE6);
        _accept(p, _pt(1, 2));

        uint256 root = p.root;
        p.root = 0xBAD;
        vm.prank(sender);
        vm.expectRevert(ShieldedPool.UnknownRoot.selector);
        pool.transact(p, e);
        p.root = root;

        bytes32 h = p.extDataHash;
        p.extDataHash = bytes32(uint256(0xFF));
        vm.prank(sender);
        vm.expectRevert(ShieldedPool.WrongExtHash.selector);
        pool.transact(p, e);
        p.extDataHash = h;

        p.publicAmount = 999;
        vm.prank(sender);
        vm.expectRevert(ShieldedPool.WrongExtAmount.selector);
        pool.transact(p, e);

        assertEq(token.balanceOf(sender), 0);
        assertEq(token.balanceOf(address(pool)), 0);
    }

    /// A depth-1 tree holds one pair: the second deposit is refused after
    /// verification, and its funds stay with the sender.
    function test_transactRefusesAnInsertionIntoAFullTree() public {
        ShieldedPool pool = _deploy(1000, 1, _pt(1, 2), VIEW_ONLY);
        address sender = makeAddr("sender");
        _fund(sender, 10_000, pool);

        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 100, 1);
        _accept(p, _pt(1, 2));
        vm.prank(sender);
        pool.transact(p, e);

        (p, e) = _mkMovingProof(pool, 100, 2);
        _accept(p, _pt(1, 2));
        vm.prank(sender);
        vm.expectRevert(MerkleTreeLib.MerkleTreeFull.selector);
        pool.transact(p, e);
        assertEq(token.balanceOf(sender), 9_900);
        assertEq(token.balanceOf(address(pool)), 100);
    }

    /// Pool B shares pool A's verifier and depth but not its address or token,
    /// so pool A's proof stops at pool B's ext hash check.
    function test_transactRejectsPoolAProofReplayedOnPoolB() public {
        ShieldedPool poolA = _deploy(1000, 8, _pt(1, 2), VIEW_ONLY);
        token = new MockUSDC();
        ShieldedPool poolB = _deploy(1000, 8, _pt(1, 2), VIEW_ONLY);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(poolA, 0xF00D, VIEW_ONLY);

        _expectTransactRevert(poolA, p, e, ShieldedPool.InvalidProof.selector);
        _expectTransactRevert(poolB, p, e, ShieldedPool.WrongExtHash.selector);
    }

    /// Each settled transaction inserts its two commitments, and old roots stay
    /// usable (ours).
    function test_transactInsertsCommitmentsAndKeepsOldRootsKnown() public {
        ShieldedPool pool = _openPool();
        uint256 empty = pool.getRoot();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkProof(pool, 0x61, VIEW_ONLY);
        _accept(p, _pt(1, 2));
        pool.transact(p, e);
        assertEq(pool.nextIndex(), 2);
        assertNotEq(pool.getRoot(), empty);
        assertTrue(pool.isKnownRoot(empty));

        // A proof against the previous (empty) root still settles.
        (p, e) = _mkProof(pool, 0x62, VIEW_ONLY);
        p.root = empty;
        _accept(p, _pt(1, 2));
        pool.transact(p, e);
        assertEq(pool.nextIndex(), 4);
    }

    // ========== Deposit pause ==========

    function test_depositsPausedIsFalseAfterConstruction() public {
        assertFalse(_openPool().depositsPaused());
    }

    function test_pauseDepositsSetsTheFlagAndPublishesTheChange() public {
        ShieldedPool pool = _openPool();
        vm.recordLogs();
        vm.prank(admin);
        pool.pauseDeposits();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ShieldedPool.DepositPauseChanged.selector);
        assertEq(abi.decode(logs[0].data, (bool)), true);
        assertTrue(pool.depositsPaused());
    }

    /// A refused deposit changes no balance, nullifier, or event.
    function test_transactRefusesADepositWhileDepositsArePaused() public {
        ShieldedPool pool = _openPool();
        address sender = makeAddr("sender");
        _fund(sender, 10_000, pool);
        vm.prank(admin);
        pool.pauseDeposits();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 500, 0xF1);
        _accept(p, _pt(1, 2));

        vm.recordLogs();
        vm.prank(sender);
        vm.expectRevert(ShieldedPool.DepositsPaused.selector);
        pool.transact(p, e);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(token.balanceOf(sender), 10_000);
        assertEq(token.balanceOf(address(pool)), 0);
        assertFalse(pool.isSpent(0xF1));
    }

    function test_transactPassesATransferToTheVerifierWhileDepositsArePaused() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.pauseDeposits();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 0, 0xF2);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    function test_transactPassesAWithdrawalToTheVerifierWhileDepositsArePaused() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.pauseDeposits();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, -500, 0xF3);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    function test_unpauseDepositsLetsADepositReachTheVerifier() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.pauseDeposits();
        vm.recordLogs();
        vm.prank(admin);
        pool.unpauseDeposits();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ShieldedPool.DepositPauseChanged.selector);
        assertEq(abi.decode(logs[0].data, (bool)), false);
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 500, 0xF4);
        _expectTransactRevert(pool, p, e, ShieldedPool.InvalidProof.selector);
    }

    /// A pause on a paused pool succeeds and publishes DepositPauseRepeated.
    function test_pauseDepositsOnAPausedPoolChangesNothing() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.pauseDeposits();
        vm.recordLogs();
        vm.prank(admin);
        pool.pauseDeposits();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ShieldedPool.DepositPauseRepeated.selector);
        assertEq(abi.decode(logs[0].data, (bool)), true);
        assertTrue(pool.depositsPaused());
    }

    function test_pauseDepositsOnAPausedPoolRequiresAdmin() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.pauseDeposits();
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.pauseDeposits();
    }

    function test_unpauseDepositsOnAnOpenPoolChangesNothing() public {
        ShieldedPool pool = _openPool();
        vm.recordLogs();
        vm.prank(admin);
        pool.unpauseDeposits();
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        assertEq(logs[0].topics[0], ShieldedPool.DepositPauseRepeated.selector);
        assertEq(abi.decode(logs[0].data, (bool)), false);
        assertFalse(pool.depositsPaused());
    }

    function test_pauseDepositsRequiresAdmin() public {
        ShieldedPool pool = _openPool();
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.pauseDeposits();
    }

    function test_unpauseDepositsRequiresAdmin() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.pauseDeposits();
        vm.expectRevert(ShieldedPool.NotAuthorized.selector);
        pool.unpauseDeposits();
    }

    /// The deposit is above the cap, so a cap check ahead of the pause would
    /// answer WrongExtAmount instead.
    function test_transactRefusesAPausedDepositBeforeTheCap() public {
        ShieldedPool pool = _openPool();
        vm.prank(admin);
        pool.pauseDeposits();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 1500, 0xF5);
        _expectTransactRevert(pool, p, e, ShieldedPool.DepositsPaused.selector);
    }

    /// The sender holds no tokens, so a transfer ahead of the pause would fail
    /// differently.
    function test_transactRefusesAPausedDepositBeforeMovingTokens() public {
        ShieldedPool pool = _openPool();
        token.mint(makeAddr("someoneElse"), 10_000);
        vm.prank(admin);
        pool.pauseDeposits();
        (ShieldedPool.Proof memory p, ShieldedPool.ExtData memory e) = _mkMovingProof(pool, 500, 0xF6);
        _expectTransactRevert(pool, p, e, ShieldedPool.DepositsPaused.selector);
    }
}
