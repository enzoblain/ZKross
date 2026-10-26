// The private balance on its own, with fake pools, prover and wallets: a
// deposit, a bridge kept private and a withdrawal at different times and for
// different amounts; the withdrawal pays any public address through the
// relayer and leaves the change in the private balance.
import { beforeEach, expect, it, vi } from 'vitest'

import type { NetworkId } from './networks'
import type { Pool } from './pools'
import type { Hex } from './zk/types'

const WALLET: Record<NetworkId, string> = { ethereum: '0xA11CE', stellar: 'GALICE' }
const TYPED: Record<NetworkId, string> = { ethereum: '0xF4E5', stellar: 'GFRESH' }
const KEY = { sk: '0x5e' as Hex, pk: '0x9b' as Hex }
const IDENTITY = { network: 'ethereum' as NetworkId, address: WALLET.ethereum }

const h = vi.hoisted(() => ({
  leaves: [] as string[],
  calls: [] as { network: string; fn: string; account: string; recipient?: string; amount?: bigint; via?: string }[],
  requests: [] as unknown[],
  spent: new Set<string>(),
  /** Commitments not visible yet (RPC lag, or a deposit never sent). */
  hidden: new Set<string>(),
  /** The page closes while the wallet sends: the call never returns. */
  closeOnSend: false,
  trustline: true,
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
        h.requests.push(req)
        return { nullifiers: [`0xn${h.counter}`, '0xbb'] }
      },
      buildBridgeOut: async () => ({ bridge_message: '0xc0de', claim_nullifier: '0xc1a1', change_commitments: [fresh(), fresh()] }),
      buildBridgeIn: async () => ({ commitments: [fresh(), fresh()] }),
      prove: async () => ({}),
      treeRoot: async () => '0x7007',
    },
  }
})

vi.mock('./pools', async () => {
  const sent = (network: string, fn: string, account: string, via?: string, recipient?: string, amount?: bigint) => {
    h.calls.push({ network, fn, account, via, recipient, amount })
    if (h.closeOnSend) throw new Error('page closed')
    return { hash: `${network}-${fn}-${h.calls.length}` }
  }
  const pool = (network: NetworkId): Partial<Pool> => {
    let status: 'none' | 'pending' = 'none'
    return {
      network,
      adminViewKey: async () => ['0x1', '0x2'] as [Hex, Hex],
      noteLeaves: async () => h.leaves.filter((l) => !h.hidden.has(l)) as Hex[],
      outboxLeaves: async () => ['0xc0de', '0x0'] as Hex[],
      isKnownRemoteRoot: async () => true,
      isClaimed: async () => false,
      isSpent: async (nullifier) => h.spent.has(nullifier),
      bridgeStatus: async () => status,
      transactExtHash: async () => '0xe1' as Hex,
      bridgeOutExtHash: async () => '0xe2' as Hex,
      bridgeInExtHash: async () => '0xe3' as Hex,
      usdcBalance: async () => (network === 'stellar' && !h.trustline ? null : 10n ** 12n),
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

const { createMovement, runMovement } = await import('./balance-flow')
const { createTransfer, mergeSteps, runTransfer, settleWatched } = await import('./bridge-flow')
const { poolAddress } = await import('./config')
const store = await import('./store')

const USDC: Record<NetworkId, bigint> = { ethereum: 10n ** 6n, stellar: 10n ** 7n }

beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    setTimeout: (f: () => void) => setTimeout(f, 0),
  })
  h.leaves = []
  h.calls = []
  h.requests = []
  h.spent = new Set()
  h.hidden = new Set()
  h.closeOnSend = false
  h.trustline = true
})

const deposit = async (network: NetworkId, amount: bigint) => {
  const m = createMovement({ kind: 'deposit', network, amount, account: WALLET[network], identity: IDENTITY })
  await runMovement(m)
  return m
}

const withdraw = (network: NetworkId, amount: bigint, account = TYPED[network]) =>
  createMovement({ kind: 'withdraw', network, amount, account, identity: IDENTITY })

