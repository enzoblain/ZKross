// Contract arguments from a proof's public signals (SPEC.md A, B8), ported
// from services/bridge/src/lib/{eth,stellar}.ts. Ciphertexts are
// field-major: all R.x, all R.y, all c1, all c2, all c3.
import type { Hex, Proved } from './types'

type Ciphertext = { r: { x: bigint; y: bigint }; c1: bigint; c2: bigint; c3: bigint }

/** Ciphertext `i` of `n`. */
export function ciphertext(s: Hex[], i: number, n: number): Ciphertext {
  return {
    r: { x: BigInt(s[2 * i]), y: BigInt(s[2 * i + 1]) },
    c1: BigInt(s[2 * n + i]),
    c2: BigInt(s[3 * n + i]),
    c3: BigInt(s[4 * n + i]),
  }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

function hexBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(2 * i, 2 * i + 2), 16)
  return out
}

/** The public-signal counts of each circuit. */
export const SIGNALS = { transact: 30, bridgeOut: 46, bridgeIn: 23 }

function expect(p: Proved, n: number) {
  if (p.public_signals.length !== n) {
    throw new Error(`expected ${n} public signals, got ${p.public_signals.length}`)
  }
  return p.public_signals
}

// ========== Ethereum (ShieldedPool's structs) ==========

const words = (p: Proved) =>
  p.words.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]

/** policy_tx_2_2_gvk_T: 4 ciphertexts (in0, in1, out0, out1), then D, nonce,
 * root, publicAmount, extDataHash, 2 nullifiers, 2 commitments. */
export function ethTransactProof(p: Proved) {
  const s = expect(p, SIGNALS.transact)
  return {
    proof: words(p),
    root: BigInt(s[23]),
    inputNullifiers: [BigInt(s[26]), BigInt(s[27])],
    outputCommitment0: BigInt(s[28]),
    outputCommitment1: BigInt(s[29]),
    publicAmount: BigInt(s[24]),
    extDataHash: s[25],
    outputGvkCiphertexts: [ciphertext(s, 2, 4), ciphertext(s, 3, 4)],
    inputGvkCiphertexts: [ciphertext(s, 0, 4), ciphertext(s, 1, 4)],
  }
}

/** bridge_out: 6 ciphertexts, then D, nonce, root, extDataHash, 2 nullifiers,
 * 2 change commitments, C, refund, scale, asset, src, dst, deadline. */
export function ethBridgeOutProof(p: Proved) {
  const s = expect(p, SIGNALS.bridgeOut)
  return {
    proof: words(p),
    root: BigInt(s[33]),
    inputNullifiers: [BigInt(s[35]), BigInt(s[36])],
    changeCommitment0: BigInt(s[37]),
    changeCommitment1: BigInt(s[38]),
    bridgeMessage: BigInt(s[39]),
    refundCommitment: BigInt(s[40]),
    deadlineBucket: BigInt(s[45]),
    extDataHash: s[34],
    ciphertexts: range(6).map((i) => ciphertext(s, i, 6)),
  }
}

/** bridge_in: 2 ciphertexts, then D, nonce, remoteRoot, extDataHash, claim
 * nullifier, 2 commitments, scale, asset, src, dst, deadline. */
export function ethBridgeInProof(p: Proved) {
  const s = expect(p, SIGNALS.bridgeIn)
  return {
    proof: words(p),
    remoteRoot: BigInt(s[13]),
    claimNullifier: BigInt(s[15]),
    outputCommitment0: BigInt(s[16]),
    outputCommitment1: BigInt(s[17]),
    deadlineBucket: BigInt(s[22]),
    extDataHash: s[14],
    ciphertexts: [ciphertext(s, 0, 2), ciphertext(s, 1, 2)],
  }
}

// ========== Stellar (pool-gvk's contract types, native JS values) ==========

function groth16(p: Proved) {
  const b = hexBytes(p.proof)
  return { a: b.slice(0, 64), b: b.slice(64, 192), c: b.slice(192, 256) }
}

/** pool-gvk `Proof` (open policy: both ASP roots are 0). */
export function stellarTransactProof(p: Proved) {
  const s = expect(p, SIGNALS.transact)
  return {
    proof: groth16(p),
    root: BigInt(s[23]),
    input_nullifiers: [BigInt(s[26]), BigInt(s[27])],
    output_commitment0: BigInt(s[28]),
    output_commitment1: BigInt(s[29]),
    public_amount: BigInt(s[24]),
    ext_data_hash: hexBytes(s[25]),
    asp_membership_root: 0n,
    asp_non_membership_root: 0n,
    output_gvk_ciphertexts: [ciphertext(s, 2, 4), ciphertext(s, 3, 4)],
    input_gvk_ciphertexts: [ciphertext(s, 0, 4), ciphertext(s, 1, 4)],
  }
}

export function stellarBridgeOutProof(p: Proved) {
  const s = expect(p, SIGNALS.bridgeOut)
  return {
    proof: groth16(p),
    root: BigInt(s[33]),
    input_nullifiers: [BigInt(s[35]), BigInt(s[36])],
    change_commitment0: BigInt(s[37]),
    change_commitment1: BigInt(s[38]),
    bridge_message: BigInt(s[39]),
    refund_commitment: BigInt(s[40]),
    deadline_bucket: BigInt(s[45]),
    ext_data_hash: hexBytes(s[34]),
    ciphertexts: range(6).map((i) => ciphertext(s, i, 6)),
  }
}

export function stellarBridgeInProof(p: Proved) {
  const s = expect(p, SIGNALS.bridgeIn)
  return {
    proof: groth16(p),
    remote_root: BigInt(s[13]),
    claim_nullifier: BigInt(s[15]),
    output_commitment0: BigInt(s[16]),
    output_commitment1: BigInt(s[17]),
    deadline_bucket: BigInt(s[22]),
    ext_data_hash: hexBytes(s[14]),
    ciphertexts: [ciphertext(s, 0, 2), ciphertext(s, 1, 2)],
  }
}

export { hexBytes }
