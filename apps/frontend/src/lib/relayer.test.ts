import { describe, expect, it } from 'vitest'

import { toWire } from './relayer'

describe('relayer wire format', () => {
  it('sends big integers as decimal strings, bytes as hex and deadlines as numbers', () => {
    expect(
      toWire({
        proof: { a: new Uint8Array([0, 1, 255]), root: 21888242871839275222246405745257275088548364400416034343698204186575808495616n },
        deadline_bucket: 491234n,
        ext_data: { ext_amount: -5000000n, recipient: 'GABC', encrypted_output0: new Uint8Array([1]) },
        words: [1n, 2n],
      }),
    ).toEqual({
      proof: { a: '0001ff', root: '21888242871839275222246405745257275088548364400416034343698204186575808495616' },
      deadline_bucket: 491234,
      ext_data: { ext_amount: '-5000000', recipient: 'GABC', encrypted_output0: '01' },
      words: ['1', '2'],
    })
  })
})
