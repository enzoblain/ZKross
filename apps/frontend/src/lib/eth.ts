// The Sepolia pool from the browser: reads over public RPC, writes through
// MetaMask (window.ethereum). The ABI is exported from contracts/ethereum by
// scripts/build/export-abi.sh.
import {
  type Address,
  type Hash,
  type TransactionReceipt,
  createPublicClient,
  createWalletClient,
  custom,
  erc20Abi,
  getAbiItem,
  http,
  parseEventLogs,
} from 'viem'
import { sepolia } from 'viem/chains'

import { shieldedPoolAbi } from './abi/shielded-pool'
import { sepoliaConfig } from './config'
import type { Hex } from './zk/types'

export const publicClient = createPublicClient({ chain: sepolia, transport: http(sepoliaConfig.rpcUrl) })

function pool(): Address {
  if (!sepoliaConfig.pool) throw new Error('The Sepolia pool is not deployed yet (deployments.json has no sepolia.zkross).')
  return sepoliaConfig.pool
}

function wallet(account: Address) {
  if (!window.ethereum) throw new Error('MetaMask is unavailable in this browser.')
  return createWalletClient({ account, chain: sepolia, transport: custom(window.ethereum) })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = readonly any[]

export const readPool = <T>(functionName: string, args: Args = []) =>
  publicClient.readContract({ address: pool(), abi: shieldedPoolAbi, functionName, args } as never) as Promise<T>

export async function sendPool(account: Address, functionName: string, args: Args) {
  const hash: Hash = await wallet(account).writeContract({
    address: pool(),
    abi: shieldedPoolAbi,
    functionName,
    args,
  } as never)
  return { hash, receipt: await confirm(hash) }
}

async function confirm(hash: Hash): Promise<TransactionReceipt> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`Transaction reverted: ${hash}`)
  return receipt
}

export const usdcBalance = (owner: Address) =>
  publicClient.readContract({
    address: sepoliaConfig.usdc.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [owner],
  })

/** Approves the pool for `amount` if the current allowance is lower. */
export async function ensureAllowance(owner: Address, amount: bigint) {
  const allowance = await publicClient.readContract({
    address: sepoliaConfig.usdc.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, pool()],
  })
  if (allowance >= amount) return null
  const hash = await wallet(owner).writeContract({
    address: sepoliaConfig.usdc.address,
    abi: erc20Abi,
    functionName: 'approve',
    args: [pool(), amount],
  })
  await confirm(hash)
  return hash
}

const LOG_CHUNK = 50_000n

// The public RPC spreads requests over nodes a block or two apart, so a range
// ending at the head one node reported can be "beyond current head block" on
// the next. Such a range is retried while that node catches up (a block is
// ~12 s), then shortened by two blocks.
const behindHead = (error: unknown) =>
  /beyond current head|after last accepted block|header not found|unknown block/i.test(error instanceof Error ? error.message : String(error))

export async function getLogsCaughtUp(args: { event?: unknown; fromBlock: bigint; toBlock: bigint }, pause = 2000) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await publicClient.getLogs({ address: pool(), ...args } as never)
    } catch (error) {
      if (!behindHead(error) || attempt === 5) throw error
      if (attempt === 4) {
        if (args.toBlock - 2n < args.fromBlock) return []
        args = { ...args, toBlock: args.toBlock - 2n }
      }
      await new Promise((resolve) => setTimeout(resolve, pause * (attempt + 1)))
    }
  }
}

/** The pool's logs (one event, or all) from the deploy block on, in chunks. */
async function chunkedLogs(event?: unknown) {
  const latest = await publicClient.getBlockNumber()
  const logs = []
  for (let from = sepoliaConfig.deployBlock; from <= latest; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest
    logs.push(...(await getLogsCaughtUp({ event, fromBlock: from, toBlock: to })))
  }
  return logs
}

