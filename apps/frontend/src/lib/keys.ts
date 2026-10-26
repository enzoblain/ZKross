// Note keys. A user's private identity is one note key, derived from the
// signature of a fixed message by a single wallet: the source wallet of the
// transfer. The same key owns the user's notes on both chains, so the
// destination wallet never signs anything. MetaMask (RFC 6979 ECDSA) and
// Freighter (Ed25519) sign deterministically, so the same wallet always gets
// the same key. The key is kept in memory for the session only, never stored,
// and no key is bundled with the frontend.
// TODO(keys): a wallet that changes its signing scheme would derive a new key;
// back up notes (Activity page) until note recovery from chain data exists.
import { signMessage } from '@stellar/freighter-api'
import { keccak256, toHex } from 'viem'

import { stellarConfig } from './config'
import type { NetworkId } from './networks'
import { R, hex32, prover } from './zk/prover'
import type { Hex } from './zk/types'

export type NoteKey = { sk: Hex; pk: Hex }

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

/** The note key of the wallet `address` on `network` (used on both chains); asks it to sign once per session. */
export async function noteKey(network: NetworkId, address: string): Promise<NoteKey> {
  const id = `${network}:${address}`
  const known = cache.get(id)
  if (known) return known
  const sk = hex32(BigInt(keccak256(await signature(network, address))) % R)
  const key = { sk, pk: await prover.pubkey(sk) }
  cache.set(id, key)
  return key
}

export const cachedNoteKey = (network: NetworkId, address: string) => cache.get(`${network}:${address}`)
