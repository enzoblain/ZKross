// End-to-end on the live testnets with real proofs and Circle's USDC:
//   1. seed liquidity on both pools (2 USDC each)
//   2. alice deposits 3 USDC on Stellar
//   3. alice bridges 2 USDC to carol on Ethereum      (bridge_out, Stellar)
//   4. the root poster copies Stellar's outbox root to Sepolia
//   5. carol claims it on Sepolia                      (bridgeIn)
//   6. carol withdraws 1 USDC to a fresh Sepolia address
//   7. carol bridges 0.5 USDC back to bob on Stellar   (bridgeOut, Sepolia)
//   8. after Sepolia finality, the root poster copies Sepolia's root to Stellar
//   9. bob claims it on Stellar and withdraws 0.5 USDC to a fresh Stellar account
//  10. the admin's view: every note decrypted, both bridges linked
// Progress (including note secrets) is saved in deploy-out/e2e-state.json,
// so a failed run resumes where it stopped instead of spending faucet USDC
// again. Testnet only; keys from the git-ignored .env.
import fs from "node:fs";
import path from "node:path";
import { type Address, createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { REPO, SEPOLIA_CHAIN_ID, SEPOLIA_RPC, STELLAR_CHAIN_ID, deployments, links, need } from "../../services/bridge/src/lib/config.ts";
import * as eth from "../../services/bridge/src/lib/eth.ts";
import * as zk from "../../services/bridge/src/lib/prover.ts";
import * as st from "../../services/bridge/src/lib/stellar.ts";
import { postEthereumRoot, postStellarRoot } from "../../services/bridge/src/root-poster.ts";

const S = deployments.stellarTestnet.zkross;
const E = deployments.sepolia.zkross;
if (!E) throw new Error("deploy the Sepolia pool first (scripts/testnet/deploy-sepolia.sh)");
const STATE = path.join(REPO, "deploy-out/e2e-state.json");
const state: any = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { steps: {}, links: [] };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

const pub = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const acct = (k: string) => privateKeyToAccount(need(k) as `0x${string}`);
const deployer = acct("SEPOLIA_DEPLOYER_KEY");
const user = acct("SEPOLIA_USER_KEY");
const wallet = (a: ReturnType<typeof acct>) => createWalletClient({ account: a, chain: sepolia, transport: http(SEPOLIA_RPC) });
const GVK = need("ZKROSS_GVK_PRIV");
const D = zk.adminKey(GVK);
const USDC_SAC = deployments.stellarTestnet.usdc.sac as string;
const ETH_USDC = deployments.sepolia.usdc.address as Address;

function key(name: string): zk.Hex {
  state.keys ??= {};
  state.keys[name] ??= zk.randomField();
  save();
  return state.keys[name];
}

function check(cond: boolean, msg: string) {
  if (!cond) throw new Error(`CHECK FAILED: ${msg}`);
  console.log(`  ok: ${msg}`);
}

async function step(name: string, f: () => Promise<any>) {
  if (state.steps[name]) {
    console.log(`${name}: done earlier`);
    return state.steps[name];
  }
  console.log(`${name} ...`);
  const r = await f();
  state.steps[name] = r ?? true;
  save();
  return r;
}

function link(label: string, url: string) {
  console.log(`  ${label}: ${url}`);
  state.links.push({ label, url });
  save();
}

async function ethSend(a: ReturnType<typeof acct>, address: Address, abi: any, functionName: string, args: unknown[], label: string) {
  const hash = await wallet(a).writeContract({ address, abi, functionName, args } as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  link(label, links.sepoliaTx(hash));
  return r;
}

const ethView = (functionName: string, args: unknown[] = []) => pub.readContract({ address: E.pool, abi: eth.poolAbi, functionName, args } as any) as Promise<any>;
const stView = (fn: string, args: Record<string, unknown> = {}) => st.view(S.pool, fn, args);
const sHex = (s: string): zk.Hex => (s.startsWith("0x") ? (s as zk.Hex) : `0x${s}`);
const stHour = async () => BigInt(Math.floor(Date.now() / 1000 / 3600));
const dummy = () => ({ leaf_index: null, sk: zk.randomField(), amount: "0", blinding: zk.randomField() });
const salts = () => ({ in_salts: [zk.randomField(), zk.randomField()], out_salts: [zk.randomField(), zk.randomField()] });
const stellarLeaves = async () => st.noteLeaves(await st.events(S.pool, S.deployLedger));

async function stellarUsdc(addr: string): Promise<bigint> {
  const r = await fetch(`https://horizon-testnet.stellar.org/accounts/${addr}`).then((x) => x.json());
  const b = r.balances?.find((x: any) => x.asset_code === "USDC");
  return b ? BigInt(Math.round(Number(b.balance) * 1e7)) : 0n;
}

async function main() {
  // ---------- 0. Preflight ----------
  console.log("0. preflight");
  const need6 = 2_000_000n;
  check((await pub.readContract({ address: ETH_USDC, abi: eth.erc20Abi, functionName: "balanceOf", args: [deployer.address] })) >= need6 || !!state.steps.liquidity, "Sepolia deployer has 2 USDC for liquidity");
  check((await stellarUsdc(need("STELLAR_DEPLOYER_ADDRESS"))) >= 20_000_000n || !!state.steps.liquidity, "Stellar deployer has 2 USDC for liquidity");
  check((await stellarUsdc(need("STELLAR_ALICE_ADDRESS"))) >= 30_000_000n || !!state.steps.deposit, "alice has 3 USDC on Stellar");
  for (const a of [deployer, user, acct("SEPOLIA_POSTER_KEY")]) check((await pub.getBalance({ address: a.address })) > 0n, `${a.address} has Sepolia ETH`);

  // ---------- 1. Liquidity ----------
  await step("liquidity", async () => {
    await ethSend(deployer, ETH_USDC, eth.erc20Abi, "approve", [E.pool, need6], "Sepolia approve");
    await ethSend(deployer, E.pool, eth.poolAbi, "addLiquidity", [need6], "Sepolia addLiquidity 2 USDC");
    const { txHash } = st.invoke("zkross-deployer", S.pool, "add_liquidity", { amount: "20000000" });
    link("Stellar add_liquidity 2 USDC", links.stellarTx(txHash!));
  });

  // ---------- 2. Deposit on Stellar ----------
  const skA = key("alice");
  const pkA = zk.pubkey(skA);
  await step("deposit", async () => {
    const ext = { recipient: S.pool, ext_amount: "30000000", encrypted_output0: "01", encrypted_output1: "02" };
    const extHash = sHex(stView("hash_ext_data", { ext_data: ext }));
    const b0 = key("alice_note0");
    const built = zk.buildTransact({
      levels: 20, leaves: await stellarLeaves(), d: [D.x, D.y], ext_data_hash: extHash, public_amount: "30000000",
      inputs: [dummy(), dummy()],
      outputs: [{ pk: pkA, amount: "30000000", blinding: b0 }, { pk: pkA, amount: "0", blinding: key("alice_note1") }],
      ...salts(),
    });
    check(built.root === st.hex32(stView("get_root")), "off-chain root equals the Stellar pool's");
    const { txHash } = st.invoke("zkross-alice", S.pool, "transact", { proof: st.transactProof(zk.prove(built)), ext_data: ext, sender: need("STELLAR_ALICE_ADDRESS") });
    link("Stellar deposit 3 USDC (alice)", links.stellarTx(txHash!));
  });

  // ---------- 3. Bridge out Stellar -> Ethereum ----------
  const skC = key("carol");
  const s3 = await step("bridgeOutStellar", async () => {
    const leaves = await stellarLeaves();
    const mine = BigInt(zk.commitment("30000000", pkA, key("alice_note0")));
    const i0 = leaves.findIndex((l) => l !== undefined && BigInt(l) === mine);
    check(i0 >= 0, `alice's 3 USDC note is leaf ${i0}`);
    const ext = { encrypted_output0: "03", encrypted_output1: "04", encrypted_refund: "05", encrypted_bridge_message: "06" };
    const deadline = (await stHour()) + 6n;
    const secret = key("claim1");
    const built = zk.buildBridgeOut({
      levels: 20, leaves, d: [D.x, D.y], ext_data_hash: sHex(stView("hash_bridge_out_ext_data", { ext_data: ext })),
      inputs: [
        { leaf_index: i0, sk: skA, amount: "30000000", blinding: key("alice_note0") },
        { leaf_index: i0 + 1, sk: skA, amount: "0", blinding: key("alice_note1") },
      ],
      outputs: [{ pk: pkA, amount: "10000000", blinding: key("alice_change0") }, { pk: pkA, amount: "0", blinding: key("alice_change1") }],
      ...salts(),
      amount: "2000000", scale: "10", asset_id: "1", src_chain: STELLAR_CHAIN_ID.toString(), dst_chain: SEPOLIA_CHAIN_ID.toString(),
      deadline_bucket: deadline.toString(), recipient_pk: zk.pubkey(skC), claim_secret: secret,
      refund_pk: pkA, refund_blinding: key("alice_refund"), refund_salt: zk.randomField(), bridge_salt: zk.randomField(),
    });
    const { txHash } = st.invoke("zkross-alice", S.pool, "bridge_out", { proof: st.bridgeOutProof(zk.prove(built)), ext_data: ext, sender: need("STELLAR_ALICE_ADDRESS") });
    link("Stellar bridge_out 2 USDC (alice -> carol)", links.stellarTx(txHash!));
    return { c: built.bridge_message, deadline: deadline.toString(), claimNullifier: built.claim_nullifier };
  });

  // ---------- 4. Root Stellar -> Sepolia ----------
  await step("postStellarRoot", async () => {
    const p = await postStellarRoot();
    if (p) link("root poster: Stellar root -> Sepolia", p.tx);
    check(await ethView("isKnownRemoteRoot", [BigInt(st.view(S.pool, "get_outbox_root"))]), "Sepolia knows Stellar's outbox root");
  });

  // ---------- 5. Claim on Sepolia ----------
  await step("bridgeInSepolia", async () => {
    const remote = st.outboxLeaves(await st.events(S.pool, S.deployLedger));
    const index = remote.findIndex((l) => l !== undefined && BigInt(l) === BigInt(s3.c));
    const ext = { encryptedOutput0: "0x07", encryptedOutput1: "0x08" };
    const built = zk.buildBridgeIn({
      levels: 20, outbox_leaves: remote, index, d: [D.x, D.y], ext_data_hash: await ethView("hashBridgeInExtData", [ext]),
      amount: "2000000", scale: "1", asset_id: "1", src_chain: STELLAR_CHAIN_ID.toString(), dst_chain: SEPOLIA_CHAIN_ID.toString(),
      deadline_bucket: s3.deadline, recipient_sk: skC, claim_secret: key("claim1"),
      outputs: [{ amount: "1500000", blinding: key("carol_note0") }, { amount: "500000", blinding: key("carol_note1") }],
      out_salts: [zk.randomField(), zk.randomField()],
    });
    const r = await ethSend(user, E.pool, eth.poolAbi, "bridgeIn", [eth.bridgeInProof(zk.prove(built)), ext], "Sepolia bridgeIn 2 USDC (carol)");
    const ev = parseEventLogs({ abi: eth.poolAbi, logs: r.logs, eventName: "NewCommitment" }) as any[];
    check(await ethView("isClaimed", [BigInt(built.claim_nullifier)]), "the claim nullifier is spent on Sepolia");
    return { leaf0: Number(ev[0].args.index), leaf1: Number(ev[1].args.index) };
  });

  // ---------- 6. Withdraw to a fresh Sepolia address ----------
  await step("withdrawSepolia", async () => {
    const fresh = (state.freshEth ??= privateKeyToAccount(zk.randomField()).address);
    save();
    const ext = { recipient: fresh, extAmount: -1_000_000n, encryptedOutput0: "0x09", encryptedOutput1: "0x0a" };
    const leaf0 = state.steps.bridgeInSepolia.leaf0;
    const built = zk.buildTransact({
      levels: 20, leaves: await eth.noteLeaves(pub as any, E.pool, BigInt(E.deployBlock)), d: [D.x, D.y],
      ext_data_hash: await ethView("hashExtData", [ext]), public_amount: zk.hex32(zk.R - 1_000_000n),
      inputs: [{ leaf_index: leaf0, sk: skC, amount: "1500000", blinding: key("carol_note0") }, dummy()],
      outputs: [{ pk: zk.pubkey(skC), amount: "500000", blinding: key("carol_change") }, { pk: zk.pubkey(skC), amount: "0", blinding: zk.randomField() }],
      ...salts(),
    });
    const r = await ethSend(user, E.pool, eth.poolAbi, "transact", [eth.transactProof(zk.prove(built)), ext], "Sepolia withdraw 1 USDC to a fresh address");
    const ev = parseEventLogs({ abi: eth.poolAbi, logs: r.logs, eventName: "NewCommitment" }) as any[];
    const bal = await pub.readContract({ address: ETH_USDC, abi: eth.erc20Abi, functionName: "balanceOf", args: [fresh] });
    check(bal === 1_000_000n, `fresh address ${fresh} received exactly 1 USDC`);
    return { change: Number(ev[0].args.index) };
  });

  // ---------- 7. Bridge back Ethereum -> Stellar ----------
  const skB = key("bob");
  const s7 = await step("bridgeOutSepolia", async () => {
    const ext = { encryptedOutput0: "0x0b", encryptedOutput1: "0x0c", encryptedRefund: "0x0d", encryptedBridgeMessage: "0x0e" };
    const deadline = (await stHour()) + 6n;
    const built = zk.buildBridgeOut({
      levels: 20, leaves: await eth.noteLeaves(pub as any, E.pool, BigInt(E.deployBlock)), d: [D.x, D.y],
      ext_data_hash: await ethView("hashBridgeOutExtData", [ext]),
      inputs: [
        { leaf_index: state.steps.bridgeInSepolia.leaf1, sk: skC, amount: "500000", blinding: key("carol_note1") },
        { leaf_index: state.steps.withdrawSepolia.change, sk: skC, amount: "500000", blinding: key("carol_change") },
      ],
      outputs: [{ pk: zk.pubkey(skC), amount: "500000", blinding: key("carol_change2") }, { pk: zk.pubkey(skC), amount: "0", blinding: zk.randomField() }],
      ...salts(),
      amount: "500000", scale: "1", asset_id: "1", src_chain: SEPOLIA_CHAIN_ID.toString(), dst_chain: STELLAR_CHAIN_ID.toString(),
      deadline_bucket: deadline.toString(), recipient_pk: zk.pubkey(skB), claim_secret: key("claim2"),
      refund_pk: zk.pubkey(skC), refund_blinding: key("carol_refund"), refund_salt: zk.randomField(), bridge_salt: zk.randomField(),
    });
    const r = await ethSend(user, E.pool, eth.poolAbi, "bridgeOut", [eth.bridgeOutProof(zk.prove(built)), ext], "Sepolia bridgeOut 0.5 USDC (carol -> bob)");
    return { c: built.bridge_message, deadline: deadline.toString(), block: r.blockNumber.toString(), claimNullifier: built.claim_nullifier };
  });

  // ---------- 8. Root Sepolia -> Stellar (after finality) ----------
  await step("postEthereumRoot", async () => {
    console.log("  waiting for Sepolia finality (about 15 minutes) ...");
    for (;;) {
      const fin = await pub.getBlock({ blockTag: "finalized" });
      if (fin.number >= BigInt(s7.block)) break;
      await new Promise((r) => setTimeout(r, 30_000));
    }
    const p = await postEthereumRoot();
    if (p) link("root poster: Sepolia root -> Stellar", p.tx);
    check(stView("is_known_remote_root", { root: (await ethView("getOutboxRoot")).toString() }) === true, "Stellar knows Sepolia's outbox root");
  });

  // ---------- 9. Claim on Stellar and withdraw ----------
  await step("bridgeInStellar", async () => {
    const remote = await eth.outboxLeaves(pub as any, E.pool, BigInt(E.deployBlock));
    const index = remote.findIndex((l) => l !== undefined && BigInt(l) === BigInt(s7.c));
    const ext = { encrypted_output0: "0f", encrypted_output1: "10" };
    const built = zk.buildBridgeIn({
      levels: 20, outbox_leaves: remote, index, d: [D.x, D.y], ext_data_hash: sHex(stView("hash_bridge_in_ext_data", { ext_data: ext })),
      amount: "500000", scale: "10", asset_id: "1", src_chain: SEPOLIA_CHAIN_ID.toString(), dst_chain: STELLAR_CHAIN_ID.toString(),
      deadline_bucket: s7.deadline, recipient_sk: skB, claim_secret: key("claim2"),
      outputs: [{ amount: "5000000", blinding: key("bob_note0") }, { amount: "0", blinding: key("bob_note1") }],
      out_salts: [zk.randomField(), zk.randomField()],
    });
    const { txHash } = st.invoke("zkross-bob", S.pool, "bridge_in", { proof: st.bridgeInProof(zk.prove(built)), ext_data: ext, sender: need("STELLAR_BOB_ADDRESS") });
    link("Stellar bridge_in 0.5 USDC = 5 000 000 stroops (bob)", links.stellarTx(txHash!));
    check(stView("is_claimed", { claim_nullifier: BigInt(built.claim_nullifier).toString() }) === true, "the claim nullifier is spent on Stellar");
    const leaves = await stellarLeaves();
    return { leaf0: leaves.findIndex((l) => l !== undefined && BigInt(l) === BigInt(built.commitments[0])) };
  });

  await step("withdrawStellar", async () => {
    const fresh = need("STELLAR_FRESH_ADDRESS");
    const before = await stellarUsdc(fresh);
    const ext = { recipient: fresh, ext_amount: "-5000000", encrypted_output0: "11", encrypted_output1: "12" };
    const built = zk.buildTransact({
      levels: 20, leaves: await stellarLeaves(), d: [D.x, D.y], ext_data_hash: sHex(stView("hash_ext_data", { ext_data: ext })),
      public_amount: zk.hex32(zk.R - 5_000_000n),
      inputs: [{ leaf_index: state.steps.bridgeInStellar.leaf0, sk: skB, amount: "5000000", blinding: key("bob_note0") }, dummy()],
      outputs: [{ pk: zk.pubkey(skB), amount: "0", blinding: zk.randomField() }, { pk: zk.pubkey(skB), amount: "0", blinding: zk.randomField() }],
      ...salts(),
    });
    const { txHash } = st.invoke("zkross-bob", S.pool, "transact", { proof: st.transactProof(zk.prove(built)), ext_data: ext, sender: need("STELLAR_BOB_ADDRESS") });
    link("Stellar withdraw 0.5 USDC to a fresh account", links.stellarTx(txHash!));
    check((await stellarUsdc(fresh)) - before === 5_000_000n, `fresh Stellar account ${fresh} received exactly 0.5 USDC`);
  });

  // ---------- 10. Admin view ----------
  console.log("10. admin view (decrypted with the Global View Key)");
  const sev = await st.events(S.pool, S.deployLedger);
  const ctS = (c: any) => ({ r: { x: st.hex32(c.r.x), y: st.hex32(c.r.y) }, c1: st.hex32(c.c1), c2: st.hex32(c.c2), c3: st.hex32(c.c3) });
  const sNotes = sev.filter((e) => e.name === "new_commitment_event" && BigInt(e.data.gvk_ciphertext.r.x) !== 0n);
  for (const [i, n] of zk.decrypt(GVK, sNotes.map((e) => ctS(e.data.gvk_ciphertext))).notes.entries())
    check(BigInt(n.commitment) === BigInt(sNotes[i].topics[1]), `Stellar note ${sNotes[i].data.index}: ${n.amount} stroops`);
  const elogs = parseEventLogs({ abi: eth.poolAbi, logs: await pub.getLogs({ address: E.pool, fromBlock: BigInt(E.deployBlock) }) }) as any[];
  const eNotes = elogs.filter((l) => l.eventName === "NewCommitment" && BigInt(l.args.gvkCiphertext.r.x) !== 0n);
  for (const [i, n] of zk.decrypt(GVK, eNotes.map((l) => ctS(l.args.gvkCiphertext))).notes.entries())
    check(BigInt(n.commitment) === BigInt(eNotes[i].args.commitment), `Sepolia note ${eNotes[i].args.index}: ${n.amount} units`);
  const [m1] = zk.decrypt(GVK, [ctS(sev.find((e) => e.name === "bridge_out_event")!.data.bridge_ciphertext)]).notes;
  const link1 = zk.bridgeMessage({ amount: m1.amount, asset_id: "1", src_chain: STELLAR_CHAIN_ID.toString(), dst_chain: SEPOLIA_CHAIN_ID.toString(), recipient_pk: m1.pk, claim_secret: m1.blinding, deadline_bucket: s3.deadline });
  check(elogs.some((l) => l.eventName === "BridgeIn" && BigInt(l.args.claimNullifier) === BigInt(link1.claim_nullifier)), `admin links Stellar bridge_out (${m1.amount} units) to its Sepolia bridgeIn`);
  const [m2] = zk.decrypt(GVK, [ctS(elogs.find((l) => l.eventName === "BridgeOut").args.bridgeCiphertext)]).notes;
  const link2 = zk.bridgeMessage({ amount: m2.amount, asset_id: "1", src_chain: SEPOLIA_CHAIN_ID.toString(), dst_chain: STELLAR_CHAIN_ID.toString(), recipient_pk: m2.pk, claim_secret: m2.blinding, deadline_bucket: s7.deadline });
  check(sev.some((e) => e.name === "bridge_in_event" && BigInt(e.topics[1]) === BigInt(link2.claim_nullifier)), `admin links Sepolia bridgeOut (${m2.amount} units) to its Stellar bridge_in`);

  console.log("\nAll transactions:");
  for (const l of state.links) console.log(`  ${l.label}: ${l.url}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
