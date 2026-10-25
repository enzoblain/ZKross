// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "./interfaces/IGroth16Verifier.sol";
import {MerkleTreeWithHistory} from "./MerkleTreeWithHistory.sol";

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
// TODO(SPEC): the bridge functions (bridgeOut, bridgeIn, postRemoteRoot,
// finalize, refund, addLiquidity) come once the bridge formats are in SPEC.md.
contract ShieldedPool is MerkleTreeWithHistory {
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

    // ========== Constructor and getters ==========

    /// SPP's `__constructor`, minus the ASP arguments.
    constructor(
        address admin_,
        address token_,
        address verifier_,
        uint256 maximumDepositAmount_,
        uint32 levels_,
        string memory kdfDomain_,
        BabyJubJubPoint memory adminViewKey_,
        uint32 gvkMode_
    ) MerkleTreeWithHistory(levels_) {
        if (gvkMode_ != VIEW_ONLY && gvkMode_ != TRACEABLE) revert InvalidGvkMode();
        _validateAdminViewKey(adminViewKey_);
        admin = admin_;
        token = IERC20Minimal(token_);
        verifier = IGroth16Verifier(verifier_);
        maximumDepositAmount = maximumDepositAmount_;
        kdfDomain = kdfDomain_;
        adminViewKeyX = adminViewKey_.x;
        adminViewKeyY = adminViewKey_.y;
        gvkMode = gvkMode_;
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
    /// the value as opaque, so each chain may use its own encoding.
    // TODO(SPEC): the Ethereum ext-data encoding is not fixed yet. This uses
    // keccak256(abi.encode(pool, token, recipient, extAmount, encryptedOutput0,
    // encryptedOutput1)) mod r. SPEC.md must also decide whether ExtData gets a
    // relayer fee field and whether block.chainid is bound in.
    function hashExtData(ExtData calldata ext) public view returns (bytes32) {
        bytes32 digest = keccak256(
            abi.encode(
                address(this), address(token), ext.recipient, ext.extAmount, ext.encryptedOutput0, ext.encryptedOutput1
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

    /// SPP's `i256_to_i128_nonneg`: SPP's token amounts are `i128`.
    // TODO(SPEC): kept at i128 so an amount valid on one chain is valid on the
    // other; revisit if SPEC.md fixes a different bound for bridged amounts.
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
    /// `extDataHash`.
    // TODO(SPEC): nonce = extDataHash with no uniqueness check, exactly as in
    // SPP (see SPP's comment in `internal_transact`). CLAUDE.md asks for a
    // unique nonce; the team decides, on both chains together.
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

        // Any verifier failure, revert or false, is reported as InvalidProof.
        try verifier.verify(proof.proof, inputs) returns (bool ok) {
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

    /// Calls the token and requires success plus a true (or empty) return.
    function _safeCall(bytes memory data) private {
        (bool ok, bytes memory ret) = address(token).call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || address(token).code.length == 0) {
            revert TokenTransferFailed();
        }
    }
}
