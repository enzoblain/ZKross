// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IGroth16Verifier} from "../interfaces/IGroth16Verifier.sol";

/// @notice Exposes a snarkjs-generated verifier, whose
/// `verifyProof(uint[2], uint[2][2], uint[2], uint[N])` takes a fixed number of
/// public inputs, through `IGroth16Verifier`. The target and its size are fixed
/// at construction, so the verification key can never be swapped.
contract SnarkjsVerifierAdapter is IGroth16Verifier {
    address public immutable target;
    uint256 public immutable nPublic;
    bytes4 public immutable selector;

    error NotAContract();
    error WrongPublicInputCount();
    error VerifierCallFailed();

    constructor(address target_, uint256 nPublic_) {
        if (target_.code.length == 0) revert NotAContract();
        target = target_;
        nPublic = nPublic_;
        selector = bytes4(
            keccak256(
                abi.encodePacked(
                    "verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[", _toString(nPublic_), "])"
                )
            )
        );
    }

    /// The words of `proof` are already in snarkjs calldata order
    /// (`pA`, then `pB` with each Fq2 as [c1, c0], then `pC`), and fixed-size
    /// arrays are ABI-encoded inline, so the call data is just the selector
    /// followed by the proof and input words.
    function verify(uint256[8] calldata proof, uint256[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != nPublic) revert WrongPublicInputCount();
        (bool ok, bytes memory ret) = target.staticcall(abi.encodePacked(selector, proof, publicInputs));
        if (!ok || ret.length != 32) revert VerifierCallFailed();
        return abi.decode(ret, (bool));
    }

    function _toString(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        uint256 len;
        for (uint256 t = v; t != 0; t /= 10) len++;
        bytes memory b = new bytes(len);
        for (; v != 0; v /= 10) b[--len] = bytes1(uint8(48 + v % 10));
        return string(b);
    }
}
