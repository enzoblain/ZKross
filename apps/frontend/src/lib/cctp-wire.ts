// Official Circle CCTP V2 testnet deployments, checked 2026-10-25.
// https://developers.circle.com/cctp/references/stellar-contracts
// https://developers.circle.com/cctp/references/contract-addresses
import { StrKey } from '@stellar/stellar-sdk'
import { bytesToHex, hexToBytes, type Hex } from 'viem'

export const cctpTestnet = {
  iris: 'https://iris-api-sandbox.circle.com',
  sepolia: {
    domain: 0,
    messenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
    transmitter: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275',
  },
  stellar: {
    domain: 27,
    messenger: 'CDNG7HXAPBWICI2E3AUBP3YZWZELJLYSB6F5CC7WLDTLTHVM74SLRTHP',
    transmitter: 'CBJ6MTCKKZG73PMDZCJMSFRD7DQEMI4FKDH7CGDSV4W6FHCRBCQAVVJY',
    forwarder: 'CA66Q2WFBND6V4UEB7RD4SAXSVIWMD6RA4X3U32ELVFGXV5PJK4T4VSZ',
  },
} as const

export function forwarderHook(recipient: string): Hex {
  if (!(StrKey.isValidContract(recipient) || StrKey.isValidEd25519PublicKey(recipient) || StrKey.isValidMed25519PublicKey(recipient))) {
    throw new Error('Invalid Stellar recipient.')
  }
  const text = new TextEncoder().encode(recipient)
  const data = new Uint8Array(32 + text.length)
  new DataView(data.buffer).setUint32(28, text.length, false)
  data.set(text, 32)
  return bytesToHex(data)
}

/** Both fields must name the forwarder; a direct G-address mint can strand funds. */
export function stellarForwarding(recipient: string) {
  const forwarder = bytesToHex(StrKey.decodeContract(cctpTestnet.stellar.forwarder))
  return { destinationDomain: 27, mintRecipient: forwarder, destinationCaller: forwarder, hookData: forwarderHook(recipient) } as const
}

export function stellarToCctpAmount(stroops: bigint): bigint {
  if (stroops <= 0n || stroops % 10n !== 0n) throw new Error('Stellar USDC must be positive and exactly representable at six decimals.')
  return stroops / 10n
}

function hex(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x(?:[0-9a-fA-F]{2})+$/.test(value)
}

export type AttestedMessage = { message: Hex; attestation: Hex; nonce: Hex }

/** One bounded request; caller schedules retries and persists the burn hash.
 * API completion is not signature verification or mint confirmation. The official
 * destination transmitter MUST verify the attestation and enforce nonce replay protection.
 */
export async function fetchAttestations(source: 0 | 27, transactionHash: string, signal?: AbortSignal): Promise<AttestedMessage[] | null> {
  if (source !== 0 && source !== 27) throw new Error('Unsupported source domain.')
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(transactionHash)) throw new Error('Invalid burn transaction hash.')
  const url = new URL(`/v2/messages/${source}`, cctpTestnet.iris)
  url.searchParams.set('transactionHash', transactionHash)
  const timeout = AbortSignal.timeout(15_000)
  const response = await fetch(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Circle attestation request failed (HTTP ${response.status}). Retry using the saved burn hash.`)
  const body: unknown = await response.json()
  if (!body || typeof body !== 'object' || !('messages' in body) || !Array.isArray(body.messages)) throw new Error('Malformed Circle response.')
  const ready: AttestedMessage[] = []
  for (const item of body.messages) {
    if (!item || typeof item !== 'object') throw new Error('Malformed Circle message.')
    if (item.status !== 'complete') continue
    if (!hex(item.message) || !hex(item.attestation)) throw new Error('Invalid attestation bytes.')
    const bytes = hexToBytes(item.message)
    if (bytes.length < 148) throw new Error('Truncated CCTP header.')
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (view.getUint32(0) !== 1 || view.getUint32(4) !== source || view.getUint32(8) !== (source === 0 ? 27 : 0)) throw new Error('Unexpected CCTP version or route.')
    const nonce = bytesToHex(bytes.slice(12, 44))
    if (BigInt(nonce) === 0n) throw new Error('Unassigned CCTP nonce.')
    if (ready.some((message) => message.nonce === nonce)) throw new Error('Duplicate CCTP nonce.')
    ready.push({ message: item.message, attestation: item.attestation, nonce })
  }
  return ready.length ? ready : null
}
