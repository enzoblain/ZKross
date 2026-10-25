// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/// @notice Groth16 verifier over BN254, shaped like SPP's
/// `CircomGroth16Verifier::verify(proof, public_inputs)`.
interface IGroth16Verifier {
    /// @param proof SPP's 256-byte `Groth16Proof` as eight words:
    /// `[A.x, A.y, B.x.c1, B.x.c0, B.y.c1, B.y.c0, C.x, C.y]`.
    /// @param publicInputs The circuit's public signals, in circuit order.
    /// @return True if the proof verifies. May revert on malformed input.
    function verify(uint256[8] calldata proof, uint256[] calldata publicInputs) external view returns (bool);
}
