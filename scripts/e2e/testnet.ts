// End-to-end on the live testnets with real proofs and Circle's USDC:
//   1. seed 20 USDC of liquidity in each pool
//   2. Stellar -> Ethereum: alice deposits 4 USDC on Stellar, bridges 2 then
//      1 USDC to carol; the root poster copies Stellar's outbox root to
//      Sepolia; carol claims both and withdraws each to a fresh Sepolia address
//   3. Ethereum -> Stellar: dave deposits 4 USDC on Sepolia, bridges 2 then
//      1 USDC to bob; after Sepolia finality the root poster copies Sepolia's
//      root to Stellar; bob claims both and withdraws them to a fresh account
//   4. the admin's view: every note, refund note and bridge message on both
//      chains decrypted with the Global View Key, and every bridge_out linked
//      to its bridge_in
// With --relayer: 1 USDC each way, bridge outs, claims and withdrawals (0.5
// USDC to a fresh address) go through the relayer (services/bridge), and each
// of them is checked on-chain to come from the relayer's account, never a
// user's. Liquidity is not added again.
// The root poster (and with --relayer the relayer) must run alongside
// (npm run service in services/bridge); the script waits for it. Progress
// (including note secrets) is saved in deploy-out/e2e-state.json (or
// e2e-relayer-state.json), so a failed run resumes where it stopped instead
// of spending faucet USDC again. Testnet only; keys from the git-ignored .env.
import fs from "node:fs";
import path from "node:path";
import { Asset, BASE_FEE, Horizon, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { type Address, createPublicClient, createWalletClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { REPO, SEPOLIA_CHAIN_ID, SEPOLIA_RPC, STELLAR_CHAIN_ID, deployments, links, need } from "../../services/bridge/src/lib/config.ts";
import * as eth from "../../services/bridge/src/lib/eth.ts";
import * as zk from "../../services/bridge/src/lib/prover.ts";
import * as st from "../../services/bridge/src/lib/stellar.ts";

const S = deployments.stellarTestnet.zkross;
const E = deployments.sepolia.zkross;
if (!E) throw new Error("deploy the Sepolia pool first (scripts/testnet/deploy-sepolia.sh)");
const RELAYER = process.argv.includes("--relayer");
const RELAYER_URL = process.env.ZKROSS_RELAYER_URL ?? "http://127.0.0.1:8788";
const STATE = path.join(REPO, RELAYER ? "deploy-out/e2e-relayer-state.json" : "deploy-out/e2e-state.json");
fs.mkdirSync(path.dirname(STATE), { recursive: true });
const state: any = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : { steps: {}, links: [] };
const save = () => fs.writeFileSync(STATE, JSON.stringify(state, null, 2));

const pub = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const acct = (k: string) => privateKeyToAccount(need(k) as `0x${string}`);
const deployer = acct("SEPOLIA_DEPLOYER_KEY");
const user = acct("SEPOLIA_USER_KEY");
const wallet = (a: ReturnType<typeof acct>) => createWalletClient({ account: a, chain: sepolia, transport: http(SEPOLIA_RPC) });
const GVK = need("ZKROSS_GVK_PRIV");
const D = zk.adminKey(GVK);
const ETH_USDC = deployments.sepolia.usdc.address as Address;

const USDC6 = 1_000_000n; // one USDC in bridge-message units (10^-6)
const LIQUIDITY = 20n * USDC6;
const DEPOSIT = RELAYER ? USDC6 : 4n * USDC6;
const TRANSFERS = RELAYER ? [USDC6] : [2n * USDC6, 1n * USDC6];

type Chain = "stellar" | "sepolia";
const SCALE: Record<Chain, bigint> = { stellar: 10n, sepolia: 1n };
const CHAIN_ID: Record<Chain, bigint> = { stellar: STELLAR_CHAIN_ID, sepolia: SEPOLIA_CHAIN_ID };
const other = (c: Chain): Chain => (c === "stellar" ? "sepolia" : "stellar");

/** A note this script owns: owner key name, amount (note units), blinding, leaf. */
type Note = { chain: Chain; owner: string; amount: string; blinding: zk.Hex; leaf: number };
type Message = { src: Chain; c: zk.Hex; amount: string; deadline: string; recipient: string; secret: zk.Hex; block?: string };

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

async function step<T>(name: string, f: () => Promise<T>): Promise<T> {
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function ethSend(a: ReturnType<typeof acct>, address: Address, abi: any, functionName: string, args: unknown[], label: string) {
  const hash = await wallet(a).writeContract({ address, abi, functionName, args } as any);
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  link(label, links.sepoliaTx(hash));
  return r;
}

function stSend(identity: string, fn: string, args: Record<string, unknown>, label: string) {
  const { txHash } = st.invoke(identity, S.pool, fn, args);
  link(label, links.stellarTx(txHash!));
}

const wire = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x)));

