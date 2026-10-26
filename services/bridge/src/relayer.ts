// Relayer: submits users' proofs from its own accounts, so their wallets do
// not appear on-chain for withdrawals, private transfers, bridge outs and
// claims. It only calls our two pools (deployments.json), only these
// functions: transact without a deposit (public amount <= 0), bridge_out /
// bridgeOut, bridge_in / bridgeIn. Every call is simulated first and refused
// above a gas / fee cap. Fee: 0 on testnet (the data formats are unchanged).
// Keys come from .env only (STELLAR relayer identity and STELLAR_RELAYER_SECRET,
// SEPOLIA_RELAYER_KEY). Logs never pair a client IP with a transaction.
//
//   POST /relay        { chain, pool, fn, args }  -> { hash }
//   GET  /status/:hash                            -> { chain, hash, status }
import http from "node:http";
import { Keypair, TransactionBuilder, rpc } from "@stellar/stellar-sdk";
import { type Address, type Hash, createPublicClient, createWalletClient, http as viemHttp } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SEPOLIA_RPC, STELLAR_PASSPHRASE, deployments, env, need } from "./lib/config.ts";
import { poolAbi } from "./lib/eth.ts";
import * as stellar from "./lib/stellar.ts";

const STELLAR_POOL = deployments.stellarTestnet.zkross.pool as string;
const ETH_POOL = deployments.sepolia.zkross?.pool as Address | undefined;
const STELLAR_IDENTITY = env.ZKROSS_RELAYER_STELLAR_IDENTITY ?? "zkross-relayer";

