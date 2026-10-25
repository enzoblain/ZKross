// This browser's private records: unspent notes and bridge transfers. They
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
  | 'refunded'

export type Transfer = {
  id: string
  from: NetworkId
  to: NetworkId
  createdAt: number
  /** In bridge-message units (10^-6 USDC). */
  amount: string
  /** Public address on `to` that receives the withdrawal. */
  recipient: string
  sender: string
  claimer: string
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
  status: TransferStatus
  txs: Partial<Record<'approve' | 'deposit' | 'bridgeOut' | 'bridgeIn' | 'trustline' | 'withdraw', string>>
  error?: string
}

const KEY = 'zkross:v1'

type Data = { notes: Note[]; transfers: Transfer[] }

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

/** Unspent private balance on `network` across all of this browser's keys. */
export const privateBalance = (network: NetworkId) =>
  load()
    .notes.filter((n) => n.network === network && !n.spent)
    .reduce((sum, n) => sum + BigInt(n.amount), 0n)

export function addNote(note: Omit<Note, 'spent'>) {
  const data = load()
  if (!data.notes.some((n) => n.network === note.network && n.commitment === note.commitment)) {
    data.notes.push({ ...note, spent: false })
    save(data)
  }
}

export function markSpent(network: NetworkId, commitments: Hex[]) {
  const data = load()
  for (const n of data.notes) if (n.network === network && commitments.includes(n.commitment)) n.spent = true
  save(data)
}

export const transfers = () => load().transfers.slice().sort((a, b) => b.createdAt - a.createdAt)

export const transfer = (id: string) => load().transfers.find((t) => t.id === id)

export function putTransfer(t: Transfer) {
  const data = load()
  const i = data.transfers.findIndex((x) => x.id === t.id)
  if (i >= 0) data.transfers[i] = t
  else data.transfers.push(t)
  save(data)
}

/** A JSON backup of every record, for the user to keep. */
export const exportRecords = () => JSON.stringify(load(), null, 2)
