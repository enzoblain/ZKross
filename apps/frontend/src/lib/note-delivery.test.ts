// Note delivery with the browser WASM prover: SPP's 48-byte note and the
// 72-byte bridge message round-trip, and only the owner's key opens them.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { bridgePlaintext, notePlaintext, readBridge, readNote } from './note-delivery'
import type { Hex, ProverWasm } from './zk/types'

const zk = new URL('../../public/zk/', import.meta.url)
const wasmJs = fileURLToPath(new URL('zkross_prover_wasm.js', zk))
const hasWasm = existsSync(wasmJs) && existsSync(fileURLToPath(new URL('zkross_prover_wasm_bg.wasm', zk)))

const blinding = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' as Hex

describe('note delivery plaintexts', () => {
  it("encodes a note in SPP's 48-byte format and reads it back", () => {
    const p = notePlaintext(12_345_678n, blinding)
    expect((p.length - 2) / 2).toBe(48)
    expect(p.slice(2, 10)).toBe('4e61bc00') // 12 345 678 little endian
    expect(readNote(p)).toEqual({ amount: 12_345_678n, blinding })
  })

  it('encodes a bridge message in 72 bytes and reads it back', () => {
    const p = bridgePlaintext(1_000_000n, blinding, 491_234n)
    expect((p.length - 2) / 2).toBe(72)
    expect(readBridge(p)).toEqual({ amount: 1_000_000n, claimSecret: blinding, deadlineBucket: 491_234n })
  })

  it('rejects anything of another size', () => {
    expect(readNote('0x01')).toBeNull()
    expect(readBridge(notePlaintext(1n, blinding))).toBeNull()
    expect(readNote(null)).toBeNull()
  })
})

describe('note delivery with the WASM prover', () => {
  it.skipIf(!hasWasm)('encrypts to an identity, which alone decrypts it', async () => {
    const w = (await import(/* @vite-ignore */ pathToFileURL(wasmJs).href)) as ProverWasm
    await w.default({ module_or_path: readFileSync(fileURLToPath(new URL('zkross_prover_wasm_bg.wasm', zk))) })
    const me = JSON.parse(w.encryptionKey('0x' + 'ab'.repeat(65))) as { sk: Hex; pk: Hex }
    const other = JSON.parse(w.encryptionKey('0x' + 'cd'.repeat(65))) as { sk: Hex; pk: Hex }
    expect(JSON.parse(w.encryptionKey('0x' + 'ab'.repeat(65)))).toEqual(me)

    const plain = notePlaintext(5_000_000n, blinding)
    const { ciphertext } = JSON.parse(w.encryptTo(me.pk, plain)) as { ciphertext: Hex }
    expect((ciphertext.length - 2) / 2).toBe(32 + 24 + 48 + 16)
    expect(JSON.parse(w.decryptFrom(me.sk, ciphertext)).plaintext).toBe(plain)
    expect(JSON.parse(w.decryptFrom(other.sk, ciphertext)).plaintext).toBeNull()
    // The old placeholder payloads are not errors, just not ours.
    expect(JSON.parse(w.decryptFrom(me.sk, '0x01')).plaintext).toBeNull()
  })
})