/** Sends a call through the relayer, waits for it, and checks on-chain that
 * the relayer's account (no user's) sent it. Returns the hash. */
async function relayCall(chain: Chain, fn: string, args: Record<string, unknown> | null, label: string, name: string): Promise<string> {
  state.relayed ??= {};
  let hash: string | undefined = state.relayed[name];
  if (!hash) {
    if (!args) throw new Error(`${name}: nothing to relay`);
    const r = await fetch(`${RELAYER_URL}/relay`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chain, pool: chain === "stellar" ? S.pool : E.pool, fn, args: wire(args) }),
    });
    const body = await r.json();
    if (!r.ok) throw new Error(`the relayer refused ${fn}: ${body.error}`);
    hash = body.hash as string;
    // Saved before waiting: a resumed run never relays the same step twice.
    state.relayed[name] = hash;
    save();
  }
  for (;;) {
    const s = await fetch(`${RELAYER_URL}/status/${hash}`).then((x) => x.json()).catch(() => ({}));
    if (s.status === "success") break;
    if (s.status === "failed") throw new Error(`relayed ${fn} failed: ${hash}`);
    await sleep(3000);
  }
  let sender = "";
  for (let i = 0; !sender && i < 10; i++) {
    if (chain === "sepolia") sender = (await pub.getTransaction({ hash: hash as `0x${string}` })).from;
    else sender = (await fetch(`https://horizon-testnet.stellar.org/transactions/${hash}`).then((x) => (x.ok ? x.json() : {}))).source_account ?? "";
    if (!sender) await sleep(3000);
  }
  const relayer = chain === "sepolia" ? need("SEPOLIA_RELAYER_ADDRESS") : need("STELLAR_RELAYER_ADDRESS");
  const users = [user.address, need("STELLAR_ALICE_ADDRESS"), need("STELLAR_BOB_ADDRESS")].map((a) => a.toLowerCase());
  check(sender.toLowerCase() === relayer.toLowerCase() && !users.includes(sender.toLowerCase()), `${fn} was sent by the relayer ${sender}`);
  link(`${label} [via relayer]`, chain === "sepolia" ? links.sepoliaTx(hash) : links.stellarTx(hash));
  return hash;
}

/** A fresh Stellar account with a USDC trustline (testnet throwaway, kept in the state file). */
async function freshStellarAccount(): Promise<string> {
  state.freshStellarSecret ??= Keypair.random().secret();
  save();
  const kp = Keypair.fromSecret(state.freshStellarSecret);
  const horizon = new Horizon.Server("https://horizon-testnet.stellar.org");
  let account = await horizon.loadAccount(kp.publicKey()).catch(() => null);
  if (!account) {
    await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
    account = await horizon.loadAccount(kp.publicKey());
  }
  if (!account.balances.some((b: any) => b.asset_code === "USDC")) {
    const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: deployments.stellarTestnet.networkPassphrase })
      .addOperation(Operation.changeTrust({ asset: new Asset("USDC", deployments.stellarTestnet.usdc.issuer) }))
      .setTimeout(120)
      .build();
    tx.sign(kp);
    await horizon.submitTransaction(tx);
  }
  return kp.publicKey();
}

