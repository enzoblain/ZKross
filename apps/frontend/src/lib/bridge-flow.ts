// A self-bridge (the sender also claims): deposit on the source pool,
// bridge_out, wait for the root poster, bridge_in on the destination pool,
// withdraw to a public address. Formats are SPEC.md's; the circuit inputs and
// proofs come from zkross-prover in the browser. Every step saves what it
// creates before sending, so `runTransfer` resumes after a reload.
// One note key, derived from the identity wallet chosen once (keys.ts), owns
// the notes on both chains and signs for every transfer, in both directions:
// notes claimed on the destination can later be bridged back from the private
// balance. The destination wallet is never connected: the user only types the
// destination address, and the claim and withdrawal always go through the
// relayer. The source wallet is needed only to deposit what the private
// balance does not cover; the bridge out goes through the relayer by default
// (t.via). If the relayer does not answer the bridge out, the step fails with
// `relayerFailed` and the user can send it themselves.
import { formatNote, toNoteAmount } from './amounts'
import { chainId, protocol } from './config'
import { type IdentityWallet, type NoteKey, noteKey } from './keys'
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
  kept: 5,
  refunded: 2,
}

export function createProgress(from: NetworkId, to: NetworkId, t?: Transfer): TransferProgressStep[] {
  const a = networkMeta[from].shortName
  const b = networkMeta[to].shortName
  const steps: Record<FlowStepId, [string, string]> = {
    keys: ['Unlock your note key', `One signature in your identity wallet derives your private note key, the same on both chains. No transaction.`],
    deposit: ['Deposit into the private pool', `Public USDC moves from your ${a} wallet into the pool as a hidden note (skipped if your private balance covers it).`],
    bridgeOut: ['Prove and send bridge out', `A zero-knowledge proof spends your ${a} note and records a bridge message.`],
    root: ['Wait for the root poster', `The ${a} outbox root is copied to ${b}${from === 'ethereum' ? ' after Sepolia finality (about 15 minutes)' : ' (about a minute)'}.`],
    claim: ['Prove and claim', `A second proof claims the message as a new note in the ${b} pool; the relayer submits it.`],
    withdraw: ['Withdraw to the recipient', `A third proof pays the public ${b} address you entered; the relayer submits it.`],
  }
  if (t?.keepPrivate) steps.withdraw = ['Keep in your private balance', `No withdrawal: the claimed note stays in the ${b} pool, spendable by your note key (for example to bridge back).`]
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
  /** The identity wallet that derives the note key. */
  identity: IdentityWallet
  /** The source wallet, needed only to deposit or to send the bridge out yourself. */
  sender?: string
  /** Public address on `to`; ignored when `keepPrivate`. */
  recipient: string
  keepPrivate?: boolean
  /** Who sends the bridge out; claims and withdrawals always use the relayer. */
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
    recipient: input.keepPrivate ? '' : input.recipient,
    keepPrivate: input.keepPrivate || undefined,
    sender: input.sender ?? '',
    identity: { network: input.identity.network, address: input.identity.address },
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

export const salts = (): [Hex, Hex] => [randomField(), randomField()]

export const dummy = (): InNote => ({ leaf_index: null, sk: randomField(), amount: '0', blinding: randomField() })

/** Finds pending notes in the pool tree (retrying while RPC catches up) and stores them. */
export async function settleNotes(network: NetworkId, pending: PendingNote[], tries = 6) {
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
export function selectNotes(available: Note[], amount: bigint): Note[] | null {
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

/** The identity wallet of `t`; older transfers derived their key from the source wallet. */
export const identityOf = (t: Transfer): IdentityWallet => t.identity ?? { network: t.from, address: t.sender }

/** The user's note key, from the identity wallet; it owns the notes on both chains. */
async function identityFor(t: Transfer): Promise<NoteKey> {
  if (t.recipientPk !== t.refundPk) {
    throw new Error('This transfer was started with a destination-wallet note key, which this version no longer uses. Start a new transfer.')
  }
  const wallet = identityOf(t)
  const key = await noteKey(wallet.network, wallet.address)
  if (t.recipientPk !== '0x' && t.recipientPk !== key.pk) {
    throw new Error('Connect the same identity wallet that started this transfer.')
  }
  return key
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
      // Only the bridge out has a "send it myself" fallback.
      save(t, { error: message, relayerFailed: id === 'bridgeOut' && error instanceof RelayerUnavailable })
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
  const relaying = 'Sending through the relayer…'
  const amountFrom = toNoteAmount(t.from, amount)
  const amountTo = toNoteAmount(t.to, amount)
  let derivedKey: NoteKey | undefined
  await step('keys', async () => {
    derivedKey = await identityFor(t)
    if (t.recipientPk === '0x') {
      save(t, { recipientPk: derivedKey.pk, refundPk: derivedKey.pk, error: undefined })
    }
  })
  // A resumed transfer still needs the in-memory spending key even though
  // the key step is already shown as complete.
  const key = derivedKey ?? (await identityFor(t))

  await step('deposit', async () => {
    if (t.depositNote && (await settleNotes(t.from, [t.depositNote], 1))) return save(t, { status: 'deposited', error: undefined })
    if (selectNotes(store.notes(t.from, key.pk), amountFrom)) return save(t, { status: 'deposited', error: undefined })
    if (!t.sender) {
      throw new Error(`Your private balance does not cover this amount: connect your ${networkMeta[t.from].wallet} wallet to deposit.`)
    }
    const balance = await src.usdcBalance(t.sender)
    if (balance === null || balance < amountFrom) {
      throw new Error(`Your ${networkMeta[t.from].shortName} wallet needs ${formatNote(t.from, amountFrom)} public USDC to deposit.`)
    }
    const blinding = randomField()
    const note: PendingNote = {
      network: t.from,
      pk: key.pk,
      amount: amountFrom.toString(),
      blinding,
      commitment: await prover.commitment(amountFrom, key.pk, blinding),
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
        { pk: key.pk, amount: amountFrom.toString(), blinding },
        { pk: key.pk, amount: '0', blinding: randomField() },
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
    const chosen = selectNotes(store.notes(t.from, key.pk), amountFrom)
    if (!chosen) throw new Error('Your private balance no longer covers this amount.')
    if (via === 'wallet' && !t.sender) throw new Error(`Connect your ${networkMeta[t.from].wallet} wallet to send the bridge out yourself.`)
    const total = chosen.reduce((sum, n) => sum + BigInt(n.amount), 0n)
    const change: PendingNote[] = []
    for (const value of [total - amountFrom, 0n]) {
      const blinding = randomField()
      change.push({ network: t.from, pk: key.pk, amount: value.toString(), blinding, commitment: '0x' })
    }
    const asInput = (n: Note): InNote => ({ leaf_index: n.leafIndex, sk: key.sk, amount: n.amount, blinding: n.blinding })
    const deadline = nowHour() + protocol.deadlineHours
    update('bridgeOut', 'active', 'Building the bridge-out proof in your browser…')
    const built = await prover.buildBridgeOut({
      levels: protocol.levels,
      leaves: await src.noteLeaves(),
      d: await src.adminViewKey(),
      ext_data_hash: await src.bridgeOutExtHash(),
      inputs: [asInput(chosen[0]), chosen[1] ? asInput(chosen[1]) : dummy()],
      outputs: [
        { pk: key.pk, amount: change[0].amount, blinding: change[0].blinding },
        { pk: key.pk, amount: '0', blinding: change[1].blinding },
      ],
      in_salts: salts(),
      out_salts: salts(),
      amount: amount.toString(),
      scale: protocol.scale[t.from].toString(),
      asset_id: protocol.assetId.toString(),
      src_chain: chainId(t.from).toString(),
      dst_chain: chainId(t.to).toString(),
      deadline_bucket: deadline.toString(),
      recipient_pk: key.pk,
      claim_secret: t.claimSecret,
      refund_pk: key.pk,
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
    update('bridgeOut', 'active', via === 'relayer' ? relaying : `Confirm in ${networkMeta[t.from].wallet}…`)
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
      pk: key.pk,
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
      recipient_sk: key.sk,
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
    update('claim', 'active', relaying)
    const sent = await dst.bridgeIn('', proof, 'relayer')
    save(t, { txs: { ...t.txs, bridgeIn: sent.hash } })
    if (!(await settleNotes(t.to, claim))) {
      throw new Error('The claim landed, but its destination note is not indexed yet. Retry shortly.')
    }
    save(t, { status: 'claimed', error: undefined })
  })

  await step('withdraw', async () => {
    if (t.keepPrivate) return save(t, { status: 'kept', error: undefined })
    if (t.withdrawNullifier && (await dst.isSpent(t.withdrawNullifier))) {
      store.markSpent(t.to, [t.claimNotes![0].commitment])
      return save(t, { status: 'withdrawn', error: undefined })
    }
    if (t.to === 'stellar' && (await dst.usdcBalance(t.recipient)) === null) {
      const state = await stellar.accountState(t.recipient)
      if (state === 'missing') {
        throw new Error('The Stellar recipient account does not exist yet: fund it (Friendbot on testnet) and add a USDC trustline, then retry.')
      }
      throw new Error('The Stellar recipient has no USDC trustline: add one from that account, then retry.')
    }
    const note = store.notes(t.to, key.pk).find((n) => n.commitment === t.claimNotes![0].commitment)
    if (!note) throw new Error('The claimed note is not in this browser.')
    update('withdraw', 'active', 'Building the withdrawal proof in your browser…')
    const built = await prover.buildTransact({
      levels: protocol.levels,
      leaves: await dst.noteLeaves(),
      d: await dst.adminViewKey(),
      ext_data_hash: await dst.transactExtHash(t.recipient, -amountTo),
      public_amount: fieldNeg(amountTo),
      inputs: [{ leaf_index: note.leafIndex, sk: key.sk, amount: note.amount, blinding: note.blinding }, dummy()],
      outputs: [
        { pk: key.pk, amount: '0', blinding: randomField() },
        { pk: key.pk, amount: '0', blinding: randomField() },
      ],
      in_salts: salts(),
      out_salts: salts(),
    })
    save(t, { withdrawNullifier: built.nullifiers[0] })
    const proof = await prover.prove(built)
    update('withdraw', 'active', relaying)
    const sent = await dst.transact('', proof, t.recipient, -amountTo, undefined, 'relayer')
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
