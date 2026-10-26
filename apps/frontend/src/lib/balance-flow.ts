// The private balance on its own: deposit public USDC into a chain's pool, or
// withdraw from it to any public address, at any time and for any amount,
// apart from any bridge. With a bridge kept private on arrival
// (bridge-flow.ts), the three steps can happen at different times and for
// different amounts, so a deposit and a withdrawal are harder to match.
// Both use the note key of the identity wallet (keys.ts); a withdrawal goes
// through the relayer and needs no wallet. Each operation saves what it
// creates before sending, so `runMovement` resumes after a reload.
import { formatNote } from './amounts'
import { dummy, resumeDeposit, salts, selectNotes, settleNotes } from './bridge-flow'
import { protocol } from './config'
import { type IdentityWallet, noteKey } from './keys'
import { type NetworkId, networkMeta } from './networks'
import { pools } from './pools'
import * as stellar from './stellar'
import * as store from './store'
import type { Movement, Note, PendingNote } from './store'
import { fieldNeg, prover, randomField } from './zk/prover'
import type { InNote } from './zk/types'

type NewMovement = {
  kind: Movement['kind']
  network: NetworkId
  /** Note amount on `network`. */
  amount: bigint
  /** The depositing wallet, or the public address that receives the withdrawal. */
  account: string
  identity: IdentityWallet
}

export function createMovement(input: NewMovement): Movement {
  if (input.amount <= 0n) throw new Error('Enter an amount above zero.')
  const m: Movement = {
    id: crypto.randomUUID(),
    kind: input.kind,
    network: input.network,
    createdAt: Date.now(),
    amount: input.amount.toString(),
    account: input.account,
    identity: { network: input.identity.network, address: input.identity.address },
    status: 'created',
    txs: {},
  }
  store.putMovement(m)
  return m
}

function save(m: Movement, patch: Partial<Movement>) {
  Object.assign(m, patch)
  store.putMovement(m)
}

/** Runs (or resumes) a deposit or withdrawal; `update` gets progress messages. */
export async function runMovement(m: Movement, update: (message: string) => void = () => {}) {
  if (m.status === 'done') return
  try {
    await (m.kind === 'deposit' ? deposit(m, update) : withdraw(m, update))
    save(m, { status: 'done', error: undefined })
  } catch (error) {
    save(m, { error: error instanceof Error ? error.message : String(error) })
    throw error
  }
}

async function deposit(m: Movement, update: (message: string) => void) {
  const pool = pools[m.network]
  const amount = BigInt(m.amount)
  if (await resumeDeposit(m.network, m.note, m.txs.transact, m.depositUnseen, () => save(m, { depositUnseen: true }))) return
  const key = await noteKey(m.identity.network, m.identity.address)
  const balance = await pool.usdcBalance(m.account)
  if (balance === null || balance < amount) {
    throw new Error(`Your ${networkMeta[m.network].shortName} wallet needs ${formatNote(m.network, amount)} public USDC to deposit.`)
  }
  const blinding = randomField()
  const note: PendingNote = {
    network: m.network,
    pk: key.pk,
    amount: amount.toString(),
    blinding,
    commitment: await prover.commitment(amount, key.pk, blinding),
  }
  store.watchNote(note)
  save(m, { note, depositUnseen: undefined })
  update('Building the deposit proof in your browser…')
  const built = await prover.buildTransact({
    levels: protocol.levels,
    leaves: await pool.noteLeaves(),
    d: await pool.adminViewKey(),
    ext_data_hash: await pool.transactExtHash(m.account, amount),
    public_amount: amount.toString(),
    inputs: [dummy(), dummy()],
    outputs: [
      { pk: key.pk, amount: amount.toString(), blinding },
      { pk: key.pk, amount: '0', blinding: randomField() },
    ],
    in_salts: salts(),
    out_salts: salts(),
  })
  const proof = await prover.prove(built)
  update(`Confirm the deposit in ${networkMeta[m.network].wallet}…`)
  const sent = await pool.transact(m.account, proof, m.account, amount, (hash) => save(m, { txs: { ...m.txs, approve: hash } }))
  save(m, { txs: { ...m.txs, transact: sent.hash } })
  if (!(await settleNotes(m.network, [note]))) throw new Error('The deposit landed but its note is not indexed yet; retry shortly.')
}

async function withdraw(m: Movement, update: (message: string) => void) {
  const pool = pools[m.network]
  const amount = BigInt(m.amount)
  const settle = async () => {
    store.markSpent(m.network, m.inputs ?? [])
    if (!(await settleNotes(m.network, m.changeNotes ?? []))) {
      throw new Error('The withdrawal landed, but its change note is not indexed yet. Retry shortly.')
    }
  }
  if (m.nullifier && (await pool.isSpent(m.nullifier))) return settle()
  const key = await noteKey(m.identity.network, m.identity.address)
  if (m.network === 'stellar' && (await pool.usdcBalance(m.account)) === null) {
    const state = await stellar.accountState(m.account)
    if (state === 'missing') {
      throw new Error('The Stellar recipient account does not exist yet: fund it (Friendbot on testnet) and add a USDC trustline, then retry.')
    }
    throw new Error('The Stellar recipient has no USDC trustline: add one from that account, then retry.')
  }
  // A retry spends the same notes as the first attempt, so a withdrawal that
  // landed unseen cannot be paid twice.
  const available = store.notes(m.network, key.pk)
  const chosen = m.inputs
    ? m.inputs.map((c) => available.find((n) => n.commitment === c)).filter((n): n is Note => Boolean(n))
    : selectNotes(available, amount)
  if (!chosen || !chosen.length || (m.inputs && chosen.length !== m.inputs.length)) {
    throw new Error(`Your private ${networkMeta[m.network].shortName} balance does not cover ${formatNote(m.network, amount)} USDC.`)
  }
  const total = chosen.reduce((sum, n) => sum + BigInt(n.amount), 0n)
  const change: PendingNote[] = []
  for (const value of [total - amount, 0n]) {
    const blinding = randomField()
    change.push({ network: m.network, pk: key.pk, amount: value.toString(), blinding, commitment: await prover.commitment(value, key.pk, blinding) })
  }
  const asInput = (n: Note): InNote => ({ leaf_index: n.leafIndex, sk: key.sk, amount: n.amount, blinding: n.blinding })
  update('Building the withdrawal proof in your browser…')
  const built = await prover.buildTransact({
    levels: protocol.levels,
    leaves: await pool.noteLeaves(),
    d: await pool.adminViewKey(),
    ext_data_hash: await pool.transactExtHash(m.account, -amount),
    public_amount: fieldNeg(amount),
    inputs: [asInput(chosen[0]), chosen[1] ? asInput(chosen[1]) : dummy()],
    outputs: [
      { pk: key.pk, amount: change[0].amount, blinding: change[0].blinding },
      { pk: key.pk, amount: '0', blinding: change[1].blinding },
    ],
    in_salts: salts(),
    out_salts: salts(),
  })
  save(m, { inputs: chosen.map((n) => n.commitment), changeNotes: change, nullifier: built.nullifiers[0] })
  const proof = await prover.prove(built)
  update('Sending through the relayer…')
  const sent = await pool.transact('', proof, m.account, -amount, undefined, 'relayer')
  save(m, { txs: { ...m.txs, transact: sent.hash } })
  await settle()
}
