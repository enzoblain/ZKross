import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToHex, hexToBytes } from 'viem'
import { cctpTestnet, fetchAttestations, forwarderHook, stellarForwarding, stellarToCctpAmount } from './cctp-wire'

const hash = `0x${'12'.repeat(32)}`
function message(source = 0, destination = 27) {
  const bytes = new Uint8Array(149)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 1); view.setUint32(4, source); view.setUint32(8, destination)
  bytes[43] = 1
  return bytesToHex(bytes)
}
function response(messages: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages }))))
}
afterEach(() => vi.unstubAllGlobals())
describe('Circle Stellar wire format', () => {
  it('routes mint and caller to the official forwarder', () => {
    const plan = stellarForwarding(cctpTestnet.stellar.messenger)
    expect(plan.destinationCaller).toBe(plan.mintRecipient)
    expect(hexToBytes(plan.mintRecipient)).toHaveLength(32)
    expect(plan.destinationDomain).toBe(27)
  })
  it('encodes the reserved bytes, version, big-endian length and strkey', () => {
    const bytes = hexToBytes(forwarderHook(cctpTestnet.stellar.messenger))
    expect(Array.from(bytes.slice(0, 28))).toEqual(Array(28).fill(0))
    expect(new DataView(bytes.buffer).getUint32(28)).toBe(56)
    expect(new TextDecoder().decode(bytes.slice(32))).toBe(cctpTestnet.stellar.messenger)
  })
  it('rejects invalid recipients', () => expect(() => forwarderHook('Ginvalid')).toThrow())
  it('converts exact amounts without rounding', () => {
    expect(stellarToCctpAmount(10_000_000n)).toBe(1_000_000n)
    for (const amount of [0n, -10n, 11n]) expect(() => stellarToCctpAmount(amount)).toThrow()
  })
})
describe('Iris attestation retrieval', () => {
  it('uses the sandbox endpoint and returns canonical attested bytes', async () => {
    response([{ status: 'complete', message: message(), attestation: '0xabcd' }])
    const result = await fetchAttestations(0, hash)
    expect(result?.[0].message).toBe(message())
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(`${cctpTestnet.iris}/v2/messages/0?transactionHash=${hash}`)
  })
  it('supports the reverse domain pair', async () => {
    response([{ status: 'complete', message: message(27, 0), attestation: '0xab' }])
    expect(await fetchAttestations(27, hash.slice(2))).toHaveLength(1)
  })
  it('leaves incomplete attestations pending', async () => {
    response([{ status: 'pending_confirmations', attestation: 'PENDING' }])
    expect(await fetchAttestations(0, hash)).toBeNull()
  })
  it('treats a missing message as pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    expect(await fetchAttestations(0, hash)).toBeNull()
  })
  it.each([429, 500])('surfaces HTTP %s for retry without fabricating a result', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })))
    await expect(fetchAttestations(0, hash)).rejects.toThrow(`HTTP ${status}`)
  })
  it('rejects malformed and wrong-route complete messages', async () => {
    for (const item of [ { message: '0xaa', attestation: '0xbb' }, { message: message(0, 1), attestation: '0xbb' }, { message: message(), attestation: 'PENDING' } ]) {
      response([{ ...item, status: 'complete' }])
      await expect(fetchAttestations(0, hash)).rejects.toThrow()
    }
  })
  it('rejects duplicate nonces in one API result', async () => {
    const item = { status: 'complete', message: message(), attestation: '0xab' }
    response([item, item])
    await expect(fetchAttestations(0, hash)).rejects.toThrow('Duplicate')
  })
  it('rejects zero template nonces', async () => {
    const bytes = hexToBytes(message()); bytes[43] = 0
    response([{ status: 'complete', message: bytesToHex(bytes), attestation: '0xab' }])
    await expect(fetchAttestations(0, hash)).rejects.toThrow('Unassigned')
  })
  it('rejects invalid burn hashes before any request', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    await expect(fetchAttestations(0, 'sim_cctp_123')).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('surfaces interruptions', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(fetchAttestations(0, hash)).rejects.toThrow('offline')
  })
})