const ethView = (functionName: string, args: unknown[] = []) => pub.readContract({ address: E.pool, abi: eth.poolAbi, functionName, args } as any) as Promise<any>;
const stView = (fn: string, args: Record<string, unknown> = {}) => st.view(S.pool, fn, args);
const sHex = (s: string): zk.Hex => (s.startsWith("0x") ? (s as zk.Hex) : `0x${s}`);
const nowHour = () => BigInt(Math.floor(Date.now() / 1000 / 3600));
const dummy = () => ({ leaf_index: null, sk: zk.randomField(), amount: "0", blinding: zk.randomField() });
const salts = () => ({ in_salts: [zk.randomField(), zk.randomField()], out_salts: [zk.randomField(), zk.randomField()] });

const leaves = async (c: Chain) =>
  c === "stellar" ? st.noteLeaves(await st.events(S.pool, S.deployLedger)) : eth.noteLeaves(pub as any, E.pool, BigInt(E.deployBlock));
const outbox = async (c: Chain) =>
  c === "stellar" ? st.outboxLeaves(await st.events(S.pool, S.deployLedger)) : eth.outboxLeaves(pub as any, E.pool, BigInt(E.deployBlock));

/** The leaf index of a commitment, retrying while RPC indexes the new events. */
async function leafOf(c: Chain, commitment: zk.Hex): Promise<number> {
  for (let i = 0; i < 10; i++) {
    const idx = (await leaves(c)).findIndex((l) => l !== undefined && BigInt(l) === BigInt(commitment));
    if (idx >= 0) return idx;
    await sleep(5000);
  }
  throw new Error(`commitment ${commitment} not found on ${c}`);
}

const pk = (owner: string) => zk.pubkey(key(owner));
const input = (n: Note) => ({ leaf_index: n.leaf, sk: key(n.owner), amount: n.amount, blinding: n.blinding });

async function stellarUsdc(addr: string): Promise<bigint> {
  const r = await fetch(`https://horizon-testnet.stellar.org/accounts/${addr}`).then((x) => x.json());
  const b = r.balances?.find((x: any) => x.asset_code === "USDC");
  return b ? BigInt(b.balance.replace(".", "")) : 0n;
}

/** Retries a read for a few seconds: public RPC nodes can lag a block behind. */
async function eventually(f: () => Promise<boolean>, tries = 8): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    if (await f()) return true;
    await sleep(3000);
  }
  return false;
}

const ethUsdc = (a: Address) => pub.readContract({ address: ETH_USDC, abi: eth.erc20Abi, functionName: "balanceOf", args: [a] }) as Promise<bigint>;

// ---------- Flow steps ----------

/** Deposits `amount` (message units) into `c`'s pool as one note of `owner`. */
async function deposit(name: string, c: Chain, owner: string, amount: bigint): Promise<Note> {
  return step(name, async () => {
    const units = amount * SCALE[c];
    const blinding = key(`${name}_b0`);
    const outputs = [{ pk: pk(owner), amount: units.toString(), blinding }, { pk: pk(owner), amount: "0", blinding: key(`${name}_b1`) }];
    if (c === "stellar") {
      const ext = { recipient: S.pool, ext_amount: units.toString(), encrypted_output0: "01", encrypted_output1: "02" };
      const built = zk.buildTransact({ levels: 20, leaves: await leaves(c), d: [D.x, D.y], ext_data_hash: sHex(stView("hash_ext_data", { ext_data: ext })), public_amount: units.toString(), inputs: [dummy(), dummy()], outputs, ...salts() });
      check(built.root === st.hex32(stView("get_root")), "off-chain root equals the Stellar pool's");
      stSend("zkross-alice", "transact", { proof: st.transactProof(zk.prove(built)), ext_data: ext, sender: need("STELLAR_ALICE_ADDRESS") }, `Stellar deposit ${Number(amount) / 1e6} USDC (alice)`);
    } else {
      const ext = { recipient: user.address, extAmount: units, encryptedOutput0: "0x01", encryptedOutput1: "0x02" };
      const built = zk.buildTransact({ levels: 20, leaves: await leaves(c), d: [D.x, D.y], ext_data_hash: await ethView("hashExtData", [ext]), public_amount: units.toString(), inputs: [dummy(), dummy()], outputs, ...salts() });
      check(BigInt(built.root) === (await ethView("getRoot")), "off-chain root equals the Sepolia pool's");
      await ethSend(user, ETH_USDC, eth.erc20Abi, "approve", [E.pool, units], "Sepolia approve (dave)");
      await ethSend(user, E.pool, eth.poolAbi, "transact", [eth.transactProof(zk.prove(built)), ext], `Sepolia deposit ${Number(amount) / 1e6} USDC (dave)`);
    }
    const commitment = zk.commitment(units.toString(), pk(owner), blinding);
    return { chain: c, owner, amount: units.toString(), blinding, leaf: await leafOf(c, commitment) };
  });
}

