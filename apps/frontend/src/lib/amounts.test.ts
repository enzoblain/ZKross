import { describe, expect, it } from 'vitest'

import {
  formatMessage,
  formatNote,
  formatUnits,
  parseUnits,
  toMessageAmount,
  toNoteAmount,
} from './amounts'

describe('exact USDC amounts', () => {
  it('parses and formats bridge-message units without floating point', () => {
    expect(parseUnits('1.234567', 6)).toBe(1_234_567n)
    expect(parseUnits('.5', 6)).toBe(500_000n)
    expect(parseUnits('1.2345678', 6)).toBeNull()
    expect(parseUnits('-1', 6)).toBeNull()
    expect(formatMessage(1_234_567n)).toBe('1.234567')
    expect(formatUnits(1_000_000n, 6)).toBe('1.00')
  })

  it('scales bridge units to each chain note unit exactly', () => {
    expect(toNoteAmount('ethereum', 1_234_567n)).toBe(1_234_567n)
    expect(toNoteAmount('stellar', 1_234_567n)).toBe(12_345_670n)
    expect(toMessageAmount('ethereum', 1_234_567n)).toBe(1_234_567n)
    expect(toMessageAmount('stellar', 12_345_670n)).toBe(1_234_567n)
    expect(formatNote('stellar', 12_345_670n)).toBe('1.234567')
  })

  it('rejects Stellar note values that would lose stroops', () => {
    expect(() => toMessageAmount('stellar', 12_345_678n)).toThrow('not a multiple of 10')
  })
})
