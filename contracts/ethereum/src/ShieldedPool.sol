// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";
import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";
import {MerkleTreeLib} from "./MerkleTreeLib.sol";

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title Shielded pool with a Global View Key, on Ethereum.
/// @notice Function-for-function port of SPP's `pool-gvk` contract and the
/// parts of `pool-core` it uses (pinned SPP commit in VERSIONS.md). Proofs come
/// from the same circuits and keys as on Stellar (`policy_tx_2_2_gvk_T` for
/// a traceable pool), so the public inputs are assembled in exactly the same
/// order; see docs/spp-encoding-notes.md.
///
/// Not ported, by team decision (open policy only): the ASP membership and
/// non-membership trees, `policy_flags`, `update_asp_*`, `get_asp_*` and the
/// ASP root public inputs. Storage time-to-live renewals have no EVM
/// equivalent. Everything else keeps SPP's names (in camelCase), checks, check
/// order, error names and events.
///
/// The private bridge (`bridgeOut`, `bridgeIn`, `postRemoteRoot`, `finalize`,
/// `refund`, `addLiquidity`) follows SPEC.md Part B.
contract ShieldedPool is MerkleTreeWithHistory {
    using MerkleTreeLib for MerkleTreeLib.Tree;
    // ========== Types ==========

    /// GVK mode: only output notes are encrypted under the admin view key.
    uint32 public constant VIEW_ONLY = 1;
    /// GVK mode: input and output notes are encrypted under the admin view key.
    uint32 public constant TRACEABLE = 2;

    /// BN254 scalar field modulus.
    uint256 internal constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    /// `ext_amount` must lie strictly between -2^248 and 2^248.
    int256 internal constant MAX_EXT_AMOUNT = int256(1) << 248;

    /// A Baby JubJub point, stored as raw coordinates (SPP's `BabyJubJubPoint`).
    struct BabyJubJubPoint {
        uint256 x;
        uint256 y;
    }

    /// One note's Global View Key ciphertext (SPP's `GvkCiphertext`).
    struct GvkCiphertext {
        BabyJubJubPoint r;
        uint256 c1;
        uint256 c2;
        uint256 c3;
    }

    /// Public external data a proof is bound to (SPP's `ExtData`).
    struct ExtData {
        /// Recipient for withdrawals.
        address recipient;
        /// Positive for deposits, negative for withdrawals.
        int256 extAmount;
        /// Note data for output 0, encrypted to its recipient.
        bytes encryptedOutput0;
        /// Note data for output 1, encrypted to its recipient.
        bytes encryptedOutput1;
    }

    /// Proof and its public values (SPP's `pool_gvk::Proof`, without the ASP
    /// roots). `proof` holds SPP's 256-byte `Groth16Proof` as eight words.
    struct Proof {
        uint256[8] proof;
        uint256 root;
        uint256[] inputNullifiers;
        uint256 outputCommitment0;
        uint256 outputCommitment1;
        uint256 publicAmount;
        /// Also fed into the circuit's `nonce` public input.
        bytes32 extDataHash;
        /// Ciphertexts of the two output notes, always present.
        GvkCiphertext[] outputGvkCiphertexts;
        /// Ciphertexts of the input notes: present iff the mode is TRACEABLE.
        GvkCiphertext[] inputGvkCiphertexts;
    }

    // ========== Bridge types (SPEC.md Part B) ==========

    /// Bridge configuration, fixed at construction.
    struct BridgeConfig {
        /// Posts the paired chain's outbox roots.
        address rootPoster;
        /// Ethereum address of the secp256k1 refund attester key (B12).
        address attester;
        /// `chain_id` of the paired chain (B2).
        uint256 remoteChainId;
        /// `asset_id` of this pool's token (B2; USDC = 1).
        uint256 assetId;
        IGroth16Verifier bridgeOutVerifier;
        IGroth16Verifier bridgeInVerifier;
    }

    /// `bridge_out` public values (B8). `ciphertexts` are in circuit order:
    /// in0, in1, out0, out1, refund note, `C`.
    struct BridgeOutProof {
        uint256[8] proof;
        uint256 root;
        uint256[2] inputNullifiers;
        uint256 changeCommitment0;
        uint256 changeCommitment1;
        uint256 bridgeMessage;
        uint256 refundCommitment;
        uint64 deadlineBucket;
        bytes32 extDataHash;
        GvkCiphertext[] ciphertexts;
    }

    struct BridgeOutExtData {
        bytes encryptedOutput0;
        bytes encryptedOutput1;
        bytes encryptedRefund;
        /// B10 payload for the recipient.
        bytes encryptedBridgeMessage;
    }

    /// `bridge_in` public values (B8). `ciphertexts`: out0, out1.
    struct BridgeInProof {
        uint256[8] proof;
        uint256 remoteRoot;
        uint256 claimNullifier;
        uint256 outputCommitment0;
        uint256 outputCommitment1;
        uint64 deadlineBucket;
        bytes32 extDataHash;
        GvkCiphertext[] ciphertexts;
    }

    struct BridgeInExtData {
        bytes encryptedOutput0;
        bytes encryptedOutput1;
    }

    enum BridgeStatus {
        None,
        Pending,
        Finalized,
        Refunded
    }

    /// A bridge message sent from this pool (B6, B7).
    struct PendingMessage {
        BridgeStatus status;
        uint64 deadlineBucket;
        uint32 outboxIndex;
        uint256 refundCommitment;
    }

    // ========== Errors (SPP's `pool_gvk::Error`) ==========

    error NotAuthorized();
    error WrongExtAmount();
    error InvalidProof();
    error UnknownRoot();
    error AlreadySpentNullifier();
    error WrongExtHash();
    error NonCanonicalPublicInput();
    error InvalidGvkMode();
    error WrongGvkCiphertextCount();
    error InvalidAdminViewKey();
    error DepositsPaused();
    error NoPendingAdmin();
    error TokenTransferFailed();
    // Bridge errors
    error InvalidBridgeConfig();
    error NotRootPoster();
    error UnknownRemoteRoot();
    error AlreadyClaimed();
    error BridgeMessageExists();
    error InvalidDeadline();
    error DeadlinePassed();
    error NotPending();
    error TooEarly();
    error InvalidAttestation();

    // ========== Events ==========

    /// SPP's `NewCommitmentEvent`.
    event NewCommitment(
        uint256 indexed commitment, uint32 index, bytes encryptedOutput, GvkCiphertext gvkCiphertext
    );
    /// SPP's `NewNullifierEvent`. SPP's `Option<GvkCiphertext>` becomes
    /// `hasGvkCiphertext` plus a zeroed ciphertext when absent (VIEW_ONLY).
    event NewNullifier(uint256 indexed nullifier, bool hasGvkCiphertext, GvkCiphertext gvkCiphertext);
    event DepositPauseChanged(bool paused);
    event DepositPauseRepeated(bool paused);
    event AdminTransferProposed(address admin, address pendingAdmin);
    event AdminTransferCancelled(address admin, address pendingAdmin);
    event AdminTransferAccepted(address oldAdmin, address newAdmin);
    /// A bridge message appended to the outbox. The refund note's and `C`'s
    /// GVK ciphertexts are for the admin; the encrypted payloads are for the
    /// sender (refund) and the recipient (B10).
    event BridgeOut(
        uint256 indexed bridgeMessage,
        uint32 outboxIndex,
        uint64 deadlineBucket,
        uint256 refundCommitment,
        GvkCiphertext refundCiphertext,
        GvkCiphertext bridgeCiphertext,
        bytes encryptedRefund,
        bytes encryptedBridgeMessage
    );
    event BridgeIn(uint256 indexed claimNullifier, uint256 remoteRoot);
    event RemoteRootPosted(uint256 indexed root);
    event BridgeFinalized(uint256 indexed bridgeMessage);
    event BridgeRefunded(uint256 indexed bridgeMessage, uint256 refundCommitment, uint32 index);
    event LiquidityAdded(address indexed from, uint256 amount);

    // ========== State ==========

    IERC20Minimal public immutable token;
    IGroth16Verifier public immutable verifier;
    uint256 public immutable maximumDepositAmount;
    uint32 public immutable gvkMode;
    /// Admin view key `D`, fixed at construction with no setter: an admin
    /// transfer moves only the admin address.
    uint256 internal immutable adminViewKeyX;
    uint256 internal immutable adminViewKeyY;
    /// Privacy key derivation domain. Immutable.
    string internal kdfDomain;

    address internal admin;
    address internal pendingAdmin;
    bool internal paused;
    /// Spent nullifiers.
    mapping(uint256 => bool) internal nullifierSpent;

    // Bridge configuration and state (SPEC.md Part B)

    /// Notes on Ethereum are in 10^-6 USDC, the bridge unit (B1).
    uint256 public constant SCALE = 1;
    /// Outbox tree depth (B6).
    uint32 public constant OUTBOX_LEVELS = 20;
    /// `bridgeOut` deadlines must be 2 to 48 hours ahead (B5).
    uint64 public constant MIN_DEADLINE_HOURS = 2;
    uint64 public constant MAX_DEADLINE_HOURS = 48;
    /// Seconds after the deadline before `finalize`/`refund` (B5).
    uint256 public constant REFUND_GRACE = 3600;
    /// Upper bound of a low-s secp256k1 signature (B12).
    uint256 internal constant SECP256K1_HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;

    address public immutable rootPoster;
    address public immutable attester;
    uint256 public immutable remoteChainId;
    uint256 public immutable assetId;
    IGroth16Verifier public immutable bridgeOutVerifier;
    IGroth16Verifier public immutable bridgeInVerifier;

    MerkleTreeLib.Tree internal outboxTree;
    mapping(uint256 => PendingMessage) internal pendingMessages;
    mapping(uint256 => bool) internal claimNullifierSpent;
    mapping(uint256 => bool) internal knownRemoteRoot;

    // ========== Constructor and getters ==========

    /// SPP's `__constructor`, minus the ASP arguments, plus the bridge
    /// configuration.
    constructor(
        address admin_,
        address token_,
        address verifier_,
        uint256 maximumDepositAmount_,
        uint32 levels_,
        string memory kdfDomain_,
        BabyJubJubPoint memory adminViewKey_,
        uint32 gvkMode_,
        BridgeConfig memory bridge_
    ) MerkleTreeWithHistory(levels_) {
        if (gvkMode_ != VIEW_ONLY && gvkMode_ != TRACEABLE) revert InvalidGvkMode();
        _validateAdminViewKey(adminViewKey_);
        if (
            bridge_.rootPoster == address(0) || bridge_.attester == address(0) || bridge_.remoteChainId == 0
                || bridge_.remoteChainId == block.chainid || bridge_.remoteChainId >= FIELD_SIZE || bridge_.assetId == 0
                || bridge_.assetId >= FIELD_SIZE || address(bridge_.bridgeOutVerifier) == address(0)
                || address(bridge_.bridgeInVerifier) == address(0)
        ) revert InvalidBridgeConfig();
        admin = admin_;
        token = IERC20Minimal(token_);
        verifier = IGroth16Verifier(verifier_);
        maximumDepositAmount = maximumDepositAmount_;
        kdfDomain = kdfDomain_;
        adminViewKeyX = adminViewKey_.x;
        adminViewKeyY = adminViewKey_.y;
        gvkMode = gvkMode_;
        rootPoster = bridge_.rootPoster;
        attester = bridge_.attester;
        remoteChainId = bridge_.remoteChainId;
        assetId = bridge_.assetId;
        bridgeOutVerifier = bridge_.bridgeOutVerifier;
        bridgeInVerifier = bridge_.bridgeInVerifier;
        outboxTree.init(OUTBOX_LEVELS);
    }

    /// SPP's `validate_admin_view_key`: canonical coordinates and `x != 0`.
    /// Curve and subgroup checks run in the circuit on every proof.
    function _validateAdminViewKey(BabyJubJubPoint memory key) private pure {
        if (key.x >= FIELD_SIZE || key.y >= FIELD_SIZE) revert InvalidAdminViewKey();
        if (key.x == 0) revert InvalidAdminViewKey();
    }

    function getAdminViewKey() external view returns (BabyJubJubPoint memory) {
        return BabyJubJubPoint(adminViewKeyX, adminViewKeyY);
    }

    function getGvkMode() external view returns (uint32) {
        return gvkMode;
    }

    function getKdfDomain() external view returns (string memory) {
        return kdfDomain;
    }

    function depositsPaused() public view returns (bool) {
        return paused;
    }

    function getRoot() external view returns (uint256) {
        return _getLastRoot();
    }

    function isKnownRoot(uint256 root) external view returns (bool) {
        return _isKnownRoot(root);
    }

    function isSpent(uint256 nullifier) public view returns (bool) {
        return nullifierSpent[nullifier];
    }

    // ========== Admin ==========

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    /// Proposes a new admin. The current admin keeps every power until
    /// `newAdmin` calls `acceptAdmin`. The admin view key does not move.
    function updateAdmin(address newAdmin) external onlyAdmin {
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    /// Withdraws the pending admin transfer.
    function cancelAdminTransfer() external onlyAdmin {
        address pending = pendingAdmin;
        if (pending == address(0)) revert NoPendingAdmin();
        delete pendingAdmin;
        emit AdminTransferCancelled(admin, pending);
    }

    /// Installs the pending admin; the previous admin loses every power.
    function acceptAdmin() external {
        address pending = pendingAdmin;
        if (pending == address(0)) revert NoPendingAdmin();
        if (msg.sender != pending) revert NotAuthorized();
        address old = admin;
        admin = pending;
        delete pendingAdmin;
        emit AdminTransferAccepted(old, pending);
    }

    function getAdmin() external view returns (address) {
        return admin;
    }

    /// The proposed next admin, or address(0) when none is pending.
    function getPendingAdmin() external view returns (address) {
        return pendingAdmin;
    }

    /// Pauses deposits; transfers and withdrawals still go through. A no-op
    /// call succeeds and emits `DepositPauseRepeated`, as in SPP.
    function pauseDeposits() external onlyAdmin {
        _setDepositsPaused(true);
    }

    function unpauseDeposits() external onlyAdmin {
        _setDepositsPaused(false);
    }

    function _setDepositsPaused(bool p) private {
        bool changed = paused != p;
        paused = p;
        if (changed) emit DepositPauseChanged(p);
        else emit DepositPauseRepeated(p);
    }

    // ========== External data and amounts ==========

    /// Hash of the external data, bound to this pool and its token, reduced
    /// into the BN254 scalar field. SPP hashes the Soroban XDR of the same
    /// fields with Keccak256 and reduces it the same way; the circuit treats
    /// the value as opaque, so each chain may use its own encoding. SPEC.md
    /// B11 fixes this one, including `block.chainid` because the same pool
    /// address can exist on several EVM chains.
    function hashExtData(ExtData calldata ext) public view returns (bytes32) {
        bytes32 digest = keccak256(
            abi.encode(
                block.chainid,
                address(this),
                address(token),
                ext.recipient,
                ext.extAmount,
                ext.encryptedOutput0,
                ext.encryptedOutput1
            )
        );
        return bytes32(uint256(digest) % FIELD_SIZE);
    }

    /// SPEC.md B11, `bridgeOut`.
    function hashBridgeOutExtData(BridgeOutExtData calldata ext) public view returns (bytes32) {
        bytes32 digest = keccak256(
            abi.encode(
                "zkross.bridge_out.v1",
                block.chainid,
                address(this),
                address(token),
                ext.encryptedOutput0,
                ext.encryptedOutput1,
                ext.encryptedRefund,
                ext.encryptedBridgeMessage
            )
        );
        return bytes32(uint256(digest) % FIELD_SIZE);
    }

    /// SPEC.md B11, `bridgeIn`.
    function hashBridgeInExtData(BridgeInExtData calldata ext) public view returns (bytes32) {
        bytes32 digest = keccak256(
            abi.encode(
                "zkross.bridge_in.v1", block.chainid, address(this), address(token), ext.encryptedOutput0, ext.encryptedOutput1
            )
        );
        return bytes32(uint256(digest) % FIELD_SIZE);
    }

    /// SPP's `calculate_public_amount`: `ext_amount` in the field, negative
    /// values wrapped to `r - |ext_amount|`, refused unless
    /// `-2^248 < ext_amount < 2^248`.
    function _calculatePublicAmount(int256 extAmount) internal pure returns (uint256) {
        if (extAmount >= MAX_EXT_AMOUNT || extAmount <= -MAX_EXT_AMOUNT) revert WrongExtAmount();
        if (extAmount >= 0) return uint256(extAmount);
        return FIELD_SIZE - uint256(-extAmount);
    }

    /// SPP's `i256_to_i128_nonneg`: SPP's token amounts are `i128`, kept here
    /// so an amount valid on one chain is valid on the other.
    function _toI128NonNeg(int256 v) internal pure returns (uint256) {
        if (v < 0 || v > type(int128).max) revert WrongExtAmount();
        return uint256(v);
    }

    // ========== Proof verification ==========

    /// SPP's `validate_gvk_ciphertext_counts`.
    function _validateGvkCiphertextCounts(Proof calldata proof) internal view {
        if (proof.outputGvkCiphertexts.length != 2) revert WrongGvkCiphertextCount();
        uint256 expectedInputs = gvkMode == TRACEABLE ? proof.inputNullifiers.length : 0;
        if (proof.inputGvkCiphertexts.length != expectedInputs) revert WrongGvkCiphertextCount();
    }

    function _checkCanonical(uint256 v) private pure {
        if (v >= FIELD_SIZE) revert NonCanonicalPublicInput();
    }

    function _checkCanonical(GvkCiphertext calldata ct) private pure {
        _checkCanonical(ct.r.x);
        _checkCanonical(ct.r.y);
        _checkCanonical(ct.c1);
        _checkCanonical(ct.c2);
        _checkCanonical(ct.c3);
    }

    /// SPP's `validate_bn256_public_inputs`. `extDataHash` was already checked
    /// equal to `hashExtData`, which is reduced, and `D` was checked at
    /// construction.
    function _validatePublicInputs(Proof calldata proof) internal pure {
        _checkCanonical(proof.root);
        _checkCanonical(proof.publicAmount);
        for (uint256 i = 0; i < proof.inputNullifiers.length; i++) {
            _checkCanonical(proof.inputNullifiers[i]);
        }
        _checkCanonical(proof.outputCommitment0);
        _checkCanonical(proof.outputCommitment1);
        for (uint256 i = 0; i < proof.inputGvkCiphertexts.length; i++) {
            _checkCanonical(proof.inputGvkCiphertexts[i]);
        }
        for (uint256 i = 0; i < proof.outputGvkCiphertexts.length; i++) {
            _checkCanonical(proof.outputGvkCiphertexts[i]);
        }
    }

    /// SPP's `verify_proof`. Public inputs, in circuit order: the GVK
    /// ciphertexts (input notes, then output notes) field-major — every `R`
    /// pair, then every `c1`, `c2`, `c3` — then `D, nonce, root,
    /// publicAmount, extDataHash, inputNullifier[], outputCommitment[]`.
    /// `D` always comes from this contract's immutable storage; `nonce` reuses
    /// `extDataHash` with no uniqueness check, exactly as in SPP (SPEC.md A).
    function _verifyProof(Proof calldata proof) internal view returns (bool) {
        _validateGvkCiphertextCounts(proof);
        _validatePublicInputs(proof);

        uint256 nIn = proof.inputGvkCiphertexts.length;
        uint256 nCt = nIn + proof.outputGvkCiphertexts.length;
        uint256 nNull = proof.inputNullifiers.length;
        uint256[] memory inputs = new uint256[](5 * nCt + 6 + nNull + 2);

        uint256 k = 0;
        for (uint256 i = 0; i < nCt; i++) {
            GvkCiphertext calldata ct = _ciphertext(proof, i, nIn);
            inputs[k++] = ct.r.x;
            inputs[k++] = ct.r.y;
        }
        for (uint256 i = 0; i < nCt; i++) {
            inputs[k++] = _ciphertext(proof, i, nIn).c1;
        }
        for (uint256 i = 0; i < nCt; i++) {
            inputs[k++] = _ciphertext(proof, i, nIn).c2;
        }
        for (uint256 i = 0; i < nCt; i++) {
            inputs[k++] = _ciphertext(proof, i, nIn).c3;
        }
        inputs[k++] = adminViewKeyX;
        inputs[k++] = adminViewKeyY;
        inputs[k++] = uint256(proof.extDataHash);
        inputs[k++] = proof.root;
        inputs[k++] = proof.publicAmount;
        inputs[k++] = uint256(proof.extDataHash);
        for (uint256 i = 0; i < nNull; i++) {
            inputs[k++] = proof.inputNullifiers[i];
        }
        inputs[k++] = proof.outputCommitment0;
        inputs[k++] = proof.outputCommitment1;

        return _callVerifier(verifier, proof.proof, inputs);
    }

    /// Any verifier failure, revert or false, is reported as InvalidProof.
    function _callVerifier(IGroth16Verifier v, uint256[8] calldata proof, uint256[] memory inputs)
        private
        view
        returns (bool)
    {
        try v.verify(proof, inputs) returns (bool ok) {
            return ok;
        } catch {
            revert InvalidProof();
        }
    }

    function _ciphertext(Proof calldata proof, uint256 i, uint256 nIn)
        private
        pure
        returns (GvkCiphertext calldata)
    {
        return i < nIn ? proof.inputGvkCiphertexts[i] : proof.outputGvkCiphertexts[i - nIn];
    }

    // ========== Transact ==========

    /// SPP's `transact`, with `sender = msg.sender`. Tokens move only after
    /// every check and the proof pass and the pool's state is updated: a
    /// deposit pulls `extAmount` from the caller, a withdrawal pays
    /// `extData.recipient`.
    function transact(Proof calldata proof, ExtData calldata extData) external {
        // 1. Deposit pause, cap, and i128 range check
        uint256 depositAmount = 0;
        if (extData.extAmount > 0) {
            if (paused) revert DepositsPaused();
            if (uint256(extData.extAmount) > maximumDepositAmount) revert WrongExtAmount();
            depositAmount = _toI128NonNeg(extData.extAmount);
        }

        // 2. Merkle root check
        if (!_isKnownRoot(proof.root)) revert UnknownRoot();

        // 3. Nullifier checks. Duplicate nullifiers within one proof are
        // refused by the circuit, as in SPP.
        for (uint256 i = 0; i < proof.inputNullifiers.length; i++) {
            if (nullifierSpent[proof.inputNullifiers[i]]) revert AlreadySpentNullifier();
        }

        // 4. External data hash check (also the circuit's nonce)
        if (hashExtData(extData) != proof.extDataHash) revert WrongExtHash();

        // 5. Public amount and withdrawal range check
        if (proof.publicAmount != _calculatePublicAmount(extData.extAmount)) revert WrongExtAmount();
        uint256 withdrawalAmount = 0;
        if (extData.extAmount < 0) {
            withdrawalAmount = _toI128NonNeg(-extData.extAmount);
        }

        // 6. ASP root validation: open policy, nothing to check.

        // 7. ZK proof verification (includes the GVK ciphertext-count and
        // canonical-range checks)
        if (!_verifyProof(proof)) revert InvalidProof();

        // 8. Mark nullifiers as spent
        for (uint256 i = 0; i < proof.inputNullifiers.length; i++) {
            nullifierSpent[proof.inputNullifiers[i]] = true;
        }

        // 9. Insert new commitments into the Merkle tree
        (uint32 idx0, uint32 idx1) = _insertTwoLeaves(proof.outputCommitment0, proof.outputCommitment1);

        // 10. Token transfers
        if (depositAmount > 0) {
            _safeCall(abi.encodeCall(IERC20Minimal.transferFrom, (msg.sender, address(this), depositAmount)));
        } else if (withdrawalAmount > 0) {
            _safeCall(abi.encodeCall(IERC20Minimal.transfer, (extData.recipient, withdrawalAmount)));
        }

        // 11. Events
        bool hasInputCiphertexts = proof.inputGvkCiphertexts.length != 0;
        GvkCiphertext memory none;
        for (uint256 i = 0; i < proof.inputNullifiers.length; i++) {
            emit NewNullifier(
                proof.inputNullifiers[i], hasInputCiphertexts, hasInputCiphertexts ? proof.inputGvkCiphertexts[i] : none
            );
        }
        emit NewCommitment(proof.outputCommitment0, idx0, extData.encryptedOutput0, proof.outputGvkCiphertexts[0]);
        emit NewCommitment(proof.outputCommitment1, idx1, extData.encryptedOutput1, proof.outputGvkCiphertexts[1]);
    }

    // ========== Bridge (SPEC.md Part B) ==========

    modifier onlyRootPoster() {
        if (msg.sender != rootPoster) revert NotRootPoster();
        _;
    }

    /// Records a root of the paired chain's outbox (B6). Roots are kept
    /// forever, so a message stays claimable until its deadline.
    function postRemoteRoot(uint256 root) external onlyRootPoster {
        if (root == 0) revert UnknownRemoteRoot();
        _checkCanonical(root);
        knownRemoteRoot[root] = true;
        emit RemoteRootPosted(root);
    }

    /// Adds unowned balance that backs incoming bridge notes (B13).
    function addLiquidity(uint256 amount) external onlyAdmin {
        _safeCall(abi.encodeCall(IERC20Minimal.transferFrom, (msg.sender, address(this), amount)));
        emit LiquidityAdded(msg.sender, amount);
    }

    /// Spends two notes into two change notes plus a bridge message `C`, which
    /// is appended to the outbox as the pair (C, 0) (B6, B8). The bridged
    /// value stays in this pool as liquidity.
    function bridgeOut(BridgeOutProof calldata p, BridgeOutExtData calldata ext) external {
        // Same order as transact: root, nullifiers, ext hash, then the bridge
        // checks, then the proof.
        if (!_isKnownRoot(p.root)) revert UnknownRoot();
        if (nullifierSpent[p.inputNullifiers[0]] || nullifierSpent[p.inputNullifiers[1]]) {
            revert AlreadySpentNullifier();
        }
        if (hashBridgeOutExtData(ext) != p.extDataHash) revert WrongExtHash();
        uint64 nowHour = uint64(block.timestamp / 3600);
        if (p.deadlineBucket < nowHour + MIN_DEADLINE_HOURS || p.deadlineBucket > nowHour + MAX_DEADLINE_HOURS) {
            revert InvalidDeadline();
        }
        if (pendingMessages[p.bridgeMessage].status != BridgeStatus.None) revert BridgeMessageExists();
        if (p.ciphertexts.length != 6) revert WrongGvkCiphertextCount();
        _checkCanonical(p.root);
        _checkCanonical(p.inputNullifiers[0]);
        _checkCanonical(p.inputNullifiers[1]);
        _checkCanonical(p.changeCommitment0);
        _checkCanonical(p.changeCommitment1);
        _checkCanonical(p.bridgeMessage);
        _checkCanonical(p.refundCommitment);
        for (uint256 i = 0; i < 6; i++) {
            _checkCanonical(p.ciphertexts[i]);
        }

        if (!_callVerifier(bridgeOutVerifier, p.proof, _bridgeOutInputs(p))) revert InvalidProof();

        nullifierSpent[p.inputNullifiers[0]] = true;
        nullifierSpent[p.inputNullifiers[1]] = true;
        (uint32 idx0, uint32 idx1) = _insertTwoLeaves(p.changeCommitment0, p.changeCommitment1);
        (uint32 outboxIndex,) = outboxTree.insertTwoLeaves(p.bridgeMessage, 0);
        pendingMessages[p.bridgeMessage] = PendingMessage({
            status: BridgeStatus.Pending,
            deadlineBucket: p.deadlineBucket,
            outboxIndex: outboxIndex,
            refundCommitment: p.refundCommitment
        });

        emit NewNullifier(p.inputNullifiers[0], true, p.ciphertexts[0]);
        emit NewNullifier(p.inputNullifiers[1], true, p.ciphertexts[1]);
        emit NewCommitment(p.changeCommitment0, idx0, ext.encryptedOutput0, p.ciphertexts[2]);
        emit NewCommitment(p.changeCommitment1, idx1, ext.encryptedOutput1, p.ciphertexts[3]);
        emit BridgeOut(
            p.bridgeMessage,
            outboxIndex,
            p.deadlineBucket,
            p.refundCommitment,
            p.ciphertexts[4],
            p.ciphertexts[5],
            ext.encryptedRefund,
            ext.encryptedBridgeMessage
        );
    }

    /// B8 `bridge_out` public signals: 6 ciphertexts field-major, then D,
    /// nonce, root, extDataHash, nullifiers, change commitments, C, refund
    /// commitment, scale, assetId, srcChain (this chain), dstChain, deadline.
    function _bridgeOutInputs(BridgeOutProof calldata p) internal view returns (uint256[] memory inputs) {
        inputs = new uint256[](46);
        uint256 k = _fieldMajor(inputs, p.ciphertexts);
        inputs[k++] = adminViewKeyX;
        inputs[k++] = adminViewKeyY;
        inputs[k++] = uint256(p.extDataHash); // nonce
        inputs[k++] = p.root;
        inputs[k++] = uint256(p.extDataHash);
        inputs[k++] = p.inputNullifiers[0];
        inputs[k++] = p.inputNullifiers[1];
        inputs[k++] = p.changeCommitment0;
        inputs[k++] = p.changeCommitment1;
        inputs[k++] = p.bridgeMessage;
        inputs[k++] = p.refundCommitment;
        inputs[k++] = SCALE;
        inputs[k++] = assetId;
        inputs[k++] = block.chainid;
        inputs[k++] = remoteChainId;
        inputs[k++] = p.deadlineBucket;
    }

    /// Claims a bridge message from the paired chain and creates two notes for
    /// its recipient, backed by this pool's liquidity (B8).
    function bridgeIn(BridgeInProof calldata p, BridgeInExtData calldata ext) external {
        if (!knownRemoteRoot[p.remoteRoot]) revert UnknownRemoteRoot();
        if (claimNullifierSpent[p.claimNullifier]) revert AlreadyClaimed();
        if (hashBridgeInExtData(ext) != p.extDataHash) revert WrongExtHash();
        if (block.timestamp >= uint256(p.deadlineBucket) * 3600) revert DeadlinePassed();
        if (p.ciphertexts.length != 2) revert WrongGvkCiphertextCount();
        _checkCanonical(p.claimNullifier);
        _checkCanonical(p.outputCommitment0);
        _checkCanonical(p.outputCommitment1);
        _checkCanonical(p.ciphertexts[0]);
        _checkCanonical(p.ciphertexts[1]);

        if (!_callVerifier(bridgeInVerifier, p.proof, _bridgeInInputs(p))) revert InvalidProof();

        claimNullifierSpent[p.claimNullifier] = true;
        (uint32 idx0, uint32 idx1) = _insertTwoLeaves(p.outputCommitment0, p.outputCommitment1);

        emit NewCommitment(p.outputCommitment0, idx0, ext.encryptedOutput0, p.ciphertexts[0]);
        emit NewCommitment(p.outputCommitment1, idx1, ext.encryptedOutput1, p.ciphertexts[1]);
        emit BridgeIn(p.claimNullifier, p.remoteRoot);
    }

    /// B8 `bridge_in` public signals: 2 ciphertexts field-major, then D,
    /// nonce, remoteRoot, extDataHash, claimNullifier, output commitments,
    /// scale, assetId, srcChain (the paired chain), dstChain (this chain),
    /// deadline.
    function _bridgeInInputs(BridgeInProof calldata p) internal view returns (uint256[] memory inputs) {
        inputs = new uint256[](23);
        uint256 k = _fieldMajor(inputs, p.ciphertexts);
        inputs[k++] = adminViewKeyX;
        inputs[k++] = adminViewKeyY;
        inputs[k++] = uint256(p.extDataHash); // nonce
        inputs[k++] = p.remoteRoot;
        inputs[k++] = uint256(p.extDataHash);
        inputs[k++] = p.claimNullifier;
        inputs[k++] = p.outputCommitment0;
        inputs[k++] = p.outputCommitment1;
        inputs[k++] = SCALE;
        inputs[k++] = assetId;
        inputs[k++] = remoteChainId;
        inputs[k++] = block.chainid;
        inputs[k++] = p.deadlineBucket;
    }

    /// Writes ciphertexts field-major (every R pair, then every c1, c2, c3)
    /// from index 0 and returns the next index.
    function _fieldMajor(uint256[] memory inputs, GvkCiphertext[] calldata cts) private pure returns (uint256 k) {
        uint256 n = cts.length;
        for (uint256 i = 0; i < n; i++) {
            inputs[k++] = cts[i].r.x;
            inputs[k++] = cts[i].r.y;
        }
        for (uint256 i = 0; i < n; i++) {
            inputs[k++] = cts[i].c1;
        }
        for (uint256 i = 0; i < n; i++) {
            inputs[k++] = cts[i].c2;
        }
        for (uint256 i = 0; i < n; i++) {
            inputs[k++] = cts[i].c3;
        }
    }

    /// Settles a claimed message after its deadline (attestation status 0x02).
    /// Its value stays here as liquidity.
    function finalize(uint256 bridgeMessage, bytes calldata attestation) external {
        _settle(bridgeMessage, 0x02, attestation).status = BridgeStatus.Finalized;
        emit BridgeFinalized(bridgeMessage);
    }

    /// Refunds an unclaimed message after its deadline (attestation status
    /// 0x01): inserts the stored refund note as the pair (refund, 0).
    function refund(uint256 bridgeMessage, bytes calldata attestation) external {
        PendingMessage storage m = _settle(bridgeMessage, 0x01, attestation);
        m.status = BridgeStatus.Refunded;
        (uint32 idx0, uint32 idx1) = _insertTwoLeaves(m.refundCommitment, 0);
        GvkCiphertext memory none;
        // The refund note's GVK ciphertext and delivery payload were published
        // in BridgeOut; these events keep the note tree reconstructible.
        emit NewCommitment(m.refundCommitment, idx0, "", none);
        emit NewCommitment(0, idx1, "", none);
        emit BridgeRefunded(bridgeMessage, m.refundCommitment, idx0);
    }

    function _settle(uint256 bridgeMessage, uint8 status, bytes calldata attestation)
        private
        returns (PendingMessage storage m)
    {
        m = pendingMessages[bridgeMessage];
        if (m.status != BridgeStatus.Pending) revert NotPending();
        if (block.timestamp < uint256(m.deadlineBucket) * 3600 + REFUND_GRACE) revert TooEarly();
        if (!_isValidAttestation(bridgeMessage, status, attestation)) revert InvalidAttestation();
    }

    /// B12: `attester` signed keccak256("ZKROSS-ATTEST-v1" ‖ src_chain ‖ pool ‖
    /// C ‖ status) as r ‖ s ‖ v with low s.
    function _isValidAttestation(uint256 bridgeMessage, uint8 status, bytes calldata sig)
        private
        view
        returns (bool)
    {
        if (sig.length != 65) return false;
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (uint256(s) > SECP256K1_HALF_N || (v != 27 && v != 28)) return false;
        bytes32 digest = attestationDigest(bridgeMessage, status);
        address signer = ecrecover(digest, v, r, s);
        return signer != address(0) && signer == attester;
    }

    /// The digest the attester signs for a message sent from this pool.
    function attestationDigest(uint256 bridgeMessage, uint8 status) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                "ZKROSS-ATTEST-v1", bytes32(block.chainid), bytes32(uint256(uint160(address(this)))), bytes32(bridgeMessage), status
            )
        );
    }

    // Bridge getters

    function getOutboxRoot() external view returns (uint256) {
        return outboxTree.getLastRoot();
    }

    function isKnownOutboxRoot(uint256 root) external view returns (bool) {
        return outboxTree.isKnownRoot(root);
    }

    function outboxNextIndex() external view returns (uint64) {
        return outboxTree.nextIndex;
    }

    function isKnownRemoteRoot(uint256 root) external view returns (bool) {
        return knownRemoteRoot[root];
    }

    function isClaimed(uint256 claimNullifier) external view returns (bool) {
        return claimNullifierSpent[claimNullifier];
    }

    function getPendingMessage(uint256 bridgeMessage) external view returns (PendingMessage memory) {
        return pendingMessages[bridgeMessage];
    }

    /// Calls the token and requires success plus a true (or empty) return.
    function _safeCall(bytes memory data) private {
        (bool ok, bytes memory ret) = address(token).call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || address(token).code.length == 0) {
            revert TokenTransferFailed();
        }
    }
}