/** Bridges `amount` from `note` to `recipient`; returns the message and the change note. */
async function bridgeOut(name: string, note: Note, amount: bigint, recipient: string): Promise<{ msg: Message; change: Note }> {
  return step(name, async () => {
    const c = note.chain;
    const changeUnits = BigInt(note.amount) - amount * SCALE[c];
    const changeBlinding = key(`${name}_change`);
    const deadline = nowHour() + 6n;
    const secret = key(`${name}_claim`);
    const req = {
      levels: 20, leaves: await leaves(c), d: [D.x, D.y],
      inputs: [input(note), dummy()],
      outputs: [{ pk: pk(note.owner), amount: changeUnits.toString(), blinding: changeBlinding }, { pk: pk(note.owner), amount: "0", blinding: zk.randomField() }],
      ...salts(),
      amount: amount.toString(), scale: SCALE[c].toString(), asset_id: "1", src_chain: CHAIN_ID[c].toString(), dst_chain: CHAIN_ID[other(c)].toString(),
      deadline_bucket: deadline.toString(), recipient_pk: pk(recipient), claim_secret: secret,
      refund_pk: pk(note.owner), refund_blinding: key(`${name}_refund`), refund_salt: zk.randomField(), bridge_salt: zk.randomField(),
    };
    const label = `${c === "stellar" ? "Stellar bridge_out" : "Sepolia bridgeOut"} ${Number(amount) / 1e6} USDC (${note.owner} -> ${recipient})`;
    let block: string | undefined;
    let built: zk.Built;
    const relayedHash: string | undefined = state.relayed?.[name];
    if (RELAYER && relayedHash) {
      // Resume: the relayer already sent it; read C and the deadline from its event.
      await relayCall(c, c === "stellar" ? "bridge_out" : "bridgeOut", null, label, name);
      let c0: zk.Hex, deadline0: string;
      if (c === "stellar") {
        const e = (await st.events(S.pool, S.deployLedger)).find((x) => x.txHash === relayedHash && x.name === "bridge_out_event")!;
        c0 = st.hex32(e.topics[1]);
        deadline0 = String(e.data.deadline_bucket);
      } else {
        const r = await pub.getTransactionReceipt({ hash: relayedHash as `0x${string}` });
        const ev = (parseEventLogs({ abi: eth.poolAbi, logs: r.logs, eventName: "BridgeOut" }) as any[])[0];
        c0 = st.hex32(ev.args.bridgeMessage);
        deadline0 = String(ev.args.deadlineBucket);
        block = r.blockNumber.toString();
      }
      const changeCommitment0 = zk.commitment(changeUnits.toString(), pk(note.owner), changeBlinding);
      return {
        msg: { src: c, c: c0, amount: amount.toString(), deadline: deadline0, recipient, secret, block },
        change: { chain: c, owner: note.owner, amount: changeUnits.toString(), blinding: changeBlinding, leaf: changeUnits > 0n ? await leafOf(c, changeCommitment0) : -1 },
      };
    }
    if (c === "stellar") {
      const ext = { encrypted_output0: "03", encrypted_output1: "04", encrypted_refund: "05", encrypted_bridge_message: "06" };
      built = zk.buildBridgeOut({ ...req, ext_data_hash: sHex(stView("hash_bridge_out_ext_data", { ext_data: ext })) });
      const proof = st.bridgeOutProof(zk.prove(built));
      if (RELAYER) await relayCall("stellar", "bridge_out", { proof, ext_data: ext }, label, name);
      else stSend("zkross-alice", "bridge_out", { proof, ext_data: ext, sender: need("STELLAR_ALICE_ADDRESS") }, label);
    } else {
      const ext = { encryptedOutput0: "0x03", encryptedOutput1: "0x04", encryptedRefund: "0x05", encryptedBridgeMessage: "0x06" };
      built = zk.buildBridgeOut({ ...req, ext_data_hash: await ethView("hashBridgeOutExtData", [ext]) });
      const proof = eth.bridgeOutProof(zk.prove(built));
      if (RELAYER) {
        const hash = await relayCall("sepolia", "bridgeOut", { proof, extData: ext }, label, name);
        block = (await pub.getTransactionReceipt({ hash: hash as `0x${string}` })).blockNumber.toString();
      } else {
        block = (await ethSend(user, E.pool, eth.poolAbi, "bridgeOut", [proof, ext], label)).blockNumber.toString();
      }
    }
    const changeCommitment = zk.commitment(changeUnits.toString(), pk(note.owner), changeBlinding);
    return {
      msg: { src: c, c: built.bridge_message, amount: amount.toString(), deadline: deadline.toString(), recipient, secret, block },
      change: { chain: c, owner: note.owner, amount: changeUnits.toString(), blinding: changeBlinding, leaf: changeUnits > 0n ? await leafOf(c, changeCommitment) : -1 },
    };
  });
}

