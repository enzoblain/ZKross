// Recovering a private balance from the chain alone, with fake pools, prover
// and wallet: notes the site publishes (encrypted to the identity) come back
// after the browser's storage is wiped; foreign, tampered and spent notes do
// not count; a bridge out still waiting for its claim becomes a transfer.
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { NetworkId } from './networks'
import type { Pool, PublishedBridgeOut, PublishedNote } from './pools'
import type { Hex } from './zk/types'

const KEY = { sk: '0x5e' as Hex, pk: '0x9b' as Hex, encSk: '0xe5' as Hex, encPk: '0xe6' as Hex }
const IDENTITY = { network: 'ethereum' as NetworkId, address: '0xA11CE' }

const h = vi.hoisted(() => ({
  ids: new Map<string, string>(),
  sealed: new Map<string, { pk: string; plaintext: string }>(),
  published: { ethereum: [], stellar: [] } as Record<string, PublishedNote[]>,
  bridgeOuts: { ethereum: [], stellar: [] } as Record<string, PublishedBridgeOut[]>,
  spent: new Set<string>(),
  claimed: new Set<string>(),
  status: new Map<string, string>(),
  lastOutputs: [] as { pk: string; amount: string; blinding: string }[],
}))

/** A deterministic stand-in for a hash: the same inputs always give the same id. */
const id = (key: string): Hex => {
  if (!h.ids.has(key)) h.ids.set(key, `0x${(h.ids.size + 1).toString(16).padStart(8, '0')}`)
  return h.ids.get(key) as Hex
}

vi.mock('./keys', () => ({ noteKey: vi.fn(async () => KEY) }))
vi.mock('./stellar', () => ({ accountState: vi.fn(async () => 'exists') }))

vi.mock('./zk/prover', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./zk/prover')>()),
  prover: {
    commitment: async (amount: bigint, pk: string, blinding: string) => id(`cm:${BigInt(amount)}:${pk}:${BigInt(blinding)}`),
    nullifier: async (sk: string, commitment: string, index: number) => id(`nf:${sk}:${BigInt(commitment)}:${index}`),
    encryptTo: async (pk: string, plaintext: string) => {
      const c = `0xc${h.sealed.size.toString(16).padStart(4, '0')}`
      h.sealed.set(c, { pk, plaintext })
      return c
    },
    decryptFrom: async (sk: string, data: string) => {
      const s = h.sealed.get(data)
      return s && sk === KEY.encSk && s.pk === KEY.encPk ? s.plaintext : null
    },
    bridgeMessage: async (r: { amount: string; recipient_pk: string; claim_secret: string; deadline_bucket: string }) => ({
      bridge_message: id(`C:${r.amount}:${r.recipient_pk}:${BigInt(r.claim_secret)}:${r.deadline_bucket}`),
      claim_nullifier: id(`cn:${BigInt(r.claim_secret)}`),
    }),
    buildTransact: async (req: { outputs: { pk: string; amount: string; blinding: string }[] }) => {
      h.lastOutputs = req.outputs
      return { nullifiers: ['0xaa', '0xbb'] }
    },
    prove: async () => ({}),
  },
}))

vi.mock('./pools', async () => {
  const { prover } = await import('./zk/prover')
  const pool = (network: NetworkId): Partial<Pool> => ({
    network,
    adminViewKey: async () => ['0x1', '0x2'] as [Hex, Hex],
    noteLeaves: async () => h.published[network].map((p) => p.commitment),
    transactExtHash: async () => '0xe1' as Hex,
    usdcBalance: async () => 10n ** 12n,
    // A deposit's outputs land with the encrypted payloads it was sent with.
    transact: async (_account, _proof, _recipient, _extAmount, enc) => {
      for (const [k, data] of [enc.output0, enc.output1].entries()) {
        const o = h.lastOutputs[k]
        const commitment = await prover.commitment(BigInt(o.amount), o.pk as Hex, o.blinding as Hex)
        h.published[network].push({ index: h.published[network].length, commitment, data })
      }
      return { hash: 'tx' }
    },
    publishedNotes: async () => h.published[network],
    publishedBridgeOuts: async () => h.bridgeOuts[network],
    isSpent: async (n) => h.spent.has(n),
    isClaimed: async (n) => h.claimed.has(n),
    bridgeStatus: async (c) => (h.status.get(c) ?? 'pending') as never,
  })
  return { pools: { ethereum: pool('ethereum'), stellar: pool('stellar') } }
})

const { createMovement, runMovement } = await import('./balance-flow')
const { findPublishedNote, recoverFromChain } = await import('./recovery')
const { sealBridge, sealNote } = await import('./note-delivery')
const { prover } = await import('./zk/prover')
const store = await import('./store')

let storage: Map<string, string>
const wipeBrowser = () => storage.clear()

beforeEach(() => {
  storage = new Map()
  vi.stubGlobal('window', {
    localStorage: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    setTimeout: (f: () => void) => setTimeout(f, 0),
  })
  h.published = { ethereum: [], stellar: [] }
  h.bridgeOuts = { ethereum: [], stellar: [] }
  h.spent = new Set()
  h.claimed = new Set()
  h.status = new Map()
})

