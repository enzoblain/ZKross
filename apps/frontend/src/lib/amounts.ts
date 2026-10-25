// Exact USDC amounts as bigint base units (SPEC.md B1): 7 decimals on
// Stellar, 6 on Ethereum. A bridge message carries 10^-6 USDC units, and a
// note on chain X holds message units × scale(X). Nothing is ever rounded.
import { protocol } from './config'
import type { NetworkId } from './networks'

/** Bridge messages use 6 decimals. */
export const BRIDGE_DECIMALS = 6

/** Parses a decimal string; null if invalid or more precise than `decimals`. */
export function parseUnits(input: string, decimals: number): bigint | null {
  const match = /^(\d*)(?:\.(\d*))?$/.exec(input.trim())
  if (!match) return null
  const [, whole, fraction = ''] = match
  if (whole === '' && fraction === '') return null
  if (fraction.length > decimals) return null
  return BigInt((whole || '0') + fraction.padEnd(decimals, '0'))
}

/** Formats base units, trimming trailing zeros down to `minFraction` digits. */
export function formatUnits(value: bigint, decimals: number, minFraction = 2): string {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  let fraction = digits.slice(digits.length - decimals)
  while (fraction.length > minFraction && fraction.endsWith('0')) fraction = fraction.slice(0, -1)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`
}

/** A note amount on `network` for a bridge-message amount. */
export const toNoteAmount = (network: NetworkId, messageAmount: bigint) =>
  messageAmount * protocol.scale[network]

/** The bridge-message amount for a note amount; throws if it isn't a whole unit. */
export function toMessageAmount(network: NetworkId, noteAmount: bigint): bigint {
  const scale = protocol.scale[network]
  if (noteAmount % scale !== 0n) {
    throw new Error(`${noteAmount} is not a multiple of ${scale} (SPEC.md B1)`)
  }
  return noteAmount / scale
}

export const formatNote = (network: NetworkId, noteAmount: bigint) =>
  formatUnits(noteAmount, protocol.decimals[network])

export const formatMessage = (messageAmount: bigint) => formatUnits(messageAmount, BRIDGE_DECIMALS)
