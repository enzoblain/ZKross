// The full Ethereum flow on a local anvil, with real Groth16 proofs:
// deposit, bridge out, claim a message from a (simulated) Stellar outbox,
// withdraw to a fresh address, refund an unclaimed message, and the admin's
// view. Local only: anvil's built-in, publicly known test accounts; MockUSDC.
//
// Prerequisites (scripts/e2e/README.md): anvil on 127.0.0.1:8545, forge build,
// zkross-prover built, circuits collected (scripts/build/collect-circuits.sh).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  type Address,
  type Hex as VHex,
  createPublicClient,
  createWalletClient,
  decodeErrorResult,
  http,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { foundry } from "viem/chains";
import { REPO, bridgeInProof, bridgeOutProof, erc20Abi, noteLeaves, poolAbi, transactProof } from "./lib/eth.ts";
import * as zk from "./lib/prover.ts";

const RPC = "http://127.0.0.1:8545";
const KEYS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // admin / deployer
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // root poster
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // attester
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // alice
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // carol
] as const;
const [admin, poster, attester, alice, carol] = KEYS.map((k) => privateKeyToAccount(k));
const STELLAR_TESTNET = 33353711811639397682n;
const USDC = 1_000_000n;
const D_PRIV = "0x5eed"; // test-only admin view key scalar (SPP's own test value)

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (acct: typeof admin) => createWalletClient({ account: acct, chain: foundry, transport: http(RPC) });

