// Refund attester (SPEC.md B12): after each pending message's deadline plus
// the one-hour grace, decrypts the message's GVK ciphertext with the admin
// key, derives its claim nullifier, checks whether the other chain spent it,
// signs "claimed" (0x02, finalize) or "not claimed" (0x01, refund), and
// submits the settlement on the source chain.
//
//   tsx src/refund-attester.ts            loop every ZKROSS_ATTEST_INTERVAL s (300)
//   tsx src/refund-attester.ts --once
import { type Address, createPublicClient, createWalletClient, getAbiItem, http } from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SEPOLIA_CHAIN_ID, SEPOLIA_RPC, STELLAR_CHAIN_ID, deployments, env, links, need } from "./lib/config.ts";
import { poolAbi } from "./lib/eth.ts";
import * as zk from "./lib/prover.ts";
import * as stellar from "./lib/stellar.ts";

const S = deployments.stellarTestnet.zkross;
const E = deployments.sepolia.zkross;
const pub = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });
const GRACE = 3600n;

type Message = { chain: "stellar" | "sepolia"; c: bigint; deadline: bigint; ct: zk.Ct };
export type Settled = { chain: string; c: string; status: "finalized" | "refunded"; tx: string };

const big = (v: unknown) => BigInt(v as any);
const ctOf = (c: any): zk.Ct => ({ r: { x: stellar.hex32(c.r.x), y: stellar.hex32(c.r.y) }, c1: stellar.hex32(c.c1), c2: stellar.hex32(c.c2), c3: stellar.hex32(c.c3) });

async function pending(): Promise<Message[]> {
  const out: Message[] = [];
  for (const e of await stellar.events(S.pool, S.deployLedger))
    if (e.name === "bridge_out_event") {
      const m = stellar.view(S.pool, "get_pending_message", { bridge_message: big(e.topics[1]).toString() });
      if (m && m.status === 1) out.push({ chain: "stellar", c: big(e.topics[1]), deadline: big(e.data.deadline_bucket), ct: ctOf(e.data.bridge_ciphertext) });
    }
  if (E) {
    const logs = await pub.getLogs({ address: E.pool, event: getAbiItem({ abi: poolAbi, name: "BridgeOut" }) as any, fromBlock: BigInt(E.deployBlock) });
    for (const l of logs as any[]) {
      const m: any = await pub.readContract({ address: E.pool as Address, abi: poolAbi, functionName: "getPendingMessage", args: [l.args.bridgeMessage] });
      if (Number(m.status) === 1) out.push({ chain: "sepolia", c: l.args.bridgeMessage, deadline: l.args.deadlineBucket, ct: ctOf(l.args.bridgeCiphertext) });
    }
  }
  return out;
}

/** Was the message claimed on the destination chain? */
function claimNullifierOf(m: Message): bigint {
  const [n] = zk.decrypt(need("ZKROSS_GVK_PRIV"), [m.ct]).notes;
  const src = m.chain === "stellar" ? STELLAR_CHAIN_ID : SEPOLIA_CHAIN_ID;
  const dst = m.chain === "stellar" ? SEPOLIA_CHAIN_ID : STELLAR_CHAIN_ID;
  const r = zk.bridgeMessage({
    amount: n.amount,
    asset_id: "1",
    src_chain: src.toString(),
    dst_chain: dst.toString(),
    recipient_pk: n.pk,
    claim_secret: n.blinding,
    deadline_bucket: m.deadline.toString(),
  });
  if (BigInt(r.bridge_message) !== m.c) throw new Error(`decrypted fields do not rebuild C ${m.c}`);
  return BigInt(r.claim_nullifier);
}

async function claimed(m: Message, cn: bigint): Promise<boolean> {
  if (m.chain === "stellar") return (await pub.readContract({ address: E.pool, abi: poolAbi, functionName: "isClaimed", args: [cn] })) as boolean;
  return stellar.view(S.pool, "is_claimed", { claim_nullifier: cn.toString() }) === true;
}

export async function round(nowSeconds?: bigint): Promise<Settled[]> {
  const out: Settled[] = [];
  const attester = need("ZKROSS_ATTESTER_KEY") as `0x${string}`;
  for (const m of await pending()) {
    const now = nowSeconds ?? BigInt(Math.floor(Date.now() / 1000));
    if (now < m.deadline * 3600n + GRACE) continue;
    const isClaimed = await claimed(m, claimNullifierOf(m));
    const status = isClaimed ? 2 : 1;
    const fn = isClaimed ? "finalize" : "refund";
    if (m.chain === "stellar") {
      const digest = stellar.view(S.pool, "attestation_digest", { bridge_message: m.c.toString(), status });
      const sig = await sign({ hash: `0x${digest}`, privateKey: attester, to: "hex" });
      const { txHash } = stellar.invoke("zkross-attester", S.pool, fn, { bridge_message: m.c.toString(), attestation: sig.slice(2) });
      out.push({ chain: "stellar", c: m.c.toString(), status: isClaimed ? "finalized" : "refunded", tx: links.stellarTx(txHash ?? "") });
    } else {
      const digest = (await pub.readContract({ address: E.pool, abi: poolAbi, functionName: "attestationDigest", args: [m.c, status] })) as `0x${string}`;
      const sig = await sign({ hash: digest, privateKey: attester, to: "hex" });
      const wallet = createWalletClient({ account: privateKeyToAccount(need("SEPOLIA_POSTER_KEY") as `0x${string}`), chain: sepolia, transport: http(SEPOLIA_RPC) });
      const hash = await wallet.writeContract({ address: E.pool, abi: poolAbi, functionName: fn, args: [m.c, sig] });
      await pub.waitForTransactionReceipt({ hash });
      out.push({ chain: "sepolia", c: m.c.toString(), status: isClaimed ? "finalized" : "refunded", tx: links.sepoliaTx(hash) });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const once = process.argv.includes("--once");
  const interval = Number(env.ZKROSS_ATTEST_INTERVAL ?? 300) * 1000;
  for (;;) {
    try {
      for (const s of await round()) console.log(`[refund-attester] ${s.chain} ${s.status} ${s.c}: ${s.tx}`);
    } catch (e) {
      console.error(`[refund-attester] ${(e as Error).message}`);
    }
    if (once) break;
    await new Promise((r) => setTimeout(r, interval));
  }
}
