// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;
import {Script} from "forge-std/Script.sol";
import {PrivateUsdcPool} from "../src/PrivateUsdcPool.sol";
import {PolicyTx22Verifier} from "../src/verifiers/PolicyTx22Verifier.sol";
import {SnarkjsVerifierAdapter} from "../src/verifiers/SnarkjsVerifierAdapter.sol";
/// Experimental Sepolia-only deployment. Sign with a local keystore/hardware wallet;
/// no key is read by this script and nothing is broadcast without forge --broadcast.
contract DeployPrivatePool is Script {
    address constant USDC=0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    function run() external returns(PrivateUsdcPool pool) {
        require(block.chainid==11155111,"Sepolia only");
        require(USDC.code.length!=0,"USDC contract absent");
        vm.startBroadcast();
        PolicyTx22Verifier target=new PolicyTx22Verifier();
        SnarkjsVerifierAdapter adapter=new SnarkjsVerifierAdapter(address(target),7);
        pool=new PrivateUsdcPool(USDC,address(adapter));
        vm.stopBroadcast();
        vm.serializeUint("privatePool","chainId",block.chainid);
        vm.serializeString("privatePool","circuit","policy_tx_2_2");
        vm.serializeAddress("privatePool","token",USDC);
        vm.serializeAddress("privatePool","verifierTarget",address(target));
        vm.serializeAddress("privatePool","verifierAdapter",address(adapter));
        vm.serializeBytes32("privatePool","verifierCodeHash",address(target).codehash);
        string memory json=vm.serializeAddress("privatePool","pool",address(pool));
        vm.createDir("deploy-out",true);
        vm.writeJson(json,"deploy-out/private-pool-sepolia.json");
    }
}
