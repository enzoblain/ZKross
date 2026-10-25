import type { ProtocolMode } from './cctp-config'
import type { NetworkId } from './networks'

export type SettlementStatus =
  | 'created'
  | 'authorized'
  | 'shielded'
  | 'batched'
  | 'burned'
  | 'attested'
  | 'minted'
  | 'private'
  | 'withdrawn'
  | 'failed'

export type SettlementEvent = {
  id: string
  status: SettlementStatus
  at: number
  label: string
  detail: string
  kind: 'simulation' | 'onchain' | 'system'
  network?: NetworkId
  txHash?: string
}

export type CctpTransfer = {
  id: string
  mode: ProtocolMode
  from: NetworkId
  to: NetworkId
  amount: string
  sourceAddress: string
  withdrawalAddress?: string
  privacyId: string
  batchId?: string
  cctpMessageId?: string
  noteId?: string
  createdAt: number
  updatedAt: number
  status: SettlementStatus
  events: SettlementEvent[]
  error?: string
}

export type PrivateNote = {
  id: string
  mode: ProtocolMode
  network: NetworkId
  amount: string
  commitment: string
  transferId: string
  createdAt: number
  spentAt?: number
  withdrawalAddress?: string
}

type CctpData = {
  transfers: CctpTransfer[]
  notes: PrivateNote[]
}

const KEY = 'zkross:cctp:v1'
const EMPTY: CctpData = { transfers: [], notes: [] }
const listeners = new Set<() => void>()

function load(): CctpData {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Partial<CctpData>
    return {
      transfers: Array.isArray(parsed.transfers) ? parsed.transfers : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
    }
  } catch {
    return EMPTY
  }
}

function save(data: CctpData) {
  window.localStorage.setItem(KEY, JSON.stringify(data))
  listeners.forEach((listener) => listener())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const transfers = () => load().transfers.slice().sort((a, b) => b.createdAt - a.createdAt)

export const transfer = (id: string) => load().transfers.find((item) => item.id === id)

export function putTransfer(next: CctpTransfer) {
  const data = load()
  const index = data.transfers.findIndex((item) => item.id === next.id)
  if (index >= 0) data.transfers[index] = next
  else data.transfers.push(next)
  save(data)
}

export const notes = () => load().notes.slice().sort((a, b) => b.createdAt - a.createdAt)

export const spendableNotes = (network?: NetworkId) =>
  notes().filter((note) => !note.spentAt && (!network || note.network === network))

export const privateBalance = (network: NetworkId) =>
  spendableNotes(network).reduce((sum, note) => sum + BigInt(note.amount), 0n)

export function putNote(next: PrivateNote) {
  const data = load()
  const index = data.notes.findIndex((note) => note.id === next.id)
  if (index >= 0) data.notes[index] = next
  else data.notes.push(next)
  save(data)
}

export function markNoteWithdrawn(id: string, address: string) {
  const data = load()
  const note = data.notes.find((item) => item.id === id)
  if (!note) throw new Error('Private note not found in this browser.')
  if (note.spentAt) throw new Error('This private note has already been withdrawn.')
  note.spentAt = Date.now()
  note.withdrawalAddress = address
  const transferRecord = data.transfers.find((item) => item.id === note.transferId)
  if (transferRecord) {
    transferRecord.status = 'withdrawn'
    transferRecord.updatedAt = Date.now()
    transferRecord.events.push({
      id: crypto.randomUUID(),
      status: 'withdrawn',
      at: transferRecord.updatedAt,
      label: 'Public withdrawal simulated',
      detail: `Simulation only. No transaction was sent to ${address}.`,
      kind: 'simulation',
      network: note.network,
    })
  }
  save(data)
}

export const exportRecords = () => JSON.stringify(load(), null, 2)

