// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ShieldedPool} from "../src/ShieldedPool.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {IGroth16Verifier} from "../src/interfaces/IGroth16Verifier.sol";
import {SnarkjsVerifierAdapter} from "../src/verifiers/SnarkjsVerifierAdapter.sol";
import {PolicyTx22GvkTVerifier} from "../src/verifiers/PolicyTx22GvkTVerifier.sol";
import {BridgeOutVerifier} from "../src/verifiers/BridgeOutVerifier.sol";
import {BridgeInVerifier} from "../src/verifiers/BridgeInVerifier.sol";

/// Deploys the three verifiers (behind adapters) and a traceable, open-policy
/// ShieldedPool, then writes the addresses to deploy-out/<chainid>.json.
///
/// Testnet and local only: refuses any chain but anvil (31337) and Sepolia
/// (11155111). On anvil without ZKROSS_TOKEN it deploys MockUSDC; on Sepolia
/// ZKROSS_TOKEN must be Circle's USDC.
///
/// Env: ZKROSS_TOKEN, ZKROSS_GVK_X, ZKROSS_GVK_Y, ZKROSS_ROOT_POSTER,
/// ZKROSS_ATTESTER, ZKROSS_ADMIN (default: sender), ZKROSS_REMOTE_CHAIN_ID
/// (default: Stellar testnet), ZKROSS_MAX_DEPOSIT (default 10 USDC),
/// ZKROSS_LEVELS (default 20).
contract Deploy is Script {
    uint256 constant STELLAR_TESTNET = 33353711811639397682;
    address constant SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function run() external {
        require(block.chainid == 31337 || block.chainid == 11155111, "testnet only: anvil or Sepolia");

        address token = vm.envOr("ZKROSS_TOKEN", address(0));
        if (block.chainid == 11155111) require(token == SEPOLIA_USDC, "Sepolia must use Circle's USDC");

        vm.startBroadcast();
        address sender = msg.sender;
        if (token == address(0)) {
            require(block.chainid == 31337, "MockUSDC is for local runs only");
            token = address(new MockUSDC());
        }

        IGroth16Verifier transactVerifier = new SnarkjsVerifierAdapter(address(new PolicyTx22GvkTVerifier()), 30);
        IGroth16Verifier outVerifier = new SnarkjsVerifierAdapter(address(new BridgeOutVerifier()), 46);
        IGroth16Verifier inVerifier = new SnarkjsVerifierAdapter(address(new BridgeInVerifier()), 23);

        ShieldedPool pool = new ShieldedPool(
            vm.envOr("ZKROSS_ADMIN", sender),
            token,
            address(transactVerifier),
            vm.envOr("ZKROSS_MAX_DEPOSIT", uint256(10_000_000)),
            uint32(vm.envOr("ZKROSS_LEVELS", uint256(20))),
            "zkross",
            ShieldedPool.BabyJubJubPoint(vm.envUint("ZKROSS_GVK_X"), vm.envUint("ZKROSS_GVK_Y")),
            2, // TRACEABLE
            ShieldedPool.BridgeConfig({
                rootPoster: vm.envAddress("ZKROSS_ROOT_POSTER"),
                attester: vm.envAddress("ZKROSS_ATTESTER"),
                remoteChainId: vm.envOr("ZKROSS_REMOTE_CHAIN_ID", STELLAR_TESTNET),
                assetId: 1,
                bridgeOutVerifier: outVerifier,
                bridgeInVerifier: inVerifier
            })
        );
        vm.stopBroadcast();

        string memory k = "deploy";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "token", token);
        vm.serializeAddress(k, "transactVerifier", address(transactVerifier));
        vm.serializeAddress(k, "bridgeOutVerifier", address(outVerifier));
        vm.serializeAddress(k, "bridgeInVerifier", address(inVerifier));
        string memory json = vm.serializeAddress(k, "pool", address(pool));
        vm.createDir("deploy-out", true);
        string memory path = string.concat("deploy-out/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("pool", address(pool));
        console.log("wrote", path);
    }
}
