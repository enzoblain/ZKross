// This browser's private records: unspent notes, bridge transfers and
// standalone deposits and withdrawals of the private balance. They
// hold note blindings and claim secrets but no spending key (keys.ts derives
// it from the wallet), so they alone cannot spend or claim anything.
// TODO(B10): notes are kept only here; the encrypted_output and
// encrypted_bridge_message fields carry placeholders until SPEC.md B10 note
// delivery exists. Clearing site data loses access to unspent notes (the
// admin can still decrypt them with the Global View Key).
import type { NetworkId } from './networks'
import type { Hex } from './zk/types'

export type Note = {
  network: NetworkId
  /** Owner's note public key. */
  pk: Hex
  amount: string
  blinding: Hex
  commitment: Hex
  leafIndex: number
  spent: boolean
}

export type PendingNote = Omit<Note, 'leafIndex' | 'spent'>

export type TransferStatus =
  | 'created'
  | 'deposited'
  | 'sent'
  | 'rootPosted'
  | 'claimed'
  | 'withdrawn'
  /** Claimed and kept in the destination's private balance (no withdrawal). */
  | 'kept'
  | 'refunded'

export type Transfer = {
  id: string
  from: NetworkId
  to: NetworkId
  createdAt: number
  /** In bridge-message units (10^-6 USDC). */
  amount: string
  /** Public address on `to` that receives the withdrawal; empty when kept private. */
  recipient: string
  /** Keep the claimed note in the private balance on `to` instead of withdrawing. */
  keepPrivate?: boolean
  /** Source-chain wallet that deposits; empty when the private balance covers the amount. */
  sender: string
  /** The wallet that derives the note key; absent on older transfers, whose
   * key came from the source wallet (`from`, `sender`). */
  identity?: { network: NetworkId; address: string }
  /** Destination wallet of transfers made before the single note key; never set now. */
  claimer?: string
  deadlineBucket: string
  claimSecret: Hex
  recipientPk: Hex
  refundPk: Hex
  refundBlinding: Hex
  // Each step records what it creates before sending, so a reload can tell
  // from chain state whether the transaction landed.
  depositNote?: PendingNote
  /** Commitments of the notes bridge_out spends. */
  inputs?: Hex[]
  changeNotes?: PendingNote[]
  bridgeMessage?: Hex
  claimNullifier?: Hex
  /** Number of outbox leaves under the remote root the claim proves against. */
  remoteLeafCount?: number
  claimNotes?: PendingNote[]
  withdrawNullifier?: Hex
  /** The resumed deposit's note was not seen on chain and the user was told;
   * the next retry deposits again (the earlier note stays watched). */
  depositUnseen?: boolean
  /** Ignored: older transfers could send the bridge out from the wallet; now the relayer always does. */
  via?: 'relayer' | 'wallet'
  status: TransferStatus
  txs: Partial<Record<'approve' | 'deposit' | 'bridgeOut' | 'bridgeIn' | 'trustline' | 'withdraw', string>>
  error?: string
}

/** A deposit into or a withdrawal from the private balance on one chain, on
 * its own: no bridge, at any time and for any amount. */
export type Movement = {
  id: string
  kind: 'deposit' | 'withdraw'
  network: NetworkId
  createdAt: number
  /** Note amount on `network` (its own decimals). */
  amount: string
  /** The depositing wallet, or the public address that receives the withdrawal. */
  account: string
  /** The wallet that derives the note key. */
  identity: { network: NetworkId; address: string }
  // Recorded before sending, so a reload can tell from chain state whether the
  // transaction landed.
  /** The deposit's new note. */
  note?: PendingNote
  /** See Transfer.depositUnseen. */
  depositUnseen?: boolean
  /** Commitments of the notes the withdrawal spends. */
  inputs?: Hex[]
  changeNotes?: PendingNote[]
  nullifier?: Hex
  status: 'created' | 'done'
  txs: Partial<Record<'approve' | 'transact', string>>
  error?: string
}

const KEY = 'zkross:v1'

