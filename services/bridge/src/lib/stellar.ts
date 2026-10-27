// The Stellar pool from TypeScript. Calls go through the `stellar` CLI, which
// converts JSON arguments using the contract's own spec and simulates before
// sending; events are read with the Stellar SDK's RPC client.
import { execFile, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { STELLAR_RPC } from "./config.ts";
import type { Hex, Proved } from "./prover.ts";
import { ciphertext } from "./prover.ts";

export type Invoked = { result: any; txHash?: string };

/** `stellar contract invoke`; `send: false` only simulates (reads). */
export function invoke(source: string, contract: string, fn: string, args: Record<string, unknown> = {}, send = true): Invoked {
  const argv = ["contract", "invoke", "--id", contract, "--source", source, "--network", "testnet"];
  if (!send) argv.push("--send=no");
  argv.push("--", fn);
  for (const [k, v] of Object.entries(args)) argv.push(`--${k}`, typeof v === "string" ? v : JSON.stringify(v, big));
  const r = spawnSync("stellar", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`stellar ${fn} failed: ${(r.stderr || r.stdout).trim().split("\n").slice(-6).join("\n")}`);
  const out = r.stdout.trim().split("\n").pop() ?? "";
  let result: any = out;
  try {
    result = JSON.parse(out);
  } catch {}
  const txHash = r.stderr.match(/Signing transaction: ([0-9a-f]{64})/)?.[1];
  return { result, txHash };
}

export const view = (contract: string, fn: string, args: Record<string, unknown> = {}) => invoke("zkross-deployer", contract, fn, args, false).result;

function big(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

const server = new rpc.Server(STELLAR_RPC);
const execFileAsync = promisify(execFile);

export type StellarEvent = { name: string; topics: any[]; data: any; ledger: number; txHash: string };

/** Contract events from `startLedger` on (RPC keeps about 7 days). */
export async function events(contract: string, startLedger: number): Promise<StellarEvent[]> {
  const all: StellarEvent[] = [];
  let cursor: string | undefined;
  for (;;) {
    const req: any = cursor
      ? { cursor, filters: [{ type: "contract", contractIds: [contract] }], limit: 200 }
      : { startLedger, filters: [{ type: "contract", contractIds: [contract] }], limit: 200 };
    const res = await server.getEvents(req);
    for (const e of res.events) {
      const topics = e.topic.map((t: xdr.ScVal) => scValToNative(t));
      all.push({ name: String(topics[0]), topics, data: scValToNative(e.value), ledger: e.ledger, txHash: e.txHash });
    }
    // The RPC scans a bounded ledger range per request, so a short page is not
    // the end: stop only once the cursor no longer advances.
    if (res.events.length < 200 && res.cursor === cursor) break;
    cursor = res.cursor;
  }
  return all;
}

export const hex32 = (v: bigint | string | number): Hex => `0x${BigInt(v).toString(16).padStart(64, "0")}`;

/** Note-tree leaves in index order, from NewCommitmentEvent. */
export function noteLeaves(evs: StellarEvent[]): Hex[] {
  const leaves: Hex[] = [];
  for (const e of evs) if (e.name === "new_commitment_event") leaves[Number(e.data.index)] = hex32(e.topics[1]);
  return leaves;
}

/** Outbox leaves (pairs (C, 0)), from BridgeOutEvent. */
export function outboxLeaves(evs: StellarEvent[]): Hex[] {
  const leaves: Hex[] = [];
  for (const e of evs)
    if (e.name === "bridge_out_event") {
      const i = Number(e.data.outbox_index);
      leaves[i] = hex32(e.topics[1]);
      leaves[i + 1] = hex32(0);
    }
  return leaves;
}

// ---------- Proof structs in the CLI's JSON form ----------

const dec = (h: Hex) => BigInt(h).toString();
const strip = (h: Hex) => h.slice(2);

function groth16(p: Proved) {
  const b = strip(p.proof);
  return { a: b.slice(0, 128), b: b.slice(128, 384), c: b.slice(384, 512) };
}

function ct(s: Hex[], i: number, n: number) {
  const c = ciphertext(s, i, n);
  return { r: { x: dec(c.r.x), y: dec(c.r.y) }, c1: dec(c.c1), c2: dec(c.c2), c3: dec(c.c3) };
}

/** pool-gvk `Proof` from policy_tx_2_2_gvk_T public signals (open policy). */
export function transactProof(p: Proved) {
  const s = p.public_signals;
  return {
    proof: groth16(p),
    root: dec(s[23]),
    input_nullifiers: [dec(s[26]), dec(s[27])],
    output_commitment0: dec(s[28]),
    output_commitment1: dec(s[29]),
    public_amount: dec(s[24]),
    ext_data_hash: strip(s[25]),
    asp_membership_root: "0",
    asp_non_membership_root: "0",
    output_gvk_ciphertexts: [ct(s, 2, 4), ct(s, 3, 4)],
    input_gvk_ciphertexts: [ct(s, 0, 4), ct(s, 1, 4)],
  };
}

export function bridgeOutProof(p: Proved) {
  const s = p.public_signals;
  return {
    proof: groth16(p),
    root: dec(s[33]),
    input_nullifiers: [dec(s[35]), dec(s[36])],
    change_commitment0: dec(s[37]),
    change_commitment1: dec(s[38]),
    bridge_message: dec(s[39]),
    refund_commitment: dec(s[40]),
    deadline_bucket: Number(BigInt(s[45])),
    ext_data_hash: strip(s[34]),
    ciphertexts: [0, 1, 2, 3, 4, 5].map((i) => ct(s, i, 6)),
  };
}

export function bridgeInProof(p: Proved) {
  const s = p.public_signals;
  return {
    proof: groth16(p),
    remote_root: dec(s[13]),
    claim_nullifier: dec(s[15]),
    output_commitment0: dec(s[16]),
    output_commitment1: dec(s[17]),
    deadline_bucket: Number(BigInt(s[22])),
    ext_data_hash: strip(s[14]),
    ciphertexts: [ct(s, 0, 2), ct(s, 1, 2)],
  };
}

export const latestLedger = async () => (await server.getLatestLedger()).sequence;

/** `stellar contract invoke --build-only`: the unsigned, unsimulated
 * transaction (base64 XDR), with JSON arguments encoded from the contract's
 * spec. Asynchronous, so it never blocks a long-running service. */
export async function buildInvoke(source: string, contract: string, fn: string, args: Record<string, unknown>): Promise<string> {
  const argv = ["contract", "invoke", "--id", contract, "--source", source, "--network", "testnet", "--build-only", "--", fn];
  for (const [k, v] of Object.entries(args)) argv.push(`--${k}`, typeof v === "string" ? v : JSON.stringify(v, big));
  const { stdout } = await execFileAsync("stellar", argv, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim().split("\n").pop() ?? "";
}

export { server as rpcServer };
