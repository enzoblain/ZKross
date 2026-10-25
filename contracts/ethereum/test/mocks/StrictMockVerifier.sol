// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../../src/interfaces/IGroth16Verifier.sol";

/// Accepts a proof only if a test registered that exact proof together with
/// that exact public input vector. A pool that assembles its public inputs
/// wrongly (order, `D`, nonce, a tampered ciphertext) is therefore refused,
/// which keeps tests on the pool's input handling meaningful without real
/// proving keys.
contract StrictMockVerifier is IGroth16Verifier {
    mapping(bytes32 => bool) public accepted;
    uint256 public calls;

    function expect(uint256[8] calldata proof, uint256[] calldata publicInputs) external {
        accepted[keccak256(abi.encode(proof, publicInputs))] = true;
    }

    function verify(uint256[8] calldata proof, uint256[] calldata publicInputs) external view returns (bool) {
        return accepted[keccak256(abi.encode(proof, publicInputs))];
    }
}

/// Always reverts, like a verifier that traps on malformed input.
contract RevertingVerifier is IGroth16Verifier {
    function verify(uint256[8] calldata, uint256[] calldata) external pure returns (bool) {
        revert("verifier trapped");
    }
}