// `watched`: deposit notes saved before sending and not yet seen on chain.
// A deposit may land after the page that sent it closed; its note is kept
// here until it shows up in the pool, so it is never lost.
// `merges`: merges sent or about to be sent (see bridge-flow.ts mergeNotes),
// kept until their inputs are seen spent on chain.
type Data = { notes: Note[]; transfers: Transfer[]; movements?: Movement[]; watched?: PendingNote[]; merges?: PendingMerge[] }

/** A merge of two notes into one, recorded before it is sent. */
export type PendingMerge = {
  network: NetworkId
  /** Commitments of the two notes it spends. */
  inputs: Hex[]
  /** Nullifier of the first input: spent on chain once the merge landed. */
  nullifier: Hex
  output: PendingNote
}

function load(): Data {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Data
  } catch {
    // Storage blocked or corrupt: start empty.
  }
  return { notes: [], transfers: [] }
}

function save(data: Data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    throw new Error('This browser does not allow saving notes; ZKross needs local storage.')
  }
  listeners.forEach((listener) => listener())
}

const listeners = new Set<() => void>()

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const notes = (network: NetworkId, pk: Hex) =>
  load().notes.filter((n) => n.network === network && n.pk === pk && !n.spent)

/** Unspent private balance on `network` owned by the note key `pk`. */
export const balanceOf = (network: NetworkId, pk: Hex) =>
  notes(network, pk).reduce((sum, n) => sum + BigInt(n.amount), 0n)

/** Unspent private balance on `network` across all of this browser's keys. */
export const privateBalance = (network: NetworkId) =>
  load()
    .notes.filter((n) => n.network === network && !n.spent)
    .reduce((sum, n) => sum + BigInt(n.amount), 0n)

export function addNote(note: Omit<Note, 'spent'>) {
  const data = load()
  const watched = (data.watched ?? []).filter((n) => !(n.network === note.network && n.commitment === note.commitment))
  const known = data.notes.some((n) => n.network === note.network && n.commitment === note.commitment)
  if (known && watched.length === (data.watched ?? []).length) return
  if (!known) data.notes.push({ ...note, spent: false })
  data.watched = watched
  save(data)
}

/** Keeps a deposit note, saved before sending, until it is seen on chain. */
export function watchNote(note: PendingNote) {
  const data = load()
  if ((data.watched ??= []).some((n) => n.network === note.network && n.commitment === note.commitment)) return
  data.watched.push(note)
  save(data)
}

export function putMerge(m: PendingMerge) {
  const data = load()
  data.merges = (data.merges ?? []).filter((x) => !(x.network === m.network && x.nullifier === m.nullifier))
  data.merges.push(m)
  save(data)
}

export function removeMerge(network: NetworkId, nullifier: Hex) {
  const data = load()
  data.merges = (data.merges ?? []).filter((x) => !(x.network === network && x.nullifier === nullifier))
  save(data)
}

export const pendingMerges = (network: NetworkId) => (load().merges ?? []).filter((m) => m.network === network)

export const watchedNotes = (network: NetworkId) => (load().watched ?? []).filter((n) => n.network === network)

export function markSpent(network: NetworkId, commitments: Hex[]) {
  const data = load()
  for (const n of data.notes) if (n.network === network && commitments.includes(n.commitment)) n.spent = true
  save(data)
}

/** Nothing is left to do for `t`. */
export const isFinished = (t: Transfer) => t.status === 'withdrawn' || t.status === 'kept' || t.status === 'refunded'

export const transfers = () => load().transfers.slice().sort((a, b) => b.createdAt - a.createdAt)

export const transfer = (id: string) => load().transfers.find((t) => t.id === id)

export function putTransfer(t: Transfer) {
  const data = load()
  const i = data.transfers.findIndex((x) => x.id === t.id)
  if (i >= 0) data.transfers[i] = t
  else data.transfers.push(t)
  save(data)
}

export const movements = () => (load().movements ?? []).slice().sort((a, b) => b.createdAt - a.createdAt)

export function putMovement(m: Movement) {
  const data = load()
  const list = (data.movements ??= [])
  const i = list.findIndex((x) => x.id === m.id)
  if (i >= 0) list[i] = m
  else list.push(m)
  save(data)
}

/** A JSON backup of every record, for the user to keep. */
export const exportRecords = () => JSON.stringify(load(), null, 2)
