// The transfer flow in both directions with fake pools, prover and wallets:
// one note key from the identity wallet (chosen once, on either chain) owns
// the notes on both chains, the destination wallet is never asked for
// anything, the claim and withdrawal always go through the relayer, and a
// note kept private on arrival can be bridged back from the private balance.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NetworkId } from './networks'
import type { Pool } from './pools'
import type { Hex } from './zk/types'

const WALLET: Record<NetworkId, string> = { ethereum: '0xA11CE', stellar: 'GALICE' }
const TYPED: Record<NetworkId, string> = { ethereum: '0xF4E5', stellar: 'GFRESH' }
const KEYS: Record<string, { sk: Hex; pk: Hex; encSk: Hex; encPk: Hex }> = {
  [WALLET.ethereum]: { sk: '0x5e', pk: '0x9b', encSk: '0xe5', encPk: '0xe6' },
  [WALLET.stellar]: { sk: '0x5f', pk: '0x9c', encSk: '0xf5', encPk: '0xf6' },
}
/** The identity: the MetaMask wallet, used whichever chain the transfer starts from. */
const IDENTITY = { network: 'ethereum' as NetworkId, address: WALLET.ethereum }
const KEY = KEYS[WALLET.ethereum]

const h = vi.hoisted(() => ({
  leaves: [] as string[],
  calls: [] as { network: string; fn: string; account: string; recipient?: string; amount?: bigint; via?: string }[],
  requests: {} as Record<string, unknown>,
  failRelay: '' as string,
  counter: 0,
}))

vi.mock('./keys', () => ({ noteKey: vi.fn(async (_network: string, address: string) => KEYS[address]) }))

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
      encryptTo: async (pk: string, plaintext: string) => `0xenc:${pk}:${plaintext}`,
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
      transact: async (account, _proof, recipient, extAmount, _enc, _onApprove, via) =>
        sent(network, 'transact', account, via, recipient, extAmount),
      bridgeOut: async (account, _proof, _enc, via) => {
        const r = sent(network, 'bridgeOut', account, via)
        status = 'pending'
        return r
      },
      bridgeIn: async (account, _proof, _enc, via) => sent(network, 'bridgeIn', account, via),
    }
  }
  return { pools: { ethereum: pool('ethereum'), stellar: pool('stellar') } }
})

const { noteKey } = await import('./keys')
const { createTransfer, runTransfer } = await import('./bridge-flow')
const store = await import('./store')

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
  const start = () =>
    createTransfer({ from, to, amount: 1_000_000n, identity: IDENTITY, sender: WALLET[from], recipient: TYPED[to] })

  it('derives the note key from the identity wallet, whichever chain the transfer starts from', async () => {
    const t = start()
    await runTransfer(t, () => {})

    expect(t.status).toBe('withdrawn')
    expect(vi.mocked(noteKey).mock.calls.length).toBeGreaterThan(0)
    expect(vi.mocked(noteKey).mock.calls.every(([network, address]) => network === 'ethereum' && address === WALLET.ethereum)).toBe(true)
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

  it('sends the bridge out through the relayer too, never from the wallet', async () => {
    const t = start()
    await runTransfer(t, () => {})

    expect(h.calls.find((c) => c.fn === 'bridgeOut')).toMatchObject({ network: from, account: '', via: 'relayer' })
  })

  it('stops where the relayer failed the claim, and resumes from there', async () => {
    h.failRelay = 'bridgeIn'
    const t = start()
    await expect(runTransfer(t, () => {})).rejects.toThrow('not answering')
    expect(t.status).toBe('rootPosted')

    h.failRelay = ''
    h.calls = []
    await runTransfer(t, () => {})
    expect(t.status).toBe('withdrawn')
    expect(h.calls.map((c) => c.fn)).toEqual(['bridgeIn', 'transact'])
  })
})

describe.each([
  ['stellar', 'ethereum'],
  ['ethereum', 'stellar'],
] as [NetworkId, NetworkId][])('round trip %s → %s → back, from the private balance', (from, to) => {
  it('keeps the claimed note private, then bridges it back with no wallet but the identity', async () => {
    const out = createTransfer({ from, to, amount: 1_000_000n, identity: IDENTITY, sender: WALLET[from], recipient: '', keepPrivate: true })
    await runTransfer(out, () => {})

    expect(out.status).toBe('kept')
    expect(h.calls.filter((c) => c.network === to).map((c) => c.fn)).toEqual(['bridgeIn'])
    const claimed = out.claimNotes![0].commitment
    expect(store.notes(to, KEY.pk).map((n) => n.commitment)).toContain(claimed)

    h.calls = []
    const back = createTransfer({ from: to, to: from, amount: 1_000_000n, identity: IDENTITY, recipient: TYPED[from] })
    await runTransfer(back, () => {})

    expect(back.status).toBe('withdrawn')
    expect(back.txs.deposit).toBeUndefined()
    // No wallet sends anything: the private note pays for the bridge out.
    expect(h.calls.every((c) => c.via === 'relayer')).toBe(true)
    expect(h.requests.bridgeOut).toMatchObject({ inputs: [expect.objectContaining({ sk: KEY.sk }), expect.anything()] })
    expect(back.inputs).toEqual([claimed])
    expect(store.notes(to, KEY.pk).map((n) => n.commitment)).not.toContain(claimed)
  })
})

it('asks for the source wallet when the private balance does not cover the amount', async () => {
  const t = createTransfer({ from: 'stellar', to: 'ethereum', amount: 1_000_000n, identity: IDENTITY, recipient: TYPED.ethereum })
  await expect(runTransfer(t, () => {})).rejects.toThrow('connect your Freighter wallet to deposit')
  expect(h.calls).toEqual([])
})

it('resumes after the relayer failed the bridge out, without depositing again', async () => {
  h.failRelay = 'bridgeOut'
  const t = createTransfer({ from: 'stellar', to: 'ethereum', amount: 1_000_000n, identity: IDENTITY, sender: WALLET.stellar, recipient: TYPED.ethereum })
  await expect(runTransfer(t, () => {})).rejects.toThrow('not answering')
  expect(t.status).toBe('deposited')

  h.failRelay = ''
  h.calls = []
  await runTransfer(t, () => {})
  expect(t.status).toBe('withdrawn')
  expect(h.calls.filter((c) => c.via !== 'relayer')).toEqual([])
})

it('treats a record from before the identity wallet as finished, and never resumes it', async () => {
  const t = createTransfer({ from: 'ethereum', to: 'stellar', amount: 1_000_000n, identity: IDENTITY, sender: WALLET.ethereum, recipient: TYPED.stellar })
  const old = { ...t, identity: undefined } as unknown as typeof t
  expect(store.isFinished(old)).toBe(true)
  await expect(runTransfer(old, () => {})).rejects.toThrow('older version of ZKross')
  expect(noteKey).not.toHaveBeenCalled()
  expect(h.calls).toEqual([])
})
