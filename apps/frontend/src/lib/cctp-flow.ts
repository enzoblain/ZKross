import { cctp, missingTestnetComponents, testnetExecutionBlocker, type ProtocolMode } from './cctp-config'
import * as store from './cctp-store'
import type { CctpTransfer, SettlementStatus } from './cctp-store'
import { networkMeta, type NetworkId, type ProgressState, type TransferProgressStep } from './networks'

export type CctpStepId =
  | 'authorize'
  | 'shield'
  | 'batch'
  | 'burn'
  | 'attest'
  | 'mint'
  | 'private-note'

const ORDER: CctpStepId[] = ['authorize', 'shield', 'batch', 'burn', 'attest', 'mint', 'private-note']

const STATUS_INDEX: Record<SettlementStatus, number> = {
  created: -1,
  authorized: 0,
  shielded: 1,
  batched: 2,
  burned: 3,
  attested: 4,
  minted: 5,
  private: 6,
  withdrawn: 6,
  failed: -1,
}

const statusForStep: Record<CctpStepId, SettlementStatus> = {
  authorize: 'authorized',
  shield: 'shielded',
  batch: 'batched',
  burn: 'burned',
  attest: 'attested',
  mint: 'minted',
  'private-note': 'private',
}

export function progressFor(from: NetworkId, to: NetworkId, transfer?: CctpTransfer): TransferProgressStep[] {
  const source = networkMeta[from].shortName
  const destination = networkMeta[to].shortName
  const copy: Record<CctpStepId, [string, string]> = {
    authorize: ['Authorize the source', `Confirm control of the ${source} source in live mode.`],
    shield: ['Create a private source position', `Commit the transfer intent without exposing its private note data.`],
    batch: ['Join a settlement batch', 'Aggregate several transfers before the public cross-chain settlement.'],
    burn: ['Burn aggregate USDC', `CCTP burns the batch total on ${source}; the aggregate amount remains public.`],
    attest: ['Receive Circle attestation', 'Iris signs the finalized CCTP message for the destination chain.'],
    mint: ['Mint aggregate USDC', `CCTP recreates the batch total on ${destination}.`],
    'private-note': ['Create the destination note', `A simulated ${destination} note is saved in this browser; real pool deposits remain blocked.`],
  }
  const completeThrough = transfer ? STATUS_INDEX[transfer.status] : -1
  const failedStatus = transfer?.status === 'failed'
  return ORDER.map((id, index) => ({
    id,
    label: copy[id][0],
    description: copy[id][1],
    status: failedStatus && index === Math.max(0, completeThrough + 1)
      ? 'failed'
      : index <= completeThrough
        ? 'complete'
        : 'idle',
  }))
}

type NewTransfer = {
  mode: ProtocolMode
  from: NetworkId
  to: NetworkId
  amount: bigint
  sourceAddress: string
  withdrawalAddress?: string
}

export function createCctpTransfer(input: NewTransfer): CctpTransfer {
  if (input.from === input.to) throw new Error('Choose two different networks.')
  if (input.mode !== 'simulation' && input.mode !== 'testnet') throw new Error('Invalid execution mode.')
  if (input.amount <= 0n) throw new Error('Enter an amount above zero.')
  const now = Date.now()
  const next: CctpTransfer = {
    id: crypto.randomUUID(),
    mode: input.mode,
    from: input.from,
    to: input.to,
    amount: input.amount.toString(),
    sourceAddress: input.sourceAddress,
    withdrawalAddress: input.withdrawalAddress?.trim() || undefined,
    privacyId: `zkr_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`,
    createdAt: now,
    updatedAt: now,
    status: 'created',
    events: [],
  }
  store.putTransfer(next)
  return next
}

export type FlowUpdate = (step: CctpStepId, state: ProgressState, detail?: string) => void

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds))

function simulationDetail(step: CctpStepId, transfer: CctpTransfer) {
  const source = networkMeta[transfer.from].shortName
  const destination = networkMeta[transfer.to].shortName
  const details: Record<CctpStepId, string> = {
    authorize: 'Simulation acknowledged. No wallet request or blockchain transaction was created.',
    shield: `A local placeholder commitment was created for the ${source} intake. No proof was submitted.`,
    batch: `Assigned to simulated batch ${transfer.batchId}. Multiple participants are represented only for UX testing.`,
    burn: `Simulated CCTP domain ${cctp.domains[transfer.from]} burn. No USDC was destroyed.`,
    attest: 'Simulated Iris attestation. No Circle API response was received.',
    mint: `Simulated CCTP domain ${cctp.domains[transfer.to]} mint. No USDC was created on ${destination}.`,
    'private-note': `A browser-local ${destination} demo note was added. It has no on-chain value.`,
  }
  return details[step]
}

function saveStep(transfer: CctpTransfer, step: CctpStepId) {
  const status = statusForStep[step]
  transfer.status = status
  transfer.updatedAt = Date.now()
  transfer.events.push({
    id: crypto.randomUUID(),
    status,
    at: transfer.updatedAt,
    label: progressFor(transfer.from, transfer.to).find((item) => item.id === step)?.label ?? status,
    detail: simulationDetail(step, transfer),
    kind: 'simulation',
    network: step === 'mint' || step === 'private-note' ? transfer.to : transfer.from,
  })
  store.putTransfer({ ...transfer, events: [...transfer.events] })
}

const running = new Set<string>()

export async function runCctpTransfer(transfer: CctpTransfer, update: FlowUpdate) {
  if (transfer.mode !== 'simulation') {
    const missing = missingTestnetComponents()
    throw new Error(`${testnetExecutionBlocker}${missing.length ? ` Missing configuration: ${missing.join(', ')}.` : ''}`)
  }
  if (transfer.status === 'withdrawn') throw new Error('This transfer has already been withdrawn.')
  if (transfer.from === transfer.to || BigInt(transfer.amount) <= 0n) throw new Error('Invalid transfer.')
  // Concurrent retries must not create duplicate lifecycle events or notes.
  if (running.has(transfer.id)) throw new Error('This transfer is already running.')
  running.add(transfer.id)
  try {

  transfer.batchId ||= `sim_batch_${Math.floor(Date.now() / 60_000).toString(36)}`
  transfer.cctpMessageId ||= `sim_cctp_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
  transfer.noteId ||= `sim_note_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`
  store.putTransfer(transfer)

  const completed = STATUS_INDEX[transfer.status]
  for (const [index, step] of ORDER.entries()) {
    if (index <= completed) {
      update(step, 'complete')
      continue
    }
    update(step, 'active', simulationDetail(step, transfer))
    await wait(step === 'batch' || step === 'attest' ? 720 : 420)
    saveStep(transfer, step)
    update(step, 'complete', simulationDetail(step, transfer))
  }

  if (!store.notes().some((note) => note.id === transfer.noteId)) {
    store.putNote({
      id: transfer.noteId,
      mode: 'simulation',
      network: transfer.to,
      amount: transfer.amount,
      commitment: `sim_commitment_${transfer.privacyId.slice(4)}`,
      transferId: transfer.id,
      createdAt: Date.now(),
    })
  }
  } finally { running.delete(transfer.id) }
}

export const flowOrder = ORDER

