// The identity chosen once: it keeps the wallet's existing note key (same
// signed message), and only public data is stored.
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@stellar/freighter-api', () => ({ signMessage: vi.fn() }))
vi.mock('./zk/prover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./zk/prover')>()),
  prover: { pubkey: async (sk: string) => `0xpk${sk.slice(-6)}`, encryptionKey: async (sig: string) => ({ sk: `0xes${sig.slice(-6)}`, pk: `0xep${sig.slice(-6)}` }) },
}))

const { chooseIdentity, identity, noteKey } = await import('./keys')

let storage: Map<string, string>
const request = vi.fn(async () => `0x${'ab'.repeat(65)}`)

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    ethereum: { request },
  })
})

describe('identity', () => {
  it('is none until chosen, then the wallet and public key only', async () => {
    expect(identity()).toBeNull()
    const chosen = await chooseIdentity({ network: 'ethereum', address: '0xA11CE' })

    expect(identity()).toEqual(chosen)
    expect(chosen).toEqual({ network: 'ethereum', address: '0xA11CE', pk: (await noteKey('ethereum', '0xA11CE')).pk })
    const { sk } = await noteKey('ethereum', '0xA11CE')
    expect([...storage.values()].join()).not.toContain(sk.slice(2))
    // Nor the encryption secret derived from the same signature.
    const { encSk } = await noteKey('ethereum', '0xA11CE')
    expect([...storage.values()].join()).not.toContain(encSk.slice(2))
  })

  it('signs the v1 message, so the wallet keeps its existing notes', async () => {
    await chooseIdentity({ network: 'ethereum', address: '0xB0B' })
    const [{ params }] = request.mock.calls.at(-1) as unknown as [{ params: [string, string] }]
    const text = new TextDecoder().decode(Uint8Array.from(params[0].slice(2).match(/../g)!.map((b) => Number.parseInt(b, 16))))
    expect(text.startsWith('ZKross note key v1\nNetwork: Ethereum Sepolia\nAccount: 0xB0B\n')).toBe(true)
  })
})
