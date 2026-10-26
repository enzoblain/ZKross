// One interface over both pools, so the transfer flow is written once.
// External data carries the notes encrypted to their owner (SPEC.md B10,
// note-delivery.ts); the same bytes go into the hash a proof is bound to and
// into the transaction.
import type { Address } from 'viem'

import * as eth from './eth'
import { relay } from './relayer'
import type { NetworkId } from './networks'
import * as stellar from './stellar'
import {
  ethBridgeInProof,
  ethBridgeOutProof,
  ethTransactProof,
  hexBytes,
  stellarBridgeInProof,
  stellarBridgeOutProof,
  stellarTransactProof,
} from './zk/proof-args'
import type { Hex, Proved } from './zk/types'

export type BridgeStatus = 'none' | 'pending' | 'finalized' | 'refunded'
const STATUS: BridgeStatus[] = ['none', 'pending', 'finalized', 'refunded']

type Sent = { hash: string }

/** Who submits a call: the relayer's account, or the user's own wallet. */
export type Via = 'relayer' | 'wallet'

/** Encrypted outputs of a transaction's two new notes (note-delivery.ts). */
export type Payloads = { output0: Hex; output1: Hex }
/** A bridge out's payloads: its change notes, refund note and bridge message. */
export type BridgeOutPayloads = Payloads & { refund: Hex; message: Hex }

/** A note as published, with its encrypted output. */
export type PublishedNote = { index: number; commitment: Hex; data: Hex }
/** A bridge out as published, with its encrypted payloads. */
export type PublishedBridgeOut = { message: Hex; deadline: bigint; refundCommitment: Hex; refund: Hex; data: Hex }

export type Pool = {
  network: NetworkId
  /** The admin's Global View Key `D`, read from the pool (never from the user). */
  adminViewKey(): Promise<[Hex, Hex]>
  admin(): Promise<string>
  noteLeaves(): Promise<Hex[]>
  outboxLeaves(): Promise<Hex[]>
  isKnownRemoteRoot(root: Hex): Promise<boolean>
  isClaimed(claimNullifier: Hex): Promise<boolean>
  isSpent(nullifier: Hex): Promise<boolean>
  bridgeStatus(bridgeMessage: Hex): Promise<BridgeStatus>
  /** `recipient` gets a withdrawal; deposits pass the depositor. */
  transactExtHash(recipient: string, extAmount: bigint, enc: Payloads): Promise<Hex>
  bridgeOutExtHash(enc: BridgeOutPayloads): Promise<Hex>
  bridgeInExtHash(enc: Payloads): Promise<Hex>
  /** Deposits first approve the pool on Ethereum (`onApprove` gets that hash). */
  /** Deposits (extAmount > 0) always come from the wallet; `via` applies to the rest. */
  transact(account: string, proof: Proved, recipient: string, extAmount: bigint, enc: Payloads, onApprove?: (hash: string) => void, via?: Via): Promise<Sent>
  bridgeOut(account: string, proof: Proved, enc: BridgeOutPayloads, via?: Via): Promise<Sent>
  bridgeIn(account: string, proof: Proved, enc: Payloads, via?: Via): Promise<Sent>
  /** Every note with its encrypted output, for recovery. */
  publishedNotes(): Promise<PublishedNote[]>
  /** Every bridge out with its encrypted payloads, for recovery. */
  publishedBridgeOuts(): Promise<PublishedBridgeOut[]>
  /** Public USDC of an account, or null without a Stellar trustline. */
  usdcBalance(account: string): Promise<bigint | null>
  poolUsdcBalance(): Promise<bigint>
  liquidityAdded(): Promise<bigint>
  addLiquidity(account: string, amount: bigint, onApprove?: (hash: string) => void): Promise<Sent>
}

const ethExt = (enc: Payloads) => ({ encryptedOutput0: enc.output0, encryptedOutput1: enc.output1 })
const ethBridgeOutExt = (enc: BridgeOutPayloads) => ({ ...ethExt(enc), encryptedRefund: enc.refund, encryptedBridgeMessage: enc.message })
const stellarExt = (enc: Payloads) => ({ encrypted_output0: hexBytes(enc.output0), encrypted_output1: hexBytes(enc.output1) })
const stellarBridgeOutExt = (enc: BridgeOutPayloads) => ({
  ...stellarExt(enc),
  encrypted_refund: hexBytes(enc.refund),
  encrypted_bridge_message: hexBytes(enc.message),
})

const ethTransactExt = (recipient: string, extAmount: bigint, enc: Payloads) => ({
  recipient: recipient as Address,
  extAmount,
  ...ethExt(enc),
})

