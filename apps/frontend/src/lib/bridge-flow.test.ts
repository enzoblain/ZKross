// The transfer flow in both directions with fake pools, prover and wallet:
// one note key from the source wallet owns the notes on both chains, the
// destination wallet is never asked for anything, and the claim and
// withdrawal always go through the relayer to the typed address.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NetworkId } from './networks'
import type { Pool } from './pools'
import type { Hex } from './zk/types'

const KEY = { sk: '0x5e' as Hex, pk: '0x9b' as Hex }

const h = vi.hoisted(() => ({
  leaves: [] as string[],
  calls: [] as { network: string; fn: string; account: string; recipient?: string; amount?: bigint; via?: string }[],
  requests: {} as Record<string, unknown>,
  failRelay: '' as string,
  counter: 0,
}))

vi.mock('./keys', () => ({ noteKey: vi.fn(async () => KEY) }))

vi.mock('./stellar', () => ({ accountState: vi.fn(async () => 'exists') }))

vi.mock('./zk/prover', async (importOriginal) => {
  const original = await importOriginal<typeof import('./zk/prover')>()
  const fresh = () => {
    const c = `0x${(++h.counter).toString(16).padStart(4, '0')}`
    h.leaves.push(c)
    return c
  }
  return {
    ...original,
    prover: {
      commitment: async () => fresh(),
      buildTransact: async (req: unknown) => {
        h.requests[(req as { public_amount: string }).public_amount.length > 20 ? 'withdraw' : 'deposit'] = req
        return { nullifiers: ['0xaa', '0xbb'] }
      },
      buildBridgeOut: async (req: unknown) => {
        h.requests.bridgeOut = req
        return { bridge_message: '0xc0de', claim_nullifier: '0xc1a1', change_commitments: [fresh(), fresh()] }
      },
      buildBridgeIn: async (req: unknown) => {
        h.requests.bridgeIn = req
        return { commitments: [fresh(), fresh()] }
      },
      prove: async () => ({}),
      treeRoot: async () => '0x7007',
    },
  }
})

vi.mock('./pools', async () => {
  const { RelayerUnavailable } = await import('./relayer')
  const sent = (network: string, fn: string, account: string, via?: string, recipient?: string, amount?: bigint) => {
    h.calls.push({ network, fn, account, via, recipient, amount })
    if (via === 'relayer' && h.failRelay === fn) throw new RelayerUnavailable('The relayer is not answering.')
    return { hash: `${network}-${fn}` }
  }
  const pool = (network: NetworkId): Partial<Pool> => {
    let status: 'none' | 'pending' = 'none'
    return {
      network,
      adminViewKey: async () => ['0x1', '0x2'] as [Hex, Hex],
      noteLeaves: async () => h.leaves as Hex[],
      outboxLeaves: async () => ['0xc0de', '0x0'] as Hex[],
      isKnownRemoteRoot: async () => true,
      isClaimed: async () => false,
      isSpent: async () => false,
      bridgeStatus: async () => status,
      transactExtHash: async () => '0xe1' as Hex,
      bridgeOutExtHash: async () => '0xe2' as Hex,
      bridgeInExtHash: async () => '0xe3' as Hex,
      usdcBalance: async () => 10n ** 12n,
      transact: async (account, _proof, recipient, extAmount, _onApprove, via) =>
        sent(network, 'transact', account, via, recipient, extAmount),
      bridgeOut: async (account, _proof, via) => {
        const r = sent(network, 'bridgeOut', account, via)
        status = 'pending'
        return r
      },
      bridgeIn: async (account, _proof, via) => sent(network, 'bridgeIn', account, via),
    }
  }
  return { pools: { ethereum: pool('ethereum'), stellar: pool('stellar') } }
})

const { noteKey } = await import('./keys')
const { createTransfer, runTransfer } = await import('./bridge-flow')

