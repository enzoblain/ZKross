// Note delivery (SPEC.md A "Note delivery", B10): every note a transaction
// creates is also published on-chain, encrypted to its owner's X25519 key
// (derived from the identity wallet's signature, keys.ts), in the pools'
// encryptedOutput / encryptedRefund / encryptedBridgeMessage fields. Those
// bytes are part of the external data each proof is bound to, so nobody can
// swap them. recovery.ts rebuilds a private balance from them on any device.
// Plaintexts: a note is SPP's 48 bytes `amount (16 LE) ‖ blinding (32 LE)`;
// a bridge message is `amount (32 BE) ‖ claim_secret (32 BE) ‖ deadline_bucket
// (8 BE)`, 72 bytes.
import { prover } from './zk/prover'
import type { Hex } from './zk/types'

const hexOf = (bytes: Uint8Array): Hex => `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
const bytesOf = (hex: Hex): Uint8Array => Uint8Array.from(hex.slice(2).match(/../g) ?? [], (b) => Number.parseInt(b, 16))

function be(value: bigint, size: number): Uint8Array {
  const out = new Uint8Array(size)
  for (let i = size - 1, v = value; i >= 0; i--, v >>= 8n) out[i] = Number(v & 0xffn)
  return out
}
const le = (value: bigint, size: number) => be(value, size).reverse()
const fromBe = (bytes: Uint8Array) => bytes.reduce((v, b) => (v << 8n) | BigInt(b), 0n)
const fromLe = (bytes: Uint8Array) => fromBe(bytes.slice().reverse())

export const notePlaintext = (amount: bigint, blinding: Hex): Hex => hexOf(new Uint8Array([...le(amount, 16), ...le(BigInt(blinding), 32)]))

export function readNote(plaintext: Hex | null): { amount: bigint; blinding: Hex } | null {
  if (!plaintext) return null
  const b = bytesOf(plaintext)
  if (b.length !== 48) return null
  return { amount: fromLe(b.slice(0, 16)), blinding: `0x${fromLe(b.slice(16)).toString(16).padStart(64, '0')}` as Hex }
}

export const bridgePlaintext = (amount: bigint, claimSecret: Hex, deadlineBucket: bigint): Hex =>
  hexOf(new Uint8Array([...be(amount, 32), ...be(BigInt(claimSecret), 32), ...be(deadlineBucket, 8)]))

export function readBridge(plaintext: Hex | null): { amount: bigint; claimSecret: Hex; deadlineBucket: bigint } | null {
  if (!plaintext) return null
  const b = bytesOf(plaintext)
  if (b.length !== 72) return null
  return {
    amount: fromBe(b.slice(0, 32)),
    claimSecret: `0x${fromBe(b.slice(32, 64)).toString(16).padStart(64, '0')}` as Hex,
    deadlineBucket: fromBe(b.slice(64)),
  }
}

/** A note's encrypted output, for its owner's encryption key. */
export const sealNote = (encPk: Hex, amount: bigint, blinding: Hex) => prover.encryptTo(encPk, notePlaintext(amount, blinding))

/** The two encrypted outputs of a 2-output transaction, all for one owner. */
export const sealOutputs = async (encPk: Hex, outputs: { amount: bigint | string; blinding: Hex }[]) => {
  const [output0, output1] = await Promise.all(outputs.map((o) => sealNote(encPk, BigInt(o.amount), o.blinding)))
  return { output0, output1 }
}

export const sealBridge = (encPk: Hex, amount: bigint, claimSecret: Hex, deadlineBucket: bigint) =>
  prover.encryptTo(encPk, bridgePlaintext(amount, claimSecret, deadlineBucket))