const PORT = Number(env.ZKROSS_RELAYER_PORT ?? 8788);
const HOST = env.ZKROSS_RELAYER_HOST ?? "127.0.0.1";
const ORIGINS = (env.ZKROSS_RELAYER_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
const MAX_GAS = BigInt(env.ZKROSS_RELAYER_MAX_GAS ?? 6_000_000);
/** Total Soroban fee cap, in stroops (default 5 XLM). */
const MAX_STELLAR_FEE = BigInt(env.ZKROSS_RELAYER_MAX_FEE ?? 50_000_000);
const RATE_PER_MINUTE = Number(env.ZKROSS_RELAYER_RATE ?? 12);
/** Behind a reverse proxy (HTTPS on a server), rate-limit by the client IP it forwards. */
const TRUST_PROXY = env.ZKROSS_RELAYER_TRUST_PROXY === "1";
const MAX_BODY = 256 * 1024;
/** The relayer's commission: 0 on testnet. */
export const FEE = 0n;

const STELLAR_FNS = new Set(["transact", "bridge_out", "bridge_in"]);
const ETH_FNS = new Set(["transact", "bridgeOut", "bridgeIn"]);

class Refused extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** The relay request body. Big integers are decimal strings, bytes hex strings
 * (the stellar CLI's JSON form on Stellar, 0x-hex on Ethereum). */
export type RelayRequest = {
  chain: "stellar" | "sepolia";
  pool: string;
  fn: string;
  args: { proof: unknown; ext_data?: Record<string, unknown>; extData?: Record<string, unknown> };
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Checks a request against the allowlist; throws `Refused` with the reason. */
export function validate(body: unknown): RelayRequest {
  if (!isObject(body) || !isObject(body.args)) throw new Refused("expected { chain, pool, fn, args }");
  const { chain, pool, fn, args } = body as RelayRequest;
  if (chain === "stellar") {
    if (pool !== STELLAR_POOL) throw new Refused("not a ZKross pool");
    if (!STELLAR_FNS.has(fn)) throw new Refused(`function ${fn} is not relayed`);
    if (!isObject(args.ext_data) || args.proof === undefined || Object.keys(args).some((k) => k !== "proof" && k !== "ext_data")) {
      throw new Refused("expected args { proof, ext_data }");
    }
    if (fn === "transact" && amount(args.ext_data.ext_amount) > 0n) throw new Refused("deposits are not relayed");
  } else if (chain === "sepolia") {
    if (!ETH_POOL || pool.toLowerCase() !== ETH_POOL.toLowerCase()) throw new Refused("not a ZKross pool");
    if (!ETH_FNS.has(fn)) throw new Refused(`function ${fn} is not relayed`);
    if (!isObject(args.extData) || args.proof === undefined || Object.keys(args).some((k) => k !== "proof" && k !== "extData")) {
      throw new Refused("expected args { proof, extData }");
    }
    if (fn === "transact" && amount(args.extData.extAmount) > 0n) throw new Refused("deposits are not relayed");
  } else {
    throw new Refused("chain must be stellar or sepolia");
  }
  return body as RelayRequest;
}

function amount(v: unknown): bigint {
  if (typeof v !== "string" && typeof v !== "number") throw new Refused("missing external amount");
  try {
    return BigInt(v);
  } catch {
    throw new Refused("bad external amount");
  }
}

/** Decimal strings become bigints (viem's uint/int); everything else is kept. */
function revive(v: unknown): unknown {
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  if (Array.isArray(v)) return v.map(revive);
  if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
  return v;
}

// ---------- Senders (one queue per chain, so nonces never collide) ----------

const queues: Record<string, Promise<unknown>> = {};
function queued<T>(chain: string, f: () => Promise<T>): Promise<T> {
  const run = (queues[chain] ?? Promise.resolve()).then(f, f);
  queues[chain] = run.catch(() => undefined);
  return run;
}

const pub = createPublicClient({ chain: sepolia, transport: viemHttp(SEPOLIA_RPC) });

async function relayStellar(r: RelayRequest): Promise<string> {
  const keypair = Keypair.fromSecret(need("STELLAR_RELAYER_SECRET"));
  const unsigned = await stellar.buildInvoke(STELLAR_IDENTITY, STELLAR_POOL, r.fn, {
    proof: r.args.proof,
    ext_data: r.args.ext_data,
    sender: keypair.publicKey(),
  }).catch((e: Error) => {
    throw new Refused(`could not encode the call: ${e.message.split("\n").slice(-3).join(" ")}`);
  });
  const tx = TransactionBuilder.fromXDR(unsigned, STELLAR_PASSPHRASE);
  const sim = await stellar.rpcServer.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) throw new Refused(`simulation failed: ${(sim as rpc.Api.SimulateTransactionErrorResponse).error}`);
  const builder = rpc.assembleTransaction(tx, sim);
  // The CLI's build-only transaction has no time bounds: give it two minutes.
  if (!tx.timeBounds || tx.timeBounds.maxTime === "0") builder.setTimeout(120);
  const assembled = builder.build();
  if (BigInt(assembled.fee) > MAX_STELLAR_FEE) throw new Refused(`fee ${assembled.fee} stroops is above the cap`);
  assembled.sign(keypair);
  const sent = await stellar.rpcServer.sendTransaction(assembled);
  if (sent.status === "ERROR") throw new Refused("the network rejected the transaction", 502);
  return sent.hash;
}

async function relaySepolia(r: RelayRequest): Promise<string> {
  const account = privateKeyToAccount(need("SEPOLIA_RELAYER_KEY") as `0x${string}`);
  const call = { address: ETH_POOL!, abi: poolAbi, functionName: r.fn, args: [revive(r.args.proof), revive(r.args.extData)], account } as any;
  try {
    await pub.simulateContract(call);
  } catch (e) {
    throw new Refused(`simulation failed: ${(e as Error).message.split("\n")[0]}`);
  }
  const gas = await pub.estimateContractGas(call);
  if (gas > MAX_GAS) throw new Refused(`gas ${gas} is above the cap`);
  const wallet = createWalletClient({ account, chain: sepolia, transport: viemHttp(SEPOLIA_RPC) });
  return wallet.writeContract({ ...call, gas: (gas * 12n) / 10n > MAX_GAS ? MAX_GAS : (gas * 12n) / 10n });
}

/** The relayer's public addresses (what appears on-chain as the sender). */
function accounts() {
  const read = (f: () => string) => {
    try {
      return f();
    } catch {
      return null;
    }
  };
  return {
    stellar: read(() => Keypair.fromSecret(need("STELLAR_RELAYER_SECRET")).publicKey()),
    sepolia: read(() => privateKeyToAccount(need("SEPOLIA_RELAYER_KEY") as `0x${string}`).address),
  };
}

export async function relay(r: RelayRequest): Promise<string> {
  return queued(r.chain, () => (r.chain === "stellar" ? relayStellar(r) : relaySepolia(r)));
}

export async function status(hash: string): Promise<{ chain: string; hash: string; status: "pending" | "success" | "failed" }> {
  if (/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    const receipt = await pub.getTransactionReceipt({ hash: hash as Hash }).catch(() => null);
    return { chain: "sepolia", hash, status: !receipt ? "pending" : receipt.status === "success" ? "success" : "failed" };
  }
  if (/^[0-9a-f]{64}$/.test(hash)) {
    const tx = await stellar.rpcServer.getTransaction(hash);
    const s = tx.status === rpc.Api.GetTransactionStatus.SUCCESS ? "success" : tx.status === rpc.Api.GetTransactionStatus.FAILED ? "failed" : "pending";
    return { chain: "stellar", hash, status: s };
  }
  throw new Refused("not a transaction hash");
}

// ---------- HTTP ----------

const hits = new Map<string, { count: number; since: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.since > 60_000) {
    hits.set(ip, { count: 1, since: now });
    return false;
  }
  h.count += 1;
  return h.count > RATE_PER_MINUTE;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, h] of hits) if (now - h.since > 60_000) hits.delete(ip);
}, 60_000).unref();

