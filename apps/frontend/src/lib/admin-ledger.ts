// The Admin page's ledger: every pool transaction on both chains, the public
// facts anyone can read, and the admin's view decrypted with the Global View
// Key. Decryption, commitments and bridge messages come from zkross-prover
// (the same code as scripts/e2e/testnet.ts and services/bridge), passed in as
// `AdminZk` so tests can call the WASM module directly.
import { formatMessage, formatNote, toNoteAmount } from './amounts'
import { chainId, isDeployed, poolAddress, protocol } from './config'
import * as eth from './eth'
import { type NetworkId, otherNetwork } from './networks'
import * as stellar from './stellar'
import { hex32 } from './zk/prover'
import type { BridgeMessageRequest, DecryptedNote, GvkCiphertextHex, Hex } from './zk/types'

export type Ciphertext = { r: { x: bigint; y: bigint }; c1: bigint; c2: bigint; c3: bigint }

export type TxKind =
  | 'deposit'
  | 'transfer'
  | 'withdraw'
  | 'bridgeOut'
  | 'bridgeIn'
  | 'refund'
  | 'finalize'
  | 'liquidity'
  | 'root'

export type LedgerTx = {
  network: NetworkId
  hash: string
  /** ms since 1970 */
  time: number
  kind: TxKind
  sender: string
  /** Signed change of the pool's USDC in note units (+ in, − out). */
  publicAmount: bigint
  /** The account on the other side of the pool's USDC movement, if any. */
  counterparty?: string
  commitments: { index: number; commitment: bigint; ct: Ciphertext | null }[]
  nullifiers: { nullifier: bigint; ct: Ciphertext | null }[]
  bridgeOut?: { message: bigint; deadline: bigint; refundCommitment: bigint; ct: Ciphertext; refundCt: Ciphertext }
  claimNullifier?: bigint
  /** The bridge message a refund or finalize settles. */
  settles?: bigint
  root?: bigint
}

export type AdminNote = { pk: Hex; amount: bigint; commitment: Hex; matches: boolean }

export type AdminTx = {
  tx: LedgerTx
  outputs: (AdminNote | null)[]
  inputs: (AdminNote | null)[]
  bridge?: {
    recipientPk: Hex
    /** Bridge-message units (10^-6 USDC). */
    amount: bigint
    claimNullifier: Hex
    messageMatches: boolean
    refund: AdminNote | null
  }
  /** Shared by a bridge_out and the bridge_in that claims it. */
  linkId?: string
  linkedTo?: { network: NetworkId; hash: string }
}

export type PoolBalance = {
  network: NetworkId
  poolUsdc: bigint
  userNotes: bigint
  noteCount: number
  /** Unclaimed, unsettled bridge_outs that could still be refunded. */
  pending: bigint
  reserve: bigint
}

export type AdminZk = {
  decrypt: (dPriv: string, ciphertexts: GvkCiphertextHex[]) => Promise<{ notes: DecryptedNote[] }>
  bridgeMessage: (req: BridgeMessageRequest) => Promise<{ bridge_message: Hex; claim_nullifier: Hex }>
}

const big = (v: unknown) => BigInt(v as bigint)

function ciphertext(v: unknown): Ciphertext | null {
  const c = v as { r?: { x: unknown; y: unknown }; c1: unknown; c2: unknown; c3: unknown } | null | undefined
  if (!c?.r) return null
  const out = { r: { x: big(c.r.x), y: big(c.r.y) }, c1: big(c.c1), c2: big(c.c2), c3: big(c.c3) }
  return out.r.x === 0n && out.r.y === 0n ? null : out
}

const toHexCt = (c: Ciphertext): GvkCiphertextHex => ({
  rx: hex32(c.r.x),
  ry: hex32(c.r.y),
  c1: hex32(c.c1),
  c2: hex32(c.c2),
  c3: hex32(c.c3),
})

type Movement = { from: string; to: string; amount: bigint }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function classify(tx: Omit<LedgerTx, 'kind'>): TxKind {
  if (tx.bridgeOut) return 'bridgeOut'
  if (tx.claimNullifier !== undefined) return 'bridgeIn'
  if (tx.settles !== undefined) return tx.commitments.length > 0 ? 'refund' : 'finalize'
  if (tx.root !== undefined) return 'root'
  if (tx.commitments.length === 0 && tx.publicAmount > 0n) return 'liquidity'
  return tx.publicAmount > 0n ? 'deposit' : tx.publicAmount < 0n ? 'withdraw' : 'transfer'
}