const ethereumPool: Pool = {
  network: 'ethereum',
  async adminViewKey() {
    const d = await eth.readPool<{ x: bigint; y: bigint }>('getAdminViewKey')
    return [stellar.hex32(d.x), stellar.hex32(d.y)]
  },
  admin: () => eth.readPool<string>('getAdmin'),
  noteLeaves: eth.noteLeaves,
  outboxLeaves: eth.outboxLeaves,
  isKnownRemoteRoot: (root) => eth.readPool<boolean>('isKnownRemoteRoot', [BigInt(root)]),
  isClaimed: (n) => eth.readPool<boolean>('isClaimed', [BigInt(n)]),
  isSpent: (n) => eth.readPool<boolean>('isSpent', [BigInt(n)]),
  async bridgeStatus(c) {
    const m = await eth.readPool<{ status: number }>('getPendingMessage', [BigInt(c)])
    return STATUS[Number(m.status)] ?? 'none'
  },
  transactExtHash: (recipient, extAmount, enc) => eth.readPool<Hex>('hashExtData', [ethTransactExt(recipient, extAmount, enc)]),
  bridgeOutExtHash: (enc) => eth.readPool<Hex>('hashBridgeOutExtData', [ethBridgeOutExt(enc)]),
  bridgeInExtHash: (enc) => eth.readPool<Hex>('hashBridgeInExtData', [ethExt(enc)]),
  async transact(account, proof, recipient, extAmount, enc, onApprove, via = 'wallet') {
    const args = [ethTransactProof(proof), ethTransactExt(recipient, extAmount, enc)] as const
    if (extAmount <= 0n && via === 'relayer') return relay('ethereum', 'transact', { proof: args[0], extData: args[1] })
    if (extAmount > 0n) {
      const approved = await eth.ensureAllowance(account as Address, extAmount)
      if (approved) onApprove?.(approved)
    }
    return eth.sendPool(account as Address, 'transact', args)
  },
  bridgeOut: (account, proof, enc, via = 'wallet') =>
    via === 'relayer'
      ? relay('ethereum', 'bridgeOut', { proof: ethBridgeOutProof(proof), extData: ethBridgeOutExt(enc) })
      : eth.sendPool(account as Address, 'bridgeOut', [ethBridgeOutProof(proof), ethBridgeOutExt(enc)]),
  bridgeIn: (account, proof, enc, via = 'wallet') =>
    via === 'relayer'
      ? relay('ethereum', 'bridgeIn', { proof: ethBridgeInProof(proof), extData: ethExt(enc) })
      : eth.sendPool(account as Address, 'bridgeIn', [ethBridgeInProof(proof), ethExt(enc)]),
  publishedNotes: eth.publishedNotes,
  publishedBridgeOuts: eth.publishedBridgeOuts,
  usdcBalance: (account) => eth.usdcBalance(account as Address),
  poolUsdcBalance: eth.poolUsdcBalance,
  liquidityAdded: eth.liquidityAdded,
  async addLiquidity(account, amount, onApprove) {
    const approved = await eth.ensureAllowance(account as Address, amount)
    if (approved) onApprove?.(approved)
    return eth.sendPool(account as Address, 'addLiquidity', [amount])
  },
}

const stellarTransactExt = (recipient: string, extAmount: bigint, enc: Payloads) => ({
  recipient,
  ext_amount: extAmount,
  ...stellarExt(enc),
})

const stellarHash = async (method: string, ext: object) =>
  stellar.bytesHex(await stellar.viewPool<Uint8Array>(method, { ext_data: ext }))

const stellarPool: Pool = {
  network: 'stellar',
  async adminViewKey() {
    const d = await stellar.viewPool<{ x: bigint; y: bigint }>('get_admin_view_key')
    return [stellar.hex32(d.x), stellar.hex32(d.y)]
  },
  admin: () => stellar.viewPool<string>('get_admin'),
  noteLeaves: async () => stellar.noteLeaves(await stellar.poolEvents()),
  outboxLeaves: async () => stellar.outboxLeaves(await stellar.poolEvents()),
  isKnownRemoteRoot: (root) => stellar.viewPool<boolean>('is_known_remote_root', { root: BigInt(root) }),
  isClaimed: (n) => stellar.viewPool<boolean>('is_claimed', { claim_nullifier: BigInt(n) }),
  isSpent: (n) => stellar.viewPool<boolean>('is_spent', { n: BigInt(n) }),
  async bridgeStatus(c) {
    const m = await stellar.viewPool<{ status: number } | undefined>('get_pending_message', { bridge_message: BigInt(c) })
    return m ? (STATUS[Number(m.status)] ?? 'none') : 'none'
  },
  // SPP's deposits name the pool as recipient; withdrawals name the payee.
  transactExtHash: (recipient, extAmount, enc) =>
    stellarHash('hash_ext_data', stellarTransactExt(extAmount > 0n ? stellar.poolId() : recipient, extAmount, enc)),
  bridgeOutExtHash: (enc) => stellarHash('hash_bridge_out_ext_data', stellarBridgeOutExt(enc)),
  bridgeInExtHash: (enc) => stellarHash('hash_bridge_in_ext_data', stellarExt(enc)),
  transact: (account, proof, recipient, extAmount, enc, _onApprove, via = 'wallet') => {
    const args = {
      proof: stellarTransactProof(proof),
      ext_data: stellarTransactExt(extAmount > 0n ? stellar.poolId() : recipient, extAmount, enc),
    }
    return extAmount <= 0n && via === 'relayer'
      ? relay('stellar', 'transact', args)
      : stellar.sendPool(account, 'transact', { ...args, sender: account })
  },
  bridgeOut: (account, proof, enc, via = 'wallet') => {
    const args = { proof: stellarBridgeOutProof(proof), ext_data: stellarBridgeOutExt(enc) }
    return via === 'relayer' ? relay('stellar', 'bridge_out', args) : stellar.sendPool(account, 'bridge_out', { ...args, sender: account })
  },
  bridgeIn: (account, proof, enc, via = 'wallet') => {
    const args = { proof: stellarBridgeInProof(proof), ext_data: stellarExt(enc) }
    return via === 'relayer' ? relay('stellar', 'bridge_in', args) : stellar.sendPool(account, 'bridge_in', { ...args, sender: account })
  },
  publishedNotes: async () => stellar.publishedNotes(await stellar.poolEvents()),
  publishedBridgeOuts: async () => stellar.publishedBridgeOuts(await stellar.poolEvents()),
  usdcBalance: stellar.usdcBalance,
  poolUsdcBalance: stellar.poolUsdcBalance,
  liquidityAdded: async () => stellar.liquidityAdded(await stellar.poolEvents()),
  addLiquidity: (account, amount) => stellar.sendPool(account, 'add_liquidity', { amount }),
}

export const pools: Record<NetworkId, Pool> = { ethereum: ethereumPool, stellar: stellarPool }
