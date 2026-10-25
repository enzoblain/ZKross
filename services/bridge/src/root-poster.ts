// Root poster (PLAN.md Phase 5, SPEC.md B6): copies each chain's outbox root
// to the other chain. Ethereum roots are read at the `finalized` block, so a
// posted root can't be reorged away; Stellar ledgers are final when closed.
// Holds its own keys (STELLAR poster identity, SEPOLIA_POSTER_KEY).
//
//   tsx src/root-poster.ts            loop every ZKROSS_POST_INTERVAL s (60)
//   tsx src/root-poster.ts --once     one round, then exit
import { type Address, createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { SEPOLIA_RPC, deployments, env, links, need } from "./lib/config.ts";
import { poolAbi } from "./lib/eth.ts";
import * as stellar from "./lib/stellar.ts";

const STELLAR_POOL = deployments.stellarTestnet.zkross.pool as string;
const ETH_POOL = deployments.sepolia.zkross?.pool as Address | undefined;
const pub = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC) });

export type Posted = { direction: string; root: string; tx: string };

/** Stellar outbox root -> Sepolia pool. */
export async function postStellarRoot(): Promise<Posted | null> {
  if (!ETH_POOL) throw new Error("no Sepolia pool in deployments.json");
  if (BigInt(stellar.view(STELLAR_POOL, "outbox_next_index")) === 0n) return null;
  const root = BigInt(stellar.view(STELLAR_POOL, "get_outbox_root"));
  const known = await pub.readContract({ address: ETH_POOL, abi: poolAbi, functionName: "isKnownRemoteRoot", args: [root] });
  if (known) return null;
  const wallet = createWalletClient({ account: privateKeyToAccount(need("SEPOLIA_POSTER_KEY") as `0x${string}`), chain: sepolia, transport: http(SEPOLIA_RPC) });
  const hash = await wallet.writeContract({ address: ETH_POOL, abi: poolAbi, functionName: "postRemoteRoot", args: [root] });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`postRemoteRoot reverted: ${hash}`);
  return { direction: "Stellar -> Sepolia", root: root.toString(), tx: links.sepoliaTx(hash) };
}

/** Sepolia outbox root (at the finalized block) -> Stellar pool. */
export async function postEthereumRoot(): Promise<Posted | null> {
  if (!ETH_POOL) throw new Error("no Sepolia pool in deployments.json");
  const read = (functionName: string) =>
    pub.readContract({ address: ETH_POOL, abi: poolAbi, functionName, blockTag: "finalized" } as any) as Promise<bigint>;
  if ((await read("outboxNextIndex")) === 0n) return null;
  const root = await read("getOutboxRoot");
  if (stellar.view(STELLAR_POOL, "is_known_remote_root", { root: root.toString() }) === true) return null;
  const { txHash } = stellar.invoke("zkross-poster", STELLAR_POOL, "post_remote_root", { root: root.toString() });
  return { direction: "Sepolia -> Stellar", root: root.toString(), tx: links.stellarTx(txHash ?? "") };
}

export async function round(): Promise<Posted[]> {
  const out: Posted[] = [];
  for (const f of [postStellarRoot, postEthereumRoot]) {
    try {
      const p = await f();
      if (p) out.push(p);
    } catch (e) {
      console.error(`[root-poster] ${f.name}: ${(e as Error).message}`);
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const once = process.argv.includes("--once");
  const interval = Number(env.ZKROSS_POST_INTERVAL ?? 60) * 1000;
  for (;;) {
    for (const p of await round()) console.log(`[root-poster] ${p.direction} root ${p.root}: ${p.tx}`);
    if (once) break;
    await new Promise((r) => setTimeout(r, interval));
  }
}