const deposit = async (network: NetworkId, amount: bigint) => {
  await runMovement(createMovement({ kind: 'deposit', network, amount, account: '0xA11CE', identity: IDENTITY }))
}

describe('recovering from the chain', () => {
  it('finds the notes the site deposited after the browser is wiped', async () => {
    await deposit('ethereum', 3_000_000n)
    await deposit('stellar', 20_000_000n)
    wipeBrowser()
    expect(store.balanceOf('ethereum', KEY.pk)).toBe(0n)

    const r = await recoverFromChain(IDENTITY)

    expect(r).toMatchObject({ notes: 2, balance: { ethereum: 3_000_000n, stellar: 20_000_000n }, transfers: 0 })
    expect(store.balanceOf('ethereum', KEY.pk)).toBe(3_000_000n)
    expect(store.balanceOf('stellar', KEY.pk)).toBe(20_000_000n)
  })

  it('ignores notes for someone else, tampered payloads and the old placeholders, and records spent notes as spent', async () => {
    await deposit('ethereum', 1_000_000n)
    await deposit('ethereum', 2_000_000n)
    // Spent on chain since: the second deposit's note.
    const mine = h.published.ethereum.filter((_, i) => i % 2 === 0)
    h.spent.add(await prover.nullifier(KEY.sk, mine[1].commitment, mine[1].index))
    // Someone else's note, a payload that does not open its commitment, a placeholder.
    h.published.ethereum.push({ index: 4, commitment: '0x77', data: await prover.encryptTo('0xother' as Hex, '0x00') })
    h.published.ethereum.push({ index: 5, commitment: '0x78', data: await sealNote(KEY.encPk, 9_000_000n, '0x01') })
    h.published.ethereum.push({ index: 6, commitment: '0x79', data: '0x01' })
    wipeBrowser()

    const r = await recoverFromChain(IDENTITY)

    expect(r.notes).toBe(1)
    expect(store.balanceOf('ethereum', KEY.pk)).toBe(1_000_000n)
  })

  it('turns a bridge out still waiting for its claim into a transfer to resume, once', async () => {
    const amount = 1_000_000n
    const secret = `0x${'5ec'.padStart(64, '0')}` as Hex
    const refundBlinding = `0x${'f'.padStart(64, '0')}` as Hex
    const { bridge_message: message } = await prover.bridgeMessage({ amount: amount.toString(), recipient_pk: KEY.pk, claim_secret: secret, deadline_bucket: '500000' } as never)
    const waiting = {
      message,
      deadline: 500_000n,
      refundCommitment: await prover.commitment(amount, KEY.pk, refundBlinding),
      refund: await sealNote(KEY.encPk, amount, refundBlinding),
      data: await sealBridge(KEY.encPk, amount, secret, 500_000n),
    }
    // A second one, already claimed on Stellar: its note is found by the note scan instead.
    const claimedSecret = `0x${'5ed'.padStart(64, '0')}` as Hex
    const claimed = { ...waiting, message: (await prover.bridgeMessage({ amount: amount.toString(), recipient_pk: KEY.pk, claim_secret: claimedSecret, deadline_bucket: '500000' } as never)).bridge_message, data: await sealBridge(KEY.encPk, amount, claimedSecret, 500_000n) }
    h.claimed.add((await prover.bridgeMessage({ amount: '0', recipient_pk: '', claim_secret: claimedSecret, deadline_bucket: '0' } as never)).claim_nullifier)
    h.bridgeOuts.ethereum.push(waiting, claimed)

    expect((await recoverFromChain(IDENTITY)).transfers).toBe(1)
    const [t] = store.transfers()
    expect(t).toMatchObject({ from: 'ethereum', to: 'stellar', status: 'sent', keepPrivate: true, bridgeMessage: message, claimSecret: secret, refundBlinding, amount: '1000000' })
    // Not twice.
    expect((await recoverFromChain(IDENTITY)).transfers).toBe(0)
  })

  it('finds the note of a claim made elsewhere: right amount, unspent, not already taken', async () => {
    await deposit('stellar', 10_000_000n)
    await deposit('stellar', 20_000_000n)
    await deposit('stellar', 20_000_000n)
    const [, second, third] = h.published.stellar.filter((_, i) => i % 2 === 0)
    // The newest 20 USDC note is already another transfer's claim note.
    store.putTransfer({ id: 'other', from: 'ethereum', to: 'stellar', createdAt: 0, amount: '2000000', recipient: '', sender: '', deadlineBucket: '0', claimSecret: '0x1', recipientPk: KEY.pk, refundPk: KEY.pk, refundBlinding: '0x1', status: 'claimed', txs: {}, claimNotes: [{ network: 'stellar', pk: KEY.pk, amount: '20000000', blinding: '0x1', commitment: third.commitment }] })

    expect((await findPublishedNote('stellar', KEY, 20_000_000n))?.commitment).toBe(second.commitment)
    h.spent.add(await prover.nullifier(KEY.sk, second.commitment, second.index))
    expect(await findPublishedNote('stellar', KEY, 20_000_000n)).toBeNull()
    expect(await findPublishedNote('stellar', KEY, 5_000_000n)).toBeNull()
  })
})