function emptyTx(network: NetworkId, hash: string, time: number, sender: string, usdc: Movement[]) {
  const pool = poolAddress(network) ?? ''
  let publicAmount = 0n
  let counterparty: string | undefined
  for (const m of usdc) {
    if (same(m.to, pool)) {
      publicAmount += m.amount
      counterparty = m.from
    } else if (same(m.from, pool)) {
      publicAmount -= m.amount
      counterparty = m.to
    }
  }
  return { network, hash, time, sender, publicAmount, counterparty, commitments: [], nullifiers: [] } as Omit<LedgerTx, 'kind'>
}

/** Ledger transactions from Stellar pool events and their Horizon details. */
export function stellarLedger(events: stellar.PoolEvent[], details: Map<string, stellar.TxDetails>): LedgerTx[] {
  const byTx = new Map<string, Omit<LedgerTx, 'kind'>>()
  for (const e of events) {
    const d = details.get(e.txHash) ?? { sender: '', usdc: [] }
    let tx = byTx.get(e.txHash)
    if (!tx) {
      tx = emptyTx('stellar', e.txHash, e.time, d.sender, d.usdc)
      byTx.set(e.txHash, tx)
    }
    const topic = e.topics[1]
    switch (e.name) {
      case 'new_commitment_event':
        tx.commitments.push({ index: Number(e.data.index), commitment: big(topic), ct: ciphertext(e.data.gvk_ciphertext) })
        break
      case 'new_nullifier_event':
        tx.nullifiers.push({ nullifier: big(topic), ct: ciphertext(e.data.gvk_ciphertext) })
        break
      case 'bridge_out_event':
        tx.bridgeOut = {
          message: big(topic),
          deadline: big(e.data.deadline_bucket),
          refundCommitment: big(e.data.refund_commitment),
          ct: ciphertext(e.data.bridge_ciphertext)!,
          refundCt: ciphertext(e.data.refund_ciphertext)!,
        }
        break
      case 'bridge_in_event':
        tx.claimNullifier = big(topic)
        break
      case 'bridge_refunded_event':
      case 'bridge_finalized_event':
        tx.settles = big(topic)
        break
      case 'remote_root_posted_event':
        tx.root = big(topic)
        break
    }
  }
  return [...byTx.values()].map((tx) => ({ ...tx, kind: classify(tx) }))
}

/** Ledger transactions from Sepolia pool logs and their receipts. */
export function ethereumLedger(logs: eth.PoolLog[], details: Map<string, eth.TxDetails>): LedgerTx[] {
  const byTx = new Map<string, Omit<LedgerTx, 'kind'>>()
  for (const l of logs) {
    const d = details.get(l.transactionHash) ?? { sender: '', time: 0, usdc: [] }
    let tx = byTx.get(l.transactionHash)
    if (!tx) {
      tx = emptyTx('ethereum', l.transactionHash, d.time, d.sender, d.usdc)
      byTx.set(l.transactionHash, tx)
    }
    const a = l.args
    switch (l.eventName) {
      case 'NewCommitment':
        tx.commitments.push({ index: Number(a.index), commitment: big(a.commitment), ct: ciphertext(a.gvkCiphertext) })
        break
      case 'NewNullifier':
        tx.nullifiers.push({ nullifier: big(a.nullifier), ct: a.hasGvkCiphertext ? ciphertext(a.gvkCiphertext) : null })
        break
      case 'BridgeOut':
        tx.bridgeOut = {
          message: big(a.bridgeMessage),
          deadline: big(a.deadlineBucket),
          refundCommitment: big(a.refundCommitment),
          ct: ciphertext(a.bridgeCiphertext)!,
          refundCt: ciphertext(a.refundCiphertext)!,
        }
        break
      case 'BridgeIn':
        tx.claimNullifier = big(a.claimNullifier)
        break
      case 'BridgeRefunded':
      case 'BridgeFinalized':
        tx.settles = big(a.bridgeMessage)
        break
      case 'RemoteRootPosted':
        tx.root = big(a.root)
        break
    }
  }
  return [...byTx.values()].map((tx) => ({ ...tx, kind: classify(tx) }))
}

async function inBatches<T, R>(items: T[], f: (item: T) => Promise<R>, size = 6): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(f))))
  return out
}

/** Every pool transaction on both chains (public data only), oldest first. */
export async function loadLedger(): Promise<LedgerTx[]> {
  const all: LedgerTx[] = []
  const events = await stellar.poolEvents()
  const sHashes = [...new Set(events.map((e) => e.txHash))]
  const sDetails = await inBatches(sHashes, stellar.txDetails)
  all.push(...stellarLedger(events, new Map(sHashes.map((h, i) => [h, sDetails[i]]))))
  if (isDeployed('ethereum')) {
    const logs = await eth.allPoolLogs()
    const eHashes = [...new Set(logs.map((l) => l.transactionHash))]
    const eDetails = await inBatches(eHashes, eth.txDetails)
    all.push(...ethereumLedger(logs, new Map(eHashes.map((h, i) => [h, eDetails[i]]))))
  }
  return all.sort((a, b) => a.time - b.time)
}

