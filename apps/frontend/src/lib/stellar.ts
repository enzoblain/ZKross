// The Stellar pool from the browser. Pool calls go through the SDK's contract
// client, which reads the deployed contract's own spec to encode arguments
// and simulates every call before Freighter signs it. Events come from
// Stellar RPC; USDC balances and trustlines from Horizon.
import { signTransaction } from '@stellar/freighter-api'
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Horizon,
  Operation,
  TransactionBuilder,
  contract,
  rpc,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk'

import { stellarConfig } from './config'
import type { Hex } from './zk/types'

const server = new rpc.Server(stellarConfig.rpcUrl)
const horizon = new Horizon.Server(stellarConfig.horizonUrl)
const usdcAsset = new Asset(stellarConfig.usdc.code, stellarConfig.usdc.issuer)

async function freighterSign(transactionXdr: string, opts?: { networkPassphrase?: string; address?: string }) {
  const signed = await signTransaction(transactionXdr, {
    networkPassphrase: opts?.networkPassphrase ?? stellarConfig.passphrase,
    address: opts?.address,
  })
  if (signed.error) throw new Error(signed.error.message ?? 'Freighter did not sign the transaction.')
  return signed
}

type Method = (args?: object) => Promise<contract.AssembledTransaction<unknown>>
type DynamicClient = contract.Client & Record<string, Method>

const clients = new Map<string, Promise<DynamicClient>>()

/** A pool client; `publicKey` is the Freighter account that signs, if any. */
function poolClient(publicKey?: string) {
  const key = publicKey ?? ''
  let client = clients.get(key)
  if (!client) {
    client = contract.Client.from({
      contractId: stellarConfig.pool,
      networkPassphrase: stellarConfig.passphrase,
      rpcUrl: stellarConfig.rpcUrl,
      publicKey,
      signTransaction: publicKey ? freighterSign : undefined,
    }) as Promise<DynamicClient>
    clients.set(key, client)
  }
  return client
}

/** Contract `Result`s come back wrapped; plain values pass through. */
function unwrap<T>(value: unknown): T {
  const wrapped = value as { unwrap?: () => T } | undefined
  return typeof wrapped?.unwrap === 'function' ? wrapped.unwrap() : (value as T)
}

/** A simulated (read-only) pool call. */
export async function viewPool<T>(method: string, args?: object): Promise<T> {
  const client = await poolClient()
  const tx = await client[method](args)
  return unwrap<T>(tx.result)
}

/** Simulates, has Freighter sign, sends and waits for a pool call. */
export async function sendPool(publicKey: string, method: string, args: object) {
  const client = await poolClient(publicKey)
  const tx = await client[method](args)
  const sent = await tx.signAndSend()
  const hash = sent.sendTransactionResponse?.hash
  if (!hash) throw new Error(`${method} was not sent`)
  const status = sent.getTransactionResponse?.status
  if (status !== rpc.Api.GetTransactionStatus.SUCCESS) throw new Error(`${method} failed (${status}): ${hash}`)
  return { hash, result: unwrap<unknown>(sent.result) }
}

export const bytesHex = (bytes: Uint8Array): Hex =>
  `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`

export const hex32 = (value: bigint | number | string): Hex =>
  `0x${BigInt(value).toString(16).padStart(64, '0')}`

export type PoolEvent = {
  name: string
  topics: unknown[]
  data: Record<string, unknown>
  ledger: number
  txHash: string
  /** Ledger close time (ms since 1970). */
  time: number
}

/** Pool events from the deploy ledger on (Stellar RPC keeps about 7 days). */
export async function poolEvents(): Promise<PoolEvent[]> {
  const all: PoolEvent[] = []
  const filters: rpc.Api.EventFilter[] = [{ type: 'contract', contractIds: [stellarConfig.pool] }]
  let cursor: string | undefined
  for (;;) {
    const response = await server.getEvents(
      cursor ? { cursor, filters, limit: 200 } : { startLedger: stellarConfig.deployLedger, filters, limit: 200 },
    )
    for (const event of response.events) {
      const topics = event.topic.map((t: xdr.ScVal) => scValToNative(t))
      all.push({
        name: String(topics[0]),
        topics,
        data: scValToNative(event.value),
        ledger: event.ledger,
        txHash: event.txHash,
        time: Date.parse(event.ledgerClosedAt),
      })
    }
    if (response.events.length < 200) break
    cursor = response.cursor
  }
  return all
}

