// The relayer client (services/bridge/src/relayer.ts): withdrawals, private
// transfers, bridge outs and claims are sent from the relayer's accounts
// instead of the user's wallet. Deposits never go through it.
import { poolAddress } from './config'
import type { NetworkId } from './networks'

export const RELAYER_URL = ((import.meta.env.VITE_RELAYER_URL as string | undefined) ?? 'http://127.0.0.1:8788').replace(/\/$/, '')

/** The relayer could not be reached or failed: the user may send it themselves. */
export class RelayerUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RelayerUnavailable'
  }
}

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** The relayer's JSON form: big integers as decimal strings, bytes as hex (no
 * 0x, the stellar CLI's form); u64 deadlines stay numbers. */
export function toWire(value: unknown, key = ''): unknown {
  if (typeof value === 'bigint') return key === 'deadline_bucket' ? Number(value) : value.toString()
  if (value instanceof Uint8Array) return hex(value)
  if (Array.isArray(value)) return value.map((v) => toWire(v))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toWire(v, k)]))
  }
  return value
}

type Health = { ok: boolean; fee: string; accounts: { stellar: string | null; sepolia: string | null } }

let health: Promise<Health | null> | null = null

/** The relayer's status and public accounts, or null if it does not answer. */
export function relayerHealth(refresh = false): Promise<Health | null> {
  if (!health || refresh) {
    health = fetch(`${RELAYER_URL}/health`)
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : null))
      .catch(() => null)
  }
  return health
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms))

/** Sends one call through the relayer and waits until it lands. */
export async function relay(network: NetworkId, fn: string, args: Record<string, unknown>): Promise<{ hash: string }> {
  const chain = network === 'stellar' ? 'stellar' : 'sepolia'
  let response: Response
  try {
    response = await fetch(`${RELAYER_URL}/relay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chain, pool: poolAddress(network), fn, args: toWire(args) }),
    })
  } catch {
    throw new RelayerUnavailable('The relayer did not respond.')
  }
  const body = (await response.json().catch(() => ({}))) as { hash?: string; error?: string }
  if (response.status >= 500 || response.status === 429) {
    throw new RelayerUnavailable(body.error ?? `The relayer answered ${response.status}.`)
  }
  if (!response.ok || !body.hash) throw new Error(`The relayer refused the transaction: ${body.error ?? response.status}`)
  for (let i = 0; i < 90; i++) {
    const s = (await fetch(`${RELAYER_URL}/status/${body.hash}`).then((r) => r.json()).catch(() => null)) as { status?: string } | null
    if (s?.status === 'success') return { hash: body.hash }
    if (s?.status === 'failed') throw new Error(`The relayed transaction failed: ${body.hash}`)
    await sleep(2000)
  }
  throw new RelayerUnavailable(`The relayed transaction ${body.hash} is not confirmed yet.`)
}
