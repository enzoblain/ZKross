// Calls zkross-prover (prover/) for every hash, circuit input and proof, so no
// Poseidon2 is reimplemented here. Fields are 0x-hex strings (32-byte BE).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BUILD = process.env.ZKROSS_BUILD ?? path.join(os.homedir(), "zkross-build");
const BIN = process.env.ZKROSS_PROVER ?? path.join(BUILD, "prover-target/release/zkross-prover");
const CIRCUITS = process.env.ZKROSS_CIRCUITS ?? path.join(BUILD, "circuits");

export const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export type Hex = `0x${string}`;

function run(args: string[]): any {
  const out = execFileSync(BIN, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(out);
}

function withFile(obj: unknown, f: (p: string) => any): any {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zkp-")), "req.json");
  fs.writeFileSync(p, JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  try {
    return f(p);
  } finally {
    fs.rmSync(path.dirname(p), { recursive: true, force: true });
  }
}

export const hex32 = (v: bigint): Hex => `0x${v.toString(16).padStart(64, "0")}`;
export const field = (s: string): bigint => BigInt(s);

/** A random field element (for blindings, salts, claim secrets, keys). */
export function randomField(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return hex32(BigInt("0x" + Buffer.from(b).toString("hex")) % R);
}

export const pubkey = (sk: string): Hex => run(["pubkey", sk]).pk;
export const adminKey = (dPriv: string): { x: Hex; y: Hex } => run(["admin-key", dPriv]);
export const treeRoot = (levels: number, leaves: string[]): Hex => withFile({ levels, leaves }, (p) => run(["tree-root", p])).root;
export const bridgeMessage = (m: object): { bridge_message: Hex; claim_nullifier: Hex } =>
  withFile(m, (p) => run(["bridge-message", p]));
export const decrypt = (dPriv: string, ciphertexts: Ct[]): { notes: { pk: Hex; amount: string; blinding: Hex; commitment: Hex }[] } =>
  withFile(
    { d_priv: dPriv, ciphertexts: ciphertexts.map((c) => ({ rx: c.r.x, ry: c.r.y, c1: c.c1, c2: c.c2, c3: c.c3 })) },
    (p) => run(["decrypt", p])
  );

export type Built = { circuit: string; inputs: Record<string, unknown>; [k: string]: any };
export const buildTransact = (req: object): Built => withFile(req, (p) => run(["build-transact", p]));
export const buildBridgeOut = (req: object): Built => withFile(req, (p) => run(["build-bridge-out", p]));
export const buildBridgeIn = (req: object): Built => withFile(req, (p) => run(["build-bridge-in", p]));

export type Proved = { proof: Hex; words: Hex[]; public_signals: Hex[] };
export function prove(built: Built): Proved {
  const c = built.circuit;
  return withFile(built, (p) =>
    run([
      "prove",
      p,
      "--pk",
      path.join(CIRCUITS, `${c}_proving_key.bin`),
      "--graph",
      path.join(CIRCUITS, `${c}.graph.bin`),
      "--r1cs",
      path.join(CIRCUITS, `${c}.r1cs`),
    ])
  );
}

export type Ct = { r: { x: Hex; y: Hex }; c1: Hex; c2: Hex; c3: Hex };

/** Ciphertext `i` of `n` from field-major public signals (SPEC.md A, B8). */
export function ciphertext(s: Hex[], i: number, n: number): Ct {
  return { r: { x: s[2 * i], y: s[2 * i + 1] }, c1: s[2 * n + i], c2: s[3 * n + i], c3: s[4 * n + i] };
}