/** Note-tree leaves in index order, from NewCommitmentEvent. */
export function noteLeaves(events: PoolEvent[]): Hex[] {
  const leaves: Hex[] = []
  for (const e of events) {
    if (e.name === 'new_commitment_event') leaves[Number(e.data.index)] = hex32(e.topics[1] as bigint)
  }
  return leaves
}

/** Outbox leaves (pairs (C, 0), SPEC.md B6), from BridgeOutEvent. */
export function outboxLeaves(events: PoolEvent[]): Hex[] {
  const leaves: Hex[] = []
  for (const e of events) {
    if (e.name === 'bridge_out_event') {
      const i = Number(e.data.outbox_index)
      leaves[i] = hex32(e.topics[1] as bigint)
      leaves[i + 1] = hex32(0)
    }
  }
  return leaves
}

/** Total USDC (stroops) the admin added as liquidity (SPEC.md B14). */
export const liquidityAdded = (events: PoolEvent[]) =>
  events
    .filter((e) => e.name === 'liquidity_added_event')
    .reduce((sum, e) => sum + BigInt(e.data.amount as bigint), 0n)

/** USDC balance in stroops, or null if the account has no USDC trustline. */
export async function usdcBalance(account: string): Promise<bigint | null> {
  let details
  try {
    details = await horizon.loadAccount(account)
  } catch {
    return null
  }
  const line = details.balances.find(
    (b) => 'asset_code' in b && b.asset_code === stellarConfig.usdc.code && b.asset_issuer === stellarConfig.usdc.issuer,
  )
  return line ? stellarUnits(line.balance) : null
}

/** Horizon's 7-decimal balance string as stroops. */
const stellarUnits = (balance: string) => {
  const [whole, fraction = ''] = balance.split('.')
  return BigInt(whole + fraction.padEnd(7, '0').slice(0, 7))
}

/** The pool contract's USDC balance (deposits plus liquidity), from the SAC. */
export async function poolUsdcBalance(): Promise<bigint> {
  // The SAC is a built-in contract with no Wasm spec, so the call is built by hand.
  const source = new Account(NULL_ACCOUNT, '0')
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: stellarConfig.passphrase })
    .addOperation(new Contract(stellarConfig.usdc.sac).call('balance', new Address(stellarConfig.pool).toScVal()))
    .setTimeout(30)
    .build()
  const simulation = await server.simulateTransaction(tx)
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) {
    throw new Error('Could not read the pool USDC balance.')
  }
  return BigInt(scValToNative(simulation.result.retval))
}

/** Stellar's all-zero account, a valid source for simulations. */
const NULL_ACCOUNT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

/** Adds the USDC trustline to a Freighter account (a classic transaction). */
export async function addUsdcTrustline(account: string) {
  const source = await horizon.loadAccount(account)
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: stellarConfig.passphrase })
    .addOperation(Operation.changeTrust({ asset: usdcAsset }))
    .setTimeout(180)
    .build()
  const signed = await freighterSign(tx.toXDR(), { address: account })
  const result = await horizon.submitTransaction(TransactionBuilder.fromXDR(signed.signedTxXdr, stellarConfig.passphrase))
  return result.hash
}

export const poolId = () => stellarConfig.pool

export type TxDetails = { sender: string; usdc: { from: string; to: string; amount: bigint }[] }

/** A transaction's source account and its USDC movements (stroops), from Horizon. */
export async function txDetails(hash: string): Promise<TxDetails> {
  const response = await fetch(`${stellarConfig.horizonUrl}/transactions/${hash}/operations`)
  if (!response.ok) throw new Error(`Horizon has no transaction ${hash}`)
  const records = ((await response.json())._embedded?.records ?? []) as {
    source_account: string
    asset_balance_changes?: { asset_code?: string; asset_issuer?: string; from: string; to: string; amount: string }[]
  }[]
  const usdc = records.flatMap((op) =>
    (op.asset_balance_changes ?? [])
      .filter((c) => c.asset_code === stellarConfig.usdc.code && c.asset_issuer === stellarConfig.usdc.issuer)
      .map((c) => ({ from: c.from, to: c.to, amount: stellarUnits(c.amount) })),
  )
  return { sender: records[0]?.source_account ?? '', usdc }
}