const WALLET: Record<NetworkId, string> = { ethereum: '0xA11CE', stellar: 'GALICE' }
const TYPED: Record<NetworkId, string> = { ethereum: '0xF4E5', stellar: 'GFRESH' }

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    setTimeout: (f: () => void) => setTimeout(f, 0),
  })
  vi.mocked(noteKey).mockClear()
  h.leaves = []
  h.calls = []
  h.requests = {}
  h.failRelay = ''
})

describe.each([
  ['stellar', 'ethereum'],
  ['ethereum', 'stellar'],
] as [NetworkId, NetworkId][])('%s → %s', (from, to) => {
  const start = (via: 'relayer' | 'wallet' = 'relayer') =>
    createTransfer({ from, to, amount: 1_000_000n, sender: WALLET[from], recipient: TYPED[to], via })

  it('derives one note key from the source wallet and uses it on both chains', async () => {
    const t = start()
    await runTransfer(t, () => {})

    expect(t.status).toBe('withdrawn')
    expect(vi.mocked(noteKey).mock.calls.every(([network, address]) => network === from && address === WALLET[from])).toBe(true)
    expect(t.recipientPk).toBe(KEY.pk)
    expect(t.refundPk).toBe(KEY.pk)
    expect(h.requests.bridgeOut).toMatchObject({ recipient_pk: KEY.pk, refund_pk: KEY.pk })
    expect(h.requests.bridgeIn).toMatchObject({ recipient_sk: KEY.sk })
    expect(h.requests.withdraw).toMatchObject({ inputs: [expect.objectContaining({ sk: KEY.sk }), expect.anything()] })
  })

  it('needs the destination wallet for nothing: the relayer claims and withdraws to the typed address', async () => {
    const t = start()
    await runTransfer(t, () => {})

    expect(h.calls.filter((c) => c.network === to)).toEqual([
      { network: to, fn: 'bridgeIn', account: '', via: 'relayer', recipient: undefined, amount: undefined },
      expect.objectContaining({ network: to, fn: 'transact', account: '', via: 'relayer', recipient: TYPED[to] }),
    ])
    // The source wallet is only used on the source chain, for the deposit.
    const wallet = h.calls.filter((c) => c.via !== 'relayer')
    expect(wallet).toEqual([expect.objectContaining({ network: from, fn: 'transact', account: WALLET[from], recipient: WALLET[from] })])
    expect(wallet[0].amount! > 0n).toBe(true)
  })

  it('still claims and withdraws through the relayer when the user sends the bridge out', async () => {
    const t = start('wallet')
    await runTransfer(t, () => {})

    expect(h.calls.find((c) => c.fn === 'bridgeOut')).toMatchObject({ account: WALLET[from], via: 'wallet' })
    expect(h.calls.filter((c) => c.network === to).map((c) => c.via)).toEqual(['relayer', 'relayer'])
  })

  it('offers no "send it myself" fallback when the relayer fails the claim', async () => {
    h.failRelay = 'bridgeIn'
    const t = start()
    await expect(runTransfer(t, () => {})).rejects.toThrow('not answering')

    expect(t.status).toBe('rootPosted')
    expect(t.relayerFailed).toBe(false)
  })
})

it('offers the fallback when the relayer fails the bridge out', async () => {
  h.failRelay = 'bridgeOut'
  const t = createTransfer({ from: 'stellar', to: 'ethereum', amount: 1_000_000n, sender: WALLET.stellar, recipient: TYPED.ethereum })
  await expect(runTransfer(t, () => {})).rejects.toThrow('not answering')
  expect(t.relayerFailed).toBe(true)
})

it('refuses to resume a transfer started with a destination-wallet key', async () => {
  const t = createTransfer({ from: 'ethereum', to: 'stellar', amount: 1_000_000n, sender: WALLET.ethereum, recipient: TYPED.stellar })
  Object.assign(t, { recipientPk: '0x1111', refundPk: '0x2222', claimer: 'GBOB' })
  await expect(runTransfer(t, () => {})).rejects.toThrow('destination-wallet note key')
  expect(noteKey).not.toHaveBeenCalled()
})