/** Waits until the root poster has posted a `src` outbox root covering every message. */
async function waitForRoot(name: string, src: Chain, msgs: Message[]): Promise<{ root: zk.Hex; count: number }> {
  return step(name, async () => {
    const dst = other(src);
    if (src === "sepolia") {
      const last = BigInt(msgs.at(-1)!.block!);
      console.log("  waiting for Sepolia finality (about 15 minutes) ...");
      while ((await pub.getBlock({ blockTag: "finalized" })).number < last) await sleep(30_000);
    }
    const remote = await outbox(src);
    const root = zk.treeRoot(20, remote);
    const known = async () => (dst === "sepolia" ? ethView("isKnownRemoteRoot", [BigInt(root)]) : stView("is_known_remote_root", { root: BigInt(root).toString() }) === true);
    console.log(`  waiting for the root poster to post ${root} on ${dst} ...`);
    for (let i = 0; !(await known()); i++) {
      if (i > 60) throw new Error("the root poster did not post the root within 30 minutes; is it running?");
      await sleep(30_000);
    }
    check(true, `${dst} knows ${src}'s outbox root`);
    return { root, count: remote.length };
  });
}

/** Claims `msg` on the destination as one note of its recipient. */
async function bridgeIn(name: string, msg: Message, outboxCount: number): Promise<Note> {
  return step(name, async () => {
    const dst = other(msg.src);
    const remote = (await outbox(msg.src)).slice(0, outboxCount);
    const index = remote.findIndex((l) => l !== undefined && BigInt(l) === BigInt(msg.c));
    const units = BigInt(msg.amount) * SCALE[dst];
    const blinding = key(`${name}_b0`);
    const req = {
      levels: 20, outbox_leaves: remote, index, d: [D.x, D.y],
      amount: msg.amount, scale: SCALE[dst].toString(), asset_id: "1", src_chain: CHAIN_ID[msg.src].toString(), dst_chain: CHAIN_ID[dst].toString(),
      deadline_bucket: msg.deadline, recipient_sk: key(msg.recipient), claim_secret: msg.secret,
      outputs: [{ amount: units.toString(), blinding }, { amount: "0", blinding: zk.randomField() }],
      out_salts: [zk.randomField(), zk.randomField()],
    };
    const label = `${dst === "sepolia" ? "Sepolia bridgeIn" : "Stellar bridge_in"} ${Number(msg.amount) / 1e6} USDC (${msg.recipient})`;
    if (RELAYER && state.relayed?.[name]) {
      await relayCall(dst, dst === "sepolia" ? "bridgeIn" : "bridge_in", null, label, name);
      return { chain: dst, owner: msg.recipient, amount: units.toString(), blinding, leaf: await leafOf(dst, zk.commitment(units.toString(), pk(msg.recipient), blinding)) };
    }
    let built: zk.Built;
    if (dst === "sepolia") {
      const ext = { encryptedOutput0: "0x07", encryptedOutput1: "0x08" };
      built = zk.buildBridgeIn({ ...req, ext_data_hash: await ethView("hashBridgeInExtData", [ext]) });
      const proof = eth.bridgeInProof(zk.prove(built));
      if (RELAYER) await relayCall("sepolia", "bridgeIn", { proof, extData: ext }, label, name);
      else await ethSend(user, E.pool, eth.poolAbi, "bridgeIn", [proof, ext], label);
      check(await ethView("isClaimed", [BigInt(built.claim_nullifier)]), "the claim nullifier is spent on Sepolia");
    } else {
      const ext = { encrypted_output0: "07", encrypted_output1: "08" };
      built = zk.buildBridgeIn({ ...req, ext_data_hash: sHex(stView("hash_bridge_in_ext_data", { ext_data: ext })) });
      const proof = st.bridgeInProof(zk.prove(built));
      if (RELAYER) await relayCall("stellar", "bridge_in", { proof, ext_data: ext }, label, name);
      else stSend("zkross-bob", "bridge_in", { proof, ext_data: ext, sender: need("STELLAR_BOB_ADDRESS") }, label);
      check(stView("is_claimed", { claim_nullifier: BigInt(built.claim_nullifier).toString() }) === true, "the claim nullifier is spent on Stellar");
    }
    return { chain: dst, owner: msg.recipient, amount: units.toString(), blinding, leaf: await leafOf(dst, built.commitments[0]) };
  });
}