/** The pool's logs for one event from the deploy block on. */
async function poolLogs(eventName: 'NewCommitment' | 'BridgeOut' | 'LiquidityAdded') {
  const logs = await chunkedLogs(getAbiItem({ abi: shieldedPoolAbi, name: eventName }))
  return parseEventLogs({ abi: shieldedPoolAbi, logs, eventName })
}

const hex32 = (value: bigint): Hex => `0x${value.toString(16).padStart(64, '0')}`

/** Note-tree leaves in index order. */
export async function noteLeaves(): Promise<Hex[]> {
  const leaves: Hex[] = []
  for (const log of await poolLogs('NewCommitment')) {
    const { index, commitment } = log.args as { index: bigint | number; commitment: bigint }
    leaves[Number(index)] = hex32(commitment)
  }
  return leaves
}

/** Notes with their encrypted outputs (SPEC.md B10), for recovery. */
export async function publishedNotes() {
  return (await poolLogs('NewCommitment')).map((log) => {
    const { index, commitment, encryptedOutput } = log.args as { index: number; commitment: bigint; encryptedOutput: Hex }
    return { index: Number(index), commitment: hex32(commitment), data: encryptedOutput }
  })
}

/** Bridge outs with their encrypted payloads (SPEC.md B10), for recovery. */
export async function publishedBridgeOuts() {
  return (await poolLogs('BridgeOut')).map((log) => {
    const a = log.args as { bridgeMessage: bigint; deadlineBucket: bigint; refundCommitment: bigint; encryptedRefund: Hex; encryptedBridgeMessage: Hex }
    return { message: hex32(a.bridgeMessage), deadline: BigInt(a.deadlineBucket), refundCommitment: hex32(a.refundCommitment), refund: a.encryptedRefund, data: a.encryptedBridgeMessage }
  })
}

/** Outbox leaves (pairs (C, 0), SPEC.md B6) in index order. */
export async function outboxLeaves(): Promise<Hex[]> {
  const leaves: Hex[] = []
  for (const log of await poolLogs('BridgeOut')) {
    const { outboxIndex, bridgeMessage } = log.args as { outboxIndex: number; bridgeMessage: bigint }
    leaves[outboxIndex] = hex32(bridgeMessage)
    leaves[outboxIndex + 1] = hex32(0n)
  }
  return leaves
}

/** Total USDC the admin added as liquidity (SPEC.md B14). */
export async function liquidityAdded(): Promise<bigint> {
  let total = 0n
  for (const log of await poolLogs('LiquidityAdded')) total += (log.args as { amount: bigint }).amount
  return total
}

export const poolUsdcBalance = () => usdcBalance(pool())

export type PoolLog = {
  eventName: string
  args: Record<string, unknown>
  transactionHash: Hash
  blockNumber: bigint
  logIndex: number
}

/** Every pool event from the deploy block on, in chain order. */
export async function allPoolLogs(): Promise<PoolLog[]> {
  return parseEventLogs({ abi: shieldedPoolAbi, logs: await chunkedLogs() }) as unknown as PoolLog[]
}

export type TxDetails = { sender: string; time: number; usdc: { from: string; to: string; amount: bigint }[] }

const blockTimes = new Map<bigint, Promise<number>>()

/** A transaction's sender, block time (ms) and USDC transfers, from its receipt. */
export async function txDetails(hash: Hash): Promise<TxDetails> {
  const [tx, receipt] = await Promise.all([
    publicClient.getTransaction({ hash }),
    publicClient.getTransactionReceipt({ hash }),
  ])
  let time = blockTimes.get(receipt.blockNumber)
  if (!time) {
    time = publicClient.getBlock({ blockNumber: receipt.blockNumber }).then((b) => Number(b.timestamp) * 1000)
    blockTimes.set(receipt.blockNumber, time)
  }
  const usdc = parseEventLogs({
    abi: erc20Abi,
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === sepoliaConfig.usdc.address.toLowerCase()),
    eventName: 'Transfer',
  }).map((l) => ({ from: l.args.from, to: l.args.to, amount: l.args.value }))
  return { sender: tx.from, time: await time, usdc }
}
