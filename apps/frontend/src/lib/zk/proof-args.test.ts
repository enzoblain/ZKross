import { describe, expect, it } from 'vitest'

import {
  SIGNALS,
  ethBridgeInProof,
  ethBridgeOutProof,
  ethTransactProof,
  stellarBridgeInProof,
} from './proof-args'
import type { Hex, Proved } from './types'

const hex = (value: number): Hex => `0x${value.toString(16).padStart(64, '0')}`

function proved(signals: number): Proved {
  return {
    proof: `0x${'00'.repeat(256)}`,
    words: Array.from({ length: 8 }, (_, index) => hex(index + 100)),
    public_signals: Array.from({ length: signals }, (_, index) => hex(index)),
  }
}

describe('proof public-signal mapping', () => {
  it('maps all 30 transact signals at their SPEC.md indexes', () => {
    const mapped = ethTransactProof(proved(SIGNALS.transact))
    expect(SIGNALS.transact).toBe(30)
    expect(mapped.root).toBe(23n)
    expect(mapped.publicAmount).toBe(24n)
    expect(mapped.extDataHash).toBe(hex(25))
    expect(mapped.inputNullifiers).toEqual([26n, 27n])
    expect([mapped.outputCommitment0, mapped.outputCommitment1]).toEqual([28n, 29n])
    expect(mapped.outputGvkCiphertexts[0]).toEqual({ r: { x: 4n, y: 5n }, c1: 10n, c2: 14n, c3: 18n })
  })

  it('maps all 46 bridge-out signals and six field-major ciphertexts', () => {
    const mapped = ethBridgeOutProof(proved(SIGNALS.bridgeOut))
    expect(SIGNALS.bridgeOut).toBe(46)
    expect(mapped.root).toBe(33n)
    expect(mapped.extDataHash).toBe(hex(34))
    expect(mapped.inputNullifiers).toEqual([35n, 36n])
    expect([mapped.changeCommitment0, mapped.changeCommitment1]).toEqual([37n, 38n])
    expect(mapped.bridgeMessage).toBe(39n)
    expect(mapped.refundCommitment).toBe(40n)
    expect(mapped.deadlineBucket).toBe(45n)
    expect(mapped.ciphertexts[5]).toEqual({ r: { x: 10n, y: 11n }, c1: 17n, c2: 23n, c3: 29n })
  })

  it('maps all 23 bridge-in signals for Ethereum and Stellar', () => {
    const input = proved(SIGNALS.bridgeIn)
    const ethereum = ethBridgeInProof(input)
    const stellar = stellarBridgeInProof(input)
    expect(SIGNALS.bridgeIn).toBe(23)
    expect(ethereum.remoteRoot).toBe(13n)
    expect(ethereum.extDataHash).toBe(hex(14))
    expect(ethereum.claimNullifier).toBe(15n)
    expect([ethereum.outputCommitment0, ethereum.outputCommitment1]).toEqual([16n, 17n])
    expect(ethereum.deadlineBucket).toBe(22n)
    expect(ethereum.ciphertexts[1]).toEqual({ r: { x: 2n, y: 3n }, c1: 5n, c2: 7n, c3: 9n })
    expect(stellar.remote_root).toBe(13n)
    expect(stellar.ext_data_hash).toEqual(Uint8Array.from({ length: 32 }, (_, index) => index === 31 ? 14 : 0))
    expect(stellar.proof.a).toHaveLength(64)
    expect(stellar.proof.b).toHaveLength(128)
    expect(stellar.proof.c).toHaveLength(64)
  })

  it('rejects a proof with the wrong signal count', () => {
    expect(() => ethBridgeOutProof(proved(45))).toThrow('expected 46 public signals')
  })
})