/** Withdraws all of `note` to `to`, a fresh public address. */
/** Withdraws `units` (default: all) of `note` to `to`, a fresh public address;
 * any rest stays a note of the owner. */
async function withdraw(name: string, note: Note, to: string, amount?: bigint) {
  return step(name, async () => {
    const c = note.chain;
    const units = amount ?? BigInt(note.amount);
    const rest = BigInt(note.amount) - units;
    const outputs = [{ pk: pk(note.owner), amount: rest.toString(), blinding: key(`${name}_rest`) }, { pk: pk(note.owner), amount: "0", blinding: zk.randomField() }];
    const label = `${c === "sepolia" ? "Sepolia" : "Stellar"} withdraw ${Number(units / SCALE[c]) / 1e6} USDC to fresh ${to}`;
    state.withdrawals ??= [];
    if (!state.withdrawals.some((w: any) => w.to === to && w.units === units.toString())) state.withdrawals.push({ chain: c, to, units: units.toString() });
    if (RELAYER && state.relayed?.[name]) return void (await relayCall(c, "transact", null, label, name));
    if (c === "sepolia") {
      const before = await ethUsdc(to as Address);
      const ext = { recipient: to, extAmount: -units, encryptedOutput0: "0x09", encryptedOutput1: "0x0a" };
      const built = zk.buildTransact({ levels: 20, leaves: await leaves(c), d: [D.x, D.y], ext_data_hash: await ethView("hashExtData", [ext]), public_amount: zk.hex32(zk.R - units), inputs: [input(note), dummy()], outputs, ...salts() });
      const proof = eth.transactProof(zk.prove(built));
      if (RELAYER) await relayCall("sepolia", "transact", { proof, extData: ext }, label, name);
      else await ethSend(user, E.pool, eth.poolAbi, "transact", [proof, ext], label);
      check(await eventually(async () => (await ethUsdc(to as Address)) - before === units), `${to} received exactly ${units} units`);
    } else {
      const before = await stellarUsdc(to);
      const ext = { recipient: to, ext_amount: (-units).toString(), encrypted_output0: "09", encrypted_output1: "0a" };
      const built = zk.buildTransact({ levels: 20, leaves: await leaves(c), d: [D.x, D.y], ext_data_hash: sHex(stView("hash_ext_data", { ext_data: ext })), public_amount: zk.hex32(zk.R - units), inputs: [input(note), dummy()], outputs, ...salts() });
      const proof = st.transactProof(zk.prove(built));
      if (RELAYER) await relayCall("stellar", "transact", { proof, ext_data: ext }, label, name);
      else stSend("zkross-bob", "transact", { proof, ext_data: ext, sender: need("STELLAR_BOB_ADDRESS") }, label);
      check(await eventually(async () => (await stellarUsdc(to)) - before === units), `${to} received exactly ${units} stroops`);
    }
  });
}