/** Decrypts every ciphertext in one call, falling back to one by one. */
async function decryptAll(zk: AdminZk, dPriv: string, cts: Ciphertext[]): Promise<(DecryptedNote | null)[]> {
  if (cts.length === 0) return []
  try {
    return (await zk.decrypt(dPriv, cts.map(toHexCt))).notes
  } catch {
    return Promise.all(cts.map((c) => zk.decrypt(dPriv, [toHexCt(c)]).then((r) => r.notes[0], () => null)))
  }
}

const note = (n: DecryptedNote | null, expected?: bigint): AdminNote | null =>
  n && {
    pk: n.pk,
    amount: BigInt(n.amount),
    commitment: n.commitment,
    matches: expected === undefined || BigInt(n.commitment) === expected,
  }

/** The admin's view: decrypted notes, checks, and bridge_out ↔ bridge_in links. */
export async function decryptLedger(txs: LedgerTx[], dPriv: string, zk: AdminZk): Promise<AdminTx[]> {
  const cts: Ciphertext[] = []
  const slot = (c: Ciphertext | null) => (c ? cts.push(c) - 1 : -1)
  const plan = txs.map((tx) => ({
    outputs: tx.commitments.map((c) => slot(c.ct)),
    inputs: tx.nullifiers.map((n) => slot(n.ct)),
    bridge: tx.bridgeOut ? slot(tx.bridgeOut.ct) : -1,
    refund: tx.bridgeOut ? slot(tx.bridgeOut.refundCt) : -1,
  }))
  const plain = await decryptAll(zk, dPriv, cts)
  const at = (i: number) => (i >= 0 ? (plain[i] ?? null) : null)
  const known = new Set(txs.flatMap((tx) => tx.commitments.map((c) => `${tx.network}:${c.commitment}`)))

  const out: AdminTx[] = []
  for (const [k, tx] of txs.entries()) {
    const p = plan[k]
    const row: AdminTx = {
      tx,
      outputs: p.outputs.map((i, j) => note(at(i), tx.commitments[j].commitment)),
      // A spent note must be a known commitment of this pool, unless it is a zero dummy.
      inputs: p.inputs.map((i) => {
        const n = note(at(i))
        return n && { ...n, matches: n.amount === 0n || known.has(`${tx.network}:${BigInt(n.commitment)}`) }
      }),
    }
    const m = at(p.bridge)
    if (tx.bridgeOut && m) {
      const ids = await zk.bridgeMessage({
        amount: m.amount,
        asset_id: protocol.assetId.toString(),
        src_chain: chainId(tx.network).toString(),
        dst_chain: chainId(otherNetwork(tx.network)).toString(),
        recipient_pk: m.pk,
        claim_secret: m.blinding,
        deadline_bucket: tx.bridgeOut.deadline.toString(),
      })
      row.bridge = {
        recipientPk: m.pk,
        amount: BigInt(m.amount),
        claimNullifier: ids.claim_nullifier,
        messageMatches: BigInt(ids.bridge_message) === tx.bridgeOut.message,
        refund: note(at(p.refund), tx.bridgeOut.refundCommitment),
      }
    }
    out.push(row)
  }

  let links = 0
  for (const row of out) {
    if (!row.bridge) continue
    const claim = out.find(
      (r) => r.tx.network === otherNetwork(row.tx.network) && r.tx.claimNullifier === BigInt(row.bridge!.claimNullifier),
    )
    if (!claim) continue
    const id = `B${++links}`
    row.linkId = id
    row.linkedTo = { network: claim.tx.network, hash: claim.tx.hash }
    claim.linkId = id
    claim.linkedTo = { network: row.tx.network, hash: row.tx.hash }
  }
  return out
}

/** Transactions of one journey of funds, which the admin view can link. */
export type Flow = {
  id: string
  /** Root posts and liquidity: the operator's, not a user's funds. */
  operator: boolean
  /** Oldest first. */
  rows: AdminTx[]
  /** Distinct note owners (public keys) of the flow's notes. */
  owners: Hex[]
}

const OPERATOR_KINDS: TxKind[] = ['root', 'liquidity']

/**
 * Groups the decrypted ledger into flows: a note created by one transaction
 * (deposit, claim, change, refund) and spent by another links them, as do a
 * bridge out and its claim, and a bridge out and the refund or finalize that
 * settles it. Each connected set is one flow, oldest first; operator
 * transactions (root posts, liquidity) form a last group of their own.
 */