it('deposits, bridges part of it kept private, then withdraws another amount, each on its own', async () => {
  await deposit('stellar', 3n * USDC.stellar)
  expect(store.balanceOf('stellar', KEY.pk)).toBe(3n * USDC.stellar)
  expect(h.calls).toEqual([expect.objectContaining({ network: 'stellar', fn: 'transact', account: WALLET.stellar, amount: 3n * USDC.stellar })])

  h.calls = []
  const bridge = createTransfer({ from: 'stellar', to: 'ethereum', amount: 2n * USDC.ethereum, identity: IDENTITY, recipient: '', keepPrivate: true })
  await runTransfer(bridge, () => {})
  expect(bridge.status).toBe('kept')
  expect(bridge.txs.deposit).toBeUndefined()
  expect(store.balanceOf('stellar', KEY.pk)).toBe(1n * USDC.stellar)
  expect(store.balanceOf('ethereum', KEY.pk)).toBe(2n * USDC.ethereum)

  h.calls = []
  const out = withdraw('ethereum', USDC.ethereum / 2n)
  await runMovement(out)
  expect(out.status).toBe('done')
  expect(h.calls).toEqual([
    { network: 'ethereum', fn: 'transact', account: '', via: 'relayer', recipient: TYPED.ethereum, amount: -(USDC.ethereum / 2n) },
  ])
  // The change stays private, spendable by the same key.
  expect(store.balanceOf('ethereum', KEY.pk)).toBe((3n * USDC.ethereum) / 2n)
})

it('withdraws from two notes and keeps the change', async () => {
  await deposit('ethereum', 1n * USDC.ethereum)
  await deposit('ethereum', 2n * USDC.ethereum)
  h.calls = []

  const out = withdraw('ethereum', (5n * USDC.ethereum) / 2n)
  await runMovement(out)

  expect(out.inputs).toHaveLength(2)
  expect(h.requests.at(-1)).toMatchObject({
    inputs: [expect.objectContaining({ sk: KEY.sk }), expect.objectContaining({ sk: KEY.sk })],
    outputs: [{ pk: KEY.pk, amount: (USDC.ethereum / 2n).toString() }, { pk: KEY.pk, amount: '0' }],
  })
  expect(store.notes('ethereum', KEY.pk).map((n) => n.amount)).toEqual([(USDC.ethereum / 2n).toString()])
})

it('refuses a withdrawal the private balance does not cover, and sends nothing', async () => {
  await deposit('ethereum', 1n * USDC.ethereum)
  h.calls = []

  const out = withdraw('ethereum', 2n * USDC.ethereum)
  await expect(runMovement(out)).rejects.toThrow('does not cover')
  expect(out.status).toBe('created')
  expect(h.calls).toEqual([])
})

it('asks for a USDC trustline before withdrawing to a Stellar address', async () => {
  await deposit('stellar', 1n * USDC.stellar)
  h.calls = []
  h.trustline = false

  await expect(runMovement(withdraw('stellar', USDC.stellar))).rejects.toThrow('no USDC trustline')
  expect(h.calls).toEqual([])
})

it('resumes a withdrawal that landed unseen without paying it twice', async () => {
  await deposit('ethereum', 2n * USDC.ethereum)
  const out = withdraw('ethereum', 1n * USDC.ethereum)
  await runMovement(out)
  h.spent.add(out.nullifier!)
  h.calls = []
  // As if the page had closed before recording the result.
  out.status = 'created'

  await runMovement(out)
  expect(out.status).toBe('done')
  expect(h.calls).toEqual([])
  expect(store.balanceOf('ethereum', KEY.pk)).toBe(1n * USDC.ethereum)
})

/** A deposit whose page closed while the wallet was sending: its outcome is unknown. */
async function interruptedDeposit(network: NetworkId, amount: bigint) {
  const m = createMovement({ kind: 'deposit', network, amount, account: WALLET[network], identity: IDENTITY })
  h.closeOnSend = true
  await expect(runMovement(m)).rejects.toThrow('page closed')
  h.closeOnSend = false
  h.hidden.add(m.note!.commitment)
  h.calls = []
  return m
}

it('waits for an interrupted deposit instead of depositing twice', async () => {
  const m = await interruptedDeposit('ethereum', USDC.ethereum)

  await expect(runMovement(m)).rejects.toThrow('not on chain yet')
  expect(h.calls).toEqual([])

  // It had been sent after all, and lands.
  h.hidden.clear()
  await runMovement(m)
  expect(m.status).toBe('done')
  expect(h.calls).toEqual([])
  expect(store.balanceOf('ethereum', KEY.pk)).toBe(USDC.ethereum)
})