function send(res: http.ServerResponse, code: number, body: unknown, origin?: string) {
  const headers: Record<string, string> = { "content-type": "application/json", "cache-control": "no-store" };
  if (origin && ORIGINS.includes(origin)) {
    headers["access-control-allow-origin"] = origin;
    headers.vary = "Origin";
  }
  res.writeHead(code, headers);
  res.end(JSON.stringify(body));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Refused("request too large", 413);
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Refused("body is not JSON");
  }
}

export function startRelayer(port = PORT) {
  if (!ETH_POOL) console.warn("[relayer] no Sepolia pool in deployments.json: only Stellar is relayed");
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    // Browsers send Origin; only the site's origins may call. Scripts send none.
    if (origin && !ORIGINS.includes(origin)) return send(res, 403, { error: "origin not allowed" });
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": origin ?? "",
        "access-control-allow-methods": "GET, POST",
        "access-control-allow-headers": "content-type",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      return res.end();
    }
    const forwarded = TRUST_PROXY ? String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() : "";
    if (limited(forwarded || req.socket.remoteAddress || "?")) return send(res, 429, { error: "too many requests" }, origin);
    try {
      if (req.method === "POST" && req.url === "/relay") {
        const r = validate(await readBody(req));
        const hash = await relay(r);
        console.log(`[relayer] ${r.chain} ${r.fn} sent ${hash}`);
        return send(res, 200, { hash, fee: FEE.toString() }, origin);
      }
      const m = req.method === "GET" && req.url?.match(/^\/status\/([0-9a-fA-Fx]+)$/);
      if (m) return send(res, 200, await status(m[1]), origin);
      if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true, fee: FEE.toString(), accounts: accounts() }, origin);
      return send(res, 404, { error: "not found" }, origin);
    } catch (e) {
      const refused = e instanceof Refused;
      if (refused) console.log(`[relayer] refused: ${e.message}`);
      else console.error(`[relayer] error: ${(e as Error).message.split("\n")[0]}`);
      return send(res, refused ? e.status : 500, { error: refused ? e.message : "relay failed" }, origin);
    }
  });
  server.listen(port, HOST, () => console.log(`[relayer] listening on http://${HOST}:${port}`));
  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) startRelayer();
