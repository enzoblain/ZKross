// A self-bridge (the sender also claims): deposit on the source pool,
// bridge_out, wait for the root poster, bridge_in on the destination pool,
// withdraw to a public address. Formats are SPEC.md's; the circuit inputs and
// proofs come from zkross-prover in the browser. Every step saves what it
// creates before sending, so `runTransfer` resumes after a reload.
// Bridge outs, claims and withdrawals go through the relayer by default
// (t.via), so the user's wallets do not appear on-chain for them; deposits
// always come from the source wallet. If the relayer does not answer, the
// step fails with `relayerFailed` and the user can send it themselves.
import { formatNote, toNoteAmount } from './amounts'
import { chainId, protocol } from './config'
import { type NoteKey, noteKey } from './keys'
import { type NetworkId, type ProgressState, type TransferProgressStep, networkMeta } from './networks'
import { type Via, pools } from './pools'
import { RelayerUnavailable } from './relayer'
import * as stellar from './stellar'
import * as store from './store'
import type { Note, PendingNote, Transfer } from './store'
import { fieldNeg, prover, randomField } from './zk/prover'
import type { Hex, InNote } from './zk/types'

export type FlowStepId = 'keys' | 'deposit' | 'bridgeOut' | 'root' | 'claim' | 'withdraw'

export type FlowUpdate = (step: FlowStepId, status: ProgressState, description?: string) => void

const ORDER: FlowStepId[] = ['keys', 'deposit', 'bridgeOut', 'root', 'claim', 'withdraw']

/** The last step each transfer status has completed. */
const DONE: Record<Transfer['status'], number> = {
  created: -1,
  deposited: 1,
  sent: 2,
  rootPosted: 3,
  claimed: 4,
  withdrawn: 5,
  refunded: 2,
}

export function createProgress(from: NetworkId, to: NetworkId, t?: Transfer): TransferProgressStep[] {
  const a = networkMeta[from].shortName
  const b = networkMeta[to].shortName
  const steps: Record<FlowStepId, [string, string]> = {
    keys: ['Unlock note keys', `One signature in each wallet derives your private note keys. No transaction.`],
    deposit: ['Deposit into the private pool', `Public USDC moves into the ${a} pool as a hidden note (skipped if your private balance covers it).`],
    bridgeOut: ['Prove and send bridge out', `A zero-knowledge proof spends your ${a} note and records a bridge message.`],
    root: ['Wait for the root poster', `The ${a} outbox root is copied to ${b}${from === 'ethereum' ? ' after Sepolia finality (about 15 minutes)' : ' (about a minute)'}.`],
    claim: ['Prove and claim', `A second proof claims the message as a new note in the ${b} pool, from your ${b} wallet.`],
    withdraw: ['Withdraw to the recipient', `A third proof pays the public ${b} address from your new note.`],
  }
  const done = t ? DONE[t.status] : -1
  return ORDER.map((id, i) => ({
    id,
    label: steps[id][0],
    description: steps[id][1],
    status: t && t.status !== 'created' && i <= done ? 'complete' : 'idle',
  }))
}

type NewTransfer = {
  from: NetworkId
  to: NetworkId
  /** Bridge-message units (10^-6 USDC). */
  amount: bigint
  sender: string
  claimer: string
  recipient: string
  via?: Via
}

