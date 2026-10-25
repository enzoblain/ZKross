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

/** The pool's logs for one event from the deploy block on, in chunks. */
async function poolLogs(eventName: 'NewCommitment' | 'BridgeOut' | 'LiquidityAdded') {
  const event = getAbiItem({ abi: shieldedPoolAbi, name: eventName })
  const latest = await publicClient.getBlockNumber()
  const logs = []
  for (let from = sepoliaConfig.deployBlock; from <= latest; from += LOG_CHUNK) {
    const to = from + LOG_CHUNK - 1n < latest ? from + LOG_CHUNK - 1n : latest
    logs.push(...(await publicClient.getLogs({ address: pool(), event, fromBlock: from, toBlock: to } as never)))
  }
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
