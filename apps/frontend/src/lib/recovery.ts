// Rebuilds a private balance from the chain alone (SPEC.md B10), on any
// device: every note and bridge out published with a payload encrypted to the
// identity's key (note-delivery.ts) is found by trial decryption and checked
// against its commitment or bridge message before it is trusted. Spent notes
// are recorded as spent; a bridge out still waiting for its claim becomes a
// transfer to resume, kept in the private balance on arrival (its public
// recipient is not recorded on-chain).
// Limits: Stellar RPC keeps about 7 days of events, so older Stellar notes are
// not found; notes made before note delivery carry placeholders and cannot be
// recovered this way.
import { toNoteAmount } from './amounts'
import { chainId, isDeployed, protocol } from './config'
import { type IdentityWallet, type NoteKey, noteKey } from './keys'
import { type NetworkId, networkMeta, otherNetwork } from './networks'
import { readBridge, readNote } from './note-delivery'
import { pools } from './pools'
import * as store from './store'
import type { PendingNote } from './store'
import { prover } from './zk/prover'

export type Recovered = {
  /** Unspent notes found, and their total, per chain (note units). */
  notes: number
  balance: Record<NetworkId, bigint>
  /** Bridge outs waiting for their claim, now resumable from Activity. */
  transfers: number
}

const NETWORKS: NetworkId[] = ['ethereum', 'stellar']

/**
 * A note of `key` worth exactly `amount` on `network`, published on-chain,
 * unspent and not already some transfer's claim note: the note of a claim
 * made elsewhere (another tab or browser). Null if none (or it predates note
 * delivery).
 */
export async function findPublishedNote(network: NetworkId, key: NoteKey, amount: bigint): Promise<PendingNote | null> {
  const taken = new Set(store.transfers().flatMap((t) => (t.to === network ? (t.claimNotes ?? []).map((n) => BigInt(n.commitment)) : [])))
  const pool = pools[network]
  for (const p of [...(await pool.publishedNotes())].reverse()) {
    if (taken.has(BigInt(p.commitment))) continue
    const note = readNote(await prover.decryptFrom(key.encSk, p.data))
    if (!note || note.amount !== amount) continue
    if (BigInt(await prover.commitment(note.amount, key.pk, note.blinding)) !== BigInt(p.commitment)) continue
    if (await pool.isSpent(await prover.nullifier(key.sk, p.commitment, p.index))) continue
    return { network, pk: key.pk, amount: amount.toString(), blinding: note.blinding, commitment: p.commitment }
  }
  return null
}

export async function recoverFromChain(identity: IdentityWallet, update: (message: string) => void = () => {}): Promise<Recovered> {
  const key = await noteKey(identity.network, identity.address)
  const found: Recovered = { notes: 0, balance: { ethereum: 0n, stellar: 0n }, transfers: 0 }

  for (const network of NETWORKS) {
    if (!isDeployed(network)) continue
    const pool = pools[network]
    update(`Looking for your notes on ${networkMeta[network].shortName}…`)
    for (const p of await pool.publishedNotes()) {
      const note = readNote(await prover.decryptFrom(key.encSk, p.data))
      if (!note || note.amount === 0n) continue
      // The payload is chosen by whoever sent the transaction: trust it only
      // if it opens the commitment under this identity's key.
      if (BigInt(await prover.commitment(note.amount, key.pk, note.blinding)) !== BigInt(p.commitment)) continue
      const spent = await pool.isSpent(await prover.nullifier(key.sk, p.commitment, p.index))
      store.addNote({ network, pk: key.pk, amount: note.amount.toString(), blinding: note.blinding, commitment: p.commitment, leafIndex: p.index })
      if (spent) {
        store.markSpent(network, [p.commitment])
      } else {
        found.notes++
        found.balance[network] += note.amount
      }
    }

    update(`Looking for your bridge transfers from ${networkMeta[network].shortName}…`)
    const to = otherNetwork(network)
    for (const b of await pool.publishedBridgeOuts()) {
      const m = readBridge(await prover.decryptFrom(key.encSk, b.data))
      if (!m) continue
      if (store.transfers().some((t) => t.bridgeMessage && BigInt(t.bridgeMessage) === BigInt(b.message))) continue
      const ids = await prover.bridgeMessage({
        amount: m.amount.toString(),
        asset_id: protocol.assetId.toString(),
        src_chain: chainId(network).toString(),
        dst_chain: chainId(to).toString(),
        recipient_pk: key.pk,
        claim_secret: m.claimSecret,
        deadline_bucket: m.deadlineBucket.toString(),
      })
      if (BigInt(ids.bridge_message) !== BigInt(b.message)) continue
      // Claimed or settled: its notes, if any, were found above.
      if (await pools[to].isClaimed(ids.claim_nullifier)) continue
      if ((await pool.bridgeStatus(b.message)) !== 'pending') continue
      const refund = readNote(await prover.decryptFrom(key.encSk, b.refund))
      const amountFrom = toNoteAmount(network, m.amount)
      if (!refund || refund.amount !== amountFrom) continue
      if (BigInt(await prover.commitment(amountFrom, key.pk, refund.blinding)) !== BigInt(b.refundCommitment)) continue
      store.putTransfer({
        id: crypto.randomUUID(),
        from: network,
        to,
        createdAt: Date.now(),
        amount: m.amount.toString(),
        recipient: '',
        keepPrivate: true,
        sender: '',
        identity: { network: identity.network, address: identity.address },
        deadlineBucket: m.deadlineBucket.toString(),
        claimSecret: m.claimSecret,
        recipientPk: key.pk,
        refundPk: key.pk,
        refundBlinding: refund.blinding,
        bridgeMessage: b.message,
        claimNullifier: ids.claim_nullifier,
        status: 'sent',
        txs: {},
      })
      found.transfers++
    }
  }
  return found
}