export function createTransfer(input: NewTransfer): Transfer {
  if (input.amount <= 0n) throw new Error('Enter an amount above zero.')
  const t: Transfer = {
    id: crypto.randomUUID(),
    from: input.from,
    to: input.to,
    createdAt: Date.now(),
    amount: input.amount.toString(),
    recipient: input.recipient,
    sender: input.sender,
    claimer: input.claimer,
    deadlineBucket: '0',
    claimSecret: randomField(),
    recipientPk: '0x',
    refundPk: '0x',
    refundBlinding: randomField(),
    status: 'created',
    txs: {},
    via: input.via ?? 'relayer',
  }
  store.putTransfer(t)
  return t
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

const salts = (): [Hex, Hex] => [randomField(), randomField()]

const dummy = (): InNote => ({ leaf_index: null, sk: randomField(), amount: '0', blinding: randomField() })

/** Finds pending notes in the pool tree (retrying while RPC catches up) and stores them. */
async function settleNotes(network: NetworkId, pending: PendingNote[], tries = 6) {
  const wanted = pending.filter((n) => BigInt(n.amount) > 0n)
  for (let attempt = 0; attempt < tries; attempt++) {
    const leaves = await pools[network].noteLeaves()
    const found = wanted.map((n) => leaves.findIndex((l) => l !== undefined && BigInt(l) === BigInt(n.commitment)))
    if (found.every((i) => i >= 0)) {
      wanted.forEach((n, k) => store.addNote({ ...n, leafIndex: found[k] }))
      return true
    }
    await sleep(4000)
  }
  return false
}

/** Up to two unspent notes worth at least `amount` (fewest and smallest first). */
function selectNotes(available: Note[], amount: bigint): Note[] | null {
  const sorted = available.slice().sort((x, y) => {
    const a = BigInt(x.amount)
    const b = BigInt(y.amount)
    return a < b ? -1 : a > b ? 1 : 0
  })
  const single = sorted.find((n) => BigInt(n.amount) >= amount)
  if (single) return [single]
  const top = sorted.slice(-2)
  return top.length === 2 && BigInt(top[0].amount) + BigInt(top[1].amount) >= amount ? top : null
}

const nowHour = () => BigInt(Math.floor(Date.now() / 3_600_000))

async function keysFor(t: Transfer): Promise<{ from: NoteKey; to: NoteKey }> {
  const from = await noteKey(t.from, t.sender)
  const to = await noteKey(t.to, t.claimer)
  if (t.recipientPk !== '0x' && (t.recipientPk !== to.pk || t.refundPk !== from.pk)) {
    throw new Error('Connect the same two wallets that started this transfer.')
  }
  return { from, to }
}

function save(t: Transfer, patch: Partial<Transfer>) {
  Object.assign(t, patch)
  store.putTransfer(t)
}

/** Runs (or resumes) a transfer to the end. */
export async function runTransfer(t: Transfer, update: FlowUpdate) {
  const step = async (id: FlowStepId, f: () => Promise<void>) => {
    if (DONE[t.status] >= ORDER.indexOf(id)) return update(id, 'complete')
    update(id, 'active')
    try {
      await f()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      save(t, { error: message, relayerFailed: error instanceof RelayerUnavailable })
      update(id, 'failed', message)
      throw error
    }
    update(id, 'complete')
  }

  if (t.status === 'refunded') throw new Error('This transfer was refunded to your source note.')
  const src = pools[t.from]
  const dst = pools[t.to]
  const amount = BigInt(t.amount)
  const via: Via = t.via ?? 'relayer'
  const by = (wallet: string) => (via === 'relayer' ? 'Sending through the relayer…' : `Confirm in ${wallet}…`)
  const amountFrom = toNoteAmount(t.from, amount)
  const amountTo = toNoteAmount(t.to, amount)
  let derivedKeys: { from: NoteKey; to: NoteKey } | undefined
  await step('keys', async () => {
    derivedKeys = await keysFor(t)
    if (t.recipientPk === '0x') {
      save(t, { recipientPk: derivedKeys.to.pk, refundPk: derivedKeys.from.pk, error: undefined })
    }
  })
  // A resumed transfer still needs both in-memory spending keys even though
  // the key step is already shown as complete.
  const keys = derivedKeys ?? (await keysFor(t))

  await step('deposit', async () => {
    if (t.depositNote && (await settleNotes(t.from, [t.depositNote], 1))) return save(t, { status: 'deposited', error: undefined })
    if (selectNotes(store.notes(t.from, keys.from.pk), amountFrom)) return save(t, { status: 'deposited', error: undefined })
    const balance = await src.usdcBalance(t.sender)
    if (balance === null || balance < amountFrom) {
      throw new Error(`Your ${networkMeta[t.from].shortName} wallet needs ${formatNote(t.from, amountFrom)} public USDC to deposit.`)
    }
    const blinding = randomField()
    const note: PendingNote = {
      network: t.from,
      pk: keys.from.pk,
      amount: amountFrom.toString(),
      blinding,
      commitment: await prover.commitment(amountFrom, keys.from.pk, blinding),
    }
    save(t, { depositNote: note })
    update('deposit', 'active', 'Building the deposit proof in your browser…')
    const built = await prover.buildTransact({
      levels: protocol.levels,
      leaves: await src.noteLeaves(),
      d: await src.adminViewKey(),
      ext_data_hash: await src.transactExtHash(t.sender, amountFrom),
      public_amount: amountFrom.toString(),
      inputs: [dummy(), dummy()],
      outputs: [
        { pk: keys.from.pk, amount: amountFrom.toString(), blinding },
        { pk: keys.from.pk, amount: '0', blinding: randomField() },
      ],
      in_salts: salts(),
      out_salts: salts(),
    })
    const proof = await prover.prove(built)
    update('deposit', 'active', `Confirm the deposit in ${networkMeta[t.from].wallet}…`)
    const sent = await src.transact(t.sender, proof, t.sender, amountFrom, (hash) => save(t, { txs: { ...t.txs, approve: hash } }))
    save(t, { txs: { ...t.txs, deposit: sent.hash } })
    if (!(await settleNotes(t.from, [note]))) throw new Error('The deposit landed but its note is not indexed yet; retry shortly.')
    save(t, { status: 'deposited', error: undefined })
  })

  await step('bridgeOut', async () => {
    if (t.bridgeMessage && (await src.bridgeStatus(t.bridgeMessage)) !== 'none') {
      store.markSpent(t.from, t.inputs ?? [])
      if (!(await settleNotes(t.from, t.changeNotes ?? []))) {
        throw new Error('Bridge out landed, but its change note is not indexed yet. Retry shortly.')
      }
      return save(t, { status: 'sent', error: undefined })
    }
    const chosen = selectNotes(store.notes(t.from, keys.from.pk), amountFrom)
    if (!chosen) throw new Error('Your private balance no longer covers this amount.')
    const total = chosen.reduce((sum, n) => sum + BigInt(n.amount), 0n)
    const change: PendingNote[] = []
    for (const value of [total - amountFrom, 0n]) {
      const blinding = randomField()
      change.push({ network: t.from, pk: keys.from.pk, amount: value.toString(), blinding, commitment: '0x' })
    }
    const asInput = (n: Note): InNote => ({ leaf_index: n.leafIndex, sk: keys.from.sk, amount: n.amount, blinding: n.blinding })
    const deadline = nowHour() + protocol.deadlineHours
    update('bridgeOut', 'active', 'Building the bridge-out proof in your browser…')
    const built = await prover.buildBridgeOut({
      levels: protocol.levels,
      leaves: await src.noteLeaves(),
      d: await src.adminViewKey(),
      ext_data_hash: await src.bridgeOutExtHash(),
      inputs: [asInput(chosen[0]), chosen[1] ? asInput(chosen[1]) : dummy()],
      outputs: [
        { pk: keys.from.pk, amount: change[0].amount, blinding: change[0].blinding },
        { pk: keys.from.pk, amount: '0', blinding: change[1].blinding },
      ],
      in_salts: salts(),
      out_salts: salts(),
      amount: amount.toString(),
      scale: protocol.scale[t.from].toString(),
      asset_id: protocol.assetId.toString(),
      src_chain: chainId(t.from).toString(),
      dst_chain: chainId(t.to).toString(),
      deadline_bucket: deadline.toString(),
      recipient_pk: keys.to.pk,
      claim_secret: t.claimSecret,
      refund_pk: keys.from.pk,
      refund_blinding: t.refundBlinding,
      refund_salt: randomField(),
      bridge_salt: randomField(),
    })
    built.change_commitments.forEach((c, i) => (change[i].commitment = c))
    save(t, {
      deadlineBucket: deadline.toString(),
      bridgeMessage: built.bridge_message,
      claimNullifier: built.claim_nullifier,
      inputs: chosen.map((n) => n.commitment),
      changeNotes: change,
    })
    const proof = await prover.prove(built)
    update('bridgeOut', 'active', by(networkMeta[t.from].wallet))
    const sent = await src.bridgeOut(t.sender, proof, via)
    save(t, { txs: { ...t.txs, bridgeOut: sent.hash } })
    store.markSpent(t.from, t.inputs ?? [])
    if (!(await settleNotes(t.from, change))) {
      throw new Error('Bridge out landed, but its change note is not indexed yet. Retry shortly.')
    }
    save(t, { status: 'sent', error: undefined })
  })

  await step('root', async () => {
    for (;;) {
      const status = await src.bridgeStatus(t.bridgeMessage!)
      if (status === 'refunded') {
        await settleNotes(t.from, [
          { network: t.from, pk: t.refundPk, amount: amountFrom.toString(), blinding: t.refundBlinding, commitment: await prover.commitment(amountFrom, t.refundPk, t.refundBlinding) },
        ])
        save(t, { status: 'refunded' })
        throw new Error('The deadline passed before the claim; the refund attester returned the funds to your source note.')
      }
      const count = await knownPrefix(t)
      if (count) return save(t, { status: 'rootPosted', remoteLeafCount: count, error: undefined })
      if (BigInt(Math.floor(Date.now() / 1000)) >= BigInt(t.deadlineBucket) * 3600n) {
        throw new Error('The claim deadline passed; the refund attester will return the funds after a one-hour grace period.')
      }
      update('root', 'active', `Waiting for the ${networkMeta[t.from].shortName} outbox root on ${networkMeta[t.to].shortName}. The root poster service must be running.`)
      await sleep(15_000)
    }
  })

  await step('claim', async () => {
    if (await dst.isClaimed(t.claimNullifier!)) {
      if (!t.claimNotes?.length) throw new Error('The claim exists on-chain, but this browser has no matching note record.')
      if (!(await settleNotes(t.to, t.claimNotes))) {
        throw new Error('The claim landed, but its destination note is not indexed yet. Retry shortly.')
      }
      return save(t, { status: 'claimed', error: undefined })
    }
    const leaves = (await src.outboxLeaves()).slice(0, t.remoteLeafCount)
    const index = leaves.findIndex((l) => l !== undefined && BigInt(l) === BigInt(t.bridgeMessage!))
    if (index < 0) throw new Error('The bridge message is not present under the posted remote root.')
    const claim: PendingNote[] = [amountTo, 0n].map((value) => ({
      network: t.to,
      pk: keys.to.pk,
      amount: value.toString(),
      blinding: randomField(),
      commitment: '0x',
    }))
    update('claim', 'active', 'Building the claim proof in your browser…')
    const built = await prover.buildBridgeIn({
      levels: protocol.levels,
      outbox_leaves: leaves,
      index,
      d: await dst.adminViewKey(),
      ext_data_hash: await dst.bridgeInExtHash(),
      amount: amount.toString(),
      scale: protocol.scale[t.to].toString(),
      asset_id: protocol.assetId.toString(),
      src_chain: chainId(t.from).toString(),
      dst_chain: chainId(t.to).toString(),
      deadline_bucket: t.deadlineBucket,
      recipient_sk: keys.to.sk,
      claim_secret: t.claimSecret,
      outputs: [
        { amount: claim[0].amount, blinding: claim[0].blinding },
        { amount: '0', blinding: claim[1].blinding },
      ],
      out_salts: salts(),
    })
    built.commitments.forEach((c, i) => (claim[i].commitment = c))
    save(t, { claimNotes: claim })
    const proof = await prover.prove(built)
    update('claim', 'active', by(networkMeta[t.to].wallet))
    const sent = await dst.bridgeIn(t.claimer, proof, via)
    save(t, { txs: { ...t.txs, bridgeIn: sent.hash } })
    if (!(await settleNotes(t.to, claim))) {
      throw new Error('The claim landed, but its destination note is not indexed yet. Retry shortly.')
    }
    save(t, { status: 'claimed', error: undefined })
  })

  await step('withdraw', async () => {
    if (t.withdrawNullifier && (await dst.isSpent(t.withdrawNullifier))) {
      store.markSpent(t.to, [t.claimNotes![0].commitment])
      return save(t, { status: 'withdrawn', error: undefined })
    }
    if (t.to === 'stellar' && (await dst.usdcBalance(t.recipient)) === null) {
      const state = await stellar.accountState(t.recipient)
      if (state === 'missing') {
        throw new Error('The Stellar recipient account does not exist yet: fund it (Friendbot on testnet) and add a USDC trustline, then retry.')
      }
      if (t.recipient !== t.claimer) {
        throw new Error('The Stellar recipient has no USDC trustline: add one from that account, then retry.')
      }
      update('withdraw', 'active', 'Add the USDC trustline in Freighter…')
      save(t, { txs: { ...t.txs, trustline: await stellar.addUsdcTrustline(t.recipient) } })
    }
    const note = store.notes(t.to, keys.to.pk).find((n) => n.commitment === t.claimNotes![0].commitment)
    if (!note) throw new Error('The claimed note is not in this browser.')
    update('withdraw', 'active', 'Building the withdrawal proof in your browser…')
    const built = await prover.buildTransact({
      levels: protocol.levels,
      leaves: await dst.noteLeaves(),
      d: await dst.adminViewKey(),
      ext_data_hash: await dst.transactExtHash(t.recipient, -amountTo),
      public_amount: fieldNeg(amountTo),
      inputs: [{ leaf_index: note.leafIndex, sk: keys.to.sk, amount: note.amount, blinding: note.blinding }, dummy()],
      outputs: [
        { pk: keys.to.pk, amount: '0', blinding: randomField() },
        { pk: keys.to.pk, amount: '0', blinding: randomField() },
      ],
      in_salts: salts(),
      out_salts: salts(),
    })
    save(t, { withdrawNullifier: built.nullifiers[0] })
    const proof = await prover.prove(built)
    update('withdraw', 'active', by(networkMeta[t.to].wallet))
    const sent = await dst.transact(t.claimer, proof, t.recipient, -amountTo, undefined, via)
    store.markSpent(t.to, [note.commitment])
    save(t, { status: 'withdrawn', txs: { ...t.txs, withdraw: sent.hash }, error: undefined })
  })
}

/** The longest outbox prefix, containing `C`, whose root the destination knows. */
async function knownPrefix(t: Transfer): Promise<number | null> {
  const leaves = await pools[t.from].outboxLeaves()
  const index = leaves.findIndex((l) => l !== undefined && BigInt(l) === BigInt(t.bridgeMessage!))
  if (index < 0) return null
  // Newest first; a few prefixes per poll is enough for testnet traffic.
  for (let count = leaves.length, tries = 0; count >= index + 2 && tries < 8; count -= 2, tries++) {
    if (await pools[t.to].isKnownRemoteRoot(await prover.treeRoot(leaves.slice(0, count)))) return count
  }
  return null
}