async function main() {
  // ---------- 0. Preflight ----------
  console.log("0. preflight");
  if (RELAYER) {
    const h = await fetch(`${RELAYER_URL}/health`).then((r) => r.json()).catch(() => null);
    check(Boolean(h?.ok), `the relayer answers at ${RELAYER_URL}`);
  } else {
    check((await ethUsdc(deployer.address)) >= LIQUIDITY || !!state.steps.liquidity, "Sepolia deployer has 20 USDC for liquidity");
    check((await stellarUsdc(need("STELLAR_DEPLOYER_ADDRESS"))) >= LIQUIDITY * 10n || !!state.steps.liquidity, "Stellar deployer has 20 USDC for liquidity");
  }
  check((await stellarUsdc(need("STELLAR_ALICE_ADDRESS"))) >= DEPOSIT * 10n || !!state.steps.depositStellar, `alice has ${DEPOSIT / USDC6} USDC on Stellar`);
  check((await ethUsdc(user.address)) >= DEPOSIT || !!state.steps.depositSepolia, `dave (Sepolia user) has ${DEPOSIT / USDC6} USDC`);
  for (const a of [deployer, user, acct("SEPOLIA_POSTER_KEY")]) check((await pub.getBalance({ address: a.address })) > 0n, `${a.address} has Sepolia ETH`);

  // ---------- 1. Liquidity ----------
  if (!RELAYER) await step("liquidity", async () => {
    await ethSend(deployer, ETH_USDC, eth.erc20Abi, "approve", [E.pool, LIQUIDITY], "Sepolia approve (deployer)");
    await ethSend(deployer, E.pool, eth.poolAbi, "addLiquidity", [LIQUIDITY], "Sepolia addLiquidity 20 USDC");
    stSend("zkross-deployer", "add_liquidity", { amount: (LIQUIDITY * 10n).toString() }, "Stellar add_liquidity 20 USDC");
  });

  // ---------- 2. Stellar -> Ethereum ----------
  let note = await deposit("depositStellar", "stellar", "alice", DEPOSIT);
  const toEth: Message[] = [];
  for (const [i, amount] of TRANSFERS.entries()) {
    const r = await bridgeOut(`bridgeOutStellar${i}`, note, amount, "carol");
    toEth.push(r.msg);
    note = r.change;
  }
  const rootS = await waitForRoot("rootStellarToSepolia", "stellar", toEth);
  for (const [i, m] of toEth.entries()) {
    const claimed = await bridgeIn(`bridgeInSepolia${i}`, m, rootS.count);
    state.freshEth ??= [];
    state.freshEth[i] ??= privateKeyToAccount(zk.randomField()).address;
    save();
    await withdraw(`withdrawSepolia${i}`, claimed, state.freshEth[i], RELAYER ? BigInt(claimed.amount) / 2n : undefined);
  }

  // ---------- 3. Ethereum -> Stellar ----------
  note = await deposit("depositSepolia", "sepolia", "dave", DEPOSIT);
  const toStellar: Message[] = [];
  for (const [i, amount] of TRANSFERS.entries()) {
    const r = await bridgeOut(`bridgeOutSepolia${i}`, note, amount, "bob");
    toStellar.push(r.msg);
    note = r.change;
  }
  const rootE = await waitForRoot("rootSepoliaToStellar", "sepolia", toStellar);
  for (const [i, m] of toStellar.entries()) {
    const claimed = await bridgeIn(`bridgeInStellar${i}`, m, rootE.count);
    const to = RELAYER ? await freshStellarAccount() : need("STELLAR_FRESH_ADDRESS");
    await withdraw(`withdrawStellar${i}`, claimed, to, RELAYER ? BigInt(claimed.amount) / 2n : undefined);
  }

  // ---------- 4. Admin view ----------
  console.log("4. admin view (decrypted with the Global View Key)");
  const sev = await st.events(S.pool, S.deployLedger);
  const elogs = parseEventLogs({ abi: eth.poolAbi, logs: await pub.getLogs({ address: E.pool, fromBlock: BigInt(E.deployBlock) }) }) as any[];
  const ctS = (c: any): zk.Ct => ({ r: { x: st.hex32(c.r.x), y: st.hex32(c.r.y) }, c1: st.hex32(c.c1), c2: st.hex32(c.c2), c3: st.hex32(c.c3) });
  const sNotes = sev.filter((e) => e.name === "new_commitment_event" && BigInt(e.data.gvk_ciphertext.r.x) !== 0n);
  for (const [i, n] of zk.decrypt(GVK, sNotes.map((e) => ctS(e.data.gvk_ciphertext))).notes.entries())
    check(BigInt(n.commitment) === BigInt(sNotes[i].topics[1]), `Stellar note ${sNotes[i].data.index}: ${n.amount} stroops`);
  const eNotes = elogs.filter((l) => l.eventName === "NewCommitment" && BigInt(l.args.gvkCiphertext.r.x) !== 0n);
  for (const [i, n] of zk.decrypt(GVK, eNotes.map((l) => ctS(l.args.gvkCiphertext))).notes.entries())
    check(BigInt(n.commitment) === BigInt(eNotes[i].args.commitment), `Sepolia note ${eNotes[i].args.index}: ${n.amount} units`);
  const outs = [
    ...sev.filter((e) => e.name === "bridge_out_event").map((e) => ({ src: "stellar" as Chain, ct: e.data.bridge_ciphertext, deadline: String(e.data.deadline_bucket), refund: e.data.refund_ciphertext, refundC: e.data.refund_commitment })),
    ...elogs.filter((l) => l.eventName === "BridgeOut").map((l) => ({ src: "sepolia" as Chain, ct: l.args.bridgeCiphertext, deadline: String(l.args.deadlineBucket), refund: l.args.refundCiphertext, refundC: l.args.refundCommitment })),
  ];
  for (const o of outs) {
    const [m] = zk.decrypt(GVK, [ctS(o.ct)]).notes;
    const [r] = zk.decrypt(GVK, [ctS(o.refund)]).notes;
    check(BigInt(r.commitment) === BigInt(o.refundC), `${o.src} refund note decrypted: ${r.amount} units`);
    const linked = zk.bridgeMessage({ amount: m.amount, asset_id: "1", src_chain: CHAIN_ID[o.src].toString(), dst_chain: CHAIN_ID[other(o.src)].toString(), recipient_pk: m.pk, claim_secret: m.blinding, deadline_bucket: o.deadline });
    const claimed = o.src === "stellar"
      ? elogs.some((l) => l.eventName === "BridgeIn" && BigInt(l.args.claimNullifier) === BigInt(linked.claim_nullifier))
      : sev.some((e) => e.name === "bridge_in_event" && BigInt(e.topics[1]) === BigInt(linked.claim_nullifier));
    check(claimed, `admin links the ${o.src} bridge_out of ${m.amount} units to its bridge_in on ${other(o.src)}`);
  }

  console.log("\nAll transactions:");
  for (const l of state.links) console.log(`  ${l.label}: ${l.url}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