it('deposits again only on a deliberate retry, and keeps the earlier note if it lands later', async () => {
  const m = await interruptedDeposit('ethereum', USDC.ethereum)
  const earlier = m.note!.commitment

  await expect(runMovement(m)).rejects.toThrow('not on chain yet')
  await runMovement(m)
  expect(h.calls.filter((c) => c.fn === 'transact')).toHaveLength(1)
  expect(store.balanceOf('ethereum', KEY.pk)).toBe(USDC.ethereum)

  h.hidden.delete(earlier)
  await settleWatched('ethereum')
  expect(store.balanceOf('ethereum', KEY.pk)).toBe(2n * USDC.ethereum)
})

it('never repeats a deposit that was sent but is not indexed yet', async () => {
  const m = createMovement({ kind: 'deposit', network: 'stellar', amount: USDC.stellar, account: WALLET.stellar, identity: IDENTITY })
  // The deposit note is the next commitment the fake prover makes.
  h.hidden.add(`0x${(h.counter + 1).toString(16).padStart(4, '0')}`)
  await expect(runMovement(m)).rejects.toThrow('not indexed yet')
  expect(m.txs.transact).toBeDefined()
  h.calls = []

  await expect(runMovement(m)).rejects.toThrow('not indexed yet')
  await expect(runMovement(m)).rejects.toThrow('not indexed yet')
  expect(h.calls).toEqual([])

  h.hidden.clear()
  await runMovement(m)
  expect(m.status).toBe('done')
  expect(store.balanceOf('stellar', KEY.pk)).toBe(USDC.stellar)
})

it('resumes an interrupted bridge deposit without depositing twice', async () => {
  const t = createTransfer({ from: 'stellar', to: 'ethereum', amount: USDC.ethereum, identity: IDENTITY, sender: WALLET.stellar, recipient: TYPED.ethereum })
  h.closeOnSend = true
  await expect(runTransfer(t, () => {})).rejects.toThrow('page closed')
  h.closeOnSend = false
  h.hidden.add(t.depositNote!.commitment)
  h.calls = []

  await expect(runTransfer(t, () => {})).rejects.toThrow('not on chain yet')
  expect(h.calls).toEqual([])

  h.hidden.clear()
  await runTransfer(t, () => {})
  expect(t.status).toBe('withdrawn')
  expect(h.calls.filter((c) => c.fn === 'transact' && c.amount! > 0n)).toEqual([])
})

// More notes than a proof can spend: merged first, two at a time, by the relayer.

const note = (amount: bigint, i: number) => ({ network: 'ethereum' as NetworkId, pk: KEY.pk, amount: amount.toString(), blinding: '0x1' as Hex, commitment: `0xa${i}` as Hex, leafIndex: i, spent: false })

it('counts the merges an amount needs', () => {
  const ones = [1n, 1n, 1n, 1n].map(note)
  expect(mergeSteps(ones, 2n)).toBe(0)
  expect(mergeSteps(ones, 3n)).toBe(1)
  expect(mergeSteps(ones, 4n)).toBe(2)
  expect(mergeSteps(ones, 5n)).toBeNull()
  expect(mergeSteps([5n, 1n, 1n].map(note), 6n)).toBe(0)
})

const merges = () => h.calls.filter((c) => c.fn === 'transact' && c.amount === 0n)

it('withdraws a balance spread over three notes in one payment, after one merge', async () => {
  for (let i = 0; i < 3; i++) await deposit('ethereum', USDC.ethereum)
  h.calls = []

  const out = withdraw('ethereum', 3n * USDC.ethereum)
  await runMovement(out)

  expect(out.status).toBe('done')
  expect(merges()).toEqual([{ network: 'ethereum', fn: 'transact', account: '', via: 'relayer', recipient: poolAddress('ethereum'), amount: 0n }])
  expect(h.calls.filter((c) => c.amount! < 0n)).toEqual([expect.objectContaining({ recipient: TYPED.ethereum, amount: -(3n * USDC.ethereum), via: 'relayer' })])
  expect(store.balanceOf('ethereum', KEY.pk)).toBe(0n)
})

