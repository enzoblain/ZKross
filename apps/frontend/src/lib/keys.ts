// Note keys. A user's private identity is one note key, derived from the
// signature of a fixed message by one wallet chosen once (the identity
// wallet, on either chain). The same key owns the user's notes on both
// chains and signs for every transfer in both directions, so notes received
// on one chain can later be bridged back from the private balance. MetaMask
// (RFC 6979 ECDSA) and Freighter (Ed25519) sign deterministically, so the same
// wallet always gets the same key; the message is unchanged since v1, so a
// wallet's existing notes stay spendable. The key is kept in memory for the
// session only, never stored (only the identity's wallet and public key are),
// and no key is bundled with the frontend.
// TODO(keys): a wallet that changes its signing scheme would derive a new key;
// back up notes (Activity page) until note recovery from chain data exists.
import { signMessage } from '@stellar/freighter-api'
import { keccak256, toHex } from 'viem'

import { stellarConfig } from './config'
import type { NetworkId } from './networks'
import { R, hex32, prover } from './zk/prover'
import type { Hex } from './zk/types'

/** The note spending key, and the X25519 key notes are encrypted to on-chain (note-delivery.ts). */
export type NoteKey = { sk: Hex; pk: Hex; encSk: Hex; encPk: Hex }

const cache = new Map<string, NoteKey>()

const message = (network: NetworkId, address: string) =>
  [
    'ZKross note key v1',
    `Network: ${network === 'ethereum' ? 'Ethereum Sepolia' : 'Stellar Testnet'}`,
    `Account: ${address}`,
    '',
    'Signing derives your private ZKross note key. It sends no transaction and costs nothing.',
  ].join('\n')

async function signature(network: NetworkId, address: string): Promise<Uint8Array> {
  const text = message(network, address)
  if (network === 'ethereum') {
    if (!window.ethereum) throw new Error('MetaMask is unavailable in this browser.')
    const sig = await window.ethereum.request<Hex>({ method: 'personal_sign', params: [toHex(text), address] })
    return Uint8Array.from(sig.slice(2).match(/../g)!.map((b) => Number.parseInt(b, 16)))
  }
  const signed = await signMessage(text, { networkPassphrase: stellarConfig.passphrase, address })
  if (signed.error || !signed.signedMessage) {
    throw new Error(signed.error?.message ?? 'Freighter did not sign the key message.')
  }
  const value = signed.signedMessage
  return typeof value === 'string'
    ? Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
    : new Uint8Array(value)
}

/** The note key of the wallet `address` on `network`; asks it to sign once per session. */
export async function noteKey(network: NetworkId, address: string): Promise<NoteKey> {
  const id = `${network}:${address}`
  const known = cache.get(id)
  if (known) return known
  const signed = await signature(network, address)
  const sk = hex32(BigInt(keccak256(signed)) % R)
  // The same signature also derives the encryption key: one signature, as in SPP.
  const enc = await prover.encryptionKey(toHex(signed))
  const key = { sk, pk: await prover.pubkey(sk), encSk: enc.sk, encPk: enc.pk }
  cache.set(id, key)
  return key
}

export const cachedNoteKey = (network: NetworkId, address: string) => cache.get(`${network}:${address}`)

/** The wallet whose signature derives the note key, on either chain. */
export type IdentityWallet = { network: NetworkId; address: string }
/** The chosen identity: its wallet and public note key (no secret). */
export type Identity = IdentityWallet & { pk: Hex }

const IDENTITY = 'zkross:identity:v1'

export function identity(): Identity | null {
  try {
    const raw = window.localStorage.getItem(IDENTITY)
    return raw ? (JSON.parse(raw) as Identity) : null
  } catch {
    return null
  }
}

/** Makes `wallet` the identity: it signs once and its note key is used from now on. */
export async function chooseIdentity(wallet: IdentityWallet): Promise<Identity> {
  const { pk } = await noteKey(wallet.network, wallet.address)
  const chosen = { network: wallet.network, address: wallet.address, pk }
  try {
    window.localStorage.setItem(IDENTITY, JSON.stringify(chosen))
  } catch {
    throw new Error('This browser does not allow saving your identity; ZKross needs local storage.')
  }
  return chosen
}
