// One interface over both pools, so the transfer flow is written once.
// External data carries one-byte placeholders where SPEC.md B10 encrypted
// payloads will go (see store.ts).
import type { Address } from 'viem'

import * as eth from './eth'
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
  transactExtHash(recipient: string, extAmount: bigint): Promise<Hex>
  bridgeOutExtHash(): Promise<Hex>
  bridgeInExtHash(): Promise<Hex>
  /** Deposits first approve the pool on Ethereum (`onApprove` gets that hash). */
  transact(account: string, proof: Proved, recipient: string, extAmount: bigint, onApprove?: (hash: string) => void): Promise<Sent>
  bridgeOut(account: string, proof: Proved): Promise<Sent>
  bridgeIn(account: string, proof: Proved): Promise<Sent>
  /** Public USDC of an account, or null without a Stellar trustline. */
  usdcBalance(account: string): Promise<bigint | null>
  poolUsdcBalance(): Promise<bigint>
  liquidityAdded(): Promise<bigint>
  addLiquidity(account: string, amount: bigint, onApprove?: (hash: string) => void): Promise<Sent>
}

const tag = (n: number) => `0x${n.toString(16).padStart(2, '0')}` as Hex

// The placeholder payloads (TODO(B10)).
const ethExt = { encryptedOutput0: tag(1), encryptedOutput1: tag(2) }
const ethBridgeOutExt = { ...ethExt, encryptedRefund: tag(3), encryptedBridgeMessage: tag(4) }
const stellarExt = { encrypted_output0: hexBytes(tag(1)), encrypted_output1: hexBytes(tag(2)) }
const stellarBridgeOutExt = {
  ...stellarExt,
  encrypted_refund: hexBytes(tag(3)),
  encrypted_bridge_message: hexBytes(tag(4)),
}

const ethTransactExt = (recipient: string, extAmount: bigint) => ({
  recipient: recipient as Address,
  extAmount,
  ...ethExt,
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
  transactExtHash: (recipient, extAmount) => eth.readPool<Hex>('hashExtData', [ethTransactExt(recipient, extAmount)]),
  bridgeOutExtHash: () => eth.readPool<Hex>('hashBridgeOutExtData', [ethBridgeOutExt]),
  bridgeInExtHash: () => eth.readPool<Hex>('hashBridgeInExtData', [ethExt]),
  async transact(account, proof, recipient, extAmount, onApprove) {
    if (extAmount > 0n) {
      const approved = await eth.ensureAllowance(account as Address, extAmount)
      if (approved) onApprove?.(approved)
    }
    return eth.sendPool(account as Address, 'transact', [ethTransactProof(proof), ethTransactExt(recipient, extAmount)])
  },
  bridgeOut: (account, proof) => eth.sendPool(account as Address, 'bridgeOut', [ethBridgeOutProof(proof), ethBridgeOutExt]),
  bridgeIn: (account, proof) => eth.sendPool(account as Address, 'bridgeIn', [ethBridgeInProof(proof), ethExt]),
  usdcBalance: (account) => eth.usdcBalance(account as Address),
  poolUsdcBalance: eth.poolUsdcBalance,
  liquidityAdded: eth.liquidityAdded,
  async addLiquidity(account, amount, onApprove) {
    const approved = await eth.ensureAllowance(account as Address, amount)
    if (approved) onApprove?.(approved)
    return eth.sendPool(account as Address, 'addLiquidity', [amount])
  },
}

const stellarTransactExt = (recipient: string, extAmount: bigint) => ({
  recipient,
  ext_amount: extAmount,
  ...stellarExt,
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
  transactExtHash: (recipient, extAmount) =>
    stellarHash('hash_ext_data', stellarTransactExt(extAmount > 0n ? stellar.poolId() : recipient, extAmount)),
  bridgeOutExtHash: () => stellarHash('hash_bridge_out_ext_data', stellarBridgeOutExt),
  bridgeInExtHash: () => stellarHash('hash_bridge_in_ext_data', stellarExt),
  transact: (account, proof, recipient, extAmount) =>
    stellar.sendPool(account, 'transact', {
      proof: stellarTransactProof(proof),
      ext_data: stellarTransactExt(extAmount > 0n ? stellar.poolId() : recipient, extAmount),
      sender: account,
    }),
  bridgeOut: (account, proof) =>
    stellar.sendPool(account, 'bridge_out', { proof: stellarBridgeOutProof(proof), ext_data: stellarBridgeOutExt, sender: account }),
  bridgeIn: (account, proof) =>
    stellar.sendPool(account, 'bridge_in', { proof: stellarBridgeInProof(proof), ext_data: stellarExt, sender: account }),
  usdcBalance: stellar.usdcBalance,
  poolUsdcBalance: stellar.poolUsdcBalance,
  liquidityAdded: async () => stellar.liquidityAdded(await stellar.poolEvents()),
  addLiquidity: (account, amount) => stellar.sendPool(account, 'add_liquidity', { amount }),
}

export const pools: Record<NetworkId, Pool> = { ethereum: ethereumPool, stellar: stellarPool }