it('merges as many times as needed, and no more', async () => {
  for (let i = 0; i < 4; i++) await deposit('ethereum', USDC.ethereum)
  h.calls = []

  await runMovement(withdraw('ethereum', 4n * USDC.ethereum))
  expect(merges()).toHaveLength(2)

  for (let i = 0; i < 4; i++) await deposit('ethereum', USDC.ethereum)
  h.calls = []
  await runMovement(withdraw('ethereum', 2n * USDC.ethereum))
  expect(merges()).toHaveLength(0)
})

it('bridges from a private balance spread over three notes without depositing again', async () => {
  for (let i = 0; i < 3; i++) await deposit('stellar', USDC.stellar)
  h.calls = []

  const t = createTransfer({ from: 'stellar', to: 'ethereum', amount: 3n * USDC.ethereum, identity: IDENTITY, sender: WALLET.stellar, recipient: TYPED.ethereum })
  await runTransfer(t, () => {})

  expect(t.status).toBe('withdrawn')
  expect(t.txs.deposit).toBeUndefined()
  expect(h.calls.filter((c) => c.network === 'stellar').map((c) => [c.fn, c.amount])).toEqual([['transact', 0n], ['bridgeOut', undefined]])
  expect(store.balanceOf('stellar', KEY.pk)).toBe(0n)
})

it('picks up a merge that landed after its page closed', async () => {
  for (let i = 0; i < 3; i++) await deposit('ethereum', USDC.ethereum)
  const out = withdraw('ethereum', 3n * USDC.ethereum)
  h.closeOnSend = true
  await expect(runMovement(out)).rejects.toThrow('page closed')
  h.closeOnSend = false
  // It was sent after all: its inputs are spent on chain.
  h.spent.add(store.pendingMerges('ethereum')[0].nullifier)
  h.calls = []

  await runMovement(out)
  expect(out.status).toBe('done')
  expect(merges()).toEqual([])
  expect(h.calls).toEqual([expect.objectContaining({ amount: -(3n * USDC.ethereum) })])
  expect(store.pendingMerges('ethereum')).toEqual([])
})

// A bridge the private balance only partly covers: the wallet deposits the rest.

const deposits = () => h.calls.filter((c) => c.fn === 'transact' && c.amount! > 0n)

it('tops the private balance up from the wallet with only what it lacks', async () => {
  await deposit('ethereum', 1n * USDC.ethereum)
  h.calls = []

  const t = createTransfer({ from: 'ethereum', to: 'stellar', amount: 3n * USDC.ethereum, identity: IDENTITY, sender: WALLET.ethereum, recipient: TYPED.stellar })
  await runTransfer(t, () => {})

  expect(t.status).toBe('withdrawn')
  expect(deposits()).toEqual([expect.objectContaining({ account: WALLET.ethereum, amount: 2n * USDC.ethereum })])
  expect(h.calls.find((c) => c.fn === 'bridgeOut')).toBeDefined()
  expect(store.balanceOf('ethereum', KEY.pk)).toBe(0n)
})

it('tops up across several balance notes, merging them before the bridge out', async () => {
  for (let i = 0; i < 2; i++) await deposit('stellar', USDC.stellar)
  h.calls = []

  const t = createTransfer({ from: 'stellar', to: 'ethereum', amount: 5n * USDC.ethereum, identity: IDENTITY, sender: WALLET.stellar, recipient: TYPED.ethereum })
  await runTransfer(t, () => {})

  expect(t.status).toBe('withdrawn')
  expect(deposits()).toEqual([expect.objectContaining({ amount: 3n * USDC.stellar })])
  expect(h.calls.filter((c) => c.network === 'stellar' && c.amount === 0n)).toHaveLength(1)
  expect(store.balanceOf('stellar', KEY.pk)).toBe(0n)
})

it('still asks for the wallet when the balance falls short and none is connected', async () => {
  await deposit('ethereum', 1n * USDC.ethereum)
  h.calls = []

  const t = createTransfer({ from: 'ethereum', to: 'stellar', amount: 3n * USDC.ethereum, identity: IDENTITY, recipient: TYPED.stellar })
  await expect(runTransfer(t, () => {})).rejects.toThrow('lacks 2')
  expect(h.calls).toEqual([])
})
