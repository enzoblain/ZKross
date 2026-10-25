// The Ethereum pool from TypeScript: proof structs from public signals, tree
// leaves from events, and the external-data hashes from the pool's own views.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, type PublicClient, getAbiItem, parseAbi } from "viem";
import { type Hex, type Proved, ciphertext } from "./prover.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
/** The repo checkout (the e2e scripts may run from a WSL-native mirror). */
export const REPO = process.env.ZKROSS_REPO ?? path.join(here, "../../..");
const OUT = path.join(REPO, "contracts/ethereum/out");

export const poolAbi = JSON.parse(fs.readFileSync(path.join(OUT, "ShieldedPool.sol/ShieldedPool.json"), "utf8")).abi;
export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function transfer(address, uint256) returns (bool)",
  "function mint(address, uint256)",
]);

const words8 = (p: Proved) => p.words.map(BigInt) as unknown as readonly bigint[];

/** policy_tx_2_2_gvk_T: 4 ciphertexts (in0, in1, out0, out1), then D, nonce,
 * root, publicAmount, extDataHash, 2 nullifiers, 2 commitments. */
export function transactProof(p: Proved) {
  const s = p.public_signals;
  return {
    proof: words8(p),
    root: BigInt(s[23]),
    inputNullifiers: [BigInt(s[26]), BigInt(s[27])],
    outputCommitment0: BigInt(s[28]),
    outputCommitment1: BigInt(s[29]),
    publicAmount: BigInt(s[24]),
    extDataHash: s[25],
    outputGvkCiphertexts: [ct(s, 2, 4), ct(s, 3, 4)],
    inputGvkCiphertexts: [ct(s, 0, 4), ct(s, 1, 4)],
  };
}

/** bridge_out: 6 ciphertexts, then D, nonce, root, extDataHash, 2 nullifiers,
 * 2 change commitments, C, refund, scale, asset, src, dst, deadline. */
export function bridgeOutProof(p: Proved) {
  const s = p.public_signals;
  return {
    proof: words8(p),
    root: BigInt(s[33]),
    inputNullifiers: [BigInt(s[35]), BigInt(s[36])],
    changeCommitment0: BigInt(s[37]),
    changeCommitment1: BigInt(s[38]),
    bridgeMessage: BigInt(s[39]),
    refundCommitment: BigInt(s[40]),
    deadlineBucket: BigInt(s[45]),
    extDataHash: s[34],
    ciphertexts: [0, 1, 2, 3, 4, 5].map((i) => ct(s, i, 6)),
  };
}

/** bridge_in: 2 ciphertexts, then D, nonce, remoteRoot, extDataHash, claim
 * nullifier, 2 commitments, scale, asset, src, dst, deadline. */
export function bridgeInProof(p: Proved) {
  const s = p.public_signals;
  return {
    proof: words8(p),
    remoteRoot: BigInt(s[13]),
    claimNullifier: BigInt(s[15]),
    outputCommitment0: BigInt(s[16]),
    outputCommitment1: BigInt(s[17]),
    deadlineBucket: BigInt(s[22]),
    extDataHash: s[14],
    ciphertexts: [ct(s, 0, 2), ct(s, 1, 2)],
  };
}

function ct(s: Hex[], i: number, n: number) {
  const c = ciphertext(s, i, n);
  return { r: { x: BigInt(c.r.x), y: BigInt(c.r.y) }, c1: BigInt(c.c1), c2: BigInt(c.c2), c3: BigInt(c.c3) };
}

/** Note-tree leaves in index order, from NewCommitment events. */
export async function noteLeaves(client: PublicClient, pool: Address, fromBlock: bigint): Promise<Hex[]> {
  const logs = await client.getLogs({
    address: pool,
    event: getAbiItem({ abi: poolAbi, name: "NewCommitment" }) as any,
    fromBlock,
  });
  const leaves: Hex[] = [];
  for (const l of logs as any[]) leaves[Number(l.args.index)] = `0x${BigInt(l.args.commitment).toString(16).padStart(64, "0")}`;
  return leaves;
}

/** Outbox leaves (pairs (C, 0)) in index order, from BridgeOut events. */
export async function outboxLeaves(client: PublicClient, pool: Address, fromBlock: bigint): Promise<Hex[]> {
  const logs = await client.getLogs({ address: pool, event: getAbiItem({ abi: poolAbi, name: "BridgeOut" }) as any, fromBlock });
  const leaves: Hex[] = [];
  for (const l of logs as any[]) {
    const i = Number(l.args.outboxIndex);
    leaves[i] = `0x${BigInt(l.args.bridgeMessage).toString(16).padStart(64, "0")}`;
    leaves[i + 1] = `0x${"0".repeat(64)}`;
  }
  return leaves;
}