export function groupFlows(rows: AdminTx[]): Flow[] {
  const parent = rows.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b)
  }
  const user = rows.map((r) => !OPERATOR_KINDS.includes(r.tx.kind))
  const producer = new Map<string, number>()
  rows.forEach((r, i) => {
    if (!user[i]) return
    for (const c of r.tx.commitments) producer.set(`${r.tx.network}:${c.commitment}`, i)
  })
  const byMessage = new Map<string, number>()
  rows.forEach((r, i) => {
    if (r.tx.bridgeOut) byMessage.set(`${r.tx.network}:${r.tx.bridgeOut.message}`, i)
  })
  const byLink = new Map<string, number>()
  rows.forEach((r, i) => {
    if (!user[i]) return
    for (const n of r.inputs) {
      if (!n || n.amount === 0n) continue
      const from = producer.get(`${r.tx.network}:${BigInt(n.commitment)}`)
      if (from !== undefined) union(from, i)
    }
    if (r.linkId) {
      const other = byLink.get(r.linkId)
      if (other === undefined) byLink.set(r.linkId, i)
      else union(other, i)
    }
    if (r.tx.settles !== undefined) {
      const out = byMessage.get(`${r.tx.network}:${r.tx.settles}`)
      if (out !== undefined) union(out, i)
    }
  })

  const groups = new Map<number, AdminTx[]>()
  rows.forEach((r, i) => {
    if (!user[i]) return
    const root = find(i)
    groups.set(root, [...(groups.get(root) ?? []), r])
  })
  const byTime = (a: AdminTx, b: AdminTx) => a.tx.time - b.tx.time
  const flows: Flow[] = [...groups.values()]
    .map((g) => g.sort(byTime))
    .sort((a, b) => a[0].tx.time - b[0].tx.time)
    .map((g, k) => ({
      id: `F${k + 1}`,
      operator: false,
      rows: g,
      owners: [...new Set(g.flatMap((r) => [...r.outputs, ...r.inputs]).filter((n) => n && n.amount > 0n).map((n) => n!.pk))],
    }))
  const ops = rows.filter((_, i) => !user[i]).sort(byTime)
  if (ops.length) flows.push({ id: 'OPS', operator: true, rows: ops, owners: [] })
  return flows
}

/** Pool balances: public USDC, and with the admin view the notes/reserve split. */
export function balances(rows: AdminTx[], poolUsdc: Record<NetworkId, bigint | null>): PoolBalance[] {
  return (['stellar', 'ethereum'] as NetworkId[]).map((network) => {
    const mine = rows.filter((r) => r.tx.network === network)
    const spent = new Set(mine.flatMap((r) => r.inputs.filter((n) => n && n.amount > 0n).map((n) => BigInt(n!.commitment))))
    const live = mine.flatMap((r) => r.outputs).filter((n) => n && n.matches && n.amount > 0n && !spent.has(BigInt(n.commitment)))
    const settled = new Set(mine.filter((r) => r.tx.settles !== undefined).map((r) => r.tx.settles))
    const pending = mine
      .filter((r) => r.bridge && !r.linkedTo && !settled.has(r.tx.bridgeOut!.message))
      .reduce((sum, r) => sum + toNoteAmount(network, r.bridge!.amount), 0n)
    const userNotes = live.reduce((sum, n) => sum + n!.amount, 0n)
    const usdc = poolUsdc[network] ?? 0n
    return { network, poolUsdc: usdc, userNotes, noteCount: live.length, pending, reserve: usdc - userNotes - pending }
  })
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const short = (v: string) => (v.length > 14 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v)

/** The admin view as CSV (amounts in USDC). */
export function adminCsv(rows: AdminTx[]): string {
  const header = [
    'time', 'chain', 'type', 'tx', 'sender', 'public_usdc', 'counterparty',
    'notes_created', 'notes_spent', 'bridge_usdc', 'bridge_recipient_pk', 'link', 'linked_tx', 'checks',
  ]
  const lines = rows.map((r) => {
    const n = r.tx.network
    const notes = (list: (AdminNote | null)[]) =>
      list.filter((x) => x && x.amount > 0n).map((x) => `${formatNote(n, x!.amount)}@${short(x!.pk)}`).join(' ')
    const bad = [...r.outputs, ...r.inputs, r.bridge?.refund ?? null].some((x) => x && !x.matches) || r.bridge?.messageMatches === false
    return [
      new Date(r.tx.time).toISOString(), n, r.tx.kind, r.tx.hash, r.tx.sender,
      r.tx.publicAmount === 0n ? '' : formatNote(n, r.tx.publicAmount), r.tx.counterparty ?? '',
      notes(r.outputs), notes(r.inputs),
      r.bridge ? formatMessage(r.bridge.amount) : '', r.bridge?.recipientPk ?? '',
      r.linkId ?? '', r.linkedTo?.hash ?? '', bad ? 'MISMATCH' : 'ok',
    ].map((v) => csvCell(String(v)))
  })
  return [header.join(','), ...lines.map((l) => l.join(','))].join('\n')
}