function check(cond: boolean, msg: string) {
  if (!cond) throw new Error(`CHECK FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function send(acct: typeof admin, address: Address, abi: any, functionName: string, args: unknown[]) {
  const hash = await wallet(acct).writeContract({ address, abi, functionName, args } as any);
  const rcpt = await pub.waitForTransactionReceipt({ hash });
  if (rcpt.status !== "success") throw new Error(`${functionName} reverted (${hash})`);
  console.log(`  tx ${functionName}: ${hash} (gas ${rcpt.gasUsed})`);
  return rcpt;
}

async function expectRevert(acct: typeof admin, address: Address, functionName: string, args: unknown[], error: string) {
  try {
    await pub.simulateContract({ account: acct, address, abi: poolAbi, functionName, args } as any);
  } catch (e: any) {
    const data: VHex | undefined = e?.cause?.data ?? e?.data ?? e?.cause?.cause?.data;
    const name = e?.cause?.data?.errorName ?? (data ? decodeErrorResult({ abi: poolAbi, data }).errorName : String(e));
    check(name === error, `${functionName} refused with ${error}`);
    return;
  }
  throw new Error(`${functionName} did not revert`);
}

const hour = async () => (await pub.getBlock()).timestamp / 3600n;

async function main() {
  // ---------- Deploy ----------
  const d = zk.adminKey(D_PRIV);
  console.log("deploy (forge script, local anvil)");
  execFileSync(
    "forge",
    ["script", "script/Deploy.s.sol:Deploy", "--rpc-url", RPC, "--private-key", KEYS[0], "--broadcast", "--silent"],
    {
      cwd: path.join(REPO, "contracts/ethereum"),
      stdio: "inherit",
      env: { ...process.env, ZKROSS_GVK_X: d.x, ZKROSS_GVK_Y: d.y, ZKROSS_ROOT_POSTER: poster.address, ZKROSS_ATTESTER: attester.address },
    }
  );
  const dep = JSON.parse(fs.readFileSync(path.join(REPO, "contracts/ethereum/deploy-out/31337.json"), "utf8"));
  const pool = dep.pool as Address;
  const token = dep.token as Address;
  const from = BigInt(dep.deployBlock);
  const chainId = BigInt(await pub.getChainId());
  console.log(`  pool ${pool}, token ${token}`);
  const view = (functionName: string, args: unknown[] = []) => pub.readContract({ address: pool, abi: poolAbi, functionName, args } as any) as Promise<any>;
  const balance = (who: Address) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

  await send(admin, token, erc20Abi, "mint", [alice.address, 10n * USDC]);
  await send(admin, token, erc20Abi, "mint", [admin.address, 2n * USDC]);

  // ---------- 1. Liquidity ----------
  console.log("1. admin adds 2 USDC of liquidity");
  await send(admin, token, erc20Abi, "approve", [pool, 2n * USDC]);
  await send(admin, pool, poolAbi, "addLiquidity", [2n * USDC]);

  // ---------- 2. Deposit ----------
  console.log("2. alice deposits 5 USDC");
  const skA = zk.randomField();
  const pkA = zk.pubkey(skA);
  const notesA: { leaf: number; amount: bigint; blinding: zk.Hex }[] = [];
  {
    const ext = { recipient: alice.address, extAmount: 5n * USDC, encryptedOutput0: "0x01", encryptedOutput1: "0x02" };
    const extHash = await view("hashExtData", [ext]);
    const leaves = await noteLeaves(pub, pool, from);
    const [b0, b1] = [zk.randomField(), zk.randomField()];
    const built = zk.buildTransact({
      levels: 20,
      leaves,
      d: [d.x, d.y],
      ext_data_hash: extHash,
      public_amount: (5n * USDC).toString(),
      inputs: [0, 1].map(() => ({ leaf_index: null, sk: zk.randomField(), amount: "0", blinding: zk.randomField() })),
      outputs: [
        { pk: pkA, amount: (5n * USDC).toString(), blinding: b0 },
        { pk: pkA, amount: "0", blinding: b1 },
      ],
      in_salts: [zk.randomField(), zk.randomField()],
      out_salts: [zk.randomField(), zk.randomField()],
    });
    check(built.root === zk.hex32(await view("getRoot")), "off-chain tree root equals the pool's root");
    const proved = zk.prove(built);
    await send(alice, token, erc20Abi, "approve", [pool, 5n * USDC]);
    await send(alice, pool, poolAbi, "transact", [transactProof(proved), ext]);
    notesA.push({ leaf: 0, amount: 5n * USDC, blinding: b0 }, { leaf: 1, amount: 0n, blinding: b1 });
  }

  // ---------- 3. Bridge out to Bob on Stellar ----------
  console.log("3. alice bridges 3 USDC to bob on Stellar");
  const skB = zk.randomField();
  const deadline = (await hour()) + 24n;
  const refundBlinding = zk.randomField();
  let bridgeC: bigint;
  {
    const ext = { encryptedOutput0: "0x03", encryptedOutput1: "0x04", encryptedRefund: "0x05", encryptedBridgeMessage: "0x06" };
    const extHash = await view("hashBridgeOutExtData", [ext]);
    const [c0, c1] = [zk.randomField(), zk.randomField()];
    const built = zk.buildBridgeOut({
      levels: 20,
      leaves: await noteLeaves(pub, pool, from),
      d: [d.x, d.y],
      ext_data_hash: extHash,
      inputs: notesA.map((n) => ({ leaf_index: n.leaf, sk: skA, amount: n.amount.toString(), blinding: n.blinding })),
      outputs: [
        { pk: pkA, amount: (2n * USDC).toString(), blinding: c0 },
        { pk: pkA, amount: "0", blinding: c1 },
      ],
      in_salts: [zk.randomField(), zk.randomField()],
      out_salts: [zk.randomField(), zk.randomField()],
      amount: (3n * USDC).toString(),
      scale: "1",
      asset_id: "1",
      src_chain: chainId.toString(),
      dst_chain: STELLAR_TESTNET.toString(),
      deadline_bucket: deadline.toString(),
      recipient_pk: zk.pubkey(skB),
      claim_secret: zk.randomField(),
      refund_pk: pkA,
      refund_blinding: refundBlinding,
      refund_salt: zk.randomField(),
      bridge_salt: zk.randomField(),
    });
    const proved = zk.prove(built);
    await send(alice, pool, poolAbi, "bridgeOut", [bridgeOutProof(proved), ext]);
    bridgeC = BigInt(built.bridge_message);
    check((await view("getPendingMessage", [bridgeC])).status === 1, "the message is pending");
    check(zk.hex32(await view("getOutboxRoot")) === zk.treeRoot(20, [built.bridge_message, zk.hex32(0n)]), "outbox root is the tree of (C, 0)");
    notesA.length = 0;
    notesA.push({ leaf: 2, amount: 2n * USDC, blinding: c0 });
  }

  // ---------- 4. Claim a message from Stellar ----------
  console.log("4. carol claims 1.5 USDC sent to her from Stellar (simulated remote outbox)");
  const skC = zk.randomField();
  const notesC: { leaf: number; amount: bigint; blinding: zk.Hex }[] = [];
  {
    const secret = zk.randomField();
    const msg = {
      amount: (1_500_000n).toString(),
      asset_id: "1",
      src_chain: STELLAR_TESTNET.toString(),
      dst_chain: chainId.toString(),
      recipient_pk: zk.pubkey(skC),
      claim_secret: secret,
      deadline_bucket: deadline.toString(),
    };
    const { bridge_message } = zk.bridgeMessage(msg);
    const remoteLeaves = [bridge_message, zk.hex32(0n)];
    await send(poster, pool, poolAbi, "postRemoteRoot", [BigInt(zk.treeRoot(20, remoteLeaves))]);
    const ext = { encryptedOutput0: "0x07", encryptedOutput1: "0x08" };
    const [o0, o1] = [zk.randomField(), zk.randomField()];
    const built = zk.buildBridgeIn({
      levels: 20,
      outbox_leaves: remoteLeaves,
      index: 0,
      d: [d.x, d.y],
      ext_data_hash: await view("hashBridgeInExtData", [ext]),
      amount: msg.amount,
      scale: "1",
      asset_id: "1",
      src_chain: msg.src_chain,
      dst_chain: msg.dst_chain,
      deadline_bucket: msg.deadline_bucket,
      recipient_sk: skC,
      claim_secret: secret,
      outputs: [
        { amount: "1000000", blinding: o0 },
        { amount: "500000", blinding: o1 },
      ],
      out_salts: [zk.randomField(), zk.randomField()],
    });
    const proved = zk.prove(built);
    const args = [bridgeInProof(proved), ext];
    await send(carol, pool, poolAbi, "bridgeIn", args);
    check(await view("isClaimed", [BigInt(built.claim_nullifier)]), "the claim nullifier is spent");
    await expectRevert(carol, pool, "bridgeIn", args, "AlreadyClaimed");
    notesC.push({ leaf: 4, amount: 1_000_000n, blinding: o0 }, { leaf: 5, amount: 500_000n, blinding: o1 });
  }

  // ---------- 5. Withdraw to a fresh address ----------
  console.log("5. carol withdraws 1 USDC to a fresh address");
  const fresh = privateKeyToAccount(zk.randomField()).address;
  {
    const ext = { recipient: fresh, extAmount: -1n * USDC, encryptedOutput0: "0x09", encryptedOutput1: "0x0a" };
    const built = zk.buildTransact({
      levels: 20,
      leaves: await noteLeaves(pub, pool, from),
      d: [d.x, d.y],
      ext_data_hash: await view("hashExtData", [ext]),
      public_amount: zk.hex32(zk.R - USDC),
      inputs: notesC.map((n) => ({ leaf_index: n.leaf, sk: skC, amount: n.amount.toString(), blinding: n.blinding })),
      outputs: [
        { pk: zk.pubkey(skC), amount: "500000", blinding: zk.randomField() },
        { pk: zk.pubkey(skC), amount: "0", blinding: zk.randomField() },
      ],
      in_salts: [zk.randomField(), zk.randomField()],
      out_salts: [zk.randomField(), zk.randomField()],
    });
    await send(carol, pool, poolAbi, "transact", [transactProof(zk.prove(built)), ext]);
    check((await balance(fresh)) === USDC, "the fresh address received exactly 1 USDC");
  }

  // ---------- 6. Refund the unclaimed message ----------
  console.log("6. bob never claims: after deadline + 1 h the attester signs and alice is refunded");
  {
    const settleAt = deadline * 3600n + 3600n;
    await pub.request({ method: "evm_setNextBlockTimestamp" as any, params: [`0x${settleAt.toString(16)}`] as any });
    await pub.request({ method: "evm_mine" as any, params: [] as any });
    const digest = await view("attestationDigest", [bridgeC, 1]);
    const sig = await sign({ hash: digest, privateKey: KEYS[2], to: "hex" });
    const rcpt = await send(admin, pool, poolAbi, "refund", [bridgeC, sig]);
    const ev = parseEventLogs({ abi: poolAbi, logs: rcpt.logs, eventName: "BridgeRefunded" })[0] as any;
    const refundLeaf = Number(ev.args.index);
    check((await view("getPendingMessage", [bridgeC])).status === 3, "the message is refunded");

    // Alice spends the refund note and her change: withdraws 5 USDC.
    const ext = { recipient: alice.address, extAmount: -5n * USDC, encryptedOutput0: "0x0b", encryptedOutput1: "0x0c" };
    const built = zk.buildTransact({
      levels: 20,
      leaves: await noteLeaves(pub, pool, from),
      d: [d.x, d.y],
      ext_data_hash: await view("hashExtData", [ext]),
      public_amount: zk.hex32(zk.R - 5n * USDC),
      inputs: [
        { leaf_index: refundLeaf, sk: skA, amount: (3n * USDC).toString(), blinding: refundBlinding },
        { leaf_index: notesA[0].leaf, sk: skA, amount: notesA[0].amount.toString(), blinding: notesA[0].blinding },
      ],
      outputs: [
        { pk: pkA, amount: "0", blinding: zk.randomField() },
        { pk: pkA, amount: "0", blinding: zk.randomField() },
      ],
      in_salts: [zk.randomField(), zk.randomField()],
      out_salts: [zk.randomField(), zk.randomField()],
    });
    await send(alice, pool, poolAbi, "transact", [transactProof(zk.prove(built)), ext]);
    check((await balance(alice.address)) === 10n * USDC, "alice has her 10 USDC back");
  }

  // ---------- 7. Admin view ----------
  console.log("7. the admin decrypts every note and the bridge message");
  {
    const logs = await pub.getLogs({ address: pool, fromBlock: from });
    const parsed = parseEventLogs({ abi: poolAbi, logs }) as any[];
    const commitments = parsed.filter((l) => l.eventName === "NewCommitment" && BigInt(l.args.gvkCiphertext.r.x) !== 0n);
    const cts = commitments.map((l) => ({
      r: { x: zk.hex32(l.args.gvkCiphertext.r.x), y: zk.hex32(l.args.gvkCiphertext.r.y) },
      c1: zk.hex32(l.args.gvkCiphertext.c1),
      c2: zk.hex32(l.args.gvkCiphertext.c2),
      c3: zk.hex32(l.args.gvkCiphertext.c3),
    }));
    const notes = zk.decrypt(D_PRIV, cts).notes;
    notes.forEach((n, i) => check(BigInt(n.commitment) === BigInt(commitments[i].args.commitment), `note ${commitments[i].args.index}: ${n.amount} units, decrypted commitment matches`));
    const bo = parsed.find((l) => l.eventName === "BridgeOut");
    const [msg] = zk.decrypt(D_PRIV, [
      { r: { x: zk.hex32(bo.args.bridgeCiphertext.r.x), y: zk.hex32(bo.args.bridgeCiphertext.r.y) }, c1: zk.hex32(bo.args.bridgeCiphertext.c1), c2: zk.hex32(bo.args.bridgeCiphertext.c2), c3: zk.hex32(bo.args.bridgeCiphertext.c3) },
    ]).notes;
    check(BigInt(msg.amount) === 3n * USDC && msg.pk === zk.pubkey(skB), "bridge message: 3 USDC to bob's key (the admin also learns the claim secret)");
  }

  const poolBal = await balance(pool);
  check(poolBal === 1n * USDC, `pool holds 2 + 5 - 1 - 5 = 1 USDC (has ${poolBal})`);
  console.log("\nEthereum local flow: all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
